// Step 1/4 — pick a topic and create a job row.
//
// Topic source priority:
//   1. body.calendar_slot_id  → claim that specific slot
//   2. body.from_calendar:true → claim the oldest due scheduled slot
//   3. body.topic_key + body.angle → ad-hoc topic
//   4. fallback: pickNextTopic() (legacy random walk) — never for a
//      named project, which would publish off-brand content
//
// "Claim" = flip the slot to status='generating' and link job_id.

import { json, newId, nowSec, audit } from '../../../_lib/util.js';
import { requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';
import { pickNextTopic } from '../../../_lib/topics.js';
import { getProject } from '../../../_lib/projects.js';
import { pickNextProjectTopic } from '../../../_lib/project_topics.js';
import { planSingleForToday } from '../../../_lib/calendar_planner.js';
import { checkDuplicate, pickNonDuplicate } from '../../../_lib/dedup.js';

function todayUtc() { return new Date().toISOString().slice(0, 10); }

async function loadSlot(env, id) {
  return env.DB.prepare(
    `SELECT * FROM content_calendar WHERE id = ? LIMIT 1`
  ).bind(id).first().catch(() => null);
}

async function nextDueSlot(env, projectId) {
  return projectId
    ? env.DB.prepare(
        `SELECT * FROM content_calendar
          WHERE status = 'scheduled' AND scheduled_for <= ?
            AND (project_id = ? OR project_id IS NULL)
          ORDER BY scheduled_for ASC, created_at ASC LIMIT 1`
      ).bind(todayUtc(), projectId).first().catch(() => null)
    : env.DB.prepare(
        `SELECT * FROM content_calendar
          WHERE status = 'scheduled' AND scheduled_for <= ?
          ORDER BY scheduled_for ASC, created_at ASC LIMIT 1`
      ).bind(todayUtc()).first().catch(() => null);
}

export const onRequestPost = async ({ request, env }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });

  // The tenant context is authoritative. The admin UI puts project_id on
  // the QUERY STRING (it is appended centrally by the api() helper) while
  // cron puts it in the BODY, and a project_admin is locked to their own
  // project no matter which of the two arrives.
  const tenant = await resolveTenantContext(env, request, auth);
  let body = {};
  try { body = await request.json(); } catch { /* empty body ok */ }

  let projectId = tenant?.activeProjectId || String(body.project_id || '').trim() || null;

  // Free Tier Quota Check: 100 posts limit per project
  if (projectId) {
    const userRow = auth.userId ? await env.DB.prepare('SELECT plan_tier, post_limit, role FROM users WHERE id = ?').bind(auth.userId).first().catch(() => null) : null;
    const isFree = (userRow?.plan_tier || auth.plan_tier) === 'free' && auth.role !== 'super_admin';
    if (isFree) {
      const limit = userRow?.post_limit || 100;
      const countRow = await env.DB.prepare('SELECT COUNT(*) AS total FROM blog_posts WHERE project_id = ?').bind(projectId).first().catch(() => ({ total: 0 }));
      const currentTotal = countRow?.total || 0;
      if (currentTotal >= limit) {
        return json(403, {
          error: 'post_quota_exceeded',
          detail: `Tài khoản gói Free đã đạt giới hạn ${limit} bài viết SEO miễn phí (${currentTotal}/${limit}). Vui lòng liên hệ để nâng cấp.`
        });
      }
    }
  }
  let topic = null;
  let slot  = null;

  if (body.calendar_slot_id) {
    slot = await loadSlot(env, String(body.calendar_slot_id));
    if (!slot) return json(404, { error: 'slot_not_found' });
    if (slot.status !== 'scheduled' && slot.status !== 'draft') {
      return json(409, { error: 'slot_not_runnable', detail: 'status=' + slot.status });
    }
  } else if (body.from_calendar) {
    slot = await nextDueSlot(env, projectId);
    // Empty calendar? Plan one fresh idea for today on the fly. Keeps
    // the daily cron self-healing — even if the operator forgets to
    // re-plan, the next run still produces something on-brand.
    if (!slot) {
      slot = await planSingleForToday(env, { source: 'cron-jit', projectId }).catch(() => null);
    }
    // Still nothing? Fall through to legacy topic picker.
  } else if (body.topic_key && body.angle) {
    topic = { key: String(body.topic_key), angle: String(body.angle) };
  }

  if (slot?.project_id) {
    if (projectId && slot.project_id !== projectId) {
      return json(409, { error: 'slot_other_project' });
    }
    projectId = slot.project_id;
  }

  if (slot) {
    topic = {
      key:   slot.primary_keyword || slot.title,
      angle: slot.angle || slot.title,
    };
  }

  // AI duplicate check.
  //
  //  - Cron / legacy path (no slot, no explicit topic): repick up to 5x
  //    from the eligible pool, fall back to the least-similar option if
  //    everything's a duplicate. Always publishes something.
  //  - Calendar-claimed slot or operator-supplied topic_key+angle:
  //    the operator chose this — we WARN by writing the similarity into
  //    the audit log but don't override the choice.
  //
  // Set body.skip_dedup:true to bypass entirely (useful for tests).
  let dupInfo = null;
  if (!body.skip_dedup && !topic && !slot) {
    // A named project must draw from its own topic pool. The legacy
    // TOPICS list is the single-tenant bootstrap pool and is off-brand
    // for every tenant, so only an install without a project uses it.
    const project = projectId ? await getProject(env, projectId) : null;
    const pickTopic = project
      ? () => pickNextProjectTopic(env, project)
      : () => pickNextTopic(env);
    const pick = await pickNonDuplicate(env, pickTopic, { maxTries: 5, projectId });
    if (pick.topic) {
      topic = pick.topic;
      dupInfo = { similarity: pick.dup?.similarity, fallback: pick.fallback, tries: pick.tries, against: pick.dup?.against };
    }
  } else if (!body.skip_dedup && topic) {
    const dup = await checkDuplicate(env, { title: topic.key, angle: topic.angle, projectId });
    dupInfo = { similarity: dup.similarity, duplicate: dup.duplicate, against: dup.against };
    // Warn-only for operator-chosen topics.
    if (dup.duplicate) {
      await audit(env, 'cron', 'dedup.warn', topic.key, JSON.stringify({
        similarity: dup.similarity, against: dup.against?.slug,
      })).catch(() => {});
    }
  }

  if (!topic) {
    // The legacy topic pool is Gulagi-only; never use it for a named
    // project or the post lands in the wrong tenant, off-brand.
    if (projectId) return json(503, { error: 'no_project_topic', detail: 'no due calendar slot and no brand DNA for this project' });
    topic = await pickNextTopic(env);
  }
  if (!topic) return json(500, { error: 'no_topic_available' });

  const id = newId();
  const t  = nowSec();
  await env.DB.prepare(
    `INSERT INTO blog_jobs (id, status, topic_key, topic_angle, project_id, created_at, updated_at)
     VALUES (?, 'created', ?, ?, ?, ?, ?)`
  ).bind(id, topic.key, topic.angle, projectId, t, t).run();

  if (slot) {
    await env.DB.prepare(
      `UPDATE content_calendar SET status='generating', job_id=?, updated_at=? WHERE id=?`
    ).bind(id, t, slot.id).run();
    await audit(env, 'cron', 'calendar.claim', slot.id, JSON.stringify({ job_id: id }));
  }

  // Log dedup outcome to audit so the admin UI shows what happened.
  if (dupInfo) {
    await audit(env, 'cron', 'dedup.check', topic.key, JSON.stringify(dupInfo)).catch(() => {});
  }

  return json(200, {
    ok: true, job_id: id, status: 'created', topic: topic.key, slot_id: slot?.id || null,
    dedup: dupInfo,
  });
};

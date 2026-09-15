// Durable queue for publishing a blog post to external networks.
//
// Why a queue instead of a direct call: the blog write and the social
// post are not one transaction. The old code fired the dispatch inside
// waitUntil(), so a dropped edge connection, a Facebook 5xx, or a rate
// limit lost the post with nothing but an audit line. Here the publish
// only enqueues (cheap, always succeeds), and the cron drains with retry,
// backoff and idempotency.
//
// Guarantees:
//   - At most one row per (blog_post_id, channel) — a retried publish
//     cannot double-post.
//   - A row is claimed with a conditional UPDATE, so two concurrent cron
//     ticks can't both send the same post.
//   - Credential failures stop retrying and raise needs_reconnect; the
//     operator fixes the token instead of watching it fail 5 times.

import { newId, nowSec } from '../util.js';
import { getProject } from '../projects.js';
import { dispatchPublication } from './publisher.js';

const BASE_DELAY_SEC = 60;
const MAX_DELAY_SEC = 3600;

// 1m, 2m, 4m, 8m… capped at an hour.
export function backoffSec(attempts) {
  return Math.min(BASE_DELAY_SEC * 2 ** Math.max(0, attempts - 1), MAX_DELAY_SEC);
}

// Graph API codes that mean "a human must act", not "try again".
// 190 = invalid/expired token, 200/10 = missing permission.
export function isCredentialError(err) {
  const code = err?.graph?.code;
  if (code === 190 || code === 200 || code === 10) return true;
  const msg = String(err?.message || '');
  return /token|quyền|permission/i.test(msg) && /hết hạn|không hợp lệ|chưa có quyền|not set|missing/i.test(msg);
}

export async function enqueueSocialPost(env, { projectId, blogPostId, channel = 'facebook' }) {
  if (!env?.DB || !blogPostId) return { enqueued: false };
  const t = nowSec();
  const r = await env.DB.prepare(
    `INSERT OR IGNORE INTO social_posts
       (id, project_id, blog_post_id, channel, status, attempts, max_attempts, next_attempt_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, 5, ?, ?, ?)`
  ).bind(newId(), projectId || null, blogPostId, channel, t, t, t).run().catch(() => null);
  return { enqueued: !!(r?.meta?.changes) };
}

async function claimJob(env, id) {
  const t = nowSec();
  const r = await env.DB.prepare(
    `UPDATE social_posts
        SET status = 'publishing', attempts = attempts + 1, updated_at = ?
      WHERE id = ? AND status IN ('pending', 'failed')`
  ).bind(t, id).run().catch(() => null);
  return !!(r?.meta?.changes);
}

async function loadJobContext(env, id) {
  const row = await env.DB.prepare(
    `SELECT s.id, s.project_id, s.channel, s.attempts, s.max_attempts,
            b.id AS post_id, b.slug, b.title, b.meta_description,
            b.body_markdown, b.hero_image_key, b.keywords, b.published_at
       FROM social_posts s
       JOIN blog_posts b ON b.id = s.blog_post_id
      WHERE s.id = ? LIMIT 1`
  ).bind(id).first().catch(() => null);
  return row;
}

async function finishJob(env, id, fields) {
  const sets = [];
  const binds = [];
  for (const [k, v] of Object.entries(fields)) { sets.push(`${k} = ?`); binds.push(v); }
  sets.push('updated_at = ?'); binds.push(nowSec());
  binds.push(id);
  await env.DB.prepare(`UPDATE social_posts SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run().catch(() => {});
}

// Dispatch one job. Exported so the admin "Đăng lại" button can run a
// single job immediately instead of waiting for the next cron.
//
// `dispatch` is injectable so tests can exercise every branch (credential
// failure, transient failure, attempt exhaustion) deterministically without
// reaching Facebook.
export async function runSocialJob(env, id, { dispatch = dispatchPublication } = {}) {
  if (!(await claimJob(env, id))) return { ok: false, error: 'not_claimable' };

  const job = await loadJobContext(env, id);
  if (!job) {
    await finishJob(env, id, { status: 'failed', error: 'blog_post_missing' });
    return { ok: false, error: 'blog_post_missing' };
  }

  const project = await getProject(env, job.project_id).catch(() => null);
  if (!project) {
    await finishJob(env, id, { status: 'failed', error: 'project_missing' });
    return { ok: false, error: 'project_missing' };
  }

  try {
    const res = await dispatch({
      project,
      article: {
        id: job.post_id,
        slug: job.slug,
        title: job.title,
        meta_description: job.meta_description,
        body_markdown: job.body_markdown,
        hero_image_key: job.hero_image_key,
        keywords: job.keywords,
        published_at: job.published_at,
      },
      env,
    });

    if (res?.ok === false) throw new Error(res.error || 'dispatch_failed');

    await finishJob(env, id, {
      status: 'published',
      external_id: res?.post_id || res?.postId || null,
      external_url: res?.post_url || res?.link || null,
      error: null,
      needs_reconnect: 0,
      published_at: nowSec(),
    });
    return { ok: true, external_url: res?.post_url || res?.link || null };
  } catch (err) {
    const attempts = job.attempts || 1;
    const maxAttempts = job.max_attempts || 5;
    const credential = isCredentialError(err);

    // A credential failure will never succeed on retry — park it and let
    // the UI ask for a reconnect.
    if (credential) {
      await finishJob(env, id, {
        status: 'failed', error: String(err.message || err).slice(0, 500), needs_reconnect: 1,
      });
      return { ok: false, error: err.message, needs_reconnect: true };
    }

    if (attempts >= maxAttempts) {
      await finishJob(env, id, { status: 'failed', error: String(err.message || err).slice(0, 500) });
      return { ok: false, error: err.message, exhausted: true };
    }

    await finishJob(env, id, {
      status: 'failed',
      error: String(err.message || err).slice(0, 500),
      next_attempt_at: nowSec() + backoffSec(attempts),
    });
    return { ok: false, error: err.message, retry_in_sec: backoffSec(attempts) };
  }
}

// Drain due jobs. Called from the cron tick (per project) and after an
// enqueue so the happy path still feels immediate.
export async function drainSocialQueue(env, { projectId = null, limit = 5, dispatch = dispatchPublication } = {}) {
  if (!env?.DB) return { processed: 0, results: [] };
  const t = nowSec();
  const where = projectId ? 'project_id = ? AND' : '';
  const sql = `SELECT id FROM social_posts
                WHERE ${where} status IN ('pending', 'failed')
                  AND needs_reconnect = 0
                  AND next_attempt_at <= ?
                ORDER BY next_attempt_at ASC LIMIT ?`;
  const stmt = projectId ? env.DB.prepare(sql).bind(projectId, t, limit) : env.DB.prepare(sql).bind(t, limit);
  const { results } = await stmt.all().catch(() => ({ results: [] }));

  const out = [];
  for (const row of results || []) {
    // Sequential on purpose: each job is a network call and Facebook rate
    // limits per Page, so parallelising here buys little and risks 4xx.
    out.push({ id: row.id, ...(await runSocialJob(env, row.id, { dispatch })) });
  }
  return { processed: out.length, results: out };
}

export async function listSocialPosts(env, { projectId = null, status = null, limit = 100 } = {}) {
  if (!env?.DB) return [];
  const clauses = [];
  const binds = [];
  if (projectId) { clauses.push('s.project_id = ?'); binds.push(projectId); }
  if (status) { clauses.push('s.status = ?'); binds.push(status); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  binds.push(Math.min(500, limit));

  const { results } = await env.DB.prepare(
    `SELECT s.id, s.project_id, s.blog_post_id, s.channel, s.status, s.attempts, s.max_attempts,
            s.next_attempt_at, s.external_id, s.external_url, s.error,
            s.needs_reconnect, s.created_at, s.updated_at, s.published_at,
            b.slug AS post_slug, b.title AS post_title, b.hero_image_key
       FROM social_posts s
       LEFT JOIN blog_posts b ON b.id = s.blog_post_id
       ${where}
      ORDER BY s.created_at DESC LIMIT ?`
  ).bind(...binds).all().catch(() => ({ results: [] }));
  return results || [];
}

export async function retrySocialPost(env, { projectId = null, id }) {
  const t = nowSec();
  const owned = projectId
    ? await env.DB.prepare('SELECT id FROM social_posts WHERE id = ? AND project_id = ? LIMIT 1').bind(id, projectId).first().catch(() => null)
    : await env.DB.prepare('SELECT id FROM social_posts WHERE id = ? LIMIT 1').bind(id).first().catch(() => null);
  if (!owned) return { ok: false, error: 'not_found' };

  // Reset the counter so a manual retry gets the full attempt budget, and
  // clear the reconnect flag only if the operator reconnected first —
  // they can retry anyway and the next failure will re-raise it.
  await env.DB.prepare(
    `UPDATE social_posts SET status = 'pending', attempts = 0, next_attempt_at = ?,
       error = NULL, needs_reconnect = 0, updated_at = ? WHERE id = ?`
  ).bind(t, t, id).run().catch(() => {});
  return runSocialJob(env, id);
}

export async function cancelSocialPost(env, { projectId = null, id }) {
  const t = nowSec();
  const r = projectId
    ? await env.DB.prepare(
        `UPDATE social_posts SET status = 'skipped', updated_at = ?
          WHERE id = ? AND project_id = ? AND status IN ('pending','failed')`
      ).bind(t, id, projectId).run().catch(() => null)
    : await env.DB.prepare(
        `UPDATE social_posts SET status = 'skipped', updated_at = ?
          WHERE id = ? AND status IN ('pending','failed')`
      ).bind(t, id).run().catch(() => null);
  return { ok: !!(r?.meta?.changes) };
}

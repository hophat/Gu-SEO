// POST /api/admin/cron/tick — server-side fan-out for the cron Worker.
//
// Pages Functions kill background work when the response closes, so the
// Worker makes one short call per schedule and this endpoint runs the
// multi-step chain per active project, well inside the subrequest budget.
//
// The Worker calls this endpoint once per project (body.project_id): an
// HTTP response can only stay open ~100-120s before the edge drops the
// connection, and a sequential all-projects loop outgrows that after more
// than a couple of projects. The unfiltered loop remains for manual runs
// and small installs, guarded by a soft budget so it reports `partial`
// instead of dying silently mid-list.
//
// body: { task: 'blog' | 'prog' | 'refresh', limit?: number, dry_run?: boolean,
//         project_id?: string }
import { json, nowSec } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { listProjects } from '../../../_lib/projects.js';
import { drainSocialQueue } from '../../../_lib/publishing/social_queue.js';

// Stop STARTING new project chains / step iterations once the call has
// been alive this long — leaves headroom for the in-flight unit to finish
// before the edge closes the connection (~100-120s observed).
const CHAIN_START_BUDGET_MS = 60_000;
const STEP_BUDGET_MS = 85_000;

export const onRequestPost = async ({ request, env }) => {
  const gate = await adminGate(env, request); if (gate) return gate;

  let body = {};
  try { body = await request.json(); } catch { /* empty body = blog */ }
  const task = String(body?.task || 'blog').trim();
  const limit = Math.max(0, parseInt(body?.limit, 10) || 0);
  const dryRun = body?.dry_run === true;
  const onlyProject = String(body?.project_id || '').trim();

  let projects = await listProjects(env, { status: 'active' });
  if (onlyProject) {
    projects = projects.filter((p) => p.id === onlyProject || p.slug === onlyProject);
    if (!projects.length) {
      return json(404, { error: 'project_not_found', project_id: onlyProject });
    }
  }

  // dry_run reports the fan-out plan without generating anything — used to
  // verify routing/permissions without spending AI budget or publishing.
  if (dryRun) {
    return json(200, {
      ok: true, task, dry_run: true, timestamp: nowSec(),
      projects: projects.map((p) => ({ id: p.id, slug: p.slug, approval_mode: p.approval_mode })),
    });
  }

  const origin = new URL(request.url).origin;
  const adminToken = request.headers.get('Authorization') || '';
  const headers = { 'Content-Type': 'application/json', 'Authorization': adminToken, 'X-Source-Cron': '1' };

  const call = async (path, payload, extra = {}) => {
    const r = await fetch(`${origin}${path}`, {
      method: 'POST', headers: { ...headers, ...extra },
      body: payload === null ? undefined : JSON.stringify(payload),
    });
    const parsed = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, body: parsed };
  };

  const startedAt = Date.now();
  const overStepBudget = () => Date.now() - startedAt > STEP_BUDGET_MS;

  // Cleanup: mark jobs stuck at intermediate states from previous days as
  // failed. These are orphans from cron runs that were interrupted mid-chain
  // (edge connection dropped, budget hit, etc.). Without this they sit in
  // the admin UI's "Bản nháp & thất bại" table forever, looking like active
  // work. Only touches jobs older than today — today's stuck jobs are
  // resumed by blogChain() above.
  if (task === 'blog' && env?.DB?.prepare) {
    const today = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      `UPDATE blog_jobs SET status='failed', error='cron_interrupted: job was stuck at ' || status || ' from a previous day',
        updated_at=? WHERE status IN ('created', 'text_done', 'image_done')
        AND date(created_at, 'unixepoch') < ?`
    ).bind(nowSec(), today).run().catch(() => {});
  }

  const results = [];
  let partial = false;
  for (const proj of projects) {
    // Always run at least the first project; after that, don't start a new
    // chain once the response is too old to safely finish it.
    if (results.length && Date.now() - startedAt > CHAIN_START_BUDGET_MS) {
      partial = true;
      break;
    }
    try {
      if (task === 'social') {
        // Standalone drain, run every 15 minutes by the master cron. Cheap:
        // it only touches jobs whose next_attempt_at has passed, and costs
        // nothing when the queue is empty.
        const social = await drainSocialQueue(env, { projectId: proj.id, limit: 10 });
        results.push({
          project_id: proj.id, slug: proj.slug, status: 'drained',
          processed: social.processed,
          published: social.results.filter((r) => r.ok).length,
        });
      }
      else if (task === 'blog') {
        // Drain the social queue first: retries must still happen on days
        // when the blog chain is skipped (already ran today), otherwise a
        // failed Facebook post would never be re-attempted.
        const social = await drainSocialQueue(env, { projectId: proj.id, limit: 5 }).catch(() => ({ processed: 0 }));
        const chain = await blogChain(call, env, proj);
        results.push({ ...chain, social_processed: social.processed });
      }
      else if (task === 'prog') results.push(await progStep(call, proj, limit, overStepBudget));
      else if (task === 'refresh') results.push(await refreshStep(call, proj, limit, overStepBudget));
      else return json(400, { error: 'unknown_task', task });
    } catch (err) {
      results.push({ project_id: proj.id, slug: proj.slug, status: 'error', error: err.message });
    }
  }

  return json(200, {
    ok: true, task, timestamp: nowSec(),
    projects_processed: results.length,
    partial: partial || undefined,
    results,
  });
};

// blogChain resumes interrupted chains (text_done → image_done → publish,
// created → text → …). Resumed outcomes carry resumed:true so the fan-out
// summary shows the daily run picked a broken job back up instead of
// silently generating a second one.
async function blogChain(call, env, proj) {
  const today = new Date().toISOString().slice(0, 10);
  const existingRun = await env.DB.prepare(
    `SELECT id, status FROM blog_jobs
      WHERE project_id = ? AND date(created_at, 'unixepoch') = ? AND status IN ('created', 'text_done', 'image_done', 'published')
      LIMIT 1`
  ).bind(proj.id, today).first().catch(() => null);

  if (existingRun) {
    // A job that already published today is done — skip.
    if (existingRun.status === 'published') {
      return { project_id: proj.id, slug: proj.slug, status: 'skipped', reason: 'already_run_today', job_id: existingRun.id };
    }
    // A job stuck at 'text_done' or 'image_done' means the previous cron
    // run was interrupted mid-chain (edge connection dropped, budget
    // hit, etc.). Resume from where it left off instead of skipping —
    // otherwise the project misses its daily post and the job stays
    // stuck forever.
    const jobId = existingRun.id;
    if (existingRun.status === 'text_done') {
      const imgRes = await call('/api/admin/blog/image', { job_id: jobId });
      if (!imgRes.ok) return { project_id: proj.id, slug: proj.slug, status: 'failed', step: 'image_resume', job_id: jobId };
    }
    if (existingRun.status === 'image_done' || existingRun.status === 'text_done') {
      if (proj.approval_mode === 'approval') {
        return { project_id: proj.id, slug: proj.slug, status: 'pending_approval', job_id: jobId, resumed: true };
      }
      const pubRes = await call('/api/admin/blog/publish', { job_id: jobId });
      return { project_id: proj.id, slug: proj.slug, status: 'published', job_id: jobId, post_id: pubRes.body?.blog_post_id, resumed: true };
    }
    // 'created' = text generation never ran. Fall through to a fresh
    // start — the start endpoint will find this job and skip, so we
    // need to resume it directly instead.
    if (existingRun.status === 'created') {
      const textRes = await call('/api/admin/blog/text', { job_id: jobId });
      if (!textRes.ok) return { project_id: proj.id, slug: proj.slug, status: 'failed', step: 'text_resume', job_id: jobId, resumed: true };
      const imgRes = await call('/api/admin/blog/image', { job_id: jobId });
      if (!imgRes.ok) return { project_id: proj.id, slug: proj.slug, status: 'failed', step: 'image_resume', job_id: jobId, resumed: true };
      if (proj.approval_mode === 'approval') {
        return { project_id: proj.id, slug: proj.slug, status: 'pending_approval', job_id: jobId, resumed: true };
      }
      const pubRes = await call('/api/admin/blog/publish', { job_id: jobId });
      return { project_id: proj.id, slug: proj.slug, status: 'published', job_id: jobId, post_id: pubRes.body?.blog_post_id, resumed: true };
    }
  }

  const startRes = await call('/api/admin/blog/start', { project_id: proj.id, from_calendar: true });
  const jobId = startRes.body?.job_id;
  if (!startRes.ok || !jobId) {
    return { project_id: proj.id, slug: proj.slug, status: 'failed', step: 'start', error: startRes.body };
  }

  const textRes = await call('/api/admin/blog/text', { job_id: jobId });
  if (!textRes.ok) return { project_id: proj.id, slug: proj.slug, status: 'failed', step: 'text', job_id: jobId };

  const imgRes = await call('/api/admin/blog/image', { job_id: jobId });
  if (!imgRes.ok) return { project_id: proj.id, slug: proj.slug, status: 'failed', step: 'image', job_id: jobId };

  if (proj.approval_mode === 'approval') {
    return { project_id: proj.id, slug: proj.slug, status: 'pending_approval', job_id: jobId };
  }

  const pubRes = await call('/api/admin/blog/publish', { job_id: jobId });
  return { project_id: proj.id, slug: proj.slug, status: 'published', job_id: jobId, post_id: pubRes.body?.blog_post_id };
}

// Each call drains exactly one pending keyword. Loop up to `limit` times
// per project, stopping early when the queue empties or a call fails.
async function progStep(call, proj, limit, overBudget) {
  const cap = limit > 0 ? limit : 1;
  let generated = 0;
  for (let i = 0; i < cap; i++) {
    if (overBudget?.()) {
      return { project_id: proj.id, slug: proj.slug, status: 'partial', generated };
    }
    const r = await call('/api/admin/prog/generate-next', null, { 'X-Project-Id': proj.id });
    if (!r.ok) return { project_id: proj.id, slug: proj.slug, status: 'failed', step: 'prog', generated, error: r.body };
    if (r.body?.drained) return { project_id: proj.id, slug: proj.slug, status: 'drained', generated };
    generated++;
  }
  return { project_id: proj.id, slug: proj.slug, status: 'generated', generated };
}

async function refreshStep(call, proj, limit, overBudget) {
  const scan = await call('/api/admin/refresh/scan', { project_id: proj.id, limit: limit || 10 });
  const jobs = scan.body?.jobs || [];
  const refreshed = [];
  for (const j of jobs) {
    if (overBudget?.()) break;
    const run = await call('/api/admin/refresh/run', { job_id: j.job_id });
    refreshed.push({ slug: j.slug, status: run.body?.status || (run.ok ? 'ok' : 'failed') });
  }
  return { project_id: proj.id, slug: proj.slug, status: 'refreshed', scanned: jobs.length, refreshed };
}

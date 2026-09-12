// POST /api/admin/cron/tick — server-side fan-out for the cron Worker.
//
// Pages Functions kill background work when the response closes, so the
// Worker makes one short call per schedule and this endpoint runs the
// multi-step chain per active project, well inside the subrequest budget.
//
// body: { task: 'blog' | 'prog' | 'refresh', limit?: number, dry_run?: boolean }
import { json, nowSec } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { listProjects } from '../../../_lib/projects.js';

export const onRequestPost = async ({ request, env }) => {
  const gate = await adminGate(env, request); if (gate) return gate;

  let body = {};
  try { body = await request.json(); } catch { /* empty body = blog */ }
  const task = String(body?.task || 'blog').trim();
  const limit = Math.max(0, parseInt(body?.limit, 10) || 0);
  const dryRun = body?.dry_run === true;

  const projects = await listProjects(env, { status: 'active' });

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

  const results = [];
  for (const proj of projects) {
    try {
      if (task === 'blog') results.push(await blogChain(call, env, proj));
      else if (task === 'prog') results.push(await progStep(call, proj, limit));
      else if (task === 'refresh') results.push(await refreshStep(call, proj, limit));
      else return json(400, { error: 'unknown_task', task });
    } catch (err) {
      results.push({ project_id: proj.id, slug: proj.slug, status: 'error', error: err.message });
    }
  }

  return json(200, { ok: true, task, timestamp: nowSec(), projects_processed: results.length, results });
};

async function blogChain(call, env, proj) {
  const today = new Date().toISOString().slice(0, 10);
  const existingRun = await env.DB.prepare(
    `SELECT id, status FROM blog_jobs
      WHERE project_id = ? AND date(created_at, 'unixepoch') = ? AND status IN ('created', 'text_done', 'image_done', 'published')
      LIMIT 1`
  ).bind(proj.id, today).first().catch(() => null);

  if (existingRun) {
    return { project_id: proj.id, slug: proj.slug, status: 'skipped', reason: 'already_run_today', job_id: existingRun.id };
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
async function progStep(call, proj, limit) {
  const cap = limit > 0 ? limit : 1;
  let generated = 0;
  for (let i = 0; i < cap; i++) {
    const r = await call('/api/admin/prog/generate-next', null, { 'X-Project-Id': proj.id });
    if (!r.ok) return { project_id: proj.id, slug: proj.slug, status: 'failed', step: 'prog', generated, error: r.body };
    if (r.body?.drained) return { project_id: proj.id, slug: proj.slug, status: 'drained', generated };
    generated++;
  }
  return { project_id: proj.id, slug: proj.slug, status: 'generated', generated };
}

async function refreshStep(call, proj, limit) {
  const scan = await call('/api/admin/refresh/scan', { project_id: proj.id, limit: limit || 10 });
  const jobs = scan.body?.jobs || [];
  const refreshed = [];
  for (const j of jobs) {
    const run = await call('/api/admin/refresh/run', { job_id: j.job_id });
    refreshed.push({ slug: j.slug, status: run.body?.status || (run.ok ? 'ok' : 'failed') });
  }
  return { project_id: proj.id, slug: proj.slug, status: 'refreshed', scanned: jobs.length, refreshed };
}

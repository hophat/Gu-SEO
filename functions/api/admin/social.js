// Social distribution jobs.
//
//   GET  /api/admin/social?status=&limit=
//        → the queue with status, attempts, next retry, external link, error.
//
//   POST /api/admin/social  { action: 'retry', id }
//        → resets the attempt budget and dispatches immediately.
//   POST /api/admin/social  { action: 'cancel', id }
//        → marks the job skipped so the cron stops picking it up.
//
// Project-scoped: an operator only ever sees their own project's jobs.
import { json, audit } from '../../_lib/util.js';
import { adminGate, requireAdminAsync, resolveTenantContext } from '../../_lib/auth.js';
import { listSocialPosts, retrySocialPost, cancelSocialPost } from '../../_lib/publishing/social_queue.js';

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || null;
  const limit = Math.min(500, parseInt(url.searchParams.get('limit'), 10) || 100);

  const jobs = await listSocialPosts(env, { projectId: pid, status, limit });

  // Counts drive the UI tabs; one extra pass beats N round trips.
  const all = status ? await listSocialPosts(env, { projectId: pid, limit: 500 }) : jobs;
  const counts = { pending: 0, publishing: 0, published: 0, failed: 0, skipped: 0 };
  for (const j of all) if (counts[j.status] != null) counts[j.status]++;

  return json(200, { ok: true, project_id: pid, jobs, counts });
};

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;

  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }
  const id = String(body?.id || '').trim();
  if (!id) return json(400, { error: 'missing_id' });

  if (body?.action === 'retry') {
    const r = await retrySocialPost(env, { projectId: pid, id });
    audit(env, 'admin', 'social_retry', id, { ok: r.ok, error: r.error || null });
    if (!r.ok && r.error === 'not_found') return json(404, { error: 'not_found' });
    return json(200, { ok: true, result: r });
  }

  if (body?.action === 'cancel') {
    const r = await cancelSocialPost(env, { projectId: pid, id });
    audit(env, 'admin', 'social_cancel', id, { ok: r.ok });
    return json(r.ok ? 200 : 404, { ok: r.ok, error: r.ok ? undefined : 'not_found' });
  }

  return json(400, { error: 'unknown_action' });
};

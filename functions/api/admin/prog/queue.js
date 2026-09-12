// GET — list keywords with scoring + priority info.
//   ?status=pending|processing|done|failed   (default: pending)
//   ?limit=100  ?order=priority|created|score
// PATCH — update priority or status on a single row.
//   { id, priority?, status? }
//   Use this to pin/demote keywords or to retry failed ones.
import { json, nowSec, audit } from '../../../_lib/util.js';
import { requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';

export const onRequestGet = async ({ request, env }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';
  const limit = Math.min(500, parseInt(url.searchParams.get('limit'), 10) || 100);
  const order = url.searchParams.get('order') || 'priority';

  // Pending defaults to priority ordering; done/failed default to most-recent.
  let orderBy;
  switch (order) {
    case 'score':    orderBy = 'score DESC, created_at ASC'; break;
    case 'created':  orderBy = 'created_at DESC'; break;
    case 'priority':
    default:
      orderBy = status === 'pending'
        ? 'priority DESC, created_at ASC'
        : 'updated_at DESC';
  }

  const projectClause = pid ? `project_id = ? AND` : ``;
  const sql = `SELECT id, keyword, canonical, score, priority, intent, status, attempts,
            page_id, error, created_at, updated_at
       FROM prog_keywords WHERE ${projectClause} status=? ORDER BY ${orderBy} LIMIT ?`;
  const stmt = pid
    ? env.DB.prepare(sql).bind(pid, status, limit)
    : env.DB.prepare(sql).bind(status, limit);
  const r = await stmt.all();
  return json(200, { keywords: r.results || [], project_id: pid });
};

export const onRequestPatch = async ({ request, env }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }
  const id = String(body?.id || '').trim();
  if (!id) return json(400, { error: 'missing_id' });

  const owned = pid
    ? await env.DB.prepare(`SELECT id FROM prog_keywords WHERE id = ? AND project_id = ? LIMIT 1`).bind(id, pid).first().catch(() => null)
    : await env.DB.prepare(`SELECT id FROM prog_keywords WHERE id = ? LIMIT 1`).bind(id).first().catch(() => null);
  if (!owned) return json(404, { error: 'not_found' });

  const sets = [];
  const binds = [];
  if (body.priority != null) {
    const p = parseInt(body.priority, 10);
    if (Number.isNaN(p) || p < -1000 || p > 1000) return json(400, { error: 'bad_priority' });
    sets.push('priority=?'); binds.push(p);
  }
  if (body.status != null) {
    const allowed = ['pending', 'processing', 'done', 'failed'];
    if (!allowed.includes(body.status)) return json(400, { error: 'bad_status' });
    sets.push('status=?'); binds.push(body.status);
    if (body.status === 'pending') { sets.push('error=NULL'); }
  }
  if (!sets.length) return json(400, { error: 'no_updates' });
  sets.push('updated_at=?'); binds.push(nowSec());
  binds.push(id);
  if (pid) binds.push(pid);

  const r = await env.DB.prepare(
    `UPDATE prog_keywords SET ${sets.join(', ')} WHERE id=?${pid ? ' AND project_id=?' : ''}`
  ).bind(...binds).run();
  audit(env, 'admin', 'prog_queue_patch', id, body);
  return json(200, { ok: true, changed: r?.meta?.changes || 0 });
};

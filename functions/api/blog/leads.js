import { json, newId, nowSec } from '../../_lib/util.js';
import { requireAdminAsync, resolveTenantContext } from '../../_lib/auth.js';
import { resolveProjectForRequest } from '../../_lib/project_scope.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env?.DB) return json(500, { error: 'no_db' });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const name = String(body?.name || '').trim().slice(0, 120);
  const email = String(body?.email || '').trim().slice(0, 200);
  const phone = String(body?.phone || '').trim().slice(0, 40);
  const source = String(body?.source || 'blog').trim().slice(0, 40);
  const blogSlug = String(body?.blog_slug || '').trim().slice(0, 200);

  if (!email && !phone) return json(400, { error: 'provide email or phone' });

  const project = await resolveProjectForRequest(env, request).catch(() => null);

  await env.DB.prepare(
    `INSERT INTO leads (id, project_id, name, email, phone, source, blog_slug, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(newId(), project?.id || null, name, email, phone, source, blogSlug || null, nowSec()).run();

  return json(200, { ok: true });
};

export const onRequestGet = async ({ request, env }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });
  if (!env?.DB) return json(500, { error: 'no_db' });

  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;
  const sql = pid
    ? `SELECT id, name, email, phone, source, blog_slug, created_at FROM leads WHERE project_id = ? ORDER BY created_at DESC LIMIT 100`
    : `SELECT id, name, email, phone, source, blog_slug, created_at FROM leads ORDER BY created_at DESC LIMIT 100`;
  const stmt = pid ? env.DB.prepare(sql).bind(pid) : env.DB.prepare(sql);
  const { results } = await stmt.all().catch(() => ({ results: [] }));
  return json(200, { ok: true, leads: results || [] });
};

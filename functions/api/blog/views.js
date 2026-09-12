import { json, newId, nowSec } from '../../_lib/util.js';
import { requireAdminAsync, resolveTenantContext } from '../../_lib/auth.js';
import { resolveProjectForRequest } from '../../_lib/project_scope.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env?.DB) return json(500, { error: 'no_db' });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const blogSlug = String(body?.blog_slug || '').trim();
  const readTimeMs = parseInt(body?.read_time_ms || '0', 10);

  if (!blogSlug) return json(400, { error: 'provide blog_slug' });

  const project = await resolveProjectForRequest(env, request).catch(() => null);
  const projectId = project?.id || null;

  const existing = await env.DB.prepare(
    `SELECT id, view_count, total_read_time_ms FROM blog_views WHERE blog_slug = ? LIMIT 1`
  ).bind(blogSlug).first().catch(() => null);

  if (existing) {
    await env.DB.prepare(
      `UPDATE blog_views SET view_count = view_count + 1, total_read_time_ms = total_read_time_ms + ?, last_viewed = ?, project_id = COALESCE(project_id, ?) WHERE id = ?`
    ).bind(readTimeMs || 0, nowSec(), projectId, existing.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO blog_views (id, project_id, blog_slug, view_count, last_viewed, total_read_time_ms) VALUES (?, ?, ?, 1, ?, ?)`
    ).bind(newId(), projectId, blogSlug, nowSec(), readTimeMs || 0).run();
  }

  return json(200, { ok: true });
};

export const onRequestGet = async ({ request, env }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });
  if (!env?.DB) return json(500, { error: 'no_db' });

  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;
  const sql = pid
    ? `SELECT blog_slug, view_count, total_read_time_ms, last_viewed FROM blog_views WHERE project_id = ? ORDER BY view_count DESC LIMIT 50`
    : `SELECT blog_slug, view_count, total_read_time_ms, last_viewed FROM blog_views ORDER BY view_count DESC LIMIT 50`;
  const stmt = pid ? env.DB.prepare(sql).bind(pid) : env.DB.prepare(sql);
  const { results } = await stmt.all().catch(() => ({ results: [] }));
  return json(200, { ok: true, views: results || [] });
};

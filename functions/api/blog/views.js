import { json, newId, nowSec } from '../../_lib/util.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env?.DB) return json(500, { error: 'no_db' });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const blogSlug = String(body?.blog_slug || '').trim();
  const readTimeMs = parseInt(body?.read_time_ms || '0', 10);

  if (!blogSlug) return json(400, { error: 'provide blog_slug' });

  const existing = await env.DB.prepare(
    `SELECT id, view_count, total_read_time_ms FROM blog_views WHERE blog_slug = ? LIMIT 1`
  ).bind(blogSlug).first().catch(() => null);

  if (existing) {
    await env.DB.prepare(
      `UPDATE blog_views SET view_count = view_count + 1, total_read_time_ms = total_read_time_ms + ?, last_viewed = ? WHERE id = ?`
    ).bind(readTimeMs || 0, nowSec(), existing.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO blog_views (id, blog_slug, view_count, last_viewed, total_read_time_ms) VALUES (?, ?, 1, ?, ?)`
    ).bind(newId(), blogSlug, nowSec(), readTimeMs || 0).run();
  }

  return json(200, { ok: true });
};

export const onRequestGet = async ({ request, env }) => {
  if (!env?.DB) return json(500, { error: 'no_db' });
  const { results } = await env.DB.prepare(
    `SELECT blog_slug, view_count, total_read_time_ms, last_viewed FROM blog_views ORDER BY view_count DESC LIMIT 50`
  ).all().catch(() => ({ results: [] }));
  return json(200, { ok: true, views: results });
};

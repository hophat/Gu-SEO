import { json, newId, nowSec } from '../../_lib/util.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env?.DB) return json(500, { error: 'no_db' });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const blogSlug = String(body?.blog_slug || '').trim();
  const rating = String(body?.rating || '').trim();
  const comment = String(body?.comment || '').trim().slice(0, 500);

  if (!blogSlug || !rating) return json(400, { error: 'provide blog_slug and rating' });
  if (!['yes', 'no'].includes(rating)) return json(400, { error: 'rating must be yes or no' });

  await env.DB.prepare(
    `INSERT INTO feedback (id, blog_slug, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)`
  ).bind(newId(), blogSlug, rating, comment || null, nowSec()).run();

  return json(200, { ok: true });
};

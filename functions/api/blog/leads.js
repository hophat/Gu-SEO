import { json, newId, nowSec } from '../../_lib/util.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env?.DB) return json(500, { error: 'no_db' });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim();
  const phone = String(body?.phone || '').trim();
  const source = String(body?.source || 'blog').trim();
  const blogSlug = String(body?.blog_slug || '').trim();

  if (!email && !phone) return json(400, { error: 'provide email or phone' });

  await env.DB.prepare(
    `INSERT INTO leads (id, name, email, phone, source, blog_slug, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(newId(), name, email, phone, source, blogSlug || null, nowSec()).run();

  return json(200, { ok: true });
};

export const onRequestGet = async ({ request, env }) => {
  if (!env?.DB) return json(500, { error: 'no_db' });
  const { results } = await env.DB.prepare(
    `SELECT id, name, email, phone, source, blog_slug, created_at FROM leads ORDER BY created_at DESC LIMIT 100`
  ).all().catch(() => ({ results: [] }));
  return json(200, { ok: true, leads: results });
};

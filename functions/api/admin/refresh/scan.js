import { json, newId, nowSec, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';

const STALE_DAYS = 90;
const REFRESH_COOLDOWN_DAYS = 30;

export const onRequestPost = async ({ request, env }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  if (!env?.DB) return json(500, { error: 'no_db' });
  let body;
  try { body = await request.json(); } catch { body = {}; }

  const projectId = String(body?.project_id || body?.project || '').trim() || null;
  const limit = Math.min(20, Math.max(1, parseInt(body?.limit, 10) || 10));
  const t = nowSec();
  const staleBefore = t - STALE_DAYS * 86400;
  const cooldownBefore = t - REFRESH_COOLDOWN_DAYS * 86400;

  const rows = projectId
    ? await env.DB.prepare(
        `SELECT id, slug, title, published_at, last_refresh_at, refresh_count
           FROM blog_posts
          WHERE status = 'published' AND published_at < ?
            AND (project_id = ? OR project_id IS NULL)
            AND (last_refresh_at IS NULL OR last_refresh_at < ?)
          ORDER BY published_at ASC LIMIT ?`
      ).bind(staleBefore, projectId, cooldownBefore, limit).all().catch(() => ({ results: [] }))
    : await env.DB.prepare(
        `SELECT id, slug, title, published_at, last_refresh_at, refresh_count
           FROM blog_posts
          WHERE status = 'published' AND published_at < ?
            AND (last_refresh_at IS NULL OR last_refresh_at < ?)
          ORDER BY published_at ASC LIMIT ?`
      ).bind(staleBefore, cooldownBefore, limit).all().catch(() => ({ results: [] }));

  const created = [];
  for (const p of (rows?.results || [])) {
    const open = await env.DB.prepare(
      `SELECT 1 FROM refresh_jobs WHERE post_id = ? AND status = 'created' LIMIT 1`
    ).bind(p.id).first().catch(() => null);
    if (open) continue;
    const id = newId();
    await env.DB.prepare(
      `INSERT INTO refresh_jobs (id, post_id, reason, status, created_at, updated_at)
       VALUES (?, ?, 'stale', 'created', ?, ?)`
    ).bind(id, p.id, t, t).run().catch(() => {});
    created.push({ job_id: id, post_id: p.id, slug: p.slug, title: p.title, reason: 'stale' });
  }

  audit(env, 'admin', 'refresh.scan', projectId, { candidates: created.length });
  return json(200, { ok: true, count: created.length, jobs: created });
};

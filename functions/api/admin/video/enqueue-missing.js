// Batch enqueue — "Render tất cả bài thiếu". Creates pending video jobs
// for every published post (optionally scoped to a project) that has no
// active video job yet. The agent's batch loop drains them; failed jobs
// resurrect on later ticks. Capped so a stray click cannot queue the
// whole archive at once.
import { json, nowSec, newId, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const projectId = body?.project_id ? String(body.project_id) : null;
  const limit = Math.min(50, Math.max(1, parseInt(body?.limit, 10) || 30));

  // Posts with no video job at all (failed ones don't hold the slot —
  // they get resurrected by the claim path instead of re-enqueued).
  const sql = projectId
    ? `SELECT p.id, p.slug FROM blog_posts p
        WHERE p.status = 'published' AND p.project_id = ?
          AND NOT EXISTS (SELECT 1 FROM video_jobs v
                          WHERE v.blog_post_id = p.id
                            AND v.status IN ('pending','claimed','rendering','done'))
        ORDER BY p.published_at DESC LIMIT ?`
    : `SELECT p.id, p.slug, p.project_id FROM blog_posts p
        WHERE p.status = 'published'
          AND NOT EXISTS (SELECT 1 FROM video_jobs v
                          WHERE v.blog_post_id = p.id
                            AND v.status IN ('pending','claimed','rendering','done'))
        ORDER BY p.published_at DESC LIMIT ?`;
  const rows = projectId
    ? await env.DB.prepare(sql).bind(projectId, limit).all().catch(() => ({ results: [] }))
    : await env.DB.prepare(sql).bind(limit).all().catch(() => ({ results: [] }));

  const t = nowSec();
  let enqueued = 0;
  for (const post of rows?.results || []) {
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO video_jobs
         (id, project_id, blog_post_id, slug, kind, status, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'post', 'pending', 0, ?, ?)`
    ).bind(newId(), projectId || post.project_id || null, post.id, post.slug, t, t).run().catch(() => null);
    if (r?.meta?.changes) enqueued++;
  }

  audit(env, 'admin', 'video.enqueue_missing', projectId || 'all', { enqueued, limit });
  return json(200, { ok: true, enqueued, hint: `Agent sẽ render ${enqueued} video qua các tick 5 phút (VIDEO_BATCH mỗi lần).` });
};

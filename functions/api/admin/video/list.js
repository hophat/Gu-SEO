// Admin UI — video job list. Read-only: the queue state, the R2 key, and
// the render error if any. The public URL of a done video is derived from
// the same /image/ route that serves hero images (the R2 bucket is shared).
import { json } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;

  const url = new URL(request.url);
  const projectId = url.searchParams.get('project_id') || null;
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 30));

  const rows = projectId
    ? await env.DB.prepare(
        `SELECT v.id, v.slug, v.status, v.video_key, v.error, v.attempts, v.created_at, v.updated_at,
                p.title, p.project_id
         FROM video_jobs v JOIN blog_posts p ON p.id = v.blog_post_id
         WHERE v.project_id = ?
         ORDER BY v.updated_at DESC LIMIT ?`
      ).bind(projectId, limit).all()
    : await env.DB.prepare(
        `SELECT v.id, v.slug, v.status, v.video_key, v.error, v.attempts, v.updated_at,
                p.title, p.project_id
         FROM video_jobs v JOIN blog_posts p ON p.id = v.blog_post_id
         ORDER BY v.updated_at DESC LIMIT ?`
      ).bind(limit).all();

  const jobs = (rows?.results || []).map((r) => ({
    ...r,
    video_url: r.video_key ? `/image/${r.video_key}` : null,
  }));
  return json(200, { ok: true, jobs });
};

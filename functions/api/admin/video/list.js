// Admin UI — video job list. kind: 'post' (per blog post) or 'business'
// (per-project promo). The public URL of a done video rides the same
// /image/ route that serves hero images (one R2 bucket).
import { json } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;

  const url = new URL(request.url);
  const projectId = url.searchParams.get('project_id') || null;
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 30));

  const rows = projectId
    ? await env.DB.prepare(
        `SELECT v.id, v.slug, v.kind, v.status, v.video_key, v.error, v.attempts, v.updated_at,
                p.title, p.project_id
         FROM video_jobs v LEFT JOIN blog_posts p ON p.id = v.blog_post_id
         WHERE v.project_id = ?
         ORDER BY v.updated_at DESC LIMIT ?`
      ).bind(projectId, limit).all()
    : await env.DB.prepare(
        `SELECT v.id, v.slug, v.kind, v.status, v.video_key, v.error, v.attempts, v.updated_at,
                p.title, p.project_id
         FROM video_jobs v LEFT JOIN blog_posts p ON p.id = v.blog_post_id
         ORDER BY v.updated_at DESC LIMIT ?`
      ).bind(limit).all();

  const jobs = (rows?.results || []).map((r) => ({
    ...r,
    kind: r.kind || 'post',
    title: r.title || (r.slug ? r.slug : 'Video doanh nghiệp'),
    video_url: r.video_key ? `/image/${r.video_key}` : null,
  }));
  return json(200, { ok: true, jobs });
};

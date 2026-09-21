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
         FROM video_jobs v LEFT JOIN blog_posts p
           ON p.id = CASE WHEN v.blog_post_id LIKE 'carousel:%'
                          THEN substr(v.blog_post_id, 10) ELSE v.blog_post_id END
         WHERE v.project_id = ?
         ORDER BY v.updated_at DESC LIMIT ?`
      ).bind(projectId, limit).all()
    : await env.DB.prepare(
        `SELECT v.id, v.slug, v.kind, v.status, v.video_key, v.error, v.attempts, v.updated_at,
                p.title, p.project_id
         FROM video_jobs v LEFT JOIN blog_posts p
           ON p.id = CASE WHEN v.blog_post_id LIKE 'carousel:%'
                          THEN substr(v.blog_post_id, 10) ELSE v.blog_post_id END
         ORDER BY v.updated_at DESC LIMIT ?`
      ).bind(limit).all();

  const jobs = (rows?.results || []).map((r) => {
    // Carousel jobs store the slide prefix in video_key — derive the
    // fixed 5 slide URLs for the grid view.
    return {
      ...r,
      kind: r.kind || 'post',
      title: r.title || (r.slug ? r.slug : 'Video doanh nghiệp'),
      video_url: r.video_key && !r.video_key.startsWith('carousel/') ? `/image/${r.video_key}` : null,
      slides: r.kind === 'carousel' && r.video_key
        ? [1, 2, 3, 4, 5].map((n) => `/image/${r.video_key}-${n}.png`)
        : null,
    };
  });
  return json(200, { ok: true, jobs });
};

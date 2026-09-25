// Admin UI — video job list. kind: 'post' (per blog post) or 'business'
// (per-project promo). The public URL of a done video rides the same
// /image/ route that serves hero images (one R2 bucket).
import { json } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { CAROUSEL_KIND, isCarouselKey, postIdFromRefSql, carouselSlideKeys } from '../../../_lib/video_jobs.js';

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;

  const url = new URL(request.url);
  const projectId = url.searchParams.get('project_id') || null;
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 30));

  const rows = projectId
    ? await env.DB.prepare(
        `SELECT v.id, v.blog_post_id, v.slug, v.kind, v.status, v.video_key, v.error, v.attempts, v.updated_at,
                v.template,
                p.title, p.project_id
         FROM video_jobs v LEFT JOIN blog_posts p
           ON p.id = ${postIdFromRefSql('v.blog_post_id')}
         WHERE v.project_id = ?
         ORDER BY v.updated_at DESC LIMIT ?`
      ).bind(projectId, limit).all()
    : await env.DB.prepare(
        `SELECT v.id, v.blog_post_id, v.slug, v.kind, v.status, v.video_key, v.error, v.attempts, v.updated_at,
                v.template,
                p.title, p.project_id
         FROM video_jobs v LEFT JOIN blog_posts p
           ON p.id = ${postIdFromRefSql('v.blog_post_id')}
         ORDER BY v.updated_at DESC LIMIT ?`
      ).bind(limit).all();

  const jobs = (rows?.results || []).map((r) => {
    // Carousel jobs store the slide prefix in video_key — derive the
    // fixed 5 slide URLs for the grid view.
    return {
      ...r,
      kind: r.kind || 'post',
      title: r.title || (r.slug ? r.slug : 'Video doanh nghiệp'),
      video_url: r.video_key && !isCarouselKey(r.video_key) ? `/image/${r.video_key}` : null,
      slides: r.kind === CAROUSEL_KIND && r.video_key
        ? carouselSlideKeys(r.video_key).map((k) => `/image/${k}`)
        : null,
    };
  });
  return json(200, { ok: true, jobs });
};

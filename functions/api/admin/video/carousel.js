// Create a carousel job — 5 static slides 1080×1350 (4:5) for a blog
// post: title/hook slide, 3 takeaway slides, CTA slide. Exported as PNGs
// by the agent (hyperframes snapshot) and posted to Facebook as a
// multi-photo post. One carousel per post at a time.
import { json, nowSec, newId, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const projectId = String(body?.project_id || '');
  const slug = String(body?.slug || '').trim();
  if (!projectId) return json(400, { error: 'missing_project_id' });
  if (!slug) return json(400, { error: 'missing_slug', hint: 'Carousel cần 1 bài viết làm nội dung' });

  const post = await env.DB.prepare(
    `SELECT id, slug, title, project_id FROM blog_posts
      WHERE slug = ? AND status = 'published' LIMIT 1`
  ).bind(slug).first();
  if (!post) return json(404, { error: 'post_not_found', slug });

  const existing = await env.DB.prepare(
    `SELECT id, status FROM video_jobs WHERE kind = 'carousel' AND blog_post_id = ? ORDER BY updated_at DESC LIMIT 1`
  ).bind(post.id).first();
  if (existing && ['pending', 'claimed', 'rendering'].includes(existing.status)) {
    return json(409, { error: 'already_rendering', job_id: existing.id });
  }
  // A finished carousel is re-renderable at will.
  if (existing && existing.status === 'done') {
    await env.DB.prepare('DELETE FROM video_jobs WHERE id = ?').bind(existing.id).run().catch(() => {});
  }

  const id = newId();
  const t = nowSec();
  await env.DB.prepare(
    `INSERT INTO video_jobs (id, project_id, blog_post_id, slug, kind, status, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'carousel', 'pending', 0, ?, ?)`
  ).bind(id, post.project_id || projectId, post.id, post.slug, t, t).run();

  audit(env, 'admin', 'video.carousel_create', post.id, { job_id: id });
  return json(200, { ok: true, job_id: id, hint: 'Agent sẽ xuất 5 slide PNG trong chu kỳ 5 phút tới.' });
};

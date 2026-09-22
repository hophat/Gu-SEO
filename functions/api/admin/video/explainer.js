// Create an explainer job — the article rendered as a 45-75s illustrated
// video: charts, diagrams, icon grids and quote cards drawn as SVG, with
// the same narration pipeline as the post teaser.
//
// One explainer per post at a time. Like a carousel it is not the post's
// own video job, so it satisfies UNIQUE(blog_post_id) with a sentinel ref
// (functions/_lib/video_jobs.js owns that convention).
import { json, nowSec, newId, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { explainerRef } from '../../../_lib/video_jobs.js';
import { parseTemplateParam, clampVideoDuration } from '../../../_lib/video_templates.js';

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const projectId = String(body?.project_id || '');
  const slug = String(body?.slug || '').trim();
  if (!projectId) return json(400, { error: 'missing_project_id' });
  if (!slug) return json(400, { error: 'missing_slug', hint: 'Video minh hoạ cần 1 bài viết làm nội dung' });

  const post = await env.DB.prepare(
    `SELECT id, slug, title, project_id FROM blog_posts
      WHERE slug = ? AND status = 'published' LIMIT 1`
  ).bind(slug).first();
  if (!post) return json(404, { error: 'post_not_found', slug });

  const ref = explainerRef(post.id);
  const existing = await env.DB.prepare(
    `SELECT id, status FROM video_jobs WHERE kind = 'explainer' AND blog_post_id = ? ORDER BY updated_at DESC LIMIT 1`
  ).bind(ref).first();
  if (existing && ['pending', 'claimed', 'rendering'].includes(existing.status)) {
    return json(409, { error: 'already_rendering', job_id: existing.id });
  }
  // A finished explainer is re-renderable at will: drop the old row so the
  // agent's claim succeeds. Without this the UNIQUE index would reject it.
  if (existing && existing.status === 'done') {
    await env.DB.prepare('DELETE FROM video_jobs WHERE id = ?').bind(existing.id).run().catch(() => {});
  }

  const tpl = parseTemplateParam(body?.template);
  if (!tpl.ok) return json(400, { error: 'unknown_template' });
  const duration = clampVideoDuration(body?.duration);

  const id = newId();
  const t = nowSec();
  await env.DB.prepare(
    `INSERT INTO video_jobs (id, project_id, blog_post_id, slug, kind, status, template, duration, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'explainer', 'pending', ?, ?, 0, ?, ?)`
  ).bind(id, post.project_id || projectId, ref, post.slug, tpl.template, duration, t, t).run();

  audit(env, 'admin', 'video.explainer_create', post.id, { job_id: id });
  return json(200, { ok: true, job_id: id, hint: 'Agent sẽ render video minh hoạ trong chu kỳ 5 phút tới.' });
};

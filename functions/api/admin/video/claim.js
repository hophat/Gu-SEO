// Video agent — claim the next post that needs a 9:16 social video.
//
// Video rendering can't run on Workers (headless Chrome + FFmpeg), so an
// external agent (see video-agent/ on the render VPS) polls this endpoint,
// claims one job atomically, renders off-platform, and delivers the MP4
// via /api/admin/video/deliver.
//
// Claim semantics: POST { slug? }. With a slug it claims that specific
// post (manual re-render path); without, it claims the newest published
// post inside the queue window that has no active video job. The UNIQUE
// index on video_jobs(blog_post_id) makes the INSERT the atomic claim —
// two concurrent agents can never render the same post.
import { json, nowSec, newId, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';

// How far back the auto-queue looks. Videos are enrichment for fresh
// posts — without a window, the first agent run would try to backfill
// the entire archive (188 posts and counting).
const QUEUE_WINDOW = 48 * 3600;

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body = {};
  try { body = await request.json(); } catch { /* auto-claim */ }

  const projectId = body?.project_id ? String(body.project_id) : null;
  const slug = body?.slug ? String(body.slug) : null;
  const now = nowSec();

  // Resolve the target post. Explicit slug wins (manual/testing path);
  // otherwise newest published post in the window with no active job.
  let post;
  if (slug) {
    post = await env.DB.prepare(
      `SELECT id, slug, title, meta_description, body_markdown,
              hero_image_key, project_id
       FROM blog_posts WHERE slug = ? AND status = 'published' LIMIT 1`
    ).bind(slug).first();
    if (!post) return json(404, { error: 'post_not_found', slug });
  } else {
    const rows = projectId
      ? await env.DB.prepare(
          `SELECT p.id, p.slug, p.title, p.meta_description, p.body_markdown,
                  p.hero_image_key, p.project_id
           FROM blog_posts p
           WHERE p.status = 'published' AND p.published_at > ? AND p.project_id = ?
             AND NOT EXISTS (SELECT 1 FROM video_jobs v
                             WHERE v.blog_post_id = p.id
                               AND v.status IN ('pending','claimed','rendering','done'))
           ORDER BY p.published_at DESC LIMIT 1`
        ).bind(now - QUEUE_WINDOW, projectId).all()
      : await env.DB.prepare(
          `SELECT p.id, p.slug, p.title, p.meta_description, p.body_markdown,
                  p.hero_image_key, p.project_id
           FROM blog_posts p
           WHERE p.status = 'published' AND p.published_at > ?
             AND NOT EXISTS (
               SELECT 1 FROM video_jobs v
               WHERE v.blog_post_id = p.id
                 AND v.status IN ('pending','claimed','rendering','done'))
           ORDER BY p.published_at DESC LIMIT 1`
        ).bind(now - QUEUE_WINDOW).all();
    post = (rows?.results || [])[0] || null;
    if (!post) {
      return json(200, { ok: true, job: null, hint: 'no published post in the last 48h is missing a video' });
    }
  }

  // Atomic claim — UNIQUE(blog_post_id) rejects a second claimer. A FAILED
  // job does not hold the slot: the row is resurrected (status back to
  // claimed, attempts++) so a re-render never trips the unique index.
  const now2 = now;
  let jobId = newId();
  try {
    await env.DB.prepare(
      `INSERT INTO video_jobs (id, project_id, blog_post_id, slug, status, attempts, claimed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'claimed', 1, ?, ?, ?)`
    ).bind(jobId, post.project_id || null, post.id, post.slug, now2, now2, now2).run();
  } catch (e) {
    if (!/UNIQUE|unique/i.test(String(e?.message || e))) throw e;
    const existing = await env.DB.prepare(
      'SELECT id, status FROM video_jobs WHERE blog_post_id = ? LIMIT 1'
    ).bind(post.id).first();
    if (!existing || existing.status !== 'failed') {
      return json(409, { error: 'already_claimed', slug: post.slug });
    }
    await env.DB.prepare(
      `UPDATE video_jobs SET status='claimed', attempts=attempts+1, claimed_at=?, updated_at=?, error=NULL WHERE id=?`
    ).bind(now2, now2, existing.id).run();
    jobId = existing.id;
  }

  // Public branding for the intro/outro cards.
  const project = post.project_id
    ? await env.DB.prepare(
        'SELECT site_name, site_description, logo_url, publishing_url FROM projects WHERE id = ? LIMIT 1'
      ).bind(post.project_id).first().catch(() => null)
    : null;

  // Hero bytes inline as base64 — the agent needs the pixels, and a
  // same-origin /image/ URL would not resolve from the VPS's fetch
  // context without extra origin plumbing. ~100-300KB base64 is fine.
  let heroBase64 = null;
  if (post.hero_image_key && env.IMAGES) {
    try {
      const obj = await env.IMAGES.get(post.hero_image_key);
      if (obj) {
        const bytes = new Uint8Array(await obj.arrayBuffer());
        let s = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        heroBase64 = btoa(s);
      }
    } catch { /* hero stays null — the template falls back to a gradient */ }
  }

  await audit(env, 'video-agent', 'video.claim', post.id, { slug: post.slug, job_id: jobId });

  return json(200, {
    ok: true,
    job: {
      id: jobId,
      slug: post.slug,
      title: post.title,
      meta_description: post.meta_description,
      body_markdown: post.body_markdown,
      hero_image_base64: heroBase64,
      project: project ? {
        name: project.site_name || null,
        description: project.site_description || null,
        logo_url: project.logo_url || null,
        publishing_url: project.publishing_url || null,
      } : null,
    },
  });
};

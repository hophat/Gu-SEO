// Video agent — claim the next job that needs rendering.
//
// Three job kinds flow through here:
//   business — per-project promo from the brand kit (admin button)
//   website  — promo rendered from a live URL (source_url recorded)
//   post     — a published blog post becomes a narrated summary
//
// Claim semantics: POST { type?, slug?, project_id? }.
//   - business/website: claim the oldest pending/failed job of that kind.
//   - post: (1) explicit slug (manual re-render), (2) the oldest
//     pending/failed post job — batch enqueues land here, (3) auto-
//     discover the newest published post in the window with no job.
// The UNIQUE index on video_jobs(blog_post_id) makes the INSERT the
// atomic claim; failed jobs are resurrected (attempts++) so a re-render
// never trips the unique index.
import { json, nowSec, newId, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';

// How far back the auto-queue looks for post videos. Videos are
// enrichment for fresh posts — without a window, the first agent run
// would try to backfill the entire archive.
const QUEUE_WINDOW = 48 * 3600;

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body = {};
  try { body = await request.json(); } catch { /* auto-claim */ }

  const projectId = body?.project_id ? String(body.project_id) : null;
  const slug = body?.slug ? String(body.slug) : null;
  const now = nowSec();

  // ── business / website promo claim ───────────────────────────────
  // The admin buttons create PENDING jobs (blog_post_id carries a
  // 'project:<id>' or 'url:<href>' sentinel so the UNIQUE index holds).
  // The agent claims the oldest pending/failed job of the kind.
  if (body?.type === 'business' || body?.type === 'website') {
    const kind = body.type;
    const pendSql = projectId
      ? `SELECT id, project_id, source_url FROM video_jobs
          WHERE kind = ? AND project_id = ? AND status IN ('pending','failed')
          ORDER BY created_at ASC LIMIT 1`
      : `SELECT id, project_id, source_url FROM video_jobs
          WHERE kind = ? AND status IN ('pending','failed')
          ORDER BY created_at ASC LIMIT 1`;
    const rows = projectId
      ? await env.DB.prepare(pendSql).bind(kind, projectId).all().catch(() => ({ results: [] }))
      : await env.DB.prepare(pendSql).bind(kind).all().catch(() => ({ results: [] }));
    const pendingJob = (rows?.results || [])[0] || null;
    if (!pendingJob) {
      return json(200, { ok: true, job: null, hint: `no ${kind} video queued` });
    }

    await env.DB.prepare(
      `UPDATE video_jobs SET status='claimed', attempts=attempts+1, claimed_at=?, updated_at=? WHERE id=?`
    ).bind(now, now, pendingJob.id).run();

    const pid = pendingJob.project_id;
    const project = await env.DB.prepare(
      `SELECT id, slug, name, description, logo_url, theme_color, brand_accent,
              video_tagline, address, phone, publishing_url, custom_domain, website_url
       FROM projects WHERE id = ? LIMIT 1`
    ).bind(pid).first();
    if (!project) {
      await env.DB.prepare(
        `UPDATE video_jobs SET status='failed', error='project_missing', updated_at=? WHERE id=?`
      ).bind(now, pendingJob.id).run();
      return json(200, { ok: true, job: null, hint: 'project missing for promo job' });
    }

    const brand = await env.DB.prepare(
      'SELECT business_type, tone, audience, key_themes, service_area, cta FROM project_brands WHERE project_id = ? LIMIT 1'
    ).bind(pid).first().catch(() => null);

    // Latest post hero doubles as the food/storefront shot.
    const hero = await env.DB.prepare(
      `SELECT hero_image_key FROM blog_posts
       WHERE project_id = ? AND hero_image_key IS NOT NULL AND status = 'published'
       ORDER BY published_at DESC LIMIT 1`
    ).bind(pid).first().catch(() => null);

    // Brand kit — the frame.md payload. The agent renders THESE tokens,
    // it never invents brand visuals per video. key_themes double as the
    // 3 highlight lines (menu items / selling points).
    const highlights = String(brand?.key_themes || '')
      .split(/[\n,]/).map((s) => s.trim()).filter(Boolean).slice(0, 3);

    let heroBase64 = null;
    if (hero?.hero_image_key && env.IMAGES) {
      try {
        const obj = await env.IMAGES.get(hero.hero_image_key);
        if (obj) {
          const bytes = new Uint8Array(await obj.arrayBuffer());
          let s = '';
          for (let i = 0; i < bytes.length; i += 0x8000) {
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          }
          heroBase64 = btoa(s);
        }
      } catch { /* gradient fallback */ }
    }

    await audit(env, 'video-agent', `video.${kind}_claim`, pid, { job_id: pendingJob.id });

    return json(200, {
      ok: true,
      job: {
        id: pendingJob.id,
        kind,
        source_url: pendingJob.source_url || null,
        slug: project.slug,
        title: project.name,
        highlights,
        project: {
          name: project.name,
          description: project.description || '',
          tagline: project.video_tagline || '',
          accent: project.brand_accent || project.theme_color || '',
          address: project.address || '',
          phone: project.phone || '',
          logo_url: project.logo_url || null,
          publishing_url: project.publishing_url || null,
          website_url: project.website_url || null,
          brand: {
            business_type: brand?.business_type || '',
            tone: brand?.tone || '',
            audience: brand?.audience || '',
            service_area: brand?.service_area || '',
            cta: brand?.cta || '',
          },
          hero_image_base64: heroBase64,
        },
        body_markdown: project.description || '',
      },
    });
  }

  // ── post video claim ─────────────────────────────────────────────
  // Order: (1) an explicit slug (manual/testing), (2) the oldest
  // pending/failed post job — batch enqueues land here, (3) auto-
  // discover the newest published post in the window with no job.
  let post = null;
  let jobId = null;
  let pendingKind = null;

  if (slug) {
    post = await env.DB.prepare(
      `SELECT id, slug, title, meta_description, body_markdown,
              hero_image_key, project_id
       FROM blog_posts WHERE slug = ? AND status = 'published' LIMIT 1`
    ).bind(slug).first();
    if (!post) return json(404, { error: 'post_not_found', slug });
  } else {
    // 1. Drain the batch queue: oldest pending/failed post job first.
    // Carousels ride the same queue — they need the same post payload.
    const pendSql = projectId
      ? `SELECT id, kind, blog_post_id FROM video_jobs
          WHERE kind IN ('post','carousel') AND project_id = ? AND status IN ('pending','failed')
          ORDER BY created_at ASC LIMIT 1`
      : `SELECT id, kind, project_id, blog_post_id FROM video_jobs
          WHERE kind IN ('post','carousel') AND status IN ('pending','failed')
          ORDER BY created_at ASC LIMIT 1`;
    const pendRows = projectId
      ? await env.DB.prepare(pendSql).bind(projectId).all().catch(() => ({ results: [] }))
      : await env.DB.prepare(pendSql).all().catch(() => ({ results: [] }));
    const pendingJob = (pendRows?.results || [])[0] || null;

    if (pendingJob) {
      await env.DB.prepare(
        `UPDATE video_jobs SET status='claimed', attempts=attempts+1, claimed_at=?, updated_at=?, error=NULL WHERE id=?`
      ).bind(now, now, pendingJob.id).run();
      const p = await env.DB.prepare(
        `SELECT id, slug, title, meta_description, body_markdown,
                hero_image_key, project_id
         FROM blog_posts WHERE id = ? AND status = 'published' LIMIT 1`
      ).bind(pendingJob.blog_post_id).first().catch(() => null);
      if (!p) {
        // The queued post vanished (unpublished/deleted) — park the job
        // and let the next claim move on to other work.
        await env.DB.prepare(
          `UPDATE video_jobs SET status='failed', error='post_missing', updated_at=? WHERE id=?`
        ).bind(now, pendingJob.id).run();
        return json(200, { ok: true, job: null, hint: 'queued post no longer exists' });
      }
      post = p;
      jobId = pendingJob.id;
      pendingKind = pendingJob.kind || 'post';
    }
  }

  // 2. Auto-discover: newest published post in the window with no video
  // job yet (pending/claimed/rendering/done all hold the slot).
  if (!post && !slug) {
    const discSql = projectId
      ? `SELECT p.id, p.slug, p.title, p.meta_description, p.body_markdown,
                p.hero_image_key, p.project_id
         FROM blog_posts p
         WHERE p.status = 'published' AND p.published_at > ? AND p.project_id = ?
           AND NOT EXISTS (SELECT 1 FROM video_jobs v
                           WHERE v.blog_post_id = p.id
                             AND v.status IN ('pending','claimed','rendering','done'))
         ORDER BY p.published_at DESC LIMIT 1`
      : `SELECT p.id, p.slug, p.title, p.meta_description, p.body_markdown,
                p.hero_image_key, p.project_id
         FROM blog_posts p
         WHERE p.status = 'published' AND p.published_at > ?
           AND NOT EXISTS (SELECT 1 FROM video_jobs v
                           WHERE v.blog_post_id = p.id
                             AND v.status IN ('pending','claimed','rendering','done'))
         ORDER BY p.published_at DESC LIMIT 1`;
    const rows = projectId
      ? await env.DB.prepare(discSql(projectId)).bind(now - QUEUE_WINDOW, projectId).all().catch(() => ({ results: [] }))
      : await env.DB.prepare(discSql(null)).bind(now - QUEUE_WINDOW).all().catch(() => ({ results: [] }));
    post = (rows?.results || [])[0] || null;
    if (!post) {
      return json(200, { ok: true, job: null, hint: 'no published post in the last 48h is missing a video' });
    }
  }

  // Atomic claim for auto-discovered posts — UNIQUE(blog_post_id)
  // rejects a second claimer. A FAILED job does not hold the slot: the
  // row is resurrected (attempts++) so a re-render never trips it.
  if (!jobId) {
    jobId = newId();
    try {
      await env.DB.prepare(
        `INSERT INTO video_jobs (id, project_id, blog_post_id, slug, status, attempts, claimed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'claimed', 1, ?, ?, ?)`
      ).bind(jobId, post.project_id || null, post.id, post.slug, now, now, now).run();
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
      ).bind(now, now, existing.id).run();
      jobId = existing.id;
    }
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
      kind: pendingKind || 'post',
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

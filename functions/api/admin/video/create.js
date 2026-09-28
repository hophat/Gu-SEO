// Create a video job with an operator-chosen template — the single entry
// point behind the admin "Tạo video" wizard. It folds the three old
// per-source endpoints (post teaser / website / business) into one shape:
//
//   POST { project_id, source: { type: 'post' | 'url' | 'business',
//                                slug?, url?, brief? }, template?, duration? }
//
// `template` is a catalog id from _lib/video_templates.js ('auto'/absent
// stores NULL — the engine picks). `duration` clamps to 30–90s. Each
// source reuses the exact insert convention of the endpoint it replaces:
//   post     → kind='post',     blog_post_id = the real post id
//   url      → kind='website',  blog_post_id = 'url:<href>', source_url set
//   business → kind='business', blog_post_id = 'project:<id>' sentinel
// and the same dedupe rule: a job in pending/claimed/rendering 409s, a
// done row is deleted so a re-render never trips UNIQUE(blog_post_id).
//
// `source.brief` is the material for a job with no blog post behind it. A
// business job is keyed by a sentinel, so before video_jobs.body_markdown
// the claim had nothing to render from but projects.description — right for
// a promo, wrong for a researched brief or an approved script. Supplying a
// brief makes the agent write the story from that text instead. It is
// ignored for a post job, which always has its own body, and omitting it
// reproduces the previous behaviour exactly.
import { json, nowSec, newId, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { videoTemplateById, parseTemplateParam, clampVideoDuration } from '../../../_lib/video_templates.js';
import { parseBgmParam } from '../../../_lib/bgm_catalog.js';

const IN_FLIGHT = ['pending', 'claimed', 'rendering'];

// Generous enough for a long researched brief, small enough that the claim
// payload stays a sane request body. A brief past this is a paste accident.
const MAX_BRIEF_CHARS = 20000;

// A job already running for the same slot refuses the create; a finished
// one is dropped so the INSERT below does not trip UNIQUE(blog_post_id).
// Returns a Response to short-circuit with, or null to proceed.
async function dedupe(env, kind, ref) {
  const existing = await env.DB.prepare(
    `SELECT id, status FROM video_jobs WHERE kind = ? AND blog_post_id = ? ORDER BY updated_at DESC LIMIT 1`
  ).bind(kind, ref).first();
  if (existing && IN_FLIGHT.includes(existing.status)) {
    return json(409, { error: 'already_rendering', job_id: existing.id });
  }
  if (existing && existing.status === 'done') {
    await env.DB.prepare('DELETE FROM video_jobs WHERE id = ?').bind(existing.id).run().catch(() => {});
  }
  return null;
}

async function insertJob(env, { projectId, ref, slug, kind, sourceUrl, template, duration, bgm, bodyMarkdown = null }) {
  const id = newId();
  const t = nowSec();
  await env.DB.prepare(
    `INSERT INTO video_jobs (id, project_id, blog_post_id, slug, kind, status, source_url, template, duration, bgm, body_markdown, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, 0, ?, ?)`
  ).bind(id, projectId, ref, slug, kind, sourceUrl, template, duration, bgm, bodyMarkdown, t, t).run();
  return id;
}

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const projectId = String(body?.project_id || '');
  if (!projectId) return json(400, { error: 'missing_project_id' });

  const source = body?.source && typeof body.source === 'object' ? body.source : {};
  const sourceType = String(source.type || '');
  if (!['post', 'url', 'business'].includes(sourceType)) {
    return json(400, { error: 'bad_source_type', hint: "source.type phải là 'post', 'url' hoặc 'business'" });
  }

  const tpl = parseTemplateParam(body?.template);
  if (!tpl.ok) {
    return json(400, { error: 'unknown_template', hint: 'template phải là một id trong catalog (hoặc "auto")' });
  }
  const duration = clampVideoDuration(body?.duration);

  // Material for a job with no post behind it. Trimmed, length-capped so a
  // pasted document cannot become a multi-megabyte row that the claim
  // carries around on every render, and rejected when present but empty —
  // silently storing '' would fall back to projects.description and the
  // caller would never learn their brief was dropped.
  let brief = null;
  if (source.brief !== undefined && source.brief !== null && source.brief !== '') {
    if (typeof source.brief !== 'string') return json(400, { error: 'bad_brief' });
    brief = source.brief.trim();
    if (!brief) return json(400, { error: 'empty_brief' });
    if (brief.length > MAX_BRIEF_CHARS) {
      return json(413, { error: 'brief_too_long', max: MAX_BRIEF_CHARS, got: brief.length });
    }
  }

  // Background music: 'auto'/absent → NULL (claim chọn track free theo template),
  // 'none' → muted, else a catalog id. Never a free-form URL — the catalog is
  // the allow-list, so no user-controlled host ever reaches the renderer.
  const music = parseBgmParam(body?.bgm);
  if (!music.ok) {
    return json(400, { error: 'unknown_bgm', hint: 'bgm phải là "auto", "none" hoặc một id trong catalog nhạc' });
  }

  // The chosen template must know how to tell this kind of story. 'auto'
  // (stored NULL) accepts every source — the engine picks at render time.
  const tplDef = tpl.template ? videoTemplateById(tpl.template) : null;
  if (tplDef && !tplDef.sources.includes(sourceType)) {
    return json(400, {
      error: 'template_source_mismatch',
      hint: `Template "${tplDef.label}" không nhận nguồn ${sourceType} — chỉ: ${tplDef.sources.join(', ')}`,
    });
  }

  const project = await env.DB.prepare(
    'SELECT id, slug, name FROM projects WHERE id = ? LIMIT 1'
  ).bind(projectId).first();
  if (!project) return json(404, { error: 'project_not_found' });

  // ── post ──────────────────────────────────────────────────────────
  if (sourceType === 'post') {
    const slug = String(source.slug || '').trim();
    if (!slug) return json(400, { error: 'missing_slug', hint: 'Video từ bài viết cần slug của bài đã xuất bản' });

    const post = await env.DB.prepare(
      `SELECT id, slug, title, project_id FROM blog_posts
        WHERE slug = ? AND status = 'published' LIMIT 1`
    ).bind(slug).first();
    if (!post) return json(404, { error: 'post_not_found', slug });

    const stop = await dedupe(env, 'post', post.id);
    if (stop) return stop;

    const jobId = await insertJob(env, {
      projectId: post.project_id || projectId,
      ref: post.id, slug: post.slug, kind: 'post',
      sourceUrl: null, template: tpl.template, duration, bgm: music.bgm,
    });
    audit(env, 'admin', 'video.create', post.id, { job_id: jobId, template: tpl.template, bgm: music.bgm, source_type: 'post' });
    return json(200, { ok: true, job_id: jobId, hint: 'Agent sẽ render trong chu kỳ tiếp theo.' });
  }

  // ── url ───────────────────────────────────────────────────────────
  if (sourceType === 'url') {
    const rawUrl = String(source.url || '').trim();
    let url;
    try { url = new URL(rawUrl); } catch { return json(400, { error: 'bad_url', hint: 'URL phải là http(s)://...' }); }
    if (!/^https?:$/.test(url.protocol)) return json(400, { error: 'bad_scheme' });

    const sentinel = `url:${url.href}`;
    const stop = await dedupe(env, 'website', sentinel);
    if (stop) return stop;

    const jobId = await insertJob(env, {
      projectId, ref: sentinel, slug: project.slug, kind: 'website',
      sourceUrl: url.href, template: tpl.template, duration, bgm: music.bgm, bodyMarkdown: brief,
    });
    audit(env, 'admin', 'video.create', projectId, { job_id: jobId, template: tpl.template, bgm: music.bgm, source_type: 'url', url: url.href, has_brief: Boolean(brief) });
    return json(200, { ok: true, job_id: jobId, hint: 'Agent sẽ render trong chu kỳ tiếp theo.' });
  }

  // ── business ──────────────────────────────────────────────────────
  const sentinel = `project:${projectId}`;
  const stop = await dedupe(env, 'business', sentinel);
  if (stop) return stop;

  const jobId = await insertJob(env, {
    projectId, ref: sentinel, slug: project.slug, kind: 'business',
    sourceUrl: null, template: tpl.template, duration, bgm: music.bgm, bodyMarkdown: brief,
  });
  audit(env, 'admin', 'video.create', projectId, { job_id: jobId, template: tpl.template, bgm: music.bgm, source_type: 'business', has_brief: Boolean(brief) });
  return json(200, { ok: true, job_id: jobId, hint: 'Agent sẽ render trong chu kỳ tiếp theo.' });
};

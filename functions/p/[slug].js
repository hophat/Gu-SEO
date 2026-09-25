// /p/<slug> — programmatic-SEO landing pages.
import { renderContentPage } from '../_lib/page_render.js';
import { loadSettings } from '../_lib/settings.js';
import { resolveProjectForRequest, resolveProjectBySlug } from '../_lib/project_scope.js';
import { edgeCached } from '../_lib/util.js';

// The live render — reached only on an edge-cache miss. Public, identical
// for every visitor, so the wrapper below is free to store the result.
async function renderLanding({ env, request, params }) {
  const slug = String(params.slug || '').toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }

  const projectSlug = String(params.project || '').toLowerCase() || null;
  const basePath = projectSlug ? `/${projectSlug}` : '';
  // Project resolution and the settings row don't depend on each other, so
  // they go out together — one D1 round-trip instead of two. The post query
  // below needs the resolved project_id, so it is the next wave.
  const [project, settings] = await Promise.all([
    projectSlug
      ? resolveProjectBySlug(env, projectSlug).catch(() => null)
      : resolveProjectForRequest(env, request).catch(() => null),
    loadSettings(env).catch(() => ({})),
  ]);
  if (projectSlug && !project) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  const projectId = project?.id || null;

  const post = projectId
    ? await env.DB.prepare(
        `SELECT slug, title, meta_description, body_markdown, hero_image_key, hero_image_alt,
                status, published_at
           FROM prog_pages WHERE slug = ? AND project_id = ? LIMIT 1`
      ).bind(slug, projectId).first()
    : await env.DB.prepare(
        `SELECT slug, title, meta_description, body_markdown, hero_image_key, hero_image_alt,
                status, published_at
           FROM prog_pages WHERE slug = ? LIMIT 1`
      ).bind(slug).first();
  if (!post) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  if (post.status === 'hidden') return new Response('Gone', { status: 410, headers: { 'content-type': 'text/plain' } });
  post.urlPath = `${basePath}/p/` + post.slug;
  // See blog/[slug].js for the rationale — flag whether a default
  // cover template exists so page_render.js can route the hero src
  // through /cover/<slug>.svg.
  if (settings?.hero_image_mode === 'cover') {
    try {
      const t = await env.DB.prepare(
        'SELECT updated_at FROM cover_templates WHERE is_default = 1 LIMIT 1'
      ).first();
      settings._has_default_template = !!t;
      settings._default_template_v = t?.updated_at || 0;
    } catch {
      settings._has_default_template = false;
      settings._default_template_v = 0;
    }
  }
  return new Response(renderContentPage({ env, request, post, kind: 'programmatic', settings, basePath, project }), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=600, s-maxage=3600',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
}

export const onRequestGet = (ctx) => edgeCached(ctx.request, ctx.waitUntil, () => renderLanding(ctx));

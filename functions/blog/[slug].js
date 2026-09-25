// /blog/<slug>
import { renderContentPage } from '../_lib/page_render.js';
import { loadSettings } from '../_lib/settings.js';
import { resolveProjectForRequest, resolveProjectBySlug } from '../_lib/project_scope.js';
import { edgeCached } from '../_lib/util.js';

// The live render — reached only on an edge-cache miss. Public, identical
// for every visitor, so the wrapper below is free to store the result.
async function renderPost({ env, request, params }) {
  const slug = String(params.slug || '').toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
  const projectSlug = String(params.project || '').toLowerCase() || null;
  const basePath = projectSlug ? `/${projectSlug}` : '';
  // Every D1 read below is a network round-trip to the D1 API, so a chain of
  // `await`s stacks their latencies. Nothing here needs a previous result
  // except the two post queries (which need the resolved project_id) and the
  // cover probe (which needs settings). Fire the three independent lookups
  // together, then the two project-scoped queries together: 6 serial
  // round-trips become 3, and the origin stops being the bottleneck on
  // every page view.
  const [redirectRow, project, settings] = await Promise.all([
    // Honour slug renames: blog_post_redirects maps old_slug -> new_slug.
    // 301 transfers ranking to the new URL. Table is created on demand by
    // the admin rename endpoint; lookup degrades gracefully if missing.
    (async () => {
      try {
        return await env.DB.prepare(
          `SELECT new_slug FROM blog_post_redirects WHERE old_slug = ? LIMIT 1`
        ).bind(slug).first();
      } catch { /* table not yet created */ return null; }
    })(),
    projectSlug
      ? resolveProjectBySlug(env, projectSlug).catch(() => null)
      : resolveProjectForRequest(env, request).catch(() => null),
    // Used by the renderer for verification metas and the JSON-LD WebSite
    // block. Memoised on env, so later readers in the same request are free.
    loadSettings(env).catch(() => ({})),
  ]);
  if (redirectRow?.new_slug) {
    return Response.redirect(new URL(`${basePath}/blog/${redirectRow.new_slug}`, request.url).toString(), 301);
  }
  if (projectSlug && !project) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  const projectId = project?.id || null;

  // "Read next" — three other recent posts the LLM didn't write into
  // the body. Ordered by recency for simplicity; cheaper than computing
  // similarity scores and good enough for sites with a few dozen posts.
  const postSql = projectId
    ? `SELECT slug, title, meta_description, body_markdown, hero_image_key, hero_image_alt,
              keywords, status, published_at
         FROM blog_posts WHERE slug = ? AND project_id = ? LIMIT 1`
    : `SELECT slug, title, meta_description, body_markdown, hero_image_key, hero_image_alt,
              keywords, status, published_at
         FROM blog_posts WHERE slug = ? LIMIT 1`;
  const relatedSql = projectId
    ? `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at
         FROM blog_posts
        WHERE status='published' AND slug != ? AND project_id = ?
        ORDER BY published_at DESC LIMIT 3`
    : `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at
         FROM blog_posts
        WHERE status='published' AND slug != ?
        ORDER BY published_at DESC LIMIT 3`;
  const [post, relatedRows] = await Promise.all([
    (projectId ? env.DB.prepare(postSql).bind(slug, projectId) : env.DB.prepare(postSql).bind(slug)).first(),
    (projectId ? env.DB.prepare(relatedSql).bind(slug, projectId) : env.DB.prepare(relatedSql).bind(slug))
      .all().catch(() => ({ results: [] })),
  ]);
  if (!post) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  if (post.status === 'hidden') return new Response('Gone', { status: 410, headers: { 'content-type': 'text/plain' } });
  // 'review' posts are admin-only drafts — invisible to public visitors
  // but still listed in /admin. Treat as 404 to keep them off Google.
  if (post.status === 'review') return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  post.urlPath = `${basePath}/blog/` + post.slug;
  const related = relatedRows.results || [];

  // Tag the settings with whether a default cover template exists.
  // If so AND hero_image_mode=cover, the page_render.js layer will
  // point the hero img + og:image at /cover/<slug>.svg (live
  // server-rendered from the template + post variables, no per-post
  // PNG stored). One query per request — D1 indexes is_default, so
  // it's effectively free.
  //
  // We also pull updated_at so page_render can append it as a
  // ?v=<ts> query on the cover URL. That changes the edge cache
  // key every time the template is edited, so admins don't see
  // stale covers after a template update.
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

  return new Response(renderContentPage({ env, request, post, kind: 'blog', related, settings, basePath, project }), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=600, s-maxage=3600',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
}

// The [project] wrapper re-enters this module with a context it rebuilt by
// hand, so `waitUntil` may be absent — edgeCached falls back to awaiting
// the store itself rather than dropping the write.
export const onRequestGet = (ctx) => edgeCached(ctx.request, ctx.waitUntil, () => renderPost(ctx));

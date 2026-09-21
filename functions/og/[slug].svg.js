// /og/<slug>.svg
//
// Open-Graph image generator for posts that don't have a hero image.
//
// Today this endpoint serves two roles:
//
//   1. When a default cover template exists, it's a thin alias for
//      /cover/<slug>.svg — same renderer, same variables, same
//      output. We keep the /og/ URL alive so social-share links the
//      blog has already published don't break.
//
//   2. When no default template exists, it falls back to a built-in
//      hard-coded card so we never emit a missing-image og:image.
//      The card mirrors the "main — official" template visually so
//      the brand stays consistent.

import { renderCoverSvg, isRenderableSpec, fallbackCoverSpec } from '../_lib/cover_svg.js';
import { buildBrandContext } from '../_lib/template.js';
import { loadSettings } from '../_lib/settings.js';
import { esc } from '../_lib/util.js';

export const onRequestGet = async ({ env, request, params }) => {
  const slug = String(params.slug || '').toLowerCase();
  if (!/^[a-z0-9-]{1,200}$/.test(slug)) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }

  // Look up the post.
  let post = null;
  let kind = 'blog';
  try {
    post = await env.DB.prepare(
      `SELECT slug, title, meta_description, body_markdown, hero_image_key,
              keywords, ai_provider, status, published_at
       FROM blog_posts WHERE slug = ? AND status='published' LIMIT 1`
    ).bind(slug).first();
    if (!post) {
      post = await env.DB.prepare(
        `SELECT slug, title, meta_description, body_markdown, hero_image_key,
                keyword, ai_provider, status, published_at
         FROM prog_pages WHERE slug = ? AND status='published' LIMIT 1`
      ).bind(slug).first();
      kind = 'programmatic';
    }
  } catch { /* DB unavailable — fall through */ }

  // Use the default cover template if one exists AND can actually
  // paint something; otherwise the built-in branded card. The
  // renderability check matters: a default template saved with an
  // empty spec (`{}`) would otherwise render as a black rectangle
  // with no text — the exact bug operators reported.
  let spec = null;
  try {
    const row = await env.DB.prepare(
      `SELECT spec_json FROM cover_templates WHERE is_default = 1 LIMIT 1`
    ).first();
    if (row?.spec_json) spec = JSON.parse(row.spec_json);
  } catch { /* */ }
  if (!isRenderableSpec(spec)) spec = fallbackCoverSpec();

  const settings = await loadSettings(env).catch(() => ({}));
  const fakePost = post || { slug, title: slug.replace(/-/g, ' '), body_markdown: '', published_at: 0 };
  fakePost.urlPath = kind === 'blog' ? `/blog/${slug}` : `/p/${slug}`;
  const ctx = buildBrandContext({ env, settings, post: fakePost, request, kind });

  // env passed so R2-hosted background/logo assets get base64-inlined
  // (see cover_svg.js). Social card scrapers and any <img src=…>
  // loader of this SVG won't fetch external references otherwise.
  const svg = await renderCoverSvg(spec, ctx, env);

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // OG card lookups go through social-share scrapers that cache
       // aggressively on their own end (Twitter, Slack, FB all
       // cache for hours-to-days regardless of our headers), so a
       // short server-side cache is fine — the practical refresh
       // rate is dominated by the scrapers' own caches.
      'cache-control': 'public, max-age=300, s-maxage=900',
    },
  });
};

// esc is imported only to avoid breaking imports elsewhere if this
// file is referenced as a module; we don't use it directly here
// since renderCoverSvg handles all escaping internally.
void esc;

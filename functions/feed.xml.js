// GET /feed.xml — public RSS 2.0 feed of recent published posts.
//
// Why RSS in 2026? Two reasons:
//   - Aggregators (Feedly, Inoreader, NetNewsWire) still drive real
//     repeat traffic to small content sites.
//   - It's the only widely-adopted way other sites can republish your
//     headlines without scraping. Good for backlink discovery.
//
// Cached 5 min at the edge, 1 min in browsers. Refreshes on every
// publish via the same IndexNow ping cycle.

import { loadSettings } from './_lib/settings.js';
import { esc } from './_lib/util.js';
import { resolveProjectForRequest, resolveProjectBySlug } from './_lib/project_scope.js';

const ITEMS_LIMIT = 30;

function rfc822(epoch) {
  // RSS 2.0 requires RFC-822 dates: "Thu, 06 Jun 2026 12:00:00 GMT"
  return new Date((epoch || 0) * 1000).toUTCString();
}

// Build an absolute URL using the request's own host so the feed works
// on both production and preview hostnames without any config.
function absUrl(request, path) {
  const u = new URL(request.url);
  return u.origin + path;
}

export const onRequestGet = async ({ env, request, params }) => {
  const settings = await loadSettings(env).catch(() => ({}));
  const projectSlug = String(params?.project || '').toLowerCase() || null;
  const basePath = projectSlug ? `/${projectSlug}` : '';
  const project = projectSlug
    ? await resolveProjectBySlug(env, projectSlug).catch(() => null)
    : await resolveProjectForRequest(env, request).catch(() => null);
  if (projectSlug && !project) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  const projectId = project?.id || null;
  const siteUrl = absUrl(request, `${basePath}/`);
  const feedUrl = absUrl(request, `${basePath}/feed.xml`);

  const siteName = project?.site_name || env.SITE_NAME || settings.site_name || 'pages-seo';
  const siteDesc = project?.site_description || env.SITE_DESCRIPTION || settings.site_description ||
                   `Articles from ${siteName}.`;

  const postsSql = projectId
    ? `SELECT slug, title, meta_description, published_at
         FROM blog_posts
        WHERE status = 'published' AND project_id = ?
        ORDER BY published_at DESC LIMIT ?`
    : `SELECT slug, title, meta_description, published_at
         FROM blog_posts
        WHERE status = 'published'
        ORDER BY published_at DESC LIMIT ?`;
  const rows = await (projectId
    ? env.DB.prepare(postsSql).bind(projectId, ITEMS_LIMIT)
    : env.DB.prepare(postsSql).bind(ITEMS_LIMIT)).all().catch(() => ({ results: [] }));
  const posts = rows.results || [];

  // Pubdate of the most recent post (or now if empty) for <lastBuildDate>.
  const lastBuild = posts.length ? rfc822(posts[0].published_at) : new Date().toUTCString();

  const items = posts.map((p) => {
    const url = absUrl(request, `${basePath}/blog/` + p.slug);
    return `    <item>
      <title>${esc(p.title || '')}</title>
      <link>${esc(url)}</link>
      <guid isPermaLink="true">${esc(url)}</guid>
      <description>${esc((p.meta_description || '').slice(0, 500))}</description>
      <pubDate>${rfc822(p.published_at)}</pubDate>
    </item>`;
  }).join('\n');

  // atom:link self-reference is required for feed validators (Atom
  // ext). The <ttl> tells aggregators "5 hours is fine" — we publish
  // at most once a day.
  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(siteName)}</title>
    <link>${esc(siteUrl)}</link>
    <description>${esc(siteDesc)}</description>
    <language>en</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <ttl>300</ttl>
    <atom:link href="${esc(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      // Same cache tier as sitemap.xml — fresh enough for aggregators
      // (which typically poll every 30-60 min) without burning D1
      // reads on bot crawls.
      'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
    },
  });
};

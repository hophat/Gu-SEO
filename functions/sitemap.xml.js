// Dynamic sitemap. Two endpoints:
//   /sitemap.xml         — sitemap index (or a single urlset when small)
//   /sitemap-pages.xml   — every URL with image extensions
//
// For sites under 5k pages the index is mildly silly but harmless;
// at >50k Google requires splitting via a sitemap index, so we always
// emit one as a forward-compatible move.
//
// Image extensions (image:image inside each <url>) let Google index
// the hero image alongside the page. Image Search is a real source
// of organic for blogs.

import { esc } from './_lib/util.js';
import { PAGE_SIZE } from './blog/index.js';
import { resolveProjectByHost, resolveProjectBySlug, requestHost, normalizeHost } from './_lib/project_scope.js';
import { listPillars } from './_lib/hubs.js';

const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const IMAGE_NS   = 'http://www.google.com/schemas/sitemap-image/1.1';

// Google's ceiling: 50,000 URLs / 50MB per sitemap file.
const MAX_URLS = 50000;
// URLs per file in the index. 5k keeps every chunk far under the byte
// limit even when every post carries a hero image, and gives a crawler
// a smaller file to re-fetch when one post is updated.
const CHUNK = 5000;

function isoDay(secOrZero) {
  const ms = (secOrZero || 0) * 1000;
  if (!ms) return new Date().toISOString().slice(0, 10);
  return new Date(ms).toISOString().slice(0, 10);
}

// Sitemap index — points crawlers at the real urlsets. One urlset is
// enough under 5k URLs; past that the index lists one file per CHUNK
// entries so a single oversized archive is never truncated and a crawler
// re-fetching one changed post only re-reads a small file.
function renderIndex(site, lastmod, basePath = '', parts = 1) {
  const chunks = [];
  for (let i = 0; i < Math.max(1, parts); i++) {
    // Part 1 keeps the bare path so the common case is a clean URL; the
    // rest ride ?part=N, which is a legal sitemap <loc> and needs no
    // extra route per chunk.
    const q = i === 0 ? '' : `?part=${i + 1}`;
    chunks.push([
      '  <sitemap>',
      `    <loc>${site}${basePath}/sitemap-pages.xml${q}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      '  </sitemap>',
    ].join('\n'));
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<sitemapindex xmlns="${SITEMAP_NS}">`,
    ...chunks,
    '</sitemapindex>',
  ].join('\n');
}

function renderUrlset(site, entries) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="${SITEMAP_NS}" xmlns:image="${IMAGE_NS}">`,
    ...entries.map((e) => {
      const imgs = (e.images || []).map((img) =>
        `    <image:image>
      <image:loc>${esc(img.loc)}</image:loc>${img.title ? `
      <image:title>${esc(img.title)}</image:title>` : ''}${img.caption ? `
      <image:caption>${esc(img.caption)}</image:caption>` : ''}
    </image:image>`
      ).join('\n');
      return `  <url>
    <loc>${site}${e.path}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
${imgs ? imgs + '\n' : ''}  </url>`;
    }),
    '</urlset>',
  ].join('\n');
}

async function fetchEntries(env, host, project = null, basePath = '') {
  const site = `https://${host}`;
  const projectId = project?.id || null;

  // No LIMIT here. A hard cap silently drops the oldest URLs from the
  // sitemap, and on a 10k-post archive that is half the site: those
  // pages lose their crawl path, their images stop being discovered, and
  // nothing errors. `MAX_URLS` below is the only ceiling, and it sits at
  // Google's own 50k-per-sitemap limit.
  const blogsSql = projectId
    ? `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at
         FROM blog_posts WHERE status='published' AND project_id = ?
         ORDER BY published_at DESC LIMIT ${MAX_URLS}`
    : `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at
         FROM blog_posts WHERE status='published'
         ORDER BY published_at DESC LIMIT ${MAX_URLS}`;
  const blogs = projectId
    ? env.DB.prepare(blogsSql).bind(projectId)
    : env.DB.prepare(blogsSql);

  const progsSql = projectId
    ? `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at
         FROM prog_pages WHERE status='published' AND project_id = ?
         ORDER BY published_at DESC LIMIT ${MAX_URLS}`
    : `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at
         FROM prog_pages WHERE status='published'
         ORDER BY published_at DESC LIMIT ${MAX_URLS}`;
  const progs = projectId
    ? env.DB.prepare(progsSql).bind(projectId)
    : env.DB.prepare(progsSql);

  // Three independent reads sharing nothing but the project filter, so
  // they go out together. Chained, a crawler re-fetching the sitemap paid
  // three serial D1 round-trips before a single <url> was written.
  const [blogsRes, progsRes, pillars] = await Promise.all([
    blogs.all().catch(() => ({ results: [] })),
    progs.all().catch(() => ({ results: [] })),
    listPillars(env, projectId).catch(() => []),
  ]);

  const today = isoDay(0);
  // Project-scoped sitemaps list only /<slug>/blog and its posts; the
  // landing page and /p/ routes exist on the root host only.
  const entries = basePath
    ? [{ path: `${basePath}/blog`, priority: '1.0', changefreq: 'daily', lastmod: today }]
    : [
        { path: '/',     priority: '1.0', changefreq: 'weekly', lastmod: today },
        { path: '/blog', priority: '0.9', changefreq: 'daily',  lastmod: today },
      ];
  // /blog/page/2, /3, … are deliberately NOT listed here. They are
  // self-canonical and reachable through the rel=next/prev chain the
  // archive renders, which is how Google says crawlers should walk a
  // paginated list. Every one of them in the sitemap spends crawl
  // budget on a listing page instead of the posts it links to.

  for (const p of (blogsRes.results || [])) {
    const images = p.hero_image_key ? [{
      loc: `${site}/image/${p.hero_image_key}`,
      title: p.title,
      caption: p.hero_image_alt || p.meta_description || '',
    }] : [];
    entries.push({
      path: `${basePath}/blog/${p.slug}`,
      priority: '0.7', changefreq: 'monthly',
      lastmod: isoDay(p.published_at),
      images,
    });
  }
  for (const p of (progsRes.results || [])) {
    const images = p.hero_image_key ? [{
      loc: `${site}/image/${p.hero_image_key}`,
      title: p.title,
      caption: p.hero_image_alt || p.meta_description || '',
    }] : [];
    entries.push({
      path: `${basePath}/p/${p.slug}`,
      priority: '0.6', changefreq: 'monthly',
      lastmod: isoDay(p.published_at),
      images,
    });
  }
  // Cluster hubs. There is one per distinct topic_seed, so this stays
  // small, and they outrank the posts they list: a hub is the only link
  // from the archive into a cluster, so a crawler that never sees it
  // never walks the spine. `pillars` was fetched with the rest above.
  entries.push({ path: `${basePath}/hubs`, priority: '0.8', changefreq: 'weekly', lastmod: today });
  for (const pl of pillars) {
    entries.push({ path: `${basePath}/hubs/${pl.slug}`, priority: '0.8', changefreq: 'weekly', lastmod: today });
  }
  return entries;
}

export const onRequestGet = async ({ env, request, params }) => {
  const host = requestHost(request);
  const projectSlug = String(params?.project || '').toLowerCase() || null;
  let project = null;
  if (projectSlug) {
    project = await resolveProjectBySlug(env, projectSlug).catch(() => null);
    if (!project) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  } else {
    project = await resolveProjectByHost(env, host).catch(() => null);
  }
  const customHost = project?.custom_domain ? normalizeHost(project.custom_domain) : null;
  const effectiveHost = customHost || host;
  const effectiveBasePath = customHost ? '' : (projectSlug ? `/${projectSlug}` : '');
  // How many urlsets to advertise. Only counts are needed here, so the
  // index stays cheap even when the urlset itself renders 15k entries.
  const totalBlogsSql = project?.id
    ? "SELECT COUNT(*) AS n FROM blog_posts WHERE status='published' AND project_id = ?"
    : "SELECT COUNT(*) AS n FROM blog_posts WHERE status='published'";
  const totalProgsSql = project?.id
    ? "SELECT COUNT(*) AS n FROM prog_pages WHERE status='published' AND project_id = ?"
    : "SELECT COUNT(*) AS n FROM prog_pages WHERE status='published'";
  const [blogsCount, progsCount, pillars] = await Promise.all([
    (project?.id ? env.DB.prepare(totalBlogsSql).bind(project.id) : env.DB.prepare(totalBlogsSql))
      .first().catch(() => ({ n: 0 })),
    (project?.id ? env.DB.prepare(totalProgsSql).bind(project.id) : env.DB.prepare(totalProgsSql))
      .first().catch(() => ({ n: 0 })),
    listPillars(env, project?.id || null).catch(() => []),
  ]);
  const archivePages = Math.max(1, Math.ceil((blogsCount?.n || 0) / PAGE_SIZE));
  // Home + /blog + every archive page + /hubs + one per cluster.
  const entryCount = (effectiveBasePath ? 1 : 2) + archivePages
    + (blogsCount?.n || 0) + (progsCount?.n || 0) + 1 + (pillars || []).length;
  const body = renderIndex(`https://${effectiveHost}`, isoDay(0), effectiveBasePath,
    Math.max(1, Math.ceil(entryCount / CHUNK)));
  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};

// Exported for /sitemap-pages.xml.js to reuse.
export async function pagesUrlset({ env, request, projectSlug = null, basePath = '', part = 1 }) {
  const host = requestHost(request);
  let project = null;
  if (projectSlug) {
    project = await resolveProjectBySlug(env, projectSlug).catch(() => null);
    if (!project) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  } else {
    project = await resolveProjectByHost(env, host).catch(() => null);
  }
  const customHost = project?.custom_domain ? normalizeHost(project.custom_domain) : null;
  const effectiveHost = customHost || host;
  const effectiveBasePath = customHost ? '' : (basePath || (projectSlug ? `/${projectSlug}` : ''));
  const all = await fetchEntries(env, effectiveHost, project, effectiveBasePath);
  // One slice per advertised <sitemap>. A part past the end renders
  // empty rather than 404 so a stale index never breaks the crawl.
  const n = Math.max(1, parseInt(part, 10) || 1);
  const entries = all.slice((n - 1) * CHUNK, n * CHUNK);
  const body = renderUrlset(`https://${effectiveHost}`, entries);
  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}

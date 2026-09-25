// /hubs — every topic_seed cluster with its size, largest first.
//
// The entry point of the hub-and-spoke structure. One link from /blog
// and one from every hub gets a crawler to this page; from here every
// entry in the archive is at most two hops away.

import { esc, edgeCached } from '../_lib/util.js';
import { loadSettings } from '../_lib/settings.js';
import { themeStyle } from '../_lib/page_render.js';
import { resolveProjectForRequest, resolveProjectBySlug, normalizeHost } from '../_lib/project_scope.js';
import { listPillars } from '../_lib/hubs.js';

export async function renderHubIndex({ env, request, projectSlug = null, basePath = '' }) {
  const host = new URL(request.url).hostname;
  const baseUrl = `https://${host}`;

  const [project, settings] = await Promise.all([
    projectSlug
      ? resolveProjectBySlug(env, projectSlug).catch(() => null)
      : resolveProjectForRequest(env, request).catch(() => null),
    loadSettings(env).catch(() => ({})),
  ]);
  if (projectSlug && !project) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  const projectId = project?.id || null;
  const bp = basePath || (projectSlug ? `/${projectSlug}` : '');

  const pillars = await listPillars(env, projectId);

  const homeHost = (() => { try { return new URL(project?.website_url || '').hostname; } catch { return ''; } })();
  const isGulagi = !project || !homeHost || /(^|\.)gulagi\.com$/.test(homeHost);
  const homeUrl = project?.website_url || 'https://gulagi.com';
  const siteName = project?.site_name || env.SITE_NAME || settings.site_name || 'Gulagi';
  const siteDesc = project?.site_description || env.SITE_DESCRIPTION || settings.site_description ||
                   `Bài viết và giải pháp phát triển kinh doanh từ ${siteName}.`;

  const customHost = project?.custom_domain ? normalizeHost(project.custom_domain) : null;
  const effectiveBaseUrl = customHost ? `https://${customHost}` : baseUrl;
  const effectiveBp = customHost ? '' : bp;
  const canonical = `${effectiveBaseUrl}${effectiveBp}/hubs`;
  const totalPosts = pillars.reduce((n, p) => n + (p.count || 0), 0);

  const titleStr = `Chủ đề · ${siteName}`;
  const descStr = `${pillars.length} chủ đề · ${totalPosts} bài viết`;

  const ldJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: 'Chủ đề',
        description: descStr,
        url: canonical,
        inLanguage: 'vi',
      },
      {
        '@type': 'ItemList',
        name: 'Chủ đề',
        numberOfItems: pillars.length,
        itemListElement: pillars.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${effectiveBaseUrl}${effectiveBp}/hubs/${p.slug}`,
          name: p.label,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${effectiveBaseUrl}${effectiveBp}/` },
          { '@type': 'ListItem', position: 2, name: 'Chủ đề' },
        ],
      },
    ],
  });

  const gv = String(settings?.google_site_verification || '').trim();
  const bv = String(settings?.bing_site_verification   || '').trim();
  const verifyMetas = [
    gv ? `<meta name="google-site-verification" content="${esc(gv)}" />` : '',
    bv ? `<meta name="msvalidate.01" content="${esc(bv)}" />` : '',
  ].filter(Boolean).join('\n');

  const items = pillars.map((p) => `
    <li>
      <a href="${bp}/hubs/${esc(p.slug)}">${esc(p.label)}</a>
      <span class="hub-count">${p.count}</span>
    </li>`).join('');

  const body = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(titleStr)}</title>
<meta name="description" content="${esc(descStr)}" />
<link rel="canonical" href="${canonical}" />
${verifyMetas}
<meta name="robots" content="index,follow" />
<meta property="og:title" content="${esc(titleStr)}" />
<meta property="og:description" content="${esc(descStr)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary" />
<link rel="preload" href="/_fonts/inter-400.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/_fonts/instrument-serif-400.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="/style.css" />
${themeStyle(project?.theme_color)}
<script type="application/ld+json">${ldJson}</script>
</head>
<body>
<header class="site-header${project?.theme_color ? ' is-themed' : ''}">
  <div class="header-inner">
    <a class="header-brand" href="${esc(homeUrl)}">
      ${project?.logo_url
        ? `<img class="header-logo-img" src="${esc(project.logo_url)}" alt="${esc(siteName)}" height="28" /><span class="header-logo">${esc(siteName)}</span>`
        : `<span class="header-logo">${esc(siteName)}</span>`}
    </a>
    <nav class="header-nav">
      <a href="${esc(homeUrl)}">Trang chủ</a>
      <a href="${bp}/blog">Blog</a>
      <a href="${bp}/hubs" class="active">Chủ đề</a>
      ${isGulagi ? `<a href="${esc(homeUrl)}" class="header-cta">Tạo website ngay</a>` : ''}
    </nav>
  </div>
</header>
<main class="blog-index hub-page">
  <header class="blog-index-head">
    <div>
      <h1>Chủ đề</h1>
      <p class="lede">${esc(descStr)}</p>
    </div>
  </header>
  ${pillars.length
    ? `<ul id="hub-list">${items}</ul>`
    : '<p class="lede">Chủ đề sẽ xuất hiện khi có bài viết.</p>'}
</main>
<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <strong>${esc(siteName)}</strong> — ${esc(siteDesc)}
    </div>
    <div class="footer-links">
      <a href="${esc(homeUrl)}">Trang chủ</a>
      <a href="${bp}/blog">Blog</a>
      <a href="${bp}/hubs">Chủ đề</a>
      <a href="${bp}/tools/seo-check">Công cụ</a>
      <a href="${bp}/feed.xml">RSS</a>
    </div>
    <div class="footer-copy">© ${new Date().getFullYear()} ${esc(siteName)}. Bảo lưu mọi quyền.</div>
  </div>
</footer>
</body>
</html>`;

  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=3600',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
}

export function renderHubIndexCached(ctx) {
  const project = String(ctx.params?.project || '').toLowerCase();
  return edgeCached(ctx.request, ctx.waitUntil, () =>
    renderHubIndex({
      env: ctx.env,
      request: ctx.request,
      projectSlug: project || null,
      basePath: project ? `/${project}` : '',
    }));
}

export const onRequestGet = (ctx) => renderHubIndexCached(ctx);

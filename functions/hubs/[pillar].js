// /hubs/<pillar> — the index page for one topic_seed cluster.
//
// This is the spine of the hub-and-spoke structure: the hub links down to
// every entry in the cluster, and each entry links back up to its hub
// (see page_render.js). Both directions are real <a href> links, so a
// crawler can reach any entry from any other in two hops regardless of
// how many pages the archive holds.

import { esc, edgeCached } from '../_lib/util.js';
import { loadSettings } from '../_lib/settings.js';
import { themeStyle } from '../_lib/page_render.js';
import { resolveProjectForRequest, resolveProjectBySlug, normalizeHost } from '../_lib/project_scope.js';
import { PAGE_SIZE } from '../blog/index.js';
import { listPillars, resolvePillar, loadHubEntries } from '../_lib/hubs.js';

const isVi = true;

function viDate(sec) {
  return new Date((sec || 0) * 1000).toLocaleDateString('vi-VN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export async function renderPillarPage({ env, request, pillarSlug, page = 1, projectSlug = null, basePath = '' }) {
  const host = new URL(request.url).hostname;
  const baseUrl = `https://${host}`;
  page = Math.max(1, parseInt(page, 10) || 1);
  const wanted = String(pillarSlug || '').toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(wanted)) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }

  const [project, settings] = await Promise.all([
    projectSlug
      ? resolveProjectBySlug(env, projectSlug).catch(() => null)
      : resolveProjectForRequest(env, request).catch(() => null),
    loadSettings(env).catch(() => ({})),
  ]);
  if (projectSlug && !project) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  const projectId = project?.id || null;
  const bp = basePath || (projectSlug ? `/${projectSlug}` : '');

  // Resolve the slug before the COUNT/rows pair: an unknown pillar has
  // no entries and must 404, not render an empty page that Google will
  // happily index as a thin duplicate.
  const pillar = await resolvePillar(env, wanted, projectId);
  if (!pillar) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });

  const totalPages = Math.max(1, Math.ceil((pillar.count || 0) / PAGE_SIZE));
  if (page > totalPages && page > 1) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
  const entries = await loadHubEntries(env, pillar, {
    limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, projectId,
  });

  const homeHost = (() => { try { return new URL(project?.website_url || '').hostname; } catch { return ''; } })();
  const isGulagi = !project || !homeHost || /(^|\.)gulagi\.com$/.test(homeHost);
  const homeUrl = project?.website_url || 'https://gulagi.com';
  const siteName = project?.site_name || env.SITE_NAME || settings.site_name || 'Gulagi';
  const siteDesc = project?.site_description || env.SITE_DESCRIPTION || settings.site_description ||
                   `Bài viết và giải pháp phát triển kinh doanh từ ${siteName}.`;
  const customHost = project?.custom_domain ? normalizeHost(project.custom_domain) : null;
  const effectiveBaseUrl = customHost ? `https://${customHost}` : baseUrl;
  const effectiveBp = customHost ? '' : bp;
  const hubPath = `${bp}/hubs/${pillar.slug}`;

  const titleStr = page === 1
    ? `${pillar.label} · ${siteName}`
    : `${pillar.label} — Trang ${page} · ${siteName}`;
  const descStr = `${pillar.count} bài viết về ${pillar.label.toLowerCase()}`;
  const canonical = page === 1
    ? `${effectiveBaseUrl}${effectiveBp}/hubs/${pillar.slug}`
    : `${effectiveBaseUrl}${effectiveBp}/hubs/${pillar.slug}?page=${page}`;
  const prevHref = page > 1 ? (page === 2 ? hubPath : `${hubPath}?page=${page - 1}`) : null;
  const nextHref = page < totalPages ? `${hubPath}?page=${page + 1}` : null;
  const relLinks = [
    prevHref ? `<link rel="prev" href="${prevHref}" />` : '',
    nextHref ? `<link rel="next" href="${nextHref}" />` : '',
  ].filter(Boolean).join('\n');

  // ItemList positions are 1-based and must be continuous across the
  // paginated sequence, so offset carries in.
  const ldJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: pillar.label,
        description: descStr,
        url: canonical,
        inLanguage: 'vi',
      },
      {
        '@type': 'ItemList',
        name: pillar.label,
        numberOfItems: pillar.count,
        itemListElement: entries.map((e, i) => ({
          '@type': 'ListItem',
          position: (page - 1) * PAGE_SIZE + i + 1,
          url: `${effectiveBaseUrl}${effectiveBp}/blog/${e.slug}`,
          name: e.title,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${effectiveBaseUrl}${effectiveBp}/` },
          { '@type': 'ListItem', position: 2, name: 'Chủ đề', item: `${effectiveBaseUrl}${effectiveBp}/hubs` },
          { '@type': 'ListItem', position: 3, name: pillar.label },
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

  // Other clusters, so a visitor (and a crawler) can walk the spine
  // sideways instead of back to /blog on every hop.
  const siblings = (await listPillars(env, projectId))
    .filter((p) => p.slug !== pillar.slug)
    .slice(0, 12);

  const items = entries.map((e, i) => {
 // No hero in R2: /cover/<slug>.svg only renders when the site has a
    // default cover template, and 404s without one. The OG card always
    // renders, which is the same fallback the post hero already uses.
    const imgSrc = e.hero_image_key ? `/image/${esc(e.hero_image_key)}` : `/og/${esc(e.slug)}.svg`;
    const loadAttrs = i === 0
      ? 'fetchpriority="high" decoding="async"'
      : 'loading="lazy" decoding="async"';
    return `
      <li>
        <img src="${imgSrc}" alt="${esc(e.hero_image_alt || e.title)}" width="640" height="336" ${loadAttrs} />
        <div class="blog-meta">
          <div class="blog-date">${esc(viDate(e.published_at))}</div>
          <h2><a href="${bp}/blog/${esc(e.slug)}">${esc(e.title)}</a></h2>
          <p>${esc((e.meta_description || '').slice(0, 200))}</p>
        </div>
      </li>`;
  }).join('');

  const windowSize = 3;
  const pagerLinks = [];
  for (let i = Math.max(1, page - windowSize); i <= Math.min(totalPages, page + windowSize); i++) {
    const href = i === 1 ? hubPath : `${hubPath}?page=${i}`;
    const aria = i === page ? ' aria-current="page"' : '';
    const cls = i === page ? 'pager-num pager-current' : 'pager-num';
    pagerLinks.push(`<a class="${cls}" href="${href}"${aria}>${i}</a>`);
  }
  const pagerHTML = totalPages > 1 ? `
<nav class="pager" aria-label="Phân trang chủ đề">
  ${prevHref ? `<a class="pager-prev" rel="prev" href="${prevHref}">← Trang trước</a>` : ''}
  <span class="pager-nums">${pagerLinks.join(' ')}</span>
  ${nextHref ? `<a class="pager-next" rel="next" href="${nextHref}">Trang sau →</a>` : ''}
  <span class="pager-pos">Trang ${page} trên ${totalPages} · ${pillar.count} bài viết</span>
</nav>` : '';

  const siblingsHTML = siblings.length ? `
<nav class="hub-siblings" aria-label="Chủ đề khác">
  <h2>Chủ đề khác</h2>
  <ul>
    ${siblings.map((p) => `<li><a href="${bp}/hubs/${esc(p.slug)}">${esc(p.label)}</a> <span class="hub-count">${p.count}</span></li>`).join('\n    ')}
  </ul>
</nav>` : '';

  const body = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(titleStr)}</title>
<meta name="description" content="${esc(descStr)}" />
<link rel="canonical" href="${canonical}" />
${relLinks}
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
      <nav class="hub-crumb" aria-label="Breadcrumb">
        <a href="${bp}/hubs">Chủ đề</a> <span aria-hidden="true">/</span> <span>${esc(pillar.label)}</span>
      </nav>
      <h1>${esc(pillar.label)}</h1>
      <p class="lede">${esc(descStr)}</p>
    </div>
  </header>
  ${entries.length ? `<ul id="blog-list">${items}</ul>` : '<p class="lede">Chưa có bài viết trong chủ đề này.</p>'}
  ${pagerHTML}
  ${siblingsHTML}
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

export function renderPillarCached(ctx, pillarSlug) {
  const url = new URL(ctx.request.url);
  return edgeCached(ctx.request, ctx.waitUntil, () =>
    renderPillarPage({
      env: ctx.env,
      request: ctx.request,
      pillarSlug,
      page: url.searchParams.get('page') || 1,
      projectSlug: String(ctx.params?.project || '').toLowerCase() || null,
      basePath: String(ctx.params?.project || '') ? `/${String(ctx.params.project).toLowerCase()}` : '',
    }));
}

export const onRequestGet = (ctx) => renderPillarCached(ctx, ctx.params?.pillar);

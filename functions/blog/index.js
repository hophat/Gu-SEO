// /blog and /blog/page/N — index of published posts, paginated.
//
// Why pagination matters here: when we passed 100 published posts
// older entries silently fell off /blog. They were still in the
// sitemap so Google might rediscover them, but the loss of internal
// links to /blog/<old-slug> hurts both crawl budget and the page's
// authority. With pagination every post stays one hop from the
// archive entrypoint and rel=prev/next gives Google the topology
// hint to walk the sequence as a series.

import { esc, edgeCached, imageUrl } from '../_lib/util.js';
import { loadSettings } from '../_lib/settings.js';
import { themeStyle } from '../_lib/page_render.js';
import { resolveProjectForRequest, resolveProjectBySlug, normalizeHost, projectLocale } from '../_lib/project_scope.js';
import { listPillars, pillarLabel } from '../_lib/hubs.js';

// Page size for /blog and /blog/page/N. Matches the embed widget's
// default so the SERP archive feels the same as the embed.
// Sitemap.xml.js shares the constant via a re-import below.
export const PAGE_SIZE = 10;

// The live render — reached only on an edge-cache miss. Public, identical
// for every visitor, so every entry point below is free to store the result.
export async function renderBlogIndex({ env, request, page = 1, projectSlug = null, basePath = '' }) {
  const host = new URL(request.url).hostname;
  const baseUrl = `https://${host}`;
  page = Math.max(1, parseInt(page, 10) || 1);

  // Two waves instead of four serial D1 round-trips. Project resolution and
  // the settings row are independent of each other, and the COUNT and the
  // page rows are independent too — the range check below only decides
  // whether to render, it never changes the SQL.
  const [project, settings] = await Promise.all([
    projectSlug
      ? resolveProjectBySlug(env, projectSlug).catch(() => null)
      : resolveProjectForRequest(env, request).catch(() => null),
    loadSettings(env).catch(() => ({})),
  ]);
  if (projectSlug && !project) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  const projectId = project?.id || null;
  const bp = basePath || (projectSlug ? `/${projectSlug}` : '');

  // Total + this-page rows in two queries. COUNT is cheap on D1
  // when filtered by an indexed column (status). Both queries share
  // the same project filter so pagination stays consistent.
  const offset = (page - 1) * PAGE_SIZE;
  const totalSql = projectId
    ? `SELECT COUNT(*) AS n FROM blog_posts WHERE status='published' AND project_id = ?`
    : `SELECT COUNT(*) AS n FROM blog_posts WHERE status='published'`;
  // topic_seed joins the entry to its cluster (the topic label under
  // each title) and body_markdown is only here to derive a read time.
  // Both are needed to render the row, so they ride along with the
  // row the page already fetches rather than costing a second query.
  const pageSql = projectId
    ? `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at,
              topic_seed, LENGTH(body_markdown) AS body_len
       FROM blog_posts WHERE status='published' AND project_id = ?
       ORDER BY published_at DESC LIMIT ? OFFSET ?`
    : `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at,
              topic_seed, LENGTH(body_markdown) AS body_len
       FROM blog_posts WHERE status='published'
       ORDER BY published_at DESC LIMIT ? OFFSET ?`;
  // Three independent reads in one wave: the total, this page of posts,
  // and the pillar list that feeds the hub rail. The rail is what gives
  // /blog a spine — without it every entry is one hop from the archive
  // and nothing links to the cluster pages.
  const [totalRow, r, pillars] = await Promise.all([
    (projectId
      ? env.DB.prepare(totalSql).bind(projectId)
      : env.DB.prepare(totalSql)).first().catch(() => ({ n: 0 })),
    (projectId
      ? env.DB.prepare(pageSql).bind(projectId, PAGE_SIZE, offset)
      : env.DB.prepare(pageSql).bind(PAGE_SIZE, offset)).all(),
    listPillars(env, projectId).catch(() => []),
  ]);
  const total = totalRow?.n || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Out-of-range pages → 404 so we don't waste indexing on empty
  // archives.
  if (page > totalPages && page !== 1) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  }
  const posts = r.results || [];

  const isVi = true;
  const locale = projectLocale(project?.language);
  const homeHost = (() => { try { return new URL(project?.website_url || '').hostname; } catch { return ''; } })();
  const isGulagi = !project || !homeHost || /(^|\.)gulagi\.com$/.test(homeHost);
  const homeUrl = project?.website_url || 'https://gulagi.com';
  const siteName = project?.site_name || env.SITE_NAME || settings.site_name || 'Gulagi';
  const siteDesc = project?.site_description || env.SITE_DESCRIPTION || settings.site_description ||
                   (isVi ? `Bài viết và giải pháp phát triển kinh doanh từ ${siteName}.` : `Articles from ${siteName}.`);

  // Pillar slug -> label, so an entry can name its own topic. The rail
  // gives us the list; this turns the seed on the row into the same slug
  // the /hubs link would use. The collision suffix in pillarSlug() is
  // positional, so only listPillars() output is authoritative — matching
  // on the raw seed finds the un-suffixed entry, which is correct
  // whenever the seeds are distinct (the overwhelmingly common case)
  // and degrades to no link rather than a wrong one when they collide.
  const pillarBySeed = new Map((pillars || []).map((pl) => [pl.seed, pl]));
  const topicFor = (p) => {
    if (!p.topic_seed) return null;
    const pl = pillarBySeed.get(p.topic_seed);
    return pl ? { label: pl.label, slug: pl.slug } : { label: pillarLabel(p.topic_seed), slug: null };
  };

  const fmtDate = (ts) => new Date((ts || 0) * 1000).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  // Vietnamese averages ~1.8 words/chars shorter than the English 200
  // wpm used on the post page, so the same rate overestimates here and
  // the index ends up claiming 6 minutes for a 3-minute read.
  const readMin = (len) => Math.max(1, Math.round((Number(len) || 0) / 1000));

  const imgFor = (p, eager) => {
    // Prefer the stored R2 hero image. /cover/<slug>.svg only renders
    // when the site has a default cover template and 404s without one,
    // so a card with no hero falls back to the OG renderer, which always
    // paints.
    const src = p.hero_image_key
      ? imageUrl(`/image/card/${esc(p.hero_image_key)}`)
      : `/og/${esc(p.slug)}.svg`;
    // The lead is the LCP candidate — load it eagerly at high priority;
    // everything below the fold stays lazy.
    const load = eager
      ? 'fetchpriority="high" decoding="async"'
      : 'loading="lazy" decoding="async"';
    // 1200x630 is what both the OG renderer and the R2 card variant
    // emit. Declaring the true intrinsic size keeps the CSS aspect-ratio
    // box and the pre-layout box in agreement, so a slow image does not
    // shove the list down the page.
    return `<img src="${src}" alt="${esc(p.hero_image_alt || p.title)}" width="1200" height="630" ${load} />`;
  };

  const topicHTML = (p) => {
    const t = topicFor(p);
    if (!t) return '';
    return t.slug
      ? `<a class="entry-topic" href="${bp}/hubs/${esc(t.slug)}">${esc(t.label)}</a>`
      : `<span class="entry-topic">${esc(t.label)}</span>`;
  };

  // The newest post is the reason anyone landed on this page, so it gets
  // the front. Everything after it is a lookup row: numbered, ruled, and
  // one size down from the lead. Numbers continue from the lead so the
  // whole page reads as a single sequence rather than two lists.
  const [lead, ...rest] = posts;

  const leadHTML = lead ? `
<article class="lead-story">
  <div class="lead-body">
    <div class="lead-kicker">${isVi ? 'Mới nhất' : 'Latest'}</div>
    <h2><a href="${bp}/blog/${esc(lead.slug)}">${esc(lead.title)}</a></h2>
    <p>${esc((lead.meta_description || '').slice(0, 220))}</p>
    <div class="entry-facts">
      <span>${esc(fmtDate(lead.published_at))}</span>
      <span class="fact-sep">·</span>
      <span>${readMin(lead.body_len)} ${isVi ? 'phút đọc' : 'min read'}</span>
      ${topicHTML(lead)}
    </div>
  </div>
  <a class="lead-figure" href="${bp}/blog/${esc(lead.slug)}" tabindex="-1" aria-hidden="true">
    ${imgFor(lead, true)}
  </a>
</article>` : '';

  const entryHTML = rest.map((p, i) => `
      <li class="entry">
        <div class="entry-num">${String(offset + i + 2).padStart(2, '0')}</div>
        <figure class="entry-figure">
          <a href="${bp}/blog/${esc(p.slug)}" tabindex="-1" aria-hidden="true">${imgFor(p, false)}</a>
        </figure>
        <div class="entry-body">
          <h3 class="entry-title"><a class="entry-link" href="${bp}/blog/${esc(p.slug)}">${esc(p.title)}</a></h3>
          <p class="entry-excerpt">${esc((p.meta_description || '').slice(0, 180))}</p>
        </div>
        <div class="entry-facts">
          <span>${esc(fmtDate(p.published_at))}</span>
          <span class="fact-sep">·</span>
          <span>${readMin(p.body_len)} ${isVi ? "ph" : "min"}</span>
        </div>
      </li>`).join('');

  // Topic index. This is the hub-and-spoke spine the rail used to be,
  // but as an index rather than a row of pills: a name, a bar scaled to
  // the cluster's size, and a count. The bar lets a reader see the shape
  // of the archive before committing to a click. Capped at eight so the
  // archive still reads as an archive — a wall of cluster links above the
  // post list is just a second sitemap on screen.
  const railPillars = (pillars || []).slice(0, 8);
  const maxCount = railPillars.reduce((m, pl) => Math.max(m, pl.count), 1);
  const railHTML = railPillars.length ? `
<section class="topic-index" aria-labelledby="topic-index-title">
  <h2 id="topic-index-title">${isVi ? 'Chủ đề' : 'Topics'}</h2>
  <ul class="topic-list">
    ${railPillars.map((pl) => {
      const pct = Math.max(6, Math.round((pl.count / maxCount) * 100));
      return `<li><a href="${bp}/hubs/${esc(pl.slug)}">
      <span class="topic-label">${esc(pl.label)}</span>
      <span class="topic-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
      <span class="topic-count">${pl.count}</span>
    </a></li>`;
    }).join('\n    ')}
  </ul>
  <a class="topic-more" href="${bp}/hubs">${isVi ? 'Toàn bộ chủ đề' : 'All topics'} →</a>
</section>` : '';

  const customHost = project?.custom_domain ? normalizeHost(project.custom_domain) : null;
  const effectiveBaseUrl = customHost ? `https://${customHost}` : baseUrl;
  const effectiveBp = customHost ? '' : bp;

  const canonical = page === 1 ? `${effectiveBaseUrl}${effectiveBp}/blog` : `${effectiveBaseUrl}${effectiveBp}/blog/page/${page}`;

  // rel=prev / rel=next — Google deprecated using these for indexing
  // in 2019 but still uses them as hints, and Bing + Yandex use them
  // actively. Cheap to emit, no downside.
  const prevHref = page === 2 ? `${bp}/blog` : (page > 2 ? `${bp}/blog/page/${page - 1}` : null);
  const nextHref = page < totalPages ? `${bp}/blog/page/${page + 1}` : null;
  const relLinks = [
    prevHref ? `<link rel="prev" href="${prevHref}" />` : '',
    nextHref ? `<link rel="next" href="${nextHref}" />` : '',
  ].filter(Boolean).join('');

  // On-page pager — visible to users + crawlable for search engines.
  // Three regions of links: prev / page numbers (windowed to ±3) / next.
  const windowSize = 3;
  const pageNums = [];
  for (let i = Math.max(1, page - windowSize); i <= Math.min(totalPages, page + windowSize); i++) {
    pageNums.push(i);
  }
  const pagerLinks = pageNums.map((i) => {
    const href = i === 1 ? `${bp}/blog` : `${bp}/blog/page/${i}`;
    const aria = i === page ? ' aria-current="page"' : '';
    const cls = i === page ? 'pager-num pager-current' : 'pager-num';
    return `<a class="${cls}" href="${href}"${aria}>${i}</a>`;
  }).join(' ');
  // Pager: when there's more than one page we show the full nav.
  // When there's only one we still emit a small summary ("4 posts")
  // so the page never looks like the list is the whole story — it
  // also gives Google a hint about the collection size.
  const pagerHTML = totalPages > 1 ? `
<nav class="pager" aria-label="Blog pagination">
  ${prevHref ? `<a class="pager-prev" rel="prev" href="${prevHref}">${isVi ? '← Trang trước' : '← Newer'}</a>` : ''}
  <span class="pager-nums">${pagerLinks}</span>
  ${nextHref ? `<a class="pager-next" rel="next" href="${nextHref}">${isVi ? 'Trang sau →' : 'Older →'}</a>` : ''}
  <span class="pager-pos">${isVi ? `Trang ${page} trên ${totalPages} · ${total} bài viết` : `Page ${page} of ${totalPages} · ${total} post${total === 1 ? '' : 's'}`}</span>
</nav>` : (total > 0 ? `
<nav class="pager pager-single" aria-label="Blog pagination">
  <span class="pager-pos">${isVi ? `${total} bài viết` : `${total} post${total === 1 ? '' : 's'}`}</span>
</nav>` : '');

  // Page-specific title hint: page 1 keeps the canonical "Blog ·
  // brand"; later pages append "page N" so the SERP listing
  // disambiguates.
  const titleStr = page === 1
    ? (isVi ? `Blog · ${siteName}` : `Blog · ${siteName}`)
    : (isVi ? `Blog · Trang ${page} · ${siteName}` : `Blog · page ${page} · ${siteName}`);

  // JSON-LD: WebSite with SearchAction. The archive page is the
  // canonical "site search entry point" for the SERP Sitelinks
  // Searchbox feature.
  const ldJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${effectiveBaseUrl}/#website`,
        url: effectiveBaseUrl, name: siteName, description: siteDesc,
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${effectiveBaseUrl}${effectiveBp}/blog?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#page`,
        url: canonical, name: titleStr,
        isPartOf: { '@id': `${effectiveBaseUrl}/#website` },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: posts.map((p, i) => ({
            '@type': 'ListItem',
            position: offset + i + 1,
            url: `${effectiveBaseUrl}${effectiveBp}/blog/${p.slug}`,
            name: p.title,
          })),
        },
      },
    ],
  });

  const gv = String(settings?.google_site_verification || '').trim();
  const bv = String(settings?.bing_site_verification   || '').trim();
  const verifyMetas = [
    gv ? `<meta name="google-site-verification" content="${esc(gv)}" />` : '',
    bv ? `<meta name="msvalidate.01" content="${esc(bv)}" />` : '',
  ].filter(Boolean).join('\n');

  const body = `<!doctype html>
<html lang="${esc(locale.htmlLang)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(titleStr)}</title>
<meta name="description" content="${esc(siteDesc)}" />
<link rel="canonical" href="${canonical}" />
${relLinks}
${verifyMetas}
<link rel="alternate" type="application/rss+xml" title="${esc(siteName)} — RSS feed" href="${effectiveBaseUrl}${effectiveBp}/feed.xml" />
<meta name="robots" content="index,follow" />
<meta property="og:title" content="${esc(titleStr)}" />
<meta property="og:description" content="${esc(siteDesc)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:type" content="website" />
${posts[0] ? `<meta property="og:image" content="${baseUrl}${posts[0].hero_image_key ? imageUrl(`/image/${esc(posts[0].hero_image_key)}`) : `/og/${esc(posts[0].slug)}.svg`}" />` : ''}
<meta name="twitter:card" content="${posts[0] ? 'summary_large_image' : 'summary'}" />
${posts[0] ? `<link rel="preload" as="image" href="${posts[0].hero_image_key ? imageUrl(`/image/card/${esc(posts[0].hero_image_key)}`) : `/og/${esc(posts[0].slug)}.svg`}" fetchpriority="high" />` : ''}
<link rel="stylesheet" href="/style.css" />
${themeStyle(project?.theme_color)}
<script type="application/ld+json">${ldJson}</script>
</head>
<body>
<header class="site-header${project?.theme_color ? ' is-themed' : ''}">
  <div class="header-inner">
    <a class="header-brand" href="${esc(homeUrl)}">
      ${project?.logo_url
        ? `<img class="header-logo-img" src="${esc(imageUrl(project.logo_url))}" alt="${esc(siteName)}" height="28" /><span class="header-logo">${esc(siteName)}</span>`
        : `<span class="header-logo">${esc(siteName)}</span>`}
    </a>
    <nav class="header-nav">
      <a href="${esc(homeUrl)}">Trang chủ</a>
      <a href="${bp}/blog" class="active">Blog</a>
      <a href="${bp}/hubs">Chủ đề</a>
      ${isGulagi ? `<a href="${esc(homeUrl)}" class="header-cta">Tạo website ngay</a>` : ''}
    </nav>
  </div>
</header>
<main class="blog-index">

<header class="masthead">
  <div class="masthead-top">
    <div class="masthead-issue">
      <span>${esc(siteName)}</span>
      ${total > 0 ? `<span>${isVi ? `${total} bài viết` : `${total} post${total === 1 ? '' : 's'}`}</span>` : ''}
    </div>
    <div class="masthead-issue">
      ${totalPages > 1 ? `<span>${isVi ? `Trang ${page} / ${totalPages}` : `Page ${page} / ${totalPages}`}</span>` : ''}
      <span>${new Date().getFullYear()}</span>
    </div>
  </div>
  <h1>${isVi ? 'Bài viết' : 'The Dispatch'}</h1>
  <p class="masthead-lede">${esc(siteDesc)}</p>
  <div class="masthead-tools">
    <!-- Search box. Filters the visible list via /api/widget?q=…
         (same endpoint the embed widget uses), so result ordering
         is consistent across surfaces. Falls back to the canonical
         /blog?q= URL if JavaScript is disabled — Google's
         SearchAction JSON-LD targets that URL too. -->
    <form id="blog-search-form" role="search" action="${bp}/blog" method="GET" class="blog-search">
      <label class="blog-search-label" for="blog-search-input">${isVi ? 'Tìm' : 'Find'}</label>
      <input id="blog-search-input"
             type="search" name="q"
             placeholder="${isVi ? 'Tìm trong các bài đã đăng…' : 'Search published writing…'}"
             autocomplete="off" spellcheck="false"
             aria-label="${isVi ? 'Tìm kiếm bài viết' : 'Search posts'}"
             value="" />
      <button type="submit" class="blog-search-go" aria-label="${isVi ? 'Tìm kiếm' : 'Search'}">→</button>
    </form>
    <a class="masthead-rss" href="${effectiveBaseUrl}${effectiveBp}/feed.xml">RSS ↗</a>
  </div>
</header>

${leadHTML}

${rest.length ? `
<div class="index-head">
  <h2>${isVi ? 'Tất cả bài viết' : 'All entries'}</h2>
  <h2>${isVi ? `Cập nhật lần cuối · ${esc(fmtDate(posts[0].published_at))}` : `Last updated · ${esc(fmtDate(posts[0].published_at))}`}</h2>
</div>
<ul class="blog-list" id="blog-list">${entryHTML}</ul>` : `<ul class="blog-list" id="blog-list" hidden></ul>`}

${!posts.length ? `
<div class="blog-noposts">
  <strong>${isVi ? 'Chưa có bài viết nào' : 'Nothing published yet'}</strong>
  <span>${isVi
    ? `Khi ${esc(siteName)} bắt đầu đăng, các bài mới sẽ xuất hiện ngay tại đây.`
    : `When ${esc(siteName)} starts publishing, new writing lands here.`}</span>
</div>` : ''}

<div id="blog-empty" class="blog-empty" hidden></div>

${railHTML}
${pagerHTML}
</main>

<!-- Inline client-side search. Reads ?q= from the URL on load to
     pre-fill the input (so /blog?q=foo works from a deep link or
     SearchAction). Debounces 200ms; fetches /api/widget for matches
     and re-renders the list inline without leaving the page.

     Defence in depth: the renderer never uses innerHTML on the
     server response. Cards are built via document.createElement and
     textContent so post-supplied strings can't be HTML-injected
     even if the API ever returned tainted data. -->
<script>
(function () {
  var PS_BP = ${JSON.stringify(bp)};
  var PS_PROJECT = ${JSON.stringify(project?.slug || '')};
  var form  = document.getElementById('blog-search-form');
  var input = document.getElementById('blog-search-input');
  var list  = document.getElementById('blog-list');
  var empty = document.getElementById('blog-empty');
  var pager = document.querySelector('main.blog-index .pager');
  var lead  = document.querySelector('main.blog-index .lead-story');
  var indexHead = document.querySelector('main.blog-index .index-head');
  var noposts = document.querySelector('main.blog-index .blog-noposts');
  if (!form || !input || !list) return;

  // Restore q from URL on first paint.
  try {
    var q0 = new URL(location.href).searchParams.get('q') || '';
    if (q0) { input.value = q0; doSearch(q0, false); }
  } catch (e) {}

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    doSearch(input.value.trim(), true);
  });

  // Debounced live filter as the user types.
  var t = null;
  input.addEventListener('input', function () {
    if (t) clearTimeout(t);
    t = setTimeout(function () { doSearch(input.value.trim(), false); }, 200);
  });

  // The empty state is a block of children, not a text node, so it can
  // say what belongs here and point at the way back. textContent alone
  // can only ever say one flat sentence.
  function setEmpty(title, body) {
    if (!title) { empty.hidden = true; empty.textContent = ''; return; }
    empty.textContent = '';
    var h = document.createElement('strong');
    h.textContent = title;
    var s = document.createElement('span');
    s.textContent = body;
    empty.appendChild(h);
    empty.appendChild(s);
    empty.hidden = false;
  }

  function clearList() {
    while (list.firstChild) list.removeChild(list.firstChild);
  }

  // Results render as the same ruled entry rows the server emits, so a
  // search never looks like a different page. No lead story: the first
  // match is a result, not a headline, and promoting it would imply a
  // ranking the backend never computed.
  function buildItem(p, i) {
    var li = document.createElement('li');
    li.className = 'entry';

    var num = document.createElement('div');
    num.className = 'entry-num';
    num.textContent = String(i + 1).padStart(2, '0');
    li.appendChild(num);

    if (p.image) {
      var fig = document.createElement('figure');
      fig.className = 'entry-figure';
      var fa = document.createElement('a');
      fa.href = (PS_BP || '') + '/blog/' + encodeURIComponent(p.slug);
      fa.tabIndex = -1;
      fa.setAttribute('aria-hidden', 'true');
      var img = document.createElement('img');
      img.src = p.image;
      img.alt = p.title || '';
      img.setAttribute('width',  '1200');
      img.setAttribute('height', '630');
      img.loading  = 'lazy';
      img.decoding = 'async';
      fa.appendChild(img);
      fig.appendChild(fa);
      li.appendChild(fig);
    }

    var body = document.createElement('div');
    body.className = 'entry-body';
    var h3 = document.createElement('h3');
    h3.className = 'entry-title';
    var a = document.createElement('a');
    a.className = 'entry-link';
    a.href = (PS_BP || '') + '/blog/' + encodeURIComponent(p.slug);
    a.textContent = p.title || '';
    h3.appendChild(a);
    body.appendChild(h3);
    var ex = document.createElement('p');
    ex.className = 'entry-excerpt';
    ex.textContent = (p.excerpt || '').slice(0, 180);
    body.appendChild(ex);
    li.appendChild(body);

    var facts = document.createElement('div');
    facts.className = 'entry-facts';
    var d = document.createElement('span');
    d.textContent = p.date || '';
    facts.appendChild(d);
    li.appendChild(facts);

    return li;
  }

  function setUrlQ(q) {
    try {
      var u = new URL(location.href);
      if (q) u.searchParams.set('q', q); else u.searchParams.delete('q');
      history.replaceState({}, '', u.pathname + (u.search || '') + (u.hash || ''));
    } catch (e) {}
  }

  function doSearch(q, hardSubmit) {
    setUrlQ(q);
    if (!q) {
      if (hardSubmit) { location.href = (PS_BP || '') + '/blog'; return; }
      fetchPage('', 1);
      return;
    }
    fetchPage(q, 1);
  }

  // A search replaces the whole reading surface, so the editorial
  // furniture that describes the archive — the lead story, the index
  // heading, the topic index, the "nothing published" note — steps
  // aside for the duration rather than sitting above a list of hits
  // it does not describe.
  function setReadingMode(on) {
    if (lead) lead.hidden = on;
    if (indexHead) indexHead.hidden = on;
    if (noposts) noposts.hidden = on;
    var topics = document.querySelector('main.blog-index .topic-index');
    if (topics) topics.hidden = on;
  }

  function fetchPage(q, page) {
    var url = '/api/widget?per_page=10&page=' + page + (q ? '&q=' + encodeURIComponent(q) : '');
    if (PS_PROJECT) url += '&project=' + encodeURIComponent(PS_PROJECT);
    fetch(url, { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (d) {
        clearList();
        list.hidden = false;
        if (!d.posts || !d.posts.length) {
          setReadingMode(true);
          if (q) {
            setEmpty('Không có bài nào khớp', 'Từ khóa "' + q + '" không trả về kết quả nào. Thử một từ ngắn hơn, hoặc xem toàn bộ chủ đề.');
          } else {
            setReadingMode(false);
            setEmpty('');
            if (noposts) noposts.hidden = false;
          }
          if (pager) pager.style.display = 'none';
          return;
        }
        setEmpty('');
        setReadingMode(Boolean(q));
        for (var i = 0; i < d.posts.length; i++) {
          list.appendChild(buildItem(d.posts[i], i));
        }
        // Hide server-rendered pager while in search mode.
        if (pager) pager.style.display = q ? 'none' : '';
      })
      .catch(function () {
        setEmpty('Tìm kiếm không hoạt động', 'Kết nối có vẻ đã gián đoạn. Thử lại, hoặc duyệt toàn bộ danh sách bài viết.');
      });
  }
})();
</script>
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

// Every archive entry point goes through the edge cache: /blog, /blog/page/N
// and the /<project>/blog variants all render the same public listing.
export function renderBlogIndexCached(ctx, opts = {}) {
  return edgeCached(ctx.request, ctx.waitUntil, () =>
    renderBlogIndex({ env: ctx.env, request: ctx.request, page: opts.page ?? 1, projectSlug: opts.projectSlug ?? null, basePath: opts.basePath ?? '' }));
}

export const onRequestGet = (ctx) => renderBlogIndexCached(ctx);

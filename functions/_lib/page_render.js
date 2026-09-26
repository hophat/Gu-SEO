import { renderMarkdown } from './markdown.js';
import { esc, imageUrl, IMAGE_VERSION } from './util.js';
import { normalizeHost, requestHost, projectLocale } from './project_scope.js';

const HERO_W = 1200, HERO_H = 630;
// The hero sits in .post-shell, which is max-width 720px with 24px of
// padding each side — so the image lays out at 672px once the viewport is
// wide enough. Kept as named constants because `sizes` has to agree with
// the CSS or the browser picks the wrong candidate.
const HERO_SHELL_W = 720, HERO_CONTENT_W = HERO_SHELL_W - 48;

function brand(env, project = null) {
  let homeHost = '';
  try { homeHost = new URL(project?.website_url || '').hostname; } catch { /* no website_url */ }
  // The showcase CTAs (maps builder + lead magnet) are Gulagi-specific
  // copy, so only the project that actually owns gulagi.com renders them.
  const isGulagi = !project || !homeHost || /(^|\.)gulagi\.com$/.test(homeHost);
  return {
    name: project?.site_name || env?.SITE_NAME || 'Gulagi',
    description: project?.site_description || env?.SITE_DESCRIPTION || 'Tạo website cho quán từ Google Maps',
    logoUrl: project?.logo_url || env?.SITE_LOGO_URL || null,
    themeColor: project?.theme_color || null,
    homeUrl: project?.website_url || env?.SITE_SIGNUP_URL || 'https://gulagi.com',
    ctaSignupUrl: env?.SITE_SIGNUP_URL || 'https://gulagi.com',
    isGulagi,
  };
}

// Per-project accent. Light and dark brand tints are derived in CSS with
// color-mix so the admin only ever stores one hex value.
export function themeStyle(hex) {
  if (!hex) return '';
  return `<style>:root{--brand:${hex};--brand-light:color-mix(in srgb,${hex} 12%,#fff);--brand-dark:color-mix(in srgb,${hex} 82%,#000);--link:${hex}}</style>`;
}

function jsonLD({ site, post, host, kind, settings, basePath = '', language = 'vi', pillar = null }) {
  const isArticle = kind === 'blog';
  const baseUrl = `https://${host}`;
  const orgId   = `${baseUrl}/#org`;
  const webId   = `${baseUrl}/#website`;
  const pageId  = `${baseUrl}${post.urlPath}#main`;

  const useCover = (settings?.hero_image_mode === 'cover') && settings?._has_default_template;
  const coverV = settings?._default_template_v ? `?v=${settings._default_template_v}` : '';
  const heroAbs = useCover
    ? `${baseUrl}/cover/${encodeURIComponent(post.slug || 'home')}.svg${coverV}`
    : post.hero_image_key
      ? `${baseUrl}/image/${post.hero_image_key}?v=${IMAGE_VERSION}`
      : `${baseUrl}/og/${encodeURIComponent(post.slug || 'home')}.svg`;

  const graph = [
    {
      '@type': 'Organization',
      '@id': orgId,
      name: site.name,
      url: baseUrl,
      ...(site.logoUrl ? { logo: { '@type': 'ImageObject', url: site.logoUrl } } : {}),
    },
    {
      '@type': 'WebSite',
      '@id': webId,
      url: baseUrl,
      name: site.name,
      description: site.description,
      publisher: { '@id': orgId },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${baseUrl}${basePath}/blog?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': isArticle ? 'Article' : 'WebPage',
      '@id': pageId,
      headline: post.title,
      description: post.meta_description,
      url: `${baseUrl}${post.urlPath}`,
      image: { '@type': 'ImageObject', url: heroAbs, width: HERO_W, height: HERO_H },
      datePublished: new Date((post.published_at || 0) * 1000).toISOString(),
      dateModified:  new Date((post.modified_at || post.published_at || 0) * 1000).toISOString(),
      author:    { '@id': orgId },
      publisher: { '@id': orgId },
      isPartOf:  { '@id': webId },
      inLanguage: language,
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${baseUrl}${post.urlPath}` },
    },
    {
      '@type': 'BreadcrumbList',
      // The cluster hub sits between the archive and the post when the
      // post has one — same two-hop topology the visible links describe.
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${baseUrl}${basePath}/` },
        isArticle ? { '@type': 'ListItem', position: 2, name: 'Blog', item: `${baseUrl}${basePath}/blog` } : null,
        isArticle && pillar?.slug
          ? { '@type': 'ListItem', position: 3, name: pillar.label, item: `${baseUrl}${basePath}/hubs/${pillar.slug}` }
          : null,
        { '@type': 'ListItem', position: isArticle && pillar?.slug ? 4 : (isArticle ? 3 : 2), name: post.title },
      ].filter(Boolean),
    },
  ];

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

function extractFAQ(post) {
  const body = post.body_markdown || '';
  const faqs = [];
  const faqRegex = /(?:^|\n)#+\s*(?:FAQ|Câu hỏi thường gặp|Hỏi đáp)[\s\S]*?((?:^- .+\n?)+)/gim;
  let match = faqRegex.exec(body);
  while (match !== null) {
    const lines = match[1].split('\n').filter(l => l.trim().startsWith('-'));
    for (const line of lines) {
      const qa = line.replace(/^-\s*/, '').split(/\?\s*(:|–|-)\s*/);
      if (qa.length >= 2) {
        faqs.push({ question: qa[0].trim() + '?', answer: qa[1].trim() });
      }
    }
    match = faqRegex.exec(body);
  }
  if (faqs.length === 0) {
    const h3Regex = /(?:^|\n)###\s+(.+\?)\s*\n\n((?:(?!^#{2,3}\s)[^\n]+(?:\n|$))+)/gim;
    let h3Match = h3Regex.exec(body);
    while (h3Match !== null) {
      faqs.push({ question: h3Match[1].trim(), answer: h3Match[2].trim().split('\n')[0].trim() });
      h3Match = h3Regex.exec(body);
    }
  }
  return faqs.length > 0 ? [{
    '@type': 'FAQPage',
    mainEntity: faqs.slice(0, 8).map(fa => ({
      '@type': 'Question',
      name: fa.question,
      acceptedAnswer: { '@type': 'Answer', text: fa.answer },
    })),
  }] : [];
}

export function renderContentPage({ env, request, post, kind, related = [], settings = {}, basePath = '', project = null, pillar = null }) {
  const host = new URL(request.url).hostname;
  const site = brand(env, project);
  const locale = projectLocale(project?.language);
  const customHost = project?.custom_domain ? normalizeHost(project.custom_domain) : null;
  const effectiveHost = customHost || requestHost(request) || host;
  const effectiveBasePath = customHost ? '' : basePath;
  const effectiveUrlPath = customHost
    ? (project?.slug ? post.urlPath.replace(new RegExp(`^/${project.slug}`), '') : post.urlPath)
    : post.urlPath;
  const dateStr = new Date((post.published_at || 0) * 1000).toLocaleDateString('vi-VN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const wordCount = (post.body_markdown || '').split(/\s+/).length;
  const readMin = Math.max(1, Math.ceil(wordCount / 200));

  const useCoverEndpoint = (settings?.hero_image_mode === 'cover') && settings?._has_default_template;
  const heroSrc = useCoverEndpoint
    ? `/cover/${esc(post.slug || 'home')}.svg${settings?._default_template_v ? '?v=' + settings._default_template_v : ''}`
    : post.hero_image_key
      ? imageUrl(`/image/${esc(post.hero_image_key)}`)
      : `/og/${esc(post.slug || 'home')}.svg`;
  const heroAlt = esc(post.hero_image_alt || post.title);

  // The hero is the LCP element and it lives in a 720px shell, so a 1x
  // display was downloading a 1200px image for 672px of layout. Offer both
  // and let the browser pick against the real viewport: 700px covers 1x,
  // 1200px covers 2x. Only R2-backed heroes have a second candidate — the
  // /cover and /og fallbacks are rendered at their own size and get none.
  const heroSrcset = (!useCoverEndpoint && post.hero_image_key)
    ? `${imageUrl(`/image/card/${esc(post.hero_image_key)}`)} 700w, ${heroSrc} ${HERO_W}w`
    : '';
  const heroSizes = `(max-width: ${HERO_SHELL_W}px) 100vw, ${HERO_CONTENT_W}px`;
  const heroAttrs = heroSrcset
    ? ` srcset="${heroSrcset}" sizes="${heroSizes}"`
    : '';

  const heroImg = `
<div class="hero-wrap" style="aspect-ratio:${HERO_W}/${HERO_H}">
  <img class="hero" src="${heroSrc}"${heroAttrs} alt="${heroAlt}" width="${HERO_W}" height="${HERO_H}" decoding="async" fetchpriority="high" onload="this.classList.add('is-loaded')" onerror="this.classList.add('is-loaded')" />
</div>`;

  const bodyHTML = renderMarkdown(post.body_markdown)
    .replace(/(href=")\/(blog|p)\//g, `$1${effectiveBasePath}/$2/`);

  const excerpt = (s, n) => {
    const t = String(s || '');
    if (t.length <= n) return t;
    const cut = t.slice(0, n);
    return cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).replace(/[,;:.\s]+$/, '') + '…';
  };

  const relatedHTML = (kind === 'blog' && related.length) ? `
<aside class="read-next">
  <h2 class="read-next-title">Đọc tiếp</h2>
  <ul class="read-next-list">
    ${related.map((r) => {
      // /cover/<slug>.svg 404s unless a default cover template exists;
      // the OG card always renders, like the post hero fallback above.
      const rSrc = r.hero_image_key ? imageUrl(`/image/card/${esc(r.hero_image_key)}`) : `/og/${esc(r.slug)}.svg`;
      return `
      <li>
        <a href="${effectiveBasePath}/blog/${esc(r.slug)}">
          <img src="${rSrc}" alt="${esc(r.hero_image_alt || r.title)}" width="1200" height="630" loading="lazy" decoding="async" />
          <div class="read-next-meta">
            <h3>${esc(r.title)}</h3>
            ${r.meta_description ? `<p>${esc(excerpt(r.meta_description, 140))}</p>` : ''}
          </div>
        </a>
      </li>`;
    }).join('')}
  </ul>
</aside>` : '';

  // The other half of the hub-and-spoke link: the hub page links down
  // to every entry, and this links back up. One direction alone leaves
  // the hub's own authority stranded on the hub.
  const pillarHTML = (kind === 'blog' && pillar?.slug) ? `
<nav class="post-hub" aria-label="Chủ đề">
  <a href="${effectiveBasePath}/hubs/${esc(pillar.slug)}">Thuộc chủ đề: ${esc(pillar.label)}</a>
  ${pillar.count ? `<span class="hub-count">${pillar.count} bài</span>` : ''}
</nav>` : '';

  const gv = String(settings?.google_site_verification || '').trim();
  const bv = String(settings?.bing_site_verification   || '').trim();
  const verifyMetas = [
    gv ? `<meta name="google-site-verification" content="${esc(gv)}" />` : '',
    bv ? `<meta name="msvalidate.01" content="${esc(bv)}" />` : '',
  ].filter(Boolean).join('\n');

  // The preload has to carry the same candidate set as the <img>. A bare
  // href here would fetch the 1200px up front and then the browser would
  // fetch whichever candidate srcset picked — paying for both. imagesrcset
  // is the preload-side spelling of srcset.
  const preloadHero = heroSrcset
    ? `<link rel="preload" as="image" href="${heroSrc}" imagesrcset="${heroSrcset}" imagesizes="${heroSizes}" fetchpriority="high" />`
    : `<link rel="preload" as="image" href="${heroSrc}" fetchpriority="high" />`;

  const faqSchema = extractFAQ(post);
  const ldGraph = jsonLD({ site, post: { ...post, urlPath: effectiveUrlPath }, host: effectiveHost, kind, settings, basePath: effectiveBasePath, language: locale.htmlLang, pillar });
  const ldExtra = faqSchema.length ? `,${faqSchema.map(f => JSON.stringify(f)).join(',')}` : '';
  const ldJson = ldGraph.replace('}', `${ldExtra}}`);

  const shareUrl = `https://${effectiveHost}${effectiveUrlPath}`;
  const shareTitle = encodeURIComponent(post.title);
  const shareUrlEnc = encodeURIComponent(shareUrl);
  const isPreview = post?.status === 'preview';
  const blogSlug = post?.slug || '';
  const blogSlugEsc = JSON.stringify(blogSlug).replace(/</g, '\\u003c');
  const beaconScript = (!isPreview && blogSlug) ? `
  // View beacon
  var viewFired = false;
  if (document.visibilityState === 'visible') {
    viewFired = true;
    try {
      fetch('/api/blog/views' + PS_Q, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blog_slug: blogSlug, project: PS_PROJECT })
      }).catch(function() {});
    } catch (e) {}
  }
  var hideFired = false;
  window.addEventListener('pagehide', function() {
    if (hideFired) return;
    hideFired = true;
    try {
      var readTimeMs = Math.round((window.performance && performance.now) ? performance.now() : 0);
      var payload = JSON.stringify({ blog_slug: blogSlug, project: PS_PROJECT, read_time_ms: readTimeMs });
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/blog/views' + PS_Q, blob);
      } else {
        fetch('/api/blog/views' + PS_Q, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        }).catch(function() {});
      }
    } catch (e) {}
  });` : '';

  // Gulagi keeps its own showcase bio. Every other brand falls back to
  // its own site_name/site_description so no tenant blog renders Gulagi
  // identity in the author box.
  const authorName = site.isGulagi ? 'Đội ngũ Gulagi' : site.name;
  const authorBio  = site.isGulagi
    ? 'Chuyên gia giải pháp số giúp quán cà phê, nhà hàng, cửa hàng bán lẻ chuyển đổi số hiệu quả.'
    : (site.description || `Bài viết từ ${site.name}.`);

  return `<!doctype html>
<html lang="${locale.htmlLang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(post.title)} · ${esc(site.name)}</title>
<meta name="description" content="${esc(post.meta_description)}" />
${post.keywords ? `<meta name="keywords" content="${esc(post.keywords)}" />` : ''}
<link rel="canonical" href="https://${effectiveHost}${effectiveUrlPath}" />
<meta name="robots" content="index,follow,max-image-preview:large" />
<link rel="alternate" type="application/rss+xml" title="${esc(site.name)} — RSS feed" href="https://${effectiveHost}${effectiveBasePath}/feed.xml" />
${verifyMetas}
<meta property="og:type" content="${kind === 'blog' ? 'article' : 'website'}" />
<meta property="og:title" content="${esc(post.title)}" />
<meta property="og:description" content="${esc(post.meta_description)}" />
<meta property="og:url" content="https://${effectiveHost}${effectiveUrlPath}" />
<meta property="og:image" content="https://${effectiveHost}${heroSrc}" />
<meta property="og:image:width" content="${HERO_W}" />
<meta property="og:image:height" content="${HERO_H}" />
<meta property="og:site_name" content="${esc(site.name)}" />
<meta property="og:locale" content="${locale.ogLocale}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(post.title)}" />
<meta name="twitter:description" content="${esc(post.meta_description)}" />
<meta name="twitter:image" content="https://${effectiveHost}${heroSrc}" />
${preloadHero}
<link rel="stylesheet" href="/style.css" />
${themeStyle(site.themeColor)}
<script type="application/ld+json">${ldJson}</script>
</head>
<body>

<header class="site-header${site.themeColor ? ' is-themed' : ''}">
  <div class="header-inner">
    <a class="header-brand" href="${esc(site.homeUrl)}">
      ${site.logoUrl
        ? `<img class="header-logo-img" src="${esc(imageUrl(site.logoUrl))}" alt="${esc(site.name)}" height="28" /><span class="header-logo">${esc(site.name)}</span>`
        : `<span class="header-logo">${esc(site.name)}</span>`}
    </a>
    <nav class="header-nav">
      <a href="${esc(site.homeUrl)}">Trang chủ</a>
      <a href="${effectiveBasePath}/blog" class="active">Blog</a>
      <a href="${effectiveBasePath}/hubs">Chủ đề</a>
      <a href="${effectiveBasePath}/tools/seo-check">Công cụ</a>
      ${site.isGulagi ? `<a href="${esc(site.ctaSignupUrl)}" class="header-cta">Tạo website ngay</a>` : ''}
    </nav>
  </div>
</header>

<main class="post-shell${site.isGulagi ? ' has-sticky-cta' : ''}">
  <nav class="crumb" aria-label="Breadcrumb">
    <a href="${esc(site.homeUrl)}">Trang chủ</a>
    ${kind === 'blog' ? `<span class="crumb-sep">/</span><a href="${effectiveBasePath}/blog">Bài viết</a>` : ''}
    ${pillar?.slug ? `<span class="crumb-sep">/</span><a href="${effectiveBasePath}/hubs/${esc(pillar.slug)}">${esc(pillar.label)}</a>` : ''}
  </nav>

  <article>
  <header class="post-head">
    <h1 class="post-title">${esc(post.title)}</h1>
    ${post.meta_description ? `<p class="post-standfirst">${esc(post.meta_description)}</p>` : ''}
    <div class="post-byline">
      <span class="post-date">${esc(dateStr)}</span>
      <span class="post-sep">·</span>
      <span class="post-read">${readMin} phút đọc</span>
      ${pillar?.slug ? `<span class="post-sep">·</span><a class="post-topic" href="${effectiveBasePath}/hubs/${esc(pillar.slug)}">${esc(pillar.label)}</a>` : ''}
    </div>
  </header>
  ${heroImg}
  <div class="prose">
    ${bodyHTML}
    ${site.isGulagi ? `
    <div class="article-cta">
      <h3>Tạo website cho quán của bạn ngay</h3>
      <p>Chỉ cần dán link Google Maps, Gulagi sẽ tự động tạo website chuyên nghiệp cho quán.</p>
      <div class="mini-builder">
        <form id="mini-builder-form" onsubmit="event.preventDefault();var url=this.querySelector('input').value.trim();if(url){window.location.href='${esc(site.ctaSignupUrl)}/?maps='+encodeURIComponent(url);}">
          <input type="url" aria-label="${'Dán link Google Maps của quán'}" placeholder="Dán link Google Maps của quán..." required class="mini-builder-input" />
          <button type="submit" class="mini-builder-btn">Tạo web ngay →</button>
        </form>
      </div>
      <a href="${esc(site.ctaSignupUrl)}" class="cta-btn" style="margin-top:12px">Bắt đầu miễn phí →</a>
    </div>
    <div class="lead-form-box">
      <h3>Tải cẩm nang tăng đơn</h3>
      <p>Nhận ngay tài liệu hướng dẫn tối ưu Google Maps &amp; tăng doanh thu cho quán.</p>
      <form id="lead-capture-form" class="lead-form">
        <div class="lead-form-fields">
          <input type="text" id="lead-name" name="name" placeholder="Họ và tên" aria-label="Họ và tên" class="lead-input" autocomplete="name" />
          <input type="email" id="lead-email" name="email" placeholder="Email nhận tài liệu" aria-label="Email nhận tài liệu" class="lead-input" autocomplete="email" />
          <input type="tel" id="lead-phone" name="phone" placeholder="Số điện thoại" aria-label="Số điện thoại" class="lead-input" autocomplete="tel" />
        </div>
        <button type="submit" id="lead-submit-btn" class="lead-submit-btn">Nhận cẩm nang miễn phí →</button>
        <div id="lead-form-msg" class="lead-form-msg" role="status" aria-live="polite"></div>
      </form>
    </div>` : ''}
  </div>
  </article>
  <div class="share-bar">
    <span class="share-label" id="share-label">Chia sẻ</span>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrlEnc}" target="_blank" rel="noopener" class="share-btn share-fb" aria-label="Chia sẻ trên Facebook">Facebook</a>
    <a href="https://zalo.me/oa/share?url=${shareUrlEnc}" target="_blank" rel="noopener" class="share-btn share-zalo" aria-label="Chia sẻ qua Zalo">Zalo</a>
    <button class="share-btn share-copy" onclick="navigator.clipboard.writeText('${shareUrl}').then(()=>{this.textContent='Đã sao chép';setTimeout(()=>{this.textContent='Sao chép link'},1800)})">Sao chép link</button>
  </div>
  <div class="feedback-block" id="feedback-block">
    <div class="feedback-title">Bài viết này có hữu ích?</div>
    <div class="feedback-actions" role="group" aria-label="Đánh giá bài viết">
      <button type="button" class="feedback-btn feedback-yes" id="feedback-btn-yes" data-rating="yes">Có, hữu ích</button>
      <button type="button" class="feedback-btn feedback-no" id="feedback-btn-no" data-rating="no">Không</button>
    </div>
    <div class="feedback-comment-wrap">
      <label for="feedback-comment" class="feedback-comment-label">Góp ý thêm (không bắt buộc)</label>
      <input type="text" class="feedback-comment-input" id="feedback-comment" maxlength="500" />
    </div>
    <div class="feedback-msg" id="feedback-msg" role="status" aria-live="polite"></div>
  </div>
  <div class="author-box">
    <div class="author-info">
      <strong>${esc(authorName)}</strong>
      <p>${esc(authorBio)}</p>
    </div>
  </div>
  ${relatedHTML}
  ${pillarHTML}
</main>

${site.isGulagi ? `<div class="sticky-cta" id="sticky-cta">
  <a href="${esc(site.ctaSignupUrl)}" class="sticky-cta-btn">Dán link Google Maps — Tạo web quán 30s</a>
</div>` : ''}

<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      ${site.logoUrl
        ? `<img src="${esc(imageUrl(site.logoUrl))}" alt="${esc(site.name)}" height="24" />`
        : `<strong>${esc(site.name)}</strong>`} — ${esc(site.description)}
    </div>
    <div class="footer-links">
      <a href="${esc(site.homeUrl)}">Trang chủ</a>
      <a href="${effectiveBasePath}/blog">Blog</a>
      <a href="${effectiveBasePath}/feed.xml">RSS</a>
    </div>
    <div class="footer-copy">© ${new Date().getFullYear()} ${esc(site.name)}. Bảo lưu mọi quyền.</div>
  </div>
</footer>

<script>
// The sticky bar is a nudge back to the product. It appears once the
// reader is into the article and retreats at the foot, where the inline
// CTA and the footer link already do the job — a bar competing with its
// own page section is noise.
(function() {
  var cta = document.getElementById('sticky-cta');
  if (!cta) return;
  var ticking = false;
  function update() {
    ticking = false;
    var doc = document.documentElement;
    var past = window.scrollY > 600;
    var atFoot = window.scrollY + window.innerHeight > doc.scrollHeight - 240;
    cta.classList.toggle('visible', past && !atFoot);
  }
  window.addEventListener('scroll', function() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  }, { passive: true });
  update();
})();
(function() {
  var blogSlug = ${blogSlugEsc};
  var PS_BP = ${JSON.stringify(basePath)};
  var PS_PROJECT = PS_BP ? PS_BP.slice(1) : '';
  var PS_Q = PS_PROJECT ? ('?project=' + encodeURIComponent(PS_PROJECT)) : '';
${beaconScript}
  // Feedback widget
  var fbBlock = document.getElementById('feedback-block');
  if (fbBlock) {
    var btnYes = document.getElementById('feedback-btn-yes');
    var btnNo = document.getElementById('feedback-btn-no');
    var commentInput = document.getElementById('feedback-comment');
    var fbMsg = document.getElementById('feedback-msg');
    var fbVoted = false;

    function sendFeedback(rating) {
      if (fbVoted) return;
      fbVoted = true;
      if (btnYes) btnYes.disabled = true;
      if (btnNo) btnNo.disabled = true;
      if (fbMsg) fbMsg.textContent = '';
      var commentVal = commentInput ? commentInput.value.trim().slice(0, 500) : '';

      fetch('/api/blog/feedback' + PS_Q, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blog_slug: blogSlug,
          rating: rating,
          comment: commentVal
        })
      }).then(function(res) {
        if (res.ok) {
          fbBlock.textContent = '';
          var thanksEl = document.createElement('div');
          thanksEl.className = 'feedback-thanks';
          thanksEl.textContent = 'Cảm ơn phản hồi của bạn!';
          fbBlock.appendChild(thanksEl);
        } else {
          fbVoted = false;
          if (btnYes) btnYes.disabled = false;
          if (btnNo) btnNo.disabled = false;
          if (fbMsg) fbMsg.textContent = 'Gửi thất bại, thử lại sau.';
        }
      }).catch(function() {
        fbVoted = false;
        if (btnYes) btnYes.disabled = false;
        if (btnNo) btnNo.disabled = false;
        if (fbMsg) fbMsg.textContent = 'Gửi thất bại, thử lại sau.';
      });
    }

    if (btnYes) btnYes.addEventListener('click', function() { sendFeedback('yes'); });
    if (btnNo) btnNo.addEventListener('click', function() { sendFeedback('no'); });
  }

  // Lead form
  var leadForm = document.getElementById('lead-capture-form');
  if (leadForm) {
    var leadName = document.getElementById('lead-name');
    var leadEmail = document.getElementById('lead-email');
    var leadPhone = document.getElementById('lead-phone');
    var leadSubmit = document.getElementById('lead-submit-btn');
    var leadMsg = document.getElementById('lead-form-msg');

    leadForm.addEventListener('submit', function(e) {
      e.preventDefault();
      if (!leadMsg) return;
      leadMsg.textContent = '';
      leadMsg.className = 'lead-form-msg';

      var nameVal = leadName ? leadName.value.trim() : '';
      var emailVal = leadEmail ? leadEmail.value.trim() : '';
      var phoneVal = leadPhone ? leadPhone.value.trim() : '';

      if (!emailVal && !phoneVal) {
        leadMsg.className = 'lead-form-msg error';
        leadMsg.textContent = 'Vui lòng nhập email hoặc số điện thoại.';
        return;
      }

      if (leadSubmit) leadSubmit.disabled = true;

      fetch('/api/blog/leads' + PS_Q, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameVal,
          email: emailVal,
          phone: phoneVal,
          source: 'blog',
          blog_slug: blogSlug
        })
      }).then(function(res) {
        if (res.ok) {
          leadMsg.className = 'lead-form-msg success';
          leadMsg.textContent = 'Đã nhận thông tin!';
          leadForm.reset();
        } else {
          leadMsg.className = 'lead-form-msg error';
          leadMsg.textContent = 'Gửi thất bại, thử lại sau.';
        }
        if (leadSubmit) leadSubmit.disabled = false;
      }).catch(function() {
        leadMsg.className = 'lead-form-msg error';
        leadMsg.textContent = 'Gửi thất bại, thử lại sau.';
        if (leadSubmit) leadSubmit.disabled = false;
      });
    });
  }
})();
</script>
</body>
</html>`;
}

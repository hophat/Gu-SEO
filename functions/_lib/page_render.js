import { renderMarkdown } from './markdown.js';
import { esc } from './util.js';

const HERO_W = 1200, HERO_H = 630;

function brand(env) {
  return {
    name: env?.SITE_NAME || 'Gulagi',
    description: env?.SITE_DESCRIPTION || 'Tạo website cho quán từ Google Maps',
    logoUrl: env?.SITE_LOGO_URL || null,
    ctaSignupUrl: env?.SITE_SIGNUP_URL || 'https://gulagi.com',
  };
}

function jsonLD({ site, post, host, kind, settings }) {
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
      ? `${baseUrl}/image/${post.hero_image_key}`
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
        target: { '@type': 'EntryPoint', urlTemplate: `${baseUrl}/blog?q={search_term_string}` },
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
      inLanguage: 'vi',
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${baseUrl}${post.urlPath}` },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${baseUrl}/` },
        isArticle ? { '@type': 'ListItem', position: 2, name: 'Blog', item: `${baseUrl}/blog` } : null,
        { '@type': 'ListItem', position: isArticle ? 3 : 2, name: post.title },
      ].filter(Boolean),
    },
  ];

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

function extractFAQ(post) {
  const body = post.body_markdown || '';
  const faqs = [];
  const faqRegex = /(?:^|\n)#+\s*(?:FAQ|Câu hỏi thường gặp|Hỏi đáp)[\s\S]*?((?:^- .+\n?)+)/gim;
  let match;
  while ((match = faqRegex.exec(body)) !== null) {
    const lines = match[1].split('\n').filter(l => l.trim().startsWith('-'));
    for (const line of lines) {
      const qa = line.replace(/^-\s*/, '').split(/\?\s*(:|–|-)\s*/);
      if (qa.length >= 2) {
        faqs.push({ question: qa[0].trim() + '?', answer: qa[1].trim() });
      }
    }
  }
  if (faqs.length === 0) {
    const h3Regex = /(?:^|\n)###\s+(.+\?)\s*\n\n((?:(?!^#{2,3}\s)[^\n]+(?:\n|$))+)/gim;
    while ((match = h3Regex.exec(body)) !== null) {
      faqs.push({ question: match[1].trim(), answer: match[2].trim().split('\n')[0].trim() });
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

export function renderContentPage({ env, request, post, kind, related = [], settings = {} }) {
  const host = new URL(request.url).hostname;
  const site = brand(env);
  const urlPath = post.urlPath;
  const dateStr = new Date((post.published_at || 0) * 1000).toLocaleDateString('vi-VN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const wordCount = (post.body_markdown || '').split(/\s+/).length;
  const readMin = Math.max(1, Math.ceil(wordCount / 200));
  const isVi = true;

  const useCoverEndpoint = (settings?.hero_image_mode === 'cover') && settings?._has_default_template;
  const heroSrc = useCoverEndpoint
    ? `/cover/${esc(post.slug || 'home')}.svg${settings?._default_template_v ? '?v=' + settings._default_template_v : ''}`
    : post.hero_image_key
      ? `/image/${esc(post.hero_image_key)}`
      : `/og/${esc(post.slug || 'home')}.svg`;
  const heroAlt = esc(post.hero_image_alt || post.title);

  const heroImg = `
<div class="hero-wrap" style="aspect-ratio:${HERO_W}/${HERO_H}">
  <img class="hero" src="${heroSrc}" alt="${heroAlt}" width="${HERO_W}" height="${HERO_H}" decoding="async" fetchpriority="high" onload="this.classList.add('is-loaded')" onerror="this.classList.add('is-loaded')" />
</div>`;

  const bodyHTML = renderMarkdown(post.body_markdown);

  const excerpt = (s, n) => {
    const t = String(s || '');
    if (t.length <= n) return t;
    const cut = t.slice(0, n);
    return cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).replace(/[,;:.\s]+$/, '') + '…';
  };

  const relatedHTML = (kind === 'blog' && related.length) ? `
<aside class="read-next">
  <h2 class="read-next-title">Bài viết liên quan</h2>
  <ul class="read-next-list">
    ${related.map((r) => {
      const rSrc = r.hero_image_key ? `/image/${esc(r.hero_image_key)}` : `/cover/${esc(r.slug)}.svg`;
      return `
      <li>
        <a href="/blog/${esc(r.slug)}">
          <img src="${rSrc}" alt="${esc(r.hero_image_alt || r.title)}" width="640" height="336" loading="lazy" decoding="async" />
          <div class="read-next-meta">
            <h3>${esc(r.title)}</h3>
            ${r.meta_description ? `<p>${esc(excerpt(r.meta_description, 140))}</p>` : ''}
          </div>
        </a>
      </li>`;
    }).join('')}
  </ul>
</aside>` : '';

  const gv = String(settings?.google_site_verification || '').trim();
  const bv = String(settings?.bing_site_verification   || '').trim();
  const verifyMetas = [
    gv ? `<meta name="google-site-verification" content="${esc(gv)}" />` : '',
    bv ? `<meta name="msvalidate.01" content="${esc(bv)}" />` : '',
  ].filter(Boolean).join('\n');

  const preloadHero = `<link rel="preload" as="image" href="${heroSrc}" fetchpriority="high" />`;

  const faqSchema = extractFAQ(post);
  const ldGraph = jsonLD({ site, post: { ...post, urlPath }, host, kind, settings });
  const ldExtra = faqSchema.length ? `,${faqSchema.map(f => JSON.stringify(f)).join(',')}` : '';
  const ldJson = ldGraph.replace('}', `${ldExtra}}`);

  const shareUrl = `https://${host}${urlPath}`;
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
      fetch('/api/blog/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blog_slug: blogSlug })
      }).catch(function() {});
    } catch (e) {}
  }
  var hideFired = false;
  window.addEventListener('pagehide', function() {
    if (hideFired) return;
    hideFired = true;
    try {
      var readTimeMs = Math.round((window.performance && performance.now) ? performance.now() : 0);
      var payload = JSON.stringify({ blog_slug: blogSlug, read_time_ms: readTimeMs });
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/blog/views', blob);
      } else {
        fetch('/api/blog/views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        }).catch(function() {});
      }
    } catch (e) {}
  });` : '';

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(post.title)} · ${esc(site.name)}</title>
<meta name="description" content="${esc(post.meta_description)}" />
${post.keywords ? `<meta name="keywords" content="${esc(post.keywords)}" />` : ''}
<link rel="canonical" href="https://${host}${urlPath}" />
<meta name="robots" content="index,follow,max-image-preview:large" />
<link rel="alternate" type="application/rss+xml" title="${esc(site.name)} — RSS feed" href="https://${host}/feed.xml" />
${verifyMetas}
<meta property="og:type" content="${kind === 'blog' ? 'article' : 'website'}" />
<meta property="og:title" content="${esc(post.title)}" />
<meta property="og:description" content="${esc(post.meta_description)}" />
<meta property="og:url" content="https://${host}${urlPath}" />
<meta property="og:image" content="https://${host}${heroSrc}" />
<meta property="og:image:width" content="${HERO_W}" />
<meta property="og:image:height" content="${HERO_H}" />
<meta property="og:site_name" content="${esc(site.name)}" />
<meta property="og:locale" content="vi_VN" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(post.title)}" />
<meta name="twitter:description" content="${esc(post.meta_description)}" />
<meta name="twitter:image" content="https://${host}${heroSrc}" />
${preloadHero}
<link rel="stylesheet" href="/style.css" />
<script type="application/ld+json">${ldJson}</script>
</head>
<body>

<header class="site-header">
  <div class="header-inner">
    <a class="header-brand" href="https://gulagi.com">
      <span class="header-logo">Gulagi</span>
    </a>
    <nav class="header-nav">
      <a href="https://gulagi.com">Trang chủ</a>
      <a href="/blog" class="active">Blog</a>
      <a href="https://gulagi.com" class="header-cta">Tạo website ngay</a>
    </nav>
  </div>
</header>

<main class="post-shell">
  <div class="crumb"><a href="https://gulagi.com">Trang chủ</a>${kind === 'blog' ? ' · <a href="/blog">Blog</a>' : ''} · <span>${esc(post.title.slice(0, 40))}…</span></div>
  <h1 class="post-title">${esc(post.title)}</h1>
  <div class="post-meta">
    <span class="post-date">${esc(dateStr)}</span>
    <span class="post-sep">·</span>
    <span class="post-read">${readMin} phút đọc</span>
  </div>
  ${heroImg}
  <article class="prose">
    ${bodyHTML}
    <div class="article-cta">
      <div class="cta-box">
        <h3>Tạo website cho quán của bạn ngay</h3>
        <p>Chỉ cần dán link Google Maps, Gulagi sẽ tự động tạo website chuyên nghiệp cho quán.</p>
        <div class="mini-builder">
          <form id="mini-builder-form" onsubmit="event.preventDefault();var url=this.querySelector('input').value.trim();if(url){window.location.href='https://gulagi.com/?maps='+encodeURIComponent(url);}">
            <input type="url" placeholder="Dán link Google Maps của quán..." required class="mini-builder-input" />
            <button type="submit" class="mini-builder-btn">Tạo web ngay →</button>
          </form>
        </div>
        <a href="https://gulagi.com" class="cta-btn" style="margin-top:12px">Bắt đầu miễn phí →</a>
      </div>
    </div>
    <div class="lead-form-box">
      <h3>Tải cẩm nang tăng đơn</h3>
      <p>Nhận ngay tài liệu hướng dẫn tối ưu Google Maps &amp; tăng doanh thu cho quán.</p>
      <form id="lead-capture-form" class="lead-form">
        <div class="lead-form-fields">
          <input type="text" id="lead-name" name="name" placeholder="Họ và tên" class="lead-input" />
          <input type="email" id="lead-email" name="email" placeholder="Email nhận tài liệu" class="lead-input" />
          <input type="tel" id="lead-phone" name="phone" placeholder="Số điện thoại" class="lead-input" />
        </div>
        <button type="submit" id="lead-submit-btn" class="lead-submit-btn">Nhận cẩm nang miễn phí →</button>
        <div id="lead-form-msg" class="lead-form-msg" role="status" aria-live="polite"></div>
      </form>
    </div>
  </article>
  <div class="share-bar">
    <span class="share-label">Chia sẻ bài viết:</span>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrlEnc}" target="_blank" rel="noopener" class="share-btn share-fb">Facebook</a>
    <a href="https://zalo.me/oa/share?url=${shareUrlEnc}" target="_blank" rel="noopener" class="share-btn share-zalo">Zalo</a>
    <button class="share-btn share-copy" onclick="navigator.clipboard.writeText('${shareUrl}').then(()=>this.textContent='Đã copy!')">Sao chép link</button>
  </div>
  <div class="feedback-block" id="feedback-block">
    <div class="feedback-title">Bài viết này có hữu ích?</div>
    <div class="feedback-actions">
      <button type="button" class="feedback-btn feedback-yes" id="feedback-btn-yes" data-rating="yes">Có</button>
      <button type="button" class="feedback-btn feedback-no" id="feedback-btn-no" data-rating="no">Không</button>
    </div>
    <div class="feedback-comment-wrap">
      <input type="text" class="feedback-comment-input" id="feedback-comment" placeholder="Ý kiến đóng góp thêm (không bắt buộc)..." maxlength="500" />
    </div>
    <div class="feedback-msg" id="feedback-msg" role="status" aria-live="polite"></div>
  </div>
  <div class="author-box">
    <div class="author-info">
      <strong>Đội ngũ Gulagi</strong>
      <p>Chuyên gia giải pháp số giúp quán cà phê, nhà hàng, cửa hàng bán lẻ chuyển đổi số hiệu quả.</p>
    </div>
  </div>
  ${relatedHTML}
</main>

<div class="sticky-cta" id="sticky-cta">
  <a href="https://gulagi.com" class="sticky-cta-btn">Dán link Google Maps — Tạo web quán 30s</a>
</div>

<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <strong>Gulagi</strong> — Tạo website cho quán từ Google Maps
    </div>
    <div class="footer-links">
      <a href="https://gulagi.com">Trang chủ</a>
      <a href="https://gulagi.com">Tạo website</a>
      <a href="/blog">Blog</a>
      <a href="https://gulagi.com/faq">FAQ</a>
      <a href="mailto:gulagi.com@gmail.com">Liên hệ</a>
    </div>
    <div class="footer-copy">© ${new Date().getFullYear()} Gulagi. Bảo lưu mọi quyền.</div>
  </div>
</footer>

<script>
window.addEventListener('scroll', function() {
  var btn = document.getElementById('sticky-cta');
  if (btn) btn.classList.toggle('visible', window.scrollY > 600);
});
(function() {
  var blogSlug = ${blogSlugEsc};
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

      fetch('/api/blog/feedback', {
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

      fetch('/api/blog/leads', {
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

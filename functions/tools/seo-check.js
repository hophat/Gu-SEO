// /tools/seo-check — free on-page SEO audit.
//
// The tool is the link magnet: it does something a visitor wants (check
// their own page), it renders server-side so it works with JavaScript
// off, and it ships an embed mode so other sites can drop it in an
// iframe with a link back. Everything it needs is already in the page
// HTML, so it runs on any site without an account.
//
// Retrieval lives in _lib/safe_fetch.js because the URL comes from a
// stranger; the checks live in _lib/seo_audit.js and take HTML only.

import { esc, edgeCached, imageUrl } from '../_lib/util.js';
import { loadSettings } from '../_lib/settings.js';
import { themeStyle } from '../_lib/page_render.js';
import { resolveProjectForRequest, resolveProjectBySlug, normalizeHost } from '../_lib/project_scope.js';
import { safeFetch } from '../_lib/safe_fetch.js';
import { auditHtml } from '../_lib/seo_audit.js';

const TOOL_NAME = 'Kiểm tra SEO';

// Turn a guard/network error into something a visitor can act on.
const ERRORS = {
  invalid_url: 'Địa chỉ không hợp lệ. Ví dụ: https://example.com',
  only_http_https: 'Chỉ kiểm tra được địa chỉ bắt đầu bằng http:// hoặc https://',
  port_not_allowed: 'Chỉ hỗ trợ cổng 80 và 443.',
  private_host: 'Không kiểm tra được địa chỉ nội bộ.',
  timeout: 'Máy chủ đích phản hồi quá chậm. Thử lại sau.',
  fetch_failed: 'Không kết nối được tới máy chủ đích.',
  too_many_redirects: 'Trang chuyển hướng quá nhiều lần.',
};

function errorMessage(err) {
  const code = String(err?.message || err || '').split(':')[0];
  return ERRORS[code] || 'Không kiểm tra được trang này. Kiểm tra lại địa chỉ.';
}

async function fetchRobots(finalUrl) {
  try {
    const res = await safeFetch(new URL('/robots.txt', finalUrl).toString(), { timeoutMs: 6000, maxBytes: 64_000 });
    return { ok: res.status >= 200 && res.status < 300, status: res.status, text: res.text };
  } catch {
    return null;
  }
}

const STATUS_LABEL = { pass: 'Đạt', warn: 'Cần sửa', fail: 'Lỗi' };

function renderChecks(audit) {
  return audit.checks.map((c) => `
    <li class="chk chk-${c.status}">
      <span class="chk-status">${STATUS_LABEL[c.status]}</span>
      <div class="chk-body">
        <strong>${esc(c.label)}</strong>
        <span class="chk-detail">${esc(c.detail)}</span>
        ${c.fix ? `<span class="chk-fix">→ ${esc(c.fix)}</span>` : ''}
      </div>
    </li>`).join('');
}

function scoreBlock(audit) {
  return `
    <div class="tool-score">
      <div class="tool-score-num"><span>${audit.score}</span><small>/100</small></div>
      <div class="tool-score-meta">
        <div class="tool-grade">Điểm ${esc(audit.grade)}</div>
        <div class="tool-counts">
          <span class="c-fail">${audit.counts.fail} lỗi</span>
          <span class="c-warn">${audit.counts.warn} cần sửa</span>
          <span class="c-pass">${audit.counts.pass} đạt</span>
        </div>
      </div>
    </div>`;
}

export async function runAudit(rawUrl) {
  const page = await safeFetch(rawUrl, { timeoutMs: 12_000 });
  const robots = await fetchRobots(page.finalUrl);
  return auditHtml(page.text, {
    finalUrl: page.finalUrl,
    status: page.status,
    contentType: page.contentType,
    robotsTxt: robots,
    bytes: page.bytes,
    truncated: page.truncated,
  });
}

export async function renderSeoCheck({ env, request }) {
  const url = new URL(request.url);
  const target = String(url.searchParams.get('url') || '').trim().slice(0, 500);
  const embed = url.searchParams.get('embed') === '1';

  const [project, settings] = await Promise.all([
    resolveProjectForRequest(env, request).catch(() => null),
    loadSettings(env).catch(() => ({})),
  ]);
  const customHost = project?.custom_domain ? normalizeHost(project.custom_domain) : null;
  const effectiveHost = customHost || url.hostname;
  const effectiveBasePath = customHost ? '' : '';
  const siteName = project?.site_name || env.SITE_NAME || settings.site_name || 'Gulagi';
  const homeUrl = project?.website_url || `https://${effectiveHost}`;
  const toolUrl = `https://${effectiveHost}${effectiveBasePath}/tools/seo-check`;

  let audit = null;
  let errMsg = '';
  if (target) {
    try {
      audit = await runAudit(target);
    } catch (err) {
      errMsg = errorMessage(err);
    }
  }

  if (embed) {
    // Embed mode: no chrome, no nav, noindex. The attribution link is
    // the point — that link is what makes an embed worth having.
    const body = audit
      ? `<div class="tool-embed">
  ${scoreBlock(audit)}
  <ul class="tool-checks">${renderChecks(audit)}</ul>
  <p class="tool-attrib">Kiểm tra bởi <a href="${esc(toolUrl)}" target="_blank" rel="noopener">${esc(TOOL_NAME)}</a></p>
</div>`
      : `<div class="tool-embed"><p class="tool-err">${esc(errMsg || 'Nhập địa chỉ để kiểm tra.')}</p>
  <p class="tool-attrib"><a href="${esc(toolUrl)}" target="_blank" rel="noopener">${esc(TOOL_NAME)}</a></p></div>`;
    return new Response(`<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(TOOL_NAME)}${audit ? ' — ' + audit.score + '/100' : ''}</title>
<meta name="robots" content="noindex" />
<link rel="stylesheet" href="/style.css" />
${themeStyle(project?.theme_color)}
</head>
<body class="tool-embed-body">
${body}
</body>
</html>`, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=300, s-maxage=3600',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  const gv = String(settings?.google_site_verification || '').trim();
  const bv = String(settings?.bing_site_verification   || '').trim();
  const verifyMetas = [
    gv ? `<meta name="google-site-verification" content="${esc(gv)}" />` : '',
    bv ? `<meta name="msvalidate.01" content="${esc(bv)}" />` : '',
  ].filter(Boolean).join('\n');

  const formAction = url.pathname;
  const embedCode = `<iframe src="${toolUrl}?url=${encodeURIComponent(target || 'https://example.com')}&amp;embed=1" width="100%" height="720" frameborder="0" loading="lazy" title="${TOOL_NAME}"></iframe>`;

  const resultHTML = audit
    ? `<section class="tool-result">
  <p class="tool-audited">Đã kiểm tra <a href="${esc(audit.url)}" rel="nofollow noopener" target="_blank">${esc(audit.url)}</a> — <strong>${esc(audit.title || '(không có title)')}</strong></p>
  ${scoreBlock(audit)}
  <ul class="tool-checks">${renderChecks(audit)}</ul>
</section>`
    : (errMsg ? `<p class="tool-err">${esc(errMsg)}</p>` : '');

  const body = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(TOOL_NAME)} miễn phí · ${esc(siteName)}</title>
<meta name="description" content="Kiểm tra SEO on-page miễn phí: title, meta description, canonical, H1, Open Graph, robots.txt, sitemap. Nhúng miễn phí vào website của bạn." />
<link rel="canonical" href="${toolUrl}" />
${verifyMetas}
<meta name="robots" content="index,follow" />
<meta property="og:title" content="${esc(TOOL_NAME)} miễn phí" />
<meta property="og:description" content="Kiểm tra SEO on-page miễn phí, không cần đăng nhập." />
<meta property="og:url" content="${toolUrl}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary" />
<link rel="stylesheet" href="/style.css" />
${themeStyle(project?.theme_color)}
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
      <a href="/blog">Blog</a>
      <a href="/hubs">Chủ đề</a>
      <a href="/tools/seo-check" class="active">Công cụ</a>
    </nav>
  </div>
</header>
<main class="tool-page">
  <header class="tool-head">
    <h1>${esc(TOOL_NAME)} miễn phí</h1>
    <p class="lede">Nhập địa chỉ một trang, kiểm tra 16 yếu tố on-page quan trọng nhất. Không cần đăng nhập, không lưu dữ liệu.</p>
  </header>
  <form class="tool-form" method="GET" action="${esc(formAction)}">
    <label class="tool-label" for="tool-url">Địa chỉ trang cần kiểm tra</label>
    <div class="tool-form-row">
      <input id="tool-url" name="url" type="text" inputmode="url" required
             placeholder="https://example.com/ten-bai-viet"
             value="${esc(target)}" />
      <button type="submit">Kiểm tra</button>
    </div>
    <p class="tool-hint">Có thể dán cả trang chủ lẫn một bài viết cụ thể.</p>
  </form>
  ${resultHTML}
  <section class="tool-embed-box">
    <h2>Nhúng công cụ này vào website của bạn</h2>
    <p class="lede">Dán đoạn dưới vào bất kỳ trang nào. Kết quả chạy trực tiếp, không cần máy chủ của bạn.</p>
    <textarea class="tool-code" readonly rows="3" onclick="this.select()">${esc(embedCode)}</textarea>
    <p class="tool-hint">Khung này giữ liên kết về công cụ — đó là điều kiện để được nhúng.</p>
    <p class="tool-preview-label">Xem trước:</p>
    <div class="tool-preview">
      ${target
        ? `<iframe src="/tools/seo-check?url=${encodeURIComponent(target)}&amp;embed=1" width="100%" height="520" frameborder="0" loading="lazy" title="${TOOL_NAME}"></iframe>`
        : `<iframe src="/tools/seo-check?embed=1" width="100%" height="300" frameborder="0" loading="lazy" title="${TOOL_NAME}"></iframe>`}
    </div>
  </section>
  <section class="tool-why">
    <h2>Vì sao nên kiểm tra</h2>
    <ul>
      <li><strong>Title và description</strong> quyết định 70% việc người ta có bấm vào hay không, và đó là tín hiệu mạnh nhất về chủ đề trang.</li>
      <li><strong>Canonical</strong> chặn các bản sao URL cùng nội dung làm loãng tín hiệu cho chính trang đó.</li>
      <li><strong>robots.txt</strong> chặn nhầm <code>Disallow: /</code> là lỗi làm mất toàn bộ site khỏi Google mà trang vẫn hiện bình thường.</li>
      <li><strong>Liên kết nội bộ</strong> quyết định bộ thu thập có đi tới phần còn lại của site hay đứng lại ở trang đầu.</li>
    </ul>
  </section>
</main>
<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand"><strong>${esc(siteName)}</strong></div>
    <div class="footer-links">
      <a href="${esc(homeUrl)}">Trang chủ</a>
      <a href="/blog">Blog</a>
      <a href="/hubs">Chủ đề</a>
      <a href="/tools/seo-check">Công cụ</a>
    </div>
    <div class="footer-copy">© ${new Date().getFullYear()} ${esc(siteName)}. Bảo lưu mọi quyền.</div>
  </div>
</footer>
</body>
</html>`;

  return new Response(body, {
    status: errMsg ? 400 : 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=3600',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  });
}

export const onRequestGet = (ctx) => edgeCached(ctx.request, ctx.waitUntil, () => renderSeoCheck({ env: ctx.env, request: ctx.request }));

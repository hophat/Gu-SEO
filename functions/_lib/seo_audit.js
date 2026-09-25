// On-page SEO audit for the public /tools/seo-check page.
//
// Pure function: HTML in, checks out. No fetch, no env, no network — the
// route owns retrieval so this stays trivially testable and can be reused
// by the embed widget later.

import { extractMeta, extractAll, decode } from './scrape.js';

const WS = /\s+/g;
const STRIP_TAGS = /<[^>]+>/g;

function text(html) {
  return decode(String(html || '').replace(STRIP_TAGS, ' ').replace(WS, ' ')).trim();
}

function check(id, label, status, detail, fix, weight) {
  return { id, label, status, detail, fix, weight };
}

const OK = 'pass', WARN = 'warn', FAIL = 'fail';

// Each check states the threshold it judges against, so a user who
// disagrees can see the rule rather than argue with a score.
export function auditHtml(html, opts = {}) {
  const {
    finalUrl = '',
    status = 200,
    contentType = '',
    robotsTxt = null,
    bytes = 0,
    truncated = false,
  } = opts;

  const checks = [];
  const src = String(html || '');

  const title = text(extractAll(src, 'title'));
  const desc = extractMeta(src, 'description');
  const canonical = (/<link\b[^>]*\brel=["']?canonical["']?[^>]*>/i.exec(src)?.[0] || '');
  const canonicalHref = canonical ? extractHref(canonical) : '';
  const lang = (/<html\b[^>]*\blang=["']([^"']+)["']/i.exec(src)?.[1] || '').toLowerCase();
  const viewport = /<meta\b[^>]*\bname=["']?viewport["']?/i.test(src);
  const charset = /<meta\b[^>]*\bcharset=["']?([\w-]+)/i.exec(src)?.[1] || (/charset=["']?utf-8/i.test(src) ? 'utf-8' : '');
  const ogTitle = extractMeta(src, 'og:title');
  const ogImage = extractMeta(src, 'og:image');
  const ogDescription = extractMeta(src, 'og:description');
  const h1s = extractAll(src, 'h1');
  const jsonLd = /<script\b[^>]*type=["']application\/ld\+json["']/i.test(src);
  const imgs = src.match(/<img\b[^>]*>/gi) || [];
  const imgsNoAlt = imgs.filter((t) => !/\balt=["'][^"']*["']/i.test(t)).length;
  const links = (src.match(/<a\b[^>]*href=/gi) || []).length;
  const words = (() => {
    const body = /<body\b[^>]*>([\s\S]*)/i.exec(src)?.[1] || '';
    // Flags go after the literal, not in a (?is) group: the combined
    // modifier group is rejected by the Node/V8 build this repo's local
    // dev server runs on, and the Functions bundle is imported by Node
    // too — a syntax error here takes down every route, not just this one.
    const clean = body.replace(/<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gis, ' ');
    return text(clean).split(' ').filter(Boolean).length;
  })();

  // 1. indexable status
  const metaRobots = extractMeta(src, 'robots');
  const noindex = /noindex/i.test(metaRobots) || /<meta\b[^>]*name=["']?robots["']?[^>]*content=["'][^"']*noindex/i.test(src);
  checks.push(noindex
    ? check('indexable', 'Cho phép lập chỉ mục', FAIL, 'Trang đang đặt noindex nên không thể lên top.', 'Bỏ noindex khỏi thẻ meta robots.', 12)
    : check('indexable', 'Cho phép lập chỉ mục', OK, 'Không có noindex trên trang.', '', 12));

  // 2. status + content type
  checks.push(status >= 200 && status < 300
    ? check('status', 'Mã HTTP', OK, `Trả về ${status}.`, '', 8)
    : check('status', 'Mã HTTP', FAIL, `Trả về ${status}.`, 'Trang lỗi không được lập chỉ mục — kiểm tra link hoặc máy chủ.', 8));
  checks.push(/text\/html/.test(contentType)
    ? check('ctype', 'Kiểu nội dung', OK, 'text/html.', '', 4)
    : check('ctype', 'Kiểu nội dung', WARN, `Content-Type là "${contentType || 'không rõ'}".`, 'Nên phục vụ HTML cho trang nội dung.', 4));

  // 3. title
  const titleLen = title.length;
  checks.push(!title
    ? check('title', 'Thẻ title', FAIL, 'Không có thẻ <title>.', 'Thêm <title> 30–60 ký tự, có từ khóa chính ở đầu.', 14)
    : titleLen < 30 || titleLen > 60
      ? check('title', 'Thẻ title', WARN, `${titleLen} ký tự (nên 30–60).`, 'Rút ngắn hoặc bổ sung từ khóa để không bị cắt trên SERP.', 14)
      : check('title', 'Thẻ title', OK, `${titleLen} ký tự.`, '', 14));

  // 4. meta description
  const descLen = desc.length;
  checks.push(!desc
    ? check('description', 'Meta description', FAIL, 'Thiếu meta description.', 'Viết 120–160 ký tự mô tả lời ích, có lời kêu hành động.', 12)
    : descLen < 70 || descLen > 170
      ? check('description', 'Meta description', WARN, `${descLen} ký tự (nên 120–160).`, 'Google tự cắt mô tả ngoài khoảng này.', 12)
      : check('description', 'Meta description', OK, `${descLen} ký tự.`, '', 12));

  // 5. canonical
  checks.push(canonicalHref
    ? check('canonical', 'Canonical', OK, `Khai báo ${canonicalHref.slice(0, 80)}.`, '', 8)
    : check('canonical', 'Canonical', WARN, 'Không có link rel=canonical.', 'Thêm canonical trỏ về chính trang — chặn URL trùng lặp làm loãng tín hiệu.', 8));

  // 6. h1
  checks.push(h1s.length === 0
    ? check('h1', 'Tiêu đề H1', FAIL, 'Trang không có H1.', 'Thêm đúng một H1 chứa từ khóa chính.', 10)
    : h1s.length > 1
      ? check('h1', 'Tiêu đề H1', WARN, `${h1s.length} thẻ H1 (nên đúng 1).`, 'Gộp còn một H1, phần còn lại đổi sang H2.', 10)
      : check('h1', 'Tiêu đề H1', OK, 'Đúng một H1.', '', 10));

  // 7. og
  const ogOk = ogTitle && ogImage;
  checks.push(ogOk
    ? check('og', 'Thẻ Open Graph', OK, 'Có og:title và og:image.', '', 6)
    : check('og', 'Thẻ Open Graph', WARN, 'Thiếu og:title hoặc og:image.', 'Thiếu ảnh thì link chia sẻ trên mạng xã hội không có ảnh.', 6));

  // 8. viewport + charset + lang
  checks.push(viewport
    ? check('viewport', 'Viewport mobile', OK, 'Đã khai báo viewport.', '', 6)
    : check('viewport', 'Viewport mobile', FAIL, 'Thiếu meta viewport.', 'Thêm <meta name="viewport" content="width=device-width,initial-scale=1">.', 6));
  checks.push(charset
    ? check('charset', 'Bảng mã ký tự', OK, `charset=${charset}.`, '', 3)
    : check('charset', 'Bảng mã ký tự', WARN, 'Không khai báo charset.', 'Thêm <meta charset="utf-8"> ở 512 byte đầu.', 3));
  checks.push(lang
    ? check('lang', 'Thuộc tính lang', OK, `lang="${lang}".`, '', 3)
    : check('lang', 'Thuộc tính lang', WARN, 'Thẻ <html> thiếu lang.', 'Thêm lang="vi" để bộ đọc màn hình đọc đúng giọng.', 3));

  // 9. images
  const altRatio = imgs.length ? (imgs.length - imgsNoAlt) / imgs.length : 1;
  checks.push(!imgs.length
    ? check('alt', 'Alt của ảnh', OK, 'Trang không có ảnh.', '', 6)
    : imgsNoAlt === 0
      ? check('alt', 'Alt của ảnh', OK, `${imgs.length} ảnh, tất cả có alt.`, '', 6)
      : altRatio >= 0.9
        ? check('alt', 'Alt của ảnh', WARN, `${imgsNoAlt}/${imgs.length} ảnh thiếu alt.`, 'Bổ sung alt mô tả ảnh — đây cũng là đường vào Google Images.', 6)
        : check('alt', 'Alt của ảnh', FAIL, `${imgsNoAlt}/${imgs.length} ảnh thiếu alt.`, 'Bổ sung alt cho từng ảnh.', 6));

  // 10. internal links
  checks.push(links === 0
    ? check('links', 'Liên kết nội bộ', FAIL, 'Không có liên kết nào.', 'Trang không có liên kết ra thì bộ thu thập không đi tiếp được.', 8)
    : links < 3
      ? check('links', 'Liên kết nội bộ', WARN, `Chỉ ${links} liên kết.`, 'Thêm liên kết tới các bài liên quan để dựng cụm chủ đề.', 8)
      : check('links', 'Liên kết nội bộ', OK, `${links} liên kết.`, '', 8));

  // 11. structured data
  checks.push(jsonLd
    ? check('jsonld', 'Dữ liệu có cấu trúc', OK, 'Có JSON-LD.', '', 6)
    : check('jsonld', 'Dữ liệu có cấu trúc', WARN, 'Không thấy JSON-LD.', 'Thêm Article/BreadcrumbList — thường mở rộng kết quả có rich snippet.', 6));

  // 12. content length
  checks.push(words < 300
    ? check('content', 'Độ dài nội dung', words < 150 ? FAIL : WARN, `~${words} từ (nên từ 300).`, 'Nội dung mỏng không có cơ hội cạnh tranh từ khóa.', 8)
    : check('content', 'Độ dài nội dung', OK, `~${words} từ.`, '', 8));

  // 13. page weight
  const kb = Math.round(bytes / 1024);
  checks.push(!bytes
    ? check('weight', 'Dung lượng HTML', OK, 'Không đo được (đã cắt bớt).', '', 2)
    : kb > 500
      ? check('weight', 'Dung lượng HTML', WARN, `${kb}KB (nên dưới 200KB).`, 'HTML nặng làm chậm render trên di động.', 2)
      : check('weight', 'Dung lượng HTML', OK, `${kb}KB${truncated ? ' (đã cắt)' : ''}.`, '', 2));

  // 14. robots.txt
  if (robotsTxt === null) {
    checks.push(check('robots', 'robots.txt', WARN, 'Không kiểm tra được robots.txt.', '', 5));
  } else if (!robotsTxt.ok) {
    checks.push(check('robots', 'robots.txt', WARN, `Không tải được (HTTP ${robotsTxt.status || 'lỗi'}).`, 'Google vẫn thu thập, nhưng bạn mất quyền kiểm soát.', 5));
  } else {
    const blocks = (robotsTxt.text.match(/^\s*disallow\s*:\s*\/$/gim) || []).length;
    const hasSitemap = /sitemap\s*:/i.test(robotsTxt.text);
    checks.push(blocks
      ? check('robots', 'robots.txt', FAIL, 'robots.txt chặn toàn bsite (/).', 'Xoá dòng Disallow: / — nó chặn chính site của bạn.', 5)
      : check('robots', 'robots.txt', OK, 'Không chặn toàn site.', '', 5));
    checks.push(hasSitemap
      ? check('sitemap', 'Khai báo sitemap', OK, 'robots.txt trỏ tới sitemap.', '', 5)
      : check('sitemap', 'Khai báo sitemap', WARN, 'robots.txt chưa khai báo Sitemap:', 'Thêm dòng Sitemap: https://…/sitemap.xml.', 5));
  }

  const total = checks.reduce((n, c) => n + c.weight, 0);
  const earned = checks.reduce((n, c) => n + c.weight * (c.status === OK ? 1 : c.status === WARN ? 0.5 : 0), 0);
  const score = Math.round((earned / total) * 100);

  const order = { [FAIL]: 0, [WARN]: 1, [OK]: 2 };
  checks.sort((a, b) => order[a.status] - order[b.status] || b.weight - a.weight);

  return {
    score,
    grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D',
    url: finalUrl,
    title,
    counts: { fail: checks.filter((c) => c.status === FAIL).length, warn: checks.filter((c) => c.status === WARN).length, pass: checks.filter((c) => c.status === OK).length },
    checks,
  };
}

function extractHref(tag) {
  const m = /\bhref=["']([^"']+)["']/i.exec(tag);
  return m ? m[1] : '';
}

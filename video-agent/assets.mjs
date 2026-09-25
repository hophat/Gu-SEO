// Asset collection — what the video is allowed to show.
//
// The strategy is asset-first: a product video that shows the product beats
// one that describes it with icons, and a restaurant video should show the
// food. So the pipeline gathers real material before it writes a storyboard,
// and the storyboard may only reference assets that actually arrived.
//
// Every function returns paths RELATIVE to the job workspace ("assets/…"),
// because that is what the composition HTML references and what hyperframes
// resolves when it renders.
import { readdirSync, existsSync, statSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// chrome-headless-shell is already provisioned by the renderer, so a
// screenshot costs no extra dependency.
export const CHROME_DIR = '/root/.cache/hyperframes/chrome/chrome-headless-shell';

export function findChrome() {
  try {
    for (const v of readdirSync(CHROME_DIR)) {
      const p = join(CHROME_DIR, v, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
      if (existsSync(p)) return p;
    }
  } catch { /* fall through */ }
  return null;
}

// A page that fails to render still produces a perfectly valid PNG — a blank
// one — so a size check has to be able to tell them apart. Measured on the
// render VPS at 720x1280: an empty page is 5 394 bytes, the plainest real
// page (one heading and a line of text) is 26 095, a real homepage is
// 152 124. A floor of 5 000 let the blank through, and a live job then put a
// blank screenshot inside the phone frame — the scene that sells the product.
export const MIN_SHOT_BYTES = 16000;

export function capturePage(url, outPath, { budget = 9000, size = '720,1280' } = {}) {
  const chrome = findChrome();
  if (!chrome) return false;
  const r = spawnSync(chrome, [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${size}`, `--virtual-time-budget=${budget}`,
    '--screenshot=' + outPath, url,
  ], { encoding: 'utf8', timeout: Math.max(45000, budget * 5) });
  return r.status === 0 && existsSync(outPath) && statSync(outPath).size > MIN_SHOT_BYTES;
}

// A real Google Maps view of the place, captured the same way — no API key,
// no billing. It is heavy JS, so it gets a longer virtual-time budget, and a
// consent overlay or a slow tile server just means no map (the caller falls
// back to a photo rather than showing a broken frame).
export async function captureMaps(query, work, log = () => {}) {
  const q = String(query || '').trim();
  if (!q || !findChrome()) return null;
  const out = join(work, 'assets', 'map.jpg');
  mkdirSync(join(work, 'assets'), { recursive: true });
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  const ok = capturePage(url, out, { budget: 14000 });
  log(ok ? `map: captured "${q}"` : `map: capture failed for "${q}" — no map this time`);
  return ok ? 'assets/map.jpg' : null;
}

// Links worth screenshotting: the pages that show the product. A shop's
// menu, a service list, a pricing table — not the cookie policy, the login
// form or a tag archive, which are what a nav's first anchors usually are.
const SHOWCASE = /(thực đơn|menu|sản phẩm|dịch vụ|bảng giá|giá|tính năng|khóa học|liệu trình|phòng|tour|product|service|pricing|feature|course|about|giới thiệu)/i;
const UTILITY = /(chính sách|điều khoản|bảo mật|privacy|terms|policy|cookie|đăng nhập|đăng ký|login|signin|sign-in|register|cart|giỏ hàng|checkout|tag|danh mục|category|search|tìm kiếm|\.(pdf|jpg|png|zip)$)/i;

export function pickShowcaseLinks(html, siteUrl, limit = 2) {
  const base = siteUrl.replace(/\/+$/, '');
  const seen = new Set([siteUrl, base + '/']);
  const scored = [];
  for (const m of String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,80}?)<\/a>/gi)) {
    let href;
    try { href = new URL(m[1], siteUrl).href.split('#')[0]; } catch { continue; }
    if (!href.startsWith(base) || seen.has(href)) continue;
    seen.add(href);
    const label = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (UTILITY.test(label) || UTILITY.test(href)) continue;
    scored.push({ href, good: SHOWCASE.test(label) || SHOWCASE.test(href) });
  }
  // A named showcase page first; anything else same-origin only as filler.
  return scored.sort((a, b) => Number(b.good) - Number(a.good)).slice(0, limit).map((s) => s.href);
}

// Strip markup without throwing away the page's actual prose. Headings alone
// are too thin for a 60s narration; website/product jobs need the body copy
// too, while scripts, styles, and SVG source would only add noise.
export function extractVisibleText(html = '') {
  const source = String(html || '');
  const body = source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || source;
  return body
    .replace(/<(script|style|noscript|template|svg|canvas)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?(?:address|article|aside|blockquote|br|button|div|figcaption|figure|footer|form|h[1-6]|header|li|main|nav|ol|p|pre|section|td|th|tr|ul)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ''; }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCodePoint(Number(dec)); } catch { return ''; }
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

// Homepage + up to two same-origin nav pages, text scraped for the storyboard.
export async function captureSite(siteUrl, work, log = () => {}) {
  const outDir = join(work, 'assets', 'media');
  mkdirSync(outDir, { recursive: true });
  const shots = [];
  let html = '';
  try {
    const res = await fetch(siteUrl, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; pages-seo-video/1.0)' },
      redirect: 'follow', signal: AbortSignal.timeout(20000),
    });
    html = await res.text().catch(() => '');
  } catch { /* screenshots below still attempted */ }

  if (findChrome()) {
    if (capturePage(siteUrl, join(outDir, 'shot0.png'))) shots.push(join(outDir, 'shot0.png'));
    // The second and third shots become the product demonstration, which is
    // the scene that matters most — so they are chosen by what the link SAYS,
    // not by where it sits in the nav. Taking the first two anchors rendered
    // a phone frame full of a privacy policy on a real job.
    for (const u of pickShowcaseLinks(html, siteUrl)) {
      if (shots.length >= 3) break;
      const f = join(outDir, `shot${shots.length}.png`);
      if (capturePage(u, f)) shots.push(f);
    }
  }
  const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim();
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || '');
  const headings = [...html.matchAll(/<h[12][^>]*>([^<]{4,90})<\/h[12]>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean).slice(0, 8);
  const visibleText = extractVisibleText(html);
  const pageText = visibleText || [title, desc, ...headings].filter(Boolean).join('\n');
  log(`site: ${shots.length} screenshot(s) of ${siteUrl}; ${pageText.length} chars of page text`);
  return { shots, text: [title, desc, pageText].filter(Boolean).join('\n') };
}

// Real images from the project's own website — og:image first, then the
// largest <img> candidates. The site is the raw material for a business or
// article video; the R2 hero is the fallback.
export const MAX_MEDIA = 4;

export async function collectMedia(job, work, log = () => {}) {
  const site = job.project?.website_url || job.project?.publishing_url || '';
  const outDir = join(work, 'assets', 'media');
  mkdirSync(outDir, { recursive: true });
  if (!site) return [];
  try {
    const res = await fetch(site, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; pages-seo-video/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    const html = await res.text().catch(() => '');
    const srcs = new Set();
    for (const m of html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi)) srcs.add(m[1]);
    for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) srcs.add(m[1]);
    const candidates = [...srcs]
      .map((u) => { try { return new URL(u, site).href; } catch { return null; } })
      .filter((u) => /^https?:/.test(u))
      .filter((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u))
      .filter((u) => !/logo|icon|sprite|avatar|favicon/i.test(u));
    const picked = [];
    for (const u of candidates.slice(0, 12)) {
      if (picked.length >= MAX_MEDIA) break;
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) continue;
        const type = (r.headers.get('content-type') || '').toLowerCase();
        if (!type.startsWith('image/')) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 8000) continue; // icons/sprites — not scene material
        const f = join(outDir, `img${picked.length}.jpg`);
        writeFileSync(f, buf);
        picked.push(f);
      } catch { /* skip broken asset */ }
    }
    log(`media: ${picked.length} image(s) from ${site}`);
    return picked;
  } catch (e) {
    log(`media collect failed (${e.message}) — gradient only`);
    return [];
  }
}

// One remote image into assets/, extension preserved (SVG/PNG/JPG all render
// in <img>). Serves the brand logo and the news presenter's photo alike.
export async function downloadImage(url, work, fileBase, log = () => {}) {
  if (!url) return null;
  const ext = (String(url).match(/\.(svg|png|jpe?g|webp)(\?|$)/i)?.[1] || 'png').toLowerCase();
  const out = join(work, 'assets', `${fileBase}.${ext}`);
  mkdirSync(join(work, 'assets'), { recursive: true });
  try {
    const r = await fetch(String(url).trim(), {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; pages-seo-video/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const type = (r.headers.get('content-type') || '').toLowerCase();
    if (!type.startsWith('image/')) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100) return null;
    writeFileSync(out, buf);
    return `assets/${fileBase}.${ext}`;
  } catch { return null; }
}

// The brand logo — the common case of downloadImage.
export const downloadLogo = (logoUrl, work, log = () => {}) => downloadImage(logoUrl, work, 'logo', log);

// Which assets an intent is worth paying for. Chrome captures take 10-45s
// each, so an article video does not screenshot a site it will never show.
const WANTS_SITE = new Set(['product_demo', 'product_promotion', 'announcement', 'before_after']);

// Returns { assets, siteText }: the site is captured once and its text comes
// back with its screenshots. Capturing it here and again in the caller doubled
// the slowest step in the whole pipeline for nothing.
export async function collectAssets({ job, intent, work, log = () => {} }) {
  const assets = {};
  let siteText = null;
  const heroB64 = job.hero_image_base64 || job.project?.hero_image_base64;
  if (heroB64) {
    mkdirSync(join(work, 'assets'), { recursive: true });
    writeFileSync(join(work, 'assets', 'hero.jpg'), Buffer.from(heroB64, 'base64'));
    assets.hero = 'assets/hero.jpg';
  }

  const logo = await downloadLogo(job.project?.logo_url, work, log);
  if (logo) assets.logo = logo;

  // The news template's presenter. A failed fetch just means anchor scenes
  // degrade to headlines — the job is not lost over a portrait.
  const presenterUrl = job.project?.presenter_image_url;
  if (presenterUrl) {
    const presenter = await downloadImage(presenterUrl, work, 'presenter', log);
    if (presenter) assets.presenter = presenter;
    else log('presenter: download failed — anchor scenes will fall back to headlines');
  }

  // Screenshots of the thing being sold. `source_url` is the explicit one
  // (a website-promo job); otherwise the project's own site.
  const siteUrl = job.source_url || job.project?.website_url || '';
  const wantsSite = WANTS_SITE.has(intent) || job.kind === 'website';
  if (siteUrl && wantsSite) {
    const { shots, text } = await captureSite(siteUrl, work, log);
    siteText = text || null;
    shots.slice(0, 2).forEach((p, i) => {
      // Copy to a role-named file so the storyboard can reference it without
      // knowing where captureSite happened to put it. The extension is kept:
      // Chrome sniffs a local file by name, and these are PNGs.
      const rel = `assets/site${i}.png`;
      try {
        copyFileSync(p, join(work, rel));
        assets[`site:${i}`] = rel;
      } catch { /* a shot we cannot copy is a shot we do not have */ }
    });
  }

  // Photos: for anything that shows a place or a product, and as the generic
  // texture for everything else.
  const media = await collectMedia(job, work, log);
  media.slice(0, 3).forEach((p, i) => { assets[`photo:${i}`] = p.replace(`${work}/`, ''); });

  // A map, only where a map is the point.
  if (intent === 'local_business') {
    const where = job.project?.address || job.project?.name || '';
    const map = await captureMaps(where, work, log);
    if (map) assets.map = map;
  }

  const roles = Object.keys(assets);
  log(`assets: ${roles.length ? roles.join(', ') : 'none — will fall back to the gradient'}`);
  return { assets, siteText };
}

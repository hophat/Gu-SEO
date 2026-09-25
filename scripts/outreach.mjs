// Outreach finder: unlinked mentions + broken link opportunities.
//
// Two link types that convert, both from pages you did not pay for:
//
//   1. Unlinked mention — a page already talks about the brand by name
//      but never links to it. The editor's intent is obvious and the ask
//      is small, which is exactly why these reply rates beat cold guest
//      post pitches.
//   2. Broken link — a page links to a resource that 404s. Offering your
//      own live page as the replacement is a service, not a trade.
//
// It only reads pages and writes a list. It never sends email, never
// posts a comment, and never touches anyone's CMS. You read the list and
// write the emails yourself, which is also the only version of this that
// survives being noticed.
//
//   node scripts/outreach.mjs --brand "Gulagi" --sitemaps https://site/sitemap.xml
//   node scripts/outreach.mjs --brand Gulagi --urls candidates.txt --limit 200
//   node scripts/outreach.mjs --brand Gulagi --brand seo.gulagi.com --json
//
// Flags:
//   --brand <name>       repeat; a page mentioning any of these without a
//                        link to your domain is a candidate
//   --domain <host>      your site; defaults to every brand that looks
//                        like a host, plus GULAGI_DOMAIN
//   --sitemaps <urls>    comma-separated sitemap URLs to harvest URLs from
//   --urls <file>        newline-delimited URLs
//   --limit <n>          max pages to fetch (default 100)
//   --concurrency <n>    parallel fetches (default 3, keep it low)
//   --no-robots          skip robots.txt checking (off by default on)
//   --out <file>         write Markdown to this path
//   --json               print the rows as JSON instead of Markdown

import fs from 'node:fs/promises';
import path from 'node:path';

const UA = 'pages-seo-outreach/1.0 (+https://github.com/Benjamin-Bloch/pages-seo)';
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 900_000;
const DEAD_STATUSES = new Set([404, 410]);

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}
const flag = (name) => process.argv.includes('--' + name);

const brands = [];
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--brand' && process.argv[i + 1]) brands.push(process.argv[i + 1]);
}
const domains = (arg('domain', '') || process.env.GULAGI_DOMAIN || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const limit = parseInt(arg('limit', '100'), 10) || 100;
const concurrency = Math.max(1, Math.min(8, parseInt(arg('concurrency', '3'), 10) || 3));
const outFile = arg('out', null);

async function get(url, { method = 'GET', maxBytes = MAX_BYTES } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA } });
    if (method === 'HEAD' || !res.ok) return { ok: res.ok, status: res.status, text: '', finalUrl: res.url };
    const reader = res.body?.getReader();
    let text = '';
    let bytes = 0;
    if (reader) {
      const dec = new TextDecoder();
      while (bytes < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        text += dec.decode(value, { stream: true });
      }
    } else {
      text = await res.text();
    }
    return { ok: true, status: res.status, text, finalUrl: res.url };
  } catch {
    return { ok: false, status: 0, text: '', finalUrl: url };
  } finally {
    clearTimeout(timer);
  }
}

// ── robots.txt ────────────────────────────────────────────────────────────
// Small parser: enough for Allow/Disallow on a user-agent, longest-match
// wins. Not a full RFC 9309 implementation — this only needs to keep the
// script from hammering paths a site asked us not to touch.
function parseRobots(txt, agent) {
  const rules = [];
  let applies = false;
  for (const rawLine of String(txt || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [rawField, ...rest] = line.split(':');
    const field = rawField.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (field === 'user-agent') {
      applies = value === '*' || value.toLowerCase() === agent.toLowerCase();
      continue;
    }
    if ((field === 'allow' || field === 'disallow') && applies) {
      rules.push({ allow: field === 'allow', path: value });
    }
  }
  return rules;
}

function robotsAllows(rules, pathname) {
  let best = null;
  for (const r of rules) {
    if (r.path === '') continue;                       // "Disallow:" alone means allow all
    if (pathname.startsWith(r.path)) {
      if (!best || r.path.length > best.path.length) best = r;
    }
  }
  return !best || best.allow;
}

// ── HTML helpers ──────────────────────────────────────────────────────────
const TAG_RE = /<[^>]+>/g;

function pageText(html) {
  return String(html || '')
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(TAG_RE, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Anchor text matters: it is what the editor would see when they decide
// where to point the new link.
function extractLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) continue;
    let abs;
    try {
      abs = new URL(href, baseUrl).toString();
    } catch { continue; }
    out.push({ url: abs, anchor: pageText(m[2]).slice(0, 120) });
  }
  return out;
}

async function sitemapUrls(url, seen = new Set(), depth = 0) {
  if (depth > 2 || seen.has(url) || seen.size > 5000) return [];
  seen.add(url);
  const res = await get(url);
  if (!res.ok) return [];
  const urls = [];
  const locRe = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let m;
  while ((m = locRe.exec(res.text)) !== null) {
    const loc = decodeEntities(m[1].trim());
    if (/\.xml($|\?)/i.test(loc)) {
      urls.push(...await sitemapUrls(loc, seen, depth + 1));
    } else if (/^https?:/i.test(loc)) {
      urls.push(loc);
    }
    if (urls.length >= 5000) break;
  }
  return urls;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

// ── the two finds ─────────────────────────────────────────────────────────
function findUnlinkedMentions({ pageUrl, html, brands, domains }) {
  const text = pageText(html);
  const lowered = text.toLowerCase();
  const links = extractLinks(html, pageUrl);
  const linkedHosts = new Set(links.map((l) => {
    try { return new URL(l.url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
  }));

  const hits = [];
  for (const brand of brands) {
    if (!brand) continue;
    const needle = brand.toLowerCase();
    if (!lowered.includes(needle)) continue;
    const brandHost = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(brand) ? brand.toLowerCase().replace(/^www\./, '') : null;
    // A mention only counts as unlinked when nothing on the page points
    // at us. One existing link is enough — the editor already linked once.
    const alreadyLinked = domains.length
      ? domains.some((d) => linkedHosts.has(d))
      : (brandHost ? linkedHosts.has(brandHost) : false);
    if (alreadyLinked) continue;
    const at = lowered.indexOf(needle);
    hits.push({
      kind: 'unlinked_mention',
      source_url: pageUrl,
      brand,
      context: text.slice(Math.max(0, at - 120), at + 160).trim(),
    });
  }
  return hits;
}

function findLinkCandidates({ pageUrl, links, domains }) {
  // Only external links are interesting: a dead internal link is the
  // site's own problem, not an outreach lead.
  const out = [];
  for (const l of links) {
    let host;
    try {
      const u = new URL(l.url);
      host = u.hostname.toLowerCase().replace(/^www\./, '');
    } catch { continue; }
    if (domains.includes(host)) continue;
    out.push({ ...l, host });
  }
  return out;
}

// One fetch per distinct URL, memoised across every page in the run: a
// popular resource linked from forty articles is checked once, and a
// site that mixes live and dead links no longer gets its live links
// reported dead just because a sibling on the same host 404s.
const statusCache = new Map();

async function checkDead(candidates) {
  const unique = [...new Set(candidates.map((c) => c.url))];
  await pool(unique, async (url) => {
    if (statusCache.has(url)) return null;
    const res = await get(url, { maxBytes: 4096 });
    statusCache.set(url, DEAD_STATUSES.has(res.status) || res.status === 0);
    return null;
  }, concurrency);
  return candidates.filter((c) => statusCache.get(c.url));
}

// ── run ───────────────────────────────────────────────────────────────────
async function collectUrls() {
  const urls = [];
  const sitemaps = String(arg('sitemaps', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const s of sitemaps) urls.push(...await sitemapUrls(s));
  const file = arg('urls', null);
  if (file && typeof file === 'string') {
    const raw = await fs.readFile(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (t && /^https?:/i.test(t)) urls.push(t);
    }
  }
  return [...new Set(urls)].slice(0, limit);
}

async function pool(items, worker, size) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      // A worker returns zero rows (skipped), a row, or a list of rows —
      // flatten here or every downstream count reads zero.
      const res = await worker(item);
      if (Array.isArray(res)) out.push(...res);
      else if (res) out.push(res);
    }
  }));
  return out;
}

const rows = [];
const urls = await collectUrls();

if (!brands.length && !domains.length) {
  console.error('Cần ít nhất --brand hoặc --domain. Không có gì để tìm.');
  process.exit(1);
}

const checked = await pool(urls, async (pageUrl) => {
  const u = new URL(pageUrl);
  const robotsUrl = new URL('/robots.txt', u.origin).toString();
  if (!flag('no-robots')) {
    const r = await get(robotsUrl, { maxBytes: 200_000 });
    if (r.ok && !robotsAllows(parseRobots(r.text, UA), u.pathname)) return null;
  }
  const res = await get(pageUrl);
  if (!res.ok || !res.text) return null;
  const finalUrl = res.finalUrl || pageUrl;

  const mentions = findUnlinkedMentions({ pageUrl: finalUrl, html: res.text, brands, domains });
  const candidates = findLinkCandidates({ pageUrl: finalUrl, links: extractLinks(res.text, finalUrl), domains });
  const dead = await checkDead(candidates);
  const broken = dead.map((d) => ({
    kind: 'broken_link',
    source_url: finalUrl,
    dead_url: d.url,
    anchor: d.anchor,
    host: d.host,
  }));
  return [...mentions, ...broken];
}, concurrency);

for (const r of checked) if (r) rows.push(r);

const byMention = rows.filter((r) => r.kind === 'unlinked_mention');
const byBroken = rows.filter((r) => r.kind === 'broken_link');

if (flag('json')) {
  console.log(JSON.stringify({ scanned: urls.length, unlinked_mentions: byMention.length, broken_links: byBroken.length, rows }, null, 2));
} else {
  const lines = [];
  lines.push('# Outreach list', '');
  lines.push(`Quét ${urls.length} trang · ${byMention.length} unlinked mention · ${byBroken.length} broken link`, '');
  if (byMention.length) {
    lines.push('## Unlinked mention', '');
    for (const r of byMention) {
      lines.push(`- **${r.brand}** — ${r.source_url}`);
      lines.push(`  > …${r.context}…`);
    }
    lines.push('');
  }
  if (byBroken.length) {
    lines.push('## Broken link', '');
    for (const r of byBroken) {
      lines.push(`- ${r.source_url}`);
      lines.push(`  - link chết: ${r.dead_url} (anchor: "${r.anchor || '—'}")`);
    }
    lines.push('');
  }
  if (!rows.length) lines.push('Không tìm thấy. Thử thêm nguồn URL hoặc thêm --brand khác.', '');
  const md = lines.join('\n');
  if (outFile && typeof outFile === 'string') {
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, md);
    console.log(`Đã ghi ${outFile} · ${byMention.length} mention · ${byBroken.length} broken link`);
  } else {
    console.log(md);
  }
}

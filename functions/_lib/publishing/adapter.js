// Per-channel content adaptation ("điều biến nội dung").
//
// One blog article must look native everywhere it lands. Each network has
// hard limits and soft conventions:
//
//   X (Twitter)   280 weighted chars — URLs count 23, CJK ~2, most letters 1
//   Threads       500 chars, first URL becomes the link preview
//   Instagram     caption max ~2200 chars, links are not clickable → the
//                 article URL goes into the profile bio, so the caption may
//                 only point at it
//   Facebook      message is intentionally short (the OG card carries the
//                 title) — buildFacebookMessage already handles it
//
// Everything here is pure: no fetch, no env, no D1. The publishers receive
// a ready payload { kind, text, media, link, notes } and only add auth +
// transport. Purity is what makes the trim rules testable without faking
// the network.

const X_LIMIT = 280;
const THREADS_LIMIT = 500;
const IG_CAPTION_LIMIT = 2200;

// X counts URL entities as a fixed 23 characters regardless of length —
// the same constant t.co uses — so the tweet's budget is 280 − 23 for any
// text that contains the link.
const X_URL_ENTITY = 23;
const X_URL_RE = /https?:\/\/[^\s<>"]+/gi;

// Weighted length per X's counting rules: most characters are weight 1
// (their code point counts as 1 in the default range configuration), but
// CJK / Hangul count as 2. Emoji are weight 2 per X's ranges; counting
// them 2 errs on the safe side (we trim before X would).
function xWeightedLength(str) {
  let n = 0;
  for (const ch of String(str || '')) {
    const cp = ch.codePointAt(0);
    if (
      (cp >= 0x1100 && cp <= 0x11ff) ||   // Hangul Jamo
      (cp >= 0x2e80 && cp <= 0xa4cf) ||   // CJK Radicals..Yi
      (cp >= 0xac00 && cp <= 0xd7a3) ||   // Hangul syllables
      (cp >= 0xf900 && cp <= 0xfaff) ||   // CJK Compatibility Ideographs
      (cp >= 0xfe30 && cp <= 0xfe4f) ||   // CJK Compatibility Forms
      (cp >= 0xff00 && cp <= 0xffef) ||   // Fullwidth Forms
      (cp >= 0x20000 && cp <= 0x2fffd) || // CJK Ext B..
      (cp >= 0x30000 && cp <= 0x3fffd) || // CJK Ext C..
      (cp >= 0x1f000 && cp <= 0x1fffd)    // Emoji blocks (safe-side)
    ) n += 2;
    else n += 1;
  }
  return n;
}

// Replace every URL's counted length with X's fixed 23-char entity cost.
export function xWeightedLengthWithUrls(str) {
  const s = String(str || '');
  const urls = s.match(X_URL_RE) || [];
  const withoutUrls = s.replace(X_URL_RE, '');
  return xWeightedLength(withoutUrls) + urls.length * X_URL_ENTITY;
}

// Vietnamese words carry diacritics as combining marks inside a word, so
// splitting on /\s+/ is the right token unit; slicing raw code points would
// cut "từ khoá" into "từ kho" + "á" style garbage.
function splitWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

// Grow the string word by word while it still fits the measured budget.
function fitWords(text, fits) {
  const words = splitWords(text);
  let out = '';
  for (const w of words) {
    const candidate = out ? `${out} ${w}` : w;
    if (out && !fits(candidate)) {
      out += '…';
      break;
    }
    out = candidate;
  }
  return out;
}

function stripMarkdown(s) {
  return String(s || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')           // raw URLs — re-added by the caller
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_~|#]+/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function articleLink(project, article) {
  const cd = String(project?.custom_domain || '').trim();
  const base = cd
    ? `https://${cd.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
    : String(project?.publishing_url || project?.website_url || '').replace(/\/+$/, '');
  const slug = String(article?.slug || '').trim();
  if (!base || !slug) return '';
  return `${base}/blog/${slug}`;
}

function heroUrl(project, article) {
  const key = String(article?.hero_image_key || '').trim();
  if (!key) return '';
  const base = articleLink(project, article);
  if (!base) return '';
  try { return `${new URL(base).origin}/image/${key}`; } catch { return ''; }
}

function hashtagsFor(article, extra) {
  const tags = new Set();
  for (const t of String(extra || '').split(/[,\s]+/)) {
    const clean = t.replace(/^#/, '').trim();
    if (clean) tags.add(clean);
  }
  for (const k of String(article?.keywords || '').split(',')) {
    const clean = k.trim().replace(/\s+/g, '').replace(/^#/, '');
    if (clean) tags.add(clean);
  }
  return [...tags].slice(0, 5).map((t) => `#${t}`);
}

// Build the natural lead of the article: meta description when present,
// otherwise the first non-heading paragraph.
function leadText(article) {
  const desc = String(article?.meta_description || '').trim();
  if (desc) return desc;
  const body = stripMarkdown(String(article?.body_markdown || ''));
  const firstPara = body.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)[0] || '';
  return firstPara;
}

// ── per-channel builders ─────────────────────────────────────────────

function buildX(project, article, cfg) {
  const link = articleLink(project, article);
  const title = String(article?.title || '').trim();
  const lead = leadText(article);
  const tags = hashtagsFor(article, cfg.hashtags);
  const fixed = tags.length ? `\n\n${tags.join(' ')}` : '';

  // Core text = title + lead + link. Trim the LEAD until the whole tweet
  // fits X's weighted budget (link costs 23, not its true length).
  let text = [title, lead, link].filter(Boolean).join('\n\n');
  if (xWeightedLengthWithUrls(text) > X_LIMIT) {
    const budget = (s) => xWeightedLengthWithUrls([title, s, link].filter(Boolean).join('\n\n')) <= X_LIMIT - (fixed ? fixed.length : 0);
    let trimmed = fitWords(lead, budget);
    if (!trimmed) {
      // Lead cannot contribute even one word — drop to title + link, and
      // trim the title itself if that still doesn't fit.
      let t2 = [title, link].filter(Boolean).join('\n\n');
      if (xWeightedLengthWithUrls(t2) > X_LIMIT) {
        const titleFit = fitWords(title, (s) => xWeightedLengthWithUrls(s + (title ? '' : '') ) <= X_LIMIT - 23 - (fixed ? fixed.length : 0));
        t2 = [titleFit, link].filter(Boolean).join('\n\n');
      }
      text = `${t2}${fixed}`;
      return { text, notes: ['lead_dropped'] };
    }
    text = `${[title, trimmed, link].filter(Boolean).join('\n\n')}${fixed}`;
    return { text, notes: ['lead_trimmed'] };
  }
  return { text: `${text}${fixed}`, notes: [] };
}

function buildThreads(project, article, cfg) {
  const link = articleLink(project, article);
  const title = String(article?.title || '').trim();
  const lead = leadText(article);
  const tags = hashtagsFor(article, cfg.hashtags);
  const tail = [...(tags.length ? ['\n\n' + tags.join(' ')] : []), link].filter(Boolean).join('');
  const bodyText = [title, lead].filter(Boolean).join('\n\n');

  if (xWeightedLength(bodyText) + xWeightedLength(tail) <= THREADS_LIMIT) {
    return { text: bodyText + tail, notes: [] };
  }
  // Threads counts plain characters (500 cap) — trim the lead on the raw
  // count, keep title + link intact.
  const fixedLen = xWeightedLength(tail);
  let lead2 = fitWords(lead, (s) => xWeightedLength(s) + fixedLen + xWeightedLength(title ? `${title}\n\n` : '') <= THREADS_LIMIT - 1);
  const text = [title, lead2, tail].filter(Boolean).join('\n\n');
  return { text, notes: ['lead_trimmed'] };
}

function buildInstagram(project, article, cfg) {
  const link = articleLink(project, article);
  const imageUrl = heroUrl(project, article);
  const title = String(article?.title || '').trim();
  const lead = leadText(article);
  const tags = hashtagsFor(article, cfg.hashtags);
  const tail = (tags.length ? `\n\n${tags.join(' ')}` : '')
    + (cfg.link_in_bio !== false ? '\n\n🔗 Link bài viết trong bio.' : '');

  if (!imageUrl) {
    // Instagram cannot post text-only. Say so instead of inventing media.
    return {
      kind: 'unsupported',
      reason: 'Instagram cần ảnh (hero image) — bài viết này chưa có ảnh bìa.',
      notes: ['no_hero_image'],
    };
  }

  const caption = [title, lead].filter(Boolean).join('\n\n');
  if (xWeightedLength(caption) + xWeightedLength(tail) <= IG_CAPTION_LIMIT) {
    return { kind: 'photo', text: caption + tail, media: [imageUrl], link, notes: [] };
  }
  const fixedLen = xWeightedLength(tail);
  const lead2 = fitWords(lead, (s) => xWeightedLength(s) + fixedLen + xWeightedLength(`${title}\n\n`) <= IG_CAPTION_LIMIT - 1);
  return {
    kind: 'photo',
    text: [title, lead2, tail].filter(Boolean).join('\n\n'),
    media: [imageUrl],
    link,
    notes: ['lead_trimmed'],
  };
}

function buildFacebook(project, article, cfg) {
  // buildFacebookMessage already encodes Facebook's rules; keep this
  // builder a thin wrapper so the switch below stays uniform.
  const link = articleLink(project, article);
  const desc = String(article?.meta_description || '').trim();
  const text = desc ? desc.slice(0, 400) : String(article?.title || '').trim();
  return { kind: link ? 'link' : 'text', text, media: [], link, notes: [] };
}

function buildGenericLink(project, article) {
  const link = articleLink(project, article);
  return {
    kind: 'link',
    text: String(article?.meta_description || article?.title || '').trim(),
    media: [],
    link,
    notes: [],
  };
}

// Entry point. Returns a channel-ready payload:
//   { kind, text, media[], link, notes[] }   (kind may be 'unsupported')
export function adaptArticleForChannel(channel, project, article, cfg = {}) {
  const link = articleLink(project, article);
  const fallback = buildGenericLink(project, article);
  let out;
  switch (channel) {
    case 'x':        out = buildX(project, article, cfg); break;
    case 'threads':  out = buildThreads(project, article, cfg); break;
    case 'instagram': out = buildInstagram(project, article, cfg); break;
    case 'facebook':  out = buildFacebook(project, article, cfg); break;
    default:         out = fallback;
  }
  return {
    kind: out.kind || 'text',
    text: out.text || '',
    media: out.media || [],
    link,
    notes: out.notes || [],
    // 'unsupported' payloads carry the operator-facing reason (e.g. IG
    // without a hero image) — dropping it made the failure unexplainable.
    reason: out.reason || null,
  };
}

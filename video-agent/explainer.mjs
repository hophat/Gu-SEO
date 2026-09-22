// Explainer scene vocabulary — turns a *structured plan* into markup.
//
// The LLM never writes HTML. It fills a typed plan (see PLAN SCHEMA below)
// and this module draws it. That split is what makes the video
// deterministic, testable without Chrome, and impossible to break with a
// stray character from an article.
//
// Drawing rules learned from the 720px canvas:
//   - SVG carries SHAPES only (arcs, polylines, arrows). Labels are HTML.
//     SVG <text> cannot wrap, and Vietnamese labels are long.
//   - Everything is a pure function of (scene, accent): same input, same
//     string out, so a snapshot at any time is reproducible.
//
// Icons: a subset of Feather (MIT, © Cole Bemis) inlined as path data —
// no network, no icon font, no CDN.
//
// PLAN SCHEMA
//   { title, scenes: [ { type, say, ... } ] }
//   hook     { text }
//   stat     { value, unit?, label, icon? }
//   bars     { title?, unit?, items: [{ label, value }] }
//   donut    { value, label }                    // value = percent 0-100
//   line     { title?, unit?, items: [{ label, value }] }
//   steps    { title?, items: [{ icon?, label }] }
//   timeline { title?, items: [{ label, text }] }
//   icons    { title?, items: [{ icon, label }] }
//   compare  { title?, left: {title, items[]}, right: {title, items[]} }
//   quote    { text, source? }
//   outro    { text, url? }

export const SCENE_TYPES = [
  'hook', 'stat', 'bars', 'donut', 'line', 'steps', 'timeline', 'icons', 'compare', 'quote', 'outro',
];

// A 45-75s video at ~3.3 words/second of Vietnamese TTS. Five scenes is the
// shortest thing that still explains anything; nine is where the render
// time and the viewer's patience both run out.
export const MIN_SCENES = 5;
export const MAX_SCENES = 9;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

// ── colour ───────────────────────────────────────────────────────────
// Charts need tints of the brand colour (tracks, grid lines, the softer
// half of a pair). Accepts #rgb/#rrggbb; anything else falls back.
export function hexToRgb(hex) {
  const h = String(hex || '').trim().replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return { r: 22, g: 119, b: 255 };
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function withAlpha(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ── icons (Feather subset, MIT © Cole Bemis) ─────────────────────────
const ICON_PATHS = {
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  truck: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3L22 7l-3-3"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
  percent: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
};

export const ICON_NAMES = Object.keys(ICON_PATHS);
export const DEFAULT_ICON = 'star';

// An unknown name must not break the markup — the plan is model output.
export function icon(name, size = 48) {
  const key = ICON_PATHS[name] ? name : DEFAULT_ICON;
  return `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" `
    + `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" `
    + `data-icon="${key}">${ICON_PATHS[key]}</svg>`;
}

// ── formatting ───────────────────────────────────────────────────────

// Vietnamese groups thousands with '.' — "1.000.000" not "1,000,000".
export function fmtNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? n.toLocaleString('en-US').replace(/,/g, '.') : String(n);
}

function clampPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

// ── primitives ───────────────────────────────────────────────────────
// Each returns the INNER html of a scene. `.ex` is the shared wrapper the
// shell styles.

function exTitle(t) {
  return t ? `<p class="ex-title">${esc(t)}</p>` : '';
}

// "40" and "1.000.000" cannot share a font size: at 608px of content width
// a 150px digit is ~82px wide, so anything past six characters has to step
// down or it runs off the frame.
export function statSize(text) {
  const n = String(text ?? '').length;
  if (n <= 4) return 150;
  if (n <= 6) return 118;
  if (n <= 9) return 86;
  return 64;
}

export function statCard(s, accent) {
  const iconHtml = s.icon ? `<div class="stat-ico">${icon(s.icon, 56)}</div>` : '';
  const num = fmtNum(s.value);
  return `<div class="ex stat">
    ${iconHtml}
    <div class="stat-v"><span class="stat-n" style="font-size:${statSize(num)}px">${esc(num)}</span><span class="stat-u">${esc(s.unit || '')}</span></div>
    <p class="stat-l">${esc(s.label || '')}</p>
  </div>`;
}

export function barChart(s, accent) {
  const items = Array.isArray(s.items) ? s.items.slice(0, 6) : [];
  const max = Math.max(...items.map((i) => Math.abs(Number(i.value)) || 0), 1);
  const rows = items.map((i) => {
    const pct = Math.max(3, Math.round((Math.abs(Number(i.value)) || 0) / max * 100));
    return `<div class="bar-row">
      <span class="bar-lab">${esc(i.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${accent}"></span></span>
      <span class="bar-val">${esc(fmtNum(i.value))}${esc(s.unit || '')}</span>
    </div>`;
  }).join('');
  return `<div class="ex">${exTitle(s.title)}<div class="bars">${rows}</div></div>`;
}

export function donut(s, accent) {
  const pct = clampPct(s.value);
  const r = 132;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return `<div class="ex donut">
    <div class="donut-wrap">
      <svg viewBox="0 0 320 320" width="320" height="320">
        <circle cx="160" cy="160" r="${r}" fill="none" stroke="${withAlpha(accent, 0.18)}" stroke-width="30"/>
        <circle cx="160" cy="160" r="${r}" fill="none" stroke="${accent}" stroke-width="30"
          stroke-linecap="round" stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}"
          transform="rotate(-90 160 160)"/>
      </svg>
      <div class="donut-c"><span class="donut-n">${esc(fmtNum(pct))}%</span></div>
    </div>
    <p class="stat-l">${esc(s.label || '')}</p>
  </div>`;
}

export function lineChart(s, accent) {
  const items = Array.isArray(s.items) ? s.items.slice(0, 8) : [];
  const vals = items.map((i) => Number(i.value) || 0);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const span = max - min || 1;
  const W = 620, H = 300, PAD = 24;
  const step = items.length > 1 ? (W - PAD * 2) / (items.length - 1) : 0;
  const pts = vals.map((v, i) => {
    const x = PAD + i * step;
    const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
    return [x, y];
  });
  const poly = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const dots = pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${accent}"/>`).join('');
  const labels = items.map((i, n) =>
    `<span class="line-lab" style="left:${((PAD + n * step) / W * 100).toFixed(2)}%">${esc(i.label)}</span>`).join('');
  return `<div class="ex">${exTitle(s.title)}
    <div class="line-wrap">
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
        <polyline points="${poly}" fill="none" stroke="${accent}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
      </svg>
      <div class="line-labs">${labels}</div>
    </div>
  </div>`;
}

export function steps(s, accent) {
  const items = Array.isArray(s.items) ? s.items.slice(0, 5) : [];
  const rows = items.map((it, i) => `<div class="step">
      <div class="step-n" style="background:${accent}">${i + 1}</div>
      <div class="step-b">
        <p class="step-t">${it.icon ? icon(it.icon, 34) : ''}${esc(it.label)}</p>
        ${it.detail ? `<p class="step-d">${esc(it.detail)}</p>` : ''}
      </div>
    </div>${i < items.length - 1 ? '<div class="step-arrow"></div>' : ''}`).join('');
  return `<div class="ex">${exTitle(s.title)}<div class="steps">${rows}</div></div>`;
}

export function timeline(s, accent) {
  const items = Array.isArray(s.items) ? s.items.slice(0, 5) : [];
  const rows = items.map((it) => `<div class="tl-row">
      <span class="tl-dot" style="background:${accent}"></span>
      <div class="tl-b"><p class="tl-l">${esc(it.label)}</p>${it.text ? `<p class="tl-t">${esc(it.text)}</p>` : ''}</div>
    </div>`).join('');
  return `<div class="ex">${exTitle(s.title)}<div class="timeline">${rows}</div></div>`;
}

export function iconGrid(s, accent) {
  const items = Array.isArray(s.items) ? s.items.slice(0, 6) : [];
  const cells = items.map((it) => `<div class="ig-item">
      <span class="ig-ico" style="color:${accent}">${icon(it.icon, 64)}</span>
      <span class="ig-lab">${esc(it.label)}</span>
    </div>`).join('');
  return `<div class="ex">${exTitle(s.title)}<div class="icon-grid">${cells}</div></div>`;
}

export function compare(s, accent) {
  const col = (side, good) => {
    const items = Array.isArray(side?.items) ? side.items.slice(0, 4) : [];
    const rows = items.map((t) => `<p class="cmp-i">
        <span class="cmp-m ${good ? 'good' : 'bad'}">${icon(good ? 'check' : 'x', 30)}</span>${esc(t)}
      </p>`).join('');
    return `<div class="cmp-col ${good ? 'cmp-good' : 'cmp-bad'}">
      <p class="cmp-h">${esc(side?.title || '')}</p>${rows}</div>`;
  };
  return `<div class="ex">${exTitle(s.title)}<div class="compare">${col(s.left, true)}${col(s.right, false)}</div></div>`;
}

export function quoteCard(s, accent) {
  return `<div class="ex quote">
    <span class="quote-mark" style="color:${accent}">“</span>
    <p class="quote-t">${esc(s.text || '')}</p>
    ${s.source ? `<p class="quote-s">${esc(s.source)}</p>` : ''}
  </div>`;
}

export function outroCard(s, accent) {
  const url = String(s.url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `<div class="ex outro-wrap">
    <p class="outro">${esc(s.text || 'Đọc bài viết đầy đủ')}</p>
    ${url ? `<p class="sub">${esc(url)}</p>` : ''}
  </div>`;
}

// Dispatch one scene to its primitive. Unknown types render nothing —
// sanitizePlan drops them before this point, but a stray one must not
// throw inside a render.
export function sceneInner(scene, accent = '#1677ff') {
  switch (scene?.type) {
    case 'hook': return `<h1 class="hook">${esc(scene.text)}</h1>`;
    case 'stat': return statCard(scene, accent);
    case 'bars': return barChart(scene, accent);
    case 'donut': return donut(scene, accent);
    case 'line': return lineChart(scene, accent);
    case 'steps': return steps(scene, accent);
    case 'timeline': return timeline(scene, accent);
    case 'icons': return iconGrid(scene, accent);
    case 'compare': return compare(scene, accent);
    case 'quote': return quoteCard(scene, accent);
    case 'outro': return outroCard(scene, accent);
    default: return '';
  }
}

// ── the truth guard ──────────────────────────────────────────────────
// A plan may only show numbers the article actually contains. An LLM that
// invents "tăng 47%" makes the video lie about the source, which is worse
// than a plainer video. Digits are compared with all separators stripped,
// so "1.000.000" and "1000000" match and "3,5" matches "3.5".
export function numbersIn(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/\d[\d.,]*/g)) {
    const digits = m[0].replace(/[^\d]/g, '');
    if (digits) out.add(digits.replace(/^0+(?=\d)/, ''));
  }
  return out;
}

const numOf = (v) => String(v ?? '').replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');

function keepNumbers(items, have) {
  return (Array.isArray(items) ? items : []).filter((i) => have.has(numOf(i?.value)));
}

// Returns { plan, dropped } — a plan that is safe to draw. Never throws:
// a bad plan degrades to a shorter one, and the caller falls back to the
// article if too little survives.
export function sanitizePlan(plan, article) {
  const have = numbersIn(article);
  const dropped = [];
  const scenes = [];

  for (const [index, raw] of (Array.isArray(plan?.scenes) ? plan.scenes : []).entries()) {
    const type = raw?.type;
    if (!SCENE_TYPES.includes(type)) { dropped.push({ index, type: String(type), reason: 'unknown_type' }); continue; }

    if (type === 'stat') {
      if (!raw.label || !have.has(numOf(raw.value))) { dropped.push({ index, type, reason: 'number_not_in_article' }); continue; }
      scenes.push(raw);
    } else if (type === 'donut') {
      if (!have.has(numOf(raw.value))) { dropped.push({ index, type, reason: 'number_not_in_article' }); continue; }
      scenes.push(raw);
    } else if (type === 'bars' || type === 'line') {
      const items = keepNumbers(raw.items, have);
      const lost = (raw.items?.length || 0) - items.length;
      if (items.length < 2) { dropped.push({ index, type, reason: 'too_few_verified_numbers', lost }); continue; }
      if (lost) dropped.push({ index, type, reason: 'some_numbers_not_in_article', lost });
      scenes.push({ ...raw, items });
    } else if (type === 'icons') {
      scenes.push({ ...raw, items: (raw.items || []).map((i) => ({ ...i, icon: ICON_PATHS[i?.icon] ? i.icon : DEFAULT_ICON })) });
    } else if (type === 'compare') {
      if (!raw.left?.items?.length && !raw.right?.items?.length) { dropped.push({ index, type, reason: 'empty' }); continue; }
      scenes.push(raw);
    } else if (type === 'steps' || type === 'timeline') {
      if (!(raw.items || []).length) { dropped.push({ index, type, reason: 'empty' }); continue; }
      scenes.push(raw);
    } else if (type === 'hook' || type === 'quote') {
      if (!raw.text) { dropped.push({ index, type, reason: 'empty' }); continue; }
      scenes.push(raw);
    } else {
      scenes.push(raw);
    }
  }

  // One hook at the front, one outro at the end, and a length the video
  // budget can carry.
  const trimmed = scenes.slice(0, MAX_SCENES);
  if (scenes.length > MAX_SCENES) dropped.push({ index: MAX_SCENES, type: '(rest)', reason: 'over_max_scenes', lost: scenes.length - MAX_SCENES });
  return { plan: { title: plan?.title || '', scenes: trimmed }, dropped };
}

// ── deterministic fallback ───────────────────────────────────────────
// GuRouter can be down, rate-limited or simply wrong. The carousel already
// answers that by deriving its slides from the article itself, and an
// explainer must do the same: every scene below is lifted from the text, so
// it passes the number guard by construction and the job never fails for
// want of a model.
function cut(s, max) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  const slice = t.slice(0, max);
  const sp = slice.lastIndexOf(' ');
  return (sp > max * 0.6 ? slice.slice(0, sp) : slice).trim() + '…';
}

function stripMarkdown(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_`>]/g, ' ');
}

// Icons for the fallback grid, in a fixed rotation so the same article
// always draws the same grid.
const FALLBACK_ICONS = ['check', 'clock', 'trend', 'shield', 'users', 'star'];

// A year is not a statistic. "Trong năm 2026, 53% người dùng sẽ rời bỏ" must
// chart 53, not 2026 — taking the first number in the sentence put a 2026 bar
// next to a 25 bar and made every real number invisible. Prefer a number the
// sentence marks as a quantity (followed by %), then the first that is not a
// bare year.
export function pickNumber(sentence) {
  const s = String(sentence || '');
  const all = [...s.matchAll(/\d[\d.,]*/g)].map((m) => m[0]);
  if (!all.length) return null;
  const isYear = (t) => /^(19|20)\d{2}$/.test(t.replace(/[.,]/g, ''));
  const percent = all.find((t) => new RegExp(`${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*%`).test(s));
  return percent || all.find((t) => !isYear(t)) || all[0];
}

// A chart label is a phrase, not the sentence the number came from. Reading
// a whole sentence into a 210px column wraps it over three lines and crowds
// the bars out — measured on a real render. So take the words that follow
// the number ("…53% người dùng sẽ rời bỏ" → "người dùng sẽ rời bỏ"), and
// fall back to the words before it when the number ends the clause.
function labelNear(sentence, token) {
  const s = String(sentence || '');
  // A label is not a sentence: no trailing full stop, no leading punctuation.
  const tidy = (t) => t.replace(/[.!?…:;,]+$/u, '').trim();
  const idx = s.indexOf(token);
  if (idx < 0) return tidy(cut(s, 26));
  const after = s.slice(idx + token.length).replace(/^[^\p{L}]+/u, '').trim();
  const before = s.slice(0, idx).replace(/[^\p{L}\d]+$/u, '').trim();
  return tidy(cut(after.length >= 10 ? after : (before || after), 26));
}

export function planFromMarkdown(md, title = '') {
  const text = stripMarkdown(md);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const bullets = lines
    .filter((l) => /^([-*+]|\d+[.)])\s+/.test(l))
    .map((l) => l.replace(/^([-*+]|\d+[.)])\s+/, '').trim())
    .filter((l) => l.length > 8);
  // Every fragment is a candidate for a number; only the longer ones are
  // good enough to quote. A short "Vận chuyển chỉ 7%." is real data and
  // must not be filtered out just because it is brief.
  const parts = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 8);

  // Numbers with a phrase from the clause they came from — never a number
  // the article does not contain, and never a whole sentence as a label.
  const seen = new Set();
  const nums = [];
  for (const s of parts) {
    const token = pickNumber(s);
    if (!token) continue;
    const digits = token.replace(/[^\d]/g, '');
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    // Remember whether the article wrote this as a percentage, so the chart
    // can say "53%" instead of a bare "53" that reads as a count.
    nums.push({
      label: labelNear(s, token),
      value: token,
      percent: new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*%`).test(s),
    });
    // Four bars fit the frame with room for a wrapped label; a fifth starts
    // squeezing the chart and lengthening the read.
    if (nums.length >= 4) break;
  }

  // Headings are the second source of short points, used when the bullets
  // have already been spent on the steps scene.
  const headings = String(md || '').split('\n').map((l) => l.trim())
    .filter((l) => /^#{2,4}\s+\S/.test(l))
    .map((l) => l.replace(/^#+\s+/, '').trim())
    .filter((l) => l.length > 6 && l.length < 70);

  const scenes = [{ type: 'hook', text: cut(title || lines[0] || 'Bài viết', 70) }];
  // A chart shares one unit; only claim '%' when every bar is a percentage.
  const barsUnit = nums.length && nums.every((n) => n.percent) ? '%' : '';
  if (nums.length >= 2) {
    scenes.push({
      type: 'bars', title: 'Những con số trong bài', unit: barsUnit,
      items: nums.map(({ label, value }) => ({ label, value })),
    });
  }

  // Steps and icons must not read the same list back to back — the first
  // fallback showed the same three bullets twice in a 79s video.
  let usedBullets = 0;
  if (bullets.length >= 3) {
    scenes.push({ type: 'steps', title: 'Các bước chính', items: bullets.slice(0, 3).map((l) => ({ label: cut(l, 40) })) });
    usedBullets = 3;
  }
  const spare = bullets.slice(usedBullets).length >= 2 ? bullets.slice(usedBullets) : headings;
  if (spare.length >= 2) {
    scenes.push({
      type: 'icons',
      title: 'Điểm chính',
      items: spare.slice(0, 4).map((l, i) => ({ icon: FALLBACK_ICONS[i % FALLBACK_ICONS.length], label: cut(l, 26) })),
    });
  }
  const quote = parts.filter((s) => s.length > 30).sort((a, b) => b.length - a.length)[0];
  if (quote) scenes.push({ type: 'quote', text: cut(quote, 110) });

  // A video shorter than MIN_SCENES is not worth rendering; fill from the
  // remaining headings, then from the numbers one at a time.
  for (const n of nums.slice(1, 4)) {
    if (scenes.length >= MIN_SCENES) break;
    scenes.push({ type: 'stat', value: n.value, label: n.label, unit: n.percent ? '%' : '', icon: 'trend' });
  }
  scenes.push({ type: 'outro', text: 'Đọc bài viết đầy đủ' });
  return { title: title || '', scenes: scenes.slice(0, MAX_SCENES) };
}

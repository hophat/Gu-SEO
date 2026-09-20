#!/usr/bin/env node
// pages-seo video agent — one invocation renders one 9:16 social video.
//
//   node render-video.mjs                 # auto-claim the newest queued post
//   node render-video.mjs --slug <slug>   # render one specific post
//   node render-video.mjs --type business --project <project_id>
//
// Two job kinds:
//   post     — a published blog post becomes a narrated summary video
//   business — a per-project promo (AI Video Post): brand kit from the
//              claim payload drives every visual; the LLM writes within
//              the DNA, the template renders the tokens.
//
// Pipeline: claim → GuRouter script → edge-tts (vi-VN) → HyperFrames
// composition → render → deliver MP4 back to the platform (R2 + D1).
//
// Config in video-agent/.env (0600): BASE_URL, ADMIN_TOKEN,
// GUROUTER_API_KEY, VIDEO_VOICE, VIDEO_PROJECT_ID, VIDEO_BATCH, ACCENT.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const HF_VERSION = '0.8.56';

// ── config ────────────────────────────────────────────────────────────
const cfg = {};
try {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) cfg[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch { /* no .env — process env only */ }
const E = (k) => process.env[k] ?? cfg[k] ?? null;

const BASE_URL = (E('BASE_URL') || '').replace(/\/+$/, '');
const TOKEN = E('ADMIN_TOKEN');
const GUROUTER_KEY = E('GUROUTER_API_KEY');
const GUROUTER_BASE = (E('GUROUTER_BASE_URL') || 'https://gurouter.com/v1').replace(/\/+$/, '');
const GUROUTER_MODEL = E('GUROUTER_TEXT_MODEL') || 'deepseek/deepseek-v4-flash';
const VOICE = E('VIDEO_VOICE') || 'vi-VN-NamMinhNeural';
const PROJECT_ID = E('VIDEO_PROJECT_ID');
const ACCENT = E('ACCENT') || '#1677ff';
const BATCH = Math.max(1, parseInt(E('VIDEO_BATCH') || '1', 10) || 1);
const SLUG = process.argv.includes('--slug') ? process.argv[process.argv.indexOf('--slug') + 1] : null;
const TYPE = process.argv.includes('--type') ? process.argv[process.argv.indexOf('--type') + 1] : null;
const PROJECT_ARG = process.argv.includes('--project') ? process.argv[process.argv.indexOf('--project') + 1] : null;

const log = (m) => console.log(`[video-agent] ${m}`);
const die = (m) => { console.error(`[video-agent] FAIL: ${m}`); process.exit(1); };
if (!BASE_URL || !TOKEN) die('BASE_URL / ADMIN_TOKEN missing — configure video-agent/.env');

const WORK = join(ROOT, 'workspace');
const api = (path, opts = {}) => fetch(`${BASE_URL}${path}`, {
  ...opts,
  headers: { authorization: `Bearer ${TOKEN}`, ...(opts.headers || {}) },
});

// ── 1. claim ──────────────────────────────────────────────────────────
// Default sweep: business promos first (admin-created, one per project),
// then the newest queued post. Explicit --type/--slug overrides that.
async function claim() {
  const body = {};
  if (SLUG) body.slug = SLUG;
  if (TYPE) body.type = TYPE;
  else if (PROJECT_ID || PROJECT_ARG) body.project_id = PROJECT_ID || PROJECT_ARG;
  if (!TYPE) {
    const biz = await api('/api/admin/video/claim', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, type: 'business' }),
    });
    const bdata = await biz.json().catch(() => ({}));
    if (bdata?.job) return bdata.job;
  }
  const r = await api('/api/admin/video/claim', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`claim HTTP ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data.job;
}

// Report a terminal failure for this job so the platform shows why.
async function reportFailure(job, message) {
  if (!job) return;
  try {
    await api('/api/admin/video/deliver', {
      method: 'POST',
      headers: { 'x-video-job': job.id, 'content-type': 'application/json' },
      body: JSON.stringify({ error: String(message).slice(0, 400) }),
    });
  } catch { /* delivery of the failure notice is best-effort */ }
}

// ── 2. script — GuRouter chat completion, strict JSON ────────────────
async function writeScript(job) {
  if (!GUROUTER_KEY) throw new Error('GUROUTER_API_KEY missing in video-agent/.env');
  const sys = 'Bạn là biên kịch video ngắn 9:16 cho mạng xã hội. Chỉ trả JSON thuần, không markdown.';
  const user = `Viết kịch bản video ~40 giây cho bài blog sau.

Tiêu đề: ${job.title}
Mô tả: ${job.meta_description || ''}
Nội dung (rút gọn): ${(job.body_markdown || '').slice(0, 3500)}

Trả JSON đúng schema:
{"hook":"câu mở đầu gây tò mò, tối đa 18 từ","points":["điểm 1, tối đa 20 từ","điểm 2, tối đa 20 từ","điểm 3, tối đa 20 từ"],"cta":"lời kêu gọi hành động kèm lý do, tối đa 15 từ"}
Yêu cầu: tiếng Việt tự nhiên, mỗi point là 1 câu hoàn chỉnh, không emoji, không markdown.`;
  const r = await fetch(`${GUROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${GUROUTER_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: GUROUTER_MODEL,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      temperature: 0.6, max_tokens: 1500, response_format: { type: 'json_object' },
    }),
  }).catch((e) => { throw new Error('gurouter_unreachable: ' + e.message); });
  if (!r.ok) throw new Error(`gurouter HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const raw = data?.choices?.[0]?.message?.content || '';
  const parsed = parseScript(raw);
  const points = (parsed.points || []).slice(0, 3).map((p) => String(p).trim()).filter(Boolean);
  if (!parsed.hook || !points.length || !parsed.cta) throw new Error('script_schema_bad: ' + raw.slice(0, 150));
  return { hook: String(parsed.hook).trim(), points, cta: String(parsed.cta).trim() };
}

// Small models truncate mid-string at the token cap ("Unterminated string").
// Repair by closing whatever is still open — good enough for these fixed
// schemas, and a regex fallback recovers the fields individually.
function parseScript(raw) {
  let s = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const first = s.indexOf('{');
  if (first > 0) s = s.slice(first);
  const tryParse = (txt) => { try { return JSON.parse(txt); } catch { return null; } };

  const direct = tryParse(s);
  if (direct) return direct;

  let inStr = false, esc = false, curly = 0, bracket = 0;
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') inStr = !inStr;
    if (!inStr) { if (ch === '{') curly++; else if (ch === '}') curly--; else if (ch === '[') bracket++; else if (ch === ']') bracket--; }
  }
  let fixed = s.replace(/,\s*$/, '');
  if (inStr) fixed += '"';
  fixed += ']'.repeat(Math.max(0, bracket)) + '}'.repeat(Math.max(0, curly));
  const repaired = tryParse(fixed);
  if (repaired) return repaired;

  const str = (name) => {
    const m = s.match(new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`));
    return m ? m[1] : '';
  };
  const pts = s.match(/"points"\s*:\s*\[([\s\S]*?)(?:\]|$)/) || s.match(/"highlights"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
  const items = pts ? [...pts[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]) : [];
  // Business schema: line1/line2 are separate string fields.
  const line1 = str('line1');
  const line2 = str('line2');
  const lines = [line1, line2].filter(Boolean).length ? [line1, line2].filter(Boolean) : items;
  return {
    hook: str('hook') || str('tagline'),
    points: items,
    lines,
    cta: str('cta'),
    tagline: str('tagline'),
    highlights: items,
  };
}

// ── 2b. business script — per-project promo (AI Video Post) ──────────
// The brand kit from the claim payload constrains everything: the LLM
// writes within the DNA (tone/audience), the template renders the brand
// tokens (accent/tagline/address) — never invented per video.
async function writeBusinessScript(job) {
  if (!GUROUTER_KEY) throw new Error('GUROUTER_API_KEY missing in video-agent/.env');
  const p = job.project || {};
  const sys = 'Bạn là biên kịch video ngắn 9:16 cho mạng xã hội. Chỉ trả JSON thuần, không markdown.';
  const user = `Viết kịch bản video giới thiệu doanh nghiệp ~16 giây.

Tên: ${p.name || job.title}
Mô tả: ${(p.description || job.body_markdown || '').slice(0, 800)}
Loại hình: ${p.brand?.business_type || 'không rõ'}
Giọng thương hiệu: ${p.brand?.tone || 'thân thiện'}
Khách hàng: ${p.brand?.audience || ''}
3 điểm nổi bật gợi ý: ${(job.highlights || []).join('; ') || '(tự chọn từ mô tả)'}
Khu vực: ${p.brand?.service_area || ''}

Trả JSON đúng schema:
{"tagline":"khẩu hiệu 4-6 từ","line1":"cần kéo khách, tối đa 7 từ","line2":"câu đôi với line1, tối đa 7 từ","highlights":["điểm 1, tối đa 9 từ","điểm 2, tối đa 9 từ","điểm 3, tối đa 9 từ"],"cta":"lời mời hành động, tối đa 8 từ"}
Yêu cầu: tiếng Việt tự nhiên theo giọng thương hiệu, không emoji, không markdown.`;
  const r = await fetch(`${GUROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${GUROUTER_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: GUROUTER_MODEL,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      temperature: 0.6, max_tokens: 800, response_format: { type: 'json_object' },
    }),
  }).catch((e) => { throw new Error('gurouter_unreachable: ' + e.message); });
  if (!r.ok) throw new Error(`gurouter HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const raw = data?.choices?.[0]?.message?.content || '';
  const parsed = parseScript(raw);
  // The model may emit `lines` as an array OR `line1`/`line2` as separate
  // fields (and truncation drops trailing ones) — normalise to 2 lines,
  // falling back to the highlights so the voice track is never empty.
  const lines = (parsed.lines?.length ? parsed.lines : [parsed.line1, parsed.line2])
    .map((s) => String(s || '').trim()).filter(Boolean);
  const highlights = (job.highlights?.length ? job.highlights : (parsed.highlights || []))
    .slice(0, 3).map((s) => String(s || '').trim()).filter(Boolean);
  // Truncated completions lose trailing fields — degrade gracefully:
  // cta falls back to the Brand DNA's CTA, then a neutral invite.
  if (!parsed.tagline || (!lines.length && !highlights.length)) {
    throw new Error('business_script_schema_bad: ' + raw.slice(0, 150));
  }
  return {
    tagline: String(parsed.tagline).trim(),
    lines: lines.length ? lines : highlights.slice(0, 1),
    highlights,
    cta: String(parsed.cta || p.brand?.cta || 'Xem thêm tại website của chúng tôi').trim(),
  };
}

// ── 3. tts — edge-tts per segment, duration via ffprobe ──────────────
function tts(text, outPath) {
  const r = spawnSync('edge-tts', ['--voice', VOICE, '--rate=+8%', '--text', text, '--write-media', outPath], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(outPath)) {
    throw new Error(`edge-tts failed (${r.status}): ${(r.stderr || '').toString().slice(0, 200)}`);
  }
}
function audioSeconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const d = parseFloat((r.stdout || '').trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error('ffprobe_duration_missing');
  return d;
}

// ── 4. composition helpers ────────────────────────────────────────────
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])); }
// Lighten/darken a hex colour by amt (-1..1) — used for brand gradients.
function shade(hex, amt) {
  const m = String(hex || '').match(/^#([0-9a-f]{6})$/i);
  if (!m) return amt < 0 ? '#0a0c10' : '#152238';
  const n = parseInt(m[1], 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return '#' + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Post composition — hook → points → outro, scenes timed to TTS.
function composeHtml(job, script, segs) {
  const brand = job.project?.name || 'Blog';
  const outroUrl = (job.project?.publishing_url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const accent = job.project?.accent || ACCENT;
  const hasHero = existsSync(join(WORK, 'assets', 'hero.jpg'));
  const GAP = 0.4;
  const scenes = [
    { kind: 'intro', seg: segs[0] },
    ...script.points.map((p, i) => ({ kind: 'point', text: p, n: i + 1, seg: segs[i + 1] })),
    { kind: 'outro', text: script.cta, seg: segs[segs.length - 1] },
  ];
  let t = 0;
  const sceneHtml = [];
  const bgEls = [];
  for (const [i, s] of scenes.entries()) {
    s.start = t;
    s.dur = s.seg + GAP;
    const inner = s.kind === 'intro'
      ? `<div class="badge">${esc(brand)}</div><h1 class="hook">${esc(script.hook)}</h1>`
      : s.kind === 'point'
        ? `<div class="num">${i}</div><p class="point">${esc(s.text)}</p>`
        : `<p class="outro">${esc(s.text)}</p><p class="sub">${esc(outroUrl)}</p>`;
    sceneHtml.push(`<div id="s${i}" class="clip scene" data-start="${t.toFixed(2)}" data-duration="${s.dur.toFixed(2)}" data-track-index="0">${inner}</div>`);
    if (hasHero && s.kind === 'point') {
      s.bgId = `bg${bgEls.length}`;
      bgEls.push(s);
      sceneHtml.push(`<div id="${s.bgId}" class="clip bgi" data-start="${t.toFixed(2)}" data-duration="${s.dur.toFixed(2)}" data-track-index="1"><img src="assets/hero.jpg" alt=""/></div>`);
    }
    t += s.dur;
  }
  const total = scenes.reduce((a, s) => a + s.dur, 0);
  const audioHtml = scenes.map((s, i) =>
    `<audio class="clip" data-start="${s.start.toFixed(2)}" data-duration="${s.seg.toFixed(2)}" data-track-index="5" src="assets/seg${i}.mp3"></audio>`
  ).join('\n  ');

  return businessShell({ accent, total, sceneHtml, audioHtml, bgEls, sceneMeta: scenes });
}

// Business composition — the operator's storyboard:
//   [0-2s]  tên + tagline   [2-6s]  hero zoom + 2 câu ngắn
//   [6-10s] 3 điểm nổi bật  [10-14s] 📍 địa chỉ ☎ điện thoại
//   [14-16s] CTA
// The contact scene is text-only on a fixed beat; every other scene is
// voiced by its own TTS segment.
function composeBusinessHtml(job, script, segs) {
  const p = job.project || {};
  const brand = p.name || 'Doanh nghiệp';
  const accent = p.accent || ACCENT;
  const outroUrl = (p.publishing_url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const hasHero = existsSync(join(WORK, 'assets', 'hero.jpg'));

  const sceneDefs = [
    { kind: 'intro', seg: segs[0] },
    { kind: 'hero', seg: segs[1] },
    { kind: 'highlights', seg: segs[2] },
    { kind: 'contact', seg: 3.0, silent: true },
    { kind: 'outro', seg: segs[segs.length - 1] },
  ];
  const GAP = 0.4;
  let t = 0;
  const sceneHtml = [];
  const bgEls = [];
  for (const [i, s] of sceneDefs.entries()) {
    s.start = t;
    s.dur = s.seg + GAP;
    let inner = '';
    if (s.kind === 'intro') {
      inner = `<div class="badge">${esc(p.name || brand)}</div><h1 class="hook">${esc(p.name || '')}</h1><p class="tagline">${esc(script.tagline)}</p>`;
    } else if (s.kind === 'highlights') {
      inner = script.highlights.map((h, n) => `<p class="hl"><span class="hn">${n + 1}</span>${esc(h)}</p>`).join('');
    } else if (s.kind === 'contact') {
      inner = `${p.address ? `<p class="contact">📍 ${esc(p.address)}</p>` : ''}${p.phone ? `<p class="contact">☎ ${esc(p.phone)}</p>` : ''}`;
    } else if (s.kind === 'outro') {
      inner = `<p class="outro">${esc(script.cta)}</p><p class="sub">${esc(outroUrl)}</p>`;
    } else {
      inner = `<p class="hook">${esc(script.lines[0] || '')}</p>${script.lines[1] ? `<p class="point">${esc(script.lines[1])}</p>` : ''}`;
    }
    sceneHtml.push(`<div id="s${i}" class="clip scene" data-start="${t.toFixed(2)}" data-duration="${s.dur.toFixed(2)}" data-track-index="0">${inner}</div>`);
    if (hasHero && (s.kind === 'hero' || s.kind === 'highlights')) {
      s.bgId = `bg${bgEls.length}`;
      bgEls.push(s);
      sceneHtml.push(`<div id="${s.bgId}" class="clip bgi" data-start="${t.toFixed(2)}" data-duration="${s.dur.toFixed(2)}" data-track-index="1"><img src="assets/hero.jpg" alt=""/></div>`);
    }
    t += s.dur;
  }
  const total = sceneDefs.reduce((a, s) => a + s.dur, 0);
  const voiced = sceneDefs.filter((s) => !s.silent);
  const audioHtml = voiced.map((s, i) =>
    `<audio class="clip" data-start="${s.start.toFixed(2)}" data-duration="${s.seg.toFixed(2)}" data-track-index="5" src="assets/seg${i}.mp3"></audio>`
  ).join('\n  ');

  return businessShell({ accent, total, sceneHtml, audioHtml, bgEls, sceneMeta: sceneDefs });
}

// Shared HTML shell — both compositions render inside the same brand
// frame so post videos and business promos stay visually consistent.
function businessShell({ accent, total, sceneHtml, audioHtml, bgEls, sceneMeta }) {
  const A = accent || ACCENT;
  const meta = sceneMeta || [];
  return `<!doctype html>
<html lang="vi"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=720, height=1280"/>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:720px; height:1280px; overflow:hidden; background:#0a0c10;
    font-family: Inter, "Noto Sans", ui-sans-serif, sans-serif; }
  #root { width:100%; height:100%; position:relative;
    background:linear-gradient(160deg,${shade(accent, -0.55)} 0%,${shade(accent, -0.25)} 100%); }
  .scene { position:absolute; inset:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center; padding:56px; text-align:center; z-index:2; }
  .badge { background:${A}; color:#fff; font-size:26px; font-weight:700;
    padding:10px 30px; border-radius:999px; margin-bottom:36px; letter-spacing:0.04em; }
  .hook { color:#fff; font-size:60px; font-weight:700; line-height:1.25; letter-spacing:-0.02em; }
  .tagline { color:#c9d6e2; font-size:34px; margin-top:20px; }
  .point { color:#f4f6f8; font-size:46px; font-weight:600; line-height:1.3;
    text-shadow:0 2px 18px rgba(0,0,0,0.75); }
  .num { color:${A}; font-size:120px; font-weight:800; opacity:0.35; margin-bottom:8px; }
  .hl { color:#f4f6f8; font-size:44px; font-weight:600; line-height:1.35; margin:14px 0;
    text-shadow:0 2px 18px rgba(0,0,0,0.75); }
  .hn { color:${A}; font-weight:800; margin-right:14px; }
  .contact { color:#fff; font-size:40px; font-weight:600; line-height:1.5; margin:10px 0; }
  .outro { color:#fff; font-size:44px; font-weight:700; line-height:1.3; }
  .sub { color:#9fb3c8; font-size:26px; margin-top:24px; }
  .bgi { position:absolute; inset:0; }
  .bgi img { width:100%; height:100%; object-fit:cover; opacity:0.32; }
  .bgi::after { content:''; position:absolute; inset:0;
    background:linear-gradient(180deg, rgba(10,12,16,0.25), rgba(10,12,16,0.88)); }
</style></head>
<body><div id="root" data-composition-id="main" data-start="0"
  data-duration="${total.toFixed(2)}" data-width="720" data-height="1280">
${sceneHtml.join('\n')}
${audioHtml}
</div>
<script>
  const tl = gsap.timeline({ paused: true });
  ${(sceneHtml).map((_, i) => {
    const s = meta[i] || { start: 0, dur: 3 };
    return `tl.fromTo("#s${i}", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, ${s.start.toFixed(2)});
  tl.to("#s${i}", { opacity: 0, duration: 0.3 }, ${(s.start + s.dur - 0.35).toFixed(2)});`;
  }).join('\n  ')}
  ${(bgEls || []).map((s) => `tl.fromTo("#${s.bgId}", { scale: 1.0 }, { scale: 1.12, duration: ${s.dur.toFixed(2)}, ease: "none" }, ${s.start.toFixed(2)});`).join('\n  ')}
  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;
  tl.seek(0);
</script></body></html>`;
}

// ── 5. render + deliver one job ───────────────────────────────────────
async function renderOne(job) {
  log(`claimed ${job.slug} (${job.kind}, job ${job.id})`);
  rmSync(join(WORK, 'renders'), { recursive: true, force: true });
  mkdirSync(join(WORK, 'assets'), { recursive: true });

  const isBusiness = job.kind === 'business';
  log(`writing script via GuRouter…`);
  const script = isBusiness ? await writeBusinessScript(job) : await writeScript(job);
  log(`script ok (${isBusiness ? 'business' : 'post'})`);

  // TTS per segment. Business scenes: intro, hero, highlights, outro —
  // the contact scene is silent on a fixed beat. edge-tts occasionally
  // returns an empty file (network hiccup) — retry once, then fall back
  // to the companion voice before giving up.
  const segTexts = isBusiness
    ? [`${job.project?.name || ''}. ${script.tagline}`, script.lines.join(' '), script.highlights.join(' '), script.cta]
    : [script.hook, ...script.points, script.cta];
  const segs = [];
  for (const [i, text] of segTexts.entries()) {
    const mp3 = join(WORK, 'assets', `seg${i}.mp3`);
    const ok = (f) => existsSync(f) && statSync(f).size > 500;
    let done = false;
    for (const voice of [VOICE, 'vi-VN-HoaiMyNeural']) {
      for (let attempt = 0; attempt < 2 && !done; attempt++) {
        spawnSync('edge-tts', ['--voice', voice, '--rate=+8%', '--text', text, '--write-media', mp3], { encoding: 'utf8' });
        if (ok(mp3)) { done = true; break; }
        spawnSync('sleep', ['3']); // back off — the endpoint throttles bursts
      }
      if (done) break;
    }
    if (!done) throw new Error(`edge-tts failed for segment ${i} (both voices)`);
    segs.push(audioSeconds(mp3));
  }
  log(`tts: ${segs.map((d) => d.toFixed(1) + 's').join(' + ')}`);

  const heroB64 = job.hero_image_base64 || job.project?.hero_image_base64;
  if (heroB64) writeFileSync(join(WORK, 'assets', 'hero.jpg'), Buffer.from(heroB64, 'base64'));

  log('composing…');
  const html = isBusiness
    ? composeBusinessHtml(job, script, segs)
    : composeHtml(job, script, segs);
  writeFileSync(join(WORK, 'index.html'), html);

  log('rendering (hyperframes)…');
  const ren = spawnSync('npx', ['-y', `hyperframes@${HF_VERSION}`, 'render'], { cwd: WORK, encoding: 'utf8', timeout: 15 * 60 * 1000 });
  if (ren.status !== 0) {
    throw new Error('render failed: ' + ((ren.stderr || ren.stdout || '').slice(-400)));
  }
  const renders = join(WORK, 'renders');
  const mp4 = readdirSync(renders).filter((f) => f.endsWith('.mp4'))
    .map((f) => ({ f, m: statSync(join(renders, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)[0]?.f;
  if (!mp4) throw new Error('render produced no mp4');
  const bytes = readFileSync(join(renders, mp4));
  log(`rendered ${(bytes.length / 1024).toFixed(0)}KB → delivering`);

  const up = await api('/api/admin/video/deliver', {
    method: 'POST',
    headers: { 'x-video-job': job.id, 'content-type': 'video/mp4' },
    body: bytes,
  });
  const out = await up.json().catch(() => ({}));
  if (!up.ok || out.status !== 'done') throw new Error(`deliver failed: HTTP ${up.status} ${JSON.stringify(out).slice(0, 200)}`);
  log(`done → ${out.video_key}`);
}

// ── main — batch loop (VIDEO_BATCH jobs per invocation) ───────────────
let rendered = 0;
for (let i = 0; i < BATCH; i++) {
  let job = null;
  try {
    job = await claim();
  } catch (e) {
    log(`claim failed: ${e.message}`); break;
  }
  if (!job) { log('queue empty'); break; }
  try {
    await renderOne(job);
    rendered++;
  } catch (e) {
    await reportFailure(job, e.message || String(e));
    log(`job failed: ${e.message || e}`);
  }
}
if (!rendered) process.exit(0);
log(`batch complete: ${rendered} video(s)`);

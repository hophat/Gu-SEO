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
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync, readdirSync, copyFileSync } from 'node:fs';
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

// Brand logo — downloaded once per job, overlaid on every scene. The
// extension is preserved (SVG/PNG/JPG all render inside <img> in Chrome).
async function downloadLogo(logoUrl) {
  if (!logoUrl) return null;
  const ext = (String(logoUrl).match(/\.(svg|png|jpe?g|webp)(\?|$)/i)?.[1] || 'png').toLowerCase();
  const out = join(WORK, 'assets', `logo.${ext}`);
  try {
    const r = await fetch(String(logoUrl).trim(), {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; pages-seo-video/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    const type = (r.headers.get('content-type') || '').toLowerCase();
    if (!type.startsWith('image/')) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100) return null;
    writeFileSync(out, buf);
    return `assets/logo.${ext}`;
  } catch { return null; }
}
const api = (path, opts = {}) => fetch(`${BASE_URL}${path}`, {
  ...opts,
  headers: { authorization: `Bearer ${TOKEN}`, ...(opts.headers || {}) },
});

// ── 1. claim ──────────────────────────────────────────────────────────
// Default sweep: business promos first, then website promos, then the
// newest queued post. Explicit --type/--slug overrides that.
async function claim() {
  const body = {};
  if (SLUG) body.slug = SLUG;
  if (TYPE) body.type = TYPE;
  else if (PROJECT_ID || PROJECT_ARG) body.project_id = PROJECT_ID || PROJECT_ARG;
  if (!TYPE) {
    for (const t of ['business', 'website']) {
      const r = await api('/api/admin/video/claim', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, type: t }),
      });
      const d = await r.json().catch(() => ({}));
      if (d?.job) return d.job;
    }
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
// Post videos are a TEASER, not a replacement: hook on the most
// interesting bit, 3 concrete takeaways, then an open question whose
// answer lives in the article — the video sells the read.
async function writeScript(job) {
  if (!GUROUTER_KEY) throw new Error('GUROUTER_API_KEY missing in video-agent/.env');
  const sys = `Bạn là creator video ngắn tóm tắt bài blog (TikTok/Reels). Mục tiêu: khiến người xem MUỐN ĐỌC bài gốc. Chỉ trả JSON thuần, không markdown.`;
  const user = `Viết kịch bản video ~30 giây tóm tắt bài blog sau.

Tiêu đề: ${job.title}
Mô tả: ${job.meta_description || ''}
Nội dung (rút gọn): ${(job.body_markdown || '').slice(0, 3500)}

CẤU TRÚC:
- hook: câu mở đầu đánh vào điểm thú vị/nhất của bài — con số, sự thật lạ hoặc câu hỏi. Tối đa 14 từ.
- points: đúng 3 ý chính của bài, mỗi ý 1 câu ≤ 16 từ, có chi tiết cụ thể (số/tên/địa danh) — không phải câu tổng quát.
- question: 1 câu hỏi mở kết video — câu trả lời nằm TRONG bài viết, buộc người xem phải đọc. Tối đa 14 từ.

QUY TẮC:
1. Nghe như một người bạn kể lại bài hay vừa đọc, không như bản tóm tắt máy móc.
2. Tiếng Việt tự nhiên, không emoji, không markdown.
3. Không tiết lộ hết — câu hỏi cuối phải khiến người xem tò mò.

VÍ DỤ ĐÚNG (bài "5 địa điểm ăn sáng ngon ở Lagi"):
{"hook":"5 quán ăn sáng ở Lagi mà khách du lịch tìm mãi không ra","points":["Quán đầu chỉ người Lagi mới biết, 25k no căng","Bánh căn nướng than hoa, chờ 15 phút vẫn đáng","Địa chỉ chính xác từng quán — lưu lại là tới nơi"],"question":"Bạn đã thử quán số mấy rồi?"}

Trả JSON: {"hook":"...","points":["...","...","..."],"question":"..."}`;
  const r = await fetch(`${GUROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${GUROUTER_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: GUROUTER_MODEL,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      temperature: 0.7, max_tokens: 1200, response_format: { type: 'json_object' },
    }),
  }).catch((e) => { throw new Error('gurouter_unreachable: ' + e.message); });
  if (!r.ok) throw new Error(`gurouter HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const raw = data?.choices?.[0]?.message?.content || '';
  const parsed = parseScript(raw);
  const points = (parsed.points || []).slice(0, 3).map((p) => String(p).trim()).filter(Boolean);
  const question = String(parsed.question || parsed.cta || '').trim();
  if (!parsed.hook || !points.length || !question) throw new Error('script_schema_bad: ' + raw.slice(0, 150));
  return { hook: String(parsed.hook).trim(), points, question };
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
    question: str('question'),
    tagline: str('tagline'),
    highlights: items,
  };
}

// ── 2b. business script — per-project promo (AI Video Post) ──────────
// Creator-grade prompt: the LLM writes as a short-form video director,
// not a brochure. Rules: hook on the pain (never the brand name),
// concrete numbers over adjectives, banned corporate vocabulary, CTA
// with urgency. The Brand DNA sets the voice; the template sets the
// visuals; the LLM only supplies the words.
const BANNED_WORDS = ['chuyên nghiệp', 'giải pháp', 'tối ưu', 'uy tín', 'chất lượng cao', 'nâng tầm', 'đẳng cấp', 'trải nghiệm khách hàng'];

function scriptQuality(script) {
  const text = [script.hook, script.reveal, ...(script.points || []), script.cta].join(' ').toLowerCase();
  const bad = BANNED_WORDS.filter((w) => text.includes(w));
  if (bad.length) return `contains clichéd wording: ${bad.join(', ')}`;
  if (!script.hook || script.hook.length < 8) return 'hook too weak';
  if ((script.points || []).length < 3) return 'needs 3 points';
  return null;
}

async function writeBusinessScript(job) {
  if (!GUROUTER_KEY) throw new Error('GUROUTER_API_KEY missing in video-agent/.env');
  const p = job.project || {};
  const sys = `Bạn là đạo diễn video ngắn (TikTok/Reels) chuyên về doanh nghiệp địa phương. Bạn viết kịch bản khiến người xem DỪNG LƯỚT trong 1.5 giây đầu. Chỉ trả JSON thuần, không markdown, không giải thích.`;
  const brief = (attempt) => `Viết kịch bản video 20 giây cho doanh nghiệp này.

Doanh nghiệp: ${p.name || job.title}
Loại hình: ${p.brand?.business_type || '(xem mô tả)'}
Mô tả: ${(p.description || job.body_markdown || '').slice(0, 600)}
Khách hàng: ${p.brand?.audience || 'khách địa phương'}
Khu vực: ${p.brand?.service_area || ''}
Điểm mạnh gợi ý (tham khảo, phải viết lại bằng ngôn ngữ người bán): ${(job.highlights || []).join('; ') || '(tự rút từ mô tả)'}

CẤU TRÚC (mỗi dòng 1 scene, ≤ 9 từ/dòng):
- hook: 1 con số bất ngờ HOẶC câu hỏi đánh thẳng vào nỗi đau khách. CẤM mở đầu bằng tên thương hiệu.
- reveal: tên thương hiệu + 1 câu định vị (tên sẽ do video tự hiển thị, câu này để GIỌNG ĐỌC: "tên — tagline").
- points: đúng 3 lý do chọn quán/shop. Mỗi lý do phải CỤ THỂ (con số, chi tiết cảm quan, thời gian) — không phải tính từ chung chung.
- cta: hành động ngay (ghé thử / gọi / nhắn tin), có lý do.

QUY TẮC:
1. Nghe như người bán nói với khách quen, KHÔNG nghe như tờ rơi quảng cáo.
2. Cấm các từ: ${BANNED_WORDS.join(', ')}.
3. Tiếng Việt tự nhiên theo giọng: ${p.brand?.tone || 'thân thiện, gần gũi'}.
4. Không emoji, không markdown, không dấu chấm than quá 1 cái.

VÍ DỤ ĐÚNG CHUẨN (quán bánh xèo):
{"hook":"78% khách tìm quán ăn trên Google trước khi đến","reveal":"Bánh Xèo ABC — giòn rụm đúng điệu miền Tây","points":["Bánh chiên tại chỗ, bột nhào mỗi sáng","Nước mắm pha riêng theo công thức 20 năm","No căng chỉ với 25 nghìn một cái"],"cta":"Ghé 123 Nguyễn Văn A trước 9 giờ tối"}

VÍ DỤ DỞ (cấm): "Chúng tôi cung cấp giải pháp chuyên nghiệp tối ưu trải nghiệm khách hàng"

Trả JSON: {"hook":"...","reveal":"...","points":["...","...","..."],"cta":"..."}`;
  const call = async (nudge) => {
    const r = await fetch(`${GUROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${GUROUTER_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: GUROUTER_MODEL,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: brief() + (nudge ? '\n\nBẢN TRƯỚC bị loại vì sáo rỗng. Viết lại: cụ thể hơn, người bán hơn, có con số thật.' : '') }],
        temperature: nudge ? 0.9 : 0.7, max_tokens: 800, response_format: { type: 'json_object' },
      }),
    }).catch((e) => { throw new Error('gurouter_unreachable: ' + e.message); });
    if (!r.ok) throw new Error(`gurouter HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const data = await r.json();
    return data?.choices?.[0]?.message?.content || '';
  };
  // Two attempts: the first pass, then a punchier retry if the quality
  // gate flags clichés or a weak hook. Best effort — a passing script
  // wins; if both fail the gate, the second one still ships (a mediocre
  // video beats no video for the operator).
  let script = null, lastParsed = null;
  for (const nudge of [false, true]) {
    const raw = await call(nudge);
    const parsed = parseScript(raw);
    lastParsed = parsed;
    const reveal = String(parsed.reveal || parsed.tagline || '').trim();
    const points = (parsed.points || parsed.highlights || [])
      .map((s) => String(s || '').trim()).filter(Boolean).slice(0, 3);
    const candidate = {
      hook: String(parsed.hook || '').trim(),
      reveal,
      points,
      cta: String(parsed.cta || p.brand?.cta || 'Ghé thăm chúng tôi hôm nay').trim(),
    };
    const problem = scriptQuality(candidate);
    if (!problem) { script = candidate; break; }
    log(`script rejected (${problem}) — retrying punchier`);
  }
  if (!script) {
    // Both attempts flagged — ship the retry anyway with DNA fallbacks.
    script = {
      hook: String(lastParsed?.hook || '').trim() || `${p.name || 'Chúng tôi'} đang chờ bạn`,
      reveal: String(lastParsed?.reveal || lastParsed?.tagline || p.name || '').trim(),
      points: (lastParsed?.points || job.highlights || []).slice(0, 3).map((s) => String(s).trim()).filter(Boolean),
      cta: String(lastParsed?.cta || p.brand?.cta || 'Ghé thăm chúng tôi hôm nay').trim(),
    };
  }
  return script;
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

// Post composition — the teaser arc: hook → 3 takeaways → open
// question → "đọc bài viết" outro. Scenes timed to TTS; the question
// scene is the curiosity gap that sells the read.
function composeHtml(job, script, segs, logoSrc = null, bgmSrc = null) {
  const brand = job.project?.name || 'Blog';
  const outroUrl = (job.project?.publishing_url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const accent = job.project?.accent || ACCENT;
  const hasHero = existsSync(join(WORK, 'assets', 'hero.jpg'));
  const GAP = 0.4;
  const READ_CTA = 'Đọc bài viết để biết thêm chi tiết';
  const scenes = [
    { kind: 'hook', seg: segs[0] },
    { kind: 'points', seg: segs[1] },
    { kind: 'question', seg: segs[2] },
    { kind: 'outro', seg: segs[3] },
  ];
  let t = 0;
  const sceneHtml = [];
  const bgEls = [];
  for (const [i, s] of scenes.entries()) {
    s.start = t;
    s.dur = s.seg + GAP;
    const inner = s.kind === 'hook'
      ? `<div class="badge">${esc(brand)}</div><h1 class="hook">${esc(script.hook)}</h1>`
      : s.kind === 'points'
        ? script.points.map((pt, n) => `<p class="hl"><span class="hn">${n + 1}</span>${esc(pt)}</p>`).join('')
        : s.kind === 'question'
          ? `<p class="question">${esc(script.question)}</p>`
          : `<p class="outro">${esc(READ_CTA)}</p><p class="sub">${esc(outroUrl)}</p>`;
    sceneHtml.push(`<div id="s${i}" class="clip scene" data-start="${t.toFixed(2)}" data-duration="${s.dur.toFixed(2)}" data-track-index="0">${inner}</div>`);
    if (hasHero && (s.kind === 'points' || s.kind === 'question')) {
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

  return businessShell({ accent, total, sceneHtml, audioHtml, bgEls, sceneMeta: scenes, logoSrc, bgmSrc });
}

// Business composition — the creator storyboard:
//   [0-2s]  HOOK — số bất ngờ / nỗi đau (chưa có tên brand)
//   [2-6s]  REVEAL — badge + tên + tagline trên ảnh thật
//   [6-11s] 3 lý do cụ thể (số / chi tiết cảm quan)
//   [11-14s] 📍 địa chỉ ☎ điện thoại (im lặng, fixed beat)
//   [14-16s] CTA
// Scene backgrounds come from the real imagery collected off the
// project's website (media[]), one image per scene, R2 hero as fallback.
function composeBusinessHtml(job, script, segs, media = [], logoSrc = null, bgmSrc = null) {
  const p = job.project || {};
  const brand = p.name || 'Doanh nghiệp';
  const accent = p.accent || ACCENT;
  const outroUrl = (p.publishing_url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const hasHero = existsSync(join(WORK, 'assets', 'hero.jpg'));
  // Which scenes get a photo background, and which collected image.
  const bgFor = { hook: -1, reveal: 0, points: 1, contact: 2, outro: 3 };

  const sceneDefs = [
    { kind: 'hook', seg: segs[0] },
    { kind: 'reveal', seg: segs[1] },
    { kind: 'points', seg: segs[2] },
    { kind: 'contact', seg: 3.0, silent: true },
    { kind: 'cta', seg: segs[segs.length - 1] },
  ];
  const GAP = 0.4;
  let t = 0;
  const sceneHtml = [];
  const bgEls = [];
  for (const [i, s] of sceneDefs.entries()) {
    s.start = t;
    s.dur = s.seg + GAP;
    let inner = '';
    if (s.kind === 'hook') {
      // The scroll-stopper: big, alone, no branding yet.
      inner = `<h1 class="hook">${esc(script.hook)}</h1>`;
    } else if (s.kind === 'reveal') {
      inner = `<div class="badge">${esc(brand)}</div><h1 class="hook">${esc(p.name || brand)}</h1><p class="tagline">${esc(script.reveal)}</p>`;
    } else if (s.kind === 'points') {
      inner = script.points.map((h, n) => `<p class="hl"><span class="hn">${n + 1}</span>${esc(h)}</p>`).join('');
    } else if (s.kind === 'contact') {
      inner = `${p.address ? `<p class="contact">📍 ${esc(p.address)}</p>` : ''}${p.phone ? `<p class="contact">☎ ${esc(p.phone)}</p>` : ''}`;
    } else {
      inner = `<p class="outro">${esc(script.cta)}</p><p class="sub">${esc(outroUrl)}</p>`;
    }
    sceneHtml.push(`<div id="s${i}" class="clip scene" data-start="${t.toFixed(2)}" data-duration="${s.dur.toFixed(2)}" data-track-index="0">${inner}</div>`);
    // Background: a real site image for this scene, else the R2 hero.
    // The hook scene stays on the pure brand gradient — it must read
    // clean before the brand reveal.
    const siteImg = media[bgFor[s.kind]];
    const bgSrc = siteImg ? `assets/media/img${bgFor[s.kind]}.jpg`
      : (hasHero && s.kind !== 'hook' ? 'assets/hero.jpg' : null);
    if (bgSrc && s.kind !== 'hook') {
      s.bgId = `bg${bgEls.length}`;
      bgEls.push(s);
      sceneHtml.push(`<div id="${s.bgId}" class="clip bgi" data-start="${t.toFixed(2)}" data-duration="${s.dur.toFixed(2)}" data-track-index="1"><img src="${bgSrc}" alt=""/></div>`);
    }
    t += s.dur;
  }
  const total = sceneDefs.reduce((a, s) => a + s.dur, 0);
  const voiced = sceneDefs.filter((s) => !s.silent);
  const audioHtml = voiced.map((s, i) =>
    `<audio class="clip" data-start="${s.start.toFixed(2)}" data-duration="${s.seg.toFixed(2)}" data-track-index="5" src="assets/seg${i}.mp3"></audio>`
  ).join('\n  ');

  return businessShell({ accent, total, sceneHtml, audioHtml, bgEls, sceneMeta: sceneDefs, logoSrc, bgmSrc });
}

// Shared HTML shell — both compositions render inside the same brand
// frame so post videos and business promos stay visually consistent.
function businessShell({ accent, total, sceneHtml, audioHtml, bgEls, sceneMeta, logoSrc, bgmSrc }) {
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
  .question { color:#fff; font-size:52px; font-weight:700; line-height:1.3;
    text-shadow:0 2px 18px rgba(0,0,0,0.75); }
  .sub { color:#9fb3c8; font-size:26px; margin-top:24px; }
  .bgi { position:absolute; inset:0; }
  .bgi img { width:100%; height:100%; object-fit:cover; opacity:0.32; }
  .bgi::after { content:''; position:absolute; inset:0;
    background:linear-gradient(180deg, rgba(10,12,16,0.25), rgba(10,12,16,0.88)); }
  .brandlogo { position:absolute; top:36px; right:40px; height:56px; max-width:220px;
    object-fit:contain; z-index:6; filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5)); }
</style></head>
<body><div id="root" data-composition-id="main" data-start="0"
  data-duration="${total.toFixed(2)}" data-width="720" data-height="1280">
${sceneHtml.join('\n')}
${audioHtml}
${bgmSrc ? `<audio class="clip" data-start="0" data-duration="${total.toFixed(2)}" data-volume="0.12" data-track-index="6" src="assets/bgm.mp3"></audio>` : ''}
${logoSrc ? `<img class="clip brandlogo" data-start="0" data-duration="${total.toFixed(2)}" data-track-index="9" src="${logoSrc}"/>` : ''}
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

// ── 4. media collection — real images from the project's website ──────
// The site is the raw material: homepage HTML → og:image + <img> candidates
// → download the largest few raster images as scene backgrounds. Falls
// back to the R2 hero when the site yields nothing usable.
const MAX_MEDIA = 4;
async function collectMedia(job) {
  const site = job.project?.website_url || job.project?.publishing_url || '';
  const outDir = join(WORK, 'assets', 'media');
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
    // og:image first — it is the curated visual.
    for (const m of html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi)) srcs.add(m[1]);
    for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) srcs.add(m[1]);
    // Absolute-ise and filter to raster URLs worth downloading.
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
    log(`media collect failed (${e.message}) — using gradient/R2 hero only`);
    return [];
  }
}

// ── 4b. website promos — screenshot the live site, scrape its text ───
// chrome-headless-shell (already provisioned by the renderer) captures
// the homepage plus up to two nav pages; the page text feeds the LLM
// storyboard. Falls back to og:image/<img> scraping when a shot fails.
const CHROME_DIR = '/root/.cache/hyperframes/chrome/chrome-headless-shell';

function findChrome() {
  try {
    for (const v of readdirSync(CHROME_DIR)) {
      const p = join(CHROME_DIR, v, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
      if (existsSync(p)) return p;
    }
  } catch { /* fall through */ }
  return null;
}

function capturePage(url, outPath) {
  const chrome = findChrome();
  if (!chrome) return false;
  const r = spawnSync(chrome, [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--window-size=720,1280', '--virtual-time-budget=9000',
    '--screenshot=' + outPath, url,
  ], { encoding: 'utf8', timeout: 45000 });
  return r.status === 0 && existsSync(outPath) && statSync(outPath).size > 5000;
}

// Homepage + up to two same-origin nav pages, text scraped for the LLM.
async function captureSite(siteUrl) {
  const outDir = join(WORK, 'assets', 'media');
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
    // Two same-origin nav links as extra scenes.
    const links = [...html.matchAll(/href=["']([^"']+)["']/gi)]
      .map((m) => { try { return new URL(m[1], siteUrl).href; } catch { return null; } })
      .filter((u) => u && u.startsWith(siteUrl.replace(/\/+$/, '')) && u !== siteUrl)
      .filter((u) => !/\.(pdf|jpg|png|zip)$/i.test(u));
    for (const u of [...new Set(links)]) {
      if (shots.length >= 3) break;
      const f = join(outDir, `shot${shots.length}.png`);
      if (capturePage(u, f)) shots.push(f);
    }
  }
  // Text material for the storyboard: title + meta + headings.
  const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim();
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || '');
  const headings = [...html.matchAll(/<h[12][^>]*>([^<]{4,90})<\/h[12]>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean).slice(0, 8);
  return { shots, text: [title, desc, ...headings].filter(Boolean).join('\n') };
}

// ── 4c. background music — synthesised ambient pad, licence-free ─────
// A soft major-chord pad generated with ffmpeg (no third-party service,
// no licensing questions). The chord set is picked by the job slug so a
// project keeps the same bed across renders, and the pad is trimmed to
// the video length with fades. Set VIDEO_MUSIC=off to disable.
function makeBgm(totalSec, seedStr) {
  if (String(E('VIDEO_MUSIC') || '').toLowerCase() === 'off') return null;
  const chords = [
    [220.0, 277.2, 329.6],  // A major — warm
    [174.6, 220.0, 261.6],  // F major — calm
    [196.0, 246.9, 293.7],  // G major — open
    [164.8, 207.7, 261.6],  // E minor — soft
  ];
  // The chord set is picked by the job slug so a project keeps the same
  // bed across renders.
  const seed = String(seedStr || 'x').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const ch = chords[seed % chords.length];
  const out = join(WORK, 'assets', 'bgm.mp3');
  const fadeOut = Math.max(1, totalSec - 3).toFixed(1);
  const r = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', `sine=frequency=${ch[0]}:duration=${totalSec.toFixed(1)}`,
    '-f', 'lavfi', '-i', `sine=frequency=${ch[1]}:duration=${totalSec.toFixed(1)}`,
    '-f', 'lavfi', '-i', `sine=frequency=${ch[2]}:duration=${totalSec.toFixed(1)}`,
    '-filter_complex',
    `[0]volume=0.16[a];[1]volume=0.22[b];[2]volume=0.18[c];[a][b][c]amix=3,tremolo=f=0.4:d=0.6,lowpass=f=900,afade=t=in:d=2,afade=t=out:st=${fadeOut}:d=3[out]`,
    '-map', '[out]', '-b:a', '128k', out,
  ], { encoding: 'utf8', timeout: 60000 });
  return r.status === 0 && existsSync(out) && statSync(out).size > 5000 ? out : null;
}

// ── free slide imagery (Openverse) ────────────────────────────────────
// Openverse aggregates CC0 / public-domain photos: no API key, no
// watermark, and no attribution obligation, so a slide can carry one
// without legal plumbing. Each slide gets its own photo — the deck used
// to repeat the article hero on every point slide.
//
// The article is Vietnamese, so we do not search with its raw text:
// Openverse indexes English metadata. A tiny keyword map derives an
// English topic from the title plus a per-slide concept, and the search
// is only allowed to return CC0/PDM originals.
const TOPIC_MAP = [
  [/nhà hàng|quán ăn|ẩm thực|món ăn|restaurant|food/i, 'restaurant'],
  [/cà phê|cafe|coffee/i, 'coffee shop'],
  [/khách sạn|hotel|resort|homestay|nghỉ dưỡng/i, 'hotel'],
  [/spa|massage|nail|salon|thẩm mỹ|làm đẹp/i, 'spa salon'],
  [/nha khoa|nha sĩ|dentist|răng/i, 'dental clinic'],
  [/phòng khám|bệnh viện|clinic|bác sĩ|sức khỏe|y tế/i, 'medical clinic'],
  [/bất động sản|nhà đất|real estate/i, 'real estate house'],
  [/giáo dục|trường học|khóa học|học sinh|đào tạo/i, 'classroom education'],
  [/du lịch|tour|travel/i, 'travel landscape'],
  [/thời trang|quần áo|fashion|cửa hàng|shop|bán hàng/i, 'retail store'],
  [/gym|fitness|thể hình|yoga/i, 'gym fitness'],
  [/ô tô|xe hơi|garage|sửa xe/i, 'car garage'],
  [/website|trang web|thiết kế web|web design/i, 'website design'],
];
const CONCEPT_MAP = [
  [/menu|thực đơn/i, 'restaurant menu'],
  [/đánh giá|review|nhận xét|phản hồi/i, 'customer review'],
  [/google maps|bản đồ|chỉ đường/i, 'google maps navigation'],
  [/đặt bàn|đặt lịch|booking|đặt chỗ/i, 'restaurant table setting'],
  [/website|trang web|thiết kế web/i, 'website design laptop'],
  [/điện thoại|smartphone|di động/i, 'smartphone in hand'],
  [/\bseo\b|tối ưu|tìm kiếm|xếp hạng|top 1/i, 'seo analytics laptop'],
  [/doanh thu|kinh doanh|khách hàng|doanh nghiệp|business/i, 'business owner shop'],
];

function matchKeyword(map, hay) {
  for (const [re, kw] of map) if (re.test(hay)) return kw;
  return null;
}

// Candidate queries for one slide, most specific first. The caller tries
// them in order and keeps the first that yields an unused photo.
function slideQueries(job, script, idx) {
  const title = String(job.title || '');
  const topic = matchKeyword(TOPIC_MAP, `${title} ${job.meta_description || ''}`) || 'small business';
  const text = idx === 0 ? script.hook
    : idx === 4 ? script.question
      : (script.points || [])[idx - 1] || '';
  const concept = matchKeyword(CONCEPT_MAP, `${title} ${text}`);
  return [...new Set([concept, topic, 'small business'].filter(Boolean))];
}

// Fetch one CC0/PDM photo for `query`, skipping ids already used by an
// earlier slide so the deck never shows the same picture twice.
async function fetchOpenversePhoto(query, usedIds) {
  const api = 'https://api.openverse.org/v1/images/?q=' + encodeURIComponent(query) +
    '&license=cc0,pdm&size=large&page_size=20';
  const r = await fetch(api, { headers: { 'user-agent': 'Gu-SEO-video-agent/1.0' } });
  if (!r.ok) throw new Error(`openverse_http_${r.status}`);
  const data = await r.json().catch(() => ({}));
  const candidates = (data.results || []).filter((x) =>
    x?.id && x?.url && !usedIds.has(x.id) &&
    /\.(jpe?g|png)$/i.test(x.url) &&
    (x.width || 0) >= 900 &&
    !/clipart|sticker|vector|illustration|icon|logo|drawing|cartoon/i.test(String(x.title || ''))
  );
  // Full-text search matches metadata, not pixels — a query for
  // "restaurant" once returned a castle ruin whose page mentioned one.
  // Rank candidates by how many query words appear in the title and
  // prefer the ones that actually describe what we asked for.
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const rank = (x) => words.filter((w) => String(x.title || '').toLowerCase().includes(w)).length;
  const pick = candidates.slice().sort((a, b) => rank(b) - rank(a))[0];
  if (!pick) throw new Error('openverse_no_result');
  const img = await fetch(pick.url, { headers: { 'user-agent': 'Gu-SEO-video-agent/1.0' } });
  if (!img.ok) throw new Error(`openverse_download_${img.status}`);
  const type = String(img.headers.get('content-type') || '');
  if (!type.startsWith('image/')) throw new Error('openverse_not_an_image');
  const bytes = Buffer.from(await img.arrayBuffer());
  if (bytes.length < 4096) throw new Error('openverse_image_too_small');
  usedIds.add(pick.id);
  return {
    bytes,
    credit: {
      title: pick.title || null,
      license: pick.license || null,
      creator: pick.creator || null,
      source: pick.foreign_landing_url || null,
    },
  };
}

// ── 5b. carousel — 5 static slides 1080×1350 via hyperframes snapshot ─
// Slide 1: hook (brand badge). 2-4: the three takeaways. Slide 5: the
// open question + "đọc bài viết". Same script as the post teaser; every
// slide is backed by its own CC0 photo (article hero when none is found).
// One slide per HTML file, fully static (no GSAP timeline). Hyperframes
// snapshot then returns exactly that slide at any --at time, which makes
// the deck deterministic — a single animated composition mis-mapped the
// first frame in practice (cover came out as the CTA scene).
function composeCarouselSlideHtml(job, script, slideIdx) {
  const p = job.project || {};
  const brand = p.name || 'Blog';
  const accent = p.accent || ACCENT;
  const outroUrl = (p.publishing_url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const W = 1080, H = 1350;
  const A = accent;

  // Pad to exactly 3 points so the deck is always 5 slides — the deliver
  // writes carousel/<slug>-1..5.png and the UI derives those URLs.
  const points = [...script.points.slice(0, 3)];
  while (points.length < 3) points.push('Đọc bài viết để xem đầy đủ');
  const scenes = [
    { kind: 'cover' },
    ...points.map((pt, n) => ({ kind: 'point', text: pt, n: n + 1 })),
    { kind: 'cta' },
  ];
  const s = scenes[slideIdx] || scenes[0];
  const inner = s.kind === 'cover'
    ? `<div class="badge">${esc(brand)}</div><h1 class="hook">${esc(script.hook)}</h1>`
    : s.kind === 'point'
      ? `<div class="num">${s.n}</div><p class="point">${esc(s.text)}</p>`
      : `<p class="question">${esc(script.question)}</p><p class="sub">Đọc bài viết đầy đủ ↓</p><p class="url">${esc(outroUrl)}</p>`;
  // Each slide prefers its own free photo; the article hero is the
  // fallback when Openverse had nothing (or the job has no hero at all).
  const own = `slide-${slideIdx}.jpg`;
  const bgSrc = existsSync(join(WORK, 'assets', own)) ? own
    : existsSync(join(WORK, 'assets', 'hero.jpg')) ? 'hero.jpg' : null;
  const bg = bgSrc ? `<div class="bgi"><img src="assets/${bgSrc}" alt=""/></div>` : '';
  const logo = existsSync(join(WORK, 'assets', 'logo.png'))
    ? `<img class="brandlogo" src="assets/logo.png"/>` : '';

  return `<!doctype html>
<html lang="vi"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=${W}, height=${H}"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${W}px; height:${H}px; overflow:hidden; background:#0a0c10;
    font-family: Inter, "Noto Sans", ui-sans-serif, sans-serif; }
  #root { width:100%; height:100%; position:relative;
    background:linear-gradient(160deg,${shade(accent, -0.5)} 0%,${shade(accent, -0.2)} 100%); }
  .scene { position:absolute; inset:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center; padding:72px; text-align:center; z-index:2; }
  .badge { background:${A}; color:#fff; font-size:34px; font-weight:700;
    padding:14px 40px; border-radius:999px; margin-bottom:48px; letter-spacing:0.04em; }
  .hook { color:#fff; font-size:76px; font-weight:700; line-height:1.25; letter-spacing:-0.02em; }
  .point { color:#f4f6f8; font-size:56px; font-weight:600; line-height:1.35;
    text-shadow:0 2px 18px rgba(0,0,0,0.75); }
  .num { color:${A}; font-size:150px; font-weight:800; opacity:0.35; margin-bottom:12px; }
  .question { color:#fff; font-size:60px; font-weight:700; line-height:1.3;
    text-shadow:0 2px 18px rgba(0,0,0,0.75); }
  .sub { color:#c9d6e2; font-size:32px; margin-top:28px; }
  .url { color:${A}; font-size:30px; font-weight:600; margin-top:12px; }
  .bgi { position:absolute; inset:0; }
  .bgi img { width:100%; height:100%; object-fit:cover; opacity:0.42; }
  .bgi::after { content:''; position:absolute; inset:0;
    background:linear-gradient(180deg, rgba(10,12,16,0.45), rgba(10,12,16,0.92)); }
  .brandlogo { position:absolute; top:48px; right:56px; height:72px; max-width:280px;
    object-fit:contain; z-index:6; filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5)); }
</style></head>
<body><div id="root" data-composition-id="main" data-start="0"
  data-duration="1" data-width="${W}" data-height="${H}">
${bg}
<div class="scene">${inner}</div>
${logo}
</div></body></html>`;
}

// Render the carousel: compose → snapshot at each slide's midpoint →
// upload the PNGs. No TTS, no video encode.
async function renderCarousel(job) {
  log(`carousel for ${job.slug} (job ${job.id})`);
  rmSync(join(WORK, 'snapshots'), { recursive: true, force: true });
  mkdirSync(join(WORK, 'assets'), { recursive: true });
  // Drop the previous deck's photos so a failed fetch this run cannot be
  // papered over by a stale slide-*.jpg left behind by an earlier job.
  for (let i = 0; i < 5; i++) rmSync(join(WORK, 'assets', `slide-${i}.jpg`), { force: true });

  const heroB64 = job.hero_image_base64 || job.project?.hero_image_base64;
  if (heroB64) writeFileSync(join(WORK, 'assets', 'hero.jpg'), Buffer.from(heroB64, 'base64'));

  log('writing script via GuRouter…');
  let script;
  try {
    script = await writeScript(job);
  } catch (e) {
    // LLM down (429/quota) — derive the slides from the article itself
    // instead of failing the job. Hook = title, points = the first 3
    // H2 headings (or meta sentences), question = a generic teaser.
    log(`GuRouter failed (${String(e?.message || e).slice(0, 80)}) — deriving slides from the post`);
    const heads = (job.body_markdown || '').match(/^##+\s+(.+)$/gm)?.map((h) => h.replace(/^#+\s+/, '').trim()).filter((h) => h.length > 5) || [];
    const pts = heads.slice(0, 3);
    script = {
      hook: job.title || 'Bài viết mới',
      points: pts.length >= 2 ? pts : [job.meta_description || job.title || 'Chi tiết trong bài viết'],
      question: 'Bạn đã thử cách nào chưa?',
    };
    // Pad to 3 points so the deck always has 5 slides.
    while (script.points.length < 3) script.points.push(job.meta_description || 'Đọc bài viết để xem đầy đủ');
  }
  log(`script ok: hook + ${script.points.length} points + question`);

  // One free CC0 photo per slide (article hero as the fallback). The
  // photos are written to assets/slide-<i>.jpg before composing, so a
  // failed fetch just leaves that slide on the hero.
  const usedIds = new Set();
  for (let i = 0; i < 5; i++) {
    for (const q of slideQueries(job, script, i)) {
      try {
        const photo = await fetchOpenversePhoto(q, usedIds);
        writeFileSync(join(WORK, 'assets', `slide-${i}.jpg`), photo.bytes);
        log(`slide ${i + 1} photo: "${q}" (${photo.credit.license})`);
        break;
      } catch (e) {
        log(`slide ${i + 1} photo "${q}" failed: ${String(e?.message || e).slice(0, 60)}`);
      }
    }
  }

  // One static HTML per slide → one snapshot each. Deterministic: the
  // snapshot time does not matter because nothing animates.
  log('snapshotting 5 slides…');
  const slides = [];
  for (let i = 0; i < 5; i++) {
    writeFileSync(join(WORK, 'index.html'), composeCarouselSlideHtml(job, script, i));
    rmSync(join(WORK, 'snapshots'), { recursive: true, force: true });
    const ren = spawnSync('npx', ['-y', `hyperframes@${HF_VERSION}`, 'snapshot', '--at', '0.5', '--timeout', '9000'],
      { cwd: WORK, encoding: 'utf8', timeout: 3 * 60 * 1000 });
    if (ren.status !== 0) throw new Error(`snapshot slide ${i + 1} failed: ` + ((ren.stderr || ren.stdout || '').slice(-300)));
    const frame = readdirSync(join(WORK, 'snapshots'))
      .filter((f) => f.startsWith('frame-') && f.endsWith('.png')).sort()[0];
    if (!frame) throw new Error(`snapshot produced no PNG for slide ${i + 1}`);
    slides.push(readFileSync(join(WORK, 'snapshots', frame)).toString('base64'));
  }
  log(`slides: ${slides.length} PNG(s) → delivering`);

  const up = await api('/api/admin/video/carousel-deliver', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ job_id: job.id, slides }),
  });
  const out = await up.json().catch(() => ({}));
  if (!up.ok || out.status !== 'done') throw new Error(`carousel deliver failed: HTTP ${up.status} ${JSON.stringify(out).slice(0, 200)}`);
  log(`done → ${out.prefix} (${out.slides?.length || slides.length} slides)`);
}

// ── 5. render + deliver one job ───────────────────────────────────────
async function renderOne(job) {
  log(`claimed ${job.slug} (${job.kind}, job ${job.id})`);
  rmSync(join(WORK, 'renders'), { recursive: true, force: true });
  rmSync(join(WORK, 'snapshots'), { recursive: true, force: true });
  mkdirSync(join(WORK, 'assets'), { recursive: true });

  // Carousel: static 4:5 slides (1080×1350) exported with hyperframes
  // snapshot — no TTS, no video. Same script as the post teaser.
  if (job.kind === 'carousel') {
    await renderCarousel(job);
    return;
  }

  const isBusiness = job.kind === 'business' || job.kind === 'website';
  let siteText = null;

  // Website promos: screenshot the live site + scrape its text as the
  // storyboard source. Shots become the scene backgrounds.
  let media = [];
  if (job.kind === 'website' && job.source_url) {
    log(`capturing ${job.source_url}…`);
    const site = await captureSite(job.source_url);
    if (site.text) siteText = site.text;
    // Screenshots double as the media pool (img{n}.jpg naming).
    let n = 0;
    for (const shot of site.shots) {
      copyFileSync(shot, join(WORK, 'assets', 'media', `img${n}.jpg`));
      n++;
    }
    log(`captured ${site.shots.length} screenshot(s)`);
  }

  log('writing script via GuRouter…');
  const scriptSource = siteText ? { ...job, body_markdown: siteText } : job;
  const script = isBusiness ? await writeBusinessScript(scriptSource) : await writeScript(job);
  log(`script ok (${job.kind})`);

  // TTS per scene. Post: hook → 3 takeaways → the open question → the
  // read-the-article invite. Business: hook → reveal → 3 points → cta
  // (contact scene is silent on a fixed beat). edge-tts occasionally
  // returns an empty file (network hiccup) — retry, then fall back to
  // the companion voice before giving up.
  const READ_CTA = 'Đọc bài viết để biết thêm chi tiết';
  const segTexts = isBusiness
    ? [script.hook, `${job.project?.name || ''}. ${script.reveal}`, script.points.join(' '), script.cta]
    : [script.hook, script.points.join(' '), script.question, 'Đọc bài viết để biết thêm chi tiết'];
  const segs = [];
  for (const [i, text] of segTexts.entries()) {
    const mp3 = join(WORK, 'assets', `seg${i}.mp3`);
    const ok = (f) => existsSync(f) && statSync(f).size > 500;
    let done = false, lastErr = '';
    // The endpoint throttles bursts: space every attempt out, escalate
    // the backoff, and keep the last stderr for the failure report.
    for (const voice of [VOICE, 'vi-VN-HoaiMyNeural']) {
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        const r = spawnSync('edge-tts', ['--voice', voice, '--rate=+8%', '--text', text, '--write-media', mp3], { encoding: 'utf8' });
        if (ok(mp3)) { done = true; break; }
        lastErr = (r.stderr || r.stdout || '').toString().slice(-120);
        spawnSync('sleep', [String(4 + attempt * 4)]);
      }
      if (done) break;
    }
    if (!done) throw new Error(`edge-tts failed for segment ${i} (both voices): ${lastErr}`);
    segs.push(audioSeconds(mp3));
    spawnSync('sleep', ['2']); // pace consecutive calls — no bursts
  }
  log(`tts: ${segs.map((d) => d.toFixed(1) + 's').join(' + ')}`);

  // Real imagery: post videos scrape the project's website for scene
  // backgrounds, falling back to the R2 hero the claim payload carries.
  if (!isBusiness) {
    media = await collectMedia(job);
  }
  const heroB64 = job.hero_image_base64 || job.project?.hero_image_base64;
  if (!media.length && heroB64) {
    writeFileSync(join(WORK, 'assets', 'hero.jpg'), Buffer.from(heroB64, 'base64'));
  }

  // Brand logo — downloaded once, overlaid on every scene by the shell.
  const logoSrc = await downloadLogo(job.project?.logo_url);

  // Background music — synthesised ambient pad trimmed to the video
  // length, mixed well under the voice (data-volume in the composition).
  const bgmSrc = makeBgm(
    segs.reduce((a, s) => a + s + 0.4, 0),
    `${job.slug}-${job.kind}`
  );
  if (bgmSrc) log('bgm: ambient pad mixed in');

  log('composing…');
  const html = isBusiness
    ? composeBusinessHtml(job, script, segs, media, logoSrc, bgmSrc)
    : composeHtml(job, script, segs, logoSrc, bgmSrc);
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

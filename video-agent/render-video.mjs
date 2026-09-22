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
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync, readdirSync, copyFileSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  MAX_SCENES, MIN_SCENES, sceneInner, sanitizePlan, planFromMarkdown,
} from './explainer.mjs';
import { captureSite, collectMedia, downloadLogo } from './assets.mjs';

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
// schemas. Shared by the script and the explainer plan, which are both
// "strict JSON" answers from the same model.
function repairJson(raw) {
  let s = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const first = s.indexOf('{');
  if (first > 0) s = s.slice(first);
  const tryParse = (txt) => { try { return JSON.parse(txt); } catch { return null; } };

  const direct = tryParse(s);
  if (direct) return { parsed: direct, text: s };

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
  return { parsed: tryParse(fixed), text: s };
}

function parseScript(raw) {
  const { parsed, text: s } = repairJson(raw);
  if (parsed) return parsed;

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

// ── 2c. explainer plan — the article's structure, not its prose ───────
// The LLM fills a typed plan; video-agent/explainer.mjs draws it. Two
// rules the model cannot be trusted with, so the code enforces them:
// every number must exist in the article (sanitizePlan), and the video
// must stay inside the scene budget. A plan that fails either is repaired
// or replaced by planFromMarkdown — the job never dies for want of a model.
export function parsePlan(raw) {
  const { parsed } = repairJson(raw);
  if (!parsed) return null;
  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes
    : Array.isArray(parsed.shots) ? parsed.shots
    : null;
  if (!scenes) return null;
  return { title: String(parsed.title || '').trim(), scenes };
}

async function writePlan(job) {
  if (!GUROUTER_KEY) throw new Error('GUROUTER_API_KEY missing in video-agent/.env');
  // The plan needs the whole argument, not the teaser's 3500-char skim.
  const article = String(job.body_markdown || '').slice(0, 8000);
  const sys = `Bạn là đạo diễn video giải thích (explainer) cho bài blog tiếng Việt.
Nhiệm vụ: đọc bài rồi chia nó thành các CẢNH, mỗi cảnh nói một ý và có cách hiển thị phù hợp.
Chỉ trả JSON thuần, không markdown, không giải thích.`;

  const user = `Bài viết:
Tiêu đề: ${job.title}
Mô tả: ${job.meta_description || ''}
Nội dung: ${article}

Trả JSON đúng dạng:
{"title":"...","scenes":[{...}]}

Mỗi cảnh có "type", "say" (lời đọc tiếng Việt, 1-2 câu, tự nhiên như người kể), và dữ liệu của loại đó:

- {"type":"hook","say":"...","text":"câu mở, tối đa 12 từ"}
- {"type":"stat","say":"...","value":40,"unit":"%","label":"nhãn ngắn","icon":"clock"}
- {"type":"bars","say":"...","title":"...","unit":"%","items":[{"label":"...","value":30}]}
- {"type":"donut","say":"...","value":65,"label":"nhãn ngắn"}
- {"type":"line","say":"...","title":"...","items":[{"label":"2023","value":12}]}
- {"type":"steps","say":"...","title":"...","items":[{"icon":"cart","label":"bước ngắn"}]}
- {"type":"timeline","say":"...","title":"...","items":[{"label":"mốc","text":"chuyện gì"}]}
- {"type":"icons","say":"...","title":"...","items":[{"icon":"shield","label":"ý ngắn"}]}
- {"type":"compare","say":"...","title":"...","left":{"title":"Nên","items":["..."]},"right":{"title":"Tránh","items":["..."]}}
- {"type":"quote","say":"...","text":"câu đắt nhất trong bài"}
- {"type":"outro","say":"...","text":"Đọc bài viết đầy đủ"}

ICON hợp lệ: check, x, clock, dollar, trend, users, cart, shield, phone, pin, star, zap, leaf, tool, book, truck, home, calendar, message, heart, target, key, box, globe, award, percent.

QUY TẮC BẮT BUỘC:
1. CHỈ dùng con số CÓ TRONG BÀI. Tuyệt đối không bịa, không làm tròn, không suy diễn. Nếu bài không có số thì đừng dùng cảnh stat/bars/donut/line.
2. ${MIN_SCENES}-${MAX_SCENES} cảnh, bắt đầu bằng hook, kết thúc bằng outro.
3. "say" của tất cả các cảnh cộng lại khoảng 45-75 giây đọc (khoảng 200-240 từ).
4. Mỗi cảnh chỉ một ý. Đừng lặp lại cùng một số ở hai cảnh.
5. Tiếng Việt tự nhiên, không emoji, không markdown.

VÍ DỤ (bài về chi phí bao bì):
{"title":"Giảm chi phí bao bì","scenes":[
 {"type":"hook","say":"Bao bì đang ăn mất một phần lợi nhuận mà bạn không thấy.","text":"Bao bì ăn mất lợi nhuận bạn không thấy"},
 {"type":"bars","say":"Khảo sát cho thấy bao bì chiếm 12 phần trăm, trong khi vận chuyển chỉ 7 phần trăm.","title":"Chi phí chiếm bao nhiêu","unit":"%","items":[{"label":"Bao bì","value":12},{"label":"Vận chuyển","value":7}]},
 {"type":"quote","say":"Đổi sang hộp giấy một lớp là cách rẻ nhất để bắt đầu.","text":"Đổi sang hộp giấy một lớp là cách rẻ nhất để bắt đầu."},
 {"type":"outro","say":"Đọc bài viết đầy đủ để xem bảng giá từng loại.","text":"Đọc bài viết đầy đủ"}]}

Trả JSON:`;

  const r = await fetch(`${GUROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${GUROUTER_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: GUROUTER_MODEL,
      messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      temperature: 0.6, max_tokens: 3000, response_format: { type: 'json_object' },
    }),
  }).catch((e) => { throw new Error('gurouter_unreachable: ' + e.message); });
  if (!r.ok) throw new Error(`gurouter HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const raw = data?.choices?.[0]?.message?.content || '';
  const plan = parsePlan(raw);
  if (!plan) throw new Error('plan_schema_bad: ' + String(raw).slice(0, 150));

  const { plan: clean, dropped } = sanitizePlan(plan, job.body_markdown || '');
  if (dropped.length) {
    log(`plan: dropped ${dropped.length} scene(s) — ${dropped.map((d) => `${d.type}:${d.reason}`).join(', ')}`);
  }
  if (clean.scenes.length < MIN_SCENES) {
    throw new Error(`plan_too_thin: only ${clean.scenes.length} scene(s) survived the number guard`);
  }
  return clean;
}

// What a scene says out loud when the model left "say" out. Deterministic,
// so the segment count always matches the scene count — the composition
// maps audio by index, and a mismatch would desync voice from picture.
export function narrationFor(s) {
  const items = (arr) => (Array.isArray(arr) ? arr : []);
  switch (s?.type) {
    case 'hook': return String(s.text || '');
    case 'stat': return `${s.value}${s.unit || ''} ${s.label || ''}`.trim();
    case 'donut': return `${s.value} phần trăm ${s.label || ''}`.trim();
    case 'bars':
    case 'line':
      return [s.title, ...items(s.items).map((i) => `${i.label} ${i.value}${s.unit || ''}`)].filter(Boolean).join('. ');
    case 'steps': return items(s.items).map((i, n) => `${n + 1}. ${i.label}`).join('. ');
    case 'timeline': return items(s.items).map((i) => `${i.label}: ${i.text || ''}`).join('. ');
    case 'icons': return [s.title, ...items(s.items).map((i) => i.label)].filter(Boolean).join('. ');
    case 'compare':
      return [s.title, s.left?.title, ...items(s.left?.items), s.right?.title, ...items(s.right?.items)]
        .filter(Boolean).join('. ');
    case 'quote': return String(s.text || '');
    case 'outro': return String(s.text || 'Đọc bài viết đầy đủ');
    default: return '';
  }
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
// scene is the curiosity gap that sells the read. Exported so the test
// can check the music track the shell emits (and its gain).
export function composeHtml(job, script, segs, logoSrc = null, bgmSrc = null) {
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

// Explainer composition — the article explained, one scene at a time.
// Each scene's markup comes from video-agent/explainer.mjs; this function
// only times it against the narration and hands it to the shared shell.
// No GSAP here beyond the shell's fade: charts are static SVG, so a
// snapshot at any moment is reproducible.
export function composeExplainerHtml(job, plan, segs, logoSrc = null, bgmSrc = null) {
  const accent = job.project?.accent || ACCENT;
  const scenes = (plan?.scenes || []).slice(0, MAX_SCENES);
  const GAP = 0.35;
  const hasHero = existsSync(join(WORK, 'assets', 'hero.jpg'));
  let t = 0;
  const sceneHtml = [];
  const bgEls = [];
  for (const [i, s] of scenes.entries()) {
    s.start = t;
    // A scene with no narration still gets a beat, or the cut is invisible.
    s.dur = Math.max(1.5, (segs[i] || 0)) + GAP;
    sceneHtml.push(`<div id="s${i}" class="clip scene" data-start="${t.toFixed(2)}" data-duration="${s.dur.toFixed(2)}" data-track-index="0">${sceneInner(s, accent)}</div>`);
    // A photo sits behind prose only. Charts need a clean surface, and the
    // hook/quote scenes are the two that read better with a real image.
    if (hasHero && (s.type === 'hook' || s.type === 'quote')) {
      s.bgId = `bg${bgEls.length}`;
      bgEls.push(s);
      sceneHtml.push(`<div id="${s.bgId}" class="clip bgi" data-start="${t.toFixed(2)}" data-duration="${s.dur.toFixed(2)}" data-track-index="1"><img src="assets/hero.jpg" alt=""/></div>`);
    }
    t += s.dur;
  }
  const total = scenes.reduce((a, s) => a + s.dur, 0);
  const audioHtml = scenes.map((s, i) =>
    `<audio class="clip" data-start="${s.start.toFixed(2)}" data-duration="${(segs[i] || 0).toFixed(2)}" data-track-index="5" src="assets/seg${i}.mp3"></audio>`
  ).join('\n  ');

  return businessShell({ accent, total, sceneHtml, audioHtml, bgEls, sceneMeta: scenes, logoSrc, bgmSrc });
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

  /* ── explainer primitives ────────────────────────────────────────────
     Charts at 720px: shapes in SVG, every label in HTML (SVG text cannot
     wrap, and Vietnamese labels are long). Type is smaller than the teaser
     scale on purpose — a chart needs room for six bars, not one sentence. */
  .ex { display:flex; flex-direction:column; align-items:center; gap:20px; width:100%; }
  .ex-title { color:#9fb3c8; font-size:30px; font-weight:600; }
  .ico { display:block; }
  .stat-ico { color:${A}; }
  .stat-v { display:flex; align-items:baseline; gap:12px; }
  .stat-n { color:#fff; font-weight:800; line-height:1; letter-spacing:-0.03em; }
  .stat-u { color:${A}; font-size:64px; font-weight:700; }
  .stat-l { color:#c9d6e2; font-size:36px; line-height:1.35; max-width:580px; }
  .bars { display:flex; flex-direction:column; gap:24px; width:100%; }
  .bar-row { display:flex; align-items:center; gap:14px; }
  .bar-lab { color:#c9d6e2; font-size:24px; width:210px; text-align:right; line-height:1.2; }
  .bar-track { flex:1; height:30px; border-radius:999px; background:rgba(255,255,255,0.12); overflow:hidden; }
  .bar-fill { display:block; height:100%; border-radius:999px; }
  .bar-val { color:#fff; font-size:28px; font-weight:700; width:120px; text-align:left; }
  .donut-wrap { position:relative; width:320px; height:320px; }
  .donut-c { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
  .donut-n { color:#fff; font-size:78px; font-weight:800; }
  .line-wrap { position:relative; width:620px; }
  .line-labs { position:relative; height:36px; margin-top:4px; }
  .line-lab { position:absolute; transform:translateX(-50%); color:#9fb3c8; font-size:22px; white-space:nowrap; }
  .steps { display:flex; flex-direction:column; width:100%; }
  .step { display:flex; align-items:flex-start; gap:16px; }
  .step-n { width:56px; height:56px; flex:none; border-radius:50%; color:#fff; font-size:28px;
    font-weight:800; display:flex; align-items:center; justify-content:center; }
  .step-b { text-align:left; padding-top:8px; }
  .step-t { color:#f4f6f8; font-size:32px; font-weight:600; line-height:1.3;
    display:flex; align-items:center; gap:10px; }
  .step-d { color:#9fb3c8; font-size:26px; margin-top:4px; }
  .step-arrow { width:3px; height:26px; margin-left:26px; background:rgba(255,255,255,0.25); }
  .timeline { display:flex; flex-direction:column; gap:18px; width:100%; text-align:left; }
  .tl-row { display:flex; gap:16px; }
  .tl-dot { width:22px; height:22px; border-radius:50%; flex:none; margin-top:10px; }
  .tl-l { color:#fff; font-size:32px; font-weight:700; }
  .tl-t { color:#c9d6e2; font-size:26px; line-height:1.35; }
  .icon-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:26px 18px; width:100%; }
  .ig-item { display:flex; flex-direction:column; align-items:center; gap:10px; }
  .ig-ico { color:${A}; }
  .ig-lab { color:#f4f6f8; font-size:26px; line-height:1.25; }
  .compare { display:grid; grid-template-columns:1fr 1fr; gap:16px; width:100%; }
  .cmp-col { border-radius:16px; padding:18px 16px; background:rgba(255,255,255,0.06); }
  .cmp-good { border:2px solid rgba(82,196,26,0.55); }
  .cmp-bad { border:2px solid rgba(255,77,79,0.5); }
  .cmp-h { color:#fff; font-size:28px; font-weight:700; margin-bottom:12px; }
  .cmp-i { color:#e6edf5; font-size:24px; line-height:1.35; display:flex; gap:8px;
    margin:8px 0; text-align:left; }
  .cmp-m { flex:none; display:flex; }
  .cmp-m.good { color:#52c41a; }
  .cmp-m.bad { color:#ff4d4f; }
  .quote-mark { font-size:150px; line-height:0.55; font-weight:800; }
  .quote-t { color:#fff; font-size:44px; font-weight:600; line-height:1.35; max-width:580px; }
  .quote-s { color:#9fb3c8; font-size:28px; margin-top:16px; }
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

// ── 4c. background music — synthesised ambient pad, licence-free ─────
// A soft major-chord pad generated with ffmpeg (no third-party service,
// no licensing questions). The chord set is picked by the job slug so a
// project keeps the same bed across renders, and the pad is trimmed to
// the video length with fades. Set VIDEO_MUSIC=off to disable.
//
// Levels matter more than they look: mastered to ≈ -31 LUFS / -19 dBFS
// peak the bed lands ~18 LU under the edge-tts voice once the
// composition applies its data-volume. The first version produced a
// -45 LUFS file, which measured 31 LU under the voice in a real render
// — indistinguishable from a video with no music — because `amix`
// divides by its input count (9.5 dB thrown away) and the chord sat at
// 220-330 Hz, under what a phone speaker reproduces. Hence normalize=0,
// hotter sines, and an octave up.
//
// Exported, with an injectable `out`, for scripts/run-video-agent-tests.mjs:
// a bed nobody can hear is the bug this function has to not repeat.
export function makeBgm(totalSec, seedStr, out = join(WORK, 'assets', 'bgm.mp3')) {
  if (String(E('VIDEO_MUSIC') || '').toLowerCase() === 'off') return null;
  const chords = [
    [440.0, 554.4, 659.2],  // A major — warm
    [349.2, 440.0, 523.2],  // F major — calm
    [392.0, 493.8, 587.4],  // G major — open
    [329.6, 415.4, 523.2],  // E minor — soft
  ];
  // The chord set is picked by the job slug so a project keeps the same
  // bed across renders.
  const seed = String(seedStr || 'x').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const ch = chords[seed % chords.length];
  mkdirSync(dirname(out), { recursive: true });
  const fadeOut = Math.max(1, totalSec - 3).toFixed(1);
  const r = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', `sine=frequency=${ch[0]}:duration=${totalSec.toFixed(1)}`,
    '-f', 'lavfi', '-i', `sine=frequency=${ch[1]}:duration=${totalSec.toFixed(1)}`,
    '-f', 'lavfi', '-i', `sine=frequency=${ch[2]}:duration=${totalSec.toFixed(1)}`,
    '-filter_complex',
    `[0]volume=0.30[a];[1]volume=0.34[b];[2]volume=0.30[c];[a][b][c]amix=inputs=3:normalize=0,tremolo=f=0.4:d=0.6,lowpass=f=2400,afade=t=in:d=2,afade=t=out:st=${fadeOut}:d=3[out]`,
    '-map', '[out]', '-b:a', '128k', out,
  ], { encoding: 'utf8', timeout: 60000 });
  return r.status === 0 && existsSync(out) && statSync(out).size > 5000 ? out : null;
}

// ── 4d. loudness master — the finished mix at social loudness ────────
// A real render of the composition measures ≈ -29 LUFS integrated: the
// visuals, the voice and the bed are each fine, but the delivered file is
// ~15 LU quieter than what social platforms expect, so it plays back faint
// in-feed. So the mixed MP4 is measured (EBU R128) and the whole mix is
// scaled by one static gain to -14 LUFS, capped so a true peak never
// lands above -1.5 dBTP.
//
// One gain, not ffmpeg's `loudnorm=...:linear=true`: loudnorm honours
// linear mode only while the source's measured LRA is non-zero and the
// gain fits under the TP ceiling, and otherwise falls back to *dynamic*
// normalization without saying so — a time-varying gain that lifts the bed
// through every pause in the voice, which would move the voice-to-bed
// balance. `volume` cannot: voice and bed are multiplied by the same
// number, so the balance the composition sets with data-volume is fixed by
// construction. (Measured on a narration that pauses every 1.5s: one gain
// keeps a gain spread of 0.03 dB across the file, the dynamic fallback
// 1.1 dB.)
//
// A file we cannot measure (no audio stream, ffmpeg missing) is delivered
// untouched rather than failing the job, but the caller logs the skip: a
// silent one is how the quiet-mix bug survived this long.
//
// Exported, with an injectable `out`, for scripts/run-video-agent-tests.mjs:
// the claim is a number, so the test re-measures the master with ebur128
// and checks the gain is one constant across the file.
export const LOUDNESS = { i: -14, tp: -1.5 };

export function masterLoudness(src, out = join(WORK, 'renders', 'master.mp4')) {
  // Plain `ebur128=peak=true` only. `framelog=quiet` is not a value ffmpeg
  // 4.4 (Ubuntu 22.04, i.e. the render VPS) accepts: it aborts with
  // "Error reinitializing filters!" and never prints a Summary, so every
  // real render fell through to "master skipped". The frame log it was
  // suppressing is stderr noise, nothing more.
  const meas = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', src,
    '-af', 'ebur128=peak=true', '-f', 'null', '-',
  ], { encoding: 'utf8', timeout: 5 * 60 * 1000 });
  const summary = (meas.stderr || '').split('Summary:')[1];
  if (!summary) {
    log(`loudness: no ebur128 summary (ffmpeg exit ${meas.status}) — ` +
      (meas.stderr || '').trim().split('\n').slice(-2).join(' ').slice(-160));
    return null;
  }
  const num = (re) => Number((summary.match(re) || [])[1]);
  const i = num(/I:\s+(-?[\d.]+) LUFS/);
  const tp = num(/Peak:\s+(-?[\d.]+) dBFS/);
  // Digital silence measures -inf, which parses to NaN, so one guard does.
  if (!(i > -70) || !Number.isFinite(tp)) return null;
  const gain = Math.min(LOUDNESS.i - i, LOUDNESS.tp - tp);
  const r = spawnSync('ffmpeg', [
    '-y', '-i', src, '-af', `volume=${gain.toFixed(2)}dB`,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', out,
  ], { encoding: 'utf8', timeout: 10 * 60 * 1000 });
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
// Exported (with composeCarouselSlideHtml below) for
// scripts/run-video-agent-tests.mjs — the deck contract they encode is what
// the platform's deliver endpoint and the admin UI depend on, and it is
// checkable without Chrome, hyperframes or the network.
export function slideQueries(job, script, idx) {
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
export function composeCarouselSlideHtml(job, script, slideIdx, assetsDir = join(WORK, 'assets')) {
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
  const bgSrc = existsSync(join(assetsDir, own)) ? own
    : existsSync(join(assetsDir, 'hero.jpg')) ? 'hero.jpg' : null;
  const bg = bgSrc ? `<div class="bgi"><img src="assets/${bgSrc}" alt=""/></div>` : '';
  const logo = existsSync(join(assetsDir, 'logo.png'))
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
//
// `deps` are test seams (scripts/run-video-agent-tests.mjs drives this path
// with a temp workspace and faked snapshot/photo/deliver); production calls
// it with the job alone.
export async function renderCarousel(job, deps = {}) {
  const work = deps.work || WORK;
  const spawn = deps.spawn || spawnSync;
  const photo = deps.photo || fetchOpenversePhoto;
  const deliver = deps.deliver || api;
  log(`carousel for ${job.slug} (job ${job.id})`);
  mkdirSync(join(work, 'assets'), { recursive: true });
  // Drop the previous deck's photos so a failed fetch this run cannot be
  // papered over by a stale slide-*.jpg left behind by an earlier job.
  for (let i = 0; i < 5; i++) rmSync(join(work, 'assets', `slide-${i}.jpg`), { force: true });

  const heroB64 = job.hero_image_base64 || job.project?.hero_image_base64;
  if (heroB64) writeFileSync(join(work, 'assets', 'hero.jpg'), Buffer.from(heroB64, 'base64'));

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
        const shot = await photo(q, usedIds);
        writeFileSync(join(work, 'assets', `slide-${i}.jpg`), shot.bytes);
        log(`slide ${i + 1} photo: "${q}" (${shot.credit.license})`);
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
    writeFileSync(join(work, 'index.html'), composeCarouselSlideHtml(job, script, i, join(work, 'assets')));
    rmSync(join(work, 'snapshots'), { recursive: true, force: true });
    const ren = spawn('npx', ['-y', `hyperframes@${HF_VERSION}`, 'snapshot', '--at', '0.5', '--timeout', '9000'],
      { cwd: work, encoding: 'utf8', timeout: 3 * 60 * 1000 });
    if (ren.status !== 0) throw new Error(`snapshot slide ${i + 1} failed: ` + ((ren.stderr || ren.stdout || '').slice(-300)));
    const frame = readdirSync(join(work, 'snapshots'))
      .filter((f) => f.startsWith('frame-') && f.endsWith('.png')).sort()[0];
    if (!frame) throw new Error(`snapshot produced no PNG for slide ${i + 1}`);
    slides.push(readFileSync(join(work, 'snapshots', frame)).toString('base64'));
  }
  log(`slides: ${slides.length} PNG(s) → delivering`);

  const up = await deliver('/api/admin/video/carousel-deliver', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ job_id: job.id, slides }),
  });
  const out = await up.json().catch(() => ({}));
  if (!up.ok || out.status !== 'done') throw new Error(`carousel deliver failed: HTTP ${up.status} ${JSON.stringify(out).slice(0, 200)}`);
  log(`done → ${out.prefix} (${out.slides?.length || slides.length} slides)`);
}

// ── 5. render + deliver one job ───────────────────────────────────────
// TTS per scene, one file per entry in `segTexts` — the composition maps
// audio to scenes by index, so the count must match exactly. edge-tts
// occasionally returns an empty file (network hiccup): retry, then fall
// back to the companion voice before giving up.
export function speakSegments(segTexts, work, spawn) {
  const segs = [];
  for (const [i, text] of segTexts.entries()) {
    const mp3 = join(work, 'assets', `seg${i}.mp3`);
    const ok = (f) => existsSync(f) && statSync(f).size > 500;
    let done = false, lastErr = '';
    // The endpoint throttles bursts: space every attempt out, escalate
    // the backoff, and keep the last stderr for the failure report.
    for (const voice of [VOICE, 'vi-VN-HoaiMyNeural']) {
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        const r = spawn('edge-tts', ['--voice', voice, '--rate=+8%', '--text', text, '--write-media', mp3], { encoding: 'utf8' });
        if (ok(mp3)) { done = true; break; }
        lastErr = (r.stderr || r.stdout || '').toString().slice(-120);
        spawn('sleep', [String(4 + attempt * 4)]);
      }
      if (done) break;
    }
    if (!done) throw new Error(`edge-tts failed for segment ${i} (both voices): ${lastErr}`);
    segs.push(audioSeconds(mp3));
    spawn('sleep', ['2']); // pace consecutive calls — no bursts
  }
  log(`tts: ${segs.map((d) => d.toFixed(1) + 's').join(' + ')}`);
  return segs;
}

// `deps` are test seams (scripts/run-video-agent-tests.mjs drives this path
// with a temp workspace and faked TTS + render + deliver): what the agent
// hands to the platform is the end of a chain — TTS, composition, render,
// mastering — and only a real run of the whole chain shows which file that
// is. Production calls it with the job alone.
export async function renderOne(job, deps = {}) {
  const work = deps.work || WORK;
  const spawn = deps.spawn || spawnSync;
  const deliver = deps.deliver || api;
  log(`claimed ${job.slug} (${job.kind}, job ${job.id})`);
  rmSync(join(work, 'renders'), { recursive: true, force: true });
  rmSync(join(work, 'snapshots'), { recursive: true, force: true });
  mkdirSync(join(work, 'assets'), { recursive: true });

  // Carousel: static 4:5 slides (1080×1350) exported with hyperframes
  // snapshot — no TTS, no video. Same script as the post teaser.
  if (job.kind === 'carousel') {
    await renderCarousel(job, deps);
    return;
  }

  const isBusiness = job.kind === 'business' || job.kind === 'website';
  const isExplainer = job.kind === 'explainer';
  let siteText = null;

  // Website promos: screenshot the live site + scrape its text as the
  // storyboard source. Shots become the scene backgrounds.
  let media = [];
  if (job.kind === 'website' && job.source_url) {
    log(`capturing ${job.source_url}…`);
    const site = await captureSite(job.source_url, work, log);
    if (site.text) siteText = site.text;
    // Screenshots double as the media pool (img{n}.jpg naming).
    let n = 0;
    for (const shot of site.shots) {
      copyFileSync(shot, join(work, 'assets', 'media', `img${n}.jpg`));
      n++;
    }
    log(`captured ${site.shots.length} screenshot(s)`);
  }

  // The narration source is the only thing that differs by kind; the TTS
  // loop, the imagery, the music, the render and the master are shared.
  let script = null;
  let plan = null;
  if (isExplainer) {
    log('writing explainer plan via GuRouter…');
    try {
      plan = await writePlan(job);
      log(`plan ok (${plan.scenes.length} scenes: ${plan.scenes.map((s) => s.type).join(', ')})`);
    } catch (e) {
      // GuRouter down, out of quota, or a plan the number guard gutted:
      // derive the scenes from the article itself, the way the carousel
      // already does. A model outage must not cost the job.
      log(`plan failed (${String(e?.message || e).slice(0, 120)}) — deriving scenes from the article`);
      plan = planFromMarkdown(job.body_markdown, job.title);
    }
  } else {
    log('writing script via GuRouter…');
    const scriptSource = siteText ? { ...job, body_markdown: siteText } : job;
    script = isBusiness ? await writeBusinessScript(scriptSource) : await writeScript(job);
    log(`script ok (${job.kind})`);
  }

  const READ_CTA = 'Đọc bài viết để biết thêm chi tiết';
  const segTexts = isExplainer
    ? plan.scenes.map((s) => String(s.say || narrationFor(s)).trim() || ' ')
    : isBusiness
      ? [script.hook, `${job.project?.name || ''}. ${script.reveal}`, script.points.join(' '), script.cta]
      : [script.hook, script.points.join(' '), script.question, READ_CTA];
  const segs = speakSegments(segTexts, work, spawn);

  // Real imagery: post videos scrape the project's website for scene
  // backgrounds, falling back to the R2 hero the claim payload carries.
  // An explainer skips the scrape — its scenes are charts, and a photo
  // behind a chart is what makes numbers unreadable.
  if (!isBusiness && !isExplainer) {
    media = await collectMedia(job, work, log);
  }
  const heroB64 = job.hero_image_base64 || job.project?.hero_image_base64;
  if (!media.length && heroB64) {
    writeFileSync(join(work, 'assets', 'hero.jpg'), Buffer.from(heroB64, 'base64'));
  }

  // Brand logo — downloaded once, overlaid on every scene by the shell.
  const logoSrc = await downloadLogo(job.project?.logo_url, work, log);

  // Background music — synthesised ambient pad trimmed to the video
  // length, mixed well under the voice (data-volume in the composition).
  const bgmSrc = makeBgm(
    segs.reduce((a, s) => a + s + 0.4, 0),
    `${job.slug}-${job.kind}`,
    join(work, 'assets', 'bgm.mp3')
  );
  if (bgmSrc) log('bgm: ambient pad mixed in');
  else log('bgm: none (VIDEO_MUSIC=off, or ffmpeg missing/failed) — voice only');

  log('composing…');
  const html = isExplainer
    ? composeExplainerHtml(job, plan, segs, logoSrc, bgmSrc)
    : isBusiness
      ? composeBusinessHtml(job, script, segs, media, logoSrc, bgmSrc)
      : composeHtml(job, script, segs, logoSrc, bgmSrc);
  writeFileSync(join(work, 'index.html'), html);

  log('rendering (hyperframes)…');
  const ren = spawn('npx', ['-y', `hyperframes@${HF_VERSION}`, 'render'], { cwd: work, encoding: 'utf8', timeout: 15 * 60 * 1000 });
  if (ren.status !== 0) {
    throw new Error('render failed: ' + ((ren.stderr || ren.stdout || '').slice(-400)));
  }
  const renders = join(work, 'renders');
  const mp4 = readdirSync(renders).filter((f) => f.endsWith('.mp4'))
    .map((f) => ({ f, m: statSync(join(renders, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)[0]?.f;
  if (!mp4) throw new Error('render produced no mp4');
  const raw = join(renders, mp4);
  const mastered = masterLoudness(raw, join(renders, 'master.mp4'));
  const bytes = readFileSync(mastered || raw);
  log(`${mastered ? `mastered to ${LOUDNESS.i} LUFS` : 'loudness master skipped'} ` +
    `(${(bytes.length / 1024).toFixed(0)}KB) → delivering`);

  const up = await deliver('/api/admin/video/deliver', {
    method: 'POST',
    headers: { 'x-video-job': job.id, 'content-type': 'video/mp4' },
    body: bytes,
  });
  const out = await up.json().catch(() => ({}));
  if (!up.ok || out.status !== 'done') throw new Error(`deliver failed: HTTP ${up.status} ${JSON.stringify(out).slice(0, 200)}`);
  log(`done → ${out.video_key}`);
}

// ── main — batch loop (VIDEO_BATCH jobs per invocation) ───────────────
// Gated on being the entry point: the test suite imports this module for
// the pure slide helpers, and importing must not claim a job or exit.
const invokedDirectly = (() => {
  try { return realpathSync(process.argv[1] || '') === fileURLToPath(import.meta.url); } catch { return false; }
})();

if (invokedDirectly) {
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
}

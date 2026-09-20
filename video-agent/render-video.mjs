#!/usr/bin/env node
// pages-seo video agent — one invocation renders one 9:16 social video.
//
//   node render-video.mjs                 # auto-claim the newest queued post
//   node render-video.mjs --slug <slug>   # render one specific post
//
// Pipeline: claim → GuRouter script → edge-tts (vi-VN) → HyperFrames
// composition → render → deliver MP4 back to the platform (R2 + D1).
//
// Config in video-agent/.env (0600): BASE_URL, ADMIN_TOKEN,
// GUROUTER_API_KEY, VIDEO_VOICE (default vi-VN-NamMinhNeural),
// VIDEO_PROJECT_ID (optional auto-claim filter), ACCENT (hex, optional).
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
const SLUG = process.argv.includes('--slug') ? process.argv[process.argv.indexOf('--slug') + 1] : null;

const log = (m) => console.log(`[video-agent] ${m}`);
const die = (m) => { console.error(`[video-agent] FAIL: ${m}`); process.exit(1); };
if (!BASE_URL || !TOKEN) die('BASE_URL / ADMIN_TOKEN missing — configure video-agent/.env');

const WORK = join(ROOT, 'workspace');
const api = (path, opts = {}) => fetch(`${BASE_URL}${path}`, {
  ...opts,
  headers: { authorization: `Bearer ${TOKEN}`, ...(opts.headers || {}) },
});

// ── 1. claim ──────────────────────────────────────────────────────────
async function claim() {
  const body = {};
  if (SLUG) body.slug = SLUG;
  else if (PROJECT_ID) body.project_id = PROJECT_ID;
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
// Repair by closing whatever is still open — good enough for this fixed
// 3-field schema, and a regex fallback recovers the fields individually.
function parseScript(raw) {
  let s = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const first = s.indexOf('{');
  if (first > 0) s = s.slice(first);
  const tryParse = (txt) => { try { return JSON.parse(txt); } catch { return null; } };

  const direct = tryParse(s);
  if (direct) return direct;

  // Repair: walk the string tracking string/escape state, then close
  // whatever the truncation left open, in reverse order.
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

  // Last resort: regex out the three fields independently.
  const str = (name) => {
    const m = s.match(new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`));
    return m ? m[1] : '';
  };
  const pts = s.match(/"points"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
  const items = pts ? [...pts[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]) : [];
  return { hook: str('hook'), points: items, cta: str('cta') };
}

// ── 3. tts — edge-tts per segment, duration via ffprobe ──────────────
function audioSeconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const d = parseFloat((r.stdout || '').trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error('ffprobe_duration_missing');
  return d;
}

// ── 4. composition — 9:16 720×1280, scenes timed to the TTS segments ──
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])); }

function composeHtml(job, script, segs) {
  const brand = job.project?.name || 'Blog';
  const outroUrl = job.project?.publishing_url || '';
  const hasHero = existsSync(join(WORK, 'assets', 'hero.jpg'));
  // 5 segments: hook, point×N, cta. Scene i is voiced by segment i and
  // lasts audio + a small tail so the fade-out never clips the voice.
  const GAP = 0.4;
  const scenes = [
    { kind: 'intro', seg: segs[0] },
    ...script.points.map((p, i) => ({ kind: 'point', text: p, seg: segs[i + 1] })),
    { kind: 'outro', text: script.cta, url: outroUrl, seg: segs[segs.length - 1] },
  ];
  let t = 0;
  const sceneHtml = [];
  const bgIndexes = [];
  for (const [i, s] of scenes.entries()) {
    s.start = t;
    s.dur = s.seg + 0.4;
    const inner = s.kind === 'intro'
      ? `<div class="badge">${esc(brand)}</div><h1 class="hook">${esc(script.hook)}</h1>`
      : s.kind === 'point'
        ? `<div class="num">${i}</div><p class="point">${esc(s.text)}</p>`
        : `<p class="outro">${esc(s.text)}</p><p class="sub">${esc(outroUrl)}</p>`;
    sceneHtml.push(`<div id="s${i}" class="clip scene" data-start="${t.toFixed(2)}" data-duration="${s.dur.toFixed(2)}" data-track-index="0">${inner}</div>`);
    if (hasHero && s.kind === 'point') {
      s.bgId = `bg${bgIndexes.length}`;
      bgIndexes.push(s);
      sceneHtml.push(`<div id="${s.bgId}" class="clip bgi" data-start="${t.toFixed(2)}" data-duration="${s.dur.toFixed(2)}" data-track-index="1"><img src="assets/hero.jpg" alt=""/></div>`);
    }
    t += s.seg + GAP;
  }
  const total = scenes.reduce((a, s) => a + s.seg + GAP, 0);
  const audioHtml = scenes.map((s, i) =>
    `<audio class="clip" data-start="${s.start.toFixed(2)}" data-duration="${s.seg.toFixed(2)}" data-track-index="5" src="assets/seg${i}.mp3"></audio>`
  ).join('\n  ');

  return `<!doctype html>
<html lang="vi"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=720, height=1280"/>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:720px; height:1280px; overflow:hidden; background:#0a0c10;
    font-family: Inter, "Noto Sans", ui-sans-serif, sans-serif; }
  #root { width:100%; height:100%; position:relative;
    background:linear-gradient(160deg,#0a0c10 0%,#152238 100%); }
  .scene { position:absolute; inset:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center; padding:56px; text-align:center; z-index:2; }
  .badge { background:${ACCENT}; color:#fff; font-size:26px; font-weight:700;
    padding:10px 30px; border-radius:999px; margin-bottom:36px; letter-spacing:0.04em; }
  .hook { color:#fff; font-size:60px; font-weight:700; line-height:1.25; letter-spacing:-0.02em; }
  .point { color:#f4f6f8; font-size:46px; font-weight:600; line-height:1.3;
    text-shadow:0 2px 18px rgba(0,0,0,0.75); }
  .num { color:${ACCENT}; font-size:120px; font-weight:800; opacity:0.35; margin-bottom:8px; }
  .outro { color:#fff; font-size:42px; font-weight:700; line-height:1.3; }
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
  ${scenes.map((s, i) => `tl.fromTo("#s${i}", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, ${s.start.toFixed(2)});
  tl.to("#s${i}", { opacity: 0, duration: 0.3 }, ${(s.start + s.dur - 0.35).toFixed(2)});`).join('\n  ')}
  ${bgIndexes.map((s) => `tl.fromTo("#${s.bgId}", { scale: 1.0 }, { scale: 1.12, duration: ${s.dur.toFixed(2)}, ease: "none" }, ${s.start.toFixed(2)});`).join('\n  ')}
  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;
  tl.seek(0);
</script></body></html>`;
}

// ── main ──────────────────────────────────────────────────────────────
const job = await claim();
if (!job) { log('nothing queued — every recent post already has a video'); process.exit(0); }
log(`claimed ${job.slug} (job ${job.id})`);

try {
  rmSync(join(WORK, 'renders'), { recursive: true, force: true });
  mkdirSync(join(WORK, 'assets'), { recursive: true });

  log('writing script via GuRouter…');
  const script = await writeScript(job);
  log(`script: hook="${script.hook.slice(0, 48)}…" + ${script.points.length} points + cta`);

  const segTexts = [script.hook, ...script.points, script.cta];
  const segs = [];
  for (const [i, text] of segTexts.entries()) {
    const mp3 = join(WORK, 'assets', `seg${i}.mp3`);
    const r = spawnSync('edge-tts', ['--voice', VOICE, '--rate=+8%', '--text', text, '--write-media', mp3], { encoding: 'utf8' });
    if (r.status !== 0 || !existsSync(mp3)) {
      throw new Error(`edge-tts failed for segment ${i}: ${(r.stderr || '').toString().slice(0, 200)}`);
    }
    segs.push(audioSeconds(mp3));
  }
  log(`tts: ${segs.map((d) => d.toFixed(1) + 's').join(' + ')}`);

  // Hero image from the claim payload (nullable — template has a fallback).
  if (job.hero_image_base64) {
    writeFileSync(join(WORK, 'assets', 'hero.jpg'), Buffer.from(job.hero_image_base64, 'base64'));
  }

  log('composing…');
  writeFileSync(join(WORK, 'index.html'), composeHtml(job, script, segs));

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
} catch (e) {
  // Report the failure so the platform row doesn't sit in 'claimed' forever.
  await reportFailure(job, e.message || String(e));
  die(e.message || String(e));
}

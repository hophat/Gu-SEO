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
import { esc, sceneInner, wantsBackground } from './scenes.mjs';
import {
  DURATION, INTENTS, MIN_SCENES, beatSlots, clampDuration, clampWords, intentFromSignals,
  reviewStoryboard, sanitizeStoryboard, storyboardFromContent, wordCount,
} from './storyboard.mjs';
import { collectAssets, downloadLogo } from './assets.mjs';
import { templateById, intentForTemplate } from './templates.mjs';

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
const GUROUTER_MODEL = E('GUROUTER_TEXT_MODEL') || 'deepseek/deepseek-v4.1-flash';
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

// ── 2. storyboard — the story, written to fit the video ───────────────
// One call returns both the intent and the scenes. The prompt is handed the
// suggested intent's beat template with its seconds, so the model fills a
// shape instead of inventing one, and it is told which assets exist so it
// references real material rather than describing it.
export function parseStoryboard(raw) {
  const { parsed } = repairJson(raw);
  if (!parsed) return null;
  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes : null;
  if (!scenes) return null;
  return {
    intent: String(parsed.intent || ''),
    duration: Number(parsed.duration) || undefined,
    scenes,
  };
}

const INTENT_BRIEF = `Chọn MỘT trong các intent sau, dựa trên nội dung thật:
- product_demo: đang cho xem một sản phẩm/website/dịch vụ số
- product_promotion: đang bán một sản phẩm
- local_business: quán/cửa hàng/địa điểm cụ thể
- educational: dạy một kiến thức
- storytelling: kể một câu chuyện có vấn đề và chuyển biến
- announcement: công bố điều gì mới
- testimonial: khách hàng nói
- before_after: trước và sau
- listicle: danh sách đếm được
- news: bản tin thời sự, có người dẫn và chữ chạy
- summary: tóm tắt ý chính của bài viết
- qa: đặt câu hỏi rồi trả lời`;

const SCENE_BRIEF = `Các loại cảnh được phép (chỉ dùng trong danh sách của intent đã chọn):
- hook {text} — câu mở gây tò mò, tối đa 8 từ, KHÔNG mở bằng tên thương hiệu
- problem {text} — nỗi đau của người xem
- product_reveal {text, asset} — tên sản phẩm + logo/ảnh
- ui_demo {text, asset} — ẢNH CHỤP THẬT trong khung điện thoại
- feature {text, icon} — một điểm mạnh
- result {text, value?, unit?} — kết quả
- before_after {text, asset, asset2} — hai ảnh thật cạnh nhau
- photo {text, asset} — ảnh thật tràn màn hình
- location {text, asset} — bản đồ + địa chỉ
- rating {text, value} — sao + một câu đánh giá
- cta {text, url} — MỘT hành động duy nhất
- quote {text} — một câu đắt
- stat {text, value, unit} · bars {text, items:[{label,value}]} · donut {text, value}
- line {text, items:[{label,value}]} · steps {text, items:[{label}]} · icons {text, items:[{icon,label}]}
- compare {text, left:{title,items}, right:{title,items}}
- anchor {text, name?} — người dẫn bản tin (lower-third); chỉ dùng khi có asset "presenter"
- headline {text, kicker?} — dòng tin lớn kiểu breaking news
- keypoints {text, items:[{label}]} — ý chính đánh số, tối đa 4 mục
- question {text} — câu hỏi lớn
- answer {text, asset?} — câu trả lời, có thể kèm ảnh

LUẬT BẮT BUỘC:
1. "text" tối đa 8 từ, là CAPTION ngắn chứ không phải toàn bộ lời kể. Không xuống dòng dài dòng.
2. "say" là lời đọc đầy đủ của cảnh đó, khoảng 80–95% số giây dàn ý (tính theo 2.3–2.7 từ/giây). Không để cảnh dài nhưng lời đọc chỉ có một câu ngắn.
3. Lời đọc phải triển khai TẤT CẢ ý chính, bối cảnh, chi tiết, kết quả và hành động có trong nội dung nguồn theo đúng thứ tự. Tuyệt đối không tạo khoảng trống, không giấu ý chính để người xem phải đọc bài mới hiểu.
4. CHỈ dùng asset có trong danh sách. Không bịa ảnh.
5. CHỈ dùng con số CÓ TRONG NỘI DUNG. Không làm tròn, không suy diễn.
6. Cảnh đầu là hook (bản tin mở bằng headline), cảnh cuối là cta. Không lặp hai cảnh cùng loại liền nhau.
7. Người xem phải hiểu nội dung khi TẮT TIẾNG — hình phải mang thông tin.
8. Phân công "motion" như đạo diễn: zoom cho hook, scroll cho ảnh chụp website trong khung, pan cho ảnh thật, reveal cho biểu đồ. Chuyển động phải chậm, liền mạch; không chọn none cho cảnh có ảnh.`;

async function writeStoryboard(job, { source, suggested, assets, target, forced = null }) {
  if (!GUROUTER_KEY) throw new Error('GUROUTER_API_KEY missing in video-agent/.env');
  // A user-chosen template fixes the intent: the model fills the shape it was
  // given rather than picking another one — and the caller pins the result
  // back to `forced` anyway, so a model that ignores the line below cannot
  // move the video off the chosen template.
  const intent = forced || suggested;
  const slots = beatSlots(intent, target);
  const outline = slots.map((s) => {
    const spokenWords = Math.max(5, Math.round(s.duration * 2.5));
    return `  ${s.beat} (~${s.duration}s, khoảng ${spokenWords} từ): ${s.types.join(' | ')}`;
  }).join('\n');
  const assetList = Object.keys(assets).length
    ? Object.keys(assets).map((k) => `  ${k}`).join('\n')
    : '  (không có asset thật nào — đừng dùng cảnh cần asset)';
  const intentLine = forced
    ? `Intent bắt buộc do người dùng chọn: ${forced}. Trả đúng "intent":"${forced}".`
    : `Intent gợi ý từ tín hiệu nội dung: ${suggested}. Chỉ đổi nếu bạn chắc chắn intent khác đúng hơn.`;
  // Example beat lengths scale with the selected template. Without this, a
  // 60s example taught the model to ignore a 20s/30s template request.
  const exampleWeights = [0.13, 0.16, 0.25, 0.25, 0.10, 0.10];
  const exampleDurations = exampleWeights.map((w) => Math.round(target * w * 10) / 10);
  exampleDurations[exampleDurations.length - 1] = Math.round(
    (exampleDurations.at(-1) + target - exampleDurations.reduce((a, b) => a + b, 0)) * 10,
  ) / 10;

  const user = `Nội dung nguồn:
Tiêu đề: ${job.title || job.project?.name || ''}
Mô tả: ${job.meta_description || job.project?.description || ''}
Nội dung đầy đủ, không được bỏ ý ở giữa hoặc cuối bài:
${String(source || '').trim()}
${job.project?.address ? `Địa chỉ: ${job.project.address}\n` : ''}${job.project?.phone ? `Điện thoại: ${job.project.phone}\n` : ''}

${INTENT_BRIEF}

${intentLine}

Dàn ý beat cho intent "${intent}" (tổng ~${target}s):
${outline}

Asset thật đang có (dùng đúng tên này ở trường "asset"):
${assetList}

${SCENE_BRIEF}

Trả JSON: {"intent":"${intent}","duration":${target},"scenes":[{"type":"...","text":"...","say":"...","duration":số,"asset":"tên asset nếu cần","motion":"zoom|pan|scroll|reveal|none","icon":"tên icon nếu cần"}]}

VÍ DỤ MINH HỌA (lời đọc dài; khi target ngắn, rút gọn theo số từ trong dàn ý):
{"intent":"product_demo","duration":${target},"scenes":[
 {"type":"hook","text":"Google Maps chưa đủ bán hàng","say":"Google Maps giúp khách tìm quán, nhưng nếu thông tin mở, giờ mở cửa và món nổi bật đều rời rạc, khách vẫn khó quyết định có ghé hay không.","duration":${exampleDurations[0]},"motion":"zoom"},
 {"type":"problem","text":"Khách thấy nhưng chưa đặt","say":"Vấn đề không phải thiếu người biết đến quán. Vấn đề là khách phải tự hỏi quán mở lúc mấy, có chỗ đậu xe không và nên gọi món nào trước khi họ bỏ khỏi trang.","duration":${exampleDurations[1]},"motion":"pan"},
 {"type":"ui_demo","text":"Một trang đủ thông tin","say":"Một website tốt gom giờ mở cửa, địa chỉ, món nổi bật, bản đồ và nút đặt bàn vào một luồng rõ ràng. Khách xem xong hiểu quán phục vụ ai và quyết định nhanh hơn.","duration":${exampleDurations[2]},"asset":"site:0","motion":"scroll"},
 {"type":"feature","text":"Đặt bàn ít bước","say":"Nút đặt bàn đưa khách thẳng đến bước xác nhận, không bắt họ điền lại thông tin đã có. Mỗi bước ngắn hơn cũng làm tỷ lệ hoàn tất cao hơn.","duration":${exampleDurations[3]},"motion":"reveal"},
 {"type":"result","text":"Lượt xem thành lượt ghé","say":"Kết quả là khách không chỉ biết quán mà còn đặt được bàn ngay trong lúc còn quan tâm, giúp doanh nghiệp nắm được nhu cầu trước khi đến.","duration":${exampleDurations[4]},"motion":"zoom"},
 {"type":"cta","text":"Mở website ngay","say":"Hãy đưa món, địa chỉ và giờ mở cửa lên một trang thật rõ. Sau đó thử lại đường đặt bàn như một khách mới để tìm chỗ còn vướng.","duration":${exampleDurations[5]},"motion":"pan"}]}

Trả JSON:`;

  const r = await fetch(`${GUROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${GUROUTER_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: GUROUTER_MODEL,
      messages: [
        { role: 'system', content: 'Bạn là đạo diễn và người viết lời dẫn video dài cho TikTok/Reels. Bạn kể đủ ý bằng hình, dùng chuyển động chậm và liền mạch, không tạo tò mò giả bằng cách giấu thông tin quan trọng. Chỉ trả JSON thuần.' },
        { role: 'user', content: user },
      ],
      temperature: 0.65, max_tokens: 3200, response_format: { type: 'json_object' },
    }),
  }).catch((e) => { throw new Error('gurouter_unreachable: ' + e.message); });
  if (!r.ok) throw new Error(`gurouter HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const raw = data?.choices?.[0]?.message?.content || '';
  const sb = parseStoryboard(raw);
  if (!sb) throw new Error('storyboard_schema_bad: ' + String(raw).slice(0, 150));
  return sb;
}

// `only` re-speaks just those indices and measures the rest from disk —
// fitting the narration must not pay for eight segments to fix one.
export function speakSegments(segTexts, work, spawn, { only = null } = {}) {
  const segs = [];
  for (const [i, text] of segTexts.entries()) {
    const mp3 = join(work, 'assets', `seg${i}.mp3`);
    if (only && !only.includes(i)) { segs.push(audioSeconds(mp3)); continue; }
    const ok = (f) => existsSync(f) && statSync(f).size > 500;
    let done = false, lastErr = '';
    // The endpoint throttles bursts: space every attempt out, escalate
    // the backoff, and keep the last stderr for the failure report.
    for (const voice of [VOICE, 'vi-VN-HoaiMyNeural']) {
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        // Never let a previous attempt's file satisfy the size check after a
        // failed TTS retry. A stale segment would silently ship old words.
        rmSync(mp3, { force: true });
        const r = spawn('edge-tts', ['--voice', voice, '--rate=+8%', '--text', text, '--write-media', mp3], { encoding: 'utf8' });
        if (r.status === 0 && ok(mp3)) { done = true; break; }
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
// ── 2b. narration fitting ─────────────────────────────────────────────
// Keep the action tail when a CTA must be shortened. Cutting from the front
// of "Đăng ký ngay để..." can leave a video ending on context instead of an
// action, which is a silent script regression.
function clampNarrationWords(text, max, preserveTail = false) {
  const value = String(text || '').trim().replace(/\s+/g, ' ');
  const parts = value.split(' ').filter(Boolean);
  if (parts.length <= max) return value;
  return preserveTail ? parts.slice(-max).join(' ') : clampWords(value, max);
}

// The storyboard owns the length; the voice has to fit inside it. When a
// segment overruns its slot, the fix is to say less and speak again — not to
// stretch the video. Duration is a hard ceiling: after three shortening
// passes, a voice that still cannot fit fails loudly instead of shipping a
// 91-second video from a 90-second job.
export function fitNarration(sb, work, spawn, log = () => {}) {
  const GAP = 0.35;
  const limit = clampDuration(sb.duration || DURATION.default);
  const texts = () => sb.scenes.map((s) => s.say || s.text);
  let segs = speakSegments(texts(), work, spawn);
  const over = sb.scenes
    .map((s, i) => ({ s, i, seg: segs[i] }))
    .filter((x) => x.seg + GAP > x.s.duration);

  if (over.length) {
    for (const x of over) {
      const spoken = wordCount(x.s.say || x.s.text);
      const speechRoom = Math.max(0.1, x.s.duration - GAP);
      const budget = Math.max(1, Math.floor(spoken * (speechRoom / x.seg)));
      x.s.say = clampNarrationWords(
        x.s.say || x.s.text,
        budget,
        x.s.type === 'cta' || x.i >= sb.scenes.length - 2,
      );
    }
    log(`tts: ${over.length} segment(s) overran their slot — saying less and speaking again`);
    segs = speakSegments(texts(), work, spawn, { only: over.map((x) => x.i) });
  }

  // TTS can still overrun after the first fit (rate, punctuation, minimum
  // pause). Shorten against the total voice budget, re-speak only changed
  // segments, and keep the user's 15–90s contract intact. Protect the final
  // source beat and CTA on early passes; only touch them if earlier scenes
  // cannot absorb enough reduction.
  const voiceTotal = () => segs.reduce((sum, seconds) => sum + (seconds || 0), 0);
  const room = Math.max(1, limit - GAP * sb.scenes.length);
  const protectedIndices = new Set([sb.scenes.length - 1, sb.scenes.length - 2].filter((i) => i >= 0));
  for (let pass = 0; pass < 3 && voiceTotal() > room; pass++) {
    const ratio = Math.max(0.2, Math.min(0.95, room / Math.max(0.1, voiceTotal())));
    const retry = [];
    const candidates = pass < 2
      ? sb.scenes.entries().filter(([i]) => !protectedIndices.has(i))
      : sb.scenes.entries();
    for (const [i, scene] of candidates) {
      const current = scene.say || scene.text;
      const budget = Math.max(1, Math.floor(wordCount(current) * ratio));
      const next = clampNarrationWords(
        current,
        budget,
        scene.type === 'cta' || i >= sb.scenes.length - 2,
      );
      if (next !== current) {
        scene.say = next;
        retry.push(i);
      }
    }
    if (!retry.length && pass < 2) continue;
    if (!retry.length) break;
    log(`tts: narration exceeds ${limit}s — shortening ${retry.length} segment(s), pass ${pass + 1}/3`);
    segs = speakSegments(texts(), work, spawn, { only: retry });
  }

  // A scene is never shorter than the voice in it.
  sb.scenes.forEach((s, i) => {
    s.duration = Math.round(Math.max(s.duration, (segs[i] || 0) + GAP) * 10) / 10;
  });
  const total = Math.round(sb.scenes.reduce((a, s) => a + s.duration, 0) * 10) / 10;
  if (total > limit) {
    throw new Error(`narration_exceeds_duration: ${total}s > ${limit}s after fitting`);
  }
  return { segs, total };
}

function sceneTransitionMarkup(s, accent, assets) {
  // HyperFrames check audit chạy trên cả seam giữa hai clip. Mọi text block
  // đều chủ động overlap trong crossfade, nên đánh dấu đúng từng block thay vì
  // báo lỗi layout giả; mọi lỗi clipping/overlap trong một scene vẫn được audit.
  return sceneInner(s, accent, assets).replace(
    /<(h[1-6]|p|span|strong|em|small|li|label|div|text)(?=[\s>])/gi,
    '<$1 data-layout-allow-overlap',
  );
}

// ── 4. composition — one shell for every kind ────────────────────────
// Scene markup comes from video-agent/scenes.mjs; this times it against the
// narration and adds one seek-safe camera move for real media. Charts stay
// static, while every scene boundary gets one shared crossfade handoff.
export function composeStoryboardHtml(job, sb, segs, assets = {}, logoSrc = null, bgmSrc = null) {
  const accent = job.project?.accent || ACCENT;
  const scenes = sb.scenes;
  const GAP = 0.35;
  const TRANSITION = 0.45;
  const TRANSITION_TAIL = 0.05;
  let t = 0;
  const sceneHtml = [];
  const bgEls = [];
  for (const [i, s] of scenes.entries()) {
    s.start = t;
    // The storyboard's slot, never shorter than the voice inside it. Visual
    // clips overlap the next beat by TRANSITION; narration does not. This lets
    // outgoing and incoming scenes hand off together instead of fading to a
    // dip, while spoken timing and total duration stay exact.
    s.dur = Math.max(s.duration, (segs[i] || 0) + GAP);
    const visualDur = i < scenes.length - 1 ? s.dur + TRANSITION + TRANSITION_TAIL : s.dur;
    sceneHtml.push(`<div id="s${i}" class="clip scene" data-layout-allow-occlusion data-start="${t.toFixed(2)}" data-duration="${visualDur.toFixed(2)}" data-track-index="0">${sceneTransitionMarkup(s, accent, assets)}</div>`);
    // A real photo behind the prose scenes. Charts and device shots need a
    // clean surface, and a background under them is what makes them unreadable.
    const bgKey = s.asset && Object.prototype.hasOwnProperty.call(assets, s.asset) ? s.asset : null;
    const heroKey = Object.prototype.hasOwnProperty.call(assets, 'hero') ? 'hero' : null;
    const photoKey = Object.prototype.hasOwnProperty.call(assets, 'photo:0') ? 'photo:0' : null;
    const bgAsset = wantsBackground(s.type)
      ? (bgKey ? assets[bgKey] : heroKey ? assets[heroKey] : photoKey ? assets[photoKey] : null)
      : null;
    if (bgAsset) {
      s.bgId = `bg${bgEls.length}`;
      bgEls.push(s);
      // The <img> carries its own id: without one, two backgrounds that use
      // the same file are indistinguishable to the renderer's media
      // discovery (hyperframes check: duplicate_media_discovery_risk), and
      // neither is a stable edit target.
      sceneHtml.push(`<div id="${s.bgId}" class="clip bgi" data-layout-allow-overflow data-start="${t.toFixed(2)}" data-duration="${visualDur.toFixed(2)}" data-track-index="1"><img id="${s.bgId}-img" src="${esc(bgAsset)}" alt=""/></div>`);
    }
    t += s.dur;
  }
  const total = scenes.reduce((a, s) => a + s.dur, 0);
  // Every media element carries an id. `hyperframes check` reports an audio
  // without one as an error ("the renderer requires id to discover media
  // elements"), and while a real render still plays it — measured -19.8 LUFS
  // on a tone with no id in 0.8.56 — the id is what gives the framework's
  // tooling a stable edit target, and it costs nothing.
  const audioHtml = scenes.map((s, i) =>
    `<audio id="voice${i}" class="clip" data-start="${s.start.toFixed(2)}" data-duration="${(segs[i] || 0).toFixed(2)}" data-track-index="5" src="assets/seg${i}.mp3"></audio>`
  ).join('\n  ');

  return businessShell({ accent, total, sceneHtml, audioHtml, sceneMeta: scenes, logoSrc, bgmSrc });
}

// ── 2c. carousel script — five static slides need their own three lines ─
// Post videos are a TEASER, not a replacement: hook on the most
// interesting bit, 3 concrete takeaways, then an open question whose
// answer lives in the article — the video sells the read.
async function writeCarouselScript(job) {
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

function shade(hex, amt) {
  const m = String(hex || '').match(/^#([0-9a-f]{6})$/i);
  if (!m) return amt < 0 ? '#0a0c10' : '#152238';
  const n = parseInt(m[1], 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return '#' + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Post composition — kịch bản đầy đủ theo beat của bài, mở bằng hook và
// kết bằng CTA. Ảnh thật được đạo diễn bằng camera move chậm; biểu đồ giữ
// tĩnh để số liệu luôn đọc được.
// Chuyển cảnh luôn chồng lấp: cảnh cũ mờ và lùi trong khi cảnh mới sắc nét
// và tiến vào cùng thời điểm. Ảnh thật luôn có chuyển động camera chậm; trường
// "motion" chỉ chọn loại chuyển động, không quyết định ảnh có chuyển động hay
// không. Mọi tween dùng fromTo + thời gian tuyệt đối nên preview và render seek
// giống nhau.
function motionFor(i, s, isLast = false, hasLogo = false) {
  const st = s.start.toFixed(2);
  const du = s.dur.toFixed(2);
  const end = (s.start + s.dur).toFixed(2);
  const out = [];

  if (i === 0) {
    out.push(`tl.fromTo("#s${i} .ex", { opacity: 0, y: 22, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "power3.out" }, ${st});`);
  } else {
    out.push(`tl.fromTo("#s${i}", { opacity: 0, filter: "blur(12px)", scale: 0.985 }, { opacity: 1, filter: "blur(0px)", scale: 1, duration: 0.50, ease: "power3.out", immediateRender: false }, ${st});`);
    if (s.bgId) {
      out.push(`tl.fromTo("#${s.bgId}", { opacity: 0 }, { opacity: 1, duration: 0.50, ease: "power2.out", immediateRender: false }, ${st});`);
    }
  }
  if (!isLast) {
    out.push(`tl.to("#s${i}", { opacity: 0, filter: "blur(12px)", scale: 1.015, duration: 0.50, ease: "power2.in" }, ${end});`);
    if (s.bgId) out.push(`tl.to("#${s.bgId}", { opacity: 0, duration: 0.50, ease: "power2.in" }, ${end});`);
  }

  // Chỉ chọn selector tồn tại thật sau quality gate. Trước đây code nối mọi
  // selector rồi phát cảnh báo GSAP khi danh sách rỗng; nay ảnh nền là sibling,
  // còn screenshot/photo/map là element trong scene.
  let media = '';
  if (s.type === 'ui_demo' && s.asset) media = `#s${i} .device-shot`;
  else if (s.type === 'product_reveal' && (s.asset || hasLogo)) media = `#s${i} .reveal-logo`;
  else if (s.type === 'before_after' && s.asset) media = `#s${i} .ba-img`;
  else if (s.type === 'location' && s.asset) media = `#s${i} .loc-map img`;
  else if ((s.type === 'question' || s.type === 'answer') && s.asset) media = `#s${i} .qa-img`;
  else if (s.bgId) media = `#${s.bgId} img`;

  if (media) {
    if (s.motion === 'zoom') {
      out.push(`tl.fromTo("${media}", { scale: 1.04 }, { scale: 1.12, duration: ${du}, ease: "none" }, ${st});`);
    } else if (s.motion === 'pan') {
      out.push(`tl.fromTo("${media}", { scale: 1.09, xPercent: -2, yPercent: 1 }, { scale: 1.11, xPercent: 2, yPercent: -1, duration: ${du}, ease: "none" }, ${st});`);
    } else if (s.motion === 'scroll' && s.type === 'ui_demo' && s.asset) {
      out.push(`tl.fromTo("#s${i} .device-shot", { yPercent: 0, scale: 1.08 }, { yPercent: -12, scale: 1.08, duration: ${du}, ease: "none" }, ${st});`);
    } else {
      out.push(`tl.fromTo("${media}", { scale: 1.035, xPercent: -1 }, { scale: 1.08, xPercent: 1, duration: ${du}, ease: "none" }, ${st});`);
    }
  }
  if (s.motion === 'reveal') {
    out.push(`tl.fromTo("#s${i} .ex", { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.7, ease: "power3.out" }, ${st});`);
  }
  return out.join('\n  ');
}

function businessShell({ accent, total, sceneHtml, audioHtml, sceneMeta, logoSrc, bgmSrc }) {
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
  #root { width:100%; height:100%; position:relative; overflow:hidden;
    background:radial-gradient(circle at 16% 10%, ${shade(accent, -0.12)} 0%, transparent 36%),
      radial-gradient(circle at 88% 78%, ${shade(accent, -0.38)} 0%, transparent 34%),
      linear-gradient(160deg,${shade(accent, -0.58)} 0%,${shade(accent, -0.28)} 100%); }
  .scene { position:absolute; inset:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center; padding:56px; text-align:center; z-index:2;
    opacity:0; overflow:hidden; will-change:transform,opacity,filter; }
  #s0 { opacity:1; }
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
  .bgi { position:absolute; inset:0; overflow:hidden; }
  .bgi img { width:100%; height:100%; object-fit:cover; opacity:0.34;
    transform-origin:center; will-change:transform; }
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
  /* ── visual scenes ─────────────────────────────────────────────────── */
  .kicker { color:${A}; font-size:28px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; margin-bottom:14px; }
  .claim { color:#fff; font-size:56px; font-weight:700; line-height:1.25; max-width:600px;
    text-shadow:0 2px 18px rgba(0,0,0,0.75); }
  .reveal { gap:26px; }
  .reveal-logo { max-width:280px; max-height:120px; object-fit:contain; }
  .reveal-name { color:#fff; font-size:58px; font-weight:800; letter-spacing:-0.02em; }
  .device { width:430px; height:800px; border-radius:38px; background:#0b0e13;
    border:3px solid rgba(255,255,255,0.18); padding:14px; position:relative;
    box-shadow:0 24px 60px rgba(0,0,0,0.55); overflow:hidden; }
  .device-notch { position:absolute; top:14px; left:50%; transform:translateX(-50%);
    width:120px; height:18px; border-radius:0 0 12px 12px; background:#0b0e13; z-index:2; }
  .device-shot { width:100%; height:100%; object-fit:cover; border-radius:26px; display:block;
    will-change:transform; }
  .caption { color:#eaf1f8; font-size:30px; font-weight:600; margin-top:20px; max-width:600px; }
  .feat-ico { display:flex; }
  .feat-t { color:#fff; font-size:50px; font-weight:700; line-height:1.25; max-width:560px; }
  .res-n { color:#fff; font-weight:800; line-height:1; letter-spacing:-0.03em; }
  .res-u { font-size:0.5em; margin-left:6px; }
  .res-t { color:#eaf1f8; font-size:42px; font-weight:600; max-width:580px; }
  .ba { gap:16px; }
  .ba-col { position:relative; width:100%; border-radius:14px; overflow:hidden;
    background:rgba(255,255,255,0.05); }
  .ba-lab { position:absolute; top:10px; left:12px; z-index:2; font-size:22px; font-weight:700;
    color:#fff; background:rgba(0,0,0,0.55); padding:4px 12px; border-radius:999px; }
  .ba-img { width:100%; height:300px; object-fit:cover; display:block; }
  .ba-empty { display:block; width:100%; height:300px; background:rgba(255,255,255,0.08); }
  .ba-mid { width:100%; height:4px; background:${A}; border-radius:999px; }
  .photo-cap { color:#fff; font-size:48px; font-weight:700; line-height:1.25; max-width:600px;
    text-shadow:0 2px 18px rgba(0,0,0,0.8); }
  .loc { gap:18px; }
  .loc-map { width:100%; border-radius:16px; overflow:hidden; border:2px solid rgba(255,255,255,0.15); }
  /* The map is captured phone-shaped (720x1280); a short panel crops the pin
     and the place card away, which is the whole point of the scene. */
  .loc-map img { width:100%; height:560px; object-fit:cover; display:block; }
  .loc-t { color:#fff; font-size:36px; font-weight:600; max-width:580px; }
  .stars { display:flex; gap:8px; }
  .rate-t { color:#fff; font-size:40px; font-weight:600; max-width:560px; line-height:1.3; }
  /* ── newsroom + numbered cards ────────────────────────────────────────
     The anchor is a lower third: it fills the scene's height so the chyron
     and the name plate can sit at the bottom like a real broadcast. The
     equalizer bars are static SVG — a snapshot must be reproducible. */
  .anchor { height:100%; justify-content:flex-end; align-items:stretch; }
  .anchor-chyron { color:#fff; font-size:46px; font-weight:800; line-height:1.25;
    text-align:left; text-shadow:0 2px 18px rgba(0,0,0,0.8); }
  .anchor-lower { display:flex; align-items:center; gap:20px; width:100%;
    background:rgba(10,12,16,0.78); border-radius:20px; padding:18px 22px; text-align:left; }
  .anchor-img { width:96px; height:96px; border-radius:50%; object-fit:cover; flex:none; }
  .anchor-initials { width:96px; height:96px; border-radius:50%; flex:none; color:#fff;
    font-size:34px; font-weight:800; display:flex; align-items:center; justify-content:center; }
  .anchor-id { flex:1; min-width:0; }
  .anchor-name { color:#fff; font-size:32px; font-weight:700; }
  .anchor-role { color:#9fb3c8; font-size:24px; margin-top:6px; }
  .anchor-eq { flex:none; }
  .headline { align-items:flex-start; text-align:left; }
  .hl-kick { color:#fff; font-size:26px; font-weight:800; letter-spacing:0.1em;
    text-transform:uppercase; padding:10px 22px; border-radius:8px; }
  .hl-main { color:#fff; font-size:56px; font-weight:800; line-height:1.2; letter-spacing:-0.01em;
    text-shadow:0 2px 18px rgba(0,0,0,0.8); }
  .hl-ticker { width:100%; margin-top:18px; padding-top:14px; overflow:hidden; white-space:nowrap;
    border-top:3px solid rgba(255,255,255,0.25); color:#c9d6e2; font-size:24px; font-weight:600; }
  .hl-sep { color:${A}; margin:0 14px; }
  .keypoints { align-items:stretch; }
  .kp-list { display:flex; flex-direction:column; gap:20px; width:100%; }
  .kp-row { display:flex; align-items:center; gap:20px; }
  .kp-n { font-size:66px; font-weight:800; line-height:1; min-width:70px; text-align:center; }
  .kp-t { color:#f4f6f8; font-size:34px; font-weight:600; line-height:1.3; text-align:left; }
  .qa-badge { width:120px; height:120px; border-radius:50%; color:#fff; font-size:68px;
    font-weight:800; display:flex; align-items:center; justify-content:center; }
  .qa-img { width:300px; height:300px; border-radius:20px; object-fit:cover; margin-bottom:28px; }
  .qa-t { color:#fff; font-size:44px; font-weight:700; line-height:1.3; max-width:580px; }
</style></head>
<body><div id="root" data-composition-id="main" data-start="0"
  data-duration="${total.toFixed(2)}" data-width="720" data-height="1280">
${sceneHtml.join('\n')}
${audioHtml}
${bgmSrc ? `<audio id="bgm" class="clip" data-start="0" data-duration="${total.toFixed(2)}" data-volume="0.12" data-track-index="6" src="assets/bgm.mp3"></audio>` : ''}
${logoSrc ? `<img id="brandlogo" class="clip brandlogo" data-start="0" data-duration="${total.toFixed(2)}" data-track-index="9" src="${logoSrc}"/>` : ''}
</div>
<script>
  const tl = gsap.timeline({ paused: true });
${meta.map((s, i) => motionFor(i, s, i === meta.length - 1, Boolean(logoSrc))).join('\n  ')}
  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;
  tl.seek(0);
</script></body></html>`;
}

// ── 4c. background music — free catalog track ────────────────────────
// Claim cung cấp track Mixkit miễn phí theo template. Không tổng hợp pad
// trong đường dẫn sản xuất; nếu catalog lỗi, voice-only vẫn hoàn chỉnh.
// Set VIDEO_MUSIC=off để tắt hoàn toàn.
//
// makeBgm còn lại là helper đo mức legacy cho test; prepareBgm không gọi nó.
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

// ── 4c-ii. catalog music ──────────────────────────────────────────────
// Job carries bgm (catalog id | 'none') and bgm_url (the track's public
// /image/music/ URL, absolutized at claim). Claim đã chọn track free theo
// template khi operator chọn 'auto'. Catalog server-owned — bgm_url là URL
// duy nhất renderer tải cho nhạc, nên host do user cung cấp không thể đi vào.
//
// Track thật dày và dài hơn pad: loop nếu ngắn, cắt đúng thời lượng video,
// fade 2s vào / 3s ra. data-volume=0.12 giữ voice luôn rõ; master cuối áp
// cùng một mức loudness cho mọi nguồn nhạc.

// Fetch the track into work/ and verify it looks like audio. Returns the
// local path or null — a failed fetch means voice-only output, never a
// synthetic pad.
export async function downloadBgm(url, work, log = () => {}) {
  const src = join(work, 'assets', 'bgm-src.mp3');
  try {
    const r = await fetch(String(url).trim(), {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; pages-seo-video/1.0)' },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) { log(`bgm: fetch ${r.status}`); return null; }
    const type = (r.headers.get('content-type') || '').toLowerCase();
    if (type && !type.startsWith('audio/') && !type.includes('octet-stream')) {
      log(`bgm: not audio (${type})`);
      return null;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 50000) { log(`bgm: file too small (${buf.length}B)`); return null; }
    mkdirSync(dirname(src), { recursive: true });
    writeFileSync(src, buf);
    return src;
  } catch (e) {
    log(`bgm: fetch failed (${String(e?.message || e).slice(0, 80)})`);
    return null;
  }
}

// Trim (or loop) a downloaded track to the video length with the pad's
// 2s in / 3s out fades. Exported for the test suite — the ffmpeg call is
// the part that can silently produce a silent file, so the size check
// mirrors makeBgm's.
export function cutBgm(src, totalSec, out = join(WORK, 'assets', 'bgm.mp3')) {
  const fadeOut = Math.max(1, totalSec - 3).toFixed(1);
  const r = spawnSync('ffmpeg', [
    '-y', '-stream_loop', '-1', '-i', src, '-t', totalSec.toFixed(1),
    '-af', `afade=t=in:d=2,afade=t=out:st=${fadeOut}:d=3`,
    '-b:a', '128k', out,
  ], { encoding: 'utf8', timeout: 120000 });
  return r.status === 0 && existsSync(out) && statSync(out).size > 5000 ? out : null;
}

// The one BGM decision point. 'none' mutes; a catalog URL fetches + cuts.
// Claim luôn cấp URL cho auto; job cũ thiếu URL cũng chỉ chạy voice-only để
// không bao giờ phát pad tổng hợp. VIDEO_MUSIC=off vẫn thắng mọi lựa chọn.
export async function prepareBgm(job, totalSec, work, log = () => {}) {
  if (String(E('VIDEO_MUSIC') || '').toLowerCase() === 'off') return null;
  if (String(job.bgm || '') === 'none') {
    log('bgm: muted by choice — voice only');
    return null;
  }
  const out = join(work, 'assets', 'bgm.mp3');
  if (job.bgm_url) {
    const src = await downloadBgm(job.bgm_url, work, log);
    const cut = src ? cutBgm(src, totalSec, out) : null;
    if (cut) {
      log(`bgm: "${job.bgm}" mixed in`);
      return out;
    }
    log('bgm: catalog track unavailable — voice only');
    return null;
  }
  log('bgm: no catalog URL — voice only');
  return null;
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
    script = await writeCarouselScript(job);
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

// ── 6. render + deliver one job ───────────────────────────────────────
// One path for every kind. `kind` decides where the content comes from
// (an article, a brand kit, a live URL); the intent decides how the story is
// told. Only a carousel still takes its own route — it produces slides, not
// a video.
//
// `deps` are test seams (scripts/run-video-agent-tests.mjs drives this with a
// temp workspace and faked TTS + render + deliver): what the agent hands to
// the platform is the end of a chain, and only a real run of the whole chain
// shows which file that is. Production calls it with the job alone.
export async function renderOne(job, deps = {}) {
  const work = deps.work || WORK;
  const spawn = deps.spawn || spawnSync;
  const deliver = deps.deliver || api;
  log(`claimed ${job.slug} (${job.kind}, job ${job.id})`);
  rmSync(join(work, 'renders'), { recursive: true, force: true });
  rmSync(join(work, 'snapshots'), { recursive: true, force: true });
  mkdirSync(join(work, 'assets'), { recursive: true });

  if (job.kind === 'carousel') {
    await renderCarousel(job, deps);
    return;
  }

  // 1. What is there to show? Asset-first: the story is written after the
  // material is known, so it can only reference what actually exists.
  // A template on the job pins the intent (and its default length) before any
  // signal is read — the user's choice outranks the classifier.
  const tpl = templateById(job.template);
  const forced = tpl && intentForTemplate(tpl, job);
  const target = clampDuration(Number(job.duration) || Number(E('VIDEO_DURATION')) || tpl?.defaultDuration || DURATION.default);
  const source = job.body_markdown || job.project?.description || '';
  const suggested = forced
    ? { intent: forced, reason: `template "${tpl.id}" chosen by the user` }
    : intentFromSignals(job, source);
  log(`intent: ${suggested.intent} (${suggested.reason})`);

  // collectAssets captures the site once and hands back its text too, so the
  // slowest step in the pipeline is not paid for twice.
  const { assets, siteText } = await collectAssets({ job, intent: suggested.intent, work, log });

  // 2. The story. A model writes it; the code owns the budgets it must fit.
  // Keep the job's own copy and the full captured page text together. The
  // page extractor can be long, but dropping the original description here
  // would silently discard context before the full-narration prompt.
  const storySource = [String(source || '').trim(), String(siteText || '').trim()]
    .filter(Boolean).join('\n\n');
  let raw = null;
  try {
    log('writing storyboard via GuRouter…');
    raw = await writeStoryboard(job, { source: storySource, suggested: suggested.intent, assets, target, forced });
    log(`storyboard ok (intent ${raw.intent || suggested.intent}, ${raw.scenes.length} scenes)`);
  } catch (e) {
    log(`storyboard failed (${String(e?.message || e).slice(0, 140)}) — deriving from the content`);
  }

  // A chosen template cannot be overridden by the model's answer.
  const intent = forced || (INTENTS.includes(raw?.intent) ? raw.intent : suggested.intent);
  const presenterName = String(job.project?.presenter_name || '').trim();
  const gateOpts = { source: storySource, intent, target, assets, presenterName };
  const existingLogo = Object.prototype.hasOwnProperty.call(assets, 'logo') ? assets.logo : null;
  const logoSrc = existingLogo || await downloadLogo(job.project?.logo_url, work, log);
  if (logoSrc && assets.logo !== logoSrc) assets.logo = logoSrc;
  const hasLogo = Boolean(logoSrc);
  let { storyboard, dropped } = sanitizeStoryboard(
    raw || storyboardFromContent({ ...job, body_markdown: storySource }, intent, assets, target),
    gateOpts,
  );
  if (dropped.length) log(`storyboard: dropped ${dropped.map((d) => `${d.type}:${d.reason}`).join(', ')}`);

  // Too little survived to be a story — take the deterministic one instead.
  if (storyboard.scenes.length < MIN_SCENES) {
    log('storyboard: too thin after the gate — deriving from the content');
    ({ storyboard, dropped } = sanitizeStoryboard(
      storyboardFromContent({ ...job, body_markdown: storySource }, intent, assets, target),
      gateOpts,
    ));
  }

  // A forced intent is the user's promise of a shape: a story that lost a
  // required beat to the gate is no longer that template. Rebuild from the
  // deterministic board, which still knows how to fill every beat.
  if (forced) {
    const beforeForcedReview = reviewStoryboard(storyboard, { hasLogo, assets });
    const missing = beforeForcedReview.problems
      .filter((problem) => problem.startsWith('missing_beat:'))
      .map((problem) => problem.slice('missing_beat:'.length));
    if (missing.length) {
      log(`storyboard: template "${tpl.id}" lost ${missing.join(', ')} — rebuilding from the content`);
      ({ storyboard, dropped } = sanitizeStoryboard(
        storyboardFromContent({ ...job, body_markdown: storySource }, intent, assets, target),
        gateOpts,
      ));
    }
  }

  // 3. The check the spec asks for, made mechanical. A repaired but invalid
  // model shape must not reach TTS: rebuild once, then fail closed if even
  // the deterministic board cannot satisfy the release gate.
  let review = reviewStoryboard(storyboard, { hasLogo, assets });
  if (!review.ok) {
    log(`storyboard: quality gate — ${review.problems.join(', ')} — deriving from the content`);
    ({ storyboard, dropped } = sanitizeStoryboard(
      storyboardFromContent({ ...job, body_markdown: storySource }, intent, assets, target),
      gateOpts,
    ));
    review = reviewStoryboard(storyboard, { hasLogo, assets });
  }
  if (!review.ok) throw new Error(`storyboard_quality_failed: ${review.problems.join(', ')}`);
  log(`storyboard: ${storyboard.scenes.length} scenes, ${storyboard.duration}s`);

  // 4. Narration, written to fit and measured.
  const { segs, total } = fitNarration(storyboard, work, spawn, log);
  log(`video: ${total}s · ${storyboard.scenes.map((s) => s.type).join(' → ')}`);

  const bgmSrc = await prepareBgm(job, total, work, log);

  log('composing…');
  writeFileSync(join(work, 'index.html'), composeStoryboardHtml(job, storyboard, segs, assets, logoSrc, bgmSrc));

  // Validate the complete composition, including transition seams, before
  // spending 15 minutes rendering. A failed check is a failed video, not a
  // diagnostic followed by a potentially broken deliver.
  const chk = spawn('npx', ['-y', `hyperframes@${HF_VERSION}`, 'check', '--at-transitions'], { cwd: work, encoding: 'utf8', timeout: 5 * 60 * 1000 });
  const chkOut = `${chk.stdout || ''}${chk.stderr || ''}`;
  if (chk.status !== 0) {
    throw new Error('hyperframes check failed: ' + chkOut.slice(-600));
  }
  const counts = chkOut.match(/(\d+) error\(s\), (\d+) warning\(s\)/);
  log(`hyperframes check: ok${counts ? ` (${counts[2]} warning(s))` : ''}`);

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
  const rawMp4 = join(renders, mp4);
  const mastered = masterLoudness(rawMp4, join(renders, 'master.mp4'));
  const bytes = readFileSync(mastered || rawMp4);
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

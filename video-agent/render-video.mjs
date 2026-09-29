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
// AI scene images need one more: AIFREE_API_KEY. Without it (or with
// VIDEO_AI_IMAGES=0) every background screen keeps the gradient it draws
// today; VIDEO_AI_MAX_IMAGES caps how many are generated per video.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync, readdirSync, copyFileSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { esc, sceneInner, wantsBackground } from './scenes.mjs';
import {
  AIFREE_BASE, AIFREE_MODEL, AI_IMAGE_MAX, collectAssets, downloadLogo, generateSceneImages,
} from './assets.mjs';
import {
  DURATION, INTENTS, MIN_SCENES, VISTAL_NEGATIVES, WORDS_PER_SECOND, alignCaptions, beatSlots, clampDuration, clampWords, filmShape, intentFromSignals,
  reviewStoryboard, sanitizeStoryboard, storyboardFromContent, suggestDuration, wordCount,
} from './storyboard.mjs';
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
// 9Router — the operator's own OpenAI-compatible gateway, written first so
// video copy comes from the model they picked. GuRouter stays as the
// fallback, so a gateway that is down or out of quota does not cost the
// video. Named NINEROUTER_* rather than 9ROUTER_* because a leading digit is
// not a portable env-var name across shells and CI.
const NINEROUTER_KEY = E('NINEROUTER_API_KEY');
const NINEROUTER_BASE = (E('NINEROUTER_BASE_URL') || 'https://aifree.gulagi.com/v1').replace(/\/+$/, '');
const NINEROUTER_MODEL = E('NINEROUTER_TEXT_MODEL') || 'guguseo';

// Model providers in the order they are tried. Only those with a key are
// listed, so a deployment that configured neither keeps its old behaviour of
// reporting a missing GUROUTER_API_KEY.
const MODEL_PROVIDERS = [
  NINEROUTER_KEY && { name: 'ninerouter', key: NINEROUTER_KEY, base: NINEROUTER_BASE, model: NINEROUTER_MODEL },
  GUROUTER_KEY && { name: 'gurouter', key: GUROUTER_KEY, base: GUROUTER_BASE, model: GUROUTER_MODEL },
].filter(Boolean);

// The gateway does not always answer with a JSON body. Under load it streams
// OpenAI-style `data:` chunks even though nothing asked for `stream: true`, so
// a plain `r.json()` throws on a 200 and reads as a broken provider. Both
// shapes are folded into one object: SSE deltas are concatenated into
// `content`, and the terminal frame supplies `finish_reason` and `usage`.
// An empty answer yields an empty `content` so the caller's existing
// empty-answer handling is what reacts.
function chatBody(text) {
  const raw = String(text || '').trim();
  if (!raw) return { choices: [{ message: { content: '' } }] };
  if (!raw.startsWith('data:')) return JSON.parse(raw);
  let content = '', model = '', finish = null, usage = null;
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s.startsWith('data:')) continue;
    const payload = s.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    let frame;
    try { frame = JSON.parse(payload); } catch { continue; }
    const ch = frame?.choices?.[0];
    // A gateway that streams puts the text in `delta`; one that streams for
    // show and then sends the whole message puts it in `message`.
    const piece = ch?.delta?.content ?? ch?.message?.content;
    if (typeof piece === 'string') content += piece;
    if (ch?.finish_reason) finish = ch.finish_reason;
    if (frame?.usage) usage = frame.usage;
    if (frame?.model) model = frame.model;
  }
  return { choices: [{ message: { content }, finish_reason: finish }], usage, model };
}

// One chat call, the first provider that answers wins. Returns the raw
// response so callers can read `finish_reason` and the token usage — the
// storyboard path needs both to explain a malformed answer.
//
// 5xx and 429 get one retry before the next provider. A long storyboard call
// (16 384 max_tokens, reasoning included) intermittently comes back as a
// gateway 504 — the endpoint is healthy for short prompts, so this is a
// request-size timeout, not an outage. Same bound as chatCompletion() in
// functions/_lib/ai.js, for the same reason.
const MAX_RETRIES = 1;

async function chatJson(messages, opts = {}) {
  const errs = [];
  for (const p of MODEL_PROVIDERS) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let r;
      try {
        r = await fetch(`${p.base}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${p.key}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: p.model,
            messages,
            temperature: opts.temperature ?? 0.7,
            // The WHOLE budget, reasoning included — not a cap on the answer.
            // guguseo thinks before it writes and spends those tokens out of
            // the same allowance, so a budget sized for the answer alone comes
            // back truncated at finish_reason=length.
            max_tokens: opts.max_tokens ?? 1200,
            response_format: { type: 'json_object' },
          }),
        });
      } catch (e) {
        errs.push(`${p.name}_unreachable: ${e.message}`);
        break; // a dead host will not answer on the second try
      }
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        errs.push(`${p.name} HTTP ${r.status}: ${body.slice(0, 200)}`);
        // 4xx is a bad request, a bad model or a bad key — none of which a
        // retry fixes, so stop here rather than spend the ladder on it. 5xx
        // and 429 are transient; 429 is worth a second go, 5xx often is.
        if (r.status >= 400 && r.status < 500 && r.status !== 429) break;
        continue;
      }
      return { data: chatBody(await r.text()), provider: p.name };
    }
  }
  throw new Error('chat_all_providers_failed: ' + errs.join(' | '));
}
const VOICE = E('VIDEO_VOICE') || 'vi-VN-NamMinhNeural';
const PROJECT_ID = E('VIDEO_PROJECT_ID');
const ACCENT = E('ACCENT') || '#1677ff';
const BATCH = Math.max(1, parseInt(E('VIDEO_BATCH') || '1', 10) || 1);
// AI scene images. VIDEO_AI_IMAGES=0 turns them off; without a key they are
// off anyway, so the default is "generate as many as the cap allows".
const AI_IMAGES = E('VIDEO_AI_IMAGES') !== '0';
const AI_IMAGE_CONFIG = {
  key: AI_IMAGES ? E('AIFREE_API_KEY') : null,
  base: E('AIFREE_BASE_URL') || AIFREE_BASE,
  model: E('AIFREE_IMAGE_MODEL') || AIFREE_MODEL,
  max: Math.max(0, parseInt(E('VIDEO_AI_MAX_IMAGES') || String(AI_IMAGE_MAX), 10) || 0),
};
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
    // Ba trường tu từ đi cùng cảnh. Chúng KHÔNG đổi một pixel HTML nào —
    // chúng là lý do đằng sau mọi lựa chọn chữ, nên phải đi cùng cảnh từ đầu
    // thay vì được dựng lại ở đâu đó về sau. Cắt chuỗi thừa ở đây để phần
    // kiểm tra phía dưới chỉ phải hỏi "có rỗng không".
    scenes: scenes.map((scene) => {
      if (!scene || typeof scene !== 'object') return scene;
      const one = (v) => (typeof v === 'string' ? v.trim().slice(0, 240) : '');
      return { ...scene, persuasion: one(scene.persuasion), beat: one(scene.beat), focal: one(scene.focal) };
    }),
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
- compare {text, left:{title,items,tone?}, right:{title,items,tone?}} — chỉ đặt tone "good" hoặc "bad" khi nội dung thật sự khen/chê; hai lựa chọn đều tốt thì bỏ tone
- anchor {text, name?} — người dẫn bản tin (lower-third); chỉ dùng khi có asset "presenter"
- headline {text, kicker?} — dòng tin lớn kiểu breaking news
- keypoints {text, items:[{label}]} — ý chính đánh số, tối đa 4 mục
- question {text} — câu hỏi lớn
- answer {text, asset?} — câu trả lời, có thể kèm ảnh

LUẬT BẮT BUỘC:
1. "text" tối đa 8 từ, là CAPTION ngắn chứ không phải toàn bộ lời kể. Không xuống dòng dài dòng.
2. "say" là lời đọc đầy đủ của cảnh đó, phải ĐỦ số từ trong dàn ý để kéo dài đúng số giây đó (2.6 từ/giây). Viết tiếng Việt tự nhiên để đọc thành tiếng; âm thầm sửa lỗi chính tả/từ dùng sai rõ ràng trong nguồn nhưng giữ nguyên tên riêng, con số và sự kiện. Cảnh nào để trống thời gian thì người xem nghe im lặng rồi bỏ đi — đây là lý do phần lớn video bị rời. Đếm từ trước khi trả về.
3. Lời đọc phải phủ HẾT các ý chính của bài — mỗi ý chính (mỗi mục H2, mỗi luận điểm, mỗi bước) một cảnh riêng, theo đúng thứ tự bài viết, và mỗi cảnh chỉ kể MỘT ý. Mọi nhãn, hàng, cột và polarity tốt/xấu trong hình phải được chính "say" của cảnh đó chứng minh. Tuyệt đối không tạo khoảng trống, không gộp nhiều ý vào một câu, không giấu ý chính để người xem phải đọc bài mới hiểu. Cảnh cuối cùng trước CTA dành cho kết luận, không dùng để kể thêm ý mới.
4. CHỈ dùng asset có trong danh sách. Không bịa ảnh.
5. CHỈ dùng con số CÓ TRONG NỘI DUNG. Không làm tròn, không suy diễn.
6. Cảnh đầu là hook (bản tin mở bằng headline), cảnh cuối là cta. Không lặp hai cảnh cùng loại liền nhau.
7. Người xem phải hiểu nội dung khi TẮT TIẾNG — hình phải mang thông tin.
8. MỖI CẢNH, trừ CTA cuối, PHẢI CÓ MINH HOẠ: hoặc "asset" thật trong danh sách trên, hoặc là loại đồ hoạ tự vẽ (bars, donut, line, steps, icons, compare, timeline, stat, keypoints, rating, feature). Cảnh chỉ có chữ trên nền gradient là LỖI, không phải lựa chọn an toàn. Khi một nhịp dàn ý bị lặp (cùng tên beat xuất hiện nhiều lần), hãy dùng MỘT loại hình khác nhau cho mỗi lần lặp để không lặp lại cùng một thẻ.
9. Phân công "motion" như đạo diễn: zoom cho hook, scroll cho ảnh chụp website trong khung, pan cho ảnh thật, reveal cho biểu đồ, idle cho cảnh đã hết chuyện để kết. Chuyển động phải chậm, liền mạch. "idle" và "none" KHÁC NHAU, đừng dùng nhầm: idle là giữ CÓ SỐNG — khung phình/thu rất chậm như thở, đủ để khung không chết mà không đủ để người xem chú ý; đó là chỗ dành cho cảnh hết việc và cho chính cảnh cuối. none là đứng yên HẲN — chỉ dành cho cảnh không có ảnh, hoặc đúng MỘT cảnh nghỉ để người xem thở. Tuyệt đối không chọn none cho cảnh có ảnh: khung đứng bất động là dấu hiệu rẻ tiền rõ nhất của một video do máy sinh ra.`;

export async function writeStoryboard(job, { source, suggested, assets, target, forced = null }) {
  if (!MODEL_PROVIDERS.length) throw new Error('no model provider configured (set NINEROUTER_API_KEY or GUROUTER_API_KEY in video-agent/.env)');
  // A user-chosen template fixes the intent: the model fills the shape it was
  // given rather than picking another one — and the caller pins the result
  // back to `forced` anyway, so a model that ignores the line below cannot
  // move the video off the chosen template.
  const intent = forced || suggested;
  // The outline already carries the expanded beat list, so the model is shown
  // the exact number of screens the video is made of and where the extra ones
  // came from — a repeated beat name is the signal to draw a different shape.
  const slots = beatSlots(intent, target);
  const outline = slots.map((s, i) => {
    const spokenWords = Math.max(4, Math.round(s.duration * 2.5));
    const copies = slots.filter((o) => o.beat === s.beat).length;
    const suffix = copies > 1 ? ` [phần ${slots.slice(0, i + 1).filter((o) => o.beat === s.beat).length}/${copies} — dùng hình khác các phần trước]` : '';
    return `  ${s.beat} (~${s.duration}s, khoảng ${spokenWords} từ): ${s.types.join(' | ')}${suffix}`;
  }).join('\n');
  const assetList = Object.keys(assets).length
    ? Object.keys(assets).map((k) => `  ${k}`).join('\n')
    : '  (không có asset thật nào — đừng dùng cảnh cần asset)';
  const intentLine = forced
    ? `Intent bắt buộc do người dùng chọn: ${forced}. Trả đúng "intent":"${forced}".`
    : `Intent gợi ý từ tín hiệu nội dung: ${suggested}. Chỉ đổi nếu bạn chắc chắn intent khác đúng hơn.`;
  // Tầng trên tầng cảnh. Bốn thứ này khai MỘT LẦN rồi thôi — không cảnh nào
  // được phép lặp lại chúng. Không có chúng, mỗi khung chỉ là "một cảnh nào
  // cho thấy con số"; có chúng, khung đó thành "một cảnh nào chứng minh con số
  // và nó chạm như thế nào".
  const shape = filmShape(intent, job);
  const filmBlock = `HÌNH DÁNG CỦA CẢ PHIM (khai một lần, không cảnh nào lặp lại):
- MỐI THÔNG ĐIỆP: ${shape.message}
  Cảnh nào không phục vụ câu này thì cắt cảnh đó — không được sửa hay bỏ câu này.
- CUNG: ${shape.arc}
- NGƯỜI XEM: ${shape.audience}
- NHỊP: ${shape.mood}`;
  const negatives = VISTAL_NEGATIVES.map((n) => `  - ${n}`).join('\n');
  // Ba trường đi kèm mỗi cảnh. `persuasion` là THIẾT BỊ TU TỪ — tên nó, chứ
  // không phải mô tả: mô tả thì model viết cho có, còn tên thiết bị thì buộc
  // nó phải nghĩ ra cách chứng minh trước khi chọn chữ. `beat` là NHỊP CẢM
  // XÚC, cũng là tên: một cảnh gọi tên được cảm xúc thì biết người xem phải
  // thấy gì; `focal` là thứ DUY NHẤT mắt dừng lại. Cả ba không đổi một dòng HTML
  // nào — chúng là lý do đằng sau mọi lựa chọn chữ.
  const rhetoricBrief = `MỖI CẢNH PHẢI CÓ BA TRƯỜNG NÀY, không cảnh nào được bỏ:
- "persuasion" — THIẾT BỊ TU TỪ bạn dùng để chứng minh, gọi đúng tên một trong:
  before_after · numbered_enumeration · counterexample · callback_then_distillation
  (đổi trước/sau · liệt kê đánh số · phản ví dụ · gọi lại rồi chắt lọc)
- "beat" — NHỊP CẢM XÚC cảnh đó đẩy người xem, gọi đúng tên một trong:
  recognition_then_tension · aha · resolve_then_inevitability
  (gặp mình rồi hẵng lên · bừng sáng · dịu xuống và thấy điều không tránh được)
- "focal" — THỨ DUY NHẤT mắt dừng lại: con số, từ khóa, hay ảnh nào đứng giữa khung.`;
  // Only demonstrate structure. A fixed cafe story contaminates unrelated
  // topics and teaches scene types that the selected intent cannot render.
  // The word count in every placeholder is the one that beat actually needs, so
  // a model copying the shape also copies the density: the under-written
  // narration is what left a measured video silent for a third of its length.
  const example = {
    intent, duration: target,
    scenes: slots.map((slot) => ({
      type: slot.types[0], text: '<caption từ nội dung nguồn>',
      say: `<lời đọc ${Math.max(4, Math.round(slot.duration * WORDS_PER_SECOND))} từ cho riêng ý này>`,
      duration: slot.duration,
      motion: 'reveal',
      persuasion: '<tên thiết bị tu từ>',
      beat: '<nhịp cảm xúc, cùng tên beat trong dàn ý>',
      focal: '<thứ duy nhất mắt dừng lại>',
    })),
  };

  const user = `Nội dung nguồn:
Tiêu đề: ${job.title || job.project?.name || ''}
Mô tả: ${job.meta_description || job.project?.description || ''}
Nội dung đầy đủ, không được bỏ ý ở giữa hoặc cuối bài:
${String(source || '').trim()}
${job.project?.address ? `Địa chỉ: ${job.project.address}\n` : ''}${job.project?.phone ? `Điện thoại: ${job.project.phone}\n` : ''}

${INTENT_BRIEF}

${intentLine}

${filmBlock}

Dàn ý beat cho intent "${intent}" (tổng ~${target}s):
${outline}

ĐUÔI PHẢI CÓ VIỆC ĐỂ LÀM. Tổng "duration" của các cảnh phải đúng bằng ${target} giây — cộng lại từng con số bạn sắp ghi cho ra đúng ${target}, đừng để dư. Và cảnh cuối phải là một chỗ CÓ VIỆC trong suốt khoảng thời gian đó: chốt lại thông điệp, hoặc giữ hình đủ lâu cho người xem kịp đọc chữ trên màn hình, hoặc một lời kêu gọi — chứ không phải một khoảng trống chờ hết giờ. Nếu cảnh cuối dài hơn phần lời đọc, phần dư phải THỞ: đặt "motion":"idle" để khung phồng lên rồi xuống rất chậm, đừng để nó đứng yên.

Asset thật đang có (dùng đúng tên này ở trường "asset"):
${assetList}

Các loại được phép cho intent này: ${[...new Set(slots.flatMap((slot) => slot.types))].join(', ')}.
Các mô tả dưới đây chỉ để tra cứu; loại ngoài danh sách trên không được dùng.
${SCENE_BRIEF}

${rhetoricBrief}
Cảnh nào thiếu "persuasion" hoặc "beat" sẽ bị loại khỏi phim.

KHÔNG DÙNG những hình ảnh sau, chúng là dấu hiệu của một hình ảnh do máy sinh ra:
${negatives}

Trả đúng ${slots.length} cảnh theo thứ tự dàn ý. Mỗi cảnh chỉ dùng một loại trong beat tương ứng; không thêm dữ kiện ngoài nguồn.
Trả JSON: {"intent":"${intent}","duration":${target},"scenes":[{"type":"...","text":"...","say":"...","duration":số,"asset":"tên asset nếu cần","motion":"zoom|pan|scroll|reveal|idle|none","icon":"tên icon nếu cần","persuasion":"tên thiết bị tu từ","beat":"nhịp cảm xúc","focal":"thứ mắt dừng lại"}]}

KHUNG CẤU TRÚC (thay toàn bộ placeholder bằng nội dung nguồn; không đọc placeholder):
${JSON.stringify(example)}

Trả JSON:`;

  const { data, provider } = await chatJson(
    [
      { role: 'system', content: 'Bạn là đạo diễn và người viết lời dẫn video dài cho TikTok/Reels. Bạn kể đủ ý bằng hình, dùng chuyển động chậm và liền mạch, không tạo tò mò giả bằng cách giấu thông tin quan trọng. Chỉ trả JSON thuần.' },
      { role: 'user', content: user },
    ],
    // max_tokens is the WHOLE budget, reasoning included — not a cap on
    // the answer, and the model's share of it grows with the board. Measured
    // on the real call: an 8-screen board spent ~2 600 tokens thinking, a
    // 12-screen board spent 7 510, and at 8 192 the larger one finished its
    // reasoning with nothing left to say. The board is up to 16 screens now,
    // so the budget has to leave room for the answer after a long think.
    { temperature: 0.65, max_tokens: 16384 },
  );
  const choice = data?.choices?.[0];
  const raw = choice?.message?.content || '';
  const sb = parseStoryboard(raw);
  if (!sb) {
    // The reason travels with the failure. An empty answer used to report
    // `storyboard_schema_bad: ` and nothing else, which is indistinguishable
    // from a malformed answer — and cost a day to find, because the real
    // cause (finish_reason: length, budget spent on reasoning) is only
    // visible in the response the error threw away. The provider name is in
    // there too, because the two gateways in the ladder truncate differently.
    const why = choice?.finish_reason || 'no_finish_reason';
    const reasoning = Number(data?.usage?.completion_tokens_details?.reasoning_tokens) || 0;
    throw new Error(
      `storyboard_schema_bad: provider=${provider} finish_reason=${why} reasoning_tokens=${reasoning} `
      + `completion_tokens=${data?.usage?.completion_tokens ?? '?'} raw="${String(raw).slice(0, 120)}"`,
    );
  }
  return { ...sb, provider };
}

// edge-tts can answer with a file that holds only the first part of a long
// segment. The exit status is a success and the file is comfortably over the
// size floor, so the missing words ship silently and the sentence simply
// stops before it lands its point — the exact symptom of a voice that is
// "missing the end of the sentence". Speed is the tell: this voice reads
// Vietnamese at a little over three words a second, so a clip implying much
// more than that is missing audio, not fast speech.
const MIN_WORDS_PER_SECOND = 2;

// The cap is what keeps the truncation away. edge-tts answers a long `--text`
// with audio that stops partway through it, and the same request retried
// stops in the same place — so a segment is spoken as a few short sentences
// and stitched back together, and the endpoint never gets the chance to drop
// the tail. Twelve words is a comfortable sentence: it is what this voice
// reads in about four seconds, and every answer measured so far came back
// whole at that length.
const TTS_CHUNK_WORDS = 12;

// Whole sentences first, so a chunk still sounds like speech and not like a
// fragment the listener has to reassemble. A sentence longer than the cap is
// cut at its commas, then at a word boundary — never mid-word, and never
// short: the words removed from a segment are words the viewer never hears.
export function ttsChunks(text, maxWords = TTS_CHUNK_WORDS) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return [];
  const byWord = (s) => {
    const w = s.split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i < w.length; i += maxWords) out.push(w.slice(i, i + maxWords).join(' '));
    return out;
  };
  const chunks = [];
  let cur = '';
  const flush = () => { if (cur) { chunks.push(cur); cur = ''; } };
  const add = (piece) => {
    if (!cur) { cur = piece; return; }
    if (wordCount(cur) + wordCount(piece) <= maxWords) { cur += ' ' + piece; return; }
    flush(); cur = piece;
  };
  for (const sentence of sentencesOf(value)) {
    if (wordCount(sentence) <= maxWords) { add(sentence); continue; }
    flush();
    for (const part of sentence.split(/(?<=,)\s+/)) {
      if (wordCount(part) <= maxWords) { add(part); continue; }
      flush();
      for (const piece of byWord(part)) add(piece);
    }
  }
  flush();
  return chunks;
}

// One mp3 from the chunk files, in order. `-c copy` so the audio is not
// re-encoded a second time on the way to the master.
function concatAudio(parts, out) {
  if (parts.length === 1) { copyFileSync(parts[0], out); return; }
  const list = `${out}.concat.txt`;
  writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(out) || statSync(out).size <= 500) {
    throw new Error(`tts_concat_failed: ${(r.stderr || '').toString().slice(-200)}`);
  }
}

// `only` re-speaks just those indices and measures the rest from disk —
// fitting the narration must not pay for eight segments to fix one.
export function speakSegments(segTexts, work, spawn, { only = null } = {}) {
  const segs = [];
  for (const [i, text] of segTexts.entries()) {
    const mp3 = join(work, 'assets', `seg${i}.mp3`);
    if (only && !only.includes(i)) { segs.push(audioSeconds(mp3)); continue; }
    const ok = (f) => existsSync(f) && statSync(f).size > 500;
    // One file per chunk, so a chunk that comes back short is re-spoken on
    // its own instead of costing the whole segment another pass.
    const parts = [];
    for (const [c, chunk] of ttsChunks(text).entries()) {
      const part = join(work, 'assets', `seg${i}.p${c}.mp3`);
      parts.push(part);
      let done = false, lastErr = '';
      const words = wordCount(chunk);
      // The endpoint throttles bursts: space every attempt out, escalate
      // the backoff, and keep the last stderr for the failure report.
      for (const voice of [VOICE, 'vi-VN-HoaiMyNeural']) {
        for (let attempt = 0; attempt < 3 && !done; attempt++) {
          // Never let a previous attempt's file satisfy the size check after a
          // failed TTS retry. A stale segment would silently ship old words.
          rmSync(part, { force: true });
          const r = spawn('edge-tts', ['--voice', voice, '--rate=+8%', '--text', chunk, '--write-media', part], { encoding: 'utf8' });
          if (r.status === 0 && ok(part)) {
            const seconds = speechSeconds(part);
            if (words >= 10 && seconds > 0.5 && words / seconds < MIN_WORDS_PER_SECOND) {
              // Re-spoken rather than shipped: the audio is missing the words
              // at the end, and every voice in the list will read them. Same
              // speech measure as the segment gate, so one request's own
              // padding never counts as a lost word.
              lastErr = `truncated: ${words} words would need ${(words / MIN_WORDS_PER_SECOND).toFixed(1)}s, got ${seconds.toFixed(1)}s`;
              spawn('sleep', [String(4 + attempt * 4)]);
              continue;
            }
            done = true; break;
          }
          lastErr = (r.stderr || r.stdout || '').toString().slice(-120);
          spawn('sleep', [String(4 + attempt * 4)]);
        }
        if (done) break;
      }
      if (!done) throw new Error(`edge-tts failed for segment ${i} chunk ${c} (both voices): ${lastErr}`);
    }
    concatAudio(parts, mp3);
    for (const p of parts) rmSync(p, { force: true });
    // The last word of the segment is the one that goes missing, so the
    // joined file is measured as a whole: a short answer now fails the job
    // loudly instead of shipping a voice that stops mid-thought. Measured
    // on speech, not on file length — a chunk seam is silence, and a seam
    // is not a missing word. The duration handed back stays the file's, so
    // the scene is still long enough to play every pad out.
    const spoken = speechSeconds(mp3);
    const total = wordCount(text);
    if (total >= 10 && spoken > 0.5 && total / spoken < MIN_WORDS_PER_SECOND) {
      throw new Error(
        `edge-tts_truncated_segment_${i}: ${total} words would need ${(total / MIN_WORDS_PER_SECOND).toFixed(1)}s, got ${spoken.toFixed(1)}s`,
      );
    }
    // The scene is long enough to play the whole padded file, pads included:
    // cutting them would shave the pause the TTS put between two chunks.
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
// Cutting narration is a last resort, and when it happens it drops WHOLE
// sentences, never words off the end. Truncating the tail is the worst
// version of this: the viewer hears a sentence stop exactly where it was
// about to land its point. A CTA keeps its action — the last sentences, not
// the first — because cutting "Đăng ký ngay để…" from the front leaves a
// video ending on context instead of an ask.
function sentencesOf(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function trimNarrationToWords(text, maxWords, keepTail = false) {
  const value = String(text || '').trim().replace(/\s+/g, ' ');
  if (wordCount(value) <= maxWords) return value;
  const sents = sentencesOf(value);
  const ordered = keepTail ? sents.slice().reverse() : sents;
  const kept = [];
  let used = 0;
  for (const sentence of ordered) {
    const w = wordCount(sentence);
    if (kept.length && used + w > maxWords) break;
    kept.push(sentence);
    used += w;
  }
  // A single sentence longer than the whole budget stays whole. Half a
  // sentence is worse than a long one, and the scene can take the time.
  if (!kept.length) return value;
  return (keepTail ? kept.reverse() : kept).join(' ');
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

  // A scene is never shorter than the voice in it. The storyboard plans a
  // length; the voice is the thing that actually has to fit, and the video
  // has room to spare — a measured render was planning 90s of screens for
  // 54s of speech. Answering an overlong segment by deleting words is what
  // left sentences stopping before their point, when the time was there all
  // along. So every scene is given what its own voice needs FIRST.
  let grew = 0;
  sb.scenes.forEach((s, i) => {
    const need = (segs[i] || 0) + GAP;
    if (need > s.duration) { grew += need - s.duration; s.duration = need; }
  });
  if (grew > 0.5) log(`tts: ${grew.toFixed(1)}s handed back to the scenes — no voice is cut short to hit a plan`);

  // Now, and only now, can the video still be too long — and only whole
  // sentences come off. Protect the final source beat and CTA on early
  // passes; only touch them if earlier scenes cannot absorb enough.
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
      const next = trimNarrationToWords(
        current,
        budget,
        scene.type === 'cta' || i >= sb.scenes.length - 2,
      );
      if (next !== current) {
        scene.say = next;
        retry.push(i);
      }
    }
    if (!retry.length) break;
    log(`tts: video would run ${(voiceTotal() + GAP * sb.scenes.length).toFixed(1)}s over ${limit}s — dropping whole sentences from ${retry.length} segment(s), pass ${pass + 1}/3`);
    segs = speakSegments(texts(), work, spawn, { only: retry });
  }

  // A scene is never shorter than the voice in it, and never much longer.
  //
  // The old code only grew scenes to fit the voice. A board that planned 90s
  // of screens but only wrote 60s of narration then ran every scene long: a
  // measured render spent 33.8s of its 90s with nobody talking, and the last
  // 20s of it was one completely frozen card. The storyboard asks for 80–95%
  // speech coverage; this is where that ask is either kept or dropped.
  //
  // BREATH is the pause a viewer needs to land a scene — the gap plus a
  // moment to read. Past that, extra time is silence, so it is taken back and
  // the video ends when the story does.
  const BREATH = 1.3;
  let reclaimed = 0;
  sb.scenes.forEach((s, i) => {
    const floor = Math.ceil(((segs[i] || 0) + GAP) * 10) / 10;
    const ceil = Math.ceil((floor + BREATH) * 10) / 10;
    const next = Math.min(Math.max(s.duration, floor), ceil);
    reclaimed += Math.max(0, s.duration - next);
    s.duration = next;
  });
  if (reclaimed > 0.5) {
    log(`tts: ${reclaimed.toFixed(1)}s of planned silence reclaimed — scenes end with the voice`);
  }
  // Rounding every scene to a tenth and then adding them up drifts: twelve
  // screens can come to 90.1s against a 90s video, and the video would be
  // refused for a tenth of a second it never actually took. The closing
  // screens carry the least of the story, so they absorb the drift — the same
  // rule `sanitizeStoryboard` uses when it renormalises a board.
  let total = Math.round(sb.scenes.reduce((a, s) => a + s.duration, 0) * 10) / 10;
  for (let i = sb.scenes.length - 1; i >= 0 && total > limit; i--) {
    const floor = Math.ceil(((segs[i] || 0) + GAP) * 10) / 10;
    const room = sb.scenes[i].duration - floor;
    if (room <= 0) continue;
    const take = Math.min(room, Math.ceil((total - limit) * 10) / 10);
    sb.scenes[i].duration = Math.round((sb.scenes[i].duration - take) * 10) / 10;
    total = Math.round(sb.scenes.reduce((a, s) => a + s.duration, 0) * 10) / 10;
  }
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
  if (!MODEL_PROVIDERS.length) throw new Error('no model provider configured (set NINEROUTER_API_KEY or GUROUTER_API_KEY in video-agent/.env)');
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
  const { data } = await chatJson(
    [{ role: 'system', content: sys }, { role: 'user', content: user }],
    { temperature: 0.7, max_tokens: 1200 },
  );
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
export function audioSeconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const d = parseFloat((r.stdout || '').trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error('ffprobe_duration_missing');
  return d;
}
// edge-tts pads every chunk with silence at both ends, and `concatAudio`
// stacks those pads on top of each other: the same 14 words measure 3.8s as
// one request and 5.6s as two. Judging words/seconds on the file length
// therefore reads a padding seam as a missing tail, and the job re-speaks
// the same number forever — measured, not guessed. Only the speech counts.
export function speechSeconds(file) {
  const total = audioSeconds(file);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'silencedetect=noise=-40dB:d=0.15', '-f', 'null', '-'], { encoding: 'utf8' });
  const log = (r.stderr || '').toString();
  if (!log.includes('silence_')) return total;
  const spans = [...log.matchAll(/silence_duration:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const starts = [...log.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  // A silence running to the end of the file reports a start and no duration.
  const trailing = starts.length > ends.length ? Math.max(0, total - starts[starts.length - 1]) : 0;
  const speech = total - spans.reduce((a, b) => a + b, 0) - trailing;
  return speech > 0.5 ? speech : total;
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

// "motion" của storyboard là một Lời xin, và lời xin "none" bị engine từ chối
// khi có ảnh trên màn hình. Giữ một khung hình bất động là thứ rẻ tiền rõ
// nhất một video do máy sinh ra có thể làm — freezedetect đo được ~55 giây
// đứng yên trên một bản render thật. Nên `none` không bao giờ là chữ cuối:
// cảnh có ảnh rơi về `idle`, và cảnh cuối cũng vậy.
const MOTIONS = new Set(['zoom', 'pan', 'scroll', 'reveal']);

// Bao lâu thì cảnh cuối đã đủ dài để một khung đứng yên bị cảm thấy. Dưới
// ngưỡng này người xem còn đang đọc chứ chưa kịp nhìn xong; trên ngưỡng thì
// đó là phần dư — chỗ mà phần dư hay bị bỏ trống, và phần dư đứng yên thì
// đóng băng, không phải kết thúc.
const TAIL_BREATH_MIN = 5;

// Chuyển "motion" của cảnh thành cái thật sự chạy. Ba điều kiện, theo đúng
// thứ tự ưu tiên:
//   1. Cảnh có ảnh thì KHÔNG BAO GIỜ được đứng yên — kể cả khi model xin
//      "none", và kể cả khi nó quên mất trường này. `idle` là câu trả lời:
//      phình/thu rất chậm, đủ để khung không chết.
//   2. Cảnh cuối đủ dài là `idle` dù không có ảnh — đó là chỗ phần dư tụ lại,
//      và đóng băng ở khung cuối thì người xem đọc xong rồi vẫn phải ngồi đợi.
//   3. Còn lại là `none`, và `none` nghĩa là không phát thêm tween nào cho
//      media. Cảnh không có ảnh không có gì để giữ: thẻ chữ không phải chủ
//      thể, và dataChoreography đã đẩy riêng cảnh đó quanh suốt thời lượng.
export function effectiveMotion(s, isLast = false, hasMedia = false) {
  const want = String(s?.motion || '').trim();
  if (MOTIONS.has(want) || want === 'idle') return want;
  if (hasMedia) return 'idle';
  const tail = Number(s?.dur ?? s?.duration ?? 0);
  if (isLast && tail >= TAIL_BREATH_MIN) return 'idle';
  return 'none';
}

function motionFor(i, s, isLast = false, hasLogo = false) {
  const st = s.start.toFixed(2);
  const du = s.dur.toFixed(2);
  const end = (s.start + s.dur).toFixed(2);
  const out = [];

  // `scale` is deliberately absent here: the camera push in dataChoreography
  // owns it for the whole scene, and two tweens writing one property means one
  // of them silently wins.
  if (i === 0) {
    out.push(`tl.fromTo("#s${i} .ex", { opacity: 0, y: 22, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: "power3.out" }, ${st});`);
  } else {
    out.push(`tl.fromTo("#s${i}", { opacity: 0, filter: "blur(12px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.50, ease: "power3.out", immediateRender: false }, ${st});`);
    if (s.bgId) {
      out.push(`tl.fromTo("#${s.bgId}", { opacity: 0 }, { opacity: 1, duration: 0.50, ease: "power2.out", immediateRender: false }, ${st});`);
    }
  }
  if (!isLast) {
    out.push(`tl.to("#s${i}", { opacity: 0, filter: "blur(12px)", duration: 0.50, ease: "power2.in" }, ${end});`);
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

  // Lời xin "motion" của model, đã qua bộ lọc: `none` chỉ sống được ở khung
  // không có ảnh, mọi thứ còn lại giữ bằng một hơi thở. Tính MỘT lần ở đây
  // vì cả nhánh media lẫn nhánh reveal đều cần cùng một câu trả lời.
  const want = effectiveMotion(s, isLast, Boolean(media));

  if (media) {
    // Nhánh idle và nhánh `else` cuối trông gần giống nhau nhưng không cùng
    // ý nghĩa. `else` là nhánh lạc: hỏi "scroll" ở một cảnh không có màn hình
    // để cuộn, thì còn một cú đẩy thẳng một chiều (biên độ lớn, đẩy trọn
    // cảnh). Còn idle là một hơi THỞ — đi ra rồi về, chậm đến mức người xem
    // không nhận ra, nhưng đủ để khung không đứng yên. Biên độ 6% là con số đo
    // được, không phải số đoán: 1.4% mới chỉ nhấp nháy 2/255 mỗi khung, tức là
    // về mặt kỹ thuật có chuyển động và về mặt thị giác là đóng băng. Chiều sâu
    // thì chia đôi thời lượng và yoyo, nên đỉnh tốc độ chỉ bằng nửa một cú đẩy
    // cùng biên độ.
    if (want === 'zoom') {
      out.push(`tl.fromTo("${media}", { scale: 1.02 }, { scale: 1.16, duration: ${du}, ease: "none" }, ${st});`);
    } else if (want === 'pan') {
      out.push(`tl.fromTo("${media}", { scale: 1.14, xPercent: -5, yPercent: 2 }, { scale: 1.16, xPercent: 5, yPercent: -2, duration: ${du}, ease: "none" }, ${st});`);
    } else if (want === 'scroll' && s.type === 'ui_demo' && s.asset) {
      out.push(`tl.fromTo("#s${i} .device-shot", { yPercent: 4, scale: 1.12 }, { yPercent: -22, scale: 1.12, duration: ${du}, ease: "none" }, ${st});`);
    } else if (want === 'idle') {
      out.push(`tl.fromTo("${media}", { scale: 1.045, xPercent: -1.2 }, { scale: 1.105, xPercent: 1.2, duration: ${(s.dur / 2).toFixed(2)}, ease: "sine.inOut", yoyo: true, repeat: 1, immediateRender: false }, ${st});`);
    } else {
      out.push(`tl.fromTo("${media}", { scale: 1.03, xPercent: -2 }, { scale: 1.13, xPercent: 2, duration: ${du}, ease: "none" }, ${st});`);
    }
  } else if (want === 'idle') {
    // Cảnh không có ảnh mà vẫn phải thở: thẻ chữ LÀ chủ thể của khung, và đó
    // chính là cảnh cuối — nơi phần dư thời gian tụ lại. Chỉ scale, vì
    // dataChoreography đã dùng y/opacity trên chính `.ex` đó, và hai tween tranh
    // một thuộc tính thì một thẳng thắng im lặng.
    out.push(`tl.fromTo("#s${i} .ex", { scale: 1.02 }, { scale: 1.075, duration: ${(s.dur / 2).toFixed(2)}, ease: "sine.inOut", yoyo: true, repeat: 1, immediateRender: false }, ${st});`);
  }
  if (want === 'reveal') {
    out.push(`tl.fromTo("#s${i} .ex", { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.7, ease: "power3.out" }, ${st});`);
  }
  return out.join('\n  ');
}

// A video that stops moving stops being watched. Measured on a real render:
// freezedetect found ~55s of frozen frames — the chart scenes, which have no
// image to move, sat perfectly still after their 0.5s intro. This gives EVERY
// scene a living element: bars grow, rings sweep, numbers count, rows rise in
// sequence, and the card itself breathes. All tweens are fromTo with absolute
// time so preview and render seek identically.
function dataChoreography(i, s) {
  const st = s.start.toFixed(2);
  const du = s.dur.toFixed(2);
  // The camera push. Every scene eases in for its whole length, so there is no
  // instant where the frame is simply still.
  //
  // It targets the scene, not the card: a photo scene puts its picture in a
  // sibling background layer and its caption is a small card, so pushing the
  // card moved almost nothing. Pushing the scene moves whatever is on screen,
  // and it keeps moving when the image call fails and the picture is a flat
  // gradient — the case that measured 0.000 frame difference, a dead frame.
  //
  // It eases IN (1.05 → 1) rather than breathing out and back, so it settles
  // where the scene's exit expects to pick it up, and it starts at the moment
  // the scene is still fading in, where the starting scale is not yet visible.
  //
  // The amplitude is measured, not guessed: at 1.4% the mean frame-to-frame
  // difference was 2/255 — technically moving, visually a freeze. A push that
  // actually reads is roughly four times that.
  const push = `tl.fromTo("#s${i}", { scale: 1.05, yPercent: 1.2 }, { scale: 1, yPercent: -1.2, duration: ${du}, ease: "sine.inOut", immediateRender: false }, ${st});`;
  const out = [push];
  // Stagger helper: reveal each child across the first ~70% of the scene, so the
  // last item lands while the voice is still on the item before it.
  const stagger = (sel, per, dy = 18) =>
    out.push(`tl.fromTo("${sel}", { opacity: 0, y: ${dy} }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: ${per.toFixed(2)}, immediateRender: false }, ${st});`);

  switch (s.type) {
    case 'stat':
      out.push(`tl.fromTo("#s${i} .stat-n", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.7, ease: "back.out(1.6)", immediateRender: false }, ${st});`);
      stagger('#s' + i + ' .stat-l', 0.1, 16);
      break;
    case 'result':
      // A result may be a list with no number; never hand GSAP an empty target.
      if (s.value !== undefined && s.value !== null && s.value !== '') out.push(`tl.fromTo("#s${i} .res-n", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.7, ease: "back.out(1.6)", immediateRender: false }, ${st});`);
      stagger('#s' + i + ' .res-list li', 0.12, 20);
      break;
    case 'bars':
      out.push(`tl.fromTo("#s${i} .bar-fill", { scaleX: 0 }, { scaleX: 1, duration: ${(du * 0.7).toFixed(2)}, ease: "power3.out", stagger: 0.12, transformOrigin: "left center", immediateRender: false }, ${st});`);
      stagger('#s' + i + ' .bar-row', 0.1);
      break;
    case 'donut':
      out.push(`tl.fromTo("#s${i} .donut-wrap", { opacity: 0, rotation: -90, scale: 0.9 }, { opacity: 1, rotation: 0, scale: 1, duration: 0.9, ease: "back.out(1.2)", immediateRender: false }, ${st});`);
      break;
    case 'line':
      out.push(`tl.fromTo("#s${i} .line-wrap", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: ${(du * 0.8).toFixed(2)}, ease: "power2.inOut", immediateRender: false }, ${st});`);
      stagger('#s' + i + ' .line-labs > *', 0.08, 10);
      break;
    case 'steps':
      stagger('#s' + i + ' .step', 0.16, 26);
      out.push(`tl.fromTo("#s${i} .step-arrow", { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: "power2.out", transformOrigin: "center", stagger: 0.16, immediateRender: false }, ${(s.start + 0.5).toFixed(2)});`);
      break;
    case 'timeline':
      stagger('#s' + i + ' .tl-row', 0.14, 22);
      break;
    case 'icons':
      stagger('#s' + i + ' .ig-item', 0.1, 22);
      out.push(`tl.fromTo("#s${i} .ig-ico", { rotation: -12, scale: 0.6 }, { rotation: 0, scale: 1, duration: 0.5, ease: "back.out(2)", stagger: 0.1, immediateRender: false }, ${st});`);
      break;
    case 'compare':
      out.push(`tl.fromTo("#s${i} .cmp-left", { xPercent: -12, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.55, ease: "power3.out", immediateRender: false }, ${st});`);
      out.push(`tl.fromTo("#s${i} .cmp-right", { xPercent: 12, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.55, ease: "power3.out", immediateRender: false }, ${(s.start + 0.12).toFixed(2)});`);
      stagger('#s' + i + ' .cmp-i', 0.07, 12);
      break;
    case 'keypoints':
      stagger('#s' + i + ' .kp-row', 0.15, 24);
      break;
    case 'quote':
    case 'headline':
    case 'feature':
      out.push(`tl.fromTo("#s${i} .ex", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out", immediateRender: false }, ${st});`);
      break;
    case 'cta':
      out.push(`tl.fromTo("#s${i} .ex", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out", immediateRender: false }, ${st});`);
      break;
    default:
      break;
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
  .cmp-neutral { border:2px solid rgba(255,255,255,0.2); }
  .cmp-h { color:#fff; font-size:28px; font-weight:700; margin-bottom:12px; }
  .cmp-i { color:#e6edf5; font-size:24px; line-height:1.35; display:flex; gap:8px;
    margin:8px 0; text-align:left; }
  .cmp-m { flex:none; display:flex; }
  .cmp-m.good { color:#52c41a; }
  .cmp-m.bad { color:#ff4d4f; }
  .cmp-m.neutral { color:${A}; }
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
  /* A result beat with no number left draws the source's own points instead
     of a lone caption, so the screen still carries its argument in the image. */
  .res-list { list-style:none; margin:22px 0 0; padding:0; display:flex;
    flex-direction:column; gap:12px; max-width:600px; }
  .res-list li { position:relative; padding-left:34px; color:#eaf1f8; font-size:30px;
    line-height:1.3; font-weight:500; }
  .res-list li::before { content:''; position:absolute; left:0; top:11px; width:14px;
    height:14px; border-radius:4px; background:var(--accent,#e8590c); }
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
${meta.map((s, i) => [motionFor(i, s, i === meta.length - 1, Boolean(logoSrc)), dataChoreography(i, s)].join('\n  ')).join('\n  ')}
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
  // A template on the job pins the intent before any signal is read — the
  // user's choice outranks the classifier.
  const tpl = templateById(job.template);
  const forced = tpl && intentForTemplate(tpl, job);
  const source = job.body_markdown || job.project?.description || '';
  // How long the video should be is the article's own decision when nobody
  // said: a short answer gets the 60s floor, a long piece with many sections
  // earns the 90s ceiling. `source` is the article on purpose — the captured
  // page text is marketing copy scraped off a footer, and letting it count
  // would make every business job look like a long read.
  const target = clampDuration(
    Number(job.duration) || Number(E('VIDEO_DURATION')) || suggestDuration(source)
    || tpl?.defaultDuration || DURATION.default,
  );
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
    // No provider named here: the ladder decides, and a line that says
    // "GuRouter" while 9Router answered is a lie in the log an operator
    // reads when a video comes out wrong.
    log('writing storyboard…');
    raw = await writeStoryboard(job, { source: storySource, suggested: suggested.intent, assets, target, forced });
    log(`storyboard ok (via ${raw.provider || 'unknown'}, intent ${raw.intent || suggested.intent}, ${raw.scenes.length} scenes)`);
  } catch (e) {
    log(`storyboard failed (${String(e?.message || e).slice(0, 140)}) — deriving from the content`);
  }

  // A chosen template cannot be overridden by the model's answer.
  const intent = forced || (INTENTS.includes(raw?.intent) ? raw.intent : suggested.intent);
  const presenterName = String(job.project?.presenter_name || '').trim();
  // `requireRhetoric` chỉ bật khi board do model viết: bảng tất định sinh ra
  // không có lý do tu từ, mà đòi nó thì cả bộ cảnh rơi hết.
  const gateOpts = { source: storySource, intent, target, assets, presenterName, requireRhetoric: Boolean(raw) };
  // Mọi lần đi lối về bảng tất định đều tắt cờ trên: bảng đó sinh ra từ bài viết
  // chứ không phải từ mô hình, nên không có lý do tu từ để mà đòi.
  const derivedOpts = { ...gateOpts, requireRhetoric: false };
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
      derivedOpts,
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
        derivedOpts,
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
      derivedOpts,
    ));
    review = reviewStoryboard(storyboard, { hasLogo, assets });
  }
  if (!review.ok) {
    // Name the board, not just the complaint: "1_of_3" says a scene is too
    // plain but not which one, and every bare screen so far was a different
    // beat degrading to a caption when it had nothing to show.
    const shape = storyboard.scenes.map((s) => s.type).join(' → ');
    throw new Error(`storyboard_quality_failed: ${review.problems.join(', ')} | board: ${shape}`);
  }
  log(`storyboard: ${storyboard.scenes.length} scenes, ${storyboard.duration}s`);

  // 4. Narration, written to fit and measured.
  const { segs, total } = fitNarration(storyboard, work, spawn, log);
  log(`video: ${total}s · ${storyboard.scenes.map((s) => s.type).join(' → ')}`);

  // The voice is final here, so this is the only point where the caption, the
  // words being spoken and the picture behind them can be made to agree:
  // `fitNarration` may have shortened the line under a caption written for the
  // longer one, and the placeholder labels the deterministic board writes are
  // never said out loud.
  const realigned = alignCaptions(storyboard);
  if (realigned) log(`captions: ${realigned} screen(s) re-derived from what the voice actually says`);

  const made = await generateSceneImages({ storyboard, job, assets, work, config: AI_IMAGE_CONFIG, log });
  if (made) log(`ai images: ${made} screen(s) illustrated`);

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

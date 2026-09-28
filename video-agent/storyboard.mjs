// Storyboard — the video's story shape, decided before anything is drawn.
//
// A video is not "the article, illustrated". It is a story with an intent:
// a product demo, a local business, a lesson. The intent picks the beats,
// the beats pick the scenes, and the scenes are filled from assets that
// actually exist. Code owns the numbers a model cannot be trusted with —
// duration, on-screen text length, how many words fit in a slot — while the
// model supplies the words and the choice of visual.
//
// Two rules this module exists to enforce, both of them lessons:
//   - The storyboard decides the duration, then the narration fits into it.
//     The other way round produced a 79-second video for a 20-second idea.
//   - A storyboard that is mostly text with no asset is a slideshow, and is
//     rejected. `hook → bars → steps → icons → quote → outro` is what that
//     looks like, and it is only legitimate when the intent is to teach.

// ── intents ──────────────────────────────────────────────────────────
export const INTENTS = [
  'product_demo', 'product_promotion', 'local_business', 'educational',
  'storytelling', 'announcement', 'testimonial', 'before_after', 'listicle',
  'news', 'summary', 'qa',
];

// ── scene vocabulary ─────────────────────────────────────────────────
// `visual` scenes show something real (a screenshot, a photo, a map).
// `graphic` scenes draw a chart or a diagram. A storyboard built only from
// prose is the anti-pattern; the two groups below are what breaks it.
export const VISUAL_TYPES = [
  'hook', 'problem', 'product_reveal', 'ui_demo', 'feature',
  'result', 'before_after', 'photo', 'location', 'rating', 'cta',
  'anchor', 'headline',
];
export const GRAPHIC_TYPES = [
  'stat', 'bars', 'donut', 'line', 'steps', 'icons', 'compare', 'timeline',
  'keypoints', 'question', 'answer',
];
// A quote card is words on a gradient, not a graphic. It is listed here so
// the slideshow test counts it for what it is.
export const PROSE_ONLY_TYPES = ['quote'];
export const SCENE_TYPES = [...VISUAL_TYPES, ...GRAPHIC_TYPES, ...PROSE_ONLY_TYPES];

function ownsAsset(assets, key) {
  return !!key && Object.prototype.hasOwnProperty.call(assets || {}, key) && Boolean(assets[key]);
}

// Scene types whose renderer can consume a real asset. Other types may still
// draw cards, icons, or numbers, but an `asset` field on them renders nothing.
const ASSET_RENDER_TYPES = new Set([
  'hook', 'problem', 'photo', 'quote', 'headline', 'product_reveal', 'ui_demo',
  'before_after', 'location', 'answer', 'anchor',
]);

// ── budgets ──────────────────────────────────────────────────────────
// Mọi video phải đủ thời gian kể hết các ý chính của bài, không ép lời đọc
// thành teaser. 60s là sàn cứng: `clampDuration` áp nó lên mọi template,
// kể cả khi người dùng không chọn thời lượng.
// min is a platform floor, not an editorial one. It was 60 because a blog
// video under a minute had not covered its article; that reasoning still
// holds for article videos and is enforced by `suggestDuration` below, which
// only ever proposes 60/75/90. The floor itself is 30 so a short-form social
// video — one researched claim, 30–60s — is expressible. `default` stays 75
// because it is what an unspecified length falls back to.
export const DURATION = { min: 30, max: 90, default: 75 };
export const MIN_SCENES = 3;
// 16 is a pacing decision, not a capacity one. A 90s video at 5.5s per screen
// is sixteen cuts; at the old twelve it was eight long holds, and a measured
// render spent half its length on a card that was not moving.
export const MAX_SCENES = 16;
export const MAX_TEXT_WORDS = 8;

// A screen you can actually look at needs about this long, and the storyboard
// spends its seconds on screens rather than on one long one: a 75s video made
// of six 12s cards reads as a slide deck, the same 75s made of fifteen 5s cards
// reads as a video. This is the divisor in `sceneCountFor`.
//
// It used to be 6.5, which bought ~7.5s screens and left long stretches
// holding on a card. Cutting faster is also what keeps a short video from
// feeling padded, so this is the dial for "too little happens on screen".
const SECONDS_PER_SCREEN = 5.5;

// Vietnamese edge-tts at +8% measures roughly this on the render VPS. It is
// a starting point, not a truth: the pipeline measures the audio it actually
// got and re-fits, so being 20% out costs a retry, not a wrong video.
export const WORDS_PER_SECOND = 2.6;

// ── beats ────────────────────────────────────────────────────────────
// Ordered beats per intent. `weight` is a share of the total duration, and
// `types` is the whole vocabulary that beat is allowed to use — so a
// `bars` scene in a local-business video is dropped, not drawn.
//
// `repeatable` marks the beats that may take a second screen when a long
// article has more key points than the base template has room for. The
// opener, the closer and the single-shape signature beats (summary's
// keypoints, a bulletin's headline) never repeat: a second keypoints card
// directly after the first is the repetition the variety rule exists to stop.
const beats = (...rows) => rows.map(([beat, weight, types, repeatable = false]) => ({ beat, weight, types, repeatable }));

export const BEATS = {
  product_demo: beats(
    ['hook', 1.0, ['hook']],
    ['problem', 1.2, ['problem', 'photo', 'compare'], true],
    ['product', 1.5, ['product_reveal', 'ui_demo', 'icons'], true],
    ['demo', 2.2, ['ui_demo', 'feature', 'steps', 'icons'], true],
    ['result', 1.2, ['result', 'stat']],
    ['cta', 1.4, ['cta']],
  ),
  product_promotion: beats(
    ['hook', 1.1, ['hook']],
    // Same reason as an announcement: a promotion told from a post has a hero
    // image and no screenshot, so a photo leads and the device frame is last.
    ['product', 1.5, ['photo', 'product_reveal', 'ui_demo', 'icons'], true],
    ['benefit', 1.6, ['feature', 'icons', 'steps'], true],
    ['proof', 1.3, ['rating', 'quote', 'stat'], true],
    ['offer', 1.1, ['result', 'stat']],
    ['cta', 1.4, ['cta']],
  ),
  local_business: beats(
    ['hook', 1.0, ['hook']],
    ['business', 1.3, ['product_reveal', 'photo', 'icons'], true],
    ['product', 2.0, ['photo', 'feature', 'icons'], true],
    ['experience', 1.6, ['photo', 'ui_demo', 'icons', 'steps'], true],
    ['location', 1.4, ['location', 'rating']],
    ['cta', 1.4, ['cta']],
  ),
  educational: beats(
    ['hook', 1.1, ['hook']],
    ['insight', 1.4, ['stat', 'quote', 'donut', 'bars', 'compare', 'timeline', 'icons', 'photo', 'keypoints'], true],
    ['point', 2.4, ['bars', 'donut', 'line', 'steps', 'icons', 'compare', 'timeline', 'photo', 'keypoints'], true],
    ['conclusion', 1.3, ['quote', 'result']],
    ['cta', 1.3, ['cta']],
  ),
  storytelling: beats(
    ['hook', 1.0, ['hook']],
    // A story's problem and tension used to resolve to a bare caption. The
    // extra shapes are what a second screen of the same beat turns into.
    ['problem', 1.3, ['problem', 'photo', 'compare', 'icons'], true],
    ['tension', 1.5, ['quote', 'photo', 'icons', 'timeline', 'stat', 'compare'], true],
    ['transformation', 1.8, ['before_after', 'ui_demo', 'compare', 'steps'], true],
    ['result', 1.4, ['result', 'stat']],
    ['cta', 1.3, ['cta']],
  ),
  announcement: beats(
    ['hook', 1.0, ['hook']],
    // An announcement is usually told from a written post with a hero image
    // and no site to screenshot, so `photo` leads here: a device frame with
    // nothing in it is the one shape that always renders empty.
    ['what', 1.6, ['photo', 'product_reveal', 'ui_demo', 'icons'], true],
    ['why', 1.5, ['feature', 'stat', 'icons', 'steps'], true],
    ['demo', 1.9, ['ui_demo', 'feature', 'steps', 'icons', 'photo'], true],
    ['cta', 1.4, ['cta']],
  ),
  testimonial: beats(
    ['hook', 1.1, ['hook']],
    // A beat that may repeat needs a second shape that is *drawn*, or the
    // second screen is a caption on a gradient. `icons` and `stat` give the
    // extra screens something to look at.
    ['voice', 2.0, ['quote', 'rating', 'icons', 'timeline', 'stat', 'before_after'], true],
    ['proof', 1.6, ['result', 'stat', 'photo', 'ui_demo', 'rating'], true],
    ['cta', 1.3, ['cta']],
  ),
  before_after: beats(
    ['hook', 1.0, ['hook']],
    ['before', 1.7, ['photo', 'problem', 'compare', 'icons'], true],
    ['after', 1.7, ['photo', 'result', 'ui_demo', 'rating'], true],
    ['change', 1.9, ['before_after', 'ui_demo', 'compare', 'steps']],
    ['cta', 1.3, ['cta']],
  ),
  listicle: beats(
    ['hook', 1.1, ['hook']],
    ['items', 3.2, ['steps', 'icons', 'bars'], true],
    ['close', 1.2, ['quote', 'result']],
    ['cta', 1.3, ['cta']],
  ),
  news: beats(
    ['headline', 1.0, ['headline']],
    ['anchor_intro', 1.3, ['anchor', 'headline', 'feature']],
    ['story', 2.4, ['photo', 'ui_demo', 'stat', 'location', 'feature', 'steps', 'icons'], true],
    // A quote is fine here when it carries an image; the fallback picks the
    // keypoints shape instead when there is no presenter to put on screen.
    ['anchor_close', 1.2, ['anchor', 'quote', 'keypoints', 'headline']],
    ['cta', 1.1, ['cta']],
  ),
  summary: beats(
    ['hook', 1.0, ['hook']],
    // A second card cannot be a second keypoints card. `steps` is the same
    // idea drawn as a numbered list, so a summary that runs long reads as two
    // different ways of listing rather than one list shown twice.
    ['keypoints', 2.6, ['keypoints', 'steps'], true],
    ['takeaway', 1.2, ['quote', 'result']],
    ['cta', 1.2, ['cta']],
  ),
  qa: beats(
    ['hook', 1.0, ['hook']],
    ['question', 1.2, ['question']],
    ['answer', 2.0, ['answer', 'photo', 'ui_demo', 'stat', 'steps'], true],
    ['question2', 1.0, ['question']],
    ['answer2', 1.6, ['answer', 'feature', 'icons'], true],
    ['cta', 1.2, ['cta']],
  ),
};

// A beat may only name scene types the vocabulary has, and a repeatable beat
// must offer at least one shape that draws something — otherwise the extra
// screens a long article earns are all captions on a gradient. Both are cheap
// to assert at load and expensive to discover in a rendered video.
for (const [intent, rows] of Object.entries(BEATS)) {
  for (const row of rows) {
    if (typeof row.weight !== 'number' || !Number.isFinite(row.weight) || row.weight <= 0) {
      throw new Error(`BEATS.${intent}.${row.beat} has a non-positive weight`);
    }
    if (!Array.isArray(row.types) || !row.types.length) {
      throw new Error(`BEATS.${intent}.${row.beat} names no scene types`);
    }
    for (const type of row.types) {
      if (!SCENE_TYPES.includes(type)) {
        throw new Error(`BEATS.${intent}.${row.beat} names the unknown scene type "${type}"`);
      }
    }
  }
}

// ── repeatable beats ─────────────────────────────────────────────────
// A repeat is a *second point*, so it only makes sense where a beat already
// means "one point of the body". The opener, the closer and the closing turn
// (`result`, `conclusion`, `offer`, `change`, `close`, `takeaway`, `location`,
// `anchor_close`) are excluded by the NEVER_REPEAT set below: two of them in a
// row is a video that lands its ending twice and never arrives.
const NEVER_REPEAT = new Set([
  'hook', 'headline', 'cta',
  'result', 'conclusion', 'offer', 'change', 'close', 'takeaway', 'location',
  'anchor_intro', 'anchor_close',
]);

const REPEATABLE_BY_INTENT = Object.fromEntries(
  Object.entries(BEATS)
    .map(([intent, rows]) => [intent, rows.filter((b) => b.repeatable && !NEVER_REPEAT.has(b.beat))])
    .filter(([, rows]) => rows.length),
);

// What a repeated screen should turn into, best first. Ordered by how much the
// card actually draws: a chart or a list carries the point in the picture, a
// quote is words on a gradient, so a repeat reaches for a drawn shape first and
// only falls back to prose when the beat offers nothing else.
const DRAWN_ALTERNATIVES = [
  'bars', 'line', 'donut', 'compare', 'timeline', 'steps', 'icons', 'keypoints',
  'stat', 'before_after', 'location', 'rating', 'result', 'feature',
  'photo', 'ui_demo', 'product_reveal', 'answer', 'headline', 'question', 'quote',
];

// A quote is a legitimate screen — a line worth stopping on is not a defect.
// But a run of them is a deck someone forgot to illustrate, so a beat that
// offers a drawn shape may only keep `quote` for as many screens as it has
// alternatives. This is the share of a repeated beat that may stay prose.
const MAX_QUOTE_SHARE = 0.4;

// ── text ─────────────────────────────────────────────────────────────
export function words(s) {
  return String(s ?? '').trim().split(/\s+/).filter(Boolean);
}

export function wordCount(s) {
  return words(s).length;
}

// On-screen text is a caption, not a sentence. Cut at a word boundary so it
// never ends mid-word, and drop the trailing punctuation a caption does not
// need.
export function clampText(s, max = MAX_TEXT_WORDS) {
  const w = words(s);
  const cut = w.slice(0, max).join(' ').replace(/[.!?…:;,]+$/u, '').trim();
  return cut;
}

export function narrationBudget(seconds) {
  // A little slack: TTS pace varies with punctuation, and the fitting step
  // measures the real file anyway.
  return Math.max(3, Math.round(seconds * WORDS_PER_SECOND * 1.2));
}

// ── duration ─────────────────────────────────────────────────────────
export function clampDuration(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n)) return DURATION.default;
  return Math.min(DURATION.max, Math.max(DURATION.min, Math.round(n * 10) / 10));
}

// How many screens a video of this length is made of. The band is what keeps
// the result a video at both ends: under 8 the seconds have to stretch over
// too few cards and the video reads as a slideshow, and the template can
// never have more beats than MAX_SCENES anyway.
export function sceneCountFor(seconds) {
  const wanted = Math.round((Number(seconds) || DURATION.default) / SECONDS_PER_SCREEN);
  return Math.max(8, Math.min(MAX_SCENES, wanted));
}

// How long a video should be when the operator did not say. The article's own
// structure decides, and a heading is the unit that matters: a 3,000-word post
// is a list of sections, and each one is a point the video has to cover. Posts
// written as loose prose have no headings, so their substantial sentences play
// the same role.
//
// Counting words instead would be a trap — two posts of identical length can
// carry very different numbers of sections, and it is the sections that decide
// how many screens the video needs.
const SECTIONS_SHORT = 5;
const SECTIONS_LONG = 10;
const SENTENCES_SHORT = 8;
const SENTENCES_LONG = 16;

export function suggestDuration(source) {
  const body = String(source || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1');
  const headings = (body.match(/^#{1,6}\s+\S/gm) || []).length;
  if (headings) {
    if (headings < SECTIONS_SHORT) return 60;
    if (headings >= SECTIONS_LONG) return 90;
    return 75;
  }
  const sentences = body
    .split(/\n+|(?<=[.!?])\s+/)
    .filter((sentence) => wordCount(sentence.replace(/^#{1,6}\s+/, '')) >= 8).length;
  if (sentences < SENTENCES_SHORT) return 60;
  if (sentences >= SENTENCES_LONG) return 90;
  return 75;
}

// Spread `target` seconds across the intent's beats by weight. This is the
// inversion at the heart of the rework: the story decides how long the video
// is, and the narration is written to fit — not the other way round.
//
// The template is expanded first, so a 75s video is allotted to twelve screens
// rather than to six long ones. Callers keep the two-argument signature and
// get the expanded shape.
export function beatSlots(intent, target = DURATION.default, maxScenes = MAX_SCENES) {
  const template = expandBeats(intent, target, maxScenes);
  const total = template.reduce((a, b) => a + b.weight, 0);
  const dur = clampDuration(target);
  const totalUnits = Math.round(dur * 10);
  const raw = template.map((b) => b.weight / total * totalUnits);
  const units = raw.map((value) => Math.floor(value));
  let remainder = totalUnits - units.reduce((a, b) => a + b, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; remainder > 0; i = (i + 1) % order.length, remainder--) units[order[i].index]++;
  return template.map((b, index) => ({ ...b, duration: units[index] / 10 }));
}

// The intent's beats, repeated until they fill the screen budget for `target`.
//
// This is how a longer video stays a longer *video* instead of a longer slideshow:
// the seconds go into more screens, not longer ones. Only beats marked
// repeatable take a second slot, and the repeats are inserted where the beat
// already sits so the story still runs opener → body → closer. A repeated beat
// splits its own weight, so feeding the result through `beatSlots` yields the
// same total duration the target asked for.
export function expandBeats(intent, target = DURATION.default, maxScenes = MAX_SCENES) {
  const template = BEATS[intent] || BEATS.educational;
  // `maxScenes` caps how many EXTRA screens a beat may repeat for. It never
  // trims the base template: those beats are the story's shape, and dropping
  // one fails the gate's `missing_beat` check outright.
  const wanted = Math.max(template.length, Math.min(sceneCountFor(target), maxScenes));
  if (wanted <= template.length) return template;
  const repeatables = REPEATABLE_BY_INTENT[intent] || [];
  if (!repeatables.length) return template;

  // Split the extra screens across the repeatable beats, round-robin from the
  // heaviest so the biggest beat absorbs the first repeat.
  const extra = wanted - template.length;
  const extraPerBeat = new Map(repeatables.map((b) => [b.beat, 0]));
  const order = [...repeatables].sort((a, b) => b.weight - a.weight);
  for (let i = 0; i < extra; i++) {
    const beat = order[i % order.length].beat;
    extraPerBeat.set(beat, extraPerBeat.get(beat) + 1);
  }

  return template.flatMap((beat) => {
    const copies = 1 + (extraPerBeat.get(beat.beat) || 0);
    if (copies === 1) return [beat];
    return Array.from({ length: copies }, () => ({ ...beat, weight: beat.weight / copies }));
  });
}

// ── numbers ──────────────────────────────────────────────────────────
// A video may only show numbers the source contains. Digits are compared
// with separators stripped, so "1.000.000" matches "1000000".
export function numbersIn(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/\d[\d.,]*/g)) {
    const digits = m[0].replace(/[^\d]/g, '');
    if (digits) out.add(digits.replace(/^0+(?=\d)/, ''));
  }
  return out;
}

export const numOf = (v) => String(v ?? '').replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');

// ── intent from signals (no model) ───────────────────────────────────
// Deterministic, so the pipeline still classifies when GuRouter is down —
// and so the classifier can be tested without a network.
export function intentFromSignals(job = {}, text = '') {
  const title = String(job.title || '');
  const body = String(text || '');
  const brand = job.project?.brand || {};
  const hasSite = !!(job.source_url || job.project?.website_url);
  const hasAddress = !!String(job.project?.address || '').trim();

  if (job.kind === 'website' || job.source_url) return { intent: 'product_demo', reason: 'renders a live URL' };
  if (job.kind === 'business' && (hasAddress || brand.business_type)) {
    return { intent: 'local_business', reason: 'brand kit carries a place' };
  }
  // "5 bước", "7 lý do", "3 cách" — a list is the story.
  if (/\b\d+\s*(bước|lý do|cách|mẹo|điều|sai lầm|kiểu)\b/i.test(title)) {
    return { intent: 'listicle', reason: 'title promises a counted list' };
  }
  if (/\b(ra mắt|mới|giới thiệu|chính thức|vừa cập nhật)\b/i.test(title)) {
    return { intent: 'announcement', reason: 'title announces something new' };
  }
  if (/\b(khách hàng|đánh giá|nhận xét|chia sẻ của)\b/i.test(title)) {
    return { intent: 'testimonial', reason: 'title is about a customer voice' };
  }
  if (/\b(trước|sau|thay đổi|cải thiện)\b/i.test(title) && /\b\d/.test(body)) {
    return { intent: 'before_after', reason: 'title contrasts before and after' };
  }
  // How-to with quantities is a lesson; a lesson is where charts belong.
  if (/\b(cách|hướng dẫn|làm sao|tại sao|vì sao)\b/i.test(title) || numbersIn(body).size >= 3) {
    return { intent: 'educational', reason: 'explains something, with numbers' };
  }
  if (hasSite) return { intent: 'product_demo', reason: 'has a site to show' };
  return { intent: 'educational', reason: 'default: explain the source' };
}

// ── validation ───────────────────────────────────────────────────────
const isGraphic = (t) => GRAPHIC_TYPES.includes(t);

// Words with nothing meaningful to look at. CSS cards alone do not count as
// media; feature/rating/answer/photo/location cards have real drawn structure,
// while an assetless product reveal, demo, or comparison is only prose.
function isTextOnly(scene, { hasLogo = false } = {}) {
  if (isGraphic(scene.type)) return false;
  if (['feature', 'rating', 'answer', 'anchor', 'photo', 'location'].includes(scene.type)) return false;
  if (scene.type === 'result' && scene.value !== undefined && scene.value !== null && scene.value !== '') return false;
  if (scene.type === 'product_reveal') return !scene.asset && !hasLogo;
  if (ASSET_RENDER_TYPES.has(scene.type)) return !scene.asset;
  return true;
}

// Intents whose whole point is to show something real. A storyboard for one
// of these that uses no asset is a slide deck no matter how it is styled.
const NEEDS_ASSETS = new Set([
  'product_demo', 'product_promotion', 'local_business', 'before_after', 'announcement',
]);

// Whether a screen has something to look at. This is the per-screen version of
// the "illustrated everywhere" promise, and it is deliberately stricter than
// `isTextOnly`: a card that draws its own structure — a chart, a numbered
// list, a row of icons, a comparison — illustrates its point, while a caption
// floating on a gradient does not, no matter how well the caption is written.
export function isIllustrated(scene, { hasLogo = false, assets = null } = {}) {
  // The asset the scene points at has to be one the collector actually holds:
  // a scene that names a file nobody downloaded renders as an empty frame,
  // which is the bare screen this check exists to catch.
  const held = scene.asset && ASSET_RENDER_TYPES.has(scene.type)
    && (assets === null || ownsAsset(assets, scene.asset));
  if (held) return true;
  if (isGraphic(scene.type)) {
    if (['bars', 'line'].includes(scene.type)) return Array.isArray(scene.items) && scene.items.length >= 2;
    if (['steps', 'icons', 'timeline', 'keypoints'].includes(scene.type)) return Array.isArray(scene.items) && scene.items.length >= 2;
    if (scene.type === 'compare') return !!scene.left && !!scene.right;
    return true; // stat, donut, question, answer
  }
  if (['feature', 'rating', 'answer', 'anchor', 'photo', 'location'].includes(scene.type)) return true;
  // A quote over a full-bleed photo is an illustrated screen; the same words on
  // the gradient are a caption. The renderer draws the photo when the asset is
  // there, so the gate asks the same question.
  if (scene.type === 'quote') return !!scene.asset;
  // A result card illustrates itself when it carries a number, and equally when
  // it carries rows — a repeated beat with no number left draws the source's
  // own points instead of a lone caption.
  if (scene.type === 'result') {
    if (scene.value !== undefined && scene.value !== null && scene.value !== '') return true;
    return Array.isArray(scene.items) && scene.items.length >= 2;
  }
  if (scene.type === 'product_reveal') return !!scene.asset || hasLogo;
  return false;
}

// Clean a scene's rows for the type it is about to be drawn as, or return null
// when the rows cannot support that type at all. Every chart's rows have to be
// numbers the source really contains, and every list needs enough rows to be a
// list — a card with nothing to draw is the bare screen this module refuses.
//
// It is a function rather than inline code because a scene can change type
// twice: once here, and again when a repeated beat is re-cast into a different
// shape. Re-running it is what stops a `stat` that became a `bars` from
// rendering as an empty chart.
function shapeItems(raw, type, have, dropped, index) {
  if (type === 'bars' || type === 'line') {
    const items = (Array.isArray(raw.items) ? raw.items : []).filter((i) => have.has(numOf(i?.value)));
    if (items.length < 2) { dropped.push({ index, type, reason: 'too_few_verified_numbers' }); return null; }
    return items;
  }
  // A keypoints card with one row is a sentence wearing a number.
  if (type === 'keypoints') {
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .map((i) => ({ ...i, label: clampText(i?.label) }))
      .filter((i) => i.label)
      .slice(0, 4);
    if (items.length < 2) { dropped.push({ index, type, reason: 'too_few_items' }); return null; }
    return items;
  }
  if (['steps', 'icons', 'timeline'].includes(type)) {
    // A scene re-cast from a card that kept no `items` still has its own rows
    // somewhere — a comparison holds them under left/right. Flattening both
    // sides is what lets a comparison become a list instead of being dropped
    // for having no rows of its own.
    const fromSides = [
      ...(Array.isArray(raw.left?.items) ? raw.left.items : []),
      ...(Array.isArray(raw.right?.items) ? raw.right.items : []),
    ].map((item) => ({ label: typeof item === 'string' ? item : item?.label }));
    const source = Array.isArray(raw.items) && raw.items.length ? raw.items : fromSides;
    const items = source
      .map((i) => ({
        ...i,
        label: clampText(i?.label || i?.text || i?.detail, 6),
        ...(type === 'steps' ? { detail: clampText(i?.detail, 10) } : {}),
        ...(type === 'timeline' ? { text: clampText(i?.text || i?.detail, 10) } : {}),
      }))
      .filter((i) => i.label)
      .slice(0, 6);
    if (!items.length) { dropped.push({ index, type, reason: `${type}_needs_items` }); return null; }
    return items;
  }
  // A result card illustrates itself with rows when the beat repeats and the
  // article carries no number to put on it.
  if (type === 'result' && (raw.value === undefined || raw.value === null || raw.value === '')) {
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .map((i) => ({ label: clampText(i?.label || i?.text, 8) }))
      .filter((i) => i.label)
      .slice(0, 4);
    return items.length >= 2 ? items : [];
  }
  if (type === 'compare') {
    const cleanSide = (side) => (Array.isArray(side?.items) ? side.items : [])
      .map((item) => clampText(typeof item === 'string' ? item : item?.label || item?.text, 8))
      .filter(Boolean);
    const items = {
      left: { ...(raw.left || {}), items: cleanSide(raw.left) },
      right: { ...(raw.right || {}), items: cleanSide(raw.right) },
    };
    if (!items.left.items.length || !items.right.items.length) {
      dropped.push({ index, type, reason: 'compare_needs_both_sides' });
      return null;
    }
    return items;
  }
  if (type === 'donut' && !have.has(numOf(raw.value))) {
    dropped.push({ index, type, reason: 'number_not_in_source' });
    return null;
  }
  return raw.items;
}

// The single gate every storyboard passes through. Returns a storyboard that
// is safe to draw plus a report of what was changed — a drop is never silent.
export function sanitizeStoryboard(sb, { source = '', intent = 'educational', target = DURATION.default, assets = {}, presenterName = '' } = {}) {
  const dropped = [];
  const template = BEATS[intent] || BEATS.educational;
  const allowed = new Set(template.flatMap((b) => b.types));
  const have = numbersIn(source);
  const slots = beatSlots(intent, target);
  const rawScenes = Array.isArray(sb?.scenes) ? sb.scenes : [];
  const sourceSayDetails = [...new Set(String(source || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => wordCount(sentence) >= 2))];
  const kept = [];
  for (const [index, raw] of rawScenes.entries()) {
    let type = raw?.type;
    if (!SCENE_TYPES.includes(type)) { dropped.push({ index, type: String(type), reason: 'unknown_type' }); continue; }
    if (!allowed.has(type)) { dropped.push({ index, type, reason: `not_in_${intent}` }); continue; }

    // A news anchor with nobody to show is just a headline. Degrade the type
    // and keep the scene — but record the swap, a rewrite is never silent.
    if (type === 'anchor' && !ownsAsset(assets, 'presenter')) {
      dropped.push({ index, type: 'anchor', reason: 'no_presenter' });
      type = 'headline';
    }
    const hasDistinctBeforeAfter = ownsAsset(assets, raw.asset) && ownsAsset(assets, raw.asset2)
      && raw.asset !== raw.asset2 && assets[raw.asset] !== assets[raw.asset2];
    if (type === 'before_after' && !hasDistinctBeforeAfter) {
      // A one-sided comparison looks like a real transformation when both
      // panels show the same image. Degrade to the single-asset UI beat.
      dropped.push({ index, type, reason: 'before_after_needs_distinct_assets' });
      type = 'ui_demo';
    }

    const text = clampText(raw.text);
    if (!text) { dropped.push({ index, type, reason: 'no_text' }); continue; }

    // A scene may only show a number the source contains.
    if (type === 'stat' && !have.has(numOf(raw.value))) {
      dropped.push({ index, type, reason: 'number_not_in_source' });
      continue;
    }
    let items = shapeItems(raw, type, have, dropped, index);
    if (items === null) continue;

    // An asset the collector does not have is worse than no asset: it renders
    // as a broken frame. Drop the reference, keep the scene.
    const asset = raw.asset && ownsAsset(assets, raw.asset) ? raw.asset : null;
    const asset2 = raw.asset2 && ownsAsset(assets, raw.asset2) ? raw.asset2 : null;
    if (raw.asset && !asset) dropped.push({ index, type, reason: 'asset_missing', asset: raw.asset });
    if (raw.asset2 && !asset2) dropped.push({ index, type, reason: 'asset2_missing', asset: raw.asset2 });

    // A model can forget `say`; never let that silently reduce a 60s
    // article to the eight-word on-screen caption. Source sentences are
    // assigned after every validation/deduplication step below, so rejected
    // scenes cannot consume a detail needed by a surviving scene.
    const modelSay = String(raw.say ?? '').trim();
    const sourceSayAssigned = raw.__sourceSayAssigned === true;
    const needsSourceSay = type !== 'cta' && !sourceSayAssigned && wordCount(modelSay) < 5;
    const fallbackSay = text;

    kept.push({
      ...raw, type, text, asset, asset2, items,
      // The anchor's name is the project's, not the model's — a model never
      // saw presenter_name, so whatever it writes here would be invented.
      name: type === 'anchor' && presenterName ? presenterName : raw.name,
      say: clampWords(modelSay && wordCount(modelSay) >= 5 ? modelSay : fallbackSay, 0),
      __needsSourceSay: needsSourceSay,
      __index: index,
      // The deterministic board labels every scene with the beat it answers.
      // Carrying that through is what lets a repeated beat here find its own
      // vocabulary instead of borrowing a neighbour's.
      __beat: raw.__beat,
    });
  }

  // Claim a beat for every scene as it survives, in order. Doing this now —
  // rather than after de-duplication, as the old code did — is what lets a
  // repeated beat know which alternative types it is still allowed to use.
  //
  // A scene that names its beat takes that beat, because the model answered
  // the expanded outline in order. A scene that does not — every scene the
  // model wrote itself — is matched on the type it chose, so a `stat` lands on
  // a beat whose vocabulary contains `stat` rather than on the next free beat.
  const claim = new Set();
  const claimSlot = (scene) => {
    const named = scene.__beat
      ? slots.findIndex((b, index) => !claim.has(index) && b.beat === scene.__beat)
      : -1;
    if (named >= 0) { claim.add(named); return named; }
    const byType = slots.findIndex((b, index) => !claim.has(index) && b.types?.includes(scene.type));
    const at = byType >= 0 ? byType : slots.findIndex((_, index) => !claim.has(index));
    if (at >= 0) claim.add(at);
    return at >= 0 ? at : Math.max(0, slots.length - 1);
  };
  for (const scene of kept) scene.__slot = claimSlot(scene);

  // No two consecutive scenes of the same type: the third "big number" in a
  // row is where a video starts to feel like a deck.
  //
  // A repeat is usually not a mistake but a consequence of a long article
  // getting more screens: the same beat is told to cover a second point. So a
  // repeat is first re-cast into a different type its own beat allows, and
  // only dropped when that beat has no second shape to offer. Dropping first
  // is what used to make every extra screen vanish.
  //
  // The same reasoning applies one step later: a beat that repeats can only
  // keep its prose shape for as many screens as it has drawn alternatives. A
  // quote alternating with a chart is still half a deck, and on a twelve-screen
  // video the deck is the thing being bought.
  const varied = [];
  for (const scene of kept) {
    const alternatives = DRAWN_ALTERNATIVES.filter((t) => (slots[scene.__slot]?.types || []).includes(t)
      && t !== scene.type);
    const proseSoFar = varied.filter((s) => s.__beat === scene.__beat && s.type === 'quote').length;
    const copiesSoFar = varied.filter((s) => s.__beat === scene.__beat).length + 1;
    const proseCapped = scene.type === 'quote' && alternatives.length
      && copiesSoFar > 1
      && proseSoFar >= Math.max(1, Math.ceil(copiesSoFar * MAX_QUOTE_SHARE));
    if (proseCapped) {
      const alt = alternatives.find((t) => t !== varied.at(-1)?.type
        && (!ASSET_RENDER_TYPES.has(t) || Boolean(scene.asset && ownsAsset(assets, scene.asset))));
      if (alt) {
        const reshaped = shapeItems(scene, alt, have, dropped, scene.__index);
        if (reshaped !== null) {
          dropped.push({ index: scene.__index, type: 'quote', reason: 'recast_to_illustrate', as: alt });
          varied.push({ ...scene, type: alt, items: reshaped });
          continue;
        }
      }
    }
    if (!varied.length || varied.at(-1).type !== scene.type) {
      varied.push(scene);
      continue;
    }
    const allowed = slots[scene.__slot]?.types || [];
    // A type the beat allows is not a type the job can draw. Swapping a drawn
    // card for `ui_demo` when no screenshot exists leaves an empty device
    // frame, so an asset-dependent type is only chosen when the scene already
    // carries an asset the collector holds.
    const drawable = (t) => (ASSET_RENDER_TYPES.has(t)
      ? Boolean(scene.asset && ownsAsset(assets, scene.asset))
      : true);
    const swap = DRAWN_ALTERNATIVES.find((t) => allowed.includes(t)
      && t !== scene.type && t !== varied.at(-1).type && drawable(t));
    const alt = swap
      || allowed.find((t) => t !== scene.type && t !== varied.at(-1).type && drawable(t));
    if (alt) {
      dropped.push({ index: scene.__index, type: scene.type, reason: 'repeated_as_alternative', as: alt });
      // The new type has to be able to draw what the old one was drawing. A
      // chart swapped for another chart keeps its rows; a card swapped for a
      // caption drops them, because carrying rows into a type that never
      // renders them would claim an illustration the screen does not have.
      const reshaped = shapeItems(scene, alt, have, dropped, scene.__index);
      if (reshaped === null) continue;
      varied.push({ ...scene, type: alt, items: reshaped });
      continue;
    }
    dropped.push({ index: scene.__index, type: scene.type, reason: 'repeat_of_previous' });
  }

  // A board is not thrown away over a couple of plain screens. The quality
  // gate fails the WHOLE video when too much of it is words, and its first
  // response to that is to fall back to the deterministic board — so a model
  // that wrote 14 good scenes and left two of them bare lost all fourteen.
  // A bare scene is repairable: the source almost always has points the scene
  // never claimed. Give it a drawn shape, and only when the model left nothing
  // to draw does the gate still see a bare screen and still fail.
  // Only the middle of the board is repairable. The first and last screens are
  // the hook and the call to action, and the gate checks both by position —
  // swapping either for a chart does not make the video better, it makes it
  // fail `does_not_open_on_a_hook`.
  const repaired = varied.map((scene, index) => {
    if (index === 0 || index === varied.length - 1) return scene;
    if (isIllustrated(scene, { assets: null })) return scene;
    // The swap stays inside the beat's own vocabulary whenever the beat has a
    // drawn shape. Taking the scene out of its beat is how a repair meant to
    // save a board destroys it: a bare `quote` turned into an icon grid left
    // `conclusion` (which may only be a quote or a result) with nothing, and
    // the gate then threw away all fourteen scenes over the one it had just
    // tried to fix.
    const ownBeat = template.find((b) => b.types.includes(scene.type));
    const withinBeat = ownBeat
      ? DRAWN_ALTERNATIVES.find((t) => ownBeat.types.includes(t) && t !== scene.type)
      : null;
    const anywhere = DRAWN_ALTERNATIVES.find((t) => allowed.has(t)
      && t !== scene.type && !ASSET_RENDER_TYPES.has(t));
    const swap = withinBeat || anywhere;
    if (!swap) return scene;
    const points = sourceSayDetails.slice(0, 4).map((sentence) => ({ label: clampText(sentence, 12) }));
    if (points.length < 2) return scene;
    // An empty array is truthy, so a reshaper returning nothing usable used to
    // pass this `||` and leave the screen with no rows at all — and a result
    // with no value and no rows is exactly the caption the repair replaced.
    const shaped = shapeItems(scene, swap, have, dropped, scene.__index);
    const items = Array.isArray(shaped) && shaped.length ? shaped : points;
    dropped.push({ index: scene.__index, type: scene.type, reason: 'bare_screen_given_points', as: swap });
    return { ...scene, type: swap, items };
  });

  const scenes = repaired.slice(0, MAX_SCENES);
  if (repaired.length > MAX_SCENES) {
    dropped.push({ index: MAX_SCENES, type: '(rest)', reason: 'over_max_scenes', lost: repaired.length - MAX_SCENES });
  }

  // Duration: the caller/template owns the target. Honour each scene's
  // relative slot, then rescale to that target so a model cannot silently
  // turn a 60s template into a 90s render.
  const wanted = scenes.map((s) => {
    const asked = Number(s.duration);
    if (Number.isFinite(asked) && asked > 0) return asked;
    return slots[s.__slot]?.duration ?? 0;
  });
  const wantedTotal = wanted.reduce((a, b) => a + b, 0) || 1;
  const finalTotal = clampDuration(target);
  const minSceneUnits = 15; // 1.5s minimum, represented in tenths
  const totalUnits = Math.max(Math.round(finalTotal * 10), minSceneUnits * scenes.length);
  let remainingUnits = totalUnits;
  scenes.forEach((s, i) => {
    const scenesLeft = scenes.length - i;
    const desiredUnits = Math.round((wanted[i] / wantedTotal) * totalUnits);
    const maxUnits = remainingUnits - minSceneUnits * (scenesLeft - 1);
    const units = i === scenes.length - 1
      ? remainingUnits
      : Math.max(minSceneUnits, Math.min(maxUnits, desiredUnits));
    s.duration = units / 10;
    remainingUnits -= units;
    // Narration is written to fit its slot, not the other way round. Keep
    // the tail for the closing CTA and the final source beat so shortening
    // cannot remove the action or conclusion before fitNarration runs.
    const sayBudget = narrationBudget(s.duration);
    const sayWords = words(s.say);
    s.say = (s.type === 'cta' || i === scenes.length - 2) && sayWords.length > sayBudget
      ? sayWords.slice(-sayBudget).join(' ')
      : clampWords(s.say, sayBudget);
  });

  const missingSourceSay = scenes.filter((scene) => scene.__needsSourceSay);
  if (missingSourceSay.length && sourceSayDetails.length) {
    // Partition after duration normalization. Short model omissions use
    // bounded head+tail source excerpts; final body scene keeps article tail.
    const sourceGroups = missingSourceSay.map((_, i) => {
      if (missingSourceSay.length === 1) return sourceSayDetails;
      const start = Math.floor(i * sourceSayDetails.length / missingSourceSay.length);
      const end = Math.floor((i + 1) * sourceSayDetails.length / missingSourceSay.length);
      return end > start ? sourceSayDetails.slice(start, end) : [];
    });
    const fitSourceSay = (value, max) => {
      const parts = words(value);
      if (parts.length <= max) return String(value || '');
      const budget = Math.max(1, max);
      const head = Math.max(1, Math.ceil((budget - 1) * 0.6));
      const tail = Math.max(0, budget - 1 - head);
      return [...parts.slice(0, head), ...(tail ? ['…'] : []), ...(tail ? parts.slice(-tail) : [])].join(' ');
    };
    missingSourceSay.forEach((scene, i) => {
      if (sourceGroups[i].length) {
        scene.say = fitSourceSay(sourceGroups[i].join(' '), narrationBudget(scene.duration));
      }
    });
  }
  for (const scene of scenes) {
    delete scene.__sourceSayAssigned;
    delete scene.__needsSourceSay;
    delete scene.__slot;
    delete scene.__index;
    delete scene.__beat;
  }

  return {
    storyboard: { intent, duration: finalTotal, scenes },
    dropped,
  };
}

// Cut narration to a word budget without leaving a dangling clause.
export function clampWords(s, max) {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ');
  if (!max) return t;
  const w = words(t);
  if (w.length <= max) return t;
  return w.slice(0, max).join(' ').replace(/[,;:]$/u, '') + '…';
}

// ── caption / voice alignment ────────────────────────────────────────
// The caption on screen and the line in the voice are the same claim, and the
// pipeline has three ways to let them drift: the deterministic board writes a
// placeholder label ("Vấn đề khách hàng gặp") and then narrates a real source
// sentence, and `fitNarration` shortens the narration after the caption was
// written. Either way the viewer reads words the speaker never says.
//
// The repair is deliberately narrow. A caption that reuses the narration's
// own words is left exactly as the model wrote it — the punchy hook survives.
// Only a caption with almost nothing in common with what is actually being
// said is replaced, and then by the opening of the line being said.
const CAPTION_STOPWORDS = new Set([
  'của', 'các', 'cho', 'với', 'và', 'là', 'một', 'những', 'người', 'không',
  'được', 'trong', 'này', 'đó', 'để', 'khi', 'đã', 'rất', 'cũng', 'tại', 'theo', 'như',
  'the', 'and', 'for', 'with', 'that', 'this', 'your', 'you', 'are', 'was', 'not',
].map(normalizeForMatch));

// Case, diacritics and punctuation off, so "Google Maps" and "google maps"
// are the same evidence.
function normalizeForMatch(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function captionTokens(s) {
  return normalizeForMatch(s).split(' ').filter((w) => w.length >= 3 && !CAPTION_STOPWORDS.has(w));
}

// The caption a scene deserves when the one it has is not what is said:
// the first clause of the line, cut to a caption's length.
export function captionFromSay(say, max = MAX_TEXT_WORDS) {
  const first = String(say || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/)[0] || '';
  return clampText(first || String(say || ''), max);
}

// How many of the caption's own words the narration says out loud. A model
// caption is kept when at least this many match — two for anything longer than
// a single word, all of them when the caption is one word.
export function captionGroundedIn(text, say) {
  const spokenNumbers = numbersIn(say);
  if ([...numbersIn(text)].some((number) => !spokenNumbers.has(number))) return false;
  const tokens = [...new Set(captionTokens(text))];
  if (!tokens.length) return true;
  const said = new Set(normalizeForMatch(say).split(' '));
  const hit = tokens.filter((w) => said.has(w)).length;
  return hit >= Math.min(2, tokens.length);
}

// Rewrites the captions that the voice does not back up. Returns the number
// changed so the run can say so in its log instead of fixing it silently.
export function alignCaptions(sb) {
  let changed = 0;
  for (const scene of sb?.scenes || []) {
    const say = String(scene.say || '').trim();
    if (!say) continue;
    if (captionGroundedIn(scene.text, say)) continue;
    const next = captionFromSay(say);
    // An empty derivation would leave the screen with no words at all, which
    // is worse than the mismatch it replaces.
    if (!next) continue;
    scene.text = next;
    changed++;
  }
  return changed;
}

// ── quality gate ─────────────────────────────────────────────────────
// The check the spec asks for, made mechanical: if most of the storyboard is
// words with nothing to look at, it is a slideshow and must not ship.
export function reviewStoryboard(sb, { hasLogo = false, assets = null } = {}) {
  const scenes = sb?.scenes || [];
  const problems = [];
  if (!scenes.length) return { ok: false, problems: ['empty'] };

  if (scenes.length < MIN_SCENES) problems.push(`too_few_scenes:${scenes.length}`);
  const hasPresenter = assets === null ? scenes.some((scene) => scene.type === 'anchor') : ownsAsset(assets, 'presenter');
  const beatTemplate = requiredStoryBeats(sb?.intent, { hasPresenter });
  const claimed = new Set();
  const claimFor = (beat, forwardOnly) => {
    // A scene that names its beat is matched on it; a model scene, which has
    // no beat of its own, is matched on its type.
    const free = (scene, index) => !claimed.has(index) && (!forwardOnly || index >= cursor);
    const named = scenes.findIndex((scene, index) => free(scene, index) && scene.__beat === beat.beat);
    if (named >= 0) return named;
    return scenes.findIndex((scene, index) => free(scene, index) && beat.types?.includes(scene.type));
  };
  let cursor = 0;
  // First pass, in story order: the narrative order of the beats is what the
  // viewer is actually watching, so this is how scenes are matched whenever
  // there is room to.
  const unmet = [];
  for (const beat of beatTemplate) {
    const foundAt = claimFor(beat, true);
    if (foundAt < 0) unmet.push(beat);
    else { cursor = foundAt + 1; claimed.add(foundAt); }
  }
  // Second pass, anywhere on the board. Greedy first-fit alone reported
  // `missing_beat` for a board where every beat WAS on screen, because an
  // earlier beat whose vocabulary is wide enough (`insight` accepts a result)
  // claimed the one scene a later beat had. A false miss is not a small thing:
  // the caller answers it by throwing the whole storyboard away.
  for (const beat of unmet) {
    const foundAt = claimFor(beat, false);
    if (foundAt >= 0) claimed.add(foundAt);
    else problems.push(`missing_beat:${beat.beat}`);
  }
  // A news piece opens on the headline, not a curiosity hook — both count.
  if (!['hook', 'headline'].includes(scenes[0]?.type)) problems.push('does_not_open_on_a_hook');
  if (scenes.at(-1)?.type !== 'cta') problems.push('does_not_end_on_a_cta');

  const dur = scenes.reduce((a, s) => a + (Number(s.duration) || 0), 0);
  if (dur < DURATION.min - 0.5 || dur > DURATION.max + 0.5) problems.push(`duration_out_of_range:${dur.toFixed(1)}`);

  // A hook and a closing CTA are supposed to be words — that is the shape of
  // a social video, not a defect. So the slideshow test looks at the middle:
  // if most of the body has nothing to look at, there is no video here.
  const middle = scenes.slice(1, -1);
  const textOnly = middle.filter((scene) => isTextOnly(scene, { hasLogo })).length;
  const hasMiddleVisual = middle.some((scene) => !isTextOnly(scene, { hasLogo }));
  if (middle.length && textOnly * 2 > middle.length && !hasMiddleVisual) {
    problems.push(`slideshow:${textOnly}_of_${middle.length}_body_scenes_are_text_only`);
  }

  // "An illustration on every screen" is a stricter claim than the slideshow
  // test, so it is measured separately. A screen counts as illustrated when it
  // shows a real asset or draws a chart of its own; the closing CTA is exempt
  // because a call to action is words over a logo by design, and so is the
  // opener, which exists to be read.
  const bare = scenes.slice(1, -1).filter((scene) => !isIllustrated(scene, { hasLogo, assets })).length;
  if (bare * 5 > Math.max(1, scenes.length - 2)) {
    problems.push(`bare_screens:${bare}_of_${scenes.length - 2}_have_no_illustration`);
  }
  const hasRenderedAsset = scenes.some((s) => s.asset && ASSET_RENDER_TYPES.has(s.type)
    && (assets === null || ownsAsset(assets, s.asset)));
  if (NEEDS_ASSETS.has(sb?.intent) && !hasRenderedAsset && !hasLogo) {
    problems.push(`no_real_asset:${sb.intent}_is_about_showing_something`);
  }

  const distinct = new Set(scenes.map((s) => s.type)).size;
  if (scenes.length >= 5 && distinct < 4) problems.push(`too_repetitive:${distinct}_types`);

  for (const [i, s] of scenes.entries()) {
    if (wordCount(s.text) > MAX_TEXT_WORDS) problems.push(`text_too_long:${i}`);
    if (wordCount(s.say) > narrationBudget(s.duration)) problems.push(`narration_too_long:${i}`);
  }
  return { ok: problems.length === 0, problems };
}

// Beats that every intent must cover, in order. Alternatives stay grouped so
// a valid product screenshot can satisfy either product/demo beat without
// requiring a made-up scene type.
export function requiredStoryBeats(intent, { hasPresenter = true } = {}) {
  return (BEATS[intent] || BEATS.educational)
    .filter((b) => !['hook', 'cta'].includes(b.beat))
    .filter((b) => b.beat !== 'anchor_intro' || hasPresenter)
    .map(({ beat, types }) => ({ beat, types }));
}

// Beats that allow exactly one scene type are the intent's signature: a
// summary without keypoints, a bulletin without a headline, a Q&A without
// a question is just a generic video wearing the template's name. Hook and
// CTA close every story, so they are not signatures.
export function signatureTypes(intent) {
  return [...new Set((BEATS[intent] || [])
    .filter((b) => b.types.length === 1 && !['hook', 'cta'].includes(b.types[0]))
    .map((b) => b.types[0]))];
}

// Build the card a repeated screen becomes, or return null when this type has
// nothing real to draw. Null matters: the caller walks its candidate list, and
// a chart the source has no numbers for has to be skipped rather than rendered
// as an empty frame.
function buildRepeatCard(type, { text, nums, kpItems, narrativeItems, detailItems, siteAsset, photoAsset, presenter, pName }) {
  switch (type) {
    // A device frame with nothing in it is an empty screen, so a `ui_demo` is
    // only offered when there is actually a screenshot to put in the frame.
    case 'ui_demo': return siteAsset ? { type, text, asset: siteAsset } : null;
    case 'product_reveal': return { type, text };
    case 'photo': return photoAsset ? { type, text, asset: photoAsset } : null;
    case 'feature': return { type, text, icon: 'check' };
    // A quote or a problem card reads as a caption unless something is behind
    // it, so both are offered only when the job carries a photo to show.
    case 'quote': return photoAsset ? { type, text, asset: photoAsset } : null;
    case 'problem': return photoAsset ? { type, text, asset: photoAsset } : null;
    case 'headline': return { type, text };
    case 'question': return { type, text };
    case 'answer': return { type, text };
    case 'anchor': return presenter ? { type, text, asset: 'presenter', name: pName } : { type: 'headline', text };
    case 'keypoints': {
      const rows = kpItems.length >= 2 ? kpItems : narrativeItems;
      return rows.length >= 2 ? { type, text, items: rows.slice(0, 4) } : null;
    }
    case 'steps': {
      // A numbered list needs three rows to read as a list, so it reaches for
      // the source's own sentences rather than the summary's three highlights.
      const rows = detailItems.length >= 3 ? detailItems : (narrativeItems.length >= 3 ? narrativeItems : detailItems);
      return rows.length >= 2 ? { type, text, items: rows.slice(0, 4) } : null;
    }
    case 'icons': {
      const rows = detailItems.length >= 2 ? detailItems : narrativeItems;
      return rows.length ? {
        type, text,
        items: rows.slice(0, 4).map((h, k) => ({ icon: ['check', 'trend', 'shield', 'star'][k % 4], label: h.label })),
      } : null;
    }
    case 'timeline': {
      const rows = detailItems.length >= 2 ? detailItems : narrativeItems;
      return rows.length ? { type, text, items: rows.slice(0, 5).map((h) => ({ label: h.label })) } : null;
    }
    case 'compare': {
      // A comparison needs two sides of at least two rows each. The source's
      // own sentences are split in half rather than inventing a "before" and
      // an "after" that were never in it.
      const rows = detailItems.length >= 4 ? detailItems : narrativeItems;
      if (rows.length < 4) return null;
      return {
        type, text,
        left: { title: 'Vấn đề', items: rows.slice(0, 2).map((h) => h.label) },
        right: { title: 'Cách giải quyết', items: rows.slice(2, 4).map((h) => h.label) },
      };
    }
    // A chart cannot be invented out of a sentence: its rows have to be numbers
    // the source really contains, or the gate refuses the scene and the beat it
    // belonged to goes with it.
    case 'bars': case 'line': return nums.length >= 2
      ? { type, text, items: nums.slice(0, 4).map((n, k) => ({ label: `Mục ${k + 1}`, value: n })) }
      : null;
    case 'stat': case 'donut': return nums.length ? { type, text, value: nums[0] } : null;
    // A bare result with no number is a caption, not a card. The source's own
    // sentences turn it into a list that illustrates itself.
    case 'result': return nums.length
      ? { type, text, value: nums.at(-1) }
      : (detailItems.length >= 2 ? { type, text, items: detailItems.slice(0, 4) } : null);
    case 'rating': return { type, text, value: '5' };
    case 'before_after': return photoAsset ? { type, text, asset: photoAsset } : null;
    default: return null;
  }
}

// ── deterministic fallback ───────────────────────────────────────────
// GuRouter can be down. The storyboard still has to exist, and it still has
// to be a story — so this walks the intent's beats and fills each one from
// what the job actually carries.
export function storyboardFromContent(job = {}, intent = 'educational', assets = {}, target = DURATION.default) {
  const durationTarget = clampDuration(target ?? DURATION.default);
  assets = assets && typeof assets === 'object' ? assets : {};
  const p = job.project || {};
  const brand = p.brand || {};
  const title = String(job.title || p.name || '').trim();
  const body = String(job.body_markdown || p.description || '');
  const nums = [...numbersIn(body)];
  const url = String(p.publishing_url || p.website_url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const siteAssets = Object.keys(assets).filter((k) => k.startsWith('site:') && ownsAsset(assets, k));
  const siteAsset = siteAssets[0] || null;
  const photoAssets = Object.keys(assets).filter((k) => (k.startsWith('photo:') || k === 'hero') && ownsAsset(assets, k));
  const photoAsset = photoAssets[0] || null;
  const secondPhotoAsset = photoAssets.find((k) => k !== photoAsset && assets[k] !== assets[photoAsset]) || null;
  const secondSiteAsset = siteAssets.find((k) => k !== siteAsset && assets[k] !== assets[siteAsset]) || null;
  const comparisonFirstAsset = photoAsset || siteAsset;
  const comparisonSecondAsset = photoAsset
    ? (secondPhotoAsset || (siteAsset && siteAsset !== photoAsset && assets[siteAsset] !== assets[photoAsset] ? siteAsset : secondSiteAsset))
    : (secondPhotoAsset || (secondSiteAsset && secondSiteAsset !== siteAsset ? secondSiteAsset : null));
  const hasDistinctComparison = comparisonFirstAsset && comparisonSecondAsset
    && comparisonFirstAsset !== comparisonSecondAsset
    && assets[comparisonFirstAsset] !== assets[comparisonSecondAsset];
  const mapAsset = ownsAsset(assets, 'map') ? 'map' : null;
  const pName = String(job.project?.presenter_name || '').trim();
  // Bỏ markdown trước khi chia câu để fallback không đọc văn bản thô. Giữ
  // cả câu hỏi lẫn câu kết; bộ chi tiết bên dưới bỏ câu hỏi vì đó không phải
  // một ý chính cần kể.
  const sentences = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => wordCount(s) >= 2);
  const sourceDetails = [...new Set(sentences.filter((s) => !s.includes('?')))];
  // The summary's list: highlights first, the body's own sentences when the
  // job carries no highlight list.
  const highlightItems = (Array.isArray(job.highlights) ? job.highlights : []).slice(0, 3).map((h) => ({ label: clampText(h, 6) })).filter((i) => i.label);
  const bodyItems = sourceDetails.slice(0, 3).map((s) => ({ label: clampText(s, 6) })).filter((i) => i.label);
  const kpItems = highlightItems.length >= 2 ? highlightItems : bodyItems;
  const narrativeItems = kpItems.length ? kpItems : [
    { label: clampText(title, 6) || 'Nội dung chính' },
    { label: 'Bổ sung thông tin' },
  ];
  const summaryItems = kpItems.length >= 2 ? kpItems : [...narrativeItems, { label: 'Tổng quan' }].slice(0, 4);
  // A long article is told across a dozen screens, and a list card needs more
  // rows than the three the summary gets — so repeated beats draw from a wider
  // slice of the source's own sentences rather than repeating the same three.
  const detailItems = sourceDetails.slice(0, 8).map((s) => ({ label: clampText(s, 6) })).filter((i) => i.label);
  const bodyQuestion = sentences.find((s) => s.includes('?'));

  const fill = {
    hook: { type: 'hook', text: clampText(title), say: clampText(title) },
    problem: {
      type: 'problem',
      text: 'Vấn đề khách hàng gặp',
      say: `${clampText(title)} — vấn đề đặt ra.`,
      // A problem card is one of the few scenes that can carry a real image
      // behind its words, so it takes one whenever the job has it.
      asset: photoAsset,
    },
    // A caption over a gradient is a bare screen, and the quality gate refuses
    // a video built from them. With no photo to show, the beat draws the
    // source's own points instead of naming the business and stopping there.
    product: intent === 'local_business'
      ? (photoAsset
        ? { type: 'photo', text: clampText(p.name || title), asset: photoAsset }
        : { type: 'icons', text: 'Điểm nổi bật', items: (detailItems.length ? detailItems : narrativeItems).slice(0, 4).map((h, i) => ({ icon: ['check', 'trend', 'shield', 'star'][i % 4], label: h.label })) })
      : photoAsset
        ? { type: 'photo', text: clampText(p.name || title), asset: photoAsset, say: clampText(p.tagline || p.name || title) }
        : siteAsset
          ? { type: 'ui_demo', text: clampText(p.name || title), asset: siteAsset, say: clampText(p.tagline || p.name || title) }
          : { type: 'product_reveal', text: clampText(p.name || title), say: clampText(p.tagline || p.name || title) },
    business: photoAsset
      ? { type: 'photo', text: clampText(p.name || title), asset: photoAsset }
      : siteAsset
        ? { type: 'ui_demo', text: clampText(p.name || title), asset: siteAsset }
        : { type: 'icons', text: 'Quán này có gì', items: (detailItems.length ? detailItems : narrativeItems).slice(0, 4).map((h, i) => ({ icon: ['shop', 'cup', 'map', 'star'][i % 4], label: h.label })) },
    // A device frame with nothing in it is an empty screen, so a demo beat with
    // no screenshot becomes a list of the source's own points instead.
    demo: siteAsset
      ? { type: 'ui_demo', text: 'Xem thử', asset: siteAsset }
      : { type: 'steps', text: 'Các bước', items: (detailItems.length ? detailItems : narrativeItems).slice(0, 4) },
    feature: { type: photoAsset ? 'photo' : 'feature', text: clampText(p.tagline || title), asset: photoAsset },
    benefit: { type: 'icons', text: 'Lợi ích chính', items: narrativeItems.slice(0, 4).map((h, i) => ({ icon: ['check', 'trend', 'shield', 'star'][i % 4], label: h.label })) },
    insight: nums.length ? { type: 'stat', text: clampText(title), value: nums[0], say: clampText(title) } : { type: 'quote', text: clampText(title) },
    point: nums.length >= 2
      ? { type: 'bars', text: 'Con số đáng chú ý', items: nums.slice(0, 4).map((n, i) => ({ label: `Mục ${i + 1}`, value: n })) }
      : { type: 'steps', text: 'Các bước', items: narrativeItems.slice(0, 3).map((h) => ({ label: h.label })) },
    // A result card with neither a number nor rows is a caption on a gradient,
    // which the gate rightly calls a bare screen. The payoff draws the source's
    // own points when the article offers no figure to put on it.
    conclusion: {
      type: 'result',
      text: clampText(brand.cta || title),
      items: (detailItems.length ? detailItems : narrativeItems).slice(0, 4).map((h) => ({ label: h.label })),
    },
    items: { type: 'steps', text: 'Danh sách', items: narrativeItems.slice(0, 3).map((h) => ({ label: h.label })) },
    close: { type: 'quote', text: clampText(title) },
    // A result card with no number is a caption, so it draws the source's own
    // points instead of asking the viewer to read a claim.
    result: nums.length
      ? { type: 'stat', text: 'Kết quả', value: nums.at(-1) }
      : { type: 'result', text: clampText(title), items: (detailItems.length >= 2 ? detailItems : narrativeItems).slice(0, 4) },
    proof: intent === 'testimonial' && photoAsset
      ? { type: 'photo', text: clampText(p.name || title), asset: photoAsset }
      : nums.length
        ? { type: 'stat', text: 'Kết quả', value: nums.at(-1) }
        : { type: 'quote', text: clampText(title) },
    offer: { type: 'result', text: clampText(brand.cta || 'Đăng ký ngay') },
    why: { type: 'feature', text: clampText(p.tagline || title) },
    what: photoAsset
      ? { type: 'photo', text: clampText(p.name || title), asset: photoAsset }
      : siteAsset
        ? { type: 'ui_demo', text: clampText(p.name || title), asset: siteAsset }
        : { type: 'icons', text: 'Có gì mới', items: (detailItems.length ? detailItems : narrativeItems).slice(0, 4) },
    voice: {
      type: 'quote',
      text: clampText(sentences[0] || title, 10),
      // A quote draws full-bleed when it has an image, so the customer's own
      // photo is what keeps a repeated testimonial screen from being a caption.
      asset: photoAsset,
    },
    before: hasDistinctComparison
      ? { type: 'photo', text: 'Trước đây', asset: comparisonFirstAsset }
      : { type: 'problem', text: 'Trước đây' },
    after: hasDistinctComparison
      ? { type: 'photo', text: 'Sau khi dùng', asset: comparisonSecondAsset }
      : { type: 'result', text: 'Sau khi dùng' },
    change: hasDistinctComparison
      ? { type: 'before_after', text: 'Thay đổi', asset: comparisonFirstAsset, asset2: comparisonSecondAsset }
      : comparisonFirstAsset
        ? { type: 'ui_demo', text: 'Thay đổi', asset: comparisonFirstAsset }
        : { type: 'compare', text: 'Thay đổi', left: { title: 'Trước', items: narrativeItems.slice(0, 2).map((h) => h.label) }, right: { title: 'Sau', items: (detailItems.length ? detailItems : narrativeItems).slice(2, 4).map((h) => h.label) } },
    tension: { type: 'quote', text: clampText(sentences[1] || sentences[0] || title, 10), asset: photoAsset },
    transformation: siteAsset
      ? { type: 'ui_demo', text: clampText(p.name || title), asset: siteAsset }
      : { type: 'compare', text: 'Thay đổi', left: { title: 'Trước', items: narrativeItems.slice(0, 2).map((h) => h.label) }, right: { title: 'Sau', items: (detailItems.length ? detailItems : narrativeItems).slice(2, 4).map((h) => h.label) } },
    experience: intent === 'local_business'
      ? (siteAsset
        ? { type: 'ui_demo', text: 'Trải nghiệm', asset: siteAsset }
        : photoAsset
          ? { type: 'photo', text: 'Trải nghiệm', asset: photoAsset }
          : { type: 'steps', text: 'Trải nghiệm', items: (detailItems.length ? detailItems : narrativeItems).slice(0, 4) })
      : { type: photoAsset ? 'photo' : 'feature', text: 'Trải nghiệm', asset: photoAsset },
    location: mapAsset ? { type: 'location', text: clampText(p.address || title, 6), asset: 'map' }
      : { type: 'rating', text: clampText(p.address || title, 6) },
    headline: { type: 'headline', text: clampText(title), kicker: 'TIN MỚI' },
    anchor_intro: ownsAsset(assets, 'presenter')
      ? { type: 'anchor', text: clampText(title), asset: 'presenter', name: pName }
      : { type: 'feature', text: clampText(title) },
    // With nobody on camera the bulletin used to close on a quote: words on a
    // gradient, which is the bare screen the gate refuses. It now signs off
    // with the points the bulletin actually made.
    anchor_close: ownsAsset(assets, 'presenter')
      ? { type: 'anchor', text: clampText(brand.cta || title), asset: 'presenter', name: pName }
      : { type: 'keypoints', text: clampText(title), items: (detailItems.length ? detailItems : narrativeItems).slice(0, 4).map((h) => ({ label: h.label })) },
    story: { type: photoAsset ? 'photo' : 'feature', text: clampText(title), asset: photoAsset },
    keypoints: {
      type: 'keypoints',
      text: '3 ý chính',
      items: summaryItems,
    },
    // A quote is words on a gradient. The summary's closing beat is the one
    // place a viewer looks for the takeaway, so it carries the source's own
    // points as rows instead of stopping at a caption.
    takeaway: {
      type: 'result',
      text: clampText(title),
      items: (detailItems.length ? detailItems : narrativeItems).slice(0, 4).map((h) => ({ label: h.label })),
    },
    question: { type: 'question', text: clampText(title) },
    question2: { type: 'question', text: clampText(bodyQuestion || 'Còn gì nữa?') },
    answer: { type: photoAsset ? 'photo' : 'answer', text: clampText(sentences[0] || title, 8), asset: photoAsset },
    answer2: { type: 'answer', text: clampText(sentences[1] || title, 8) },
    cta: { type: 'cta', text: clampText(brand.cta || 'Xem thêm'), say: clampText(brand.cta || 'Xem thêm tại website.') },
  };

  // A screen with nothing to say is a hole in the story, and more screens is
  // only a win when there are more things to say. The fallback narrates source
  // sentences and cannot invent them, so asking it for more screens than the
  // article has sentences came back as scenes holding only their own caption.
  // It takes no more screens than the source can fill; the seconds it is not
  // given are spent on the screens it does have, and `fitNarration` ends the
  // video when the voice does.
  const slots = beatSlots(intent, durationTarget, sourceDetails.length + 2);
  // Khi model không trả về storyboard, lấy câu ở nhiều vị trí khắp bài thay
  // vì ba câu đầu. Mẫu bị giới hạn theo số beat, rồi cắt theo budget để giữ
  // đầu và kết thay vì làm mất chi tiết giữa câu.
  const detailLimit = Math.min(sourceDetails.length, Math.max(1, slots.length * 2));
  const detailSample = detailLimit > 1
    ? Array.from({ length: detailLimit }, (_, i) => sourceDetails[
      Math.round(i * (sourceDetails.length - 1) / (detailLimit - 1))
    ])
    : sourceDetails.slice(0, detailLimit);
  const joinSpeech = (...parts) => parts
    .map((part) => String(part || '').trim().replace(/[.!?…]+$/g, ''))
    .filter(Boolean)
    .join('. ');
  const fitDetail = (value, max) => {
    const parts = words(value);
    if (parts.length <= max) return String(value || '');
    const budget = Math.max(1, max);
    const head = Math.max(1, Math.ceil((budget - 1) * 0.6));
    const tail = Math.max(0, budget - 1 - head);
    return [...parts.slice(0, head), ...(tail ? ['…'] : []), ...(tail ? parts.slice(-tail) : [])].join(' ');
  };
  const bodySlotIndexes = slots.map((slot, i) => [slot, i])
    .filter(([slot]) => !['hook', 'cta'].includes(slot.beat))
    .map(([, i]) => i);
  const bodyDetails = [];
  const simpleBodyAllocation = detailSample.length <= bodySlotIndexes.length + 1;
  for (let i = 0; i < bodySlotIndexes.length; i++) {
    const start = simpleBodyAllocation
      ? i
      : Math.round(i * Math.max(0, detailSample.length - 1) / Math.max(1, bodySlotIndexes.length - 1));
    const end = simpleBodyAllocation
      ? start + 1
      : (i === bodySlotIndexes.length - 1
        ? detailSample.length
        : Math.round((i + 1) * Math.max(0, detailSample.length - 1) / Math.max(1, bodySlotIndexes.length - 1)) + 1);
    bodyDetails[i] = detailSample.slice(start, Math.max(start + 1, end)).filter(Boolean);
  }
  // Leave the opening and closing source beats for the hook/CTA only when
  // there are enough details; otherwise body scenes keep the unique details.
  const endpointDetails = detailSample.length > bodySlotIndexes.length + 1
    ? { hook: detailSample[0], cta: detailSample.at(-1) }
    : detailSample.length === bodySlotIndexes.length + 1
      ? { hook: '', cta: detailSample.at(-1) }
      : { hook: '', cta: '' };
  if (detailSample.length > bodySlotIndexes.length + 1) {
    const bodyStart = 1;
    const bodyEnd = detailSample.length - 1;
    for (let i = 0; i < bodyDetails.length; i++) {
      const start = Math.round(bodyStart + i * (bodyEnd - bodyStart) / bodyDetails.length);
      const end = Math.round(bodyStart + (i + 1) * (bodyEnd - bodyStart) / bodyDetails.length);
      bodyDetails[i] = detailSample.slice(start, Math.max(start + 1, end));
    }
  }
  const bodyPosition = new Map(bodySlotIndexes.map((sceneIndex, bodyIndex) => [sceneIndex, bodyIndex]));
  // Every source sentence the body screens have already claimed, so the hook
  // can open on a fact the body is not already saying.
  const variedSaySources = new Set(
    bodySlotIndexes.flatMap((index) => bodyDetails[bodyPosition.get(index)] || []),
  );
  const scenes = slots.map((slot, i) => {
    let base = fill[slot.beat] || { type: 'feature', text: clampText(title) };
    // The fill map is shared across intents, so a shape that is right for one
    // beat can be outside another beat's vocabulary — a `photo` for a
    // product_demo's `product` beat, which may only show the product, a demo or
    // icons. Sanitize drops such a scene as `not_in_<intent>`, and when the
    // board is sized exactly to the template that silence loses the beat
    // entirely (`missing_beat:demo`). The beat decides, so the fill is coerced
    // into the vocabulary the beat is allowed to use.
    if (slot.types?.length && !slot.types.includes(base.type)) {
      const swap = slot.types.find((type) => type !== 'feature') || slot.types[0];
      base = { ...base, type: swap, asset: ASSET_RENDER_TYPES.has(swap) ? base.asset : undefined };
    }
    const scene = { ...base, duration: slot.duration };
    let detail = bodyPosition.has(i)
      ? fitDetail(joinSpeech(...(bodyDetails[bodyPosition.get(i)] || [])), narrationBudget(slot.duration))
      : '';
    if (slot.beat === 'hook') detail = endpointDetails.hook;
    else if (slot.beat === 'cta') detail = endpointDetails.cta;
    if (slot.beat === 'hook') {
      const hookBudget = narrationBudget(slot.duration);
      // The title opens the video; the article's own first fact is what makes
      // it worth watching. A title long enough to fill the slot must not
      // squeeze that fact out, so the title never takes more than a third of
      // the hook and the rest is reserved for the source.
      const titleCap = Math.max(1, Math.min(wordCount(title), Math.floor(hookBudget * 0.4) - 2));
      const titlePart = clampText(title, titleCap);
      const titleWords = wordCount(titlePart);
      // The hook opens on the article's first fact. When the body is short
      // enough that it has already claimed that sentence, the hook still says
      // it — a repeated opener is better than a hook that is only a title.
      const opening = [detail, ...detailSample].filter(Boolean)
        .find((sentence) => !variedSaySources.has(sentence))
        || detailSample[0] || '';
      variedSaySources.add(opening);
      scene.say = joinSpeech(titlePart, fitDetail(opening, Math.max(1, hookBudget - titleWords)));
    } else if (slot.beat === 'cta') {
      scene.say = joinSpeech(detail, clampText(brand.cta || 'Đọc bài viết đầy đủ', 8));
    } else if (detail) {
      scene.say = detail;
    }
    if (scene.say === undefined) scene.say = clampText(scene.text, 12);
    scene.__sourceSayAssigned = true;
    // The beat this scene answers. A repeated beat fills the same template
    // twice, so the gate needs the name to know the two belong together and
    // to re-cast the second one instead of dropping it.
    scene.__beat = slot.beat;
    if (url && scene.type === 'cta') scene.url = url;
    return scene;
  });

  // Two beats can legitimately want the same scene type — a product demo's
  // "product" and "demo" both show the site — and the variety rule would then
  // drop one, silently losing a beat. Rebuild the repeat as another type,
  // rather than letting the gate eat it.
  // The new card types degrade in a fixed order when one repeats: a second
  // anchor becomes a headline, a second headline a feature card, and so on.
  // (News without a presenter hits this: its anchor_intro fill is already a
  // headline, and 'anchor' cannot resolve it — a rebuilt anchor would just be
  // rewritten back into a headline by the gate and dropped as a repeat.)
  // A repeated *beat* reuses the same fill, so the alternates are tried in a
  // fixed order too — and that order leads with the shapes that draw
  // something, because a second caption on a gradient is the bare screen the
  // release gate exists to refuse.
  const REPEAT_ALT = { anchor: 'headline', headline: 'feature', keypoints: 'steps', question: 'quote', answer: 'feature' };
  for (let i = 1; i < scenes.length; i++) {
    if (scenes[i].type !== scenes[i - 1].type) continue;
    const allowedForBeat = slots[i].types || [];
    // Ranked the same way the gate ranks them, so the deterministic board and
    // the model's own answer land on the same alternative: the best shape the
    // beat has, not merely the first one its list happens to mention.
    const candidates = [
      ...DRAWN_ALTERNATIVES.filter((t) => allowedForBeat.includes(t)
        && t !== scenes[i].type && t !== scenes[i - 1].type),
      ...(scenes[i].type === 'anchor' && slots[i].beat === 'anchor_close' ? ['quote'] : []),
      ...(REPEAT_ALT[scenes[i].type] ? [REPEAT_ALT[scenes[i].type]] : []),
      ...allowedForBeat.filter((t) => t !== scenes[i].type),
    ];
    const text = scenes[i].text;
    // Walk the candidates until one can actually be drawn. A chart the source
    // has no numbers for is not a fallback — it is an empty frame, and
    // stopping at the first candidate is what used to leave the repeat as the
    // caption it was meant to replace.
    let rebuilt = null;
    for (const candidate of candidates) {
      if (!candidate || !allowedForBeat.includes(candidate)) continue;
      rebuilt = buildRepeatCard(candidate, { text, nums, kpItems, narrativeItems, detailItems, siteAsset, photoAsset, presenter: ownsAsset(assets, 'presenter'), pName });
      if (rebuilt) break;
    }
    if (!rebuilt) continue;
    scenes[i] = { ...rebuilt, duration: scenes[i].duration, say: scenes[i].say, __sourceSayAssigned: true, __beat: scenes[i].__beat };
  }

  // Last pass: a job can arrive with no photo, no screenshot and no logo, and
  // every scene that wanted one of those is now a bare caption. A video like
  // that fails the release gate, so the board swaps those screens for shapes
  // the source alone can draw — a list of its own points, a chart of its own
  // numbers — rather than shipping a deck and hoping nobody looks closely.
  for (let i = 1; i < scenes.length - 1; i++) {
    if (isIllustrated(scenes[i], { hasLogo: ownsAsset(assets, 'logo'), assets })) continue;
    const allowedForBeat = slots[i].types || [];
    const drawn = DRAWN_ALTERNATIVES.filter((t) => allowedForBeat.includes(t) && t !== scenes[i].type);
    let swapped = null;
    for (const candidate of drawn) {
      swapped = buildRepeatCard(candidate, { text: scenes[i].text, nums, kpItems, narrativeItems, detailItems, siteAsset, photoAsset, presenter: ownsAsset(assets, 'presenter'), pName });
      if (swapped && isIllustrated({ ...scenes[i], ...swapped }, { hasLogo: ownsAsset(assets, 'logo'), assets })) break;
      swapped = null;
    }
    if (swapped) scenes[i] = { ...scenes[i], ...swapped };
  }
  return { intent, duration: durationTarget, scenes };
}

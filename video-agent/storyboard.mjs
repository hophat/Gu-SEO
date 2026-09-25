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
// Mặc định mới: đủ thời gian kể các ý chính của bài, không ép lời đọc thành
// teaser. 15–90s vẫn giữ mọi template cũ hợp lệ; wizard auto dùng 60s.
export const DURATION = { min: 15, max: 90, default: 60 };
export const MIN_SCENES = 3;
export const MAX_SCENES = 8;
export const MAX_TEXT_WORDS = 8;

// Vietnamese edge-tts at +8% measures roughly this on the render VPS. It is
// a starting point, not a truth: the pipeline measures the audio it actually
// got and re-fits, so being 20% out costs a retry, not a wrong video.
export const WORDS_PER_SECOND = 2.6;

// ── beats ────────────────────────────────────────────────────────────
// Ordered beats per intent. `weight` is a share of the total duration, and
// `types` is the whole vocabulary that beat is allowed to use — so a
// `bars` scene in a local-business video is dropped, not drawn.
const beats = (...rows) => rows.map(([beat, weight, types]) => ({ beat, weight, types }));

export const BEATS = {
  product_demo: beats(
    ['hook', 1.0, ['hook']],
    ['problem', 1.2, ['problem', 'photo']],
    ['product', 1.5, ['product_reveal', 'ui_demo']],
    ['demo', 2.2, ['ui_demo', 'feature']],
    ['result', 1.2, ['result', 'stat']],
    ['cta', 1.4, ['cta']],
  ),
  product_promotion: beats(
    ['hook', 1.1, ['hook']],
    ['product', 1.5, ['product_reveal', 'ui_demo']],
    ['benefit', 1.6, ['feature', 'icons']],
    ['proof', 1.3, ['rating', 'quote', 'stat']],
    ['offer', 1.1, ['result', 'stat']],
    ['cta', 1.4, ['cta']],
  ),
  local_business: beats(
    ['hook', 1.0, ['hook']],
    ['business', 1.3, ['product_reveal', 'photo']],
    ['product', 2.0, ['photo', 'feature']],
    ['experience', 1.6, ['photo', 'ui_demo']],
    ['location', 1.4, ['location', 'rating']],
    ['cta', 1.4, ['cta']],
  ),
  educational: beats(
    ['hook', 1.1, ['hook']],
    ['insight', 1.4, ['stat', 'quote']],
    ['point', 2.4, ['bars', 'donut', 'line', 'steps', 'icons', 'compare', 'timeline']],
    ['conclusion', 1.3, ['quote', 'result']],
    ['cta', 1.3, ['cta']],
  ),
  storytelling: beats(
    ['hook', 1.0, ['hook']],
    ['problem', 1.3, ['problem', 'photo']],
    ['tension', 1.5, ['quote', 'photo']],
    ['transformation', 1.8, ['before_after', 'ui_demo']],
    ['result', 1.4, ['result', 'stat']],
    ['cta', 1.3, ['cta']],
  ),
  announcement: beats(
    ['hook', 1.0, ['hook']],
    ['what', 1.6, ['product_reveal', 'ui_demo']],
    ['why', 1.5, ['feature', 'stat']],
    ['demo', 1.9, ['ui_demo', 'feature']],
    ['cta', 1.4, ['cta']],
  ),
  testimonial: beats(
    ['hook', 1.1, ['hook']],
    ['voice', 2.0, ['quote', 'rating']],
    ['proof', 1.6, ['result', 'stat', 'photo']],
    ['cta', 1.3, ['cta']],
  ),
  before_after: beats(
    ['hook', 1.0, ['hook']],
    ['before', 1.7, ['photo', 'problem']],
    ['after', 1.7, ['photo', 'result']],
    ['change', 1.9, ['before_after', 'ui_demo']],
    ['cta', 1.3, ['cta']],
  ),
  listicle: beats(
    ['hook', 1.1, ['hook']],
    ['items', 3.2, ['steps', 'icons', 'bars']],
    ['close', 1.2, ['quote', 'result']],
    ['cta', 1.3, ['cta']],
  ),
  news: beats(
    ['headline', 1.0, ['headline']],
    ['anchor_intro', 1.3, ['anchor', 'headline', 'feature']],
    ['story', 2.4, ['photo', 'ui_demo', 'stat', 'location', 'feature']],
    ['anchor_close', 1.2, ['anchor', 'quote']],
    ['cta', 1.1, ['cta']],
  ),
  summary: beats(
    ['hook', 1.0, ['hook']],
    ['keypoints', 2.6, ['keypoints']],
    ['takeaway', 1.2, ['quote', 'result']],
    ['cta', 1.2, ['cta']],
  ),
  qa: beats(
    ['hook', 1.0, ['hook']],
    ['question', 1.2, ['question']],
    ['answer', 2.0, ['answer', 'photo', 'ui_demo', 'stat', 'steps']],
    ['question2', 1.0, ['question']],
    ['answer2', 1.6, ['answer', 'feature', 'icons']],
    ['cta', 1.2, ['cta']],
  ),
};

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

// Spread `target` seconds across the intent's beats by weight. This is the
// inversion at the heart of the rework: the story decides how long the video
// is, and the narration is written to fit — not the other way round.
export function beatSlots(intent, target = DURATION.default) {
  const template = BEATS[intent] || BEATS.educational;
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
    let items = raw.items;
    if (type === 'bars' || type === 'line') {
      items = (Array.isArray(raw.items) ? raw.items : []).filter((i) => have.has(numOf(i?.value)));
      if (items.length < 2) { dropped.push({ index, type, reason: 'too_few_verified_numbers' }); continue; }
    }
    // A keypoints card with one row is a sentence wearing a number.
    if (type === 'keypoints') {
      items = (Array.isArray(raw.items) ? raw.items : [])
        .map((i) => ({ ...i, label: clampText(i?.label) }))
        .filter((i) => i.label)
        .slice(0, 4);
      if (items.length < 2) { dropped.push({ index, type, reason: 'too_few_items' }); continue; }
    }
    if (['steps', 'icons', 'timeline'].includes(type)) {
      items = (Array.isArray(raw.items) ? raw.items : [])
        .map((i) => ({
          ...i,
          label: clampText(i?.label || i?.text || i?.detail, 6),
          ...(type === 'steps' ? { detail: clampText(i?.detail, 10) } : {}),
          ...(type === 'timeline' ? { text: clampText(i?.text || i?.detail, 10) } : {}),
        }))
        .filter((i) => i.label)
        .slice(0, 6);
      if (!items.length) { dropped.push({ index, type, reason: `${type}_needs_items` }); continue; }
    }
    if (type === 'compare') {
      const cleanSide = (side) => (Array.isArray(side?.items) ? side.items : [])
        .map((item) => clampText(typeof item === 'string' ? item : item?.label || item?.text, 8))
        .filter(Boolean);
      items = {
        left: { ...(raw.left || {}), items: cleanSide(raw.left) },
        right: { ...(raw.right || {}), items: cleanSide(raw.right) },
      };
      if (!items.left.items.length || !items.right.items.length) {
        dropped.push({ index, type, reason: 'compare_needs_both_sides' });
        continue;
      }
    }
    if (type === 'donut' && !have.has(numOf(raw.value))) {
      dropped.push({ index, type, reason: 'number_not_in_source' });
      continue;
    }

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
    });
  }

  // No two consecutive scenes of the same type: the third "big number" in a
  // row is where a video starts to feel like a deck.
  const varied = [];
  for (const scene of kept) {
    if (varied.length && varied.at(-1).type === scene.type) {
      dropped.push({ index: kept.indexOf(scene), type: scene.type, reason: 'repeat_of_previous' });
      continue;
    }
    varied.push(scene);
  }

  const scenes = varied.slice(0, MAX_SCENES);
  if (varied.length > MAX_SCENES) {
    dropped.push({ index: MAX_SCENES, type: '(rest)', reason: 'over_max_scenes', lost: varied.length - MAX_SCENES });
  }

  // Duration: the caller/template owns the target. Honour each scene's
  // relative slot, then rescale to that target so a model cannot silently
  // turn a 20s template into a 60s or 90s render.
  const used = new Set();
  const slotFor = (type) => {
    const exact = slots.findIndex((b, i) => !used.has(i) && b.types.includes(type));
    const idx = exact >= 0 ? exact : slots.findIndex((_, i) => !used.has(i));
    used.add(idx >= 0 ? idx : slots.length - 1);
    return slots[idx >= 0 ? idx : slots.length - 1];
  };
  const wanted = scenes.map((s) => {
    const asked = Number(s.duration);
    if (Number.isFinite(asked) && asked > 0) return asked;
    return slotFor(s.type).duration;
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
  let beatCursor = 0;
  for (const beat of beatTemplate) {
    const foundAt = scenes.findIndex((scene, index) => index >= beatCursor && beat.types.includes(scene.type));
    if (foundAt < 0) problems.push(`missing_beat:${beat.beat}`);
    else beatCursor = foundAt + 1;
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
  const bodyQuestion = sentences.find((s) => s.includes('?'));

  const fill = {
    hook: { type: 'hook', text: clampText(title), say: clampText(title) },
    problem: { type: 'problem', text: 'Vấn đề khách hàng gặp', say: `${clampText(title)} — vấn đề đặt ra.` },
    product: intent === 'local_business'
      ? { type: photoAsset ? 'photo' : 'feature', text: clampText(p.name || title), asset: photoAsset }
      : { type: siteAsset ? 'ui_demo' : 'product_reveal', text: clampText(p.name || title), asset: siteAsset, say: clampText(p.tagline || p.name || title) },
    business: { type: photoAsset ? 'photo' : 'product_reveal', text: clampText(p.name || title), asset: photoAsset },
    demo: { type: 'ui_demo', text: 'Xem thử', asset: siteAsset },
    feature: { type: photoAsset ? 'photo' : 'feature', text: clampText(p.tagline || title), asset: photoAsset },
    benefit: { type: 'icons', text: 'Lợi ích chính', items: narrativeItems.slice(0, 4).map((h, i) => ({ icon: ['check', 'trend', 'shield', 'star'][i % 4], label: h.label })) },
    insight: nums.length ? { type: 'stat', text: clampText(title), value: nums[0], say: clampText(title) } : { type: 'quote', text: clampText(title) },
    point: nums.length >= 2
      ? { type: 'bars', text: 'Con số đáng chú ý', items: nums.slice(0, 4).map((n, i) => ({ label: `Mục ${i + 1}`, value: n })) }
      : { type: 'steps', text: 'Các bước', items: narrativeItems.slice(0, 3).map((h) => ({ label: h.label })) },
    conclusion: { type: 'result', text: clampText(brand.cta || title) },
    items: { type: 'steps', text: 'Danh sách', items: narrativeItems.slice(0, 3).map((h) => ({ label: h.label })) },
    close: { type: 'quote', text: clampText(title) },
    result: nums.length ? { type: 'stat', text: 'Kết quả', value: nums.at(-1) } : { type: 'result', text: clampText(title), asset: siteAsset },
    proof: intent === 'testimonial' && photoAsset
      ? { type: 'photo', text: clampText(p.name || title), asset: photoAsset }
      : nums.length
        ? { type: 'stat', text: 'Kết quả', value: nums.at(-1) }
        : { type: 'quote', text: clampText(title) },
    offer: { type: 'result', text: clampText(brand.cta || 'Đăng ký ngay') },
    why: { type: 'feature', text: clampText(p.tagline || title) },
    what: { type: siteAsset ? 'ui_demo' : 'product_reveal', text: clampText(p.name || title), asset: siteAsset },
    voice: { type: 'quote', text: clampText(sentences[0] || title, 10) },
    before: hasDistinctComparison
      ? { type: 'photo', text: 'Trước đây', asset: comparisonFirstAsset }
      : { type: 'problem', text: 'Trước đây' },
    after: hasDistinctComparison
      ? { type: 'photo', text: 'Sau khi dùng', asset: comparisonSecondAsset }
      : { type: 'result', text: 'Sau khi dùng' },
    change: hasDistinctComparison
      ? { type: 'before_after', text: 'Thay đổi', asset: comparisonFirstAsset, asset2: comparisonSecondAsset }
      : { type: 'ui_demo', text: 'Thay đổi', asset: comparisonFirstAsset },
    tension: { type: 'quote', text: clampText(sentences[1] || sentences[0] || title, 10) },
    transformation: { type: 'ui_demo', text: clampText(p.name || title), asset: siteAsset },
    experience: intent === 'local_business'
      ? { type: siteAsset ? 'ui_demo' : photoAsset ? 'photo' : 'ui_demo', text: 'Trải nghiệm', asset: siteAsset || photoAsset }
      : { type: photoAsset ? 'photo' : 'feature', text: 'Trải nghiệm', asset: photoAsset },
    location: mapAsset ? { type: 'location', text: clampText(p.address || title, 6), asset: 'map' }
      : { type: 'rating', text: clampText(p.address || title, 6) },
    headline: { type: 'headline', text: clampText(title), kicker: 'TIN MỚI' },
    anchor_intro: ownsAsset(assets, 'presenter')
      ? { type: 'anchor', text: clampText(title), asset: 'presenter', name: pName }
      : { type: 'feature', text: clampText(title) },
    anchor_close: ownsAsset(assets, 'presenter')
      ? { type: 'anchor', text: clampText(brand.cta || title), asset: 'presenter', name: pName }
      : { type: 'quote', text: clampText(title) },
    story: { type: photoAsset ? 'photo' : 'feature', text: clampText(title), asset: photoAsset },
    keypoints: {
      type: 'keypoints',
      text: '3 ý chính',
      items: summaryItems,
    },
    takeaway: { type: 'quote', text: clampText(title) },
    question: { type: 'question', text: clampText(title) },
    question2: { type: 'question', text: clampText(bodyQuestion || 'Còn gì nữa?') },
    answer: { type: photoAsset ? 'photo' : 'answer', text: clampText(sentences[0] || title, 8), asset: photoAsset },
    answer2: { type: 'answer', text: clampText(sentences[1] || title, 8) },
    cta: { type: 'cta', text: clampText(brand.cta || 'Xem thêm'), say: clampText(brand.cta || 'Xem thêm tại website.') },
  };

  const slots = beatSlots(intent, durationTarget);
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
  const scenes = slots.map((slot, i) => {
    const base = fill[slot.beat] || { type: 'feature', text: clampText(title) };
    const scene = { ...base, duration: slot.duration };
    let detail = bodyPosition.has(i)
      ? fitDetail(joinSpeech(...(bodyDetails[bodyPosition.get(i)] || [])), narrationBudget(slot.duration))
      : '';
    if (slot.beat === 'hook') detail = endpointDetails.hook;
    else if (slot.beat === 'cta') detail = endpointDetails.cta;
    if (slot.beat === 'hook') {
      const hookBudget = narrationBudget(slot.duration);
      const titlePart = clampText(title, Math.max(1, Math.floor(hookBudget * 0.45)));
      const titleWords = wordCount(titlePart);
      scene.say = joinSpeech(titlePart, fitDetail(detail, Math.max(1, hookBudget - titleWords)));
    } else if (slot.beat === 'cta') {
      scene.say = joinSpeech(detail, clampText(brand.cta || 'Đọc bài viết đầy đủ', 8));
    } else if (detail) {
      scene.say = detail;
    }
    if (scene.say === undefined) scene.say = clampText(scene.text, 12);
    scene.__sourceSayAssigned = true;
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
  const REPEAT_ALT = { anchor: 'headline', headline: 'feature', keypoints: 'steps', question: 'quote', answer: 'feature' };
  for (let i = 1; i < scenes.length; i++) {
    if (scenes[i].type !== scenes[i - 1].type) continue;
    const allowedForBeat = slots[i].types || [];
    const alt = scenes[i].type === 'anchor' && slots[i].beat === 'anchor_close'
      ? 'quote'
      : (REPEAT_ALT[scenes[i].type] || allowedForBeat.find((t) => t !== scenes[i].type));
    if (!alt || !allowedForBeat.includes(alt)) continue;
    if (!alt) continue;
    const text = scenes[i].text;
    const rebuilt = {
      ui_demo: { type: 'ui_demo', text, asset: siteAsset },
      product_reveal: { type: 'product_reveal', text },
      photo: { type: 'photo', text, asset: photoAsset },
      feature: { type: 'feature', text, icon: 'check' },
      quote: { type: 'quote', text },
      result: { type: 'result', text },
      problem: { type: 'problem', text },
      anchor: ownsAsset(assets, 'presenter') ? { type: 'anchor', text, asset: 'presenter', name: pName } : { type: 'headline', text },
      headline: { type: 'headline', text },
      keypoints: { type: 'keypoints', text, items: kpItems },
      steps: { type: 'steps', text, items: narrativeItems.slice(0, 3) },
      question: { type: 'question', text },
      answer: { type: 'answer', text },
    }[alt];
    if (rebuilt) scenes[i] = { ...rebuilt, duration: scenes[i].duration, say: scenes[i].say, __sourceSayAssigned: true };
  }
  return { intent, duration: durationTarget, scenes };
}

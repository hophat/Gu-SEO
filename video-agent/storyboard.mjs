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
];

// ── scene vocabulary ─────────────────────────────────────────────────
// `visual` scenes show something real (a screenshot, a photo, a map).
// `graphic` scenes draw a chart or a diagram. A storyboard built only from
// prose is the anti-pattern; the two groups below are what breaks it.
export const VISUAL_TYPES = [
  'hook', 'problem', 'product_reveal', 'ui_demo', 'feature',
  'result', 'before_after', 'photo', 'location', 'rating', 'cta',
];
export const GRAPHIC_TYPES = [
  'stat', 'bars', 'donut', 'line', 'steps', 'icons', 'compare', 'timeline',
];
// A quote card is words on a gradient, not a graphic. It is listed here so
// the slideshow test counts it for what it is.
export const PROSE_ONLY_TYPES = ['quote'];
export const SCENE_TYPES = [...VISUAL_TYPES, ...GRAPHIC_TYPES, ...PROSE_ONLY_TYPES];

// Types that can be nothing but words. If most of a storyboard's body is
// these, it is a slideshow regardless of how pretty the type is.
const PROSE_TYPES = new Set(['hook', 'problem', 'quote', 'cta']);

// ── budgets ──────────────────────────────────────────────────────────
export const DURATION = { min: 15, max: 45, default: 20 };
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
    ['point', 2.4, ['bars', 'donut', 'line', 'steps', 'icons', 'compare']],
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
  return template.map((b) => ({ ...b, duration: Math.round((b.weight / total) * dur * 10) / 10 }));
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

// Words with nothing to look at. A chart counts as something to look at; a
// screenshot counts; a caption on a gradient does not.
function isTextOnly(scene) {
  return PROSE_TYPES.has(scene.type) && !scene.asset && !isGraphic(scene.type);
}

// Intents whose whole point is to show something real. A storyboard for one
// of these that uses no asset is a slide deck no matter how it is styled.
const NEEDS_ASSETS = new Set([
  'product_demo', 'product_promotion', 'local_business', 'before_after', 'announcement',
]);

// The single gate every storyboard passes through. Returns a storyboard that
// is safe to draw plus a report of what was changed — a drop is never silent.
export function sanitizeStoryboard(sb, { source = '', intent = 'educational', target = DURATION.default, assets = {} } = {}) {
  const dropped = [];
  const template = BEATS[intent] || BEATS.educational;
  const allowed = new Set(template.flatMap((b) => b.types));
  const have = numbersIn(source);
  const slots = beatSlots(intent, target);

  const kept = [];
  for (const [index, raw] of (Array.isArray(sb?.scenes) ? sb.scenes : []).entries()) {
    const type = raw?.type;
    if (!SCENE_TYPES.includes(type)) { dropped.push({ index, type: String(type), reason: 'unknown_type' }); continue; }
    if (!allowed.has(type)) { dropped.push({ index, type, reason: `not_in_${intent}` }); continue; }

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

    // An asset the collector does not have is worse than no asset: it renders
    // as a broken frame. Drop the reference, keep the scene.
    const asset = raw.asset && assets[raw.asset] ? raw.asset : null;
    if (raw.asset && !asset) dropped.push({ index, type, reason: 'asset_missing', asset: raw.asset });

    kept.push({
      ...raw, type, text, asset, items,
      say: clampWords(raw.say, 0), // budget is applied below, once durations exist
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

  // Duration: honour what the model asked for per scene when it is sane, then
  // rescale the whole thing to the target so the total is the story's, not
  // the model's. Slots are matched by TYPE, not by position: assigning them
  // by index gave the closing CTA the longest beat in the video.
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
  const finalTotal = clampDuration(Number(sb?.duration) || target);
  scenes.forEach((s, i) => {
    s.duration = Math.max(1.5, Math.round((wanted[i] / wantedTotal) * finalTotal * 10) / 10);
    // Narration is written to fit its slot, not the other way round.
    s.say = clampWords(s.say, narrationBudget(s.duration));
  });

  return {
    storyboard: { intent, duration: Math.round(scenes.reduce((a, s) => a + s.duration, 0) * 10) / 10, scenes },
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
export function reviewStoryboard(sb) {
  const scenes = sb?.scenes || [];
  const problems = [];
  if (!scenes.length) return { ok: false, problems: ['empty'] };

  if (scenes.length < MIN_SCENES) problems.push(`too_few_scenes:${scenes.length}`);
  if (scenes[0]?.type !== 'hook') problems.push('does_not_open_on_a_hook');
  if (scenes.at(-1)?.type !== 'cta') problems.push('does_not_end_on_a_cta');

  const dur = scenes.reduce((a, s) => a + (Number(s.duration) || 0), 0);
  if (dur < DURATION.min - 0.5 || dur > DURATION.max + 0.5) problems.push(`duration_out_of_range:${dur.toFixed(1)}`);

  // A hook and a closing CTA are supposed to be words — that is the shape of
  // a social video, not a defect. So the slideshow test looks at the middle:
  // if most of the body has nothing to look at, there is no video here.
  const middle = scenes.slice(1, -1);
  const textOnly = middle.filter(isTextOnly).length;
  if (middle.length && textOnly * 2 > middle.length) {
    problems.push(`slideshow:${textOnly}_of_${middle.length}_body_scenes_are_text_only`);
  }
  if (NEEDS_ASSETS.has(sb?.intent) && !scenes.some((s) => s.asset)) {
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

// ── deterministic fallback ───────────────────────────────────────────
// GuRouter can be down. The storyboard still has to exist, and it still has
// to be a story — so this walks the intent's beats and fills each one from
// what the job actually carries.
export function storyboardFromContent(job = {}, intent = 'educational', assets = {}) {
  const p = job.project || {};
  const brand = p.brand || {};
  const title = String(job.title || p.name || '').trim();
  const body = String(job.body_markdown || p.description || '');
  const nums = [...numbersIn(body)];
  const url = String(p.publishing_url || p.website_url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const siteAsset = Object.keys(assets).find((k) => k.startsWith('site:'));
  const photoAsset = Object.keys(assets).find((k) => k.startsWith('photo:') || k === 'hero');
  const mapAsset = assets.map ? 'map' : null;

  const fill = {
    hook: { type: 'hook', text: clampText(title), say: clampText(title) },
    problem: { type: 'problem', text: 'Vấn đề khách hàng gặp', say: `${clampText(title)} — vấn đề đặt ra.` },
    product: { type: siteAsset ? 'ui_demo' : 'product_reveal', text: clampText(p.name || title), asset: siteAsset, say: clampText(p.tagline || p.name || title) },
    business: { type: photoAsset ? 'photo' : 'product_reveal', text: clampText(p.name || title), asset: photoAsset },
    demo: { type: 'ui_demo', text: 'Xem thử', asset: siteAsset },
    feature: { type: photoAsset ? 'photo' : 'feature', text: clampText(p.tagline || title), asset: photoAsset },
    benefit: { type: 'icons', text: 'Lợi ích chính', items: (job.highlights || []).slice(0, 4).map((h, i) => ({ icon: ['check', 'trend', 'shield', 'star'][i % 4], label: clampText(h, 4) })) },
    insight: nums.length ? { type: 'stat', text: clampText(title), value: nums[0], say: clampText(title) } : { type: 'quote', text: clampText(title) },
    point: nums.length >= 2
      ? { type: 'bars', text: 'Con số đáng chú ý', items: nums.slice(0, 4).map((n, i) => ({ label: `Mục ${i + 1}`, value: n })) }
      : { type: 'steps', text: 'Các bước', items: (job.highlights || []).slice(0, 3).map((h) => ({ label: clampText(h, 5) })) },
    conclusion: { type: 'quote', text: clampText(brand.cta || title) },
    items: { type: 'steps', text: 'Danh sách', items: (job.highlights || []).slice(0, 3).map((h) => ({ label: clampText(h, 5) })) },
    close: { type: 'quote', text: clampText(title) },
    result: nums.length ? { type: 'stat', text: 'Kết quả', value: nums.at(-1) } : { type: 'result', text: clampText(title), asset: siteAsset },
    proof: photoAsset ? { type: 'photo', text: clampText(p.name || title), asset: photoAsset } : { type: 'quote', text: clampText(title) },
    offer: { type: 'result', text: clampText(brand.cta || 'Đăng ký ngay') },
    why: { type: 'feature', text: clampText(p.tagline || title) },
    what: { type: siteAsset ? 'ui_demo' : 'product_reveal', text: clampText(p.name || title), asset: siteAsset },
    voice: { type: 'quote', text: clampText(body.split(/(?<=[.!?])\s+/)[0] || title, 10) },
    before: { type: photoAsset ? 'photo' : 'problem', text: 'Trước đây', asset: photoAsset },
    after: { type: photoAsset ? 'photo' : 'result', text: 'Sau khi dùng', asset: photoAsset },
    change: { type: 'before_after', text: 'Thay đổi', asset: photoAsset },
    tension: { type: 'quote', text: clampText(body.split(/(?<=[.!?])\s+/)[1] || title, 10) },
    transformation: { type: 'ui_demo', text: clampText(p.name || title), asset: siteAsset },
    experience: { type: photoAsset ? 'photo' : 'feature', text: 'Trải nghiệm', asset: photoAsset },
    location: mapAsset ? { type: 'location', text: clampText(p.address, 6), asset: 'map' }
      : { type: 'result', text: clampText(p.address || title, 6) },
    cta: { type: 'cta', text: clampText(brand.cta || 'Xem thêm'), say: clampText(brand.cta || 'Xem thêm tại website.') },
  };

  const slots = beatSlots(intent);
  const scenes = slots.map((slot) => {
    const base = fill[slot.beat] || { type: 'feature', text: clampText(title) };
    const scene = { ...base, duration: slot.duration };
    if (scene.say === undefined) scene.say = clampText(scene.text, 12);
    if (url && scene.type === 'cta') scene.url = url;
    return scene;
  });

  // Two beats can legitimately want the same scene type — a product demo's
  // "product" and "demo" both show the site — and the variety rule would then
  // drop one, silently losing a beat. Rebuild the repeat as another type the
  // same beat allows, rather than letting the gate eat it.
  for (let i = 1; i < scenes.length; i++) {
    if (scenes[i].type !== scenes[i - 1].type) continue;
    const alt = slots[i].types.find((t) => t !== scenes[i].type);
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
    }[alt];
    if (rebuilt) scenes[i] = { ...rebuilt, duration: scenes[i].duration, say: scenes[i].say };
  }
  return { intent, duration: DURATION.default, scenes };
}

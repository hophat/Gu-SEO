// Smoke test for the render agent: the carousel deck path and the post
// video's music bed.
//
// The agent runs on a VPS with Chrome + hyperframes + ffmpeg. For the
// carousel this drives the real renderCarousel with a temp workspace, a
// faked snapshot process, a faked Openverse fetch and a faked deliver POST
// — real filesystem, no Chrome, no network — and separately pins the deck's
// markup contract (the part the platform and the admin UI contract with):
// 5 slides at 1080x1350, cover / 3 points / CTA, text escaped, and the same
// input producing the same HTML (what makes a snapshot at any --at time
// deterministic).
//
// For the post video it measures with ffmpeg: the real catalog music bed (a bed
// nobody can hear is indistinguishable from no music at all, and the first
// version rendered 17 dB too quiet to notice) and the loudness of the
// finished mix (a real render measured -29 LUFS, ~15 LU under what social
// expects, and the master that fixes it must be one constant gain — a
// dynamic normalizer lifts the bed through every pause in the voice).
//
//   node --no-warnings scripts/run-video-agent-tests.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The agent refuses to load without config. GuRouter is stubbed rather than
// disabled: the module reads the key once, at import, so a keyless import
// makes renderCarousel fall back to the article (fine) but leaves renderOne's
// script step unreachable — and the point below is to run renderOne whole.
// The stub refuses every request unless a test asks for a script, so nothing
// here can reach the network.
process.env.BASE_URL = 'https://agent.test';
process.env.ADMIN_TOKEN = 'test-token';
// Both model keys, set before the module is imported because the ladder is
// built at import time. A real VPS configures both, and the ordering tests
// below need the operator's chain: 9router, then GuRouter. Workers AI has no
// place in this list — it is a Workers binding, and this agent renders on a
// plain Node host where there is nothing to bind to.
process.env.NINEROUTER_API_KEY = 'test-key';
process.env.GUROUTER_API_KEY = 'test-key';

let scriptStub = null;
// How the stubbed model answers. The 9Router gateway streams OpenAI-style
// `data:` chunks on a 200 even when nothing asked for a stream, so the agent
// reads the body as text and folds both shapes together. `scriptStubAs` picks
// which shape this test exercises; the default is the plain JSON body.
let scriptStubAs = 'json';
const sseBody = (obj) => {
  const s = JSON.stringify(obj);
  const head = s.slice(0, s.length / 2), tail = s.slice(s.length / 2);
  return `data: {"id":"x","object":"chat.completion.chunk","model":"test-upstream","choices":[{"index":0,"delta":{"content":${JSON.stringify(head)}},"finish_reason":null}]}\n\n`
    + `data: {"id":"x","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":${JSON.stringify(tail)}},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20}}\n\n`
    + 'data: [DONE]\n\n';
};
// The last prompt handed to the model — the template tests check what the
// storyboard request said, not just what it got back.
let lastPrompt = null;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('/chat/completions')) {
    // Store the user message itself, not the wire JSON — the assertions match
    // the prompt's own quoting, not its escaping.
    const body = JSON.parse(opts?.body || '{}');
    lastPrompt = body?.messages?.[1]?.content || '';
  }
  if (scriptStub && String(url).includes('/chat/completions')) {
    const payload = { choices: [{ message: { content: JSON.stringify(scriptStub) } }] };
    const text = scriptStubAs === 'sse' ? sseBody(payload) : JSON.stringify(payload);
    return {
      ok: true,
      headers: new Map([['content-type', scriptStubAs === 'sse' ? 'text/event-stream' : 'application/json']]),
      text: async () => text,
    };
  }
  throw new Error(`network disabled in tests: ${url}`);
};

const {
  composeCarouselSlideHtml, composeStoryboardHtml, fitNarration, LOUDNESS, makeBgm,
  cutBgm, prepareBgm, speakSegments, writeStoryboard,
  masterLoudness, renderCarousel, renderOne, slideQueries, ttsChunks,
} = await import('../video-agent/render-video.mjs');
// Scene renderers live in scenes.mjs; the story rules in storyboard.mjs.
// MIN/MAX_SCENES are aliased because both modules export them with different
// values (a free-form plan allowed 5-9, the 60s default story wants 3-8) and a bare
// name here silently mixed the two.
const { ICON_NAMES, icon, sceneInner, statSize, wantsBackground } = await import('../video-agent/scenes.mjs');
const {
  AI_IMAGE_TYPES, MIN_SHOT_BYTES, generateSceneImages, isSubjectMaterial, pickShowcaseLinks,
  extractVisibleText, sceneImagePrompt,
} = await import('../video-agent/assets.mjs');
const { TEMPLATES, templateById, intentForTemplate } = await import('../video-agent/templates.mjs');
const {
  DURATION, INTENTS, MAX_TEXT_WORDS, alignCaptions, beatSlots, captionFromSay,
  captionGroundedIn, intentFromSignals, reviewStoryboard,
  sanitizeStoryboard, signatureTypes, storyboardFromContent, suggestDuration, wordCount,
  narrationBudget, expandBeats, sceneCountFor, isIllustrated, numOf, clampDuration,
  MIN_SCENES: SB_MIN_SCENES, MAX_SCENES: SB_MAX_SCENES,
} = await import('../video-agent/storyboard.mjs');
const { carouselPrefix, carouselSlideKey } = await import('../functions/_lib/video_jobs.js');

// The fewest screens a 60s article is ever told across. It is a floor rather
// than the exact count because the count belongs to the template — these tests
// care that a story has a body, not which beat took the extra screen.
const MIN_STORYBOARD_SCENES = 8;

const HAS_FFMPEG = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0;

// Integrated loudness and true peak, read from ebur128's summary — never from
// a tool that took part in any mastering.
function integrated(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' });
  const s = r.stderr.split('Summary:')[1] || '';
  const num = (re) => Number((s.match(re) || [])[1]);
  return { i: num(/I:\s+(-?[\d.]+) LUFS/), tp: num(/Peak:\s+(-?[\d.]+) dBFS/) };
}

let passed = 0;
function ok(label) { passed++; console.log(`✓ ${label}`); }
// The agent narrates every step; that is useful on the VPS and noise here.
async function captureLogs(fn) {
  const real = console.log, lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  try { await fn(); } finally { console.log = real; }
  return lines;
}
const silently = (fn) => captureLogs(fn).then(() => undefined);

const JOB = {
  slug: 'alpha-post',
  title: '5 địa điểm ăn sáng ngon ở Lagi',
  meta_description: 'Quán ăn sáng ở Lagi',
  project: { name: 'Lagi Food', accent: '#e8590c', publishing_url: 'https://lagi.example/blog' },
};
const SCRIPT = {
  hook: 'Thực đơn bữa sáng ở Lagi có gì?',
  points: ['Bánh canh cá lóc', 'Bánh xèo giòn', 'Cà phê sân vườn'],
  question: 'Bạn thích món nào?',
};
const deck = (job = JOB, script = SCRIPT) => [0, 1, 2, 3, 4].map((i) => composeCarouselSlideHtml(job, script, i));

console.log('--- Carousel slide composition (agent) ---\n');

// ── the deck the platform expects ────────────────────────────────────
{
  const slides = deck();
  assert.equal(slides.length, 5, 'a deck is 5 slides — carousel/<slug>-1..5.png');
  for (const [i, html] of slides.entries()) {
    assert.match(html, /^<!doctype html>/, `slide ${i + 1} must be a standalone document`);
    assert.match(html, /width=1080, height=1350/, `slide ${i + 1} must be 4:5 at 1080x1350`);
    assert.match(html, /data-width="1080"/, `slide ${i + 1} must declare its composition width`);
    assert.match(html, /data-height="1350"/);
  }
  ok('five standalone 1080x1350 slides');

  assert.match(slides[0], /class="badge">Lagi Food</, 'slide 1 carries the brand badge');
  assert.match(slides[0], /class="hook">Thực đơn bữa sáng ở Lagi có gì\?</);
  for (const [n, pt] of SCRIPT.points.entries()) {
    const html = slides[n + 1];
    assert.match(html, new RegExp(`class="num">${n + 1}<`), `slide ${n + 2} must be numbered ${n + 1}`);
    assert.match(html, new RegExp(`class="point">${pt}<`), `slide ${n + 2} must carry point ${n + 1}`);
    assert.doesNotMatch(html, /class="hook"/, 'a point slide must not also be the cover');
  }
  ok('slide 1 is the cover, 2-4 are the three points in order');

  assert.match(slides[4], /class="question">Bạn thích món nào\?</);
  assert.match(slides[4], /Đọc bài viết đầy đủ/);
  assert.match(slides[4], /class="url">lagi\.example\/blog</, 'the CTA shows the site without its scheme');
  assert.doesNotMatch(slides[4], /class="num"/, 'the CTA slide must not look like a point');
  ok('slide 5 is the CTA with the scheme-stripped site URL');
  assert.equal(new Set(slides).size, 5, 'no two slides may be the same document');
}

// ── a short script still renders a full deck ─────────────────────────
{
  const slides = deck(JOB, { hook: 'Một ý duy nhất', points: ['Ý đầu tiên'], question: 'Thử chưa?' });
  assert.equal(slides.length, 5);
  assert.match(slides[1], /class="point">Ý đầu tiên</);
  for (const i of [2, 3]) assert.match(slides[i], /class="point">Đọc bài viết để xem đầy đủ</, `slide ${i + 1} must be padded`);
  ok('fewer than three points still yields a 5-slide deck');
}

// ── brand accent, and its fallback ───────────────────────────────────
{
  assert.match(deck()[0], /#e8590c/, 'the project accent drives the slide palette');
  assert.match(composeCarouselSlideHtml({ ...JOB, project: { name: 'Blog' } }, SCRIPT, 0), /#1677ff/,
    'a project without an accent must fall back to the agent default');
  ok('brand accent is applied, with a default when the project has none');
}

// ── untrusted text ───────────────────────────────────────────────────
{
  const hostile = deck(JOB, { ...SCRIPT, hook: '<script>alert(1)</script>', points: ['a"><img src=x>'] });
  for (const html of hostile) assert.doesNotMatch(html, /<script/i, 'article text must not become markup');
  assert.match(hostile[0], /&lt;script&gt;/);
  assert.match(hostile[1], /&quot;&gt;&lt;img/);
  ok('hook and point text is escaped into the markup');
}

// ── determinism ──────────────────────────────────────────────────────
{
  const again = deck();
  for (const [i, html] of deck().entries()) assert.equal(html, again[i], `slide ${i + 1} must be reproducible`);
  assert.equal(composeCarouselSlideHtml(JOB, SCRIPT, 99), composeCarouselSlideHtml(JOB, SCRIPT, 0),
    'an out-of-range index must fall back to the cover rather than render nothing');
  ok('the same job always composes the same slide');
}

// ── per-slide photo queries ──────────────────────────────────────────
{
  const cover = slideQueries(JOB, SCRIPT, 0);
  assert.equal(cover[0], 'restaurant menu', 'the cover searches for the hook concept');
  assert.equal(cover.at(-1), 'small business', 'the generic fallback is always last');
  const cta = slideQueries(JOB, SCRIPT, 4);
  assert.equal(cta[0], 'restaurant', 'the CTA falls back to the article topic');
  assert.notDeepEqual(cover, cta, 'slides must search for different photos');
  for (const i of [0, 1, 2, 3, 4]) {
    const qs = slideQueries({ title: 'x' }, { hook: '', points: [], question: '' }, i);
    assert.ok(qs.length && qs.every(Boolean), `slide ${i + 1} must always have a query`);
    assert.equal(new Set(qs).size, qs.length, 'a slide must not retry the same query');
  }
  ok('each slide derives its own photo query from the script');
}

console.log('\n--- Carousel render path (temp workspace · fake snapshot · fake deliver) ---\n');

const RENDER_JOB = {
  id: 'vj_carousel',
  kind: 'carousel',
  slug: 'alpha-post',
  title: '5 địa điểm ăn sáng ngon ở Lagi',
  meta_description: 'Quán ăn sáng ở Lagi',
  body_markdown: '## Bánh canh cá lóc 25k no căng\n## Bánh căn nướng than hoa\n## Cà phê sân vườn ven sông',
  hero_image_base64: Buffer.from('hero-bytes').toString('base64'),
  project: JOB.project,
};

// The deck the platform names carousel/<slug>-1..5.png, in the order the
// agent snapshots it. `marker` is what must appear in the HTML handed to
// hyperframes for that slide.
const DECK = [
  { key: carouselSlideKey(carouselPrefix(RENDER_JOB.slug), 1), marker: 'class="hook">5 địa điểm ăn sáng ngon ở Lagi' },
  { key: carouselSlideKey(carouselPrefix(RENDER_JOB.slug), 2), marker: 'class="num">1<' },
  { key: carouselSlideKey(carouselPrefix(RENDER_JOB.slug), 3), marker: 'class="num">2<' },
  { key: carouselSlideKey(carouselPrefix(RENDER_JOB.slug), 4), marker: 'class="num">3<' },
  { key: carouselSlideKey(carouselPrefix(RENDER_JOB.slug), 5), marker: 'Đọc bài viết đầy đủ' },
];

// One render run: real filesystem in a temp workspace, everything outside
// the process faked.
function rig({ failAt = 0, emptyAt = 0, photoFails = false, deliverResult = { ok: true, status: 200, body: { status: 'done', prefix: carouselPrefix(RENDER_JOB.slug) } } } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'video-agent-'));
  const seen = { snapshots: [], photos: [], delivers: [] };
  const deps = {
    work,
    spawn(cmd, args, opts) {
      // The carousel path runs exactly one kind of subprocess. Anything else
      // means the job was routed somewhere it does not belong.
      if (!args.includes('snapshot')) throw new Error(`carousel rig got a non-snapshot call: ${cmd} ${args.join(' ')}`);
      seen.snapshots.push({ cmd, args, cwd: opts?.cwd, html: readFileSync(join(opts.cwd, 'index.html'), 'utf8') });
      const n = seen.snapshots.length;
      if (n === failAt) return { status: 1, stderr: 'chrome exploded', stdout: '' };
      const dir = join(opts.cwd, 'snapshots');
      mkdirSync(dir, { recursive: true });
      if (n !== emptyAt) writeFileSync(join(dir, `frame-${n}.png`), Buffer.from(`png-${n}`));
      return { status: 0, stdout: '', stderr: '' };
    },
    async photo(query) {
      seen.photos.push(query);
      if (photoFails) throw new Error('openverse_no_result');
      return { bytes: Buffer.from(`photo-${seen.photos.length}`), credit: { license: 'cc0' } };
    },
    async deliver(path, opts) {
      seen.delivers.push({ path, headers: opts.headers, body: JSON.parse(opts.body) });
      return { ok: deliverResult.ok, status: deliverResult.status, json: async () => deliverResult.body };
    },
  };
  return { work, seen, deps, done: () => rmSync(work, { recursive: true, force: true }) };
}

const run = (r) => silently(() => renderCarousel(RENDER_JOB, r.deps));

// ── the happy path ───────────────────────────────────────────────────
{
  const r = rig();
  await run(r);

  assert.equal(r.seen.snapshots.length, 5, 'exactly one snapshot per slide');
  for (const [i, s] of r.seen.snapshots.entries()) {
    assert.equal(s.cmd, 'npx');
    assert.ok(s.args.includes('snapshot'), 'the hyperframes snapshot subcommand');
    assert.equal(s.cwd, r.work, 'hyperframes must run inside the job workspace');
    assert.ok(s.html.includes(DECK[i].marker), `${DECK[i].key} must be rendered from slide ${i + 1}`);
    assert.ok(s.html.includes(`src="assets/slide-${i}.jpg"`), 'each slide must use its own photo');
  }
  ok('five snapshots, in deck order, each rendering its own slide and photo');

  assert.equal(r.seen.delivers.length, 1, 'one deliver call');
  const [post] = r.seen.delivers;
  assert.equal(post.path, '/api/admin/video/carousel-deliver');
  assert.equal(post.body.job_id, RENDER_JOB.id);
  assert.deepEqual(
    post.body.slides,
    [1, 2, 3, 4, 5].map((n) => Buffer.from(`png-${n}`).toString('base64')),
    'the slides must arrive in snapshot order — the platform names them -1..-5 from it',
  );
  ok('deliver posts all five slides, in order, under the job id');

  assert.equal(r.seen.photos.length, 5, 'one fetch per slide — the loop stops at the first query that hits');
  for (let i = 0; i < 5; i++) {
    assert.equal(readFileSync(join(r.work, 'assets', `slide-${i}.jpg`), 'utf8'), `photo-${i + 1}`,
      `slide ${i + 1} must carry the photo fetched for it, not another slide's`);
  }
  assert.ok(existsSync(join(r.work, 'assets', 'hero.jpg')), 'the article hero is written as the fallback background');
  ok('each slide keeps the photo fetched for it');
  r.done();
}

// ── the offline script and a photo host that fails ───────────────────
{
  const r = rig({ photoFails: true });
  await run(r);

  assert.equal(r.seen.snapshots.length, 5, 'a failed photo must not shrink the deck');
  assert.equal(r.seen.delivers[0].body.slides.length, 5);
  assert.ok(!existsSync(join(r.work, 'assets', 'slide-0.jpg')), 'no photo means no slide image');
  assert.ok(r.seen.snapshots[0].html.includes('src="assets/hero.jpg"'), 'the deck falls back to the article hero');
  assert.ok(r.seen.snapshots[0].html.includes(`class="hook">${RENDER_JOB.title}<`),
    'without GuRouter the hook is the article title');
  assert.ok(r.seen.snapshots[3].html.includes('class="num">3<'), 'the three headings become the three points');
  ok('an offline script and a dead photo host still produce a full deck');
}

// ── a broken deck stops before it is published ───────────────────────
for (const [label, opts, expected] of [
  ['the snapshot process exits non-zero', { failAt: 3 }, /snapshot slide 3 failed: chrome exploded/],
  ['the snapshot process writes no PNG', { emptyAt: 2 }, /snapshot produced no PNG for slide 2/],
]) {
  const r = rig(opts);
  await assert.rejects(() => run(r), expected, label);
  assert.equal(r.seen.delivers.length, 0, 'a broken deck must never reach the platform');
  assert.equal(r.seen.snapshots.length, opts.failAt || opts.emptyAt, 'the loop must stop at the failing slide');
  r.done();
}
ok('a failed snapshot aborts the run before any deliver');

// ── a rejected deliver is a failure, not a quiet success ─────────────
for (const [label, deliverResult] of [
  ['a non-2xx response', { ok: false, status: 500, body: {} }],
  ['a 200 that did not deliver', { ok: true, status: 200, body: { ok: false, error: 'bad_slide' } }],
]) {
  const r = rig({ deliverResult });
  await assert.rejects(() => run(r), /carousel deliver failed: HTTP/, label);
  assert.equal(r.seen.snapshots.length, 5, 'the deck was rendered before the deliver failed');
  r.done();
}
ok('a rejected deliver fails the job instead of reporting success');

console.log('\n--- renderOne: what actually reaches deliver ---\n');

// Only hyperframes is faked here. Every ffmpeg/ffprobe the agent runs on the
// way (the bed, TTS durations, the loudness master) is the real tool, so the
// bytes handed to deliver are a real, measurable MP4 rather than a call order
// this test asserted to itself.
const POST_JOB = {
  id: 'vj_post',
  kind: 'post',
  slug: 'alpha-post',
  title: '5 địa điểm ăn sáng ngon ở Lagi',
  meta_description: 'Quán ăn sáng ở Lagi',
  body_markdown: '## Bánh canh cá lóc 25k no căng\n## Bánh căn nướng than hoa\n## Cà phê sân vườn ven sông',
  project: { name: 'Lagi Food', accent: '#e8590c', publishing_url: 'https://lagi.example/blog' },
};
const POST_SCRIPT = {
  hook: 'Bữa sáng ở Lagi có gì?',
  points: ['Bánh canh 25k', 'Bánh căn than hoa', 'Cà phê ven sông'],
  question: 'Bạn thử món nào rồi?',
};
const POST_SECONDS = 9.6;

// `raw` decides what the faked render leaves behind, i.e. the ways the master
// can fail: a mix with audio, a silent picture, an unreadable file.
function postRig({ raw = 'quiet', renderFails = false, checkFails = false } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'render-one-'));
  const seen = { spawns: [], delivers: [] };
  const deps = {
    work,
    spawn(cmd, args, opts) {
      seen.spawns.push({ cmd, args, cwd: opts?.cwd });
      if (cmd === 'edge-tts') {
        // At the voice's real pace, so a segment's audio length tracks the
        // words it was given instead of a constant that would let a clipped
        // response pass for a whole one.
        const words = wordCount(args[args.indexOf('--text') + 1] || '');
        spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=f=440:d=${Math.max(0.6, words / 3)}`,
          '-b:a', '128k', args[args.indexOf('--write-media') + 1]]);
        return { status: 0, stdout: '', stderr: '' };
      }
      if (cmd === 'sleep') return { status: 0, stdout: '', stderr: '' };
      if (cmd === 'npx') {
        if (args.includes('check') && checkFails) return { status: 1, stdout: '', stderr: 'layout check failed' };
        if (args.includes('render') && renderFails) return { status: 1, stdout: '', stderr: 'chrome exploded' };
        const renders = join(opts.cwd, 'renders');
        mkdirSync(renders, { recursive: true });
        const out = join(renders, 'post_2026-01-01_00-00-00.mp4');
        if (raw === 'corrupt') writeFileSync(out, Buffer.from('not an mp4'));
        else spawnSync('ffmpeg', ['-v', 'error', '-y',
          '-f', 'lavfi', '-i', `color=c=navy:s=64x64:d=${POST_SECONDS}`,
          // Level matched to a real hyperframes render of this composition
          // (-29 LUFS): what the master is asked to fix, not an easier number.
          ...(raw === 'silent-video' ? [] : ['-f', 'lavfi', '-i', `sine=f=220:d=${POST_SECONDS}`, '-af', 'volume=-7dB']),
          '-c:v', 'mpeg4', '-q:v', '31', '-c:a', 'aac', '-b:a', '128k', '-shortest', out]);
        return { status: 0, stdout: 'render complete', stderr: '' };
      }
      throw new Error(`unexpected subprocess: ${cmd} ${args.join(' ')}`);
    },
    async deliver(path, opts) {
      seen.delivers.push({ path, header: opts.headers['x-video-job'], body: opts.body });
      return { ok: true, status: 200, json: async () => ({ status: 'done', video_key: 'video/alpha-post.mp4' }) };
    },
  };
  const renders = () => join(work, 'renders');
  return {
    work, seen, deps,
    raws: () => readdirSync(renders()).filter((f) => f !== 'master.mp4'),
    master: () => join(renders(), 'master.mp4'),
    done: () => rmSync(work, { recursive: true, force: true }),
  };
}

if (!HAS_FFMPEG) {
  console.log('… renderOne checks skipped: no ffmpeg on this machine');
} else {
  // ── the file that reaches the platform is the master ───────────────
  {
    const r = postRig();
    scriptStub = POST_SCRIPT;
    await silently(() => renderOne(POST_JOB, r.deps));
    scriptStub = null;

    const [post] = r.seen.delivers;
    assert.equal(r.seen.delivers.length, 1, 'one deliver call');
    assert.equal(post.path, '/api/admin/video/deliver');
    assert.equal(post.header, POST_JOB.id, 'the bytes travel under the job id');
    assert.ok(r.seen.spawns.some((s) => s.cmd === 'npx' && s.args.includes('render')), 'the render ran');
    assert.ok(r.seen.spawns.some((s) => s.cmd === 'npx' && s.args.includes('check') && s.args.includes('--at-transitions')),
      'the check samples transition seams before render');

    const raws = r.raws();
    assert.equal(raws.length, 1, 'the render left one raw mp4 behind');
    const rawFile = join(r.work, 'renders', raws[0]);
    assert.ok(existsSync(r.master()), 'a master was written next to the render');
    // Compared with equals() and a size, never deepEqual(): asserting on two
    // multi-hundred-KB buffers makes the *failure* path diff them, which is
    // how this suite got OOM-killed instead of reporting the regression.
    assert.equal(post.body.length, statSync(r.master()).size, 'the delivered size is the master\'s, not the render\'s');
    assert.ok(post.body.equals(readFileSync(r.master())), 'deliver must carry the master, not the render');
    assert.ok(statSync(r.master()).mtimeMs >= statSync(rawFile).mtimeMs, 'mastering happens after the render');

    const sent = join(r.work, 'sent.mp4');
    writeFileSync(sent, post.body);
    const rawLoud = integrated(rawFile), sentLoud = integrated(sent);
    assert.ok(rawLoud.i < -24, `the render is quiet as rendered (${rawLoud.i} LUFS)`);
    assert.ok(Math.abs(sentLoud.i - LOUDNESS.i) <= 1, `what was delivered is mastered (${sentLoud.i} LUFS)`);
    assert.ok(sentLoud.tp <= LOUDNESS.tp + 0.1, `and under the ceiling (${sentLoud.tp} dBTP)`);
    ok('renderOne masters after the render and delivers the master, not the render');
    r.done();
  }

  // ── a mix that cannot be mastered is never a silent surprise ───────
  for (const [label, raw] of [
    ['a picture with no audio', 'silent-video'],
    ['a file ffmpeg cannot read', 'corrupt'],
  ]) {
    const r = postRig({ raw });
    scriptStub = POST_SCRIPT;
    const lines = await captureLogs(() => renderOne(POST_JOB, r.deps));
    scriptStub = null;

    const [post] = r.seen.delivers;
    assert.equal(post.path, '/api/admin/video/deliver', label);
    assert.ok(post.body.equals(readFileSync(join(r.work, 'renders', r.raws()[0]))), `${label}: the render goes out as rendered`);
    assert.ok(!existsSync(r.master()), `${label}: no master was produced`);
    assert.ok(lines.some((l) => /loudness master skipped/.test(l)), `${label}: the skip is reported, not silent`);
    r.done();
  }
  ok('an unmasterable mix is delivered as rendered and the skip is logged, never silent');

  // ── a failed layout check blocks render and deliver ───────────────
  {
    const r = postRig({ checkFails: true });
    scriptStub = POST_SCRIPT;
    try {
      await assert.rejects(() => renderOne(POST_JOB, r.deps), /hyperframes check failed/,
        'layout validation must block a bad composition');
    } finally {
      scriptStub = null;
    }
    assert.ok(r.seen.spawns.some((s) => s.cmd === 'npx' && s.args.includes('check')), 'check ran');
    assert.ok(!r.seen.spawns.some((s) => s.cmd === 'npx' && s.args.includes('render')), 'render was not attempted');
    assert.equal(r.seen.delivers.length, 0, 'no bytes were delivered');
    r.done();
  }
  ok('a failed HyperFrames check stops before render and delivery');

  // ── a carousel job still takes the carousel path ───────────────────
  {
    const r = rig();
    scriptStub = POST_SCRIPT; // armed, so a fall-through fails on the carousel contract, not on the network
    await silently(() => renderOne(RENDER_JOB, r.deps));
    scriptStub = null;
    assert.equal(r.seen.snapshots.length, 5, 'five snapshots, reached through renderOne');
    assert.equal(r.seen.delivers[0].path, '/api/admin/video/carousel-deliver');
    assert.ok(!existsSync(join(r.work, 'renders')), 'a carousel renders no video, so there is nothing to master');
    r.done();
  }
  ok('renderOne routes a carousel job down the carousel path — no video, no master');
}

// ── the post video's music bed ───────────────────────────────────────
// A bed nobody can hear is the bug this guards. Measured on a real
// hyperframes render, the original bed landed 31 LU under the voice — the
// rendered video then measures the same as one with no music — because
// amix divided the three sines by three and the chord sat below what a
// phone speaker reproduces. So: level, and energy in the band that
// actually leaves a phone.
if (!HAS_FFMPEG) {
  console.log('… music-bed checks skipped: no ffmpeg on this machine');
} else {
  const TOTAL = 9.6;
  const dir = mkdtempSync(join(tmpdir(), 'bgm-'));
  const bed = makeBgm(TOTAL, 'alpha-post-post', join(dir, 'bgm.mp3'));
  assert.ok(bed && existsSync(bed), 'makeBgm must produce a bed');

  const maxDb = (filters) => {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', bed, '-af', filters, '-f', 'null', '-'], { encoding: 'utf8' });
    return Number((r.stderr.match(/max_volume: (-?[\d.]+) dB/) || [])[1]);
  };
  const peak = maxDb('volumedetect');
  assert.ok(peak >= -26, `the bed must be mastered to be heard, not whispered (peaks at ${peak} dBFS)`);
  const speechBand = maxDb('highpass=f=400,lowpass=f=2000,volumedetect');
  assert.ok(speechBand >= -30, `the bed must carry energy a phone speaker reproduces, 400-2000 Hz (peaks at ${speechBand} dBFS)`);
  ok('the music bed is loud enough to hear under the voice (level + phone band)');

  const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', bed], { encoding: 'utf8' }).stdout);
  assert.ok(Math.abs(dur - TOTAL) < 0.2, `the bed must span the video (${dur}s for ${TOTAL}s)`);
  ok('the bed spans the whole video');

  // ── operator-chosen music ──────────────────────────────────────────
  // A catalog track is longer than the video and denser than the pad:
  // cutBgm must loop-or-trim it to the video length and the fades must
  // land — a bed that ends mid-phrase or outlasts the video is the bug
  // this guards. Source: a 4s tone, far shorter than TOTAL.
  const srcDir = mkdtempSync(join(tmpdir(), 'bgm-src-'));
  const src4s = join(srcDir, 'src.mp3');
  spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-b:a', '128k', src4s], { encoding: 'utf8' });
  const cut = cutBgm(src4s, TOTAL, join(srcDir, 'cut.mp3'));
  assert.ok(cut && existsSync(cut), 'cutBgm must produce a bed from a real track');
  const cutDur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', cut], { encoding: 'utf8' }).stdout);
  assert.ok(Math.abs(cutDur - TOTAL) < 0.6,
    `a 4s track must loop up to the video length (${cutDur}s for ${TOTAL}s)`);
  // The out-fade must have bitten: the last 0.5s is far under the middle.
  const rmsOf = (file, ss, t) => {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-ss', String(ss), '-t', String(t), '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
    return Number((r.stderr.match(/mean_volume: (-?[\d.]+) dB/) || [])[1]);
  };
  assert.ok(rmsOf(cut, TOTAL - 0.5, 0.4) < rmsOf(cut, TOTAL / 2, 0.4) - 6,
    'the chosen track must fade out under the ending, not stop flat');
  ok('a catalog track is looped/trimmed to the video with real fades');

  // prepareBgm is the one decision point: 'none' mutes, a fetchable URL
  // becomes the bed, an unreachable one degrades to voice-only. fetch is
  // stubbed to refuse network for the whole suite — for the fetchable
  // case, swap in a local response carrying real MP3 bytes and put the
  // stub back after.
  const pWork = mkdtempSync(join(tmpdir(), 'bgm-job-'));
  assert.equal(await prepareBgm({ bgm: null }, TOTAL, pWork), null,
    'a missing catalog URL never falls back to a synthetic pad');
  assert.equal(await prepareBgm({ bgm: 'none' }, TOTAL, pWork), null,
    "'none' must mute the bed, not fall back to the pad");

  const noNet = globalThis.fetch;
  const trackBytes = readFileSync(src4s);
  const fetchLogs = [];
  globalThis.fetch = async () => ({
    ok: true,
    headers: { get: () => 'audio/mpeg' },
    arrayBuffer: async () => trackBytes.buffer.slice(trackBytes.byteOffset, trackBytes.byteOffset + trackBytes.byteLength),
  });
  try {
    const fetched = await prepareBgm(
      { bgm: 'serene-view', bgm_url: 'https://agent.test/image/music/serene-view.mp3', slug: 's', kind: 'post' },
      TOTAL, pWork, (m) => fetchLogs.push(m));
    assert.ok(fetched && existsSync(fetched), 'a fetchable track becomes the bed');
    assert.ok(fetchLogs.some((m) => m.includes('serene-view')),
      'the log must name the chosen track, so a pad fallback cannot masquerade as it');
  } finally {
    globalThis.fetch = noNet;
  }

  // A dead URL degrades to voice-only, loudly logged, never to a synthetic pad.
  const logs = [];
  rmSync(join(pWork, 'assets', 'bgm.mp3'), { force: true });
  const fellBack = await prepareBgm(
    { bgm: 'x', bgm_url: 'https://agent.test/image/music/gone.mp3', slug: 's', kind: 'post' }, TOTAL, pWork, (m) => logs.push(m));
  assert.equal(fellBack, null, 'a dead track URL returns voice-only');
  assert.ok(logs.some((m) => m.includes('voice only')), 'the voice-only fallback is logged, not silent');
  rmSync(srcDir, { recursive: true, force: true });
  rmSync(pWork, { recursive: true, force: true });
  ok('prepareBgm: none mutes, a fetched track mixes, a dead URL returns voice-only');

  rmSync(dir, { recursive: true, force: true });

  // ── the finished mix at social loudness ────────────────────────────
  // The composition is deliberately restrained (voice + bed at the gain
  // above), which is why a real render lands around -29 LUFS. Delivered
  // as-is it plays back faint in-feed, so the mixed file is mastered to
  // -14 LUFS. And mastered by *one* gain: ffmpeg's loudnorm only honours
  // `linear=true` while the source's measured LRA is non-zero and the gain
  // fits under the TP ceiling, silently going dynamic — and pumping the
  // bed through every pause in the voice — otherwise.
  const mixDir = mkdtempSync(join(tmpdir(), 'loudness-'));
  const mix = join(mixDir, 'mix.m4a');
  // Narration with pauses, over the real bed at its documented gain — the
  // structure a dynamic normalizer would pump, starting ~15 LU too quiet.
  spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i',
    `aevalsrc=0.06*sin(2*PI*220*t)*lt(mod(t\\,1.5)\\,0.9):d=${TOTAL}:s=48000`,
    '-i', makeBgm(TOTAL, 'alpha-post-post', join(mixDir, 'bed.mp3')),
    '-filter_complex', '[0]aformat=channel_layouts=mono[v];[1]volume=0.12[m];[v][m]amix=inputs=2:normalize=0[a]',
    '-map', '[a]', '-c:a', 'aac', '-b:a', '192k', mix], { encoding: 'utf8' });

  // The dB each window of the file moved by. One gain is a flat line here;
  // a dynamic normalizer diverges wherever the voice is not talking.
  const gainSpread = (before, after, winSec = 0.4) => {
    const rms = (file) => {
      const { stdout } = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
      const w = Math.round(winSec * 48000), out = [];
      for (let s = 0; s + w <= stdout.length / 4; s += w) {
        let acc = 0;
        for (let n = s; n < s + w; n++) { const v = stdout.readFloatLE(4 * n); acc += v * v; }
        out.push(Math.sqrt(acc / w));
      }
      return out;
    };
    const a = rms(before), b = rms(after);
    const gains = a.map((v, n) => (v > 1e-4 && b[n] > 1e-4 ? 20 * Math.log10(b[n] / v) : null)).filter((g) => g !== null);
    return { windows: gains.length, spread: Math.max(...gains) - Math.min(...gains) };
  };

  const raw = integrated(mix);
  const master = masterLoudness(mix, join(mixDir, 'master.m4a'));
  assert.ok(master && existsSync(master), 'the finished mix must be mastered, not delivered as rendered');
  const done = integrated(master);
  assert.ok(raw.i < LOUDNESS.i - 10, `the mix as rendered is quiet (${raw.i} LUFS)`);
  assert.ok(Math.abs(done.i - LOUDNESS.i) <= 1, `the master must hit ${LOUDNESS.i} LUFS (measured ${done.i})`);
  assert.ok(done.tp <= LOUDNESS.tp + 0.1, `the master must stay under ${LOUDNESS.tp} dBTP (measured ${done.tp})`);
  ok('the finished mix is mastered to social loudness');

  const gains = gainSpread(mix, master);
  assert.ok(gains.windows >= 10, 'enough windows to see a gain that moves');
  assert.ok(gains.spread <= 0.3, `one gain across the whole mix — a spread of ${gains.spread.toFixed(2)} dB means the bed was pumped`);
  ok('the master is one constant gain, so the voice-to-bed balance is untouched');

  // A mix whose peaks already sit near full scale cannot reach -14 without
  // clipping, so the gain is capped below the ceiling: the waveform is
  // never sacrificed to the loudness number.
  const peaky = join(mixDir, 'peaky.m4a');
  spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i',
    `aevalsrc=0.95*sin(2*PI*220*t)*lt(mod(t\\,3)\\,0.05):d=${TOTAL}:s=48000`,
    '-c:a', 'aac', '-b:a', '192k', peaky], { encoding: 'utf8' });
  const capped = integrated(masterLoudness(peaky, join(mixDir, 'peaky-master.m4a')));
  assert.ok(capped.tp <= LOUDNESS.tp + 0.1, `never above ${LOUDNESS.tp} dBTP (measured ${capped.tp})`);
  assert.ok(capped.i <= LOUDNESS.i, `left under target rather than clipped (measured ${capped.i} LUFS)`);
  ok('a mix with no headroom is capped at the ceiling, never clipped past it');

  const silent = join(mixDir, 'silent.m4a');
  spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '1', silent], { encoding: 'utf8' });
  assert.equal(masterLoudness(silent, join(mixDir, 'silent-master.m4a')), null,
    'a mix with nothing to measure is left alone instead of failing the job');
  ok('an unmeasurable mix is passed through, not mastered into silence');
  rmSync(mixDir, { recursive: true, force: true });
}

// The composition is what puts the bed under the voice — at the gain the
// level above is tuned for, and only when there is a bed at all.
{
  const bedStory = { intent: 'educational', duration: 20, scenes: [
    { type: 'hook', text: 'a', say: 'a', duration: 4 },
    { type: 'cta', text: 'b', say: 'b', duration: 4 },
  ] };
  const segs = [2, 2];
  const withBed = composeStoryboardHtml(JOB, bedStory, segs, {}, null, '/tmp/bgm.mp3');
  assert.match(withBed, /<audio id="bgm" class="clip" data-start="0" data-duration="8\.00" data-volume="0\.12" data-track-index="6" src="assets\/bgm\.mp3"><\/audio>/,
    'the bed must be a full-length track on its own channel at the documented gain');
  assert.doesNotMatch(composeStoryboardHtml(JOB, bedStory, segs, {}, null, null), /assets\/bgm\.mp3/,
    'no bed means no music track');
  ok('the composition carries the bed at the documented gain, and only when there is one');
}

// ── scene renderers: what each scene actually draws ──────────────────
// The vocabulary is the difference between a video and a slide deck, so the
// checks are on the markup that puts pixels on screen — not on the class
// name alone — and every string in every scene is untrusted.
console.log('\n--- Scene renderers (graphics · device · photo · map) ---\n');

const SCENE_JOB = {
  id: 'vj_scene', kind: 'post', slug: 'giam-chi-phi-bao-bi',
  title: 'Giảm chi phí bao bì',
  body_markdown: 'Chi phí bao bì chiếm 12% doanh thu. Vận chuyển chỉ 7%. 65% shop đã đổi sang hộp giấy.',
  project: { name: 'Lagi Food', accent: '#e8590c', publishing_url: 'https://lagi.example/blog' },
};
const ASSETS = { 'site:0': 'assets/site0.png', hero: 'assets/hero.jpg', map: 'assets/map.jpg', logo: 'assets/logo.png' };

{
  // Graphics belong to lessons. Each is asserted on the markup that draws.
  const html = [
    sceneInner({ type: 'bars', text: 'Chi phí', items: [{ label: 'Bao bì', value: 12 }, { label: 'Vận chuyển', value: 7 }] }, '#e8590c'),
    sceneInner({ type: 'donut', text: 'Đã đổi', value: 65 }, '#e8590c'),
    sceneInner({ type: 'steps', text: 'Các bước', items: [{ label: 'Đo hộp' }] }, '#e8590c'),
    sceneInner({ type: 'icons', text: 'Điểm chính', items: [{ icon: 'shield', label: 'Bền' }] }, '#e8590c'),
    sceneInner({ type: 'compare', text: 'Nên tránh', left: { title: 'Nên', items: ['Hộp 1 lớp'] }, right: { title: 'Tránh', items: ['Hộp 3 lớp'] } }, '#e8590c'),
    sceneInner({ type: 'quote', text: 'Đổi hộp là cách rẻ nhất' }, '#e8590c'),
  ].join('');
  assert.match(html, /class="bar-fill" style="width:100%/, 'the largest bar fills the track');
  assert.match(html, /class="bar-fill" style="width:58%/, 'and the others scale against it (7 of 12)');
  assert.match(html, /<svg viewBox="0 0 320 320"[\s\S]*stroke-dasharray="/, 'the donut is a drawn arc');
  assert.match(html, /class="donut-n">65%</, 'with the value in the middle');
  assert.match(html, /class="step-n" style="background:#e8590c">1</, 'steps are numbered in the brand colour');
  assert.match(html, /data-icon="shield"/, 'the icon grid draws real icons');
  assert.match(html, /class="cmp-m good"[\s\S]*class="cmp-m bad"/, 'a comparison shows both sides');
  assert.match(html, /class="quote-mark"/, 'and the quote card is a quote');
  // 608px of content width: a seven-character number at the 150px step
  // would run off the frame, so length has to choose the size.
  assert.ok(statSize('1.250.000') < statSize('40'), 'a long number steps down so it cannot overflow the frame');
  assert.equal(sceneInner({ type: 'not-a-scene' }, '#fff'), '', 'an unknown scene draws nothing instead of throwing');
  ok('every graphic scene draws its own graphic, not just text');
}

{
  // The visual scenes are the point of the rework: a video about a product
  // has to show the product. Each one is asserted on the asset it embeds.
  assert.match(sceneInner({ type: 'ui_demo', text: 'Website 2 phút', asset: 'site:0' }, '#e8590c', ASSETS),
    /class="device-shot" src="assets\/site0\.png"/, 'a demo puts the real screenshot inside the phone frame');
  assert.match(sceneInner({ type: 'ui_demo', text: 'x' }, '#e8590c', {}), /class="claim"/,
    'a demo with no screenshot degrades to the claim rather than a broken frame');
  assert.match(sceneInner({ type: 'before_after', text: 'Thay đổi', asset: 'hero', asset2: 'site:0' }, '#e8590c', ASSETS),
    /assets\/hero\.jpg[\s\S]*assets\/site0\.png/, 'before/after shows both real images');
  const oneSided = sceneInner({ type: 'before_after', text: 'x', asset: 'hero' }, '#e8590c', ASSETS);
  assert.equal((oneSided.match(/class="ba-img"/g) || []).length, 1,
    'one-sided before/after does not duplicate the first image');
  assert.match(oneSided, /class="ba-empty"/, 'the missing side is explicit instead of fabricated');
  assert.match(sceneInner({ type: 'location', text: '12 Lê Lợi', asset: 'map' }, '#e8590c', ASSETS),
    /class="loc-map"><img src="assets\/map\.jpg"/, 'a location scene embeds the captured map');
  assert.match(sceneInner({ type: 'rating', text: 'Khách rất hài lòng', value: 5 }, '#e8590c', ASSETS),
    /class="stars"/, 'a rating draws stars');
  assert.match(sceneInner({ type: 'product_reveal', text: 'Gulagi' }, '#e8590c', ASSETS),
    /class="reveal-logo" src="assets\/logo\.png"/, 'a product reveal uses the brand logo when there is one');
  assert.match(sceneInner({ type: 'result', text: 'Khách đặt bàn online', value: 30, unit: ' ngày' }, '#e8590c', ASSETS),
    /class="res-n"[\s\S]*>30</, 'a result shows the real number when the source had one');
  assert.match(sceneInner({ type: 'cta', text: 'Thử miễn phí', url: 'https://gulagi.com' }, '#e8590c', ASSETS),
    /class="outro">Thử miễn phí<\/p><p class="sub">gulagi\.com/, 'a CTA carries one action and the site');
  assert.match(sceneInner({ type: 'photo', text: 'Quán ven sông' }, '#e8590c', ASSETS), /class="photo-cap"/,
    'a photo scene is a caption over the picture');
  const degradedComparison = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'Mở đầu' },
      { type: 'before_after', text: 'So sánh', asset: 'hero' },
      { type: 'cta', text: 'Kết' },
    ],
  }, { intent: 'before_after', target: 60, assets: { hero: 'hero.jpg' } });
  assert.equal(degradedComparison.storyboard.scenes[1].type, 'ui_demo',
    'one-sided before/after degrades before rendering');
  assert.ok(degradedComparison.dropped.some((d) => d.reason === 'before_after_needs_distinct_assets'));
  const completeComparison = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'Mở đầu' },
      { type: 'before_after', text: 'So sánh', asset: 'hero', asset2: 'site:0' },
      { type: 'cta', text: 'Kết' },
    ],
  }, { intent: 'before_after', target: 60, assets: { hero: 'hero.jpg', 'site:0': 'site.png' } });
  assert.equal(completeComparison.storyboard.scenes[1].type, 'before_after',
    'distinct assets preserve the comparison scene');
  const hostileKeys = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'Mở đầu' },
      { type: 'before_after', text: 'So sánh', asset: 'toString', asset2: 'toString' },
      { type: 'cta', text: 'Kết' },
    ],
  }, { intent: 'before_after', target: 60, assets: { hero: 'hero.jpg' } });
  assert.equal(hostileKeys.storyboard.scenes[1].type, 'ui_demo',
    'inherited object keys are not accepted as assets');
  assert.ok(hostileKeys.dropped.some((d) => d.reason === 'before_after_needs_distinct_assets'));
  assert.doesNotMatch(sceneInner({ type: 'ui_demo', text: 'Demo', asset: 'toString' }, '#e8590c', {}), /\[object/,
    'scene rendering never reads an inherited asset key');
  ok('the visual scenes embed real assets, and degrade instead of breaking');
}

{
  // Determinism is what makes a snapshot at any moment reproducible.
  const a = sceneInner({ type: 'ui_demo', text: 'Demo', asset: 'site:0' }, '#e8590c', ASSETS);
  const b = sceneInner({ type: 'ui_demo', text: 'Demo', asset: 'site:0' }, '#e8590c', ASSETS);
  assert.equal(a, b, 'the same scene must draw the same markup');
  assert.match(sceneInner({ type: 'bars', text: 'x', items: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }] }, '#e8590c'), /#e8590c/,
    'the project accent drives the palette');
  assert.match(sceneInner({ type: 'bars', text: 'x', items: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }] }), /#1677ff/,
    'a project with no accent falls back to the default');
  ok('the same scene always draws the same markup, with the brand accent');
}

{
  // Every string in a storyboard is model output derived from a source, so
  // every one of them is untrusted. Checked per scene and per field rather
  // than on one sample: a single unescaped label is enough to inject markup
  // into the page hyperframes renders.
  const hostile = [
    { type: 'hook', text: '<script>alert(1)</script>' },
    { type: 'problem', text: '<script>alert(2)</script>' },
    { type: 'product_reveal', text: '<script>alert(3)</script>' },
    { type: 'ui_demo', text: '<script>alert(4)</script>' },
    { type: 'feature', text: '<script>alert(5)</script>' },
    { type: 'result', text: '<script>alert(6)</script>', unit: '<script>alert(7)</script>' },
    { type: 'before_after', text: '<script>alert(8)</script>' },
    { type: 'photo', text: '<script>alert(9)</script>' },
    { type: 'location', text: '<script>alert(10)</script>' },
    { type: 'rating', text: '<script>alert(11)</script>' },
    { type: 'cta', text: '<script>alert(12)</script>', url: 'https://x/<script>alert(13)</script>' },
    { type: 'stat', value: 1, label: '<script>alert(14)</script>', unit: '<script>alert(15)</script>' },
    { type: 'bars', title: '<script>alert(16)</script>', items: [{ label: '<script>alert(17)</script>', value: 1 }] },
    { type: 'donut', value: 1, label: '<script>alert(18)</script>' },
    { type: 'line', title: '<script>alert(19)</script>', items: [{ label: '<script>alert(20)</script>', value: 1 }, { label: 'b', value: 2 }] },
    { type: 'steps', title: '<script>alert(21)</script>', items: [{ label: '<script>alert(22)</script>', detail: '<script>alert(23)</script>' }] },
    { type: 'timeline', title: '<script>alert(24)</script>', items: [{ label: '<script>alert(25)</script>', text: '<script>alert(26)</script>' }] },
    { type: 'icons', title: '<script>alert(27)</script>', items: [{ icon: 'star', label: '<script>alert(28)</script>' }] },
    { type: 'compare', title: '<script>alert(29)</script>', left: { title: '<script>alert(30)</script>', items: ['<script>alert(31)</script>'] }, right: { title: 'R', items: ['x'] } },
    { type: 'quote', text: '<script>alert(32)</script>', source: '<script>alert(33)</script>' },
  ];
  for (const scene of hostile) {
    assert.doesNotMatch(sceneInner(scene, '#e8590c', ASSETS), /<script/i,
      `${scene.type} must escape every string it draws`);
  }
  const composed = composeStoryboardHtml(SCENE_JOB,
    { intent: 'educational', duration: 20, scenes: [{ type: 'hook', text: '<script>alert(34)</script>', say: 'x', duration: 5 }, { type: 'cta', text: 'ok', say: 'y', duration: 5 }] },
    [2, 2], ASSETS);
  assert.match(composed, /&lt;script&gt;/, 'hostile text is escaped rather than dropped');
  // The shell legitimately carries its own <script> tags, so this looks for
  // the injected payload rather than for any script at all.
  assert.doesNotMatch(composed, /<script>alert/, 'and never reaches the rendered document as markup');
  ok('every field of every scene is escaped into the markup');
}

{
  // The composition contract hyperframes reads.
  const html = composeStoryboardHtml(SCENE_JOB,
    { intent: 'educational', duration: 20, scenes: [
      { type: 'hook', text: 'a', say: 'a', duration: 4 },
      { type: 'bars', text: 'b', say: 'b', duration: 5, items: [{ label: 'x', value: 12 }, { label: 'y', value: 7 }] },
      { type: 'cta', text: 'c', say: 'c', duration: 4 }] },
    [3, 3, 3], ASSETS, null, 'assets/bgm.mp3');

  assert.match(html, /^<!doctype html>/, 'the composition is a standalone document');
  assert.match(html, /width=720, height=1280/, 'a vertical video is 9:16 at 720x1280');
  assert.match(html, /data-width="720"[\s\S]*data-height="1280"/, 'and declares its composition size');
  assert.equal((html.match(/data-track-index="5"/g) || []).length, 3, 'exactly one narration track per scene');
  assert.match(html, /data-track-index="5" src="assets\/seg2\.mp3"/, 'in scene order');
  // `hyperframes check` reports a media element without an id as an error.
  // A render still plays it (measured), but the id is what the framework's
  // tooling uses as a stable edit target, so every one carries it.
  assert.equal((html.match(/<audio id="voice\d"/g) || []).length, 3, 'every narration track has an id');
  assert.match(html, /<audio id="bgm"/, 'and so does the bed');
  assert.match(html, /data-volume="0\.12" data-track-index="6" src="assets\/bgm\.mp3"/, 'the bed rides its own track');
  // A hook reads better over a photo; a chart must not, or the numbers stop
  // being readable.
  assert.match(html, /id="s0"[\s\S]*clip bgi[\s\S]*id="s1"/, 'the hook gets a full-bleed background');
  assert.doesNotMatch(html.slice(html.indexOf('id="s1"'), html.indexOf('id="s2"')), /clip bgi/,
    'the chart does not — a photo behind a chart is what makes it unreadable');
  assert.match(html, /tl\.seek\(0\)/, 'the timeline is seekable, so a snapshot at any moment is reproducible');

  // Ảnh thật luôn có camera move chậm. "motion" chọn zoom/pan/scroll/reveal;
  // cảnh không có ảnh chỉ nhận transition, không sinh selector ảnh rỗng.
  const moving = composeStoryboardHtml(SCENE_JOB, { intent: 'product_demo', duration: 20, scenes: [
    { type: 'hook', text: 'a', say: 'a', duration: 3, motion: 'zoom' },
    { type: 'ui_demo', text: 'b', say: 'b', duration: 5, asset: 'site:0', motion: 'scroll' },
    { type: 'cta', text: 'c', say: 'c', duration: 3 }] }, [2, 2, 2], ASSETS);
  assert.match(moving, /tl\.fromTo\("#s1 \.device-shot", \{ yPercent: 4, scale: 1\.12[^;]*yPercent: -22/,
    'a scroll demo glides slowly through the real screenshot');
  // The background is a SIBLING of the scene, so a zoom must name the scene's
  // own background id. The first version of this assertion pinned
  // `#s0 … .bgi img` — a selector that can never match — so it stayed green
  // while the zoom did nothing, and only `hyperframes check` (a GSAP "target
  // not found") caught it.
  const zoom = moving.match(/tl\.fromTo\("([^"]*)"[^;]*scale: 1\.16/);
  assert.ok(zoom, 'a zoom tween is emitted');
  assert.match(zoom[1], /#bg0 img/, 'it targets the scene\'s own background, which is a sibling');
  assert.doesNotMatch(zoom[1], /#s0 \.bgi/, 'never a descendant selector that cannot match');
  const ctaTimeline = moving.slice(moving.indexOf('tl.fromTo("#s2"'), moving.indexOf('window.__timelines'));
  assert.doesNotMatch(ctaTimeline, /scale: 1\.03[^;]*xPercent/,
    'a text-only CTA gets no invented camera target');
  assert.match(moving, /filter: "blur\(12px\)"/, 'scene handoffs share one soft blur transition');
  assert.match(moving, /tl\.fromTo\("#s1"[^\n]*duration: 0\.50/, 'incoming opacity resolves before the visual tail ends');
  assert.match(moving, /id="s1"[^>]*data-duration="5\.50"/,
    'the outgoing visual overlaps the incoming beat and holds 0.05s past the resolved fade');
  const logoMotion = composeStoryboardHtml(SCENE_JOB, { intent: 'product_demo', duration: 20, scenes: [
    { type: 'product_reveal', text: 'Gulagi', say: 'Gulagi', duration: 5, motion: 'zoom' },
    { type: 'cta', text: 'Kết', say: 'Kết', duration: 3 }] }, [2, 2], ASSETS, 'assets/logo.png');
  assert.match(logoMotion, /tl\.fromTo\("#s0 \.reveal-logo"/,
    'a fallback product logo receives the camera move too');
  // A video that stops moving stops being watched. On a real render,
  // freezedetect found ~55s of frozen frames, worst a 20s card that never
  // moved, because the chart scenes have no image to pan and got nothing at
  // all after their intro.
  const alive = composeStoryboardHtml(SCENE_JOB, { intent: 'educational', duration: 60, scenes: [
    { type: 'bars', text: 'Chi phí', say: 'Chi phí bao bì tăng', duration: 6, items: [{ label: 'Bao bì', value: 12 }, { label: 'Vận chuyển', value: 7 }] },
    { type: 'steps', text: 'Các bước', say: 'Ba bước để bắt đầu', duration: 6, items: [{ label: 'Một' }, { label: 'Hai' }] },
    { type: 'icons', text: 'Ý chính', say: 'Ba ý chính', duration: 6, items: [{ label: 'Một' }, { label: 'Hai' }] },
    { type: 'cta', text: 'Xem', say: 'Xem ngay', duration: 4 }] }, [3, 3, 3, 3], ASSETS);
  assert.match(alive, /#s0 \.bar-fill", \{ scaleX: 0 \}/,
    'bars grow instead of sitting at their final width');
  assert.match(alive, /#s0 \.bar-row.*stagger/s, 'and the rows arrive in sequence');
  assert.match(alive, /#s1 \.step", \{ opacity: 0, y: 26 \}/, 'steps rise one after another');
  assert.match(alive, /#s2 \.ig-ico", \{ rotation: -12/, 'icons pop rather than appearing flat');
  // Every scene eases in for its whole length, so the gap between beats is
  // never a still frame — this is what the freeze detector was measuring, and
  // the amplitude is pinned because a 1.4% breath measured 2/255 per frame,
  // which is technically moving and visually a freeze. It pushes the SCENE,
  // not the card: a photo keeps its picture outside the card, so a card-sized
  // push left the frame still, and a failed image left it still outright.
  for (const id of [0, 1, 2]) {
    assert.match(alive, new RegExp(`tl\\.fromTo\\("#s${id}", \\{ scale: 1\\.05, yPercent: 1\\.2 \\}, \\{ scale: 1, yPercent: -1\\.2, duration: \\d+\\.\\d+, ease: "sine\\.inOut"`),
      `scene ${id} keeps moving for its whole length`);
  }
  // The push owns `scale` on the scene. An entrance or exit writing it too
  // would silently win the fight and leave the scene still.
  assert.doesNotMatch(alive, /tl\.to\("#s\d+", \{[^}]*scale/, 'the exit does not fight the push for scale');
  assert.doesNotMatch(alive, /tl\.fromTo\("#s\d+", \{ opacity: 0, filter[^}]*scale/, 'nor does the entrance');
  ok('a graphic scene animates its data, and no scene is ever a still frame');

  // The image gateway answers a fair share of requests with a 502 HTML page
  // under load. One attempt turned four scenes of a real render into flat
  // cards, and a flat card is also a card with no camera move — so a transient
  // 5xx has to be retried rather than taken as a final answer.
  {
    const { aiImage } = await import('../video-agent/assets.mjs');
    const work = mkdtempSync(join(tmpdir(), 'ai-image-retry-'));
    const realFetch = globalThis.fetch;
    // Only the header is inspected here: the agent sniffs the magic bytes to
    // pick an extension, and this test is about the retry, not about pixels.
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(3000, 7)]);
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 502, text: async () => '<!DOCTYPE html>' };
      return { ok: true, json: async () => ({ data: [{ b64_json: png.toString('base64') }] }) };
    };
    const retried = await aiImage('một con mèo', 'retry', { config: { key: 'k' }, work });
    globalThis.fetch = realFetch;
    assert.equal(calls, 2, 'a 502 is retried once');
    assert.ok(existsSync(join(work, retried)), 'and the scene still gets its picture');
    ok('a transient 5xx from the image gateway is retried, not taken as final');

    let hardCalls = 0;
    globalThis.fetch = async () => { hardCalls++; return { ok: false, status: 502, text: async () => 'busy' }; };
    await assert.rejects(
      () => aiImage('một con mèo', 'hard', { config: { key: 'k' }, work }),
      /aifree_http_502/,
      'a gateway that never recovers still reports the real status');
    globalThis.fetch = realFetch;
    assert.equal(hardCalls, 3, 'after three attempts, not three hundred');
    rmSync(work, { recursive: true, force: true });
    ok('a gateway that never recovers gives up, and says why');
  }

  ok('image motion targets real media, and scene transitions hand off without empty selectors');
}

// ── which page becomes the product demo ──────────────────────────────
// The second screenshot is the one shown inside the phone frame, so it is
// the scene that sells — and the first anchors in a nav are usually the
// cookie policy and the login form. A real job rendered a phone frame full
// of a privacy policy before this existed.
{
  const html = `<nav>
    <a href="/chinh-sach-bao-mat">Chính sách bảo mật</a>
    <a href="/dang-nhap">Đăng nhập</a>
    <a href="/thuc-don">Thực đơn</a>
    <a href="https://other.example/x">Ngoài site</a>
    <a href="/lien-he">Liên hệ</a>
    <a href="/thuc-don">Thực đơn (lặp lại)</a>
  </nav>`;
  assert.deepEqual(pickShowcaseLinks(html, 'https://quan.example/'),
    ['https://quan.example/thuc-don', 'https://quan.example/lien-he'],
    'the menu is preferred, the policy and the login are skipped, duplicates and other origins dropped');
  assert.deepEqual(pickShowcaseLinks('<p>không có link</p>', 'https://x.example/'), [],
    'a page with no links yields no shots instead of throwing');
  ok('the screenshot that becomes the demo is chosen by what the link says');

  const pageCopy = extractVisibleText(`
    <html><body>
      <h1>Tiêu đề sản phẩm</h1>
      <p>Đoạn mở đầu có đủ ngữ cảnh và chi tiết.</p>
      <p>Đoạn giữa giải thích cách hoạt động chi tiết hơn.</p>
      <p>KẾT LUẬN CỦA TRANG nằm ở cuối bài.</p>
      <script>const secret = 'KHONG_DOC';</script>
    </body></html>`);
  assert.match(pageCopy, /Đoạn mở đầu/);
  assert.match(pageCopy, /Đoạn giữa/);
  assert.match(pageCopy, /KẾT LUẬN CỦA TRANG/);
  assert.doesNotMatch(pageCopy, /KHONG_DOC/, 'site text excludes script payloads');
  ok('website capture keeps full visible body copy, not only title and headings');

  // A page that failed to render is still a valid PNG. The floor is pinned to
  // the measurements, because lowering it back to 5000 is exactly how a
  // blank screenshot ended up inside the phone frame on a live job.
  assert.ok(MIN_SHOT_BYTES > 5394, 'the floor must reject an empty 720x1280 page (measured 5394 bytes)');
  assert.ok(MIN_SHOT_BYTES < 26095, 'and still accept the plainest real page (measured 26095 bytes)');
  ok('a screenshot that rendered nothing is rejected, and a plain one is not');
}

// ── renderOne drives the storyboard path end to end ──────────────────
if (!HAS_FFMPEG) {
  console.log('… storyboard renderOne checks skipped: no ffmpeg on this machine');
} else {
  const STORY_JOB = {
    id: 'vj_story', kind: 'post', slug: 'giam-chi-phi-bao-bi',
    title: 'Giảm chi phí bao bì',
    body_markdown: 'Chi phí bao bì chiếm 12% doanh thu. Vận chuyển chỉ 7%.',
    project: { name: 'Lagi Food', accent: '#e8590c', publishing_url: 'https://lagi.example/blog' },
  };
  const STORY_SB = {
    intent: 'educational', duration: 20,
    scenes: [
      { type: 'hook', text: 'Bao bì ăn mất lợi nhuận', say: 'Bao bì ăn mất lợi nhuận bạn không thấy.', duration: 3 },
      { type: 'stat', text: 'Chi phí', say: 'Chi phí đang tăng nhanh.', value: 12, duration: 4 },
      { type: 'bars', text: 'Chi phí chiếm bao nhiêu', say: 'Bao bì 12 phần trăm, vận chuyển 7 phần trăm.', duration: 5,
        items: [{ label: 'Bao bì', value: 12 }, { label: 'Vận chuyển', value: 7 }] },
      { type: 'quote', text: 'Kết luận', say: 'Kết luận là cần đo lại từng chi phí.', duration: 4 },
      { type: 'cta', text: 'Đọc bài viết đầy đủ', say: 'Đọc bài viết đầy đủ để biết thêm.', duration: 3 },
    ],
  };

  {
    const r = postRig();
    scriptStub = STORY_SB;
    await silently(() => renderOne(STORY_JOB, r.deps));
    scriptStub = null;

    assert.equal(r.seen.delivers.length, 1, 'one deliver call');
    assert.equal(r.seen.delivers[0].path, '/api/admin/video/deliver');
    assert.equal(r.seen.delivers[0].header, STORY_JOB.id, 'the bytes travel under the job id');
    assert.ok(r.seen.spawns.some((s) => s.cmd === 'npx' && s.args.includes('render')), 'the render ran');
    const composed = readFileSync(join(r.work, 'index.html'), 'utf8');
    assert.match(composed, /class="bar-fill"/, 'the rendered document carries the chart the model asked for');
    // The scene count is the template's business, not this test's: a 60s
    // article is told across however many screens its beats expand to, and
    // every one of them gets a narration track.
    const trackCount = (composed.match(/data-track-index=/g) || []).length;
    assert.ok(trackCount >= 5, `one narration track per scene (${trackCount})`);
    ok('renderOne renders the storyboard and delivers it');
    r.done();
  }

  {
    // A repaired model response can still be structurally invalid. It must
    // never reach TTS or delivery just because it has three scenes.
    const r = postRig();
    scriptStub = { intent: 'educational', duration: 20, scenes: [
      { type: 'hook', text: 'Mở đầu' },
      { type: 'stat', text: 'Số liệu', value: 12 },
      { type: 'steps', text: 'Các bước', items: [{ label: 'Bước một' }, { label: 'Bước hai' }] },
    ] };
    const lines = await captureLogs(() => renderOne(STORY_JOB, r.deps));
    scriptStub = null;
    assert.equal(r.seen.delivers.length, 1, 'an invalid repaired script falls back and still completes');
    assert.ok(lines.some((l) => /quality gate.*deriving/.test(l)), 'the invalid script is rejected before TTS');
    const fallbackTracks = (readFileSync(join(r.work, 'index.html'), 'utf8').match(/data-track-index=/g) || []).length;
    assert.ok(fallbackTracks >= MIN_STORYBOARD_SCENES,
      `the deterministic fallback supplies the missing story beats (${fallbackTracks})`);
    ok('a truncated but repaired storyboard cannot bypass the release gate');
    r.done();
  }

  {
    // A failed logo is not a logo. A product story with no other real visual
    // must fail before TTS instead of rendering a text-only product reveal.
    const r = postRig();
    scriptStub = {
      intent: 'product_demo', duration: 20,
      scenes: [
        { type: 'hook', text: 'Mở đầu', say: 'Mở đầu sản phẩm.', duration: 3 },
        { type: 'product_reveal', text: 'Sản phẩm', say: 'Đây là sản phẩm.', duration: 5 },
        { type: 'feature', text: 'Tính năng', say: 'Tính năng nổi bật.', duration: 4 },
        { type: 'result', text: 'Kết quả', say: 'Kết quả tốt.', duration: 4 },
        { type: 'cta', text: 'Kết', say: 'Xem ngay.', duration: 3 },
      ],
    };
    const noAssetJob = {
      ...STORY_JOB,
      template: 'product',
      project: { ...STORY_JOB.project, logo_url: 'https://assets.test/logo.png' },
    };
    await assert.rejects(() => renderOne(noAssetJob, r.deps), /storyboard_quality_failed/,
      'a failed logo cannot pass the product asset gate');
    assert.equal(r.seen.spawns.filter((s) => s.cmd === 'edge-tts').length, 0,
      'the failed logo is rejected before TTS');
    scriptStub = null;
    r.done();
    ok('a failed logo cannot masquerade as a rendered product visual');
  }

  {
    // GuRouter down (the test fetch refuses everything): the job must still
    // produce a video, derived from the content.
    const r = postRig();
    scriptStub = null;
    const lines = await captureLogs(() => renderOne(STORY_JOB, r.deps));
    assert.equal(r.seen.delivers.length, 1, 'a model outage must not cost the job');
    assert.ok(lines.some((l) => /storyboard failed/.test(l)), 'and it says so rather than pretending');
    assert.ok(lines.some((l) => /intent: /.test(l)), 'the intent is still decided, from signals');
    const composed = readFileSync(join(r.work, 'index.html'), 'utf8');
    assert.match(composed, /data-track-index="5"/, 'the fallback storyboard still narrates');
    ok('with GuRouter down the storyboard falls back to the content instead of failing');
    r.done();
  }

  {
    // The story decides the length, but only up to the point where holding on
    // becomes silence. A slot the voice overruns is fixed by saying less, not
    // by stretching the video; a slot the voice underruns is fixed by ending
    // the screen, not by freezing it.
    //
    // The old contract kept the video at its planned length no matter how thin
    // the narration was. A measured render spent 33.8s of its 90s with nobody
    // talking and held one unmoving card for 20 of them.
    const r = postRig();
    scriptStub = STORY_SB;
    // renderOne creates this; calling fitNarration on its own does not.
    mkdirSync(join(r.work, 'assets'), { recursive: true });
    const sb = { intent: 'educational', duration: 60, scenes: [
      { type: 'hook', text: 'a', say: 'a', duration: 2 },
      { type: 'cta', text: 'b', say: 'b', duration: 2 },
    ] };
    const { storyboard } = sanitizeStoryboard(sb, { source: '', intent: 'educational', target: 60, assets: {} });
    const { segs, total } = fitNarration(storyboard, r.work, r.deps.spawn, () => {});
    assert.ok(segs.every((s) => s > 0.4), 'every scene was actually spoken');
    // A 2s tone cannot fill a 30s screen. The video ends when the story does.
    assert.ok(total < 10, `a 2s voice must not hold a 30s screen (video came to ${total}s)`);
    for (const [i, scene] of storyboard.scenes.entries()) {
      assert.ok(scene.duration <= segs[i] + 0.4 + 1.35,
        `scene ${i} lasts ${scene.duration}s under a ${segs[i]}s voice — that is silence, not pacing`);
    }
    ok('a screen never outlives the voice it carries by more than a breath');
    r.done();
  }

  {
    const ctaWork = mkdtempSync(join(tmpdir(), 'cta-tail-'));
    mkdirSync(join(ctaWork, 'assets'), { recursive: true });
    const spoken = [];
    const timedSpawn = (cmd, args) => {
      if (cmd === 'edge-tts') {
        const text = args[args.indexOf('--text') + 1] || '';
        spoken.push(text);
        const seconds = Math.max(1, Math.min(40, wordCount(text) * 0.4));
        spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=f=440:d=${seconds}`,
          '-b:a', '128k', args[args.indexOf('--write-media') + 1]]);
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    };
    // Six scenes, all far over-long, in a 60s video. The point of the test is
    // the CTA's action word: whatever the fitting does to the other five, the
    // closing call to action has to keep saying what to do.
    const ctaBoard = { intent: 'product_promotion', duration: 60, scenes: [
      { type: 'hook', text: 'Mở đầu', say: Array(200).fill('ngữ cảnh').join(' '), duration: 15 },
      { type: 'feature', text: 'Tính năng một', say: Array(200).fill('chi tiết').join(' '), duration: 15 },
      { type: 'feature', text: 'Tính năng hai', say: Array(200).fill('chi tiết').join(' '), duration: 15 },
      { type: 'feature', text: 'Tính năng ba', say: Array(200).fill('chi tiết').join(' '), duration: 15 },
      { type: 'result', text: 'Kết quả', say: Array(200).fill('kết quả').join(' '), duration: 15 },
      { type: 'cta', text: 'Bắt đầu', say: 'Hãy mở trang ngay và đặt lịch CTA_ACTION', duration: 15 },
    ] };
    // The CTA's own action has to survive; whether the whole board can be made
    // to fit is the fitting loop's job, and a voice this long will not.
    let ctaTail = ctaBoard.scenes.at(-1).say;
    try {
      const fittedCta = fitNarration(ctaBoard, ctaWork, timedSpawn, () => {});
      ctaTail = ctaBoard.scenes.at(-1).say;
      assert.ok(fittedCta.total <= 60, 'CTA preservation still respects the hard duration ceiling');
    } catch (e) {
      // A voice this long is not fittable; the guarantee under test is that the
      // action word is never the thing that gets cut.
      assert.match(String(e?.message || e), /narration_exceeds_duration/,
        'an unfittable voice fails loudly rather than shipping an over-length video');
    }
    assert.match(ctaTail, /CTA_ACTION/, 'CTA action survives global narration shortening');
    assert.ok(spoken.some((text) => text.includes('CTA_ACTION')));
    rmSync(ctaWork, { recursive: true, force: true });
    ok('global TTS fitting protects the CTA action tail');
  }

  {
    // Rounding drift: twelve screens, each rounded to a tenth, add up to a
    // tenth over the ceiling. That is not a video that is too long — it is a
    // video that must not be refused for arithmetic.
    const driftWork = mkdtempSync(join(tmpdir(), 'rounding-drift-'));
    mkdirSync(join(driftWork, 'assets'), { recursive: true });
    const driftSpawn = (cmd, args) => {
      if (cmd === 'edge-tts') {
        const seconds = 4.4;
        spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=f=440:d=${seconds}`,
          '-b:a', '128k', args[args.indexOf('--write-media') + 1]]);
        return { status: 0, stdout: '', stderr: '' };
      }
      if (cmd === 'sleep') return { status: 0, stdout: '', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    };
    // Twelve scenes of 7.5s each is 90s on paper; every voice is 4.75s, so
    // the drift comes purely from the per-scene rounding.
    const driftBoard = { intent: 'educational', duration: 90, scenes: Array.from({ length: 12 }, (_, i) => ({
      type: i === 0 ? 'hook' : i === 11 ? 'cta' : 'steps',
      text: `Màn ${i + 1}`, say: `Lời kể màn hình số ${i + 1} nói đủ ý.`, duration: 7.5,
      ...(i > 0 && i < 11 ? { items: [{ label: 'a' }, { label: 'b' }] } : {}),
    })) };
    const drift = fitNarration(driftBoard, driftWork, driftSpawn, () => {});
    assert.ok(drift.total <= 90, `twelve rounded screens still fit the ceiling (${drift.total}s)`);
    // And no scene was shortened below the voice it has to hold.
    driftBoard.scenes.forEach((s, i) => {
      assert.ok(s.duration + 1e-9 >= drift.segs[i] + 0.35 - 0.11,
        `screen ${i} still holds its own voice after absorbing the drift`);
    });
    rmSync(driftWork, { recursive: true, force: true });
    ok('per-scene rounding drift is absorbed instead of failing the video');
  }

  {
    const gapWork = mkdtempSync(join(tmpdir(), 'gap-boundary-'));
    mkdirSync(join(gapWork, 'assets'), { recursive: true });
    const gapSpawn = (cmd, args) => {
      if (cmd === 'edge-tts') {
        const text = args[args.indexOf('--text') + 1] || '';
        // Spoken at the voice's real pace — Vietnamese at +8% runs just over
        // three words a second. A stub returning one fixed length for every
        // sentence is indistinguishable from the truncation the agent now
        // refuses to ship, so it would have hidden the very thing under test.
        const seconds = Math.max(0.6, wordCount(text) / 3);
        spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=f=440:d=${seconds}`,
          '-b:a', '128k', args[args.indexOf('--write-media') + 1]]);
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    };
    // Whole sentences, at the voice's real pace, so this board overruns the
    // 15s it planned and the fitter has to do something about it.
    const gapSay = Array(4).fill('Câu dài ngữ cảnh ngữ cảnh ngữ cảnh ngữ cảnh.').join(' ');
    const gapBoard = { intent: 'storytelling', duration: 15, scenes: [
      { type: 'hook', text: 'Mở đầu', say: gapSay, duration: 5 },
      { type: 'problem', text: 'Vấn đề', say: 'vấn đề ngắn', duration: 5 },
      { type: 'result', text: 'Kết quả', say: 'kết quả ngắn', duration: 5 },
    ] };
    const gapFit = fitNarration(gapBoard, gapWork, gapSpawn, () => {});
    // A scene longer than its voice needs the gap on top of the voice, or the
    // pause runs into the next scene's first word. 4.0s of speech is a 4.35s
    // screen, not a 4.0s one — and the words are all still there.
    assert.equal(gapBoard.scenes[0].say, gapSay, 'a voice that fits its screen is never cut for length');
    assert.ok(gapBoard.scenes[0].duration >= gapFit.segs[0] + 0.35,
      `the 0.35s gap is part of the screen the voice plays over (${gapBoard.scenes[0].duration}s vs ${(gapFit.segs[0] + 0.35).toFixed(2)}s of voice+gap)`);
    assert.ok(gapFit.total >= gapFit.segs[0] + 0.35, 'a video is never shorter than the voice in it');
    rmSync(gapWork, { recursive: true, force: true });
    ok('narration fitting respects per-scene gap at the hard boundary');
  }

  {
    const retryWork = mkdtempSync(join(tmpdir(), 'tts-retry-'));
    const retryAssets = join(retryWork, 'assets');
    mkdirSync(retryAssets, { recursive: true });
    const retryFile = join(retryAssets, 'seg0.mp3');
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:d=2', '-b:a', '128k', retryFile]);
    let edgeCalls = 0;
    let staleAtFirstAttempt = false;
    const retrySpawn = (cmd, args) => {
      if (cmd === 'edge-tts') {
        const file = args[args.indexOf('--write-media') + 1];
        edgeCalls++;
        if (edgeCalls === 1) {
          staleAtFirstAttempt = existsSync(file);
          return { status: 1, stdout: '', stderr: 'temporary tts failure' };
        }
        spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:d=1', '-b:a', '128k', file]);
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    };
    const retrySegments = speakSegments(['new words'], retryWork, retrySpawn);
    assert.equal(staleAtFirstAttempt, false, 'a failed TTS attempt removes stale media before retrying');
    assert.equal(edgeCalls, 2, 'the retry actually runs a fresh TTS attempt');
    assert.ok(retrySegments[0] > 0 && retrySegments[0] < 2, 'the fresh segment, not stale audio, is measured');
    rmSync(retryWork, { recursive: true, force: true });
    ok('TTS retries cannot reuse stale audio after a failed attempt');
  }

  {
    // edge-tts answers a long `--text` with audio that stops partway through
    // it, and re-sending the same long text stops in the same place — which
    // is the missing-end-of-sentence symptom. The agent's answer is not to
    // retry harder but to never send a long request: a scene is spoken as
    // short sentences and stitched back together.
    const long = 'Một hai ba bốn năm sáu bảy tám chín mười. Mười một mười hai mười ba mười bốn mười lăm mười sáu mười bảy. Mười tám mười chín hai mươi hai mươi mốt hai mươi hai hai mươi ba hai mươi bốn.';
    const chunks = ttsChunks(long);
    assert.ok(chunks.length > 1, 'a long segment is spoken as more than one request');
    assert.ok(chunks.every((c) => wordCount(c) <= 12), 'no single request is long enough to be truncated');
    // Nothing is dropped in the split: the words of the chunks are the words
    // of the segment, in order, and the tail survives.
    assert.equal(chunks.map((c) => wordCount(c)).reduce((a, b) => a + b, 0), wordCount(long),
      'the split loses no words');
    assert.ok(chunks[chunks.length - 1].endsWith('hai mươi ba hai mươi bốn.'),
      `the last words of the segment are the last chunk, not a lost tail (got "${chunks[chunks.length - 1]}")`);
    assert.equal(ttsChunks('Câu ngắn một.').length, 1, 'a short segment is still a single request');
    assert.equal(ttsChunks('').length, 0, 'an empty segment asks for nothing');

    // And the joined file is the whole scene, not the first request's worth.
    const chunkWork = mkdtempSync(join(tmpdir(), 'tts-chunk-'));
    mkdirSync(join(chunkWork, 'assets'), { recursive: true });
    const asked = [];
    const chunkSpawn = (cmd, args) => {
      if (cmd === 'edge-tts') {
        const text = args[args.indexOf('--text') + 1] || '';
        asked.push(text);
        const file = args[args.indexOf('--write-media') + 1];
        spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=f=440:d=${Math.max(0.6, wordCount(text) / 3)}`,
          '-b:a', '128k', file]);
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    };
    const [seconds] = speakSegments([long], chunkWork, chunkSpawn);
    assert.equal(asked.length, chunks.length, 'one TTS request per chunk, and no more');
    assert.ok(seconds > wordCount(long) / 3 - 0.2,
      `the joined segment carries every word (${seconds.toFixed(1)}s of audio for ${wordCount(long)} words)`);
    assert.equal(existsSync(join(chunkWork, 'assets', 'seg0.mp3')), true, 'the scene is one joined file');
    // The part files are scratch: leaving them in assets/ would let a later
    // pass pick a chunk up as if it were a whole scene.
    assert.deepEqual(
      readdirSync(join(chunkWork, 'assets')).filter((f) => /\.p\d+\.mp3$/.test(f)), [],
      'chunk scratch files are cleaned up');
    rmSync(chunkWork, { recursive: true, force: true });
    ok('a long segment is spoken in short pieces and stitched, so no words go missing');
  }

  {
    // A chosen template pins the intent: the model answered 'listicle' but
    // the job carries template 'summary', and summary is what renders —
    // the model's answer cannot move the video off the user's choice.
    const r = postRig();
    lastPrompt = null;
    scriptStub = {
      intent: 'listicle', duration: 20,
      scenes: [
        { type: 'hook', text: 'Mở đầu', say: 'Mở đầu.', duration: 3 },
        { type: 'bars', text: 'Số liệu', say: 'Số liệu.', duration: 5,
          items: [{ label: 'Bao bì', value: 12 }, { label: 'Vận chuyển', value: 7 }] },
        { type: 'cta', text: 'Xem thêm', say: 'Xem thêm.', duration: 3 },
      ],
    };
    const tailMarker = 'MARKER_KET_BAI_VI_PHAI_DUOC_GUI_TOAN_BO';
    const longArticle = `${STORY_JOB.body_markdown}\n${'Chi tiết phần giữa của bài viết. '.repeat(180)}\n${tailMarker}.`;
    const lines = await captureLogs(() => renderOne({ ...STORY_JOB, body_markdown: longArticle, template: 'summary' }, r.deps));
    scriptStub = null;

    assert.ok(lines.some((l) => /intent: summary \(template "summary" chosen by the user\)/.test(l)),
      'the template, not the classifier, names the intent');
    assert.ok(lastPrompt.includes('Intent bắt buộc do người dùng chọn: summary'),
      'the model is told the intent is fixed');
    assert.ok(lastPrompt.includes('Dàn ý beat cho intent "summary"'),
      'and is handed the summary beat outline');
    assert.ok(lastPrompt.includes('ĐỦ số từ trong dàn ý') && lastPrompt.includes('phủ HẾT các ý chính'),
      'the prompt asks for a full spoken script, not caption-length teasers');
    // Every beat in the outline now names the word count its slot needs, and
    // the shape the model copies carries the same number. Under-written
    // narration is what left a third of a real render silent.
    const beatLines = lastPrompt.split('\n').filter((l) => /^\s+\w+ \(~\d+(\.\d+)?s, khoảng \d+ từ\)/.test(l));
    assert.ok(beatLines.length > 0, 'each beat states its seconds and its word budget');
    const shape = lastPrompt.match(/"say":"<lời đọc (\d+) từ/);
    assert.ok(shape, 'the example the model copies shows the word count per scene');
    assert.ok(lastPrompt.includes(tailMarker),
      'the full article reaches the model past the old 4000-character cutoff');
    // The example scales with whatever length this article earned, so it can
    // no longer be a fixed 20s or 60s — it is the chosen target, verbatim.
    const shownTarget = lastPrompt.match(/"duration":([\d.]+)/);
    assert.ok(shownTarget && Number(shownTarget[1]) >= 60,
      `the example follows the computed duration (${shownTarget && shownTarget[1]})`);
    assert.ok(lines.some((l) => /bars:not_in_summary/.test(l)),
      'the listicle scene is refused by the summary vocabulary — the model did not move the intent');
    const composed = readFileSync(join(r.work, 'index.html'), 'utf8');
    assert.match(composed, /class="ex keypoints"/, 'the rendered video carries the summary card');
    assert.equal(r.seen.delivers.length, 1, 'the video is still delivered');
    ok('a chosen template pins the intent even when the model answers another');
    r.done();
  }

  {
    // The news template without a presenter photo: the portrait fetch fails
    // (network is disabled here), the anchor beats degrade, and the bulletin
    // still renders — on the headline, not on a missing face.
    const r = postRig();
    scriptStub = null;
    const lines = await captureLogs(() => renderOne({
      ...STORY_JOB,
      template: 'news_anchor',
      project: { ...STORY_JOB.project, presenter_name: 'Minh Anh', presenter_image_url: 'https://lagi.example/mc.jpg' },
    }, r.deps));

    assert.ok(lines.some((l) => /intent: news \(template "news_anchor" chosen by the user\)/.test(l)),
      'the news template pins the news intent');
    assert.ok(lines.some((l) => /presenter: download failed/.test(l)),
      'a failed portrait fetch is logged, not silent');
    const composed = readFileSync(join(r.work, 'index.html'), 'utf8');
    assert.match(composed, /class="hl-kick"/, 'the bulletin still opens on the headline card');
    // The stylesheet always defines the anchor classes; the scene markup is
    // what must not carry one.
    assert.doesNotMatch(composed, /class="ex anchor"/, 'and no anchor is drawn without the presenter photo');
    assert.equal(r.seen.delivers.length, 1, 'the video is still delivered');
    ok('a presenter-less news bulletin degrades to headline cards and still ships');
    r.done();
  }

  {
    // The model's summary board survives the gate as hook→quote→cta — valid,
    // but the quote is a caption with nothing to look at. The source has the
    // points, so the bare screen is handed them and turned into a drawn card
    // from its OWN beat (a quote may be a quote or a result, so it becomes a
    // result; a result still draws rows). Swapping it for something outside
    // the beat would fix the screen and break the story.
    const r = postRig();
    scriptStub = {
      intent: 'summary', duration: 20,
      scenes: [
        { type: 'hook', text: 'Mở đầu', say: 'Mở đầu.', duration: 3 },
        { type: 'quote', text: 'Chi phí là vấn đề', say: 'Chi phí là vấn đề.', duration: 5 },
        { type: 'cta', text: 'Đọc tiếp', say: 'Đọc tiếp.', duration: 3 },
      ],
    };
    const lines = await captureLogs(() => renderOne({ ...STORY_JOB, template: 'summary' }, r.deps));
    scriptStub = null;

    const repair = lines.find((l) => /bare_screen_given_points/.test(l));
    assert.ok(repair, 'a bare screen is handed the source\'s points rather than shipped as words');
    assert.ok(!lines.some((l) => /quality gate — .*bare_screens/.test(l)),
      'so repairing it stops it counting against the board');
    assert.equal(r.seen.delivers.length, 1, 'and the video still delivers');
    ok('a bare screen is repaired in place instead of failing the whole board');
    r.done();
  }

  {
    // The swap stays inside the beat's own vocabulary. A bare quote is given
    // the source's points and becomes a result — still the closing beat, and
    // a result draws rows. Swapped for an icon grid instead it would draw
    // beautifully and leave `conclusion` with nothing, which is how a repair
    // meant to save a board throws it away.
    const fixed = sanitizeStoryboard({
      intent: 'summary',
      scenes: [
        { type: 'hook', text: 'Mở đầu' },
        { type: 'quote', text: 'Chi phí là vấn đề' },
        { type: 'cta', text: 'Đọc tiếp' },
      ],
    }, { source: 'Chi phí bao bì chiếm 12% doanh thu. Vận chuyển chỉ 7%. Bao bì tái chế giảm thêm 12%.', intent: 'summary', target: 60, assets: {} });
    const repairedScene = fixed.storyboard.scenes.find((s) => s.type !== 'hook' && s.type !== 'cta');
    assert.equal(repairedScene?.type, 'result', 'a bare quote becomes a result, not a chart');
    assert.ok(repairedScene?.items?.length >= 2, 'and carries the source\'s own points as rows');
    assert.equal(reviewStoryboard(fixed.storyboard, { assets: {} }).problems.some((p) => p === 'missing_beat:takeaway'), false,
      'and the beat it belongs to is still covered');
    ok('a repaired screen keeps the beat it was carrying');
  }

  {
    // Nothing to repair with: every screen here is already illustrated, so
    // the missing numbered card cannot be patched from the source. The only
    // honest fix left is to rebuild the board from the template.
    const r = postRig();
    scriptStub = {
      intent: 'summary', duration: 20,
      scenes: [
        { type: 'hook', text: 'Mở đầu', say: 'Mở đầu.', duration: 3 },
        { type: 'result', text: 'Chi phí là vấn đề', say: 'Chi phí là vấn đề.', duration: 5, value: 12 },
        { type: 'cta', text: 'Đọc tiếp', say: 'Đọc tiếp.', duration: 3 },
      ],
    };
    const lines = await captureLogs(() => renderOne({ ...STORY_JOB, template: 'summary' }, r.deps));
    scriptStub = null;

    assert.ok(!lines.some((l) => /bare_screen_given_points/.test(l)),
      'a board with nothing bare has nothing to repair');
    assert.ok(lines.some((l) => /lost keypoints — rebuilding/.test(l)),
      'so a missing signature beat is rebuilt from the template');
    const composed = readFileSync(join(r.work, 'index.html'), 'utf8');
    assert.match(composed, /class="ex keypoints"/, 'the rebuilt summary carries its numbered card');
    assert.equal(r.seen.delivers.length, 1, 'and still delivers');
    ok('a board with nothing to repair falls back to a rebuild');
    r.done();
  }
}

// ── storyboard: the story decides, the narration fits ────────────────
// These are the rules that separate a video from a slide deck. Every one of
// them is a thing a model would otherwise decide, and every one is checked
// here rather than trusted.
console.log('\n--- Storyboard (intent · duration · anti-slideshow) ---\n');

const STORY_ARTICLE = 'Chi phí bao bì chiếm 12% doanh thu. Vận chuyển chỉ 7%.';

{
  // Intent is the fork everything else hangs off, so the no-model path must
  // be right: it runs whenever GuRouter is down.
  const cases = [
    [{ kind: 'website', source_url: 'https://x' }, '', 'product_demo', 'a live URL is shown'],
    [{ kind: 'business', project: { address: '12 Lê Lợi', brand: { business_type: 'quán ăn' } } }, '', 'local_business', 'a place'],
    [{ kind: 'post', title: '5 bước tối ưu website' }, '', 'listicle', 'a counted list'],
    [{ kind: 'post', title: 'Ra mắt tính năng mới' }, '', 'announcement', 'news'],
    [{ kind: 'post', title: 'Khách hàng nói gì về chúng tôi' }, '', 'testimonial', 'a customer voice'],
    [{ kind: 'post', title: 'Tối ưu website' }, STORY_ARTICLE, 'educational', 'numbers and how-to'],
  ];
  for (const [job, text, want, why] of cases) {
    assert.equal(intentFromSignals(job, text).intent, want, `${why} should classify as ${want}`);
  }
  assert.ok(INTENTS.length === 12, 'the nine strategy intents plus the three the templates added');
  ok('intent is classified from content even with no model');
}

{
  // The floor is a platform limit, not an editorial one: 30s so a short-form
  // social video is expressible. The article-length promise is unchanged and
  // lives in `suggestDuration`, which only ever proposes 60/75/90 — so an
  // auto-lengthed post video is still at least a minute.
  assert.deepEqual(DURATION, { min: 30, max: 90, default: 75 });
  for (const target of [30, 45, 60, 75, 90]) {
    assert.equal(clampDuration(target), target, `${target}s is inside the band and survives the clamp`);
  }
  assert.equal(suggestDuration('# Một\n## Hai\n'), 60,
    'a two-heading source still gets the article-length minute, not the short-form floor');
  assert.equal(clampDuration(29), 30, 'below the floor is raised to the floor');
  assert.equal(clampDuration(91), 90, 'above the ceiling is lowered to the ceiling');

  // The inversion: beats get the story's seconds, and the video is that long.
  for (const intent of INTENTS) {
    const slots = beatSlots(intent, 60);
    const total = slots.reduce((a, b) => a + b.duration, 0);
    assert.equal(Math.round(total * 10) / 10, 60, `${intent} beats must add up exactly to the target (${total})`);
    // News opens on the headline — a bulletin has no curiosity hook.
    assert.ok(['hook', 'headline'].includes(slots[0].types[0]), `${intent} must open on a hook or a headline`);
    assert.ok(slots.at(-1).types.includes('cta'), `${intent} must close on a call to action`);
  }
  for (const target of [30, 45, 60, 75, 90]) {
    for (const intent of INTENTS) {
      const total = beatSlots(intent, target).reduce((a, b) => a + b.duration, 0);
      assert.equal(Math.round(total * 10) / 10, target, `${intent} at ${target}s keeps the exact duration`);
    }
  }
  assert.equal(beatSlots('product_demo', 999).reduce((a, b) => a + b.duration, 0) <= DURATION.max + 0.4, true,
    'a silly target is still clamped to the ceiling');
  // A target below the floor is raised, never honoured — a stale stored
  // duration still lands on a legal length instead of rendering a 12s clip.
  assert.equal(Math.round(beatSlots('educational', 20).reduce((a, b) => a + b.duration, 0) * 10) / 10, 30,
    'a sub-floor request is raised to the floor rather than obeyed');
  ok('every intent opens on a hook, closes on a CTA, and fits the band');

  // A long video is told across more screens, not across longer ones.
  // ~5.5s a screen: a 60s video is eleven cuts, a 90s one takes as many as the
  // ceiling allows. These are pacing numbers, not budgets — the seconds a
  // screen holds decide whether a video reads as a video or a slideshow.
  assert.equal(sceneCountFor(60), 11, 'a 60s video is eleven screens');
  assert.ok(sceneCountFor(75) > sceneCountFor(60), 'a 75s video takes more screens than a 60s one');
  assert.equal(sceneCountFor(90), SB_MAX_SCENES, 'the ceiling takes as many screens as the template allows');
  assert.equal(sceneCountFor(1), 8, 'even the floor keeps a screen per beat');
  for (const intent of INTENTS) {
    const long = expandBeats(intent, 90);
    const short = expandBeats(intent, 60);
    assert.ok(long.length >= short.length, `${intent} never loses screens as the video grows`);
    assert.ok(long.length <= SB_MAX_SCENES, `${intent} stays inside the scene ceiling`);
    assert.equal(long.filter((b) => ['hook', 'headline', 'cta'].includes(b.beat)).length,
      short.filter((b) => ['hook', 'headline', 'cta'].includes(b.beat)).length,
      `${intent} opens and closes once, however long the video is`);
    // A repeat is only allowed where the beat was marked for it, so the story
    // still runs opener → body → closer instead of trailing five copies.
    const names = long.map((b) => b.beat);
    assert.equal(names[0], short[0].beat, `${intent} keeps its opener`);
    assert.equal(names.at(-1), 'cta', `${intent} keeps its closer`);
  }

  // How long a video should be when nobody said: the article's own structure.
  assert.equal(suggestDuration(''), 60, 'nothing to read is the floor');
  assert.equal(suggestDuration('Một câu ngắn.'), 60, 'a one-line source is the floor');
  // 4 sections is a short answer, 7 a normal post, 12 a long one.
  const sections = (n) => Array.from({ length: n },
    (_, i) => `## Mục ${i + 1}\nCâu số ${i + 1} giải thích chi tiết một phần của vấn đề.`).join('\n\n');
  assert.equal(suggestDuration(sections(4)), 60, 'four sections is still the floor');
  assert.equal(suggestDuration(sections(7)), 75, 'seven sections is a normal post');
  assert.equal(suggestDuration(sections(12)), 90, 'twelve sections earns the ceiling');
  // A post with no headings is measured by its substantial sentences instead.
  const prose = (n) => Array.from({ length: n },
    (_, i) => `Câu số ${i + 1} giải thích chi tiết một phần của vấn đề.`).join(' ');
  assert.equal(suggestDuration(prose(3)), 60, 'three long sentences is still the floor');
  assert.equal(suggestDuration(prose(11)), 75, 'eleven sentences is a normal post');
  assert.equal(suggestDuration(prose(20)), 90, 'twenty sentences earns the ceiling');
  for (const body of ['', 'Một câu ngắn.', sections(7), sections(12), prose(20)]) {
    const chosen = suggestDuration(body);
    assert.ok(chosen >= DURATION.min && chosen <= DURATION.max, `suggested length ${chosen} is inside the band`);
  }
  ok('the video grows by adding screens, and its length comes from the article');

  const modelOverride = sanitizeStoryboard({
    duration: 90,
    scenes: [
      { type: 'hook', text: 'Mở đầu ngắn', say: 'Mở đầu ngắn.' },
      { type: 'cta', text: 'Xem ngay', say: 'Xem ngay.' },
    ],
  }, { source: '', intent: 'educational', target: 60, assets: {} });
  assert.equal(modelOverride.storyboard.duration, 60, 'model duration cannot override the requested template');
  assert.ok(Math.abs(modelOverride.storyboard.scenes.reduce((a, s) => a + s.duration, 0) - 60) < 0.4,
    'requested duration survives model output');
  const skewedDurations = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'Mở đầu', say: 'Mở đầu', duration: 100 },
      { type: 'problem', text: 'Vấn đề', say: 'Vấn đề', duration: 1 },
      { type: 'cta', text: 'Xem ngay', say: 'Xem ngay', duration: 1 },
    ],
  }, { source: '', intent: 'educational', target: 60, assets: {} });
  assert.equal(skewedDurations.storyboard.duration, 60, 'skewed model beats stay within the target');
  assert.equal(skewedDurations.storyboard.scenes.reduce((a, s) => a + s.duration, 0), 60,
    'minimum scene floors do not inflate the target');
  const storySkewedDurations = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'Mở đầu', duration: 0.1 },
      { type: 'problem', text: 'Vấn đề', duration: 10 },
      { type: 'quote', text: 'Trích dẫn', duration: 0.1 },
      { type: 'photo', text: 'Ảnh', duration: 10 },
      { type: 'result', text: 'Kết quả', duration: 0.1 },
      { type: 'cta', text: 'Kết', duration: 10 },
    ],
  }, { source: '', intent: 'storytelling', target: 60, assets: {} });
  assert.equal(storySkewedDurations.storyboard.duration, 60, 'storytelling duration floor stays bounded');
  assert.equal(storySkewedDurations.storyboard.scenes.reduce((a, s) => a + s.duration, 0), 60,
    'storytelling minimum floors renormalize exactly');
  const sparseSource = [
    'Nền tảng đo được 12 phần trăm chi phí vận chuyển trong tháng đầu.',
    'Kết quả thử nghiệm đạt 7 phần trăm và cần hành động tiếp theo.',
  ].join(' ');
  const sparseSanitized = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'Mở đầu' },
      { type: 'stat', text: 'Chi phí', value: 12 },
      { type: 'quote', text: 'Kết quả' },
      { type: 'bars', text: 'So sánh', items: [{ label: 'Vận chuyển', value: 12 }, { label: 'Kết quả', value: 7 }] },
      { type: 'donut', text: 'Tỷ lệ', value: 12 },
      { type: 'line', text: 'Xu hướng', items: [{ label: 'Đầu', value: 12 }, { label: 'Sau', value: 7 }] },
      { type: 'steps', text: 'Các bước', items: [{ label: 'Đo' }, { label: 'Cải thiện' }] },
      { type: 'cta', text: 'Bắt đầu' },
    ],
  }, { source: sparseSource, intent: 'educational', target: 90, assets: {} });
  const sparseNarration = sparseSanitized.storyboard.scenes.map((s) => s.say);
  assert.equal(sparseNarration.filter((s) => s === `${sparseSource.split('. ')[0]}.`).length, 1,
    'sparse source sentence is not repeated across scenes');
  assert.equal(new Set(sparseNarration).size, sparseNarration.length,
    'sparse fallback keeps narration beats distinct');
  const missingSay = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'Một ý ngắn' },
      { type: 'result', text: 'Kết quả rõ' },
      { type: 'cta', text: 'Đăng ký ngay' },
    ],
  }, { source: STORY_ARTICLE, intent: 'educational', target: 60, assets: {} });
  assert.ok(missingSay.storyboard.scenes.every((s) => wordCount(s.say) >= 3),
    'missing say falls back to source detail, not the caption alone');
  assert.match(missingSay.storyboard.scenes.at(-1).say, /Đăng ký ngay/,
    'missing CTA narration keeps the action instead of inheriting the article conclusion');
}

{
  const malformedCards = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'Mở đầu' },
      { type: 'steps', text: 'Các bước', items: [] },
      { type: 'icons', text: 'Lợi ích', items: [{ label: '' }] },
      { type: 'compare', text: 'So sánh', left: { items: ['có'] }, right: { items: [] } },
      { type: 'timeline', text: 'Dòng thời gian', items: [] },
      { type: 'donut', text: 'Tỷ lệ', value: 99 },
      { type: 'cta', text: 'Kết' },
    ],
  }, { source: 'Số liệu 12 phần trăm. Kết quả 7 phần trăm.', intent: 'educational', target: 60, assets: {} });
  assert.equal(malformedCards.storyboard.scenes.length, 2,
    'a card with no drawable data is removed instead of rendering an empty panel');
  for (const reason of ['steps_needs_items', 'icons_needs_items', 'compare_needs_both_sides', 'timeline_needs_items', 'number_not_in_source']) {
    assert.ok(malformedCards.dropped.some((d) => d.reason === reason), `malformed ${reason} is reported`);
  }
}

{
  const { storyboard, dropped } = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'Mot hai ba bon nam sau bay tam chin muoi', say: 'x' },
      { type: 'bars', text: 'Số liệu', items: [{ label: 'a', value: 12 }, { label: 'b', value: 7 }] },
      { type: 'bars', text: 'Lặp lại', items: [{ label: 'a', value: 12 }, { label: 'b', value: 7 }] },
      { type: 'bars', text: 'Bịa', items: [{ label: 'a', value: 12 }, { label: 'b', value: 99 }] },
      { type: 'cta', text: 'Thử ngay', asset: 'site:0' },
    ],
  }, { source: STORY_ARTICLE, intent: 'educational', target: 60, assets: {} });

  assert.ok(storyboard.scenes.every((s) => wordCount(s.text) <= MAX_TEXT_WORDS), 'on-screen text is never a sentence');
  assert.equal(storyboard.scenes[0].text, 'Mot hai ba bon nam sau bay tam', 'it is cut at a word boundary');
  // The second `bars` is a repeat of the first and becomes another shape the
  // same beat allows rather than vanishing — a long article is told across
  // more screens, and dropping them is what used to shorten the video. The
  // third carries an invented number and is still refused outright.
  const types = storyboard.scenes.map((s) => s.type);
  assert.equal(types[0], 'hook', 'the opener is untouched');
  assert.equal(types.at(-1), 'cta', 'the closer is untouched');
  // The first chart survives; the second is a repeat and becomes another shape
  // the same beat allows. The third carries an invented number, so it goes.
  assert.equal(types.filter((t) => t === 'bars').length, 1, 'the invented chart is the only bars refused');
  assert.ok(!storyboard.scenes.some((s) => s.items?.some((i) => numOf(i.value) === '99')),
    'the invented number never reaches the screen');
  assert.ok(dropped.some((d) => ['repeat_of_previous', 'repeated_as_alternative'].includes(d.reason)),
    'a repeated scene type is reported, whatever the gate did with it');
  assert.ok(dropped.some((d) => d.reason === 'too_few_verified_numbers'), 'a chart with an invented number is refused');
  assert.ok(dropped.some((d) => d.reason === 'asset_missing'), 'a reference to an asset we do not have is reported');
  assert.ok(Math.abs(storyboard.duration - 60) < 0.5, `the total is the target, not the model's sum (${storyboard.duration})`);
  ok('the storyboard gate clamps text, re-casts repeats and refuses missing assets, and owns the duration');
}

{
  // A single big number is the easiest thing for a model to invent, and the
  // most damaging to get wrong.
  const { storyboard, dropped } = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'a' },
      { type: 'stat', text: 'Số liệu', value: 12, label: 'bao bì' },
      { type: 'stat', text: 'Bịa', value: 47, label: 'không có trong bài' },
      { type: 'cta', text: 'c' },
    ],
  }, { source: STORY_ARTICLE, intent: 'educational', target: 60 });
  assert.ok(dropped.some((d) => d.reason === 'number_not_in_source'), 'a stat the source never stated is refused');
  assert.equal(JSON.stringify(storyboard).includes('47'), false, 'and never reaches the frame');
  assert.ok(storyboard.scenes.some((s) => s.type === 'stat' && s.value === 12), 'a sourced one is kept');
  ok('a big number the source does not contain is refused');
}

{
  // Narration is written to fit its slot. A model that writes a paragraph
  // for a beat gets cut, not given more time. A 60s video splits across two
  // scenes gives each ~30s, so the paragraph has to be much longer than that
  // to overflow — the point is the ratio, not the absolute count.
  const long = Array.from({ length: 200 }, () => 'chữ').join(' ');
  const { storyboard } = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'a', say: long, duration: 3 },
      { type: 'cta', text: 'c', say: 'ngắn thôi', duration: 3 },
    ],
  }, { intent: 'educational', target: 60 });
  const hook = storyboard.scenes[0];
  assert.ok(narrationBudget(hook.duration) < wordCount(long),
    `the test only means something if the budget is smaller than the script (${narrationBudget(hook.duration)} vs ${wordCount(long)})`);
  assert.ok(wordCount(hook.say) <= narrationBudget(hook.duration),
    `narration must fit its slot (${wordCount(hook.say)} words for ${hook.duration}s)`);
  assert.ok(hook.say.length < long.length, 'and it was actually cut');
  ok('narration longer than its slot is cut to fit, not given more time');
}

{
  // A scene type the intent did not ask for is not drawn, however good it is.
  const { dropped } = sanitizeStoryboard({
    scenes: [{ type: 'hook', text: 'a' }, { type: 'bars', text: 'b', items: [{ label: 'x', value: 12 }, { label: 'y', value: 7 }] }, { type: 'cta', text: 'c' }],
  }, { source: STORY_ARTICLE, intent: 'local_business', target: 60 });
  assert.ok(dropped.some((d) => d.reason === 'not_in_local_business'),
    'a chart has no place in a local-business story and is refused');
  ok('the intent decides the vocabulary, so bars cannot appear in a business video');
}

{
  // Every body screen owes the viewer something to look at, so a passing story
  // shows the product AND draws something on the rest of its screens. A `problem`
  // card with no image behind it is a caption, which is exactly what the gate
  // is there to refuse — so this story gives the problem a real photo.
  const good = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'Google Maps của bạn đã có mọi thứ' },
      { type: 'problem', text: 'Nhưng chưa có website', asset: 'photo:0' },
      { type: 'ui_demo', text: 'Gulagi dựng site', asset: 'site:0' },
      { type: 'feature', text: 'Đặt bàn nhanh' },
      { type: 'result', text: 'Khách tìm thấy', value: 12 },
      { type: 'cta', text: 'Thử miễn phí' },
    ],
  }, { source: STORY_ARTICLE, intent: 'product_demo', target: 60, assets: { 'site:0': 'a.jpg', 'photo:0': 'p.jpg' } }).storyboard;
  const goodReview = reviewStoryboard(good, { assets: { 'site:0': 'a.jpg', 'photo:0': 'p.jpg' } });
  assert.equal(goodReview.ok, true, `a story that shows the product passes (${goodReview.problems.join(', ')})`);

  // The same six scenes with the problem's photo taken away: a real screenshot,
  // a feature card and a chart, but a problem card that is only words.
  const halfIllustrated = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'Google Maps của bạn đã có mọi thứ' },
      { type: 'problem', text: 'Nhưng chưa có website' },
      { type: 'ui_demo', text: 'Gulagi dựng site', asset: 'site:0' },
      { type: 'feature', text: 'Đặt bàn nhanh' },
      { type: 'result', text: 'Khách tìm thấy', value: 12 },
      { type: 'cta', text: 'Thử miễn phí' },
    ],
  }, { source: STORY_ARTICLE, intent: 'product_demo', target: 60, assets: { 'site:0': 'a.jpg' } }).storyboard;
  assert.ok(reviewStoryboard(halfIllustrated, { assets: { 'site:0': 'a.jpg' } }).problems.some((p) => p.startsWith('bare_screens')),
    'a screenshot and a chart do not excuse a problem card that is only words');

  const noAsset = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'a' }, { type: 'problem', text: 'b' }, { type: 'product_reveal', text: 'c' },
      { type: 'feature', text: 'd' }, { type: 'result', text: 'e' }, { type: 'cta', text: 'f' },
    ],
  }, { intent: 'product_demo', target: 60, assets: {} }).storyboard;
  assert.ok(reviewStoryboard(noAsset).problems.some((p) => p.startsWith('no_real_asset')),
    'a product demo with nothing to show is rejected, not shipped as a slide deck');
  const assetOnIgnoredScene = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'Mở đầu' },
      { type: 'product_reveal', text: 'Sản phẩm' },
      { type: 'result', text: 'Kết quả', asset: 'site:0' },
      { type: 'feature', text: 'Tính năng' },
      { type: 'quote', text: 'Cảm nhận' },
      { type: 'cta', text: 'Kết' },
    ],
  }, { intent: 'product_demo', target: 60, assets: { 'site:0': 'site.png' } }).storyboard;
  assert.ok(reviewStoryboard(assetOnIgnoredScene, { assets: { 'site:0': 'site.png' } }).problems.some((p) => p.startsWith('no_real_asset')),
    'an asset on a result card cannot satisfy the product visual gate');

  // A one-sentence source cannot fill twelve screens, so the deterministic
  // board is allowed to stay short here — the point is the logo gate, not the
  // screen count. A source this thin has no illustration to give the extra
  // screens, and inventing one would be worse than a short video.
  const logoSource = 'Một sản phẩm có vấn đề rõ ràng và cách giải quyết cụ thể bằng nhiều bước. '
    + 'Bước đầu là thu thập số liệu. Bước sau là đối chiếu kết quả. Cuối cùng là hành động cụ thể cho người đọc.';
  const logoOnly = sanitizeStoryboard(storyboardFromContent(
    { title: 'Sản phẩm có logo', body_markdown: logoSource, project: { name: 'Gulagi' } },
    'product_demo', {}, 60), { source: logoSource, intent: 'product_demo', target: 60, assets: {} }).storyboard;
  const logoReview = reviewStoryboard(logoOnly, { hasLogo: true });
  assert.equal(logoReview.ok, true, `a real logo counts as the product visual when no screenshot exists (${logoReview.problems.join(', ')})`);
  assert.ok(reviewStoryboard(logoOnly).problems.some((p) => p.startsWith('no_real_asset')),
    'logo-only acceptance requires an explicit logo signal');

  const wall = { intent: 'educational', scenes: [
    { type: 'hook', text: 'a', duration: 4 }, { type: 'quote', text: 'b', duration: 4 },
    { type: 'quote', text: 'c', duration: 4 }, { type: 'quote', text: 'd', duration: 4 }, { type: 'cta', text: 'e', duration: 4 },
  ] };
  assert.ok(reviewStoryboard(wall).problems.some((p) => p.startsWith('slideshow')), 'a body of pure text is a slideshow');

  const openOnly = { intent: 'educational', scenes: [
    { type: 'quote', text: 'a', duration: 10 }, { type: 'cta', text: 'b', duration: 10 },
  ] };
  assert.ok(reviewStoryboard(openOnly).problems.includes('does_not_open_on_a_hook'), 'a video must open on a hook');
  assert.ok(reviewStoryboard(openOnly).problems.includes('does_not_end_on_a_cta') === false, 'and the CTA is last here');
  const missingBeat = reviewStoryboard({ intent: 'educational', scenes: [
    { type: 'hook', text: 'Mở đầu', duration: 4 },
    { type: 'stat', text: 'Số liệu', value: 12, duration: 4 },
    { type: 'cta', text: 'Kết', duration: 4 },
  ] });
  assert.ok(missingBeat.problems.includes('missing_beat:point'));
  assert.ok(missingBeat.problems.includes('missing_beat:conclusion'));
  const wrongOrder = reviewStoryboard({ intent: 'educational', scenes: [
    { type: 'hook', text: 'Mở đầu', duration: 4 },
    { type: 'cta', text: 'Kết', duration: 4 },
    { type: 'steps', text: 'Sai thứ tự', duration: 4 },
  ] });
  assert.ok(wrongOrder.problems.some((p) => p.startsWith('missing_beat:')), 'beat order cannot skip required story beats');
  ok('the quality gate refuses a slideshow, missing beats, and a hook and CTA that do not form a story');
}

{
  // Run twice: once as a bare job, and once with the assets a real one always
  // carries. The gate may only drop a repeated screen when there is nothing
  // left to draw it with — an empty device frame is worse than a missing
  // screen — so the no-repeat guarantee is asserted on the second pass.
  const withAssets = { 'site:0': 'site.png', 'photo:0': 'photo.png', hero: 'hero.jpg' };
  for (const intent of INTENTS) {
    const job = {
      title: 'Tối ưu website bán hàng', body_markdown: STORY_ARTICLE, highlights: ['Nhanh hơn', 'Rẻ hơn', 'Đẹp hơn'],
      project: { name: 'Gulagi', publishing_url: 'https://gulagi.com', address: '12 Lê Lợi', brand: { cta: 'Thử ngay' } },
    };
    const sb = storyboardFromContent(job, intent, {}, 60);
    assert.ok(sb.scenes.length >= SB_MIN_SCENES && sb.scenes.length <= SB_MAX_SCENES, `${intent} fallback has a sane length`);
    assert.ok(['hook', 'headline'].includes(sb.scenes[0].type), `${intent} fallback opens on a hook or a headline`);
    assert.equal(sb.scenes.at(-1).type, 'cta', `${intent} fallback closes on a CTA`);
    assert.ok(sb.scenes.every((s) => s.text && wordCount(s.text) <= MAX_TEXT_WORDS), `${intent} fallback text is caption-sized`);
    const again = storyboardFromContent(job, intent, {}, 60);
    assert.deepEqual(again, sb, `${intent} fallback is deterministic`);

    // The same board, given the assets a real job carries, must survive the
    // gate whole: no repeat dropped, no beat lost.
    const rich = storyboardFromContent(job, intent, withAssets, 60);
    const { dropped, storyboard: kept } = sanitizeStoryboard(rich, {
      source: STORY_ARTICLE, intent, target: 60, assets: withAssets,
    });
    assert.equal(dropped.filter((d) => d.reason === 'repeat_of_previous').length, 0,
      `${intent} fallback must not hand the gate a repeated scene type`);
    assert.equal(kept.scenes.length, rich.scenes.length,
      `${intent} fallback loses no screen when the job carries assets`);
  }
  const fallbackAssets = {
    'site:0': 'site.png', 'photo:0': 'photo.png', map: 'map.png', presenter: 'presenter.png',
  };
  for (const intent of INTENTS) {
    const fallback = storyboardFromContent(
      { title: 'Tối ưu website bán hàng', body_markdown: STORY_ARTICLE, highlights: ['Nhanh hơn', 'Rẻ hơn', 'Đẹp hơn'],
        project: { name: 'Gulagi', publishing_url: 'https://gulagi.com', address: '12 Lê Lợi', brand: { cta: 'Thử ngay' }, presenter_name: 'Mai' } },
      intent, fallbackAssets, 20);
    const sanitizedFallback = sanitizeStoryboard(fallback, { source: STORY_ARTICLE, intent, target: 60, assets: fallbackAssets }).storyboard;
    const { dropped } = sanitizeStoryboard(fallback, { source: STORY_ARTICLE, intent, target: 60, assets: fallbackAssets });
    assert.equal(dropped.filter((d) => d.reason.startsWith('not_in_') || d.reason === 'no_text').length, 0,
      `${intent} fallback uses types and captions allowed by its beat`);
    const fallbackReview = reviewStoryboard(sanitizedFallback, { hasLogo: false, assets: fallbackAssets });
    assert.equal(fallbackReview.ok, true, `${intent} fallback passes the full quality gate: ${fallbackReview.problems.join(', ')}`);
  }
  const newsWithoutPresenter = sanitizeStoryboard(
    storyboardFromContent({ title: 'Tin mới', body_markdown: STORY_ARTICLE }, 'news', { 'photo:0': 'news.jpg' }, 20),
    { source: STORY_ARTICLE, intent: 'news', target: 60, assets: { 'photo:0': 'news.jpg' } },
  ).storyboard;
  assert.equal(reviewStoryboard(newsWithoutPresenter, { assets: { 'photo:0': 'news.jpg' } }).ok, true,
    'a news bulletin without a presenter has a valid non-anchor substitute');
  for (const localAssets of [{ 'site:0': 'site.png' }, { logo: 'logo.png' }, { map: 'map.png' }]) {
    const localStoryboard = sanitizeStoryboard(
      storyboardFromContent({ title: 'Cửa hàng', body_markdown: STORY_ARTICLE, project: { name: 'Cửa hàng', address: '12 Lê Lợi' } }, 'local_business', localAssets, 20),
      { source: STORY_ARTICLE, intent: 'local_business', target: 60, assets: localAssets },
    ).storyboard;
    assert.equal(reviewStoryboard(localStoryboard, { hasLogo: Boolean(localAssets.logo), assets: localAssets }).ok, true,
      `local fallback has a visual middle for ${Object.keys(localAssets).join(',')}`);
  }
  const onePhotoFallback = storyboardFromContent(
    { title: 'So sánh', body_markdown: 'Trước đây chậm. Sau khi dùng nhanh.' },
    'before_after', { 'photo:0': 'before.jpg' }, 20);
  const onePhotoSanitized = sanitizeStoryboard(onePhotoFallback, {
    source: 'Trước đây chậm. Sau khi dùng nhanh.', intent: 'before_after', target: 60, assets: { 'photo:0': 'before.jpg' },
  });
  assert.notEqual(onePhotoSanitized.storyboard.scenes.find((s) => s.type === 'result')?.asset, 'photo:0',
    'one-sided fallback does not reuse the before image');
  const twoPhotoFallback = storyboardFromContent(
    { title: 'So sánh', body_markdown: 'Trước đây chậm. Sau khi dùng nhanh.' },
    'before_after', { 'photo:0': 'before.jpg', 'photo:1': 'after.jpg' }, 20);
  const comparison = twoPhotoFallback.scenes.find((s) => s.type === 'before_after');
  assert.equal(comparison?.asset, 'photo:0');
  assert.equal(comparison?.asset2, 'photo:1');
  const siteComparison = storyboardFromContent(
    { title: 'So sánh', body_markdown: 'Trước đây chậm. Sau khi dùng nhanh.' },
    'before_after', { 'site:0': 'before.png', 'site:1': 'after.png' }, 20)
    .scenes.find((s) => s.type === 'before_after');
  assert.equal(siteComparison?.asset, 'site:0');
  const malformedHighlights = storyboardFromContent(
    { title: 'Bài viết', body_markdown: 'Câu một đủ ý. Câu hai đủ ý. Câu ba đủ ý.', highlights: 'không phải mảng' },
    'educational', {}, 20);
  assert.ok(malformedHighlights.scenes.every((s) => s.text && s.say),
    'a malformed highlights payload cannot crash the deterministic fallback');

  const boundarySource = [
    'Câu 1 mở đầu có ngữ cảnh rõ ràng.',
    'Câu 2 giải thích chi tiết thứ nhất.',
    'Câu 3 trình bày cách làm cụ thể.',
    'Câu 4 cho biết kết quả đo lại.',
    'Câu 5 kết luận và hành động tiếp theo.',
  ].join(' ');
  const boundaryFallback = storyboardFromContent(
    { title: 'Bài biên giới', body_markdown: boundarySource, project: { name: 'Gulagi' } },
    'product_demo', {}, 20);
  for (const sentence of boundarySource.split(/(?<=[.!?])\s+/)) {
    const said = boundaryFallback.scenes.filter((s) => s.say.includes(sentence.replace(/[.!?]$/, '')));
    // The hook may open on the article's first fact and the body may carry it
    // too; every other sentence belongs to exactly one screen.
    const allowed = sentence === boundarySource.split(/(?<=[.!?])\s+/)[0] ? 2 : 1;
    assert.ok(said.length <= allowed,
      `fallback assigns boundary detail once: ${sentence} (${said.length}×)`);
  }
  const completeArticle = [
    'Mở đầu bài nói rõ vấn đề cần giải quyết.',
    'Nền tảng dữ liệu cho thấy chi phí đang tăng.',
    'Chi tiết quan trọng nằm ở cách đo chỉ số.',
    'Phương pháp sau đây áp dụng từng bước rõ ràng.',
    'Kết quả thực tế đã được đo lại và ghi nhận.',
    'Kết luận cần ưu tiên hành động quan trọng nhất.',
  ].join(' ');
  // A below-floor request is raised rather than honoured — that is the whole
  // point of the floor. A 20-second job renders 30, the shortest legal length.
  const shortFallback = storyboardFromContent(
    { title: 'Bài ngắn', body_markdown: STORY_ARTICLE }, 'educational', {}, 20);
  assert.equal(shortFallback.duration, 30, 'a below-floor request is raised to the floor');
  assert.ok(Math.abs(shortFallback.scenes.reduce((sum, s) => sum + s.duration, 0) - 30) < 0.4,
    'and the raised length is the length the scenes actually carry');
  const fullFallback = storyboardFromContent(
    { title: 'Bài viết đầy đủ', body_markdown: completeArticle,
      project: { name: 'Gulagi', publishing_url: 'https://gulagi.com', brand: { cta: 'Đọc tiếp' } } },
    'educational', {});
  const fullNarration = fullFallback.scenes.map((s) => s.say).join(' ');
  assert.match(fullNarration, /Phương pháp sau đây/, 'fallback keeps a detail from the middle of the article');
  assert.match(fullNarration, /Kết luận cần ưu tiên/, 'and reaches the article conclusion, not only its opening');
  for (const sentence of completeArticle.split(/(?<=[.!?])\s+/)) {
    assert.ok(fullNarration.includes(sentence.replace(/[.!?]$/, '')),
      `fallback covers article detail: ${sentence}`);
  }
  const sparseFallback = storyboardFromContent(
    { title: 'Một câu ngắn', body_markdown: 'Một câu ngắn chứa đủ một ý chính của bài viết.' },
    'educational', {}, 60);
  assert.ok(new Set(sparseFallback.scenes.map((s) => s.say)).size > 1,
    'sparse source does not repeat the same narration across every beat');
  // A title long enough to swallow its own budget must still leave room for
  // the opening source fact — the hook is 30s wide now, so the title has to be
  // long enough to matter before this test means anything.
  const longTitleFallback = storyboardFromContent(
    {
      title: Array.from({ length: 30 }, (_, i) => `Từ khoá ${i + 1}`).join(' '),
      body_markdown: 'Câu mở đầu chứa một chi tiết quan trọng cần kể ngay. Câu thứ hai nói thêm chi tiết. Câu thứ ba nói thêm chi tiết. Câu thứ tư nói thêm chi tiết. Câu kết luận chứa hành động cần ưu tiên.',
    },
    'educational', {}, 60);
  assert.match(longTitleFallback.scenes[0].say, /Câu mở/,
    'a long hook title cannot consume the opening source fact');
  assert.ok(wordCount(longTitleFallback.scenes[0].say) <= narrationBudget(longTitleFallback.scenes[0].duration));

  const sparseSummary = sanitizeStoryboard(
    storyboardFromContent({ title: 'Tóm tắt', body_markdown: '   ' }, 'summary', {}, 60),
    { source: '   ', intent: 'summary', target: 60, assets: {} },
  );
  assert.equal(sparseSummary.storyboard.scenes.find((s) => s.type === 'keypoints')?.items.length >= 2, true,
    'an empty summary source still produces drawable keypoints');
  assert.equal(reviewStoryboard(sparseSummary.storyboard, { assets: {} }).ok, true,
    'sparse summary does not fail the beat gate');
  const whitespaceVoice = sanitizeStoryboard(
    storyboardFromContent({ title: 'Khách hàng nói gì', body_markdown: '   ' }, 'testimonial', { 'photo:0': 'photo.png' }, 15),
    { source: '   ', intent: 'testimonial', target: 60, assets: { 'photo:0': 'photo.png' } },
  );
  assert.ok(whitespaceVoice.storyboard.scenes.some((s) => s.type === 'quote' && s.text.length > 0),
    'whitespace-only source falls back to the title, not an empty quote');
  assert.equal(reviewStoryboard(whitespaceVoice.storyboard, { assets: { 'photo:0': 'photo.png' } }).ok, true,
    'whitespace-only testimonial still passes with its real photo');

  const missingDurationSay = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'Mở đầu' },
      { type: 'quote', text: 'Một chi tiết quan trọng' },
      { type: 'result', text: 'Kết luận' },
      { type: 'cta', text: 'Kết' },
    ],
  }, { source: 'Câu nguồn rất dài có nhiều chi tiết quan trọng cần kể hết. Câu nguồn thứ hai kết luận vấn đề.', intent: 'educational', target: 60, assets: {} });
  assert.ok(missingDurationSay.storyboard.scenes.every((s) => s.say.trim().length > 0),
    'a missing scene duration never truncates source narration to empty text');
  assert.ok(missingDurationSay.storyboard.scenes.every((s) => s.duration >= 1.5),
    'a missing scene duration still gets a minimum slot');
  const excerptedSay = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'Mở đầu' },
      { type: 'result', text: 'Kết luận' },
      { type: 'cta', text: 'Kết' },
    ],
  }, { source: `${'Một chi tiết mở đầu rất dài. '.repeat(8)}Kết luận cần ưu tiên hành động.`, intent: 'educational', target: 60, assets: {} });
  assert.match(excerptedSay.storyboard.scenes[1].say, /…|Kết luận/,
    'bounded source excerpts use a pause or keep a recognizable conclusion');

  const droppedSource = sanitizeStoryboard({
    scenes: [
      { type: 'not_a_scene', text: 'Scene sẽ bị loại', say: 'Câu loại không được dùng.' },
      { type: 'hook', text: 'Mở đầu' },
      { type: 'cta', text: 'Bắt đầu' },
    ],
  }, { source: 'Câu nguồn thứ nhất giải thích ngữ cảnh. Câu nguồn thứ hai nêu kết quả.', intent: 'educational', target: 60, assets: {} });
  assert.match(droppedSource.storyboard.scenes[0].say, /Câu nguồn thứ nhất giải thích ngữ cảnh\./,
    'a dropped scene cannot consume the first source detail');
  assert.match(droppedSource.storyboard.scenes[0].say, /Câu nguồn thứ hai nêu kết quả\./,
    'the surviving source detail keeps its own bounded narration');
  const sparseMissingSay = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'Mở đầu' },
      { type: 'quote', text: 'Ý một' },
      { type: 'result', text: 'Ý hai' },
      { type: 'cta', text: 'Kết' },
    ],
  }, { source: 'Câu nguồn thứ nhất giải thích ngữ cảnh. Câu nguồn thứ hai nêu kết quả.', intent: 'educational', target: 60, assets: {} });
  assert.ok(sparseMissingSay.storyboard.scenes.every((s) => s.say.trim().length > 0),
    'an empty source bucket keeps the caption fallback');
  assert.equal(new Set(sparseMissingSay.storyboard.scenes.map((s) => s.say)).size, sparseMissingSay.storyboard.scenes.length,
    'missing-say buckets do not repeat a source sentence');
  ok('with no model, every intent still yields a caption-sized story that opens and closes right');
}

// ── user-chosen templates ────────────────────────────────────────────
// The catalog is the contract with the platform's admin UI: ids, the intent
// each pins, and the degrade path when a promised ingredient (the presenter
// photo) is not there.
console.log('\n--- User-chosen templates (catalog · forced intent · new scenes) ---\n');

{
  assert.equal(TEMPLATES.length, 12, 'the catalog ships the twelve rows the platform mirrors');
  assert.equal(templateById('nope'), null, 'an unknown template id resolves to null');
  assert.equal(templateById(null), null, 'and so does an absent one');
  assert.equal(templateById('auto').id, 'auto', 'a known id resolves to its row');
  for (const t of TEMPLATES) {
    const intent = intentForTemplate(t, {});
    assert.ok(intent === null || INTENTS.includes(intent), `${t.id} resolves to a real intent or none`);
  }
  assert.equal(intentForTemplate(templateById('auto'), {}), null, 'auto leaves the choice to the engine');
  assert.equal(intentForTemplate(null, {}), null, 'no template leaves the choice to the engine');
  assert.equal(intentForTemplate(templateById('product'), { source_url: 'https://x.example' }), 'product_demo',
    'a product template with a live URL demos it');
  assert.equal(intentForTemplate(templateById('product'), {}), 'product_promotion',
    'and without one it promotes instead');
  assert.equal(intentForTemplate(templateById('news_anchor'), {}), 'news');
  assert.equal(intentForTemplate(templateById('qa'), {}), 'qa');
  ok('template ids resolve to intents, auto/unknown to none, product forks on the URL');
}

{
  // An anchor with nobody to show is a headline — recorded, not silent.
  const noFace = sanitizeStoryboard({
    scenes: [
      { type: 'anchor', text: 'Phóng viên tại hiện trường', asset: 'presenter', name: 'Minh Anh' },
      { type: 'photo', text: 'Hiện trường', asset: 'photo:0' },
      { type: 'quote', text: 'Nguồn tin cho biết' },
      { type: 'cta', text: 'Xem thêm' },
    ],
  }, { source: STORY_ARTICLE, intent: 'news', target: 60, assets: { 'photo:0': 'a.jpg' } });
  assert.ok(noFace.dropped.some((d) => d.type === 'anchor' && d.reason === 'no_presenter'),
    'the presenter-less anchor is recorded as degraded');
  assert.equal(noFace.storyboard.scenes[0].type, 'headline', 'and kept as a headline, not dropped outright');
  assert.ok(!noFace.storyboard.scenes.some((s) => s.type === 'anchor'), 'no anchor survives without the photo');

  const withFace = sanitizeStoryboard({
    scenes: [
      { type: 'headline', text: 'Tin mới nhất' },
      { type: 'anchor', text: 'Phóng viên tại hiện trường', asset: 'presenter', name: 'Minh Anh' },
      { type: 'photo', text: 'Hiện trường', asset: 'photo:0' },
      { type: 'cta', text: 'Xem thêm' },
    ],
  }, { source: STORY_ARTICLE, intent: 'news', target: 60, assets: { presenter: 'assets/presenter.jpg', 'photo:0': 'a.jpg' } });
  assert.ok(withFace.storyboard.scenes.some((s) => s.type === 'anchor' && s.asset === 'presenter'),
    'with the photo, the anchor survives');

  // A keypoints card needs at least two items to be a list at all.
  const thin = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'a' },
      { type: 'keypoints', text: 'Ý chính', items: [{ label: 'chỉ một' }] },
      { type: 'cta', text: 'b' },
    ],
  }, { source: STORY_ARTICLE, intent: 'summary', target: 60 });
  assert.ok(thin.dropped.some((d) => d.reason === 'too_few_items'), 'a one-row keypoints is refused');
  assert.ok(!thin.storyboard.scenes.some((s) => s.type === 'keypoints'), 'and never drawn');
  const full = sanitizeStoryboard({
    scenes: [
      { type: 'hook', text: 'a' },
      { type: 'keypoints', text: 'Ý chính', items: [{ label: 'một' }, { label: 'hai' }, { label: 'ba' }] },
      { type: 'cta', text: 'b' },
    ],
  }, { source: STORY_ARTICLE, intent: 'summary', target: 60 });
  assert.ok(full.storyboard.scenes.some((s) => s.type === 'keypoints' && s.items.length === 3),
    'three rows is a list and survives');

  const unknown = sanitizeStoryboard({
    scenes: [{ type: 'hook', text: 'a' }, { type: 'hologram', text: 'b' }, { type: 'cta', text: 'c' }],
  }, { source: STORY_ARTICLE, intent: 'summary', target: 60 });
  assert.ok(unknown.dropped.some((d) => d.reason === 'unknown_type'), 'an unknown scene type is still refused');
  ok('the gate degrades anchors without a presenter and refuses thin lists');
}

{
  // The quality gate's opener rule: a news piece leads with the headline. The
  // body also has to be illustrated, so the two middle screens are a photo and
  // a chart rather than two captions.
  const news = reviewStoryboard({ intent: 'news', scenes: [
    { type: 'headline', text: 'Tin mới', say: 'x', duration: 15 },
    { type: 'photo', text: 'Hiện trường', say: 'x', duration: 15, asset: 'photo:0' },
    { type: 'stat', text: 'Thương vị', say: 'x', duration: 12, value: 12 },
    { type: 'quote', text: 'Lời kết', say: 'x', duration: 12, asset: 'photo:0' },
    { type: 'cta', text: 'Xem thêm', say: 'x', duration: 12 },
  ] });
  assert.equal(news.ok, true, `a headline opener passes (${news.problems.join(', ')})`);
  const stillBad = reviewStoryboard({ intent: 'news', scenes: [
    { type: 'quote', text: 'a', say: 'x', duration: 30 }, { type: 'cta', text: 'b', say: 'x', duration: 30 },
  ] });
  assert.ok(stillBad.problems.includes('does_not_open_on_a_hook'), 'a quote still cannot open');
  ok('the review accepts a headline opener and still refuses prose');
}

{
  // The new cards: each draws its own markup, escapes every field, and the
  // anchor's equalizer is static — the same scene twice, byte-identical.
  const PRESENTER = { presenter: 'assets/presenter.jpg' };
  assert.match(sceneInner({ type: 'anchor', text: 'Bản tin tối', name: 'Minh Anh' }, '#e8590c', PRESENTER),
    /class="anchor-img" src="assets\/presenter\.jpg"/, 'the presenter photo renders in the lower third');
  const noImg = sceneInner({ type: 'anchor', text: 'Bản tin tối', name: 'Minh Anh' }, '#e8590c', {});
  assert.match(noImg, /class="anchor-initials"[^>]*>MA</, 'and initials stand in when it is missing');
  assert.match(noImg, /<svg class="anchor-eq"/, 'with static level bars');
  const anchorA = sceneInner({ type: 'anchor', text: 'x', name: 'y' }, '#e8590c', PRESENTER);
  assert.equal(anchorA, sceneInner({ type: 'anchor', text: 'x', name: 'y' }, '#e8590c', PRESENTER),
    'the anchor card is deterministic');
  assert.match(sceneInner({ type: 'headline', text: 'Tin nóng', kicker: 'KHẨN' }, '#e8590c'),
    /class="hl-kick"[^>]*>KHẨN</, 'the headline carries its kicker badge');
  assert.match(sceneInner({ type: 'headline', text: 'Tin nóng' }, '#e8590c'),
    /hl-ticker/, 'and a ticker strip');
  assert.match(sceneInner({ type: 'headline', text: 'Tin nóng' }, '#e8590c'), />TIN MỚI</, 'kicker defaults when absent');
  const kp = sceneInner({ type: 'keypoints', text: '3 ý chính', items: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] }, '#e8590c');
  assert.match(kp, /class="kp-n"[^>]*>1<[\s\S]*class="kp-n"[^>]*>2<[\s\S]*class="kp-n"[^>]*>3</, 'the points are numbered');
  assert.match(sceneInner({ type: 'question', text: 'Có gì mới?' }, '#e8590c'), /qa-badge[^>]*>\?</, 'the question wears a ?');
  assert.match(sceneInner({ type: 'answer', text: 'Xem đây' }, '#e8590c'), /data-icon="check"/, 'the answer wears a tick');
  assert.ok(wantsBackground('headline'), 'a headline reads over a full-bleed photo');
  assert.ok(!wantsBackground('anchor'), 'the lower third does not');
  ok('the new renderers draw their cards');

  const hostile = [
    { type: 'anchor', text: '<script>alert(1)</script>', name: '<script>alert(2)</script>', role: '<script>alert(3)</script>' },
    { type: 'headline', text: '<script>alert(4)</script>', kicker: '<script>alert(5)</script>' },
    { type: 'keypoints', text: '<script>alert(6)</script>', items: [{ label: '<script>alert(7)</script>' }, { label: 'b' }] },
    { type: 'question', text: '<script>alert(8)</script>' },
    { type: 'answer', text: '<script>alert(9)</script>' },
  ];
  for (const scene of hostile) {
    assert.doesNotMatch(sceneInner(scene, '#e8590c', PRESENTER), /<script/i,
      `${scene.type} must escape every string it draws`);
  }
  ok('every field of the new scenes is escaped into the markup');
}

{
  // The deterministic fallback for the three template intents — with and
  // without the presenter photo the news beats hinge on.
  const tplJob = {
    title: 'Tin mới về giá xăng', body_markdown: STORY_ARTICLE,
    highlights: ['Ý thứ nhất ở đây', 'Ý thứ hai ở đây', 'Ý thứ ba ở đây'],
    project: { name: 'Lagi Food', presenter_name: 'Minh Anh', brand: { cta: 'Xem thêm' } },
  };
  for (const intent of ['news', 'summary', 'qa']) {
    for (const assets of [{}, { presenter: 'assets/presenter.jpg' }]) {
      const sb = storyboardFromContent(tplJob, intent, assets);
      assert.ok(sb.scenes.length >= SB_MIN_SCENES && sb.scenes.length <= SB_MAX_SCENES,
        `${intent} fallback has a sane length`);
      assert.equal(sb.scenes.at(-1).type, 'cta', `${intent} fallback closes on a CTA`);
      assert.ok(sb.scenes.every((s) => s.text && wordCount(s.text) <= MAX_TEXT_WORDS),
        `${intent} fallback text is caption-sized`);
      const { storyboard: gated, dropped } = sanitizeStoryboard(sb, { source: tplJob.body_markdown, intent, target: 60, assets });
      assert.equal(dropped.filter((d) => d.reason === 'repeat_of_previous').length, 0,
        `${intent} fallback hands no repeats to the gate`);
      assert.ok(gated.scenes.length >= SB_MIN_SCENES, `${intent} survives the gate`);
      if (intent === 'news') {
        assert.equal(sb.scenes.some((s) => s.type === 'anchor'), !!assets.presenter,
          'the anchor exists exactly when the presenter photo does');
        assert.equal(gated.scenes.some((s) => s.type === 'anchor'), !!assets.presenter);
      }
      if (intent === 'summary') {
        assert.ok(gated.scenes.some((s) => s.type === 'keypoints'), 'the summary carries its keypoints card');
      }
    }
  }
  assert.ok(reviewStoryboard(sanitizeStoryboard(
    storyboardFromContent(tplJob, 'news', { presenter: 'assets/presenter.jpg' }),
    { source: tplJob.body_markdown, intent: 'news', target: 60, assets: { presenter: 'assets/presenter.jpg' } },
  ).storyboard).ok, 'the news fallback passes the quality gate');
  ok('the template fallbacks produce sane stories with or without a presenter');
}

{
  // Single-type middle beats are what makes a template recognisable; the
  // hook and CTA belong to every story and so sign nothing. A summary that
  // repeats its key-points beat needs a second shape to take, so it no longer
  // signs a single one — that is the price of a 60s summary, and it is paid
  // on purpose.
  assert.deepEqual(signatureTypes('news'), ['headline']);
  assert.deepEqual(signatureTypes('qa'), ['question']);
  assert.deepEqual(signatureTypes('storytelling'), [], 'a story makes no single-shape promise');
  assert.deepEqual(signatureTypes('summary'), [],
    'a summary that can repeat its list is no longer a single-shape promise');
  // The list is still the summary's own vocabulary — a second card is a steps
  // list, never something the summary never asked for.
  const summaryBeat = expandBeats('summary', 90).find((b) => b.beat === 'keypoints');
  assert.ok(summaryBeat && summaryBeat.types.includes('keypoints'),
    'the summary still leads with its key-points card');
  assert.ok(summaryBeat.types.some((t) => t !== 'keypoints'),
    'and offers a drawn alternative for its extra screens');

  // The anchor's name is the project's, not the model's — the model never
  // saw presenter_name, so whatever it writes is overridden at the gate.
  const named = sanitizeStoryboard({
    scenes: [
      { type: 'headline', text: 'Tin mới' },
      { type: 'anchor', text: 'Dẫn bản tin', asset: 'presenter', name: 'Bản tin' },
      { type: 'cta', text: 'Xem thêm' },
    ],
  }, { source: STORY_ARTICLE, intent: 'news', target: 60, assets: { presenter: 'p.jpg' }, presenterName: 'Minh Anh' });
  assert.equal(named.storyboard.scenes.find((s) => s.type === 'anchor').name, 'Minh Anh',
    'the presenter name is forced onto the anchor card');
  const unnamed = sanitizeStoryboard({
    scenes: [{ type: 'anchor', text: 'Dẫn', asset: 'presenter', name: 'Bản tin' }, { type: 'cta', text: 'Xem' }],
  }, { source: STORY_ARTICLE, intent: 'news', target: 60, assets: { presenter: 'p.jpg' } });
  assert.equal(unnamed.storyboard.scenes[0].name, 'Bản tin', 'without a project name the model text stays');
  ok('signature beats are named per intent, and the anchor wears the project presenter name');
}

// ── the picture, the caption and the voice have to agree ──────────────
// The reported failure was a video whose picture, on-screen words and spoken
// line were three different things. Each of the three has its own drift, and
// each is pinned here.

{
  // 1. The caption. The deterministic board writes a placeholder label and
  //    then narrates a real sentence; `fitNarration` can shorten the line
  //    after the caption was written for the longer one.
  assert.ok(captionGroundedIn('Google Maps chưa đủ bán hàng',
    'Google Maps giúp khách tìm quán, nhưng nếu thông tin mở rời rạc, khách vẫn khó quyết định có ghé hay không.'),
    'a caption reusing the narration’s own nouns is already grounded');
  assert.ok(!captionGroundedIn('Vấn đề khách hàng gặp',
    'Khách tìm quán trên bản đồ nhưng giờ mở cửa và món nổi bật đều rời rạc nên khó quyết định.'),
    'a placeholder label is not what the voice says');
  assert.ok(!captionGroundedIn('Đặt bàn trong 30 giây', 'Đặt bàn qua website.'),
    'shared nouns cannot justify a number absent from the narration');
  assert.ok(!captionGroundedIn('car car', 'cartography'),
    'prefixes and repeated tokens do not count as shared words');
  assert.ok(!captionGroundedIn('Những người bán hàng', 'Những người trồng cây'),
    'Vietnamese stopwords are normalized before matching');
  assert.equal(captionFromSay('Khách tìm quán. Còn lại thì sao?'), 'Khách tìm quán',
    'the caption is the opening of the line, at caption length');
  assert.ok(wordCount(captionFromSay('một '.repeat(40))) <= MAX_TEXT_WORDS,
    'a long line still yields a caption, not a paragraph');

  const educational = sanitizeStoryboard({ scenes: [
    { type: 'hook', text: 'Chọn trường', say: 'Chọn trường phù hợp với mục tiêu học tập.' },
    { type: 'photo', text: 'Thăm khuôn viên', say: 'Thăm khuôn viên để hiểu môi trường sống.', asset: 'hero' },
    { type: 'keypoints', text: 'Chuẩn bị hồ sơ', say: 'Chuẩn bị giấy tờ và kiểm tra hạn nộp.', items: [{ label: 'Chuẩn bị giấy tờ' }, { label: 'Kiểm tra hạn nộp' }] },
    { type: 'cta', text: 'Bắt đầu chuẩn bị', say: 'Hãy bắt đầu chuẩn bị từ hôm nay.' },
  ] }, { intent: 'educational', target: 60, assets: { hero: 'assets/campus.jpg' } });
  assert.ok(educational.storyboard.scenes.some((scene) => scene.type === 'photo' && scene.say.includes('khuôn viên')));
  assert.ok(educational.storyboard.scenes.some((scene) => scene.type === 'keypoints' && scene.say.includes('giấy tờ')));
  assert.ok(!educational.dropped.some((entry) => entry.reason === 'not_in_educational'));
  const realigned = {
    scenes: [
      { type: 'problem', text: 'Vấn đề khách hàng gặp', say: 'Khách tìm quán trên bản đồ nhưng giờ mở cửa và món nổi bật đều rời rạc nên khó quyết định.' },
      { type: 'hook', text: 'Google Maps chưa đủ bán hàng', say: 'Google Maps giúp khách tìm quán, nhưng nếu thông tin mở rời rạc thì khách vẫn khó quyết định.' },
      { type: 'cta', text: 'Mở website ngay', say: '' },
    ],
  };
  assert.equal(alignCaptions(realigned), 1, 'only the unbacked caption is rewritten');
  assert.match(realigned.scenes[0].text, /^Khách tìm quán/,
    'the replacement is what the voice actually reads on that screen');
  assert.equal(realigned.scenes[1].text, 'Google Maps chưa đủ bán hàng',
    'a caption the narration backs is left exactly as written');
  assert.equal(realigned.scenes[2].text, 'Mở website ngay',
    'a scene with nothing to say is never touched');
  ok('a caption the voice does not back up is replaced by the line it does read');

  // The whole deterministic board goes through the repair, because every one
  // of its placeholder labels is unbacked by construction.
  const board = { intent: 'educational', duration: 60, scenes: storyboardFromContent({
    title: 'Cách mở quán cà phê tại nhà',
    body_markdown: STORY_ARTICLE,
    project: { name: 'Cà Phê Sáng' },
  }, 'educational', {}, 60).scenes };
  const before = board.scenes.map((s) => s.text);
  alignCaptions(board);
  assert.equal(board.scenes.length, before.length, 'alignment never adds or drops a screen');
  assert.ok(board.scenes.every((s) => s.text), 'no screen is left with nothing on it');
  assert.ok(board.scenes.every((s) => captionGroundedIn(s.text, s.say)),
    'after the repair every caption is backed by its own narration');
  ok('a no-model storyboard comes out with every caption matching its narration');

  // 2. The picture. The prompt is built from the line the voice reads while
  //    the picture is on screen, not from the article's summary.
  const prompt = sceneImagePrompt(
    { type: 'problem', say: 'Khách tìm quán trên bản đồ nhưng giờ mở cửa đều rời rạc.' },
    { job: { project: { name: 'Cà Phê Sáng' } } });
  assert.match(prompt, /Khách tìm quán trên bản đồ/,
    'the prompt carries the words the scene is actually saying');
  assert.match(prompt, /Cà Phê Sáng/, 'and the subject it is about');
  assert.match(prompt, /không chữ|không logo/,
    'and never asks for text — the caption is drawn over it by the renderer');
  assert.ok(!sceneImagePrompt({ type: 'photo', say: '' }, {}).includes('undefined'),
    'a scene with no narration still produces a prompt');
  ok('the image prompt is derived from the scene’s own narration');

  assert.ok(isSubjectMaterial('site:0') && isSubjectMaterial('hero'),
    'a screenshot of the thing being sold, and the article hero, are the real thing');
  assert.ok(!isSubjectMaterial('photo:0') && !isSubjectMaterial(null),
    'the first <img> on a homepage is not material for this scene');
  for (const type of AI_IMAGE_TYPES) {
    assert.ok(wantsBackground(type), `${type} draws a background clip to fill`);
  }
  ok('only the scenes that draw a background are illustrated, and captured subject material is spared');

  // 3. The wiring. One image per background scene, attached by name, and the
  //    composition draws it as that screen's background — not photo:0, which
  //    is what the fallback used to put there for every screen.
  const work = mkdtempSync(join(tmpdir(), 'video-ai-image-'));
  const realFetch = globalThis.fetch;
  try {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 7)]);
    const asked = [];
    globalThis.fetch = async (url, opts) => {
      assert.equal(String(url), 'https://aifree.gulagi.com/v1/images/generations');
      asked.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ data: [{ b64_json: jpeg.toString('base64') }] }) };
    };
    const assets = { 'photo:0': 'assets/media/img0.jpg' };
    const storyboard = { scenes: [
      { type: 'hook', text: 'Mở bằng câu hỏi', say: 'Vì sao quán đầy khách mà doanh thu vẫn đi ngang?' },
      { type: 'problem', text: 'Khách lưỡng lự', say: 'Khách lưỡng lự giữa ba quán gần nhà.', asset: 'site:0' },
      { type: 'feature', text: 'Đặt bàn nhanh', say: 'Đặt bàn chỉ mất 30 giây.' },
      { type: 'quote', text: 'Chị Lan nói', say: 'Chị Lan bảo chỉ cần thấy giờ mở cửa là chị quyết định.' },
    ] };
    const made = await generateSceneImages({
      storyboard, job: { project: { name: 'Cà Phê Sáng' } }, assets, work,
      config: { key: 'sk-test' }, log: () => {},
    });
    assert.equal(made, 2, 'the hook and the quote are illustrated; the screenshot and the chart are not');
    assert.deepEqual(asked.length, 2);
    assert.equal(asked[0].size, '1024x1792', 'the request is 9:16, the shape of the canvas');
    assert.equal(asked[0].model, 'ag/gemini-3.1-flash-image');
    // jpeg magic in, .jpg out — the gateway has been seen answering a png
    // request with jpeg bytes, and Chrome sniffs a local file by name.
    assert.equal(assets['gen:0'], 'assets/gen0.jpg');
    assert.ok(existsSync(join(work, 'assets', 'gen0.jpg')));
    assert.equal(storyboard.scenes[0].asset, 'gen:0');
    assert.equal(storyboard.scenes[1].asset, 'site:0', 'a captured screenshot is never overwritten');
    assert.equal(assets['photo:0'], 'assets/media/img0.jpg', 'the scraped photo stays available as the fallback');

    const html = composeStoryboardHtml(
      { project: { name: 'Cà Phê Sáng' } },
      { intent: 'local_business', duration: 20, scenes: [
        { type: 'hook', text: 'Mở', say: 'a', duration: 6, start: 0, asset: 'gen:0' },
        { type: 'feature', text: 'Nhanh', say: 'b', duration: 6, asset: 'gen:1' },
        { type: 'cta', text: 'Đến nơi', say: 'c', duration: 6, asset: 'gen:2' },
      ] },
      [3, 3, 3], assets);
    assert.match(html, /src="assets\/gen0\.jpg"/, 'the screen draws the picture made for it');
    assert.ok(!html.includes('img0.jpg'),
      'and no longer falls back to the same unrelated photo for every screen');
    assert.ok(!html.includes('gen2.jpg'), 'a CTA is a card, not a background — no image is spent on it');
    ok('each background screen draws the image generated from its own narration');

    // A gateway that is down costs the picture, not the video: the scene
    // keeps whatever it had and the run continues.
    const brokenAssets = { 'photo:0': 'assets/media/img0.jpg' };
    const brokenBoard = { scenes: [{ type: 'hook', text: 'Mở', say: 'Vì sao vậy?', asset: 'photo:0' }] };
    globalThis.fetch = async () => ({ ok: false, status: 502, text: async () => 'upstream down' });
    const survived = await generateSceneImages({
      storyboard: brokenBoard, job: {}, assets: brokenAssets, work,
      config: { key: 'sk-test' }, log: () => {},
    });
    assert.equal(survived, 0, 'a failed image is not a failed screen');
    assert.equal(brokenBoard.scenes[0].asset, 'photo:0', 'and it keeps the material it already had');

    // No key at all: the step is skipped, not attempted.
    assert.equal(await generateSceneImages({
      storyboard: brokenBoard, job: {}, assets: brokenAssets, work, config: {}, log: () => {},
    }), 0, 'without a key nothing is requested');
    ok('a failed or unconfigured image step never costs the video');
  } finally {
    globalThis.fetch = realFetch;
    rmSync(work, { recursive: true, force: true });
  }
}

// ── the storyboard call the whole pipeline rests on ───────────────────
// Every run that cannot write a storyboard falls back to the deterministic
// board — a generic story, placeholder captions, and one reason. The model
// call is the one step with a silent failure mode, so both halves are pinned:
// the token budget has to cover reasoning AND the answer, and a failure has
// to say why it failed.
{
  const job = { title: 'Tạo Website Cho Quán Cà Phê', body_markdown: STORY_ARTICLE, project: { name: 'Cà Phê Sáng' } };
  const ask = { source: STORY_ARTICLE, suggested: 'local_business', assets: {}, target: 75 };

  const realFetch = globalThis.fetch;
  let body = null;
  try {
    globalThis.fetch = async (url, opts) => {
      body = JSON.parse(opts?.body || '{}');
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'length' }], usage: { completion_tokens: 3200, completion_tokens_details: { reasoning_tokens: 3200 } } }) };
    };
    await assert.rejects(
      writeStoryboard(job, ask),
      (e) => {
        assert.ok(body, 'the model is called');
        assert.match(e.message, /finish_reason=length/, 'a truncated answer must name itself');
        assert.match(e.message, /reasoning_tokens=3200/,
          'and report where the budget went — the old message hid this and cost a day to find');
        return true;
      },
    );
    // A 12-screen Vietnamese board is ~2 800 tokens of JSON and the model
    // reasons for ~2 600 more. Under that total the model finished thinking
    // with nothing left to answer, returned "", and every run quietly fell
    // back to the deterministic board.
    const prompt = body.messages[1].content;
    assert.ok(!prompt.includes('Google Maps chưa đủ bán hàng'), 'no fixed cafe narrative contaminates other topics');
    const exampleLine = prompt.split('\n').find((line) => line.startsWith('{"intent":') && line.includes('<caption'));
    const example = JSON.parse(exampleLine);
    const slots = beatSlots(ask.suggested, ask.target);
    assert.equal(example.intent, ask.suggested);
    assert.equal(example.scenes.length, slots.length);
    example.scenes.forEach((scene, index) => {
      assert.ok(slots[index].types.includes(scene.type), 'each example uses its own beat vocabulary');
      assert.equal(scene.duration, slots[index].duration);
    });
    // max_tokens is the whole budget, reasoning included, and the model's share
    // of it grows with the board: ~2 600 tokens of thinking for an 8-screen
    // board, 7 510 for a 12-screen one. Under that total it finishes thinking
    // with nothing left to answer, returns "", and the run quietly falls back
    // to the deterministic board. The board is up to 16 screens.
    assert.ok(body.max_tokens >= 16384,
      `max_tokens must cover reasoning AND a full 16-screen answer, got ${body.max_tokens}`);
  } finally {
    globalThis.fetch = realFetch;
  }
  ok('the storyboard budget covers reasoning, and a failure reports why');

  // The happy path still parses: one model answer, the scenes the board needs.
  try {
    globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ choices: [{
      message: { content: JSON.stringify({ intent: 'local_business', duration: 75, scenes: [
        { type: 'hook', text: 'Mở bằng câu hỏi', say: 'Vì sao quán đầy khách mà doanh thu vẫn đi ngang?', duration: 12 },
        { type: 'cta', text: 'Mở website ngay', say: 'Hãy đưa món và giờ mở cửa lên một trang thật rõ.', duration: 12 },
      ] }) },
    }] }) });
    const sb = await writeStoryboard(job, ask);
    assert.equal(sb.scenes.length, 2, 'a model answer still comes back as a board');
    assert.equal(sb.scenes[0].type, 'hook');
  } finally {
    globalThis.fetch = realFetch;
  }  ok('the storyboard call still returns a board when the model answers');

  // The gateway answers with `data:` chunks on a 200, sometimes, even though
  // nothing asked for a stream. A JSON-only reader turns that into
  // `all providers failed` and a red job for a request that in fact
  // succeeded, so the chunks are folded back into one answer.
  const board = { intent: 'local_business', duration: 60, scenes: [
    { type: 'hook', text: 'Mở bằng câu hỏi', say: 'Vì sao quán đầy khách mà doanh thu vẫn đi ngang?', duration: 10 },
    { type: 'cta', text: 'Mở website ngay', say: 'Hãy đưa món và giờ mở cửa lên một trang thật rõ.', duration: 10 },
  ] };
  // The stream carries the answer text itself, one delta at a time — the
  // agent reassembles it into the message, so a board spread over several
  // chunks must come back as one board.
  const asStream = (text) => {
    const s = JSON.stringify(text);
    const half = Math.ceil(s.length / 2);
    return `data: {"id":"x","object":"chat.completion.chunk","model":"test-upstream","choices":[{"index":0,"delta":{"content":${JSON.stringify(s.slice(0, half))}},"finish_reason":null}]}\n\n`
      + `data: {"id":"x","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":${JSON.stringify(s.slice(half))}},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":6}}\n\n`
      + 'data: [DONE]\n\n';
  };
  const scriptPath = process.env.NINEROUTER_BASE_URL || 'https://aifree.gulagi.com/v1';
  try {
    let streamCalls = 0;
    globalThis.fetch = async (url) => {
      if (String(url).includes('/chat/completions')) {
        streamCalls++;
        return { ok: true, status: 200, text: async () => asStream(board) };
      }
      throw new Error(`network disabled in tests: ${url}`);
    };
    const streamed = await writeStoryboard(job, ask);
    assert.equal(streamCalls, 1, 'a chunked answer is read, not retried');
    assert.equal(streamed.scenes.length, 2, 'and it comes back as a whole board');
    assert.equal(streamed.scenes[0].type, 'hook', 'the first scene survives the reassembly');
    // The run log names the provider that answered. When the ladder picked
    // the fallback, a line that still said "GuRouter" while 9router wrote
    // the board is the kind of thing nobody believes after the third
    // confusing render.
    assert.equal(streamed.provider, 'ninerouter', 'the board carries the provider that answered');
  } finally {
    globalThis.fetch = realFetch;
  }
  ok('a chunked 200 from the gateway is not mistaken for a failed model');

  // The ladder, and who answers. 9router is the operator's own gateway and
  // goes first; GuRouter is the cover. Workers AI cannot appear here — it is
  // a Workers binding and this agent runs on a plain host.
  const hosts = [];
  const recordHost = (fn) => async (url, opts) => {
    if (String(url).includes('/chat/completions')) hosts.push(new URL(url).host);
    return fn(url, opts);
  };
  const answers = async (url) => {
    if (String(url).includes('/chat/completions')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(board) } }] }) };
    }
    throw new Error(`network disabled in tests: ${url}`);
  };
  try {
    globalThis.fetch = recordHost(answers);
    await writeStoryboard(job, ask);
    assert.equal(hosts[0], new URL(scriptPath).host,
      '9router is asked first, and a good answer from it ends the ladder');
    assert.equal(hosts.length, 1, 'the next provider is not called when the first one works');

    // 9router unreachable for this one call, and the cover answers.
    hosts.length = 0;
    globalThis.fetch = recordHost(async (url, opts) => {
      if (String(url).includes('/chat/completions')) {
        if (new URL(url).host === new URL(scriptPath).host) {
          return { ok: false, status: 502, text: async () => '<!DOCTYPE html>' };
        }
        return answers(url, opts);
      }
      throw new Error(`network disabled in tests: ${url}`);
    });
    const covered = await writeStoryboard(job, ask);
    // Three calls, not two: a 5xx is retried once against 9router before the
    // ladder moves on. A transient gateway blip should not cost the cover
    // provider, and a real outage should not cost a second full attempt.
    assert.equal(hosts.length, 3,
      '9router is retried once on a 5xx, then the ladder moves to the next provider');
    assert.ok(hosts.slice(0, 2).every((h) => h === new URL(scriptPath).host),
      'both attempts went to 9router');
    assert.ok(hosts[2] !== new URL(scriptPath).host, 'and the third to a different gateway');
    assert.equal(covered.scenes.length, 2, 'and the job still gets its board');
  } finally {
    globalThis.fetch = realFetch;
  }
  const agentSrc = readFileSync(new URL('../video-agent/render-video.mjs', import.meta.url), 'utf8');
  const ninerouterAt = agentSrc.indexOf("'ninerouter'");
  const gurouterAt = agentSrc.indexOf("'gurouter'");
  assert.ok(ninerouterAt > -1 && gurouterAt > ninerouterAt,
    'the ladder must list 9router before GuRouter');
  assert.ok(!/workers-ai/.test(agentSrc), 'Workers AI is not a video-agent provider — it has no host to bind to');
  ok('the video agent asks 9router first and GuRouter covers for it');
}

console.log(`\nALL VIDEO AGENT TESTS PASSED (${passed} checks)`);

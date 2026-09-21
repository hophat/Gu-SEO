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
// For the post video it measures with ffmpeg: the real music bed (a bed
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
process.env.GUROUTER_API_KEY = 'test-key';

let scriptStub = null;
globalThis.fetch = async (url) => {
  if (scriptStub && String(url).includes('/chat/completions')) {
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(scriptStub) } }] }) };
  }
  throw new Error(`network disabled in tests: ${url}`);
};

const {
  composeCarouselSlideHtml, composeExplainerHtml, composeHtml, LOUDNESS, makeBgm, masterLoudness,
  narrationFor, parsePlan, renderCarousel, renderOne, slideQueries,
} = await import('../video-agent/render-video.mjs');
const {
  ICON_NAMES, MAX_SCENES, MIN_SCENES, icon, planFromMarkdown, sanitizePlan, sceneInner, statSize,
} = await import('../video-agent/explainer.mjs');
const { carouselPrefix, carouselSlideKey } = await import('../functions/_lib/video_jobs.js');

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
function postRig({ raw = 'quiet', renderFails = false } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'render-one-'));
  const seen = { spawns: [], delivers: [] };
  const deps = {
    work,
    spawn(cmd, args, opts) {
      seen.spawns.push({ cmd, args, cwd: opts?.cwd });
      if (cmd === 'edge-tts') {
        spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:d=2',
          '-b:a', '128k', args[args.indexOf('--write-media') + 1]]);
        return { status: 0, stdout: '', stderr: '' };
      }
      if (cmd === 'sleep') return { status: 0, stdout: '', stderr: '' };
      if (cmd === 'npx') {
        if (renderFails) return { status: 1, stdout: '', stderr: 'chrome exploded' };
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
  const segs = [2, 2, 2, 2];
  const withBed = composeHtml(JOB, SCRIPT, segs, null, '/tmp/bgm.mp3');
  assert.match(withBed, /<audio class="clip" data-start="0" data-duration="9\.60" data-volume="0\.12" data-track-index="6" src="assets\/bgm\.mp3"><\/audio>/,
    'the bed must be a full-length track on its own channel at the documented gain');
  assert.doesNotMatch(composeHtml(JOB, SCRIPT, segs, null, null), /assets\/bgm\.mp3/,
    'no bed means no music track');
  ok('the composition carries the bed at the documented gain, and only when there is one');
}

// ── the explainer: the article explained, not just narrated ──────────
// The point of this kind is that the video shows something the words do
// not — charts, diagrams, icons — so the checks below are about markup
// that actually draws, and about the one thing a model must not do here:
// invent a number the article never said.
console.log('\n--- Explainer composition (charts · diagrams · icons) ---\n');

const EXPLAINER_JOB = {
  id: 'vj_exp', kind: 'explainer', slug: 'giam-chi-phi-bao-bi',
  title: 'Giảm chi phí bao bì',
  // Every number the plan below draws must appear here — the guard runs on
  // this path too, so a fixture that invents one would silently lose a scene.
  body_markdown: 'Chi phí bao bì chiếm 12% doanh thu. Vận chuyển chỉ 7%. '
    + '65% shop đã đổi sang hộp giấy. Có 3 cách: đổi hộp, giảm lớp, mua số lượng lớn.',
  project: { name: 'Lagi Food', accent: '#e8590c', publishing_url: 'https://lagi.example/blog' },
};
const EXPLAINER_PLAN = {
  title: 'Giảm chi phí bao bì',
  scenes: [
    { type: 'hook', say: 'Bao bì ăn mất lợi nhuận bạn không thấy.', text: 'Bao bì ăn mất lợi nhuận' },
    { type: 'bars', say: 'Bao bì 12 phần trăm, vận chuyển 7 phần trăm.', title: 'Chi phí chiếm bao nhiêu', unit: '%',
      items: [{ label: 'Bao bì', value: 12 }, { label: 'Vận chuyển', value: 7 }] },
    { type: 'donut', say: 'Sáu lăm phần trăm shop đã đổi.', value: 65, label: 'shop đã đổi sang hộp giấy' },
    { type: 'steps', say: 'Ba bước.', title: 'Các bước', items: [{ icon: 'cart', label: 'Đo lại hộp' }, { label: 'Chọn loại một lớp' }] },
    { type: 'icons', say: 'Điểm chính.', title: 'Điểm chính', items: [{ icon: 'shield', label: 'Bền' }, { icon: 'leaf', label: 'Dễ phân huỷ' }] },
    { type: 'compare', say: 'Nên và tránh.', title: 'Nên và tránh',
      left: { title: 'Nên', items: ['Hộp một lớp'] }, right: { title: 'Tránh', items: ['Hộp ba lớp'] } },
    { type: 'quote', say: 'Đổi hộp là cách rẻ nhất.', text: 'Đổi sang hộp giấy một lớp là cách rẻ nhất.' },
    { type: 'outro', say: 'Đọc bài viết đầy đủ.', text: 'Đọc bài viết đầy đủ' },
  ],
};
const explainerDeck = (job = EXPLAINER_JOB, plan = EXPLAINER_PLAN, segs = plan.scenes.map(() => 3)) =>
  composeExplainerHtml(job, plan, segs, null, '/tmp/bgm.mp3');

{
  const html = explainerDeck();
  assert.match(html, /^<!doctype html>/, 'the composition is a standalone document');
  assert.match(html, /width=720, height=1280/, 'a vertical video is 9:16 at 720x1280');
  assert.match(html, /data-width="720"/);
  assert.match(html, /data-height="1280"/);
  // One voice track per scene, in order: the composition maps audio to
  // picture by index, so a missing or extra segment desyncs the whole video.
  for (const i of EXPLAINER_PLAN.scenes.keys()) {
    assert.match(html, new RegExp(`data-track-index="5" src="assets/seg${i}\\.mp3"`), `scene ${i} must carry its own narration`);
  }
  assert.equal((html.match(/data-track-index="5"/g) || []).length, EXPLAINER_PLAN.scenes.length,
    'exactly one narration track per scene');
  assert.match(html, /data-volume="0\.12" data-track-index="6" src="assets\/bgm\.mp3"/, 'the bed rides its own track');
  ok('the explainer composition is 9:16 with one narration track per scene');
}

{
  // What makes it an explainer rather than a slideshow of sentences: the
  // scenes actually draw. Each primitive is asserted on the markup that
  // puts pixels on screen, not on the class name alone.
  const html = explainerDeck();
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
  ok('every scene type draws its own graphic, not just text');
}

{
  // Determinism is what makes a snapshot at any moment reproducible — the
  // same property the carousel deck is pinned on.
  const a = explainerDeck(), b = explainerDeck();
  assert.equal(a, b, 'the same plan must compose the same document');
  const accented = composeExplainerHtml({ ...EXPLAINER_JOB, project: { name: 'Blog' } }, EXPLAINER_PLAN, EXPLAINER_PLAN.scenes.map(() => 3));
  assert.match(accented, /#1677ff/, 'a project with no accent falls back to the default');
  assert.match(a, /#e8590c/, 'the project accent drives the palette');
  ok('the same plan always composes the same document, with the brand accent');
}

{
  // Every string in a plan is model output derived from an article, so every
  // one of them is untrusted. Checked per primitive and per field rather
  // than on one sample: a single unescaped label is enough to inject markup
  // into the page hyperframes renders.
  const hostile = [
    { type: 'hook', text: '<script>alert(1)</script>' },
    { type: 'stat', value: 1, label: '<script>alert(2)</script>', unit: '<script>alert(3)</script>' },
    { type: 'bars', title: '<script>alert(4)</script>', items: [{ label: '<script>alert(5)</script>', value: 1 }] },
    { type: 'donut', value: 1, label: '<script>alert(6)</script>' },
    { type: 'line', title: '<script>alert(7)</script>', items: [{ label: '<script>alert(8)</script>', value: 1 }, { label: 'b', value: 2 }] },
    { type: 'steps', title: '<script>alert(9)</script>', items: [{ label: '<script>alert(10)</script>', detail: '<script>alert(11)</script>' }] },
    { type: 'timeline', title: '<script>alert(12)</script>', items: [{ label: '<script>alert(13)</script>', text: '<script>alert(14)</script>' }] },
    { type: 'icons', title: '<script>alert(15)</script>', items: [{ icon: 'star', label: '<script>alert(16)</script>' }] },
    { type: 'compare', title: '<script>alert(17)</script>',
      left: { title: '<script>alert(18)</script>', items: ['<script>alert(19)</script>'] }, right: { title: 'R', items: ['x'] } },
    { type: 'quote', text: '<script>alert(20)</script>', source: '<script>alert(21)</script>' },
    { type: 'outro', text: '<script>alert(22)</script>', url: 'https://x/<script>alert(23)</script>' },
  ];
  for (const scene of hostile) {
    assert.doesNotMatch(sceneInner(scene, '#e8590c'), /<script/i,
      `${scene.type} must escape every string it draws`);
  }
  const composed = composeExplainerHtml(EXPLAINER_JOB, { title: 'x', scenes: hostile.slice(0, 2) }, [2, 2]);
  assert.match(composed, /&lt;script&gt;/, 'hostile text is escaped rather than dropped');
  // The shell legitimately carries its own <script> tags, so this looks for
  // the injected payload rather than for any script at all.
  assert.doesNotMatch(composed, /<script>alert/, 'and never reaches the rendered document as markup');
  ok('every field of every scene is escaped into the markup');
}

// ── the number guard: a video may not invent statistics ──────────────
{
  const article = 'Chi phí bao bì chiếm 12% doanh thu. Vận chuyển chỉ 7%.';
  const { plan: clean, dropped } = sanitizePlan({
    scenes: [
      { type: 'hook', text: 'H' },
      { type: 'stat', value: 12, unit: '%', label: 'bao bì' },
      { type: 'stat', value: 99, unit: '%', label: 'bịa ra' },
      { type: 'bars', title: 'B', items: [{ label: 'a', value: 12 }, { label: 'b', value: 7 }, { label: 'c', value: 99 }] },
      { type: 'donut', value: 12345, label: 'bịa' },
      { type: 'nonsense' },
      { type: 'outro', text: 'O' },
    ],
  }, article);

  assert.deepEqual(clean.scenes.map((s) => s.type), ['hook', 'stat', 'bars', 'outro'], 'only scenes with sourced numbers survive');
  assert.equal(JSON.stringify(clean).includes('99'), false, 'an invented number must never reach the frame');
  assert.equal(JSON.stringify(clean).includes('12345'), false, 'nor an invented donut');
  assert.deepEqual(clean.scenes.find((s) => s.type === 'bars').items.map((i) => i.value), [12, 7],
    'a bar the article never mentioned is dropped, the sourced ones stay');
  assert.ok(dropped.some((d) => d.reason === 'number_not_in_article'), 'and the drop is reported, not silent');
  assert.ok(dropped.some((d) => d.reason === 'unknown_type'), 'an unknown scene type is dropped too');
  ok('a plan may only show numbers the article actually contains');
}

{
  // Thousand separators differ between prose and a plan; "1.000.000" in
  // the article is the same number as "1000000" in the chart.
  const { plan: clean } = sanitizePlan(
    { scenes: [{ type: 'stat', value: 1000000, label: 'doanh thu' }, { type: 'outro', text: 'o' }] },
    'Doanh thu đạt 1.000.000 đồng mỗi tháng.');
  assert.equal(clean.scenes[0].type, 'stat', 'the same number written differently must still match');
  ok('thousands separators do not turn a real number into a fabricated one');
}

{
  // The model is asked for an icon from a fixed list, but it is a model:
  // an unknown name has to degrade to something drawable, not to a hole.
  assert.ok(ICON_NAMES.length >= 20, 'there is a real icon set to draw from');
  assert.match(icon('definitely-not-an-icon'), /data-icon="star"/, 'an unknown icon falls back');
  assert.match(icon('shield'), /data-icon="shield"/, 'a known one is drawn');
  const { plan: clean } = sanitizePlan({ scenes: [{ type: 'icons', items: [{ icon: 'nope', label: 'x' }] }, { type: 'outro', text: 'o' }] }, 'article');
  assert.equal(clean.scenes[0].items[0].icon, 'star', 'and the plan is repaired before it is drawn');
  ok('an icon the model invented degrades to a real one');
}

// ── the fallback: no model, still a video ────────────────────────────
{
  const md = `# Giảm chi phí bao bì

Chi phí bao bì chiếm 12% doanh thu. Vận chuyển chỉ 7%.

- Đổi sang hộp một lớp
- Giảm số lớp giấy
- Mua số lượng lớn

Một câu dài khác để làm quote cho video này nhé bạn.`;
  const plan = planFromMarkdown(md, 'Giảm chi phí bao bì');
  assert.ok(plan.scenes.length >= MIN_SCENES, `the fallback must be long enough to be a video (${plan.scenes.length} scenes)`);
  assert.ok(plan.scenes.length <= MAX_SCENES, 'and short enough to render');
  assert.equal(plan.scenes[0].type, 'hook', 'it opens on the article title');
  assert.equal(plan.scenes.at(-1).type, 'outro', 'and closes with the call to read');
  assert.ok(plan.scenes.some((s) => s.type === 'bars'), 'the numbers in the article become a chart');
  assert.ok(plan.scenes.some((s) => s.type === 'steps'), 'and the bullet list becomes steps');

  const { plan: clean, dropped } = sanitizePlan(plan, md);
  assert.equal(dropped.length, 0, 'the fallback is sourced from the article, so the guard has nothing to drop');
  assert.equal(clean.scenes.length, plan.scenes.length);
  assert.equal(JSON.stringify(planFromMarkdown(md, 'Giảm chi phí bao bì')), JSON.stringify(plan), 'and it is deterministic');
  ok('with no model at all the article still yields a full, truthful explainer plan');
}

{
  // narrationFor is what keeps the audio count equal to the scene count
  // when the model forgets to write "say".
  for (const scene of EXPLAINER_PLAN.scenes) {
    const line = narrationFor({ ...scene, say: undefined });
    assert.ok(line && line.trim().length > 0, `${scene.type} must have something to say even without "say"`);
  }
  ok('every scene can narrate itself, so voice and picture never desync');
}

// ── renderOne drives the explainer path end to end ───────────────────
if (!HAS_FFMPEG) {
  console.log('… explainer renderOne checks skipped: no ffmpeg on this machine');
} else {
  {
    const r = postRig();
    scriptStub = EXPLAINER_PLAN;
    await silently(() => renderOne(EXPLAINER_JOB, r.deps));
    scriptStub = null;

    assert.equal(r.seen.delivers.length, 1, 'one deliver call');
    assert.equal(r.seen.delivers[0].path, '/api/admin/video/deliver');
    assert.equal(r.seen.delivers[0].header, EXPLAINER_JOB.id);
    assert.ok(r.seen.spawns.some((s) => s.cmd === 'npx' && s.args.includes('render')), 'the render ran');
    // What was rendered is the explainer composition, not a teaser.
    const composed = readFileSync(join(r.work, 'index.html'), 'utf8');
    assert.match(composed, /class="bar-fill"/, 'the rendered document carries a chart');
    assert.match(composed, /assets\/seg7\.mp3/, 'and narration for the last scene');
    assert.equal((composed.match(/data-track-index="5"/g) || []).length, EXPLAINER_PLAN.scenes.length);
    ok('renderOne renders the explainer composition and delivers it');
    r.done();
  }

  {
    // GuRouter is down (the test fetch refuses everything): the job must
    // still produce a video, derived from the article.
    const r = postRig();
    scriptStub = null;
    const lines = await captureLogs(() => renderOne(EXPLAINER_JOB, r.deps));
    assert.equal(r.seen.delivers.length, 1, 'a model outage must not cost the job');
    assert.ok(lines.some((l) => /deriving scenes from the article/.test(l)), 'and it says so rather than pretending');
    const composed = readFileSync(join(r.work, 'index.html'), 'utf8');
    assert.match(composed, /data-track-index="5"/, 'the fallback composition still narrates');
    ok('with GuRouter down the explainer falls back to the article instead of failing');
    r.done();
  }
}

console.log(`\nALL VIDEO AGENT TESTS PASSED (${passed} checks)`);

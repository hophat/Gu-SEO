// Smoke test for the carousel path of the render agent.
//
// The agent runs on a VPS with Chrome + hyperframes + ffmpeg, none of which
// exist here. So this drives the real renderCarousel with a temp workspace,
// a faked snapshot process, a faked Openverse fetch and a faked deliver POST
// — real filesystem, no Chrome, no network — and separately pins the deck's
// markup contract (the part the platform and the admin UI contract with):
// 5 slides at 1080x1350, cover / 3 points / CTA, text escaped, and the same
// input producing the same HTML (what makes a snapshot at any --at time
// deterministic).
//
//   node --no-warnings scripts/run-video-agent-tests.mjs
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The agent refuses to load without config, and an empty key forces the
// offline script fallback so no test can reach GuRouter.
process.env.BASE_URL = 'https://agent.test';
process.env.ADMIN_TOKEN = 'test-token';
process.env.GUROUTER_API_KEY = '';

const { composeCarouselSlideHtml, renderCarousel, slideQueries } = await import('../video-agent/render-video.mjs');
const { carouselPrefix, carouselSlideKey } = await import('../functions/_lib/video_jobs.js');

let passed = 0;
function ok(label) { passed++; console.log(`✓ ${label}`); }
// renderCarousel narrates every step; that is useful on the VPS and noise here.
async function silently(fn) {
  const real = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = real; }
}

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

console.log(`\nALL VIDEO AGENT TESTS PASSED (${passed} checks)`);

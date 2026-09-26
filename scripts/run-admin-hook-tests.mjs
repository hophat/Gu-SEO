// Tests for the shared admin queue hook (src/admin/lib/videoQueue.js).
//
// The Video page and the Carousel page are two views of one queue, and only
// the Carousel page opts into auto-refresh (the agent renders off-platform on
// a ~5 minute cycle; the Video page is an inventory view). That difference
// lives entirely inside a React hook, so it is exercised rather than read:
// the hook runs on a minimal runtime (scripts/admin-hook-harness.mjs) with a
// fake fetch and fake timers.
//
//   node --no-warnings scripts/run-admin-hook-tests.mjs
import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = new URL('./admin-hook-harness.mjs', import.meta.url).href;

// The hook imports `react` / `antd`; point both at the harness. These tests
// need Node's module hooks (>= 22.15); the platform suite in the same
// `npm test` already needs node:sqlite, so the floor does not move much.
const { registerHooks } = nodeModule;
assert.equal(typeof registerHooks, 'function', 'the admin hook tests need Node >= 22.15 for module hooks');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'react' || specifier === 'antd') return { url: HARNESS, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { Harness, messageLog } = await import(HARNESS);
const hook = await import('../src/admin/lib/videoQueue.js');

let passed = 0;
function ok(label) { passed++; console.log(`✓ ${label}`); }

// ── fake fetch ───────────────────────────────────────────────────────
let requests = [];
let responses = [];
globalThis.window = { location: { origin: 'http://localhost' } };
globalThis.fetch = async (url, init = {}) => {
  requests.push({ url: String(url), method: init.method || 'GET' });
  // The last canned response repeats, so a poll cannot run out of answers.
  const r = responses.length > 1 ? responses.shift() : responses[0];
  return { status: r.status, json: async () => r.body };
};

// ── fake timers: intervals are recorded, never fired on their own ─────
let intervals = [];
globalThis.setInterval = (fn, ms) => { const t = { fn, ms, id: intervals.length + 1 }; intervals.push(t); return t.id; };
globalThis.clearInterval = (id) => { const i = intervals.findIndex((t) => t.id === id); if (i >= 0) intervals.splice(i, 1); };

const jobsResponse = (jobs) => ({ status: 200, body: { ok: true, jobs } });
const CAROUSEL_PENDING = [{ id: 'j1', kind: 'carousel', status: 'pending', slug: 'alpha-post', title: 'T' }];
const CAROUSEL_DONE = [{ id: 'j1', kind: 'carousel', status: 'done', slug: 'alpha-post', title: 'T', slides: ['/image/carousel/alpha-post-1.png'] }];

function mount(opts) { return new Harness(() => hook.useVideoJobs(opts)); }

console.log('--- Admin queue hook (polling · status copy) ---\n');

// ── Video page: inventory view, never polls ──────────────────────────
{
  requests = []; responses = [jobsResponse(CAROUSEL_PENDING)]; intervals = [];
  const v = mount({ poll: false });
  const out = await v.settle();
  assert.deepEqual(requests.map((r) => r.url), ['/api/admin/video/list']);
  assert.equal(out.loading, false);
  assert.equal(intervals.length, 0, 'the Video page must not register a refresh timer');
  const before = requests.length;
  await new Promise((r) => setImmediate(r));
  assert.equal(requests.length, before, 'the Video page must not re-fetch on its own');
  ok('Video page loads once and never polls');

  const src = readFileSync(join(ROOT, 'src/admin/pages/Video.jsx'), 'utf8');
  assert.match(src, /useVideoJobs\(\{\s*poll:\s*false\s*\}\)/, 'Video.jsx must opt out of polling');
  ok('Video page is wired to poll:false');

  // The delete button used to vanish on row hover. Cause, measured in Chrome
  // against this exact column set: "Bài viết" and "Lỗi render" carry
  // `ellipsis`, which makes @rc-component/table force `table-layout: fixed`;
  // the four action buttons need 232px plus 32px of cell padding = 264px, so
  // at the old width of 220 they spilled into the next cell — and that cell's
  // background, painted on hover, covered the delete button. A narrower cell
  // than this brings the bug back, so pin it.
  const actions = src.match(/title: 'Hành động',\s*key: 'actions',\s*width: (\d+)/);
  assert.ok(actions, 'the Video actions column must be keyed `actions` and carry an explicit width');
  assert.ok(Number(actions[1]) >= 264,
    `the Video actions cell needs >= 264px for its four buttons, got ${actions[1]}`);
  ok('the Video actions cell is wide enough for its buttons (delete survives hover)');
  v.unmount();
}

// ── the Programmatic SEO action cell has room for its buttons ────────
{
  // The keyword table carries `ellipsis` columns, so @rc-component/table
  // forces table-layout:fixed here too. Measured with the real antd: a
  // pending row (a number and four icon buttons) needs 132px plus 16px of
  // small-table cell padding = 148. The column was 150 — two pixels of slack
  // — so adding the delete button would have spilled it into the neighbour.
  const prog = readFileSync(join(ROOT, 'src/admin/pages/Prog.jsx'), 'utf8');
  const col = prog.match(/title: 'Ưu tiên'[\s\S]{0,200}?width: (\d+)/);
  assert.ok(col, 'the Programmatic SEO action column must carry an explicit width');
  assert.ok(Number(col[1]) >= 148,
    `the Prog action cell needs >= 148px for four buttons, got ${col[1]}`);
  ok('the Programmatic SEO action cell is wide enough for its buttons');
}

// ── Carousel page: polls while the agent is still working ────────────
{
  requests = []; responses = [jobsResponse(CAROUSEL_PENDING)]; intervals = [];
  const c = mount({ noun: 'carousel' });
  await c.settle();
  assert.equal(intervals.length, 1, 'one refresh timer while a job is in progress');
  assert.equal(intervals[0].ms, 20000, 'the render cycle is ~5 minutes; 20s keeps the page honest');
  const before = requests.length;
  intervals[0].fn();
  await c.settle(4);
  assert.ok(requests.length > before, 'the timer must re-fetch the queue');
  ok('Carousel page polls every 20s while a job is in progress');

  // Nothing left in progress: the timer must go away.
  responses = [jobsResponse(CAROUSEL_DONE)];
  intervals[0].fn();
  await c.settle(4);
  assert.equal(intervals.length, 0, 'polling must stop once no job is in progress');
  ok('polling stops when the queue is idle');
  c.unmount();

  const src = readFileSync(join(ROOT, 'src/admin/pages/Carousel.jsx'), 'utf8');
  assert.doesNotMatch(src, /poll:\s*false/, 'Carousel.jsx must keep polling');
  ok('Carousel page is wired to poll');
}

// ── the copy a row action shows ──────────────────────────────────────
{
  requests = []; responses = [jobsResponse(CAROUSEL_DONE)]; intervals = []; messageLog.length = 0;
  const c = mount({ noun: 'carousel' });
  const out = await c.settle();

  responses = [{ status: 200, body: { ok: true, posted: true } }, jobsResponse(CAROUSEL_DONE)];
  assert.equal(await out.publish('j1'), true);
  await c.settle(3);
  assert.deepEqual(requests.at(-1), { url: '/api/admin/video/list', method: 'GET' }, 'publish reloads the list');
  assert.match(messageLog.at(-1).text, /carousel/, 'the success copy names the job kind');

  responses = [{ status: 409, body: { error: 'already_enqueued' } }];
  assert.equal(await out.publish('j1'), false);
  await c.settle(2);
  // The copy says "đang được đăng" because that is now the only case the API
  // refuses: a finished post is re-postable by hand (see enqueueSocialPost's
  // `repost`), so the message must not claim a job exists when none does.
  assert.match(messageLog.at(-1).text, /đang được đăng/, 'a duplicate publish explains itself instead of showing the code');
  ok('publish reloads, names the kind and explains a duplicate');

  responses = [{ status: 500, body: { error: 'r2_delete_failed', detail: 'R2 said no' } }];
  assert.equal(await out.remove('j1'), false);
  await c.settle(2);
  assert.equal(messageLog.at(-1).text, 'R2 said no', 'a delete failure surfaces the server detail');
  ok('a failed delete surfaces the server detail');
  c.unmount();
}

// statusMeta(status, table) — the refactor moved the per-table vocabulary
// into src/admin/lib/status.js and settled the argument order as
// (raw status, table). These two are the same fact read through two
// tables, so they must still read differently.
assert.equal(hook.statusMeta('done', 'carousel').text, 'Sẵn sàng đăng');
assert.equal(hook.statusMeta('done', 'video').text, 'Đã có video');
ok('the same status reads differently per job kind');

console.log(`\nALL ADMIN HOOK TESTS PASSED (${passed} checks)`);

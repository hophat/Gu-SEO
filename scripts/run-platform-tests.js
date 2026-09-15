// Integration + unit tests for the platform layer: schema migrations,
// the social publishing queue, Facebook publishing, OAuth state and embed
// settings.
//
// Unlike scripts/run-tests.js (which drives a hand-written SQL matcher),
// these run the real SQL against node:sqlite, so queue mechanics that only
// fail under concurrent claims or re-runs are actually exercised.
//
//   npm run test:platform
import assert from 'node:assert/strict';
import { createSqliteEnv } from './sqlite-env.js';
import { SCHEMA_SQL } from '../functions/_lib/schema.js';
import { runMigrations, appliedMigrations } from '../functions/_lib/migrations.js';
import { MIGRATIONS } from '../functions/_lib/migrations_bundle.js';
import {
  enqueueSocialPost, drainSocialQueue, runSocialJob, listSocialPosts,
  retrySocialPost, cancelSocialPost, backoffSec, isCredentialError,
} from '../functions/_lib/publishing/social_queue.js';
import {
  describeGraphError, buildFacebookMessage, parseFacebookConfig, projectPublicBase,
} from '../functions/_lib/publishing/facebook.js';
import { signState, verifyState, buildAuthUrl } from '../functions/_lib/publishing/facebook_oauth.js';
import { sanitizeEmbedSettings, snippetFor, embedWidgetOptions } from '../functions/_lib/embed_settings.js';

let passed = 0;
// Captured before any test stubs console.log, so progress lines still print.
const out = (...args) => process.stdout.write(args.join(' ') + '\n');
function ok(label) { passed++; out(`✓ ${label}`); }

const PROJECT = 'proj_test_a';
const OTHER = 'proj_test_b';
const POST = 'post_test_1';
const POST_B = 'post_test_2';

async function freshEnv() {
  const env = createSqliteEnv();
  await runMigrations(env, { logger: { log: () => {}, error: () => {} } });
  const t = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO projects (id, slug, name, website_url, publishing_url, language, timezone, status, approval_mode, created_at, updated_at)
     VALUES (?, 'alpha', 'Alpha', 'https://alpha.example', 'https://seo.test/alpha', 'vi', 'Asia/Ho_Chi_Minh', 'active', 'auto', ?, ?)`
  ).bind(PROJECT, t, t).run();
  await env.DB.prepare(
    `INSERT INTO projects (id, slug, name, website_url, publishing_url, language, timezone, status, approval_mode, created_at, updated_at)
     VALUES (?, 'beta', 'Beta', 'https://beta.example', 'https://seo.test/beta', 'vi', 'Asia/Ho_Chi_Minh', 'active', 'auto', ?, ?)`
  ).bind(OTHER, t, t).run();
  for (const [id, pid, slug] of [[POST, PROJECT, 'alpha-post'], [POST_B, OTHER, 'beta-post']]) {
    await env.DB.prepare(
      `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, created_at, published_at)
       VALUES (?, ?, 'Tiêu đề', 'Mô tả', '# Body', 'published', ?, ?)`
    ).bind(id, slug, t, t).run();
  }
  return env;
}

async function jobRow(env, id) {
  return env.__get('SELECT * FROM social_posts WHERE id = ?', id);
}

// ── A. migrations ───────────────────────────────────────────────────
async function testMigrations() {
  console.log('\nA. Schema migrations');

  const env = createSqliteEnv();
  const first = await runMigrations(env, { logger: { log: () => {}, error: () => {} } });
  assert.equal(first.ok, true, 'fresh migration run must succeed');
  assert.equal(first.previously_applied, 0);
  assert.ok(first.applied.length >= 1, 'fresh DB must apply migrations');
  ok('fresh database applies baseline + all migrations');

  const tables = await env.__all("SELECT name FROM sqlite_master WHERE type='table'");
  const names = tables.map((t) => t.name);
  assert.ok(names.includes('schema_migrations'), 'schema_migrations must exist');
  assert.ok(names.includes('social_posts'), 'social_posts must exist');
  ok('social_posts created by migration, not by init.sql');

  // Re-run must be a no-op and must not throw.
  const second = await runMigrations(env, { logger: { log: () => {}, error: () => {} } });
  assert.equal(second.ok, true, 're-run must not fail');
  assert.equal(second.applied.length, 0, 're-run must apply nothing');
  assert.equal(second.previously_applied, MIGRATIONS.length);
  ok('re-run is a no-op (idempotent)');

  // A legacy database: base schema present, no schema_migrations row.
  // This is the production case that used to fail with
  // "duplicate column name".
  const legacy = createSqliteEnv();
  for (const stmt of SCHEMA_SQL.split(/;\s*(?:\r?\n|$)/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) {
    try { legacy.__sqlite.exec(stmt); } catch { /* some ALTERs already applied */ }
  }
  const legacyRun = await runMigrations(legacy, { logger: { log: () => {}, error: () => {} } });
  assert.equal(legacyRun.ok, true, 'legacy DB must converge, not fail');
  assert.ok(legacyRun.baseline.applied > 0, 'baseline must run against legacy DB');
  ok('legacy database converges without duplicate-column failure');

  const applied = await appliedMigrations(env);
  assert.equal(applied.size, MIGRATIONS.length);
  ok('appliedMigrations reflects recorded state');
}

// ── B. social queue ─────────────────────────────────────────────────
async function testQueue() {
  console.log('\nB. Social publishing queue');
  const env = await freshEnv();

  // Idempotency
  const a = await enqueueSocialPost(env, { projectId: PROJECT, blogPostId: POST, channel: 'facebook' });
  const b = await enqueueSocialPost(env, { projectId: PROJECT, blogPostId: POST, channel: 'facebook' });
  assert.equal(a.enqueued, true);
  assert.equal(b.enqueued, false, 'second enqueue must be ignored');
  const rows = await env.__all('SELECT id FROM social_posts');
  assert.equal(rows.length, 1, 'exactly one row per (post, channel)');
  ok('enqueue is idempotent per (blog_post, channel)');

  // Happy path
  const okDispatch = async () => ({ ok: true, post_id: 'fb_1', post_url: 'https://facebook.com/fb_1' });
  const drained = await drainSocialQueue(env, { projectId: PROJECT, dispatch: okDispatch });
  assert.equal(drained.processed, 1);
  const j = await jobRow(env, rows[0].id);
  assert.equal(j.status, 'published');
  assert.equal(j.external_url, 'https://facebook.com/fb_1');
  assert.equal(j.attempts, 1);
  assert.equal(j.needs_reconnect, 0);
  assert.ok(j.published_at > 0);
  ok('drain publishes and records external url');

  // A published job must not be re-drained.
  const again = await drainSocialQueue(env, { projectId: PROJECT, dispatch: okDispatch });
  assert.equal(again.processed, 0, 'published job must not be claimed again');
  ok('published job is not drained twice');

  // Credential failure: stop retrying, raise needs_reconnect.
  await enqueueSocialPost(env, { projectId: OTHER, blogPostId: POST_B, channel: 'facebook' });
  const credDispatch = async () => {
    const e = new Error('Token hết hạn');
    e.graph = { code: 190, error_subcode: 463 };
    throw e;
  };
  await drainSocialQueue(env, { projectId: OTHER, dispatch: credDispatch });
  const credJob = await env.__get("SELECT * FROM social_posts WHERE blog_post_id = ?", POST_B);
  assert.equal(credJob.status, 'failed');
  assert.equal(credJob.needs_reconnect, 1, 'credential error must flag reconnect');
  assert.equal(credJob.attempts, 1, 'must not burn the retry budget on a credential error');
  ok('credential error (190) stops retrying and flags needs_reconnect');

  // A reconnect-flagged job is skipped by the drain until a human acts.
  const skipped = await drainSocialQueue(env, { projectId: OTHER, dispatch: okDispatch });
  assert.equal(skipped.processed, 0, 'needs_reconnect job must be parked');
  ok('needs_reconnect job is not retried automatically');

  // Transient failure: retry with backoff.
  await env.DB.prepare(
    "UPDATE social_posts SET status='pending', needs_reconnect=0, attempts=0, next_attempt_at=0 WHERE blog_post_id = ?"
  ).bind(POST_B).run();
  const transient = async () => { throw new Error('Facebook HTTP 503'); };
  await drainSocialQueue(env, { projectId: OTHER, dispatch: transient });
  const t1 = await env.__get('SELECT * FROM social_posts WHERE blog_post_id = ?', POST_B);
  assert.equal(t1.status, 'failed');
  assert.equal(t1.needs_reconnect, 0, 'transient error must not flag reconnect');
  assert.ok(t1.next_attempt_at > Math.floor(Date.now() / 1000), 'must schedule a retry in the future');
  ok('transient error schedules a backoff retry');

  // Not due yet → not drained.
  const notDue = await drainSocialQueue(env, { projectId: OTHER, dispatch: okDispatch });
  assert.equal(notDue.processed, 0, 'job must wait for next_attempt_at');
  ok('job is not drained before next_attempt_at');

  // Attempt exhaustion.
  await env.DB.prepare(
    "UPDATE social_posts SET status='failed', attempts=5, max_attempts=5, next_attempt_at=0 WHERE blog_post_id = ?"
  ).bind(POST_B).run();
  await drainSocialQueue(env, { projectId: OTHER, dispatch: transient });
  const exhausted = await env.__get('SELECT * FROM social_posts WHERE blog_post_id = ?', POST_B);
  assert.equal(exhausted.status, 'failed');
  assert.equal(exhausted.attempts, 6, 'attempt counter increments then stops');
  assert.equal(exhausted.next_attempt_at, 0, 'exhausted job must not be rescheduled');
  ok('exhausted job is not rescheduled');

  // Cross-project isolation.
  const forA = await listSocialPosts(env, { projectId: PROJECT });
  const forB = await listSocialPosts(env, { projectId: OTHER });
  assert.equal(forA.length, 1);
  assert.equal(forB.length, 1);
  assert.equal(forA[0].blog_post_id, POST);
  assert.equal(forB[0].blog_post_id, POST_B);
  ok('listSocialPosts is project-scoped');

  // Manual retry resets the budget and dispatches.
  const retried = await retrySocialPost(env, { projectId: OTHER, id: exhausted.id, dispatch: okDispatch });
  assert.equal(retried.ok, true);
  const afterRetry = await jobRow(env, exhausted.id);
  assert.equal(afterRetry.status, 'published');
  assert.equal(afterRetry.attempts, 1, 'manual retry resets the attempt budget');
  ok('manual retry resets attempts and publishes');

  // Cross-project retry must 404, not touch the other tenant's job.
  const cross = await retrySocialPost(env, { projectId: PROJECT, id: exhausted.id, dispatch: okDispatch });
  assert.equal(cross.ok, false);
  assert.equal(cross.error, 'not_found');
  ok('retry refuses to touch another project\'s job');

  // Cancel.
  await enqueueSocialPost(env, { projectId: PROJECT, blogPostId: 'post_new', channel: 'facebook' });
  await env.DB.prepare(
    `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, created_at, published_at)
     VALUES ('post_new','new-post','T','D','# B','published',?,?)`
  ).bind(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();
  const newJob = await env.__get("SELECT * FROM social_posts WHERE blog_post_id='post_new'");
  const cancelled = await cancelSocialPost(env, { projectId: PROJECT, id: newJob.id });
  assert.equal(cancelled.ok, true);
  const cancelledJob = await jobRow(env, newJob.id);
  assert.equal(cancelledJob.status, 'skipped');
  const afterCancel = await drainSocialQueue(env, { projectId: PROJECT, dispatch: okDispatch });
  assert.equal(afterCancel.processed, 0, 'cancelled job must not be drained');
  ok('cancel parks a job out of the drain');

  // Two drains racing on the same job. node:sqlite is synchronous, so this
  // serialises rather than truly interleaving — what it actually proves is
  // that the conditional-claim UPDATE makes the second claim a no-op. That
  // is the same guarantee D1 relies on, where the UPDATE is atomic.
  await env.DB.prepare(
    `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, created_at, published_at)
     VALUES ('post_race','race','T','D','# B','published',?,?)`
  ).bind(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();
  await enqueueSocialPost(env, { projectId: PROJECT, blogPostId: 'post_race', channel: 'facebook' });
  let sends = 0;
  const counting = async () => { sends++; return { ok: true, post_id: 'x', post_url: 'u' }; };
  await Promise.all([
    drainSocialQueue(env, { projectId: PROJECT, dispatch: counting }),
    drainSocialQueue(env, { projectId: PROJECT, dispatch: counting }),
  ]);
  assert.equal(sends, 1, 'a job must be sent exactly once across overlapping drains');
  ok('overlapping drains send a job exactly once (conditional claim)');

  // runSocialJob on a non-claimable job.
  const notClaimable = await runSocialJob(env, newJob.id, { dispatch: okDispatch });
  assert.equal(notClaimable.ok, false);
  assert.equal(notClaimable.error, 'not_claimable');
  ok('runSocialJob refuses a non-claimable job');
}

// ── C. pure helpers ─────────────────────────────────────────────────
async function testHelpers() {
  console.log('\nC. Publishing + OAuth + embed helpers');

  // backoff
  assert.equal(backoffSec(1), 60);
  assert.equal(backoffSec(2), 120);
  assert.equal(backoffSec(3), 240);
  assert.equal(backoffSec(99), 3600, 'backoff must cap at an hour');
  ok('backoff is exponential and capped');

  // credential classification
  assert.equal(isCredentialError({ graph: { code: 190 } }), true);
  assert.equal(isCredentialError({ graph: { code: 200 } }), true);
  assert.equal(isCredentialError({ graph: { code: 10 } }), true);
  assert.equal(isCredentialError({ message: 'Facebook HTTP 503' }), false);
  assert.equal(isCredentialError({ message: 'rate limit' }), false);
  ok('credential errors are distinguished from transient ones');

  // Graph error messages must be actionable, not raw.
  assert.match(describeGraphError({ code: 190, error_subcode: 463, message: 'Session expired' }), /Tạo lại Page Access Token/);
  assert.match(describeGraphError({ code: 190, error_subcode: 467, message: 'bad' }), /admin của Page/);
  assert.match(describeGraphError({ code: 200, message: 'no perm' }), /pages_manage_posts/);
  assert.match(describeGraphError({ code: 4, message: 'limit' }), /giới hạn tần suất/);
  ok('Graph errors are translated into operator actions');

  // message template
  assert.equal(buildFacebookMessage({ title: 'A', meta_description: 'D' }, { messageTemplate: '{title} — {description}' }), 'A — D');
  assert.equal(buildFacebookMessage({ title: 'A', meta_description: 'D' }, {}), 'D');
  assert.equal(buildFacebookMessage({ title: 'A' }, {}), 'A');
  ok('message template substitutes {title}/{description}');

  // config parsing
  const cfg = parseFacebookConfig('{"page_id":"123","as_photo":true,"api_version":"v25.0"}');
  assert.equal(cfg.pageId, '123');
  assert.equal(cfg.asPhoto, true);
  assert.equal(cfg.apiVersion, 'v25.0');
  assert.equal(parseFacebookConfig('{"api_version":"25"}').apiVersion, '', 'invalid version falls back to deployment default');
  assert.equal(parseFacebookConfig('not json').pageId, '');
  ok('facebook config parsing validates input');

  // public base
  assert.equal(projectPublicBase({ publishing_url: 'https://seo.test/alpha' }), 'https://seo.test/alpha');
  assert.equal(projectPublicBase({ custom_domain: 'blog.example.com', publishing_url: 'https://seo.test/alpha' }), 'https://blog.example.com');
  assert.equal(projectPublicBase({ custom_domain: 'https://blog.example.com/' }), 'https://blog.example.com');
  ok('public base prefers the custom domain and strips trailing slashes');

  // OAuth state
  const secret = 'admin-token-value';
  const state = await signState(secret, PROJECT);
  assert.deepEqual(await verifyState(secret, state), { projectId: PROJECT });
  assert.equal(await verifyState(secret, `${state}tampered`), null, 'tampered state must be rejected');
  assert.equal(await verifyState('other-secret', state), null, 'wrong key must be rejected');
  assert.equal(await verifyState(secret, 'a.b'), null, 'malformed state must be rejected');
  ok('OAuth state round-trips and rejects tampering');

  const authUrl = buildAuthUrl({ appId: '999', redirectUri: 'https://x/cb', state: 's', version: 'v23.0' });
  assert.match(authUrl, /^https:\/\/www\.facebook\.com\/v23\.0\/dialog\/oauth\?/);
  const q = new URLSearchParams(authUrl.split('?')[1]);
  assert.equal(q.get('client_id'), '999');
  assert.equal(q.get('redirect_uri'), 'https://x/cb');
  assert.equal(q.get('response_type'), 'code');
  assert.match(q.get('scope'), /pages_manage_posts/);
  assert.match(q.get('scope'), /pages_show_list/);
  ok('auth url carries the required scopes and params');

  // embed settings whitelist
  const s = sanitizeEmbedSettings({
    title: 'T', accent: '#ABC', per_page: '6', theme: 'dark',
    palette: { bg: '#0e0f12', accent: '#e8b04b', bogus: '#fff' },
    unexpected: 'dropped',
  });
  assert.equal(s.title, 'T');
  assert.equal(s.accent, '#abc', 'accent is normalised to lowercase');
  assert.equal(s.per_page, 6);
  assert.equal(s.theme, 'dark');
  assert.deepEqual(Object.keys(s.palette).sort(), ['accent', 'bg'], 'unknown palette keys are dropped');
  assert.equal(s.unexpected, undefined, 'unknown top-level keys are dropped');
  assert.equal(sanitizeEmbedSettings({ theme: 'neon' }).theme, undefined);
  assert.equal(sanitizeEmbedSettings({ accent: 'javascript:alert(1)' }).accent, undefined, 'non-hex colours are rejected');
  assert.equal(sanitizeEmbedSettings({ per_page: 999 }).per_page, undefined, 'per_page is bounded');
  ok('embed settings whitelist drops unknown keys and unsafe colours');

  // snippet uniqueness
  const s1 = snippetFor('https://seo.test', 'abcdefgh12345678');
  const s2 = snippetFor('https://seo.test', 'zzzzzzzz12345678');
  assert.match(s1, /id="ps-blog-abcdefgh"/);
  assert.match(s1, /data-target="#ps-blog-abcdefgh"/);
  assert.notEqual(s1, s2, 'two embeds must get different container ids');
  assert.doesNotMatch(s1, /id="ps-blog"/, 'must not reuse the shared container id');
  ok('snippet gives every embed its own container id');

  // widget options defaults
  const opts = embedWidgetOptions({
    settings: { per_page: 6, theme: 'dark' },
    embed: { id: 'e1', name: 'Blog', project_slug: 'alpha', project_language: 'vi', project_theme_color: '#123456' },
    origin: 'https://seo.test',
  });
  assert.equal(opts.perPage, 6);
  assert.equal(opts.theme, 'dark');
  assert.equal(opts.accent, '#123456', 'accent falls back to the project theme colour');
  assert.equal(opts.project, 'alpha');
  assert.equal(opts.titleAuto, true, 'no explicit title means the widget may use the site name');
  ok('widget options inherit project defaults');
}

// ── D. cron schedule routing ────────────────────────────────────────
// The master cron fires every 15 minutes and decides from the invocation's
// UTC hour what to run. Getting this wrong silently double-runs the daily
// chain (or never runs it), so it is worth pinning down.
async function testCronRouting() {
  console.log('\nD. Cron schedule routing');
  const { default: worker } = await import('../cron-worker/src/index.js');

  const realFetch = globalThis.fetch;
  const realLog = console.log;
  const tasks = [];
  const jsonRes = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });

  async function runAt(iso) {
    tasks.length = 0;
    globalThis.fetch = async (u, init) => {
      const payload = init?.body ? JSON.parse(init.body) : {};
      tasks.push(payload.task);
      // dry_run lists projects; the per-project call is the real work.
      if (payload.dry_run) return jsonRes({ ok: true, projects: [{ id: 'p1', slug: 'p1' }] });
      return jsonRes({ ok: true, projects_processed: 1, results: [] });
    };
    const pending = [];
    await worker.scheduled(
      { scheduledTime: new Date(iso).getTime() },
      { ADMIN_TOKEN: 't', BLOG_URL: 'https://x/api/admin/blog' },
      { waitUntil: (p) => pending.push(p) }
    );
    await Promise.allSettled(pending);
    return [...new Set(tasks)];
  }

  try {
    // The worker logs a one-line summary per run; that is useful in
    // production and noise here.
    console.log = () => {};

    const at0130 = await runAt('2026-09-15T01:00:00Z');
    assert.ok(at0130.includes('social'), 'social drain must run on every tick');
    assert.ok(at0130.includes('blog'), 'blog must run at the configured hour');
    assert.ok(!at0130.includes('prog'), 'prog must not run at the blog hour');
    ok('01:00 UTC runs social + blog');

    const at0900 = await runAt('2026-09-15T09:00:00Z');
    assert.ok(at0900.includes('prog'), 'prog must run at its hour');
    assert.ok(!at0900.includes('blog'), 'blog must not run twice');
    ok('09:00 UTC runs social + prog');

    const at0215 = await runAt('2026-09-15T02:15:00Z');
    assert.deepEqual(at0215, ['social'], 'off-hour ticks must only drain the queue');
    ok('off-hour tick drains social only');

    // A late/duplicate invocation must not re-run the daily chain.
    const at0130late = await runAt('2026-09-15T01:30:00Z');
    assert.ok(!at0130late.includes('blog'), 'a :30 invocation must not re-run the daily chain');
    ok('non-top-of-hour tick never runs the daily chain');

    // Weekly refresh is Monday only.
    const monday = await runAt('2026-09-14T07:00:00Z'); // 2026-09-14 is a Monday
    const tuesday = await runAt('2026-09-15T07:00:00Z');
    assert.ok(monday.includes('refresh'), 'refresh must run on Monday');
    assert.ok(!tuesday.includes('refresh'), 'refresh must not run on other days');
    ok('weekly refresh is Monday-only');

    // The fan-out must be per project, not one all-projects call.
    tasks.length = 0;
    globalThis.fetch = async (u, init) => {
      const payload = init?.body ? JSON.parse(init.body) : {};
      tasks.push(payload);
      if (payload.dry_run) return jsonRes({ ok: true, projects: [{ id: 'p1', slug: 'a' }, { id: 'p2', slug: 'b' }] });
      return jsonRes({ ok: true, projects_processed: 1, results: [] });
    };
    const pending = [];
    await worker.scheduled(
      { scheduledTime: new Date('2026-09-15T02:00:00Z').getTime() },
      { ADMIN_TOKEN: 't', BLOG_URL: 'https://x/api/admin/blog' },
      { waitUntil: (p) => pending.push(p) }
    );
    await Promise.allSettled(pending);
    const perProject = tasks.filter((p) => !p.dry_run);
    assert.equal(perProject.length, 2, 'one tick call per project');
    assert.deepEqual(perProject.map((p) => p.project_id).sort(), ['p1', 'p2']);
    ok('fan-out issues one tick call per project');
  } finally {
    globalThis.fetch = realFetch;
    console.log = realLog;
  }
}

async function main() {
  console.log('--- Platform tests (migrations · social queue · publishing · cron) ---');
  await testMigrations();
  await testQueue();
  await testHelpers();
  await testCronRouting();
  console.log(`\nALL PLATFORM TESTS PASSED (${passed} checks)`);
}

main().catch((err) => {
  console.error('\n✗ TEST FAILED');
  console.error(err?.stack || err);
  process.exit(1);
});

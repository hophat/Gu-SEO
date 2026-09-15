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
import { buildAliasMap, syncSitemapAliases } from '../functions/_lib/links/aliases.js';
import { onRequestGet as attention } from '../functions/api/admin/attention.js';
import { onRequestGet as activation } from '../functions/api/admin/activation.js';
import { onRequestPatch as aliasPatch, onRequestDelete as aliasDelete } from '../functions/api/admin/aliases/index.js';
import { track, trackOnce } from '../functions/_lib/events.js';
import { computeInsights, isoWeek } from '../functions/_lib/insights.js';
import { onRequestGet as insights } from '../functions/api/admin/insights.js';
import {
  onRequestGet as onboardingGet, onRequestPost as onboardingPost, onRequestDelete as onboardingDelete,
} from '../functions/api/admin/onboarding.js';

// Admin endpoints authenticate through the bearer token, so tests need a
// request shaped the way adminGate()/resolveTenantContext() expect.
function adminReq(url, { body, token = 'test-admin-token-123' } = {}) {
  const headers = new Map([['Authorization', `Bearer ${token}`]]);
  const req = {
    url,
    headers,
    clone() { return req; },
    json: async () => body || {},
  };
  return {
    ...req,
    headers: {
      get: (h) => {
        for (const [k, v] of headers.entries()) {
          if (k.toLowerCase() === h.toLowerCase()) return v;
        }
        return null;
      },
    },
  };
}

let passed = 0;
// Captured before any test stubs console.log, so progress lines still print.
const out = (...args) => process.stdout.write(args.join(' ') + '\n');
function ok(label) { passed++; out(`✓ ${label}`); }

// Apply the base schema directly, without the migration pass. Used by tests
// that need to construct a pre-migration database on purpose.
function execSchema(env) {
  for (const stmt of SCHEMA_SQL.split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean)) {
    try { env.__sqlite.exec(stmt); } catch { /* already-applied ALTERs */ }
  }
}

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

// ── E. project-scoped aliases ───────────────────────────────────────
// Migration 002 rebuilds site_aliases because the legacy table had
// `name` as the primary key — one row per name for the WHOLE database, so
// every project saw every other project's aliases. The migration renames the
// old table rather than dropping it, so the tests check both that data
// survives and that isolation now holds.
async function testAliasScoping() {
  console.log('\nE. Project-scoped aliases');

  // Legacy database: full base schema (which still declares the OLD
  // site_aliases shape) plus populated alias rows. This is what a real
  // upgrade sees.
  const env = createSqliteEnv();
  execSchema(env);
  const t = Math.floor(Date.now() / 1000);
  // Real projects, so resolveTenantContext() can resolve the caller's scope.
  // Without them pid is null and every alias operation falls back to the
  // shared ('') scope — which would make the isolation assertions meaningless.
  for (const [id, slug] of [[PROJECT, 'alpha'], [OTHER, 'beta']]) {
    await env.DB.prepare(
      `INSERT INTO projects (id, slug, name, website_url, publishing_url, language, timezone, status, approval_mode, created_at, updated_at)
       VALUES (?, ?, ?, 'https://x.example', ?, 'vi', 'Asia/Ho_Chi_Minh', 'active', 'auto', ?, ?)`
    ).bind(id, slug, slug, `https://seo.test/${slug}`, t, t).run();
  }
  env.__sqlite.exec(`
    INSERT INTO site_aliases (name,url,description,kind,created_at,updated_at) VALUES
      ('login','/login','Sign in','manual',${t},${t}),
      ('old-post','/blog/old-post','A post','sitemap',${t},${t});
  `);
  await runMigrations(env, { logger: { log: () => {}, error: () => {} } });

  const legacyTable = await env.__get("SELECT name FROM sqlite_master WHERE type='table' AND name='site_aliases_legacy'");
  assert.ok(legacyTable, 'legacy table must be renamed, not dropped');
  const legacyRows = await env.__all('SELECT name FROM site_aliases_legacy');
  assert.equal(legacyRows.length, 2, 'legacy rows must survive in the backup table');
  ok('migration renames the legacy table instead of dropping it');

  const copied = await env.__all("SELECT name, project_id FROM site_aliases ORDER BY name");
  assert.equal(copied.length, 2, 'legacy rows must be copied forward');
  assert.ok(copied.every((r) => r.project_id === ''), 'copied rows are shared/global');
  ok('legacy rows copied forward as shared, existing installs keep working');

  const cols = await env.__all('PRAGMA table_info(site_aliases)');
  assert.ok(cols.some((c) => c.name === 'id' && c.pk === 1), 'new primary key is id');
  assert.ok(cols.some((c) => c.name === 'project_id'), 'project_id column exists');
  ok('rebuilt table has (id, project_id) and a composite unique index');

  // Two projects may now own the same alias name.
  const t2 = Math.floor(Date.now() / 1000);
  for (const [pid, url] of [[PROJECT, '/alpha-login'], [OTHER, '/beta-login']]) {
    await env.DB.prepare(
      `INSERT INTO site_aliases (id, project_id, name, url, kind, created_at, updated_at)
       VALUES (lower(hex(randomblob(16))), ?, 'login', ?, 'manual', ?, ?)`
    ).bind(pid, url, t2, t2).run();
  }
  const logins = await env.__all("SELECT project_id, url FROM site_aliases WHERE name='login' ORDER BY project_id");
  assert.equal(logins.length, 3, 'shared + two project rows may coexist');
  ok('two projects can each own an alias with the same name');

  // Duplicate within one project must be rejected.
  let dupFailed = false;
  try {
    await env.DB.prepare(
      `INSERT INTO site_aliases (id, project_id, name, url, kind, created_at, updated_at)
       VALUES (lower(hex(randomblob(16))), ?, 'login', '/dupe', 'manual', ?, ?)`
    ).bind(PROJECT, t2, t2).run();
  } catch { dupFailed = true; }
  assert.ok(dupFailed, 'the same name cannot appear twice within one project');
  ok('duplicate alias name within a project is rejected');

  // Isolation on read.
  const mapA = await buildAliasMap(env, PROJECT);
  const mapB = await buildAliasMap(env, OTHER);
  assert.equal(mapA.login.url, '/alpha-login', 'project A sees its own row');
  assert.equal(mapB.login.url, '/beta-login', 'project B sees its own row');
  assert.ok(mapA['old-post'], 'shared legacy rows stay visible to everyone');
  assert.equal(mapA['beta-login'], undefined);
  ok('buildAliasMap is project-scoped and still includes shared rows');

  // Isolation on sync.
  await env.DB.prepare(
    `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, project_id, created_at, published_at)
     VALUES ('p_a','alpha-only','T','D','# B','published',?,?,?)`
  ).bind(PROJECT, t2, t2).run();
  await env.DB.prepare(
    `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, project_id, created_at, published_at)
     VALUES ('p_b','beta-only','T','D','# B','published',?,?,?)`
  ).bind(OTHER, t2, t2).run();

  await syncSitemapAliases(env, PROJECT);
  const sitemapA = await env.__all("SELECT name, project_id FROM site_aliases WHERE kind='sitemap' AND project_id = ?", PROJECT);
  assert.deepEqual(sitemapA.map((r) => r.name), ['alpha-only']);
  const sitemapB = await env.__all("SELECT name FROM site_aliases WHERE kind='sitemap' AND project_id = ?", OTHER);
  assert.equal(sitemapB.length, 0, 'syncing A must not create B rows');
  ok('sitemap sync only touches the calling project');

  // A project must not be able to edit or delete another project's row.
  // Use a name that ONLY the other project owns — patching a name both
  // projects own would legitimately hit the caller's own row.
  await env.DB.prepare(
    `INSERT INTO site_aliases (id, project_id, name, url, kind, created_at, updated_at)
     VALUES (lower(hex(randomblob(16))), ?, 'beta-exclusive', '/beta-exclusive', 'manual', ?, ?)`
  ).bind(OTHER, t2, t2).run();

  const patchOther = await aliasPatch({
    env, request: adminReq(`https://x/api/admin/aliases?project_id=${PROJECT}`, { body: { name: 'beta-exclusive', url: '/hijacked' } }),
  });
  assert.equal(patchOther.status, 404, 'cross-project patch must 404');
  const after = await env.__get("SELECT url FROM site_aliases WHERE name='beta-exclusive' AND project_id = ?", OTHER);
  assert.equal(after.url, '/beta-exclusive', 'the other project\'s row is untouched');
  ok('a project cannot patch another project\'s alias');

  const delOther = await aliasDelete({
    env, request: adminReq(`https://x/api/admin/aliases?name=beta-exclusive&project_id=${PROJECT}`),
  });
  assert.equal(delOther.status, 404, 'cross-project delete must 404');
  const stillThere = await env.__get("SELECT 1 AS x FROM site_aliases WHERE name='beta-exclusive' AND project_id = ?", OTHER);
  assert.ok(stillThere, 'the other project\'s row survives');
  ok('a project cannot delete another project\'s alias');

  // Shared/legacy rows are not editable by anyone — editing one would
  // silently change every tenant's prompt vocabulary.
  const patchShared = await aliasPatch({
    env, request: adminReq(`https://x/api/admin/aliases?project_id=${PROJECT}`, { body: { name: 'old-post', url: '/hijacked' } }),
  });
  assert.equal(patchShared.status, 404, 'shared rows must not be patchable');
  const sharedRow = await env.__get("SELECT url, project_id FROM site_aliases WHERE name='old-post'");
  assert.equal(sharedRow.url, '/blog/old-post', 'shared row is untouched');
  assert.equal(sharedRow.project_id, '', 'shared row stays shared');
  ok('shared/legacy aliases are read-only for every project');
}

// ── F. attention + activation ───────────────────────────────────────
async function testAttentionAndActivation() {
  console.log('\nF. Attention list + activation checklist');
  const env = await freshEnv();
  const t = Math.floor(Date.now() / 1000);

  // No brand DNA, no schedule, no post, no domain, no channel → the list must
  // surface all of them, ranked critical-first.
  const res = await attention({ env, request: adminReq(`https://x/api/admin/attention?project_id=${PROJECT}`) });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  const ids = body.items.map((i) => i.id);
  assert.ok(ids.includes('no_brand_dna'), 'missing Brand DNA must be surfaced');
  assert.ok(ids.includes('no_schedule'), 'empty schedule must be surfaced');
  assert.ok(ids.includes('no_domain'), 'missing custom domain must be surfaced');
  assert.ok(ids.includes('no_channel'), 'missing channel must be surfaced');
  ok('attention surfaces the setup gaps for a fresh project');

  // Ordering: every critical comes before every warning, warnings before info.
  const rank = { critical: 0, warning: 1, info: 2 };
  const sev = body.items.map((i) => rank[i.severity]);
  assert.deepEqual(sev, [...sev].sort((a, b) => a - b), 'items must be ranked critical → warning → info');
  ok('attention ranks critical before warning before info');

  // Every item must carry an actionable destination.
  assert.ok(body.items.every((i) => i.action?.label && i.action?.href), 'every item needs a CTA');
  ok('every attention item carries a call to action');

  // A failed social job with needs_reconnect becomes critical.
  await env.DB.prepare(
    `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, project_id, created_at, published_at)
     VALUES ('p_att','att','T','D','# B','published',?,?,?)`
  ).bind(PROJECT, t, t).run();
  await env.DB.prepare(
    `INSERT INTO social_posts (id, project_id, blog_post_id, channel, status, attempts, max_attempts, next_attempt_at, needs_reconnect, created_at, updated_at)
     VALUES ('sp_att', ?, 'p_att', 'facebook', 'failed', 1, 5, ?, 1, ?, ?)`
  ).bind(PROJECT, t, t, t).run();

  const res2 = await attention({ env, request: adminReq(`https://x/api/admin/attention?project_id=${PROJECT}`) });
  const body2 = await res2.json();
  const reconnect = body2.items.find((i) => i.id === 'social_reconnect');
  assert.ok(reconnect, 'a needs_reconnect job must appear');
  assert.equal(reconnect.severity, 'critical');
  assert.equal(reconnect.count, 1);
  assert.equal(reconnect.action.href, '#publishing');
  ok('a disconnected social channel is raised as critical with a reconnect CTA');

  // Project scoping: another project's failure must not leak in. It needs its
  // own blog post — (blog_post_id, channel) is unique across the table.
  await env.DB.prepare(
    `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, project_id, created_at, published_at)
     VALUES ('p_att_b','att-b','T','D','# B','published',?,?,?)`
  ).bind(OTHER, t, t).run();
  await env.DB.prepare(
    `INSERT INTO social_posts (id, project_id, blog_post_id, channel, status, attempts, max_attempts, next_attempt_at, needs_reconnect, created_at, updated_at)
     VALUES ('sp_other', ?, 'p_att_b', 'facebook', 'failed', 1, 5, ?, 1, ?, ?)`
  ).bind(OTHER, t, t, t).run();
  const res3 = await attention({ env, request: adminReq(`https://x/api/admin/attention?project_id=${OTHER}`) });
  const body3 = await res3.json();
  assert.equal(body3.items.find((i) => i.id === 'social_reconnect')?.count, 1, 'counts are per project');
  ok('attention is project-scoped');

  // Activation checklist.
  const a1 = await (await activation({ env, request: adminReq(`https://x/api/admin/activation?project_id=${PROJECT}`) })).json();
  assert.equal(a1.ok, true);
  assert.equal(a1.complete, false, 'a fresh project is not activated');
  assert.equal(a1.steps.length, 6);
  const stepKeys = a1.steps.map((s) => s.key);
  assert.deepEqual(stepKeys, ['brand_dna', 'providers', 'schedule', 'first_post', 'domain', 'channel']);
  ok('activation exposes the ordered setup checklist');

  // Mark the required steps done and re-check.
  await env.DB.prepare(
    `INSERT INTO project_brands (project_id, business_type, created_at, updated_at) VALUES (?, 'Plastic', ?, ?)`
  ).bind(PROJECT, t, t).run();
  await env.DB.prepare(
    `INSERT INTO content_calendar (id, project_id, scheduled_for, title, status, source, created_at, updated_at)
     VALUES ('cal_1', ?, ?, 'T', 'scheduled', 'manual', ?, ?)`
  ).bind(PROJECT, new Date(Date.now() + 86400000).toISOString().slice(0, 10), t, t).run();

  const a2 = await (await activation({ env, request: adminReq(`https://x/api/admin/activation?project_id=${PROJECT}`) })).json();
  const incomplete = a2.steps.filter((s) => !s.optional && !s.done).map((s) => s.key);
  assert.equal(a2.complete, true, `required steps still open: ${incomplete.join(', ') || 'none'}`);
  assert.equal(a2.required_done, a2.required_total);
  assert.equal(a2.metrics.published_posts, 1);
  assert.ok(a2.metrics.time_to_first_post_hours >= 0, 'time-to-first-post is measured');
  ok('activation completes once the required steps are done');

  const a3 = await (await activation({ env, request: adminReq(`https://x/api/admin/activation?project_id=${OTHER}`) })).json();
  assert.equal(a3.complete, false, 'activation is per project');
  ok('activation is project-scoped');
}

// ── G. product events + insights ────────────────────────────────────
async function testEventsAndInsights() {
  console.log('\nG. Product events + insights');
  const env = await freshEnv();
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  // Unknown event names are rejected rather than written — a typo should be a
  // no-op, not a junk row that skews a funnel.
  const unknown = await track(env, { event: 'not_a_real_event', projectId: PROJECT });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error, 'unknown_event');
  ok('track rejects unknown event names');

  const good = await track(env, { event: 'signup', projectId: PROJECT, props: { plan: 'free' } });
  assert.equal(good.ok, true);
  const row = await env.__get('SELECT event, project_id, props_json FROM product_events');
  assert.equal(row.event, 'signup');
  assert.equal(row.project_id, PROJECT);
  assert.equal(JSON.parse(row.props_json).plan, 'free');
  ok('track records the event, project and props');

  // Oversized props are dropped rather than bloating the table.
  await track(env, { event: 'calendar_planned', projectId: PROJECT, props: { blob: 'x'.repeat(5000) } });
  const bigRow = await env.__get("SELECT props_json FROM product_events WHERE event='calendar_planned'");
  assert.equal(bigRow.props_json, null, 'oversized props are dropped');
  ok('oversized props are dropped instead of stored');

  // trackOnce is idempotent per project — the activation milestone must not
  // fire on every publish.
  const first = await trackOnce(env, { event: 'first_post_published', projectId: PROJECT });
  const second = await trackOnce(env, { event: 'first_post_published', projectId: PROJECT });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.error, 'already_tracked');
  const count = await env.__get("SELECT COUNT(*) AS n FROM product_events WHERE event='first_post_published'");
  assert.equal(count.n, 1);
  ok('trackOnce emits a milestone only once per project');

  // A broken DB must not throw — callers fire-and-forget.
  const broken = { DB: { prepare() { throw new Error('db down'); } } };
  const survived = await track(broken, { event: 'signup', projectId: PROJECT });
  assert.equal(survived.ok, false);
  ok('track never throws when the database fails');

  // ── insights ─────────────────────────────────────────────────────
  // Seed a project created 30 days ago that published in week 1 and week 3,
  // and one created 2 days ago that never published.
  await env.DB.prepare('DELETE FROM blog_posts').run();
  await env.DB.prepare('DELETE FROM projects').run();
  const old = now - 30 * DAY;
  const fresh = now - 2 * DAY;
  await env.DB.prepare(
    `INSERT INTO projects (id, slug, name, website_url, publishing_url, language, timezone, status, approval_mode, created_at, updated_at)
     VALUES ('p_old','old','Old','https://x','https://s/old','vi','UTC','active','auto',?,?)`
  ).bind(old, old).run();
  await env.DB.prepare(
    `INSERT INTO projects (id, slug, name, website_url, publishing_url, language, timezone, status, approval_mode, created_at, updated_at)
     VALUES ('p_new','new','New','https://x','https://s/new','vi','UTC','active','auto',?,?)`
  ).bind(fresh, fresh).run();
  for (const [id, ts] of [
    ['b1', old + 2 * DAY],    // week 1
    ['b2', old + 9 * DAY],    // week 2
    ['b3', old + 23 * DAY],   // week 4
  ]) {
    await env.DB.prepare(
      `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, project_id, created_at, published_at)
       VALUES (?, ?, 'T', 'D', '# B', 'published', 'p_old', ?, ?)`
    ).bind(id, id, ts, ts).run();
  }
  await env.DB.prepare(
    `INSERT INTO project_brands (project_id, business_type, created_at, updated_at) VALUES ('p_old','Plastic',?,?)`
  ).bind(old, old).run();

  const ins = await computeInsights(env);
  assert.equal(ins.totals.projects, 2);
  assert.equal(ins.totals.published_posts, 3);

  const step = (k) => ins.funnel.find((f) => f.key === k);
  assert.equal(step('signup').count, 2);
  assert.equal(step('brand_dna').count, 1);
  assert.equal(step('first_post').count, 1, 'only one project published');
  assert.equal(step('week2').count, 1, 'only the old project published in week 2+');
  assert.equal(step('week4').count, 1);
  assert.equal(step('signup').pct, 100);
  assert.equal(step('first_post').pct, 50);
  ok('funnel counts and percentages are derived correctly');

  // A step whose cohort is too young must be flagged, not reported as 0%.
  // Reporting 0% would read as "everyone churned" and is the kind of number a
  // product owner acts on wrongly.
  assert.equal(ins.totals.oldest_project_age_days, 30);
  assert.equal(step('week2').measurable, true, 'a 30-day-old project makes week 2 measurable');
  assert.equal(step('week4').measurable, true, 'a 30-day-old project makes week 4 measurable');
  assert.equal(step('week2').measurable_after_days, 14);
  ok('funnel steps declare when they become measurable');

  await env.DB.prepare("DELETE FROM projects WHERE id = 'p_old'").run();
  const young = await computeInsights(env);
  const yStep = (k) => young.funnel.find((f) => f.key === k);
  assert.equal(young.totals.oldest_project_age_days, 2);
  assert.equal(yStep('week2').measurable, false, 'a 2-day-old install cannot measure week 2');
  assert.equal(yStep('week4').measurable, false);
  assert.equal(yStep('first_post').measurable, undefined, 'steps that are always measurable carry no flag');
  ok('young installs are marked not-measurable instead of 0%');

  // Retention cohorts expose how many weeks have actually elapsed, so the UI
  // can blank out weeks that have not happened.
  const cohort = young.retention[0];
  assert.ok(cohort.weeks_elapsed <= 1, 'a 2-day-old cohort has not completed a week');
  ok('retention cohorts report elapsed weeks');

  assert.equal(ins.time_to_first_post.n, 1);
  assert.equal(ins.time_to_first_post.median_hours, 48, 'first post landed 2 days after creation');
  assert.equal(ins.time_to_first_post.under_72h, 1);
  ok('time-to-first-post is measured from project creation');

  const oldCohort = ins.retention.find((c) => c.size === 1 && c.w2 > 0);
  assert.ok(oldCohort, 'the old project must appear in a cohort');
  assert.equal(oldCohort.w1_pct, 100, 'published in week 1');
  assert.equal(oldCohort.w2_pct, 100, 'published in week 2');
  assert.equal(oldCohort.w4_pct, 100, 'published in week 4');
  ok('retention cohorts count activity by weeks since signup');

  assert.ok(ins.weekly.length >= 1, 'weekly activity trend is populated');
  assert.equal(ins.weekly.reduce((a, w) => a + w.posts, 0), 3, 'every post lands in exactly one week');
  ok('weekly activity trend accounts for every post');

  const oldRow = ins.projects.find((p) => p.slug === 'old');
  const newRow = ins.projects.find((p) => p.slug === 'new');
  assert.equal(oldRow.posts, 3);
  assert.equal(oldRow.has_brand_dna, true);
  assert.equal(newRow.posts, 0);
  assert.equal(newRow.first_post_hours, null, 'a project with no post has no time-to-first-post');
  assert.equal(newRow.healthy, false, 'a project that never published is not healthy');
  ok('per-project health reports posts, brand DNA and recency');

  assert.ok(ins.events.find((e) => e.event === 'signup'), 'event log is summarised');
  ok('insights includes the event log summary');

  // Endpoint is super_admin only.
  const denied = await insights({ env, request: adminReq('https://x/api/admin/insights', { token: 'wrong-token' }) });
  assert.equal(denied.status, 401, 'insights must reject a bad token');
  const allowed = await insights({ env, request: adminReq('https://x/api/admin/insights') });
  const allowedBody = await allowed.json();
  assert.equal(allowed.status, 200);
  assert.equal(allowedBody.ok, true);
  assert.ok(Array.isArray(allowedBody.funnel));
  ok('insights endpoint is super_admin only and returns the report');

  const withoutProjects = await insights({ env, request: adminReq('https://x/api/admin/insights?projects=0') });
  const wpBody = await withoutProjects.json();
  assert.equal(wpBody.projects, undefined, '?projects=0 omits the per-project table');
  ok('insights can omit the per-project table');

  // isoWeek is the cohort key; check it against known dates.
  assert.equal(isoWeek(Date.UTC(2026, 0, 1) / 1000), '2026-W01');
  assert.equal(isoWeek(Date.UTC(2026, 8, 14) / 1000), '2026-W38');
  ok('isoWeek produces ISO-8601 week labels');
}

// ── H. mandatory per-project onboarding ─────────────────────────────
// The bug this covers: onboarding state used to be a single global settings
// row, so the first project to finish the wizard marked every project
// complete and a brand new account skipped setup entirely.
async function testOnboarding() {
  console.log('\nH. Mandatory per-project onboarding');
  const env = await freshEnv();
  const t = Math.floor(Date.now() / 1000);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const get = async (pid) => (await onboardingGet({ env, request: adminReq(`https://x/api/admin/onboarding?project_id=${pid}`) })).json();
  const post = async (pid) => onboardingPost({ env, request: adminReq(`https://x/api/admin/onboarding?project_id=${pid}`, { body: {} }) });

  // A fresh project is not complete and the required steps are declared.
  const s1 = await get(PROJECT);
  assert.equal(s1.ok, true);
  assert.equal(s1.complete, false, 'a fresh project must not be complete');
  assert.equal(s1.has_brand_dna, false);
  assert.equal(s1.has_future_slots, false);
  const reqKeys = s1.steps.filter((x) => x.required).map((x) => x.key);
  assert.deepEqual(reqKeys, ['brand_dna', 'schedule'], 'brand DNA and schedule are the required steps');
  assert.equal(s1.steps.find((x) => x.key === 'providers').required, false, 'providers stay optional');
  ok('a fresh project reports incomplete with the right required steps');

  // The API must refuse to fake completion — the UI already blocks it, but a
  // direct call must not be able to inflate the activation funnel.
  const refused = await post(PROJECT);
  assert.equal(refused.status, 409, 'marking complete without the steps must fail');
  const refusedBody = await refused.json();
  assert.deepEqual(refusedBody.missing, ['brand_dna', 'schedule']);
  ok('API refuses to mark complete while required steps are missing');

  // Brand DNA alone is not enough.
  await env.DB.prepare(
    `INSERT INTO project_brands (project_id, business_type, created_at, updated_at) VALUES (?, 'Plastic', ?, ?)`
  ).bind(PROJECT, t, t).run();
  const onlyBrand = await post(PROJECT);
  assert.equal(onlyBrand.status, 409);
  assert.deepEqual((await onlyBrand.json()).missing, ['schedule'], 'schedule is still required');
  ok('Brand DNA without a schedule is still incomplete');

  // Both steps → complete.
  await env.DB.prepare(
    `INSERT INTO content_calendar (id, project_id, scheduled_for, title, status, source, created_at, updated_at)
     VALUES ('cal_ob', ?, ?, 'T', 'scheduled', 'manual', ?, ?)`
  ).bind(PROJECT, tomorrow, t, t).run();
  const done = await post(PROJECT);
  assert.equal(done.status, 200, 'completing with both steps must succeed');
  const s2 = await get(PROJECT);
  assert.equal(s2.complete, true);
  assert.ok(s2.marked_complete_at > 0, 'the completion timestamp is persisted on the project');
  ok('both required steps complete the project');

  // THE REGRESSION: another project must NOT inherit completion.
  const other = await get(OTHER);
  assert.equal(other.complete, false, 'a second project must not inherit the first project\'s completion');
  assert.equal(other.has_brand_dna, false);
  ok('onboarding is per project, not global');

  // A past-dated slot does not count — the cron needs something in the future.
  await env.DB.prepare(
    `INSERT INTO project_brands (project_id, business_type, created_at, updated_at) VALUES (?, 'Beta', ?, ?)`
  ).bind(OTHER, t, t).run();
  await env.DB.prepare(
    `INSERT INTO content_calendar (id, project_id, scheduled_for, title, status, source, created_at, updated_at)
     VALUES ('cal_old', ?, '2020-01-01', 'T', 'scheduled', 'manual', ?, ?)`
  ).bind(OTHER, t, t).run();
  const pastOnly = await get(OTHER);
  assert.equal(pastOnly.has_future_slots, false, 'a slot in the past does not satisfy the schedule step');
  assert.equal(pastOnly.complete, false);
  ok('only future slots count toward the schedule step');

  // Reset clears the confirmation timestamp. The gate is derived from the
  // data, so the project stays usable — re-running the wizard is for review,
  // not a way to break a working account.
  await onboardingDelete({ env, request: adminReq(`https://x/api/admin/onboarding?project_id=${PROJECT}`) });
  const afterReset = await get(PROJECT);
  assert.equal(afterReset.marked_complete_at, null, 'reset clears the confirmation timestamp');
  assert.equal(afterReset.complete, true, 'the gate is derived from data, so it stays open');
  assert.equal(afterReset.has_brand_dna, true, 'reset does not delete the Brand DNA');
  ok('reset clears the confirmation without breaking a working project');

  // Self-healing in the other direction: losing the setup data re-opens the
  // gate. This is why `complete` is derived rather than a stored flag — a flag
  // would let a project that lost its Brand DNA sail through.
  await env.DB.prepare('DELETE FROM project_brands WHERE project_id = ?').bind(PROJECT).run();
  const regated = await get(PROJECT);
  assert.equal(regated.complete, false, 'deleting the Brand DNA re-opens the gate');
  assert.equal(regated.has_brand_dna, false);
  ok('losing the setup data re-opens the gate (self-healing)');
}

async function main() {
  console.log('--- Platform tests (migrations · queue · publishing · cron · aliases · attention · insights · onboarding) ---');
  await testMigrations();
  await testQueue();
  await testHelpers();
  await testCronRouting();
  await testAliasScoping();
  await testAttentionAndActivation();
  await testEventsAndInsights();
  await testOnboarding();
  console.log(`\nALL PLATFORM TESTS PASSED (${passed} checks)`);
}

main().catch((err) => {
  console.error('\n✗ TEST FAILED');
  console.error(err?.stack || err);
  process.exit(1);
});

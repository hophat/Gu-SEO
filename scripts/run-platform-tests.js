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
import { listEnabledChannels } from '../functions/_lib/channels.js';
import { adaptArticleForChannel, xWeightedLengthWithUrls } from '../functions/_lib/publishing/adapter.js';
import {
  describeGraphError, buildFacebookMessage, parseFacebookConfig, projectPublicBase, verifyFacebookPage,
} from '../functions/_lib/publishing/facebook.js';
import {
  signState, verifyState, buildAuthUrl, listManagedPages,
  getThreadsAppId, setThreadsAppId, getThreadsAppSecret, setThreadsAppSecret,
} from '../functions/_lib/publishing/facebook_oauth.js';
import {
  buildThreadsAuthUrl, threadsRedirectUri, exchangeThreadsCodeForToken, exchangeThreadsLongLived,
} from '../functions/_lib/publishing/threads.js';
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
import { onRequestPost as register } from '../functions/api/public/register.js';
import { onRequestGet as whoami } from '../functions/api/admin/whoami.js';
import { onRequestPost as projectsCreate } from '../functions/api/admin/projects.js';
import { onRequestPatch as profilePatch } from '../functions/api/admin/projects/profile.js';
import { onRequestGet as secretsRead, onRequestPost as secretsWrite } from '../functions/api/admin/secrets.js';
import { onRequestGet as providersList } from '../functions/api/admin/providers.js';
import { onRequestPost as providersTest } from '../functions/api/admin/providers/test.js';
import { signSession } from '../functions/_lib/passwords.js';
import { setVaultSecret } from '../functions/_lib/secret_vault.js';
import {
  carouselRef, carouselPrefix, carouselSlideKey, explainerRef, postIdFromRef, postIdFromRefSql,
} from '../functions/_lib/video_jobs.js';
import { onRequestPost as createExplainerJob } from '../functions/api/admin/video/explainer.js';
import { onRequestDelete as deleteProgKeyword } from '../functions/api/admin/prog/queue.js';
import { onRequestPost as claimVideoJob } from '../functions/api/admin/video/claim.js';
import { VIDEO_TEMPLATES, videoTemplateById } from '../functions/_lib/video_templates.js';
import { BGM_TRACKS } from '../functions/_lib/bgm_catalog.js';
import { onRequestPost as createVideoJob } from '../functions/api/admin/video/create.js';
import { onRequestGet as listVideoTemplates } from '../functions/api/admin/video/templates.js';
import { onRequestPost as uploadPresenter } from '../functions/api/admin/video/presenter.js';
import { renderCoverSvg, isRenderableSpec, fallbackCoverSpec } from '../functions/_lib/cover_svg.js';
import { onRequestGet as coverSvgRoute } from '../functions/cover/[slug].svg.js';
import { onRequestGet as ogSvgRoute } from '../functions/og/[slug].svg.js';
import { onRequestPost as deleteVideoJob } from '../functions/api/admin/video/delete.js';
import { onRequestPost as publishVideo } from '../functions/api/admin/video/publish.js';
import { recipientsFor, isScheduledPost, sendPublishReport, renderReport } from '../functions/_lib/publishing/report.js';
import { onRequestPost as sendOtp } from '../functions/api/public/send-otp.js';
import { onRequestPost as usersCreate } from '../functions/api/admin/users.js';
import { renderBlogIndex } from '../functions/blog/index.js';
import { onRequestGet as renderFeed } from '../functions/feed.xml.js';
import { onRequestGet as renderSitemapIndex } from '../functions/sitemap.xml.js';
import { onRequestGet as renderSitemapPages } from '../functions/sitemap-pages.xml.js';
import { loadSettings, setSetting } from '../functions/_lib/settings.js';
import { resolveProjectBySlug, projectLocale } from '../functions/_lib/project_scope.js';
import { renderContentPage } from '../functions/_lib/page_render.js';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Admin endpoints authenticate through the bearer token, so tests need a
// request shaped the way adminGate()/resolveTenantContext() expect.
function jsonReq(url, body) {
  return adminReq(url, { body });
}

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

  // The manual button asks again. Without this a video that was posted once
  // could never be posted again, and the button could not recover a missed
  // automatic enqueue — which is the whole reason it exists. Every
  // facebook_video row in production was terminal when this was found.
  const reposted = await enqueueSocialPost(env, { projectId: PROJECT, blogPostId: POST, channel: 'facebook', repost: true });
  assert.equal(reposted.enqueued, true, 'a published row must be re-postable by hand');
  const reset = await env.__get('SELECT status, attempts, external_url, published_at FROM social_posts WHERE blog_post_id = ? AND channel = ?', POST, 'facebook');
  assert.equal(reset.status, 'pending', 'the finished row is reset rather than blocked');
  assert.equal(reset.attempts, 0, 'with a fresh attempt budget');
  assert.equal(reset.external_url, null, 'and no stale link from the previous post');
  assert.equal(reset.published_at, null);
  // A job actually in flight is still refused: that is what the message means.
  const busy = await enqueueSocialPost(env, { projectId: PROJECT, blogPostId: POST, channel: 'facebook', repost: true });
  assert.equal(busy.enqueued, false, 'a job in flight must not be enqueued twice');
  // And the automatic path stays idempotent.
  const auto = await enqueueSocialPost(env, { projectId: PROJECT, blogPostId: POST, channel: 'facebook' });
  assert.equal(auto.enqueued, false, 'the automatic fan-out must not re-post on its own');
  ok('a finished post can be re-posted by hand, and only by hand');

  // Put the fixture back the way the rest of the suite expects it. The drain
  // is project-wide, so a row left `pending` here is picked up by a later
  // test's drain and reads as that test's own failure.
  await env.DB.prepare("UPDATE social_posts SET status = 'published' WHERE blog_post_id = ? AND channel = 'facebook'").bind(POST).run();

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

  // Facebook copy: custom templates stay exact; defaults become a readable
  // post with a hook, extracted highlights, CTA and relevant hashtags.
  assert.equal(buildFacebookMessage({ title: 'A', meta_description: 'D' }, { messageTemplate: '{title} — {description}' }), 'A — D');
  const viPost = buildFacebookMessage({
    title: 'Cách chọn hosting',
    meta_description: 'Hướng dẫn chọn hosting ổn định.',
    body_markdown: '## Hiệu năng\nTốc độ tải trang ảnh hưởng đến chuyển đổi.\n\n## Chi phí\nGiá từ 200.000 đồng mỗi tháng.',
    keywords: 'hosting, website',
  }, {}, { language: 'vi', name: 'Gulagi', brand: { cta: 'Dùng thử 30 ngày.' } });
  assert.match(viPost, /^Cách chọn hosting\n\nHướng dẫn chọn hosting ổn định\./);
  assert.match(viPost, /Trong bài viết này:/);
  assert.match(viPost, /• Hiệu năng — Tốc độ tải trang ảnh hưởng đến chuyển đổi\./);
  assert.match(viPost, /Bước tiếp theo: Dùng thử 30 ngày\./);
  assert.match(viPost, /#hosting/);
  assert.ok(viPost.includes('\n'), 'default Facebook copy keeps line breaks');
  const enPost = buildFacebookMessage({ title: 'A practical guide', meta_description: 'A clear guide.' }, {}, { language: 'en' });
  assert.match(enPost, /In this guide:|Next step: Read the full guide/);
  const frPost = buildFacebookMessage({ title: 'Guide pratique', meta_description: 'Un guide clair.' }, {}, { language: 'fr', brand: { cta: 'Découvrez la suite.' } });
  assert.match(frPost, /Découvrez la suite\./);
  assert.doesNotMatch(frPost, /In this guide:|Next step:|Read the full guide/);
  const headinglessPost = buildFacebookMessage({ title: 'A title', body_markdown: 'One useful opening sentence.' }, {}, { language: 'en' });
  assert.doesNotMatch(headinglessPost, /\n• /, 'intro text is not repeated as a highlight');
  const customPost = buildFacebookMessage(
    { title: 'A', meta_description: 'D', body_markdown: 'A useful detail.', keywords: 'alpha' },
    { messageTemplate: '{title}\n{summary}\n{cta}\n{hashtags} {url}' },
    { language: 'en', brand: { cta: 'Start here.' } },
  );
  assert.equal(customPost, 'A\nD\nStart here.\n#alpha');
  const noTagPost = buildFacebookMessage({ title: 'A title', meta_description: 'A summary.' }, {}, { language: 'en' });
  assert.doesNotMatch(noTagPost, /#/, 'no keyword sources means no noisy auto hashtags');
  ok('Facebook message template substitutes all supported tokens');

  // config parsing
  const cfg = parseFacebookConfig('{"page_id":"123","as_photo":true,"api_version":"v25.0","hashtags":"#hosting, #website"}');
  assert.equal(cfg.pageId, '123');
  assert.equal(cfg.asPhoto, true);
  assert.equal(cfg.apiVersion, 'v25.0');
  assert.equal(cfg.hashtags, '#hosting, #website');
  assert.equal(parseFacebookConfig('{"api_version":"25"}').apiVersion, '', 'invalid version falls back to deployment default');
  assert.equal(parseFacebookConfig('not json').pageId, '');
  ok('facebook config parsing validates input');

  // public base
  assert.equal(projectPublicBase({ publishing_url: 'https://seo.test/alpha' }), 'https://seo.test/alpha');
  assert.equal(projectPublicBase({ custom_domain: 'blog.example.com', publishing_url: 'https://seo.test/alpha' }), 'https://blog.example.com');
  assert.equal(projectPublicBase({ custom_domain: 'https://blog.example.com/' }), 'https://blog.example.com');
  ok('public base prefers the custom domain and strips trailing slashes');

  // Threads uses a separate Authorization Window and app credentials. Never
  // mix Facebook Login permissions into this URL: Meta rejects them as
  // invalid scopes.
  const threadsAuthUrl = buildThreadsAuthUrl({
    appId: 'threads-123',
    redirectUri: 'https://seo.test/api/admin/projects/channels-callback',
    state: 'thread-state',
  });
  const threadsUrl = new URL(threadsAuthUrl);
  assert.equal(threadsUrl.origin, 'https://threads.com');
  assert.equal(threadsUrl.pathname, '/oauth/authorize');
  assert.equal(threadsUrl.searchParams.get('client_id'), 'threads-123');
  assert.equal(threadsUrl.searchParams.get('response_type'), 'code');
  assert.equal(threadsUrl.searchParams.get('scope'), 'threads_basic,threads_content_publish');
  assert.doesNotMatch(threadsUrl.searchParams.get('scope'), /pages_/);
  assert.equal(
    threadsRedirectUri(new Request('https://seo.test/api/admin/projects/channels-connect?channel=threads')),
    'https://seo.test/api/admin/projects/channels-callback',
  );

  const oauthCalls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    oauthCalls.push({ url: String(url), options });
    if (String(url).includes('/oauth/access_token') && !String(url).includes('th_exchange_token')) {
      return new Response(JSON.stringify({ access_token: 'short', user_id: 'u_threads' }), { status: 200 });
    }
    return new Response(JSON.stringify({ access_token: 'long' }), { status: 200 });
  };
  try {
    const short = await exchangeThreadsCodeForToken({
      appId: 'threads-123', appSecret: 'secret', redirectUri: 'https://seo.test/cb', code: 'code-1',
    });
    assert.equal(short.access_token, 'short');
    assert.equal(oauthCalls[0].url, 'https://graph.threads.com/oauth/access_token');
    const shortBody = new URLSearchParams(oauthCalls[0].options.body);
    assert.equal(shortBody.get('grant_type'), 'authorization_code');
    assert.equal(shortBody.get('client_id'), 'threads-123');
    const long = await exchangeThreadsLongLived({ appSecret: 'secret', shortToken: 'short' });
    assert.equal(long, 'long');
    const longUrl = new URL(oauthCalls[1].url);
    assert.equal(longUrl.origin + longUrl.pathname, 'https://graph.threads.net/v1.0/access_token');
    assert.equal(longUrl.searchParams.get('grant_type'), 'th_exchange_token');
  } finally {
    globalThis.fetch = realFetch;
  }
  ok('Threads OAuth uses its own endpoint, credentials, scopes, and token grants');

  const threadsEnv = await freshEnv();
  await setThreadsAppId(threadsEnv, 'threads-db-id');
  await setThreadsAppSecret(threadsEnv, 'threads-secret');
  assert.equal(await getThreadsAppId(threadsEnv), 'threads-db-id');
  assert.equal(await getThreadsAppSecret(threadsEnv), 'threads-secret');
  assert.equal(await getThreadsAppId({ THREADS_APP_ID: 'env-id' }), 'env-id');
  ok('Threads app credentials have independent settings and environment overrides');

  // OAuth state
  const secret = 'admin-token-value';
  const state = await signState(secret, PROJECT);
  const verified = await verifyState(secret, state);
  assert.equal(verified.projectId, PROJECT);
  assert.equal(verified.channel, 'facebook', 'state without a channel reads as the facebook channel');
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

  // Public metadata follows the project language, with deterministic OG mapping.
  assert.deepEqual(projectLocale('en-US'), { htmlLang: 'en', ogLocale: 'en_US' });
  assert.deepEqual(projectLocale('fr-FR'), { htmlLang: 'fr', ogLocale: 'fr_FR' });
  assert.deepEqual(projectLocale('not-a-locale'), { htmlLang: 'vi', ogLocale: 'vi_VN' });
  const localePost = {
    slug: 'guide', title: 'A practical guide', meta_description: 'A clear guide.',
    body_markdown: '# Guide\\n\\nHelpful detail.', status: 'published', published_at: 1700000000,
    urlPath: '/alpha/blog/guide',
  };
  const localeHtml = renderContentPage({
    env: {}, request: new Request('https://seo.test/alpha/blog/guide'), post: localePost, kind: 'blog',
    project: { name: 'Alpha', language: 'en', publishing_url: 'https://seo.test/alpha' },
  });
  assert.match(localeHtml, /<html lang="en">/);
  assert.match(localeHtml, /<meta property="og:locale" content="en_US" \/>/);
  assert.match(localeHtml, /"inLanguage":"en"/);
  ok('public HTML, Open Graph, and JSON-LD use project language metadata');
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

    // Social is ONE unfiltered call: a per-project sweep spent ~30 of the
    // Workers free plan's 50 subrequests per invocation, which starved the tail
    // of the blog fan-out. The tick endpoint fans out internally instead.
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
    assert.equal(tasks.length, 1, 'social must be a single call');
    assert.equal(tasks[0].project_id, undefined, 'the social call must not be project-scoped');
    ok('social drains with one unfiltered tick call');

    // The blog chain still fans out per project: no single HTTP response can
    // hold a chain for every project inside the edge timeout.
    tasks.length = 0;
    const pendingBlog = [];
    await worker.scheduled(
      { scheduledTime: new Date('2026-09-15T01:00:00Z').getTime() },
      { ADMIN_TOKEN: 't', BLOG_URL: 'https://x/api/admin/blog' },
      { waitUntil: (p) => pendingBlog.push(p) }
    );
    await Promise.allSettled(pendingBlog);
    const perProject = tasks.filter((p) => p.task === 'blog' && !p.dry_run);
    assert.equal(perProject.length, 2, 'one blog tick call per project');
    assert.deepEqual(perProject.map((p) => p.project_id).sort(), ['p1', 'p2']);
    ok('blog fan-out issues one tick call per project');

    // The :40 orphan net: when the daily fan-out dies mid-window (2026-09-23
    // lost 21 jobs this way — all 'created', error NULL, nothing retried
    // them), tick's blogChain() resumes interrupted chains. Pin that the
    // net fires at :40 and is one unfiltered call, and that it never fires
    // in the hour's other ticks.
    const at40 = await runAt('2026-09-15T01:40:00Z');
    assert.ok(at40.includes('blog'), 'the :40 orphan net must run the blog task');
    assert.ok(at40.includes('social'), 'the :40 tick still drains social');
    tasks.length = 0;
    globalThis.fetch = async (u, init) => {
      const payload = init?.body ? JSON.parse(init.body) : {};
      tasks.push(payload);
      if (payload.dry_run) return jsonRes({ ok: true, projects: [{ id: 'p1', slug: 'a' }, { id: 'p2', slug: 'b' }] });
      return jsonRes({ ok: true, projects_processed: 1, results: [] });
    };
    const pending40 = [];
    await worker.scheduled(
      { scheduledTime: new Date('2026-09-15T01:40:00Z').getTime() },
      { ADMIN_TOKEN: 't', BLOG_URL: 'https://x/api/admin/blog' },
      { waitUntil: (p) => pending40.push(p) }
    );
    await Promise.allSettled(pending40);
    const resumeCalls = tasks.filter((p) => p.task === 'blog');
    assert.equal(resumeCalls.length, 1, 'the resume must be a single unfiltered call');
    assert.equal(resumeCalls[0].project_id, undefined, 'the resume call must not be project-scoped');
    ok(':40 orphan net is a single unfiltered blog call');

    const at4045 = await runAt('2026-09-15T01:45:00Z');
    assert.deepEqual(at4045, ['social'], 'the orphan net must not fire at :45');
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

// ── I. frictionless registration + project profile ──────────────────
// Registration collects only email/OTP/password. The brand name and website
// are captured by the mandatory wizard instead — and crucially, registration
// no longer writes a placeholder Brand DNA, which used to make the "has Brand
// DNA" check permanently true and defeat the requirement it existed to enforce.
async function testRegistrationAndProfile() {
  console.log('\nI. Registration + project profile');
  const env = await freshEnv();
  const t = Math.floor(Date.now() / 1000);
  const email = 'nguyen.van.a@gmail.com';

  await env.DB.prepare(
    `INSERT INTO email_verifications (email, otp_code, created_at, expires_at) VALUES (?, '123456', ?, ?)`
  ).bind(email, t, t + 600).run();

  const res = await register({
    env,
    request: jsonReq('https://x/api/public/register', { email, password: 'matkhau123', otp: '123456' }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, `registration must succeed without a brand name (${JSON.stringify(body)})`);
  assert.ok(body.project_id, 'a project is created');

  const project = await env.__get('SELECT id, slug, name, website_url FROM projects WHERE id = ?', body.project_id);
  assert.equal(project.name, 'Nguyen van a', 'the provisional name is derived from the email local part');
  assert.ok(project.slug, 'a slug is generated');
  assert.equal(project.website_url, '', 'no website is required at registration');
  const registeredUser = await env.__get('SELECT role, project_id FROM users WHERE id = ?', body.id);
  assert.equal(registeredUser.role, 'project_admin', 'self-registered users are tenant admins');
  assert.equal(registeredUser.project_id, body.project_id, 'the user is assigned their provisioned project');
  const assignedProjects = await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM projects WHERE id = ?'
  ).bind(body.project_id).first();
  assert.equal(assignedProjects.total, 1, 'each regular user starts with exactly one project/site');
  ok('registration gives each regular user exactly one project/site');

  const setCookie = res.headers.get('set-cookie') || '';
  const sessionCookie = setCookie.match(/(?:^|;\s*)ps_session=([^;]+)/)?.[1];
  assert.ok(sessionCookie, 'registration returns a tenant session cookie');
  const tenantHeaders = new Map([['Cookie', `ps_session=${sessionCookie}`]]);
  const tenantRequest = (url, requestBody) => {
    const req = {
      url,
      headers: tenantHeaders,
      clone() { return req; },
      json: async () => requestBody || {},
    };
    return {
      ...req,
      headers: {
        get: (name) => {
          for (const [key, value] of tenantHeaders.entries()) {
            if (key.toLowerCase() === name.toLowerCase()) return value;
          }
          return null;
        },
      },
    };
  };

  const tenantWhoami = await whoami({ env, request: tenantRequest('https://x/api/admin/whoami') });
  const tenantWhoamiBody = await tenantWhoami.json();
  assert.equal(tenantWhoami.status, 200, 'a tenant session can identify itself');
  assert.equal(tenantWhoamiBody.projects.length, 1, 'a tenant sees exactly one project/site');
  assert.equal(tenantWhoamiBody.projects[0].id, body.project_id, 'the tenant project is their own project');
  ok('tenant identity exposes exactly one project/site');

  const secondProject = await projectsCreate({
    env,
    request: tenantRequest('https://x/api/admin/projects', { slug: 'tenant-second-site', name: 'Second site' }),
  });
  assert.equal(secondProject.status, 403, 'a regular user cannot create a second project/site');
  ok('regular users cannot create a second project/site');

  const superFirst = await projectsCreate({
    env, request: jsonReq('https://x/api/admin/projects', { slug: 'operator-one', name: 'Operator One' }),
  });
  const superSecond = await projectsCreate({
    env, request: jsonReq('https://x/api/admin/projects', { slug: 'operator-two', name: 'Operator Two' }),
  });
  assert.equal(superFirst.status, 200, 'super admin can create a project/site');
  assert.equal(superSecond.status, 200, 'super admin is not limited to one project/site');
  ok('super admin can create multiple projects/sites');

  // THE REGRESSION: no placeholder Brand DNA.
  const brand = await env.__get('SELECT business_type FROM project_brands WHERE project_id = ?', body.project_id);
  assert.equal(brand, null, 'registration must not insert a placeholder Brand DNA');
  ok('registration does not create a placeholder Brand DNA');

  // ...which means the wizard genuinely gates on Brand DNA now.
  const ob = await (await onboardingGet({
    env, request: adminReq(`https://x/api/admin/onboarding?project_id=${body.project_id}`),
  })).json();
  assert.equal(ob.has_brand_dna, false, 'a fresh signup has no Brand DNA');
  assert.equal(ob.complete, false, 'a fresh signup must be gated');
  const missing = ob.steps.filter((x) => x.required && !x.done).map((x) => x.key);
  assert.deepEqual(missing, ['brand_dna', 'schedule'], 'both required steps are open');
  ok('a fresh signup is gated on both Brand DNA and schedule');

  // A brand name may still be supplied explicitly.
  const email2 = 'explicit@example.com';
  await env.DB.prepare(
    `INSERT INTO email_verifications (email, otp_code, created_at, expires_at) VALUES (?, '654321', ?, ?)`
  ).bind(email2, t, t + 600).run();
  const res2 = await register({
    env,
    request: jsonReq('https://x/api/public/register', { email: email2, password: 'matkhau123', otp: '654321', brand_name: 'Bảo Bì Đạt Thành' }),
  });
  const body2 = await res2.json();
  const p2 = await env.__get('SELECT name FROM projects WHERE id = ?', body2.project_id);
  assert.equal(p2.name, 'Bảo Bì Đạt Thành', 'an explicit brand name still wins');
  ok('an explicit brand name overrides the provisional one');

  // ── profile endpoint ─────────────────────────────────────────────
  const pid = body2.project_id;
  const patch = (payload) => profilePatch({
    env, request: adminReq(`https://x/api/admin/projects/profile?project_id=${pid}`, { body: payload }),
  });

  const named = await patch({ name: 'Đạt Thành Dũng Plastic', website_url: 'https://datthanhdungplastic.com/' });
  assert.equal(named.status, 200);
  const after = await env.__get('SELECT name, site_name, website_url, slug FROM projects WHERE id = ?', pid);
  assert.equal(after.name, 'Đạt Thành Dũng Plastic');
  assert.equal(after.site_name, 'Đạt Thành Dũng Plastic', 'site_name moves with name (it drives public branding)');
  assert.equal(after.website_url, 'https://datthanhdungplastic.com/');
  ok('the wizard can set the real brand name and website');

  const badUrl = await patch({ website_url: 'datthanhdungplastic.com' });
  assert.equal(badUrl.status, 400, 'a URL without a scheme is rejected');
  ok('profile rejects a website URL without a scheme');

  const emptyName = await patch({ name: '   ' });
  assert.equal(emptyName.status, 400);
  ok('profile rejects an empty name');

  // Slug is free to change while nothing is published…
  const reSlug = await patch({ slug: 'dat-thanh-dung' });
  assert.equal(reSlug.status, 200);
  assert.equal((await env.__get('SELECT slug FROM projects WHERE id = ?', pid)).slug, 'dat-thanh-dung');
  ok('slug can be set before anything is published');

  // …and locked once it is, because the slug is in inbound links, the sitemap
  // and the AI's link aliases.
  await env.DB.prepare(
    `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, project_id, created_at, published_at)
     VALUES ('p_pub','pub','T','D','# B','published',?,?,?)`
  ).bind(pid, t, t).run();
  const locked = await patch({ slug: 'renamed-after-publish' });
  assert.equal(locked.status, 409, 'slug is locked once a post is published');
  assert.equal((await locked.json()).error, 'slug_locked');
  assert.equal((await env.__get('SELECT slug FROM projects WHERE id = ?', pid)).slug, 'dat-thanh-dung', 'slug is unchanged');
  ok('slug is locked after the first published post');

  // Slug collision is refused.
  const taken = await patch({ slug: 'alpha' }); // PROJECT's slug in freshEnv
  assert.equal(taken.status, 409);
  ok('profile refuses a slug already used by another project');
}

// ── J. request-cost guards ──────────────────────────────────────────
// D1 bills per row read, and Cloudflare does not cache Pages Function
// responses by default. So the two things that decide the bill are: how many
// rows a single page view reads, and whether the response is even cacheable.
// Both are easy to regress silently, so both are pinned here.
async function testRequestCost() {
  console.log('\nJ. Request cost (memoisation + cacheability)');
  const env = await freshEnv();
  const t = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, project_id, created_at, published_at)
     VALUES ('p_cost','cost-post','Tiêu đề','Mô tả','# Body','published',?,?,?)`
  ).bind(PROJECT, t, t).run();

  // Count every statement the handler runs, so the assertions are about real
  // query volume rather than about which helper was called.
  const counting = (base) => {
    const seen = [];
    return {
      env: {
        ...base,
        DB: {
          prepare(sql) { seen.push(String(sql).replace(/\s+/g, ' ').trim()); return base.DB.prepare(sql); },
          batch: (s) => base.DB.batch(s),
          exec: (s) => base.DB.exec(s),
        },
      },
      seen,
    };
  };

  // loadSettings reads the WHOLE settings table, so calling it twice in one
  // request doubles the row read for no reason.
  const a = counting(env);
  const s1 = await loadSettings(a.env);
  const s2 = await loadSettings(a.env);
  const settingsReads = a.seen.filter((q) => q.startsWith('SELECT key, value FROM settings')).length;
  assert.equal(settingsReads, 1, `loadSettings must read the settings table once per request (got ${settingsReads})`);
  assert.equal(s1.site_name, s2.site_name, 'both calls return the same value');
  ok('loadSettings is memoised per request');

  // A write must not leave a stale memoised read behind.
  await setSetting(a.env, 'site_name_db', 'Đổi tên rồi');
  const s3 = await loadSettings(a.env);
  assert.equal(s3.site_name_db, 'Đổi tên rồi', 'setSetting invalidates the memoised read');
  ok('setSetting invalidates the settings memo');

  // resolveProjectBySlug is called by the /<slug>/ wrapper AND again by the
  // renderer — two identical queries per page view before memoisation.
  const b = counting(env);
  const p1 = await resolveProjectBySlug(b.env, 'alpha');
  const p2 = await resolveProjectBySlug(b.env, 'alpha');
  const slugReads = b.seen.filter((q) => q.startsWith('SELECT id, slug, name, website_url')).length;
  assert.equal(slugReads, 1, `project lookup must hit D1 once per request (got ${slugReads})`);
  assert.equal(p1.id, p2.id);
  ok('resolveProjectBySlug is memoised per request');

  const languageEnv = await freshEnv();
  await languageEnv.DB.prepare("UPDATE projects SET language = 'en' WHERE id = ?").bind(PROJECT).run();
  const languageProject = await resolveProjectBySlug(languageEnv, 'alpha');
  assert.equal(languageProject.language, 'en', 'project resolver carries language to public renderers');
  ok('project resolver preserves content language');

  // A miss is cached too — otherwise a bad slug would re-query on every call.
  const c = counting(env);
  await resolveProjectBySlug(c.env, 'does-not-exist');
  await resolveProjectBySlug(c.env, 'does-not-exist');
  assert.equal(c.seen.filter((q) => q.startsWith('SELECT id, slug, name, website_url')).length, 1, 'a negative lookup is cached too');
  ok('a missing project is memoised as well');

  // Memoisation must be per-request, not global: two different env objects
  // must not share state (that would leak one tenant's data into another).
  const envA = await freshEnv();
  const envB = await freshEnv();
  await resolveProjectBySlug(envA, 'alpha');
  assert.equal(envB.__ps_project_slug_cache__, undefined, 'the cache lives on env, not in module scope');
  ok('memoisation is scoped to the request, not the module');

  // ── cacheability ─────────────────────────────────────────────────
  // Cloudflare will only cache a Function response if it is allowed to. A
  // stray no-store or a Set-Cookie silently makes every page view a cache
  // miss — the single biggest lever on the bill, and invisible in the code.
  const res = await renderBlogIndex({
    env, request: new Request('https://seo.test/alpha/blog'), page: 1, projectSlug: 'alpha', basePath: '/alpha',
  });
  assert.equal(res.status, 200);
  const cc = res.headers.get('cache-control') || '';
  assert.match(cc, /public/, 'public pages must be publicly cacheable');
  assert.match(cc, /s-maxage=\d+/, 'public pages must set an edge TTL (s-maxage)');
  assert.doesNotMatch(cc, /no-store|private/, 'public pages must not opt out of caching');
  assert.equal(res.headers.get('set-cookie'), null, 'a Set-Cookie would make the response uncacheable');
  ok('the blog index is edge-cacheable (public + s-maxage, no cookie)');

  const feed = await renderFeed({ env, request: new Request('https://seo.test/alpha/feed.xml'), params: { project: 'alpha' } });
  const feedCc = feed.headers.get('cache-control') || '';
  assert.match(feedCc, /public/);
  assert.match(feedCc, /s-maxage=\d+/);
  assert.doesNotMatch(feedCc, /no-store|private/);
  assert.equal(feed.headers.get('set-cookie'), null);
  ok('the RSS feed is edge-cacheable');

  // The admin SPA is the opposite: it must never be cached.
  const adminHeaders = readFileSync(join(ROOT, 'public', '_headers'), 'utf8');
  assert.match(adminHeaders, /\/admin-dist\/main\.js\s*\n\s*Cache-Control: no-store/,
    'the stable-named admin bundle must stay no-store');
  ok('the admin bundle stays no-store (it has a stable file name)');
}

// ── K. provider dispatch ────────────────────────────────────────────
// The invariant that was broken: `listProviders` offered a provider that the
// dispatcher had no handler for. Brand DNA reimplemented provider dispatch as
// a local switch covering 5 of the 10 registered providers, so it advertised
// `gurouter`, tried it, and failed with `unknown_provider` — while every other
// feature used gurouter fine.
async function testProviderDispatch() {
  console.log('\nK. Provider dispatch');
  const { listProviders, runTextProvider } = await import('../functions/_lib/ai.js');

  // Every registered provider reports as available when its key is present.
  const env = {
    GUROUTER_API_KEY: 'k', OPENAI_API_KEY: 'k', ANTHROPIC_API_KEY: 'k',
    GEMINI_API_KEY: 'k', GROQ_API_KEY: 'k', DEEPSEEK_API_KEY: 'k',
    MISTRAL_API_KEY: 'k', TOGETHER_API_KEY: 'k', CEREBRAS_API_KEY: 'k',
    AI: { run: async () => ({ response: '{}' }) },
  };
  const { text } = await listProviders(env);
  assert.ok(text.length >= 9, `expected the full registry, got ${text.length}`);

  // THE REGRESSION: every name offered must have a handler. A network or
  // credential error is fine here — that means dispatch worked and the call
  // was attempted. `unknown_provider` is the failure that must never happen.
  const undispatchable = [];
  for (const name of text) {
    try {
      await runTextProvider(env, name, 'ping');
    } catch (e) {
      const msg = String(e?.message || e);
      if (/unknown_provider|provider_unavailable/.test(msg)) undispatchable.push(`${name} (${msg.slice(0, 60)})`);
    }
  }
  assert.deepEqual(undispatchable, [],
    `listProviders offered providers the dispatcher cannot handle: ${undispatchable.join(', ')}`);
  ok(`every one of the ${text.length} offered providers has a dispatch handler`);

  // A name outside the registry is still rejected clearly.
  await assert.rejects(
    () => runTextProvider(env, 'not_a_provider', 'ping'),
    /unknown_provider/,
    'an unregistered name must fail loudly, not silently fall through'
  );
  ok('an unregistered provider name is rejected');

  // A registered-but-unconfigured provider says so, rather than pretending.
  const empty = { AI: undefined };
  await assert.rejects(
    () => runTextProvider(empty, 'openai', 'ping'),
    /provider_unavailable|unknown_provider/,
    'an unconfigured provider must report as unavailable'
  );
  ok('a registered but unconfigured provider reports unavailable');

  // Gemini retires models on its own schedule; a retired name returns 404, so
  // the dispatcher must fall through to the next model rather than surfacing
  // "your key is broken".
  const aiSrc = readFileSync(join(ROOT, 'functions', '_lib', 'ai.js'), 'utf8');
  assert.match(aiSrc, /const GEMINI_TEXT_MODELS = \[/, 'gemini must use a model ladder');
  const ladder = aiSrc.match(/const GEMINI_TEXT_MODELS = \[([\s\S]*?)\]/)?.[1] || '';
  assert.ok((ladder.match(/'/g) || []).length >= 4, 'the ladder must list more than one model');
  assert.match(aiSrc, /if \(r\.status === 404\) continue;/, 'a 404 must advance to the next model');
  ok('gemini falls through on a retired model name instead of failing');

  // And the source of truth for provider dispatch is the registry, not a
  // second copy in the caller.
  const brandSrc = readFileSync(join(ROOT, 'functions', 'api', 'admin', 'brand-dna.js'), 'utf8');
  assert.doesNotMatch(brandSrc, /switch \(name\)/, 'brand-dna must not reimplement provider dispatch');
  assert.match(brandSrc, /runTextProvider\(/, 'brand-dna must dispatch through the registry');
  ok('brand DNA dispatches through the shared registry, not a local switch');

  // ── image providers ──────────────────────────────────────────────
  // Pollinations is the zero-key free fallback: it must report available on a
  // completely bare env (no AI binding, no keys) so the image chain can never
  // die with `no_image_providers_configured`, and it must stay LAST so the
  // keyed providers keep priority when they are configured.
  const { generateImage } = await import('../functions/_lib/ai.js');
  const { image } = await listProviders({});
  assert.deepEqual(image, ['pollinations'],
    'on a bare env pollinations must still be offered — the image chain never runs out of providers');
  const fullImage = (await listProviders(env)).image;
  assert.equal(fullImage[0], 'workers-ai', 'workers-ai stays the default image provider');
  assert.equal(fullImage[fullImage.length - 1], 'pollinations', 'pollinations must be the last-resort fallback');
  ok('pollinations is registered as the always-available free image fallback');

  const realFetchImg = globalThis.fetch;
  try {
    globalThis.fetch = async (u) => {
      assert.match(String(u), /^https:\/\/image\.pollinations\.ai\/prompt\//,
        'pollinations must be called via its GET endpoint');
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        { status: 200, headers: { 'content-type': 'image/jpeg' } });
    };
    const out = await generateImage({}, {
      prompt: 'a test hero image', provider: 'pollinations', source: 'platform-test',
    });
    assert.ok(out.bytes instanceof Uint8Array && out.bytes.length === 4, 'pollinations must return image bytes');
    assert.equal(out.ai_provider, 'pollinations');
    ok('generateImage dispatches to pollinations and returns bytes');
  } finally {
    globalThis.fetch = realFetchImg;
  }

  // ── provider preference order ────────────────────────────────────
  // The operator sets `default_ai_provider` precisely when the registry's
  // first choice stops working (Workers AI's free quota runs out). brand DNA
  // was the one caller that ignored it, so the setting had no effect on the
  // screen the operator was looking at.
  const { orderProviders } = await import('../functions/_lib/ai.js');
  const registry = [
    { name: 'workers-ai', available: () => true },
    { name: 'gurouter', available: () => true },
    { name: 'openai', available: () => true },
  ];
  const names = (r) => r.map((p) => p.name);

  assert.deepEqual(names(orderProviders(registry, {}, 'gurouter')),
    ['gurouter', 'workers-ai', 'openai'],
    'an explicit preference moves to the front');
  assert.deepEqual(names(orderProviders(registry, {}, null)),
    ['workers-ai', 'gurouter', 'openai'],
    'with no preference the registry order stands');
  assert.deepEqual(names(orderProviders(registry, {}, 'not-registered')),
    ['workers-ai', 'gurouter', 'openai'],
    'an unknown preference must not reorder or throw');
  ok('orderProviders honours an explicit preference and falls back cleanly');

  // An unavailable provider must drop out of the list entirely.
  const partial = [
    { name: 'workers-ai', available: () => false },
    { name: 'gurouter', available: () => true },
  ];
  assert.deepEqual(names(orderProviders(partial, {}, null)), ['gurouter'],
    'an unconfigured provider is not offered');
  ok('an unconfigured provider is excluded from the order');

  // brand-dna must consult the setting, not just the request body.
  assert.match(brandSrc, /settings\.default_ai_provider/,
    'brand DNA must read default_ai_provider');
  const aiSrc2 = readFileSync(join(ROOT, 'functions', '_lib', 'ai.js'), 'utf8');
  assert.match(aiSrc2, /provider \|\| settings\.default_ai_provider/,
    'generateContent must fall back to the setting so a forgetful caller still works');
  ok('the default provider setting is honoured by both entry points');
}

// ── L. provider config is super_admin only ──────────────────────────
// Provider keys are platform configuration: one deployment, one set of keys,
// shared by every project. A tenant writing here would overwrite them for
// everyone, and reading tells them what the platform runs on. The setup wizard
// no longer asks tenants for keys for the same reason.
async function testProviderConfigLockdown() {
  console.log('\nL. Provider config lockdown');
  const env = await freshEnv();
  const t = Math.floor(Date.now() / 1000);

  // A tenant admin: real user row, real session, real signed cookie. Bearer
  // tokens bypass the role check by design (bootstrap credential), so the
  // test must use a session or it would prove nothing.
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, role, project_id, created_at)
     VALUES ('u_tenant', 'tenant@example.com', 'x', 'y', 'project_admin', ?, ?)`
  ).bind(PROJECT, t).run();
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('11111111111111111111111111111111', 'u_tenant', ?, ?)`
  ).bind(t + 86400, t).run();
  const cookie = await signSession('11111111111111111111111111111111', 'test-admin-token-123');
  const tenantReq = (url, body) => {
    const headers = new Map([['Cookie', `ps_session=${cookie}`]]);
    const req = { url, headers, clone() { return req; }, json: async () => body || {} };
    return {
      ...req,
      headers: {
        get: (h) => {
          for (const [k, v] of headers.entries()) if (k.toLowerCase() === h.toLowerCase()) return v;
          return null;
        },
      },
    };
  };

  const secretsPost = await secretsWrite({
    env, request: tenantReq('https://x/api/admin/secrets', { name: 'OPENAI_API_KEY', value: 'sk-test' }),
  });
  assert.equal(secretsPost.status, 403, 'a tenant must not be able to write provider keys');
  const stored = await env.__get("SELECT 1 AS x FROM secrets_vault WHERE key_name='OPENAI_API_KEY'");
  assert.equal(stored, null, 'the write must not have landed');
  ok('a tenant cannot write provider keys');

  const secretsGet = await secretsRead({ env, request: tenantReq('https://x/api/admin/secrets') });
  assert.equal(secretsGet.status, 403, 'a tenant must not be able to read provider config');
  ok('a tenant cannot read provider config');

  const providersGet = await providersList({ env, request: tenantReq('https://x/api/admin/providers') });
  assert.equal(providersGet.status, 403, 'a tenant must not list configured providers');
  ok('a tenant cannot list configured providers');

  // The test endpoint makes real, billable calls — a tenant must not be able
  // to spend the platform's credits.
  const providerTest = await providersTest({ env, request: tenantReq('https://x/api/admin/providers/test', {}) });
  assert.equal(providerTest.status, 403, 'a tenant must not be able to spend provider credits');
  ok('a tenant cannot run billable provider tests');

  // A super_admin session still works, so the gate is not simply "deny all".
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, role, created_at)
     VALUES ('u_super', 'super@example.com', 'x', 'y', 'super_admin', ?)`
  ).bind(t).run();
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ('22222222222222222222222222222222', 'u_super', ?, ?)`
  ).bind(t + 86400, t).run();
  const superCookie = await signSession('22222222222222222222222222222222', 'test-admin-token-123');
  const superReq = (url, body) => {
    const headers = new Map([['Cookie', `ps_session=${superCookie}`]]);
    const req = { url, headers, clone() { return req; }, json: async () => body || {} };
    return {
      ...req,
      headers: {
        get: (h) => {
          for (const [k, v] of headers.entries()) if (k.toLowerCase() === h.toLowerCase()) return v;
          return null;
        },
      },
    };
  };
  const superGet = await secretsRead({ env, request: superReq('https://x/api/admin/secrets') });
  assert.equal(superGet.status, 200, 'a super_admin session must still be able to read provider config');
  ok('a super_admin session still has access');

  // And the wizard must not ask tenants for keys at all.
  const wizardSrc = readFileSync(join(ROOT, 'src', 'admin', 'components', 'SetupWizard.jsx'), 'utf8');
  assert.doesNotMatch(wizardSrc, /api\/admin\/secrets/, 'the wizard must not touch provider keys');
  assert.doesNotMatch(wizardSrc, /AI Provider/, 'the wizard must not have a provider step');
  const stepsMatch = wizardSrc.match(/const steps = \[([\s\S]*?)\];/)?.[1] || '';
  assert.equal((stepsMatch.match(/title:/g) || []).length, 3, 'the wizard is three steps');
  ok('the setup wizard has no provider step');

  // The legacy wizard too — /admin-old is still reachable.
  const legacyHtml = readFileSync(join(ROOT, 'public', 'admin-old.html'), 'utf8');
  assert.doesNotMatch(legacyHtml, /Nhà cung cấp<\/b>/, 'the legacy stepper must not list a provider step');
  assert.doesNotMatch(legacyHtml, /data-pane="4"/, 'the legacy wizard must not have a 4th pane');
  const legacyJs = readFileSync(join(ROOT, 'public', 'admin.js'), 'utf8');
  assert.doesNotMatch(legacyJs, /gotoProviders|renderProviders/, 'the legacy provider pane is gone');
  ok('the legacy wizard has no provider step either');
}

// ── M. one provider dispatcher, one default-provider rule ───────────
// This bug has now shipped three times: a caller reimplements provider
// dispatch as its own switch, the registry grows, the copy does not, and the
// feature fails with `unknown_provider` for a provider that works everywhere
// else. brand-dna, raw_llm and brand-filter-queue all had their own copy.
//
// Two invariants, checked across the whole tree rather than per file:
//   1. There is exactly one provider switch, and it lives in the registry.
//   2. Every text entry point honours `default_ai_provider`.
async function testSingleDispatch() {
  console.log('\nM. Single provider dispatcher');

  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'functions_dist' || e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
  };

  const files = walk(join(ROOT, 'functions'));

  // The registry declares providers as data (`{ name: 'workers-ai', call: … }`);
  // a copy declares them as a switch (`case 'workers-ai':`). The switch form is
  // what drifted, so its presence anywhere but nowhere is the signal.
  const withSwitch = files.filter((f) => /case 'workers-ai'/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(withSwitch.map((f) => f.replace(ROOT + '/', '')), [],
    'no file may reimplement provider dispatch as a switch — use runTextProvider()');
  ok('no file reimplements provider dispatch as a switch');

  const registries = files.filter((f) => /name: 'workers-ai'/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(registries.map((f) => f.replace(ROOT + '/', '')), ['functions/_lib/ai.js'],
    'the provider registry must live in exactly one place');
  ok('the provider registry lives in exactly one place');

  // Every module that picks a text provider must consult the setting.
  // `_lib/ai.js` owns the rule; the others route through it.
  const entryPoints = [
    'functions/api/admin/brand-dna.js',
    'functions/_lib/raw_llm.js',
    'functions/api/admin/brand-filter-queue.js',
  ];
  for (const rel of entryPoints) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    assert.match(src, /runTextProvider\(/, `${rel} must dispatch through the registry`);
    assert.match(src, /default_ai_provider/, `${rel} must honour default_ai_provider`);
  }
  ok('every text entry point routes through the registry and reads the default provider');

  // A caller that reimplements the order is the bug. Fail loudly on a new copy.
  const handRolled = files.filter((f) => {
    const src = readFileSync(f, 'utf8');
    return /available\.includes\(preferredProvider\)/.test(src);
  });
  assert.deepEqual(handRolled, [], 'no file may hand-roll the provider order');
  ok('no file hand-rolls the provider preference order');

  // And the calendar planner — the path that broke — must reach the setting.
  const planner = readFileSync(join(ROOT, 'functions', '_lib', 'calendar_planner.js'), 'utf8');
  assert.match(planner, /callRawLLM\(/, 'the planner goes through callRawLLM');
  const rawLlm = readFileSync(join(ROOT, 'functions', '_lib', 'raw_llm.js'), 'utf8');
  assert.match(rawLlm, /settings\.default_ai_provider/, 'callRawLLM must read the default provider');
  ok('the calendar planner inherits the default provider through callRawLLM');
}

// ── N. publish report email ─────────────────────────────────────────
// The report goes to whoever owns the project, only for posts that came from a
// calendar slot, and only once the distribution outcome is actually known.
// Those three conditions are the whole feature, so they are what is pinned.
async function testPublishReport() {
  console.log('\nN. Publish report email');
  const env = await freshEnv();
  const t = Math.floor(Date.now() / 1000);

  // Two users on the project — both are owners, both get the mail.
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, role, project_id, created_at)
     VALUES ('u_owner', 'owner@alpha.example', 'x', 'y', 'project_admin', ?, ?)`
  ).bind(PROJECT, t).run();
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, role, project_id, created_at)
     VALUES ('u_second', 'second@alpha.example', 'x', 'y', 'project_admin', ?, ?)`
  ).bind(PROJECT, t).run();
  // And a user on a DIFFERENT project, who must never be mailed about this one.
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, role, project_id, created_at)
     VALUES ('u_other', 'other@beta.example', 'x', 'y', 'project_admin', ?, ?)`
  ).bind(OTHER, t).run();

  const recipients = await recipientsFor(env, PROJECT);
  assert.deepEqual(recipients.sort(), ['owner@alpha.example', 'second@alpha.example'],
    'every user on the project is a recipient, and nobody else is');
  ok('recipients are the project\'s own users');

  assert.deepEqual(await recipientsFor(env, 'proj_nobody'), [], 'an unknown project has no recipients');
  assert.deepEqual(await recipientsFor(env, null), [], 'a null project has no recipients');
  ok('a project with no users resolves to no recipients, not a fallback');

  // Scheduled vs hand-published.
  await env.DB.prepare(
    `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, project_id, created_at, published_at)
     VALUES ('bp_sched','sched','Bài theo lịch','Mô tả','# B','published',?,?,?)`
  ).bind(PROJECT, t, t).run();
  await env.DB.prepare(
    `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, project_id, created_at, published_at)
     VALUES ('bp_manual','manual','Bài đăng tay','Mô tả','# B','published',?,?,?)`
  ).bind(PROJECT, t, t).run();
  await env.DB.prepare(
    `INSERT INTO content_calendar (id, project_id, scheduled_for, title, status, source, post_id, created_at, updated_at)
     VALUES ('cal_rep', ?, ?, 'Bài theo lịch', 'published', 'planner', 'bp_sched', ?, ?)`
  ).bind(PROJECT, new Date().toISOString().slice(0, 10), t, t).run();

  assert.equal(await isScheduledPost(env, 'bp_sched'), true, 'a calendar post is scheduled');
  assert.equal(await isScheduledPost(env, 'bp_manual'), false, 'a hand-published post is not');
  ok('only calendar-sourced posts count as scheduled');

  // A hand-published post must produce no email at all.
  const manual = await sendPublishReport(env, { projectId: PROJECT, blogPostId: 'bp_manual' });
  assert.equal(manual.sent, 0);
  assert.equal(manual.skipped, 'not_scheduled');
  ok('a hand-published post sends nothing');

  // A draft must not be reported either.
  await env.DB.prepare(
    `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, project_id, created_at, published_at)
     VALUES ('bp_draft','draft','Nháp','Mô tả','# B','review',?,?,?)`
  ).bind(PROJECT, t, t).run();
  await env.DB.prepare(
    `INSERT INTO content_calendar (id, project_id, scheduled_for, title, status, source, post_id, created_at, updated_at)
     VALUES ('cal_draft', ?, ?, 'Nháp', 'draft', 'planner', 'bp_draft', ?, ?)`
  ).bind(PROJECT, new Date().toISOString().slice(0, 10), t, t).run();
  const draft = await sendPublishReport(env, { projectId: PROJECT, blogPostId: 'bp_draft' });
  assert.equal(draft.skipped, 'not_published', 'a review-state post is not reported as published');
  ok('a post held for review is not reported');

  // The kill switch.
  await setSetting(env, 'publish_report_email', '0');
  const off = await sendPublishReport(env, { projectId: PROJECT, blogPostId: 'bp_sched' });
  assert.equal(off.sent, 0);
  assert.equal(off.skipped, 'disabled');
  await setSetting(env, 'publish_report_email', '1');
  ok('the report has a kill switch that needs no redeploy');

  // A project with no users → no send, and no throw.
  const noUsers = await sendPublishReport(env, { projectId: 'proj_nobody', blogPostId: 'bp_sched' });
  assert.equal(noUsers.sent, 0);
  ok('a project with no users is skipped, not thrown');

  // ── the rendered report ──────────────────────────────────────────
  // This is the part a recipient actually reads, so check what it says.
  const html = renderReport({
    projectName: 'Alpha',
    title: 'Bài theo lịch',
    description: 'Mô tả',
    blogUrl: 'https://alpha.example/blog/sched',
    social: [
      { channel: 'facebook', status: 'published', attempts: 1, external_url: 'https://facebook.com/123' },
      { channel: 'instagram', status: 'failed', attempts: 3, external_url: null, error: 'Token hết hạn' },
    ],
  });
  assert.match(html, /https:\/\/alpha\.example\/blog\/sched/, 'the report links to the published post');
  assert.match(html, /Facebook Page/, 'the channel is named, not its internal id');
  assert.match(html, /Đã đăng/, 'a successful channel is reported as such');
  assert.match(html, /Đăng thất bại/, 'a failed channel is not hidden');
  assert.match(html, /https:\/\/facebook\.com\/123/, 'the external post is linked');
  assert.match(html, /Token hết hạn/, 'the failure reason is shown so it can be acted on');
  assert.match(html, /lần thử 3/, 'the retry count is surfaced');
  assert.match(html, /Bài theo lịch/, 'the title is included');
  ok('the report names the channel, its real status, the link and the error');

  // A pending channel must NOT be reported as published — the one thing a
  // report must never do.
  const pending = renderReport({
    projectName: 'Alpha', title: 'T', description: '', blogUrl: 'https://x/blog/y',
    social: [{ channel: 'facebook', status: 'pending', attempts: 0, external_url: null }],
  });
  assert.match(pending, /Đang chờ đăng/, 'a pending channel says so');
  assert.doesNotMatch(pending, /Đã đăng/, 'a pending channel is never reported as done');
  ok('a pending channel is never reported as published');

  // No channel connected at all.
  const none = renderReport({
    projectName: 'Alpha', title: 'T', description: '', blogUrl: 'https://x/blog/y', social: [],
  });
  assert.match(none, /Chưa kết nối kênh mạng xã hội/, 'a blog-only project is told there is no channel');
  ok('a blog-only project gets an honest report');

  // The subject line carries the count, so the inbox is scannable.
  assert.match(renderReport({
    projectName: 'Alpha', title: 'T', description: '', blogUrl: 'u',
    social: [{ channel: 'facebook', status: 'published', attempts: 1, external_url: 'x' }],
  }), /Alpha/);
  ok('the report is branded with the project name');

  // HTML escaping — a title with markup must not break the message.
  const xss = renderReport({
    projectName: '<script>alert(1)</script>', title: '<img src=x onerror=alert(1)>',
    description: '', blogUrl: 'https://x/blog/y', social: [],
  });
  assert.doesNotMatch(xss, /<script>alert\(1\)<\/script>/, 'project name is escaped');
  assert.doesNotMatch(xss, /<img src=x onerror/, 'title is escaped');
  ok('report content is HTML-escaped');
}

// ── O. mail goes out over the Email Service REST API ─────────────────
// Sending used to be a hand-rolled Gmail SMTP client with a hardcoded
// mailbox and an app password. It is now one POST to the Cloudflare Email
// Service REST API: no socket, no protocol, one token. What has to hold is
// that the request is shaped the way the REST endpoint wants (`from.address`,
// not the binding's `from.email`; `reply_to`, not `replyTo`), that missing
// config fails with a named reason, that the plain-text part is always
// present, and that neither the old transport nor a credential has crept back.
async function testEmailSending() {
  console.log('\nO. Email sending');

  const { mailSender, htmlToText, sendEmail, brandHeader } =
    await import('../functions/_lib/email_smtp.js');

  const ENV = { CF_EMAIL_TOKEN: 'tok', CF_ACCOUNT_ID: 'acct123' };

  // ── the sender address ──
  const dflt = mailSender({});
  assert.equal(dflt.address, 'no-reply@gulagi.com', 'REST spells it `address`, not `email`');
  assert.equal(dflt.name, 'GU SEO System');
  ok('the sender defaults to the onboarded domain');

  assert.equal(mailSender({ MAIL_FROM: ' ops@example.com ' }).address, 'ops@example.com',
    'MAIL_FROM is trimmed');
  const named = mailSender({ MAIL_FROM: '"GU SEO System" <no-reply@other.example>' });
  assert.equal(named.address, 'no-reply@other.example');
  assert.equal(named.name, 'GU SEO System', 'the quoted display name is split out');
  const bare = mailSender({ MAIL_FROM: 'no-reply@other.example' });
  assert.equal(bare.name, '', 'a bare address has no display name');
  ok('MAIL_FROM overrides the sender, in both forms');

  let badFrom = null;
  try { mailSender({ MAIL_FROM: 'not-an-address' }); } catch (e) { badFrom = e; }
  assert.ok(badFrom, 'a malformed MAIL_FROM must throw');
  assert.equal(badFrom.code, 'email_not_configured');
  ok('a malformed MAIL_FROM fails with a named reason');

  // ── the branded header ──
  {
    const bare = brandHeader({ logoUrl: '', name: 'GU SEO' }, 'SYSTEM');
    assert.match(bare, /GU SEO/, 'the name is always present');
    assert.doesNotMatch(bare, /<img/, 'no image is emitted when none is configured');

    // A relative path has no origin to resolve against once the message is in
    // an inbox, so it must not be emitted as a broken image at all.
    for (const bad of ['/logo.png', 'logo.png', 'javascript:alert(1)', 'data:image/png;base64,AA']) {
      const h = brandHeader({ logoUrl: bad, name: 'GU SEO' }, 'SYSTEM');
      assert.doesNotMatch(h, /<img/, `a non-web logo URL must be dropped: ${bad}`);
      assert.match(h, /GU SEO/, 'the text fallback survives a dropped image');
    }
    ok('a logo that cannot be fetched is dropped, and the name carries the header');

    const withLogo = brandHeader({ logoUrl: 'https://gulagi.com/gulagi-logo.png', name: 'GU SEO' }, 'BÁO CÁO');
    assert.match(withLogo, /<img src="https:\/\/gulagi\.com\/gulagi-logo\.png"/);
    assert.match(withLogo, /alt="GU SEO"/, 'the image needs alt text — images are blocked by default');
    assert.match(withLogo, /width="32" height="32"/, 'explicit dimensions, so a blocked image cannot reflow the layout');
    assert.match(withLogo, /GU SEO/);
    assert.match(withLogo, /BÁO CÁO/);
    ok('a web logo URL renders with alt text, fixed dimensions, and the name beside it');

    const injected = brandHeader({ logoUrl: 'https://x.com/a.png?a=1&b=2"><script>alert(1)</script>', name: '<b>Bad</b>' }, 'L');
    assert.doesNotMatch(injected, /<script>/, 'the name is escaped');
    assert.match(injected, /&lt;b&gt;Bad/);
    ok('the header escapes the brand name and label');
  }

  // ── missing credentials must be legible, not an opaque 401 ──
  for (const env of [{}, { CF_API_TOKEN: 'tok' }, { CF_ACCOUNT_ID: 'acct123' }]) {
    let err = null;
    try { await sendEmail(env, { to: 'a@b.com', subject: 's', html: 'x' }); } catch (e) { err = e; }
    assert.ok(err, 'missing config must throw');
    assert.equal(err.code, 'email_not_configured');
    assert.match(err.message, /CF_API_TOKEN/, 'the error must name the missing secret');
  }
  ok('a missing token or account id fails with a named reason');

  // ── the text/plain part is derived, not left to callers ──
  const text = htmlToText('<p>Xác thực</p><div>Mã &amp; mã</div><br><span>beneath</span>');
  assert.match(text, /Xác thực/);
  assert.match(text, /Mã & mã/, 'entities are decoded, not double-escaped');
  assert.doesNotMatch(text, /</, 'no tags survive');
  assert.doesNotMatch(htmlToText('<style>a{color:red}</style><p>hi</p>'), /color/,
    'style content is dropped');
  ok('html degrades to a usable text/plain part');

  // ── what actually goes on the wire ──
  const realFetch = globalThis.fetch;
  const calls = [];
  const stub = (status, body) => {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return new Response(JSON.stringify(body), {
        status, headers: { 'Content-Type': 'application/json' },
      });
    };
  };

  try {
  // The two tokens are separate concerns and must not be confused. A token
  // minted for Email Sending cannot list Pages projects or read a zone; a
  // token minted for Pages cannot send. Falling back lets a single-token
  // install still work, but the dedicated one has to win when both are set.
  {
    const both = { CF_EMAIL_TOKEN: 'mail-tok', CF_API_TOKEN: 'pages-tok', CF_ACCOUNT_ID: 'acct123' };
    stub(200, { success: true, result: { message_id: 'm' } });
    await sendEmail(both, { to: 'a@b.com', subject: 's', html: 'x' });
    assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer mail-tok',
      'the dedicated email token must win over the general one');
    const legacy = { CF_API_TOKEN: 'pages-tok', CF_ACCOUNT_ID: 'acct123' };
    await sendEmail(legacy, { to: 'a@b.com', subject: 's', html: 'x' });
    assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer pages-tok',
      'a single-token install must still send');
    ok('the email token is separate from the pages token, with a fallback');
    calls.length = 0; // the blocks below index from 1
  }

    stub(200, { success: true, result: { message_id: 'msg_1', queued: ['user@example.com'] } });
    const res = await sendEmail(ENV, {
      to: 'user@example.com', subject: 'Báo cáo', html: '<p>Xin chào</p>',
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url,
      'https://api.cloudflare.com/client/v4/accounts/acct123/email/sending/send',
      'the send endpoint and account id must be right');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer tok',
      'the token must be sent as a bearer');
    assert.equal(calls[0].body.to, 'user@example.com');
    assert.equal(calls[0].body.from.address, 'no-reply@gulagi.com');
    assert.equal(calls[0].body.from.name, 'GU SEO System');
    assert.equal(calls[0].body.subject, 'Báo cáo');
    assert.equal(calls[0].body.text, 'Xin chào', 'every send carries a text part');
    assert.equal(calls[0].body.reply_to, undefined, 'reply_to stays unset when not asked for');
    // The REST envelope spells it message_id. The Workers binding spells it
    // messageId; reading that one here returns '' and looks like a quiet
    // success with no id, which is how this shipped wrong the first time.
    assert.equal(res.messageId, 'msg_1', 'message_id is read, not the binding spelling');
    ok('sendEmail posts a correctly shaped message to the send endpoint');

    await sendEmail(ENV, { to: 'a@b.com', subject: 's', html: '<p>x</p>', replyTo: ' ops@x.com ' });
    assert.equal(calls[1].body.reply_to, 'ops@x.com',
      'REST spells it reply_to, not replyTo');
    ok('replyTo is passed through in the REST spelling');

    // A CF error must surface with its own message, not a generic failure.
    stub(400, { success: false, errors: [{ code: 1001, message: 'sender not onboarded' }] });
    let thrown = null;
    try { await sendEmail(ENV, { to: 'a@b.com', subject: 's', html: 'x' }); } catch (e) { thrown = e; }
    assert.ok(thrown, 'a rejected send must throw');
    assert.equal(thrown.code, 'email_send_failed');
    assert.equal(thrown.status, 400);
    assert.match(thrown.message, /sender not onboarded/,
      'the Cloudflare error message must reach the caller');
    ok('Cloudflare errors propagate with their message and status');

    // A 200 is not proof of delivery: Cloudflare accepts the send and then
    // reports per-recipient. Reporting "OTP sent" for a suppressed address
    // would be a lie the user only finds out after the code expires.
    for (const dead of ['permanent_bounces', 'suppressed_recipients']) {
      stub(200, { success: true, result: { message_id: 'msg_2', [dead]: ['gone@example.com'] } });
      let undeliverable = null;
      try { await sendEmail(ENV, { to: 'gone@example.com', subject: 's', html: 'x' }); }
      catch (e) { undeliverable = e; }
      assert.ok(undeliverable, `${dead} must not count as sent`);
      assert.equal(undeliverable.code, 'email_rejected');
      assert.match(undeliverable.message, /gone@example\.com/);
    }
    ok('a hard-bounced or suppressed recipient is not reported as sent');

    const beforeBadRecipients = calls.length;
    for (const to of ['', 'no-at-sign', 'a@b c.com']) {
      let err = null;
      try { await sendEmail(ENV, { to, subject: 's', html: 'x' }); } catch (e) { err = e; }
      assert.ok(err, `recipient ${JSON.stringify(to)} must be rejected`);
      assert.equal(err.message, 'invalid_recipient');
    }
    assert.equal(calls.length, beforeBadRecipients,
      'a bad recipient must not reach the network');
    ok('a malformed recipient is rejected before the request is made');
  } finally {
    globalThis.fetch = realFetch;
  }

  // ── nothing secret left in the source tree ──
  const walk = (dir, acc = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'functions_dist' || e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, acc);
      else if (/\.(js|jsx|json|html|toml)$/.test(e.name)) acc.push(p);
    }
    return acc;
  };
  const srcFiles = [
    ...walk(join(ROOT, 'functions')),
    ...walk(join(ROOT, 'src')),
    join(ROOT, 'wrangler.template.toml'),
  ].filter((f) => existsSync(f));

  // Comments are stripped before the scans: a file may honestly *say* that it
  // used to speak SMTP, or explain why a binding is absent, and that is the
  // opposite of leaving SMTP in it or reintroducing the binding.
  const code = (f) => readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*#.*$/gm, '');

  const leaked = srcFiles.filter((f) => /zpgneewuhhldrfsu/.test(code(f)));
  assert.deepEqual(leaked.map((f) => f.replace(ROOT + '/', '')), [],
    'the mailbox password must not appear in any source file');
  ok('no mailbox password anywhere in the source tree');

  const hardcodedUser = srcFiles.filter((f) => /gulagi\.com@gmail\.com/.test(code(f)));
  assert.deepEqual(hardcodedUser.map((f) => f.replace(ROOT + '/', '')), [],
    'the mailbox address must not be hardcoded either');
  ok('no hardcoded mailbox address');

  // The SMTP client is gone; nothing may reach for it again.
  const smtpLeft = srcFiles.filter((f) => /cloudflare:sockets|smtp\.gmail\.com/.test(code(f)));
  assert.deepEqual(smtpLeft.map((f) => f.replace(ROOT + '/', '')), [],
    'the old SMTP transport must stay removed');
  ok('no SMTP transport left in the source tree');

  const gmailless = srcFiles.filter((f) => /GMAIL_(USER|PASS)/.test(code(f)));
  assert.deepEqual(gmailless.map((f) => f.replace(ROOT + '/', '')), [],
    'the retired Gmail secrets must not be read anywhere');
  ok('no GMAIL_USER / GMAIL_PASS reference left');

  // Pages Functions have no email binding, and wrangler refuses to even parse
  // a Pages config that declares one — it would break every `wrangler pages`
  // command, not just mail.
  for (const rel of ['wrangler.template.toml', 'wrangler.toml']) {
    const file = join(ROOT, rel);
    if (!existsSync(file)) continue;
    assert.doesNotMatch(code(file), /send_email/,
      `${rel} must not declare send_email: Pages does not support it`);
  }
  ok('no send_email binding in either wrangler config');

  // And every sender must pass env through, or the token never arrives.
  for (const rel of [
    'functions/api/public/send-otp.js',
    'functions/api/admin/cron/weekly-digest.js',
    'functions/api/admin/report/test.js',
    'functions/_lib/publishing/report.js',
    'functions/_lib/video_notify.js',
  ]) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    assert.match(src, /send(Email|OtpEmail)\(env,/, `${rel} must pass env to the sender`);
  }
  ok('every caller passes env to the sender');
}

// ── P. sign-up email policy ─────────────────────────────────────────
// Plus-addressing (you+tag@domain) delivers to the same inbox, so it turns one
// mailbox into unlimited free accounts. The rule has to hold at every door that
// can create a user, which is why it lives in one module and is checked here
// against all of them.
async function testEmailPolicy() {
  console.log('\nP. Sign-up email policy');
  const env = await freshEnv();
  const t = Math.floor(Date.now() / 1000);

  const { isValidEmail, isSubaddressed, emailPolicyError, normalizeEmail } =
    await import('../functions/_lib/email_rules.js');

  // Shape checks.
  assert.equal(isValidEmail('a@b.com'), true);
  assert.equal(isValidEmail('first.last@sub.example.co.uk'), true);
  assert.equal(isValidEmail('no-at-sign'), false);
  assert.equal(isValidEmail('a@b'), false, 'a domain without a dot is not deliverable');
  assert.equal(isValidEmail('a b@c.com'), false, 'spaces are rejected');
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail(`${'x'.repeat(250)}@b.com`), false, 'over 254 chars is not deliverable');
  ok('email shape validation');

  assert.equal(normalizeEmail('  A@B.COM '), 'a@b.com', 'trimmed and lowercased');
  ok('emails are normalised before comparison');

  // The subaddress rule.
  assert.equal(isSubaddressed('gulagi.com+secretcheck@gmail.com'), true);
  assert.equal(isSubaddressed('user+tag@example.com'), true);
  assert.equal(isSubaddressed('user@example.com'), false);
  assert.equal(isSubaddressed('user@ex+ample.com'), false,
    'a plus in the DOMAIN is not subaddressing — some hosts use it legitimately');
  assert.equal(isSubaddressed('+tag@example.com'), true);
  ok('subaddressing is detected in the local part only');

  assert.equal(emailPolicyError('user@example.com'), null, 'a plain address passes');
  const sub = emailPolicyError('gulagi.com+secretcheck@gmail.com');
  assert.equal(sub.error, 'subaddress_not_allowed');
  assert.match(sub.detail, /hộp thư/, 'the message explains why, not just "invalid"');
  ok('a subaddressed address is refused with a reason');

  // ── enforced at every door ───────────────────────────────────────
  // Public sign-up: OTP first, then register. Both must refuse.
  const otpReq = (email) => {
    const headers = new Map([['content-type', 'application/json']]);
    const req = { url: 'https://x/api/public/send-otp', headers, clone() { return req; }, json: async () => ({ email }) };
    return { ...req, headers: { get: (h) => { for (const [k, v] of headers) if (k.toLowerCase() === h.toLowerCase()) return v; return null; } } };
  };

  const otpSub = await sendOtp({ env, request: otpReq('gulagi.com+secretcheck@gmail.com') });
  assert.equal(otpSub.status, 400, 'send-otp must refuse a subaddressed address');
  assert.equal((await otpSub.json()).error, 'subaddress_not_allowed');
  const noOtpRow = await env.__get("SELECT 1 AS x FROM email_verifications WHERE email LIKE '%+%'");
  assert.equal(noOtpRow, null, 'no OTP is generated for a refused address');
  ok('send-otp refuses a subaddressed address before doing any work');

  // A plain address must get past the policy. The send itself cannot succeed
  // here (no SMTP credentials in a test env), so assert on what the policy
  // controls: it was not refused, and the OTP row was created.
  const otpOk = await sendOtp({ env, request: otpReq('plain@example.com') });
  assert.notEqual(otpOk.status, 400, 'a plain address must not be refused by the policy');
  const otpRow = await env.__get("SELECT otp_code FROM email_verifications WHERE email = 'plain@example.com'");
  assert.ok(otpRow?.otp_code, 'an OTP is generated for a plain address');
  ok('a plain address still gets an OTP');

  // Register: the authoritative boundary. Even with a valid OTP it must refuse.
  await env.DB.prepare(
    `INSERT INTO email_verifications (email, otp_code, created_at, expires_at) VALUES (?, '123456', ?, ?)`
  ).bind('sneaky+tag@example.com', t, t + 600).run();
  const regSub = await register({
    env, request: jsonReq('https://x/api/public/register', {
      email: 'sneaky+tag@example.com', password: 'matkhau123', otp: '123456',
    }),
  });
  assert.equal(regSub.status, 400, 'register must refuse a subaddressed address');
  assert.equal((await regSub.json()).error, 'subaddress_not_allowed');
  const created = await env.__get("SELECT 1 AS x FROM users WHERE email LIKE '%+%'");
  assert.equal(created, null, 'no account is created for a refused address');
  ok('register refuses a subaddressed address even with a valid OTP');

  // Admin-created users go through the same door.
  const adminSub = await usersCreate({
    env, request: adminReq('https://x/api/admin/users', {
      body: { email: 'staff+ops@example.com', password: 'matkhau123', role: 'project_admin' },
    }),
  });
  assert.equal(adminSub.status, 400, 'admin user creation must refuse a subaddressed address');
  ok('admin user creation applies the same policy');

  // The rule lives in one place — no door may re-implement it.
  const walk = (dir, acc = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'functions_dist' || e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, acc); else if (e.name.endsWith('.js')) acc.push(p);
    }
    return acc;
  };
  const files = walk(join(ROOT, 'functions'));
  const withCopy = files.filter((f) => /function validEmail\(/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(withCopy.map((f) => f.replace(ROOT + '/', '')), [],
    'no file may re-implement email validation — use _lib/email_rules.js');
  ok('no file re-implements email validation');

  for (const rel of ['functions/api/public/register.js', 'functions/api/public/send-otp.js', 'functions/api/admin/users.js']) {
    assert.match(readFileSync(join(ROOT, rel), 'utf8'), /emailPolicyError/,
      `${rel} must apply the shared policy`);
  }
  ok('every door that creates a user applies the shared policy');
}

// Code 190 covers several different token causes, and a Page whose token Meta
// withholds used to vanish from the connect picker. Both misled the operator.
async function testFacebookPageRecovery() {
  console.log('\nF. Facebook Page token recovery');
  const realFetch = globalThis.fetch;
  const res = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });

  try {
    globalThis.fetch = async () => res({ data: [
      { id: '111', name: 'Page A', access_token: 'EAAG-page-a' },
      { id: '222', name: 'Page B' },
    ] });
    const pages = await listManagedPages('user-token', 'v23.0');
    assert.equal(pages.length, 2, 'a Page without a per-Page token must not be dropped');
    assert.equal(pages.find((p) => p.id === '111').has_token, true);
    assert.equal(pages.find((p) => p.id === '222').has_token, false);
    ok('listManagedPages keeps token-less Pages and flags them');

    const calls = [];
    globalThis.fetch = async (u) => {
      calls.push(String(u));
      if (String(u).includes('/222?')) {
        return res({ error: { message: 'This Page access token belongs to a Page that is not accessible.', code: 190, error_subcode: 460 } });
      }
      return res({ id: '111', name: 'Page A' });
    };
    await assert.rejects(
      () => verifyFacebookPage({ env: {}, projectId: PROJECT, pageId: '222', token: 'EAAG-page-a' }),
      (err) => {
        assert.match(err.message, /thuộc Page "Page A" \(111\)/, 'must name the Page the token belongs to');
        assert.match(err.message, /đang trỏ Page 222/, 'must name the configured Page');
        return true;
      },
    );
    assert.equal(calls.length, 2, 'diagnosis costs exactly one extra Graph call');
    ok('a 190 from another Page names both Pages');

    globalThis.fetch = async (u) => {
      if (String(u).includes('/222?')) return res({ error: { message: 'Invalid OAuth access token.', code: 190 } });
      throw new Error('graph unreachable');
    };
    await assert.rejects(
      () => verifyFacebookPage({ env: {}, projectId: PROJECT, pageId: '222', token: 'EAAG-stale' }),
      (err) => {
        assert.match(err.message, /Không đọc được Page từ token/);
        return true;
      },
    );
    ok('a 190 whose token cannot be read says so instead of guessing');

    assert.match(
      describeGraphError({ message: 'x', code: 190, error_subcode: 492 }),
      /không còn vai trò phù hợp trên Page/,
    );
    ok('subcode 492 is reported as a lost Page role, not a stale token');

    globalThis.fetch = async (u) => {
      if (String(u).includes('/222?')) {
        return res({ error: { message: 'Unsupported get request.', code: 100, error_subcode: 33 } });
      }
      return res({ id: '111', name: 'Page A' });
    };
    await assert.rejects(
      () => verifyFacebookPage({ env: {}, projectId: PROJECT, pageId: '222', token: 'EAAG-page-a' }),
      (err) => {
        assert.match(err.message, /đang trỏ Page 222/, 'the 100/33 variant must get the same diagnosis');
        return true;
      },
    );
    ok('a 100/33 failure is diagnosed the same way');
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ── Q. carousel video jobs ──────────────────────────────────────────
// A carousel rides the same video_jobs queue as the 9:16 videos, but it
// carries a sentinel ref ("carousel:<post_id>") and a slide prefix as its
// video_key. Both conventions are shared policy (functions/_lib/video_jobs.js)
// and getting either wrong stays invisible until Facebook is involved, so
// these cases drive the real publisher against a fake Graph API and a fake R2.

// The slice of R2 the publishing paths use. `get()` on a missing key returns
// null, exactly like the real binding — that is what made a slide prefix
// handed to the video uploader fail.
function fakeImages(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    keys: () => [...store.keys()].sort(),
    async list({ prefix = '' } = {}) {
      return { objects: [...store.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key })) };
    },
    async get(key) {
      const v = store.get(key);
      return v ? { async arrayBuffer() { return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength); } } : null;
    },
    async put(key, bytes) { store.set(key, bytes); },
    async delete(key) { store.delete(key); },
  };
}

async function testCarouselVideoJobs() {
  console.log('\nQ. Carousel video jobs');
  const realFetch = globalThis.fetch;
  const graph = [];
  const jsonRes = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (u, init = {}) => {
    const path = String(u);
    graph.push({
      path,
      isForm: typeof FormData !== 'undefined' && init.body instanceof FormData,
      params: typeof init.body === 'string' ? Object.fromEntries(new URLSearchParams(init.body)) : null,
    });
    if (path.includes('/videos')) return jsonRes({ id: 'video_1' });
    if (path.includes('/photos')) return jsonRes({ id: `photo_${graph.length}` });
    return jsonRes({ id: 'feed_1' });
  };

  try {
    const env = await freshEnv();
    const t = Math.floor(Date.now() / 1000);
    const prefix = carouselPrefix('alpha-post');
    const slides = [1, 2, 3].map((n) => carouselSlideKey(prefix, n));
    env.IMAGES = fakeImages(Object.fromEntries(slides.map((k) => [k, new Uint8Array([1])])));

    // A Facebook channel that wants videos — the configuration that used to
    // swallow a slide prefix and fail on an object that is not there.
    await env.DB.prepare(
      `INSERT INTO project_channels (id, project_id, channel, enabled, config_json, created_at, updated_at)
       VALUES ('pc_carousel_fb', ?, 'facebook', 1, ?, ?, ?)`
    ).bind(PROJECT, JSON.stringify({ page_id: '111222333', as_video: true }), t, t).run();
    await setVaultSecret(env, `FACEBOOK_PAGE_TOKEN__${PROJECT}`, 'page-token');

    const ref = carouselRef(POST);
    await env.DB.prepare(
      `INSERT INTO video_jobs (id, project_id, blog_post_id, slug, kind, status, video_key, attempts, created_at, updated_at)
       VALUES ('vj_carousel', ?, ?, 'alpha-post', 'carousel', 'done', ?, 1, ?, ?)`
    ).bind(PROJECT, ref, prefix, t, t).run();

    await enqueueSocialPost(env, { projectId: PROJECT, blogPostId: ref, channel: 'facebook_video' });
    const drained = await drainSocialQueue(env, { projectId: PROJECT });
    assert.equal(drained.results[0]?.ok, true, 'a carousel must still publish on an as_video channel');
    assert.equal(graph.filter((g) => g.isForm && g.path.includes('/photos')).length, slides.length,
      'every slide in R2 is uploaded');
    assert.equal(graph.filter((g) => g.path.includes('/videos')).length, 0,
      'a slide prefix is never uploaded as a video');
    const feed = graph.find((g) => !g.isForm && g.path.endsWith('/feed'));
    assert.equal(JSON.parse(feed.params.attached_media).length, slides.length,
      'all slides attach to one feed post');
    ok('a carousel on an as_video channel posts as photos, not as a video');

    // The Social tab reads the same rows, so the sentinel must resolve to the
    // article instead of rendering an empty cell.
    const [social] = await listSocialPosts(env, { projectId: PROJECT });
    assert.equal(social.post_title, 'Tiêu đề', 'a carousel job must show its article title');
    assert.equal(social.post_slug, 'alpha-post');
    ok('the social list resolves a carousel ref back to its post');

    // Delete owns the slide objects, and only its own: a slug that STARTS WITH
    // this one (alpha-postX) shares the string prefix, so a bare prefix list
    // would take its slides too.
    await env.IMAGES.put(carouselSlideKey(carouselPrefix('alpha-postX'), 1), new Uint8Array([1]));
    await env.IMAGES.put('video/other.mp4', new Uint8Array([1]));
    const deleted = await (await deleteVideoJob({
      env, request: adminReq('https://x/api/admin/video/delete', { body: { id: 'vj_carousel' } }),
    })).json();
    assert.equal(deleted.ok, true);
    assert.deepEqual(
      env.IMAGES.keys(),
      [carouselSlideKey(carouselPrefix('alpha-postX'), 1), 'video/other.mp4'],
      'delete removes its own slides and nothing else',
    );
    ok('delete removes its own slides and keeps a neighbouring slug');
  } finally {
    globalThis.fetch = realFetch;
  }
}


/* ── R. Threads button on video + carousel rows ──────────────────────────────
   The Video and Carousel pages gained a "Đăng Thread" row button. Two things
   have to hold for it to be more than a button that always fails:

   1. the endpoint maps `threads` onto the plain `threads` channel (the same
      one the article fan-out uses, so the Social tab lists it in one place);
   2. a rendered video or a carousel has no blog post row behind its job ref,
      so the queue must not reject it the way it rejects a text-first channel.

   The real endpoint and the real queue are driven against a fake Threads API.
   ─────────────────────────────────────────────────────────────────────────── */
async function testThreadsPublishFromVideoAndCarousel() {
  console.log('\nR. Threads publish from the video + carousel rows');
  const realFetch = globalThis.fetch;
  const calls = [];
  const jsonRes = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (u, init = {}) => {
    const path = String(u);
    calls.push({ path, params: init.body ? Object.fromEntries(new URLSearchParams(init.body)) : null });
    if (path.includes('/threads_publish')) return jsonRes({ id: 'th_post_1' });
    if (path.includes('/threads?')) return jsonRes({ data: { id: 'th_me_1', username: 'guseo' } });
    if (path.endsWith('/threads')) return jsonRes({ id: 'th_container_1' });
    return jsonRes({ id: 'unknown_1' });
  };

  try {
    const env = await freshEnv();
    const t = Math.floor(Date.now() / 1000);
    const { setVaultSecret } = await import('../functions/_lib/secret_vault.js');
    const { threadsTokenName } = await import('../functions/_lib/publishing/threads.js');
    await setVaultSecret(env, threadsTokenName(PROJECT), 'th-token-1');

    // A finished 9:16 video whose ref points at a real post.
    await env.DB.prepare(
      `INSERT INTO video_jobs (id, project_id, blog_post_id, slug, kind, status, video_key, created_at, updated_at)
       VALUES ('vj_vid', ?, ?, 'vid-slug', 'post', 'done', 'video/vid-slug.mp4', ?, ?)`
    ).bind(PROJECT, POST, t, t).run();

    const res = await publishVideo({
      env, request: jsonReq('https://x/api/admin/video/publish', { id: 'vj_vid', channel: 'threads' }),
    });
    const body = await res.json();
    assert.equal(res.status, 200, `threads publish on a video must be accepted: ${JSON.stringify(body)}`);
    assert.equal(body.ok, true);
    assert.equal(body.channel, 'threads', 'the job lands on the plain threads channel');
    assert.equal(body.posted, true, 'Threads is drained in-request, like Facebook');
    const publishCall = calls.find((c) => c.path.includes('/threads_publish'));
    assert.ok(publishCall, 'the real Threads publisher was reached');
    ok('the Threads button posts a finished video through the real queue');

    const rows = await listSocialPosts(env, { projectId: PROJECT, channel: 'threads' });
    assert.equal(rows.length, 1, 'the row is visible on the Social tab');
    assert.equal(rows[0].status, 'published');
    ok('a Threads row from a video shows up on the Social tab');

    // A carousel: the sentinel ref resolves to no blog post, which is exactly
    // the case the old post_id guard rejected.
    const prefix = carouselPrefix('alpha-post');
    await env.DB.prepare(
      `INSERT INTO video_jobs (id, project_id, blog_post_id, slug, kind, status, video_key, created_at, updated_at)
       VALUES ('vj_car', ?, ?, 'car-slug', 'carousel', 'done', ?, ?, ?)`
    ).bind(PROJECT, `carousel:${POST}`, prefix, t, t).run();

    const carRes = await publishVideo({
      env, request: jsonReq('https://x/api/admin/video/publish', { id: 'vj_car', channel: 'threads' }),
    });
    const carBody = await carRes.json();
    assert.equal(carRes.status, 200, `threads publish on a carousel must be accepted: ${JSON.stringify(carBody)}`);
    assert.equal(carBody.posted, true, 'a carousel posts to Threads as text, not as blog_post_missing');
    ok('the Threads button posts a carousel instead of failing on the missing post');

    // YouTube stays video-only: a carousel has no MP4, so the button is not
    // offered and the endpoint refuses rather than queueing a doomed job.
    const yt = await publishVideo({
      env, request: jsonReq('https://x/api/admin/video/publish', { id: 'vj_car', channel: 'youtube' }),
    });
    const ytBody = await yt.json();
    assert.equal(yt.status, 400);
    assert.equal(ytBody.error, 'youtube_requires_mp4_blog_post');
    ok('YouTube still refuses a carousel — no MP4 behind it');

    // An unknown channel is still refused, so a typo cannot enqueue junk.
    const junk = await publishVideo({
      env, request: jsonReq('https://x/api/admin/video/publish', { id: 'vj_vid', channel: 'tiktok' }),
    });
    assert.equal(junk.status, 400);
    assert.equal((await junk.json()).error, 'unknown_channel');
    ok('an unknown channel is refused');

    // A video that has not finished rendering cannot be posted anywhere.
    // video_jobs.blog_post_id is UNIQUE, so the unfinished job needs a post of
    // its own rather than borrowing the one behind vj_vid.
    await env.DB.prepare(
      `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, project_id, created_at, published_at)
       VALUES ('p_wip', 'wip-post', 'Chưa render', 'D', '# B', 'published', ?, ?, ?)`
    ).bind(PROJECT, t, t).run();
    await env.DB.prepare(
      `INSERT INTO video_jobs (id, project_id, blog_post_id, slug, kind, status, video_key, created_at, updated_at)
       VALUES ('vj_wip', ?, 'p_wip', 'wip-slug', 'post', 'pending', NULL, ?, ?)`
    ).bind(PROJECT, t, t).run();
    const wip = await publishVideo({
      env, request: jsonReq('https://x/api/admin/video/publish', { id: 'vj_wip', channel: 'threads' }),
    });
    assert.equal(wip.status, 409);
    assert.equal((await wip.json()).error, 'video_not_ready');
    ok('an unfinished video is not postable to Threads');
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ── Q. cover template renderability ─────────────────────────────────
// A default cover template saved as `{}` (the React Covers "Tạo template"
// form used to POST exactly that) rendered a 262-byte SVG: one black
// <rect> and no text. Every cover on the site went black. Guard against
// that at the spec, endpoint, and renderer levels.
async function testCoverSpecFallback() {
  console.log('\nQ. Cover template reliability');

  assert.equal(isRenderableSpec({}), false, 'empty spec is not renderable');
  assert.equal(isRenderableSpec({ layers: [] }), false, 'no layers is not renderable');
  assert.equal(isRenderableSpec(null), false, 'null spec is not renderable');
  assert.equal(isRenderableSpec({ background: { url: '/image/x.png' } }), true, 'background alone is renderable');
  assert.equal(isRenderableSpec({ layers: [{ kind: 'text', text: 'x' }] }), true, 'one layer is renderable');
  ok('isRenderableSpec rejects specs that would paint nothing');

  const env = await freshEnv();
  const t = Math.floor(Date.now() / 1000);
  // The exact row that broke the live site: default template, spec `{}`.
  await env.DB.prepare(
    `INSERT INTO cover_templates (id, name, is_default, spec_json, created_at, updated_at)
     VALUES ('tpl_empty', 'Hoàng Lê', 1, '{}', ?, ?)`
  ).bind(t, t).run();

  const request = { url: 'https://seo.test/blog/alpha-post' };
  const params = { slug: 'alpha-post' };

  const coverRes = await coverSvgRoute({ env, request, params });
  assert.equal(coverRes.status, 200, 'cover endpoint still renders with an empty default template');
  const coverSvg = await coverRes.text();
  assert.match(coverSvg, /<tspan[^>]*>[^<]+<\/tspan>/, 'cover SVG contains rendered text');
  assert.match(coverSvg, /Tiêu đề/, 'cover SVG contains the post title');
  assert.ok((coverSvg.match(/<rect/g) || []).length >= 2, 'cover SVG has the card background + accent rule');
  assert.ok(coverSvg.length > 400, 'cover SVG is more than a bare black rectangle');
  ok('GET /cover/<slug>.svg falls back to the branded card for an empty default template');

  const ogRes = await ogSvgRoute({ env, request, params });
  assert.equal(ogRes.status, 200);
  const ogSvg = await ogRes.text();
  assert.match(ogSvg, /<tspan[^>]*>[^<]+<\/tspan>/, 'og SVG contains rendered text');
  ok('GET /og/<slug>.svg never serves a black, textless card');

  // Renderer-level guard: any caller, present or future, is covered.
  assert.ok(fallbackCoverSpec().layers.length > 0, 'built-in fallback card has layers');
  const direct = await renderCoverSvg({}, { brand: { name: 'Alpha' }, title: 'Tiêu đề' }, {});
  assert.match(direct, /<tspan[^>]*>Tiêu đề<\/tspan>/, 'renderer substitutes the fallback for an empty spec');
  ok('renderCoverSvg substitutes the fallback spec for any unusable spec');

  // A real design must still win over the fallback.
  await env.DB.prepare(
    `UPDATE cover_templates SET name = 'Designed', spec_json = ? WHERE id = 'tpl_empty'`
  ).bind(JSON.stringify({
    width: 1200, height: 630, background: null,
    layers: [
      { kind: 'box', x: 0, y: 0, w: 1200, h: 630, fill: '#123456' },
      { kind: 'text', x: 10, y: 10, w: 800, h: 60, text: 'DESIGNED-{title}', size: 40, color: '#ffffff' },
    ],
  })).run();
  const designedSvg = await (await coverSvgRoute({ env, request, params })).text();
  assert.match(designedSvg, /DESIGNED-Tiêu đề/, 'a designed template renders as authored');
  assert.doesNotMatch(designedSvg, /#d4af62/, 'the fallback card accent is not used when a real design exists');
  ok('a designed template still renders instead of the fallback');
}

// ── Multi-channel distribution (migration 010) ──────────────────────
async function testMultiChannel() {
  const env = await freshEnv();
  const t = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, created_at, published_at)
     VALUES ('post_mc', 'mc-post', 'Tiêu đề đa kênh', 'Mô tả cho đa kênh', '# Body', 'published', ?, ?)`
  ).bind(t, t).run();

  // 1. Legacy fallback: no project_channels rows → publisher_type speaks.
  await env.DB.prepare(
    `INSERT INTO project_publishing_configs (project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at)
     VALUES (?, 'facebook', '', '', '{"page_id":"123"}', ?, ?)`
  ).bind(PROJECT, t, t).run();
  let chans = await listEnabledChannels(env, PROJECT);
  assert.equal(chans.length, 1, 'legacy fallback returns the single publisher_type channel');
  assert.equal(chans[0].channel, 'facebook');
  assert.equal(chans[0].config.page_id, '123', 'legacy config rides through the fallback');
  ok('listEnabledChannels falls back to legacy publisher_type');

  // 2. Rows win; legacy config merges under the row config.
  await env.DB.prepare(
    `INSERT INTO project_channels (id, project_id, channel, enabled, config_json, created_at, updated_at)
     VALUES ('ch1', ?, 'facebook', 1, '{"page_id":"456"}', ?, ?)`
  ).bind(PROJECT, t, t).run();
  await env.DB.prepare(
    `INSERT INTO project_channels (id, project_id, channel, enabled, config_json, created_at, updated_at)
     VALUES ('ch2', ?, 'x', 1, '{}', ?, ?)`
  ).bind(PROJECT, t, t).run();
  await env.DB.prepare(
    `INSERT INTO project_channels (id, project_id, channel, enabled, config_json, created_at, updated_at)
     VALUES ('ch3', ?, 'threads', 0, '{}', ?, ?)`
  ).bind(PROJECT, t, t).run();
  chans = await listEnabledChannels(env, PROJECT);
  assert.deepEqual(chans.map((c) => c.channel), ['facebook', 'x'], 'only enabled rows are returned, canonical order');
  ok('project_channels rows drive the fan-out');

  await env.DB.prepare("UPDATE project_channels SET enabled = 0 WHERE project_id = ?").bind(PROJECT).run();
  assert.deepEqual(await listEnabledChannels(env, PROJECT), [], 'a disabled modern registry does not resurrect legacy Facebook');
  await env.DB.prepare(
    "UPDATE project_channels SET enabled = 1 WHERE project_id = ? AND channel IN ('facebook', 'x')"
  ).bind(PROJECT).run();
  ok('disabled modern channels stay disabled');

  // 3. Fan-out: one publish → one queue row per enabled channel.
  for (const ch of chans) {
    await enqueueSocialPost(env, { projectId: PROJECT, blogPostId: 'post_mc', channel: ch.channel });
  }
  const { results: rows } = await env.DB.prepare(
    `SELECT channel, status FROM social_posts WHERE blog_post_id = 'post_mc' ORDER BY channel`
  ).all();
  assert.deepEqual(rows.map((r) => r.channel), ['facebook', 'x']);
  ok('multi-channel enqueue creates one row per channel');

  // Re-enqueue is idempotent per channel (UNIQUE index).
  await enqueueSocialPost(env, { projectId: PROJECT, blogPostId: 'post_mc', channel: 'x' });
  const { results: rows2 } = await env.DB.prepare(
    `SELECT channel FROM social_posts WHERE blog_post_id = 'post_mc'`
  ).all();
  assert.equal(rows2.length, 2, 'double enqueue cannot duplicate a channel row');
  ok('multi-channel enqueue stays idempotent');

  // 4. Dispatch: the x channel routes to publishToX (fails on missing
  //    credentials with the operator-facing message — proving routing).
  const job = rows.find((r) => r.channel === 'x')
    ? (await env.DB.prepare(`SELECT id FROM social_posts WHERE blog_post_id = 'post_mc' AND channel = 'x'`).first())
    : null;
  assert.ok(job, 'x row exists for dispatch');
  const res = await runSocialJob(env, job.id);
  assert.equal(res.ok, false);
  assert.match(res.error, /API Key|Access Token/i, 'x dispatch routes to the X publisher and reports missing creds');
  ok('dispatch routes channel=x to the X publisher');

  // 5. X credential errors park the job with needs_reconnect, not retry.
  const xRow = await jobRow(env, job.id);
  assert.equal(xRow.status, 'failed');
  assert.equal(xRow.needs_reconnect, 1, 'missing X credentials is a credential failure');
  ok('X credential failure raises needs_reconnect');

  // 6. isCredentialError recognises X-specific errors.
  const e401 = new Error('Token X không hợp lệ hoặc đã hết hạn (Unauthorized).');
  e401.x_status = 401;
  assert.equal(isCredentialError(e401), true, 'X 401 is a credential error');
  assert.equal(isCredentialError(Object.assign(new Error('Đã chạm giới hạn tần suất của X'), { x_status: 429 })), false, 'X 429 is retriable');
  ok('isCredentialError maps X 401/403 vs 429 correctly');
}

// ── Content adaptation per channel ─────────────────────────────────
async function testAdapter() {
  const project = { id: 'p1', publishing_url: 'https://seo.test/alpha', slug: 'alpha' };
  const article = {
    id: 'post1',
    slug: 'bai-viet-dau-tien',
    title: 'Bài viết đầu tiên về tối ưu chi phí bao bì cho doanh nghiệp vừa và nhỏ',
    meta_description: 'Hướng dẫn ngắn gọn giúp doanh nghiệp nhỏ chọn bao bì đúng chi phí, đúng chất lượng mà vẫn giữ được thương hiệu.',
    body_markdown: '# Tiêu đề\n\nNội dung dài hơn nhiều nằm ở đây, có cả [link](https://example.com) và **đậm**.\n\n## Hiệu năng\nTốc độ tải trang giúp tăng trải nghiệm.\n\n## Chi phí\nChọn gói phù hợp với quy mô doanh nghiệp.',
    hero_image_key: 'covers/abc.png',
    keywords: 'bao bi, chi phi, doanh nghiep',
  };

  // X: 280 weighted with URL=23.
  const x = adaptArticleForChannel('x', project, article, {});
  assert.ok(x.text.length > 0, 'x text built');
  assert.ok(x.link.includes('/blog/bai-viet-dau-tien'), 'x keeps the article link');
  // The tweet must fit the weighted budget.
  const urls = (x.text.match(/https?:\/\/[^\s<>"]+/gi) || []);
  const weighted = xWeightedLengthWithUrls(x.text);
  assert.ok(weighted <= 280, `x text fits 280 weighted chars (got ${weighted})`);
  assert.ok(urls.length >= 1, 'tweet carries the article link');
  ok('X payload fits the 280 weighted-char budget and keeps the link');

  // Threads: ≤500 chars.
  const th = adaptArticleForChannel('threads', project, article, {});
  assert.ok([...th.text].length <= 500, `threads text ≤ 500 chars (got ${[...th.text].length})`);
  assert.ok(th.text.includes('https://seo.test'), 'threads keeps the article link');
  ok('Threads payload fits the 500-char budget');

  // Instagram: photo kind + bio note, no clickable link in the caption.
  const ig = adaptArticleForChannel('instagram', project, article, {});
  assert.equal(ig.kind, 'photo');
  assert.equal(ig.media.length, 1);
  assert.ok(ig.media[0].includes('/image/covers/abc.png'), 'instagram uses the public hero URL');
  assert.ok(/bio/i.test(ig.text), 'instagram caption points at the bio for the link');
  ok('Instagram payload is a photo post with a bio pointer');

  // Instagram without a hero image is unsupported, not silently text.
  const igNoImg = adaptArticleForChannel('instagram', project, { ...article, hero_image_key: '' }, {});
  assert.equal(igNoImg.kind, 'unsupported');
  assert.ok(igNoImg.reason.length > 5, 'unsupported reason explains itself');
  ok('Instagram without a hero image reports unsupported with a reason');

  // Long Vietnamese meta description trims at word boundaries, no cut diacritics.
  const longDesc = 'Từ khoá quan trọng '.repeat(40).trim();
  const xLong = adaptArticleForChannel('x', project, { ...article, meta_description: longDesc }, {});
  assert.ok(!/\S…\S/.test(xLong.text.split('…')[0] || ''), 'trim does not cut inside a word before the ellipsis');
  assert.ok(xLong.text.endsWith('…') || xLong.text.includes('…') || xLong.text.length < 280, 'long lead is trimmed with an ellipsis or dropped');
  ok('X trim respects word boundaries on Vietnamese text');

  // Facebook uses the same professional copy builder as the live publisher.
  const fb = adaptArticleForChannel('facebook', project, article, {});
  assert.equal(fb.kind, 'link');
  assert.ok(fb.text.includes('\n• '), 'facebook message keeps a scannable highlight bullet');
  assert.match(fb.text, /Bước tiếp theo:/);
  assert.ok(fb.text.length <= 1800, 'facebook message stays within the safety cap');
  ok('Facebook payload uses professional structured copy');
}

// ── OAuth state with channel (4-part) + legacy acceptance ───────────
async function testChannelOAuthState() {
  const adminToken = 'test-admin-token-123';
  const st4 = await signState(adminToken, 'proj_x', 'threads');
  const v4 = await verifyState(adminToken, st4);
  assert.equal(v4?.projectId, 'proj_x');
  assert.equal(v4?.channel, 'threads');

  // Legacy 3-part state still verifies (as facebook).
  const nonce = 'deadbeefdeadbeef';
  const legacy = await (async () => {
    const payload = `proj_y.${nonce}`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(adminToken), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return `${payload}.${Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  })();
  const vLegacy = await verifyState(adminToken, legacy);
  assert.equal(vLegacy?.projectId, 'proj_y');
  assert.equal(vLegacy?.channel, 'facebook', 'legacy state reads as the facebook channel');

  // Forged state still rejected.
  assert.equal(await verifyState(adminToken, 'proj_z.threads.deadbeef.deadbeef'), null);
  ok('state carries the channel and legacy 3-part state still verifies');
}

// ── R. explainer video jobs ─────────────────────────────────────────
// An explainer is another per-post kind, so it rides the same queue with
// its own sentinel. Two failures here are invisible until production: if
// the ref helpers do not strip the new sentinel the job resolves to the
// wrong article (and the list shows an empty title), and if the claim does
// not list the kind the job sits `pending` forever. Neither throws.
async function testExplainerVideoJobs() {
  console.log('\nR. Explainer video jobs');
  const env = await freshEnv();
  const t = Math.floor(Date.now() / 1000);
  const ref = explainerRef(POST);

  // 1. The ref policy.
  assert.equal(postIdFromRef(ref), POST, 'postIdFromRef must strip the explainer sentinel');
  assert.equal(postIdFromRef(carouselRef(POST)), POST, 'and still strip the carousel one');
  assert.equal(postIdFromRef(`project:${PROJECT}`), null, 'a project sentinel has no post behind it');
  assert.match(postIdFromRefSql('v.blog_post_id'), /explainer:/, 'the SQL mirror knows the sentinel too');

  await env.DB.prepare(
    `INSERT INTO video_jobs (id, project_id, blog_post_id, slug, kind, status, attempts, created_at, updated_at)
     VALUES ('vj_explain', ?, ?, 'alpha-post', 'explainer', 'pending', 0, ?, ?)`
  ).bind(PROJECT, ref, t, t).run();

  // The list query joins through postIdFromRefSql — the sentinel must land
  // on the article, not on a row that does not exist.
  const joined = await env.__get(
    `SELECT p.title FROM video_jobs v JOIN blog_posts p
       ON p.id = ${postIdFromRefSql('v.blog_post_id')} WHERE v.id = 'vj_explain'`
  );
  assert.equal(joined?.title, 'Tiêu đề', 'an explainer job resolves back to its article');
  ok('the explainer sentinel resolves to its post in both JS and SQL');

  // 2. The create endpoint.
  const create = async (body, token) => createExplainerJob({
    env, request: adminReq('https://x/api/admin/video/explainer', token === undefined ? { body } : { body, token }),
  });
  assert.equal((await create({ project_id: PROJECT, slug: 'alpha-post' }, '')).status, 401,
    'creating an explainer needs the admin gate');
  assert.equal((await create({ project_id: PROJECT })).status, 400, 'a slug is required');
  assert.equal((await create({ project_id: PROJECT, slug: 'nope' })).status, 404, 'an unpublished slug is not found');
  assert.equal((await create({ project_id: PROJECT, slug: 'alpha-post' })).status, 409,
    'a second explainer for the same post while one is rendering is refused');
  ok('the explainer endpoint is admin-gated and refuses a duplicate while one is rendering');

  // 3. The claim. The kind is not business/website, so it comes through the
  // shared post queue — which is exactly the list that has to name it.
  const claimed = await (await claimVideoJob({
    env, request: adminReq('https://x/api/admin/video/claim', { body: { type: 'explainer' } }),
  })).json();
  assert.ok(claimed?.job, 'the queued explainer must be claimable');
  assert.equal(claimed.job.kind, 'explainer');
  assert.equal(claimed.job.slug, 'alpha-post');
  assert.equal(claimed.job.title, 'Tiêu đề', 'and it carries the article payload the plan needs');
  assert.ok('body_markdown' in claimed.job, 'including the body the visual plan is built from');
  assert.equal((await env.__get("SELECT status FROM video_jobs WHERE id = 'vj_explain'"))?.status, 'claimed');
  ok('a queued explainer is claimed with its article payload');

  // 4. Re-render: a finished explainer is replaced, not duplicated.
  await env.DB.prepare("UPDATE video_jobs SET status = 'done' WHERE id = 'vj_explain'").run();
  const again = await (await create({ project_id: PROJECT, slug: 'alpha-post' })).json();
  assert.equal(again.ok, true, 'a finished explainer can be re-rendered');
  assert.equal((await env.__get("SELECT COUNT(*) AS n FROM video_jobs WHERE kind = 'explainer'"))?.n, 1,
    're-rendering replaces the row instead of leaving two behind');
  const fresh = await env.__get("SELECT blog_post_id, status FROM video_jobs WHERE kind = 'explainer'");
  assert.equal(fresh.blog_post_id, ref, 'and the new row keeps the sentinel, so UNIQUE(blog_post_id) holds');
  assert.equal(fresh.status, 'pending');
  ok('re-creating a finished explainer replaces it and keeps the sentinel');
}

// ── T. user-chosen video templates ──────────────────────────────────
// The admin wizard picks a template + duration per job; the claim hands
// them to the agent. The contract that stays invisible until render time:
// functions/_lib/video_templates.js must carry the same ids as the
// agent's video-agent/templates.mjs — so the sync check reads the agent
// file's source and compares id sets.
async function testVideoTemplates() {
  console.log('\nT. Video job templates');
  const env = await freshEnv();
  env.IMAGES = fakeImages();

  const create = (body, token) => createVideoJob({
    env, request: adminReq('https://x/api/admin/video/create', token === undefined ? { body } : { body, token }),
  });

  // The gate and the validators run before any row is written.
  assert.equal((await create({ project_id: PROJECT, source: { type: 'post', slug: 'alpha-post' } }, '')).status, 401,
    'creating a video job needs the admin gate');
  assert.equal((await create({ project_id: PROJECT, source: { type: 'post', slug: 'alpha-post' }, template: 'nope' })).status, 400,
    'an unknown template id is rejected');
  const mismatch = await create({ project_id: PROJECT, source: { type: 'url', url: 'https://a.example' }, template: 'summary' });
  assert.equal(mismatch.status, 400);
  const mismatchBody = await mismatch.json();
  assert.equal(mismatchBody.error, 'template_source_mismatch',
    'a template that does not accept the source type is refused');
  ok('create rejects unknown templates and template/source mismatches');

  // A post job stores the chosen template and a clamped duration.
  const made = await (await create({
    project_id: PROJECT, source: { type: 'post', slug: 'alpha-post' }, template: 'story', duration: 999,
  })).json();
  assert.equal(made.ok, true);
  const row = await env.__get('SELECT kind, blog_post_id, template, duration FROM video_jobs WHERE id = ?', made.job_id);
  assert.equal(row.kind, 'post');
  assert.equal(row.blog_post_id, POST, 'a post job carries the real post id, not a sentinel');
  assert.equal(row.template, 'story');
  assert.equal(row.duration, 90, 'duration is clamped into the 15–90s band');
  assert.equal((await create({ project_id: PROJECT, source: { type: 'post', slug: 'alpha-post' } })).status, 409,
    'a second post job while one is in flight is refused');
  ok('a post job stores template + clamped duration and dedupes in flight');

  // 'auto'/absent stores NULL — the agent's engine picks at render time.
  const auto = await (await create({ project_id: OTHER, source: { type: 'post', slug: 'beta-post' }, template: 'auto' })).json();
  const autoRow = await env.__get('SELECT template, duration FROM video_jobs WHERE id = ?', auto.job_id);
  assert.equal(autoRow.template, null, "'auto' is stored as NULL");
  assert.equal(autoRow.duration, null, 'absent duration stays NULL');
  ok("'auto' and no duration land as NULL columns");

  // The claim hands the operator's choices to the agent — and the
  // presenter photo goes out absolute (the VPS cannot resolve '/image/').
  // The seeded post has no project_id; link it so the project payload
  // (which carries the presenter fields) is resolved.
  await env.DB.prepare('UPDATE blog_posts SET project_id = ? WHERE id = ?').bind(PROJECT, POST).run();
  await env.DB.prepare(
    `UPDATE projects SET presenter_name = 'Lan', presenter_image_url = '/image/project/x/presenter/p.png' WHERE id = ?`
  ).bind(PROJECT).run();
  const claimed = await (await claimVideoJob({
    env, request: adminReq('https://x/api/admin/video/claim', { body: { project_id: PROJECT } }),
  })).json();
  assert.ok(claimed?.job, 'the queued post job must be claimable');
  assert.equal(claimed.job.template, 'story');
  assert.equal(claimed.job.duration, 90);
  assert.equal(claimed.job.project.presenter_name, 'Lan');
  assert.equal(claimed.job.project.presenter_image_url, 'https://x/image/project/x/presenter/p.png',
    'presenter_image_url ships absolute for the off-platform agent');
  ok('claim returns template, duration and an absolute presenter_image_url');

  // The business/website claim path carries the same fields.
  await create({ project_id: PROJECT, source: { type: 'business' }, template: 'local', duration: 30 });
  const biz = await (await claimVideoJob({
    env, request: adminReq('https://x/api/admin/video/claim', { body: { type: 'business', project_id: PROJECT } }),
  })).json();
  assert.equal(biz?.job?.template, 'local');
  assert.equal(biz?.job?.duration, 30);
  assert.equal(biz?.job?.project?.presenter_image_url, 'https://x/image/project/x/presenter/p.png');
  ok('the business claim path carries template/duration/presenter too');

  // ── background music ──────────────────────────────────────────────
  // 'bgm' validates against the catalog like template does: an unknown
  // id is a 400 before any row exists, 'none' and track ids store.
  const badBgm = await create({ project_id: PROJECT, source: { type: 'post', slug: 'alpha-post' }, bgm: 'nope' });
  assert.equal(badBgm.status, 400);
  assert.equal((await badBgm.json()).error, 'unknown_bgm', 'a music id outside the catalog is refused');
  // And a user-supplied URL never passes for music — the catalog is the
  // allow-list, so no operator-controlled host reaches the renderer.
  assert.equal(
    (await create({ project_id: PROJECT, source: { type: 'post', slug: 'alpha-post' }, bgm: 'https://evil.example/x.mp3' })).status,
    400, 'a URL-shaped bgm is refused');
  ok('create validates bgm against the catalog (no arbitrary URLs)');

  // A catalog track stores its id and claims out as an absolute URL.
  const bizMusic = await (await create({ project_id: OTHER, source: { type: 'business' }, bgm: 'serene-view' })).json();
  assert.equal(bizMusic.ok, true);
  const bizMusicRow = await env.__get('SELECT bgm FROM video_jobs WHERE id = ?', bizMusic.job_id);
  assert.equal(bizMusicRow.bgm, 'serene-view', 'the catalog id lands on the job row');
  const bizMusicClaim = await (await claimVideoJob({
    env, request: adminReq('https://x/api/admin/video/claim', { body: { type: 'business', project_id: OTHER } }),
  })).json();
  assert.equal(bizMusicClaim?.job?.bgm, 'serene-view');
  assert.equal(bizMusicClaim?.job?.bgm_url, 'https://x/image/music/serene-view.mp3',
    'the track ships to the agent as an absolute /image/music/ URL');
  ok('a chosen track stores its id and claims out as an absolute URL');

  // 'none' is a real stored choice: the claim must carry the sentinel so
  // the agent knows to mute, not to fall back to the pad.
  const noMusic = await (await create({
    project_id: OTHER, source: { type: 'url', url: 'https://silent.example' }, bgm: 'none',
  })).json();
  const noMusicRow = await env.__get('SELECT bgm FROM video_jobs WHERE id = ?', noMusic.job_id);
  assert.equal(noMusicRow.bgm, 'none');
  const noMusicClaim = await (await claimVideoJob({
    env, request: adminReq('https://x/api/admin/video/claim', { body: { type: 'website', project_id: OTHER } }),
  })).json();
  assert.equal(noMusicClaim?.job?.bgm, 'none', "'none' survives the claim as a sentinel");
  assert.equal(noMusicClaim?.job?.bgm_url, null);
  // Absent bgm stays NULL = 'auto'; claim resolves it to a real free track
  // from the server-owned Mixkit catalog instead of a synthesised pad.
  const autoMusic = await (await create({
    project_id: OTHER, source: { type: 'url', url: 'https://auto.example' },
  })).json();
  const autoMusicRow = await env.__get('SELECT bgm FROM video_jobs WHERE id = ?', autoMusic.job_id);
  assert.equal(autoMusicRow.bgm, null, "absent bgm stores NULL = 'auto'");
  const autoMusicClaim = await (await claimVideoJob({
    env, request: adminReq('https://x/api/admin/video/claim', { body: { type: 'website', project_id: OTHER } }),
  })).json();
  assert.equal(autoMusicClaim?.job?.bgm, 'serene-view', 'auto resolves to a neutral catalog track');
  assert.equal(autoMusicClaim?.job?.bgm_url, 'https://x/image/music/serene-view.mp3',
    'auto music uses the same free file the wizard previews');
  const productMusic = await (await create({
    project_id: OTHER, template: 'product', source: { type: 'url', url: 'https://product.example' },
  })).json();
  const productClaim = await (await claimVideoJob({
    env, request: adminReq('https://x/api/admin/video/claim', { body: { type: 'website', project_id: OTHER } }),
  })).json();
  assert.equal(productClaim?.job?.id, productMusic.job_id, 'the product music row is the next claim');
  assert.equal(productClaim?.job?.bgm, 'deep-urban', 'template auto music follows the content style');
  ok("'none' stores mute; absent stores NULL and claims as a free catalog track");

  // The catalog endpoint serves all 12 ids and the presenter flag.
  const cat = await (await listVideoTemplates({
    env, request: adminReq(`https://x/api/admin/video/templates?project_id=${PROJECT}`),
  })).json();
  assert.equal(cat.ok, true);
  assert.equal(cat.templates.length, 12, 'the wizard offers the full frozen catalog');
  assert.equal(cat.hasPresenter, true, 'hasPresenter follows projects.presenter_image_url');
  ok('GET /api/admin/video/templates returns the catalog + hasPresenter');

  // The wizard's music picker is served by the same endpoint — each track
  // carries the streamable URL the preview player uses.
  assert.equal(cat.music.length, BGM_TRACKS.length, 'the catalog endpoint serves every track');
  assert.ok(cat.music.every((t) => t.url === `/image/music/${t.file}`),
    'each track carries its streamable preview URL');
  assert.equal(cat.musicLicense.attribution, false,
    'the catalog only lists music that needs no attribution');
  assert.equal(new Set(BGM_TRACKS.map((t) => t.id)).size, BGM_TRACKS.length, 'catalog ids are unique');
  assert.equal(new Set(BGM_TRACKS.map((t) => t.file)).size, BGM_TRACKS.length, 'catalog files are unique');
  ok('templates endpoint serves the music catalog + license metadata');

  // Presenter upload: bad mime is refused, a good image lands the column.
  const badMime = await uploadPresenter({
    env, request: adminReq('https://x/api/admin/video/presenter',
      { body: { project_id: PROJECT, filename: 'a.txt', content_type: 'text/plain', base64: 'aGk=' } }),
  });
  assert.equal(badMime.status, 400);
  assert.equal((await badMime.json()).error, 'unsupported_mime');
  const goodUp = await (await uploadPresenter({
    env, request: adminReq('https://x/api/admin/video/presenter',
      { body: { project_id: PROJECT, filename: 'p.png', content_type: 'image/png', base64: 'aGk=' } }),
  })).json();
  assert.equal(goodUp.ok, true);
  assert.match(goodUp.presenter_image_url, /^\/image\/project\/proj_test_a\/presenter\/.+\.png$/,
    'the stored path is the /image/ route of the R2 key');
  const stored = await env.__get('SELECT presenter_image_url FROM projects WHERE id = ?', PROJECT);
  assert.equal(stored.presenter_image_url, goodUp.presenter_image_url);
  ok('presenter upload rejects bad mime and stores the /image/ path');

  // The contract with the agent: same id set on both sides. The agent
  // file ships from a parallel change — when it is not present the
  // frozen 12 ids still pin the platform side.
  const frozenIds = ['auto', 'before_after', 'explainer', 'launch', 'listicle', 'local',
    'news_anchor', 'product', 'qa', 'review', 'story', 'summary'].sort();
  assert.deepEqual(VIDEO_TEMPLATES.map((t) => t.id).sort(), frozenIds,
    'the platform catalog carries exactly the 12 frozen ids');
  const agentTplPath = join(ROOT, 'video-agent', 'templates.mjs');
  if (existsSync(agentTplPath)) {
    const src = readFileSync(agentTplPath, 'utf8');
    const agentIds = [...src.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();
    assert.deepEqual(agentIds, frozenIds,
      'video-agent/templates.mjs and _lib/video_templates.js must expose the same ids');
    ok('platform catalog is in sync with video-agent/templates.mjs');
  } else {
    ok('platform catalog pinned to the 12 frozen ids (agent file not present yet)');
  }
  assert.equal(videoTemplateById('news_anchor').needsPresenter, true,
    'news_anchor is the presenter-gated template');
}

// ── S. programmatic SEO queue ───────────────────────────────────────
// The Prog page had no way to remove a keyword at all. Deleting must drop
// the QUEUE ROW and leave the page it produced: functions/p/[slug].js serves
// prog_pages, so that page is live content with a URL and a sitemap entry —
// removing it is a different, destructive decision the operator has not made.
async function testProgQueueDelete() {
  console.log('\nS. Programmatic SEO queue');
  const env = await freshEnv();
  const t = Math.floor(Date.now() / 1000);

  const addKeyword = (id, status, pageId = null) => env.DB.prepare(
    `INSERT INTO prog_keywords (id, project_id, keyword, canonical, score, priority, intent, status, page_id, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 70, 0, 'commercial', ?, ?, 0, ?, ?)`
  ).bind(id, PROJECT, `kw ${id}`, `kw-${id}`, status, pageId, t, t).run();

  await addKeyword('pk_done', 'done', 'pp_1');
  await addKeyword('pk_busy', 'processing');
  await env.DB.prepare(
    `INSERT INTO prog_pages (id, slug, keyword, title, meta_description, body_markdown, status, created_at, published_at)
     VALUES ('pp_1', 'thiet-ke-web', 'kw pk_done', 'T', 'D', '# B', 'published', ?, ?)`
  ).bind(t, t).run();

  const del = (query, token) => deleteProgKeyword({
    env, request: adminReq(`https://x/api/admin/prog/queue${query}`, token === undefined ? {} : { token }),
  });

  assert.equal((await del('?id=pk_done', '')).status, 401, 'deleting a keyword needs the admin gate');
  assert.equal((await del('')).status, 400, 'an id is required');
  assert.equal((await del('?id=nope')).status, 404, 'an unknown id is a 404');
  assert.equal((await del('?id=pk_busy')).status, 409,
    'a keyword the generator is holding right now is refused, not half-deleted');
  assert.ok(await env.__get("SELECT id FROM prog_keywords WHERE id='pk_busy'"), 'and it is still there');
  ok('the delete endpoint is gated, validates its input, and refuses a row in flight');

  const res = await (await del('?id=pk_done')).json();
  assert.equal(res.ok, true);
  assert.equal(res.page_slug, 'thiet-ke-web', 'the response names the page it left alone');
  assert.ok(!(await env.__get("SELECT id FROM prog_keywords WHERE id='pk_done'")), 'the queue row is gone');
  assert.ok(await env.__get("SELECT id FROM prog_pages WHERE id='pp_1'"),
    'the page the keyword produced is NOT deleted — it is live content');
  ok('deleting a keyword drops the queue row and keeps its page');
}

// The sitemap used to cap at 5.000 rows per query, so a site past that
// size lost half its URLs from the sitemap with no error anywhere. The
// fix chunks the urlset (?part=N) and lists every chunk in the index —
// this seeds past the 5.000 boundary and checks nothing is lost,
// duplicated, or silently dropped.
async function testSitemapChunking() {
  const env = createSqliteEnv();
  execSchema(env);
  const TOTAL = 5500;
  await env.__exec(`
    INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown, status, created_at, published_at)
    SELECT 'chunk' || value, 'chunk-post-' || value, 'Chunk post ' || value,
           'desc ' || value, 'body', 'published', value, value
    FROM (WITH RECURSIVE seq(value) AS (
      SELECT 1 UNION ALL SELECT value + 1 FROM seq WHERE value < ${TOTAL}
    ) SELECT value FROM seq);
  `);

  const index = await renderSitemapIndex({ env, request: new Request('https://seo.test/sitemap.xml'), params: {} });
  const indexXml = await index.text();
  const chunkUrls = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => u.includes('sitemap-pages'));

  const expectedChunks = Math.ceil(TOTAL / 5000);
  assert.equal(chunkUrls.length, expectedChunks,
    `the index lists every chunk (${TOTAL} URLs -> ${expectedChunks} chunk(s))`);
  ok('the sitemap index lists one urlset per chunk');

  const seen = new Set();
  let fetched = 0;
  for (let i = 0; i < chunkUrls.length; i++) {
    const res = await renderSitemapPages({ env, request: new Request(chunkUrls[i]), params: {} });
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.ok(locs.length <= 5000, `chunk ${i + 1} stays under the 5.000 URL ceiling`);
    for (const loc of locs) {
      assert.equal(seen.has(loc), false, `no URL appears in two chunks: ${loc}`);
      seen.add(loc);
    }
    fetched += locs.length;
  }
  // The urlset also carries /, /blog, /hubs and the paginated
  // /blog/page/N listings, so the post count is what matters here.
  const postUrls = [...seen].filter((u) => /\/blog\/chunk-post-\d+$/.test(u));
  assert.equal(postUrls.length, TOTAL, 'every published post appears across the chunks');
  ok('a 5.500-post archive is fully covered by the chunked sitemap');
}
async function main() {
  console.log('--- Platform tests (migrations · queue · carousel · publishing · cron · aliases · attention · insights · onboarding · signup · cost · providers · lockdown · dispatch · report · mail · email-policy · cover) ---');
  await testSitemapChunking();
  await testMigrations();
  await testMultiChannel();
  await testAdapter();
  await testChannelOAuthState();
  await testQueue();
  await testHelpers();
  await testFacebookPageRecovery();
  await testCronRouting();
  await testAliasScoping();
  await testAttentionAndActivation();
  await testEventsAndInsights();
  await testOnboarding();
  await testRegistrationAndProfile();
  await testRequestCost();
  await testProviderDispatch();
  await testProviderConfigLockdown();
  await testSingleDispatch();
  await testPublishReport();
  await testEmailSending();
  await testEmailPolicy();
  await testCarouselVideoJobs();
  await testThreadsPublishFromVideoAndCarousel();
  await testExplainerVideoJobs();
  await testVideoTemplates();
  await testProgQueueDelete();
  await testCoverSpecFallback();
  console.log(`\nALL PLATFORM TESTS PASSED (${passed} checks)`);
}

main().catch((err) => {
  console.error('\n✗ TEST FAILED');
  console.error(err?.stack || err);
  process.exit(1);
});

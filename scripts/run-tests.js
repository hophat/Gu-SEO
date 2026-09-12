import assert from 'node:assert/strict';
import { createMockEnv } from './mock-env.js';
import { seedProjects, GULAGI_PROJECT, GUROUTER_PROJECT } from './seed-projects.js';
import { getProject, listProjects } from '../functions/_lib/projects.js';
import { pickNextProjectTopic, listProjectTopics } from '../functions/_lib/project_topics.js';
import { dispatchPublication } from '../functions/_lib/publishing/publisher.js';

async function runTests() {
  console.log('--- Starting Multi-Project AI Content Platform Tests ---');
  const env = createMockEnv();

  // Test 1: Seed Projects
  console.log('1. Seeding Gulagi and GuRouter projects...');
  const { gulagi, gurouter } = await seedProjects(env);
  assert.equal(gulagi.slug, 'gulagi');
  assert.equal(gurouter.slug, 'gurouter');
  assert.equal(gulagi.brand.business_type, GULAGI_PROJECT.brand.business_type);
  assert.equal(gurouter.brand.business_type, GUROUTER_PROJECT.brand.business_type);
  console.log('✓ Seeding verified.');

  // Test 2: Project Retrieval & Isolation
  console.log('2. Verifying Project Isolation...');
  const projGulagi = await getProject(env, 'gulagi');
  const projGuRouter = await getProject(env, 'gurouter');
  assert.ok(projGulagi);
  assert.ok(projGuRouter);
  assert.notEqual(projGulagi.id, projGuRouter.id);
  assert.equal(projGulagi.publishing_url, 'https://docs.gulagi.com');
  assert.equal(projGuRouter.publishing_url, 'https://blogs.gurouter.com');
  assert.equal(projGulagi.publishing_config.publisher_type, 'custom_api');
  assert.equal(projGuRouter.publishing_config.publisher_type, 'webhook');
  console.log('✓ Project isolation verified.');

  // Test 3: Topic Engine Isolation
  console.log('3. Verifying Topic Engine per-project scoping...');
  const gulagiTopics = await listProjectTopics(env, projGulagi.id);
  const gurouterTopics = await listProjectTopics(env, projGuRouter.id);
  assert.equal(gulagiTopics.length, 3);
  assert.equal(gurouterTopics.length, 3);
  assert.match(gulagiTopics[0].key, /Google Maps|website|marketing/i);
  assert.match(gurouterTopics[0].key, /Multi-Agent|AI Gateway|DeepSeek/i);

  const picked1 = await pickNextProjectTopic(env, projGulagi);
  assert.ok(picked1);
  assert.equal(picked1.key, gulagiTopics[0].key);
  console.log('✓ Topic Engine isolation verified.');

  // Test 4: Publishing Abstraction
  console.log('4. Verifying Publisher Abstraction...');
  const dummyArticle = {
    id: 'art_test_123',
    slug: 'test-article',
    title: 'Test Article Title',
    meta_description: 'Test Meta Description',
    body_markdown: '# Hello World\nContent here...',
    hero_image_key: 'hero-123.webp',
    keywords: 'seo, test',
    published_at: Math.floor(Date.now() / 1000),
  };

  // Internal D1 fallback
  const d1Result = await dispatchPublication({
    project: { ...projGulagi, publishing_config: { publisher_type: 'internal_d1' } },
    article: dummyArticle,
    env,
  });
  assert.equal(d1Result.ok, true);
  assert.equal(d1Result.type, 'internal_d1');
  assert.match(d1Result.published_url, /test-article/);
  console.log('✓ Publisher Abstraction verified.');

  // Test 5: AI Run Logging Simulation
  console.log('5. Verifying AI Run Logging...');
  const runId = 'run_test_001';
  await env.DB.prepare(
    `INSERT INTO ai_runs (id, project_id, task_type, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, duration_ms, status, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(runId, projGulagi.id, 'article', 'workers-ai', '@cf/meta/llama-3.3-70b-instruct', 1200, 2400, 3600, 0, 4500, 'success', null, Math.floor(Date.now() / 1000)).run();

  const loggedRun = env.tables.ai_runs.get(runId);
  assert.ok(loggedRun);
  assert.equal(loggedRun.project_id, projGulagi.id);
  assert.equal(loggedRun.total_tokens, 3600);
  console.log('✓ AI Run Logging verified.');

  console.log('6. Verifying Scoped Brand DNA, Calendar, and Blog Admin APIs...');
  const { onRequestGet: getBrandDna, onRequestPut: putBrandDna } = await import('../functions/api/admin/brand-dna.js');
  const { onRequestGet: getCalendar, onRequestPost: postCalendar } = await import('../functions/api/admin/calendar/index.js');
  const { onRequestGet: getBlogList } = await import('../functions/api/admin/blog/list.js');
  const { onRequestGet: getBlogJobs } = await import('../functions/api/admin/blog/jobs.js');

  env.ADMIN_TOKEN = 'test-admin-token-123';
  const makeReq = (url, opts = {}) => ({
    url,
    headers: new Map([
      ['Authorization', 'Bearer test-admin-token-123'],
      ...(opts.headers ? Object.entries(opts.headers) : []),
    ]),
    clone() { return this; },
    json: async () => opts.body || {},
    ...opts,
  });

  const wrapReq = (req) => ({
    ...req,
    headers: {
      get: (h) => {
        for (const [k, v] of req.headers.entries()) {
          if (k.toLowerCase() === h.toLowerCase()) return v;
        }
        return null;
      }
    }
  });

  const reqGulagiBrand = wrapReq(makeReq('https://example.com/api/admin/brand-dna?project_id=' + projGulagi.id));
  const resGulagiBrand = await getBrandDna({ env, request: reqGulagiBrand });
  const dataGulagiBrand = await resGulagiBrand.json();
  assert.equal(resGulagiBrand.status, 200);
  assert.equal(dataGulagiBrand.ok, true);
  assert.equal(dataGulagiBrand.project_id, projGulagi.id);
  assert.equal(dataGulagiBrand.brand.business_type, GULAGI_PROJECT.brand.business_type);

  const reqGuRouterPut = wrapReq(makeReq('https://example.com/api/admin/brand-dna?project_id=' + projGuRouter.id, {
    method: 'PUT',
    body: {
      business_type: 'GuRouter Updated Tech Stack',
      voice_tone: 'Authoritative, technical',
      target_audience: 'Engineers and CTOs',
      skip_auto_plan: true,
    }
  }));
  const resGuRouterPut = await putBrandDna({ env, request: reqGuRouterPut, waitUntil: () => {} });
  assert.equal(resGuRouterPut.status, 200);
  const updatedBrand = env.tables.project_brands.get(projGuRouter.id);
  assert.equal(updatedBrand.business_type, 'GuRouter Updated Tech Stack');
  assert.equal(updatedBrand.tone, 'Authoritative, technical');

  const reqCalPost = wrapReq(makeReq('https://example.com/api/admin/calendar?project_id=' + projGulagi.id, {
    method: 'POST',
    body: {
      scheduled_for: '2026-09-15',
      title: 'Gulagi Local SEO Tactics',
      primary_keyword: 'local seo',
    }
  }));
  const resCalPost = await postCalendar({ env, request: reqCalPost });
  const dataCalPost = await resCalPost.json();
  assert.equal(resCalPost.status, 200);
  assert.equal(dataCalPost.project_id, projGulagi.id);

  const reqCalGet = wrapReq(makeReq('https://example.com/api/admin/calendar?project_id=' + projGulagi.id));
  const resCalGet = await getCalendar({ env, request: reqCalGet });
  const dataCalGet = await resCalGet.json();
  assert.equal(resCalGet.status, 200);
  assert.equal(dataCalGet.project_id, projGulagi.id);
  assert.ok(dataCalGet.slots.length > 0);

  const reqBlogList = wrapReq(makeReq('https://example.com/api/admin/blog/list?project_id=' + projGulagi.id));
  const resBlogList = await getBlogList({ env, request: reqBlogList });
  const dataBlogList = await resBlogList.json();
  assert.equal(resBlogList.status, 200);
  assert.equal(dataBlogList.project_id, projGulagi.id);

  const reqBlogJobs = wrapReq(makeReq('https://example.com/api/admin/blog/jobs?project_id=' + projGulagi.id));
  const resBlogJobs = await getBlogJobs({ env, request: reqBlogJobs });
  const dataBlogJobs = await resBlogJobs.json();
  assert.equal(resBlogJobs.status, 200);
  assert.equal(dataBlogJobs.project_id, projGulagi.id);
  console.log('✓ Scoped Brand DNA, Calendar, and Blog Admin APIs verified.');

  // Test 7: Shared-host /<slug>/ routing + path-prefix isolation.
  console.log('7. Verifying /<slug>/ routing and path-prefix isolation...');
  const { resolveProjectByHost, resolveProjectBySlug, publicBaseFor } = await import('../functions/_lib/project_scope.js');
  const { upsertProject } = await import('../functions/_lib/projects.js');

  const usas = await upsertProject(env, {
    slug: 'usasglobal', name: 'USaS Global',
    website_url: 'https://usasglobal.edu.vn',
    publishing_url: 'https://seo.gulagi.com/usasglobal',
  });

  // A shared host must serve the root project at / and the named project
  // under its prefix — neither may shadow the other.
  assert.equal((await resolveProjectByHost(env, 'seo.gulagi.com', '/blog'))?.slug, 'gulagi');
  assert.equal((await resolveProjectByHost(env, 'seo.gulagi.com', '/usasglobal/blog'))?.slug, 'usasglobal');
  assert.equal((await resolveProjectByHost(env, 'usasglobal.edu.vn', '/blog'))?.slug, 'usasglobal');
  assert.equal(await resolveProjectBySlug(env, 'nope'), null);

  // Public base must carry the path prefix, or IndexNow/GSC get a 404 URL.
  assert.equal(
    await publicBaseFor(env, usas.id, makeReq('https://seo.gulagi.com/api/admin/blog/publish')),
    'https://seo.gulagi.com/usasglobal'
  );
  assert.equal(
    await publicBaseFor(env, projGulagi.id, makeReq('https://gu-seo.pages.dev/api/admin/blog/publish')),
    'https://docs.gulagi.com'
  );

  // Every [project] route must load and export a handler — catches the
  // relative-import depth mistakes that otherwise only fail at deploy.
  for (const route of [
    '../functions/[project]/blog/index.js',
    '../functions/[project]/blog/page/[page].js',
    '../functions/[project]/blog/[slug].js',
    '../functions/[project]/p/[slug].js',
    '../functions/[project]/feed.xml.js',
    '../functions/[project]/sitemap.xml.js',
    '../functions/[project]/sitemap-pages.xml.js',
  ]) {
    const mod = await import(route);
    assert.equal(typeof mod.onRequestGet, 'function', route + ' must export onRequestGet');
  }
  console.log('✓ Shared-host routing, isolation, and route wiring verified.');

  // Test 8: cron fan-out runs the pipeline once per active project.
  console.log('8. Verifying cron fan-out across projects...');
  const { onRequestPost: cronTick } = await import('../functions/api/admin/cron/tick.js');
  const realFetch = globalThis.fetch;
  const calls = [];
  const jsonRes = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (u, init) => {
    const url = String(u);
    const payload = init?.body ? JSON.parse(init.body) : {};
    calls.push({ url, payload });
    if (url.endsWith('/blog/start')) return jsonRes({ ok: true, job_id: 'job_' + payload.project_id });
    return jsonRes({ ok: true, blog_post_id: 'post_' + (payload.job_id || '') });
  };

  let tickRes;
  try {
    tickRes = await cronTick({
      request: wrapReq(makeReq('https://seo.gulagi.com/api/admin/cron/tick', { body: { task: 'blog' } })),
      env,
    });
  } finally {
    globalThis.fetch = realFetch;
  }
  const tickBody = await tickRes.json();
  assert.equal(tickRes.status, 200);
  assert.equal(tickBody.task, 'blog');
  assert.equal(tickBody.projects_processed, 3);

  const starts = calls.filter((c) => c.url.endsWith('/blog/start'));
  assert.equal(starts.length, 3, 'expected one blog start per active project');
  const startedIds = starts.map((s) => s.payload.project_id).sort();
  assert.deepEqual(startedIds, [GULAGI_PROJECT.id, GUROUTER_PROJECT.id, usas.id].sort());
  assert.equal(calls.filter((c) => c.url.endsWith('/blog/publish')).length, 3);
  console.log('✓ Cron fan-out runs once per project, each with its own project_id.');

  console.log('\nALL TESTS PASSED SUCCESSFULLY! (8/8)');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

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

  console.log('\nALL TESTS PASSED SUCCESSFULLY! (5/5)');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

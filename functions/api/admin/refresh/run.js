import { json, newId, nowSec, slugify, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { generateContent } from '../../../_lib/ai.js';
import { sanitiseMarkdownLinks } from '../../../_lib/links/sanitise.js';
import { buildAliasMap } from '../../../_lib/links/aliases.js';
import { injectInternalLinks, loadLinkTargets } from '../../../_lib/internal_links.js';
import { loadSettings } from '../../../_lib/settings.js';
import { checkBudget } from '../../../_lib/usage.js';
import { pingIndexNow } from '../../../_lib/indexnow.js';
import { onPublish as gscOnPublish } from '../../../_lib/google_indexing.js';
import { syncSitemapAliases } from '../../../_lib/links/aliases.js';
import { storeEmbedding } from '../../../_lib/dedup.js';
import { scorePost } from '../../../_lib/quality.js';
import { publicBaseFor } from '../../../_lib/project_scope.js';

const WEEKLY_CAP = 2;

async function weeklyRefreshCount(env, projectId) {
  const since = nowSec() - 7 * 86400;
  const row = projectId
    ? await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM refresh_jobs r JOIN blog_posts p ON p.id = r.post_id
          WHERE r.status = 'published' AND r.created_at > ? AND (p.project_id = ? OR p.project_id IS NULL)`
      ).bind(since, projectId).first().catch(() => ({ n: 0 }))
    : await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM refresh_jobs WHERE status = 'published' AND created_at > ?`
      ).bind(since).first().catch(() => ({ n: 0 }));
  return row?.n || 0;
}

export const onRequestPost = async ({ request, env, waitUntil }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  if (!env?.DB) return json(500, { error: 'no_db' });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  let jobId = String(body?.job_id || '');
  let post;
  if (jobId) {
    const job = await env.DB.prepare('SELECT * FROM refresh_jobs WHERE id = ? LIMIT 1').bind(jobId).first();
    if (!job) return json(404, { error: 'job_not_found' });
    if (job.status === 'published') return json(200, { ok: true, status: 'published', idempotent: true });
    post = await env.DB.prepare('SELECT * FROM blog_posts WHERE id = ? LIMIT 1').bind(job.post_id).first();
    if (!post) return json(404, { error: 'post_not_found' });
  } else {
    const postId = String(body?.post_id || '');
    if (!postId) return json(400, { error: 'missing_job_or_post_id' });
    post = await env.DB.prepare('SELECT * FROM blog_posts WHERE id = ? LIMIT 1').bind(postId).first();
    if (!post) return json(404, { error: 'post_not_found' });
    jobId = newId();
    const t = nowSec();
    await env.DB.prepare(
      `INSERT INTO refresh_jobs (id, post_id, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, 'created', ?, ?)`
    ).bind(jobId, post.id, String(body?.reason || 'manual'), t, t).run();
  }

  const failJob = async (msg) => {
    await env.DB.prepare(
      `UPDATE refresh_jobs SET status='failed', error=?, updated_at=? WHERE id=?`
    ).bind(String(msg).slice(0, 500), nowSec(), jobId).run().catch(() => {});
  };

  if ((await weeklyRefreshCount(env, post.project_id || null)) >= WEEKLY_CAP) {
    return json(429, { error: 'refresh_cap_reached', detail: `Max ${WEEKLY_CAP} refreshes per 7 days per project.` });
  }

  const source = request.headers.get('X-Source-Cron') === '1' ? 'cron-refresh' : 'admin-refresh';
  if (source === 'cron-refresh' && !body.allow_over_budget) {
    const b = await checkBudget(env, source);
    if (!b.allowed) {
      await failJob('budget_exceeded');
      return json(429, { error: 'budget_exceeded', month_spend_usd: b.spend, budget_usd: b.budget, pct: b.pct });
    }
  }

  const aliases = await buildAliasMap(env);
  const settings = await loadSettings(env);

  let out;
  try {
    out = await generateContent(env, {
      kind: 'article',
      seed: `Rewrite, expand and update this article for 2026. Keep the same topic and search intent, fix outdated facts, add concrete examples with numbers, keep Vietnamese natural and expert. Original title: "${post.title}". Primary keyword hint: "${post.topic_seed || post.slug}".\n\nOriginal body (rewrite from this, do not copy verbatim):\n${String(post.body_markdown || '').slice(0, 6000)}`,
      provider: body.provider || settings.default_ai_provider || undefined,
      source,
      projectId: post.project_id || null,
      brand: {
        name: settings.site_name || 'this site',
        url: settings.site_url || '/',
        cta: settings.site_cta,
        tone: settings.brand_voice_tone || settings.site_tone || undefined,
        audience: settings.brand_target_audience || settings.site_audience || undefined,
        business_type: settings.brand_business_type || undefined,
        key_themes: settings.brand_key_themes || undefined,
        topics_to_avoid: settings.brand_topics_to_avoid || undefined,
        service_area: settings.brand_service_area || undefined,
        aliases,
      },
    });
  } catch (e) {
    const msg = String(e.message || e).slice(0, 800);
    await failJob('text:' + msg);
    return json(502, { error: 'refresh_generation_failed', detail: msg });
  }

  out.body_markdown = sanitiseMarkdownLinks(out.body_markdown, { aliases });
  if (out.title) {
    const cleaned = String(out.title).replace(/^Blog(?:\s*[:\-]\s*|(?=[A-Z]))/, '');
    if (cleaned !== out.title) { out.title = cleaned; out.slug = slugify(cleaned); }
  }

  const verdict = scorePost({
    title: out.title || post.title,
    body_markdown: out.body_markdown,
    meta_description: out.meta_description || post.meta_description,
    slug: out.slug || post.slug,
  });
  if (verdict.band === 'bad' && !body.force) {
    await failJob(`quality:${verdict.score}`);
    return json(502, { error: 'refresh_quality_too_low', quality: verdict });
  }

  let newSlug = post.slug;
  if (out.slug && out.slug !== post.slug) {
    const clash = await env.DB.prepare('SELECT 1 FROM blog_posts WHERE slug = ? LIMIT 1').bind(out.slug).first().catch(() => null);
    if (!clash) {
      newSlug = out.slug;
      await env.DB.prepare(
        `INSERT OR IGNORE INTO blog_post_redirects (old_slug, new_slug, created_at) VALUES (?, ?, ?)`
      ).bind(post.slug, newSlug, nowSec()).run().catch(() => {});
    }
  }

  try {
    const pillarRow = post.topic_seed ? await env.DB.prepare(
      `SELECT pillar_key FROM content_clusters WHERE cluster_key = ? AND status = 'active' LIMIT 1`
    ).bind(String(post.topic_seed).slice(0, 120)).first().catch(() => null) : null;
    const targets = await loadLinkTargets(env, newSlug, { limit: 80, pillarKey: pillarRow?.pillar_key || null, projectId: post.project_id || null });
    if (targets.length) {
      const { body: linkedBody } = injectInternalLinks(out.body_markdown, newSlug, targets);
      out.body_markdown = linkedBody;
    }
  } catch { /* non-fatal */ }

  const t = nowSec();
  await env.DB.prepare(
    `UPDATE blog_posts SET title = ?, meta_description = ?, body_markdown = ?, keywords = ?,
       slug = ?, last_refresh_at = ?, refresh_count = COALESCE(refresh_count, 0) + 1 WHERE id = ?`
  ).bind(
    out.title || post.title, out.meta_description || post.meta_description,
    out.body_markdown, out.keywords || post.keywords, newSlug, t, post.id
  ).run();
  await env.DB.prepare(
    `UPDATE refresh_jobs SET status='published', updated_at=? WHERE id=?`
  ).bind(t, jobId).run();

  const base = await publicBaseFor(env, post.project_id || null, request);
  const blogHost = new URL(base).hostname;
  const newUrls = [`${base}/blog`, `${base}/blog/${newSlug}`];
  waitUntil(pingIndexNow(env, newUrls, request, blogHost).catch(() => {}));
  waitUntil(gscOnPublish(env, newUrls).catch(() => {}));
  waitUntil(syncSitemapAliases(env).catch(() => {}));
  waitUntil(storeEmbedding(env, newSlug, {
    title: out.title || post.title,
    body_markdown: out.body_markdown,
    meta_description: out.meta_description || post.meta_description,
  }).catch(() => {}));

  audit(env, source.startsWith('cron') ? 'cron' : 'admin', 'refresh_run', post.id, {
    job_id: jobId, slug: newSlug, quality: { score: verdict.score, band: verdict.band },
  });
  return json(200, { ok: true, status: 'published', post_id: post.id, slug: newSlug, renamed: newSlug !== post.slug, quality: verdict });
};

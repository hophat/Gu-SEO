import { json, newId, nowSec } from '../../_lib/util.js';
import { requireAdminAsync, resolveTenantContext } from '../../_lib/auth.js';
import { generateContent } from '../../_lib/ai.js';
import { getProject } from '../../_lib/projects.js';

export const onRequestGet = async ({ env, request }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });
  if (!env?.DB) return json(500, { error: 'no_db' });

  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;
  const sql = pid
    ? `SELECT * FROM trend_topics WHERE project_id = ? ORDER BY created_at DESC LIMIT 20`
    : `SELECT * FROM trend_topics ORDER BY created_at DESC LIMIT 20`;
  const stmt = pid ? env.DB.prepare(sql).bind(pid) : env.DB.prepare(sql);
  const { results } = await stmt.all().catch(() => ({ results: [] }));
  return json(200, { ok: true, project_id: pid, topics: results || [] });
};

export const onRequestPost = async ({ env, request }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });
  if (!env?.DB) return json(500, { error: 'no_db' });

  const tenant = await resolveTenantContext(env, request, auth);
  if (!tenant?.activeProjectId) return json(400, { error: 'missing_or_invalid_project' });

  const project = await getProject(env, tenant.activeProjectId);
  if (!project) return json(404, { error: 'project_not_found' });

  const prompt = `You are a trend analyst for ${project?.name || 'this brand'} in ${project?.brand?.service_area || 'Vietnam'}.
Identify 5 trending topics this week that:
1. Relate to: ${project?.brand?.key_themes || 'local business, shop, website, SEO, marketing'}
2. Are likely searched by: ${project?.brand?.audience || 'local shop owners'}
3. Have commercial potential for this brand

Return STRICT JSON array of objects: [{"topic":"...","relevance_score":80,"source":"analysis"}]
Write ALL topic titles in the project's content language (${project?.language || 'vi'}). Score 0-100.`;

  let trendResult;
  try {
    trendResult = await generateContent(env, {
      kind: 'article',
      seed: prompt,
      brand: project?.brand,
      source: 'admin-trend',
    });
  } catch (err) {
    return json(500, { error: 'trend_generation_failed', detail: err.message });
  }

  const text = trendResult?.body_markdown || trendResult?.text || '';
  const match = text.match(/\[[\s\S]*\]/);
  let items = [];
  try { items = JSON.parse(match?.[0] || '[]'); } catch { items = []; }

  if (!items.length && (trendResult?.keywords || trendResult?.title)) {
    const kwList = (trendResult.keywords || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (trendResult.title) kwList.unshift(trendResult.title);
    items = kwList.slice(0, 5).map((topic) => ({ topic, relevance_score: 80, source: 'ai' }));
  }

  let saved = 0;
  for (const item of items) {
    if (item.topic) {
      await env.DB.prepare(
        `INSERT INTO trend_topics (id, project_id, topic, source, relevance_score, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`
      ).bind(newId(), project.id, item.topic, item.source || 'ai', item.relevance_score || 80, nowSec()).run().catch(() => {});
      saved++;
    }
  }

  return json(200, { ok: true, project_id: project.id, generated: saved });
};

import { json, newId, nowSec } from '../../_lib/util.js';
import { adminGate } from '../../_lib/auth.js';
import { generateContent } from '../../_lib/ai.js';
import { getProject } from '../../_lib/projects.js';

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  if (!env?.DB) return json(500, { error: 'no_db' });
  const { results } = await env.DB.prepare(
    `SELECT * FROM trend_topics ORDER BY created_at DESC LIMIT 20`
  ).all().catch(() => ({ results: [] }));
  return json(200, { ok: true, topics: results });
};

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  if (!env?.DB) return json(500, { error: 'no_db' });

  let body = {};
  try { body = await request.json(); } catch {}
  const projectSlug = body?.project || 'gulagi';
  const project = await getProject(env, projectSlug);

  const prompt = `You are a trend analyst for ${project?.name || 'Gulagi'} in ${project?.brand?.service_area || 'Vietnam'}.
Identify 5 trending topics this week that:
1. Relate to: ${project?.brand?.key_themes || 'local business, shop, website, SEO, marketing'}
2. Are likely searched by: ${project?.brand?.audience || 'local shop owners'}
3. Have commercial potential for creating a website via Gulagi

Return STRICT JSON array of objects: [{"topic":"...","relevance_score":80,"source":"analysis"}]
Write ALL topic titles in Vietnamese. Score 0-100.`;

  let trendResult;
  try {
    trendResult = await generateContent({ env, project, taskType: 'trend', prompt, temperature: 0.7 });
  } catch (err) {
    return json(500, { error: 'trend_generation_failed', detail: err.message });
  }

  const text = trendResult?.text || '';
  const match = text.match(/\[[\s\S]*\]/);
  let items = [];
  try { items = JSON.parse(match?.[0] || '[]'); } catch { items = []; }

  let saved = 0;
  for (const item of items) {
    if (item.topic) {
      await env.DB.prepare(
        `INSERT INTO trend_topics (id, topic, source, relevance_score, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`
      ).bind(newId(), item.topic, item.source || 'ai', item.relevance_score || 80, nowSec()).run().catch(() => {});
      saved++;
    }
  }

  return json(200, { ok: true, generated: saved });
};

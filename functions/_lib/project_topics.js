import { newId, nowSec } from './util.js';
import { generateContent } from './ai/provider.js';

export async function listProjectTopics(env, projectId, { status = 'candidate', limit = 50 } = {}) {
  if (!env?.DB) return [];
  const stmt = status === 'all'
    ? env.DB.prepare(`SELECT * FROM project_topics WHERE project_id = ? ORDER BY relevance_score DESC, created_at DESC LIMIT ?`).bind(projectId, limit)
    : env.DB.prepare(`SELECT * FROM project_topics WHERE project_id = ? AND status = ? ORDER BY relevance_score DESC, created_at DESC LIMIT ?`).bind(projectId, status, limit);

  const { results } = await stmt.all().catch(() => ({ results: [] }));
  return results || [];
}

export async function addProjectTopic(env, {
  projectId,
  key,
  angle,
  category = 'general',
  source = 'manual',
  relevanceScore = 85,
  businessValueScore = 85,
}) {
  if (!env?.DB || !projectId || !key) return null;
  const id = newId();
  const t = nowSec();

  await env.DB.prepare(
    `INSERT INTO project_topics (id, project_id, key, angle, category, source, relevance_score, business_value_score, status, times_used, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'candidate', 0, ?, ?)`
  ).bind(
    id,
    projectId,
    key.trim(),
    (angle || key).trim(),
    category,
    source,
    relevanceScore,
    businessValueScore,
    t,
    t
  ).run();

  return { id, project_id: projectId, key, angle, category, relevance_score: relevanceScore };
}

export async function pickNextProjectTopic(env, project) {
  if (!env?.DB || !project?.id) return null;
  const t = nowSec();

  const candidate = await env.DB.prepare(
    `SELECT * FROM project_topics
     WHERE project_id = ? AND status = 'candidate'
     ORDER BY relevance_score DESC, created_at ASC
     LIMIT 1`
  ).bind(project.id).first().catch(() => null);

  if (candidate) {
    await env.DB.prepare(
      `UPDATE project_topics SET status = 'selected', times_used = times_used + 1, last_used_at = ?, updated_at = ? WHERE id = ?`
    ).bind(t, t, candidate.id).run().catch(() => {});

    return {
      id: candidate.id,
      key: candidate.key,
      angle: candidate.angle,
      category: candidate.category,
    };
  }

  const generated = await generateAutonomousTopics(env, project, { count: 3 });
  if (generated && generated.length > 0) {
    const first = generated[0];
    await env.DB.prepare(
      `UPDATE project_topics SET status = 'selected', times_used = times_used + 1, last_used_at = ?, updated_at = ? WHERE id = ?`
    ).bind(t, t, first.id).run().catch(() => {});
    return first;
  }

  return {
    key: `${project.name} Best Practices & Insights`,
    angle: `Practical strategies and actionable insights for ${project.brand?.audience || 'professionals'}`,
    category: 'general',
  };
}

export async function generateAutonomousTopics(env, project, { count = 5 } = {}) {
  const brand = project.brand || {};
  const prompt = `You are an expert SEO content strategist.
Generate ${count} high-intent, unique blog post topic candidates for this brand:
Brand: ${project.name} (${project.website_url || ''})
Business Type: ${brand.business_type || 'Technology/Business'}
Target Audience: ${brand.audience || 'Business owners and developers'}
Key Themes: ${brand.key_themes || 'Digital transformation, efficiency, technology'}
Language: ${project.language || 'vi'}

Return ONLY a strict JSON array of objects with keys:
"key": Target SEO keyword/phrase
"angle": Compelling article angle/hook
"category": Category name
"relevance_score": Integer 70-100
"business_value_score": Integer 70-100

JSON Output:`;

  let response;
  try {
    response = await generateContent({
      env,
      project,
      taskType: 'topic',
      prompt,
      temperature: 0.8,
    });
  } catch (err) {
    return [];
  }

  const text = response?.text || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  let items = [];
  try {
    items = JSON.parse(match[0]);
  } catch {
    return [];
  }

  const created = [];
  for (const item of items) {
    if (item.key && item.angle) {
      const row = await addProjectTopic(env, {
        projectId: project.id,
        key: item.key,
        angle: item.angle,
        category: item.category || 'general',
        source: 'ai',
        relevanceScore: item.relevance_score || 80,
        businessValueScore: item.business_value_score || 80,
      });
      if (row) created.push(row);
    }
  }

  return created;
}

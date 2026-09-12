import { newId, nowSec, slugify } from './util.js';
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

  try {
    const ranked = await scoreProjectTopics(env, project);
    const top = ranked[0];
    if (top) {
      await env.DB.prepare(
        `UPDATE project_topics SET status = 'selected', times_used = times_used + 1, last_used_at = ?, updated_at = ? WHERE id = ?`
      ).bind(t, t, top.id).run().catch(() => {});
      return { id: top.id, key: top.key, angle: top.angle, category: top.category };
    }
  } catch {}

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

const COMMERCIAL_CUES = [
  'mua', 'giá', 'báo giá', 'bảng giá', 'dịch vụ', 'tốt nhất', 'top',
  'review', 'đánh giá', 'hướng dẫn', 'cách', 'kinh nghiệm', 'so sánh',
  'buy', 'price', 'pricing', 'best', 'review', 'how to', 'guide',
];

export function classifyIntent(key) {
  const k = String(key || '').toLowerCase();
  if (/(mua|giá|báo giá|bảng giá|thuê|đặt|buy|price|pricing|order|book)/.test(k)) return 'transactional';
  if (/(tốt nhất|top|so sánh|review|đánh giá|vs\.?|best|compare)/.test(k)) return 'commercial';
  return 'informational';
}

function intentFit(key) {
  const k = String(key || '').toLowerCase();
  return COMMERCIAL_CUES.some((c) => k.includes(c)) ? 90 : 70;
}

function freshnessFor(createdAt, now) {
  const ageDays = Math.max(0, (now - (createdAt || now)) / 86400);
  return Math.max(20, Math.round(100 - ageDays * 2));
}

function competitionFor(key, snapshots) {
  const k = String(key || '').toLowerCase();
  const words = k.split(/\s+/).filter((w) => w.length > 3);
  const hits = (snapshots || []).filter((s) => {
    const sk = String(s.keyword || '').toLowerCase();
    return sk && (sk.includes(k.slice(0, 24)) || words.some((w) => sk.includes(w)));
  });
  if (!hits.length) return 50;
  const avgWords = hits.reduce((a, s) => a + (s.avg_words || 0), 0) / hits.length;
  return Math.min(95, Math.max(40, Math.round(50 + avgWords / 100)));
}

export function finalScore(topic, snapshots, now) {
  const relevance = topic.relevance_score ?? 80;
  const business = topic.business_value_score ?? 80;
  const freshness = freshnessFor(topic.created_at, now);
  const competition = competitionFor(topic.key, snapshots);
  const intent = intentFit(topic.key);
  const final = Math.round(
    0.3 * relevance + 0.25 * business + 0.2 * freshness + 0.15 * (100 - competition) + 0.1 * intent
  );
  return { relevance, business, freshness, competition, intent, final };
}

export async function ensurePillars(env, project) {
  const existing = await env.DB.prepare(
    `SELECT pillar_key FROM content_clusters WHERE project_id = ? AND status = 'active' GROUP BY pillar_key`
  ).bind(project.id).all().catch(() => ({ results: [] }));
  if ((existing?.results || []).length >= 3) return existing.results.map((r) => r.pillar_key);

  const themes = String(project.brand?.key_themes || '')
    .split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const pillars = themes.length ? themes.map((t) => slugify(t).slice(0, 60) || 'general') : ['general'];
  const t = nowSec();
  for (const p of [...new Set(pillars)]) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO content_clusters (id, project_id, pillar_key, cluster_key, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`
    ).bind(newId(), project.id, p, p, t, t).run().catch(() => {});
  }
  return [...new Set(pillars)];
}

export async function scoreProjectTopics(env, project) {
  if (!env?.DB || !project?.id) return [];
  const t = nowSec();
  const pillars = await ensurePillars(env, project).catch(() => ['general']);

  const { results } = await env.DB.prepare(
    `SELECT * FROM project_topics WHERE project_id = ? AND status = 'candidate' ORDER BY created_at ASC LIMIT 100`
  ).bind(project.id).all().catch(() => ({ results: [] }));
  const candidates = results || [];
  if (!candidates.length) return [];

  const snapRows = await env.DB.prepare(
    `SELECT keyword, AVG(word_count) AS avg_words FROM competitor_snapshots
      WHERE project_id = ? AND created_at > ? GROUP BY keyword`
  ).bind(project.id, t - 7 * 86400).all().catch(() => ({ results: [] }));
  const snapshots = snapRows?.results || [];

  const ranked = [];
  for (const c of candidates) {
    const s = finalScore(c, snapshots, t);
    const intent = classifyIntent(c.key);
    if (s.final < 60) {
      await env.DB.prepare(
        `UPDATE project_topics SET status = 'archived', competition_score = ?, freshness_score = ?, search_intent = ?, updated_at = ? WHERE id = ?`
      ).bind(s.competition, s.freshness, intent, t, c.id).run().catch(() => {});
      continue;
    }
    await env.DB.prepare(
      `UPDATE project_topics SET competition_score = ?, freshness_score = ?, search_intent = ?, updated_at = ? WHERE id = ?`
    ).bind(s.competition, s.freshness, intent, t, c.id).run().catch(() => {});

    const pillar = pillars.includes(slugify(c.category || '').slice(0, 60)) ? slugify(c.category).slice(0, 60) : pillars[0];
    await env.DB.prepare(
      `INSERT OR IGNORE INTO content_clusters (id, project_id, pillar_key, cluster_key, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`
    ).bind(newId(), project.id, pillar, c.key.slice(0, 120), t, t).run().catch(() => {});

    ranked.push({ id: c.id, key: c.key, angle: c.angle, category: c.category, pillar, intent, ...s });
  }

  ranked.sort((a, b) => b.final - a.final);
  return ranked;
}

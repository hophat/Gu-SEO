import { json } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';

export const onRequestGet = async ({ request, env }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  if (!env?.DB) return json(500, { error: 'no_db' });
  const url = new URL(request.url);
  const projectId = (url.searchParams.get('project_id') || '').trim();
  const keyword = (url.searchParams.get('keyword') || '').trim().slice(0, 200);

  if (!projectId) {
    const rows = await env.DB.prepare(
      `SELECT project_id, keyword, competitor_url, title, word_count, h2_count, link_count, created_at
         FROM competitor_snapshots ORDER BY created_at DESC LIMIT 20`
    ).all().catch(() => ({ results: [] }));
    return json(200, { ok: true, snapshots: rows?.results || [] });
  }

  const rows = keyword
    ? await env.DB.prepare(
        `SELECT competitor_url, title, word_count, h2_count, link_count, created_at
           FROM competitor_snapshots WHERE project_id = ? AND keyword = ?
           ORDER BY created_at DESC LIMIT 20`
      ).bind(projectId, keyword).all().catch(() => ({ results: [] }))
    : await env.DB.prepare(
        `SELECT keyword, competitor_url, title, word_count, h2_count, link_count, created_at
           FROM competitor_snapshots WHERE project_id = ?
           ORDER BY created_at DESC LIMIT 20`
      ).bind(projectId).all().catch(() => ({ results: [] }));

  return json(200, { ok: true, snapshots: rows?.results || [] });
};

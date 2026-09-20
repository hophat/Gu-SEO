// Create a website promo video job (Phase A upsell). The agent
// screenshots the URL's pages, scrapes its text for the storyboard and
// renders a ~30s promo. One website job per URL at a time.
import { json, nowSec, newId, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const projectId = String(body?.project_id || '');
  const rawUrl = String(body?.url || '').trim();
  if (!projectId) return json(400, { error: 'missing_project_id' });

  let url;
  try { url = new URL(rawUrl); } catch { return json(400, { error: 'bad_url', hint: 'URL phải là http(s)://...' }); }
  if (!/^https?:$/.test(url.protocol)) return json(400, { error: 'bad_scheme' });

  const project = await env.DB.prepare(
    'SELECT id, slug, name FROM projects WHERE id = ? LIMIT 1'
  ).bind(projectId).first();
  if (!project) return json(404, { error: 'project_not_found' });

  const sentinel = `url:${url.href}`;
  const existing = await env.DB.prepare(
    `SELECT id, status FROM video_jobs WHERE kind = 'website' AND blog_post_id = ? ORDER BY updated_at DESC LIMIT 1`
  ).bind(sentinel).first();
  if (existing && ['pending', 'claimed', 'rendering'].includes(existing.status)) {
    return json(409, { error: 'already_rendering', job_id: existing.id });
  }
  // A finished promo is re-renderable at will: drop the old done row so
  // the new pending job does not trip the UNIQUE index.
  if (existing && existing.status === 'done') {
    await env.DB.prepare('DELETE FROM video_jobs WHERE id = ?').bind(existing.id).run().catch(() => {});
  }

  const id = newId();
  const t = nowSec();
  await env.DB.prepare(
    `INSERT INTO video_jobs (id, project_id, blog_post_id, slug, kind, status, source_url, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'website', 'pending', ?, 0, ?, ?)`
  ).bind(id, projectId, sentinel, project.slug, url.href, t, t).run();

  audit(env, 'admin', 'video.website_create', projectId, { job_id: id, url: url.href });
  return json(200, { ok: true, job_id: id, url: url.href, hint: 'Agent sẽ chụp trang, viết storyboard và render trong chu kỳ 5 phút tới.' });
};

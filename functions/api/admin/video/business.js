// Create a business promo video job (AI Video Post). The agent claims
// it on its next tick, pulls the brand kit (accent/tagline/address/
// phone + Brand DNA) and renders the 16s storyboard. One business job
// per project at a time — re-creating replaces a finished one.
import { json, audit } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { parseTemplateParam, clampVideoDuration } from '../../../_lib/video_templates.js';

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const projectId = String(body?.project_id || '');
  if (!projectId) return json(400, { error: 'missing_project_id' });

  const project = await env.DB.prepare(
    'SELECT id, slug, name FROM projects WHERE id = ? LIMIT 1'
  ).bind(projectId).first();
  if (!project) return json(404, { error: 'project_not_found' });

  const existing = await env.DB.prepare(
    `SELECT id, status FROM video_jobs
      WHERE kind = 'business' AND blog_post_id = ? ORDER BY updated_at DESC LIMIT 1`
  ).bind(`project:${projectId}`).first();
  if (existing && ['pending', 'claimed', 'rendering'].includes(existing.status)) {
    return json(409, { error: 'already_rendering', job_id: existing.id });
  }

  // A finished promo is re-renderable at will: drop the old done row so
  // the agent's claim (INSERT with the project sentinel) succeeds.
  if (existing && existing.status === 'done') {
    await env.DB.prepare('DELETE FROM video_jobs WHERE id = ?').bind(existing.id).run().catch(() => {});
  }

  const tpl = parseTemplateParam(body?.template);
  if (!tpl.ok) return json(400, { error: 'unknown_template' });
  const duration = clampVideoDuration(body?.duration);

  const id = crypto.randomUUID().replace(/-/g, '');
  const t = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO video_jobs (id, project_id, blog_post_id, slug, kind, status, template, duration, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'business', 'pending', ?, ?, 0, ?, ?)`
  ).bind(id, projectId, `project:${projectId}`, project.slug, tpl.template, duration, t, t).run();

  audit(env, 'admin', 'video.business_create', projectId, { job_id: id });
  return json(200, { ok: true, job_id: id, hint: 'Agent sẽ nhận và render trong chu kỳ 15 phút tới.' });
};

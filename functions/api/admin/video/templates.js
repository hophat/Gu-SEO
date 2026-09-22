// GET /api/admin/video/templates?project_id=…
//
// The create-video wizard's catalog: which templates exist, which source
// types each accepts, and whether the project already has a presenter
// photo (needsPresenter templates stay disabled without one). The list
// itself is static — functions/_lib/video_templates.js mirrors the
// agent's video-agent/templates.mjs.
import { json } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { VIDEO_TEMPLATES } from '../../../_lib/video_templates.js';

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const url = new URL(request.url);
  const projectId = url.searchParams.get('project_id') || null;
  if (!projectId) return json(400, { error: 'missing_project_id' });

  const row = await env.DB.prepare(
    'SELECT presenter_image_url FROM projects WHERE id = ? LIMIT 1'
  ).bind(projectId).first().catch(() => null);
  if (!row) return json(404, { error: 'project_not_found' });

  return json(200, {
    ok: true,
    templates: VIDEO_TEMPLATES,
    hasPresenter: !!String(row.presenter_image_url || '').trim(),
  });
};

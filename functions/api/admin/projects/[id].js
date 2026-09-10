import { json } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { getProject, upsertProject } from '../../../_lib/projects.js';

export const onRequestGet = async ({ request, env, params }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const idOrSlug = params.id;
  const project = await getProject(env, idOrSlug);
  if (!project) return json(404, { error: 'project_not_found' });
  return json(200, { ok: true, project });
};

export const onRequestPut = async ({ request, env, params }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  body.id = params.id;
  try {
    const project = await upsertProject(env, body);
    return json(200, { ok: true, project });
  } catch (err) {
    return json(500, { error: err.message || 'failed_to_update_project' });
  }
};

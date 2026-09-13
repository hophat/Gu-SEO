import { json } from '../../_lib/util.js';
import { requireSuperAdmin } from '../../_lib/auth.js';
import { listProjects, upsertProject } from '../../_lib/projects.js';

export const onRequestGet = async ({ request, env }) => {
  const gate = await requireSuperAdmin(env, request); if (gate.error) return gate.error;
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'all';

  const projects = await listProjects(env, { status });
  return json(200, { ok: true, projects });
};

export const onRequestPost = async ({ request, env }) => {
  const gate = await requireSuperAdmin(env, request); if (gate.error) return gate.error;
  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  if (!body.slug || !body.name) {
    return json(400, { error: 'missing_required_fields', hint: 'slug and name are required' });
  }

  try {
    const project = await upsertProject(env, body);
    return json(200, { ok: true, project });
  } catch (err) {
    return json(500, { error: err.message || 'failed_to_save_project' });
  }
};

import { json } from '../../../_lib/util.js';
import { requireSuperAdmin } from '../../../_lib/auth.js';
import { getProject, upsertProject } from '../../../_lib/projects.js';

export const onRequestGet = async ({ request, env, params }) => {
  const gate = await requireSuperAdmin(env, request); if (gate.error) return gate.error;
  const idOrSlug = params.id;
  const project = await getProject(env, idOrSlug);
  if (!project) return json(404, { error: 'project_not_found' });
  return json(200, { ok: true, project });
};

export const onRequestPut = async ({ request, env, params }) => {
  const gate = await requireSuperAdmin(env, request); if (gate.error) return gate.error;
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

export const onRequestDelete = async ({ request, env, params }) => {
  const gate = await requireSuperAdmin(env, request); if (gate.error) return gate.error;
  const idOrSlug = params.id;
  
  // Protect core seed projects from accidental deletion
  const protectedSlugs = ['gulagi', 'gurouter'];
  
  const project = await env.DB.prepare('SELECT id, slug FROM projects WHERE id = ? OR slug = ? LIMIT 1').bind(idOrSlug, idOrSlug).first();
  if (!project) return json(404, { error: 'project_not_found' });
  
  if (protectedSlugs.includes(project.slug)) {
    return json(400, { error: 'protected_project', detail: 'Không thể xóa dự án hệ thống cốt lõi' });
  }

  // Delete project related data
  await env.DB.prepare('DELETE FROM project_brands WHERE project_id = ?').bind(project.id).run().catch(() => {});
  await env.DB.prepare('DELETE FROM project_ai_configs WHERE project_id = ?').bind(project.id).run().catch(() => {});
  await env.DB.prepare('DELETE FROM project_publishing_configs WHERE project_id = ?').bind(project.id).run().catch(() => {});
  await env.DB.prepare('DELETE FROM project_schedules WHERE project_id = ?').bind(project.id).run().catch(() => {});
  await env.DB.prepare('DELETE FROM project_topics WHERE project_id = ?').bind(project.id).run().catch(() => {});
  await env.DB.prepare('DELETE FROM blog_embeds WHERE project_id = ?').bind(project.id).run().catch(() => {});
  await env.DB.prepare('DELETE FROM content_calendar WHERE project_id = ?').bind(project.id).run().catch(() => {});
  await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(project.id).run();

  return json(200, { ok: true, deleted_id: project.id });
};

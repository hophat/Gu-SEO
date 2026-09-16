import { json, audit } from '../../../_lib/util.js';
import { requireSuperAdmin } from '../../../_lib/auth.js';
import { getProject, upsertProject } from '../../../_lib/projects.js';
import { clearNotice } from '../../../_lib/notices.js';
import { cfCreds, resolveCfProject, detachDomain } from '../../../_lib/cloudflare_domains.js';

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
  
  const project = await env.DB.prepare('SELECT id, slug, custom_domain FROM projects WHERE id = ? OR slug = ? LIMIT 1').bind(idOrSlug, idOrSlug).first();
  if (!project) return json(404, { error: 'project_not_found' });

  // Seed dự án core được bảo vệ khỏi xóa nhầm: super_admin phải gõ
  // đúng slug qua ?confirm=<slug> mới xóa được.
  if (protectedSlugs.includes(project.slug)) {
    let confirm = '';
    try { confirm = String(new URL(request.url).searchParams.get('confirm') || '').trim().toLowerCase(); } catch {}
    if (confirm !== project.slug) {
      return json(400, {
        error: 'protected_project',
        detail: 'Dự án hệ thống cốt lõi. Để xóa, gọi lại kèm ?confirm=<slug>.',
        confirm_required: project.slug,
      });
    }
  }

  // Gỡ custom domain live khỏi Cloudflare nếu không project nào khác dùng.
  const liveDomain = project.custom_domain ? String(project.custom_domain).trim().toLowerCase() : null;
  if (liveDomain) {
    const stillUsed = await env.DB.prepare(
      `SELECT id FROM projects WHERE custom_domain = ? AND id != ? LIMIT 1`
    ).bind(liveDomain, project.id).first().catch(() => null);
    if (!stillUsed) {
      const creds = cfCreds(env);
      const cfProject = creds ? await resolveCfProject(creds, request).catch(() => null) : null;
      if (cfProject) await detachDomain(creds, cfProject, liveDomain).catch(() => {});
    }
  }

  // Gỡ user kẹt khỏi dự án bị xóa để tài khoản không trỏ vào project đã mất.
  await env.DB.prepare('UPDATE users SET project_id = NULL WHERE project_id = ?').bind(project.id).run().catch(() => {});
  await clearNotice(env, `domain_request:${project.id}`).catch(() => {});

  // Delete project related data
  await env.DB.prepare('DELETE FROM project_brands WHERE project_id = ?').bind(project.id).run().catch(() => {});
  await env.DB.prepare('DELETE FROM project_ai_configs WHERE project_id = ?').bind(project.id).run().catch(() => {});
  await env.DB.prepare('DELETE FROM project_publishing_configs WHERE project_id = ?').bind(project.id).run().catch(() => {});
  await env.DB.prepare('DELETE FROM project_schedules WHERE project_id = ?').bind(project.id).run().catch(() => {});
  await env.DB.prepare('DELETE FROM project_topics WHERE project_id = ?').bind(project.id).run().catch(() => {});
  await env.DB.prepare('DELETE FROM blog_embeds WHERE project_id = ?').bind(project.id).run().catch(() => {});
  await env.DB.prepare('DELETE FROM content_calendar WHERE project_id = ?').bind(project.id).run().catch(() => {});
  await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(project.id).run();

  audit(env, gate.auth?.email || 'admin', 'project_delete', project.id, { slug: project.slug });
  return json(200, { ok: true, deleted_id: project.id });
};

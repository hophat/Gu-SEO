// GET /api/admin/projects/domain
//   Trả về thông tin custom domain của active project
// POST /api/admin/projects/domain
//   Body: { custom_domain, project_id? }
//   Cập nhật custom domain cho project
import { json, nowSec, audit } from '../../../_lib/util.js';
import { requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';
import { normalizeCustomDomain } from '../../../_lib/projects.js';

const CNAME_TARGET = 'gu-seo.pages.dev';

export const onRequestGet = async ({ env, request }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });

  const tenant = await resolveTenantContext(env, request, auth);
  if (!tenant || !tenant.activeProjectId) {
    return json(400, { error: 'missing_or_invalid_project' });
  }

  const project = await env.DB.prepare(
    `SELECT id, slug, publishing_url, custom_domain FROM projects WHERE id = ? LIMIT 1`
  ).bind(tenant.activeProjectId).first().catch(() => null);

  if (!project) return json(404, { error: 'project_not_found' });

  return json(200, {
    ok: true,
    custom_domain: project.custom_domain ? normalizeCustomDomain(project.custom_domain) : null,
    slug: project.slug,
    publishing_url: project.publishing_url,
    cname_target: CNAME_TARGET,
  });
};

export const onRequestPost = async ({ env, request }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const isSuperAdmin = auth.via === 'bearer' || auth.role === 'super_admin';
  let targetProjectId = null;

  if (isSuperAdmin && body?.project_id) {
    const p = await env.DB.prepare(
      `SELECT id FROM projects WHERE id = ? OR slug = ? LIMIT 1`
    ).bind(body.project_id, body.project_id).first().catch(() => null);
    if (!p) return json(404, { error: 'project_not_found' });
    targetProjectId = p.id;
  } else {
    const tenant = await resolveTenantContext(env, request, auth);
    if (!tenant || !tenant.activeProjectId) {
      return json(400, { error: 'missing_or_invalid_project' });
    }
    targetProjectId = tenant.activeProjectId;
  }

  const rawDomain = body?.custom_domain;
  const customDomain = rawDomain ? normalizeCustomDomain(rawDomain) : null;

  if (customDomain) {
    const existing = await env.DB.prepare(
      `SELECT id, slug FROM projects WHERE custom_domain = ? AND id != ? LIMIT 1`
    ).bind(customDomain, targetProjectId).first().catch(() => null);

    if (existing) {
      return json(409, {
        error: 'domain_conflict',
        detail: `Tên miền ${customDomain} đã được sử dụng bởi dự án ${existing.slug}`,
      });
    }
  }

  const t = nowSec();
  await env.DB.prepare(
    `UPDATE projects SET custom_domain = ?, updated_at = ? WHERE id = ?`
  ).bind(customDomain, t, targetProjectId).run();

  audit(env, auth.email || 'admin', 'project_update_custom_domain', targetProjectId, {
    custom_domain: customDomain,
  });

  return json(200, {
    ok: true,
    custom_domain: customDomain,
    public_url: customDomain ? `https://${customDomain}` : null,
  });
};

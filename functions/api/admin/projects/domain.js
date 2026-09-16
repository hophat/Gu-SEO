// GET /api/admin/projects/domain
//   Thông tin custom domain của active project: live + yêu cầu đang chờ
// POST /api/admin/projects/domain
//   Body: { custom_domain, project_id? }
//   Tạo YÊU CẦU chờ duyệt, không gắn ngay. Admin duyệt ở page Duyệt domain,
//   lúc đó hostname mới được gắn lên Cloudflare và flip thành live.
//   Xóa (custom_domain rỗng): hủy yêu cầu đang chờ; nếu đang live thì gỡ
//   ngay (dọn dẹp của chính tenant, không cần duyệt).
import { json, nowSec, audit } from '../../../_lib/util.js';
import { requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';
import { normalizeCustomDomain } from '../../../_lib/projects.js';
import { recordNotice, clearNotice } from '../../../_lib/notices.js';
import { pagesHost, cfAttachStatus, cfCreds, resolveCfProject, detachDomain } from '../../../_lib/cloudflare_domains.js';

export const onRequestGet = async ({ env, request }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });

  const tenant = await resolveTenantContext(env, request, auth);
  if (!tenant || !tenant.activeProjectId) {
    return json(400, { error: 'missing_or_invalid_project' });
  }

  const project = await env.DB.prepare(
    `SELECT id, slug, publishing_url, custom_domain, pending_custom_domain,
            custom_domain_status, pending_requested_at
       FROM projects WHERE id = ? LIMIT 1`
  ).bind(tenant.activeProjectId).first().catch(() => null);

  if (!project) return json(404, { error: 'project_not_found' });

  const normalized = project.custom_domain ? normalizeCustomDomain(project.custom_domain) : null;
  const cf = await cfAttachStatus(env, request, normalized);
  const pending = project.pending_custom_domain ? normalizeCustomDomain(project.pending_custom_domain) : null;

  return json(200, {
    ok: true,
    custom_domain: normalized,
    pending_custom_domain: pending,
    custom_domain_status: project.custom_domain_status || null,
    pending_requested_at: project.pending_requested_at || null,
    slug: project.slug,
    publishing_url: project.publishing_url,
    cname_target: pagesHost(env),
    cf_managed: cf.managed,
    cf_attached: cf.attached,
    cf_status: cf.status || null,
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
  const t = nowSec();

  // Xóa: hủy yêu cầu đang chờ; live thì gỡ ngay.
  if (!customDomain) {
    const prev = await env.DB.prepare(
      `SELECT custom_domain, pending_custom_domain FROM projects WHERE id = ? LIMIT 1`
    ).bind(targetProjectId).first().catch(() => null);
    await env.DB.prepare(
      `UPDATE projects
          SET pending_custom_domain = NULL, custom_domain_status = NULL,
              pending_requested_at = NULL, updated_at = ?
        WHERE id = ?`
    ).bind(t, targetProjectId).run().catch(() => null);

    let detached = null;
    const liveDomain = prev?.custom_domain ? normalizeCustomDomain(prev.custom_domain) : null;
    if (liveDomain) {
      await env.DB.prepare(
        `UPDATE projects SET custom_domain = ?, updated_at = ? WHERE id = ?`
      ).bind(null, t, targetProjectId).run().catch(() => null);
      const creds = cfCreds(env);
      const cfProject = creds ? await resolveCfProject(creds, request) : null;
      if (cfProject) {
        const stillUsed = await env.DB.prepare(
          `SELECT id FROM projects WHERE custom_domain = ? LIMIT 1`
        ).bind(liveDomain).first().catch(() => null);
        if (!stillUsed) detached = await detachDomain(creds, cfProject, liveDomain);
      }
    }
    audit(env, auth.email || 'admin', 'project_domain_remove', targetProjectId, { live_domain: liveDomain });
    return json(200, { ok: true, custom_domain: null, cf_detached: detached });
  }

  // Trùng live ở project khác, hoặc đang chờ duyệt ở project khác.
  const clash = await env.DB.prepare(
    `SELECT id, slug FROM projects
      WHERE (custom_domain = ? OR pending_custom_domain = ?) AND id != ?
      LIMIT 1`
  ).bind(customDomain, customDomain, targetProjectId).first().catch(() => null);
  if (clash) {
    return json(409, {
      error: 'domain_conflict',
      detail: `Tên miền ${customDomain} đã được sử dụng hoặc đang chờ duyệt bởi dự án ${clash.slug}`,
    });
  }

  await env.DB.prepare(
    `UPDATE projects
        SET pending_custom_domain = ?, custom_domain_status = 'pending',
            pending_requested_at = ?, updated_at = ?
      WHERE id = ?`
  ).bind(customDomain, t, t, targetProjectId).run();

  audit(env, auth.email || 'admin', 'project_domain_request', targetProjectId, {
    pending_custom_domain: customDomain,
  });
  recordNotice(env, {
    kind: `domain_request:${targetProjectId}`,
    severity: 'info',
    title: `Duyệt tên miền ${customDomain}`,
    detail: 'Một dự án vừa gửi yêu cầu custom domain. Duyệt để tự gắn lên Cloudflare.',
    action_url: '/admin#domains',
    action_label: 'Mở Duyệt domain',
  });

  return json(200, {
    ok: true,
    pending_custom_domain: customDomain,
    custom_domain_status: 'pending',
    cname_target: pagesHost(env),
    detail: 'Đã gửi yêu cầu. Vui lòng đợi admin duyệt — domain sẽ chạy sau khi được duyệt.',
  });
};

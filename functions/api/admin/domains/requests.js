// GET /api/admin/domains/requests
//   Hàng chờ duyệt custom domain (mọi project). super_admin only.
// POST /api/admin/domains/requests
//   Body: { project_id, action: 'approve' | 'reject' }
//   approve: gắn hostname lên Cloudflare bằng key global rồi flip live.
//     Lỗi CF thì giữ nguyên pending để admin sửa rồi duyệt lại.
//   reject: hủy yêu cầu. super_admin only.
import { json, nowSec, audit } from '../../../_lib/util.js';
import { requireSuperAdmin } from '../../../_lib/auth.js';
import { normalizeCustomDomain } from '../../../_lib/projects.js';
import { clearNotice } from '../../../_lib/notices.js';
import { cfCreds, resolveCfProject, attachDomain } from '../../../_lib/cloudflare_domains.js';

export const onRequestGet = async ({ env, request }) => {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;

  const { results } = await env.DB.prepare(
    `SELECT id, slug, name, custom_domain, pending_custom_domain,
            custom_domain_status, pending_requested_at, updated_at
       FROM projects
      WHERE pending_custom_domain IS NOT NULL
      ORDER BY pending_requested_at ASC`
  ).all().catch(() => ({ results: [] }));

  return json(200, {
    ok: true,
    requests: (results || []).map((p) => ({
      project_id: p.id,
      project_slug: p.slug,
      project_name: p.name,
      pending_custom_domain: p.pending_custom_domain ? normalizeCustomDomain(p.pending_custom_domain) : null,
      live_custom_domain: p.custom_domain ? normalizeCustomDomain(p.custom_domain) : null,
      status: p.custom_domain_status || 'pending',
      requested_at: p.pending_requested_at || null,
    })),
  });
};

export const onRequestPost = async ({ env, request }) => {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const action = String(body?.action || '').trim().toLowerCase();
  if (!['approve', 'reject'].includes(action)) return json(400, { error: 'invalid_action' });

  const pid = String(body?.project_id || '').trim();
  if (!pid) return json(400, { error: 'missing_project' });

  const project = await env.DB.prepare(
    `SELECT id, slug, custom_domain, pending_custom_domain, custom_domain_status
       FROM projects WHERE id = ? OR slug = ? LIMIT 1`
  ).bind(pid, pid).first().catch(() => null);
  if (!project) return json(404, { error: 'project_not_found' });

  const pending = project.pending_custom_domain ? normalizeCustomDomain(project.pending_custom_domain) : null;
  if (!pending) return json(409, { error: 'no_pending_request' });

  const t = nowSec();
  const actor = gate.auth?.email || 'admin';

  if (action === 'reject') {
    await env.DB.prepare(
      `UPDATE projects
          SET pending_custom_domain = NULL, custom_domain_status = 'rejected',
              pending_requested_at = NULL, updated_at = ?
        WHERE id = ?`
    ).bind(t, project.id).run();
    await clearNotice(env, `domain_request:${project.id}`);
    audit(env, actor, 'project_domain_reject', project.id, { pending_custom_domain: pending });
    return json(200, { ok: true, action: 'reject', project_id: project.id });
  }

  // Trùng live ở project khác kể từ lúc gửi yêu cầu.
  const clash = await env.DB.prepare(
    `SELECT id, slug FROM projects WHERE custom_domain = ? AND id != ? LIMIT 1`
  ).bind(pending, project.id).first().catch(() => null);
  if (clash) {
    return json(409, {
      error: 'domain_conflict',
      detail: `Tên miền ${pending} đã live ở dự án ${clash.slug} trong lúc chờ duyệt.`,
    });
  }

  const creds = cfCreds(env);
  if (!creds) {
    return json(503, {
      error: 'missing_cf_secrets',
      detail: 'Thiếu credentials Cloudflare (CF_API_TOKEN/CF_ACCOUNT_ID hoặc CLOUDFLARE_*). Không gắn được — yêu cầu vẫn giữ pending.',
    });
  }
  const cfProject = await resolveCfProject(creds, request);
  if (!cfProject) {
    return json(503, {
      error: 'cf_project_unresolved',
      detail: 'Đã có credentials Cloudflare nhưng không xác định được Pages project (CF_PROJECT chưa set và không suy ra được từ hostname). Không gắn được — yêu cầu vẫn giữ pending.',
    });
  }

  const r = await attachDomain(creds, cfProject, pending);
  if (!r.attached) {
    console.warn('domain_attach_failed', { project: cfProject, hostname: pending, error: r.error || 'unknown' });
    return json(502, {
      error: 'cf_attach_failed',
      detail: `Cloudflare từ chối gắn ${pending}: ${r.error || 'lỗi không rõ'}. Yêu cầu vẫn giữ pending.`,
    });
  }

  await env.DB.prepare(
    `UPDATE projects
        SET custom_domain = ?, custom_domain_status = 'live',
            pending_custom_domain = NULL, pending_requested_at = NULL,
            updated_at = ?
      WHERE id = ?`
  ).bind(pending, t, project.id).run();
  await clearNotice(env, `domain_request:${project.id}`);
  audit(env, actor, 'project_domain_approve', project.id, {
    custom_domain: pending,
    cf_status: r.status || null,
  });

  return json(200, {
    ok: true,
    action: 'approve',
    project_id: project.id,
    custom_domain: pending,
    public_url: `https://${pending}`,
    cf_status: r.status || null,
  });
};

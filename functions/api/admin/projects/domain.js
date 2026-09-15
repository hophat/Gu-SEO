// GET /api/admin/projects/domain
//   Trả về thông tin custom domain của active project
// POST /api/admin/projects/domain
//   Body: { custom_domain, project_id? }
//   Cập nhật custom domain cho project
//
// Ghi D1 là nguồn chân lý cho routing, nhưng chỉ ghi D1 thì domain vẫn
// không chạy — hostname còn phải được gắn vào Pages project trên
// Cloudflare. Endpoint này tự gắn/gỡ qua CF API khi site có đủ secrets
// self-repair (CF_API_TOKEN/CF_ACCOUNT_ID/CF_PROJECT, do installer cấp).
// Thiếu secrets thì vẫn lưu D1 và trả hướng dẫn thêm tay, không fail.
import { json, nowSec, audit } from '../../../_lib/util.js';
import { requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';
import { normalizeCustomDomain } from '../../../_lib/projects.js';

const CF_API = 'https://api.cloudflare.com/client/v4';
const FALLBACK_PAGES_HOST = 'gu-seo.pages.dev';

function cfCreds(env) {
  // Hai nguồn credentials. Installer trình duyệt cấp CF_*; CLI installer
  // (deploy.sh) cấp CLOUDFLARE_*. Thiếu bên nào thì dùng bên còn lại —
  // production thực tế chỉ có CLOUDFLARE_* nên không fallback là không bao
  // giờ tự gắn được.
  const token = String(env?.CF_API_TOKEN || env?.CLOUDFLARE_API_TOKEN || '').trim();
  const accountId = String(env?.CF_ACCOUNT_ID || env?.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const project = String(env?.CF_PROJECT || '').trim();
  if (!token || !accountId) return null;
  return { token, accountId, project: project || null };
}

function pagesHost(env) {
  const p = String(env?.CF_PROJECT || '').trim();
  return p ? `${p}.pages.dev` : FALLBACK_PAGES_HOST;
}

function requestHostname(request) {
  try { return new URL(request.url).hostname.toLowerCase(); } catch { return ''; }
}

// Tìm Pages project đang serve hostname này. CF_PROJECT có thì dùng ngay;
// không thì suy ra từ URL *.pages.dev, cuối cùng mới list projects để khớp
// custom domain. List là fallback đắt nhất nên để sau cùng.
async function resolveCfProject(creds, request) {
  if (creds.project) return creds.project;
  const host = requestHostname(request);
  if (!host) return null;
  const parts = host.split('.');
  if (parts.slice(-2).join('.') === 'pages.dev') {
    if (parts.length === 3) return parts[0];
    if (parts.length > 3) return parts[1];
  }
  const list = await cfFetch(creds, `/accounts/${creds.accountId}/pages/projects?per_page=50`).catch(() => null);
  if (!list || !list.ok || !Array.isArray(list.body?.result)) return null;
  const hit = list.body.result.find((p) => (p?.domains || []).some((d) => String(d).toLowerCase() === host));
  return hit?.name || null;
}

async function cfFetch(creds, path, init = {}) {
  const r = await fetch(CF_API + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + creds.token,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  let body = null;
  try { body = await r.json(); } catch { /* non-JSON (proxy HTML etc.) */ }
  return { status: r.status, ok: r.ok, body };
}

function cfFirstError(body, status) {
  if (Array.isArray(body?.errors) && body.errors.length) {
    return body.errors.map((e) => e.message || String(e.code || e)).join(' · ');
  }
  return `HTTP ${status}`;
}

function domainsBase(creds, project) {
  return `/accounts/${creds.accountId}/pages/projects/${project}/domains`;
}

// Gắn hostname vào Pages project. Idempotent: có rồi thì thôi.
async function attachDomain(creds, project, hostname) {
  const base = domainsBase(creds, project);
  const list = await cfFetch(creds, base).catch((e) => ({ ok: false, networkError: String(e?.message || e) }));
  if (list.networkError) return { attached: false, error: list.networkError };
  if (!list.ok) return { attached: false, error: cfFirstError(list.body, list.status) };
  const found = (list.body?.result || []).find((d) => d?.name === hostname);
  if (found) return { attached: true, status: found.status || null };
  const add = await cfFetch(creds, base, {
    method: 'POST', body: JSON.stringify({ name: hostname }),
  }).catch((e) => ({ ok: false, networkError: String(e?.message || e) }));
  if (add.networkError) return { attached: false, error: add.networkError };
  if (add.ok) return { attached: true, status: add.body?.result?.status || null };
  if (add.status === 409 || /already|exists|duplicate/i.test(cfFirstError(add.body, add.status))) {
    return { attached: true, status: null };
  }
  return { attached: false, error: cfFirstError(add.body, add.status) };
}

// Gỡ hostname khỏi Pages project. Best-effort: lỗi thì caller bỏ qua.
async function detachDomain(creds, project, hostname) {
  const r = await cfFetch(creds, `${domainsBase(creds, project)}/${hostname}`, {
    method: 'DELETE',
  }).catch(() => null);
  return !!(r && (r.ok || r.status === 404));
}

async function cfAttachStatus(env, request, hostname) {
  const creds = cfCreds(env);
  if (!creds) return { managed: false, attached: false };
  const project = await resolveCfProject(creds, request);
  if (!project) return { managed: false, attached: false };
  if (!hostname) return { managed: true, attached: false };
  const list = await cfFetch(creds, domainsBase(creds, project)).catch(() => null);
  if (!list || !list.ok) return { managed: true, attached: false };
  const found = (list.body?.result || []).find((d) => d?.name === hostname);
  return { managed: true, attached: !!found, status: found?.status || null };
}

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

  const normalized = project.custom_domain ? normalizeCustomDomain(project.custom_domain) : null;
  const cf = await cfAttachStatus(env, request, normalized);

  return json(200, {
    ok: true,
    custom_domain: normalized,
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
  const prev = await env.DB.prepare(
    `SELECT custom_domain FROM projects WHERE id = ? LIMIT 1`
  ).bind(targetProjectId).first().catch(() => null);
  const prevDomain = prev?.custom_domain ? normalizeCustomDomain(prev.custom_domain) : null;

  await env.DB.prepare(
    `UPDATE projects SET custom_domain = ?, updated_at = ? WHERE id = ?`
  ).bind(customDomain, t, targetProjectId).run();

  audit(env, auth.email || 'admin', 'project_update_custom_domain', targetProjectId, {
    custom_domain: customDomain,
  });

  // Gắn/gỡ hostname trên Cloudflare. D1 đã lưu xong ở trên nên đây là
  // best-effort: lỗi CF không bao giờ làm mất bản lưu, chỉ báo trạng thái
  // để UI hướng dẫn user thêm tay.
  const creds = cfCreds(env);
  const cfProject = creds ? await resolveCfProject(creds, request) : null;
  let cf = { managed: !!cfProject, attached: false, status: null, error: null, detached: null };
  if (cfProject && customDomain && customDomain !== prevDomain) {
    const r = await attachDomain(creds, cfProject, customDomain);
    cf.attached = r.attached;
    cf.status = r.status || null;
    cf.error = r.error || null;
  } else if (cfProject && customDomain) {
    const s = await cfAttachStatus(env, request, customDomain);
    cf.attached = s.attached;
    cf.status = s.status || null;
  }
  if (cfProject && !customDomain && prevDomain) {
    const stillUsed = await env.DB.prepare(
      `SELECT id FROM projects WHERE custom_domain = ? LIMIT 1`
    ).bind(prevDomain).first().catch(() => null);
    if (!stillUsed) cf.detached = await detachDomain(creds, cfProject, prevDomain);
  }
  if (!cfProject) {
    cf.error = 'missing_cf_secrets';
  }

  return json(200, {
    ok: true,
    custom_domain: customDomain,
    public_url: customDomain ? `https://${customDomain}` : null,
    cname_target: pagesHost(env),
    cf_managed: cf.managed,
    cf_attached: cf.attached,
    cf_status: cf.status,
    cf_detached: cf.detached,
    cf_error: cf.error,
  });
};

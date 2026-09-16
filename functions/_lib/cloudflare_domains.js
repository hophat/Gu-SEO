// Cloudflare Pages custom-domain helpers, shared by the tenant domain
// endpoint and the super_admin approval queue. One copy on purpose: the
// attach flow already drifted once when it lived only in domain.js.
const CF_API = 'https://api.cloudflare.com/client/v4';
export const FALLBACK_PAGES_HOST = 'gu-seo.pages.dev';

export function cfCreds(env) {
  const token = String(env?.CF_API_TOKEN || env?.CLOUDFLARE_API_TOKEN || '').trim();
  const accountId = String(env?.CF_ACCOUNT_ID || env?.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const project = String(env?.CF_PROJECT || '').trim();
  if (!token || !accountId) return null;
  return { token, accountId, project: project || null };
}

export function pagesHost(env) {
  const p = String(env?.CF_PROJECT || '').trim();
  return p ? `${p}.pages.dev` : FALLBACK_PAGES_HOST;
}

export function requestHostname(request) {
  try { return new URL(request.url).hostname.toLowerCase(); } catch { return ''; }
}

export async function resolveCfProject(creds, request) {
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

export async function cfFetch(creds, path, init = {}) {
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

export function cfFirstError(body, status) {
  if (Array.isArray(body?.errors) && body.errors.length) {
    return body.errors.map((e) => e.message || String(e.code || e)).join(' · ');
  }
  return `HTTP ${status}`;
}

export function domainsBase(creds, project) {
  return `/accounts/${creds.accountId}/pages/projects/${project}/domains`;
}

export async function attachDomain(creds, project, hostname) {
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

export async function detachDomain(creds, project, hostname) {
  const r = await cfFetch(creds, `${domainsBase(creds, project)}/${hostname}`, {
    method: 'DELETE',
  }).catch(() => null);
  return !!(r && (r.ok || r.status === 404));
}

export async function cfAttachStatus(env, request, hostname) {
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

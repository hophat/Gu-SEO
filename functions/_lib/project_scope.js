const CACHE_KEY = '__ps_project_scope_cache__';

function normalizeHost(value) {
  try {
    const raw = String(value || '').trim();
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function requestHost(request) {
  const forwarded = request?.headers?.get?.('x-forwarded-host');
  if (forwarded) return forwarded.split(',')[0].trim();
  try {
    return new URL(request.url).hostname;
  } catch {
    return '';
  }
}

export async function resolveProjectByHost(env, host, pathname = '/') {
  if (!env?.DB) return null;
  const target = normalizeHost(host);
  if (!target) return null;

  const cached = env[CACHE_KEY];
  if (cached && cached.host === target && cached.path === pathname) return cached.project;

  const rows = await env.DB.prepare(
    `SELECT id, slug, name, website_url, publishing_url, site_name, site_description, logo_url FROM projects WHERE status = 'active'`
  ).all().catch(() => ({ results: [] }));

  // A project is addressed either by a dedicated host or by a path prefix
  // on a shared host (seo.gulagi.com/<slug>). Longest matching path wins
  // so the shared host's own root still resolves to the root project.
  let match = null, matchLen = -1;
  for (const project of rows?.results || []) {
    for (const raw of [project.website_url, project.publishing_url]) {
      let h, p;
      try {
        const u = new URL(/^https?:\/\//i.test(raw || '') ? raw : `https://${raw}`);
        h = normalizeHost(u.hostname);
        p = u.pathname.replace(/\/+$/, '');
      } catch { continue; }
      if (!h) continue;
      if (h !== target && !target.endsWith('.' + h)) continue;
      if (p && pathname !== p && !pathname.startsWith(p + '/')) continue;
      if (p.length > matchLen) { match = project; matchLen = p.length; }
    }
  }

  try { env[CACHE_KEY] = { host: target, path: pathname, project: match }; } catch { /* env may be frozen */ }
  return match;
}

export async function resolveProjectForRequest(env, request) {
  // Explicit ?project=<slug> beats host sniffing so one host can serve many projects.
  let url;
  try { url = new URL(request.url); } catch { url = null; }
  const qp = url?.searchParams.get('project') || '';
  if (qp) return resolveProjectBySlug(env, qp);
  return resolveProjectByHost(env, requestHost(request), url?.pathname || '/');
}

export async function resolveProjectBySlug(env, slug) {
  const clean = String(slug || '').trim().toLowerCase();
  if (!clean || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(clean)) return null;
  const row = await env?.DB?.prepare(
    `SELECT id, slug, name, website_url, publishing_url, site_name, site_description, logo_url FROM projects WHERE slug = ? LIMIT 1`
  ).bind(clean).first().catch(() => null);
  return row || null;
}

export { normalizeHost };

// Canonical public base (origin + /<slug> prefix) for a project's pages,
// so IndexNow/GSC pings advertise the URL that actually serves the page.
// Falls back to the request host, mapping the internal Pages host back
// to the public site.
export async function publicBaseFor(env, projectId, request) {
  let fallback = '';
  try {
    const host = requestHost(request);
    fallback = `https://${host === 'gu-seo.pages.dev' ? 'gulagi.com' : host}`;
  } catch { fallback = ''; }

  if (!projectId) return fallback;
  const row = await env?.DB?.prepare?.(
    `SELECT publishing_url, website_url FROM projects WHERE id = ? LIMIT 1`
  )?.bind?.(projectId)?.first?.()?.catch(() => null);
  const raw = row?.publishing_url || row?.website_url || '';
  try {
    const u = new URL(raw);
    return u.origin + u.pathname.replace(/\/+$/, '');
  } catch { return fallback; }
}

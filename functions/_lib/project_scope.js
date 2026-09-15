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
  const hostHdr = request?.headers?.get?.('host');
  if (hostHdr) return hostHdr.split(':')[0].trim();
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
    `SELECT id, slug, name, website_url, publishing_url, custom_domain, site_name, site_description, logo_url, theme_color FROM projects WHERE status = 'active'`
  ).all().catch(() => ({ results: [] }));

  for (const project of rows?.results || []) {
    if (project.custom_domain) {
      const cdHost = normalizeHost(project.custom_domain);
      if (cdHost && (cdHost === target || target.endsWith('.' + cdHost))) {
        try { env[CACHE_KEY] = { host: target, path: pathname, project }; } catch { /* env may be frozen */ }
        return project;
      }
    }
  }

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

// Memoised per request. On `/<slug>/blog` the wrapper resolves the project to
// validate the slug, then renderBlogIndex resolves it AGAIN — two identical
// queries for one page view. D1 bills per row read, so this is pure waste on
// the public path.
const SLUG_CACHE_KEY = '__ps_project_slug_cache__';

export async function resolveProjectBySlug(env, slug) {
  const clean = String(slug || '').trim().toLowerCase();
  if (!clean || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(clean)) return null;

  const cache = env?.[SLUG_CACHE_KEY];
  if (cache && clean in cache) return cache[clean];

  const row = await env?.DB?.prepare(
    `SELECT id, slug, name, website_url, publishing_url, custom_domain, site_name, site_description, logo_url, theme_color FROM projects WHERE slug = ? LIMIT 1`
  ).bind(clean).first().catch(() => null);

  const project = row || null;
  if (env) {
    try {
      if (!env[SLUG_CACHE_KEY]) env[SLUG_CACHE_KEY] = {};
      env[SLUG_CACHE_KEY][clean] = project;
    } catch { /* frozen env */ }
  }
  return project;
}

export async function resolveProjectBySlugPath(env, slug) {
  const clean = String(slug || '').trim().toLowerCase();
  const project = await resolveProjectBySlug(env, clean);
  if (!project) return null;
  if (project.custom_domain) return project;
  let path = '';
  try { path = new URL(project.publishing_url || '').pathname.replace(/\/+$/, ''); } catch { return null; }
  return path === `/${clean}` ? project : null;
}

export { normalizeHost };

export async function publicBaseFor(env, projectId, request) {
  let fallback = '';
  try {
    const host = requestHost(request);
    fallback = `https://${host === 'gu-seo.pages.dev' ? 'gulagi.com' : host}`;
  } catch { fallback = ''; }

  if (!projectId) return fallback;
  const row = await env?.DB?.prepare?.(
    `SELECT publishing_url, website_url, custom_domain FROM projects WHERE id = ? LIMIT 1`
  )?.bind?.(projectId)?.first?.()?.catch(() => null);

  if (row?.custom_domain) {
    const cd = normalizeHost(row.custom_domain);
    if (cd) return `https://${cd}`;
  }

  const raw = row?.publishing_url || row?.website_url || '';
  try {
    const u = new URL(raw);
    return u.origin + u.pathname.replace(/\/+$/, '');
  } catch { return fallback; }
}

export async function publicPathFor(env, projectId, request) {
  if (!projectId) return '';
  const row = await env?.DB?.prepare?.(
    `SELECT publishing_url, website_url, custom_domain, slug FROM projects WHERE id = ? LIMIT 1`
  )?.bind?.(projectId)?.first?.()?.catch(() => null);

  if (!row) return '';

  if (row.custom_domain) {
    const cd = normalizeHost(row.custom_domain);
    if (cd) {
      if (!request) return '';
      const reqHost = normalizeHost(requestHost(request));
      if (reqHost === cd || reqHost.endsWith('.' + cd)) {
        return '';
      }
      return `/${row.slug}`;
    }
  }

  const base = await publicBaseFor(env, projectId, request);
  try { return new URL(base).pathname.replace(/\/+$/, ''); } catch { return ''; }
}

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

export async function resolveProjectByHost(env, host) {
  if (!env?.DB) return null;
  const target = normalizeHost(host);
  if (!target) return null;

  const cached = env[CACHE_KEY];
  if (cached && cached.host === target) return cached.project;

  const rows = await env.DB.prepare(
    `SELECT id, slug, name, website_url, publishing_url FROM projects WHERE status = 'active'`
  ).all().catch(() => ({ results: [] }));

  let match = null;
  for (const project of rows?.results || []) {
    const hosts = [normalizeHost(project.website_url), normalizeHost(project.publishing_url)].filter(Boolean);
    if (hosts.some((candidate) => candidate === target || target.endsWith('.' + candidate))) {
      match = project;
      break;
    }
  }

  try { env[CACHE_KEY] = { host: target, project: match }; } catch { /* env may be frozen */ }
  return match;
}

export async function resolveProjectForRequest(env, request) {
  return resolveProjectByHost(env, requestHost(request));
}

export { normalizeHost };

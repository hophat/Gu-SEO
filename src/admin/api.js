// Shared API client — mirrors the vanilla admin.js `api()` helper.
// Uses the session cookie (credentials: 'same-origin') and auto-injects
// the active project_id as a query param for /api/admin/* endpoints.

let activeProjectId = null;

export function setActiveProject(id) { activeProjectId = id; }
export function getActiveProject() { return activeProjectId; }

export async function api(path, opts = {}) {
  let finalPath = path;
  const isAdmin = path.startsWith('/api/admin/');
  const isAuth = path.startsWith('/api/admin/whoami') || path.startsWith('/api/admin/login') || path.startsWith('/api/admin/logout');
  if (isAdmin && !isAuth && activeProjectId) {
    const u = new URL(finalPath, window.location.origin);
    if (!u.searchParams.has('project_id')) {
      u.searchParams.set('project_id', activeProjectId);
      finalPath = u.pathname + u.search;
    }
  }
  const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
  const r = await fetch(finalPath, { ...opts, headers, credentials: 'same-origin' });
  let body = null;
  try { body = await r.json(); } catch { /* not JSON */ }
  return { status: r.status, body };
}

// Convenience wrappers
export const apiGet = (path) => api(path, { method: 'GET' });
export const apiPost = (path, data) => api(path, { method: 'POST', body: JSON.stringify(data || {}) });
export const apiDel = (path) => api(path, { method: 'DELETE' });

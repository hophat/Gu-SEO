// GET /api/admin/whoami
//
// 200 + { ok, email?, via, site_name, site_url } if the request is
//   authenticated (either a valid session cookie or the bearer token).
// 401 if not authenticated.
// 503 + { error: 'config_incomplete', missing } if SITE_NAME / SITE_URL
//   / ADMIN_TOKEN aren't all set.
//
// The admin UI hits this on first load to decide whether to show the
// dashboard, the login form, or a "finish setup first" message.
import { json } from '../../_lib/util.js';
import { requireAdminAsync } from '../../_lib/auth.js';
import { missingConfig, configError } from '../../_lib/config.js';

import { getSiteIdentity } from '../../_lib/site_identity.js';

export const onRequestGet = async ({ request, env }) => {
  const missing = await missingConfig(env);
  if (missing.length) {
    // Tell the UI whether this is a fresh deploy that just needs the
    // setup screen, or a real misconfiguration. The setup screen is
    // shown when NO users exist yet — at that point /admin is safe to
    // expose (nobody to authenticate against).
    let usersCount = 0;
    if (env?.DB) {
      try {
        const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first();
        usersCount = r?.n || 0;
      } catch { /* table may not exist yet — treat as 0 */ }
    }
    return json(503, { ...configError(missing), needs_setup: usersCount === 0 });
  }
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });
  const identity = await getSiteIdentity(env);

  const role = auth.role || 'super_admin';
  const projectId = auth.projectId || null;
  let projects = [];
  let planTier = auth.planTier || 'pro';
  let postLimit = 100;
  let postCount = 0;

  if (env?.DB && auth.userId) {
    try {
      const u = await env.DB.prepare('SELECT plan_tier, post_limit FROM users WHERE id = ?').bind(auth.userId).first();
      if (u) {
        planTier = u.plan_tier || 'free';
        postLimit = u.post_limit || 100;
      }
      if (projectId) {
        const c = await env.DB.prepare('SELECT COUNT(*) AS total FROM blog_posts WHERE project_id = ?').bind(projectId).first();
        postCount = c?.total || 0;
      }
    } catch {}
  }

  if (env?.DB) {
    try {
      if (role === 'super_admin') {
        const res = await env.DB.prepare(
          `SELECT p.id, p.slug, p.name, p.website_url, p.publishing_url, p.custom_domain, p.site_name, p.site_description, p.logo_url,
                 c.publisher_type, c.endpoint_url FROM projects p
             LEFT JOIN project_publishing_configs c ON c.project_id = p.id
           ORDER BY p.created_at ASC`
        ).all();
        projects = res?.results || [];
      } else if (role === 'project_admin' && projectId) {
        const res = await env.DB.prepare(
          `SELECT p.id, p.slug, p.name, p.website_url, p.publishing_url, p.custom_domain, p.site_name, p.site_description, p.logo_url,
                 c.publisher_type, c.endpoint_url FROM projects p
             LEFT JOIN project_publishing_configs c ON c.project_id = p.id
            WHERE p.id = ? LIMIT 1`
        ).bind(projectId).all();
        projects = res?.results || [];
      }
    } catch {}
  }

  return json(200, {
    ok: true,
    email: auth.email || null,
    via: auth.via,
    role,
    plan_tier: planTier,
    post_limit: postLimit,
    post_count: postCount,
    project_id: projectId,
    projects,
    site_name: identity.name,
    site_url: identity.url,
  });
};

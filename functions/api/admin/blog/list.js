// GET — admin's view of every blog post (published + hidden).
import { json } from '../../../_lib/util.js';
import { requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';

export const onRequestGet = async ({ request, env }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });
  const tenant = await resolveTenantContext(env, request, auth);
  const activeProjectId = tenant?.activeProjectId || null;

  let query = `SELECT id, slug, title, status, hero_image_key, keywords, ai_provider,
            published_at, hidden_at, project_id
       FROM blog_posts`;
  const args = [];

  if (activeProjectId) {
    query += ` WHERE (project_id = ? OR project_id IS NULL)`;
    args.push(activeProjectId);
  }

  query += ` ORDER BY published_at DESC LIMIT 200`;

  const stmt = args.length ? env.DB.prepare(query).bind(...args) : env.DB.prepare(query);
  const r = await stmt.all();
  return json(200, {
    posts: r.results || [],
    project_id: activeProjectId,
    project_slug: tenant?.activeProjectSlug || null,
  });
};

// GET — list unpublished jobs for the admin "drafts & failed" panel.
import { json } from '../../../_lib/util.js';
import { requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';

export const onRequestGet = async ({ request, env }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });
  const tenant = await resolveTenantContext(env, request, auth);
  const activeProjectId = tenant?.activeProjectId || null;

  let query = `SELECT id, status, topic_key, slug, title, hero_image_key, ai_provider,
            error, created_at, updated_at, project_id
       FROM blog_jobs
      WHERE status != 'published'`;
  const args = [];

  if (activeProjectId) {
    query += ` AND (project_id = ? OR project_id IS NULL)`;
    args.push(activeProjectId);
  }

  query += ` ORDER BY updated_at DESC LIMIT 50`;

  const stmt = args.length ? env.DB.prepare(query).bind(...args) : env.DB.prepare(query);
  const r = await stmt.all();
  return json(200, {
    jobs: r.results || [],
    project_id: activeProjectId,
    project_slug: tenant?.activeProjectSlug || null,
  });
};

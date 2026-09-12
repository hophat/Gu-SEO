import { json } from '../../_lib/util.js';
import { requireAdminAsync, resolveTenantContext } from '../../_lib/auth.js';

export const onRequestGet = async ({ env, request }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });
  if (!env?.DB) return json(500, { error: 'no_db' });

  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;
  const since = Math.floor(Date.now() / 1000) - 30 * 86400;

  const run = async (sql, args = [], mode = 'first') => {
    const stmt = pid ? env.DB.prepare(sql).bind(pid, ...args) : env.DB.prepare(sql).bind(...args);
    const res = await stmt[mode === 'all' ? 'all' : 'first']().catch(() => null);
    return mode === 'all' ? res?.results || [] : res;
  };

  const publishedFilter = pid ? `status='published' AND project_id = ?` : `status='published'`;
  const projectFilter = pid ? `project_id = ?` : `1=1`;

  const [blogCount, progCount, leadCount, feedback, topViews, aiCost, latestLeads] = await Promise.all([
    run(`SELECT COUNT(*) as n FROM blog_posts WHERE ${publishedFilter}`),
    run(`SELECT COUNT(*) as n FROM prog_pages WHERE ${publishedFilter}`),
    run(`SELECT COUNT(*) as n FROM leads WHERE ${projectFilter}`),
    run(`SELECT rating, COUNT(*) as n FROM feedback WHERE ${projectFilter} GROUP BY rating`, [], 'all'),
    run(`SELECT blog_slug, view_count, total_read_time_ms FROM blog_views WHERE ${projectFilter} ORDER BY view_count DESC LIMIT 10`, [], 'all'),
    run(`SELECT COALESCE(SUM(cost_usd), 0) as total FROM ai_runs WHERE created_at > ? AND ${projectFilter}`, [since]),
    run(`SELECT id, name, email, phone, source, blog_slug, created_at FROM leads WHERE ${projectFilter} ORDER BY created_at DESC LIMIT 5`, [], 'all'),
  ]);

  return json(200, {
    ok: true,
    project_id: pid,
    project_slug: tenant?.activeProjectSlug || null,
    total_posts: (blogCount?.n || 0) + (progCount?.n || 0),
    total_leads: leadCount?.n || 0,
    feedback,
    top_views: topViews,
    ai_cost_30d: aiCost?.total || 0,
    latest_leads: latestLeads,
  });
};

import { json } from '../../_lib/util.js';
import { adminGate } from '../../_lib/auth.js';

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  if (!env?.DB) return json(500, { error: 'no_db' });

  const [blogCount, progCount, leadCount, feedbackRows, viewRows, aiCost] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as n FROM blog_posts WHERE status='published'`).first().catch(() => ({ n: 0 })),
    env.DB.prepare(`SELECT COUNT(*) as n FROM prog_pages WHERE status='published'`).first().catch(() => ({ n: 0 })),
    env.DB.prepare(`SELECT COUNT(*) as n FROM leads`).first().catch(() => ({ n: 0 })),
    env.DB.prepare(`SELECT rating, COUNT(*) as n FROM feedback GROUP BY rating`).all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT blog_slug, view_count, total_read_time_ms FROM blog_views ORDER BY view_count DESC LIMIT 10`).all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT COALESCE(SUM(cost_usd), 0) as total FROM ai_usage WHERE created_at > ?`).bind(Math.floor(Date.now() / 1000) - 30 * 86400).first().catch(() => ({ total: 0 })),
  ]);

  return json(200, {
    ok: true,
    total_posts: (blogCount?.n || 0) + (progCount?.n || 0),
    total_leads: leadCount?.n || 0,
    feedback: feedbackRows.results || [],
    top_views: viewRows.results || [],
    ai_cost_30d: aiCost?.total || 0,
  });
};

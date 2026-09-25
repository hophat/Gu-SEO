// GET /api/public/platform-stats
//
// Privacy-safe, aggregate proof for the public landing page. Returns only
// counts and daily output totals; no user, project, brand or post identifiers
// leave D1. The response is edge-cached because these metrics are operational
// proof, not a real-time control surface.
import { json } from '../../_lib/util.js';

const DAY_SEC = 86400;

export const onRequestGet = async ({ env }) => {
  if (!env?.DB) {
    return json(200, { ok: true, available: false, stats: null }, {
      'cache-control': 'public, max-age=60',
      'access-control-allow-origin': '*',
    });
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const since30d = now - (30 * DAY_SEC);
    const summaryStatement = env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM projects WHERE status = 'active') AS active_projects,
         (SELECT COUNT(*) FROM blog_posts WHERE status = 'published') AS published_posts,
         (SELECT COUNT(*) FROM prog_pages WHERE status = 'published') AS published_pages,
         (SELECT COUNT(*) FROM blog_posts
           WHERE status = 'published' AND published_at >= ?) +
         (SELECT COUNT(*) FROM prog_pages
           WHERE status = 'published' AND published_at >= ?) AS published_last_30_days,
         (SELECT MAX(latest_at) FROM (
            SELECT MAX(published_at) AS latest_at
              FROM blog_posts WHERE status = 'published'
            UNION ALL
            SELECT MAX(published_at) AS latest_at
              FROM prog_pages WHERE status = 'published'
         )) AS latest_published_at`
    ).bind(since30d, since30d);
    const activityStatement = env.DB.prepare(
      `SELECT day, SUM(output_count) AS output_count
         FROM (
           SELECT date(published_at, 'unixepoch') AS day, COUNT(*) AS output_count
             FROM blog_posts
            WHERE status = 'published'
              AND published_at >= ?
           UNION ALL
           SELECT date(published_at, 'unixepoch') AS day, COUNT(*) AS output_count
             FROM prog_pages
            WHERE status = 'published'
              AND published_at >= ?
         )
        WHERE day >= date('now', '-6 days')
        GROUP BY day
        ORDER BY day ASC`
    ).bind(now - (7 * DAY_SEC), now - (7 * DAY_SEC));

    const row = await summaryStatement.first() || {};
    const activityResult = await activityStatement.all();
    const publishedPosts = Number(row.published_posts || 0);
    const publishedPages = Number(row.published_pages || 0);
    const byDay = new Map(
      (activityResult.results || []).map((item) => [item.day, Number(item.output_count || 0)])
    );
    const activity = [];

    // Return one row for every day, including quiet days. A gap means zero
    // output, not missing telemetry.
    for (let offset = 6; offset >= 0; offset--) {
      const date = new Date((now - (offset * DAY_SEC)) * 1000);
      const day = date.toISOString().slice(0, 10);
      activity.push({ day, count: byDay.get(day) || 0 });
    }

    return json(200, {
      ok: true,
      available: true,
      stats: {
        active_projects: Number(row.active_projects || 0),
        published_posts: publishedPosts,
        published_pages: publishedPages,
        published_total: publishedPosts + publishedPages,
        published_last_30_days: Number(row.published_last_30_days || 0),
        latest_published_at: row.latest_published_at ? Number(row.latest_published_at) : null,
        activity_7d: activity,
        updated_at: now,
      },
    }, {
      'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
      'access-control-allow-origin': '*',
    });
  } catch (e) {
    return json(500, { ok: false, available: false, error: 'stats_unavailable' }, {
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    });
  }
};

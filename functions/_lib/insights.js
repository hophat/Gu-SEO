// Product analytics, computed from data the product already writes.
//
// The design choice worth stating: activation, retention and activity are
// DERIVED from `projects.created_at` and `blog_posts.published_at`, not
// logged as events. That matters for three reasons:
//
//   - Retroactive. The numbers exist for every project that ever existed,
//     including the ones created before any instrumentation.
//   - Cannot drift. There is no second source of truth to fall out of sync
//     with what actually happened.
//   - Free. No extra writes on the publish hot path.
//
// `product_events` (migration 003) exists only for decisions that are not
// derivable — see _lib/events.js.
//
// The cohort maths run in JS over the full project/post list rather than in
// SQL. At this scale (tens of projects, hundreds of posts) that is
// unambiguous and easy to verify; the queries are bounded, and if the install
// ever grows past a few thousand projects this is the first thing to push
// down into SQL.

const DAY = 86400;

// ISO-8601 week label, e.g. "2026-W38". Used as the cohort key so cohorts
// align with how people actually talk about "last week".
export function isoWeek(ts) {
  const d = new Date(ts * 1000);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Thursday of the current week decides the year.
  const dayNum = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const fDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fDayNum + 3);
  const week = 1 + Math.round((t - firstThursday) / (7 * DAY * 1000));
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)) * 10) / 10;
}

// Which bucket (in weeks since signup) does a publish fall into?
// 0 = week 1 (days 0-6), 1 = week 2 (days 7-13), …
function weekOffset(createdAt, publishedAt) {
  return Math.floor((publishedAt - createdAt) / (7 * DAY));
}

export async function computeInsights(env, { maxProjects = 2000 } = {}) {
  const now = Math.floor(Date.now() / 1000);

  const projects = (await env.DB.prepare(
    `SELECT id, slug, name, status, created_at, custom_domain
       FROM projects ORDER BY created_at ASC LIMIT ?`
  ).bind(maxProjects).all().catch(() => ({ results: [] }))).results || [];

  const posts = (await env.DB.prepare(
    `SELECT project_id, published_at FROM blog_posts
      WHERE status = 'published' AND project_id IS NOT NULL
      ORDER BY published_at ASC LIMIT 50000`
  ).all().catch(() => ({ results: [] }))).results || [];

  const brandRows = (await env.DB.prepare(
    'SELECT project_id FROM project_brands WHERE business_type IS NOT NULL OR audience IS NOT NULL'
  ).all().catch(() => ({ results: [] }))).results || [];

  const calRows = (await env.DB.prepare(
    'SELECT DISTINCT project_id FROM content_calendar WHERE project_id IS NOT NULL'
  ).all().catch(() => ({ results: [] }))).results || [];

  const channelRows = (await env.DB.prepare(
    "SELECT project_id FROM project_publishing_configs WHERE publisher_type != 'internal_d1' AND publisher_type IS NOT NULL"
  ).all().catch(() => ({ results: [] }))).results || [];

  // Index posts by project.
  const byProject = new Map();
  for (const p of posts) {
    if (!byProject.has(p.project_id)) byProject.set(p.project_id, []);
    byProject.get(p.project_id).push(p.published_at);
  }

  const hasBrand = new Set(brandRows.map((r) => r.project_id));
  const hasCal = new Set(calRows.map((r) => r.project_id));
  const hasChannel = new Set(channelRows.map((r) => r.project_id));

  // ── funnel ───────────────────────────────────────────────────────
  const total = projects.length;
  const withBrand = projects.filter((p) => hasBrand.has(p.id)).length;
  const withCal = projects.filter((p) => hasCal.has(p.id)).length;
  const withPost = projects.filter((p) => (byProject.get(p.id) || []).length > 0).length;
  const activeW2 = projects.filter((p) => (byProject.get(p.id) || []).some((t) => weekOffset(p.created_at, t) >= 1)).length;
  const activeW4 = projects.filter((p) => (byProject.get(p.id) || []).some((t) => weekOffset(p.created_at, t) >= 3)).length;
  const withChannel = projects.filter((p) => hasChannel.has(p.id)).length;

  // A cohort that is too young to have reached week N must not be reported as
  // 0% — that reads as "everyone churned" when the truth is "not measurable
  // yet", and it is the kind of number a product owner will act on wrongly.
  const oldestAgeDays = projects.length
    ? Math.floor((now - Math.min(...projects.map((p) => p.created_at))) / DAY)
    : 0;

  const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  const funnel = [
    { key: 'signup', label: 'Đăng ký dự án', count: total, pct: 100 },
    { key: 'brand_dna', label: 'Có Brand DNA', count: withBrand, pct: pct(withBrand) },
    { key: 'schedule', label: 'Có lịch nội dung', count: withCal, pct: pct(withCal) },
    { key: 'first_post', label: 'Xuất bản bài đầu tiên', count: withPost, pct: pct(withPost) },
    { key: 'channel', label: 'Kết nối kênh MXH', count: withChannel, pct: pct(withChannel) },
    { key: 'week2', label: 'Còn hoạt động tuần 2', count: activeW2, pct: pct(activeW2), measurable_after_days: 14, measurable: oldestAgeDays >= 14 },
    { key: 'week4', label: 'Còn hoạt động tuần 4', count: activeW4, pct: pct(activeW4), measurable_after_days: 28, measurable: oldestAgeDays >= 28 },
  ];

  // ── time to first post ───────────────────────────────────────────
  const ttfp = [];
  for (const p of projects) {
    const times = byProject.get(p.id);
    if (!times?.length) continue;
    const hours = Math.round(((times[0] - p.created_at) / 3600) * 10) / 10;
    if (hours >= 0) ttfp.push(hours);
  }
  ttfp.sort((a, b) => a - b);
  const timeToFirstPost = {
    n: ttfp.length,
    median_hours: percentile(ttfp, 0.5),
    p25_hours: percentile(ttfp, 0.25),
    p75_hours: percentile(ttfp, 0.75),
    under_24h: ttfp.filter((h) => h < 24).length,
    under_72h: ttfp.filter((h) => h < 72).length,
  };

  // ── retention cohorts by signup week ─────────────────────────────
  const cohorts = new Map();
  for (const p of projects) {
    const wk = isoWeek(p.created_at);
    if (!cohorts.has(wk)) cohorts.set(wk, { cohort: wk, size: 0, w1: 0, w2: 0, w3: 0, w4: 0, posts: 0, first_ts: p.created_at });
    const c = cohorts.get(wk);
    c.size++;
    c.first_ts = Math.min(c.first_ts, p.created_at);
    const times = byProject.get(p.id) || [];
    c.posts += times.length;
    for (const t of times) {
      const off = weekOffset(p.created_at, t);
      if (off === 0) c.w1++;
      else if (off === 1) c.w2++;
      else if (off === 2) c.w3++;
      else if (off === 3) c.w4++;
    }
  }
  const retention = [...cohorts.values()]
    .sort((a, b) => b.cohort.localeCompare(a.cohort))
    .slice(0, 12)
    .map((c) => {
      // How many full weeks has this cohort existed? A week beyond that has
      // not happened yet, so its 0 is meaningless — the UI must say so rather
      // than render a red 0% that reads as churn.
      const weeks_elapsed = Math.floor((now - c.first_ts) / (7 * DAY));
      return {
        cohort: c.cohort,
        size: c.size,
        posts: c.posts,
        w1: c.w1, w2: c.w2, w3: c.w3, w4: c.w4,
        weeks_elapsed,
        w1_pct: c.size ? Math.round((c.w1 / c.size) * 100) : 0,
        w2_pct: c.size ? Math.round((c.w2 / c.size) * 100) : 0,
        w3_pct: c.size ? Math.round((c.w3 / c.size) * 100) : 0,
        w4_pct: c.size ? Math.round((c.w4 / c.size) * 100) : 0,
      };
    });

  // ── weekly activity trend ────────────────────────────────────────
  const weeks = new Map();
  for (const p of posts) {
    const wk = isoWeek(p.published_at);
    if (!weeks.has(wk)) weeks.set(wk, { week: wk, posts: 0, projects: new Set() });
    const w = weeks.get(wk);
    w.posts++;
    w.projects.add(p.project_id);
  }
  const weekly = [...weeks.values()]
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-12)
    .map((w) => ({ week: w.week, posts: w.posts, projects: w.projects.size }));

  // ── per-project health ───────────────────────────────────────────
  const projectRows = projects.map((p) => {
    const times = byProject.get(p.id) || [];
    const first = times[0] || null;
    const last = times.length ? times[times.length - 1] : null;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      status: p.status,
      created_at: p.created_at,
      age_days: Math.floor((now - p.created_at) / DAY),
      posts: times.length,
      first_post_hours: first ? Math.round(((first - p.created_at) / 3600) * 10) / 10 : null,
      days_since_last_post: last ? Math.floor((now - last) / DAY) : null,
      has_brand_dna: hasBrand.has(p.id),
      has_schedule: hasCal.has(p.id),
      has_channel: hasChannel.has(p.id),
      // "healthy" = published something in the last 7 days.
      healthy: !!last && now - last < 7 * DAY,
    };
  }).sort((a, b) => b.posts - a.posts);

  // ── event log summary ────────────────────────────────────────────
  const eventRows = (await env.DB.prepare(
    `SELECT event, COUNT(*) AS n, MAX(created_at) AS last_at
       FROM product_events GROUP BY event ORDER BY n DESC`
  ).all().catch(() => ({ results: [] }))).results || [];

  const totalPosts = posts.length;
  const healthy = projectRows.filter((p) => p.healthy).length;

  return {
    generated_at: now,
    totals: {
      projects: total,
      projects_active: projects.filter((p) => p.status === 'active').length,
      projects_healthy: healthy,
      published_posts: totalPosts,
      posts_per_project: total ? Math.round((totalPosts / total) * 10) / 10 : 0,
      events_recorded: eventRows.reduce((a, e) => a + e.n, 0),
      // How long the oldest project has existed. Drives the "not measurable
      // yet" flags so a young install doesn't report week-2 retention as 0%.
      oldest_project_age_days: oldestAgeDays,
    },
    funnel,
    time_to_first_post: timeToFirstPost,
    retention,
    weekly,
    projects: projectRows,
    events: eventRows.map((e) => ({ event: e.event, count: e.n, last_at: e.last_at })),
  };
}

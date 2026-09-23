// pages-seo cron Worker.
//
// ONE trigger (`*/15 * * * *`) drives everything. The previous design used
// three separate cron expressions, which meant the social retry queue only
// got drained once a day — its backoff ladder (1m → 2m → 4m → 8m…) was
// decorative, because nothing looked at next_attempt_at until the next
// morning. It also sat at 3 of the account-wide 5-trigger cap.
//
// Every run:
//   - drains the social publishing queue (cheap; no AI cost, usually a no-op)
// At the top of specific hours (UTC):
//   - 01:00  daily blog post for every active project (08:00 Vietnam)
//   - 09:00  programmatic-SEO batch
//   - Mon 07:00  weekly content refresh
//
// Pages Functions kill background work when the response closes, so each
// schedule calls /api/admin/cron/tick — once per active project. A single
// all-projects call can't survive: the edge drops a connection that sends no
// response bytes for ~100-120s, and one blog chain alone takes ~55s.
// Per-project calls stay well under that ceiling, and a scheduled invocation
// gets 15 minutes.
//
// Secrets: ADMIN_TOKEN, and either TICK_URL or BLOG_URL
// (BLOG_URL = https://<host>/api/admin/blog — TICK_URL is derived from it).

// Hours are overridable via secrets (BLOG_HOUR / PROG_HOUR / REFRESH_HOUR)
// so a schedule change does not need a code redeploy.
const BLOG_HOUR = (env) => parseInt(env.BLOG_HOUR, 10) || 1;
const PROG_HOUR = (env) => parseInt(env.PROG_HOUR, 10) || 9;
const REFRESH_HOUR = (env) => parseInt(env.REFRESH_HOUR, 10) || 7;

// How many per-project tick calls run in parallel. Chains are independent
// (D1 rows are keyed by project_id) and each call is one HTTP connection —
// 6 spends 12 of the invocation's 50 subrequests and shortens the daily
// fan-out window: on 2026-09-23 the 39-project sweep was still running when
// the scheduled invocation hit its ceiling and died mid-window, stranding 21
// freshly created jobs. A shorter window is one less thing that can kill it.
const FANOUT_CONCURRENCY = 6;

export default {
  async scheduled(event, env, ctx) {
    // Never let a thrown error vanish: a rejected waitUntil is invisible in
    // the dashboard, which is exactly how a broken daily run goes unnoticed
    // for days.
    const safe = (label, promise) => promise.catch((err) => {
      console.error('[cron] task failed', label, String(err?.stack || err));
    });

    const at = new Date(event.scheduledTime || Date.now());
    const hour = at.getUTCHours();
    const minute = at.getUTCMinutes();
    const day = at.getUTCDay(); // 0 = Sunday
    const topOfHour = minute === 0;

    // Every 15 minutes: retry anything the queue says is due.
    //
    // ONE call, not one per project: the Workers free plan caps an
    // invocation at 50 subrequests, and a per-project sweep spends ~30 of
    // them (1 dry_run + 1 per active project) — which left only ~19 for the
    // blog hour's own fan-out and silently starved the oldest projects.
    // The tick endpoint loops every active project itself (60s budget).
    ctx.waitUntil(safe('social', runTask(env, 'social', { source: 'tick', all: true })));

    // Top of the hour only, so a delayed/duplicate invocation at :15/:30/:45
    // can't run the daily chain twice.
    if (topOfHour && hour === BLOG_HOUR(env)) {
      ctx.waitUntil(safe('blog', runTask(env, 'blog', { source: 'daily' })));
    } else if (topOfHour && hour === PROG_HOUR(env)) {
      ctx.waitUntil(safe('prog', runTask(env, 'prog', { source: 'daily_prog', limit: 10 })));
    } else if (topOfHour && day === 1 && hour === REFRESH_HOUR(env)) {
      ctx.waitUntil(safe('refresh', runTask(env, 'refresh', { source: 'weekly_refresh', limit: 2 })));
    } else if (minute === 40) {
      // Daily orphan net. When the blog fan-out dies mid-window (the edge
      // kills an invocation with no response bytes for ~100-120s — 2026-09-23
      // lost 21 jobs this way, all status 'created' with error NULL, because
      // /blog/text only writes the row AFTER the model answers), nothing
      // retries them and the project silently misses its post. tick's
      // blogChain() already resumes 'created'/'text_done'/'image_done' jobs —
      // this call just gives it a reason to run again. One unfiltered call;
      // the tick's internal budget marks the run 'partial' rather than
      // dying, and whatever is left is caught the next day.
      //
      // :40, not :10/:15/:30: the daily fan-out starts at the top of the
      // hour and can run ~17 minutes (batches of 6 × ~100s); a net call
      // inside that window would double-process chains the fan-out is
      // still working on. :30 was also ruled out for the same overlap.
      ctx.waitUntil(safe('blog_resume', runTask(env, 'blog', { source: 'cron_resume', all: true })));
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const auth = request.headers.get('Authorization') || '';
    const m = auth.match(/^Bearer\s+(.+)$/);
    if (!m || m[1] !== env.ADMIN_TOKEN) return new Response('unauthorized', { status: 401 });

    const projectId = url.searchParams.get('project') || '';
    let result;
    if (url.pathname === '/run/blog') {
      result = await runTask(env, 'blog', { source: 'manual', projectId });
    } else if (url.pathname === '/run/prog') {
      result = await runTask(env, 'prog', { source: 'manual', limit: parseInt(url.searchParams.get('limit'), 10) || 10, projectId });
    } else if (url.pathname === '/run/refresh') {
      result = await runTask(env, 'refresh', { source: 'manual', limit: parseInt(url.searchParams.get('limit'), 10) || 2, projectId });
    } else if (url.pathname === '/run/social') {
      result = await runTask(env, 'social', { source: 'manual', projectId });
    } else {
      return new Response('not found', { status: 404 });
    }
    return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
  },
};

function tickUrl(env) {
  if (env.TICK_URL) return env.TICK_URL.replace(/\/+$/, '');
  const base = (env.BLOG_URL || '').replace(/\/+$/, '');
  if (!base) return '';
  return base.replace(/\/blog$/, '') + '/cron/tick';
}

// Discover active projects (dry_run lists them without generating), then
// call tick once per project. Falls back to the legacy single-call shape
// when the Pages side predates per-project support.
async function runTask(env, task, { source = 'cron', limit = 0, projectId = '', all = false } = {}) {
  // One unfiltered call = 1 subrequest instead of 1 + N. Used for social,
  // which is cheap and usually a no-op.
  if (all) {
    const r = await tick(env, task, { source, limit });
    return {
      ok: r.ok, task, source, single_call: true, status: r.status,
      projects_processed: r.body?.projects_processed,
      results: r.body?.results || [],
    };
  }
  let projects;
  if (projectId) {
    projects = [{ id: projectId, slug: projectId }];
  } else {
    const list = await tick(env, task, { source, dryRun: true });
    if (!list.ok) {
      return { ok: false, task, source, step: 'list_projects', status: list.status, body: list.body };
    }
    projects = Array.isArray(list.body?.projects) ? list.body.projects : [];
  }
  if (!projects.length) return { ok: true, task, source, projects_processed: 0, results: [] };

  const runOne = async (p) => {
    try {
      return await tick(env, task, { source, limit, projectId: p.id });
    } catch (err) {
      // A single dropped connection must not abort the whole fan-out —
      // otherwise one flaky project costs every later project its post.
      return { ok: false, status: 0, task, source, error: String(err?.message || err) };
    }
  };

  // The first call doubles as a compat probe: a tick that predates
  // project_id filtering ignores it and runs EVERY project in one shot —
  // detect that (projects_processed > 1) and stop instead of firing N
  // redundant all-project calls.
  const first = await runOne(projects[0]);
  if ((first.body?.projects_processed || 0) > 1) {
    return {
      ok: first.ok, task, source, legacy_fanout: true,
      projects_processed: first.body.projects_processed,
      results: first.body.results || [],
    };
  }

  const results = [{ project_id: projects[0].id, slug: projects[0].slug, ...first }];
  for (let i = 1; i < projects.length; i += FANOUT_CONCURRENCY) {
    const batch = projects.slice(i, i + FANOUT_CONCURRENCY);
    const settled = await Promise.allSettled(batch.map(runOne));
    settled.forEach((r, j) => {
      const p = batch[j];
      results.push(r.status === 'fulfilled'
        ? { project_id: p.id, slug: p.slug, ...r.value }
        : { project_id: p.id, slug: p.slug, ok: false, status: 0, error: String(r.reason) });
    });
  }
  const failed = results.filter((r) => r.ok === false);
  const summary = {
    ok: failed.length === 0,
    task, source,
    projects_processed: results.length,
    projects_failed: failed.length || undefined,
    results,
  };
  // Cron logs aren't visible in the dashboard; surface a one-line summary
  // so `wrangler tail` shows what happened.
  console.log('[cron]', task, source, JSON.stringify({
    processed: summary.projects_processed,
    failed: summary.projects_failed || 0,
    failures: failed.map((f) => ({ slug: f.slug, error: f.body?.error || f.error })),
  }));
  return summary;
}

async function tick(env, task, { source = 'cron', limit = 0, projectId = '', dryRun = false } = {}) {
  const url = tickUrl(env);
  if (!url || !env.ADMIN_TOKEN) return { ok: false, error: 'missing_config', task, source };

  const init = {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.ADMIN_TOKEN,
      'Content-Type': 'application/json',
      // Identifies this caller as the cron Worker so the admin API can
      // apply the cron budget hard-stop (admin clicks aren't gated).
      'X-Source-Cron': '1',
    },
    body: JSON.stringify({
      task,
      limit,
      ...(projectId ? { project_id: projectId } : {}),
      ...(dryRun ? { dry_run: true } : {}),
    }),
  };

  const r = await fetch(url, init);
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
  return { ok: r.ok, status: r.status, task, source, body };
}

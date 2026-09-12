// pages-seo cron Worker. Pages Functions kill background work after the
// response closes, so each schedule makes ONE short call to
// /api/admin/cron/tick — that endpoint fans the task out across every
// active project and runs the multi-step chain server-side, well within
// the 30s subrequest budget.
//
// Cron schedules:
//   - 0 8 * * *         daily blog post for every active project
//   - 0 9 * * *         programmatic-SEO batch (one page per project)
//   - 0 7 * * 1         weekly content refresh (per project)
//
// Secrets: ADMIN_TOKEN, and either TICK_URL or BLOG_URL
// (BLOG_URL = https://<host>/api/admin/blog — TICK_URL is derived from it).

export default {
  async scheduled(event, env, ctx) {
    const cron = event.cron || '';
    if (cron === '0 8 * * *') {
      ctx.waitUntil(tick(env, 'blog', { source: 'daily' }));
    } else if (cron === '0 9 * * *') {
      ctx.waitUntil(tick(env, 'prog', { source: 'daily_prog', limit: 10 }));
    } else if (cron === '0 7 * * 1') {
      ctx.waitUntil(tick(env, 'refresh', { source: 'weekly_refresh', limit: 2 }));
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const auth = request.headers.get('Authorization') || '';
    const m = auth.match(/^Bearer\s+(.+)$/);
    if (!m || m[1] !== env.ADMIN_TOKEN) return new Response('unauthorized', { status: 401 });

    let result;
    if (url.pathname === '/run/blog') {
      result = await tick(env, 'blog', { source: 'manual' });
    } else if (url.pathname === '/run/prog') {
      result = await tick(env, 'prog', { source: 'manual', limit: parseInt(url.searchParams.get('limit'), 10) || 10 });
    } else if (url.pathname === '/run/refresh') {
      result = await tick(env, 'refresh', { source: 'manual', limit: parseInt(url.searchParams.get('limit'), 10) || 2 });
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

async function tick(env, task, { source = 'cron', limit = 0 } = {}) {
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
    body: JSON.stringify({ task, limit }),
  };

  const r = await fetch(url, init);
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
  return { ok: r.ok, status: r.status, task, source, body };
}

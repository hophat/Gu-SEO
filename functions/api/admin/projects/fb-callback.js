// GET /api/admin/projects/fb-callback?code=…&state=…
//
// Step 2 of the one-click Facebook connect. Facebook redirects here after
// the operator approves. We:
//   1. verify the signed state (binds the callback to a project)
//   2. exchange code → user token → long-lived user token
//   3. list the Pages the operator manages, with per-Page tokens
//   4. stash those tokens encrypted, keyed by project, for 15 minutes
//   5. send the operator back to Settings, where the Page picker appears
//
// If exactly one Page is available we auto-select it — that's the common
// case and it saves the operator a click.
//
// The page tokens never touch the browser.
import { getAdminToken } from '../../../_lib/admin_token.js';
import {
  getAppId, getAppSecret, fbRedirectUri, verifyState, getApiVersion,
  exchangeCodeForToken, exchangeForLongLived, listManagedPages,
  savePendingPages, clearPendingPages, pendingKey,
} from '../../../_lib/publishing/facebook_oauth.js';
import { setVaultSecret } from '../../../_lib/secret_vault.js';
import { track } from '../../../_lib/events.js';

function backToSettings(status, detail = '') {
  const q = new URLSearchParams({ fb: status });
  if (detail) q.set('fb_detail', detail.slice(0, 180));
  return new Response(null, {
    status: 302,
    headers: { location: `/admin#settings?${q.toString()}`, 'cache-control': 'no-store' },
  });
}

// The SPA's hash router switches on the bare tab name, so we can't put the
// outcome in the hash. Park it in settings and let the next GET pick it up.
async function recordResult(env, projectId, status, detail) {
  if (!env?.DB || !projectId) return;
  try {
    await env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(
      `facebook_last_result__${projectId}`,
      JSON.stringify({ status, detail: String(detail || '').slice(0, 200), at: Math.floor(Date.now() / 1000) }),
      Math.floor(Date.now() / 1000),
    ).run();
  } catch { /* non-fatal */ }
}

export const onRequestGet = async ({ env, request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errParam = url.searchParams.get('error_description') || url.searchParams.get('error');

  const adminToken = await getAdminToken(env);
  const verified = state ? await verifyState(adminToken, state) : null;
  const pid = verified?.projectId || '';

  // Every exit path records its outcome so the Settings tab can show it
  // after the SPA reloads (the hash router only understands tab names).
  const done = async (status, detail = '') => {
    // Record the outcome so a failed connect is visible in the funnel rather
    // than only in the audit log.
    await track(env, {
      event: status === 'connected' ? 'channel_connected' : 'channel_connect_failed',
      projectId: pid, props: { channel: 'facebook', status, detail },
    });
    await recordResult(env, pid, status, detail);
    return backToSettings(status, detail);
  };

  if (errParam) return done('denied', errParam);
  if (!code || !state) return done('error', 'Thiếu code hoặc state.');
  if (!verified) return done('error', 'State không hợp lệ (có thể phiên đã hết hạn). Thử lại.');

  const appId = await getAppId(env);
  const appSecret = await getAppSecret(env);
  if (!appId || !appSecret) return done('error', 'Chưa cấu hình App ID/Secret.');

  try {
    const version = await getApiVersion(env);
    const shortToken = await exchangeCodeForToken({
      appId, appSecret, redirectUri: fbRedirectUri(request), code, version,
    });
    // The long-lived exchange is what makes the Page tokens non-expiring.
    const longToken = await exchangeForLongLived({ appId, appSecret, shortToken, version });
    const pages = await listManagedPages(longToken, version);

    if (!pages.length) {
      return done('no_pages', 'Tài khoản này không quản trị Page nào (hoặc chưa cấp quyền pages_show_list).');
    }

    // Meta answers /me/accounts without an access_token when the login lacks the
    // Page task that mints one (role downgraded, Page moved into a Business the
    // app is not linked to). Say which Pages those are instead of reporting
    // "no Pages", which sent operators looking for a Page that was right there.
    const withToken = pages.filter((p) => p.access_token);
    if (!withToken.length) {
      const names = pages.map((p) => p.name || p.id).slice(0, 5).join(', ');
      return done('error', `Meta không trả về Page token cho: ${names}. Kiểm tra bạn còn quyền đăng bài trên Page và app còn pages_show_list + pages_manage_posts, rồi Kết nối lại.`);
    }

    await savePendingPages(env, pid, pages);

    // Single Page → connect it now, no picker needed.
    if (pages.length === 1) {
      const p = pages[0];
      const t = Math.floor(Date.now() / 1000);
      await setVaultSecret(env, `FACEBOOK_PAGE_TOKEN__${pid}`, p.access_token);
      await env.DB.prepare(
        `INSERT INTO project_publishing_configs (project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at)
         VALUES (?, 'facebook', '', '', ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           publisher_type = 'facebook',
           config_json = excluded.config_json,
           updated_at = excluded.updated_at`
      ).bind(pid, JSON.stringify({ page_id: p.id, page_name: p.name }), t, t).run();
      await clearPendingPages(env, pid);
      return done('connected', p.name);
    }

    return done('pick_page', `${pages.length} Page`);
  } catch (err) {
    return done('error', err?.message || String(err));
  }
};

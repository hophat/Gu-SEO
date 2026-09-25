// GET /api/admin/projects/channels-callback?code=…&state=…
//
// Step 2 of the channel connect for Threads (and the shared Meta dialog
// generally). Facebook keeps its own fb-callback (it parks a Page list
// for the picker); this route is for channels whose token is the user
// token itself:
//
//   threads → Threads Authorization Window code → short-lived token →
//             POST graph.threads.com/oauth/access_token → long-lived token
//             (GET graph.threads.net/v1.0/access_token) →
//             GET me/threads_profile → store THREADS_TOKEN__<pid> +
//             threads_user_id in project_channels → connected.
//
// The signed state carries the channel (see channels-connect.js); the
// legacy 3-part state is treated as facebook and handed to the existing
// callback semantics by simply redirecting there.
import { getAdminToken } from '../../../_lib/admin_token.js';
import { getThreadsAppId, getThreadsAppSecret, verifyState } from '../../../_lib/publishing/facebook_oauth.js';
import { setVaultSecret } from '../../../_lib/secret_vault.js';
import { connectChannel } from '../../../_lib/channels.js';
import {
  verifyThreadsToken, exchangeThreadsCodeForToken, exchangeThreadsLongLived, threadsRedirectUri,
} from '../../../_lib/publishing/threads.js';
import { track } from '../../../_lib/events.js';

function backToPublishing(status, detail = '') {
  const q = new URLSearchParams({ channels: status });
  if (detail) q.set('channels_detail', detail.slice(0, 180));
  return new Response(null, {
    status: 302,
    headers: { location: `/admin#publishing?${q.toString()}`, 'cache-control': 'no-store' },
  });
}

// Park the outcome where the next GET /projects/channels reads it (the
// SPA's hash router can't carry a query string across the redirect).
async function recordResult(env, projectId, channel, status, detail) {
  if (!env?.DB || !projectId) return;
  try {
    await env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(
      `channel_last_result__${projectId}`,
      JSON.stringify({ channel, status, detail: String(detail || '').slice(0, 200), at: Math.floor(Date.now() / 1000) }),
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
  const channel = verified?.channel || 'facebook';

  const done = async (status, detail = '') => {
    await track(env, {
      event: status === 'connected' ? 'channel_connected' : 'channel_connect_failed',
      projectId: pid, props: { channel, status, detail },
    });
    await recordResult(env, pid, channel, status, detail);
    return backToPublishing(status, detail);
  };

  if (errParam) return done('denied', errParam);
  if (!code || !state) return done('error', 'Thiếu code hoặc state.');
  if (!verified) return done('error', 'State không hợp lệ (có thể phiên đã hết hạn). Thử lại.');

  // Facebook keeps its dedicated flow (Page picker, pending list).
  if (channel === 'facebook') {
    return new Response(null, {
      status: 302,
      headers: { location: `/api/admin/projects/fb-callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, 'cache-control': 'no-store' },
    });
  }

  if (channel !== 'threads') {
    // Instagram's Page-token model means nothing to exchange here — the
    // connect completes through the existing Facebook Page connect (the
    // Page token covers the linked IG account). Tell the operator that
    // instead of silently storing a user token we would never use.
    return done('error', 'Instagram kết nối qua Facebook Page (token dùng chung). Kết nối Facebook trước, sau đó bật kênh Instagram.');
  }

  const appId = await getThreadsAppId(env);
  const appSecret = await getThreadsAppSecret(env);
  if (!appId || !appSecret) return done('error', 'Chưa cấu hình Threads App ID/Secret.');

  try {
    const short = await exchangeThreadsCodeForToken({
      appId, appSecret, redirectUri: threadsRedirectUri(request), code,
    });
    const longToken = await exchangeThreadsLongLived({ appSecret, shortToken: short.access_token });

    const profile = await verifyThreadsToken({ token: longToken });
    if (!profile?.id) return done('error', 'Không đọc được Threads profile từ token.');

    await setVaultSecret(env, `THREADS_TOKEN__${pid}`, longToken);
    await connectChannel(env, pid, 'threads', {
      threads_user_id: profile.id,
      username: profile.username || '',
    });

    return done('connected', profile.username || profile.id);
  } catch (err) {
    return done('error', err?.message || String(err));
  }
};

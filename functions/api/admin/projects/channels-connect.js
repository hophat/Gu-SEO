// GET /api/admin/projects/channels-connect?channel=threads
//
// Step 1 of channel connect. Facebook/Instagram use Facebook Login; Threads
// uses its Authorization Window and separate app credentials. Signed state
// binds the callback to project and channel.
//
//   channel=facebook    → classic Page connect (existing behaviour)
//   channel=threads     → Threads Authorization Window + Threads app credentials
//   channel=instagram   → + instagram_basic, instagram_content_publish
//
// Instagram rides on Facebook Page scopes. Threads uses its own Authorization
// Window, app ID, secret, redirect URI, and permission namespace.
import { adminGate, requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';
import { getAdminToken } from '../../../_lib/admin_token.js';
import { track } from '../../../_lib/events.js';
import {
  getAppId, getAppSecret, getThreadsAppId, getThreadsAppSecret,
  buildAuthUrl, fbRedirectUri, signState, getApiVersion,
  FB_SCOPES, THREADS_SCOPES, INSTAGRAM_SCOPES,
} from '../../../_lib/publishing/facebook_oauth.js';
import { buildThreadsAuthUrl, threadsRedirectUri } from '../../../_lib/publishing/threads.js';

const SCOPES_BY_CHANNEL = {
  facebook: FB_SCOPES,
  threads: THREADS_SCOPES,
  instagram: [...FB_SCOPES, ...INSTAGRAM_SCOPES],
};

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request);
  if (gate) return gate;

  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;
  if (!pid) return new Response('missing project', { status: 400 });

  const url = new URL(request.url);
  const channel = String(url.searchParams.get('channel') || 'facebook').trim();
  if (!SCOPES_BY_CHANNEL[channel]) {
    return new Response(JSON.stringify({ error: 'unknown_channel', channel }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }

  const adminToken = await getAdminToken(env);
  const state = await signState(adminToken, pid, channel);
  await track(env, { event: 'channel_connect_started', projectId: pid, props: { channel } });

  if (channel === 'threads') {
    const threadsAppId = await getThreadsAppId(env);
    const threadsAppSecret = await getThreadsAppSecret(env);
    if (!threadsAppId || !threadsAppSecret) {
      return new Response(JSON.stringify({
        error: 'threads_app_not_configured',
        detail: 'Nhập Threads App ID và Threads App Secret riêng trong Settings trước khi kết nối.',
      }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    const dialogUrl = buildThreadsAuthUrl({
      appId: threadsAppId,
      redirectUri: threadsRedirectUri(request),
      state,
      scopes: THREADS_SCOPES,
    });
    return new Response(null, { status: 302, headers: { location: dialogUrl, 'cache-control': 'no-store' } });
  }

  const appId = await getAppId(env);
  const appSecret = await getAppSecret(env);
  if (!appId || !appSecret) {
    return new Response(JSON.stringify({
      error: 'facebook_app_not_configured',
      detail: 'Nhập App ID và App Secret trước khi kết nối.',
    }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const version = await getApiVersion(env);
  const dialogUrl = buildAuthUrl({
    appId, redirectUri: fbRedirectUri(request), state, version, scopes: SCOPES_BY_CHANNEL[channel],
  });
  return new Response(null, { status: 302, headers: { location: dialogUrl, 'cache-control': 'no-store' } });
};

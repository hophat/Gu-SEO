// GET /api/admin/projects/channels-connect?channel=threads
//
// Step 1 of the Meta-channel connect for a specific channel. Reuses the
// Facebook Login dialog (same Meta app) with a channel-appropriate scope
// set, and signs the channel into the state so the callback stores the
// token under the right vault key.
//
//   channel=facebook    → classic Page connect (existing behaviour)
//   channel=threads     → + threads_basic, threads_content_publish
//   channel=instagram   → + instagram_basic, instagram_content_publish
//
// Instagram and Threads both need the base Page scopes too: the token
// must still resolve /me/accounts for the Instagram link lookup, and the
// Threads dialog rides on the same login.
import { adminGate, requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';
import { getAdminToken } from '../../../_lib/admin_token.js';
import { track } from '../../../_lib/events.js';
import {
  getAppId, getAppSecret, buildAuthUrl, fbRedirectUri, signState, getApiVersion,
  FB_SCOPES, THREADS_SCOPES, INSTAGRAM_SCOPES,
} from '../../../_lib/publishing/facebook_oauth.js';

const SCOPES_BY_CHANNEL = {
  facebook: FB_SCOPES,
  threads: [...FB_SCOPES, ...THREADS_SCOPES],
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

  const appId = await getAppId(env);
  const appSecret = await getAppSecret(env);
  if (!appId || !appSecret) {
    return new Response(JSON.stringify({
      error: 'facebook_app_not_configured',
      detail: 'Nhập App ID và App Secret trước khi kết nối.',
    }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  await track(env, { event: 'channel_connect_started', projectId: pid, props: { channel } });

  const adminToken = await getAdminToken(env);
  const state = await signState(adminToken, pid, channel);
  const version = await getApiVersion(env);
  const dialogUrl = buildAuthUrl({
    appId, redirectUri: fbRedirectUri(request), state, version, scopes: SCOPES_BY_CHANNEL[channel],
  });
  return new Response(null, { status: 302, headers: { location: dialogUrl, 'cache-control': 'no-store' } });
};

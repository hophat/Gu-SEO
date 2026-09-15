// GET /api/admin/projects/fb-connect
//
// Step 1 of the one-click Facebook connect. Admin-gated, then bounces the
// operator to Facebook's OAuth dialog. All the operator sees is "Kết nối
// Facebook" → approve → done.
import { adminGate, requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';
import { getAdminToken } from '../../../_lib/admin_token.js';
import {
  getAppId, getAppSecret, buildAuthUrl, fbRedirectUri, signState, getApiVersion,
} from '../../../_lib/publishing/facebook_oauth.js';

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request);
  if (gate) return gate;

  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;
  if (!pid) return new Response('missing project', { status: 400 });

  const appId = await getAppId(env);
  const appSecret = await getAppSecret(env);
  if (!appId || !appSecret) {
    return new Response(JSON.stringify({
      error: 'facebook_app_not_configured',
      detail: 'Nhập App ID và App Secret trước khi kết nối.',
    }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const adminToken = await getAdminToken(env);
  const state = await signState(adminToken, pid);
  const version = await getApiVersion(env);
  const url = buildAuthUrl({ appId, redirectUri: fbRedirectUri(request), state, version });
  return new Response(null, { status: 302, headers: { location: url, 'cache-control': 'no-store' } });
};

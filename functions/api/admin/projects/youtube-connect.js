// GET /api/admin/projects/youtube-connect
//
// Start Google OAuth for the active project. The signed state binds the
// callback to that project; the browser never receives a client secret or
// refresh token.
import { adminGate, requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';
import { json } from '../../../_lib/util.js';
import { getAdminToken } from '../../../_lib/admin_token.js';
import { track } from '../../../_lib/events.js';
import { signState } from '../../../_lib/publishing/facebook_oauth.js';
import {
  getYoutubeClientId, getYoutubeClientSecret, buildYoutubeAuthUrl, youtubeRedirectUri,
} from '../../../_lib/publishing/youtube_oauth.js';

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request);
  if (gate) return gate;

  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;
  if (!pid) return json(400, { error: 'missing_project' });

  const clientId = await getYoutubeClientId(env);
  const clientSecret = await getYoutubeClientSecret(env);
  if (!clientId || !clientSecret) {
    return json(400, {
      error: 'youtube_app_not_configured',
      detail: 'Nhập YouTube Client ID và Client Secret trước khi kết nối.',
    });
  }

  await track(env, { event: 'channel_connect_started', projectId: pid, props: { channel: 'youtube' } });
  const state = await signState(await getAdminToken(env), pid, 'youtube');
  const location = buildYoutubeAuthUrl({
    clientId,
    redirectUri: youtubeRedirectUri(request),
    state,
  });
  return new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store' } });
};

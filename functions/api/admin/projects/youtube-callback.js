// GET /api/admin/projects/youtube-callback?code=…&state=…
//
// Complete Google OAuth, verify the channel, and store the refresh token in
// the project-scoped vault. Only channel metadata and upload settings are
// written to project_channels; access/refresh tokens never reach the browser.
import { adminGate } from '../../../_lib/auth.js';
import { audit } from '../../../_lib/util.js';
import { getAdminToken } from '../../../_lib/admin_token.js';
import { verifyState } from '../../../_lib/publishing/facebook_oauth.js';
import {
  getYoutubeClientId, getYoutubeClientSecret, youtubeRedirectUri,
  exchangeYoutubeCode, saveYoutubeToken, verifyYoutubeChannel,
} from '../../../_lib/publishing/youtube_oauth.js';
import { getChannelConfig, connectChannel } from '../../../_lib/channels.js';
import { track } from '../../../_lib/events.js';

function backToPublishing(status, detail = '') {
  const query = new URLSearchParams({ channels: status });
  if (detail) query.set('channels_detail', detail.slice(0, 180));
  return new Response(null, {
    status: 302,
    headers: { location: `/admin#publishing?${query.toString()}`, 'cache-control': 'no-store' },
  });
}

async function recordResult(env, projectId, status, detail) {
  if (!env?.DB || !projectId) return;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(
    `channel_last_result__${projectId}`,
    JSON.stringify({ channel: 'youtube', status, detail: String(detail || '').slice(0, 200), at: now }),
    now,
  ).run();
}

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request);
  if (gate) return gate;

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error_description') || url.searchParams.get('error');
  const adminToken = await getAdminToken(env);
  const verified = state ? await verifyState(adminToken, state) : null;
  const pid = verified?.projectId || '';

  const done = async (status, detail = '') => {
    await track(env, {
      event: status === 'connected' ? 'channel_connected' : 'channel_connect_failed',
      projectId: pid, props: { channel: 'youtube', status, detail },
    });
    await recordResult(env, pid, status, detail);
    return backToPublishing(status, detail);
  };

  if (errorParam) return done('denied', errorParam);
  if (!code || !state) return done('error', 'Thiếu code hoặc state.');
  if (!verified || verified.channel !== 'youtube') return done('error', 'State YouTube không hợp lệ. Thử lại.');

  try {
    const clientId = await getYoutubeClientId(env);
    const clientSecret = await getYoutubeClientSecret(env);
    if (!clientId || !clientSecret) return done('error', 'Chưa cấu hình YouTube Client ID/Secret.');

    const token = await exchangeYoutubeCode({
      clientId,
      clientSecret,
      redirectUri: youtubeRedirectUri(request),
      code,
    });
    const channelInfo = await verifyYoutubeChannel({ accessToken: token.access_token });
    const savedToken = await saveYoutubeToken(env, pid, token);
    if (!savedToken.refresh_token) {
      return done('error', 'Google không cấp refresh token. Hủy quyền kết nối rồi thử lại.');
    }

    const previous = await getChannelConfig(env, pid, 'youtube');
    await connectChannel(env, pid, 'youtube', {
      ...previous,
      channel_id: channelInfo.id,
      channel_title: channelInfo.title,
      channel_url: channelInfo.url,
      uploads_playlist: channelInfo.uploads_playlist,
      privacy_status: ['public', 'unlisted', 'private'].includes(previous?.privacy_status)
        ? previous.privacy_status
        : 'private',
      as_video: previous?.as_video === true,
    });
    audit(env, 'admin', 'channel_connect', pid, { channel: 'youtube', channel_id: channelInfo.id });
    return done('connected', channelInfo.title || channelInfo.id);
  } catch (error) {
    return done('error', String(error?.message || error).slice(0, 200));
  }
};

// YouTube Data API OAuth 2.0 + token lifecycle.
//
// YouTube upload uses a Google OAuth user token, not a Page-style token.
// Client credentials are platform-wide; the refresh token is project-scoped
// and encrypted in the existing D1 vault. Access tokens are short-lived and
// refreshed immediately before an upload.

import { getVaultSecret, setVaultSecret } from '../secret_vault.js';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const CHANNELS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/channels';

export const YOUTUBE_CLIENT_SECRET_NAME = 'YOUTUBE_CLIENT_SECRET';
export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

export function youtubeRedirectUri(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/admin/projects/youtube-callback`;
}

export function youtubeTokenName(projectId) {
  return `YOUTUBE_TOKEN__${projectId}`;
}

export function buildYoutubeAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: String(clientId || ''),
    redirect_uri: String(redirectUri || ''),
    response_type: 'code',
    scope: YOUTUBE_SCOPES.join(' '),
    state: String(state || ''),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function readSetting(env, key) {
  if (!env?.DB) return '';
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ? LIMIT 1')
    .bind(key).first();
  return String(row?.value || '').trim();
}

async function writeSetting(env, key, value) {
  if (!env?.DB) throw new Error('database_missing');
  const t = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(key, String(value || '').trim(), t).run();
}

export async function getYoutubeClientId(env) {
  if (env?.YOUTUBE_CLIENT_ID && String(env.YOUTUBE_CLIENT_ID).trim()) {
    return String(env.YOUTUBE_CLIENT_ID).trim();
  }
  return readSetting(env, 'youtube_client_id');
}

export async function setYoutubeClientId(env, value) {
  await writeSetting(env, 'youtube_client_id', value);
}

export async function getYoutubeClientSecret(env) {
  if (env?.YOUTUBE_CLIENT_SECRET && String(env.YOUTUBE_CLIENT_SECRET).trim()) {
    return String(env.YOUTUBE_CLIENT_SECRET).trim();
  }
  const value = await getVaultSecret(env, YOUTUBE_CLIENT_SECRET_NAME);
  return value ? String(value).trim() : '';
}

export async function getYoutubeAppState(env) {
  const clientId = await getYoutubeClientId(env);
  const clientSecret = await getYoutubeClientSecret(env);
  return {
    client_id: clientId,
    id_set: !!clientId,
    secret_set: !!clientSecret,
  };
}

export async function readYoutubeToken(env, projectId) {
  if (!env?.DB || !projectId) return null;
  const raw = await getVaultSecret(env, youtubeTokenName(projectId));
  if (!raw) return null;
  try {
    const token = JSON.parse(raw);
    return token && typeof token === 'object' ? token : null;
  } catch (error) {
    const invalid = new Error('youtube_token_invalid');
    invalid.cause = error;
    throw invalid;
  }
}

export async function saveYoutubeToken(env, projectId, token) {
  if (!env?.DB || !projectId) throw new Error('database_missing');
  let previous = null;
  try {
    previous = await readYoutubeToken(env, projectId);
  } catch (error) {
    // A fresh OAuth grant can repair a malformed old vault value. Preserve
    // unexpected vault failures; only the explicit JSON-corruption marker is
    // safe to replace.
    if (error?.message !== 'youtube_token_invalid') throw error;
  }
  const merged = {
    ...previous,
    ...token,
    // Google may omit refresh_token on a reconnect. Keep the old one rather
    // than silently turning a reconnect into an upload-only, one-hour token.
    refresh_token: token.refresh_token || previous?.refresh_token || '',
  };
  if (!merged.refresh_token) throw new Error('youtube_refresh_token_missing');
  await setVaultSecret(env, youtubeTokenName(projectId), JSON.stringify(merged));
  return merged;
}

async function readJsonBody(response, label) {
  if (typeof response?.json === 'function' && typeof response?.text !== 'function') return response.json();
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    const invalid = new Error(`${label || 'oauth'}_response_invalid`);
    invalid.cause = error;
    invalid.google_status = response.status;
    throw invalid;
  }
}

async function postTokenRequest(params) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await readJsonBody(response, 'google_oauth');
  if (!response.ok || data?.error) {
    const detail = data?.error_description || data?.error?.message || `Google OAuth HTTP ${response.status}`;
    const error = new Error(String(detail).slice(0, 300));
    error.google_status = response.status;
    error.google_error = data?.error || null;
    if (data?.error === 'invalid_grant') {
      error.youtube_status = 401;
      error.youtube_error_code = 'invalid_grant';
      error.youtube_credential = true;
    }
    throw error;
  }
  return data;
}

export async function exchangeYoutubeCode({ clientId, clientSecret, redirectUri, code }) {
  if (!clientId || !clientSecret) throw new Error('youtube_app_not_configured');
  const data = await postTokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
    grant_type: 'authorization_code',
  });
  if (!data?.access_token) throw new Error('youtube_access_token_missing');
  return {
    access_token: String(data.access_token),
    refresh_token: data.refresh_token ? String(data.refresh_token) : '',
    expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    scope: String(data.scope || ''),
    token_type: String(data.token_type || 'Bearer'),
  };
}

export async function getYoutubeAccessToken(env, projectId) {
  const token = await readYoutubeToken(env, projectId);
  if (!token?.access_token && !token?.refresh_token) throw new Error('youtube_token_missing');

  // Refresh five minutes early so an upload never starts with a token that
  // expires while the R2 stream is being sent.
  if (token.access_token && token.expires_at && Number(token.expires_at) > Date.now() + 5 * 60 * 1000) {
    return String(token.access_token);
  }
  if (!token.refresh_token) throw new Error('youtube_refresh_token_missing');

  const clientId = await getYoutubeClientId(env);
  const clientSecret = await getYoutubeClientSecret(env);
  if (!clientId || !clientSecret) throw new Error('youtube_app_not_configured');

  const refreshed = await postTokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token',
  });
  if (!refreshed?.access_token) throw new Error('youtube_access_token_missing');
  const merged = await saveYoutubeToken(env, projectId, {
    access_token: String(refreshed.access_token),
    expires_at: Date.now() + (Number(refreshed.expires_in) || 3600) * 1000,
    scope: String(refreshed.scope || token.scope || ''),
  });
  return merged.access_token;
}

export async function verifyYoutubeChannel({ accessToken }) {
  if (!accessToken) throw new Error('youtube_token_missing');
  const params = new URLSearchParams({ part: 'snippet,contentDetails', mine: 'true' });
  const response = await fetch(`${CHANNELS_ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await readJsonBody(response, 'youtube_channel');
  if (!response.ok || data?.error) {
    const detail = data?.error?.message || `YouTube API HTTP ${response.status}`;
    const error = new Error(String(detail).slice(0, 300));
    error.youtube_status = response.status;
    error.youtube_error = data?.error || null;
    const reason = String(data?.error?.errors?.[0]?.reason || data?.error?.status || '');
    error.youtube_error_code = reason;
    error.youtube_credential = response.status === 401
      || ['accessNotConfigured', 'forbidden', 'insufficientPermissions', 'invalidGrant', 'unauthorized'].includes(reason);
    throw error;
  }
  const channel = data?.items?.[0];
  if (!channel?.id) throw new Error('youtube_channel_not_found');
  return {
    id: String(channel.id),
    title: String(channel.snippet?.title || '').slice(0, 150),
    description: String(channel.snippet?.description || '').slice(0, 500),
    url: `https://www.youtube.com/channel/${encodeURIComponent(channel.id)}`,
    uploads_playlist: String(channel.contentDetails?.relatedPlaylists?.uploads || ''),
  };
}

// X (Twitter) publishing via the official X API.
//
// Auth: OAuth 1.0a user context (HMAC-SHA1 signing) — required for media
// upload and accepted by POST /2/tweets. The four credentials live in the
// vault per project:
//   X_API_KEY__<pid>, X_API_SECRET__<pid>,
//   X_ACCESS_TOKEN__<pid>, X_ACCESS_SECRET__<pid>
// They are pasted once in the channel card; "Kiểm tra" calls GET /2/users/me.
//
// Media: POST https://upload.twitter.com/1.1/media/upload.json
// (simple, non-chunked — hero images are ~1MB PNG/JPG). The returned
// media_id_string rides on the tweet's media.media_ids.
//
// Free tier: POST /2/tweets is allowed but heavily rate-limited; a 403/429
// surfaces with the operator-facing message instead of burning retries.
//
// The signer is deliberately dependency-free: percent-encoding + the
// OAuth parameter string, per the spec, with the POST body included in
// the signature (application/x-www-form-urlencoded).

import { getVaultSecret } from '../secret_vault.js';
import { adaptArticleForChannel } from './adapter.js';

const API = 'https://api.twitter.com';
const UPLOAD = 'https://upload.twitter.com';

export const X_TOKEN_NAMES = {
  api_key: (pid) => `X_API_KEY__${pid}`,
  api_secret: (pid) => `X_API_SECRET__${pid}`,
  access_token: (pid) => `X_ACCESS_TOKEN__${pid}`,
  access_secret: (pid) => `X_ACCESS_SECRET__${pid}`,
};

export async function resolveXCredentials(env, projectId) {
  if (!env?.DB) return null;
  const get = async (n) => {
    const scoped = projectId ? await getVaultSecret(env, n(projectId)) : '';
    if (scoped) return String(scoped).trim();
    return '';
  };
  const creds = {
    api_key: await get(X_TOKEN_NAMES.api_key),
    api_secret: await get(X_TOKEN_NAMES.api_secret),
    access_token: await get(X_TOKEN_NAMES.access_token),
    access_secret: await get(X_TOKEN_NAMES.access_secret),
  };
  // Global fallbacks (vault rows without the project suffix) for single-
  // project installs that configured X platform-wide.
  if (!creds.api_key) creds.api_key = (await getVaultSecret(env, 'X_API_KEY')) || '';
  if (!creds.api_secret) creds.api_secret = (await getVaultSecret(env, 'X_API_SECRET')) || '';
  if (!creds.access_token) creds.access_token = (await getVaultSecret(env, 'X_ACCESS_TOKEN')) || '';
  if (!creds.access_secret) creds.access_secret = (await getVaultSecret(env, 'X_ACCESS_SECRET')) || '';
  return creds.api_key && creds.api_secret && creds.access_token && creds.access_secret ? creds : null;
}

// ── percent encoding + HMAC-SHA1 signing ────────────────────────────

function pct(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function hmacSha1Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  let bin = '';
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Build the OAuth 1.0a Authorization header for a request whose params
// (query + body, already percent-encoded) participate in the signature.
export async function oauth1Header({ method, url, creds, params = {} }) {
  const u = new URL(url);
  const oauth = {
    oauth_consumer_key: creds.api_key,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.access_token,
    oauth_version: '1.0',
  };

  const all = { ...params, ...oauth };
  const paramStr = Object.keys(all)
    .sort()
    .map((k) => `${pct(k)}=${pct(all[k])}`)
    .join('&');
  const base = [method.toUpperCase(), pct(`${u.protocol}//${u.host}${u.pathname}`), pct(paramStr)].join('&');
  const signKey = `${pct(creds.api_secret)}&${pct(creds.access_secret)}`;
  oauth.oauth_signature = await hmacSha1Hex(signKey, base);

  const header = Object.keys(oauth)
    .map((k) => `${pct(k)}="${pct(oauth[k])}"`)
    .join(', ');
  return `OAuth ${header}`;
}

// Signed request with urlencoded body (params both sent and signed).
async function signedPost({ url, creds, params }) {
  const authorization = await oauth1Header({ method: 'POST', url, creds, params });
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function describeXError(status, data) {
  const title = data?.title || data?.errors?.[0]?.message || data?.detail || 'unknown error';
  if (status === 401) return `Token X không hợp lệ hoặc đã hết hạn (${title}). Tạo lại Access Token trong X Developer Portal rồi lưu.`;
  if (status === 403) return `X từ chối đăng bài (${title}). App cần quyền "Read and write", và tài khoản không bị hạn chế.`;
  if (status === 429) return `Đã chạm giới hạn tần suất của X (${title}). Free tier rất hẹp — giảm số bài/ngày hoặc nâng gói Basic.`;
  return `X API lỗi (HTTP ${status}): ${title}`;
}

// Read-only probe used by the admin "Kiểm tra" button.
export async function verifyXCredentials({ creds }) {
  const url = `${API}/2/users/me`;
  const authorization = await oauth1Header({ method: 'GET', url, creds, params: {} });
  const res = await fetch(url, { headers: { Authorization: authorization } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(describeXError(res.status, data));
  return { id: data?.data?.id, username: data?.data?.username || '' };
}

async function uploadImage({ creds, bytes, mime }) {
  const url = `${UPLOAD}/1.1/media/upload.json`;
  const params = { command: 'UPLOAD', media_data: bufToBase64(bytes) };
  const authorization = await oauth1Header({ method: 'POST', url, creds, params });
  const form = new FormData();
  form.append('command', 'UPLOAD');
  form.append('media_data', params.media_data);
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authorization },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(describeXError(res.status, data));
  if (!data?.media_id_string) throw new Error('X không trả về media_id sau khi upload ảnh.');
  return data.media_id_string;
}

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export async function publishToX({ project, article, configJson, env }) {
  const creds = await resolveXCredentials(env, project?.id);
  if (!creds) {
    // Missing credentials are a credential failure, not a transient one —
    // x_status=401 makes isCredentialError() park the job with
    // needs_reconnect instead of burning five pointless retries.
    const err = new Error('Chưa lưu API Key / Access Token của X cho dự án này — nhập 4 thông tin trong thẻ kênh X rồi bấm Lưu.');
    err.x_status = 401;
    throw err;
  }

  const payload = adaptArticleForChannel('x', project, article, configJson || {});
  if (payload.kind === 'unsupported') throw new Error(payload.reason);

  const mediaIds = [];
  if (payload.kind === 'photo' && payload.media?.length && env?.IMAGES) {
    // Fetch the hero image from R2 directly — the public /image/ route
    // may not be reachable from this isolate before DNS warm-up.
    const key = String(article?.hero_image_key || '').trim();
    if (key) {
      const obj = await env.IMAGES.get(key).catch(() => null);
      if (obj) {
        const bytes = await obj.arrayBuffer();
        mediaIds.push(await uploadImage({ creds, bytes, mime: obj.httpMetadata?.contentType || 'image/png' }));
      }
    }
  }

  const params = { text: payload.text };
  if (mediaIds.length) params.media_ids = mediaIds.join(',');
  const { status, data } = await signedPost({ url: `${API}/2/tweets`, creds, params });
  if (!status || status >= 400 || data?.errors) throw new Error(describeXError(status, data));
  const tweetId = data?.data?.id;
  if (!tweetId) throw new Error('X không trả về tweet ID.');

  return {
    ok: true,
    type: 'x',
    format: mediaIds.length ? 'photo' : 'text',
    post_id: tweetId,
    post_url: `https://x.com/i/web/status/${tweetId}`,
    link: payload.link,
  };
}

// Facebook OAuth (Facebook Login for Business) — one-click Page connect.
//
// Why this shape: when the person connecting is an admin/developer/tester
// of the Meta app, the app can stay in Development mode and no App Review
// is required. The operator clicks "Kết nối Facebook", approves, and we do
// the token dance server-side:
//
//   code → short-lived user token
//        → long-lived user token            (fb_exchange_token)
//        → GET /me/accounts                 (per-page tokens)
//        → store the chosen Page token
//
// A Page token minted from a *long-lived* user token has no expiry date,
// which is what makes the daily cron durable. That step is the reason the
// App Secret is needed at all — a token copied straight out of Graph
// Explorer is short-lived (~1-2h) and would break the next cron run.
//
// App credentials: App ID is a setting (not secret); App Secret lives in
// the vault.

import { getVaultSecret } from '../secret_vault.js';

const GRAPH = 'https://graph.facebook.com';
const DIALOG = 'https://www.facebook.com';
// Meta retires Graph API versions on a ~2-year clock. Pinning this in code
// means a deploy is required the day it lapses, so the version is a
// setting (facebook_api_version) with a current default — change it from
// the admin UI without touching the Worker.
const DEFAULT_VERSION = 'v23.0';

export const FB_SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'];
// Threads publishes through the same Meta app but its own scopes; adding
// them unconditionally would fail the dialog for apps without a Threads
// use case, so the connect route appends them per requested channel.
export const THREADS_SCOPES = ['threads_basic', 'threads_content_publish'];
export const INSTAGRAM_SCOPES = ['instagram_basic', 'instagram_content_publish'];
export const FB_APP_SECRET_NAME = 'FACEBOOK_APP_SECRET';

export async function getApiVersion(env) {
  if (env?.FACEBOOK_API_VERSION && /^v\d+\.\d+$/.test(String(env.FACEBOOK_API_VERSION).trim())) {
    return String(env.FACEBOOK_API_VERSION).trim();
  }
  if (!env?.DB) return DEFAULT_VERSION;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'facebook_api_version' LIMIT 1").first().catch(() => null);
  const v = String(row?.value || '').trim();
  return /^v\d+\.\d+$/.test(v) ? v : DEFAULT_VERSION;
}

export function fbRedirectUri(request) {
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}/api/admin/projects/fb-callback`;
}

export function buildAuthUrl({ appId, redirectUri, state, version = DEFAULT_VERSION, scopes = null }) {
  const p = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    scope: (scopes && scopes.length ? scopes : FB_SCOPES).join(','),
  });
  return `${DIALOG}/${version}/dialog/oauth?${p.toString()}`;
}

async function graphGet(path, params = {}, version = DEFAULT_VERSION) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}/${version}/${path}${q ? '?' + q : ''}`);
  const data = await res.json().catch(() => ({}));
  if (data?.error) {
    const err = new Error(data.error.message || 'graph_error');
    err.graph = data.error;
    throw err;
  }
  if (!res.ok) throw new Error(`Facebook HTTP ${res.status}`);
  return data;
}

// Exchange the OAuth code for a user access token.
export async function exchangeCodeForToken({ appId, appSecret, redirectUri, code, version }) {
  const data = await graphGet('oauth/access_token', {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  }, version);
  if (!data?.access_token) throw new Error('Không nhận được access token từ Facebook.');
  return data.access_token;
}

// Swap a short-lived user token for a long-lived one (~60 days, refreshed
// on use). Required before /me/accounts if we want non-expiring Page
// tokens.
export async function exchangeForLongLived({ appId, appSecret, shortToken, version }) {
  const data = await graphGet('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  }, version);
  return data?.access_token || shortToken;
}

// Pages the token holder can act on, with per-Page tokens and tasks.
//
// Pages Meta withholds a per-Page token for are kept, flagged `has_token`.
// Dropping them made the picker come back empty for an operator whose Page
// permissions had changed — indistinguishable from "this login manages no
// Pages", and it left the already-connected Page invisible on reconnect.
export async function listManagedPages(userToken, version) {
  const data = await graphGet('me/accounts', {
    access_token: userToken,
    fields: 'id,name,access_token,tasks,fan_count,link,picture{url}',
    limit: 100,
  }, version);
  return (data?.data || [])
    .filter((p) => p?.id)
    .map((p) => ({ ...p, has_token: !!p.access_token }));
}

// A Page token used as `access_token` makes /me resolve to the Page, so
// this doubles as "which Page is this token for?" — no App Secret needed.
export async function resolveTokenPage(pageToken) {
  return graphGet('me', {
    access_token: pageToken,
    fields: 'id,name,fan_count,link',
  });
}

// ── app credentials ────────────────────────────────────────────────
export async function getAppId(env) {
  if (env?.FACEBOOK_APP_ID && String(env.FACEBOOK_APP_ID).trim()) return String(env.FACEBOOK_APP_ID).trim();
  if (!env?.DB) return '';
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'facebook_app_id' LIMIT 1").first().catch(() => null);
  return String(row?.value || '').trim();
}

export async function setAppId(env, value) {
  const v = String(value || '').trim();
  const t = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('facebook_app_id', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(v, t).run();
}

export async function getAppSecret(env) {
  if (env?.FACEBOOK_APP_SECRET && String(env.FACEBOOK_APP_SECRET).trim()) return String(env.FACEBOOK_APP_SECRET).trim();
  const v = await getVaultSecret(env, FB_APP_SECRET_NAME);
  return v ? String(v).trim() : '';
}

// ── signed state ───────────────────────────────────────────────────
// The OAuth redirect comes back from facebook.com, so we can't rely on
// anything the browser sends except the URL. Bind the project id with an
// HMAC keyed off the admin token so a forged callback can't point at
// someone else's project.
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signState(adminToken, projectId, channel = 'facebook') {
  const nonce = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const payload = `${projectId}.${channel}.${nonce}`;
  const sig = await hmacHex(adminToken, payload);
  return `${payload}.${sig}`;
}

// Accepts both the legacy 3-part state (projectId.nonce.sig) and the
// 4-part one that carries the channel, so an old in-flight dialog can
// still complete after a deploy.
export async function verifyState(adminToken, state) {
  const parts = String(state || '').split('.');
  if (parts.length === 3) {
    const [projectId, nonce, sig] = parts;
    const expect = await hmacHex(adminToken, `${projectId}.${nonce}`);
    if (sig !== expect) return null;
    return { projectId, channel: 'facebook' };
  }
  if (parts.length === 4) {
    const [projectId, channel, nonce, sig] = parts;
    const expect = await hmacHex(adminToken, `${projectId}.${channel}.${nonce}`);
    if (sig !== expect) return null;
    return { projectId, channel };
  }
  return null;
}

// ── pending Page tokens ────────────────────────────────────────────
// Between "callback received the page list" and "operator picked one",
// the tokens live encrypted in the vault under a project-scoped key with
// a short TTL. They are never sent to the browser.
const PENDING_TTL_SEC = 15 * 60;

export function pendingKey(projectId) {
  return `FACEBOOK_PENDING_PAGES__${projectId}`;
}

export async function savePendingPages(env, projectId, pages) {
  const slim = pages.map((p) => ({
    id: p.id, name: p.name, fan_count: p.fan_count || 0,
    link: p.link || '', picture: p.picture?.data?.url || '',
    tasks: p.tasks || [], token: p.access_token,
  }));
  const { setVaultSecret } = await import('../secret_vault.js');
  await setVaultSecret(env, pendingKey(projectId), JSON.stringify({
    saved_at: Math.floor(Date.now() / 1000), pages: slim,
  }));
}

export async function readPendingPages(env, projectId) {
  const { getVaultSecret } = await import('../secret_vault.js');
  const raw = await getVaultSecret(env, pendingKey(projectId));
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed?.pages) return null;
  if (Math.floor(Date.now() / 1000) - (parsed.saved_at || 0) > PENDING_TTL_SEC) return null;
  return parsed.pages;
}

export async function clearPendingPages(env, projectId) {
  const { setVaultSecret } = await import('../secret_vault.js');
  await setVaultSecret(env, pendingKey(projectId), '');
}

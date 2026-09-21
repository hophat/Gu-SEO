// Threads publishing via the official Threads API (graph.threads.net).
//
// Same Meta app as Facebook/Instagram; the operator approves the
// threads_basic + threads_content_publish scopes during the same
// "Kết nối" flow. The user access token is exchanged for a long-lived
// one at connect time (GET /access_token with client_secret) and stored
// in the vault under THREADS_TOKEN__<project_id>.
//
// Flow (documented contract, v1.0):
//   1. POST /{threads-user-id}/threads        → { id: container }
//      media_type TEXT | IMAGE | VIDEO; text ≤ 500 chars; the first URL
//      in text becomes the link preview
//   2. POST /{threads-user-id}/threads_publish?creation_id=…  → { id }
//
// The threads_user_id comes from the channel config; when absent we read
// GET /me/threads_profile (Threads' self endpoint for the token holder).

import { getVaultSecret } from '../secret_vault.js';
import { getApiVersion } from './facebook_oauth.js';
import { describeGraphError } from './facebook.js';
import { adaptArticleForChannel } from './adapter.js';

const GRAPH = 'https://graph.threads.net';

export function threadsTokenName(projectId) {
  return `THREADS_TOKEN__${projectId}`;
}

async function resolveThreadsToken(env, projectId) {
  if (!env?.DB) return '';
  const scoped = projectId ? await getVaultSecret(env, threadsTokenName(projectId)) : '';
  if (scoped) return String(scoped).trim();
  const global = await getVaultSecret(env, 'THREADS_TOKEN');
  return global ? String(global).trim() : '';
}

function graphError(errBody) {
  const err = new Error(describeGraphError(errBody || {}));
  err.graph = errBody || {};
  return err;
}

async function threadsPost(path, params, version = 'v1.0') {
  const res = await fetch(`${GRAPH}/${version}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (data?.error) throw graphError(data.error);
  if (!res.ok) throw new Error(`Threads HTTP ${res.status}`);
  return data;
}

async function threadsGet(path, params, version = 'v1.0') {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}/${version}/${path}${q ? '?' + q : ''}`);
  const data = await res.json().catch(() => ({}));
  if (data?.error) throw graphError(data.error);
  if (!res.ok) throw new Error(`Threads HTTP ${res.status}`);
  return data;
}

// Token-level probe for the admin "Kiểm tra" button.
export async function verifyThreadsToken({ token }) {
  const me = await threadsGet('me/threads_profile', { access_token: token, fields: 'id,username,threads_profile_picture_url' });
  return { id: me?.id, username: me?.username || '' };
}

// Returns { id, username } — the username is only used to build the
// human-facing post URL; publishing itself keys on the id.
async function resolveThreadsUser({ cfg, token }) {
  const explicit = String(cfg?.threads_user_id || cfg?.user_id || '').trim();
  if (explicit) return { id: explicit, username: String(cfg?.username || '').trim() };
  const me = await threadsGet('me/threads_profile', { access_token: token, fields: 'id,username' });
  if (!me?.id) throw new Error('Không xác định được Threads user ID từ token — Kết nối lại kênh Threads.');
  return { id: me.id, username: String(me?.username || '').trim() };
}

export async function publishToThreads({ project, article, configJson, env }) {
  const cfg = typeof configJson === 'string' ? safeParse(configJson) : (configJson || {});
  const token = await resolveThreadsToken(env, project?.id);
  if (!token) throw new Error('Chưa lưu Threads token cho dự án này — bấm Kết nối Threads để cấp quyền threads_content_publish.');

  const user = await resolveThreadsUser({ cfg, token });
  const payload = adaptArticleForChannel('threads', project, article, cfg);
  if (payload.kind === 'unsupported') throw new Error(payload.reason);

  const params = { access_token: token };
  if (payload.kind === 'photo' && payload.media?.length) {
    params.media_type = 'IMAGE';
    params.image_url = payload.media[0];
    params.text = payload.text;
  } else {
    params.media_type = 'TEXT';
    params.text = payload.text;
  }

  const container = await threadsPost(`${user.id}/threads`, params);
  const creationId = container?.id;
  if (!creationId) throw new Error('Threads không trả về media container ID.');

  // Threads recommends waiting for container processing; a short delay
  // avoids the "container not ready" publish error without blocking long.
  await new Promise((r) => setTimeout(r, 3000));

  const published = await threadsPost(`${user.id}/threads_publish`, {
    creation_id: creationId,
    access_token: token,
  });

  return {
    ok: true,
    type: 'threads',
    format: payload.kind === 'photo' ? 'photo' : 'text',
    post_id: published?.id || creationId,
    post_url: published?.id
      ? `https://www.threads.net/${user.username ? `@${user.username}` : ''}/post/${published.id}`
      : null,
    link: payload.link,
  };
}

function safeParse(json) {
  try { return JSON.parse(json || '{}') || {}; } catch { return {}; }
}

// Instagram publishing via the official Instagram Graph API.
//
// Requirements the operator must meet (the UI says this too):
//   - Instagram account switched to Business/Creator
//   - linked to the Facebook Page the project already connected
//   - the Meta app holds instagram_basic + instagram_content_publish
//
// Token: the Facebook Page token stored for the project doubles as the
// IG credentials (a Page token covers the linked IG account). If the
// channel config names an explicit ig_user_id we post there; otherwise
// we resolve it from the Page (/{page-id}?fields=instagram_business_account).
//
// Flow: POST /{ig-user-id}/media (image_url must be public) →
//       POST /{ig-user-id}/media_publish?creation_id=…
// Instagram enforces ~50 API-published posts/24h — surfaced through the
// standard Graph error mapping, no special casing here.

import { getVaultSecret } from '../secret_vault.js';
import { getApiVersion } from './facebook_oauth.js';
import { describeGraphError } from './facebook.js';
import { adaptArticleForChannel } from './adapter.js';

const GRAPH = 'https://graph.facebook.com';

export function instagramTokenName(projectId) {
  return `FACEBOOK_PAGE_TOKEN__${projectId}`;
}

async function resolveIgToken(env, projectId) {
  if (!env?.DB) return '';
  const scoped = projectId ? await getVaultSecret(env, instagramTokenName(projectId)) : '';
  if (scoped) return String(scoped).trim();
  const global = await getVaultSecret(env, 'FACEBOOK_PAGE_TOKEN');
  return global ? String(global).trim() : '';
}

// Explicit config first; otherwise ask the Page for its linked IG account.
async function resolveIgUserId({ env, projectId, pageId, token, version }) {
  if (pageId) {
    const res = await fetch(`${GRAPH}/${version}/${pageId}?fields=instagram_business_account&access_token=${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (data?.error) {
      const err = new Error(describeGraphError(data.error));
      err.graph = data.error;
      throw err;
    }
    const ig = data?.instagram_business_account?.id;
    if (ig) return ig;
  }
  // No Page config or the Page has no linked IG account: try /me/accounts
  // so the error can name what exists instead of just failing.
  const res2 = await fetch(`${GRAPH}/${version}/me/accounts?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(token)}`);
  const data2 = await res2.json().catch(() => ({}));
  if (data2?.error) {
    const err = new Error(describeGraphError(data2.error));
    err.graph = data2.error;
    throw err;
  }
  const found = (data2?.data || []).find((p) => p?.instagram_business_account?.id);
  if (!found) {
    throw new Error('Không tìm thấy tài khoản Instagram Business nào gắn với Page. Chuyển Instagram sang Business/Creator và liên kết với Page trong app Instagram → Settings → Business tools.');
  }
  return found.instagram_business_account.id;
}

function graphError(errBody) {
  const err = new Error(describeGraphError(errBody || {}));
  err.graph = errBody || {};
  return err;
}

async function graphPost(path, params, version) {
  const res = await fetch(`${GRAPH}/${version}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (data?.error) throw graphError(data.error);
  if (!res.ok) throw new Error(`Instagram HTTP ${res.status}`);
  return data;
}

export async function publishToInstagram({ project, article, configJson, env }) {
  const cfg = typeof configJson === 'string' ? safeParse(configJson) : (configJson || {});
  const token = await resolveIgToken(env, project?.id);
  if (!token) throw new Error('Chưa lưu Facebook Page Access Token cho dự án này — Instagram dùng chung token với Facebook (yêu cầu tài khoản IG Business gắn với Page).');

  const version = await getApiVersion(env);
  const igUserId = await resolveIgUserId({
    env, projectId: project?.id, pageId: String(cfg.page_id || '').trim(), token, version,
  });

  const payload = adaptArticleForChannel('instagram', project, article, cfg);
  if (payload.kind === 'unsupported') throw new Error(payload.reason);

  const container = await graphPost(`${igUserId}/media`, {
    image_url: payload.media[0],
    caption: payload.text,
    access_token: token,
  }, version);
  const creationId = container?.id;
  if (!creationId) throw new Error('Instagram không trả về media container ID.');

  const published = await graphPost(`${igUserId}/media_publish`, {
    creation_id: creationId,
    access_token: token,
  }, version);

  return {
    ok: true,
    type: 'instagram',
    format: 'photo',
    post_id: published?.id || creationId,
    post_url: published?.id ? `https://www.instagram.com/p/${published.id}/` : null,
    link: payload.link,
  };
}

function safeParse(json) {
  try { return JSON.parse(json || '{}') || {}; } catch { return {}; }
}

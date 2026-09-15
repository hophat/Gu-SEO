// Facebook Page publishing via the official Graph API.
//
// This is the supported route: create a Meta app (free), grant it
// pages_manage_posts, and post to /{page-id}/feed with a Page Access
// Token. No App Review is needed to post to pages you administer — the
// app can stay in Development mode while the token belongs to an admin
// of the app.
//
// What we deliberately do NOT do: drive facebook.com through a stored
// session cookie or a reverse-engineered endpoint. Those break on every
// UI change and get the account restricted, which is a worse outcome
// than not posting at all.
//
// Token storage: the vault (AES-GCM, keyed off ADMIN_TOKEN), under
//   FACEBOOK_PAGE_TOKEN__<project_id>   per project
//   FACEBOOK_PAGE_TOKEN                 global fallback
// It is never written to project_publishing_configs, which is plaintext.

import { getVaultSecret } from '../secret_vault.js';
import { getApiVersion } from './facebook_oauth.js';

const GRAPH = 'https://graph.facebook.com';

export function facebookTokenName(projectId) {
  return `FACEBOOK_PAGE_TOKEN__${projectId}`;
}

// Resolve the page token: project-scoped first, then the global one.
export async function resolveFacebookToken(env, projectId) {
  if (!env?.DB) return '';
  const scoped = projectId ? await getVaultSecret(env, facebookTokenName(projectId)) : '';
  if (scoped) return String(scoped).trim();
  const global = await getVaultSecret(env, 'FACEBOOK_PAGE_TOKEN');
  return global ? String(global).trim() : '';
}

export function parseFacebookConfig(configJson) {
  let cfg = {};
  try { cfg = typeof configJson === 'string' ? JSON.parse(configJson || '{}') : (configJson || {}); } catch { cfg = {}; }
  return {
    pageId: String(cfg.page_id || '').trim(),
    // Empty means "use the deployment's configured Graph API version" —
    // resolved per request so a version bump needs no redeploy.
    apiVersion: /^v\d+\.\d+$/.test(String(cfg.api_version || '')) ? String(cfg.api_version) : '',
    // Photo posts surface a large image; link posts let Facebook unfurl
    // the page's OG tags. Link posts are the safe default because they
    // also carry the title/description without us re-sending them.
    asPhoto: cfg.as_photo === true,
    messageTemplate: String(cfg.message_template || '').trim(),
  };
}

// Public base for a project: custom domain wins, otherwise the stored
// publishing_url (which already carries the /<slug> prefix).
export function projectPublicBase(project) {
  const cd = String(project?.custom_domain || '').trim();
  if (cd) return `https://${cd.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  return String(project?.publishing_url || project?.website_url || '').replace(/\/+$/, '');
}

// The R2 image route is mounted at the origin root (/image/<key>), not
// under the project prefix, so it needs the origin rather than the base.
function projectOrigin(project) {
  const base = projectPublicBase(project);
  try { return new URL(base).origin; } catch { return ''; }
}

export function buildFacebookMessage(article, cfg) {
  const title = String(article?.title || '').trim();
  const desc = String(article?.meta_description || '').trim();
  if (cfg.messageTemplate) {
    return cfg.messageTemplate
      .replace(/\{title\}/g, title)
      .replace(/\{description\}/g, desc)
      .replace(/\{url\}/g, '')
      .trim();
  }
  // Facebook shows the link's OG title/description itself, so repeating
  // them in the message reads as spam. Keep the message short.
  return desc ? desc.slice(0, 400) : title;
}

// Facebook answers 200 with an {error} body for many failures, so a
// bare res.ok check would silently "succeed".
async function graphFetch(path, params) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (data?.error) {
    const err = new Error(describeGraphError(data.error));
    err.graph = data.error;
    throw err;
  }
  if (!res.ok) throw new Error(`Facebook HTTP ${res.status}`);
  return data;
}

export function describeGraphError(error) {
  const code = error?.code;
  const sub = error?.error_subcode;
  const msg = error?.message || 'unknown error';
  // 190 = bad/expired token. This is the failure operators hit most, and
  // the raw message ("Session has expired") doesn't say what to do.
  if (code === 190) {
    if (sub === 463) return `Token Facebook đã hết hạn (${msg}). Tạo lại Page Access Token trong Graph API Explorer rồi lưu lại.`;
    if (sub === 467) return `Token Facebook không hợp lệ hoặc đã bị thu hồi (${msg}). Kiểm tra bạn còn là admin của Page.`;
    return `Token Facebook không hợp lệ (${msg}). Tạo Page Access Token mới và lưu lại.`;
  }
  // 200/10 = missing permission.
  if (code === 200 || code === 10) {
    return `App chưa có quyền đăng bài lên Page (${msg}). Cần pages_manage_posts + pages_read_engagement và token phải của admin Page.`;
  }
  if (code === 368) return `Page tạm bị hạn chế đăng bài (${msg}). Thử lại sau.`;
  if (code === 4 || code === 17 || code === 32) return `Đã chạm giới hạn tần suất của Facebook (${msg}). Giảm số bài/ngày.`;
  return `Facebook lỗi (code ${code}): ${msg}`;
}

export async function publishToFacebook({ project, article, configJson, env }) {
  const cfg = parseFacebookConfig(configJson);
  if (!cfg.pageId) throw new Error('Thiếu Page ID trong cấu hình kênh Facebook.');

  const token = await resolveFacebookToken(env, project?.id);
  if (!token) throw new Error('Chưa lưu Page Access Token cho dự án này.');

  const base = projectPublicBase(project);
  if (!base) throw new Error('Dự án chưa có URL xuất bản để tạo link bài viết.');
  const link = `${base}/blog/${article.slug}`;
  const message = buildFacebookMessage(article, cfg);

  const imageUrl = article.hero_image_key ? `${projectOrigin(project)}/image/${article.hero_image_key}` : '';
  const version = cfg.apiVersion || await getApiVersion(env);

  if (cfg.asPhoto && imageUrl) {
    const data = await graphFetch(`${version}/${cfg.pageId}/photos`, {
      url: imageUrl,
      caption: message,
      access_token: token,
    });
    return {
      ok: true,
      type: 'facebook',
      format: 'photo',
      post_id: data.id,
      post_url: `https://www.facebook.com/${data.post_id || data.id}`,
      link,
    };
  }

  const data = await graphFetch(`${version}/${cfg.pageId}/feed`, {
    message,
    link,
    access_token: token,
  });
  return {
    ok: true,
    type: 'facebook',
    format: 'link',
    post_id: data.id,
    post_url: data.id ? `https://www.facebook.com/${data.id}` : null,
    link,
  };
}

// Read-only probe used by the admin "Kiểm tra kết nối" button. Confirms
// the token is valid AND belongs to the page we think it does, which is
// the mistake operators actually make (pasting a User token or another
// page's token).
export async function verifyFacebookPage({ env, projectId, pageId, token }) {
  const cfgPageId = String(pageId || '').trim();
  if (!cfgPageId) throw new Error('Thiếu Page ID.');
  const tok = String(token || '').trim() || await resolveFacebookToken(env, projectId);
  if (!tok) throw new Error('Chưa có Page Access Token.');

  const url = `${GRAPH}/${await getApiVersion(env)}/${cfgPageId}?fields=id,name,fan_count,link&access_token=${encodeURIComponent(tok)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (data?.error) {
    const err = new Error(describeGraphError(data.error));
    err.graph = data.error;
    throw err;
  }
  if (!res.ok) throw new Error(`Facebook HTTP ${res.status}`);
  return { page_id: data.id, name: data.name, fan_count: data.fan_count, link: data.link };
}

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
import { getApiVersion, resolveTokenPage } from './facebook_oauth.js';

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
    // When the post has a rendered 9:16 video (video_jobs done), as_video
    // uploads it to /{page-id}/videos instead of a plain link post. The
    // article URL goes into the description — video posts don't unfurl.
    asVideo: cfg.as_video === true,
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
    // Meta documents 492 as "user associated with the Page access token does
    // not have an appropriate role on the Page" — a role change, not a stale
    // token, so telling the operator to mint a new one wastes their time.
    if (sub === 492) return `Tài khoản gắn với token không còn vai trò phù hợp trên Page (${msg}). Khôi phục quyền quản trị/đăng bài trên Page rồi Kết nối lại.`;
    return `Token Facebook không hợp lệ (${msg}). Tạo Page Access Token mới và lưu lại.`;
  }
  // 100/33 has no published meaning; in practice it is the same "this token
  // cannot load this object" class as 190 — wrong Page, or a reduced grant.
  if (code === 100 && sub === 33) {
    return `Facebook không cho token hiện tại truy cập đối tượng này (${msg}). Kiểm tra token có đúng Page đang cấu hình không.`;
  }
  // 200/10 = missing permission.
  if (code === 200 || code === 10) {
    return `App chưa có quyền đăng bài lên Page (${msg}). Cần pages_manage_posts + pages_read_engagement và token phải của admin Page.`;
  }
  if (code === 368) return `Page tạm bị hạn chế đăng bài (${msg}). Thử lại sau.`;
  if (code === 4 || code === 17 || code === 32) return `Đã chạm giới hạn tần suất của Facebook (${msg}). Giảm số bài/ngày.`;
  return `Facebook lỗi (code ${code}): ${msg}`;
}

// Same wording as describeGraphError, except for code 190: Meta uses that code
// for an expired token, a revoked token, AND for a token that simply belongs to
// a different Page than the one being posted to. /me with the Page token
// resolves to that Page, so one extra call tells the three apart and the
// operator gets the real cause instead of "create a new token".
async function explainTokenFailure({ pageId, token, error }) {
  const base = describeGraphError(error);
  // 190 is the documented code, but this failure also surfaces as 100/33.
  const ambiguous = error?.code === 190 || (error?.code === 100 && error?.error_subcode === 33);
  if (!ambiguous || !token) return base;
  try {
    const own = await resolveTokenPage(token);
    if (!own?.id) return `${base} Token không truy cập được Page nào — khả năng đã bị thu hồi.`;
    if (String(own.id) !== String(pageId)) {
      return `Token này thuộc Page "${own.name || own.id}" (${own.id}), nhưng cấu hình đang trỏ Page ${pageId}. Dán token của đúng Page, hoặc sửa Page ID cho khớp.`;
    }
    return `Token đúng Page "${own.name || own.id}" nhưng Facebook vẫn từ chối (${error.message}). Kiểm tra quyền pages_manage_posts của app và vai trò của bạn trên Page.`;
  } catch {
    return `${base} Không đọc được Page từ token — token có thể đã hết hạn hoặc bị thu hồi.`;
  }
}

export async function publishToFacebook({ project, article, configJson, env }) {
  const cfg = parseFacebookConfig(configJson);

  // A rejected Page token reports code 190 for several different causes; ask
  // /me with the token itself so the operator is told which Page it belongs to
  // instead of being sent to make a new token that was never the problem.
  const post = async (path, params) => {
    try {
      return await graphFetch(path, params);
    } catch (err) {
      throw new Error(await explainTokenFailure({ pageId: cfg.pageId, token: params.access_token, error: err.graph || {} }));
    }
  };
  if (!cfg.pageId) throw new Error('Thiếu Page ID trong cấu hình kênh Facebook.');

  const token = await resolveFacebookToken(env, project?.id);
  if (!token) throw new Error('Chưa lưu Page Access Token cho dự án này.');

  const base = projectPublicBase(project);
  if (!base) throw new Error('Dự án chưa có URL xuất bản để tạo link bài viết.');
  const link = `${base}/blog/${article.slug}`;
  const message = buildFacebookMessage(article, cfg);

  const imageUrl = article.hero_image_key ? `${projectOrigin(project)}/image/${article.hero_image_key}` : '';
  const version = cfg.apiVersion || await getApiVersion(env);

  // Video post — the 9:16 MP4 the video agent delivered into R2. Fetched
  // from R2 (not over HTTP) so the upload works even before DNS/CDN warm.
  // Facebook does not unfurl links on video posts, so the article URL is
  // appended to the description explicitly.
  if (cfg.asVideo && article.video_key && env?.IMAGES) {
    return publishFacebookVideo({ project, article, configJson, env });
  }

  if (cfg.asPhoto && imageUrl) {
    const data = await post(`${version}/${cfg.pageId}/photos`, {
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

  const data = await post(`${version}/${cfg.pageId}/feed`, {
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

// Upload the rendered 9:16 MP4 to the Page as a video post. Used by the
// `facebook_video` social channel (auto-enqueued when a video finishes
// rendering and the channel config has as_video, and by the manual
// "Đăng Facebook" button on the Video page). Requires the article to
// carry video_key; the article URL rides in the description because
// video posts do not unfurl links.
export async function publishFacebookVideo({ project, article, configJson, env }) {
  const cfg = parseFacebookConfig(configJson);
  if (!cfg.pageId) throw new Error('Thiếu Page ID trong cấu hình kênh Facebook.');
  if (!article?.video_key) throw new Error('Bài viết chưa có video đã render (video_key trống).');

  const token = await resolveFacebookToken(env, project?.id);
  if (!token) throw new Error('Chưa lưu Page Access Token cho dự án này.');

  const base = projectPublicBase(project);
  if (!base) throw new Error('Dự án chưa có URL xuất bản để tạo link bài viết.');
  const link = `${base}/blog/${article.slug}`;
  const message = buildFacebookMessage(article, cfg);

  const obj = await env.IMAGES.get(article.video_key);
  if (!obj) throw new Error(`Video ${article.video_key} không còn trong R2 — render lại trước khi đăng.`);
  const bytes = await obj.arrayBuffer();

  const version = cfg.apiVersion || await getApiVersion(env);
  const form = new FormData();
  form.append('description', message ? `${message}\n\n${link}` : link);
  form.append('access_token', token);
  form.append('source', new Blob([bytes], { type: 'video/mp4' }), 'video.mp4');
  const res = await fetch(`${GRAPH}/${version}/${cfg.pageId}/videos`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (data?.error) {
    const err = new Error(await explainTokenFailure({ pageId: cfg.pageId, token, error: data.error }));
    err.graph = data.error;
    throw err;
  }
  if (!res.ok) throw new Error(`Facebook HTTP ${res.status}`);
  return {
    ok: true,
    type: 'facebook',
    format: 'video',
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
    const err = new Error(await explainTokenFailure({ pageId: cfgPageId, token: tok, error: data.error }));
    err.graph = data.error;
    throw err;
  }
  if (!res.ok) throw new Error(`Facebook HTTP ${res.status}`);
  return { page_id: data.id, name: data.name, fan_count: data.fan_count, link: data.link };
}

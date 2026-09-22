// POST /api/admin/video/presenter
//   Body: { filename, content_type, base64 }
//
// Uploads the talking-head photo for presenter templates (news_anchor)
// to R2 and points projects.presenter_image_url at it. Same auth scoping
// as projects/logo.js — the caller's active project only, so a project
// admin can only replace their own presenter. JSON base64 rather than
// multipart so the admin UI reuses one file-reading helper.
import { json, newId, nowSec, audit } from '../../../_lib/util.js';
import { requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

function extFor(mime) {
  return ({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  })[mime] || 'bin';
}

// The R2 key contains literal "/" segments and the /image/ route reads
// those as distinct path params. encodeURIComponent on the whole string
// would turn each "/" into "%2F" and the route 404s, so encode per
// segment and re-join.
function imageUrlFor(key) {
  return '/image/' + key.split('/').map(encodeURIComponent).join('/');
}

function decodeBase64(b64) {
  const m = String(b64 || '').match(/^data:[^;]+;base64,(.+)$/i);
  const raw = m ? m[1] : String(b64 || '');
  const bin = atob(raw.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const onRequestPost = async ({ env, request }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });
  const tenant = await resolveTenantContext(env, request, auth);
  if (!tenant || !tenant.activeProjectId) {
    return json(400, { error: 'missing_or_invalid_project' });
  }
  if (!env.IMAGES) return json(500, { error: 'r2_binding_missing' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const mime = String(body?.content_type || '').toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return json(400, { error: 'unsupported_mime', allowed: [...ALLOWED_MIME] });
  }

  let bytes;
  try { bytes = decodeBase64(body?.base64); }
  catch { return json(400, { error: 'base64_decode_failed' }); }
  if (!bytes.length) return json(400, { error: 'empty_body' });
  if (bytes.length > MAX_BYTES) {
    return json(413, { error: 'too_large', max_bytes: MAX_BYTES, got_bytes: bytes.length });
  }

  const key = `project/${tenant.activeProjectId}/presenter/${newId()}.${extFor(mime)}`;
  try {
    await env.IMAGES.put(key, bytes, {
      httpMetadata: {
        contentType: mime,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    return json(500, { error: 'r2_put_failed', detail: String(e?.message || e).slice(0, 200) });
  }

  const presenterUrl = imageUrlFor(key);
  await env.DB.prepare(
    `UPDATE projects SET presenter_image_url = ?, updated_at = ? WHERE id = ?`
  ).bind(presenterUrl, nowSec(), tenant.activeProjectId).run();

  audit(env, 'admin', 'video.presenter_upload', tenant.activeProjectId, {
    mime,
    size_bytes: bytes.length,
    filename: String(body?.filename || '').slice(0, 200),
  });

  return json(200, { ok: true, presenter_image_url: presenterUrl });
};

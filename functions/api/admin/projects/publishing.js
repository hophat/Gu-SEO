// Publishing-channel configuration for a project.
//
//   GET  /api/admin/projects/publishing?project_id=X
//        → { publisher_type, endpoint_url, config, token: { set, source } }
//          Never returns the token itself.
//
//   POST /api/admin/projects/publishing
//        { project_id, publisher_type, endpoint_url?, auth_header?, config?, token? }
//        → saves the channel. `token` (when present) is encrypted into the
//          vault, not into project_publishing_configs, which is plaintext.
//
//   POST /api/admin/projects/publishing   { action: 'test', ... }
//        → verifies the Facebook page + token before anything is published.
//
// Token write semantics: omitting `token` leaves the stored one alone;
// sending "" clears it. That way the UI can save other fields without
// forcing the operator to re-paste the token.
import { json, audit } from '../../../_lib/util.js';
import { adminGate, requireAdminAsync, requireSuperAdmin, resolveTenantContext } from '../../../_lib/auth.js';
import { setVaultSecret, getVaultSecret } from '../../../_lib/secret_vault.js';
import { track } from '../../../_lib/events.js';
import {
  facebookTokenName, resolveFacebookToken, parseFacebookConfig, verifyFacebookPage,
} from '../../../_lib/publishing/facebook.js';
import {
  getAppId, setAppId, getAppSecret, readPendingPages, clearPendingPages,
  FB_APP_SECRET_NAME, getApiVersion,
} from '../../../_lib/publishing/facebook_oauth.js';

const PUBLISHER_TYPES = ['internal_d1', 'webhook', 'custom_api', 'wordpress', 'facebook'];

function safeConfigJson(config) {
  if (config == null) return '{}';
  const obj = typeof config === 'string' ? (() => { try { return JSON.parse(config); } catch { return {}; } })() : config;
  const j = JSON.stringify(obj || {});
  if (j.length > 8 * 1024) throw new Error('config_too_large');
  return j;
}

async function loadRow(env, projectId) {
  return env.DB.prepare(
    `SELECT project_id, publisher_type, endpoint_url, auth_header, config_json
       FROM project_publishing_configs WHERE project_id = ? LIMIT 1`
  ).bind(projectId).first().catch(() => null);
}

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;
  if (!pid) return json(400, { error: 'missing_project' });

  const row = await loadRow(env, pid);
  let config = {};
  try { config = JSON.parse(row?.config_json || '{}'); } catch { /* default */ }

  const scoped = await getVaultSecret(env, facebookTokenName(pid));
  const global = scoped ? '' : await getVaultSecret(env, 'FACEBOOK_PAGE_TOKEN');

  const appId = await getAppId(env);
  const appSecret = await getAppSecret(env);
  // Pending Page list is only a count here — the tokens stay server-side
  // and are fetched through the `pages` action when the picker opens.
  const pending = await readPendingPages(env, pid).catch(() => null);

  // One-shot: the OAuth callback parks its outcome here because the SPA's
  // hash router can't carry a query string. Read it, then clear it.
  let lastResult = null;
  try {
    const row2 = await env.DB.prepare('SELECT value FROM settings WHERE key = ? LIMIT 1')
      .bind(`facebook_last_result__${pid}`).first();
    if (row2?.value) {
      lastResult = JSON.parse(row2.value);
      await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(`facebook_last_result__${pid}`).run();
    }
  } catch { /* non-fatal */ }

  return json(200, {
    ok: true,
    project_id: pid,
    publisher_type: row?.publisher_type || 'internal_d1',
    endpoint_url: row?.endpoint_url || '',
    auth_header: row?.auth_header ? 'set' : '',
    config,
    // Status only — never the plaintext token.
    token: {
      set: !!(scoped || global),
      source: scoped ? 'project' : (global ? 'global' : 'unset'),
    },
    app: { app_id: appId, api_version: await getApiVersion(env), id_set: !!appId, secret_set: !!appSecret },
    // A tenant may connect their own Page but must not touch the shared
    // Meta app credentials.
    can_manage_app: auth?.via === 'bearer' || auth?.role === 'super_admin',
    pending_pages: pending ? pending.length : 0,
    last_result: lastResult,
    allowed_types: PUBLISHER_TYPES,
  });
};

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);

  let body = {};
  try { body = await request.json(); } catch { return json(400, { error: 'bad_json' }); }

  const pid = tenant?.activeProjectId || String(body?.project_id || '').trim() || null;
  if (!pid) return json(400, { error: 'missing_project' });

  // ── app credentials ──────────────────────────────────────────────
  // The Meta app is a PLATFORM credential shared by every tenant. If a
  // project_admin could write it, they could point the whole deployment at
  // their own app (and harvest every tenant's tokens). super_admin only.
  if (body?.action === 'save_app') {
    const superGate = await requireSuperAdmin(env, request);
    if (superGate.error) return superGate.error;

    if (typeof body?.app_id === 'string') await setAppId(env, body.app_id);
    // Graph API version is a setting so a Meta deprecation doesn't need a
    // redeploy. Blank clears it back to the built-in default.
    if (typeof body?.api_version === 'string') {
      const v = body.api_version.trim();
      if (v && !/^v\d+\.\d+$/.test(v)) return json(400, { error: 'bad_api_version', detail: 'Dạng đúng: v23.0' });
      const t = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('facebook_api_version', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(v, t).run();
    }
    let secretState = 'unchanged';
    if (typeof body?.app_secret === 'string') {
      const val = body.app_secret.trim();
      await setVaultSecret(env, FB_APP_SECRET_NAME, val);
      secretState = val ? 'stored' : 'cleared';
    }
    audit(env, 'admin', 'fb_app_save', pid, { secret: secretState });
    return json(200, { ok: true, app_id: await getAppId(env), api_version: await getApiVersion(env), secret: secretState });
  }

  // ── pending Page picker ──────────────────────────────────────────
  if (body?.action === 'pages') {
    const pages = await readPendingPages(env, pid);
    if (!pages) return json(200, { ok: true, pages: [], expired: true });
    // Strip the tokens — the browser only needs enough to render a choice.
    return json(200, {
      ok: true,
      pages: pages.map(({ token, ...rest }) => rest),
    });
  }

  if (body?.action === 'select_page') {
    const pageId = String(body?.page_id || '').trim();
    if (!pageId) return json(400, { error: 'missing_page_id' });
    const pages = await readPendingPages(env, pid);
    if (!pages) return json(400, { error: 'pending_expired', detail: 'Danh sách Page đã hết hạn. Bấm Kết nối Facebook lại.' });
    const chosen = pages.find((p) => p.id === pageId);
    if (!chosen) return json(404, { error: 'page_not_found' });

    await setVaultSecret(env, facebookTokenName(pid), chosen.token);
    const t = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO project_publishing_configs (project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at)
       VALUES (?, 'facebook', '', '', ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         publisher_type = 'facebook',
         config_json = excluded.config_json,
         updated_at = excluded.updated_at`
    ).bind(pid, JSON.stringify({ page_id: chosen.id, page_name: chosen.name }), t, t).run();
    await clearPendingPages(env, pid);
    audit(env, 'admin', 'fb_select_page', pid, { page_id: chosen.id });
    await track(env, { event: 'channel_connected', projectId: pid, props: { channel: 'facebook', page: chosen.name } });
    return json(200, { ok: true, page: { id: chosen.id, name: chosen.name } });
  }

  if (body?.action === 'disconnect') {
    await setVaultSecret(env, facebookTokenName(pid), '');
    await clearPendingPages(env, pid);
    const t = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO project_publishing_configs (project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at)
       VALUES (?, 'internal_d1', '', '', '{}', ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         publisher_type = 'internal_d1', config_json = '{}', updated_at = excluded.updated_at`
    ).bind(pid, t, t).run();
    audit(env, 'admin', 'fb_disconnect', pid, {});
    await track(env, { event: 'channel_disconnected', projectId: pid, props: { channel: 'facebook' } });
    return json(200, { ok: true });
  }

  // ── test connection ──────────────────────────────────────────────
  if (body?.action === 'test') {
    // Fall back to the saved config so the "Kiểm tra kết nối" button works
    // from the connected view without re-typing the Page ID.
    const savedRow = await loadRow(env, pid);
    let savedCfg = {};
    try { savedCfg = JSON.parse(savedRow?.config_json || '{}'); } catch { /* default */ }
    const pageIdToCheck = body?.page_id || body?.config?.page_id || savedCfg.page_id;
    try {
      const page = await verifyFacebookPage({
        env, projectId: pid,
        pageId: pageIdToCheck,
        token: typeof body?.token === 'string' && body.token.trim() ? body.token.trim() : undefined,
      });
      return json(200, { ok: true, page });
    } catch (err) {
      return json(400, { ok: false, error: err.message, graph: err.graph || null });
    }
  }

  // ── save ─────────────────────────────────────────────────────────
  const type = String(body?.publisher_type || 'internal_d1').trim();
  if (!PUBLISHER_TYPES.includes(type)) return json(400, { error: 'bad_publisher_type', allowed: PUBLISHER_TYPES });

  let configJson;
  try { configJson = safeConfigJson(body?.config); }
  catch (e) { return json(400, { error: String(e.message || e) }); }

  const t = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO project_publishing_configs (project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET
       publisher_type = excluded.publisher_type,
       endpoint_url = excluded.endpoint_url,
       auth_header = excluded.auth_header,
       config_json = excluded.config_json,
       updated_at = excluded.updated_at`
  ).bind(
    pid, type,
    String(body?.endpoint_url || '').slice(0, 500),
    String(body?.auth_header || '').slice(0, 500),
    configJson, t, t,
  ).run();

  // Token: absent = leave as-is, "" = clear, value = store encrypted.
  let tokenState = 'unchanged';
  if (typeof body?.token === 'string') {
    const val = body.token.trim();
    await setVaultSecret(env, facebookTokenName(pid), val);
    tokenState = val ? 'stored' : 'cleared';
  }

  audit(env, 'admin', 'publishing_config_save', pid, { publisher_type: type, token: tokenState });
  return json(200, { ok: true, project_id: pid, publisher_type: type, token: tokenState });
};

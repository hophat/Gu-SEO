// Publishing channels — multi-channel registry admin API.
//
//   GET  /api/admin/projects/channels
//        → { channels: [{ channel, label, enabled, configured, config,
//             connected_at, token_state... }], publisher_type, last_result }
//
//   POST /api/admin/projects/channels   { action: 'enable' | 'disable',
//        channel }                        → flips the row
//   POST { action: 'save', channel, config }   → non-secret config
//   POST { action: 'test', channel }     → live probe per channel
//   POST { action: 'disconnect', channel } → clears token + disables
//
// Tokens never come back over the wire — only set/unset booleans. X
// credentials are accepted as `credentials` and written straight to the
// vault; omitting a field leaves it alone.
import { json, audit } from '../../../_lib/util.js';
import { adminGate, requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';
import { setVaultSecret, getVaultSecret } from '../../../_lib/secret_vault.js';
import { track } from '../../../_lib/events.js';
import {
  listChannelStates, getChannelRow, setChannelEnabled, saveChannelConfig,
  connectChannel, isKnownChannel,
} from '../../../_lib/channels.js';
import {
  facebookTokenName, verifyFacebookPage,
} from '../../../_lib/publishing/facebook.js';
import { readPendingPages, getAppId, getAppSecret } from '../../../_lib/publishing/facebook_oauth.js';
import { verifyThreadsToken, threadsTokenName } from '../../../_lib/publishing/threads.js';
import { verifyXCredentials, resolveXCredentials } from '../../../_lib/publishing/x.js';
import {
  youtubeTokenName, readYoutubeToken, getYoutubeAccessToken, verifyYoutubeChannel, getYoutubeAppState,
} from '../../../_lib/publishing/youtube_oauth.js';

const X_SECRET_FIELDS = ['api_key', 'api_secret', 'access_token', 'access_secret'];
const X_NAME_BY_FIELD = {
  api_key: (pid) => `X_API_KEY__${pid}`,
  api_secret: (pid) => `X_API_SECRET__${pid}`,
  access_token: (pid) => `X_ACCESS_TOKEN__${pid}`,
  access_secret: (pid) => `X_ACCESS_SECRET__${pid}`,
};

async function readLastResult(env, pid) {
  if (!env?.DB || !pid) return null;
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ? LIMIT 1')
      .bind(`channel_last_result__${pid}`).first();
    if (!row?.value) return null;
    await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(`channel_last_result__${pid}`).run();
    return JSON.parse(row.value);
  } catch { return null; }
}

async function tokenStateFor(env, pid, channel) {
  switch (channel) {
    case 'facebook':
    case 'instagram': {
      const scoped = await getVaultSecret(env, facebookTokenName(pid));
      const global = scoped ? '' : await getVaultSecret(env, 'FACEBOOK_PAGE_TOKEN');
      return { set: !!(scoped || global), source: scoped ? 'project' : (global ? 'global' : 'unset') };
    }
    case 'threads': {
      const v = await getVaultSecret(env, threadsTokenName(pid));
      return { set: !!v, source: v ? 'project' : 'unset' };
    }
    case 'x': {
      const creds = await resolveXCredentials(env, pid);
      return { set: !!creds, source: creds ? 'project' : 'unset' };
    }
    case 'youtube': {
      try {
        const token = await readYoutubeToken(env, pid);
        return { set: !!token?.access_token, source: token?.access_token ? 'project' : 'unset' };
      } catch (error) {
        if (error?.message !== 'youtube_token_invalid') throw error;
        return { set: false, source: 'invalid' };
      }
    }
    default:
      return null;
  }
}

async function testChannel(env, pid, channel, body) {
  if (channel === 'facebook') {
    const row = await getChannelRow(env, pid, 'facebook');
    let cfg = {};
    try { cfg = JSON.parse(row?.config_json || '{}'); } catch { /* default */ }
    const pageIdToCheck = body?.page_id || body?.config?.page_id || cfg.page_id;
    const page = await verifyFacebookPage({
      env, projectId: pid, pageId: pageIdToCheck,
      token: typeof body?.token === 'string' && body.token.trim() ? body.token.trim() : undefined,
    });
    return { ok: true, page };
  }
  if (channel === 'threads') {
    const token = await getVaultSecret(env, threadsTokenName(pid));
    if (!token) return { ok: false, error: 'Chưa có Threads token — bấm Kết nối Threads.' };
    const profile = await verifyThreadsToken({ token });
    return { ok: true, profile };
  }
  if (channel === 'x') {
    const creds = await resolveXCredentials(env, pid);
    if (!creds) return { ok: false, error: 'Chưa đủ 4 thông tin API Key của X.' };
    const me = await verifyXCredentials({ creds });
    return { ok: true, profile: me };
  }
  if (channel === 'youtube') {
    try {
      const token = await readYoutubeToken(env, pid);
      if (!token?.access_token) return { ok: false, error: 'Chưa có YouTube OAuth — bấm Kết nối YouTube.' };
      const accessToken = await getYoutubeAccessToken(env, pid);
      const channelInfo = await verifyYoutubeChannel({ accessToken });
      return { ok: true, profile: channelInfo };
    } catch (error) {
      if (error?.message === 'youtube_token_invalid') {
        return { ok: false, error: 'Token YouTube bị lỗi — kết nối lại.' };
      }
      throw error;
    }
  }
  if (channel === 'instagram') {
    // Token + linked IG account are what publishing needs; verifying the
    // Page token and reading its instagram_business_account covers both.
    const page = await verifyFacebookPage({ env, projectId: pid, pageId: null });
    return { ok: true, page, instagram: 'linked_via_page' };
  }
  return { ok: false, error: `Kênh ${channel} không hỗ trợ kiểm tra trực tiếp.` };
}

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;
  if (!pid) return json(400, { error: 'missing_project' });

  const state = await listChannelStates(env, pid);
  const channels = [];
  for (const c of state.channels) {
    channels.push({
      ...c,
      token: await tokenStateFor(env, pid, c.channel),
    });
  }

  const appId = await getAppId(env);
  const appSecret = await getAppSecret(env);
  const pending = await readPendingPages(env, pid).catch(() => null);
  const youtubeApp = await getYoutubeAppState(env);

  return json(200, {
    ok: true,
    project_id: pid,
    channels,
    publisher_type: state.publisher_type,
    meta_app: { id_set: !!appId, secret_set: !!appSecret },
    youtube_app: youtubeApp,
    pending_pages: pending ? pending.length : 0,
    last_result: await readLastResult(env, pid),
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

  const channel = String(body?.channel || '').trim();
  const action = String(body?.action || '').trim();

  if (!isKnownChannel(channel)) return json(400, { error: 'unknown_channel', channel });

  switch (action) {
    case 'enable': {
      // Enabling needs *something* to publish with — otherwise the queue
      // drains into a guaranteed credential failure every tick.
      const token = await tokenStateFor(env, pid, channel);
      if (['facebook', 'instagram', 'threads', 'x', 'youtube'].includes(channel) && !token?.set) {
        return json(400, { error: 'not_connected', detail: 'Kết nối tài khoản trước khi bật kênh.' });
      }
      await setChannelEnabled(env, pid, channel, true);
      audit(env, 'admin', 'channel_enable', pid, { channel });
      await track(env, { event: 'channel_enabled', projectId: pid, props: { channel } });
      return json(200, { ok: true });
    }
    case 'disable': {
      await setChannelEnabled(env, pid, channel, false);
      audit(env, 'admin', 'channel_disable', pid, { channel });
      await track(env, { event: 'channel_disabled', projectId: pid, props: { channel } });
      return json(200, { ok: true });
    }
    case 'save': {
      const config = body?.config || {};
      await saveChannelConfig(env, pid, channel, config);
      // X credentials, when sent, land in the vault — never in config_json.
      if (channel === 'x' && body?.credentials) {
        for (const f of X_SECRET_FIELDS) {
          const v = String(body.credentials[f] || '').trim();
          if (v) await setVaultSecret(env, X_NAME_BY_FIELD[f](pid), v);
        }
      }
      audit(env, 'admin', 'channel_save', pid, { channel });
      return json(200, { ok: true });
    }
    case 'test': {
      try {
        const result = await testChannel(env, pid, channel, body);
        return json(result.ok ? 200 : 400, { ...result });
      } catch (err) {
        return json(400, { ok: false, error: err.message, graph: err.graph || null });
      }
    }
    case 'disconnect': {
      if (channel === 'facebook' || channel === 'instagram') {
        await setVaultSecret(env, facebookTokenName(pid), '');
      }
      if (channel === 'threads') await setVaultSecret(env, threadsTokenName(pid), '');
      if (channel === 'x') {
        for (const f of X_SECRET_FIELDS) await setVaultSecret(env, X_NAME_BY_FIELD[f](pid), '');
      }
      if (channel === 'youtube') await setVaultSecret(env, youtubeTokenName(pid), '');
      await setChannelEnabled(env, pid, channel, false);
      audit(env, 'admin', 'channel_disconnect', pid, { channel });
      await track(env, { event: 'channel_disconnected', projectId: pid, props: { channel } });
      return json(200, { ok: true });
    }
    case 'connect_page': {
      // Instagram-specific: attach the connected Facebook Page (whose token
      // covers the linked IG Business account) and enable the channel.
      const pending = await readPendingPages(env, pid).catch(() => null);
      const chosen = (pending || []).find((p) => String(p.id) === String(body?.page_id || ''))
        || (pending && pending.length === 1 ? pending[0] : null);
      if (!chosen) {
        return json(400, { error: 'no_pending_pages', detail: 'Kết nối Facebook trước để chọn Page cho Instagram.' });
      }
      await connectChannel(env, pid, 'instagram', { page_id: chosen.id, page_name: chosen.name });
      audit(env, 'admin', 'channel_connect_page', pid, { channel: 'instagram', page_id: chosen.id });
      return json(200, { ok: true, page: { id: chosen.id, name: chosen.name } });
    }
    default:
      return json(400, { error: 'unknown_action', action });
  }
};

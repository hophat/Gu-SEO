// Multi-channel social distribution — the per-project channel registry.
//
// History: a project had exactly ONE external channel, stored as
// project_publishing_configs.publisher_type. Multi-platform posting ("same
// article → Facebook + Instagram + X") needs N channels per project, so
// migration 010 adds project_channels: one row per (project, channel).
//
// This module is the only code that reads and writes that table. It owns:
//   - the canonical channel list (what the UI can offer)
//   - listEnabledChannels(): the fan-out source for blog publish, with a
//     transparent fallback to the legacy single publisher_type so existing
//     installs keep publishing without any operator action; video-only
//     channels are opt-in via `{ includeVideoOnly: true }` for video delivery
//   - connect/enable/disable/upsert helpers used by the admin API
//
// Config lives in config_json (plaintext, non-secret: page ids, handles,
// hashtags, templates). Tokens never touch this table — they stay in the
// vault, see each channel's publisher for its key names.

import { newId, nowSec } from './util.js';

// The channels a project can enable. `legacy_type` names the
// publisher_type that used to carry this channel, so the fallback and the
// backfill stay in one place.
export const CHANNELS = [
  { id: 'facebook',  label: 'Facebook Page', legacy_type: 'facebook' },
  { id: 'instagram', label: 'Instagram',     legacy_type: null },
  { id: 'threads',   label: 'Threads',       legacy_type: null },
  { id: 'x',         label: 'X (Twitter)',   legacy_type: null },
  { id: 'youtube',   label: 'YouTube',       legacy_type: null, video_only: true },
  { id: 'wordpress', label: 'WordPress',     legacy_type: 'wordpress' },
  { id: 'webhook',   label: 'Webhook',       legacy_type: 'webhook' },
  { id: 'custom_api', label: 'Custom API',   legacy_type: 'custom_api' },
];

export function isKnownChannel(id) {
  return CHANNELS.some((c) => c.id === id);
}

export function isVideoOnlyChannel(id) {
  return CHANNELS.some((c) => c.id === id && c.video_only === true);
}

function parseConfig(json) {
  try { return JSON.parse(json || '{}') || {}; } catch { return {}; }
}

// Channels the project currently fans out to, in canonical order.
//
// Fallback: with no project_channels rows at all (pre-010 install, or a
// project nobody has touched in the new UI yet), the legacy
// publisher_type still speaks for the project — otherwise flipping to the
// multi-channel model would silently stop every existing install's
// distribution on its next deploy.
export async function listEnabledChannels(env, projectId, { includeVideoOnly = false } = {}) {
  if (!env?.DB || !projectId) return [];
  const result = await env.DB.prepare(
    `SELECT channel, enabled, config_json FROM project_channels
      WHERE project_id = ?`
  ).bind(projectId).all().catch(() => null);
  const rows = result?.results || [];

  if (rows.length) {
    const known = CHANNELS.map((c) => c.id);
    const byId = new Map(CHANNELS.map((c) => [c.id, c]));
    const enabled = rows
      .filter((r) => Number(r.enabled) === 1)
      .filter((r) => known.includes(r.channel))
      .filter((r) => includeVideoOnly || !byId.get(r.channel)?.video_only)
      .map((r) => ({ channel: r.channel, config: parseConfig(r.config_json) }));

    // A legacy project can gain its first project_channels row when an
    // operator connects a video-only channel. Keep its old text publisher
    // alive until that legacy channel is explicitly represented and disabled
    // in the modern registry; otherwise connecting YouTube would silently
    // disable Facebook/WordPress fan-out on existing installs.
    const legacy = await env.DB.prepare(
      'SELECT publisher_type, config_json FROM project_publishing_configs WHERE project_id = ? LIMIT 1'
    ).bind(projectId).first();
    const legacyChannel = CHANNELS.find((c) => c.legacy_type === legacy?.publisher_type);
    if (legacyChannel && !isVideoOnlyChannel(legacyChannel.id)
      && !rows.some((r) => r.channel === legacyChannel.id)) {
      enabled.push({ channel: legacyChannel.id, config: parseConfig(legacy?.config_json) });
    }
    return enabled.sort((a, b) => known.indexOf(a.channel) - known.indexOf(b.channel));
  }

  const row = await env.DB.prepare(
    'SELECT publisher_type, config_json FROM project_publishing_configs WHERE project_id = ? LIMIT 1'
  ).bind(projectId).first().catch(() => null);
  const type = row?.publisher_type;
  if (!type || type === 'internal_d1') return [];
  const channel = CHANNELS.find((c) => c.legacy_type === type);
  if (!channel) return [];
  return [{ channel: channel.id, config: parseConfig(row?.config_json) }];
}

// Per-channel config for one project ({} when the channel was never set).
// Used by publishers and the admin GET to render the saved state.
export async function getChannelRow(env, projectId, channel) {
  if (!env?.DB || !projectId || !isKnownChannel(channel)) return null;
  return env.DB.prepare(
    'SELECT id, project_id, channel, enabled, config_json, connected_at, created_at, updated_at FROM project_channels WHERE project_id = ? AND channel = ? LIMIT 1'
  ).bind(projectId, channel).first().catch(() => null);
}

export async function getChannelConfig(env, projectId, channel) {
  const row = await getChannelRow(env, projectId, channel);
  return parseConfig(row?.config_json);
}

// Upsert one channel's non-secret config. Does not flip `enabled` — the
// admin API does that explicitly so a config save can't silently activate
// a half-configured channel.
export async function saveChannelConfig(env, projectId, channel, config) {
  if (!isKnownChannel(channel)) throw new Error(`unknown_channel:${channel}`);
  const t = nowSec();
  const json = JSON.stringify(config || {});
  await env.DB.prepare(
    `INSERT INTO project_channels (id, project_id, channel, enabled, config_json, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?)
     ON CONFLICT(project_id, channel) DO UPDATE SET
       config_json = excluded.config_json, updated_at = excluded.updated_at`
  ).bind(newId(), projectId, channel, json, t, t).run();
  return { ok: true };
}

// Mark a channel connected (row + connected_at + enabled in one write).
// Token storage happens in the caller; this only owns the row.
export async function connectChannel(env, projectId, channel, config = {}, { enabled = true } = {}) {
  if (!isKnownChannel(channel)) throw new Error(`unknown_channel:${channel}`);
  const t = nowSec();
  const json = JSON.stringify(config || {});
  await env.DB.prepare(
    `INSERT INTO project_channels (id, project_id, channel, enabled, config_json, connected_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, channel) DO UPDATE SET
       enabled = excluded.enabled,
       config_json = excluded.config_json,
       connected_at = excluded.connected_at,
       updated_at = excluded.updated_at`
  ).bind(newId(), projectId, channel, enabled ? 1 : 0, json, t, t, t).run();
  return { ok: true };
}

export async function setChannelEnabled(env, projectId, channel, enabled) {
  if (!isKnownChannel(channel)) throw new Error(`unknown_channel:${channel}`);
  const t = nowSec();
  // INSERT ... ON CONFLICT: toggling a channel that was never configured
  // creates its row so the toggle survives a page reload.
  await env.DB.prepare(
    `INSERT INTO project_channels (id, project_id, channel, enabled, config_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, '{}', ?, ?)
     ON CONFLICT(project_id, channel) DO UPDATE SET
       enabled = excluded.enabled, updated_at = excluded.updated_at`
  ).bind(newId(), projectId, channel, enabled ? 1 : 0, t, t).run();
  return { ok: true };
}

// Full state for the admin UI: every known channel with its row (or a
// synthetic default), plus the legacy publisher_type for context.
export async function listChannelStates(env, projectId) {
  if (!env?.DB || !projectId) return { channels: [], publisher_type: 'internal_d1' };
  const { results } = await env.DB.prepare(
    'SELECT channel, enabled, config_json, connected_at, updated_at FROM project_channels WHERE project_id = ?'
  ).bind(projectId).all().catch(() => ({ results: [] }));
  const byChannel = new Map((results || []).map((r) => [r.channel, r]));
  const legacy = await env.DB.prepare(
    'SELECT publisher_type FROM project_publishing_configs WHERE project_id = ? LIMIT 1'
  ).bind(projectId).first().catch(() => null);

  const channels = CHANNELS.map((c) => {
    const row = byChannel.get(c.id);
    return {
      channel: c.id,
      label: c.label,
      enabled: row ? !!row.enabled : false,
      configured: !!row,
      config: parseConfig(row?.config_json),
      connected_at: row?.connected_at || null,
      updated_at: row?.updated_at || null,
      legacy_type: c.legacy_type,
    };
  });
  return { channels, publisher_type: legacy?.publisher_type || 'internal_d1' };
}

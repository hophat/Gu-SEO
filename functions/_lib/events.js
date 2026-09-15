// Product event tracking — for the moments that are NOT derivable.
//
// Read _lib/insights.js first: activation, retention and activity are all
// computed from projects/blog_posts, which is retroactive and cannot drift.
// This module is only for decisions we would otherwise have no record of —
// which setup step someone abandoned, whether a channel connect was attempted
// and failed.
//
// Two rules:
//   1. Never throw. An event that fails to record must not fail the user
//      action it describes, so every call site can fire-and-forget.
//   2. Never block. Callers use `void track(...)` or pass it to waitUntil.

import { newId, nowSec } from './util.js';

// Known event names. Keeping a closed list means the insights page can
// group by event without guessing, and a typo is a silent no-op rather than
// a junk row. Add here when instrumenting something new.
export const EVENTS = [
  'signup',                 // a project was created via public register
  'setup_complete',         // first-run /api/setup finished
  'onboarding_started',     // wizard opened
  'onboarding_complete',    // wizard finished
  'brand_dna_generated',    // AI read the website
  'calendar_planned',       // 28-day schedule created
  'first_post_published',   // the activation moment — emitted once per project
  'channel_connect_started',
  'channel_connected',
  'channel_connect_failed',
  'channel_disconnected',
  'social_post_published',
  'social_post_failed',
];

const KNOWN = new Set(EVENTS);

export async function track(env, { event, projectId = null, userId = null, props = null } = {}) {
  try {
    if (!env?.DB?.prepare || !event) return { ok: false };
    if (!KNOWN.has(event)) return { ok: false, error: 'unknown_event' };

    // Keep props small and JSON-safe; a huge blob would bloat the table and
    // the insights query that reads it.
    let propsJson = null;
    if (props && typeof props === 'object') {
      const j = JSON.stringify(props);
      if (j.length <= 2048) propsJson = j;
    }

    await env.DB.prepare(
      `INSERT INTO product_events (id, event, project_id, user_id, props_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(newId(), event, projectId, userId, propsJson, nowSec()).run();

    return { ok: true };
  } catch {
    // Intentionally silent: see rule 1 above.
    return { ok: false };
  }
}

// Emit an event at most once per project. Used for milestones where a repeat
// would skew the funnel — `first_post_published` firing on every publish
// would make the activation rate meaningless.
export async function trackOnce(env, { event, projectId, userId = null, props = null } = {}) {
  try {
    if (!env?.DB?.prepare || !event || !projectId) return { ok: false };
    const seen = await env.DB.prepare(
      'SELECT 1 AS x FROM product_events WHERE event = ? AND project_id = ? LIMIT 1'
    ).bind(event, projectId).first().catch(() => null);
    if (seen) return { ok: false, error: 'already_tracked' };
    return await track(env, { event, projectId, userId, props });
  } catch {
    return { ok: false };
  }
}

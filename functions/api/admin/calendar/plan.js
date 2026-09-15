// POST /api/admin/calendar/plan
//   { days?: number = 28, provider?, replace?: boolean = false }
//
// Auto-plans N days of upcoming articles from the saved Brand DNA.
// Thin wrapper around _lib/calendar_planner.js so cron's JIT path and
// the operator's "Regenerate" button share the same code.

import { json, audit } from '../../../_lib/util.js';
import { requireAdminAsync, resolveTenantContext } from '../../../_lib/auth.js';
import { planCalendar } from '../../../_lib/calendar_planner.js';
import { track } from '../../../_lib/events.js';

export const onRequestPost = async ({ env, request }) => {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: 'unauthorized' });
  const tenant = await resolveTenantContext(env, request, auth);
  const activeProjectId = tenant?.activeProjectId || null;

  let body = {};
  try { body = await request.json(); } catch { /* allow empty */ }
  const days     = Math.max(1, Math.min(60, parseInt(body.days, 10) || 28));
  const replace  = !!body.replace;
  const provider = String(body.provider || '').trim() || '';

  try {
    const result = await planCalendar(env, {
      days,
      replace,
      preferredProvider: provider,
      projectId: activeProjectId,
    });
    await audit(env, 'admin', 'calendar.plan', '', JSON.stringify({ days, inserted: result.slots.length, replace, project_id: activeProjectId }));
    await track(env, { event: 'calendar_planned', projectId: activeProjectId, props: { days, slots: result.slots.length } });
    return json(200, {
      ok: true,
      inserted: result.slots.length,
      slots: result.slots,
      project_id: activeProjectId,
      project_slug: tenant?.activeProjectSlug || null,
    });
  } catch (e) {
    if (e.code === 'no_brand_dna') {
      return json(422, { error: 'no_brand_dna', detail: 'Save your Brand DNA before planning.' });
    }
    if (e.code === 'planner_empty') {
      return json(502, { error: 'planner_empty' });
    }
    return json(502, { error: 'planner_failed', detail: String(e?.message || e) });
  }
};

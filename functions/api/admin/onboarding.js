// Onboarding wizard state — PER PROJECT.
//
// This used to read `settings.onboarding_complete`, a global row with no
// project_id. The first project to finish the wizard marked every project
// complete, so a brand new account skipped setup entirely — which is exactly
// the bug this rewrite fixes. Brand DNA and schedule were read from the same
// global settings row, so they were wrong for the same reason.
//
// State now lives on `projects.onboarding_complete_at`.
//
// GET    /api/admin/onboarding  → { complete, steps, has_brand_dna, has_future_slots }
// POST   /api/admin/onboarding  → mark this project's wizard complete
// DELETE /api/admin/onboarding  → reset, so the operator can re-run it
//
// `complete` — the gate that decides whether the wizard blocks the admin — is
// DERIVED from the data: Brand DNA exists and a future schedule exists. That
// makes it self-healing in both directions. A project that has the data is
// never nagged; a project whose Brand DNA is later deleted gates again,
// because it genuinely can no longer produce on-brand content.
//
// `onboarding_complete_at` is a separate, informational record of when the
// operator last walked the wizard. It feeds the onboarding_complete event and
// lets the UI say "đã xác nhận lúc…". It deliberately does NOT gate: a stored
// flag would let a project that lost its setup data sail through, which is the
// class of bug this file exists to fix.

import { json, nowSec } from '../../_lib/util.js';
import { adminGate, requireAdminAsync, resolveTenantContext } from '../../_lib/auth.js';
import { listProviders } from '../../_lib/ai.js';
import { track } from '../../_lib/events.js';

async function stateFor(env, pid) {
  const today = new Date().toISOString().slice(0, 10);

  const project = await env.DB.prepare(
    'SELECT id, slug, name, onboarding_complete_at FROM projects WHERE id = ? LIMIT 1'
  ).bind(pid).first().catch(() => null);

  const brand = await env.DB.prepare(
    'SELECT business_type, audience FROM project_brands WHERE project_id = ? LIMIT 1'
  ).bind(pid).first().catch(() => null);
  const hasBrandDna = !!(brand?.business_type || brand?.audience);

  const future = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM content_calendar
      WHERE project_id = ? AND scheduled_for >= ? AND status IN ('scheduled','generating','draft')`
  ).bind(pid, today).first().catch(() => ({ n: 0 }));
  const hasFutureSlots = !!(future?.n);

  const providers = await listProviders(env).catch(() => ({ text: [] }));

  return {
    project_id: pid,
    project_slug: project?.slug || null,
    marked_complete_at: project?.onboarding_complete_at || null,
    has_brand_dna: hasBrandDna,
    has_future_slots: hasFutureSlots,
    providers_configured: providers.text || [],
  };
}

export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;
  if (!pid) return json(200, { ok: true, complete: false, steps: [] });

  const s = await stateFor(env, pid);
  const providers = (s.providers_configured || []).length > 0;

  const steps = [
    { key: 'brand_dna', required: true, done: s.has_brand_dna },
    { key: 'providers', required: false, done: providers },
    { key: 'schedule', required: true, done: s.has_future_slots },
  ];
  const required = steps.filter((x) => x.required);
  const complete = required.every((x) => x.done);

  return json(200, { ok: true, ...s, steps, complete });
};

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;
  if (!pid) return json(400, { error: 'missing_project' });

  // Refuse to mark complete while a required step is missing. The UI already
  // blocks this, but the API is the boundary that matters — a direct call must
  // not be able to fake activation and skew the funnel.
  const s = await stateFor(env, pid);
  const missing = [];
  if (!s.has_brand_dna) missing.push('brand_dna');
  if (!s.has_future_slots) missing.push('schedule');
  if (missing.length) {
    return json(409, { error: 'incomplete', missing, detail: 'Hoàn tất Brand DNA và lịch nội dung trước.' });
  }

  const t = nowSec();
  await env.DB.prepare('UPDATE projects SET onboarding_complete_at = ? WHERE id = ?').bind(t, pid).run();
  await track(env, { event: 'onboarding_complete', projectId: pid });
  return json(200, { ok: true, project_id: pid, marked_at: t });
};

export const onRequestDelete = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  const pid = tenant?.activeProjectId || null;
  if (!pid) return json(400, { error: 'missing_project' });

  await env.DB.prepare('UPDATE projects SET onboarding_complete_at = NULL WHERE id = ?').bind(pid).run();
  return json(200, { ok: true, project_id: pid });
};

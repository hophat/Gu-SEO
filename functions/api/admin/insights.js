// GET /api/admin/insights — platform-level product analytics.
//
// super_admin only: it spans every tenant, which is exactly the data a
// project_admin must never see.
//
// Answers the questions that decide whether this product keeps its customers:
//   - Where do people drop off between signup and first published post?
//   - How long does activation take?
//   - Do projects that activated still publish in week 2, 3, 4?
//   - Is platform-wide output growing or decaying?
//
// See _lib/insights.js for why these are derived from existing tables rather
// than logged as events.
import { json } from '../../_lib/util.js';
import { requireSuperAdmin } from '../../_lib/auth.js';
import { computeInsights } from '../../_lib/insights.js';

export const onRequestGet = async ({ env, request }) => {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;
  if (!env?.DB) return json(500, { error: 'no_db' });

  const url = new URL(request.url);
  const includeProjects = url.searchParams.get('projects') !== '0';

  const data = await computeInsights(env);
  if (!includeProjects) delete data.projects;

  return json(200, { ok: true, ...data });
};

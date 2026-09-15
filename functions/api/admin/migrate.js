// POST /api/admin/migrate — apply pending schema migrations.
//
// One implementation, three callers:
//   - /api/setup on a fresh install
//   - `npm run migrate` (scripts/migrate.js) against a deployed site
//   - an operator during an incident, via curl
//
// super_admin only: a migration can alter any tenant's data.
//
// Returns the runner's report so the caller sees exactly which migrations
// ran, which were already applied, and what failed.
import { json } from '../../_lib/util.js';
import { requireSuperAdmin } from '../../_lib/auth.js';
import { runMigrations, appliedMigrations } from '../../_lib/migrations.js';

export const onRequestPost = async ({ env, request }) => {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;

  if (!env?.DB) return json(500, { error: 'no_db' });

  const before = await appliedMigrations(env);
  const report = await runMigrations(env, { logger: { log: () => {}, error: () => {} } });
  const after = await appliedMigrations(env);

  return json(report.ok ? 200 : 500, {
    ok: report.ok,
    applied: report.applied,
    failed: report.failed,
    baseline_statements: report.baseline?.applied ?? 0,
    migrations_total: report.total,
    migrations_before: before.size,
    migrations_after: after.size,
  });
};

// GET — dry look at what is pending, without touching anything.
export const onRequestGet = async ({ env, request }) => {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;

  const { MIGRATIONS } = await import('../../_lib/migrations_bundle.js');
  const applied = await appliedMigrations(env);
  return json(200, {
    ok: true,
    applied: [...applied],
    pending: MIGRATIONS.filter((m) => !applied.has(m.id)).map((m) => m.id),
    total: MIGRATIONS.length,
  });
};

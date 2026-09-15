// Idempotent schema migration runner.
//
// The problem this solves: schema/init.sql is the full canonical schema for
// a FRESH database, but it contains `ALTER TABLE … ADD COLUMN`, which is not
// idempotent in SQLite. Running it against an existing database fails on the
// first already-present column — which is exactly what happened in
// production (`duplicate column name: competition_score`). That made
// updating an existing install a manual, error-prone chore.
//
// Two-phase approach:
//
//   1. BASELINE — apply init.sql, tolerating "duplicate column name". This
//      converges a legacy database to the current base schema and is safe to
//      re-run. Without this step a database that predates the runner would
//      miss any table added to init.sql since.
//
//   2. MIGRATIONS — apply schema/migrations/NNN_*.sql in order, skipping any
//      id already recorded in schema_migrations.
//
// Every migration must still be written idempotently. A database created
// before this runner existed has no schema_migrations rows, so on its first
// run every migration is attempted — and the ones whose effects are already
// present must not fail.
//
// The tolerance is deliberately narrow: only "duplicate column name" and
// "already exists" are swallowed. Anything else propagates, because a real
// schema error should stop the run rather than be logged and forgotten.

import { SCHEMA_SQL } from './schema.js';
import { MIGRATIONS } from './migrations_bundle.js';

// Statements SQLite reports for "this object already exists", which is
// expected when re-applying an idempotent baseline.
const BENIGN = /duplicate column name|already exists|duplicate index/i;

export function splitSql(sql) {
  return String(sql || '')
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}

async function applyStatements(env, sql, { tolerate = true } = {}) {
  let applied = 0;
  const skipped = [];
  for (const stmt of splitSql(sql)) {
    try {
      await env.DB.prepare(stmt).run();
      applied++;
    } catch (err) {
      const msg = String(err?.message || err);
      if (tolerate && BENIGN.test(msg)) { skipped.push(msg); continue; }
      throw new Error(`migration statement failed: ${msg}\n---\n${stmt.slice(0, 300)}`);
    }
  }
  return { applied, skipped: skipped.length };
}

export async function ensureMigrationTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id         TEXT PRIMARY KEY,
       applied_at INTEGER NOT NULL
     )`
  ).run();
}

export async function appliedMigrations(env) {
  await ensureMigrationTable(env);
  const { results } = await env.DB
    .prepare('SELECT id FROM schema_migrations ORDER BY id')
    .all()
    .catch(() => ({ results: [] }));
  return new Set((results || []).map((r) => r.id));
}

// Returns a report so the CLI can print what happened and /api/setup can
// include it in its response.
export async function runMigrations(env, { logger = console } = {}) {
  if (!env?.DB?.prepare) return { ok: false, error: 'no_db' };

  await ensureMigrationTable(env);
  const already = await appliedMigrations(env);

  // ── 1. baseline ──────────────────────────────────────────────────
  const baseline = await applyStatements(env, SCHEMA_SQL, { tolerate: true });

  // ── 2. pending migrations ────────────────────────────────────────
  const applied = [];
  const failed = [];
  for (const m of MIGRATIONS) {
    if (already.has(m.id)) continue;
    try {
      const res = await applyStatements(env, m.sql, { tolerate: true });
      await env.DB.prepare(
        'INSERT OR REPLACE INTO schema_migrations (id, applied_at) VALUES (?, ?)'
      ).bind(m.id, Math.floor(Date.now() / 1000)).run();
      applied.push({ id: m.id, statements: res.applied });
      logger?.log?.(`  ✓ migration ${m.id} (${res.applied} statements)`);
    } catch (err) {
      failed.push({ id: m.id, error: String(err?.message || err) });
      logger?.error?.(`  ✗ migration ${m.id}: ${err?.message || err}`);
      // Stop at the first failure: later migrations may depend on this one.
      break;
    }
  }

  return {
    ok: failed.length === 0,
    baseline,
    applied,
    failed,
    total: MIGRATIONS.length,
    previously_applied: already.size,
  };
}

// Bundles schema/migrations/*.sql into functions/_lib/migrations_bundle.js.
//
// Migrations are plain .sql files so they can be applied by `wrangler d1
// execute` by hand during an incident, but the runtime also needs them —
// the one-click install path has no shell. Bundling keeps both paths on
// the same bytes.
//
// Run after adding or editing a migration:  node scripts/bundle-migrations.js
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'schema', 'migrations');

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const entries = files.map((f) => {
  const id = f.replace(/\.sql$/, '');
  if (!/^\d{3}_[a-z0-9_]+$/.test(id)) {
    throw new Error(`Migration name must be NNN_snake_case.sql, got: ${f}`);
  }
  const sql = readFileSync(join(dir, f), 'utf8').trim();
  return `  { id: ${JSON.stringify(id)}, sql: ${JSON.stringify(sql)} },`;
});

const out = `// GENERATED FILE — do not edit by hand.
// Source: schema/migrations/*.sql
// Regenerate: node scripts/bundle-migrations.js
//
// Applied in filename order; each id is recorded in schema_migrations so a
// re-run is a no-op. Every migration must be idempotent anyway
// (CREATE TABLE IF NOT EXISTS / ALTER TABLE … ADD COLUMN), because a
// database created before this runner existed has no schema_migrations
// row for migrations whose effects it already carries.

export const MIGRATIONS = [
${entries.join('\n')}
];
`;

writeFileSync(join(root, 'functions', '_lib', 'migrations_bundle.js'), out);
console.log(`✓ wrote functions/_lib/migrations_bundle.js (${files.length} migrations: ${files.join(', ') || 'none'})`);

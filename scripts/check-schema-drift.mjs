// Compares the live D1 schema against what schema/init.sql produces on a
// fresh database, and reports tables/columns that exist in one but not the
// other.
//
// This exists because a column can be present in production (added by hand,
// or by an older init.sql that has since been edited) while being absent from
// the file — so a fresh install silently ships a broken schema. That happened
// with blog_posts.project_id.
//
//   node scripts/check-schema-drift.mjs
import { execSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL } from '../functions/_lib/schema.js';
import { MIGRATIONS } from '../functions/_lib/migrations_bundle.js';

const DB = process.env.D1_DATABASE || 'pages-seo-db';

// A migration may add a table OR a column. Both are legitimately absent from
// init.sql — that is the two-phase model. Derive them from the migration SQL
// rather than hardcoding, so adding a migration doesn't require editing this
// check (and so a column added by a migration doesn't get reported as drift,
// which would train everyone to ignore the check).
const MIGRATION_TABLES = new Set(['schema_migrations']); // created by the runner
const MIGRATION_COLUMNS = new Map(); // table -> Set(column)

for (const m of MIGRATIONS) {
  const sql = String(m.sql);
  for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/gi)) {
    MIGRATION_TABLES.add(match[1]);
  }
  for (const match of sql.matchAll(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/gi)) {
    const [, table, column] = match;
    if (!MIGRATION_COLUMNS.has(table)) MIGRATION_COLUMNS.set(table, new Set());
    MIGRATION_COLUMNS.get(table).add(column);
  }
}

const q = (sql) => {
  const raw = execSync(`npx wrangler d1 execute ${DB} --remote --json --command ${JSON.stringify(sql)}`,
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(raw.slice(raw.indexOf('[')))[0].results;
};

const tables = q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%'")
  .map((r) => r.name)
  // Migration 002 renames the old table to site_aliases_legacy and leaves it
  // as a recovery copy, so it is deliberately absent from init.sql.
  .filter((t) => !MIGRATION_TABLES.has(t) && !/_legacy$/.test(t));

const prod = {};
for (const t of tables) prod[t] = q(`PRAGMA table_info(${t})`).map((c) => c.name);

const db = new DatabaseSync(':memory:');
for (const stmt of SCHEMA_SQL.split(/;\s*(?:\r?\n|$)/)
  .map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) {
  try { db.exec(stmt); } catch { /* ALTERs already applied */ }
}

let issues = 0;
for (const t of tables.sort()) {
  let freshCols;
  try { freshCols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name); }
  catch { console.log(`MISSING TABLE in init.sql: ${t}`); issues++; continue; }
  const missing = prod[t].filter((c) => !freshCols.includes(c) && !MIGRATION_COLUMNS.get(t)?.has(c));
  if (missing.length) { console.log(`${t}: missing columns in init.sql → ${missing.join(', ')}`); issues++; }
}

console.log(issues ? `\n${issues} drift issue(s)` : 'No schema drift');
process.exit(issues ? 1 : 0);

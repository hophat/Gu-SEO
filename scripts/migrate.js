#!/usr/bin/env node
// Apply pending schema migrations to a deployed site.
//
//   npm run migrate                      # uses SITE_URL + ADMIN_TOKEN env
//   npm run migrate -- --site https://seo.gulagi.com
//   npm run migrate -- --dry-run         # list pending, change nothing
//
// The work happens server-side in /api/admin/migrate so the CLI, the
// one-click install and an incident-time curl all run the same code path
// (and the same idempotency rules) instead of three drifting copies.
//
// Token resolution order:
//   1. --token <value>
//   2. ADMIN_TOKEN env var
//   3. settings.admin_token in D1 (the one-click install path)
import { execSync } from 'node:child_process';

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : 'true';
}

const site = (arg('site') || process.env.SITE_URL || 'https://seo.gulagi.com').replace(/\/+$/, '');
const dryRun = arg('dry-run', '') === 'true';

function tokenFromD1() {
  const db = arg('db') || process.env.D1_DATABASE || 'pages-seo-db';
  try {
    const raw = execSync(
      `npx wrangler d1 execute ${db} --remote --json --command "SELECT value FROM settings WHERE key='admin_token'"`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const parsed = JSON.parse(raw.slice(raw.indexOf('[')));
    return parsed?.[0]?.results?.[0]?.value || '';
  } catch {
    return '';
  }
}

const token = arg('token') || process.env.ADMIN_TOKEN || tokenFromD1();
if (!token) {
  console.error('No admin token. Pass --token, set ADMIN_TOKEN, or run from the repo so D1 can be read.');
  process.exit(1);
}

const url = `${site}/api/admin/migrate`;
const init = { headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } };

if (dryRun) {
  const r = await fetch(url, { headers: init.headers });
  const body = await r.json().catch(() => ({}));
  if (r.status !== 200) {
    console.error(`✗ ${r.status}`, body.error || body);
    process.exit(1);
  }
  console.log(`Applied (${body.applied.length}):`, body.applied.join(', ') || '—');
  console.log(`Pending (${body.pending.length}):`, body.pending.join(', ') || '—');
  console.log(`Total migrations: ${body.total}`);
  process.exit(0);
}

console.log(`Migrating ${site} …`);
const res = await fetch(url, { method: 'POST', ...init });
const report = await res.json().catch(() => ({}));

if (!report.ok) {
  console.error(`✗ migration failed (${res.status})`);
  for (const f of report.failed || []) console.error(`  ${f.id}: ${f.error}`);
  process.exit(1);
}

console.log(`✓ baseline: ${report.baseline_statements} statements applied (idempotent)`);
console.log(`✓ migrations applied this run: ${report.applied.length}`);
for (const a of report.applied) console.log(`   - ${a.id} (${a.statements} statements)`);
console.log(`  recorded: ${report.migrations_before} → ${report.migrations_after} of ${report.migrations_total}`);

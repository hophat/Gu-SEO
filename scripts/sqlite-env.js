// In-memory D1 shim backed by node:sqlite, for integration tests.
//
// scripts/mock-env.js hand-matches SQL strings, which is fine for the
// project-scoping tests it was written for but useless for anything with
// real query shapes (the migration runner, the social queue). Node 22 ships
// node:sqlite, so tests can run the ACTUAL SQL against a real engine.
//
// The shim implements only the D1 surface the codebase uses:
//   prepare(sql).bind(...).first() / .all() / .run()
//   batch([...])
// and normalises results to D1's shape ({ results }, { meta: { changes } }).

import { DatabaseSync } from 'node:sqlite';

function toD1RunResult(info) {
  return {
    success: true,
    meta: {
      changes: Number(info?.changes ?? 0),
      last_row_id: Number(info?.lastInsertRowid ?? 0),
    },
  };
}

function createStatement(db, sql) {
  const make = (params) => ({
    async first() {
      const row = db.prepare(sql).get(...params);
      return row === undefined ? null : row;
    },
    async all() {
      return { results: db.prepare(sql).all(...params), success: true };
    },
    async run() {
      return toD1RunResult(db.prepare(sql).run(...params));
    },
    // Some call sites use .raw() / .values() — not used here, kept explicit
    // so an accidental use fails loudly instead of silently returning junk.
    raw() { throw new Error('raw() not implemented in test shim'); },
    values() { throw new Error('values() not implemented in test shim'); },
  });

  return {
    bind(...params) { return make(params); },
    first() { return make([]).first(); },
    all() { return make([]).all(); },
    run() { return make([]).run(); },
  };
}

export function createSqliteEnv({ seedSql = '', adminToken = 'test-admin-token-123' } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  if (seedSql) db.exec(seedSql);

  return {
    __sqlite: db,
    // Admin endpoints authenticate through the bearer token, so tests need a
    // request shaped the way adminGate()/resolveTenantContext() expect.
    ADMIN_TOKEN: adminToken,
    // adminGate() also refuses to run until site identity is set, otherwise
    // every admin call would 503 instead of the status under test.
    SITE_NAME: 'Test Site',
    SITE_URL: 'https://test.example',
    DB: {
      prepare(sql) { return createStatement(db, sql); },
      async batch(statements) {
        const out = [];
        for (const s of statements) out.push(await s.run());
        return out;
      },
      async exec(sql) { db.exec(sql); return { count: 0, duration: 0 }; },
    },
    // The queue needs a project row for getProject(); tests seed it.
    async __exec(sql) { db.exec(sql); },
    async __all(sql, ...params) { return db.prepare(sql).all(...params); },
    async __get(sql, ...params) { return db.prepare(sql).get(...params) ?? null; },
  };
}

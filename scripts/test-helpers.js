import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export function createTestEnv() {
  const db = new Database(':memory:');
  const sql = readFileSync(resolve('./schema/init.sql'), 'utf-8');
  db.exec(sql);

  const mockDb = {
    prepare(query) {
      return {
        bind(...params) {
          return {
            async first() {
              const stmt = db.prepare(query);
              const row = stmt.get(...params);
              return row || null;
            },
            async all() {
              const stmt = db.prepare(query);
              const results = stmt.all(...params);
              return { results };
            },
            async run() {
              const stmt = db.prepare(query);
              const info = stmt.run(...params);
              return { success: true, meta: { changes: info.changes } };
            }
          };
        }
      };
    }
  };

  return {
    DB: mockDb,
    SITE_NAME: 'AI Content Factory Test',
    ADMIN_TOKEN: 'test-admin-token-secret-12345',
  };
}

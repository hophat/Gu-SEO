---
name: d1-schema-change
description: "How to change the D1 schema in pages-seo safely — adding a column, table, or index to schema/init.sql, writing a numbered migration, regenerating functions/_lib/schema.js and migrations_bundle.js, and running the drift check. Use whenever a task needs new persisted data ('add a field to blog_posts', 'track X per project'), fails with 'no such column', or when a fresh install would break. Also use before any release that changes the DB shape."
---

# D1 schema change — additive, bundled, verified

D1 holds every post this system has ever generated. There is no backup in this repo and no
recovery path in any script. That single fact drives every rule here: the schema only ever grows,
and the file that ships the schema is generated, not edited.

## 1. Decide the phase first

The repo uses a **two-phase model**. Getting this wrong is the most common schema bug.

| Situation | Where the change goes |
|---|---|
| A live database needs it **now** | numbered migration in `functions/_lib/migrations.js` |
| A **fresh install** must have it, or fresh installs break | additive line in `schema/init.sql` |
| Both | do both — that is normal, not redundant |

A migration may legitimately create a table or add a column absent from `init.sql`;
`scripts/check-schema-drift.mjs` parses the migration SQL and derives the expected set, so those
are not reported as drift. That is why you do **not** silence the drift check when it complains:
silencing it is how `blog_posts.project_id` shipped broken on fresh installs.

## 2. Allowed DDL only

```sql
CREATE TABLE IF NOT EXISTS blog_post_metrics (
  id TEXT PRIMARY KEY,
  blog_post_id TEXT,
  created_at INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bpm_post ON blog_post_metrics(blog_post_id);
ALTER TABLE blog_posts ADD COLUMN reading_time INTEGER DEFAULT 0;
```

Never, in `schema/init.sql` or a migration:

- `DROP TABLE`, `DROP COLUMN`, `DROP INDEX`
- `NOT NULL` added to a column that already holds rows (D1 cannot backfill it safely)
- any rename (SQLite's `RENAME COLUMN` rewrites the table; on a large `blog_posts` that is a
  production event, not a migration)
- a `DELETE`, `TRUNCATE`, or "clean up old rows" step in a migration

`ALTER TABLE … ADD COLUMN` with a `DEFAULT` is the workhorse. Give every new column a default so
existing rows satisfy it.

## 3. Never hand-edit the generated bundles

`functions/_lib/schema.js` (from `schema/init.sql`) and `functions/_lib/migrations_bundle.js`
(from `functions/_lib/migrations.js`) are build output. Editing them creates a repo where the
source and the shipped schema disagree, and the next regeneration silently reverts the edit.

```bash
npm run bundle-schema     # runs bundle-schema.js then bundle-migrations.js
```

If regeneration fails, report the failure. Never patch the bundle to make it agree.

## 4. Update the call sites — and list them

A column that exists but is never selected is invisible; a query selecting a column that does not
exist is a 500. After the DDL:

```bash
grep -rn "blog_posts" functions/ src/ --include=*.js --include=*.jsx
```

Hand the exact column list and type to whoever owns the call sites. Do not silently rewrite
queries in a schema task — the Functions layer owner does that, and the list is the handoff.

## 5. Verify

```bash
npm run bundle-schema
git diff --stat functions/_lib/schema.js functions/_lib/migrations_bundle.js
node --no-warnings scripts/check-schema-drift.mjs   # READ-ONLY, queries the REMOTE db
node scripts/run-tests.js                            # if a seed or migration runner changed
```

The drift check executes `SELECT` against production D1 through Wrangler. It writes nothing, but
it is a network call against the live database — **ask before running it**, and if authorisation
is not granted, hand the user the command instead.

`npm run db:migrate` (`scripts/migrate.js`) applies migrations to the live database. It is a
write. Never run it without an explicit instruction in the current conversation.

## Checklist

- [ ] Phase decided: migration, init.sql, or both — and the reason stated
- [ ] Only `CREATE … IF NOT EXISTS` / `ALTER … ADD COLUMN` / `CREATE INDEX IF NOT EXISTS`
- [ ] Every new column has a `DEFAULT`
- [ ] `npm run bundle-schema` run; bundles changed only by the generator
- [ ] Call sites enumerated and handed off
- [ ] Drift check run **with approval**, or command reported
- [ ] No write, no drop, no database delete anywhere in the diff

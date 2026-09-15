-- 002: project-scoped internal-link aliases.
--
-- The problem: site_aliases was global. buildAliasMap() returned EVERY row to
-- every project, so the AI writing for project A was told it could link to
-- project B's pages, and the sanitiser would happily expand those names into
-- A's article. A cross-tenant content leak, not just a cosmetic one.
--
-- Why the table is rebuilt rather than ALTERed: the legacy table has
-- `name TEXT PRIMARY KEY`, so only one row per name can exist in the whole
-- database. Two projects could not each own a `login` alias. SQLite cannot
-- change a primary key in place, so the table is recreated.
--
-- Nothing is dropped. The legacy table is RENAMED to site_aliases_legacy and
-- left in place as a recovery copy; all rows are copied forward first.
--
-- project_id uses '' (not NULL) for "global". SQLite treats NULLs as distinct
-- in a unique index, so a NULL-scoped row could be inserted twice and
-- `ON CONFLICT(project_id, name)` would never fire for it. The empty string
-- keeps the constraint meaningful.
--
-- This runs on fresh installs too — schema/init.sql still declares the legacy
-- shape, so every database takes the same upgrade path and the migration is
-- exercised by every install rather than only by old ones.

ALTER TABLE site_aliases RENAME TO site_aliases_legacy;

CREATE TABLE IF NOT EXISTS site_aliases (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL DEFAULT '',   -- '' = shared/legacy
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  description TEXT,
  kind        TEXT NOT NULL DEFAULT 'manual',  -- manual | sitemap
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Scope + name is the identity. Composite so each project owns its own
-- vocabulary; '' still allows one shared row per name.
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_aliases_scope
  ON site_aliases(project_id, name);

CREATE INDEX IF NOT EXISTS idx_site_aliases_project
  ON site_aliases(project_id, kind);

-- Copy every legacy row forward as global (''). Existing installs keep
-- working exactly as before until an operator re-syncs per project.
INSERT INTO site_aliases (id, project_id, name, url, description, kind, created_at, updated_at)
  SELECT lower(hex(randomblob(16))), '', name, url, description, kind, created_at, updated_at
    FROM site_aliases_legacy;

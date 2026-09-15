// GENERATED FILE — do not edit by hand.
// Source: schema/migrations/*.sql
// Regenerate: node scripts/bundle-migrations.js
//
// Applied in filename order; each id is recorded in schema_migrations so a
// re-run is a no-op. Every migration must be idempotent anyway
// (CREATE TABLE IF NOT EXISTS / ALTER TABLE … ADD COLUMN), because a
// database created before this runner existed has no schema_migrations
// row for migrations whose effects it already carries.

export const MIGRATIONS = [
  { id: "001_social_posts", sql: "-- ============================================================================\n-- Social distribution queue\n-- ============================================================================\n-- One row per (blog post, channel) publication attempt. Publishing to an\n-- external network is not transactional with the blog write, so it gets\n-- its own durable job: the blog publish enqueues, and the cron drains.\n-- Without this, a dropped connection or a Facebook 5xx silently loses the\n-- post — the old fire-and-forget waitUntil() only wrote an audit line.\n--\n--   status: pending | publishing | published | failed | skipped\n--   next_attempt_at: unix seconds; exponential backoff between attempts\n--   needs_reconnect: 1 when the failure is a credential problem (bad or\n--     expired token, missing permission). Retrying is pointless until a\n--     human reconnects the channel, so the UI surfaces it as an action.\nCREATE TABLE IF NOT EXISTS social_posts (\n  id              TEXT PRIMARY KEY,\n  project_id      TEXT,\n  blog_post_id    TEXT NOT NULL,\n  channel         TEXT NOT NULL DEFAULT 'facebook',\n  status          TEXT NOT NULL DEFAULT 'pending',\n  attempts        INTEGER NOT NULL DEFAULT 0,\n  max_attempts    INTEGER NOT NULL DEFAULT 5,\n  next_attempt_at INTEGER NOT NULL,\n  external_id     TEXT,\n  external_url    TEXT,\n  error           TEXT,\n  needs_reconnect INTEGER NOT NULL DEFAULT 0,\n  created_at      INTEGER NOT NULL,\n  updated_at      INTEGER NOT NULL,\n  published_at    INTEGER\n);\n\n-- Idempotency: a retried blog publish must not enqueue a second time.\nCREATE UNIQUE INDEX IF NOT EXISTS idx_social_post_channel\n  ON social_posts(blog_post_id, channel);\n\n-- The drain query: due jobs, oldest first.\nCREATE INDEX IF NOT EXISTS idx_social_due\n  ON social_posts(status, next_attempt_at);\n\nCREATE INDEX IF NOT EXISTS idx_social_project\n  ON social_posts(project_id, created_at DESC);" },
];

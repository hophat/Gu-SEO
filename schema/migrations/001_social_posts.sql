-- ============================================================================
-- Social distribution queue
-- ============================================================================
-- One row per (blog post, channel) publication attempt. Publishing to an
-- external network is not transactional with the blog write, so it gets
-- its own durable job: the blog publish enqueues, and the cron drains.
-- Without this, a dropped connection or a Facebook 5xx silently loses the
-- post — the old fire-and-forget waitUntil() only wrote an audit line.
--
--   status: pending | publishing | published | failed | skipped
--   next_attempt_at: unix seconds; exponential backoff between attempts
--   needs_reconnect: 1 when the failure is a credential problem (bad or
--     expired token, missing permission). Retrying is pointless until a
--     human reconnects the channel, so the UI surfaces it as an action.
CREATE TABLE IF NOT EXISTS social_posts (
  id              TEXT PRIMARY KEY,
  project_id      TEXT,
  blog_post_id    TEXT NOT NULL,
  channel         TEXT NOT NULL DEFAULT 'facebook',
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  next_attempt_at INTEGER NOT NULL,
  external_id     TEXT,
  external_url    TEXT,
  error           TEXT,
  needs_reconnect INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  published_at    INTEGER
);

-- Idempotency: a retried blog publish must not enqueue a second time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_post_channel
  ON social_posts(blog_post_id, channel);

-- The drain query: due jobs, oldest first.
CREATE INDEX IF NOT EXISTS idx_social_due
  ON social_posts(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_social_project
  ON social_posts(project_id, created_at DESC);

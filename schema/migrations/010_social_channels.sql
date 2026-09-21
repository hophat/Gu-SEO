-- ============================================================================
-- 010: multi-channel social distribution (project_channels).
--
-- Before this table a project had exactly ONE external channel: the
-- publisher_type column of project_publishing_configs. "Post to Facebook
-- AND Instagram AND X" was impossible — the operator made N manual
-- round-trips per article.
--
-- One row per (project, channel). Enabled channels are fanned out at blog
-- publish time into social_posts, which already carries retry, backoff and
-- needs_reconnect machinery — nothing about the queue changes.
--
-- Legacy: project_publishing_configs.publisher_type stays the source of
-- truth for projects with no rows here. listEnabledChannels() in
-- functions/_lib/channels.js falls back to it, so existing installs keep
-- publishing to their single channel without any operator action, and the
-- first channel card they touch migrates them onto rows.
--
-- config_json holds per-channel NON-secret settings (page_id, ig_user_id,
-- threads_user_id, hashtags, message template). Secrets (tokens) never go
-- here — this table is plaintext; they live in the vault under
--   FACEBOOK_PAGE_TOKEN__<pid>   (shared by facebook + instagram)
--   THREADS_TOKEN__<pid>
--   X_API_KEY__<pid> / X_API_SECRET__<pid>
--   X_ACCESS_TOKEN__<pid> / X_ACCESS_SECRET__<pid>

CREATE TABLE IF NOT EXISTS project_channels (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  channel      TEXT NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 1,
  config_json  TEXT NOT NULL DEFAULT '{}',
  connected_at INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- Identity: one row per (project, channel). A retried publish or a double
-- save must not create a second row — upsert paths key on this index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_channels_unique
  ON project_channels(project_id, channel);

CREATE INDEX IF NOT EXISTS idx_project_channels_project
  ON project_channels(project_id, enabled);

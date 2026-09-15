-- 003: product events.
--
-- Deliberately narrow. Most of what a product owner wants to know is already
-- derivable from the data the product writes anyway:
--
--   activation      projects.created_at → first blog_posts.published_at
--   retention       blog_posts.published_at grouped by project and week
--   activity        posts per week, per project
--
-- Deriving those is strictly better than logging them: it is retroactive
-- (no gap before instrumentation existed), it cannot drift from the real
-- state, and it costs no writes on the hot path.
--
-- This table exists only for the things that are NOT derivable — the moments
-- where someone chose to do something and we would otherwise have no record
-- of the choice: which setup step they abandoned, whether they tried to
-- connect a channel and it failed, that kind of thing. That is the
-- information needed to explain a drop-off, not just measure it.
--
-- Writes are fire-and-forget: a failure to record an event must never fail
-- the user action it describes.

CREATE TABLE IF NOT EXISTS product_events (
  id         TEXT PRIMARY KEY,
  event      TEXT NOT NULL,
  project_id TEXT,
  user_id    TEXT,
  props_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_events_name_time
  ON product_events(event, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_project
  ON product_events(project_id, created_at DESC);

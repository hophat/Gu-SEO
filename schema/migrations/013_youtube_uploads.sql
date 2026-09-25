-- 013: durable YouTube resumable upload checkpoints.
--
-- The YouTube upload session URI is a bearer-like credential. Keep it
-- encrypted at rest and persist the acknowledged byte offset so a Worker
-- timeout or retry resumes the same session instead of creating a duplicate
-- video/quota charge.
CREATE TABLE IF NOT EXISTS youtube_uploads (
  social_post_id    TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL,
  source_key        TEXT NOT NULL,
  source_size       INTEGER NOT NULL,
  next_offset       INTEGER NOT NULL DEFAULT 0,
  session_ciphertext TEXT,
  video_id          TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_youtube_uploads_project
  ON youtube_uploads(project_id, updated_at DESC);

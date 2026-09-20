-- 007: video jobs — 9:16 social videos rendered by the external
-- HyperFrames agent (VPS with Chrome + FFmpeg; Workers can't render).
--
-- Flow: a published blog post gets ONE video job. The off-platform
-- agent polls /api/admin/video/claim, renders (LLM script + edge-tts
-- voiceover + HyperFrames), then POSTs the MP4 to
-- /api/admin/video/deliver which stores it in R2 and flips status.
--
--   status: pending | claimed | rendering | done | failed
--   script: the AI-written voiceover script (JSON) — kept for reuse
--           so a re-render never re-bills the LLM for the same post.
--
-- UNIQUE(blog_post_id) makes the claim path race-free: two agents
-- claiming the same post cannot both INSERT.

CREATE TABLE IF NOT EXISTS video_jobs (
  id              TEXT PRIMARY KEY,
  project_id      TEXT,
  blog_post_id    TEXT NOT NULL,
  slug            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | claimed | rendering | done | failed
  script          TEXT,                             -- AI voiceover script (JSON)
  video_key       TEXT,                             -- R2 object key once done
  error           TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  claimed_at      INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON video_jobs(status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_jobs_post ON video_jobs(blog_post_id);

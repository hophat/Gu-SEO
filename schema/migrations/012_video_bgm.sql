-- 012: operator-chosen background music per video job.
--
-- The create-video wizard offers a catalog of royalty-free tracks
-- (functions/_lib/bgm_catalog.js). video_jobs.bgm stores the choice:
--   NULL    → 'auto', claim picks a matching free catalog track
--   'none'  → muted by choice, voice only
--   <id>    → a catalog track; the claim resolves it to a playable URL
--             (/image/music/<file>, R2) for the off-platform agent
--
-- The statement also lives in schema/init.sql — the baseline runner
-- tolerates `duplicate column name`, so old and new DBs converge.

ALTER TABLE video_jobs ADD COLUMN bgm TEXT;

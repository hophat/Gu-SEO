-- 011: user-chosen video templates + presenter photo.
--
-- The admin wizard lets the operator pick a render template and a
-- duration per video job instead of leaving the choice to the agent.
-- video_jobs.template carries the catalog id (NULL = 'auto', the engine
-- picks); video_jobs.duration is the requested seconds (NULL = template
-- default). Both are plain job-payload fields the claim hands to the
-- agent — the platform never renders.
--
-- projects.presenter_name / presenter_image_url hold the talking-head
-- identity that presenter templates (news_anchor) draw. The image is an
-- R2 object served through /image/, stored as a relative path like
-- logo_url; claim absolutizes it for the off-platform agent.
--
-- The statements also live in schema/init.sql — the baseline runner
-- tolerates `duplicate column name`, so old and new DBs converge.

ALTER TABLE video_jobs ADD COLUMN template TEXT;
ALTER TABLE video_jobs ADD COLUMN duration INTEGER;
ALTER TABLE projects ADD COLUMN presenter_name TEXT;
ALTER TABLE projects ADD COLUMN presenter_image_url TEXT;

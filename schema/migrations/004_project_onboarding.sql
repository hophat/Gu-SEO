-- 004: per-project onboarding state.
--
-- The bug this fixes: onboarding was tracked as `settings.onboarding_complete`,
-- a GLOBAL row. The settings table has no project_id, so the first project that
-- finished the wizard marked EVERY project complete — which is why a brand new
-- account sailed straight past the setup step. The Brand DNA and schedule
-- checks were read from the same global settings row for the same reason.
--
-- State now lives on the project itself.
--
-- Backfill: a project that already has Brand DNA AND calendar slots has, in
-- fact, been set up, so it is marked complete. Without this every existing
-- install would be dropped into the wizard on next login — correct per the
-- letter of the rule, wrong for the operator, and it would have looked like
-- the upgrade broke their site.
--
-- The guard (`onboarding_complete_at IS NULL`) keeps the statement idempotent.

ALTER TABLE projects ADD COLUMN onboarding_complete_at INTEGER;

UPDATE projects
   SET onboarding_complete_at = strftime('%s', 'now')
 WHERE onboarding_complete_at IS NULL
   AND EXISTS (
     SELECT 1 FROM project_brands b
      WHERE b.project_id = projects.id
        AND (b.business_type IS NOT NULL OR b.audience IS NOT NULL)
   )
   AND EXISTS (
     SELECT 1 FROM content_calendar c
      WHERE c.project_id = projects.id
   );

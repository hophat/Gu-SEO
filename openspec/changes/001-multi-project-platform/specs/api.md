# Specs: Multi-Project / Multi-Brand AI Content Platform

## Spec 1: Project Management API
- `GET /api/admin/projects`
  - Returns list of all projects with their status, brand summary, and schedule.
- `POST /api/admin/projects`
  - Creates or updates a project. Fields: `id`, `slug`, `name`, `description`, `website_url`, `publishing_url`, `language`, `timezone`, `status`, `approval_mode`.
- `GET /api/admin/projects/:id`
  - Returns detailed project entity, including brand, AI config, and publishing config.
- `PUT /api/admin/projects/:id/brand`
  - Updates brand DNA and strategic guidance for this project.
- `PUT /api/admin/projects/:id/ai-config`
  - Updates model selections, token ranges, and provider preferences.
- `PUT /api/admin/projects/:id/publishing`
  - Configures target publisher (internal_d1, webhook, custom_api, wordpress).

## Spec 2: Topic Engine API
- `GET /api/admin/topics?project_id=:id`
  - Returns topic candidates and history for the project.
- `POST /api/admin/topics/generate`
  - Autonomous candidate generator based on project knowledge, brand themes, and previous topic deduplication.
- `POST /api/admin/topics`
  - Creates manual candidate topic.

## Spec 3: Content Calendar & Pipeline API
- `GET /api/admin/calendar?project_id=:id`
  - Filter calendar items by project.
- `POST /api/admin/calendar/plan`
  - Generates multi-day content calendar slots for a project using brand themes & topic engine.
- `POST /api/admin/blog/start`
  - Accepts `project_id` in request body. Scopes job, slot claim, and settings to project.
- `POST /api/admin/blog/publish`
  - Triggers publisher abstraction based on project configuration (internal D1 or external API/webhook).

## Spec 4: Scheduler & Cron Orchestration
- `POST /api/admin/cron/tick`
  - Iterates over all active projects. Evaluates schedules and triggers due generation jobs. Guarantees idempotency via `blog_jobs` and date locking.

# Design: Multi-Project / Multi-Brand AI Content Platform

## 1. Architectural Overview

```
                      +-----------------------------+
                      |     Cloudflare Pages App    |
                      +-----------------------------+
                                     |
              +----------------------+----------------------+
              |                                             |
     [Admin API & UI]                             [Public Endpoints]
   /api/admin/projects                         /blog/:slug (per project)
   /api/admin/topics                           /api/embed/:id
   /api/admin/calendar                         /feed.xml
   /api/admin/cron-tick                        /sitemap.xml
              |                                             |
              +----------------------+----------------------+
                                     |
                          +-------------------+
                          |    D1 Database    |
                          | (Multi-Project)   |
                          +-------------------+
                                     |
        +----------------------------+----------------------------+
        |                            |                            |
  [AI Provider Layer]       [Quality & Dedup Gate]     [Publisher Abstraction]
  - LLM Interface           - Similarity Check         - D1 Internal Publisher
  - Image Interface         - Readability/Structure    - Webhook Publisher
  - Provider Registry       - Brand Voice Guard        - Custom API / WP
```

## 2. Database Schema Design (Additive)

New tables added to `schema/init.sql`:
1. `projects`: id, slug, name, description, website_url, publishing_url, language, timezone, status, approval_mode ('auto'|'approval'), created_at, updated_at.
2. `project_brands`: project_id, business_type, tone, audience, key_themes, topics_to_avoid, service_area, cta, created_at, updated_at.
3. `project_knowledge`: id, project_id, title, content_type ('docs'|'faq'|'guidelines'|'notes'), content, created_at, updated_at.
4. `project_ai_configs`: project_id, default_text_provider, default_image_provider, text_model, image_model, min_words, max_words, temperature, system_prompt_override, created_at, updated_at.
5. `project_publishing_configs`: project_id, publisher_type ('internal_d1'|'webhook'|'custom_api'|'wordpress'), endpoint_url, auth_header, config_json, created_at, updated_at.
6. `project_topics`: id, project_id, key, angle, category, source ('ai'|'manual'|'research'), relevance_score, business_value_score, status ('candidate'|'selected'|'used'|'archived'), times_used, last_used_at, created_at, updated_at.
7. `ai_runs`: id, project_id, task_type, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, duration_ms, status, error, created_at.
8. `project_schedules`: project_id, frequency ('daily'|'weekly'), cron_expression, preferred_time_utc, is_active, last_run_at, next_run_at, created_at, updated_at.

Additive alterations to existing tables for backwards compatibility:
- `blog_posts`: ADD COLUMN `project_id TEXT`
- `blog_jobs`: ADD COLUMN `project_id TEXT`
- `content_calendar`: ADD COLUMN `project_id TEXT`
- `ai_usage`: ADD COLUMN `project_id TEXT`

## 3. Provider Abstraction Architecture

### AI Provider Interface (`functions/_lib/ai/provider.js`)
- `generateText({ prompt, systemPrompt, model, maxTokens, temperature, env, credentials }) -> { text, promptTokens, completionTokens, costUsd }`
- `generateImage({ prompt, model, env, credentials }) -> { imageBytes, mimeType, costUsd }`

Standardized adapters:
- Workers AI adapter (binding)
- OpenAI / OpenAI-compatible adapter (covers DeepSeek, Groq, Together, OpenRouter, LiteLLM)
- Anthropic adapter
- Gemini adapter

### Publisher Abstraction (`functions/_lib/publishing/publisher.js`)
- `publishArticle({ project, article, env }) -> { success, publishedUrl, externalId, error }`

Supported Publishers:
- `internal_d1`: publishes directly to local D1 `blog_posts` (classic pages-seo behavior)
- `webhook`: sends standardized JSON payload with signature to target endpoint
- `custom_api`: posts article with Bearer/Header authentication to external site (Gulagi / GuRouter doc/blog sites)
- `wordpress`: standard WordPress REST API v2 publishing

## 4. Multi-Project Cron Execution Flow

When cron Worker ticks (`/api/admin/blog/cron-tick` or `/api/admin/cron/run`):
1. Query active projects from `projects` and `project_schedules`.
2. For each project due for a post:
   - Check idempotency (ensure no post published within window or job already in progress).
   - Fetch next scheduled calendar item for this `project_id`.
   - If no slot, invoke autonomous Topic Engine using `project_brands` & `project_knowledge` to create a fresh topic for `project_id`.
   - Launch blog generation pipeline (`start` -> `text` -> `image` -> `publish`).
   - Log run in `ai_runs` and audit log.
   - If project is in `approval` mode, stop before publish and mark calendar slot as `review`. If `auto`, dispatch to project's configured publisher.

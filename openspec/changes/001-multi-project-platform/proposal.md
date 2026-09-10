# Proposal: Multi-Project / Multi-Brand AI Content Platform

## 1. Context & Motivation
The base repository `pages-seo` is designed as a single-site programmatic SEO and daily blog automation tool running on Cloudflare Pages (Functions + D1 + R2 + Workers AI).
While effective for a single brand, it uses global settings, a single calendar, and a hardcoded topic generator without multi-tenant/multi-project data isolation.

The objective is to transform `pages-seo` into a **Multi-Project / Multi-Brand / Multi-Site AI Content Platform** without breaking existing single-site installations or discarding the solid Cloudflare primitives (D1, R2, Functions, Cron Worker).

Initial launch targets:
1. **Gulagi**: Retail shops, e-commerce, Google Maps, local SEO, website conversion (`https://docs.gulagi.com`).
2. **GuRouter**: AI, LLMs, Agents, coding, APIs, infrastructure (`https://blogs.gurouter.com`).

## 2. Goals & Non-Goals
### Goals
- Introduce first-class `projects`, `brands`, `project_knowledge`, `topics`, `content_calendar`, `articles`, `publishing_jobs`, `ai_providers`, and `ai_runs` entities in D1 schema.
- Support strict project isolation (every entity scoped to `project_id`).
- Abstract AI provider layer (LLMProvider, ImageProvider) supporting Workers AI, OpenAI, Anthropic, Gemini, Groq, DeepSeek, LiteLLM/compatible endpoints.
- Abstract Publisher layer (WordPressPublisher, WebhookPublisher, CustomApiPublisher, Markdown/D1 fallback).
- Support autonomous topic generation and multi-day content calendar per project.
- Extend Daily Scheduler / Cron to cycle through active projects with idempotency and time/calendar-based scheduling.
- Retain full backward compatibility with single-site `pages-seo` deployments (default project fallback).

### Non-Goals (for Phase 1)
- Google Search Console API automatic token handshake (manual verification tags preserved).
- Full multi-tenant SaaS billing/Stripe integration (deferred to Phase 4).
- Full external crawler mesh (advanced RSS/web scraper will be expanded in Phase 2).

## 3. Reusable Components in `pages-seo`
- **D1 Schema & Bundler**: `schema/init.sql` + `scripts/bundle-schema.js` + `functions/_lib/schema.js`. Keep schema purely additive with `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN`.
- **Authentication & Gate**: `functions/_lib/auth.js` (`adminGate`, token HMAC session cookies).
- **Multi-step Blog Chain**: `start.js` -> `text.js` -> `image.js` -> `publish.js` with `blog_jobs` state machine for resilient isolate execution.
- **Image Generation & Asset storage**: R2 integration, SVG covers, provider fallbacks.
- **Quality & Dedup**: Embedding generation via `@cf/baai/bge-base-en-v1.5` and heuristic quality gates.
- **Cron Worker**: Cloudflare scheduled Worker calling admin API endpoints.

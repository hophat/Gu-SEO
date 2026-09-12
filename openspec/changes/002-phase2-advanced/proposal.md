# Proposal: Phase 2 Advanced — Competitor Analysis, Topical Authority, Content Refresh

## 1. Context & Motivation
Phase 1 delivered the multi-project platform, Vietnamese prompts, Gulagi brand blog at `gulagi.com/blog`, daily cron, IndexNow, and admin Analytics/Trends menus. Blog output is consistent but not yet competitive: articles lack measured comparison against top-ranking rivals, topics are picked without competition/freshness scoring, internal linking is opportunistic rather than cluster-driven, and old posts decay without refresh.

Phase 2 makes content competitive and self-maintaining for the first two projects (Gulagi retail/local-SEO, GuRouter AI/infra) without changing publishers, auth, or the start/text/image/publish chain.

## 2. Goals & Non-Goals
### Goals
- Measure rivals per keyword (word count, headings, links) and store snapshots for scoring.
- Score topic candidates on relevance + freshness + competition + business value + search intent.
- Build pillar → cluster internal-link topology per project and auto-link new posts.
- Auto-detect stale/weak posts and refresh them in place (same slug, 301 on rename, re-ping IndexNow/GSC).
- Cap AI cost and cron load (refresh max 2 posts/week, snapshot cache 7 days).

### Non-Goals (for Phase 2)
- SaaS billing, multi-user roles, API rate limits (Phase 4).
- Full external crawler mesh or SERP scraping at scale (bounded scan only).
- Rewriting the publisher abstraction or auth model.

## 3. Reusable Components
- D1 schema + bundler: `schema/init.sql` + `scripts/bundle-schema.js` (additive only).
- Blog chain `start/text/image/publish` with `blog_jobs` state machine and idempotency.
- AI provider abstraction, project/topic libraries, internal-link helpers, site aliases.
- Cron worker calling admin APIs over short HTTP calls.
- Admin patterns: `adminGate` first, `json()` responses, `audit()` on mutation.

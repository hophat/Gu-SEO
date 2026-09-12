# Design: Phase 2 Advanced

## 1. Architecture
```
Cron daily 08:00 UTC (existing gulagi-cron-worker)
  ├─ blog chain (unchanged: start → text → image → publish)
  ├─ topic scoring v2 (new weights, reads competitor_snapshots)
  └─ freshness tick (new, cheap: update freshness_score, dedupe)

Cron weekly Mon 07:00 UTC (new schedule in same worker)
  └─ refresh scan → refresh run (max 2 posts/week)
        ├─ reuse text/image/publish on same post id
        ├─ keep slug; write blog_post_redirects on rename
        └─ ping IndexNow + GSC, bump refresh_count/last_refresh_at

Admin API (new, all gated by adminGate)
  ├─ POST /api/admin/competitors/scan + GET /api/admin/competitors
  ├─ POST /api/admin/topics/score
  ├─ POST /api/admin/refresh/scan + POST /api/admin/refresh/run
  └─ surfaced in Trends tab (scan/score) and Calendar/System (refresh)
```

## 2. Data Model (additive)
- `project_topics`: + `competition_score`, `freshness_score`, `search_intent`.
- `blog_posts`: + `last_refresh_at`, `refresh_count`.
- New `competitor_snapshots`: per keyword, measured facts only.
- New `content_clusters`: pillar → cluster mapping per project.
- New `refresh_jobs`: one row per refresh attempt with reason/status.

## 3. Scoring
`final = 0.3*relevance + 0.25*business_value + 0.2*freshness + 0.15*(100-competition) + 0.1*intent_fit`, all 0–100. Candidates below 60 are archived, never published. Same-slug or embedding-similar topics are deduped before scoring.

## 4. Refresh Policy
- Eligible: `status='published'` AND (`published_at older than 90 days` OR `quality < 80` OR `manual flag`).
- Max 2 runs/week enforced in both cron and endpoint (count `refresh_jobs` in last 7 days).
- Same post id reused; slug preserved unless title change forces rename, then 301 row added.
- Side effects (IndexNow ping, GSC submit, sitemap alias sync, embedding re-store) run only on final `published`.

## 5. Internal Linking
- 3–5 pillars per project stored in `content_clusters` (pillar rows).
- On publish/refresh: link 2–3 targets (pillar first, then same-cluster siblings) via existing alias/sanitise helpers. Never invent paths; validate against whitelist.

## 6. Cost & Safety
- Snapshot cache 7 days per (project_id, keyword); scan max 5 keywords/call.
- Refresh path reuses existing budget checks (`X-Source-Cron` gating).
- All mutations audited; all failures leave jobs in retryable state, never half-published.

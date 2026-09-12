# Specs: Phase 2 Advanced API

## POST /api/admin/competitors/scan
- Auth: `adminGate`. Body: `{ project_id, keyword, urls? }`.
- Behavior: if a snapshot for (project_id, keyword) newer than 7 days exists, return cached. Else measure up to 5 rival URLs (word count, heading counts, outbound link count — facts only, no invented rankings), store rows in `competitor_snapshots`, return `{ ok:true, keyword, snapshots, cached }`.
- Errors: `missing_project_id`, `missing_keyword`, `scan_failed` with provider detail truncated to 300 chars.

## GET /api/admin/competitors?project_id=&keyword=
- Auth: `adminGate`. Without `project_id` returns latest 20 snapshots across projects; with it, filters by project (and keyword when given), newest first, max 20.

## POST /api/admin/topics/score
- Auth: `adminGate`. Body: `{ project_id }`.
- Behavior: load `status='candidate'` topics for project, compute relevance/business/freshness/competition/intent_fit using brand themes plus cached snapshots, write `competition_score`, `freshness_score`, `search_intent`, archive score < 60. Return ranked list.
- Never publishes anything.

## POST /api/admin/refresh/scan
- Auth: `adminGate`. Body: `{ project_id?, limit? }` (default limit 10).
- Behavior: find published posts older than 90 days or flagged weak, skip posts refreshed in last 30 days, create `refresh_jobs` rows with reason, return candidates. Enforces weekly cap downstream, not here.

## POST /api/admin/refresh/run
- Auth: `adminGate`. Body: `{ job_id?, post_id? }` (one required).
- Behavior: re-run text/image/publish against the same post id; preserve slug unless title forces change (then insert `blog_post_redirects` 301); bump `refresh_count`, set `last_refresh_at`; re-ping IndexNow/GSC and re-sync aliases/embeddings only on final published.
- Enforces max 2 successful refreshes per 7 days per project; excess returns 429 `refresh_cap_reached`.

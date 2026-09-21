# Issue Triage State
Last run: never (first run pending)
Open actionable: unknown
New since last run: unknown
Needs human: 0

## Top 5 (by loop score)
- (empty — populated by the next `loop-issue-triage` run)

## Resolved (verified by real run, no autofix needed)
- 2026-09-21 — [bug][P1][single-file] Carousel publish failed when the Facebook channel has `as_video: true`: `functions/_lib/publishing/facebook.js` checked `cfg.asVideo` BEFORE the carousel branch, so a `carousel/<slug>` video_key went to `publishFacebookVideo`, whose `env.IMAGES.get('carousel/<slug>')` returns null (a prefix has no object) → "Video carousel/<slug> không còn trong R2". Fixed by the manual verification pass: the carousel branch now runs first. Proven by probe: carousel + `as_video: true` → 5-photo post, 0 `/videos` calls.
- 2026-09-21 — [bug][P2][single-file] `listSocialPosts` joined `blog_posts` on the raw `blog_post_id`, so a carousel social job rendered `post_title: null` (the Social tab and the Overview card showed "—"). Now joins through `postIdFromRefSql` like `loadJobContext`.

## Proposed Labels (not applied in L1)
- (none yet)

## Possible Duplicates (human confirm)
- (none yet)

## Noise / Ignored
- (none yet)

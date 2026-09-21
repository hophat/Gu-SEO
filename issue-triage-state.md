# Issue Triage State
Last run: never (first run pending)
Open actionable: unknown
New since last run: unknown
Needs human: 0

## Top 5 (by loop score)
- [bug][P1][single-file] Carousel publish fails when the Facebook channel has `as_video: true`: `functions/_lib/publishing/facebook.js` checks `cfg.asVideo` (line ~186) BEFORE the carousel branch, so a `carousel/<slug>` video_key goes to `publishFacebookVideo`, which does `env.IMAGES.get('carousel/<slug>')` → null → throws "Video carousel/<slug> không còn trong R2". Fix: route `carousel/…` video_keys to the carousel branch before the as_video branch.
- (remaining slots empty — populated by the next `loop-issue-triage` run)

## Proposed Labels (not applied in L1)
- (none yet)

## Possible Duplicates (human confirm)
- (none yet)

## Noise / Ignored
- (none yet)

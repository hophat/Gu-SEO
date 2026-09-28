# Content factory

Daily short-form video for a brand, driven by what is actually trending.

The pipeline itself is not here — it is the platform's video queue
(`functions/api/admin/video/*`) driven by `video-agent/render-video.mjs`.
This directory holds only the state the daily run needs to survive between days.

- `trend-ledger.jsonl` — one JSON object per video that has been made, so
  the same trend is not proposed twice. Append after a video is enqueued.

```json
{"date":"2026-09-28","project_id":"…","topic":"…","publisher":"…","quote":"…","template":"story","duration":60,"job_id":"…","status":"done"}
```

Run it with `/daily-video` (full loop) or `/trend-scan` (research only).
Both are defined in `.pi/prompts/`; the rules live in `.pi/skills/`.

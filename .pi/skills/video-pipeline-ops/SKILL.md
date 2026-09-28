---
name: video-pipeline-ops
description: "How to enqueue, render, and deliver a video job in pages-seo — the create/claim/deliver API contract, job kinds and their ref sentinels, the dedupe rule that governs repeat videos, the renderer CLI, and where a job gets stuck. Use when creating a video job, running video-agent/render-video.mjs, debugging 'already_rendering', a job stuck in pending, a missing MP4, or the daily render routine."
---

# Video pipeline operations

One path, end to end: **enqueue → claim → render → deliver**. The platform owns the queue in D1 and
the renderer is stateless — it claims a job, does the work, posts the MP4 back. Nothing in the
renderer holds a script or a trend; everything comes from the job row.

## 1. Enqueue — `POST /api/admin/video/create`

Gated by `adminGate`. Body:

```json
{
  "source": { "project_id": "<id>" },
  "template": "story",
  "duration": 60,
  "bgm": "auto"
}
```

Three source shapes, and they decide the job kind:

| `source` | kind | `blog_post_id` ref | Notes |
|---|---|---|---|
| `{ slug }` | `post` | the real post id | post-backed |
| `{ url }` | `website` | `url:<href>` | content fetched from the live page |
| `{ project_id }` | `business` | `project:<id>` | **brand kit drives every visual — this is the brand-video path** |

For a trend video for a brand, use `{ project_id, brief }` → `kind='business'`. The ref sentinel
exists so the `UNIQUE(blog_post_id)` index holds. `brief` is the material the story is written
from; without it the claim falls back to `job.project.description` and the video is about the
project blurb instead of the trend.

- `brief`: up to 20,000 chars, trimmed. Accepted for `business` and `website`; ignored for `post`,
  which always has its own body. Present-but-blank is `400 empty_brief` rather than a silent
  fallback, and over the cap is `413 brief_too_long`.
- `template` must be a catalog id, else `unknown_template`; must accept the kind, else
  `template_source_mismatch`.
- `duration` clamps to **30–90** (`clampVideoDuration`) — see the band note in
  `/skill:shortform-script`. A smaller number is not rejected, it is raised. Set it explicitly for
  a short video; leave it out and the engine picks an article-length one.
- `bgm`: `auto` (omit) lets the claim pick a track per template; `'none'` is muted; a catalog id
  pins one.

## 2. The dedupe rule — this governs daily videos

`dedupe()` looks up the newest job with the same `kind` + `ref`:

- **`pending` / `failed` / in-flight → `409 already_rendering`.** The new request is refused.
- **`done` → the old row is deleted, then the new one is inserted.** Repeat is allowed.

Consequence for a daily routine: a `business` job's ref is `project:<id>`, so **one project holds
one business job at a time**. Yesterday's `done` job is replaced cleanly. But if yesterday's is
still queued or mid-render, today's enqueue gets a 409 — not a duplicate, a refusal. The daily
routine must therefore *check job state first* and only enqueue when the previous one is `done`.

A 409 is never a bug to retry blindly. Read the current state, then decide.

## 3. Claim — `POST /api/admin/video/claim`

```json
{ "type": "business", "project_id": "<id>" }
```

Claims the **oldest** `pending`/`failed` job of that kind (and project, if given). Returns
`{ ok: true, job: null, hint: "no business video queued" }` when the queue is empty — an empty
queue is a normal answer, not an error. The claim payload carries the post/brand content, the
template, the duration, and the resolved BGM track.

## 4. Render — `node video-agent/render-video.mjs`

```bash
node video-agent/render-video.mjs                              # claim the newest queued post
node video-agent/render-video.mjs --type business --project <project_id>
node video-agent/render-video.mjs --slug <slug>
```

On the render VPS. Config in `video-agent/.env` (0600): `BASE_URL`, `ADMIN_TOKEN`,
`NINEROUTER_API_KEY` (+ optional `NINEROUTER_BASE_URL`, `NINEROUTER_TEXT_MODEL`), `GUROUTER_API_KEY`,
`VIDEO_VOICE`, `VIDEO_PROJECT_ID`, `VIDEO_BATCH`, `ACCENT`, plus
`AIFREE_API_KEY` for scene images (or `VIDEO_AI_IMAGES=0` to keep the drawn gradients;
`VIDEO_AI_MAX_IMAGES` caps generation per video).

The chain: claim → model script → `edge-tts` `vi-VN` → HyperFrames composition → render →
deliver. The script step asks 9Router (`guguseo`) first and falls back to GuRouter, with one retry
per provider on a 5xx. A `--project` render claims that project's oldest pending business job, so
**one render process at a time per project**; parallel renders will race for the same row.

## 5. Deliver — `POST /api/admin/video/deliver`

The agent POSTs the raw MP4 as the body with the job id in the `X-Video-Job` header. The server
sniffs the bytes (never trusts the extension), stores to R2 under `video/<slug>-<ts>.mp4`, and
flips the job to `done`. A JSON body instead marks the job `failed` with the agent's error text
visible to the operator. After success, two best-effort side effects run in `waitUntil`: a
`facebook_video` enqueue when the channel is configured `as_video`, and the ready-notification
email.

## Where jobs get stuck

| Symptom | Cause | Fix |
|---|---|---|
| `409 already_rendering` | previous job for the same `kind`+`ref` is not `done` | wait for or clear it; do not force-insert |
| claim returns `job: null` | nothing `pending`/`failed` for that kind | the enqueue did not land, or already completed |
| job `failed` with a render error | agent error text is stored on the row | read the row's error, fix upstream, re-claim (`failed` is claimable) |
| MP4 missing but job `done` | delivered to R2 under `video/<slug>-<ts>.mp4` | check R2, not the job row |
| video is all text cards | `reviewStoryboard` slideshow rejection, or a body with no numbers | see `/skill:shortform-script` |
| narration longer than the video | body too long for the duration at 2.6 words/sec | shorten `body_markdown` |

## Secrets

`ADMIN_TOKEN`, `NINEROUTER_API_KEY` and `GUROUTER_API_KEY` live in `video-agent/.env`, never in git.
The render agent logs the job, not the payload. Keep it that way: a log line with a Bearer token is
a credential in a log aggregator.

## Tests

`node --no-warnings scripts/run-video-agent-tests.mjs` drives the whole chain with a temp
workspace and faked TTS, render and deliver. Run it after touching anything in `video-agent/` or
the video job schema. It is the only cheap way to know the chain still closes.

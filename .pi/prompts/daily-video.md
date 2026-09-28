---
name: content-factory-harness
description: "The pages-seo content factory — a daily loop that researches what is genuinely trending (live web search, never from memory), writes a 30-60 second Vietnamese brand video from it, and enqueues it for render. Use for 'làm video hôm nay', 'video trend', 'content hàng ngày', 'cho tôi 5 chủ đề video', 'video cho brand', or any request to produce social video on a current topic. Also handles re-runs: 'lấy trend mới', 'đổi chủ đề', 'làm lại video hôm qua'."
---

Use the `subagent` tool with **`agentScope: "both"`** on every call.

**$@**

## The one rule that outranks the workflow

> Nothing in a published video may come from the model's memory. Every claim about the world is
> backed by a `quote` from a live search result, with its publisher named.

The value here is a video that is *true and current*. A fluent, confident, invented trend is
worse than no video: it burns a slot, a render, and the brand's name. `trend-scout` is the only
agent permitted to say something is happening now.

## Owner map

| Stage | Agent | Skill |
|---|---|---|
| research | `trend-scout` | `/skill:trend-search` |
| script | `scriptwriter` | `/skill:shortform-script` + `/skill:brand-voice` |
| execute | `video-producer` | `/skill:video-pipeline-ops` |

## Phase 0: context check

- `_workspace/` with today's brief → this is a re-run. Read it, keep the topic if it is still
  live, and re-run only the stages the feedback names.
- Otherwise create `_workspace/`.

## Phase 1: research (`trend-scout`)

```json
{ "agent": "trend-scout",
  "task": "Load /skill:trend-search and /skill:brand-voice. Find trends for project <project_id> on <date>. Run 3-5 distinct queries in Vietnamese and English, check content-factory/trend-ledger.jsonl for topics already used, and rank candidates by brand fit × evidence strength. Every topic needs publisher, verbatim quote, and a recency phrase found in the text. Write _workspace/01_trend-scout_brief.md and return the HANDOFF block. If nothing qualifies, say NONE_QUALIFIED and stop." }
```

## Phase 2: script (`scriptwriter`)

One `single` call, one trend:

```json
{ "agent": "scriptwriter",
  "task": "Write the 30-60s video brief for this trend: {previous}\n\nLoad /skill:shortform-script and /skill:brand-voice. Read project_brands for the project. Produce body_markdown (3-5 headings, one claim each, publisher named, ~80-155 words to suit the duration, at least one real number), template, an explicit duration of 30-60, and the evidence table tracing every figure. Return the HANDOFF block." }
```

## Phase 3: execute (`video-producer`)

```json
{ "agent": "video-producer",
  "task": "Load /skill:video-pipeline-ops. Queue and render the approved script for project <project_id> with source.brief set. Check queue state first (a non-done previous job means 409). Confirm the claim payload echoes the approved script rather than the project description. Then render and verify the MP4. Do NOT post to any social platform. Return the HANDOFF block with NEEDS_APPROVAL." }
```

## Phase 4: report and stop

Give the user:
- the trend, its publisher, and the quote that made it worth making
- the script, the template, the duration
- what was actually rendered, or what is waiting
- anything the user must approve

**Do not post to TikTok, Reels, Shorts or Facebook.** The pipeline delivers to R2 and D1; pushing
to a social account is a separate, explicit instruction.

## Known limits — state these rather than working around them silently

- **`409 already_rendering` is a refusal, not a duplicate.** One business job per project at a
  time. Check state first.
- **The brief must be set explicitly.** `source.brief` is what the story is written from; without
  it the claim falls back to `projects.description` and the video is about the project blurb. If
  the claim payload does not echo the approved script, the migrations have not run on that
  database — `video-producer` stops and reports rather than shipping the wrong content.
- **Article videos still get a minute.** `duration` is left unset, `suggestDuration` only ever
  proposes 60/75/90. A short video therefore requires setting `duration` explicitly — which the
  scriptwriter always does.

## Batch mode ("give me 5 topics", "a week of content")

Run Phase 1 once, then Phase 2 for the top 2–3 topics in **parallel** — they are independent
writes. Enqueue **one** video; the rest stay as approved briefs in `_workspace/`, because a
project holds a single business job and queueing five produces four 409s and one surprise.

## Error handling

- `NONE_QUALIFIED` → report it and stop. Do not substitute a topic from memory.
- A topic with one source → still allowed, but the risk goes in the report so the user decides.
- A failed render → read the job's stored error; do not retry blindly into the same input.
- A claim that drifts from the sources → cut it. Do not soften it into vagueness.

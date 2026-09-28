---
name: shortform-script
description: "How to turn a researched trend into a 30-60 second vertical video for pages-seo — word budget, scene count, on-screen text limits, template choice, and the body_markdown brief the renderer actually reads. Use when writing a video script, sizing a narration, choosing a story template, or when a render came out too long, too short, or as a text-only slideshow. Covers the 30-90s duration band and how to reach the short end of it."
---

# Short-form script — 30–60s vertical

The renderer is not a blank canvas. `video-agent/storyboard.mjs` decides the numbers a model
cannot be trusted with — duration, how many words fit a slot, how many screens — and rejects a
storyboard that is mostly text with no asset. Write to those numbers from the start.

## The numbers, verbatim

| Constant | Value | Consequence |
|---|---|---|
| `WORDS_PER_SECOND` | 2.6 | 30s ≈ 78 words, 45s ≈ 117, **60s ≈ 156** |
| `MIN_SCENES` | 3 | fewer is rejected by `reviewStoryboard` |
| `MAX_SCENES` | 16 | ~5.5s per screen; a 90s video is sixteen cuts |
| `MAX_TEXT_WORDS` | 8 | on-screen text longer than this gets truncated |
| `DURATION` | min 30, max 90, default 75 | 30s is legal; `default` only matters when duration is unset |

## The duration band

Two independent clamps, both **30–90s**:

- `functions/_lib/video_templates.js` → `clampVideoDuration()`
- `video-agent/storyboard.mjs` → `DURATION.min = 30`

Anything outside is clamped, not rejected — so a 20s request renders 30s rather than erroring.

The 30s floor is a *platform* limit, not an editorial one. Article videos keep their minute: when
a job does not specify a duration, `suggestDuration` only ever proposes 60/75/90, so a post video
is still at least a minute. The short band exists for short-form social — one researched claim,
30–60s — which is what this skill writes. Set `duration` explicitly when you want the short band;
leave it unset and you will get an article-length video.

## What you actually deliver

The renderer writes its own narration from `job.body_markdown` (falling back to
`job.project.description`). You are not handing it a finished script — you are handing it the
**source text whose shape decides the story**. That is the real lever, and it is why the brief
matters more than the wording.

`storyboardFromContent` derives the intent, `suggestDuration` measures the source's headings and
word count to pick a duration when the job does not specify one, and the pipeline picks the visual
for each beat from assets that actually exist.

### Writing `body_markdown`

Give it real structure, because structure is what the engine reads:

```markdown
# <headline: the one claim, stated as a fact, with the publisher named>

<2–3 sentences of context. What changed, when, who reported it.>

## <beat 2 heading>
<1–2 sentences>

## <beat 3 heading>
<1–2 sentences>

<the brand angle: one sentence tying the trend to what the brand does>
```

- **Headings drive duration.** `suggestDuration` counts them. Three to five is a 60s video; a
  wall of prose is not a story.
- **One claim per heading.** A heading is a beat; a paragraph under it is the scene's content.
- **Name the publisher in the body**, not only in a comment — it is what keeps the claim honest
  when the model paraphrases.
- **Length to the target.** ~110–130 words of body for a 60s video. Far under and the video
  rambles; far over and the narration overruns and gets clipped.

### Choosing the template

`template` pins the intent, and the intent pins the beat template. It is a promise about the
video's shape, not a hint.

Valid for a **brand/business** job: `auto`, `story`, `product`, `local`, `launch`, `review`,
`before_after`. `news_anchor`, `summary`, `explainer`, `listicle` and `qa` are **post-only** and
are rejected with `template_source_mismatch` for this job kind.

| The video is | Template | Note |
|---|---|---|
| a trend's consequence, told as a shift | `story` | Vấn đề → chuyển biến → kết quả. The default for trend content. |
| the old way vs the new way | `before_after` | Strongest fit when the evidence is a measurable change |
| something the brand just shipped | `launch` | only with a real demo |
| the brand itself | `product` / `local` | `local` when `service_area` matters |
| genuinely undecided | `auto` | the engine reads the body and decides — fine, less control |

A "news" video with a presenter wants `news_anchor`, which is post-only and needs
`project.presenter_image_url`. A brand video with a presenter cannot use it. If the brand has a
presenter, that is a gap worth raising, not working around.

## The anti-slideshow rule

`reviewStoryboard` rejects a storyboard built only from prose. The `visual` scenes (photo, ui_demo,
feature, result, location, hook, cta) need a real asset; the `graphic` ones (`stat`, `bars`,
`compare`, `timeline`, `steps`, `icons`) draw from real numbers. A video that is one claim per
card is a document, not a video.

So: **put a number in the brief.** A trend almost always has one — 27,9%, a launch date, a
delta. That number becomes a `stat` or a `bars` scene instead of another quote card.

## Checklist

- [ ] Brand voice applied (`/skill:brand-voice`), evidence traced
- [ ] `body_markdown`: 3–5 headings, one claim each, publisher named, ~110–130 words
- [ ] At least one concrete number present so the video is not all cards
- [ ] Template valid for the job kind
- [ ] `duration` set explicitly to the target — never left to `suggestDuration`
- [ ] Target is 30–60s and `duration` is set explicitly (unset means article-length)

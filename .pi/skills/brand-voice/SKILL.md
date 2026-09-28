---
name: brand-voice
description: "How the brand speaks in a 30-60 second video — tone, audience, themes, banned topics, and CTA, read from the project's own brand record instead of invented. Use whenever writing narration, a hook, an on-screen line, or a caption for a Gulagi/Gu-SEO video, or when a draft 'sounds off', 'feels generic', or needs to match the brand. Covers Vietnamese short-form delivery and the discipline of not claiming more than the sources support."
---

# Brand voice — read it, don't invent it

The schema comment on the video brand kit says it outright: *"the AI never invents brand"*. A
video that guesses the brand is worse than no video — it costs a render, a slot, and credibility.
The brand is already recorded. Read it.

## Where the brand lives

`project_brands` (schema/init.sql) — one row per project:

| Column | What it decides |
|---|---|
| `tone` | how the narration speaks |
| `audience` | who the hook addresses |
| `key_themes` | what is on-brand to talk about |
| `topics_to_avoid` | hard no — a video violating this is a bug, not a style choice |
| `business_type` | what the brand actually does |
| `service_area` | geography, when the video is local |
| `cta` | the exact closing call to action |

`projects.brand_accent` plus the logo are the visual half — the renderer draws them, so the video
never invents a colour or a wordmark either.

Read the row **before** writing a word. If it is empty, the brand has not been set up: say so and
ask for it rather than guessing a voice.

```bash
# local D1
node scripts/run-remote-d1.js "SELECT * FROM project_brands WHERE project_id = '<id>'"   # remote
# or through the admin API, which is the supported path
```

## Vietnamese short-form delivery

The narration is synthesised with `edge-tts` `vi-VN` and played over the render. Write for the
ear, at `WORDS_PER_SECOND = 2.6` — that is the whole budget, and it is unforgiving.

- **Short clauses.** One idea per sentence. Commas carry the rhythm, not clauses stacked with "và".
- **Spoken register, not written.** "Bạn có biết" over "Bạn có biết rằng"; "vì sao" over "bởi vì";
  "lên" over "được tăng lên". Text read aloud sounds wrong long before it looks wrong.
- **Numbers are read out.** "27,9%" becomes "hai mươi bảy phần chín phần trăm" — awkward. Prefer
  a round figure that survives speech, or restructure the line so the number is on screen and not
  in the voiceover.
- **No filler openers.** "Trong thế giới công nghệ phát triển nhanh chóng, chúng ta…" is dead
  air in the first three seconds, which is exactly where you cannot afford it.
- **Latin acronyms get read.** GEO, AIO, LLM come out letter-by-letter in `vi-VN`. Expand on
  first use in the voice, abbreviate on screen.

## The hook (0–3s)

The first three seconds decide whether anything else is watched. The hook must be one of:

- a number the listener did not expect
- a question with an obvious painful answer
- a claim that contradicts what they believe
- a before/after with the "after" visible

It must not be: a greeting, a channel greeting, a definition, a question the listener already
answered, or anything the brand's `topics_to_avoid` touches.

## Claim discipline

This is the rule that separates a video that is useful from one that is a liability:

> Every factual sentence in the script must be traceable to a `quote` from
> `/skill:trend-search`. If the script says a number, a version, a date, or a market fact, that
> number appears in a result's `content` — with its publisher.

- No superlatives the evidence does not support. "Mọi thứ đều thay đổi" is not a trend.
- No invented statistics, ever. Not "theo nhiều nghiên cứu" — name the study or cut the sentence.
- Attribute in-frame when the claim is contested or specific: on-screen text carries the publisher
  name. It costs eight words and it is what makes the video credible.
- If the evidence does not support an on-brand angle, the correct output is "no video today" plus
  the topics that *do* qualify.

## Banned by default, in every project

- Engagement bait the brand does not actually do ("comment tôi sẽ gửi…") — it burns trust and
  contradicts any real CTA in `project_brands.cta`
- Panic/scare framing ("AI sẽ hủy diệt mọi thứ") unless the brand's own `tone` sanctions it
- Guarantees: "chắc chắn tăng traffic", "x10 trong 30 ngày"
- Competitor names used disparagingly — trends are industry-wide, and a punch at a named rival is
  a fight the brand did not choose
- Claims about the brand that are not in the brand record

## Checklist

- [ ] Brand row read before writing; `topics_to_avoid` respected
- [ ] Hook lands in 3s, no greeting, no definition
- [ ] Word count matches the duration budget at 2.6 words/sec
- [ ] Every number/date/version traced to a `quote` + `publisher`
- [ ] On-screen text carries attribution for any specific claim
- [ ] Closing line is the brand's own `cta`, or none

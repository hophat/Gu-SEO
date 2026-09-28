---
name: trend-search
description: "Search the live web for what is trending, through the aifree.gulagi.com search API. Use whenever a task needs real current information from the internet — 'tin nức mới nhất', 'trend hôm nay', 'có gì hot', competitor news, a fact to cite, or any request that must not be answered from memory. Produces normalised results with a real publisher, an honest (often null) date, and a verbatim quote per result. Load before writing any content that claims something is current, popular, or newly released."
---

# Trend search — real web evidence, not remembered web

A model asked "what's trending this week" will happily produce a confident, fluent, entirely
invented answer. That is the failure this skill exists to prevent. **Every claim about the
present tense must come from a result this API returned.** If the search returns nothing usable,
the answer is "no evidence found", not a guess.

## Run it

```bash
# key lives in .env as AIFREE_SEARCH_KEY (fallback: AIFREE_API_KEY)
node .pi/skills/trend-search/scripts/search.mjs "<query>" --type web --limit 5
node .pi/skills/trend-search/scripts/search.mjs "<query>" --type news --limit 5 -o _workspace/raw.json
```

`--type news` biases toward dated events; `web` (default) is better for evergreen-ish topics and
how-tos. `-o` writes the normalised payload to a file and still prints to stdout.

The script exists so no agent hand-writes a `curl` with a Bearer token in it. The key is read
from the environment and never printed, logged, or written to the output file. Do not inline the
key in a command, a prompt, or a file.

## What the endpoint actually returns — and what it does not

The raw payload is misleading in three specific ways. The script corrects two of them and refuses
to invent the third.

| Field | Reality | Use it for |
|---|---|---|
| `title` | the **source domain** (`claude.com`), *not* the article headline | publisher identity |
| `url` | a `vertexaisearch.cloud.google.com/grounding-api-redirect/…` wrapper, not the canonical page | traceability only — never show it to a viewer as "the source" |
| `published_at` | **almost always `null`** | nothing. Absent is the honest value. Do not substitute today's date and call it the publish date. |
| `content` | full article text, markdown-flavoured | the actual evidence — claims are checked here |
| `answer` | the backend's own synthesis, has no URL of its own | a map of the results. Never cite it as a source. |

Script output per result: `rank`, `publisher`, `title` (lifted from the content), `url`,
`snippet`, `content`, `published_at`, `quote` (first concrete sentence).

## Evidence rule

A claim is usable only with all three:

1. **publisher** — who said it
2. **quote** — their words, verbatim, copied from `content`
3. **recency signal** — a date *inside the text* ("As of September 2026", "tuần qua", "hôm nay"),
   not the `published_at` field

If the text carries no recency signal, the result is a *reference*, not a *trend*. A trend needs
movement: something new, newly changed, newly contested, or newly viral.

## Query patterns

Run **3–5 distinct queries** and compare. One query returns one worldview.

```bash
# Vietnamese market, the way a Vietnamese audience would search
"AI Overviews ảnh hưởng SEO 2026"
"tin tức AI tháng này có gì đáng chú ý"
"thay đổi mới nhất của Google Search"

# English gives a different, often fresher, corpus — translate the finding back
"Google Search ranking changes this month"
"AI search traffic news"

# comparative / contrarian, which surfaces what the others miss
"thay đổi đó gây hậu quả gì"
"mọi người đang sai về X"
```

Vary the axis deliberately: recency, consequence, contrarian take, local relevance. Five queries
on the same phrasing return five copies of the same article.

## Reading the results honestly

- **Corroboration is the signal.** One domain saying something is a claim. Three independent
  domains saying it is a trend. Note when a hit is a syndication of the same press release — the
  identical `quote` across different publishers is one source, not five.
- **Recency decays.** A month-old story is not today's trend. If the best you can find is old,
  report it as an ongoing story, not a trend.
- **Absence is information.** If the searches return nothing on-brand and recent, say so. A
  fabricated trend is worse than no video.
- **Numbers need a quote.** "27,9% người lao động VN dùng AI" is only usable if that figure
  appears verbatim in a `content` field, with the publisher named.

## Output contract

Every trend handed downstream carries:

```json
{
  "topic": "<one line, specific>",
  "publisher": "<source domain>",
  "quote": "<verbatim sentence from content>",
  "recency": "<the date phrase found in the text, or 'unknown'>",
  "corroboration": "<how many independent domains>",
  "why_now": "<why this is moving this week, from the evidence — not a guess>",
  "angle_for_brand": "<how it connects to the brand, or null if it does not>",
  "risk": "<what could be wrong, or 'none'>"
}
```

`angle_for_brand: null` is a valid and valuable answer. A trend the brand cannot speak to is not
a video — say so and let the next topic be picked.

## Failure handling

- HTTP error or empty `results` → report the query and the status. Do not fill the gap from memory.
- The key is missing → the script names the variable. Add it to `.env`; never to a tracked file.
- Results contradict each other → keep both, cite both. Do not average them into a bland claim.

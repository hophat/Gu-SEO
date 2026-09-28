---
description: "Research-only pass for the pages-seo content factory — find what is genuinely trending for a brand right now, with publisher, verbatim quote and a recency signal behind every topic, and rank by brand fit. Produces no script and renders nothing. Use for 'tin nức/trend hôm nay', 'có gì hot', '5 chủ đề video tuần này', 'check chủ đề này có thật không', or to scout topics before committing to a production run. Follow-ups: rerun tomorrow, another niche, more topics, drop one."
argument-hint: "<project or niche, optional: how many topics>"
---

Research what is trending for: **$@**

Use the `subagent` tool with **`agentScope: "both"`**. This workflow is **read-only** — it
writes a brief and nothing else. No script, no job, no render.

## Phase 0: context check

- `_workspace/` holds a prior brief → this is a re-run. Re-query only what has gone stale, and
  mark each prior topic: used / still live / dead. Do not re-report a topic the ledger already
  records as used.
- Otherwise create `_workspace/`.

## Phase 1: research (`trend-scout`)

```json
{ "agent": "trend-scout",
  "task": "Research trends for: $@\n\nLoad /skill:trend-search and /skill:brand-voice. Read project_brands for the project first — a trend the brand cannot speak to is not a candidate. Check content-factory/trend-ledger.jsonl for topics already used. Run 3-5 distinct queries (Vietnamese and English; vary the axis: recency, consequence, contrarian, local). For every candidate require: a real publisher, a verbatim quote from content, and a recency phrase found in the TEXT (published_at is almost always null and proves nothing). Watch for the same press release syndicated across domains — that is one source, not five. Write _workspace/01_trend-scout_brief.md and return the HANDOFF block." }
```

## Phase 2: present (you)

Read the brief and give the user a ranked list, each with:

- the topic in one line
- **publisher** and the **quote** that made it worth making
- the recency signal, in quotation marks, as it appears in the text
- how many independent domains carry it
- the brand angle, or `null`
- the risk: single-source, contested, or numbers that need care

Then stop and ask which ones to produce. Do not write scripts in this workflow — `/daily-video`
does that.

## Standing rules

- **No trend without evidence.** The search API is the only source of what is current. If it
  returns nothing, the answer is "nothing qualifying today", and that is a legitimate result to
  deliver.
- **`published_at` is almost always `null`.** Never present a date you inferred from the search
  time. If the text has no date phrase, say the recency is unknown.
- **`url` is a `vertexaisearch.cloud.google.com` redirect.** Never show it to the user as "the
  source". Cite the publisher domain and the quote.
- **Refusals are useful.** A rejected candidate with its reason shows the user what was filtered
  out, which is often the most valuable part of the list.

## Error handling

- Search fails → report the query and the HTTP status. Do not fill the gap from memory.
- Key missing → the script names `AIFREE_SEARCH_KEY`. Add it to `.env`; never to a tracked file.
- Nothing on-brand and recent → say so plainly, and offer the adjacent themes that *are* on-brand
  so the next run has somewhere to start.

---
description: "pages-seo SEO audit — parallel read-only review of the public indexable surface (programmatic landing pages, blog/hubs renderers, per-project /<slug>/ routes, sitemaps, feeds, canonical/robots, internal links, i18n, JSON-LD) with the results integrated into one ranked report. Use for 'SEO audit', 'why isn't this ranking', 'index bloat', 'duplicate pages', 'is the sitemap right', 'check my programmatic pages'. Follow-ups: rerun one area, re-check after a fix, improve the previous report."
argument-hint: "<site, page type, or question>"
---

Audit the public SEO surface of pages-seo for: **$@**

Use the `subagent` tool with **`agentScope: "both"`** on every call. Every delegation is
**read-only** — this workflow changes nothing.

## Phase 0: context check

- `_workspace/` with a prior report → read it. Re-delegate only the areas whose code changed, and
  mark each prior finding fixed / still open / no longer applicable. Do not restate a fixed
  finding as new.
- Otherwise create `_workspace/`.

## Phase 1: parallel review

Split by surface, not by file. Two to five tasks, chosen by what `$@` is about; drop the rest
rather than padding the fan-out.

```json
tasks: [
  { "agent": "seo-reviewer", "task": "Area: reachability + discovery. Load /skill:seo-surface-review. Audit sitemap.xml (root and /<slug>/), robots.txt, feed.xml, and internal links from hubs/blog/internal_links.js. Report orphans, stale lastmod, sitemap/feed disagreement, disallowed-but-listed pages. Write _workspace/02_seo-reviewer_discovery.md, summary inline." },
  { "agent": "seo-reviewer", "task": "Area: programmatic landing pages. Load /skill:seo-surface-review. Audit the pSEO page sets (category/topic/comparison/alternatives, filters, hubs). Hunt duplicate content, thin pages, facet/filter index bloat, keyword cannibalisation against blog posts. Run auditHtml on real rendered output and quote the results. Write _workspace/02_seo-reviewer_pseo.md, summary inline." },
  { "agent": "seo-reviewer", "task": "Area: on-page metadata. Load /skill:seo-surface-review. Audit title/description/canonical/h1/OG/JSON-LD/lang/hreflang on the renderer output, and the quality.js band + status flow in publish.js. Report which gate lets a weak page publish. Write _workspace/02_seo-reviewer_meta.md, summary inline." },
  { "agent": "seo-reviewer", "task": "Area: [any area $@ specifically names]. Load /skill:seo-surface-review. Write _workspace/02_seo-reviewer_<area>.md, summary inline." }
]
```

parallel caps at 8 tasks / 4 concurrent, and each output is capped at 50KB — that is why every
task writes its full report to `_workspace/` and returns only a summary.

## Phase 2: integration (you, not a subagent)

You are the integrator; pi has no team-consensus channel.

1. Read every `_workspace/02_seo-reviewer_*.md`.
2. Build one ranked report. Rank by impact: index bloat and wrong `robots` first, metadata polish
   last.
3. Conflicting findings: keep both, cite both sources. Do not delete a finding because another
   agent disagreed.
4. Drop any finding that lacks a concrete user-visible symptom. That is an opinion, not a
   finding.
5. Group the fixes by **owning layer** so each group can be handed to the right agent:
   `functions-worker` (renderer/routes) · `schema-migrator` (needs a new column) · `admin-ui`
   (dashboard surface).

Output: `_workspace/03_seo_report.md` and a summary in chat.

## Phase 3: verify the report (optional, recommended for large surfaces)

If the audit touched more than three areas, or the findings carry real SEO consequences, run one
second pass with `subagent` in `single` mode using the same `seo-reviewer`, asking it to
**attack the report**: which findings are wrong, which are already mitigated elsewhere, which are
duplicates. Keep what survives. A report that has been attacked is worth more than a first pass.

## Phase 4: report to the user

- Verdict: ship / ship-with-fixes / block.
- Blockers first (index bloat, wrong robots, canonical collapse), then ranked findings with
  `file:line`, the rule, the symptom, the minimal fix.
- Which checks were actually executed (`auditHtml`, `quality.js`, dedup) versus reasoned about.
- Which surfaces were **not** covered — an honest gap beats an implied clean bill of health.

## Error handling

- An area fails: retry once, then continue without it and name the gap in the "not covered"
  section.
- If `$@` names a project slug, confirm the slug exists in `projects.publishing_url` before
  auditing its routes; a typo produces a false "all 404" finding.
- Never edit code in this workflow. Fixes go through `/feature` or `/schema-migration`.

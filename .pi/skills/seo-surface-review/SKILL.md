---
name: seo-surface-review
description: "How to review or audit the public SEO surface of pages-seo — programmatic landing pages, blog and post renderers, hubs, per-project /<slug>/ routes, sitemaps, feeds, canonical and robots rules, internal links, i18n, JSON-LD, duplicate or thin page risk, and whether a change helps or hurts search. Use for 'SEO audit', 'will this rank', 'duplicate pages', 'index bloat', 'canonical/noindex/sitemap/robots/hreflang', or any review of functions/{blog,hubs,docs} and functions/[project]."
---

# SEO surface review

Programmatic SEO fails in ways that look fine in a browser: a page that renders perfectly,
indexes nothing, or indexes six thousand near-identical copies of itself. Review the surface the
crawler can reach, not the page in isolation.

## Start from reachability

Before judging any page, enumerate what a crawler can actually get to:

1. `sitemap.xml` (root and per-project) — what is listed, what is dated, what is absent
2. `robots.txt` — disallowed prefixes vs. the sitemap set; a page excluded from both is orphaned
3. feed (`feed.xml`) — a listing that disagrees with the sitemap is a trust signal you are burning
4. internal links from hubs (`functions/_lib/hubs.js`), blog index, `internal_links.js`
5. programmatic entry points: category/topic/comparison/alternatives pages and their filters

An orphan page that renders beautifully contributes nothing.

## Use the repo's own checks

Two modules exist so a human can see the rule rather than argue a score:

- **`functions/_lib/seo_audit.js`** — `auditHtml(html, opts)`. Pure: HTML in, structured checks
  out. No fetch, no env, no network. Covers title, meta description, canonical, `lang`, viewport,
  charset, OG tags, `h1` count, JSON-LD presence, images without `alt`, and it states the
  threshold for each check. Feed it real rendered output.
- **`functions/_lib/quality.js`** — pre-publish scorer returning
  `{ score, band: 'good'|'warn'|'bad', issues, stats }` on measurable structural signals. `'bad'`
  sets `status='review'` in `publish.js` so the post stays out of the published index until a
  human looks. If a page ships with structural problems, the question is why the gate did not
  hold.

Citing a check is worth more than asserting a taste judgement.

## Per-page metadata checklist

- exactly one `h1`; title and description present, unique across the site
- `rel=canonical` self-referencing and absolute; no canonical pointing at a filtered variant
- OpenGraph `og:title` / `og:description` / `og:image` populated
- `lang` set; `hreflang` correct when `i18n.js` serves a translated variant
- JSON-LD present and matching the visible entity (Article vs Product vs FAQPage — a mismatched
  type is a manual-action risk, not a nit)

## Programmatic risk heuristics

| Risk | Signal | Consequence |
|---|---|---|
| Duplicate content | Same title/description/H1 across slug sets; only a query param differs | Index bloat; the canonical cluster collapses to one page |
| Thin pages | `quality.js` band `bad`/low word count with no unique data | Wasted crawl budget, low average quality |
| Facet explosion | Every filter combination reachable and indexable | Crawl trap; must `noindex` or canonicalise to the base |
| Keyword cannibalisation | Blog post and landing page targeting the same query | Google picks one, you split signals |
| Stale indexing | Sitemap carrying old `lastmod`, IndexNow not firing on publish | Pages decay in the index |

The fixes that matter most, in order: correct `noindex`/canonical on low-value variants, one
entity per intent, keep the sitemap in sync with what actually publishes.

## Index-now and freshness

`indexnow.js` / `google_indexing.js` / `indexnow_key.js` handle submit-on-publish. If a change
alters what publishes or when, verify the ping still fires — a silent failure here looks
identical to "SEO stopped working" weeks later.

## Reporting a finding

Every finding carries four things:

1. `file:line`
2. the rule violated (and the check that proves it, if a check exists)
3. the concrete user-visible symptom — what a visitor or crawler experiences
4. the minimal fix

Rank by impact: index bloat and wrong `robots` outrank a missing OG image. A finding with no
symptom is an opinion — drop it. When reviewing a diff, say explicitly which parts preserve
output unchanged; a behaviour-preserving refactor is not a finding.

## Checklist

- [ ] Reachability mapped (sitemap, robots, feed, internal links)
- [ ] Per-page metadata checklist applied
- [ ] Duplicate / thin / facet / cannibalisation risks checked
- [ ] `auditHtml` and `quality.js` actually executed on real output, results quoted
- [ ] Every finding: file:line, rule, symptom, minimal fix

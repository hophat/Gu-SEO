#!/usr/bin/env node
// Web search for the content factory — one call, normalised output.
//
// Wraps the aifree.gulagi.com search endpoint so no agent has to hand-write
// a curl with a Bearer token in it. The key is read from the environment
// and never printed, logged, or written to the output file.
//
//   node .pi/skills/trend-search/scripts/search.mjs "<query>"
//   node .pi/skills/trend-search/scripts/search.mjs "<query>" --type news --limit 5
//   node .pi/skills/trend-search/scripts/search.mjs "<query>" -o _workspace/raw.json
//
// Env: AIFREE_SEARCH_KEY, falling back to AIFREE_API_KEY.
//
// Why this normalises anything at all: the endpoint returns `title` set to
// the source domain (not the article title), `published_at` that is almost
// always null, and a `url` that is a googleapis grounding redirect rather
// than the canonical page. An agent reading the raw payload would cite a
// `vertexaisearch.cloud.google.com/grounding-api-redirect/...` as the source
// and a null as the date. So the publisher is carried explicitly, the date
// stays honestly null, and each result carries the verbatim `quote` that
// supports the claim — which is what evidence actually means when the
// publisher will not give a date.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ENDPOINT = process.env.AIFREE_SEARCH_ENDPOINT || 'https://aifree.gulagi.com/v1/search';

function flag(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const query = process.argv.slice(2).find((a) => !a.startsWith('--') && process.argv[process.argv.indexOf(a) - 1]?.startsWith('--') !== true);
if (!query) {
  console.error('usage: search.mjs "<query>" [--type web|news] [--limit N] [-o out.json]');
  process.exit(2);
}

const key = process.env.AIFREE_SEARCH_KEY || process.env.AIFREE_API_KEY;
if (!key) {
  // Name the variable, never its value. There is no value to name — we never read one.
  console.error('missing AIFREE_SEARCH_KEY (or AIFREE_API_KEY). Put it in .env — do not pass it as an argument.');
  process.exit(2);
}

const limit = Number(flag('limit', '5')) || 5;
const searchType = flag('type', 'web');

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
  body: JSON.stringify({ model: flag('model', 'ag'), query, search_type: searchType, max_results: limit }),
});

if (!res.ok) {
  // The body can echo request headers back; report status, not the payload.
  console.error(`search failed: HTTP ${res.status}`);
  process.exit(1);
}

const raw = await res.json();

// The redirect host is not the publisher. `url` is a
// vertexaisearch.cloud.google.com grounding redirect, so hostname-parsing it
// yields the search backend's own domain and destroys the only useful
// identity field. The raw `title` is the *real* source domain (aiweekly.co,
// claude.com, reddit.com) — that is the publisher, and the only honest one
// available.
function publisherOf(r) {
  const t = String(r.title || '').trim();
  if (t && !/^https?:/i.test(t)) return t.replace(/^www\./, '').toLowerCase();
  try { return new URL(r.url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}

// `title` arrives as a bare domain, so lift a real one out of the body:
// first markdown H1, else the first sentence.
function titleOf(r) {
  const text = String(r.content || r.snippet || '');
  const h1 = /(?:^|\n)#{1,3}\s+(.{6,120}?)\s*(?:\n|$)/.exec(text);
  if (h1) return h1[1].replace(/[*_`#]/g, '').trim();
  const first = text.split(/(?<=[.!?])\s|\n/)[0] || '';
  return first.replace(/[*_`#]/g, '').trim().slice(0, 120) || String(r.title || '').trim();
}

const nowIso = new Date().toISOString();

const results = (raw.results || []).map((r, i) => ({
  rank: i + 1,
  publisher: publisherOf(r),
  title: titleOf(r),
  // Opaque grounding redirect: stable enough to re-run, useless to show a
  // viewer. Cite `publisher` + `quote`, and keep this only for traceability.
  url: r.url,
  snippet: String(r.snippet || '').trim(),
  // Full text, trimmed — this is what a claim has to be checked against.
  content: String(r.content || '').trim(),
  // The endpoint rarely supplies one. Absent is the honest value; do not
  // substitute today's date and call it the publish date.
  published_at: r.published_at ?? null,
  // First concrete sentence: the smallest quotable unit of evidence.
  quote: (String(r.content || r.snippet || '').split(/(?<=[.!?])\s|\n/)[0] || '').replace(/\s+/g, ' ').trim().slice(0, 300),
}));

const payload = {
  query,
  search_type: searchType,
  provider: raw.provider || null,
  retrieved_at: nowIso,
  // Answer is the search backend's own synthesis. Useful as a map of the
  // results, never as a source — it has no URL of its own.
  answer_hint: typeof raw.answer === 'string' ? raw.answer.slice(0, 1200) : null,
  errors: raw.errors ?? null,
  results,
};

const out = flag('o');
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(payload, null, 2));
  console.error(`wrote ${out} — ${results.length} results`);
}

// stdout stays the payload so a caller can pipe it; humans read stderr.
console.log(JSON.stringify(payload, null, 2));

// scripts/jev.js — typed decisions from TypeSafe's System One API (Jev) for
// local development work in this repo. Not a product feature: no runtime code
// imports it.
//
// Why: one Jev call is small and returns a score plus a calibrated confidence
// per dimension, so an agent can settle a reversible, in-repo call itself
// instead of asking the operator or burning a long reasoning pass.
//
// Hard limit: Jev never authorises the human-gated set — production deploys,
// D1 writes, secret changes, auth changes. Those stay manual no matter how
// confident the answer is.
//
// Modes:
//   evaluate  score a SET of documents (files | stdin | D1 rows) on dev
//             dimensions, then gate: proceed / review / stop
//   decide    pick one of --option key="meaning" (choice)
//   verdict   yes/no question (noul probability)
//   score     rate against ordered --level "..." (score)
//   ask       raw passthrough with --questions '<json>'
//
// Examples:
//   node scripts/jev.js evaluate --file cron-worker/src/index.js --file docs/
//   git diff | node scripts/jev.js evaluate --label "cron fix" --state -
//   node scripts/jev.js evaluate --d1 "SELECT title, body_markdown FROM blog_posts LIMIT 3"
//   node scripts/jev.js decide --question "Which fix first?" --option a="..." --option b="..."
//
// Output: a markdown table, then one line of JSON. Exit 0 = every document
// proceeds, 1 = needs review, 2 = stop (or a hard error).
//
// Key: TYPESAFE_API_KEY in the environment, else .dev.vars at the repo root.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname } from 'node:path';
import { ROOT, loadKey, askSystemOne } from './lib/systemone.js';

const DOC_EXT = new Set(['.md', '.txt', '.js', '.mjs', '.cjs', '.json', '.sql', '.diff', '.patch', '.yaml', '.yml', '.toml']);

// Higher score = better in every dimension, so the gate is a plain floor.
// Levels run worst -> best; the API answers with a fractional index.
const DIMENSIONS = {
  correctness: ['Does not work or contradicts itself', 'Works, but with caveats or gaps', 'Does what it claims, no gaps found'],
  safety:      ['Could lose data, break prod, or is hard to undo', 'Recoverable, but needs care', 'Safe and easily reversible'],
  rule_fit:    ['Violates a hard rule or a denylisted path', 'Drifts from repo conventions', 'Follows the repo rules and conventions'],
  security:    ['Leaks secrets or weakens auth/authorisation', 'Risky pattern, unclear impact', 'No security impact'],
  scope:       ['Unrelated changes bundled in', 'Slightly wider than asked', 'Exactly the requested scope, nothing speculative'],
  evidence:    ['No verification of any kind', 'Partially verified', 'Verified by tests, logs, or real command output'],
  clarity:     ['Ambiguous, cannot tell what is intended', 'Mostly clear, some gaps', 'Unambiguous and decision-complete'],
  reuse:       ['Reinvents something the repo already has', 'Partially duplicated', 'Reuses existing helpers and patterns'],
};

const OVERALL = {
  type: 'choice',
  instructions: 'Acting as a staff engineer reviewing this document, what should the operator do with it?',
  criteria: {
    proceed: 'Good enough to act on as-is; no human review needed',
    review: 'Needs a human decision before acting on it',
    stop: 'Do not act on it; rework required first',
  },
};

const CRITICAL = ['security', 'rule_fit'];

function flag(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return '';
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? '' : v;
}

function all(name) {
  const out = [];
  process.argv.forEach((a, i) => {
    if (a !== `--${name}`) return;
    const v = process.argv[i + 1];
    if (v !== undefined && !v.startsWith('--')) out.push(v);
  });
  return out;
}

function fail(msg) {
  process.stderr.write(`jev: ${msg}\n`);
  process.exit(2);
}

function walk(path, out = []) {
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      walk(join(path, entry), out);
    }
    return out;
  }
  if (DOC_EXT.has(extname(path).toLowerCase())) out.push(path);
  return out;
}

function d1Rows(sql, db) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', db, '--remote', '--json', '--command', sql],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const start = out.indexOf('[');
  if (start === -1) fail('could not parse wrangler d1 output');
  return JSON.parse(out.slice(start))?.[0]?.results || [];
}

function loadDocs() {
  const docs = [];
  for (const path of all('file')) {
    for (const file of walk(path)) {
      docs.push({ name: file.replace(`${ROOT}/`, ''), text: readFileSync(file, 'utf8') });
    }
  }
  const d1 = flag('d1');
  if (d1) {
    for (const row of d1Rows(d1, flag('d1-db') || 'pages-seo-db')) {
      const text = row.body_markdown || row.body || row.spec_json || row.value || JSON.stringify(row);
      docs.push({ name: `d1: ${row.title || row.slug || 'row'}`.slice(0, 120), text: String(text) });
    }
  }
  const piped = flag('state');
  if (piped) {
    docs.push({ name: flag('label') || 'stdin', text: piped === '-' ? readFileSync(0, 'utf8') : piped });
  }
  if (!docs.length) fail('no documents. Pass --file <path|dir>, --state - (stdin), or --d1 "<sql>"');

  const max = parseInt(flag('max-chars') || '12000', 10);
  return docs.map((d) => ({ name: d.name, text: d.text.length > max ? `${d.text.slice(0, max)}\n…[truncated]` : d.text }));
}

function dimensionQuestions(names) {
  const questions = {};
  for (const name of names) {
    const levels = DIMENSIONS[name];
    if (!levels) fail(`unknown dimension "${name}" — known: ${Object.keys(DIMENSIONS).join(', ')}`);
    // Wire field is `criteria` (ordered levels), not `levels` — the docs'
    // interactive examples differ from the API contract.
    questions[name] = { type: 'score', instructions: `Rate the document on ${name}.`, criteria: levels };
  }
  questions.overall = OVERALL;
  return questions;
}

// Code owns the gate: Jev supplies scores + confidence, this decides.
function gateFor(answers, names, opts) {
  const rows = names.map((name) => {
    const a = answers[name] || {};
    const score = typeof a.score === 'number' ? a.score : null;
    const normalized = score === null ? null : score / (DIMENSIONS[name].length - 1);
    return {
      name, score, normalized, critical: CRITICAL.includes(name),
      confidence: typeof a.confidence === 'number' ? a.confidence : null,
    };
  });

  const belowFloor = rows.filter((r) => r.normalized === null || r.normalized < opts.passScore);
  const lowConfidence = rows.filter((r) => r.confidence === null || r.confidence < opts.minConfidence);
  const criticalFail = rows.filter((r) => r.critical && (r.normalized === null || r.normalized < opts.criticalFloor));
  const pick = answers.overall?.choice || '';

  const reasons = [];
  if (criticalFail.length) reasons.push(`critical below floor: ${criticalFail.map((r) => r.name).join(', ')}`);
  if (belowFloor.length) reasons.push(`below pass threshold: ${belowFloor.map((r) => r.name).join(', ')}`);
  if (lowConfidence.length) reasons.push(`low confidence: ${lowConfidence.map((r) => r.name).join(', ')}`);

  let decision = 'proceed';
  if (reasons.length || pick === 'review') decision = 'review';
  if (pick === 'stop' || criticalFail.length) decision = 'stop';

  return {
    decision,
    act_without_human: decision === 'proceed',
    overall_pick: pick || null,
    overall_confidence: answers.overall?.confidence ?? null,
    reasons,
    dimensions: rows,
  };
}

function renderTable(label, gate) {
  const lines = [`### ${label}`, '', '| dimension | score | conf | flag |', '| --- | --- | --- | --- |'];
  for (const row of gate.dimensions) {
    const max = DIMENSIONS[row.name].length - 1;
    const flagText = row.critical && (row.normalized ?? 0) < 1 ? 'critical'
      : row.normalized !== null && row.normalized < 0.5 ? 'weak' : '';
    lines.push(`| ${row.name}${row.critical ? ' \\*' : ''} | ${row.score === null ? '?' : row.score.toFixed(2)}/${max} | ${row.confidence === null ? '?' : row.confidence.toFixed(2)} | ${flagText} |`);
  }
  lines.push('', `**${gate.decision.toUpperCase()}** — act without human: ${gate.act_without_human}. overall: **${gate.overall_pick}** (conf ${gate.overall_confidence ?? '?'})`);
  if (gate.reasons.length) lines.push(`reasons: ${gate.reasons.join('; ')}`);
  return lines.join('\n');
}

// `--summary` swaps the markdown table for one line per answer, for shell
// callers: scripts/loop-run.sh records it in the run log, which wants the
// numbers, not a table. The JSON line still follows, so anything parsing
// the last line keeps working.
const SUMMARY = process.argv.includes('--summary');

function summarizeAnswers(answers, gate) {
  return Object.entries(answers).map(([key, a]) => {
    const conf = a?.type === 'noul' ? a.noul : a?.confidence;
    const value = a?.type === 'choice' ? a.choice
      : a?.type === 'noul' ? (a.noul >= 0.5 ? 'yes' : 'no')
      : a?.type === 'score' ? `${a.legend ? String(a.legend[Math.round(a.score)]).split(':')[0] : 'level'}(${a.score})`
      : '?';
    const act = gate?.[key]?.act;
    return `${key}=${value}@${typeof conf === 'number' ? conf.toFixed(2) : '?'}${act === false ? '!' : ''}`;
  }).join(' ');
}

// An API error arrives as a raw body (`{"error_type":…,"message":…}`), which
// makes for unreadable log lines — pull the message out when there is one.
function shortError(raw) {
  const text = String(raw ?? '').trim();
  try {
    const parsed = JSON.parse(text);
    return String(parsed.message || parsed.detail || parsed.error || text).slice(0, 200);
  } catch { return text.slice(0, 200); }
}

// Same idea for `evaluate`: every dimension's score and confidence, so the
// log carries the whole answer rather than just the verdict.
function summarizeGate(label, gate, error, tokens) {
  if (error) return `${label}: error=${shortError(error)}`;
  const pct = (n) => (typeof n === 'number' ? n.toFixed(2) : '?');
  const dims = gate.dimensions.map((d) => `${d.name}=${d.score === null ? '?' : d.score.toFixed(2)}@${pct(d.confidence)}`).join(' ');
  const reasons = gate.reasons.length ? ` — ${gate.reasons.join('; ')}` : '';
  const cost = typeof tokens === 'number' ? ` in=${tokens}` : '';
  return `${label}: ${gate.decision} overall=${gate.overall_pick}@${pct(gate.overall_confidence)} ${dims}${cost}${reasons}`;
}

// One document needs no namespacing: its state goes in once and the dimensions
// are the questions. Several documents share a single call — state as named
// fields, every question prefixed `d<i>_` — which is the docs' fan-out shape:
// the same per-question answers in one round trip instead of N.
async function askDocs(key, docs, { names, model, timeout }) {
  const questions = dimensionQuestions(names);
  if (docs.length === 1) {
    const res = await askSystemOne(key, { state: docs[0].text, questions, model, timeout });
    return { res, answers: () => res.answers, batched: false };
  }
  const perDoc = {};
  docs.forEach((doc, i) => {
    for (const [name, q] of Object.entries(questions)) {
      perDoc[`d${i}_${name}`] = { ...q, instructions: `${q.instructions} — document ${i + 1} ("${doc.name}")` };
    }
  });
  const state = { documents: docs.map((doc, i) => ({ index: i, name: doc.name, text: doc.text })) };
  const res = await askSystemOne(key, { state, questions: perDoc, model, timeout });
  return {
    res,
    batched: true,
    answers: (i) => Object.fromEntries(Object.keys(questions).map((name) => [name, res.answers[`d${i}_${name}`]])),
  };
}

async function evaluate(key) {
  const names = flag('dimensions') ? flag('dimensions').split(',').map((s) => s.trim()).filter(Boolean) : Object.keys(DIMENSIONS);
  const opts = {
    passScore: parseFloat(flag('pass-score') || '0.5'),
    criticalFloor: parseFloat(flag('critical-floor') || '0.5'),
    minConfidence: parseFloat(flag('min-confidence') || '0.6'),
  };
  const model = flag('model') || 'jev-latest';
  const timeout = Number(flag('timeout') || 45);
  const docs = loadDocs(); // exits on its own if there is nothing to read

  const { res, answers, batched } = await askDocs(key, docs, { names, model, timeout });
  const results = [];
  const blocks = [];
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    if (!res.ok) {
      results.push({ document: doc.name, error: res.error || `http ${res.status}` });
      blocks.push(SUMMARY
        ? summarizeGate(doc.name, null, res.error || `http ${res.status}`)
        : `### ${doc.name}\n\n**ERROR** — ${res.error || `http ${res.status}`}`);
      continue;
    }
    const gate = gateFor(answers(i), names, opts);
    results.push({
      document: doc.name, chars: doc.text.length, decision: gate.decision,
      act_without_human: gate.act_without_human, reasons: gate.reasons,
      overall: { pick: gate.overall_pick, confidence: gate.overall_confidence },
      dimensions: gate.dimensions,
      // A batched call is billed once, so its token count belongs to the batch
      // (reported at the top level), not to each document it asked about.
      ...(batched ? {} : { usage: res.usage }),
    });
    blocks.push(SUMMARY ? summarizeGate(doc.name, gate, null, res.usage?.input_tokens) : renderTable(doc.name, gate));
  }

  process.stdout.write(`${blocks.join('\n\n')}\n\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, model, gate: opts, documents: results, ...(batched ? { batched: docs.length, usage: res.usage } : {}) })}\n`);

  const worst = results.some((r) => r.error || r.decision === 'stop') ? 2
    : results.some((r) => r.decision === 'review') ? 1 : 0;
  process.exit(worst);
}

function singleQuestions(mode) {
  const question = flag('question');
  if (!['decide', 'verdict', 'score', 'ask'].includes(mode)) {
    fail(`unknown mode "${mode}" — use evaluate | decide | verdict | score | ask (see JEV.md)`);
  }
  if (mode === 'ask') {
    const raw = flag('questions');
    if (!raw) fail('ask needs --questions <json>');
    try { return JSON.parse(raw); } catch { fail('--questions is not valid JSON'); }
  }
  if (!question) fail(`${mode} needs --question "<text>"`);
  if (mode === 'decide') {
    const criteria = {};
    for (const opt of all('option')) {
      const eq = opt.indexOf('=');
      if (eq < 1) fail('--option must be key="what this option means"');
      criteria[opt.slice(0, eq).trim()] = opt.slice(eq + 1).trim();
    }
    if (Object.keys(criteria).length < 2) fail('decide needs at least two --option key="..."');
    return { decision: { type: 'choice', instructions: question, criteria } };
  }
  if (mode === 'verdict') return { verdict: { type: 'noul', instructions: question } };
  if (mode === 'score') {
    const levels = all('level');
    if (levels.length < 2) fail('score needs at least two --level "..." (low to high)');
    return { rating: { type: 'score', instructions: question, criteria: levels } };
  }
  fail(`unknown mode "${mode}" — use evaluate | decide | verdict | score | ask (see JEV.md)`);
}

const mode = process.argv[2] || '';
if (!mode) fail('usage: jev <evaluate|decide|verdict|score|ask> … (see JEV.md)');
const key = loadKey();
if (!key) {
  process.stderr.write('jev: no API key. Set TYPESAFE_API_KEY or add it to .dev.vars (https://console.typesafe.ai/keys).\n');
  process.exit(1);
}

if (mode === 'evaluate') {
  await evaluate(key);
} else {
  const questions = singleQuestions(mode);
  const explicit = flag('state');
  // A judgement about nothing in particular is judged against its own wording;
  // anything else must supply the document under review.
  const state = explicit === '-' ? readFileSync(0, 'utf8').trim()
    : explicit || flag('question') || '';
  if (!state) fail('nothing to judge — pass --state "<text>" or --state - (stdin)');

  const res = await askSystemOne(key, { state, questions, model: flag('model') || 'jev-latest', timeout: Number(flag('timeout') || 45) });
  if (!res.ok) {
    // The same `error=` marker the summary mode uses, so a shell caller can tell
    // a failed call (nothing to act on) from a real judgement that says stop.
    const line = SUMMARY ? `error=${shortError(res.error || `http ${res.status}`)}\n` : '';
    process.stdout.write(`${line}${JSON.stringify({ ok: false, status: res.status, error: res.error })}\n`);
    process.exit(2);
  }
  const threshold = parseFloat(flag('min-confidence')) || 0;
  const gate = threshold ? Object.fromEntries(Object.entries(res.answers).map(([k, a]) => {
    const certainty = a?.type === 'noul' ? a.noul : a?.confidence;
    return [k, { certainty, act: typeof certainty === 'number' ? certainty >= threshold : null }];
  })) : undefined;
  const line = SUMMARY ? `${summarizeAnswers(res.answers, gate)}\n` : '';
  process.stdout.write(`${line}${JSON.stringify({ ok: true, model: res.model, answers: res.answers, usage: res.usage, gate })}\n`);
}

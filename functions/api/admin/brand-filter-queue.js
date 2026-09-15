// Brand-DNA-driven keyword queue pruning.
//
// POST /api/admin/brand-filter-queue { dry_run?: true, batch_size?: 15 }
//
// 1. Loads the currently saved brand DNA from settings.
// 2. Loads every pending keyword.
// 3. Batches them (default 15 per LLM call) and asks the model to mark
//    each one as keep|drop with a one-line reason.
// 4. Either deletes the drop rows (real run) or returns the verdict
//    without writing (dry_run: true).
//
// Returns { ok, evaluated, kept, dropped, sample: [{keyword, verdict, reason}, ...] }.
//
// Cost: one LLM call per batch. 100 keywords = 7 batches. With Workers
// AI free tier that's ~0 cost. With OpenAI it's ~$0.01.

import { json, nowSec, audit } from '../../_lib/util.js';
import { adminGate } from '../../_lib/auth.js';
import { loadSettings } from '../../_lib/settings.js';
import { listProviders, vaultedEnv, runTextProvider } from '../../_lib/ai.js';
import { recordUsage, estimateTokens } from '../../_lib/usage.js';

const DEFAULT_BATCH = 15;
const MAX_BATCH = 30;
const MAX_KEYWORDS = 500; // safety cap per call

function buildBatchPrompt(brand, keywords) {
  return [
    'You are filtering an SEO keyword queue for a specific brand.',
    'For each keyword, decide whether the brand should write a landing page about it.',
    '',
    '# Brand context',
    brand.brand_business_type || '(no business type set)',
    '',
    brand.brand_target_audience ? '# Target audience\n' + brand.brand_target_audience + '\n' : '',
    brand.brand_key_themes ? '# Key themes this brand covers\n' + brand.brand_key_themes + '\n' : '',
    brand.brand_topics_to_avoid ? '# Topics to AVOID (these must always be drop)\n' + brand.brand_topics_to_avoid + '\n' : '',
    brand.brand_service_area ? '# Service area: ' + brand.brand_service_area : '',
    '',
    '# Rules',
    '- KEEP if the keyword fits the brand\'s business and target audience, even loosely.',
    '- DROP if the keyword is off-brand (unrelated industry), explicitly listed in topics-to-avoid,',
    '  targets a wrong service area, or has clearly different commercial intent.',
    '- When in doubt, KEEP — it\'s easier to delete a generated page than to miss a useful keyword.',
    '',
    '# Keywords to evaluate',
    ...keywords.map((k, i) => `${i + 1}. ${k}`),
    '',
    '# Output',
    'Return STRICT JSON, no prose, no markdown fences. One verdict per input keyword in the same order.',
    'Each verdict object: { "n": <1-based index>, "v": "keep" | "drop", "r": "<one short reason, ≤ 60 chars>" }',
    '{',
    '  "verdicts": [',
    '    { "n": 1, "v": "keep", "r": "in core service area" },',
    '    { "n": 2, "v": "drop", "r": "wrong industry" }',
    '  ]',
    '}',
  ].filter(Boolean).join('\n');
}

// Run one batch through the available provider chain. Returns array of
// verdicts indexed 0..n-1.
async function evaluateBatch(env, brand, keywords) {
  const prompt = buildBatchPrompt(brand, keywords);
  const overlayed = await vaultedEnv(env);
  const settings = await loadSettings(env);
  const available = (await listProviders(overlayed)).text;
  if (!available.length) throw new Error('no_text_providers_configured');

  const SYS = 'You filter keyword queues for SEO. Strict JSON output only.';
  let raw = '';
  let usedProvider = '';
  let usedModel = '';
  // Explicit preference > the operator's default > registry order.
  const wanted = settings.default_ai_provider || '';
  const order = wanted && available.includes(wanted)
    ? [wanted, ...available.filter((p) => p !== wanted)]
    : available;
  const errs = [];
  for (const name of order) {
    try {
      // Dispatch through the shared registry. This file used to carry a third
      // copy of the provider switch (its own comment admitted it was 'the same
      // shape as brand-dna.js but trimmed'), which drifted the same way.
      const out = await runTextProvider(env, name, prompt);
      raw = out?.raw ?? JSON.stringify(out?.parsed ?? '');
      usedModel = out?.usage?.model || name;
      usedProvider = name;
      break;
    } catch (e) { errs.push(`${name}: ${String(e?.message || e).slice(0, 100)}`); }
  }
  if (!raw) throw new Error('all_providers_failed — ' + errs.join(' | '));

  // Log usage row per batch — these aren't free with cloud providers.
  await recordUsage(env, settings, {
    provider: usedProvider, model: usedModel,
    prompt_tokens: estimateTokens(SYS + prompt),
    completion_tokens: estimateTokens(raw),
    estimated: true,
    kind: 'brand-filter', source: 'admin-brand-filter',
  });

  const parsed = looseJsonParse(raw);
  const verdicts = Array.isArray(parsed?.verdicts) ? parsed.verdicts : [];
  // Normalise — index by n, return in keyword order.
  const out = keywords.map((kw, i) => {
    const v = verdicts.find((x) => Number(x?.n) === i + 1);
    return {
      keyword: kw,
      verdict: v?.v === 'drop' ? 'drop' : 'keep',
      reason:  String(v?.r || '').slice(0, 120),
    };
  });
  return { provider: usedProvider, verdicts: out };
}


function looseJsonParse(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  try { return JSON.parse(s); } catch {}
  // Tolerate raw newlines inside string literals.
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]; const code = ch.charCodeAt(0);
    if (!inStr) { out += ch; if (ch === '"') inStr = true; continue; }
    if (esc) { out += ch; esc = false; continue; }
    if (ch === '\\') { out += ch; esc = true; continue; }
    if (ch === '"') { out += ch; inStr = false; continue; }
    if (code < 0x20) {
      out += code === 0x0a ? '\\n' : code === 0x0d ? '\\r' : code === 0x09 ? '\\t' : ('\\u' + code.toString(16).padStart(4, '0'));
      continue;
    }
    out += ch;
  }
  return JSON.parse(out);
}

export const onRequestPost = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const dryRun = body?.dry_run === true;
  const batchSize = Math.min(MAX_BATCH, Math.max(5, parseInt(body?.batch_size, 10) || DEFAULT_BATCH));

  const settings = await loadSettings(env);
  if (!settings.brand_business_type && !settings.brand_target_audience && !settings.brand_key_themes) {
    return json(400, { error: 'no_brand_dna', hint: 'Set the brand DNA first (Brand DNA tab → Generate + Save).' });
  }

  const pending = await env.DB.prepare(
    `SELECT id, keyword FROM prog_keywords WHERE status='pending' ORDER BY priority DESC, created_at ASC LIMIT ?`
  ).bind(MAX_KEYWORDS).all();
  const rows = pending?.results || [];
  if (!rows.length) return json(200, { ok: true, evaluated: 0, kept: 0, dropped: 0, sample: [], dry_run: dryRun });

  // Run the batches sequentially — keeps the LLM bill predictable and
  // avoids tripping rate limits on free tiers.
  const verdicts = [];
  let usedProvider = '';
  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize);
    try {
      const r = await evaluateBatch(env, settings, slice.map((k) => k.keyword));
      usedProvider = r.provider;
      for (let j = 0; j < slice.length; j++) {
        verdicts.push({
          id: slice[j].id,
          keyword: slice[j].keyword,
          verdict: r.verdicts[j].verdict,
          reason:  r.verdicts[j].reason,
        });
      }
    } catch (e) {
      // If a batch fails, mark its keywords as kept (safer default) and
      // continue. We surface the error in the response.
      for (const k of slice) verdicts.push({ id: k.id, keyword: k.keyword, verdict: 'keep', reason: 'batch_error: ' + String(e?.message || e).slice(0, 60) });
    }
  }

  const drops = verdicts.filter((v) => v.verdict === 'drop');
  const keeps = verdicts.length - drops.length;

  if (!dryRun && drops.length) {
    const t = nowSec();
    // Mark as failed (not deleted) so the operator can review them
    // afterwards in the Failed queue and reverse the call if needed.
    for (const d of drops) {
      await env.DB.prepare(
        `UPDATE prog_keywords SET status='failed', error=?, updated_at=? WHERE id=?`
      ).bind('brand_filter: ' + d.reason, t, d.id).run();
    }
    audit(env, 'admin', 'brand_filter_queue', null, {
      provider: usedProvider, evaluated: verdicts.length, dropped: drops.length,
    });
  }

  return json(200, {
    ok: true,
    dry_run: dryRun,
    provider: usedProvider,
    evaluated: verdicts.length,
    kept: keeps,
    dropped: drops.length,
    sample: verdicts.slice(0, 20),
    dropped_sample: drops.slice(0, 20),
  });
};

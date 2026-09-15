// Direct provider call for one-off structured-JSON prompts (brand DNA,
// content-calendar planner). Unlike generateContent(), this does NOT
// run shapeArticle — the caller parses the JSON themselves.
//
// Walks the provider registry just like generateContent: preferred
// provider first if usable, then the available list in default order.
// Each successful call is logged to ai_usage with a caller-supplied
// `kind` + `source` so the dashboard reports cost per feature.

import { listProviders, vaultedEnv, runTextProvider } from './ai.js';
import { loadSettings } from './settings.js';
import { recordUsage, estimateTokens } from './usage.js';

const DEFAULT_SYS = 'You return strict JSON only — no markdown fences, no prose outside the braces.';

export async function callRawLLM(env, prompt, {
  sys = DEFAULT_SYS,
  preferredProvider = '',
  kind = 'raw-json',
  source = 'admin',
} = {}) {
  const overlayed = await vaultedEnv(env);
  const available = (await listProviders(overlayed)).text;
  if (!available.length) throw new Error('no_text_providers_configured');

  const settings = await loadSettings(env);
  // Explicit preference > the operator's default > registry order. Reading
  // the setting here matters: the wizard calls this with no provider, and
  // without the fallback it would land on Workers AI — the very provider an
  // operator sets a default to get away from when its free quota runs out.
  const wanted = preferredProvider || settings.default_ai_provider || '';
  const order = wanted && available.includes(wanted)
    ? [wanted, ...available.filter((p) => p !== wanted)]
    : available;
  const errs = [];
  for (const name of order) {
    try {
      // Dispatch through the shared registry. This file used to carry its own
      // switch, which drifted the same way brand-dna's did: five of the ten
      // providers, no gurouter. See runTextProvider() in ai.js.
      const out = await runTextProvider(env, name, prompt);
      const text = out?.raw ?? JSON.stringify(out?.parsed ?? '');
      await recordUsage(env, settings, {
        provider: name, model: out?.usage?.model || name,
        prompt_tokens: out?.usage?.prompt_tokens || estimateTokens(prompt),
        completion_tokens: out?.usage?.completion_tokens || estimateTokens(text),
        estimated: !out?.usage?.prompt_tokens,
        kind, source,
      });
      return { provider: name, parsed: out?.parsed ?? {}, raw: text };
    } catch (e) {
      errs.push(`${name}: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  await recordUsage(env, settings, {
    provider: order[0] || 'unknown', kind, source,
    ok: false, error: errs.join(' | '),
  });
  throw new Error('all_providers_failed — ' + errs.join(' | '));
}


export function looseJsonParse(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  try { return JSON.parse(s); } catch { /* repair below */ }

  // Raw control chars inside string literals (model habit).
  let out = '', inStr = false, escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]; const code = ch.charCodeAt(0);
    if (!inStr) { out += ch; if (ch === '"') inStr = true; continue; }
    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch === '"') { out += ch; inStr = false; continue; }
    if (code < 0x20) {
      out += code === 0x0a ? '\\n' : code === 0x0d ? '\\r' : code === 0x09 ? '\\t' : ('\\u' + code.toString(16).padStart(4, '0'));
      continue;
    }
    out += ch;
  }
  try { return JSON.parse(out); } catch { /* repair below */ }

  // Unescaped double quotes inside a value — the usual cause of
  // "Expected ',' or '}' after property value". A quote only closes the
  // string when the next non-space char is a JSON delimiter; otherwise the
  // model wrote a raw quote in prose and it must be escaped.
  let fixed = '', inS = false, esc = false;
  for (let i = 0; i < out.length; i++) {
    const ch = out[i];
    if (!inS) { fixed += ch; if (ch === '"') inS = true; continue; }
    if (esc) { fixed += ch; esc = false; continue; }
    if (ch === '\\') { fixed += ch; esc = true; continue; }
    if (ch === '"') {
      let j = i + 1;
      while (j < out.length && /\s/.test(out[j])) j++;
      const next = out[j];
      if (next === ',' || next === '}' || next === ']' || next === ':') { fixed += ch; inS = false; }
      else fixed += '\\"';
      continue;
    }
    fixed += ch;
  }
  try { return JSON.parse(fixed); } catch { /* repair below */ }

  // Cut off mid-object (token limit): close the open string and containers
  // so the partial payload is still usable instead of losing the article.
  return JSON.parse(closeTruncated(fixed));
}

function closeTruncated(s) {
  let inS = false, esc = false;
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inS) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inS = false;
      continue;
    }
    if (ch === '"') { inS = true; continue; }
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let out = esc ? s.slice(0, -1) : s;
  if (inS) out += '"';
  while (stack.length) out += stack.pop();
  return out.replace(/,\s*([}\]])/g, '$1');
}

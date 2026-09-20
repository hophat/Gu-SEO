// Shared TypeSafe System One client for the dev tools in scripts/.
//
// Wire contract facts live here so `scripts/jev.js` and
// `scripts/typesafe-mcp.js` cannot drift:
//   - a score question carries its ordered levels in `criteria`; the docs'
//     interactive examples call that field `levels`, which the API rejects
//     with a 422.
//   - validation failures arrive as a FastAPI `detail[]` array.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const API = 'https://api.typesafe.ai/v1/systemone';
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY.trim();
  const file = join(ROOT, '.dev.vars');
  if (!existsSync(file)) return '';
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*TYPESAFE_API_KEY\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  return '';
}

export async function askSystemOne(key, { state, questions, model = 'jev-latest', timeout = 45 }) {
  let res;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, model, questions }),
      signal: AbortSignal.timeout(timeout * 1000),
    });
  } catch (err) {
    return { ok: false, error: 'network', detail: String(err?.message || err) };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail;
    const error = detail
      ? (Array.isArray(detail) ? detail.map((d) => `${(d.loc || []).join('.')}: ${d.msg}`).join('; ') : JSON.stringify(detail)).slice(0, 400)
      : (body?.error?.message || body?.message || `http ${res.status}`);
    return { ok: false, status: res.status, error };
  }
  return { ok: true, model: body?.model, answers: body?.answers || {}, usage: body?.usage };
}

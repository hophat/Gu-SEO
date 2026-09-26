// Shared helpers used across functions.

export function nowSec() { return Math.floor(Date.now() / 1000); }

// 16-byte random hex (32 chars). Used as opaque row IDs across the schema.
export function newId() {
  const buf = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// JSON Response helper with no-store cache by default.
//
// Defensively scrubs any Error objects in the body before
// serialising. JSON.stringify on a raw Error normally drops most
// fields (Errors aren't enumerable) but `stack` and `cause` slip
// through when callers do { error: e } or { detail: e } — and
// JSON.stringify with a replacer can also surface them. The scrub
// converts every Error to { message } so we never leak stack
// traces, internal file paths, or wrapping causes to clients.
// CodeQL flags this as CWE-209 (information exposure through error
// message); the replacer below closes the gap.
export function json(status, body, extraHeaders = {}) {
  const serialised = JSON.stringify(body, (_, v) => {
    if (v instanceof Error) {
      // Only keep the user-safe `message`. `stack`, `cause`, file
      // paths, line numbers all dropped. If callers want the
      // detail in the response they have to opt in by passing the
      // string explicitly.
      return { message: String(v.message || v).slice(0, 500) };
    }
    return v;
  });
  return new Response(serialised, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

// HTML-escape arbitrary text for safe insertion into rendered pages.
export function esc(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// R2 image objects are served with `immutable, max-age=31536000`, which is
// a promise that the bytes behind a URL will never change. Publishing a
// correction under an unchanged key breaks that promise, and the edge keeps
// serving the old copy for the rest of the year — a WebP conversion that
// landed in the bucket as the wrong bytes stayed invisible for that long.
// Tagging image URLs with this value makes the URL itself change, so a
// fresh fetch is forced. Bump it whenever published image bytes change.
export const IMAGE_VERSION = 3;

export function imageUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/image/')) return url;
  return `${url}?v=${IMAGE_VERSION}`;
}

// kebab-case slugifier — keeps a-z 0-9, collapses everything else.
export function slugify(input) {
  return String(input)
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'page-' + Date.now();
}

// Write a row to audit_log. Best-effort — caller doesn't await.
export async function audit(env, actor, action, targetId, details) {
  if (!env?.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, actor, action, target_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      newId(), actor || 'system', action, targetId || null,
      typeof details === 'string' ? details : JSON.stringify(details || {}),
      nowSec()
    ).run();
  } catch { /* logging never blocks the main flow */ }
}

// Edge TTL for `edgeCached` below, in seconds. `s-maxage` governs the
// shared cache; `max-age` on the response still governs the visitor's
// browser. Deliberately short: the operator publishes a post and then opens
// the public URL to check it, and an hour of edge TTL means reading the
// previous revision for an hour. A minute still absorbs the repeat views and
// crawler re-crawls that matter.
const EDGE_SMAXAGE = 60;

// Public responses (HTML, generated SVG) served from the Cloudflare edge cache.
//
// Pages does not put a Function response in the zone cache by itself. The
// `Cache-Control: s-maxage` the renderers already send is ignored, the
// handler plus its whole D1 chain runs on every single page view, and the
// response comes back `cf-cache-status: DYNAMIC`. The Workers Cache API is
// the supported way to opt a response in from code — `caches.default` is
// the same per-datacentre store the zone cache uses.
//
// The Worker still runs on a hit, but it does one map lookup instead of the
// whole D1 chain plus the markdown/cover rendering, which is where the
// latency actually goes. Do NOT wrap a route the zone already caches (the
// generated SVGs answer with cf-cache-status: HIT on their own): that adds
// a lookup in front of a cache that was already answering.
//
// Public, visitor-independent pages only. A hit replays a stored response
// instead of running the handler, so anything the handler decides per
// visitor (session, role, experiment) must never be stored through here.
// The cache key is the full request URL, so host, project prefix and query
// string all separate entries.
//
// `build` returns the response to serve. Only a 200 with no Set-Cookie is
// stored: everything else (404, 410, redirects) stays live, so a slug rename
// or a freshly published post is never shadowed by a stored miss.
export async function edgeCached(request, waitUntil, build) {
  // Absent in unit tests and any plain Node run — render directly.
  const cache = globalThis.caches?.default;
  if (!cache) return build();

  const key = new Request(request.url, { method: 'GET' });
  const hit = await cache.match(key).catch(() => null);
  if (hit) return hit;

  const res = await build();
  if (res.status !== 200 || res.headers.has('set-cookie')) return res;

  // s-maxage has to be rewritten *inside* Cache-Control — a standalone
  // `s-maxage` header is not a directive the cache reads, and the renderers
  // already ship a much larger one. max-age is left alone so the visitor's
  // browser still caches for as long as the page intends.
  const cc = res.headers.get('cache-control') || '';
  const directives = cc.split(',').map((d) => d.trim()).filter(Boolean).filter((d) => !/^s-maxage=/i.test(d));
  directives.push(`s-maxage=${EDGE_SMAXAGE}`);

  const headers = new Headers(res.headers);
  headers.set('cache-control', directives.join(', '));
  const out = new Response(res.body, { status: res.status, statusText: res.statusText, headers });

  // Prefer the platform's waitUntil so the store never delays the response;
  // the [project] wrappers rebuild the context and drop it, so await as a
  // fallback rather than losing the write.
  const store = () => cache.put(key, out.clone()).catch(() => {});
  if (waitUntil) waitUntil(store());
  else await store();
  return out;
}

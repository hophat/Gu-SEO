// Pings IndexNow with the full sitemap (or a caller-supplied URL list).
import { json, audit } from '../../_lib/util.js';
import { adminGate, requireAdminAsync, resolveTenantContext } from '../../_lib/auth.js';
import { pingIndexNow } from '../../_lib/indexnow.js';
import { publicBaseFor } from '../../_lib/project_scope.js';

function extractLocs(xml) {
  const out = [];
  const rx = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = rx.exec(xml)) !== null) {
    const u = m[1].trim();
    if (u) out.push(u);
  }
  return out;
}

export const onRequestPost = async ({ request, env }) => {
  const gate = await adminGate(env, request); if (gate) return gate;
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  let body = {};
  try { body = await request.json(); } catch { /* empty body ok */ }

  // Ping the project the operator is scoped to, not whichever site the
  // route happens to be installed on.
  const base = await publicBaseFor(env, tenant?.activeProjectId || null, request);
  const host = new URL(base).hostname;
  let urls;
  let source;
  if (Array.isArray(body?.urls) && body.urls.length) {
    urls = body.urls; source = 'caller_supplied';
  } else {
    try {
      const r = await fetch(`${base}/sitemap-pages.xml`);
      if (!r.ok) throw new Error('sitemap_http_' + r.status);
      const text = await r.text();
      urls = extractLocs(text).filter(u => u.includes(host));
      source = 'sitemap';
    } catch {
      urls = []; source = 'failed';
    }
  }
  if (!urls.length) return json(400, { error: 'no_urls', source, host });
  const r = await pingIndexNow(env, urls, request, host);
  audit(env, 'admin', 'indexnow_ping', tenant?.activeProjectId || null, { url_count: urls.length, host, ok: r.ok, rate_limited: r.rate_limited, source });
  if (r.rate_limited) {
    return json(200, { ok: true, rate_limited: true, status: r.status, message: 'IndexNow rate limited (too many pings). Bing will crawl naturally.', urls, source });
  }
  return json(r.ok ? 200 : 502, { ...r, urls, source });
};

// Guarded outbound fetch for public, unauthenticated tools.
//
// A tool that accepts a user-supplied URL and fetches it from the edge is
// an SSRF hole by default: whatever the isolate can reach, an attacker
// can reach through us. Two layers here — the address is checked before
// the request is issued, and redirects are followed by hand so every hop
// is re-checked instead of trusting one automatic chain.
//
// Limitation worth knowing: Workers runtimes expose no DNS resolver, so
// a hostname that resolves to 127.0.0.1 cannot be caught here. The
// allowlist-free part of the defence is the redirect policy plus the
// response cap; anything that genuinely needs to fetch arbitrary hosts
// should run where the resolved address is visible.

const ALLOWED_PORTS = new Set(['', '80', '443']);
const MAX_BYTES = 800_000;
const MAX_REDIRECTS = 3;

function isPrivateV4(ip) {
  const p = ip.split('.').map((n) => parseInt(n, 10));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;                 // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;       // CGNAT
  if (a === 192 && b === 0) return true;                   // 192.0.0.0/24, 192.0.2.0/24
  if (a === 198 && (b === 18 || b === 19)) return true;     // benchmarking
  if (a >= 224) return true;                                // multicast + reserved
  return false;
}

function isPrivateV6(ip) {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (s === '::1' || s === '::') return true;
  if (s.startsWith('fe80') || s.startsWith('fc') || s.startsWith('fd')) return true; // link-local, ULA
  if (s.startsWith('::ffff:')) {
    const v4 = s.slice(7);
    return /^[\d.]+$/.test(v4) ? isPrivateV4(v4) : true;
  }
  return false;
}

// Reject anything that is not a plainly public http(s) address.
export function assertPublicUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    throw new Error('invalid_url');
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error('only_http_https');
  if (!ALLOWED_PORTS.has(u.port)) throw new Error('port_not_allowed');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) throw new Error('invalid_url');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('private_host');
  }
  // Bare IPv4 literal — no DNS hop, so this is the one case we can fully judge.
  if (/^[\d.]+$/.test(host)) {
    if (isPrivateV4(host)) throw new Error('private_host');
  } else if (host.includes(':')) {
    if (isPrivateV6(host)) throw new Error('private_host');
  }
  return u;
}

// Follow redirects manually, re-checking each hop. Returns the final
// response plus the chain, so a caller can show the user where they
// actually ended up.
export async function safeFetch(rawUrl, { timeoutMs = 10_000, maxBytes = MAX_BYTES, userAgent } = {}) {
  const chain = [];
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = assertPublicUrl(current);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url.toString(), {
        headers: {
          'User-Agent': userAgent || 'Mozilla/5.0 (compatible; pages-seo-tool/1.0)',
          'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5',
          'Accept-Language': 'vi,en;q=0.8',
        },
        redirect: 'manual',
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      throw new Error(err?.name === 'AbortError' ? 'timeout' : 'fetch_failed');
    }
    clearTimeout(timer);

    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      chain.push({ url: url.toString(), status: res.status });
      // Relative Location is legal; resolve before the next hop's checks.
      current = new URL(location, url).toString();
      continue;
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const reader = res.body?.getReader();
    let text = '';
    let bytes = 0;
    let truncated = false;
    if (reader) {
      const dec = new TextDecoder();
      while (bytes < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        text += dec.decode(value, { stream: true });
      }
      if (bytes >= maxBytes) truncated = true;
    } else {
      text = await res.text();
      if (text.length > maxBytes) { text = text.slice(0, maxBytes); truncated = true; }
    }
    return {
      finalUrl: url.toString(),
      status: res.status,
      contentType,
      text,
      bytes,
      truncated,
      chain,
    };
  }
  throw new Error('too_many_redirects');
}

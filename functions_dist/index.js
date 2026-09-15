var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// _lib/util.js
function nowSec() {
  return Math.floor(Date.now() / 1e3);
}
function newId() {
  const buf = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function json(status, body, extraHeaders = {}) {
  const serialised = JSON.stringify(body, (_, v) => {
    if (v instanceof Error) {
      return { message: String(v.message || v).slice(0, 500) };
    }
    return v;
  });
  return new Response(serialised, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}
function esc(s) {
  return String(s == null ? "" : s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function slugify(input) {
  return String(input).replace(/đ/g, "d").replace(/Đ/g, "d").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "page-" + Date.now();
}
async function audit(env, actor, action, targetId, details) {
  if (!env?.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, actor, action, target_id, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      newId(),
      actor || "system",
      action,
      targetId || null,
      typeof details === "string" ? details : JSON.stringify(details || {}),
      nowSec()
    ).run();
  } catch {
  }
}
var init_util = __esm({
  "_lib/util.js"() {
    init_functionsRoutes_0_09583509623234443();
    __name(nowSec, "nowSec");
    __name(newId, "newId");
    __name(json, "json");
    __name(esc, "esc");
    __name(slugify, "slugify");
    __name(audit, "audit");
  }
});

// _lib/settings.js
function invalidateSettingsCache(env) {
  if (env) delete env[SETTINGS_CACHE_KEY];
}
async function loadSettings(env) {
  if (env?.[SETTINGS_CACHE_KEY]) return env[SETTINGS_CACHE_KEY];
  const out = {};
  try {
    const rows = await env.DB.prepare("SELECT key, value FROM settings").all();
    for (const row of rows?.results || []) {
      if (row.value != null) out[row.key] = row.value;
    }
  } catch {
  }
  for (const k of KEYS) {
    if (out[k] == null || out[k] === "") out[k] = FALLBACK[k](env);
  }
  out.site_name = (env?.SITE_NAME || "").trim() || out.site_name_db || "";
  out.site_url = (env?.SITE_URL || "").trim() || out.site_url_db || "";
  if (env && out && Object.keys(out).length) {
    try {
      env[SETTINGS_CACHE_KEY] = out;
    } catch {
    }
  }
  return out;
}
async function setSetting(env, key, value) {
  if (!KEYS.includes(key)) throw new Error("unknown_setting: " + key);
  const t = nowSec();
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`
  ).bind(key, value == null ? "" : String(value), t).run();
  invalidateSettingsCache(env);
}
function listSettingKeys() {
  return [...KEYS];
}
var FALLBACK, KEYS, SETTINGS_CACHE_KEY;
var init_settings = __esm({
  "_lib/settings.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    FALLBACK = {
      site_cta: /* @__PURE__ */ __name((env) => env.SITE_CTA || "Sign up to get started.", "site_cta"),
      site_tone: /* @__PURE__ */ __name((_) => "", "site_tone"),
      site_audience: /* @__PURE__ */ __name((_) => "", "site_audience"),
      site_signup_url: /* @__PURE__ */ __name((env) => env.SITE_SIGNUP_URL || "/signup", "site_signup_url"),
      site_pricing_url: /* @__PURE__ */ __name((env) => env.SITE_PRICING_URL || "/pricing", "site_pricing_url"),
      site_contact_url: /* @__PURE__ */ __name((env) => env.SITE_CONTACT_URL || "/contact", "site_contact_url"),
      // Length targets for the daily blog generator. Bumped from 900-1300
      // in v1.0.2 to bias toward definitive long-form pieces, which rank
      // better for long-tail queries and have more share value. Operators
      // who want short posts can edit these in /admin → Settings.
      article_min_words: /* @__PURE__ */ __name(() => "2500", "article_min_words"),
      article_max_words: /* @__PURE__ */ __name(() => "4000", "article_max_words"),
      prog_min_words: /* @__PURE__ */ __name(() => "700", "prog_min_words"),
      prog_max_words: /* @__PURE__ */ __name(() => "1000", "prog_max_words"),
      default_ai_provider: /* @__PURE__ */ __name(() => "", "default_ai_provider"),
      // Brand DNA — generated from the user's own site, editable in the
      // admin UI. Plugged into every prompt so the LLM writes as if it
      // works for that business.
      brand_business_type: /* @__PURE__ */ __name(() => "", "brand_business_type"),
      brand_voice_tone: /* @__PURE__ */ __name(() => "", "brand_voice_tone"),
      brand_target_audience: /* @__PURE__ */ __name(() => "", "brand_target_audience"),
      brand_key_themes: /* @__PURE__ */ __name(() => "", "brand_key_themes"),
      // newline- or comma-separated
      brand_topics_to_avoid: /* @__PURE__ */ __name(() => "", "brand_topics_to_avoid"),
      brand_service_area: /* @__PURE__ */ __name(() => "", "brand_service_area"),
      brand_source_url: /* @__PURE__ */ __name(() => "", "brand_source_url"),
      // the URL we scraped (informational)
      brand_generated_at: /* @__PURE__ */ __name(() => "", "brand_generated_at"),
      // ISO timestamp of last generation
      // Onboarding wizard completion flag. Empty until the first admin
      // signs off the wizard; we use that to decide whether to launch the
      // wizard on next login. Set explicitly via /api/admin/onboarding so
      // re-running the wizard requires intent (operator opens it from the
      // help menu).
      onboarding_complete: /* @__PURE__ */ __name(() => "", "onboarding_complete"),
      // Admin token used as the HMAC secret for session cookies, the
      // bearer-token recovery path, and the AES-GCM key for the secret
      // vault. Empty by default; set either via the Pages secret
      // ADMIN_TOKEN (CLI install path) or generated by /api/setup on
      // first run (one-click deploy path). Resolved via _lib/admin_token.js.
      admin_token: /* @__PURE__ */ __name(() => "", "admin_token"),
      // SITE_NAME / SITE_URL can also live in D1 (set by /api/setup on the
      // one-click deploy path). The Pages secret takes precedence.
      site_name_db: /* @__PURE__ */ __name(() => "", "site_name_db"),
      site_url_db: /* @__PURE__ */ __name(() => "", "site_url_db"),
      // Update-check metadata. Written when the operator installs from
      // /install (browser path) so the Updates admin tab can compare the
      // installed commit to upstream HEAD and offer a one-click rebuild.
      install_method: /* @__PURE__ */ __name(() => "", "install_method"),
      // 'browser' | 'cli' | ''
      // One-time setup-magic-link token. The browser installer sets this
      // as a Pages env var (SETUP_TOKEN); the legacy in-app form falls
      // back to reading it from settings if the env var is unset.
      // /api/setup consumes it on success by setting onboarding_complete.
      setup_token: /* @__PURE__ */ __name(() => "", "setup_token"),
      installed_sha: /* @__PURE__ */ __name(() => "", "installed_sha"),
      // upstream main commit SHA at install time
      install_repo_owner: /* @__PURE__ */ __name(() => "", "install_repo_owner"),
      // user's GitHub fork owner
      install_repo_name: /* @__PURE__ */ __name(() => "", "install_repo_name"),
      // user's GitHub fork repo name
      install_cf_account: /* @__PURE__ */ __name(() => "", "install_cf_account"),
      // user's Cloudflare account id (no secrets)
      install_cf_project: /* @__PURE__ */ __name(() => "", "install_cf_project"),
      // user's Pages project slug
      install_cf_token: /* @__PURE__ */ __name(() => "", "install_cf_token"),
      // user's CF API token, encrypted via secret_vault
      // Last time the user dismissed an "update available" badge — used to
      // re-show after a fresh upstream commit (compared against latest sha).
      update_dismissed_sha: /* @__PURE__ */ __name(() => "", "update_dismissed_sha"),
      // How the daily blog chain produces its hero image.
      //   'ai'     = generate a fresh image with the AI provider (current default)
      //   'cover'  = render a saved cover template (uses the default template + post title)
      // When 'ai', the Covers tab is shown but frozen with an explainer.
      hero_image_mode: /* @__PURE__ */ __name(() => "ai", "hero_image_mode"),
      // Cached LLM price catalogue (JSON). Refreshed via the Settings tab
      // from models.dev. See functions/_lib/prices.js.
      price_cache_json: /* @__PURE__ */ __name(() => "", "price_cache_json"),
      // Usage + budget. Cost values are USD per 1M tokens, separate input
      // and output rates. Prices come from prices.js (bundled snapshot +
      // optional models.dev cache) rather than per-key settings.
      monthly_budget_usd: /* @__PURE__ */ __name(() => "10", "monthly_budget_usd"),
      // hard-stop cron when this month's spend >= this
      budget_warn_pct: /* @__PURE__ */ __name(() => "80", "budget_warn_pct"),
      // show banner at this % of budget
      // Search-engine verification. Both are optional strings the user
      // pastes in once they've claimed the property in Search Console /
      // Bing Webmaster Tools. The renderer emits these as meta tags on
      // every blog + programmatic page so the meta-file verification
      // path works without manual file uploads to R2.
      //
      //   google_site_verification: the value from <meta name="google-
      //   site-verification" content="…"> in the GSC "Add property →
      //   HTML tag" flow. Leave empty to skip.
      //   bing_site_verification: same for Bing's msvalidate.01 meta.
      google_site_verification: /* @__PURE__ */ __name(() => "", "google_site_verification"),
      bing_site_verification: /* @__PURE__ */ __name(() => "", "bing_site_verification"),
      // Google Search Console auto-indexing. Sitemap re-submit is
      // the safe ToS-compliant default — fires on every publish and
      // tells GSC to re-crawl /sitemap.xml. The Indexing API path
      // (toggle: '1') POSTs each URL directly for faster pickup, but
      // Google officially only supports it for JobPosting and
      // BroadcastEvent schema; using it for blogs typically works but
      // violates ToS.
      //
      //   google_sc_property      — the property string in GSC (e.g.
      //                              'sc-domain:example.com' for
      //                              domain-property installs, or
      //                              'https://example.com/' for URL-prefix).
      //                              Auto-derived from SITE_URL if empty.
      //   google_use_indexing_api — '1' to also POST per-URL to the
      //                              Indexing API. Default '' (off).
      //
      // The service-account JSON lives in the vault under
      // 'GOOGLE_SA_JSON' (set via /api/admin/settings — never in D1
      // settings table directly).
      google_sc_property: /* @__PURE__ */ __name(() => "", "google_sc_property"),
      google_use_indexing_api: /* @__PURE__ */ __name(() => "", "google_use_indexing_api"),
      // Brand identity for cover templates + JSON-LD. The cover renderer
      // exposes these as {brand.tagline}, {brand.logo_url}, {brand.
      // primary_color}, {brand.accent_color} so the same template can
      // produce different visual identities on different installs without
      // editing the spec.
      //
      //   site_tagline           — short subtitle shown under the brand name
      //                            ("daily SEO articles", "shop fashion online")
      //   brand_logo_url         — absolute URL to a small logo image (PNG/SVG)
      //                            used in the corner of cover templates.
      //                            Leave empty if you don't want one.
      //   brand_primary_color    — hex string, used as default fill on box
      //                            layers ({brand.primary_color}).
      //   brand_accent_color     — hex string, used as accent/highlight on
      //                            cover templates ({brand.accent_color}).
      site_tagline: /* @__PURE__ */ __name(() => "", "site_tagline"),
      brand_logo_url: /* @__PURE__ */ __name(() => "", "brand_logo_url"),
      brand_primary_color: /* @__PURE__ */ __name(() => "#0a0c10", "brand_primary_color"),
      brand_accent_color: /* @__PURE__ */ __name(() => "#d4af62", "brand_accent_color")
    };
    KEYS = Object.keys(FALLBACK);
    SETTINGS_CACHE_KEY = "__ps_settings_cache__";
    __name(invalidateSettingsCache, "invalidateSettingsCache");
    __name(loadSettings, "loadSettings");
    __name(setSetting, "setSetting");
    __name(listSettingKeys, "listSettingKeys");
  }
});

// _lib/site_identity.js
async function getSiteIdentity(env) {
  if (env?.[CACHE]) return env[CACHE];
  let name = (env?.SITE_NAME || "").trim();
  let url = (env?.SITE_URL || "").trim();
  if ((!name || !url) && env?.DB) {
    try {
      const s = await loadSettings(env);
      if (!name && s?.site_name_db) name = String(s.site_name_db).trim();
      if (!url && s?.site_url_db) url = String(s.site_url_db).trim();
    } catch {
    }
  }
  const out = { name, url };
  try {
    env[CACHE] = out;
  } catch {
  }
  return out;
}
var CACHE;
var init_site_identity = __esm({
  "_lib/site_identity.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_settings();
    CACHE = "__ps_site_identity_cache";
    __name(getSiteIdentity, "getSiteIdentity");
  }
});

// _lib/admin_token.js
async function getAdminToken(env) {
  if (env?.[CACHE_KEY]) return env[CACHE_KEY];
  const fromPagesSecret = env?.ADMIN_TOKEN && String(env.ADMIN_TOKEN).trim();
  if (fromPagesSecret) {
    try {
      env[CACHE_KEY] = fromPagesSecret;
    } catch {
    }
    return fromPagesSecret;
  }
  if (!env?.DB) return "";
  try {
    const s = await loadSettings(env);
    const tok = String(s?.admin_token || "").trim();
    if (tok) {
      try {
        env[CACHE_KEY] = tok;
      } catch {
      }
      return tok;
    }
  } catch {
  }
  return "";
}
var CACHE_KEY;
var init_admin_token = __esm({
  "_lib/admin_token.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_settings();
    CACHE_KEY = "__ps_admin_token_cache";
    __name(getAdminToken, "getAdminToken");
  }
});

// _lib/config.js
async function missingConfig(env) {
  const out = [];
  const identity = await getSiteIdentity(env);
  if (!identity.name) out.push("SITE_NAME");
  if (!identity.url) out.push("SITE_URL");
  const token = await getAdminToken(env);
  if (!token) out.push("ADMIN_TOKEN");
  return out;
}
function configError(missing) {
  return {
    error: "config_incomplete",
    missing,
    hint: "Open /admin to finish the one-click setup, or push the values as Pages secrets via `wrangler pages secret put`."
  };
}
var init_config = __esm({
  "_lib/config.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_site_identity();
    init_admin_token();
    __name(missingConfig, "missingConfig");
    __name(configError, "configError");
  }
});

// _lib/passwords.js
function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function fromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function constTimeEq(a, b) {
  if (a.length !== b.length) return false;
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return acc === 0;
}
async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("password_too_short");
  }
  if (password.length > 256) throw new Error("password_too_long");
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt);
  return { hash: toB64(hash), salt: toB64(salt) };
}
async function verifyPassword(password, hashB64, saltB64) {
  if (!password || !hashB64 || !saltB64) return false;
  try {
    const salt = fromB64(saltB64);
    const candidate = await pbkdf2(password, salt);
    return constTimeEq(toB64(candidate), hashB64);
  } catch {
    return false;
  }
}
async function pbkdf2(password, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" },
    baseKey,
    PASSWORD_HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}
function newSessionId() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)));
}
async function signSession(sessionId, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(sessionId));
  return `${sessionId}.${toB64(new Uint8Array(sig))}`;
}
async function verifySessionToken(token, secret) {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const sessionId = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  if (!/^[0-9a-f]{32}$/.test(sessionId)) return null;
  const expected = (await signSession(sessionId, secret)).slice(dot + 1);
  if (!constTimeEq(expected, provided)) return null;
  return sessionId;
}
function sessionExpirySec() {
  return Math.floor(Date.now() / 1e3) + SESSION_DAYS * 24 * 60 * 60;
}
function buildSessionCookie(value, maxAgeSec) {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    `Max-Age=${maxAgeSec}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ];
  return parts.join("; ");
}
function buildSessionCookieClear() {
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}
function readCookie(req, name) {
  const hdr = req.headers.get("cookie") || "";
  const cookies = hdr.split(/;\s*/);
  for (const c of cookies) {
    const eq = c.indexOf("=");
    if (eq < 0) continue;
    if (c.slice(0, eq).trim() === name) return c.slice(eq + 1).trim();
  }
  return null;
}
var PBKDF2_ITER, PASSWORD_HASH_BYTES, SALT_BYTES, SESSION_DAYS, SESSION_COOKIE;
var init_passwords = __esm({
  "_lib/passwords.js"() {
    init_functionsRoutes_0_09583509623234443();
    PBKDF2_ITER = 1e5;
    PASSWORD_HASH_BYTES = 32;
    SALT_BYTES = 16;
    SESSION_DAYS = 14;
    __name(toB64, "toB64");
    __name(fromB64, "fromB64");
    __name(toHex, "toHex");
    __name(constTimeEq, "constTimeEq");
    __name(hashPassword, "hashPassword");
    __name(verifyPassword, "verifyPassword");
    __name(pbkdf2, "pbkdf2");
    __name(newSessionId, "newSessionId");
    __name(signSession, "signSession");
    __name(verifySessionToken, "verifySessionToken");
    SESSION_COOKIE = "ps_session";
    __name(sessionExpirySec, "sessionExpirySec");
    __name(buildSessionCookie, "buildSessionCookie");
    __name(buildSessionCookieClear, "buildSessionCookieClear");
    __name(readCookie, "readCookie");
  }
});

// _lib/auth.js
function timingSafeEqual(a, b) {
  const ea = new TextEncoder().encode(String(a));
  const eb = new TextEncoder().encode(String(b));
  let diff = ea.length === eb.length ? 0 : 1;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ (i < eb.length ? eb[i] : 0);
  return diff === 0;
}
async function bearerToken(env, request) {
  const token = await getAdminToken(env);
  if (!token) return false;
  const bearer = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (bearer && timingSafeEqual(bearer[1].trim(), token)) return true;
  const hdr = (request.headers.get("X-Admin-Token") || "").trim();
  return !!(hdr && timingSafeEqual(hdr, token));
}
async function sessionAuth(env, request) {
  if (!env?.DB) return null;
  const token = await getAdminToken(env);
  if (!token) return null;
  const raw = readCookie(request, SESSION_COOKIE);
  if (!raw) return null;
  const sessionId = await verifySessionToken(raw, token);
  if (!sessionId) return null;
  const now = Math.floor(Date.now() / 1e3);
  const row = await env.DB.prepare(
    `SELECT s.id, s.user_id, s.expires_at, u.email, u.role, u.project_id
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? LIMIT 1`
  ).bind(sessionId).first().catch(() => null);
  if (!row) return null;
  if (row.expires_at <= now) return null;
  return {
    sessionId: row.id,
    userId: row.user_id,
    email: row.email,
    role: row.role || "super_admin",
    projectId: row.project_id || null
  };
}
async function requireAdminAsync(env, request) {
  if (await bearerToken(env, request)) return { actor: "admin", via: "bearer" };
  const sess = await sessionAuth(env, request);
  if (sess) return { actor: "admin", via: "session", ...sess };
  return null;
}
async function adminGate(env, request) {
  const missing = await missingConfig(env);
  if (missing.length) return json(503, configError(missing));
  const auth = await requireAdminAsync(env, request);
  if (!auth) return json(401, { error: "unauthorized" });
  return null;
}
async function requireSuperAdmin(env, request) {
  const auth = await requireAdminAsync(env, request);
  if (!auth) return { error: json(401, { error: "unauthorized" }) };
  if (auth.via !== "bearer" && auth.role !== "super_admin") {
    return { error: json(403, { error: "forbidden", hint: "super_admin only" }) };
  }
  return { auth };
}
async function resolveTenantContext(env, request, auth) {
  if (!auth) return null;
  const isSuperAdmin = auth.via === "bearer" || auth.role === "super_admin";
  let requestedProjectId = null;
  try {
    const url = new URL(request.url);
    requestedProjectId = url.searchParams.get("project_id");
  } catch {
  }
  if (!requestedProjectId && request.headers?.get) {
    requestedProjectId = request.headers.get("X-Project-Id") || request.headers.get("x-project-id");
  }
  if (!requestedProjectId && typeof request.clone === "function") {
    try {
      const cloned = request.clone();
      const body = await cloned.json();
      if (body?.project_id) requestedProjectId = body.project_id;
    } catch {
    }
  }
  if (isSuperAdmin) {
    if (requestedProjectId) {
      const project = await env?.DB?.prepare?.(
        `SELECT id, slug FROM projects WHERE id = ? OR slug = ? LIMIT 1`
      )?.bind(requestedProjectId, requestedProjectId)?.first()?.catch(() => null);
      if (project) {
        return {
          isSuperAdmin: true,
          activeProjectId: project.id,
          activeProjectSlug: project.slug,
          allowedProjectIds: "all"
        };
      }
      return null;
    }
    const firstActive = await env?.DB?.prepare?.(
      `SELECT id, slug FROM projects WHERE status = 'active' ORDER BY created_at ASC LIMIT 1`
    )?.bind?.()?.first?.()?.catch(() => null);
    return {
      isSuperAdmin: true,
      activeProjectId: firstActive?.id || null,
      activeProjectSlug: firstActive?.slug || null,
      allowedProjectIds: "all"
    };
  }
  if (auth.role === "project_admin") {
    if (!auth.projectId) {
      return {
        isSuperAdmin: false,
        forbidden: true,
        activeProjectId: DENIED_PROJECT_SENTINEL,
        activeProjectSlug: null,
        allowedProjectIds: []
      };
    }
    let activeProjectSlug = null;
    if (env?.DB) {
      const project = await env.DB.prepare(
        `SELECT id, slug FROM projects WHERE id = ? LIMIT 1`
      ).bind(auth.projectId).first().catch(() => null);
      if (project) {
        activeProjectSlug = project.slug;
      }
    }
    return {
      isSuperAdmin: false,
      activeProjectId: auth.projectId,
      activeProjectSlug,
      allowedProjectIds: [auth.projectId]
    };
  }
  return null;
}
var DENIED_PROJECT_SENTINEL;
var init_auth = __esm({
  "_lib/auth.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_config();
    init_passwords();
    init_admin_token();
    DENIED_PROJECT_SENTINEL = "__denied_no_project__";
    __name(timingSafeEqual, "timingSafeEqual");
    __name(bearerToken, "bearerToken");
    __name(sessionAuth, "sessionAuth");
    __name(requireAdminAsync, "requireAdminAsync");
    __name(adminGate, "adminGate");
    __name(requireSuperAdmin, "requireSuperAdmin");
    __name(resolveTenantContext, "resolveTenantContext");
  }
});

// api/admin/cover/templates/export.js
function collectAssetUrls(spec) {
  const urls = /* @__PURE__ */ new Set();
  const push = /* @__PURE__ */ __name((u) => {
    if (typeof u === "string" && u.startsWith("/image/")) urls.add(u);
  }, "push");
  if (spec?.background?.url) push(spec.background.url);
  for (const l of spec?.layers || []) {
    if (l?.kind === "logo" && l?.url) push(l.url);
  }
  return urls;
}
function urlToR2Key(url) {
  const path = url.replace(/^\/image\//, "");
  return path.split("/").map(decodeURIComponent).join("/");
}
function bytesToBase64(bytes) {
  let s = "";
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}
var MAX_ASSETS, MAX_ASSET_BYTES, onRequestGet;
var init_export = __esm({
  "api/admin/cover/templates/export.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_settings();
    MAX_ASSETS = 50;
    MAX_ASSET_BYTES = 12 * 1024 * 1024;
    __name(collectAssetUrls, "collectAssetUrls");
    __name(urlToR2Key, "urlToR2Key");
    __name(bytesToBase64, "bytesToBase64");
    onRequestGet = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      if (!env.IMAGES) return json(500, { error: "r2_binding_missing" });
      const u = new URL(request.url);
      const id = String(u.searchParams.get("id") || "");
      if (!id) return json(400, { error: "missing_id" });
      const row = await env.DB.prepare(
        "SELECT id, name, is_default, spec_json, created_at, updated_at FROM cover_templates WHERE id = ? LIMIT 1"
      ).bind(id).first();
      if (!row) return json(404, { error: "not_found" });
      let spec;
      try {
        spec = JSON.parse(row.spec_json);
      } catch {
        return json(500, { error: "spec_corrupt" });
      }
      const urls = [...collectAssetUrls(spec)];
      if (urls.length > MAX_ASSETS) {
        return json(413, { error: "too_many_assets", max: MAX_ASSETS, got: urls.length });
      }
      const assets = {};
      for (const url of urls) {
        const key = urlToR2Key(url);
        const meta = await env.DB.prepare(
          "SELECT kind, original_name, mime, width, height, size_bytes FROM cover_assets WHERE r2_key = ? LIMIT 1"
        ).bind(key).first();
        const obj = await env.IMAGES.get(key);
        if (!obj) {
          assets[url] = { missing: true, kind: meta?.kind || "logo" };
          continue;
        }
        if ((meta?.size_bytes || 0) > MAX_ASSET_BYTES) {
          assets[url] = { missing: true, reason: "too_large", kind: meta?.kind || "logo" };
          continue;
        }
        const buf = await obj.arrayBuffer();
        assets[url] = {
          kind: meta?.kind || "logo",
          filename: meta?.original_name || "asset",
          mime: meta?.mime || obj.httpMetadata?.contentType || "application/octet-stream",
          width: meta?.width || null,
          height: meta?.height || null,
          base64: bytesToBase64(new Uint8Array(buf))
        };
      }
      const settings = await loadSettings(env).catch(() => ({}));
      const host = new URL(request.url).hostname;
      const fileObj = {
        format: "pages-seo-cover-template",
        format_version: 1,
        exported_at: Math.floor(Date.now() / 1e3),
        source: {
          host,
          brand_name: env?.SITE_NAME || settings?.site_name || ""
        },
        template: {
          name: row.name,
          is_default: !!row.is_default,
          spec
        },
        assets
      };
      const safeName = String(row.name || "cover").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "cover";
      audit(env, "admin", "cover_template_export", id, { name: row.name, assets: Object.keys(assets).length });
      return new Response(JSON.stringify(fileObj, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          // The .template extension is what the user sees in their
          // downloads. Browsers honour the extension here, regardless
          // of the content-type.
          "content-disposition": `attachment; filename="${safeName}.template"`,
          "cache-control": "no-store"
        }
      });
    }, "onRequestGet");
  }
});

// api/admin/cover/templates/import.js
function decodeBase64(b64) {
  const m = String(b64 || "").match(/^data:[^;]+;base64,(.+)$/i);
  const raw = m ? m[1] : String(b64 || "");
  const bin = atob(raw.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function extFor(mime) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/svg+xml": "svg"
  }[mime] || "bin";
}
function imageUrlFor(key) {
  return "/image/" + key.split("/").map(encodeURIComponent).join("/");
}
function rewriteSpecUrls(spec, urlMap) {
  if (spec?.background?.url && urlMap.has(spec.background.url)) {
    spec.background.url = urlMap.get(spec.background.url);
  }
  for (const l of spec?.layers || []) {
    if (l?.kind === "logo" && l?.url && urlMap.has(l.url)) {
      l.url = urlMap.get(l.url);
    }
  }
  return spec;
}
async function uniqueName(env, baseName) {
  const trim = /* @__PURE__ */ __name((s) => String(s || "").slice(0, 110), "trim");
  let name = trim(baseName) || "imported template";
  let n = 1;
  while (n < 50) {
    const row = await env.DB.prepare(
      "SELECT 1 FROM cover_templates WHERE name = ? LIMIT 1"
    ).bind(name).first();
    if (!row) return name;
    n++;
    name = trim(`${baseName} (${n})`);
  }
  return `${trim(baseName)} (${Date.now()})`;
}
var MAX_BYTES, MAX_ASSETS2, MAX_TOTAL_BYTES, ALLOWED_MIME, onRequestPost;
var init_import = __esm({
  "api/admin/cover/templates/import.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    MAX_BYTES = 10 * 1024 * 1024;
    MAX_ASSETS2 = 50;
    MAX_TOTAL_BYTES = 60 * 1024 * 1024;
    ALLOWED_MIME = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);
    __name(decodeBase64, "decodeBase64");
    __name(extFor, "extFor");
    __name(imageUrlFor, "imageUrlFor");
    __name(rewriteSpecUrls, "rewriteSpecUrls");
    __name(uniqueName, "uniqueName");
    onRequestPost = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      if (!env.IMAGES) return json(500, { error: "r2_binding_missing" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      if (body?.format !== "pages-seo-cover-template") {
        return json(400, { error: "wrong_format", expected: "pages-seo-cover-template", got: body?.format });
      }
      const tpl = body?.template;
      if (!tpl?.spec || typeof tpl.spec !== "object") return json(400, { error: "missing_spec" });
      if (typeof tpl.spec !== "object" || !Array.isArray(tpl.spec.layers)) {
        return json(400, { error: "spec_layers_invalid" });
      }
      const assets = body?.assets && typeof body.assets === "object" ? body.assets : {};
      const assetEntries = Object.entries(assets);
      if (assetEntries.length > MAX_ASSETS2) {
        return json(413, { error: "too_many_assets", max: MAX_ASSETS2, got: assetEntries.length });
      }
      const urlMap = /* @__PURE__ */ new Map();
      let importedCount = 0;
      let missingCount = 0;
      let totalBytes = 0;
      for (const [oldUrl, meta] of assetEntries) {
        if (meta?.missing || !meta?.base64) {
          missingCount++;
          continue;
        }
        const mime = String(meta.mime || "").toLowerCase();
        if (!ALLOWED_MIME.has(mime)) {
          missingCount++;
          continue;
        }
        let bytes;
        try {
          bytes = decodeBase64(meta.base64);
        } catch {
          missingCount++;
          continue;
        }
        if (!bytes.length) {
          missingCount++;
          continue;
        }
        if (bytes.length > MAX_BYTES) {
          return json(413, { error: "asset_too_large", max_bytes: MAX_BYTES, asset: oldUrl });
        }
        totalBytes += bytes.length;
        if (totalBytes > MAX_TOTAL_BYTES) {
          return json(413, { error: "total_too_large", max_bytes: MAX_TOTAL_BYTES });
        }
        const kind = meta.kind === "background" ? "background" : "logo";
        const assetId = newId();
        const key = `cover/${kind}/${assetId}.${extFor(mime)}`;
        try {
          await env.IMAGES.put(key, bytes, {
            httpMetadata: {
              contentType: mime,
              cacheControl: "public, max-age=31536000, immutable"
            }
          });
        } catch (e) {
          return json(500, { error: "r2_put_failed", detail: String(e?.message || e).slice(0, 200) });
        }
        const t2 = nowSec();
        await env.DB.prepare(
          `INSERT INTO cover_assets
         (id, kind, r2_key, original_name, mime, size_bytes, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          assetId,
          kind,
          key,
          String(meta.filename || "imported").slice(0, 200),
          mime,
          bytes.length,
          meta.width ? parseInt(meta.width, 10) : null,
          meta.height ? parseInt(meta.height, 10) : null,
          t2
        ).run();
        urlMap.set(oldUrl, imageUrlFor(key));
        importedCount++;
      }
      const rewrittenSpec = rewriteSpecUrls(JSON.parse(JSON.stringify(tpl.spec)), urlMap);
      const name = await uniqueName(env, tpl.name || "imported template");
      const isDefault = body?.set_default ? 1 : 0;
      if (isDefault) {
        await env.DB.prepare("UPDATE cover_templates SET is_default = 0 WHERE is_default = 1").run();
      }
      const id = newId();
      const t = nowSec();
      let spec_json;
      try {
        spec_json = JSON.stringify(rewrittenSpec);
      } catch {
        return json(400, { error: "spec_serialise_failed" });
      }
      if (spec_json.length > 64 * 1024) {
        return json(413, { error: "spec_too_large_after_rewrite", size: spec_json.length });
      }
      await env.DB.prepare(
        `INSERT INTO cover_templates (id, name, is_default, spec_json, thumb_r2_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, name, isDefault, spec_json, null, t, t).run();
      audit(env, "admin", "cover_template_import", id, {
        name,
        assets_imported: importedCount,
        assets_missing: missingCount
      });
      return json(200, {
        ok: true,
        id,
        name,
        assets_imported: importedCount,
        assets_missing: missingCount,
        is_default: !!isDefault
      });
    }, "onRequestPost");
  }
});

// _lib/links/aliases.js
function scopeClause(projectId, alias = "") {
  const col = alias ? `${alias}.project_id` : "project_id";
  return projectId ? `(${col} = ? OR ${col} = '')` : "1=1";
}
function scopeArgs(projectId) {
  return projectId ? [projectId] : [];
}
async function buildAliasMap(env, projectId = null) {
  const map = Object.fromEntries(
    Object.entries(RESERVED).map(([k, v]) => [k, { ...v, kind: "reserved" }])
  );
  if (!env?.DB) return map;
  const r = await env.DB.prepare(
    `SELECT name, url, description, kind, project_id FROM site_aliases
      WHERE ${scopeClause(projectId)}
      ORDER BY
        CASE kind WHEN 'sitemap' THEN 1 WHEN 'manual' THEN 2 ELSE 3 END,
        CASE WHEN project_id = '' THEN 0 ELSE 1 END`
  ).bind(...scopeArgs(projectId)).all().catch(() => ({ results: [] }));
  for (const row of r.results || []) {
    map[String(row.name || "").toLowerCase()] = {
      url: row.url,
      description: row.description || "",
      kind: row.kind || "manual"
    };
  }
  return map;
}
async function syncSitemapAliases(env, projectId = null) {
  if (!env?.DB) return { added: 0, removed: 0 };
  const now = nowSec();
  const pid = projectId || "";
  const postScope = projectId ? "AND project_id = ?" : "";
  const postArgs = projectId ? [projectId] : [];
  const [posts, progs, existing] = await Promise.all([
    env.DB.prepare(
      `SELECT slug, title, meta_description FROM blog_posts
        WHERE status='published' ${postScope}
        ORDER BY published_at DESC LIMIT 500`
    ).bind(...postArgs).all().catch(() => ({ results: [] })),
    env.DB.prepare(
      `SELECT slug, title, meta_description FROM prog_pages
        WHERE status='published' ${postScope}
        ORDER BY published_at DESC LIMIT 500`
    ).bind(...postArgs).all().catch(() => ({ results: [] })),
    env.DB.prepare(
      `SELECT name FROM site_aliases WHERE kind='sitemap' AND project_id = ?`
    ).bind(pid).all().catch(() => ({ results: [] }))
  ]);
  const desired = /* @__PURE__ */ new Map();
  for (const p of posts.results || []) {
    const name = String(p.slug || "").toLowerCase();
    if (!name) continue;
    desired.set(name, {
      url: `/blog/${p.slug}`,
      description: `Blog post: ${(p.meta_description || p.title || "").slice(0, 160)}`
    });
  }
  for (const p of progs.results || []) {
    const name = String(p.slug || "").toLowerCase();
    if (!name) continue;
    if (desired.has(name)) continue;
    desired.set(name, {
      url: `/p/${p.slug}`,
      description: `Landing page: ${(p.meta_description || p.title || "").slice(0, 160)}`
    });
  }
  const existingNames = new Set((existing.results || []).map((r) => r.name));
  const desiredNames = new Set(desired.keys());
  const toAdd = [...desiredNames].filter((n) => !existingNames.has(n));
  const toRemove = [...existingNames].filter((n) => !desiredNames.has(n));
  const batch = [];
  for (const name of toAdd) {
    const v = desired.get(name);
    batch.push(env.DB.prepare(
      `INSERT INTO site_aliases (id, project_id, name, url, description, kind, created_at, updated_at)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, 'sitemap', ?, ?)
       ON CONFLICT(project_id, name) DO UPDATE SET
         url = excluded.url,
         description = excluded.description,
         updated_at = excluded.updated_at
       WHERE site_aliases.kind = 'sitemap'`
    ).bind(pid, name, v.url, v.description, now, now));
  }
  if (toRemove.length) {
    const placeholders = toRemove.map(() => "?").join(",");
    batch.push(env.DB.prepare(
      `DELETE FROM site_aliases
        WHERE kind='sitemap' AND project_id = ? AND name IN (${placeholders})`
    ).bind(pid, ...toRemove));
  }
  if (batch.length) await env.DB.batch(batch);
  return { added: toAdd.length, removed: toRemove.length, total: desired.size };
}
var RESERVED, RESERVED_NAMES;
var init_aliases = __esm({
  "_lib/links/aliases.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    RESERVED = {
      blog: { url: "/blog", description: "The main blog index of this site." },
      home: { url: "/", description: "The homepage of this site." },
      rss: { url: "/feed.xml", description: "The RSS feed." },
      sitemap: { url: "/sitemap.xml", description: "The XML sitemap." }
    };
    RESERVED_NAMES = Object.keys(RESERVED);
    __name(scopeClause, "scopeClause");
    __name(scopeArgs, "scopeArgs");
    __name(buildAliasMap, "buildAliasMap");
    __name(syncSitemapAliases, "syncSitemapAliases");
  }
});

// api/admin/aliases/sync.js
var onRequestPost2;
var init_sync = __esm({
  "api/admin/aliases/sync.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_aliases();
    onRequestPost2 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      const result = await syncSitemapAliases(env, pid);
      await audit(env, "admin", "aliases.sync", pid || "", JSON.stringify(result));
      return json(200, { ok: true, project_id: pid, ...result });
    }, "onRequestPost");
  }
});

// api/admin/blog/delete-job.js
var onRequestPost3;
var init_delete_job = __esm({
  "api/admin/blog/delete-job.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    onRequestPost3 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const id = String(body.id || "").trim();
      if (!id) return json(400, { error: "missing_id" });
      const job = await env.DB.prepare("SELECT id, status, hero_image_key FROM blog_jobs WHERE id=? LIMIT 1").bind(id).first();
      if (!job) return json(404, { error: "not_found" });
      if (job.status === "published") return json(409, { error: "already_published" });
      if (job.hero_image_key && env.IMAGES) {
        await env.IMAGES.delete(job.hero_image_key).catch(() => {
        });
      }
      await env.DB.prepare("DELETE FROM blog_jobs WHERE id=?").bind(id).run();
      return json(200, { ok: true });
    }, "onRequestPost");
  }
});

// _lib/dedup.js
async function embed(env, text) {
  const trimmed = String(text || "").slice(0, MAX_TEXT_FOR_EMBED);
  if (!trimmed) throw new Error("embed: empty text");
  const out = await env.AI.run(EMBED_MODEL, { text: [trimmed] });
  const vec = Array.isArray(out?.data?.[0]) ? out.data[0] : Array.isArray(out?.data) ? out.data : null;
  if (!vec || !vec.length) throw new Error("embed: bad model response");
  return { vector: vec, dims: vec.length, model: EMBED_MODEL };
}
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
async function checkDuplicate(env, { title, angle, projectId = null }) {
  if (!env?.AI || !env?.DB) {
    return { duplicate: false, similarity: 0, against: null, scored: [], skipped: "no_ai_binding" };
  }
  const candidate = String(title || "") + " \u2014 " + String(angle || "");
  let candidateVec;
  try {
    candidateVec = (await embed(env, candidate)).vector;
  } catch (e) {
    return { duplicate: false, similarity: 0, against: null, scored: [], error: String(e?.message || e) };
  }
  const rows = projectId ? await env.DB.prepare(
    `SELECT slug, title, meta_description, embedding
           FROM blog_posts
          WHERE status = 'published' AND embedding IS NOT NULL
            AND (project_id = ? OR project_id IS NULL)
          ORDER BY published_at DESC LIMIT ?`
  ).bind(projectId, RECENT_POSTS_TO_CHECK).all().catch(() => ({ results: [] })) : await env.DB.prepare(
    `SELECT slug, title, meta_description, embedding
           FROM blog_posts
          WHERE status = 'published' AND embedding IS NOT NULL
          ORDER BY published_at DESC LIMIT ?`
  ).bind(RECENT_POSTS_TO_CHECK).all().catch(() => ({ results: [] }));
  const scored = [];
  for (const r of rows.results || []) {
    let v;
    try {
      v = JSON.parse(r.embedding);
    } catch {
      continue;
    }
    if (!Array.isArray(v) || v.length !== candidateVec.length) continue;
    const score = cosine(candidateVec, v);
    scored.push({ slug: r.slug, title: r.title, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0] || null;
  return {
    duplicate: !!top && top.score >= SIMILARITY_THRESHOLD,
    similarity: top?.score || 0,
    against: top,
    scored: scored.slice(0, 5),
    threshold: SIMILARITY_THRESHOLD
  };
}
async function pickNonDuplicate(env, pickFn, { maxTries = 5, projectId = null } = {}) {
  const burned = [];
  for (let i = 0; i < maxTries; i++) {
    const topic = await pickFn();
    if (!topic) break;
    const dup = await checkDuplicate(env, { title: topic.angle, angle: topic.angle, projectId });
    if (!dup.duplicate) {
      return { topic, dup, tries: i + 1, fallback: false };
    }
    burned.push({ topic, dup });
  }
  if (!burned.length) {
    return { topic: null, dup: null, tries: maxTries, fallback: true };
  }
  burned.sort((a, b) => a.dup.similarity - b.dup.similarity);
  const best = burned[0];
  return { topic: best.topic, dup: best.dup, tries: burned.length, fallback: true };
}
async function storeEmbedding(env, slug, { title, body_markdown, meta_description }) {
  if (!env?.AI || !env?.DB) return { ok: false, reason: "no_binding" };
  const body = String(body_markdown || "").slice(0, 800);
  const text = `${title || ""}
${meta_description || ""}
${body}`;
  try {
    const { vector, model } = await embed(env, text);
    await env.DB.prepare(
      `UPDATE blog_posts SET embedding = ?, embedding_model = ?, embedding_at = ?
         WHERE slug = ?`
    ).bind(JSON.stringify(vector), model, Math.floor(Date.now() / 1e3), slug).run();
    return { ok: true, dims: vector.length };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 200) };
  }
}
var EMBED_MODEL, SIMILARITY_THRESHOLD, RECENT_POSTS_TO_CHECK, MAX_TEXT_FOR_EMBED;
var init_dedup = __esm({
  "_lib/dedup.js"() {
    init_functionsRoutes_0_09583509623234443();
    EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
    SIMILARITY_THRESHOLD = 0.8;
    RECENT_POSTS_TO_CHECK = 50;
    MAX_TEXT_FOR_EMBED = 1500;
    __name(embed, "embed");
    __name(cosine, "cosine");
    __name(checkDuplicate, "checkDuplicate");
    __name(pickNonDuplicate, "pickNonDuplicate");
    __name(storeEmbedding, "storeEmbedding");
  }
});

// api/admin/blog/embed-backfill.js
var BATCH_LIMIT, onRequestPost4;
var init_embed_backfill = __esm({
  "api/admin/blog/embed-backfill.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_dedup();
    BATCH_LIMIT = 25;
    onRequestPost4 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const rows = await env.DB.prepare(
        `SELECT slug, title, meta_description, body_markdown
       FROM blog_posts
      WHERE status = 'published' AND embedding IS NULL
      ORDER BY published_at ASC LIMIT ?`
      ).bind(BATCH_LIMIT).all().catch(() => ({ results: [] }));
      const todo = rows.results || [];
      const out = { ok: true, candidates: todo.length, embedded: 0, errors: [] };
      for (const r of todo) {
        const res = await storeEmbedding(env, r.slug, {
          title: r.title,
          body_markdown: r.body_markdown,
          meta_description: r.meta_description
        });
        if (res.ok) out.embedded++;
        else out.errors.push({ slug: r.slug, reason: res.reason });
      }
      out.remaining_estimate = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM blog_posts WHERE status='published' AND embedding IS NULL`
      ).first().then((r) => r?.n || 0).catch(() => null);
      out.finished_at = nowSec();
      return json(200, out);
    }, "onRequestPost");
  }
});

// _lib/template.js
function lookup(ctx, path) {
  if (!path) return void 0;
  const parts = path.split(".");
  let cur = ctx;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return void 0;
    cur = cur[p];
  }
  return cur;
}
function parseExpr(raw) {
  const parts = raw.split("|").map((s) => s.trim());
  const path = parts.shift();
  const filters = parts.map((p) => {
    const colon = p.indexOf(":");
    if (colon < 0) return { name: p.trim(), arg: void 0 };
    const name = p.slice(0, colon).trim();
    let arg = p.slice(colon + 1).trim();
    const qm = arg.match(/^['"](.*)['"]$/);
    if (qm) arg = qm[1];
    return { name, arg };
  });
  return { path, filters };
}
function applyFilters(value, filters) {
  let v = value;
  for (const f of filters) {
    const fn = FILTERS[f.name];
    if (typeof fn !== "function") continue;
    try {
      v = fn(v, f.arg);
    } catch {
    }
  }
  return v;
}
function truthy(v) {
  if (v == null) return false;
  if (v === false || v === 0) return false;
  if (typeof v === "string") {
    const s = v.trim();
    return !!s && s !== "0" && s.toLowerCase() !== "false";
  }
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
function expandConditionals(input, ctx) {
  const re = /\{\s*if\s+(!)?\s*([a-zA-Z_][\w.]*)\s*\}([\s\S]*?)\{\s*\/if\s*\}/;
  let out = input;
  for (let i = 0; i < 100; i++) {
    const m = out.match(re);
    if (!m) break;
    const negate = m[1] === "!";
    const path = m[2];
    const inner = m[3];
    const v = lookup(ctx, path);
    const keep = truthy(v) !== negate ? inner : "";
    out = out.slice(0, m.index) + keep + out.slice(m.index + m[0].length);
  }
  return out;
}
function expandTokens(input, ctx) {
  return input.replace(/\{\s*([^{}|][^{}]*?)\s*\}/g, (full, raw) => {
    if (/^\s*(if\s+|\/if)/i.test(raw)) return full;
    const { path, filters } = parseExpr(raw);
    const v = lookup(ctx, path);
    const final = applyFilters(v, filters);
    return final == null ? "" : String(final);
  });
}
function renderTemplate(template, ctx = {}) {
  if (template == null) return "";
  let s = String(template);
  s = expandConditionals(s, ctx);
  s = expandTokens(s, ctx);
  return s;
}
function buildBrandContext({ env, settings, post, request, extras, kind } = {}) {
  const pubDate = post?.published_at ? new Date(post.published_at * 1e3) : null;
  const updateDate = post?.modified_at ? new Date(post.modified_at * 1e3) : post?.updated_at ? new Date(post.updated_at * 1e3) : pubDate;
  const body = post?.body_markdown || "";
  const words = body ? body.trim().split(/\s+/).filter(Boolean).length : 0;
  const readingMins = Math.max(1, Math.round(words / 220));
  let host = "";
  try {
    host = request ? new URL(request.url).hostname : new URL(env?.SITE_URL || "").hostname;
  } catch {
    host = "";
  }
  const baseUrl = host ? `https://${host}` : env?.SITE_URL || "";
  const canonical = post?.urlPath ? `${baseUrl}${post.urlPath}` : baseUrl;
  const excerpt = body.replace(/^#+\s*/gm, "").replace(/\[(.*?)\]\(.*?\)/g, "$1").replace(/[*_`>]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
  const brandDomain = (() => {
    try {
      return host || new URL(env?.SITE_URL || "").hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  return {
    // ── post identity ──
    title: post?.title || "",
    slug: post?.slug || "",
    excerpt,
    keywords: post?.keywords || "",
    primary_keyword: post?.primary_query || post?.keyword || "",
    provider: post?.ai_provider || "",
    word_count: words,
    reading_time: `${readingMins} min read`,
    body_chars: body.length,
    // ── dates ──
    // The raw Date is preferred — templates do `{pub_date|date:long}`.
    // pre-formatted aliases below cover the common cases.
    pub_date: pubDate || /* @__PURE__ */ new Date(),
    update_date: updateDate || /* @__PURE__ */ new Date(),
    date: pubDate || /* @__PURE__ */ new Date(),
    // legacy alias
    now: /* @__PURE__ */ new Date(),
    pub_date_long: pubDate ? pubDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "",
    pub_date_short: pubDate ? pubDate.toISOString().slice(0, 10) : "",
    pub_year: pubDate ? String(pubDate.getUTCFullYear()) : "",
    pub_month: pubDate ? pubDate.toLocaleDateString("en-GB", { month: "long" }) : "",
    pub_day: pubDate ? String(pubDate.getUTCDate()) : "",
    pub_dow: pubDate ? pubDate.toLocaleDateString("en-GB", { weekday: "long" }) : "",
    today_long: (/* @__PURE__ */ new Date()).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    today_short: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    year: String((/* @__PURE__ */ new Date()).getUTCFullYear()),
    // ── brand ──
    brand: {
      name: env?.SITE_NAME || settings?.site_name || "this site",
      url: env?.SITE_URL || settings?.site_url || "/",
      domain: brandDomain,
      tagline: settings?.site_tagline || settings?.brand_tagline || "",
      cta: settings?.site_cta || "",
      tone: settings?.brand_voice_tone || settings?.site_tone || "",
      audience: settings?.brand_target_audience || settings?.site_audience || "",
      business_type: settings?.brand_business_type || "",
      service_area: settings?.brand_service_area || "",
      key_themes: settings?.brand_key_themes || "",
      topics_to_avoid: settings?.brand_topics_to_avoid || "",
      logo_url: env?.SITE_LOGO_URL || settings?.brand_logo_url || "",
      primary_color: settings?.brand_primary_color || "#0a0c10",
      accent_color: settings?.brand_accent_color || "#d4af62"
    },
    // ── site ──
    site: {
      host,
      url: baseUrl,
      canonical,
      indexnow_key: settings?.indexnow_key || ""
    },
    // ── booleans ──
    has_image: !!post?.hero_image_key,
    has_logo: !!(env?.SITE_LOGO_URL || settings?.brand_logo_url),
    is_blog: kind === "blog",
    is_programmatic: kind === "programmatic" || kind === "prog",
    ...extras || {}
  };
}
var FILTERS;
var init_template = __esm({
  "_lib/template.js"() {
    init_functionsRoutes_0_09583509623234443();
    FILTERS = {
      upper: /* @__PURE__ */ __name((v) => String(v ?? "").toUpperCase(), "upper"),
      lower: /* @__PURE__ */ __name((v) => String(v ?? "").toLowerCase(), "lower"),
      title: /* @__PURE__ */ __name((v) => String(v ?? "").replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase()), "title"),
      // capitalize ≠ title: only the first letter of the whole string.
      capitalize: /* @__PURE__ */ __name((v) => {
        const s = String(v ?? "");
        return s ? s[0].toUpperCase() + s.slice(1) : "";
      }, "capitalize"),
      truncate: /* @__PURE__ */ __name((v, n) => {
        const s = String(v ?? "");
        const max = parseInt(n, 10) || 60;
        return s.length > max ? s.slice(0, max - 1).trimEnd() + "\u2026" : s;
      }, "truncate"),
      default: /* @__PURE__ */ __name((v, fallback) => {
        const s = String(v ?? "").trim();
        return s ? v : fallback ?? "";
      }, "default"),
      slug: /* @__PURE__ */ __name((v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), "slug"),
      // kebab and snake are common asks (CSS class names, file names).
      kebab: /* @__PURE__ */ __name((v) => String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), "kebab"),
      snake: /* @__PURE__ */ __name((v) => String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), "snake"),
      escape: /* @__PURE__ */ __name((v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]), "escape"),
      trim: /* @__PURE__ */ __name((v) => String(v ?? "").trim(), "trim"),
      // first_word — quick way to extract the first word for a tag chip etc.
      first_word: /* @__PURE__ */ __name((v) => String(v ?? "").trim().split(/\s+/)[0] || "", "first_word"),
      // domain — strip protocol + path from a URL. Useful for footer credit.
      domain: /* @__PURE__ */ __name((v) => {
        try {
          return new URL(String(v ?? "")).hostname.replace(/^www\./, "");
        } catch {
          return String(v ?? "").replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
        }
      }, "domain"),
      // ordinal — turn a number into "1st", "2nd", etc.
      ordinal: /* @__PURE__ */ __name((v) => {
        const n = parseInt(v, 10);
        if (!Number.isFinite(n)) return String(v ?? "");
        const s = ["th", "st", "nd", "rd"];
        const v100 = n % 100;
        return n + (s[(v100 - 20) % 10] || s[v100] || s[0]);
      }, "ordinal"),
      // pad — left-pad with zeros, useful for date components.
      pad: /* @__PURE__ */ __name((v, n) => String(v ?? "").padStart(parseInt(n, 10) || 2, "0"), "pad"),
      // number_format — thousand separators with locale-aware grouping.
      number_format: /* @__PURE__ */ __name((v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n.toLocaleString("en-US") : String(v ?? "");
      }, "number_format"),
      // pluralize — "{n|pluralize:'post'}" → "1 post" / "2 posts".
      // arg can be 'noun' or 'noun:plural' for irregulars.
      pluralize: /* @__PURE__ */ __name((v, arg) => {
        const n = Number(v);
        const [singular, plural] = String(arg || "").split(":");
        const word = Math.abs(n) === 1 ? singular || "" : plural || (singular ? singular + "s" : "");
        return Number.isFinite(n) ? `${n} ${word}` : String(v ?? "");
      }, "pluralize"),
      // replace — '{title|replace:"old:new"}'. Colon-separated to fit the
      // existing single-arg syntax; we split on the first colon.
      replace: /* @__PURE__ */ __name((v, arg) => {
        if (!arg) return String(v ?? "");
        const idx = arg.indexOf(":");
        if (idx < 0) return String(v ?? "");
        const from = arg.slice(0, idx);
        const to = arg.slice(idx + 1);
        return String(v ?? "").split(from).join(to);
      }, "replace"),
      prepend: /* @__PURE__ */ __name((v, s) => (s || "") + String(v ?? ""), "prepend"),
      append: /* @__PURE__ */ __name((v, s) => String(v ?? "") + (s || ""), "append"),
      // read_time — estimate reading time from a body of text. 220wpm is
      // the common content-marketing assumption. arg is the suffix to
      // append (' min read' by default).
      read_time: /* @__PURE__ */ __name((v, arg) => {
        const words = String(v ?? "").trim().split(/\s+/).filter(Boolean).length;
        const mins = Math.max(1, Math.round(words / 220));
        return `${mins}${arg ? arg : " min read"}`;
      }, "read_time"),
      // word_count — explicit count of whitespace-separated tokens.
      word_count: /* @__PURE__ */ __name((v) => {
        return String(v ?? "").trim().split(/\s+/).filter(Boolean).length;
      }, "word_count"),
      date: /* @__PURE__ */ __name((v, fmt) => {
        const d = v ? new Date(v) : /* @__PURE__ */ new Date();
        if (isNaN(d.getTime())) return "";
        const fmt2 = String(fmt || "short");
        if (fmt2 === "long" || fmt2 === "medium") {
          return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
        }
        if (fmt2 === "short") return d.toISOString().slice(0, 10);
        if (fmt2 === "us") {
          return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
        }
        if (fmt2 === "iso") return d.toISOString();
        if (fmt2 === "year") return String(d.getUTCFullYear());
        if (fmt2 === "month") return d.toLocaleDateString("en-GB", { month: "long" });
        if (fmt2 === "day") return String(d.getUTCDate());
        if (fmt2 === "dow") return d.toLocaleDateString("en-GB", { weekday: "long" });
        if (fmt2 === "relative") {
          const diffSec = (Date.now() - d.getTime()) / 1e3;
          const abs = Math.abs(diffSec);
          const past = diffSec >= 0;
          const pick = /* @__PURE__ */ __name((n, unit) => {
            const rounded = Math.round(n);
            const word = unit + (rounded === 1 ? "" : "s");
            return past ? `${rounded} ${word} ago` : `in ${rounded} ${word}`;
          }, "pick");
          if (abs < 60) return past ? "just now" : "in a moment";
          if (abs < 3600) return pick(abs / 60, "minute");
          if (abs < 86400) return pick(abs / 3600, "hour");
          if (abs < 86400 * 30) return pick(abs / 86400, "day");
          if (abs < 86400 * 365) return pick(abs / (86400 * 30), "month");
          return pick(abs / (86400 * 365), "year");
        }
        return fmt2.replace(/YYYY/g, d.getUTCFullYear()).replace(/MM/g, String(d.getUTCMonth() + 1).padStart(2, "0")).replace(/DD/g, String(d.getUTCDate()).padStart(2, "0")).replace(/HH/g, String(d.getUTCHours()).padStart(2, "0")).replace(/mm/g, String(d.getUTCMinutes()).padStart(2, "0")).replace(/DOW/g, d.toLocaleDateString("en-GB", { weekday: "long" }));
      }, "date")
    };
    __name(lookup, "lookup");
    __name(parseExpr, "parseExpr");
    __name(applyFilters, "applyFilters");
    __name(truthy, "truthy");
    __name(expandConditionals, "expandConditionals");
    __name(expandTokens, "expandTokens");
    __name(renderTemplate, "renderTemplate");
    __name(buildBrandContext, "buildBrandContext");
  }
});

// _lib/prices.js
function parseModelsDev(payload) {
  const out = {};
  const providers = payload?.providers || payload;
  if (!providers || typeof providers !== "object") return out;
  for (const [name, map] of Object.entries(MODELS_DEV_MAP)) {
    const p = providers[map.provider];
    const m = p?.models?.[map.model];
    if (!m?.cost) continue;
    const inP = Number(m.cost.input);
    const outP = Number(m.cost.output);
    if (!Number.isFinite(inP) || !Number.isFinite(outP)) continue;
    out[name] = { in: inP, out: outP, image: BUNDLED_PRICES[name]?.image ?? null };
  }
  return out;
}
async function refreshPricesFromModelsDev(env) {
  const r = await fetch("https://models.dev/api.json", {
    headers: { Accept: "application/json" }
  });
  if (!r.ok) throw new Error("models_dev_http_" + r.status);
  const payload = await r.json();
  const live = parseModelsDev(payload);
  const merged = { ...BUNDLED_PRICES };
  for (const [k, v] of Object.entries(live)) merged[k] = v;
  await setSetting(env, "price_cache_json", JSON.stringify({
    fetched_at: nowSec(),
    source: "models.dev",
    prices: merged
  }));
  return { prices: merged, source: "models.dev", fetched_at: nowSec(), count_updated: Object.keys(live).length };
}
async function loadPrices(env) {
  const settings = await loadSettings(env);
  const cached = settings.price_cache_json;
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      const fetched = parsed.fetched_at || 0;
      if (parsed?.prices && nowSec() - fetched < CACHE_STALENESS_SEC) {
        return { prices: parsed.prices, source: parsed.source || "cache", fetched_at: fetched, stale: false };
      }
      if (parsed?.prices) {
        return { prices: parsed.prices, source: parsed.source || "cache", fetched_at: fetched, stale: true };
      }
    } catch {
    }
  }
  return { prices: BUNDLED_PRICES, source: "bundled", fetched_at: 0, stale: false };
}
function priceFor(prices, provider, direction) {
  const row = prices?.[provider];
  if (!row) return 0;
  const v = row[direction];
  return Number.isFinite(v) && v >= 0 ? v : 0;
}
var BUNDLED_PRICES, MODELS_DEV_MAP, CACHE_STALENESS_SEC;
var init_prices = __esm({
  "_lib/prices.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_settings();
    init_util();
    BUNDLED_PRICES = {
      "workers-ai": { in: 0, out: 0, image: 0 },
      "openai": { in: 1.25, out: 10, image: 0.04 },
      // gpt-5
      "anthropic": { in: 10, out: 50, image: null },
      // claude-fable-5
      "gemini": { in: 1.25, out: 10, image: 0.04 },
      // gemini-2.5-pro / imagen-4
      "groq": { in: 0.59, out: 0.79, image: null },
      // llama-3.3-70b
      "deepseek": { in: 0.27, out: 1.1, image: null },
      "mistral": { in: 2, out: 6, image: null },
      // mistral-large
      "together": { in: 0.88, out: 0.88, image: null },
      // llama-3.3-70b
      "cerebras": { in: 0.85, out: 1.2, image: null }
      // llama-3.3-70b
    };
    MODELS_DEV_MAP = {
      "openai": { provider: "openai", model: "gpt-5" },
      "anthropic": { provider: "anthropic", model: "claude-fable-5" },
      "gemini": { provider: "google", model: "gemini-2.5-pro" },
      "groq": { provider: "groq", model: "llama-3.3-70b-versatile" },
      "deepseek": { provider: "deepseek", model: "deepseek-chat" },
      "mistral": { provider: "mistral", model: "mistral-large-latest" },
      "together": { provider: "together", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
      "cerebras": { provider: "cerebras", model: "llama-3.3-70b" }
    };
    CACHE_STALENESS_SEC = 7 * 24 * 3600;
    __name(parseModelsDev, "parseModelsDev");
    __name(refreshPricesFromModelsDev, "refreshPricesFromModelsDev");
    __name(loadPrices, "loadPrices");
    __name(priceFor, "priceFor");
  }
});

// _lib/usage.js
function estimateTokens(text) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(String(text).length / CHARS_PER_TOKEN));
}
function computeCostUSD(prices, { provider, kind, prompt_tokens, completion_tokens }) {
  if (kind === "image") {
    return +priceFor(prices, provider, "image").toFixed(6);
  }
  const inP = priceFor(prices, provider, "in");
  const outP = priceFor(prices, provider, "out");
  return +((prompt_tokens * inP + completion_tokens * outP) / 1e6).toFixed(6);
}
async function recordUsage(env, settings, row) {
  try {
    const { prices } = await loadPrices(env);
    const r = {
      id: newId(),
      project_id: row.project_id || null,
      provider: row.provider || "unknown",
      model: row.model || null,
      kind: row.kind || "text",
      source: row.source || "admin",
      prompt_tokens: row.prompt_tokens | 0,
      completion_tokens: row.completion_tokens | 0,
      total_tokens: (row.prompt_tokens | 0) + (row.completion_tokens | 0),
      estimated: row.estimated ? 1 : 0,
      cost_usd: computeCostUSD(prices, {
        provider: row.provider,
        kind: row.kind,
        prompt_tokens: row.prompt_tokens | 0,
        completion_tokens: row.completion_tokens | 0
      }),
      ok: row.ok === false ? 0 : 1,
      error: row.error ? String(row.error).slice(0, 400) : null,
      created_at: nowSec()
    };
    await env.DB.prepare(
      `INSERT INTO ai_usage (id, project_id, provider, model, kind, source, prompt_tokens,
                              completion_tokens, total_tokens, estimated, cost_usd,
                              ok, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      r.id,
      r.project_id,
      r.provider,
      r.model,
      r.kind,
      r.source,
      r.prompt_tokens,
      r.completion_tokens,
      r.total_tokens,
      r.estimated,
      r.cost_usd,
      r.ok,
      r.error,
      r.created_at
    ).run();
    return r;
  } catch {
    return null;
  }
}
function monthStartTs(now = /* @__PURE__ */ new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  return Math.floor(d.getTime() / 1e3);
}
async function monthSpend(env) {
  const since = monthStartTs();
  const r = await env.DB.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_usage WHERE created_at >= ?`
  ).bind(since).first().catch(() => null);
  return r?.total || 0;
}
async function checkBudget(env, source = "admin") {
  const settings = await loadSettings(env);
  const budget = parseFloat(settings.monthly_budget_usd) || 0;
  const spend = await monthSpend(env);
  const pct = budget > 0 ? +(spend / budget * 100).toFixed(1) : 0;
  if (budget > 0 && spend >= budget && String(source).startsWith("cron")) {
    return {
      allowed: false,
      reason: "budget_exceeded",
      spend,
      budget,
      pct
    };
  }
  return { allowed: true, spend, budget, pct };
}
var CHARS_PER_TOKEN;
var init_usage = __esm({
  "_lib/usage.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_settings();
    init_prices();
    CHARS_PER_TOKEN = 4;
    __name(estimateTokens, "estimateTokens");
    __name(computeCostUSD, "computeCostUSD");
    __name(recordUsage, "recordUsage");
    __name(monthStartTs, "monthStartTs");
    __name(monthSpend, "monthSpend");
    __name(checkBudget, "checkBudget");
  }
});

// _lib/raw_llm.js
async function callRawLLM(env, prompt, {
  sys = DEFAULT_SYS,
  preferredProvider = "",
  kind = "raw-json",
  source = "admin"
} = {}) {
  const overlayed = await vaultedEnv(env);
  const available = (await listProviders(overlayed)).text;
  if (!available.length) throw new Error("no_text_providers_configured");
  const order = preferredProvider && available.includes(preferredProvider) ? [preferredProvider, ...available.filter((p) => p !== preferredProvider)] : available;
  const settings = await loadSettings(env);
  const errs = [];
  for (const name of order) {
    try {
      const { text, model } = await runProvider(overlayed, name, prompt, sys);
      await recordUsage(env, settings, {
        provider: name,
        model,
        prompt_tokens: estimateTokens(prompt),
        completion_tokens: estimateTokens(text),
        estimated: true,
        kind,
        source
      });
      return { provider: name, parsed: looseJsonParse(text), raw: text };
    } catch (e) {
      errs.push(`${name}: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  await recordUsage(env, settings, {
    provider: order[0] || "unknown",
    kind,
    source,
    ok: false,
    error: errs.join(" | ")
  });
  throw new Error("all_providers_failed \u2014 " + errs.join(" | "));
}
async function runProvider(env, name, prompt, sys) {
  switch (name) {
    case "workers-ai": {
      const model = env.WORKERS_AI_TEXT_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
      const r = await env.AI.run(model, {
        messages: [{ role: "system", content: sys }, { role: "user", content: prompt }],
        max_tokens: 4096
      });
      const raw = r?.response ?? r?.result?.response ?? r;
      const text = typeof raw === "string" ? raw : JSON.stringify(raw);
      return { text, model };
    }
    case "openai": {
      const model = env.OPENAI_TEXT_MODEL || "gpt-5";
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, instructions: sys, input: prompt, text: { format: { type: "json_object" } } })
      });
      if (!r.ok) throw new Error("openai_http_" + r.status);
      const d = await r.json();
      if (d.output_text) return { text: d.output_text, model };
      for (const item2 of d.output || []) {
        if (item2.type !== "message") continue;
        for (const c of item2.content || []) if (c.type === "output_text" && c.text) return { text: c.text, model };
      }
      throw new Error("openai_empty");
    }
    case "anthropic": {
      const model = env.ANTHROPIC_TEXT_MODEL || "claude-fable-5";
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 4096, system: sys, messages: [{ role: "user", content: prompt }] })
      });
      if (!r.ok) throw new Error("anthropic_http_" + r.status);
      const d = await r.json();
      return { text: (d.content || []).filter((c) => c.type === "text").map((c) => c.text).join(""), model };
    }
    case "gemini": {
      const model = env.GEMINI_TEXT_MODEL || "gemini-2.5-pro";
      const u = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      const r = await fetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.6 }
        })
      });
      if (!r.ok) throw new Error("gemini_http_" + r.status);
      const d = await r.json();
      return { text: (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""), model };
    }
    case "groq":
    case "deepseek":
    case "mistral":
    case "together":
    case "cerebras": {
      const map = {
        groq: { url: "https://api.groq.com/openai/v1/chat/completions", key: env.GROQ_API_KEY, model: env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile" },
        deepseek: { url: "https://api.deepseek.com/v1/chat/completions", key: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_TEXT_MODEL || "deepseek-chat" },
        mistral: { url: "https://api.mistral.ai/v1/chat/completions", key: env.MISTRAL_API_KEY, model: env.MISTRAL_TEXT_MODEL || "mistral-large-latest" },
        together: { url: "https://api.together.xyz/v1/chat/completions", key: env.TOGETHER_API_KEY, model: env.TOGETHER_TEXT_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
        cerebras: { url: "https://api.cerebras.ai/v1/chat/completions", key: env.CEREBRAS_API_KEY, model: env.CEREBRAS_TEXT_MODEL || "llama-3.3-70b" }
      }[name];
      const r = await fetch(map.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${map.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: map.model,
          messages: [{ role: "system", content: sys }, { role: "user", content: prompt }],
          temperature: 0.6,
          response_format: { type: "json_object" }
        })
      });
      if (!r.ok) throw new Error(`${name}_http_` + r.status);
      const d = await r.json();
      return { text: d?.choices?.[0]?.message?.content || "", model: map.model };
    }
    default:
      throw new Error("unknown_provider: " + name);
  }
}
function looseJsonParse(text) {
  let s = String(text || "").trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  try {
    return JSON.parse(s);
  } catch {
  }
  let out = "", inStr = false, escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = ch.charCodeAt(0);
    if (!inStr) {
      out += ch;
      if (ch === '"') inStr = true;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      out += ch;
      inStr = false;
      continue;
    }
    if (code < 32) {
      out += code === 10 ? "\\n" : code === 13 ? "\\r" : code === 9 ? "\\t" : "\\u" + code.toString(16).padStart(4, "0");
      continue;
    }
    out += ch;
  }
  try {
    return JSON.parse(out);
  } catch {
  }
  let fixed = "", inS = false, esc2 = false;
  for (let i = 0; i < out.length; i++) {
    const ch = out[i];
    if (!inS) {
      fixed += ch;
      if (ch === '"') inS = true;
      continue;
    }
    if (esc2) {
      fixed += ch;
      esc2 = false;
      continue;
    }
    if (ch === "\\") {
      fixed += ch;
      esc2 = true;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < out.length && /\s/.test(out[j])) j++;
      const next = out[j];
      if (next === "," || next === "}" || next === "]" || next === ":") {
        fixed += ch;
        inS = false;
      } else fixed += '\\"';
      continue;
    }
    fixed += ch;
  }
  try {
    return JSON.parse(fixed);
  } catch {
  }
  return JSON.parse(closeTruncated(fixed));
}
function closeTruncated(s) {
  let inS = false, esc2 = false;
  const stack = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inS) {
      if (esc2) esc2 = false;
      else if (ch === "\\") esc2 = true;
      else if (ch === '"') inS = false;
      continue;
    }
    if (ch === '"') {
      inS = true;
      continue;
    }
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let out = esc2 ? s.slice(0, -1) : s;
  if (inS) out += '"';
  while (stack.length) out += stack.pop();
  return out.replace(/,\s*([}\]])/g, "$1");
}
var DEFAULT_SYS;
var init_raw_llm = __esm({
  "_lib/raw_llm.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_ai();
    init_settings();
    init_usage();
    DEFAULT_SYS = "You return strict JSON only \u2014 no markdown fences, no prose outside the braces.";
    __name(callRawLLM, "callRawLLM");
    __name(runProvider, "runProvider");
    __name(looseJsonParse, "looseJsonParse");
    __name(closeTruncated, "closeTruncated");
  }
});

// _lib/secret_vault.js
var secret_vault_exports = {};
__export(secret_vault_exports, {
  decryptValue: () => decryptValue,
  describeKeys: () => describeKeys,
  encryptValue: () => encryptValue,
  envWithVault: () => envWithVault,
  getVaultSecret: () => getVaultSecret,
  setVaultSecret: () => setVaultSecret
});
async function deriveKey(adminToken) {
  const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(adminToken));
  const hashHex = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (cachedKey && cachedTokenHash === hashHex) return cachedKey;
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(adminToken),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  cachedKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: PBKDF2_SALT, iterations: PBKDF2_ITER2, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  cachedTokenHash = hashHex;
  return cachedKey;
}
function toB642(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function fromB642(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function encryptValue(env, plaintext) {
  const adminToken = await getAdminToken(env);
  if (!adminToken) throw new Error("admin_token_missing");
  const key = await deriveKey(adminToken);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  ));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return toB642(out);
}
async function decryptValue(env, packedB64) {
  const adminToken = await getAdminToken(env);
  if (!adminToken) throw new Error("admin_token_missing");
  const key = await deriveKey(adminToken);
  const packed = fromB642(packedB64);
  if (packed.length < IV_BYTES + 16) throw new Error("ciphertext_too_short");
  const iv = packed.slice(0, IV_BYTES);
  const ct = packed.slice(IV_BYTES);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}
async function setVaultSecret(env, name, plaintext) {
  if (!plaintext) {
    await env.DB.prepare("DELETE FROM secrets_vault WHERE key_name = ?").bind(name).run();
    return { deleted: true };
  }
  const ciphertext = await encryptValue(env, plaintext);
  const now = Math.floor(Date.now() / 1e3);
  await env.DB.prepare(
    `INSERT INTO secrets_vault (key_name, ciphertext, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key_name) DO UPDATE SET ciphertext=excluded.ciphertext, updated_at=excluded.updated_at`
  ).bind(name, ciphertext, now).run();
  return { stored: true };
}
async function getVaultSecret(env, name) {
  if (!env?.DB) return void 0;
  const row = await env.DB.prepare("SELECT ciphertext FROM secrets_vault WHERE key_name = ? LIMIT 1").bind(name).first();
  if (!row?.ciphertext) return void 0;
  try {
    return await decryptValue(env, row.ciphertext);
  } catch {
    return void 0;
  }
}
async function envWithVault(env, names) {
  const overlay = { ...env };
  for (const name of names) {
    if (overlay[name] && String(overlay[name]).trim()) continue;
    const v = await getVaultSecret(env, name);
    if (v) overlay[name] = v;
  }
  return overlay;
}
async function describeKeys(env, names) {
  const out = {};
  for (const name of names) {
    if (env?.[name] && String(env[name]).trim()) {
      out[name] = "pages-secret";
      continue;
    }
    const v = await getVaultSecret(env, name);
    out[name] = v ? "vault" : "unset";
  }
  return out;
}
var PBKDF2_SALT, PBKDF2_ITER2, IV_BYTES, cachedKey, cachedTokenHash;
var init_secret_vault = __esm({
  "_lib/secret_vault.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_admin_token();
    PBKDF2_SALT = new TextEncoder().encode("pages-seo:vault:v1");
    PBKDF2_ITER2 = 1e5;
    IV_BYTES = 12;
    __name(deriveKey, "deriveKey");
    __name(toB642, "toB64");
    __name(fromB642, "fromB64");
    __name(encryptValue, "encryptValue");
    __name(decryptValue, "decryptValue");
    __name(setVaultSecret, "setVaultSecret");
    __name(getVaultSecret, "getVaultSecret");
    __name(envWithVault, "envWithVault");
    __name(describeKeys, "describeKeys");
  }
});

// _lib/ai.js
function aliasBlock(aliases) {
  if (!aliases || !Object.keys(aliases).length) return "";
  const rich = /* @__PURE__ */ __name((v) => v && typeof v === "object" && "url" in v ? v : { url: v, description: "", kind: "manual" }, "rich");
  const entries = Object.entries(aliases).map(([k, v]) => [k, rich(v)]);
  const curated = entries.filter(([, v]) => v.kind !== "sitemap");
  const sitemap = entries.filter(([, v]) => v.kind === "sitemap");
  const fmt = /* @__PURE__ */ __name(([k, v]) => `  - "${k}" \u2192 ${v.url}${v.description ? ` \u2014 ${v.description}` : ""}`, "fmt");
  const parts = [
    "Internal link aliases \u2014 use these by their NAME inside markdown links,",
    "e.g. write [Sign up here](signup) and the system expands the URL.",
    "Only link to names listed here; never invent paths.",
    "",
    "Curated links:",
    curated.length ? curated.map(fmt).join("\n") : "  (none yet \u2014 the operator hasn't configured any)"
  ];
  if (sitemap.length) {
    parts.push("");
    parts.push(`Existing pages on this site (you may link to any that genuinely fit the context \u2014 don't force them):`);
    parts.push(sitemap.slice(0, 60).map(fmt).join("\n"));
  }
  parts.push("");
  return parts.join("\n");
}
function voiceBlock(brand2) {
  const tone = brand2?.tone || "plain-spoken expert: direct, knowledgeable, no marketing fluff";
  const audience = brand2?.audience || "someone actively researching this topic, ready to buy or build, not a beginner";
  return [
    `VOICE: ${tone}`,
    `READER: ${audience}`,
    "Write like you're explaining to a smart friend who asked a real question. Short paragraphs.",
    "Vary sentence length (mix 4-word and 25-word sentences). Use contractions. No hedging."
  ].join("\n");
}
function brandDNABlock(brand2) {
  const out = [];
  if (brand2?.business_type) {
    out.push("# Business context");
    out.push(String(brand2.business_type).trim());
    out.push("");
  }
  if (brand2?.key_themes) {
    out.push("# Key themes this brand covers");
    const themes = String(brand2.key_themes).split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    for (const t of themes) out.push(`- ${t}`);
    out.push("");
  }
  if (brand2?.service_area) {
    out.push(`# Service area`);
    out.push(`This brand operates in: ${String(brand2.service_area).trim()}.`);
    out.push("If location-relevant, mention this naturally. Do NOT invent service areas outside it.");
    out.push("");
  }
  if (brand2?.topics_to_avoid) {
    out.push("# DO NOT mention");
    out.push(String(brand2.topics_to_avoid).trim());
    out.push("Treat the above as off-strategy. Skip these topics entirely.");
    out.push("");
  }
  return out.join("\n");
}
function jsonSchemaBlock(primaryQueryHint = "...") {
  return [
    "Return STRICT JSON only \u2014 no markdown fences, no prose outside the braces. Shape:",
    "{",
    `  "primary_query": "${primaryQueryHint}",`,
    '  "secondary_keywords": "kw1, kw2, kw3, kw4, kw5",',
    '  "title": "...",',
    '  "slug": "...",',
    '  "meta_description": "...",',
    '  "body_markdown": "...",',
    '  "hero_image_prompt": "...",',
    '  "hero_image_alt": "..."',
    "}"
  ].join("\n");
}
function expandBrandFields(brand2, extraCtx = {}) {
  if (!brand2) return brand2;
  const ctx = {
    title: extraCtx.title || "",
    primary_keyword: extraCtx.primary_keyword || "",
    date: /* @__PURE__ */ new Date(),
    has_image: !!extraCtx.has_image,
    brand: {
      name: brand2.name,
      url: brand2.url,
      cta: brand2.cta,
      tone: brand2.tone,
      audience: brand2.audience,
      business_type: brand2.business_type,
      service_area: brand2.service_area,
      key_themes: brand2.key_themes,
      topics_to_avoid: brand2.topics_to_avoid
    }
  };
  const exp = /* @__PURE__ */ __name((s) => s == null ? s : renderTemplate(String(s), ctx), "exp");
  return {
    ...brand2,
    cta: exp(brand2.cta),
    tone: exp(brand2.tone),
    audience: exp(brand2.audience),
    business_type: exp(brand2.business_type),
    service_area: exp(brand2.service_area),
    key_themes: exp(brand2.key_themes),
    topics_to_avoid: exp(brand2.topics_to_avoid)
  };
}
function buildArticlePrompt(angle, brand2, opts = {}) {
  brand2 = expandBrandFields(brand2, { title: angle });
  const brandName = brand2?.name || "this site";
  const brandUrl = brand2?.url || "/";
  const cta = brand2?.cta || "Sign up to get started.";
  const aliases = aliasBlock(brand2?.aliases);
  const lang = (brand2?.language || opts.language || "vi").toLowerCase();
  const isVi = lang.startsWith("vi");
  const langInstruction = isVi ? [
    "# NG\xD4N NG\u1EEE B\u1EAET BU\u1ED8C (LANGUAGE REQUIREMENT):",
    "- B\u1EAET BU\u1ED8C vi\u1EBFt to\xE0n b\u1ED9 b\xE0i vi\u1EBFt (Ti\xEAu \u0111\u1EC1, Meta description, H2, H3, FAQ, N\u1ED9i dung, Alt text) HO\xC0N TO\xC0N B\u1EB0NG TI\u1EBENG VI\u1EC6T t\u1EF1 nhi\xEAn, chu\u1EA9n v\u0103n phong chuy\xEAn gia t\u1EA1i Vi\u1EC7t Nam.",
    '- Ri\xEAng "slug" v\xE0 "hero_image_prompt": slug vi\u1EBFt d\u1EA1ng kh\xF4ng d\u1EA5u kebab-case (vi-du-bai-viet), hero_image_prompt vi\u1EBFt b\u1EB1ng ti\u1EBFng Anh \u0111\u1EC3 m\xF4 h\xECnh t\u1EA1o \u1EA3nh hi\u1EC3u \u0111\u01B0\u1EE3c.',
    ""
  ].join("\n") : [
    "# LANGUAGE REQUIREMENT:",
    `- Write the entire article in ${lang.toUpperCase()}.`,
    ""
  ].join("\n");
  const minWords = opts.minWords || 2500;
  const maxWords = opts.maxWords || 4e3;
  const h2Count = maxWords >= 3e3 ? "6-10" : maxWords >= 1800 ? "5-7" : "4-6";
  const faqQs = maxWords >= 3e3 ? "5-8" : "3-5";
  return [
    `# Brief`,
    `You are a senior content writer for ${brandName} (${brandUrl}).`,
    `Today's topic angle: "${angle}"`,
    ``,
    langInstruction,
    brandDNABlock(brand2),
    `# Reader context`,
    voiceBlock(brand2),
    ``,
    aliases,
    `# SEO`,
    "- Pick ONE primary search query \u2014 a real query a user would type in 2026, with commercial intent if possible.",
    "- Pick 5 secondary long-tail keywords, comma-separated, lower-case, no hashtags.",
    "- The primary query MUST appear in: the title (verbatim or very close), the first 100 words, at least one H2, the meta description, and the slug.",
    "- Secondary keywords each appear at least once, woven in naturally.",
    "- Title: 50-70 chars, contains the primary query, written like a real headline not a keyword stuffing.",
    "- Meta description: 140-160 chars, contains the primary query, gives the reader a concrete reason to click.",
    "",
    `# Structure`,
    `- ${minWords}-${maxWords} words total. This is a definitive guide \u2014 write to the upper end of the range. Shorter is a failure mode.`,
    `- Open with a hook paragraph that names the primary query and gives the reader ONE specific takeaway (not a setup like "let's explore...").`,
    `- ${h2Count} H2 sub-headings. Each H2 introduces a single concrete idea, not a generic theme. Develop each H2 with 300-600 words of substance \u2014 examples, specifics, comparisons, numbers.`,
    "- Where useful, add H3 sub-headings under an H2 to organise sub-points.",
    "- Short paragraphs (2-4 sentences). Mix in bullet lists, numbered steps, and short tables where they help \u2014 never as filler.",
    `- One FAQ-style H2 near the end with ${faqQs} specific reader questions and direct answers (2-4 sentences each).`,
    '- Optionally include one "Key takeaways" bullet list near the top OR a short summary box at the end \u2014 never both.',
    '- Close with one short paragraph (3-4 sentences) that links to "' + brandUrl + '" and naturally includes the call-to-action: "' + cta + '"',
    "- Markdown body. No code fences around the whole document.",
    "",
    `# Length enforcement`,
    `- The body_markdown MUST be at least ${minWords} words. Count your own words before returning the JSON. If you finish below ${minWords}, expand the weakest H2 with a concrete example, a numbered list, or a comparison before stopping.`,
    `- Aim for ${Math.round((minWords + maxWords) / 2)} words. Going slightly over is fine; going under is not.`,
    "",
    BANNED_PHRASES_BLOCK,
    "",
    AGENT_MARKUP_HINT,
    "",
    CONCRETENESS_BLOCK,
    "",
    `# Hero image`,
    "hero_image_prompt: a wide cinematic photorealistic concept image suitable as a blog header for this topic. Specific scene, specific lighting, specific composition. No faces, no text overlays.",
    "hero_image_alt: 80-120 chars, descriptive enough that a screen-reader user gets the gist.",
    "",
    `# Output`,
    jsonSchemaBlock(),
    "No prose outside the JSON. Be specific. Be useful. Be the article a real expert would write."
  ].join("\n");
}
function buildProgrammaticPrompt(keyword, brand2, opts = {}) {
  brand2 = expandBrandFields(brand2, { primary_keyword: keyword });
  const brandName = brand2?.name || "this site";
  const brandUrl = brand2?.url || "/";
  const cta = brand2?.cta || "Sign up to get started.";
  const aliases = aliasBlock(brand2?.aliases);
  const lang = (brand2?.language || opts.language || "vi").toLowerCase();
  const isVi = lang.startsWith("vi");
  const langInstruction = isVi ? [
    "# NG\xD4N NG\u1EEE B\u1EAET BU\u1ED8C (LANGUAGE REQUIREMENT):",
    "- B\u1EAET BU\u1ED8C vi\u1EBFt to\xE0n b\u1ED9 trang landing page (Ti\xEAu \u0111\u1EC1, Meta description, H2, FAQ, N\u1ED9i dung) HO\xC0N TO\xC0N B\u1EB0NG TI\u1EBENG VI\u1EC6T t\u1EF1 nhi\xEAn, chu\u1EA9n SEO.",
    '- Ri\xEAng "slug" vi\u1EBFt d\u1EA1ng kh\xF4ng d\u1EA5u kebab-case, "hero_image_prompt" vi\u1EBFt b\u1EB1ng ti\u1EBFng Anh.',
    ""
  ].join("\n") : "";
  return [
    `# Brief`,
    `You are building a programmatic SEO landing page for ${brandName} (${brandUrl}).`,
    `Target keyword (verbatim, this is the search query): "${keyword}"`,
    "This page needs to rank for that exact query and serve the reader who typed it.",
    "",
    langInstruction,
    brandDNABlock(brand2),
    `# Reader context`,
    voiceBlock(brand2),
    "The reader typed this exact keyword into Google. They have a specific question or intent. Address it head-on in the first paragraph \u2014 do NOT bury the answer.",
    "",
    aliases,
    `# Structure`,
    "- 700-1000 words. Markdown body. No code fences.",
    "- Hook paragraph (2-3 sentences) that names the keyword verbatim and gives the reader one concrete answer or commitment.",
    "- 3-5 H2 sub-headings, each introducing one concrete idea relevant to the keyword.",
    "- Short paragraphs (2-4 sentences). 1-2 bullet lists where it helps.",
    "- One H2 with 2-3 reader questions answered directly (FAQ style).",
    '- Close with one paragraph that links to "' + brandUrl + '" and naturally includes the CTA: "' + cta + '"',
    "",
    `# Constraints`,
    "- Title: 50-70 chars, contains the keyword.",
    "- Meta description: 140-160 chars, contains the keyword, summarises the page concretely.",
    "- Slug: kebab-case, derived from the keyword.",
    "",
    BANNED_PHRASES_BLOCK,
    "",
    AGENT_MARKUP_HINT,
    "",
    CONCRETENESS_BLOCK,
    "",
    `# Hero image`,
    'hero_image_prompt: photorealistic concept image directly related to "' + keyword + '". Specific scene, no faces, no text in the image.',
    "hero_image_alt: 80-120 chars.",
    "",
    `# Output`,
    jsonSchemaBlock(keyword)
  ].join("\n");
}
function slugify2(input) {
  return String(input).toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}
function shapeArticle(parsed, providerLabel) {
  if (!parsed?.title || !parsed?.body_markdown) {
    throw new Error("ai_article_missing_fields");
  }
  const slug = slugify2(parsed.slug || parsed.title || "post-" + Date.now());
  const primary = String(parsed.primary_query || "").trim().toLowerCase();
  const secondary = String(parsed.secondary_keywords || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const keywords = Array.from(new Set([primary, ...secondary].filter(Boolean))).slice(0, 10).join(", ");
  return {
    title: String(parsed.title).trim().slice(0, 140),
    slug,
    meta_description: String(parsed.meta_description || "").trim().slice(0, 200),
    body_markdown: String(parsed.body_markdown).trim(),
    hero_image_prompt: String(parsed.hero_image_prompt || "").trim().slice(0, 600),
    hero_image_alt: String(parsed.hero_image_alt || parsed.title).trim().slice(0, 200),
    primary_query: primary,
    keywords,
    ai_provider: providerLabel
  };
}
async function workersAIText(env, prompt) {
  if (!env?.AI) throw new Error("workers_ai_binding_missing");
  const model = env.WORKERS_AI_TEXT_MODEL || WORKERS_AI_TEXT_MODEL;
  const r = await env.AI.run(model, {
    messages: [
      { role: "system", content: SYSTEM_JSON_ONLY },
      { role: "user", content: prompt }
    ],
    // 8192 lets the model write a full 2500-4000-word definitive guide
    // without getting truncated mid-section. 4096 was clipping at ~3000
    // words including the JSON wrapper.
    max_tokens: 8192
  });
  let raw;
  if (r?.choices?.[0]?.message?.content != null) {
    raw = r.choices[0].message.content;
  } else if (r?.response != null) {
    raw = r.response;
  } else if (r?.result?.response != null) {
    raw = r.result.response;
  } else {
    raw = r?.result ?? r;
  }
  let parsed;
  if (raw && typeof raw === "object" && !Array.isArray(raw) && (raw.title || raw.body_markdown || raw.primary_query || raw.pong != null)) {
    parsed = raw;
  } else if (typeof raw === "string" && raw.length) {
    parsed = looseJsonParse(raw);
  } else if (!raw) {
    throw new Error("workers_ai_empty_response");
  } else {
    throw new Error("workers_ai_unexpected_shape: " + JSON.stringify(raw).slice(0, 200));
  }
  const respText = typeof raw === "string" ? raw : JSON.stringify(raw);
  const u = r?.usage || {};
  return {
    parsed,
    usage: {
      provider: "workers-ai",
      model,
      prompt_tokens: u.prompt_tokens || estimateTokens(SYSTEM_JSON_ONLY + prompt),
      completion_tokens: u.completion_tokens || estimateTokens(respText),
      estimated: !u.prompt_tokens
    }
  };
}
async function workersAIImage(env, prompt) {
  if (!env?.AI) throw new Error("workers_ai_binding_missing");
  const model = env.WORKERS_AI_IMAGE_MODEL || WORKERS_AI_IMAGE_MODEL;
  const r = await env.AI.run(model, { prompt });
  const usage = { provider: "workers-ai", model, prompt_tokens: 1, completion_tokens: 0, estimated: true };
  if (r instanceof ReadableStream) {
    const chunks = [];
    const reader = r.getReader();
    let total = 0;
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.length;
    }
    return { bytes: buf, usage };
  }
  if (r instanceof Uint8Array) return { bytes: r, usage };
  if (r?.image) return { bytes: b64ToBytes(r.image), usage };
  throw new Error("workers_ai_image_unexpected_shape");
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function chatCompletion({ provider, url, apiKey, model, prompt, useJsonFormat = true, extraHeaders = {} }) {
  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_JSON_ONLY },
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
    // 8192 lets these providers produce a 2500-4000-word article + JSON
    // wrapper without truncation. Most OpenAI-compatible APIs accept this.
    max_tokens: 8192
  };
  if (useJsonFormat) body.response_format = { type: "json_object" };
  const MAX_RETRIES = 1;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...extraHeaders
      },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      const err = new Error("chat_http_" + r.status + ": " + t.slice(0, 200));
      if (attempt < MAX_RETRIES && (r.status >= 500 || r.status === 429)) {
        continue;
      }
      throw err;
    }
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content || "";
    if (!text) {
      if (attempt < MAX_RETRIES) {
        continue;
      }
      throw new Error("chat_empty");
    }
    const u = data?.usage || {};
    return {
      parsed: looseJsonParse(text),
      usage: {
        provider,
        model,
        prompt_tokens: u.prompt_tokens || estimateTokens(SYSTEM_JSON_ONLY + prompt),
        completion_tokens: u.completion_tokens || estimateTokens(text),
        estimated: !u.prompt_tokens
      }
    };
  }
  throw new Error("chat_failed");
}
function extractOpenAIText(data) {
  if (data?.output_text) return data.output_text;
  for (const item2 of data?.output || []) {
    if (item2?.type !== "message") continue;
    for (const c of item2.content || []) {
      if (c?.type === "output_text" && c.text) return c.text;
    }
  }
  return "";
}
async function openAIText(env, prompt) {
  if (!env?.OPENAI_API_KEY) throw new Error("openai_not_configured");
  const model = env.OPENAI_TEXT_MODEL || OPENAI_TEXT_MODEL;
  const r = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions: SYSTEM_JSON_ONLY,
      input: prompt,
      text: { format: { type: "json_object" } }
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("openai_text_http_" + r.status + ": " + t.slice(0, 200));
  }
  const data = await r.json();
  const text = extractOpenAIText(data);
  if (!text) throw new Error("openai_text_empty");
  const u = data?.usage || {};
  return {
    parsed: looseJsonParse(text),
    usage: {
      provider: "openai",
      model,
      // gpt-5 Responses API exposes input_tokens/output_tokens, not the
      // older Chat API names. Handle both.
      prompt_tokens: u.input_tokens || u.prompt_tokens || estimateTokens(SYSTEM_JSON_ONLY + prompt),
      completion_tokens: u.output_tokens || u.completion_tokens || estimateTokens(text),
      estimated: !(u.input_tokens || u.prompt_tokens)
    }
  };
}
async function openAIImage(env, prompt) {
  if (!env?.OPENAI_API_KEY) throw new Error("openai_not_configured");
  const model = env.OPENAI_IMAGE_MODEL || OPENAI_IMAGE_MODEL;
  const directed = [
    "Photorealistic editorial hero image for a blog header.",
    "Subject: " + prompt,
    "Shot on a 35mm DSLR, natural daylight, shallow depth of field,",
    "soft realistic colour grade, sharp focus on subject.",
    "NOT illustrated, NOT 3D-rendered, NOT cartoon. No text overlays, no logos."
  ].join(" ");
  const r = await fetch(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      prompt: directed,
      size: "1536x1024",
      quality: "high",
      n: 1
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("openai_image_http_" + r.status + ": " + t.slice(0, 200));
  }
  const data = await r.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("openai_image_empty");
  return {
    bytes: b64ToBytes(b64),
    usage: { provider: "openai", model, prompt_tokens: 1, completion_tokens: 0, estimated: true }
  };
}
async function anthropicText(env, prompt) {
  if (!env?.ANTHROPIC_API_KEY) throw new Error("anthropic_not_configured");
  const model = env.ANTHROPIC_TEXT_MODEL || ANTHROPIC_TEXT_MODEL;
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      // 8192 fits a 2500-4000-word article + JSON wrapper without
      // truncation. Fable 5 supports far more; 8k is the sweet spot
      // for cost/latency on long-form articles.
      max_tokens: 8192,
      system: SYSTEM_JSON_ONLY,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("anthropic_http_" + r.status + ": " + t.slice(0, 200));
  }
  const data = await r.json();
  const text = (data?.content || []).filter((c) => c?.type === "text").map((c) => c.text).join("") || "";
  if (!text) throw new Error("anthropic_empty");
  const u = data?.usage || {};
  return {
    parsed: looseJsonParse(text),
    usage: {
      provider: "anthropic",
      model,
      prompt_tokens: u.input_tokens || estimateTokens(SYSTEM_JSON_ONLY + prompt),
      completion_tokens: u.output_tokens || estimateTokens(text),
      estimated: !u.input_tokens
    }
  };
}
async function geminiText(env, prompt) {
  if (!env?.GEMINI_API_KEY) throw new Error("gemini_not_configured");
  const model = env.GEMINI_TEXT_MODEL || GEMINI_TEXT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_JSON_ONLY }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("gemini_http_" + r.status + ": " + t.slice(0, 200));
  }
  const data = await r.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p?.text || "").join("");
  if (!text) throw new Error("gemini_empty");
  const u = data?.usageMetadata || {};
  return {
    parsed: looseJsonParse(text),
    usage: {
      provider: "gemini",
      model,
      prompt_tokens: u.promptTokenCount || estimateTokens(SYSTEM_JSON_ONLY + prompt),
      completion_tokens: u.candidatesTokenCount || estimateTokens(text),
      estimated: !u.promptTokenCount
    }
  };
}
async function geminiImage(env, prompt) {
  if (!env?.GEMINI_API_KEY) throw new Error("gemini_not_configured");
  const model = env.GEMINI_IMAGE_MODEL || GEMINI_IMAGE_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${env.GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: "16:9" }
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("gemini_image_http_" + r.status + ": " + t.slice(0, 200));
  }
  const data = await r.json();
  const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("gemini_image_empty");
  return {
    bytes: b64ToBytes(b64),
    usage: { provider: "gemini", model, prompt_tokens: 1, completion_tokens: 0, estimated: true }
  };
}
async function groqText(env, prompt) {
  if (!env?.GROQ_API_KEY) throw new Error("groq_not_configured");
  return chatCompletion({
    provider: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    apiKey: env.GROQ_API_KEY,
    model: env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile",
    prompt
  });
}
async function deepseekText(env, prompt) {
  if (!env?.DEEPSEEK_API_KEY) throw new Error("deepseek_not_configured");
  return chatCompletion({
    provider: "deepseek",
    url: "https://api.deepseek.com/v1/chat/completions",
    apiKey: env.DEEPSEEK_API_KEY,
    model: env.DEEPSEEK_TEXT_MODEL || "deepseek-chat",
    prompt
  });
}
async function mistralText(env, prompt) {
  if (!env?.MISTRAL_API_KEY) throw new Error("mistral_not_configured");
  return chatCompletion({
    provider: "mistral",
    url: "https://api.mistral.ai/v1/chat/completions",
    apiKey: env.MISTRAL_API_KEY,
    model: env.MISTRAL_TEXT_MODEL || "mistral-large-latest",
    prompt
  });
}
async function togetherText(env, prompt) {
  if (!env?.TOGETHER_API_KEY) throw new Error("together_not_configured");
  return chatCompletion({
    provider: "together",
    url: "https://api.together.xyz/v1/chat/completions",
    apiKey: env.TOGETHER_API_KEY,
    model: env.TOGETHER_TEXT_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    prompt
  });
}
async function cerebrasText(env, prompt) {
  if (!env?.CEREBRAS_API_KEY) throw new Error("cerebras_not_configured");
  return chatCompletion({
    provider: "cerebras",
    url: "https://api.cerebras.ai/v1/chat/completions",
    apiKey: env.CEREBRAS_API_KEY,
    model: env.CEREBRAS_TEXT_MODEL || "llama-3.3-70b",
    prompt
  });
}
async function gurouterText(env, prompt) {
  if (!env?.GUROUTER_API_KEY) throw new Error("gurouter_not_configured");
  const baseUrl = (env?.GUROUTER_BASE_URL || "https://gurouter.com/v1").replace(/\/+$/, "");
  const primaryModel = env?.GUROUTER_TEXT_MODEL || "deepseek/deepseek-v4-flash";
  const fallbackModels = [
    "openai/gpt-4o-mini",
    "anthropic/claude-3.5-sonnet",
    "google/gemini-flash-1.5"
  ].filter((m) => m !== primaryModel);
  let lastErr;
  for (const model of [primaryModel, ...fallbackModels]) {
    try {
      return await chatCompletion({
        provider: "gurouter",
        url: `${baseUrl}/chat/completions`,
        apiKey: env.GUROUTER_API_KEY,
        model,
        prompt
      });
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      const isTransient = /chat_http_5\d\d|chat_empty|chat_http_429/.test(msg);
      if (!isTransient) throw e;
    }
  }
  throw lastErr || new Error("gurouter_all_models_failed");
}
function orderProviders(registry, env, preferred) {
  const available = registry.filter((p) => p.available(env));
  if (!preferred) return available;
  const head = available.filter((p) => p.name === preferred);
  const tail = available.filter((p) => p.name !== preferred);
  return [...head, ...tail];
}
async function withVault(env) {
  const overlay = await envWithVault(env, PROVIDER_SECRET_NAMES);
  try {
    const s = await loadSettings(env);
    if (!overlay.GUROUTER_TEXT_MODEL && s.gurouter_text_model && String(s.gurouter_text_model).trim()) {
      overlay.GUROUTER_TEXT_MODEL = String(s.gurouter_text_model).trim();
    }
  } catch {
  }
  return overlay;
}
async function listProviders(env) {
  const overlayed = await withVault(env);
  return {
    text: TEXT_PROVIDERS.filter((p) => p.available(overlayed)).map((p) => p.name),
    image: IMAGE_PROVIDERS.filter((p) => p.available(overlayed)).map((p) => p.name)
  };
}
async function generateContent(env, { kind, seed, provider, brand: brand2, source = "admin", projectId = null }) {
  const overlayed = await withVault(env);
  const settings = await loadSettings(env);
  const minWords = Math.max(300, parseInt(settings.article_min_words, 10) || 2500);
  const maxWords = Math.max(minWords + 100, parseInt(settings.article_max_words, 10) || 4e3);
  const prompt = kind === "programmatic" ? buildProgrammaticPrompt(seed, brand2) : buildArticlePrompt(seed, brand2, { minWords, maxWords });
  const order = orderProviders(TEXT_PROVIDERS, overlayed, provider);
  if (!order.length) throw new Error("no_text_providers_configured");
  const errs = [];
  for (const p of order) {
    try {
      const out = await p.call(overlayed, prompt);
      if (out?.usage) {
        await recordUsage(env, settings, {
          ...out.usage,
          kind: kind === "programmatic" ? "prog-text" : "blog-text",
          source,
          project_id: projectId
        });
      }
      return shapeArticle(out.parsed, p.name);
    } catch (e) {
      errs.push(`${p.name}: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  await recordUsage(env, settings, {
    provider: order[0]?.name || "unknown",
    kind: kind === "programmatic" ? "prog-text" : "blog-text",
    source,
    ok: false,
    error: errs.join(" | "),
    project_id: projectId
  });
  throw new Error("all_text_providers_failed \u2014 " + errs.join(" | "));
}
async function generateImage(env, { prompt, provider, source = "admin", projectId = null }) {
  if (!prompt) throw new Error("image_prompt_empty");
  const overlayed = await withVault(env);
  const settings = await loadSettings(env);
  const order = orderProviders(IMAGE_PROVIDERS, overlayed, provider);
  if (!order.length) throw new Error("no_image_providers_configured");
  const errs = [];
  for (const p of order) {
    try {
      const out = await p.call(overlayed, prompt);
      if (out?.usage) {
        await recordUsage(env, settings, { ...out.usage, kind: "image", source, project_id: projectId });
      }
      return { bytes: out.bytes, ai_provider: p.name };
    } catch (e) {
      errs.push(`${p.name}: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  await recordUsage(env, settings, {
    provider: order[0]?.name || "unknown",
    kind: "image",
    source,
    ok: false,
    error: errs.join(" | "),
    project_id: projectId
  });
  throw new Error("all_image_providers_failed \u2014 " + errs.join(" | "));
}
async function vaultedEnv(env) {
  return withVault(env);
}
async function pingTextProvider(env, name) {
  const overlayed = await withVault(env);
  const p = TEXT_PROVIDERS.find((x) => x.name === name);
  if (!p) return { ok: false, error: "unknown_provider", detail: `no provider named ${name}` };
  if (!p.available(overlayed)) return { ok: false, error: "not_configured", detail: `${name} has no key or binding` };
  const started = Date.now();
  try {
    const prompt = 'Return a JSON object: {"pong": true}. No other text.';
    const out = await p.call(overlayed, prompt);
    const ms = Date.now() - started;
    const obj = out?.parsed ?? out;
    const sample = typeof obj === "string" ? obj.slice(0, 200) : JSON.stringify(obj).slice(0, 200);
    return { ok: true, ms, sample };
  } catch (e) {
    const ms = Date.now() - started;
    return {
      ok: false,
      ms,
      error: "call_failed",
      detail: String(e?.message || e).slice(0, 240)
    };
  }
}
var BANNED_PHRASES_BLOCK, CONCRETENESS_BLOCK, AGENT_MARKUP_HINT, SYSTEM_JSON_ONLY, WORKERS_AI_TEXT_MODEL, WORKERS_AI_IMAGE_MODEL, OPENAI_RESPONSES_URL, OPENAI_IMAGES_URL, OPENAI_TEXT_MODEL, OPENAI_IMAGE_MODEL, ANTHROPIC_URL, ANTHROPIC_TEXT_MODEL, GEMINI_TEXT_MODEL, GEMINI_IMAGE_MODEL, TEXT_PROVIDERS, IMAGE_PROVIDERS, PROVIDER_SECRET_NAMES;
var init_ai = __esm({
  "_lib/ai.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_template();
    init_raw_llm();
    init_usage();
    init_secret_vault();
    init_usage();
    init_settings();
    __name(aliasBlock, "aliasBlock");
    BANNED_PHRASES_BLOCK = [
      "BANNED PHRASES \u2014 never use these or any close variant:",
      `  - "in today's fast-paced", "in today's digital landscape", "in today's world"`,
      '  - "elevate", "unlock", "leverage", "delve into", "navigate the complexities"',
      '  - "in conclusion", "to wrap up", "all in all"',
      '  - "game-changer", "cutting-edge", "state-of-the-art", "next-level"',
      '  - "robust", "seamless", "innovative", "revolutionary"',
      `  - "it's important to note", "it's worth mentioning", "it goes without saying"`,
      `  - "whether you're a beginner or", "no matter your skill level"`,
      '  - "ultimate guide", "comprehensive overview", "definitive resource"',
      '  - opening with "Are you...", "Have you ever...", "Imagine if..."',
      "  - any sentence that could appear in any article about any topic"
    ].join("\n");
    CONCRETENESS_BLOCK = [
      "CONCRETENESS RULES (this is the #1 thing \u2014 most AI writing fails here):",
      "  - Every paragraph must contain at least one specific number, brand name, year, price,",
      '    measurement, or named example. No "many people" \u2014 say "37% of buyers". No "a long time"',
      '    \u2014 say "since 2019". No "high-quality materials" \u2014 say "Carrara marble" or "Italian leather".',
      '  - When you make a claim, ground it: name the source ("according to Statista"),',
      "    cite the year, or give a real example.",
      "  - Use real product/brand/place names where relevant. Be specific. If you don't know a real one,",
      "    use a plausibly-real-sounding one rather than a generic placeholder.",
      '  - Comparisons must be quantified. Not "more expensive" but "around 2.3\xD7 the price".'
    ].join("\n");
    __name(voiceBlock, "voiceBlock");
    AGENT_MARKUP_HINT = [
      "BODY MARKUP (optional, additive to Markdown):",
      "  /.box.amber./ Important highlight /./  \u2192 amber-bordered callout box",
      "  /.box./ Standard pull-out /./          \u2192 plain bordered box",
      "  /.callout./ Side note /./              \u2192 left-bordered aside",
      "  /.divider./                            \u2192 horizontal rule",
      "  Standard Markdown (# heading, **bold**, lists) still works for everything else.",
      "  Use boxes/callouts sparingly \u2014 at most one per post, only when the content really benefits."
    ].join("\n");
    __name(brandDNABlock, "brandDNABlock");
    __name(jsonSchemaBlock, "jsonSchemaBlock");
    __name(expandBrandFields, "expandBrandFields");
    __name(buildArticlePrompt, "buildArticlePrompt");
    __name(buildProgrammaticPrompt, "buildProgrammaticPrompt");
    __name(slugify2, "slugify");
    __name(shapeArticle, "shapeArticle");
    SYSTEM_JSON_ONLY = "You return strict JSON only. No prose outside the JSON.";
    WORKERS_AI_TEXT_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
    WORKERS_AI_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
    __name(workersAIText, "workersAIText");
    __name(workersAIImage, "workersAIImage");
    __name(b64ToBytes, "b64ToBytes");
    __name(chatCompletion, "chatCompletion");
    OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
    OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
    OPENAI_TEXT_MODEL = "gpt-5";
    OPENAI_IMAGE_MODEL = "gpt-image-1";
    __name(extractOpenAIText, "extractOpenAIText");
    __name(openAIText, "openAIText");
    __name(openAIImage, "openAIImage");
    ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
    ANTHROPIC_TEXT_MODEL = "claude-fable-5";
    __name(anthropicText, "anthropicText");
    GEMINI_TEXT_MODEL = "gemini-2.5-pro";
    GEMINI_IMAGE_MODEL = "imagen-4.0-generate-001";
    __name(geminiText, "geminiText");
    __name(geminiImage, "geminiImage");
    __name(groqText, "groqText");
    __name(deepseekText, "deepseekText");
    __name(mistralText, "mistralText");
    __name(togetherText, "togetherText");
    __name(cerebrasText, "cerebrasText");
    __name(gurouterText, "gurouterText");
    TEXT_PROVIDERS = [
      { name: "workers-ai", available: /* @__PURE__ */ __name((e) => !!e?.AI, "available"), call: workersAIText },
      { name: "gurouter", available: /* @__PURE__ */ __name((e) => !!e?.GUROUTER_API_KEY, "available"), call: gurouterText },
      { name: "openai", available: /* @__PURE__ */ __name((e) => !!e?.OPENAI_API_KEY, "available"), call: openAIText },
      { name: "anthropic", available: /* @__PURE__ */ __name((e) => !!e?.ANTHROPIC_API_KEY, "available"), call: anthropicText },
      { name: "gemini", available: /* @__PURE__ */ __name((e) => !!e?.GEMINI_API_KEY, "available"), call: geminiText },
      { name: "groq", available: /* @__PURE__ */ __name((e) => !!e?.GROQ_API_KEY, "available"), call: groqText },
      { name: "deepseek", available: /* @__PURE__ */ __name((e) => !!e?.DEEPSEEK_API_KEY, "available"), call: deepseekText },
      { name: "mistral", available: /* @__PURE__ */ __name((e) => !!e?.MISTRAL_API_KEY, "available"), call: mistralText },
      { name: "together", available: /* @__PURE__ */ __name((e) => !!e?.TOGETHER_API_KEY, "available"), call: togetherText },
      { name: "cerebras", available: /* @__PURE__ */ __name((e) => !!e?.CEREBRAS_API_KEY, "available"), call: cerebrasText }
    ];
    IMAGE_PROVIDERS = [
      { name: "workers-ai", available: /* @__PURE__ */ __name((e) => !!e?.AI, "available"), call: workersAIImage },
      { name: "openai", available: /* @__PURE__ */ __name((e) => !!e?.OPENAI_API_KEY, "available"), call: openAIImage },
      { name: "gemini", available: /* @__PURE__ */ __name((e) => !!e?.GEMINI_API_KEY, "available"), call: geminiImage }
    ];
    __name(orderProviders, "orderProviders");
    PROVIDER_SECRET_NAMES = [
      "GUROUTER_API_KEY",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GEMINI_API_KEY",
      "GROQ_API_KEY",
      "DEEPSEEK_API_KEY",
      "MISTRAL_API_KEY",
      "TOGETHER_API_KEY",
      "CEREBRAS_API_KEY",
      // Model overrides
      "WORKERS_AI_TEXT_MODEL",
      "ANTHROPIC_TEXT_MODEL",
      "OPENAI_TEXT_MODEL",
      "GEMINI_TEXT_MODEL",
      "GUROUTER_TEXT_MODEL",
      "GROQ_TEXT_MODEL",
      "DEEPSEEK_TEXT_MODEL",
      "MISTRAL_TEXT_MODEL",
      "TOGETHER_TEXT_MODEL",
      "CEREBRAS_TEXT_MODEL"
    ];
    __name(withVault, "withVault");
    __name(listProviders, "listProviders");
    __name(generateContent, "generateContent");
    __name(generateImage, "generateImage");
    __name(vaultedEnv, "vaultedEnv");
    __name(pingTextProvider, "pingTextProvider");
  }
});

// api/admin/blog/image.js
function sniffImageFormat(bytes) {
  if (bytes?.length > 2 && bytes[0] === 255 && bytes[1] === 216) return { ext: "jpg", type: "image/jpeg" };
  if (bytes?.length > 11 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return { ext: "webp", type: "image/webp" };
  return { ext: "png", type: "image/png" };
}
var onRequestPost5;
var init_image = __esm({
  "api/admin/blog/image.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_ai();
    init_settings();
    __name(sniffImageFormat, "sniffImageFormat");
    onRequestPost5 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const jobId = String(body.job_id || "");
      if (!jobId) return json(400, { error: "missing_job_id" });
      const job = await env.DB.prepare("SELECT * FROM blog_jobs WHERE id = ? LIMIT 1").bind(jobId).first();
      if (!job) return json(404, { error: "job_not_found" });
      if (["image_done", "published"].includes(job.status)) {
        return json(200, { ok: true, job_id: jobId, status: job.status, idempotent: true });
      }
      if (job.status !== "text_done") {
        return json(409, { error: "wrong_state", current: job.status, hint: "call /text first" });
      }
      if (!job.hero_image_prompt) {
        await env.DB.prepare("UPDATE blog_jobs SET status='image_done', updated_at=? WHERE id=?").bind(nowSec(), jobId).run();
        return json(200, { ok: true, job_id: jobId, status: "image_done", image_skipped: true });
      }
      let imageKey = null;
      let imageError = null;
      let imageProvider = null;
      let mode = "ai";
      try {
        const settings = await loadSettings(env);
        mode = String(settings?.hero_image_mode || "ai").toLowerCase() === "cover" ? "cover" : "ai";
      } catch {
      }
      let didRenderViaCover = false;
      if (mode === "cover") {
        try {
          const tplRow = await env.DB.prepare(
            "SELECT id, name FROM cover_templates WHERE is_default = 1 LIMIT 1"
          ).first();
          if (tplRow?.id) {
            imageProvider = "cover-template:" + (tplRow.name || tplRow.id);
            didRenderViaCover = true;
          }
        } catch (e) {
          imageError = "cover_lookup_failed: " + String(e?.message || e).slice(0, 200);
        }
      }
      if (!didRenderViaCover) {
        try {
          const source = request.headers.get("X-Source-Cron") === "1" ? "cron-blog" : "admin-blog";
          const r = await generateImage(env, { prompt: job.hero_image_prompt, provider: body.provider, source, projectId: job.project_id || null });
          imageProvider = r.ai_provider;
          const fmt = sniffImageFormat(r.bytes);
          imageKey = `${job.slug}-${Date.now()}.${fmt.ext}`;
          if (!env.IMAGES) throw new Error("r2_binding_missing");
          await env.IMAGES.put(imageKey, r.bytes, {
            httpMetadata: { contentType: fmt.type, cacheControl: "public, max-age=31536000, immutable" }
          });
        } catch (e) {
          imageError = String(e.message || e).slice(0, 800);
          imageKey = null;
        }
      }
      await env.DB.prepare(
        `UPDATE blog_jobs SET status='image_done', hero_image_key=?, error=?, updated_at=? WHERE id=?`
      ).bind(imageKey, imageError ? "image:" + imageError : null, nowSec(), jobId).run();
      return json(200, {
        ok: true,
        job_id: jobId,
        status: "image_done",
        image_uploaded: !!imageKey,
        image_error: imageError,
        image_provider: imageProvider
      });
    }, "onRequestPost");
  }
});

// api/admin/blog/jobs.js
var onRequestGet2;
var init_jobs = __esm({
  "api/admin/blog/jobs.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    onRequestGet2 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      const activeProjectId = tenant?.activeProjectId || null;
      let query = `SELECT id, status, topic_key, slug, title, hero_image_key, ai_provider,
            error, created_at, updated_at, project_id
       FROM blog_jobs
      WHERE status != 'published'`;
      const args = [];
      if (activeProjectId) {
        query += ` AND project_id = ?`;
        args.push(activeProjectId);
      }
      query += ` ORDER BY updated_at DESC LIMIT 50`;
      const stmt = args.length ? env.DB.prepare(query).bind(...args) : env.DB.prepare(query);
      const r = await stmt.all();
      return json(200, {
        jobs: r.results || [],
        project_id: activeProjectId,
        project_slug: tenant?.activeProjectSlug || null
      });
    }, "onRequestGet");
  }
});

// api/admin/blog/list.js
var onRequestGet3;
var init_list = __esm({
  "api/admin/blog/list.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    onRequestGet3 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      const activeProjectId = tenant?.activeProjectId || null;
      let query = `SELECT id, slug, title, status, hero_image_key, keywords, ai_provider,
            published_at, hidden_at, project_id
       FROM blog_posts`;
      const args = [];
      if (activeProjectId) {
        query += ` WHERE project_id = ?`;
        args.push(activeProjectId);
      }
      query += ` ORDER BY published_at DESC LIMIT 200`;
      const stmt = args.length ? env.DB.prepare(query).bind(...args) : env.DB.prepare(query);
      const r = await stmt.all();
      return json(200, {
        posts: r.results || [],
        project_id: activeProjectId,
        project_slug: tenant?.activeProjectSlug || null
      });
    }, "onRequestGet");
  }
});

// api/admin/blog/post.js
var onRequestPost6;
var init_post = __esm({
  "api/admin/blog/post.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    onRequestPost6 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const id = String(body.id || "").trim();
      const action = String(body.action || "").trim();
      if (!id || !action) return json(400, { error: "missing_fields" });
      const owned = pid ? await env.DB.prepare(
        "SELECT id, slug, hero_image_key, status FROM blog_posts WHERE id=? AND project_id=? LIMIT 1"
      ).bind(id, pid).first() : await env.DB.prepare(
        "SELECT id, slug, hero_image_key, status FROM blog_posts WHERE id=? LIMIT 1"
      ).bind(id).first();
      if (!owned) return json(404, { error: "not_found" });
      const post = owned;
      const t = nowSec();
      if (action === "hide") {
        await env.DB.prepare("UPDATE blog_posts SET status='hidden', hidden_at=? WHERE id=?").bind(t, id).run();
        return json(200, { ok: true, status: "hidden" });
      }
      if (action === "show") {
        await env.DB.prepare("UPDATE blog_posts SET status='published', hidden_at=NULL WHERE id=?").bind(id).run();
        return json(200, { ok: true, status: "published" });
      }
      if (action === "delete") {
        const user = auth.userId ? await env.DB.prepare("SELECT plan_tier, role FROM users WHERE id=?").bind(auth.userId).first().catch(() => null) : null;
        const isFree = (user?.plan_tier || auth.plan_tier) === "free" && auth.role !== "super_admin";
        if (isFree) {
          return json(403, {
            error: "free_tier_delete_disabled",
            detail: "T\xE0i kho\u1EA3n g\xF3i Free kh\xF4ng c\xF3 quy\u1EC1n x\xF3a b\xE0i vi\u1EBFt blog. Vui l\xF2ng n\xE2ng c\u1EA5p g\xF3i \u0111\u1EC3 qu\u1EA3n l\xFD n\xE2ng cao."
          });
        }
        if (post.hero_image_key && env.IMAGES) await env.IMAGES.delete(post.hero_image_key).catch(() => {
        });
        await env.DB.prepare("DELETE FROM blog_posts WHERE id=?").bind(id).run();
        return json(200, { ok: true, deleted: true });
      }
      return json(400, { error: "unknown_action" });
    }, "onRequestPost");
  }
});

// _lib/topics.js
async function pickNextTopic(env, { cooldownDays = 60, categoryCooldownDays = 7 } = {}) {
  const now = Math.floor(Date.now() / 1e3);
  const cutoff = now - cooldownDays * 86400;
  const usedRows = await env.DB.prepare(
    "SELECT topic_key, last_used_at FROM blog_topic_usage"
  ).all().catch(() => ({ results: [] }));
  const usedMap = new Map((usedRows.results || []).map((r) => [r.topic_key, r.last_used_at]));
  const catCutoff = now - categoryCooldownDays * 86400;
  const recentRows = await env.DB.prepare(
    `SELECT topic_seed, published_at FROM blog_posts
      WHERE status='published' AND published_at >= ?
      ORDER BY published_at DESC LIMIT 50`
  ).bind(catCutoff).all().catch(() => ({ results: [] }));
  const topicToCategory = new Map(TOPICS.map((t) => [t.key, t.category]));
  const recentCategories = /* @__PURE__ */ new Set();
  for (const r of recentRows.results || []) {
    const cat = topicToCategory.get(r.topic_seed);
    if (cat) recentCategories.add(cat);
  }
  const eligible = TOPICS.filter((t) => {
    const last = usedMap.get(t.key);
    return !last || last < cutoff;
  });
  if (!eligible.length) return TOPICS[Math.floor(Math.random() * TOPICS.length)];
  const fresh = eligible.filter((t) => !recentCategories.has(t.category));
  const pool = fresh.length ? fresh : eligible;
  return pool[Math.floor(Math.random() * pool.length)];
}
async function markTopicUsed(env, topicKey) {
  const now = Math.floor(Date.now() / 1e3);
  await env.DB.prepare(
    `INSERT INTO blog_topic_usage (topic_key, last_used_at, times_used)
     VALUES (?, ?, 1)
     ON CONFLICT(topic_key) DO UPDATE SET
       last_used_at = excluded.last_used_at,
       times_used = blog_topic_usage.times_used + 1`
  ).bind(topicKey, now).run();
}
var TOPICS;
var init_topics = __esm({
  "_lib/topics.js"() {
    init_functionsRoutes_0_09583509623234443();
    TOPICS = [
      // ── on-page (writing for readers + Google) ─────────────────────
      { key: "on-page-seo-2026", category: "on-page", angle: "On-page SEO basics in 2026 \u2014 what still matters, what doesn't, and a checklist a small site can actually use." },
      { key: "meta-descriptions", category: "on-page", angle: "Meta descriptions that increase CTR \u2014 what works in 2026 with Google rewriting half of them anyway." },
      { key: "titles-that-rank", category: "on-page", angle: "Page titles that rank and get clicked \u2014 formula breakdown plus 5 ready-to-adapt templates." },
      { key: "thin-content", category: "on-page", angle: "Thin content \u2014 exact thresholds Google flags in 2026 and how to thicken without padding." },
      { key: "helpful-content", category: "on-page", angle: "Surviving Google's helpful-content updates \u2014 patterns the algorithm flags and how to write outside them." },
      { key: "eeat", category: "on-page", angle: "Google's E-E-A-T in 2026 \u2014 what it actually means for solo creators and how to demonstrate experience." },
      // ── technical (crawl, index, render) ────────────────────────────
      { key: "core-web-vitals", category: "technical", angle: "Core Web Vitals in 2026 \u2014 practical thresholds and how to hit them on a Cloudflare-hosted site." },
      { key: "sitemap-best-practice", category: "technical", angle: "Sitemap best practices for small sites \u2014 what to include, what to leave out, and how often to ping IndexNow." },
      { key: "schema-org", category: "technical", angle: "Schema.org structured data \u2014 which types are worth adding for a content site and which are overkill." },
      { key: "canonical-tags", category: "technical", angle: "Canonical tag mistakes that quietly kill rankings \u2014 how to audit yours in 10 minutes." },
      { key: "redirects-301", category: "technical", angle: "301 vs 302 redirects in 2026 \u2014 when each preserves link equity and the audit checklist for site moves." },
      { key: "robots-txt", category: "technical", angle: "robots.txt for content sites \u2014 the directives that matter and the legacy ones that don't." },
      { key: "page-speed", category: "technical", angle: "Page speed for content sites \u2014 the small tweaks that move the needle vs the busy-work that doesn't." },
      { key: "image-seo", category: "technical", angle: "Image SEO \u2014 formats, dimensions, alt text, and lazy-loading rules that actually affect rankings." },
      { key: "crawl-budget", category: "technical", angle: "Crawl budget for small sites \u2014 when it matters and the 2 fixes that cover 90% of cases." },
      { key: "noindex-strategy", category: "technical", angle: "When to noindex \u2014 categories of pages most small sites should keep out of Google's index." },
      { key: "sitemap-priority", category: "technical", angle: "Sitemap priority and changefreq \u2014 what Google actually does with these values in 2026." },
      { key: "pagination-seo", category: "technical", angle: "Pagination, infinite scroll and rel=next \u2014 what Google still respects and what it ignores." },
      { key: "mobile-first", category: "technical", angle: "Mobile-first indexing now that desktop is a legacy crawl \u2014 the testing routine for small sites." },
      { key: "duplicate-content", category: "technical", angle: "Duplicate content myths \u2014 what actually causes ranking issues vs what doesn't in 2026." },
      { key: "hreflang", category: "technical", angle: "Hreflang done right for multi-region sites \u2014 the 3 mistakes that quietly break it." },
      // ── content (strategy + planning) ──────────────────────────────
      { key: "content-clusters", category: "content", angle: "Topic clusters and pillar pages \u2014 how to structure a content site so Google understands you cover a theme." },
      { key: "topic-authority", category: "content", angle: "Building topic authority \u2014 why focused sites outrank generalists in 2026." },
      { key: "content-refresh", category: "content", angle: "Refreshing old content \u2014 the simple update process that often beats publishing new posts." },
      { key: "long-tail-strategy", category: "content", angle: "Long-tail keyword strategy for new sites \u2014 why long-tails are the only realistic target in year one." },
      { key: "keyword-research-cheap", category: "content", angle: "Free keyword research workflow \u2014 building a 100-keyword list without paying for Ahrefs or Semrush." },
      { key: "first-100-visits", category: "content", angle: "Getting your first 100 search visits \u2014 the realistic 90-day plan for a brand-new domain." },
      { key: "json-ld-faq", category: "content", angle: "FAQ schema in 2026 \u2014 when Google still shows it in SERPs and whether to bother adding it." },
      // ── links (internal + outbound) ────────────────────────────────
      { key: "internal-linking", category: "links", angle: "Internal linking patterns that compound \u2014 turning every new post into a link upgrade for old ones." },
      { key: "backlink-basics", category: "links", angle: "Backlinks in 2026 \u2014 what kinds Google still values, what it discounts, and how to earn the good ones." },
      // ── off-page (search engines + SERP features) ──────────────────
      { key: "serp-features", category: "off-page", angle: "SERP features in 2026 \u2014 featured snippets, People Also Ask, AI Overviews, and what each is worth." },
      { key: "ai-overviews", category: "off-page", angle: "Ranking inside Google AI Overviews \u2014 what kinds of content get pulled and how to format for it." },
      { key: "voice-search", category: "off-page", angle: "Voice search SEO in 2026 \u2014 quietly important again as smart-home assistants improve." },
      { key: "local-seo", category: "off-page", angle: "Local SEO for service businesses \u2014 Google Business Profile, citations, and reviews that move rankings." },
      { key: "youtube-seo", category: "off-page", angle: "YouTube SEO basics \u2014 titles, descriptions, chapters, and the role of comment engagement." },
      { key: "social-signals", category: "off-page", angle: "Social signals and SEO \u2014 what Google says vs what correlational data actually shows." },
      // ── analytics (measurement) ────────────────────────────────────
      { key: "analytics-without-cookies", category: "analytics", angle: "Privacy-friendly analytics in 2026 \u2014 options that don't need a cookie banner." },
      { key: "indexing-issues", category: "analytics", angle: "When Google won't index your pages \u2014 diagnosing crawl, index, and quality issues in Search Console." },
      { key: "gsc-essentials", category: "analytics", angle: "Google Search Console essentials \u2014 the 5 reports a small site owner should check every week." },
      { key: "ranking-decay", category: "analytics", angle: "Why rankings decay \u2014 common causes and the simple monthly hygiene that prevents most of them." },
      // ── platform (CMS / infra choices) ─────────────────────────────
      { key: "cms-choice-seo", category: "platform", angle: "Choosing a CMS for SEO \u2014 WordPress vs Webflow vs static-site generators in 2026." },
      { key: "cloudflare-pages-seo", category: "platform", angle: "SEO on Cloudflare Pages \u2014 edge caching, headers, and what Google's renderer actually sees." },
      { key: "indexnow-explained", category: "platform", angle: "IndexNow explained \u2014 what it does, what it doesn't, and the realistic time-to-index gain." },
      { key: "amp-is-dead", category: "platform", angle: "AMP in 2026 \u2014 is it really dead, and what replaced the speed wins it gave smaller sites." },
      { key: "image-cdns", category: "platform", angle: "Image CDNs and Core Web Vitals \u2014 when Cloudflare Images / R2 + transforms actually beat hand-tuning." },
      // ── ai (the elephant in the room) ──────────────────────────────
      { key: "programmatic-seo", category: "ai", angle: "Programmatic SEO done well in 2026 \u2014 when it works, when it gets penalised, and the line between scale and spam." },
      { key: "ai-content-strategy", category: "ai", angle: "AI-generated content strategy that doesn't get penalised \u2014 the editing layer that separates ranking sites from spam." }
    ];
    __name(pickNextTopic, "pickNextTopic");
    __name(markTopicUsed, "markTopicUsed");
  }
});

// _lib/indexnow_key.js
async function getIndexNowKey(env) {
  if (env?.[CACHE_KEY2]) return env[CACHE_KEY2];
  const fromPagesSecret = env?.INDEXNOW_KEY && String(env.INDEXNOW_KEY).trim();
  if (fromPagesSecret) {
    try {
      env[CACHE_KEY2] = fromPagesSecret;
    } catch {
    }
    return fromPagesSecret;
  }
  if (!env?.DB) return "";
  try {
    const s = await loadSettings(env);
    const k = String(s?.indexnow_key || "").trim();
    if (k) {
      try {
        env[CACHE_KEY2] = k;
      } catch {
      }
      return k;
    }
  } catch {
  }
  return "";
}
var CACHE_KEY2;
var init_indexnow_key = __esm({
  "_lib/indexnow_key.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_settings();
    CACHE_KEY2 = "__ps_indexnow_key_cache";
    __name(getIndexNowKey, "getIndexNowKey");
  }
});

// _lib/indexnow.js
async function getHost(env, request) {
  if (request) try {
    return new URL(request.url).hostname;
  } catch {
  }
  const id = await getSiteIdentity(env);
  if (id?.url) try {
    return new URL(id.url).hostname;
  } catch {
  }
  return null;
}
async function pingIndexNow(env, urls, request = null, hostOverride = null) {
  const key = await getIndexNowKey(env);
  if (!key) return { ok: false, error: "indexnow_not_configured" };
  if (!urls || !urls.length) return { ok: false, error: "no_urls" };
  const host = hostOverride || await getHost(env, request);
  if (!host) return { ok: false, error: "no_host" };
  const r = await fetch(INDEXNOW_URL, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host,
      key,
      keyLocation: `https://${host}/${key}.txt`,
      urlList: urls.slice(0, 1e4)
    })
  });
  const body = await r.text().catch(() => "");
  const isRateLimit = r.status === 429;
  return { ok: r.ok || r.status === 202 || isRateLimit, status: r.status, body, urls, rate_limited: isRateLimit };
}
var INDEXNOW_URL;
var init_indexnow = __esm({
  "_lib/indexnow.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_indexnow_key();
    init_site_identity();
    INDEXNOW_URL = "https://api.indexnow.org/indexnow";
    __name(getHost, "getHost");
    __name(pingIndexNow, "pingIndexNow");
  }
});

// _lib/google_indexing.js
function b64url(input) {
  let bytes;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
  else if (input instanceof Uint8Array) bytes = input;
  else throw new Error("b64url: unsupported input");
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}
async function loadServiceAccount(env) {
  const raw = await getVaultSecret(env, "GOOGLE_SA_JSON");
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (!j.client_email || !j.private_key) return null;
    return j;
  } catch {
    return null;
  }
}
async function getAccessToken(env, scope) {
  const sa = await loadServiceAccount(env);
  if (!sa) throw new Error("google_sa_not_configured");
  const cacheKey = sa.client_email + "|" + scope;
  const cached = TOKEN_CACHE.get(cacheKey);
  const now = Math.floor(Date.now() / 1e3);
  if (cached && cached.expires_at > now + 300) return cached.token;
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now
  };
  const unsigned = b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(claim));
  const keyData = pemToArrayBuffer(sa.private_key);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = unsigned + "." + b64url(sig);
  const r = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("google_token_http_" + r.status + ": " + t.slice(0, 200));
  }
  const d = await r.json();
  if (!d.access_token) throw new Error("google_token_empty");
  TOKEN_CACHE.set(cacheKey, { token: d.access_token, expires_at: now + (d.expires_in || 3600) });
  return d.access_token;
}
async function resolveProperty(env) {
  const s = await loadSettings(env);
  const explicit = String(s.google_sc_property || "").trim();
  if (explicit) return explicit;
  const id = await getSiteIdentity(env);
  if (!id.url) return null;
  try {
    const u = new URL(id.url);
    return u.origin + "/";
  } catch {
    return null;
  }
}
async function submitSitemap(env, sitemapUrl) {
  let property;
  try {
    property = await resolveProperty(env);
    if (!property) return { ok: false, error: "no_property" };
    const token = await getAccessToken(env, SCOPE_SITEMAP);
    const r = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
      { method: "PUT", headers: { Authorization: "Bearer " + token } }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return { ok: false, status: r.status, error: "google_sitemap_http", detail: t.slice(0, 240), property, sitemap: sitemapUrl };
    }
    return { ok: true, status: r.status, property, sitemap: sitemapUrl };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 240), property, sitemap: sitemapUrl };
  }
}
async function notifyUrl(env, url, type = "URL_UPDATED") {
  try {
    const token = await getAccessToken(env, SCOPE_INDEXING);
    const r = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "content-type": "application/json"
      },
      body: JSON.stringify({ url, type })
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return { ok: false, status: r.status, error: "google_indexing_http", detail: t.slice(0, 240), url };
    }
    return { ok: true, status: r.status, url };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 240), url };
  }
}
async function onPublish(env, urls) {
  const s = await loadSettings(env);
  if (!await loadServiceAccount(env)) return { skipped: "no_credentials" };
  const id = await getSiteIdentity(env);
  const sitemapUrl = (id.url || "").replace(/\/$/, "") + "/sitemap.xml";
  const out = { sitemap: await submitSitemap(env, sitemapUrl) };
  if (String(s.google_use_indexing_api || "") === "1" && urls?.length) {
    out.indexing = [];
    for (const u of urls.slice(0, 10)) {
      out.indexing.push(await notifyUrl(env, u, "URL_UPDATED"));
    }
  }
  return out;
}
async function describeConfig(env) {
  const sa = await loadServiceAccount(env);
  if (!sa) return { configured: false };
  return {
    configured: true,
    client_email: sa.client_email,
    project_id: sa.project_id || null,
    property: await resolveProperty(env)
  };
}
var SCOPE_SITEMAP, SCOPE_INDEXING, GOOGLE_TOKEN_URL, TOKEN_CACHE;
var init_google_indexing = __esm({
  "_lib/google_indexing.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_secret_vault();
    init_settings();
    init_site_identity();
    SCOPE_SITEMAP = "https://www.googleapis.com/auth/webmasters";
    SCOPE_INDEXING = "https://www.googleapis.com/auth/indexing";
    GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
    TOKEN_CACHE = /* @__PURE__ */ new Map();
    __name(b64url, "b64url");
    __name(pemToArrayBuffer, "pemToArrayBuffer");
    __name(loadServiceAccount, "loadServiceAccount");
    __name(getAccessToken, "getAccessToken");
    __name(resolveProperty, "resolveProperty");
    __name(submitSitemap, "submitSitemap");
    __name(notifyUrl, "notifyUrl");
    __name(onPublish, "onPublish");
    __name(describeConfig, "describeConfig");
  }
});

// _lib/quality.js
function wordCount(md) {
  const noCode = String(md || "").replace(/```[\s\S]*?```/g, "");
  const words = noCode.split(/\s+/).filter(Boolean);
  return words.length;
}
function countMatches(md, re) {
  const m = String(md || "").match(re);
  return m ? m.length : 0;
}
function internalLinkCount(md) {
  return countMatches(String(md || ""), /\[[^\]]+\]\(\/(?:blog|p)\/[a-z0-9-]+/gi);
}
function scorePost({ title, body_markdown, meta_description, slug }) {
  const body = String(body_markdown || "");
  const stats = {
    word_count: wordCount(body),
    h2_count: countMatches(body, /^\#\#\s+/gm),
    h3_count: countMatches(body, /^\#\#\#\s+/gm),
    ul_count: countMatches(body, /^[-*]\s+/gm),
    ol_count: countMatches(body, /^\d+\.\s+/gm),
    code_blocks: countMatches(body, /```/g) / 2,
    // pairs
    internal_links: internalLinkCount(body),
    external_links: countMatches(body, /\[[^\]]+\]\(https?:\/\/[^)]+\)/g),
    title_len: String(title || "").length,
    meta_len: String(meta_description || "").length,
    slug: String(slug || "")
  };
  const issues = [];
  let score = 100;
  if (stats.word_count < 300) {
    issues.push({
      rule: "too_short_thin",
      detail: `Body is ${stats.word_count} words; under 300 reads as thin content to Google.`,
      severity: "bad"
    });
    score -= 60;
  } else if (stats.word_count < 600) {
    issues.push({
      rule: "too_short",
      detail: `Body is ${stats.word_count} words; target is 800+ for any useful guide.`,
      severity: "bad"
    });
    score -= 40;
  } else if (stats.word_count < 1200) {
    issues.push({
      rule: "short",
      detail: `Body is ${stats.word_count} words; aiming for 1500+ for definitive guides.`,
      severity: "warn"
    });
    score -= 12;
  }
  if (stats.h2_count === 0) {
    issues.push({
      rule: "no_subheadings",
      detail: "No H2 subheadings \u2014 body is a wall of text.",
      severity: "bad"
    });
    score -= 25;
  } else if (stats.h2_count < 3) {
    issues.push({
      rule: "few_subheadings",
      detail: `Only ${stats.h2_count} H2 subheading(s); 3+ recommended.`,
      severity: "warn"
    });
    score -= 8;
  }
  if (stats.ul_count + stats.ol_count === 0) {
    issues.push({
      rule: "no_lists",
      detail: "No bullet or numbered lists; prose-only posts read as flat.",
      severity: "warn"
    });
    score -= 6;
  }
  if (stats.internal_links === 0) {
    issues.push({
      rule: "no_internal_links",
      detail: "No internal links to other posts; misses SEO + retention win.",
      severity: "warn"
    });
    score -= 6;
  }
  if (stats.meta_len < 50) {
    issues.push({
      rule: "meta_too_short",
      detail: `Meta description is ${stats.meta_len} chars; 120-160 is the sweet spot.`,
      severity: "warn"
    });
    score -= 5;
  } else if (stats.meta_len > 180) {
    issues.push({
      rule: "meta_too_long",
      detail: `Meta description is ${stats.meta_len} chars; will be truncated in SERP.`,
      severity: "warn"
    });
    score -= 3;
  }
  if (stats.title_len === 0) {
    issues.push({ rule: "no_title", detail: "Title is empty.", severity: "bad" });
    score -= 40;
  } else if (stats.title_len > 70) {
    issues.push({
      rule: "title_too_long",
      detail: `Title is ${stats.title_len} chars; will be truncated in Google's SERP.`,
      severity: "warn"
    });
    score -= 3;
  }
  if (/^blog[-_]/i.test(stats.slug)) {
    issues.push({
      rule: "slug_blog_prefix",
      detail: `Slug starts with "blog" \u2014 the AI prepended the category. Should be ${stats.slug.replace(/^blog[-_]/i, "")}.`,
      severity: "warn"
    });
    score -= 4;
  }
  score = Math.max(0, Math.min(100, score));
  const band = score >= 70 ? "good" : score >= 45 ? "warn" : "bad";
  return { score, band, issues, stats };
}
function statusForScore(verdict, { forcePublish = false } = {}) {
  if (forcePublish) return "published";
  if (verdict.band === "bad") return "review";
  return "published";
}
var init_quality = __esm({
  "_lib/quality.js"() {
    init_functionsRoutes_0_09583509623234443();
    __name(wordCount, "wordCount");
    __name(countMatches, "countMatches");
    __name(internalLinkCount, "internalLinkCount");
    __name(scorePost, "scorePost");
    __name(statusForScore, "statusForScore");
  }
});

// _lib/projects.js
function normalizeCustomDomain(value) {
  if (!value) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  try {
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return raw.replace(/^https?:\/\//i, "").split("/")[0].trim().toLowerCase() || null;
  }
}
async function getProject(env, idOrSlug) {
  if (!env.DB || !idOrSlug) return null;
  const project = await env.DB.prepare(
    `SELECT * FROM projects WHERE id = ? OR slug = ? LIMIT 1`
  ).bind(idOrSlug, idOrSlug).first().catch(() => null);
  if (!project) return null;
  const [brand2, aiConfig, publishing, schedule] = await Promise.all([
    env.DB.prepare(`SELECT * FROM project_brands WHERE project_id = ?`).bind(project.id).first().catch(() => null),
    env.DB.prepare(`SELECT * FROM project_ai_configs WHERE project_id = ?`).bind(project.id).first().catch(() => null),
    env.DB.prepare(`SELECT * FROM project_publishing_configs WHERE project_id = ?`).bind(project.id).first().catch(() => null),
    env.DB.prepare(`SELECT * FROM project_schedules WHERE project_id = ?`).bind(project.id).first().catch(() => null)
  ]);
  return {
    ...project,
    custom_domain: project.custom_domain ? normalizeCustomDomain(project.custom_domain) : null,
    brand: brand2 || {},
    ai_config: aiConfig || {},
    publishing_config: publishing || {},
    schedule: schedule || {}
  };
}
async function listProjects(env, { status = "active" } = {}) {
  if (!env.DB) return [];
  const query = status === "all" ? `SELECT * FROM projects ORDER BY created_at DESC` : `SELECT * FROM projects WHERE status = ? ORDER BY created_at DESC`;
  const stmt = status === "all" ? env.DB.prepare(query) : env.DB.prepare(query).bind(status);
  const res = await (stmt.all ? stmt.all() : env.DB.prepare(query).all ? env.DB.prepare(query).all() : Promise.resolve({ results: [] })).catch(() => ({ results: [] }));
  const rows = res?.results || [];
  return rows.map((p) => ({
    ...p,
    custom_domain: p.custom_domain ? normalizeCustomDomain(p.custom_domain) : null
  }));
}
async function upsertProject(env, projectData) {
  if (!env.DB) throw new Error("Database binding missing");
  const t = nowSec();
  const id = projectData.id || newId();
  const slug = projectData.slug;
  if (!slug) throw new Error("Project slug is required");
  let customDomain = null;
  if (projectData.custom_domain !== void 0) {
    customDomain = normalizeCustomDomain(projectData.custom_domain);
  } else if (projectData.id) {
    const existing = await env.DB.prepare("SELECT custom_domain FROM projects WHERE id = ? LIMIT 1").bind(projectData.id).first().catch(() => null);
    customDomain = existing?.custom_domain ? normalizeCustomDomain(existing.custom_domain) : null;
  }
  await env.DB.prepare(
    `INSERT INTO projects (id, slug, name, description, website_url, publishing_url, custom_domain, site_name, site_description, logo_url, language, timezone, status, approval_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       slug = excluded.slug,
       name = excluded.name,
       description = excluded.description,
       website_url = excluded.website_url,
       publishing_url = excluded.publishing_url,
       custom_domain = excluded.custom_domain,
       site_name = excluded.site_name,
       site_description = excluded.site_description,
       logo_url = excluded.logo_url,
       language = excluded.language,
       timezone = excluded.timezone,
       status = excluded.status,
       approval_mode = excluded.approval_mode,
       updated_at = excluded.updated_at`
  ).bind(
    id,
    slug,
    projectData.name || slug,
    projectData.description || "",
    projectData.website_url || "",
    projectData.publishing_url || "",
    customDomain,
    projectData.site_name || null,
    projectData.site_description || null,
    projectData.logo_url || null,
    projectData.language || "vi",
    projectData.timezone || "Asia/Ho_Chi_Minh",
    projectData.status || "active",
    projectData.approval_mode || "auto",
    t,
    t
  ).run();
  if (projectData.brand) {
    const b = projectData.brand;
    await env.DB.prepare(
      `INSERT INTO project_brands (project_id, business_type, tone, audience, key_themes, topics_to_avoid, service_area, cta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         business_type = excluded.business_type,
         tone = excluded.tone,
         audience = excluded.audience,
         key_themes = excluded.key_themes,
         topics_to_avoid = excluded.topics_to_avoid,
         service_area = excluded.service_area,
         cta = excluded.cta,
         updated_at = excluded.updated_at`
    ).bind(
      id,
      b.business_type || "",
      b.tone || "",
      b.audience || "",
      b.key_themes || "",
      b.topics_to_avoid || "",
      b.service_area || "",
      b.cta || "",
      t,
      t
    ).run();
  }
  if (projectData.ai_config) {
    const a = projectData.ai_config;
    await env.DB.prepare(
      `INSERT INTO project_ai_configs (project_id, default_text_provider, default_image_provider, text_model, image_model, min_words, max_words, temperature, system_prompt_override, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         default_text_provider = excluded.default_text_provider,
         default_image_provider = excluded.default_image_provider,
         text_model = excluded.text_model,
         image_model = excluded.image_model,
         min_words = excluded.min_words,
         max_words = excluded.max_words,
         temperature = excluded.temperature,
         system_prompt_override = excluded.system_prompt_override,
         updated_at = excluded.updated_at`
    ).bind(
      id,
      a.default_text_provider || "workers-ai",
      a.default_image_provider || "workers-ai",
      a.text_model || "",
      a.image_model || "",
      a.min_words || 1500,
      a.max_words || 3e3,
      a.temperature || 0.7,
      a.system_prompt_override || "",
      t,
      t
    ).run();
  }
  if (projectData.publishing_config) {
    const p = projectData.publishing_config;
    await env.DB.prepare(
      `INSERT INTO project_publishing_configs (project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         publisher_type = excluded.publisher_type,
         endpoint_url = excluded.endpoint_url,
         auth_header = excluded.auth_header,
         config_json = excluded.config_json,
         updated_at = excluded.updated_at`
    ).bind(
      id,
      p.publisher_type || "internal_d1",
      p.endpoint_url || "",
      p.auth_header || "",
      typeof p.config_json === "object" ? JSON.stringify(p.config_json) : p.config_json || "{}",
      t,
      t
    ).run();
  }
  if (projectData.schedule) {
    const s = projectData.schedule;
    await env.DB.prepare(
      `INSERT INTO project_schedules (project_id, frequency, cron_expression, preferred_time_utc, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         frequency = excluded.frequency,
         cron_expression = excluded.cron_expression,
         preferred_time_utc = excluded.preferred_time_utc,
         is_active = excluded.is_active,
         updated_at = excluded.updated_at`
    ).bind(
      id,
      s.frequency || "daily",
      s.cron_expression || "0 8 * * *",
      s.preferred_time_utc || "08:00",
      s.is_active !== void 0 ? s.is_active ? 1 : 0 : 1,
      t,
      t
    ).run();
  }
  return getProject(env, id);
}
var init_projects = __esm({
  "_lib/projects.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    __name(normalizeCustomDomain, "normalizeCustomDomain");
    __name(getProject, "getProject");
    __name(listProjects, "listProjects");
    __name(upsertProject, "upsertProject");
  }
});

// _lib/publishing/facebook_oauth.js
async function getApiVersion(env) {
  if (env?.FACEBOOK_API_VERSION && /^v\d+\.\d+$/.test(String(env.FACEBOOK_API_VERSION).trim())) {
    return String(env.FACEBOOK_API_VERSION).trim();
  }
  if (!env?.DB) return DEFAULT_VERSION;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'facebook_api_version' LIMIT 1").first().catch(() => null);
  const v = String(row?.value || "").trim();
  return /^v\d+\.\d+$/.test(v) ? v : DEFAULT_VERSION;
}
function fbRedirectUri(request) {
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}/api/admin/projects/fb-callback`;
}
function buildAuthUrl({ appId, redirectUri, state, version = DEFAULT_VERSION }) {
  const p = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: FB_SCOPES.join(",")
  });
  return `${DIALOG}/${version}/dialog/oauth?${p.toString()}`;
}
async function graphGet(path, params = {}, version = DEFAULT_VERSION) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}/${version}/${path}${q ? "?" + q : ""}`);
  const data = await res.json().catch(() => ({}));
  if (data?.error) {
    const err = new Error(data.error.message || "graph_error");
    err.graph = data.error;
    throw err;
  }
  if (!res.ok) throw new Error(`Facebook HTTP ${res.status}`);
  return data;
}
async function exchangeCodeForToken({ appId, appSecret, redirectUri, code, version }) {
  const data = await graphGet("oauth/access_token", {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code
  }, version);
  if (!data?.access_token) throw new Error("Kh\xF4ng nh\u1EADn \u0111\u01B0\u1EE3c access token t\u1EEB Facebook.");
  return data.access_token;
}
async function exchangeForLongLived({ appId, appSecret, shortToken, version }) {
  const data = await graphGet("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken
  }, version);
  return data?.access_token || shortToken;
}
async function listManagedPages(userToken, version) {
  const data = await graphGet("me/accounts", {
    access_token: userToken,
    fields: "id,name,access_token,tasks,fan_count,link,picture{url}",
    limit: 100
  }, version);
  return (data?.data || []).filter((p) => p?.id && p?.access_token);
}
async function getAppId(env) {
  if (env?.FACEBOOK_APP_ID && String(env.FACEBOOK_APP_ID).trim()) return String(env.FACEBOOK_APP_ID).trim();
  if (!env?.DB) return "";
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'facebook_app_id' LIMIT 1").first().catch(() => null);
  return String(row?.value || "").trim();
}
async function setAppId(env, value) {
  const v = String(value || "").trim();
  const t = Math.floor(Date.now() / 1e3);
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('facebook_app_id', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(v, t).run();
}
async function getAppSecret(env) {
  if (env?.FACEBOOK_APP_SECRET && String(env.FACEBOOK_APP_SECRET).trim()) return String(env.FACEBOOK_APP_SECRET).trim();
  const v = await getVaultSecret(env, FB_APP_SECRET_NAME);
  return v ? String(v).trim() : "";
}
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function signState(adminToken, projectId) {
  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const payload = `${projectId}.${nonce}`;
  const sig = await hmacHex(adminToken, payload);
  return `${payload}.${sig}`;
}
async function verifyState(adminToken, state) {
  const parts = String(state || "").split(".");
  if (parts.length !== 3) return null;
  const [projectId, nonce, sig] = parts;
  const expect = await hmacHex(adminToken, `${projectId}.${nonce}`);
  if (sig !== expect) return null;
  return { projectId };
}
function pendingKey(projectId) {
  return `FACEBOOK_PENDING_PAGES__${projectId}`;
}
async function savePendingPages(env, projectId, pages) {
  const slim = pages.map((p) => ({
    id: p.id,
    name: p.name,
    fan_count: p.fan_count || 0,
    link: p.link || "",
    picture: p.picture?.data?.url || "",
    tasks: p.tasks || [],
    token: p.access_token
  }));
  const { setVaultSecret: setVaultSecret2 } = await Promise.resolve().then(() => (init_secret_vault(), secret_vault_exports));
  await setVaultSecret2(env, pendingKey(projectId), JSON.stringify({
    saved_at: Math.floor(Date.now() / 1e3),
    pages: slim
  }));
}
async function readPendingPages(env, projectId) {
  const { getVaultSecret: getVaultSecret2 } = await Promise.resolve().then(() => (init_secret_vault(), secret_vault_exports));
  const raw = await getVaultSecret2(env, pendingKey(projectId));
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed?.pages) return null;
  if (Math.floor(Date.now() / 1e3) - (parsed.saved_at || 0) > PENDING_TTL_SEC) return null;
  return parsed.pages;
}
async function clearPendingPages(env, projectId) {
  const { setVaultSecret: setVaultSecret2 } = await Promise.resolve().then(() => (init_secret_vault(), secret_vault_exports));
  await setVaultSecret2(env, pendingKey(projectId), "");
}
var GRAPH, DIALOG, DEFAULT_VERSION, FB_SCOPES, FB_APP_SECRET_NAME, PENDING_TTL_SEC;
var init_facebook_oauth = __esm({
  "_lib/publishing/facebook_oauth.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_secret_vault();
    GRAPH = "https://graph.facebook.com";
    DIALOG = "https://www.facebook.com";
    DEFAULT_VERSION = "v23.0";
    FB_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];
    FB_APP_SECRET_NAME = "FACEBOOK_APP_SECRET";
    __name(getApiVersion, "getApiVersion");
    __name(fbRedirectUri, "fbRedirectUri");
    __name(buildAuthUrl, "buildAuthUrl");
    __name(graphGet, "graphGet");
    __name(exchangeCodeForToken, "exchangeCodeForToken");
    __name(exchangeForLongLived, "exchangeForLongLived");
    __name(listManagedPages, "listManagedPages");
    __name(getAppId, "getAppId");
    __name(setAppId, "setAppId");
    __name(getAppSecret, "getAppSecret");
    __name(hmacHex, "hmacHex");
    __name(signState, "signState");
    __name(verifyState, "verifyState");
    PENDING_TTL_SEC = 15 * 60;
    __name(pendingKey, "pendingKey");
    __name(savePendingPages, "savePendingPages");
    __name(readPendingPages, "readPendingPages");
    __name(clearPendingPages, "clearPendingPages");
  }
});

// _lib/publishing/facebook.js
function facebookTokenName(projectId) {
  return `FACEBOOK_PAGE_TOKEN__${projectId}`;
}
async function resolveFacebookToken(env, projectId) {
  if (!env?.DB) return "";
  const scoped = projectId ? await getVaultSecret(env, facebookTokenName(projectId)) : "";
  if (scoped) return String(scoped).trim();
  const global = await getVaultSecret(env, "FACEBOOK_PAGE_TOKEN");
  return global ? String(global).trim() : "";
}
function parseFacebookConfig(configJson) {
  let cfg = {};
  try {
    cfg = typeof configJson === "string" ? JSON.parse(configJson || "{}") : configJson || {};
  } catch {
    cfg = {};
  }
  return {
    pageId: String(cfg.page_id || "").trim(),
    // Empty means "use the deployment's configured Graph API version" —
    // resolved per request so a version bump needs no redeploy.
    apiVersion: /^v\d+\.\d+$/.test(String(cfg.api_version || "")) ? String(cfg.api_version) : "",
    // Photo posts surface a large image; link posts let Facebook unfurl
    // the page's OG tags. Link posts are the safe default because they
    // also carry the title/description without us re-sending them.
    asPhoto: cfg.as_photo === true,
    messageTemplate: String(cfg.message_template || "").trim()
  };
}
function projectPublicBase(project) {
  const cd = String(project?.custom_domain || "").trim();
  if (cd) return `https://${cd.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return String(project?.publishing_url || project?.website_url || "").replace(/\/+$/, "");
}
function projectOrigin(project) {
  const base = projectPublicBase(project);
  try {
    return new URL(base).origin;
  } catch {
    return "";
  }
}
function buildFacebookMessage(article, cfg) {
  const title = String(article?.title || "").trim();
  const desc = String(article?.meta_description || "").trim();
  if (cfg.messageTemplate) {
    return cfg.messageTemplate.replace(/\{title\}/g, title).replace(/\{description\}/g, desc).replace(/\{url\}/g, "").trim();
  }
  return desc ? desc.slice(0, 400) : title;
}
async function graphFetch(path, params) {
  const res = await fetch(`${GRAPH2}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString()
  });
  const data = await res.json().catch(() => ({}));
  if (data?.error) {
    const err = new Error(describeGraphError(data.error));
    err.graph = data.error;
    throw err;
  }
  if (!res.ok) throw new Error(`Facebook HTTP ${res.status}`);
  return data;
}
function describeGraphError(error) {
  const code = error?.code;
  const sub = error?.error_subcode;
  const msg = error?.message || "unknown error";
  if (code === 190) {
    if (sub === 463) return `Token Facebook \u0111\xE3 h\u1EBFt h\u1EA1n (${msg}). T\u1EA1o l\u1EA1i Page Access Token trong Graph API Explorer r\u1ED3i l\u01B0u l\u1EA1i.`;
    if (sub === 467) return `Token Facebook kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111\xE3 b\u1ECB thu h\u1ED3i (${msg}). Ki\u1EC3m tra b\u1EA1n c\xF2n l\xE0 admin c\u1EE7a Page.`;
    return `Token Facebook kh\xF4ng h\u1EE3p l\u1EC7 (${msg}). T\u1EA1o Page Access Token m\u1EDBi v\xE0 l\u01B0u l\u1EA1i.`;
  }
  if (code === 200 || code === 10) {
    return `App ch\u01B0a c\xF3 quy\u1EC1n \u0111\u0103ng b\xE0i l\xEAn Page (${msg}). C\u1EA7n pages_manage_posts + pages_read_engagement v\xE0 token ph\u1EA3i c\u1EE7a admin Page.`;
  }
  if (code === 368) return `Page t\u1EA1m b\u1ECB h\u1EA1n ch\u1EBF \u0111\u0103ng b\xE0i (${msg}). Th\u1EED l\u1EA1i sau.`;
  if (code === 4 || code === 17 || code === 32) return `\u0110\xE3 ch\u1EA1m gi\u1EDBi h\u1EA1n t\u1EA7n su\u1EA5t c\u1EE7a Facebook (${msg}). Gi\u1EA3m s\u1ED1 b\xE0i/ng\xE0y.`;
  return `Facebook l\u1ED7i (code ${code}): ${msg}`;
}
async function publishToFacebook({ project, article, configJson, env }) {
  const cfg = parseFacebookConfig(configJson);
  if (!cfg.pageId) throw new Error("Thi\u1EBFu Page ID trong c\u1EA5u h\xECnh k\xEAnh Facebook.");
  const token = await resolveFacebookToken(env, project?.id);
  if (!token) throw new Error("Ch\u01B0a l\u01B0u Page Access Token cho d\u1EF1 \xE1n n\xE0y.");
  const base = projectPublicBase(project);
  if (!base) throw new Error("D\u1EF1 \xE1n ch\u01B0a c\xF3 URL xu\u1EA5t b\u1EA3n \u0111\u1EC3 t\u1EA1o link b\xE0i vi\u1EBFt.");
  const link = `${base}/blog/${article.slug}`;
  const message = buildFacebookMessage(article, cfg);
  const imageUrl = article.hero_image_key ? `${projectOrigin(project)}/image/${article.hero_image_key}` : "";
  const version = cfg.apiVersion || await getApiVersion(env);
  if (cfg.asPhoto && imageUrl) {
    const data2 = await graphFetch(`${version}/${cfg.pageId}/photos`, {
      url: imageUrl,
      caption: message,
      access_token: token
    });
    return {
      ok: true,
      type: "facebook",
      format: "photo",
      post_id: data2.id,
      post_url: `https://www.facebook.com/${data2.post_id || data2.id}`,
      link
    };
  }
  const data = await graphFetch(`${version}/${cfg.pageId}/feed`, {
    message,
    link,
    access_token: token
  });
  return {
    ok: true,
    type: "facebook",
    format: "link",
    post_id: data.id,
    post_url: data.id ? `https://www.facebook.com/${data.id}` : null,
    link
  };
}
async function verifyFacebookPage({ env, projectId, pageId, token }) {
  const cfgPageId = String(pageId || "").trim();
  if (!cfgPageId) throw new Error("Thi\u1EBFu Page ID.");
  const tok = String(token || "").trim() || await resolveFacebookToken(env, projectId);
  if (!tok) throw new Error("Ch\u01B0a c\xF3 Page Access Token.");
  const url = `${GRAPH2}/${await getApiVersion(env)}/${cfgPageId}?fields=id,name,fan_count,link&access_token=${encodeURIComponent(tok)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (data?.error) {
    const err = new Error(describeGraphError(data.error));
    err.graph = data.error;
    throw err;
  }
  if (!res.ok) throw new Error(`Facebook HTTP ${res.status}`);
  return { page_id: data.id, name: data.name, fan_count: data.fan_count, link: data.link };
}
var GRAPH2;
var init_facebook = __esm({
  "_lib/publishing/facebook.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_secret_vault();
    init_facebook_oauth();
    GRAPH2 = "https://graph.facebook.com";
    __name(facebookTokenName, "facebookTokenName");
    __name(resolveFacebookToken, "resolveFacebookToken");
    __name(parseFacebookConfig, "parseFacebookConfig");
    __name(projectPublicBase, "projectPublicBase");
    __name(projectOrigin, "projectOrigin");
    __name(buildFacebookMessage, "buildFacebookMessage");
    __name(graphFetch, "graphFetch");
    __name(describeGraphError, "describeGraphError");
    __name(publishToFacebook, "publishToFacebook");
    __name(verifyFacebookPage, "verifyFacebookPage");
  }
});

// _lib/publishing/publisher.js
async function dispatchPublication({ project, article, env }) {
  const pubCfg = project?.publishing_config || {};
  const publisherType = pubCfg.publisher_type || "internal_d1";
  switch (publisherType) {
    case "webhook":
      return publishToWebhook({ endpointUrl: pubCfg.endpoint_url, authHeader: pubCfg.auth_header, article });
    case "custom_api":
      return publishToCustomApi({ endpointUrl: pubCfg.endpoint_url, authHeader: pubCfg.auth_header, article, configJson: pubCfg.config_json });
    case "wordpress":
      return publishToWordPress({ endpointUrl: pubCfg.endpoint_url, authHeader: pubCfg.auth_header, article });
    case "facebook":
      return publishToFacebook({ project, article, configJson: pubCfg.config_json, env });
    case "internal_d1":
    default:
      return {
        ok: true,
        type: "internal_d1",
        published_url: `${project?.publishing_url || project?.website_url || ""}/blog/${article.slug}`
      };
  }
}
async function publishToWebhook({ endpointUrl, authHeader, article }) {
  if (!endpointUrl) throw new Error("Webhook endpoint URL missing");
  const headers = { "Content-Type": "application/json" };
  if (authHeader) headers["Authorization"] = authHeader;
  const res = await fetch(endpointUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      event: "article.published",
      article: {
        id: article.id,
        slug: article.slug,
        title: article.title,
        meta_description: article.meta_description,
        body_markdown: article.body_markdown,
        hero_image_key: article.hero_image_key,
        keywords: article.keywords,
        published_at: article.published_at
      }
    })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Webhook error (${res.status}): ${txt.slice(0, 300)}`);
  }
  return { ok: true, type: "webhook", status: res.status };
}
async function publishToCustomApi({ endpointUrl, authHeader, article, configJson }) {
  if (!endpointUrl) throw new Error("Custom API endpoint URL missing");
  const headers = { "Content-Type": "application/json" };
  if (authHeader) headers["Authorization"] = authHeader;
  let extraConfig = {};
  try {
    if (configJson) extraConfig = typeof configJson === "string" ? JSON.parse(configJson) : configJson;
  } catch {
  }
  const res = await fetch(endpointUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...extraConfig,
      title: article.title,
      slug: article.slug,
      content: article.body_markdown,
      summary: article.meta_description,
      tags: article.keywords ? article.keywords.split(",").map((s) => s.trim()) : [],
      featured_image: article.hero_image_key
    })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Custom API error (${res.status}): ${txt.slice(0, 300)}`);
  }
  const data = await res.json().catch(() => ({}));
  return { ok: true, type: "custom_api", data };
}
async function publishToWordPress({ endpointUrl, authHeader, article }) {
  if (!endpointUrl) throw new Error("WordPress endpoint URL missing");
  const headers = { "Content-Type": "application/json" };
  if (authHeader) headers["Authorization"] = authHeader;
  const url = endpointUrl.replace(/\/+$/, "") + "/wp-json/wp/v2/posts";
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: article.title,
      slug: article.slug,
      content: article.body_markdown,
      status: "publish"
    })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`WordPress API error (${res.status}): ${txt.slice(0, 300)}`);
  }
  const data = await res.json().catch(() => ({}));
  return { ok: true, type: "wordpress", post_id: data.id, link: data.link };
}
var init_publisher = __esm({
  "_lib/publishing/publisher.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_facebook();
    __name(dispatchPublication, "dispatchPublication");
    __name(publishToWebhook, "publishToWebhook");
    __name(publishToCustomApi, "publishToCustomApi");
    __name(publishToWordPress, "publishToWordPress");
  }
});

// _lib/events.js
async function track(env, { event, projectId = null, userId = null, props = null } = {}) {
  try {
    if (!env?.DB?.prepare || !event) return { ok: false };
    if (!KNOWN.has(event)) return { ok: false, error: "unknown_event" };
    let propsJson = null;
    if (props && typeof props === "object") {
      const j = JSON.stringify(props);
      if (j.length <= 2048) propsJson = j;
    }
    await env.DB.prepare(
      `INSERT INTO product_events (id, event, project_id, user_id, props_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(newId(), event, projectId, userId, propsJson, nowSec()).run();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
async function trackOnce(env, { event, projectId, userId = null, props = null } = {}) {
  try {
    if (!env?.DB?.prepare || !event || !projectId) return { ok: false };
    const seen = await env.DB.prepare(
      "SELECT 1 AS x FROM product_events WHERE event = ? AND project_id = ? LIMIT 1"
    ).bind(event, projectId).first().catch(() => null);
    if (seen) return { ok: false, error: "already_tracked" };
    return await track(env, { event, projectId, userId, props });
  } catch {
    return { ok: false };
  }
}
var EVENTS, KNOWN;
var init_events = __esm({
  "_lib/events.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    EVENTS = [
      "signup",
      // a project was created via public register
      "setup_complete",
      // first-run /api/setup finished
      "onboarding_started",
      // wizard opened
      "onboarding_complete",
      // wizard finished
      "brand_dna_generated",
      // AI read the website
      "calendar_planned",
      // 28-day schedule created
      "first_post_published",
      // the activation moment — emitted once per project
      "channel_connect_started",
      "channel_connected",
      "channel_connect_failed",
      "channel_disconnected",
      "social_post_published",
      "social_post_failed"
    ];
    KNOWN = new Set(EVENTS);
    __name(track, "track");
    __name(trackOnce, "trackOnce");
  }
});

// _lib/publishing/social_queue.js
function backoffSec(attempts) {
  return Math.min(BASE_DELAY_SEC * 2 ** Math.max(0, attempts - 1), MAX_DELAY_SEC);
}
function isCredentialError(err) {
  const code = err?.graph?.code;
  if (code === 190 || code === 200 || code === 10) return true;
  const msg = String(err?.message || "");
  return /token|quyền|permission/i.test(msg) && /hết hạn|không hợp lệ|chưa có quyền|not set|missing/i.test(msg);
}
async function enqueueSocialPost(env, { projectId, blogPostId, channel = "facebook" }) {
  if (!env?.DB || !blogPostId) return { enqueued: false };
  const t = nowSec();
  const r = await env.DB.prepare(
    `INSERT OR IGNORE INTO social_posts
       (id, project_id, blog_post_id, channel, status, attempts, max_attempts, next_attempt_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, 5, ?, ?, ?)`
  ).bind(newId(), projectId || null, blogPostId, channel, t, t, t).run().catch(() => null);
  return { enqueued: !!r?.meta?.changes };
}
async function claimJob(env, id) {
  const t = nowSec();
  const r = await env.DB.prepare(
    `UPDATE social_posts
        SET status = 'publishing', attempts = attempts + 1, updated_at = ?
      WHERE id = ? AND status IN ('pending', 'failed')`
  ).bind(t, id).run().catch(() => null);
  return !!r?.meta?.changes;
}
async function loadJobContext(env, id) {
  const row = await env.DB.prepare(
    `SELECT s.id, s.project_id, s.channel, s.attempts, s.max_attempts,
            b.id AS post_id, b.slug, b.title, b.meta_description,
            b.body_markdown, b.hero_image_key, b.keywords, b.published_at
       FROM social_posts s
       JOIN blog_posts b ON b.id = s.blog_post_id
      WHERE s.id = ? LIMIT 1`
  ).bind(id).first().catch(() => null);
  return row;
}
async function finishJob(env, id, fields) {
  const sets = [];
  const binds = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    binds.push(v);
  }
  sets.push("updated_at = ?");
  binds.push(nowSec());
  binds.push(id);
  await env.DB.prepare(`UPDATE social_posts SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run().catch(() => {
  });
}
async function runSocialJob(env, id, { dispatch = dispatchPublication } = {}) {
  if (!await claimJob(env, id)) return { ok: false, error: "not_claimable" };
  const job = await loadJobContext(env, id);
  if (!job) {
    await finishJob(env, id, { status: "failed", error: "blog_post_missing" });
    return { ok: false, error: "blog_post_missing" };
  }
  const project = await getProject(env, job.project_id).catch(() => null);
  if (!project) {
    await finishJob(env, id, { status: "failed", error: "project_missing" });
    return { ok: false, error: "project_missing" };
  }
  try {
    const res = await dispatch({
      project,
      article: {
        id: job.post_id,
        slug: job.slug,
        title: job.title,
        meta_description: job.meta_description,
        body_markdown: job.body_markdown,
        hero_image_key: job.hero_image_key,
        keywords: job.keywords,
        published_at: job.published_at
      },
      env
    });
    if (res?.ok === false) throw new Error(res.error || "dispatch_failed");
    await track(env, { event: "social_post_published", projectId: job.project_id, props: { channel: job.channel } });
    await finishJob(env, id, {
      status: "published",
      external_id: res?.post_id || res?.postId || null,
      external_url: res?.post_url || res?.link || null,
      error: null,
      needs_reconnect: 0,
      published_at: nowSec()
    });
    return { ok: true, external_url: res?.post_url || res?.link || null };
  } catch (err) {
    const attempts = job.attempts || 1;
    const maxAttempts = job.max_attempts || 5;
    const credential = isCredentialError(err);
    await track(env, { event: "social_post_failed", projectId: job.project_id, props: { channel: job.channel, credential, attempts } });
    if (credential) {
      await finishJob(env, id, {
        status: "failed",
        error: String(err.message || err).slice(0, 500),
        needs_reconnect: 1
      });
      return { ok: false, error: err.message, needs_reconnect: true };
    }
    if (attempts >= maxAttempts) {
      await finishJob(env, id, { status: "failed", error: String(err.message || err).slice(0, 500) });
      return { ok: false, error: err.message, exhausted: true };
    }
    await finishJob(env, id, {
      status: "failed",
      error: String(err.message || err).slice(0, 500),
      next_attempt_at: nowSec() + backoffSec(attempts)
    });
    return { ok: false, error: err.message, retry_in_sec: backoffSec(attempts) };
  }
}
async function drainSocialQueue(env, { projectId = null, limit = 5, dispatch = dispatchPublication } = {}) {
  if (!env?.DB) return { processed: 0, results: [] };
  const t = nowSec();
  const where = projectId ? "project_id = ? AND" : "";
  const sql = `SELECT id FROM social_posts
                WHERE ${where} status IN ('pending', 'failed')
                  AND needs_reconnect = 0
                  AND next_attempt_at <= ?
                ORDER BY next_attempt_at ASC LIMIT ?`;
  const stmt = projectId ? env.DB.prepare(sql).bind(projectId, t, limit) : env.DB.prepare(sql).bind(t, limit);
  const { results } = await stmt.all().catch(() => ({ results: [] }));
  const out = [];
  for (const row of results || []) {
    out.push({ id: row.id, ...await runSocialJob(env, row.id, { dispatch }) });
  }
  return { processed: out.length, results: out };
}
async function listSocialPosts(env, { projectId = null, status = null, limit = 100 } = {}) {
  if (!env?.DB) return [];
  const clauses = [];
  const binds = [];
  if (projectId) {
    clauses.push("s.project_id = ?");
    binds.push(projectId);
  }
  if (status) {
    clauses.push("s.status = ?");
    binds.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  binds.push(Math.min(500, limit));
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.project_id, s.blog_post_id, s.channel, s.status, s.attempts, s.max_attempts,
            s.next_attempt_at, s.external_id, s.external_url, s.error,
            s.needs_reconnect, s.created_at, s.updated_at, s.published_at,
            b.slug AS post_slug, b.title AS post_title, b.hero_image_key
       FROM social_posts s
       LEFT JOIN blog_posts b ON b.id = s.blog_post_id
       ${where}
      ORDER BY s.created_at DESC LIMIT ?`
  ).bind(...binds).all().catch(() => ({ results: [] }));
  return results || [];
}
async function retrySocialPost(env, { projectId = null, id }) {
  const t = nowSec();
  const owned = projectId ? await env.DB.prepare("SELECT id FROM social_posts WHERE id = ? AND project_id = ? LIMIT 1").bind(id, projectId).first().catch(() => null) : await env.DB.prepare("SELECT id FROM social_posts WHERE id = ? LIMIT 1").bind(id).first().catch(() => null);
  if (!owned) return { ok: false, error: "not_found" };
  await env.DB.prepare(
    `UPDATE social_posts SET status = 'pending', attempts = 0, next_attempt_at = ?,
       error = NULL, needs_reconnect = 0, updated_at = ? WHERE id = ?`
  ).bind(t, t, id).run().catch(() => {
  });
  return runSocialJob(env, id);
}
async function cancelSocialPost(env, { projectId = null, id }) {
  const t = nowSec();
  const r = projectId ? await env.DB.prepare(
    `UPDATE social_posts SET status = 'skipped', updated_at = ?
          WHERE id = ? AND project_id = ? AND status IN ('pending','failed')`
  ).bind(t, id, projectId).run().catch(() => null) : await env.DB.prepare(
    `UPDATE social_posts SET status = 'skipped', updated_at = ?
          WHERE id = ? AND status IN ('pending','failed')`
  ).bind(t, id).run().catch(() => null);
  return { ok: !!r?.meta?.changes };
}
var BASE_DELAY_SEC, MAX_DELAY_SEC;
var init_social_queue = __esm({
  "_lib/publishing/social_queue.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_projects();
    init_publisher();
    init_events();
    BASE_DELAY_SEC = 60;
    MAX_DELAY_SEC = 3600;
    __name(backoffSec, "backoffSec");
    __name(isCredentialError, "isCredentialError");
    __name(enqueueSocialPost, "enqueueSocialPost");
    __name(claimJob, "claimJob");
    __name(loadJobContext, "loadJobContext");
    __name(finishJob, "finishJob");
    __name(runSocialJob, "runSocialJob");
    __name(drainSocialQueue, "drainSocialQueue");
    __name(listSocialPosts, "listSocialPosts");
    __name(retrySocialPost, "retrySocialPost");
    __name(cancelSocialPost, "cancelSocialPost");
  }
});

// _lib/project_scope.js
function normalizeHost(value) {
  try {
    const raw = String(value || "").trim();
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
function requestHost(request) {
  const forwarded = request?.headers?.get?.("x-forwarded-host");
  if (forwarded) return forwarded.split(",")[0].trim();
  const hostHdr = request?.headers?.get?.("host");
  if (hostHdr) return hostHdr.split(":")[0].trim();
  try {
    return new URL(request.url).hostname;
  } catch {
    return "";
  }
}
async function resolveProjectByHost(env, host, pathname = "/") {
  if (!env?.DB) return null;
  const target = normalizeHost(host);
  if (!target) return null;
  const cached = env[CACHE_KEY3];
  if (cached && cached.host === target && cached.path === pathname) return cached.project;
  const rows = await env.DB.prepare(
    `SELECT id, slug, name, website_url, publishing_url, custom_domain, site_name, site_description, logo_url, theme_color FROM projects WHERE status = 'active'`
  ).all().catch(() => ({ results: [] }));
  for (const project of rows?.results || []) {
    if (project.custom_domain) {
      const cdHost = normalizeHost(project.custom_domain);
      if (cdHost && (cdHost === target || target.endsWith("." + cdHost))) {
        try {
          env[CACHE_KEY3] = { host: target, path: pathname, project };
        } catch {
        }
        return project;
      }
    }
  }
  let match2 = null, matchLen = -1;
  for (const project of rows?.results || []) {
    for (const raw of [project.website_url, project.publishing_url]) {
      let h, p;
      try {
        const u = new URL(/^https?:\/\//i.test(raw || "") ? raw : `https://${raw}`);
        h = normalizeHost(u.hostname);
        p = u.pathname.replace(/\/+$/, "");
      } catch {
        continue;
      }
      if (!h) continue;
      if (h !== target && !target.endsWith("." + h)) continue;
      if (p && pathname !== p && !pathname.startsWith(p + "/")) continue;
      if (p.length > matchLen) {
        match2 = project;
        matchLen = p.length;
      }
    }
  }
  try {
    env[CACHE_KEY3] = { host: target, path: pathname, project: match2 };
  } catch {
  }
  return match2;
}
async function resolveProjectForRequest(env, request) {
  let url;
  try {
    url = new URL(request.url);
  } catch {
    url = null;
  }
  const qp = url?.searchParams.get("project") || "";
  if (qp) return resolveProjectBySlug(env, qp);
  return resolveProjectByHost(env, requestHost(request), url?.pathname || "/");
}
async function resolveProjectBySlug(env, slug) {
  const clean = String(slug || "").trim().toLowerCase();
  if (!clean || !/^[a-z0-9][a-z0-9-]{0,60}$/.test(clean)) return null;
  const cache = env?.[SLUG_CACHE_KEY];
  if (cache && clean in cache) return cache[clean];
  const row = await env?.DB?.prepare(
    `SELECT id, slug, name, website_url, publishing_url, custom_domain, site_name, site_description, logo_url, theme_color FROM projects WHERE slug = ? LIMIT 1`
  ).bind(clean).first().catch(() => null);
  const project = row || null;
  if (env) {
    try {
      if (!env[SLUG_CACHE_KEY]) env[SLUG_CACHE_KEY] = {};
      env[SLUG_CACHE_KEY][clean] = project;
    } catch {
    }
  }
  return project;
}
async function resolveProjectBySlugPath(env, slug) {
  const clean = String(slug || "").trim().toLowerCase();
  const project = await resolveProjectBySlug(env, clean);
  if (!project) return null;
  if (project.custom_domain) return project;
  let path = "";
  try {
    path = new URL(project.publishing_url || "").pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
  return path === `/${clean}` ? project : null;
}
async function publicBaseFor(env, projectId, request) {
  let fallback = "";
  try {
    const host = requestHost(request);
    fallback = `https://${host === "gu-seo.pages.dev" ? "gulagi.com" : host}`;
  } catch {
    fallback = "";
  }
  if (!projectId) return fallback;
  const row = await env?.DB?.prepare?.(
    `SELECT publishing_url, website_url, custom_domain FROM projects WHERE id = ? LIMIT 1`
  )?.bind?.(projectId)?.first?.()?.catch(() => null);
  if (row?.custom_domain) {
    const cd = normalizeHost(row.custom_domain);
    if (cd) return `https://${cd}`;
  }
  const raw = row?.publishing_url || row?.website_url || "";
  try {
    const u = new URL(raw);
    return u.origin + u.pathname.replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}
async function publicPathFor(env, projectId, request) {
  if (!projectId) return "";
  const row = await env?.DB?.prepare?.(
    `SELECT publishing_url, website_url, custom_domain, slug FROM projects WHERE id = ? LIMIT 1`
  )?.bind?.(projectId)?.first?.()?.catch(() => null);
  if (!row) return "";
  if (row.custom_domain) {
    const cd = normalizeHost(row.custom_domain);
    if (cd) {
      if (!request) return "";
      const reqHost = normalizeHost(requestHost(request));
      if (reqHost === cd || reqHost.endsWith("." + cd)) {
        return "";
      }
      return `/${row.slug}`;
    }
  }
  const base = await publicBaseFor(env, projectId, request);
  try {
    return new URL(base).pathname.replace(/\/+$/, "");
  } catch {
    return "";
  }
}
var CACHE_KEY3, SLUG_CACHE_KEY;
var init_project_scope = __esm({
  "_lib/project_scope.js"() {
    init_functionsRoutes_0_09583509623234443();
    CACHE_KEY3 = "__ps_project_scope_cache__";
    __name(normalizeHost, "normalizeHost");
    __name(requestHost, "requestHost");
    __name(resolveProjectByHost, "resolveProjectByHost");
    __name(resolveProjectForRequest, "resolveProjectForRequest");
    SLUG_CACHE_KEY = "__ps_project_slug_cache__";
    __name(resolveProjectBySlug, "resolveProjectBySlug");
    __name(resolveProjectBySlugPath, "resolveProjectBySlugPath");
    __name(publicBaseFor, "publicBaseFor");
    __name(publicPathFor, "publicPathFor");
  }
});

// api/admin/blog/publish.js
var onRequestPost7;
var init_publish = __esm({
  "api/admin/blog/publish.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_topics();
    init_indexnow();
    init_google_indexing();
    init_aliases();
    init_dedup();
    init_quality();
    init_projects();
    init_social_queue();
    init_project_scope();
    init_events();
    onRequestPost7 = /* @__PURE__ */ __name(async ({ request, env, waitUntil }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const jobId = String(body.job_id || "");
      if (!jobId) return json(400, { error: "missing_job_id" });
      const job = await env.DB.prepare("SELECT * FROM blog_jobs WHERE id = ? LIMIT 1").bind(jobId).first();
      if (!job) return json(404, { error: "job_not_found" });
      if (job.status === "published" && job.blog_post_id) {
        return json(200, { ok: true, status: "published", blog_post_id: job.blog_post_id, slug: job.slug, idempotent: true });
      }
      if (job.status !== "image_done") {
        return json(409, { error: "wrong_state", current: job.status, hint: "call /image first" });
      }
      if (!job.title || !job.slug || !job.body_markdown) {
        return json(409, { error: "job_incomplete" });
      }
      const verdict = scorePost({
        title: job.title,
        body_markdown: job.body_markdown,
        meta_description: job.meta_description,
        slug: job.slug
      });
      const finalStatus = statusForScore(verdict, { forcePublish: !!body.force_publish });
      const postId = newId();
      const t = nowSec();
      await env.DB.prepare(
        `INSERT INTO blog_posts (id, slug, title, meta_description, body_markdown,
        hero_image_key, hero_image_alt, status, topic_seed, keywords,
        ai_provider, project_id, created_at, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        postId,
        job.slug,
        job.title,
        job.meta_description,
        job.body_markdown,
        job.hero_image_key,
        job.hero_image_alt,
        finalStatus,
        job.topic_key,
        job.keywords,
        job.ai_provider,
        job.project_id || null,
        t,
        t
      ).run();
      await env.DB.prepare(
        "UPDATE blog_jobs SET status='published', blog_post_id=?, updated_at=? WHERE id=?"
      ).bind(postId, t, jobId).run();
      await env.DB.prepare(
        "UPDATE content_calendar SET status='published', post_id=?, updated_at=? WHERE job_id=?"
      ).bind(postId, t, jobId).run().catch(() => {
      });
      await markTopicUsed(env, job.topic_key).catch(() => {
      });
      if (finalStatus === "published") {
        const base = await publicBaseFor(env, job.project_id || null, request);
        const newUrls = [`${base}/blog`, `${base}/blog/${job.slug}`];
        const blogHost = new URL(base).hostname;
        waitUntil(pingIndexNow(env, newUrls, request, blogHost).catch(() => {
        }));
        waitUntil(onPublish(env, newUrls).catch(() => {
        }));
        waitUntil(syncSitemapAliases(env, job.project_id || null).catch(() => {
        }));
        waitUntil(trackOnce(env, { event: "first_post_published", projectId: job.project_id, props: { slug: job.slug } }));
        waitUntil(storeEmbedding(env, job.slug, {
          title: job.title,
          body_markdown: job.body_markdown,
          meta_description: job.meta_description
        }).catch(() => {
        }));
        if (job.project_id) {
          const proj = await getProject(env, job.project_id).catch(() => null);
          const channel = proj?.publishing_config?.publisher_type;
          if (channel && channel !== "internal_d1") {
            const q = await enqueueSocialPost(env, {
              projectId: job.project_id,
              blogPostId: postId,
              channel
            }).catch(() => ({ enqueued: false }));
            if (q.enqueued) {
              waitUntil(drainSocialQueue(env, { projectId: job.project_id, limit: 3 }).catch(() => {
              }));
            }
          }
        }
      }
      audit(env, "admin", "blog_publish", postId, {
        job_id: jobId,
        slug: job.slug,
        status: finalStatus,
        quality: { score: verdict.score, band: verdict.band, issues: verdict.issues, stats: verdict.stats }
      });
      return json(200, {
        ok: true,
        status: finalStatus,
        blog_post_id: postId,
        slug: job.slug,
        title: job.title,
        quality: verdict
      });
    }, "onRequestPost");
  }
});

// api/admin/blog/rename-slug.js
async function ensureRedirectTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS blog_post_redirects (
       old_slug   TEXT PRIMARY KEY,
       new_slug   TEXT NOT NULL,
       created_at INTEGER NOT NULL
     )`
  ).run();
}
var onRequestPost8;
var init_rename_slug = __esm({
  "api/admin/blog/rename-slug.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    __name(ensureRedirectTable, "ensureRedirectTable");
    onRequestPost8 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const oldSlug = String(body.old_slug || "").trim().toLowerCase();
      let newSlug = String(body.new_slug || "").trim().toLowerCase();
      if (!oldSlug || !newSlug) return json(400, { error: "missing_slugs" });
      newSlug = slugify(newSlug);
      if (!/^[a-z][a-z0-9-]{1,80}$/.test(newSlug)) return json(400, { error: "bad_new_slug" });
      if (oldSlug === newSlug) return json(400, { error: "same_slug" });
      const existing = await env.DB.prepare(
        `SELECT id FROM blog_posts WHERE slug = ? LIMIT 1`
      ).bind(oldSlug).first();
      if (!existing) return json(404, { error: "old_slug_not_found" });
      const collision = await env.DB.prepare(
        `SELECT id FROM blog_posts WHERE slug = ? LIMIT 1`
      ).bind(newSlug).first();
      if (collision) return json(409, { error: "new_slug_in_use" });
      await ensureRedirectTable(env);
      const now = Math.floor(Date.now() / 1e3);
      await env.DB.prepare(
        `UPDATE blog_posts SET slug = ? WHERE slug = ?`
      ).bind(newSlug, oldSlug).run();
      await env.DB.prepare(
        `INSERT INTO blog_post_redirects (old_slug, new_slug, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(old_slug) DO UPDATE SET new_slug = excluded.new_slug`
      ).bind(oldSlug, newSlug, now).run();
      await audit(env, "admin", "blog_rename_slug", existing.id, {
        old_slug: oldSlug,
        new_slug: newSlug
      }).catch(() => {
      });
      return json(200, { ok: true, old_slug: oldSlug, new_slug: newSlug });
    }, "onRequestPost");
  }
});

// api/admin/blog/retry-job.js
var onRequestPost9;
var init_retry_job = __esm({
  "api/admin/blog/retry-job.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    onRequestPost9 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const id = String(body.id || "").trim();
      if (!id) return json(400, { error: "missing_id" });
      const job = await env.DB.prepare("SELECT id, status, error FROM blog_jobs WHERE id = ? LIMIT 1").bind(id).first();
      if (!job) return json(404, { error: "not_found" });
      if (job.status === "published") return json(409, { error: "already_published" });
      let target;
      if (job.status === "failed") {
        target = String(job.error || "").startsWith("image:") ? "text_done" : "created";
      } else {
        target = job.status;
      }
      await env.DB.prepare("UPDATE blog_jobs SET status=?, error=NULL, updated_at=? WHERE id=?").bind(target, nowSec(), id).run();
      return json(200, { ok: true, status: target });
    }, "onRequestPost");
  }
});

// _lib/ai/provider.js
async function generateContent2({
  env,
  project,
  taskType = "article",
  prompt,
  systemPrompt = "",
  maxTokens = 4e3,
  temperature = 0.7
}) {
  const tStart = Date.now();
  const aiCfg = project?.ai_config || {};
  const provider = aiCfg.default_text_provider || "workers-ai";
  let textResult = null;
  let errorMsg = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let costUsd = 0;
  try {
    textResult = await generateContent(env, {
      kind: taskType,
      seed: prompt,
      provider,
      brand: project?.brand,
      source: "project-engine"
    });
    if (textResult?.usage) {
      promptTokens = textResult.usage.prompt_tokens || 0;
      completionTokens = textResult.usage.completion_tokens || 0;
      totalTokens = textResult.usage.total_tokens || promptTokens + completionTokens;
    }
  } catch (err) {
    errorMsg = String(err?.message || err);
    throw err;
  } finally {
    const durationMs = Date.now() - tStart;
    if (env?.DB) {
      await env.DB.prepare(
        `INSERT INTO ai_runs (id, project_id, task_type, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, duration_ms, status, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        newId(),
        project?.id || null,
        taskType,
        provider,
        aiCfg.text_model || "default",
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd,
        durationMs,
        errorMsg ? "error" : "success",
        errorMsg,
        nowSec()
      ).run().catch(() => {
      });
    }
  }
  return textResult;
}
var init_provider = __esm({
  "_lib/ai/provider.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_ai();
    init_util();
    __name(generateContent2, "generateContent");
  }
});

// _lib/project_topics.js
async function listProjectTopics(env, projectId, { status = "candidate", limit = 50 } = {}) {
  if (!env?.DB) return [];
  const stmt = status === "all" ? env.DB.prepare(`SELECT * FROM project_topics WHERE project_id = ? ORDER BY relevance_score DESC, created_at DESC LIMIT ?`).bind(projectId, limit) : env.DB.prepare(`SELECT * FROM project_topics WHERE project_id = ? AND status = ? ORDER BY relevance_score DESC, created_at DESC LIMIT ?`).bind(projectId, status, limit);
  const { results } = await stmt.all().catch(() => ({ results: [] }));
  return results || [];
}
async function addProjectTopic(env, {
  projectId,
  key,
  angle,
  category = "general",
  source = "manual",
  relevanceScore = 85,
  businessValueScore = 85
}) {
  if (!env?.DB || !projectId || !key) return null;
  const id = newId();
  const t = nowSec();
  await env.DB.prepare(
    `INSERT INTO project_topics (id, project_id, key, angle, category, source, relevance_score, business_value_score, status, times_used, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'candidate', 0, ?, ?)`
  ).bind(
    id,
    projectId,
    key.trim(),
    (angle || key).trim(),
    category,
    source,
    relevanceScore,
    businessValueScore,
    t,
    t
  ).run();
  return { id, project_id: projectId, key, angle, category, relevance_score: relevanceScore };
}
async function pickNextProjectTopic(env, project) {
  if (!env?.DB || !project?.id) return null;
  const t = nowSec();
  try {
    const ranked = await scoreProjectTopics(env, project);
    const top = ranked[0];
    if (top) {
      await env.DB.prepare(
        `UPDATE project_topics SET status = 'selected', times_used = times_used + 1, last_used_at = ?, updated_at = ? WHERE id = ?`
      ).bind(t, t, top.id).run().catch(() => {
      });
      return { id: top.id, key: top.key, angle: top.angle, category: top.category };
    }
  } catch {
  }
  const candidate = await env.DB.prepare(
    `SELECT * FROM project_topics
     WHERE project_id = ? AND status = 'candidate'
     ORDER BY relevance_score DESC, created_at ASC
     LIMIT 1`
  ).bind(project.id).first().catch(() => null);
  if (candidate) {
    await env.DB.prepare(
      `UPDATE project_topics SET status = 'selected', times_used = times_used + 1, last_used_at = ?, updated_at = ? WHERE id = ?`
    ).bind(t, t, candidate.id).run().catch(() => {
    });
    return {
      id: candidate.id,
      key: candidate.key,
      angle: candidate.angle,
      category: candidate.category
    };
  }
  const generated = await generateAutonomousTopics(env, project, { count: 3 });
  if (generated && generated.length > 0) {
    const first = generated[0];
    await env.DB.prepare(
      `UPDATE project_topics SET status = 'selected', times_used = times_used + 1, last_used_at = ?, updated_at = ? WHERE id = ?`
    ).bind(t, t, first.id).run().catch(() => {
    });
    return first;
  }
  return {
    key: `${project.name} Best Practices & Insights`,
    angle: `Practical strategies and actionable insights for ${project.brand?.audience || "professionals"}`,
    category: "general"
  };
}
async function generateAutonomousTopics(env, project, { count = 5 } = {}) {
  const brand2 = project.brand || {};
  const prompt = `You are an expert SEO content strategist.
Generate ${count} high-intent, unique blog post topic candidates for this brand:
Brand: ${project.name} (${project.website_url || ""})
Business Type: ${brand2.business_type || "Technology/Business"}
Target Audience: ${brand2.audience || "Business owners and developers"}
Key Themes: ${brand2.key_themes || "Digital transformation, efficiency, technology"}
Language: ${project.language || "vi"}

Return ONLY a strict JSON array of objects with keys:
"key": Target SEO keyword/phrase
"angle": Compelling article angle/hook
"category": Category name
"relevance_score": Integer 70-100
"business_value_score": Integer 70-100

JSON Output:`;
  let response;
  try {
    response = await generateContent2({
      env,
      project,
      taskType: "topic",
      prompt,
      temperature: 0.8
    });
  } catch (err) {
    return [];
  }
  const text = response?.text || "";
  const match2 = text.match(/\[[\s\S]*\]/);
  if (!match2) return [];
  let items = [];
  try {
    items = JSON.parse(match2[0]);
  } catch {
    return [];
  }
  const created = [];
  for (const item2 of items) {
    if (item2.key && item2.angle) {
      const row = await addProjectTopic(env, {
        projectId: project.id,
        key: item2.key,
        angle: item2.angle,
        category: item2.category || "general",
        source: "ai",
        relevanceScore: item2.relevance_score || 80,
        businessValueScore: item2.business_value_score || 80
      });
      if (row) created.push(row);
    }
  }
  return created;
}
function classifyIntent(key) {
  const k = String(key || "").toLowerCase();
  if (/(mua|giá|báo giá|bảng giá|thuê|đặt|buy|price|pricing|order|book)/.test(k)) return "transactional";
  if (/(tốt nhất|top|so sánh|review|đánh giá|vs\.?|best|compare)/.test(k)) return "commercial";
  return "informational";
}
function intentFit(key) {
  const k = String(key || "").toLowerCase();
  return COMMERCIAL_CUES.some((c) => k.includes(c)) ? 90 : 70;
}
function freshnessFor(createdAt, now) {
  const ageDays = Math.max(0, (now - (createdAt || now)) / 86400);
  return Math.max(20, Math.round(100 - ageDays * 2));
}
function competitionFor(key, snapshots) {
  const k = String(key || "").toLowerCase();
  const words = k.split(/\s+/).filter((w) => w.length > 3);
  const hits = (snapshots || []).filter((s) => {
    const sk = String(s.keyword || "").toLowerCase();
    return sk && (sk.includes(k.slice(0, 24)) || words.some((w) => sk.includes(w)));
  });
  if (!hits.length) return 50;
  const avgWords = hits.reduce((a, s) => a + (s.avg_words || 0), 0) / hits.length;
  return Math.min(95, Math.max(40, Math.round(50 + avgWords / 100)));
}
function finalScore(topic, snapshots, now) {
  const relevance = topic.relevance_score ?? 80;
  const business = topic.business_value_score ?? 80;
  const freshness = freshnessFor(topic.created_at, now);
  const competition = competitionFor(topic.key, snapshots);
  const intent = intentFit(topic.key);
  const final = Math.round(
    0.3 * relevance + 0.25 * business + 0.2 * freshness + 0.15 * (100 - competition) + 0.1 * intent
  );
  return { relevance, business, freshness, competition, intent, final };
}
async function ensurePillars(env, project) {
  const existing = await env.DB.prepare(
    `SELECT pillar_key FROM content_clusters WHERE project_id = ? AND status = 'active' GROUP BY pillar_key`
  ).bind(project.id).all().catch(() => ({ results: [] }));
  if ((existing?.results || []).length >= 3) return existing.results.map((r) => r.pillar_key);
  const themes = String(project.brand?.key_themes || "").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const pillars = themes.length ? themes.map((t2) => slugify(t2).slice(0, 60) || "general") : ["general"];
  const t = nowSec();
  for (const p of [...new Set(pillars)]) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO content_clusters (id, project_id, pillar_key, cluster_key, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`
    ).bind(newId(), project.id, p, p, t, t).run().catch(() => {
    });
  }
  return [...new Set(pillars)];
}
async function scoreProjectTopics(env, project) {
  if (!env?.DB || !project?.id) return [];
  const t = nowSec();
  const pillars = await ensurePillars(env, project).catch(() => ["general"]);
  const { results } = await env.DB.prepare(
    `SELECT * FROM project_topics WHERE project_id = ? AND status = 'candidate' ORDER BY created_at ASC LIMIT 100`
  ).bind(project.id).all().catch(() => ({ results: [] }));
  const candidates = results || [];
  if (!candidates.length) return [];
  const snapRows = await env.DB.prepare(
    `SELECT keyword, AVG(word_count) AS avg_words FROM competitor_snapshots
      WHERE project_id = ? AND created_at > ? GROUP BY keyword`
  ).bind(project.id, t - 7 * 86400).all().catch(() => ({ results: [] }));
  const snapshots = snapRows?.results || [];
  const ranked = [];
  for (const c of candidates) {
    const s = finalScore(c, snapshots, t);
    const intent = classifyIntent(c.key);
    if (s.final < 60) {
      await env.DB.prepare(
        `UPDATE project_topics SET status = 'archived', competition_score = ?, freshness_score = ?, search_intent = ?, updated_at = ? WHERE id = ?`
      ).bind(s.competition, s.freshness, intent, t, c.id).run().catch(() => {
      });
      continue;
    }
    await env.DB.prepare(
      `UPDATE project_topics SET competition_score = ?, freshness_score = ?, search_intent = ?, updated_at = ? WHERE id = ?`
    ).bind(s.competition, s.freshness, intent, t, c.id).run().catch(() => {
    });
    const pillar = pillars.includes(slugify(c.category || "").slice(0, 60)) ? slugify(c.category).slice(0, 60) : pillars[0];
    await env.DB.prepare(
      `INSERT OR IGNORE INTO content_clusters (id, project_id, pillar_key, cluster_key, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`
    ).bind(newId(), project.id, pillar, c.key.slice(0, 120), t, t).run().catch(() => {
    });
    ranked.push({ id: c.id, key: c.key, angle: c.angle, category: c.category, pillar, intent, ...s });
  }
  ranked.sort((a, b) => b.final - a.final);
  return ranked;
}
var COMMERCIAL_CUES;
var init_project_topics = __esm({
  "_lib/project_topics.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_provider();
    __name(listProjectTopics, "listProjectTopics");
    __name(addProjectTopic, "addProjectTopic");
    __name(pickNextProjectTopic, "pickNextProjectTopic");
    __name(generateAutonomousTopics, "generateAutonomousTopics");
    COMMERCIAL_CUES = [
      "mua",
      "gi\xE1",
      "b\xE1o gi\xE1",
      "b\u1EA3ng gi\xE1",
      "d\u1ECBch v\u1EE5",
      "t\u1ED1t nh\u1EA5t",
      "top",
      "review",
      "\u0111\xE1nh gi\xE1",
      "h\u01B0\u1EDBng d\u1EABn",
      "c\xE1ch",
      "kinh nghi\u1EC7m",
      "so s\xE1nh",
      "buy",
      "price",
      "pricing",
      "best",
      "review",
      "how to",
      "guide"
    ];
    __name(classifyIntent, "classifyIntent");
    __name(intentFit, "intentFit");
    __name(freshnessFor, "freshnessFor");
    __name(competitionFor, "competitionFor");
    __name(finalScore, "finalScore");
    __name(ensurePillars, "ensurePillars");
    __name(scoreProjectTopics, "scoreProjectTopics");
  }
});

// _lib/calendar_planner.js
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(d, n) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}
function buildPlannerPrompt(brand2, days, recentTitles) {
  const themes = String(brand2.brand_key_themes || "").split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  const avoid = String(brand2.brand_topics_to_avoid || "").trim();
  const recentBlock = recentTitles.length ? `
Recently planned or published titles (DO NOT repeat these or near-duplicates):
${recentTitles.map((t) => "  - " + t).join("\n")}` : "";
  return [
    `You are an editorial planner for a content marketing programme.`,
    `Plan ${days} distinct blog post ideas for the brand described below.`,
    `Each idea must be:`,
    `  - directly relevant to the brand's audience and themes,`,
    `  - SEO-friendly (target one clear primary keyword phrase),`,
    `  - non-overlapping with the other ideas in this batch,`,
    `  - specific enough that a writer could draft a 900\u20131300 word article from just the title + angle.`,
    `Mix evergreen pillars with more focused, long-tail topics.`,
    "",
    `## Brand`,
    `Business: ${brand2.brand_business_type || "(unspecified)"}`,
    `Voice: ${brand2.brand_voice_tone || "(unspecified)"}`,
    `Audience: ${brand2.brand_target_audience || "(unspecified)"}`,
    themes.length ? `Themes to cover: ${themes.join(", ")}` : "",
    brand2.brand_service_area ? `Service area: ${brand2.brand_service_area}` : "",
    avoid ? `Topics to avoid: ${avoid}` : "",
    recentBlock,
    "",
    `## Output format`,
    `Return STRICT JSON only \u2014 no markdown fences, no prose outside the braces:`,
    `{`,
    `  "ideas": [`,
    `    { "title": "...", "primary_keyword": "...", "angle": "1-2 sentences of editorial direction" },`,
    `    ...`,
    `  ]`,
    `}`,
    `Return exactly ${days} items. Titles must be unique. Keep titles under 80 chars.`
  ].filter(Boolean).join("\n");
}
async function recentTitleList(env, limit = 40, projectId = null) {
  const pf = projectId ? ` AND (project_id = ? OR project_id IS NULL)` : "";
  const recent = [];
  const recentPosts = await env.DB.prepare(
    `SELECT title FROM blog_posts WHERE status='published'${pf} ORDER BY published_at DESC LIMIT ?`
  ).bind(...projectId ? [projectId, limit] : [limit]).all().catch(() => ({ results: [] }));
  const futureSlots = await env.DB.prepare(
    `SELECT title FROM content_calendar
      WHERE status IN ('scheduled','generating','draft')${pf} ORDER BY scheduled_for ASC LIMIT ?`
  ).bind(...projectId ? [projectId, limit] : [limit]).all().catch(() => ({ results: [] }));
  for (const r of recentPosts.results || []) recent.push(r.title);
  for (const r of futureSlots.results || []) recent.push(r.title);
  return recent;
}
async function planCalendar(env, { days = 28, replace = false, preferredProvider = "", startOffset = 1, source = "admin-calendar", projectId = null, brand: brand2 = null } = {}) {
  let activeBrand = brand2;
  if (!activeBrand && projectId && env?.DB?.prepare) {
    const row = await env.DB.prepare(
      `SELECT business_type, tone, audience, key_themes, topics_to_avoid, service_area, cta
         FROM project_brands WHERE project_id = ? LIMIT 1`
    ).bind(projectId).first().catch(() => null);
    if (row) {
      activeBrand = {
        brand_business_type: row.business_type,
        brand_voice_tone: row.tone,
        brand_target_audience: row.audience,
        brand_key_themes: row.key_themes,
        brand_topics_to_avoid: row.topics_to_avoid,
        brand_service_area: row.service_area,
        brand_cta: row.cta
      };
    }
  }
  const settings = activeBrand || await loadSettings(env);
  if (!settings.brand_business_type && !settings.brand_target_audience) {
    const err = new Error("no_brand_dna");
    err.code = "no_brand_dna";
    throw err;
  }
  const today = /* @__PURE__ */ new Date(isoDate(/* @__PURE__ */ new Date()) + "T00:00:00Z");
  if (replace) {
    if (projectId) {
      await env.DB.prepare(
        `DELETE FROM content_calendar WHERE status = 'scheduled' AND scheduled_for >= ? AND project_id = ?`
      ).bind(isoDate(today), projectId).run();
    } else {
      await env.DB.prepare(
        `DELETE FROM content_calendar WHERE status = 'scheduled' AND scheduled_for >= ?`
      ).bind(isoDate(today)).run();
    }
  }
  const horizon = addDays(today, days * 2 + startOffset);
  const projectFilter = projectId ? `AND (project_id = ? OR project_id IS NULL)` : ``;
  const takenArgs = projectId ? [isoDate(today), isoDate(horizon), projectId] : [isoDate(today), isoDate(horizon)];
  const takenRows = await env.DB.prepare(
    `SELECT scheduled_for FROM content_calendar
      WHERE status IN ('scheduled','generating','draft','published')
        AND scheduled_for >= ? AND scheduled_for <= ? ${projectFilter}`
  ).bind(...takenArgs).all().catch(() => ({ results: [] }));
  const taken = new Set((takenRows.results || []).map((r) => r.scheduled_for));
  const prompt = buildPlannerPrompt(settings, days, await recentTitleList(env));
  const out = await callRawLLM(env, prompt, {
    sys: "You are an editorial planner. Return strict JSON only.",
    preferredProvider,
    kind: "calendar-plan",
    source
  });
  const ideas = Array.isArray(out.parsed?.ideas) ? out.parsed.ideas : [];
  if (!ideas.length) {
    const err = new Error("planner_empty");
    err.code = "planner_empty";
    throw err;
  }
  const slots = [];
  let cursor = addDays(today, startOffset);
  let safety = 0;
  for (const raw of ideas) {
    while (taken.has(isoDate(cursor))) {
      cursor = addDays(cursor, 1);
      if (++safety > days * 3) break;
    }
    const title = String(raw?.title || "").trim().slice(0, 200);
    if (!title) {
      cursor = addDays(cursor, 1);
      continue;
    }
    slots.push({
      id: newId(),
      project_id: projectId || null,
      scheduled_for: isoDate(cursor),
      title,
      primary_keyword: String(raw?.primary_keyword || "").trim().slice(0, 120) || null,
      angle: String(raw?.angle || "").trim().slice(0, 500) || null
    });
    taken.add(isoDate(cursor));
    cursor = addDays(cursor, 1);
  }
  if (!slots.length) return { slots: [], provider: out.provider };
  const now = nowSec();
  const batch = slots.map(
    (s) => env.DB.prepare(
      `INSERT INTO content_calendar
         (id, project_id, scheduled_for, title, primary_keyword, angle, status, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'scheduled', 'planner', ?, ?)`
    ).bind(s.id, s.project_id, s.scheduled_for, s.title, s.primary_keyword, s.angle, now, now)
  );
  await env.DB.batch(batch);
  return { slots, provider: out.provider };
}
async function planSingleForToday(env, { preferredProvider = "", source = "cron-jit", projectId = null } = {}) {
  let settings = await loadSettings(env);
  if (projectId && env?.DB?.prepare) {
    const row = await env.DB.prepare(
      `SELECT business_type, tone, audience, key_themes, topics_to_avoid, service_area, cta
         FROM project_brands WHERE project_id = ? LIMIT 1`
    ).bind(projectId).first().catch(() => null);
    if (row) {
      settings = {
        ...settings,
        brand_business_type: row.business_type,
        brand_voice_tone: row.tone,
        brand_target_audience: row.audience,
        brand_key_themes: row.key_themes,
        brand_topics_to_avoid: row.topics_to_avoid,
        brand_service_area: row.service_area,
        brand_cta: row.cta
      };
    }
  }
  if (!settings.brand_business_type && !settings.brand_target_audience) {
    return null;
  }
  const today = isoDate(/* @__PURE__ */ new Date());
  const existing = projectId ? await env.DB.prepare(
    `SELECT id FROM content_calendar WHERE scheduled_for = ? AND status='scheduled'
           AND (project_id = ? OR project_id IS NULL) LIMIT 1`
  ).bind(today, projectId).first().catch(() => null) : await env.DB.prepare(
    `SELECT id FROM content_calendar WHERE scheduled_for = ? AND status='scheduled' LIMIT 1`
  ).bind(today).first().catch(() => null);
  if (existing) {
    return env.DB.prepare(`SELECT * FROM content_calendar WHERE id = ?`).bind(existing.id).first();
  }
  const prompt = buildPlannerPrompt(settings, 1, await recentTitleList(env, 40, projectId));
  let out;
  try {
    out = await callRawLLM(env, prompt, {
      sys: "You are an editorial planner. Return strict JSON only.",
      preferredProvider,
      kind: "calendar-plan",
      source
    });
  } catch {
    return null;
  }
  const idea = Array.isArray(out.parsed?.ideas) ? out.parsed.ideas[0] : null;
  const title = String(idea?.title || "").trim().slice(0, 200);
  if (!title) return null;
  const id = newId();
  const now = nowSec();
  await env.DB.prepare(
    `INSERT INTO content_calendar
       (id, project_id, scheduled_for, title, primary_keyword, angle, status, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'scheduled', 'jit', ?, ?)`
  ).bind(
    id,
    projectId || null,
    today,
    title,
    String(idea?.primary_keyword || "").trim().slice(0, 120) || null,
    String(idea?.angle || "").trim().slice(0, 500) || null,
    now,
    now
  ).run();
  return env.DB.prepare(`SELECT * FROM content_calendar WHERE id = ?`).bind(id).first();
}
var init_calendar_planner = __esm({
  "_lib/calendar_planner.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_settings();
    init_raw_llm();
    __name(isoDate, "isoDate");
    __name(addDays, "addDays");
    __name(buildPlannerPrompt, "buildPlannerPrompt");
    __name(recentTitleList, "recentTitleList");
    __name(planCalendar, "planCalendar");
    __name(planSingleForToday, "planSingleForToday");
  }
});

// api/admin/blog/start.js
function todayUtc() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
async function loadSlot(env, id) {
  return env.DB.prepare(
    `SELECT * FROM content_calendar WHERE id = ? LIMIT 1`
  ).bind(id).first().catch(() => null);
}
async function nextDueSlot(env, projectId) {
  return projectId ? env.DB.prepare(
    `SELECT * FROM content_calendar
          WHERE status = 'scheduled' AND scheduled_for <= ?
            AND (project_id = ? OR project_id IS NULL)
          ORDER BY scheduled_for ASC, created_at ASC LIMIT 1`
  ).bind(todayUtc(), projectId).first().catch(() => null) : env.DB.prepare(
    `SELECT * FROM content_calendar
          WHERE status = 'scheduled' AND scheduled_for <= ?
          ORDER BY scheduled_for ASC, created_at ASC LIMIT 1`
  ).bind(todayUtc()).first().catch(() => null);
}
var onRequestPost10;
var init_start = __esm({
  "api/admin/blog/start.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_topics();
    init_projects();
    init_project_topics();
    init_calendar_planner();
    init_dedup();
    __name(todayUtc, "todayUtc");
    __name(loadSlot, "loadSlot");
    __name(nextDueSlot, "nextDueSlot");
    onRequestPost10 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      let body = {};
      try {
        body = await request.json();
      } catch {
      }
      let projectId = tenant?.activeProjectId || String(body.project_id || "").trim() || null;
      if (projectId) {
        const userRow = auth.userId ? await env.DB.prepare("SELECT plan_tier, post_limit, role FROM users WHERE id = ?").bind(auth.userId).first().catch(() => null) : null;
        const isFree = (userRow?.plan_tier || auth.plan_tier) === "free" && auth.role !== "super_admin";
        if (isFree) {
          const limit = userRow?.post_limit || 100;
          const countRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM blog_posts WHERE project_id = ?").bind(projectId).first().catch(() => ({ total: 0 }));
          const currentTotal = countRow?.total || 0;
          if (currentTotal >= limit) {
            return json(403, {
              error: "post_quota_exceeded",
              detail: `T\xE0i kho\u1EA3n g\xF3i Free \u0111\xE3 \u0111\u1EA1t gi\u1EDBi h\u1EA1n ${limit} b\xE0i vi\u1EBFt SEO mi\u1EC5n ph\xED (${currentTotal}/${limit}). Vui l\xF2ng li\xEAn h\u1EC7 \u0111\u1EC3 n\xE2ng c\u1EA5p.`
            });
          }
        }
      }
      let topic = null;
      let slot = null;
      if (body.calendar_slot_id) {
        slot = await loadSlot(env, String(body.calendar_slot_id));
        if (!slot) return json(404, { error: "slot_not_found" });
        if (slot.status !== "scheduled" && slot.status !== "draft") {
          return json(409, { error: "slot_not_runnable", detail: "status=" + slot.status });
        }
      } else if (body.from_calendar) {
        slot = await nextDueSlot(env, projectId);
        if (!slot) {
          slot = await planSingleForToday(env, { source: "cron-jit", projectId }).catch(() => null);
        }
      } else if (body.topic_key && body.angle) {
        topic = { key: String(body.topic_key), angle: String(body.angle) };
      }
      if (slot?.project_id) {
        if (projectId && slot.project_id !== projectId) {
          return json(409, { error: "slot_other_project" });
        }
        projectId = slot.project_id;
      }
      if (slot) {
        topic = {
          key: slot.primary_keyword || slot.title,
          angle: slot.angle || slot.title
        };
      }
      let dupInfo = null;
      if (!body.skip_dedup && !topic && !slot) {
        const project = projectId ? await getProject(env, projectId) : null;
        const pickTopic = project ? () => pickNextProjectTopic(env, project) : () => pickNextTopic(env);
        const pick = await pickNonDuplicate(env, pickTopic, { maxTries: 5, projectId });
        if (pick.topic) {
          topic = pick.topic;
          dupInfo = { similarity: pick.dup?.similarity, fallback: pick.fallback, tries: pick.tries, against: pick.dup?.against };
        }
      } else if (!body.skip_dedup && topic) {
        const dup = await checkDuplicate(env, { title: topic.key, angle: topic.angle, projectId });
        dupInfo = { similarity: dup.similarity, duplicate: dup.duplicate, against: dup.against };
        if (dup.duplicate) {
          await audit(env, "cron", "dedup.warn", topic.key, JSON.stringify({
            similarity: dup.similarity,
            against: dup.against?.slug
          })).catch(() => {
          });
        }
      }
      if (!topic) {
        if (projectId) return json(503, { error: "no_project_topic", detail: "no due calendar slot and no brand DNA for this project" });
        topic = await pickNextTopic(env);
      }
      if (!topic) return json(500, { error: "no_topic_available" });
      const id = newId();
      const t = nowSec();
      if (slot) {
        const claim = await env.DB.prepare(
          `UPDATE content_calendar SET status='generating', job_id=?, updated_at=?
        WHERE id=? AND status IN ('scheduled','draft')`
        ).bind(id, t, slot.id).run();
        if (!claim?.meta?.changes) {
          return json(409, { error: "slot_already_claimed", detail: "slot left schedulable state before claim" });
        }
      }
      try {
        await env.DB.prepare(
          `INSERT INTO blog_jobs (id, status, topic_key, topic_angle, project_id, created_at, updated_at)
       VALUES (?, 'created', ?, ?, ?, ?, ?)`
        ).bind(id, topic.key, topic.angle, projectId, t, t).run();
      } catch (err) {
        if (slot) {
          await env.DB.prepare(
            `UPDATE content_calendar SET status='scheduled', job_id=NULL, updated_at=? WHERE id=?`
          ).bind(nowSec(), slot.id).run().catch(() => {
          });
        }
        throw err;
      }
      if (slot) {
        await audit(env, "cron", "calendar.claim", slot.id, JSON.stringify({ job_id: id }));
      }
      if (dupInfo) {
        await audit(env, "cron", "dedup.check", topic.key, JSON.stringify(dupInfo)).catch(() => {
        });
      }
      return json(200, {
        ok: true,
        job_id: id,
        status: "created",
        topic: topic.key,
        slot_id: slot?.id || null,
        dedup: dupInfo
      });
    }, "onRequestPost");
  }
});

// _lib/links/sanitise.js
function isInternalAllowed(url, allowedPrefixes) {
  if (!url.startsWith("/")) return false;
  if (url === "/") return true;
  return allowedPrefixes.some((p) => url === p.replace(/\/$/, "") || url.startsWith(p));
}
function isUrlSafe(url, allowedPrefixes) {
  if (!url) return false;
  if (url.startsWith("/")) {
    if (url.startsWith("//")) return false;
    return isInternalAllowed(url, allowedPrefixes);
  }
  return SAFE_PROTOCOLS.test(url);
}
function scopeInternal(url, basePath) {
  if (!basePath) return url;
  if (url === "/blog" || url.startsWith("/blog/") || url.startsWith("/p/")) return basePath + url;
  return url;
}
function sanitiseMarkdownLinks(md, opts = {}) {
  const basePath = String(opts.basePath || "").replace(/\/+$/, "");
  const allowedPrefixes = opts.allowedInternalPrefixes || (basePath ? [...DEFAULT_INTERNAL_PREFIXES, `${basePath}/blog/`, `${basePath}/p/`] : DEFAULT_INTERNAL_PREFIXES);
  const rawAliases = opts.aliases || {};
  const aliases = {};
  for (const [k, v] of Object.entries(rawAliases)) {
    aliases[k.toLowerCase()] = v && typeof v === "object" && "url" in v ? v.url : v;
  }
  let out = String(md || "");
  out = out.replace(LINK_RX, (match2, text, url) => {
    let target = url.trim();
    if (aliases[target.toLowerCase()]) target = aliases[target.toLowerCase()];
    target = scopeInternal(target, basePath);
    if (isUrlSafe(target, allowedPrefixes)) {
      return `[${text}](${target})`;
    }
    return text;
  });
  out = out.replace(BARE_URL_RX, (m, url) => {
    if (!isUrlSafe(url, allowedPrefixes)) return url;
    return `[${url}](${url})`;
  });
  return out;
}
var LINK_RX, BARE_URL_RX, SAFE_PROTOCOLS, DEFAULT_INTERNAL_PREFIXES;
var init_sanitise = __esm({
  "_lib/links/sanitise.js"() {
    init_functionsRoutes_0_09583509623234443();
    LINK_RX = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    BARE_URL_RX = /(?<![("\w])(https?:\/\/[A-Za-z0-9._~:/?#@!$&'*+,;=%-]+)(?![\w"])/g;
    SAFE_PROTOCOLS = /^(https?:|mailto:|tel:)/i;
    DEFAULT_INTERNAL_PREFIXES = ["/", "/blog", "/blog/", "/p/"];
    __name(isInternalAllowed, "isInternalAllowed");
    __name(isUrlSafe, "isUrlSafe");
    __name(scopeInternal, "scopeInternal");
    __name(sanitiseMarkdownLinks, "sanitiseMarkdownLinks");
  }
});

// _lib/internal_links.js
function stripFenced(md) {
  return md.replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length));
}
function foldVi(s) {
  return String(s || "").toLowerCase().replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, "a").replace(/[èéẹẻẽêềếệểễ]/g, "e").replace(/[ìíịỉĩ]/g, "i").replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, "o").replace(/[ùúụủũưừứựửữ]/g, "u").replace(/[ỳýỵỷỹ]/g, "y").replace(/đ/g, "d");
}
function buildPhrases(post) {
  const out = /* @__PURE__ */ new Set();
  const title = foldVi(post.title || "");
  const tWords = title.split(/\s+/).filter(Boolean);
  if (tWords.length >= MIN_PHRASE_WORDS && tWords.length <= MAX_PHRASE_WORDS) {
    out.add(title.replace(/[^a-z0-9\s]/g, "").trim());
  }
  const kws = String(post.keywords || "").split(",");
  for (const kRaw of kws) {
    const k = foldVi(kRaw).replace(/[^a-z0-9\s]/g, "").trim();
    const w = k.split(/\s+/).filter(Boolean);
    if (w.length >= MIN_PHRASE_WORDS && w.length <= MAX_PHRASE_WORDS) {
      out.add(k);
    }
  }
  return [...out];
}
function escapeRx(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function findUnlinkedMatch(body, phrase) {
  const rx = new RegExp(`\\b${escapeRx(phrase)}\\b`, "gi");
  let m;
  while ((m = rx.exec(body)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const before = body.slice(0, start);
    const lastOpen = before.lastIndexOf("[");
    const lastClose = before.lastIndexOf("]");
    if (lastOpen > lastClose) continue;
    const lastUrlOpen = before.lastIndexOf("](");
    const lastUrlClose = before.lastIndexOf(")");
    if (lastUrlOpen > lastUrlClose) continue;
    return { start, end };
  }
  return null;
}
function injectInternalLinks(body, selfSlug, targets, basePath = "") {
  if (!body || !Array.isArray(targets) || !targets.length) return { body, injected: [] };
  const scanOf = /* @__PURE__ */ __name((text) => foldVi(stripFenced(text)).toLowerCase(), "scanOf");
  const injected = [];
  const seenTargets = /* @__PURE__ */ new Set();
  let result = body;
  let cursorOffset = 0;
  const pairs = [];
  for (const t of targets) {
    if (t.slug === selfSlug) continue;
    for (const p of buildPhrases(t)) {
      if (p.length < 8) continue;
      pairs.push({ phrase: p, target: t });
    }
  }
  pairs.sort((a, b) => b.phrase.length - a.phrase.length);
  for (const { phrase, target } of pairs) {
    if (injected.length >= MAX_LINKS_PER_POST) break;
    if (seenTargets.has(target.slug)) continue;
    const hit = findUnlinkedMatch(scanOf(result), phrase);
    if (!hit) continue;
    const orig = result.slice(hit.start, hit.end);
    const replacement = `[${orig}](${basePath}/blog/${target.slug})`;
    result = result.slice(0, hit.start) + replacement + result.slice(hit.end);
    seenTargets.add(target.slug);
    injected.push({ slug: target.slug, phrase, original: orig });
  }
  if (!injected.length) {
    const picks = targets.filter((t) => t && t.slug && t.slug !== selfSlug).slice(0, MAX_RELATED_LINKS);
    if (picks.length) {
      const list = picks.map((t) => `- [${t.title || t.slug}](${basePath}/blog/${t.slug})`).join("\n");
      result = `${result.replace(/\s+$/, "")}

## B\xE0i vi\u1EBFt li\xEAn quan

${list}
`;
      for (const t of picks) injected.push({ slug: t.slug, phrase: null, related: true });
    }
  }
  return { body: result, injected };
}
async function loadLinkTargets(env, selfSlug, { limit = TARGET_POOL_SIZE, pillarKey = null, projectId = null } = {}) {
  const clauses = [`status='published'`, `slug != ?`];
  const args = [selfSlug || ""];
  if (projectId) {
    clauses.push(`project_id = ?`);
    args.push(projectId);
  }
  const order = pillarKey ? `CASE WHEN topic_seed IN (
         SELECT cluster_key FROM content_clusters WHERE pillar_key = ? AND status = 'active'
       ) THEN 0 ELSE 1 END, published_at DESC` : `published_at DESC`;
  if (pillarKey) args.push(pillarKey);
  args.push(limit);
  const rows = await env.DB.prepare(
    `SELECT slug, title, keywords FROM blog_posts
      WHERE ${clauses.join(" AND ")}
      ORDER BY ${order} LIMIT ?`
  ).bind(...args).all().catch(() => ({ results: [] }));
  return rows.results || [];
}
var MAX_LINKS_PER_POST, MAX_RELATED_LINKS, MIN_PHRASE_WORDS, MAX_PHRASE_WORDS, TARGET_POOL_SIZE;
var init_internal_links = __esm({
  "_lib/internal_links.js"() {
    init_functionsRoutes_0_09583509623234443();
    MAX_LINKS_PER_POST = 3;
    MAX_RELATED_LINKS = 3;
    MIN_PHRASE_WORDS = 3;
    MAX_PHRASE_WORDS = 6;
    TARGET_POOL_SIZE = 100;
    __name(stripFenced, "stripFenced");
    __name(foldVi, "foldVi");
    __name(buildPhrases, "buildPhrases");
    __name(escapeRx, "escapeRx");
    __name(findUnlinkedMatch, "findUnlinkedMatch");
    __name(injectInternalLinks, "injectInternalLinks");
    __name(loadLinkTargets, "loadLinkTargets");
  }
});

// api/admin/blog/text.js
var onRequestPost11;
var init_text = __esm({
  "api/admin/blog/text.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_ai();
    init_sanitise();
    init_aliases();
    init_settings();
    init_projects();
    init_project_scope();
    init_usage();
    init_internal_links();
    onRequestPost11 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const jobId = String(body.job_id || "");
      if (!jobId) return json(400, { error: "missing_job_id" });
      const job = await env.DB.prepare("SELECT * FROM blog_jobs WHERE id = ? LIMIT 1").bind(jobId).first();
      if (!job) return json(404, { error: "job_not_found" });
      if (["text_done", "image_done", "published"].includes(job.status)) {
        return json(200, { ok: true, job_id: jobId, status: job.status, idempotent: true });
      }
      if (job.status === "failed") return json(409, { error: "job_failed", detail: job.error });
      async function uniqSlug(candidate) {
        let slug2 = candidate;
        for (let n = 1; n <= 20; n++) {
          const a = await env.DB.prepare("SELECT 1 FROM blog_posts WHERE slug = ? LIMIT 1").bind(slug2).first();
          const b = await env.DB.prepare("SELECT 1 FROM blog_jobs WHERE slug = ? AND id != ? LIMIT 1").bind(slug2, jobId).first();
          if (!a && !b) return slug2;
          slug2 = `${candidate}-${n + 1}`;
        }
        return `${candidate}-${Date.now()}`;
      }
      __name(uniqSlug, "uniqSlug");
      const aliases = await buildAliasMap(env, job.project_id || null);
      const settings = await loadSettings(env);
      const basePath = await publicPathFor(env, job.project_id || null, request).catch(() => "");
      const source = request.headers.get("X-Source-Cron") === "1" ? "cron-blog" : "admin-blog";
      if (source === "cron-blog" && !body.allow_over_budget) {
        const b = await checkBudget(env, source);
        if (!b.allowed) {
          return json(429, { error: "budget_exceeded", month_spend_usd: b.spend, budget_usd: b.budget, pct: b.pct });
        }
      }
      let post;
      try {
        const project = job.project_id ? await getProject(env, job.project_id) : null;
        const pb = project?.brand || {};
        post = await generateContent(env, {
          kind: "article",
          seed: job.topic_angle,
          provider: body.provider || settings.default_ai_provider || void 0,
          source,
          projectId: job.project_id || null,
          brand: {
            // A tenant must be written in the tenant's own voice — project
            // brand DNA wins over the install-wide settings, which belong to
            // whichever brand the install was bootstrapped for.
            name: project?.site_name || settings.site_name || "this site",
            url: project?.website_url || settings.site_url || "/",
            cta: pb.cta || settings.site_cta,
            tone: pb.tone || settings.brand_voice_tone || settings.site_tone || void 0,
            audience: pb.audience || settings.brand_target_audience || settings.site_audience || void 0,
            business_type: pb.business_type || settings.brand_business_type || void 0,
            key_themes: pb.key_themes || settings.brand_key_themes || void 0,
            topics_to_avoid: pb.topics_to_avoid || settings.brand_topics_to_avoid || void 0,
            service_area: pb.service_area || settings.brand_service_area || void 0,
            aliases
          }
        });
      } catch (e) {
        const msg = String(e.message || e).slice(0, 800);
        await env.DB.prepare(
          "UPDATE blog_jobs SET status='failed', error=?, updated_at=? WHERE id=?"
        ).bind("text:" + msg, nowSec(), jobId).run();
        await env.DB.prepare(
          "UPDATE content_calendar SET status='scheduled', job_id=NULL, updated_at=? WHERE job_id=?"
        ).bind(nowSec(), jobId).run().catch(() => {
        });
        return json(502, { error: "text_generation_failed", detail: msg });
      }
      post.body_markdown = sanitiseMarkdownLinks(post.body_markdown, { aliases, basePath });
      let titleTouched = false;
      if (post.title) {
        const cleaned = String(post.title).replace(/^Blog(?:\s*[:\-]\s*|(?=[A-Z]))/, "");
        if (cleaned !== post.title) {
          post.title = cleaned;
          titleTouched = true;
        }
      }
      if (titleTouched) {
        post.slug = slugify(post.title);
      }
      const slug = await uniqSlug(post.slug);
      try {
        const pillarRow = job.topic_key ? await env.DB.prepare(
          `SELECT pillar_key FROM content_clusters WHERE cluster_key = ? AND status = 'active' LIMIT 1`
        ).bind(String(job.topic_key).slice(0, 120)).first().catch(() => null) : null;
        const targets = await loadLinkTargets(env, slug, { limit: 80, pillarKey: pillarRow?.pillar_key || null, projectId: job.project_id || null });
        if (targets.length) {
          const { body: linkedBody, injected } = injectInternalLinks(post.body_markdown, slug, targets, basePath);
          post.body_markdown = linkedBody;
          post._internal_links_injected = injected.length;
        }
      } catch {
      }
      await env.DB.prepare(
        `UPDATE blog_jobs
        SET status='text_done',
            primary_query=?, title=?, slug=?, meta_description=?,
            body_markdown=?, keywords=?,
            hero_image_prompt=?, hero_image_alt=?,
            ai_provider=?,
            updated_at=?
      WHERE id=?`
      ).bind(
        post.primary_query,
        post.title,
        slug,
        post.meta_description,
        post.body_markdown,
        post.keywords,
        post.hero_image_prompt,
        post.hero_image_alt,
        post.ai_provider,
        nowSec(),
        jobId
      ).run();
      return json(200, { ok: true, job_id: jobId, status: "text_done", slug, title: post.title, ai_provider: post.ai_provider });
    }, "onRequestPost");
  }
});

// api/admin/calendar/plan.js
var onRequestPost12;
var init_plan = __esm({
  "api/admin/calendar/plan.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_calendar_planner();
    init_events();
    onRequestPost12 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      const activeProjectId = tenant?.activeProjectId || null;
      let body = {};
      try {
        body = await request.json();
      } catch {
      }
      const days = Math.max(1, Math.min(60, parseInt(body.days, 10) || 28));
      const replace = !!body.replace;
      const provider = String(body.provider || "").trim() || "";
      try {
        const result = await planCalendar(env, {
          days,
          replace,
          preferredProvider: provider,
          projectId: activeProjectId
        });
        await audit(env, "admin", "calendar.plan", "", JSON.stringify({ days, inserted: result.slots.length, replace, project_id: activeProjectId }));
        await track(env, { event: "calendar_planned", projectId: activeProjectId, props: { days, slots: result.slots.length } });
        return json(200, {
          ok: true,
          inserted: result.slots.length,
          slots: result.slots,
          project_id: activeProjectId,
          project_slug: tenant?.activeProjectSlug || null
        });
      } catch (e) {
        if (e.code === "no_brand_dna") {
          return json(422, { error: "no_brand_dna", detail: "Save your Brand DNA before planning." });
        }
        if (e.code === "planner_empty") {
          return json(502, { error: "planner_empty" });
        }
        return json(502, { error: "planner_failed", detail: String(e?.message || e) });
      }
    }, "onRequestPost");
  }
});

// api/admin/competitors/scan.js
function isPublicHttpUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (h === "::1" || h === "0.0.0.0" || h === "169.254.169.254") return false;
  if (/^(127\.|10\.|192\.168\.|0\.)/.test(h)) return false;
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172 && +m172[1] >= 16 && +m172[1] <= 31) return false;
  return true;
}
function measureHtml(html2) {
  const src = String(html2 || "").slice(0, MAX_HTML_CHARS);
  const lower = src.toLowerCase();
  const countTag = /* @__PURE__ */ __name((tag) => (lower.match(new RegExp("<" + tag + "[\\s>]", "g")) || []).length, "countTag");
  const text = src.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount2 = text ? text.split(" ").length : 0;
  const titleMatch = src.match(/<title[^>]*>([\s\S]{1,300})<\/title>/i);
  return {
    title: titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "",
    word_count: wordCount2,
    h2_count: countTag("h2"),
    link_count: countTag("a")
  };
}
var CACHE_TTL_SEC, MAX_URLS, MAX_HTML_CHARS, onRequestPost13;
var init_scan = __esm({
  "api/admin/competitors/scan.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_projects();
    CACHE_TTL_SEC = 7 * 24 * 3600;
    MAX_URLS = 5;
    MAX_HTML_CHARS = 4e5;
    __name(isPublicHttpUrl, "isPublicHttpUrl");
    __name(measureHtml, "measureHtml");
    onRequestPost13 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      if (!env?.DB) return json(500, { error: "no_db" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const projectId = String(body?.project_id || body?.project || "").trim();
      const keyword = String(body?.keyword || "").trim().slice(0, 200);
      if (!projectId) return json(400, { error: "missing_project_id" });
      if (!keyword) return json(400, { error: "missing_keyword" });
      const project = await getProject(env, projectId);
      if (!project) return json(404, { error: "project_not_found" });
      const since = nowSec() - CACHE_TTL_SEC;
      const cached = await env.DB.prepare(
        `SELECT competitor_url, title, word_count, h2_count, link_count, created_at
       FROM competitor_snapshots WHERE project_id = ? AND keyword = ? AND created_at > ?
       ORDER BY created_at DESC LIMIT ?`
      ).bind(project.id, keyword, since, MAX_URLS).all().catch(() => ({ results: [] }));
      if (cached?.results?.length) {
        return json(200, { ok: true, keyword, snapshots: cached.results, cached: true });
      }
      const rawUrls = Array.isArray(body?.urls) ? body.urls : [];
      const urls = [...new Set(rawUrls.map((u) => String(u).trim()).filter(Boolean))].slice(0, MAX_URLS);
      if (!urls.length) return json(400, { error: "missing_urls", hint: "Provide 1-5 rival URLs to measure." });
      const bad = urls.filter((u) => !isPublicHttpUrl(u));
      if (bad.length) return json(400, { error: "invalid_url", detail: bad[0].slice(0, 120) });
      const t = nowSec();
      const snapshots = [];
      for (const url of urls) {
        try {
          const r = await fetch(url, { headers: { "user-agent": "GulagiBlogs/1.0 (+https://gulagi.com/blog)" } });
          if (!r.ok) throw new Error("http_" + r.status);
          const html2 = await r.text();
          const m = measureHtml(html2);
          await env.DB.prepare(
            `INSERT INTO competitor_snapshots (id, project_id, keyword, competitor_url, title, word_count, h2_count, link_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(newId(), project.id, keyword, url, m.title, m.word_count, m.h2_count, m.link_count, t).run();
          snapshots.push({ competitor_url: url, title: m.title, word_count: m.word_count, h2_count: m.h2_count, link_count: m.link_count, created_at: t });
        } catch (e) {
          snapshots.push({ competitor_url: url, error: String(e?.message || e).slice(0, 120) });
        }
      }
      audit(env, "admin", "competitors.scan", project.id, { keyword, measured: snapshots.filter((s) => !s.error).length });
      return json(200, { ok: true, keyword, snapshots, cached: false });
    }, "onRequestPost");
  }
});

// api/admin/cover/apply.js
function decodeBase64Png(b64) {
  const m = String(b64 || "").match(/^data:image\/png;base64,(.+)$/i);
  const raw = m ? m[1] : String(b64 || "");
  const bin = atob(raw.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
var MAX_BYTES2, onRequestPost14;
var init_apply = __esm({
  "api/admin/cover/apply.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    MAX_BYTES2 = 8 * 1024 * 1024;
    __name(decodeBase64Png, "decodeBase64Png");
    onRequestPost14 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      if (!env.IMAGES) return json(500, { error: "r2_binding_missing" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const target = String(body?.target || "").toLowerCase();
      const id = String(body?.id || "").trim();
      if (!["post", "job"].includes(target)) return json(400, { error: "target_must_be_post_or_job" });
      if (!id) return json(400, { error: "missing_id" });
      let row, table, slugCol;
      if (target === "post") {
        table = "blog_posts";
        slugCol = "slug";
        row = await env.DB.prepare("SELECT id, slug FROM blog_posts WHERE id = ? LIMIT 1").bind(id).first();
      } else {
        table = "blog_jobs";
        slugCol = "slug";
        row = await env.DB.prepare("SELECT id, slug FROM blog_jobs WHERE id = ? LIMIT 1").bind(id).first();
      }
      if (!row) return json(404, { error: "target_not_found" });
      let bytes;
      try {
        bytes = decodeBase64Png(body?.base64);
      } catch {
        return json(400, { error: "base64_decode_failed" });
      }
      if (!bytes.length) return json(400, { error: "empty_body" });
      if (bytes.length > MAX_BYTES2) return json(413, { error: "too_large", max_bytes: MAX_BYTES2 });
      const slug = row.slug || "cover";
      const key = `${slug}-cover-${Date.now()}.png`;
      try {
        await env.IMAGES.put(key, bytes, {
          httpMetadata: { contentType: "image/png", cacheControl: "public, max-age=31536000, immutable" }
        });
      } catch (e) {
        return json(500, { error: "r2_put_failed", detail: String(e?.message || e).slice(0, 200) });
      }
      await env.DB.prepare(
        `UPDATE ${table} SET hero_image_key = ? WHERE id = ?`
      ).bind(key, id).run();
      audit(env, "admin", "cover_apply", id, { target, r2_key: key, size_bytes: bytes.length });
      return json(200, {
        ok: true,
        hero_image_key: key,
        url: `/image/${encodeURIComponent(key)}`
      });
    }, "onRequestPost");
  }
});

// api/admin/cover/render-server.js
var onRequestPost15;
var init_render_server = __esm({
  "api/admin/cover/render-server.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    onRequestPost15 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      return json(501, {
        ok: false,
        error: "not_implemented",
        detail: "Server-side template rendering is not yet wired up. See functions/api/admin/cover/render-server.js for the integration sketch (satori + resvg-wasm).",
        hint: 'Use the browser editor\u2019s "Apply to all past posts" button for retrospective application. New-post rendering will pick up automatically once this endpoint is implemented.'
      });
    }, "onRequestPost");
  }
});

// api/admin/cover/templates.js
function shrinkSpec(spec) {
  const s = JSON.stringify(spec);
  if (s.length > MAX_SPEC_BYTES) throw new Error("spec_too_large");
  return s;
}
var MAX_SPEC_BYTES, onRequestGet4, onRequestPost16, onRequestPut, onRequestDelete;
var init_templates = __esm({
  "api/admin/cover/templates.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    MAX_SPEC_BYTES = 64 * 1024;
    __name(shrinkSpec, "shrinkSpec");
    onRequestGet4 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const r = await env.DB.prepare(
        `SELECT id, name, is_default, spec_json, thumb_r2_key, created_at, updated_at
       FROM cover_templates ORDER BY updated_at DESC LIMIT 100`
      ).all();
      const templates = (r?.results || []).map((t) => {
        let spec = null;
        try {
          spec = JSON.parse(t.spec_json);
        } catch {
        }
        return { ...t, spec, spec_json: void 0 };
      });
      return json(200, { ok: true, templates });
    }, "onRequestGet");
    onRequestPost16 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const name = String(body?.name || "").trim().slice(0, 120);
      if (!name) return json(400, { error: "missing_name" });
      if (!body?.spec || typeof body.spec !== "object") {
        return json(400, { error: "missing_spec" });
      }
      let spec_json;
      try {
        spec_json = shrinkSpec(body.spec);
      } catch (e) {
        return json(400, { error: String(e?.message || e) });
      }
      const id = newId();
      const t = nowSec();
      const isDefault = body.is_default ? 1 : 0;
      if (isDefault) {
        await env.DB.prepare("UPDATE cover_templates SET is_default = 0 WHERE is_default = 1").run();
      }
      await env.DB.prepare(
        `INSERT INTO cover_templates (id, name, is_default, spec_json, thumb_r2_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, name, isDefault, spec_json, body?.thumb_r2_key || null, t, t).run();
      audit(env, "admin", "cover_template_create", id, { name });
      return json(200, { ok: true, id });
    }, "onRequestPost");
    onRequestPut = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const url = new URL(request.url);
      const id = String(url.searchParams.get("id") || "");
      if (!id) return json(400, { error: "missing_id" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const sets = [];
      const binds = [];
      if (body.name != null) {
        const n = String(body.name).trim().slice(0, 120);
        if (!n) return json(400, { error: "empty_name" });
        sets.push("name=?");
        binds.push(n);
      }
      if (body.is_default != null) {
        const d = body.is_default ? 1 : 0;
        if (d === 1) {
          await env.DB.prepare("UPDATE cover_templates SET is_default = 0 WHERE is_default = 1 AND id != ?").bind(id).run();
        }
        sets.push("is_default=?");
        binds.push(d);
      }
      if (body.spec) {
        try {
          sets.push("spec_json=?");
          binds.push(shrinkSpec(body.spec));
        } catch (e) {
          return json(400, { error: String(e?.message || e) });
        }
      }
      if (body.thumb_r2_key != null) {
        sets.push("thumb_r2_key=?");
        binds.push(String(body.thumb_r2_key) || null);
      }
      if (!sets.length) return json(400, { error: "no_updates" });
      sets.push("updated_at=?");
      binds.push(nowSec());
      binds.push(id);
      const r = await env.DB.prepare(
        `UPDATE cover_templates SET ${sets.join(", ")} WHERE id = ?`
      ).bind(...binds).run();
      audit(env, "admin", "cover_template_update", id, {});
      return json(200, { ok: true, changed: r?.meta?.changes || 0 });
    }, "onRequestPut");
    onRequestDelete = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const url = new URL(request.url);
      const id = String(url.searchParams.get("id") || "");
      if (!id) return json(400, { error: "missing_id" });
      await env.DB.prepare("DELETE FROM cover_templates WHERE id = ?").bind(id).run();
      audit(env, "admin", "cover_template_delete", id, {});
      return json(200, { ok: true });
    }, "onRequestDelete");
  }
});

// api/admin/cover/upload.js
function imageUrlFor2(key) {
  return "/image/" + key.split("/").map(encodeURIComponent).join("/");
}
function extFor2(mime) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/svg+xml": "svg"
  }[mime] || "bin";
}
function decodeBase642(b64) {
  const m = String(b64 || "").match(/^data:[^;]+;base64,(.+)$/i);
  const raw = m ? m[1] : String(b64 || "");
  const bin = atob(raw.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
var MAX_BYTES3, ALLOWED_KINDS, ALLOWED_MIME2, onRequestPost17, onRequestGet5, onRequestDelete2;
var init_upload = __esm({
  "api/admin/cover/upload.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    MAX_BYTES3 = 10 * 1024 * 1024;
    ALLOWED_KINDS = /* @__PURE__ */ new Set(["background", "logo"]);
    ALLOWED_MIME2 = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);
    __name(imageUrlFor2, "imageUrlFor");
    __name(extFor2, "extFor");
    __name(decodeBase642, "decodeBase64");
    onRequestPost17 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      if (!env.IMAGES) return json(500, { error: "r2_binding_missing" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const kind = String(body?.kind || "").toLowerCase();
      if (!ALLOWED_KINDS.has(kind)) return json(400, { error: "kind_must_be_background_or_logo" });
      const mime = String(body?.content_type || "").toLowerCase();
      if (!ALLOWED_MIME2.has(mime)) {
        return json(400, { error: "unsupported_mime", allowed: [...ALLOWED_MIME2] });
      }
      let bytes;
      try {
        bytes = decodeBase642(body?.base64);
      } catch {
        return json(400, { error: "base64_decode_failed" });
      }
      if (!bytes.length) return json(400, { error: "empty_body" });
      if (bytes.length > MAX_BYTES3) {
        return json(413, { error: "too_large", max_bytes: MAX_BYTES3, got_bytes: bytes.length });
      }
      const id = newId();
      const key = `cover/${kind}/${id}.${extFor2(mime)}`;
      try {
        await env.IMAGES.put(key, bytes, {
          httpMetadata: {
            contentType: mime,
            // Aggressive caching is safe: keys include a random id, never
            // overwritten. The bytes are immutable for the lifetime of the
            // asset.
            cacheControl: "public, max-age=31536000, immutable"
          }
        });
      } catch (e) {
        return json(500, { error: "r2_put_failed", detail: String(e?.message || e).slice(0, 200) });
      }
      const t = nowSec();
      await env.DB.prepare(
        `INSERT INTO cover_assets
       (id, kind, r2_key, original_name, mime, size_bytes, width, height, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        kind,
        key,
        String(body?.filename || "").slice(0, 200),
        mime,
        bytes.length,
        body?.width ? parseInt(body.width, 10) : null,
        body?.height ? parseInt(body.height, 10) : null,
        t
      ).run();
      audit(env, "admin", "cover_upload", id, { kind, mime, size_bytes: bytes.length });
      return json(200, {
        ok: true,
        asset: {
          id,
          kind,
          r2_key: key,
          url: imageUrlFor2(key),
          mime,
          size_bytes: bytes.length,
          width: body?.width || null,
          height: body?.height || null
        }
      });
    }, "onRequestPost");
    onRequestGet5 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const url = new URL(request.url);
      const kind = url.searchParams.get("kind");
      const limit = Math.min(200, parseInt(url.searchParams.get("limit"), 10) || 60);
      const params = kind ? [kind, limit] : [limit];
      const where = kind ? "WHERE kind = ?" : "";
      const r = await env.DB.prepare(
        `SELECT id, kind, r2_key, original_name, mime, size_bytes, width, height, created_at
       FROM cover_assets ${where} ORDER BY created_at DESC LIMIT ?`
      ).bind(...params).all();
      const assets = (r?.results || []).map((a) => ({
        ...a,
        url: imageUrlFor2(a.r2_key)
      }));
      return json(200, { ok: true, assets });
    }, "onRequestGet");
    onRequestDelete2 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const url = new URL(request.url);
      const id = String(url.searchParams.get("id") || "");
      if (!id) return json(400, { error: "missing_id" });
      const row = await env.DB.prepare("SELECT r2_key FROM cover_assets WHERE id = ? LIMIT 1").bind(id).first();
      if (!row) return json(404, { error: "not_found" });
      try {
        await env.IMAGES.delete(row.r2_key);
      } catch {
      }
      await env.DB.prepare("DELETE FROM cover_assets WHERE id = ?").bind(id).run();
      audit(env, "admin", "cover_delete", id, {});
      return json(200, { ok: true });
    }, "onRequestDelete");
  }
});

// api/admin/cron/tick.js
async function blogChain(call, env, proj) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const existingRun = await env.DB.prepare(
    `SELECT id, status FROM blog_jobs
      WHERE project_id = ? AND date(created_at, 'unixepoch') = ? AND status IN ('created', 'text_done', 'image_done', 'published')
      LIMIT 1`
  ).bind(proj.id, today).first().catch(() => null);
  if (existingRun) {
    if (existingRun.status === "published") {
      return { project_id: proj.id, slug: proj.slug, status: "skipped", reason: "already_run_today", job_id: existingRun.id };
    }
    const jobId2 = existingRun.id;
    if (existingRun.status === "text_done") {
      const imgRes2 = await call("/api/admin/blog/image", { job_id: jobId2 });
      if (!imgRes2.ok) return { project_id: proj.id, slug: proj.slug, status: "failed", step: "image_resume", job_id: jobId2 };
    }
    if (existingRun.status === "image_done" || existingRun.status === "text_done") {
      if (proj.approval_mode === "approval") {
        return { project_id: proj.id, slug: proj.slug, status: "pending_approval", job_id: jobId2, resumed: true };
      }
      const pubRes2 = await call("/api/admin/blog/publish", { job_id: jobId2 });
      return { project_id: proj.id, slug: proj.slug, status: "published", job_id: jobId2, post_id: pubRes2.body?.blog_post_id, resumed: true };
    }
    if (existingRun.status === "created") {
      const textRes2 = await call("/api/admin/blog/text", { job_id: jobId2 });
      if (!textRes2.ok) return { project_id: proj.id, slug: proj.slug, status: "failed", step: "text_resume", job_id: jobId2 };
      const imgRes2 = await call("/api/admin/blog/image", { job_id: jobId2 });
      if (!imgRes2.ok) return { project_id: proj.id, slug: proj.slug, status: "failed", step: "image_resume", job_id: jobId2 };
      if (proj.approval_mode === "approval") {
        return { project_id: proj.id, slug: proj.slug, status: "pending_approval", job_id: jobId2, resumed: true };
      }
      const pubRes2 = await call("/api/admin/blog/publish", { job_id: jobId2 });
      return { project_id: proj.id, slug: proj.slug, status: "published", job_id: jobId2, post_id: pubRes2.body?.blog_post_id, resumed: true };
    }
  }
  const startRes = await call("/api/admin/blog/start", { project_id: proj.id, from_calendar: true });
  const jobId = startRes.body?.job_id;
  if (!startRes.ok || !jobId) {
    return { project_id: proj.id, slug: proj.slug, status: "failed", step: "start", error: startRes.body };
  }
  const textRes = await call("/api/admin/blog/text", { job_id: jobId });
  if (!textRes.ok) return { project_id: proj.id, slug: proj.slug, status: "failed", step: "text", job_id: jobId };
  const imgRes = await call("/api/admin/blog/image", { job_id: jobId });
  if (!imgRes.ok) return { project_id: proj.id, slug: proj.slug, status: "failed", step: "image", job_id: jobId };
  if (proj.approval_mode === "approval") {
    return { project_id: proj.id, slug: proj.slug, status: "pending_approval", job_id: jobId };
  }
  const pubRes = await call("/api/admin/blog/publish", { job_id: jobId });
  return { project_id: proj.id, slug: proj.slug, status: "published", job_id: jobId, post_id: pubRes.body?.blog_post_id };
}
async function progStep(call, proj, limit, overBudget) {
  const cap = limit > 0 ? limit : 1;
  let generated = 0;
  for (let i = 0; i < cap; i++) {
    if (overBudget?.()) {
      return { project_id: proj.id, slug: proj.slug, status: "partial", generated };
    }
    const r = await call("/api/admin/prog/generate-next", null, { "X-Project-Id": proj.id });
    if (!r.ok) return { project_id: proj.id, slug: proj.slug, status: "failed", step: "prog", generated, error: r.body };
    if (r.body?.drained) return { project_id: proj.id, slug: proj.slug, status: "drained", generated };
    generated++;
  }
  return { project_id: proj.id, slug: proj.slug, status: "generated", generated };
}
async function refreshStep(call, proj, limit, overBudget) {
  const scan = await call("/api/admin/refresh/scan", { project_id: proj.id, limit: limit || 10 });
  const jobs = scan.body?.jobs || [];
  const refreshed = [];
  for (const j of jobs) {
    if (overBudget?.()) break;
    const run = await call("/api/admin/refresh/run", { job_id: j.job_id });
    refreshed.push({ slug: j.slug, status: run.body?.status || (run.ok ? "ok" : "failed") });
  }
  return { project_id: proj.id, slug: proj.slug, status: "refreshed", scanned: jobs.length, refreshed };
}
var CHAIN_START_BUDGET_MS, STEP_BUDGET_MS, onRequestPost18;
var init_tick = __esm({
  "api/admin/cron/tick.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_projects();
    init_social_queue();
    CHAIN_START_BUDGET_MS = 6e4;
    STEP_BUDGET_MS = 85e3;
    onRequestPost18 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body = {};
      try {
        body = await request.json();
      } catch {
      }
      const task = String(body?.task || "blog").trim();
      const limit = Math.max(0, parseInt(body?.limit, 10) || 0);
      const dryRun = body?.dry_run === true;
      const onlyProject = String(body?.project_id || "").trim();
      let projects = await listProjects(env, { status: "active" });
      if (onlyProject) {
        projects = projects.filter((p) => p.id === onlyProject || p.slug === onlyProject);
        if (!projects.length) {
          return json(404, { error: "project_not_found", project_id: onlyProject });
        }
      }
      if (dryRun) {
        return json(200, {
          ok: true,
          task,
          dry_run: true,
          timestamp: nowSec(),
          projects: projects.map((p) => ({ id: p.id, slug: p.slug, approval_mode: p.approval_mode }))
        });
      }
      const origin = new URL(request.url).origin;
      const adminToken = request.headers.get("Authorization") || "";
      const headers = { "Content-Type": "application/json", "Authorization": adminToken, "X-Source-Cron": "1" };
      const call = /* @__PURE__ */ __name(async (path, payload, extra = {}) => {
        const r = await fetch(`${origin}${path}`, {
          method: "POST",
          headers: { ...headers, ...extra },
          body: payload === null ? void 0 : JSON.stringify(payload)
        });
        const parsed = await r.json().catch(() => ({}));
        return { ok: r.ok, status: r.status, body: parsed };
      }, "call");
      const startedAt = Date.now();
      const overStepBudget = /* @__PURE__ */ __name(() => Date.now() - startedAt > STEP_BUDGET_MS, "overStepBudget");
      if (task === "blog" && env?.DB?.prepare) {
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        await env.DB.prepare(
          `UPDATE blog_jobs SET status='failed', error='cron_interrupted: job was stuck at ' || status || ' from a previous day',
        updated_at=? WHERE status IN ('created', 'text_done', 'image_done')
        AND date(created_at, 'unixepoch') < ?`
        ).bind(nowSec(), today).run().catch(() => {
        });
      }
      const results = [];
      let partial = false;
      for (const proj of projects) {
        if (results.length && Date.now() - startedAt > CHAIN_START_BUDGET_MS) {
          partial = true;
          break;
        }
        try {
          if (task === "social") {
            const social = await drainSocialQueue(env, { projectId: proj.id, limit: 10 });
            results.push({
              project_id: proj.id,
              slug: proj.slug,
              status: "drained",
              processed: social.processed,
              published: social.results.filter((r) => r.ok).length
            });
          } else if (task === "blog") {
            const social = await drainSocialQueue(env, { projectId: proj.id, limit: 5 }).catch(() => ({ processed: 0 }));
            const chain = await blogChain(call, env, proj);
            results.push({ ...chain, social_processed: social.processed });
          } else if (task === "prog") results.push(await progStep(call, proj, limit, overStepBudget));
          else if (task === "refresh") results.push(await refreshStep(call, proj, limit, overStepBudget));
          else return json(400, { error: "unknown_task", task });
        } catch (err) {
          results.push({ project_id: proj.id, slug: proj.slug, status: "error", error: err.message });
        }
      }
      return json(200, {
        ok: true,
        task,
        timestamp: nowSec(),
        projects_processed: results.length,
        partial: partial || void 0,
        results
      });
    }, "onRequestPost");
    __name(blogChain, "blogChain");
    __name(progStep, "progStep");
    __name(refreshStep, "refreshStep");
  }
});

// _lib/email_smtp.js
import { connect } from "cloudflare:sockets";
async function sendOtpEmail({ toEmail, otpCode, brandName = "GU SEO" }) {
  const encoder = new TextEncoder();
  const socket = connect("smtp.gmail.com:465", {
    secureTransport: "on",
    allowHalfOpen: false
  });
  const reader = new SmtpReader(socket.readable);
  const writer = socket.writable.getWriter();
  async function send(cmd) {
    await writer.write(encoder.encode(cmd + "\r\n"));
  }
  __name(send, "send");
  try {
    let res = await reader.readResponse();
    if (res.code !== 220) throw new Error("SMTP Greeting failed: " + res.raw);
    await send("EHLO gu-seo.pages.dev");
    res = await reader.readResponse();
    if (res.code !== 250) throw new Error("EHLO failed: " + res.raw);
    const authPayload = btoa(`\0${GMAIL_USER}\0${GMAIL_PASS}`);
    await send(`AUTH PLAIN ${authPayload}`);
    res = await reader.readResponse();
    if (res.code !== 235) throw new Error("SMTP Auth failed: " + res.raw);
    await send(`MAIL FROM:<${GMAIL_USER}>`);
    res = await reader.readResponse();
    if (res.code !== 250) throw new Error("MAIL FROM failed: " + res.raw);
    await send(`RCPT TO:<${toEmail}>`);
    res = await reader.readResponse();
    if (res.code !== 250) throw new Error("RCPT TO failed: " + res.raw);
    await send("DATA");
    res = await reader.readResponse();
    if (res.code !== 354) throw new Error("DATA initiation failed: " + res.raw);
    const subject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(`M\xE3 x\xE1c th\u1EF1c OTP \u0111\u0103ng k\xFD GU SEO: ${otpCode}`)))}?=`;
    const message = [
      `From: "GU SEO System" <${GMAIL_USER}>`,
      `To: <${toEmail}>`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "",
      `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:30px 20px;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;">
  <div style="max-width:520px;margin:0 auto;background:#0f172a;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:36px 32px;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
    <div style="font-size:18px;font-weight:800;color:#38bdf8;margin-bottom:24px;letter-spacing:-0.03em;">
      GU SEO &middot; SYSTEM
    </div>
    <h2 style="font-size:22px;font-weight:700;color:#ffffff;margin:0 0 12px;line-height:1.3;">
      X\xE1c th\u1EF1c \u0111\u0103ng k\xFD t\xE0i kho\u1EA3n
    </h2>
    <p style="font-size:14px;color:#94a3b8;line-height:1.6;margin:0 0 24px;">
      B\u1EA1n \u0111ang t\u1EA1o t\xE0i kho\u1EA3n g\xF3i Free tr\xEAn h\u1EC7 th\u1ED1ng <b>GU SEO</b> cho th\u01B0\u01A1ng hi\u1EC7u <b>${brandName}</b>. Vui l\xF2ng nh\u1EADp m\xE3 OTP b\xEAn d\u01B0\u1EDBi \u0111\u1EC3 ho\xE0n t\u1EA5t:
    </p>
    <div style="background:#020617;border:1px solid #1e293b;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
      <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monospace;font-size:36px;font-weight:800;letter-spacing:10px;color:#34d399;display:inline-block;padding-left:10px;">
        ${otpCode}
      </span>
    </div>
    <p style="font-size:12px;color:#64748b;line-height:1.5;margin:0;">
      M\xE3 OTP c\xF3 hi\u1EC7u l\u1EF1c trong <b>10 ph\xFAt</b>. N\u1EBFu b\u1EA1n kh\xF4ng th\u1EF1c hi\u1EC7n y\xEAu c\u1EA7u n\xE0y, vui l\xF2ng b\u1ECF qua email.
    </p>
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#475569;display:flex;justify-content:space-between;">
      <span>&copy; 2026 GU SEO Infrastructure</span>
      <span>H\u1ED7 tr\u1EE3: 0989 511 431</span>
    </div>
  </div>
</body>
</html>`,
      ".\r\n"
    ].join("\r\n");
    await writer.write(encoder.encode(message));
    res = await reader.readResponse();
    if (res.code !== 250) throw new Error("Sending mail body failed: " + res.raw);
    await send("QUIT");
    return { ok: true };
  } finally {
    try {
      writer.releaseLock();
    } catch {
    }
    try {
      await socket.close();
    } catch {
    }
  }
}
var GMAIL_USER, GMAIL_PASS, SmtpReader;
var init_email_smtp = __esm({
  "_lib/email_smtp.js"() {
    init_functionsRoutes_0_09583509623234443();
    GMAIL_USER = "gulagi.com@gmail.com";
    GMAIL_PASS = "zpgneewuhhldrfsu";
    SmtpReader = class {
      static {
        __name(this, "SmtpReader");
      }
      constructor(readable) {
        this.reader = readable.getReader();
        this.buffer = "";
        this.decoder = new TextDecoder();
      }
      async readLine() {
        while (!this.buffer.includes("\r\n")) {
          const { value, done } = await this.reader.read();
          if (done) break;
          this.buffer += this.decoder.decode(value, { stream: true });
        }
        const idx = this.buffer.indexOf("\r\n");
        if (idx === -1) {
          const line2 = this.buffer;
          this.buffer = "";
          return line2;
        }
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 2);
        return line;
      }
      async readResponse() {
        let line = "";
        let full = "";
        while (true) {
          line = await this.readLine();
          if (!line) break;
          full += line + "\n";
          if (line.length >= 4 && line[3] === " ") {
            break;
          }
        }
        return {
          code: parseInt(line.slice(0, 3), 10),
          raw: full.trim()
        };
      }
    };
    __name(sendOtpEmail, "sendOtpEmail");
  }
});

// api/admin/cron/weekly-digest.js
var onRequestPost19;
var init_weekly_digest = __esm({
  "api/admin/cron/weekly-digest.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_email_smtp();
    onRequestPost19 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      if (!env?.DB) return json(500, { error: "no_db" });
      const now = nowSec();
      const oneWeekAgo = now - 7 * 86400;
      const users = await env.DB.prepare(`
    SELECT u.id as user_id, u.email, u.role, u.project_id,
           p.name as project_name, p.slug as project_slug, p.publishing_url
      FROM users u
      LEFT JOIN projects p ON p.id = u.project_id
     WHERE u.email IS NOT NULL AND u.email LIKE '%@%'
  `).all().catch(() => ({ results: [] }));
      const results = [];
      for (const user of users.results || []) {
        if (!user.project_id) continue;
        const postStats = await env.DB.prepare(`
      SELECT COUNT(*) as total_weekly,
             COUNT(CASE WHEN published_at >= ? THEN 1 END) as new_published
        FROM blog_posts
       WHERE project_id = ?
    `).bind(oneWeekAgo, user.project_id).first().catch(() => ({ total_weekly: 0, new_published: 0 }));
        const viewStats = await env.DB.prepare(`
      SELECT COUNT(*) as total_views
        FROM blog_views
       WHERE project_id = ?
    `).bind(user.project_id).first().catch(() => ({ total_views: 0 }));
        const brandName = user.project_name || "D\u1EF1 \xE1n c\u1EE7a b\u1EA1n";
        const newPosts = postStats?.new_published || 0;
        const totalPosts = postStats?.total_weekly || 0;
        const totalViews = viewStats?.total_views || 0;
        try {
          await sendOtpEmail({
            toEmail: user.email,
            otpCode: `${newPosts} b\xE0i`,
            // Reusing secure SMTP sender
            brandName: `${brandName} (B\xE1o c\xE1o tu\u1EA7n)`
          });
          results.push({ email: user.email, project: user.project_slug, status: "sent", newPosts });
        } catch (e) {
          results.push({ email: user.email, project: user.project_slug, status: "error", error: e.message });
        }
      }
      return json(200, {
        ok: true,
        recipients_count: results.length,
        results
      });
    }, "onRequestPost");
  }
});

// api/admin/google-search-console/test.js
var onRequestPost20;
var init_test = __esm({
  "api/admin/google-search-console/test.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_google_indexing();
    init_site_identity();
    onRequestPost20 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const desc = await describeConfig(env);
      if (!desc.configured) {
        return json(400, { error: "not_configured", detail: "Paste the service-account JSON in /admin \u2192 Settings \u2192 Google Search Console first." });
      }
      const id = await getSiteIdentity(env);
      const homeUrl = (id.url || "").replace(/\/$/, "") + "/";
      const result = await onPublish(env, [homeUrl]);
      return json(200, { ok: true, config: desc, result });
    }, "onRequestPost");
  }
});

// api/admin/notices/dismiss.js
var onRequestPost21;
var init_dismiss = __esm({
  "api/admin/notices/dismiss.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    onRequestPost21 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      if (!env?.DB) return json(503, { ok: false, error: "no_db_binding" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { ok: false, error: "bad_json" });
      }
      const id = String(body?.id || "").trim().toLowerCase();
      if (!/^[a-f0-9]{32}$/.test(id)) return json(400, { ok: false, error: "bad_id" });
      try {
        const r = await env.DB.prepare(
          `UPDATE admin_notices SET dismissed_at = ?
        WHERE id = ? AND dismissed_at IS NULL`
        ).bind(nowSec(), id).run();
        if ((r?.meta?.changes ?? 0) === 0) {
          return json(404, { ok: false, error: "not_found_or_already_dismissed" });
        }
        return json(200, { ok: true, dismissed: true });
      } catch (e) {
        return json(500, { ok: false, error: String(e?.message || e).slice(0, 200) });
      }
    }, "onRequestPost");
  }
});

// api/admin/prog/generate-next.js
var onRequestPost22;
var init_generate_next = __esm({
  "api/admin/prog/generate-next.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_ai();
    init_indexnow();
    init_google_indexing();
    init_sanitise();
    init_aliases();
    init_settings();
    init_usage();
    init_project_scope();
    onRequestPost22 = /* @__PURE__ */ __name(async ({ request, env, waitUntil }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      const claimSql = pid ? `SELECT id, keyword FROM prog_keywords WHERE status='pending' AND project_id = ?
       ORDER BY priority DESC, created_at ASC LIMIT 1` : `SELECT id, keyword FROM prog_keywords WHERE status='pending'
       ORDER BY priority DESC, created_at ASC LIMIT 1`;
      const claimed = await env.DB.batch([
        pid ? env.DB.prepare(claimSql).bind(pid) : env.DB.prepare(claimSql)
      ]);
      const next = claimed[0]?.results?.[0];
      if (!next) return json(200, { ok: true, drained: true });
      const t0 = nowSec();
      await env.DB.prepare(
        "UPDATE prog_keywords SET status='processing', attempts=attempts+1, updated_at=? WHERE id=? AND status='pending'"
      ).bind(t0, next.id).run();
      const aliases = await buildAliasMap(env, pid);
      const settings = await loadSettings(env);
      let body = {};
      try {
        body = await request.clone().json();
      } catch {
      }
      const source = request.headers.get("X-Source-Cron") === "1" ? "cron-prog" : "admin-prog";
      if (source === "cron-prog" && !body.allow_over_budget) {
        const b = await checkBudget(env, source);
        if (!b.allowed) {
          await env.DB.prepare("UPDATE prog_keywords SET status='pending', updated_at=? WHERE id=?").bind(nowSec(), next.id).run();
          return json(429, { error: "budget_exceeded", month_spend_usd: b.spend, budget_usd: b.budget, pct: b.pct });
        }
      }
      let content;
      try {
        content = await generateContent(env, {
          kind: "programmatic",
          seed: next.keyword,
          provider: settings.default_ai_provider || void 0,
          source,
          projectId: pid,
          brand: {
            // settings.site_name resolves Pages secret first, then D1
            // — supports CLI + browser + 1-click Deploy installs.
            name: settings.site_name || "this site",
            url: settings.site_url || "/",
            cta: settings.site_cta,
            tone: settings.brand_voice_tone || settings.site_tone || void 0,
            audience: settings.brand_target_audience || settings.site_audience || void 0,
            business_type: settings.brand_business_type || void 0,
            key_themes: settings.brand_key_themes || void 0,
            topics_to_avoid: settings.brand_topics_to_avoid || void 0,
            service_area: settings.brand_service_area || void 0,
            aliases
          }
        });
      } catch (e) {
        const msg = String(e.message || e).slice(0, 800);
        await env.DB.prepare(
          "UPDATE prog_keywords SET status='failed', error=?, updated_at=? WHERE id=?"
        ).bind("text:" + msg, nowSec(), next.id).run();
        return json(502, { error: "text_failed", keyword: next.keyword, detail: msg });
      }
      content.body_markdown = sanitiseMarkdownLinks(content.body_markdown, { aliases });
      let slug = content.slug || slugify(content.title);
      for (let n = 1; n <= 20; n++) {
        const taken = await env.DB.prepare("SELECT 1 FROM prog_pages WHERE slug=? LIMIT 1").bind(slug).first();
        if (!taken) break;
        slug = `${content.slug}-${n + 1}`;
      }
      function normTitle(s) {
        return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
      }
      __name(normTitle, "normTitle");
      function jaccard(a, b) {
        const wa = new Set(normTitle(a).split(" ").filter((w) => w.length > 2));
        const wb = new Set(normTitle(b).split(" ").filter((w) => w.length > 2));
        if (!wa.size || !wb.size) return 0;
        let intersect = 0;
        for (const w of wa) if (wb.has(w)) intersect++;
        const union = wa.size + wb.size - intersect;
        return union ? intersect / union : 0;
      }
      __name(jaccard, "jaccard");
      let publishStatus = "published";
      let dupReason = null;
      try {
        const nt = normTitle(content.title);
        const existing = await env.DB.prepare(
          `SELECT slug, title, meta_description FROM prog_pages
       WHERE status='published' ORDER BY published_at DESC LIMIT 200`
        ).all().catch(() => ({ results: [] }));
        for (const row of existing.results || []) {
          if (normTitle(row.title) === nt) {
            publishStatus = "hidden";
            dupReason = "duplicate_title:" + row.slug;
            break;
          }
          const sim = jaccard(content.meta_description, row.meta_description);
          if (sim >= 0.8) {
            publishStatus = "hidden";
            dupReason = `duplicate_description(${sim.toFixed(2)}):` + row.slug;
            break;
          }
        }
      } catch {
      }
      let imageKey = null;
      try {
        const img = await generateImage(env, { prompt: content.hero_image_prompt, source, projectId: pid });
        imageKey = `${slug}-${Date.now()}.png`;
        if (env.IMAGES) {
          await env.IMAGES.put(imageKey, img.bytes, {
            httpMetadata: { contentType: "image/png", cacheControl: "public, max-age=31536000, immutable" }
          });
        }
      } catch {
        imageKey = null;
      }
      const pageId = newId();
      const t = nowSec();
      await env.DB.prepare(
        `INSERT INTO prog_pages (id, project_id, slug, keyword, title, meta_description, body_markdown,
        hero_image_key, hero_image_alt, status, ai_provider, created_at, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        pageId,
        pid,
        slug,
        next.keyword,
        content.title,
        content.meta_description,
        content.body_markdown,
        imageKey,
        content.hero_image_alt,
        publishStatus,
        content.ai_provider,
        t,
        t
      ).run();
      await env.DB.prepare(
        "UPDATE prog_keywords SET status='done', page_id=?, error=?, updated_at=? WHERE id=?"
      ).bind(pageId, dupReason, t, next.id).run();
      if (publishStatus === "published") {
        const newUrls = [`${await publicBaseFor(env, pid, request)}/p/${slug}`];
        waitUntil(pingIndexNow(env, newUrls, request).catch(() => {
        }));
        waitUntil(onPublish(env, newUrls).catch(() => {
        }));
      }
      audit(env, "admin", "prog_generate", pageId, { keyword: next.keyword, slug, status: publishStatus, dupReason });
      return json(200, {
        ok: true,
        keyword: next.keyword,
        slug,
        page_id: pageId,
        ai_provider: content.ai_provider,
        status: publishStatus,
        dup_reason: dupReason
      });
    }, "onRequestPost");
  }
});

// _lib/keyword_score.js
function looksLikeJunkNumeric(s) {
  const ms = s.match(/\d{4,}/g);
  if (!ms) return false;
  for (const m of ms) {
    const idx = s.indexOf(m);
    const before = s.slice(Math.max(0, idx - 2), idx);
    const after = s.slice(idx + m.length, idx + m.length + 4);
    if (/[£€$¥]/.test(before)) continue;
    if (/^\s*(k|kg|lb|cm|in|ft|m|mm|gb|tb|mb|mph|kph|°|%)/i.test(after)) continue;
    const n = parseInt(m, 10);
    if (n >= 1900 && n <= 2099 && m.length === 4) continue;
    return true;
  }
  return false;
}
function countMatches2(text, list) {
  let n = 0;
  for (const w of list) {
    const re = new RegExp(`(^|[\\s-])${w.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}([\\s-]|$)`, "i");
    if (re.test(text)) n++;
  }
  return n;
}
function scoreKeyword(kw) {
  const s = String(kw || "").toLowerCase().trim();
  if (!s) return { score: 0, intent: "junk", signals: [], penalty: 0 };
  for (const re of JUNK_PATTERNS) {
    if (re.test(s)) return { score: 0, intent: "junk", signals: ["junk_pattern"], penalty: 100 };
  }
  if (looksLikeJunkNumeric(s)) {
    return { score: 0, intent: "junk", signals: ["junk_numeric"], penalty: 100 };
  }
  const signals = [];
  let intentScore = 0;
  let intent = "informational";
  const tx = countMatches2(s, TRANSACTIONAL);
  const co = countMatches2(s, COMMERCIAL);
  const nv = countMatches2(s, NAVIGATIONAL);
  const inf = countMatches2(s, INFORMATIONAL);
  if (tx > 0) {
    intent = "transactional";
    intentScore = Math.min(35, 20 + tx * 8);
    signals.push(`transactional\xD7${tx}`);
  } else if (co > 0) {
    intent = "commercial";
    intentScore = Math.min(28, 16 + co * 6);
    signals.push(`commercial\xD7${co}`);
  } else if (nv > 0) {
    intent = "navigational";
    intentScore = 6;
    signals.push(`navigational\xD7${nv}`);
  } else if (inf > 0) {
    intent = "informational";
    intentScore = Math.min(14, 8 + inf * 3);
    signals.push(`informational\xD7${inf}`);
  }
  let specScore = 0;
  for (const re of SPECIFICITY_MODIFIERS) {
    if (re.test(s)) {
      specScore += 5;
      signals.push("specific");
      break;
    }
  }
  const wc = s.split(/\s+/).filter(Boolean).length;
  if (wc >= 3 && wc <= 6) {
    specScore += 12;
    signals.push(`words=${wc}`);
  } else if (wc === 2) {
    specScore += 6;
    signals.push("short-tail");
  } else if (wc === 1) {
    specScore -= 10;
    signals.push("single-word");
  } else if (wc >= 7) {
    specScore -= 8;
    signals.push("over-long");
  }
  let modScore = 0;
  for (const re of HIGH_CTR_MODIFIERS) {
    if (re.test(s)) {
      modScore = 12;
      signals.push("high_ctr");
      break;
    }
  }
  const len = s.length;
  let lenScore = 0;
  if (len >= 15 && len <= 50) lenScore = 8;
  else if (len < 8) lenScore = -5;
  else if (len > 70) lenScore = -3;
  let penalty = 0;
  const stopwords = ["the", "a", "an", "of", "and", "or", "to", "is", "are", "in", "on"];
  const tokens = s.split(/\s+/);
  const stopRatio = tokens.filter((t) => stopwords.includes(t)).length / Math.max(tokens.length, 1);
  if (stopRatio > 0.5) {
    penalty += 10;
    signals.push("stopword-heavy");
  }
  let score = intentScore + specScore + modScore + lenScore - penalty;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, intent, signals, penalty };
}
function canonicaliseKeyword(kw) {
  let s = String(kw || "").toLowerCase().trim();
  s = s.replace(/[^a-z0-9\s£$€]/g, " ");
  s = s.replace(/\s+/g, " ");
  s = s.split(" ").filter((t) => !["the", "a", "an"].includes(t)).join(" ");
  s = s.split(" ").map((t) => {
    if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
    if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
    return t;
  }).join(" ");
  return s.trim();
}
var TRANSACTIONAL, COMMERCIAL, INFORMATIONAL, NAVIGATIONAL, JUNK_PATTERNS, SPECIFICITY_MODIFIERS, HIGH_CTR_MODIFIERS;
var init_keyword_score = __esm({
  "_lib/keyword_score.js"() {
    init_functionsRoutes_0_09583509623234443();
    TRANSACTIONAL = [
      "buy",
      "purchase",
      "order",
      "shop",
      "price",
      "pricing",
      "prices",
      "cost",
      "costs",
      "deal",
      "discount",
      "coupon",
      "cheap",
      "sale",
      "subscribe",
      "sign up",
      "free trial",
      "demo",
      "quote",
      "quotes",
      "for sale",
      "near me",
      "delivery",
      "installation",
      "install",
      "hire",
      "rent",
      "rental",
      "lease",
      "booking",
      "book a"
    ];
    COMMERCIAL = [
      "best",
      "top",
      "review",
      "reviews",
      "rating",
      "compare",
      "comparison",
      "vs",
      "versus",
      "alternative",
      "alternatives",
      "pros and cons",
      "worth it",
      "is it good",
      "reddit"
    ];
    INFORMATIONAL = [
      "how to",
      "what is",
      "why",
      "when",
      "where",
      "guide",
      "tutorial",
      "examples",
      "meaning",
      "definition",
      "history",
      "explained",
      "difference between"
    ];
    NAVIGATIONAL = [
      "login",
      "sign in",
      "app",
      "official",
      "website",
      "download",
      "support",
      "help",
      "contact"
    ];
    JUNK_PATTERNS = [
      /\b(porn|nude|xxx|nsfw|onlyfans|escort)\b/i,
      /\b(hack|crack|warez|nulled|cracked)\b/i,
      /\b(free\s+download)\b/i,
      // distinct from "free trial"
      /[a-z0-9]{40,}/i
      // single unbroken token ≥40 chars
    ];
    __name(looksLikeJunkNumeric, "looksLikeJunkNumeric");
    SPECIFICITY_MODIFIERS = [
      /\b\d{4}\b/,
      // year (2024, 2026)
      /\b(uk|usa|us|canada|australia|ireland|nyc|london|melbourne|toronto)\b/i,
      /\b\d+\s*(kg|lb|cm|inch|in|ft|m|mm)\b/i,
      // measurement
      /\b£?\$?\d+k?\+?\b/
      // contains a number
    ];
    HIGH_CTR_MODIFIERS = [
      /\b(template|checklist|calculator|cheat sheet|case study)\b/i,
      /\b(tutorial|step by step|step-by-step|walkthrough)\b/i,
      /\b(comparison|side by side|head to head)\b/i
    ];
    __name(countMatches2, "countMatches");
    __name(scoreKeyword, "scoreKeyword");
    __name(canonicaliseKeyword, "canonicaliseKeyword");
  }
});

// _lib/keyword_puller.js
async function fetchSuggestions(query) {
  const url = `${ENDPOINT}?client=firefox&hl=en&q=${encodeURIComponent(query)}`;
  const r = await fetch(url, {
    // Pretending to be a normal browser keeps Google from 429-ing instantly.
    headers: { "user-agent": "Mozilla/5.0 (compatible; pages-seo/1.0; +https://github.com/Benjamin-Bloch/pages-seo)" }
  });
  if (!r.ok) throw new Error("autocomplete_http_" + r.status);
  const data = await r.json();
  return Array.isArray(data?.[1]) ? data[1] : [];
}
async function withLimit(items, fn, concurrency = 4) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx]);
      } catch {
        out[idx] = [];
      }
    }
  }
  __name(worker, "worker");
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return out.flat();
}
function relatedToSeed(suggestion, seed) {
  const stopwords = /* @__PURE__ */ new Set(["the", "a", "an", "of", "and", "or", "to", "is", "are", "in", "on", "for"]);
  const seedTokens = canonicaliseKeyword(seed).split(" ").filter((t) => t && !stopwords.has(t));
  if (!seedTokens.length) return true;
  const cand = canonicaliseKeyword(suggestion);
  let hits = 0;
  for (const t of seedTokens) if (cand.includes(t)) hits++;
  return hits / seedTokens.length >= 0.5;
}
async function pullKeywords(seed, { limit = 50, expand = true, minScore = 0 } = {}) {
  const cleanSeed = String(seed || "").trim().toLowerCase();
  if (!cleanSeed) throw new Error("seed_required");
  const queries = [cleanSeed];
  if (expand) {
    for (const p of PREFIXES) queries.push(`${p} ${cleanSeed}`);
    for (const s of SUFFIXES) queries.push(`${cleanSeed} ${s}`);
    for (const l of LETTERS) queries.push(`${cleanSeed} ${l}`);
  }
  const all = await withLimit(queries, fetchSuggestions, 4);
  const byCanonical = /* @__PURE__ */ new Map();
  for (const raw of all) {
    const norm = String(raw || "").trim().toLowerCase();
    if (!norm) continue;
    if (!relatedToSeed(norm, cleanSeed)) continue;
    const canon = canonicaliseKeyword(norm);
    if (!canon) continue;
    const scored = scoreKeyword(norm);
    if (scored.intent === "junk") continue;
    if (scored.score < minScore) continue;
    const existing = byCanonical.get(canon);
    if (!existing || scored.score > existing.score || scored.score === existing.score && norm.length < existing.keyword.length) {
      byCanonical.set(canon, {
        keyword: norm,
        canonical: canon,
        score: scored.score,
        intent: scored.intent,
        signals: scored.signals
      });
    }
  }
  const sorted = [...byCanonical.values()].sort((a, b) => b.score - a.score || a.keyword.length - b.keyword.length).slice(0, limit);
  return { seed: cleanSeed, total: sorted.length, keywords: sorted };
}
var ENDPOINT, LETTERS, PREFIXES, SUFFIXES;
var init_keyword_puller = __esm({
  "_lib/keyword_puller.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_keyword_score();
    ENDPOINT = "https://suggestqueries.google.com/complete/search";
    LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
    PREFIXES = ["best", "cheap", "free", "top", "how to", "what is", "why", "when to", "where to"];
    SUFFIXES = ["for beginners", "in 2026", "uk", "usa", "reviews", "reddit", "vs", "alternative", "examples", "guide", "tutorial", "price", "cost"];
    __name(fetchSuggestions, "fetchSuggestions");
    __name(withLimit, "withLimit");
    __name(relatedToSeed, "relatedToSeed");
    __name(pullKeywords, "pullKeywords");
  }
});

// api/admin/prog/pull-keywords.js
var onRequestPost23;
var init_pull_keywords = __esm({
  "api/admin/prog/pull-keywords.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_keyword_puller();
    onRequestPost23 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const seed = String(body?.seed || "").trim();
      if (!seed) return json(400, { error: "missing_seed" });
      const limit = Math.max(1, Math.min(200, parseInt(body?.limit, 10) || 50));
      const minScore = Math.max(0, Math.min(100, parseInt(body?.min_score, 10) || 0));
      const shouldQueue = body?.queue !== false;
      let pulled;
      try {
        pulled = await pullKeywords(seed, { limit, minScore });
      } catch (e) {
        return json(502, { error: "autocomplete_failed", detail: String(e.message || e) });
      }
      if (!shouldQueue) {
        return json(200, {
          ok: true,
          seed: pulled.seed,
          pulled: pulled.total,
          kept: pulled.total,
          inserted: 0,
          duplicate: 0,
          keywords: pulled.keywords
        });
      }
      const t = nowSec();
      let inserted = 0, duplicate = 0;
      for (const k of pulled.keywords) {
        try {
          const r = await env.DB.prepare(
            `INSERT INTO prog_keywords (id, project_id, keyword, canonical, score, priority, intent, status, attempts, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`
          ).bind(newId(), pid, k.keyword, k.canonical, k.score, k.score, k.intent, t, t).run();
          if (r?.meta?.changes) inserted++;
          else duplicate++;
        } catch {
          duplicate++;
        }
      }
      audit(env, "admin", "prog_pull", null, { seed, pulled: pulled.total, inserted, duplicate });
      return json(200, {
        ok: true,
        seed: pulled.seed,
        pulled: pulled.total,
        kept: pulled.total,
        inserted,
        duplicate,
        keywords: pulled.keywords
      });
    }, "onRequestPost");
  }
});

// api/admin/prog/queue.js
var onRequestGet6, onRequestPatch;
var init_queue = __esm({
  "api/admin/prog/queue.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    onRequestGet6 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      const url = new URL(request.url);
      const status = url.searchParams.get("status") || "pending";
      const limit = Math.min(500, parseInt(url.searchParams.get("limit"), 10) || 100);
      const order = url.searchParams.get("order") || "priority";
      let orderBy;
      switch (order) {
        case "score":
          orderBy = "k.score DESC, k.created_at ASC";
          break;
        case "created":
          orderBy = "k.created_at DESC";
          break;
        case "priority":
        default:
          orderBy = status === "pending" ? "k.priority DESC, k.created_at ASC" : "k.updated_at DESC";
      }
      const projectClause = pid ? `k.project_id = ? AND` : ``;
      const sql = `SELECT k.id, k.project_id, k.keyword, k.canonical, k.score, k.priority, k.intent,
            k.status, k.attempts, k.page_id, k.error, k.created_at, k.updated_at,
            p.slug AS page_slug, p.title AS page_title, p.hero_image_key AS page_image_key,
            p.status AS page_status, p.published_at AS page_published_at
       FROM prog_keywords k LEFT JOIN prog_pages p ON p.id = k.page_id
      WHERE ${projectClause} k.status=? ORDER BY ${orderBy} LIMIT ?`;
      const stmt = pid ? env.DB.prepare(sql).bind(pid, status, limit) : env.DB.prepare(sql).bind(status, limit);
      const r = await stmt.all();
      return json(200, { keywords: r.results || [], project_id: pid });
    }, "onRequestGet");
    onRequestPatch = /* @__PURE__ */ __name(async ({ request, env }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const id = String(body?.id || "").trim();
      if (!id) return json(400, { error: "missing_id" });
      const owned = pid ? await env.DB.prepare(`SELECT id FROM prog_keywords WHERE id = ? AND project_id = ? LIMIT 1`).bind(id, pid).first().catch(() => null) : await env.DB.prepare(`SELECT id FROM prog_keywords WHERE id = ? LIMIT 1`).bind(id).first().catch(() => null);
      if (!owned) return json(404, { error: "not_found" });
      const sets = [];
      const binds = [];
      if (body.priority != null) {
        const p = parseInt(body.priority, 10);
        if (Number.isNaN(p) || p < -1e3 || p > 1e3) return json(400, { error: "bad_priority" });
        sets.push("priority=?");
        binds.push(p);
      }
      if (body.status != null) {
        const allowed = ["pending", "processing", "done", "failed"];
        if (!allowed.includes(body.status)) return json(400, { error: "bad_status" });
        sets.push("status=?");
        binds.push(body.status);
        if (body.status === "pending") {
          sets.push("error=NULL");
        }
      }
      if (!sets.length) return json(400, { error: "no_updates" });
      sets.push("updated_at=?");
      binds.push(nowSec());
      binds.push(id);
      if (pid) binds.push(pid);
      const r = await env.DB.prepare(
        `UPDATE prog_keywords SET ${sets.join(", ")} WHERE id=?${pid ? " AND project_id=?" : ""}`
      ).bind(...binds).run();
      audit(env, "admin", "prog_queue_patch", id, body);
      return json(200, { ok: true, changed: r?.meta?.changes || 0 });
    }, "onRequestPatch");
  }
});

// api/admin/prog/upload.js
var onRequestPost24;
var init_upload2 = __esm({
  "api/admin/prog/upload.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_keyword_score();
    onRequestPost24 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      let raw = [];
      if (Array.isArray(body?.keywords)) raw = body.keywords;
      else if (typeof body?.csv === "string") raw = body.csv.split(/\r?\n/);
      raw = raw.map((s) => String(s || "").trim().toLowerCase()).filter(Boolean);
      if (!raw.length) return json(400, { error: "no_keywords" });
      if (raw.length > 5e3) return json(400, { error: "too_many", max: 5e3 });
      const byCanonical = /* @__PURE__ */ new Map();
      let droppedJunk = 0;
      for (const kw of raw) {
        const scored = scoreKeyword(kw);
        if (scored.intent === "junk") {
          droppedJunk++;
          continue;
        }
        const canon = canonicaliseKeyword(kw);
        if (!canon) continue;
        const existing = byCanonical.get(canon);
        if (!existing || scored.score > existing.score) {
          byCanonical.set(canon, { keyword: kw, canonical: canon, score: scored.score, intent: scored.intent });
        }
      }
      const t = nowSec();
      let inserted = 0, duplicate = 0;
      for (const k of byCanonical.values()) {
        try {
          const r = await env.DB.prepare(
            `INSERT INTO prog_keywords (id, project_id, keyword, canonical, score, priority, intent, status, attempts, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`
          ).bind(newId(), pid, k.keyword, k.canonical, k.score, k.score, k.intent, t, t).run();
          if (r?.meta?.changes) inserted++;
          else duplicate++;
        } catch {
          duplicate++;
        }
      }
      audit(env, "admin", "prog_upload", null, { inserted, duplicate, droppedJunk, total: raw.length });
      return json(200, { ok: true, inserted, duplicate, dropped_junk: droppedJunk, deduplicated_to: byCanonical.size, total: raw.length });
    }, "onRequestPost");
  }
});

// api/admin/projects/domain.js
var CNAME_TARGET, onRequestGet7, onRequestPost25;
var init_domain = __esm({
  "api/admin/projects/domain.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_projects();
    CNAME_TARGET = "gu-seo.pages.dev";
    onRequestGet7 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      if (!tenant || !tenant.activeProjectId) {
        return json(400, { error: "missing_or_invalid_project" });
      }
      const project = await env.DB.prepare(
        `SELECT id, slug, publishing_url, custom_domain FROM projects WHERE id = ? LIMIT 1`
      ).bind(tenant.activeProjectId).first().catch(() => null);
      if (!project) return json(404, { error: "project_not_found" });
      return json(200, {
        ok: true,
        custom_domain: project.custom_domain ? normalizeCustomDomain(project.custom_domain) : null,
        slug: project.slug,
        publishing_url: project.publishing_url,
        cname_target: CNAME_TARGET
      });
    }, "onRequestGet");
    onRequestPost25 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const isSuperAdmin = auth.via === "bearer" || auth.role === "super_admin";
      let targetProjectId = null;
      if (isSuperAdmin && body?.project_id) {
        const p = await env.DB.prepare(
          `SELECT id FROM projects WHERE id = ? OR slug = ? LIMIT 1`
        ).bind(body.project_id, body.project_id).first().catch(() => null);
        if (!p) return json(404, { error: "project_not_found" });
        targetProjectId = p.id;
      } else {
        const tenant = await resolveTenantContext(env, request, auth);
        if (!tenant || !tenant.activeProjectId) {
          return json(400, { error: "missing_or_invalid_project" });
        }
        targetProjectId = tenant.activeProjectId;
      }
      const rawDomain = body?.custom_domain;
      const customDomain = rawDomain ? normalizeCustomDomain(rawDomain) : null;
      if (customDomain) {
        const existing = await env.DB.prepare(
          `SELECT id, slug FROM projects WHERE custom_domain = ? AND id != ? LIMIT 1`
        ).bind(customDomain, targetProjectId).first().catch(() => null);
        if (existing) {
          return json(409, {
            error: "domain_conflict",
            detail: `T\xEAn mi\u1EC1n ${customDomain} \u0111\xE3 \u0111\u01B0\u1EE3c s\u1EED d\u1EE5ng b\u1EDFi d\u1EF1 \xE1n ${existing.slug}`
          });
        }
      }
      const t = nowSec();
      await env.DB.prepare(
        `UPDATE projects SET custom_domain = ?, updated_at = ? WHERE id = ?`
      ).bind(customDomain, t, targetProjectId).run();
      audit(env, auth.email || "admin", "project_update_custom_domain", targetProjectId, {
        custom_domain: customDomain
      });
      return json(200, {
        ok: true,
        custom_domain: customDomain,
        public_url: customDomain ? `https://${customDomain}` : null
      });
    }, "onRequestPost");
  }
});

// api/admin/projects/fb-callback.js
function backToSettings(status, detail = "") {
  const q = new URLSearchParams({ fb: status });
  if (detail) q.set("fb_detail", detail.slice(0, 180));
  return new Response(null, {
    status: 302,
    headers: { location: `/admin#settings?${q.toString()}`, "cache-control": "no-store" }
  });
}
async function recordResult(env, projectId, status, detail) {
  if (!env?.DB || !projectId) return;
  try {
    await env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(
      `facebook_last_result__${projectId}`,
      JSON.stringify({ status, detail: String(detail || "").slice(0, 200), at: Math.floor(Date.now() / 1e3) }),
      Math.floor(Date.now() / 1e3)
    ).run();
  } catch {
  }
}
var onRequestGet8;
var init_fb_callback = __esm({
  "api/admin/projects/fb-callback.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_admin_token();
    init_facebook_oauth();
    init_secret_vault();
    init_events();
    __name(backToSettings, "backToSettings");
    __name(recordResult, "recordResult");
    onRequestGet8 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const errParam = url.searchParams.get("error_description") || url.searchParams.get("error");
      const adminToken = await getAdminToken(env);
      const verified = state ? await verifyState(adminToken, state) : null;
      const pid = verified?.projectId || "";
      const done = /* @__PURE__ */ __name(async (status, detail = "") => {
        await track(env, {
          event: status === "connected" ? "channel_connected" : "channel_connect_failed",
          projectId: pid,
          props: { channel: "facebook", status, detail }
        });
        await recordResult(env, pid, status, detail);
        return backToSettings(status, detail);
      }, "done");
      if (errParam) return done("denied", errParam);
      if (!code || !state) return done("error", "Thi\u1EBFu code ho\u1EB7c state.");
      if (!verified) return done("error", "State kh\xF4ng h\u1EE3p l\u1EC7 (c\xF3 th\u1EC3 phi\xEAn \u0111\xE3 h\u1EBFt h\u1EA1n). Th\u1EED l\u1EA1i.");
      const appId = await getAppId(env);
      const appSecret = await getAppSecret(env);
      if (!appId || !appSecret) return done("error", "Ch\u01B0a c\u1EA5u h\xECnh App ID/Secret.");
      try {
        const version = await getApiVersion(env);
        const shortToken = await exchangeCodeForToken({
          appId,
          appSecret,
          redirectUri: fbRedirectUri(request),
          code,
          version
        });
        const longToken = await exchangeForLongLived({ appId, appSecret, shortToken, version });
        const pages = await listManagedPages(longToken, version);
        if (!pages.length) {
          return done("no_pages", "T\xE0i kho\u1EA3n n\xE0y kh\xF4ng qu\u1EA3n tr\u1ECB Page n\xE0o (ho\u1EB7c ch\u01B0a c\u1EA5p quy\u1EC1n pages_show_list).");
        }
        await savePendingPages(env, pid, pages);
        if (pages.length === 1) {
          const p = pages[0];
          const t = Math.floor(Date.now() / 1e3);
          await setVaultSecret(env, `FACEBOOK_PAGE_TOKEN__${pid}`, p.access_token);
          await env.DB.prepare(
            `INSERT INTO project_publishing_configs (project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at)
         VALUES (?, 'facebook', '', '', ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           publisher_type = 'facebook',
           config_json = excluded.config_json,
           updated_at = excluded.updated_at`
          ).bind(pid, JSON.stringify({ page_id: p.id, page_name: p.name }), t, t).run();
          await clearPendingPages(env, pid);
          return done("connected", p.name);
        }
        return done("pick_page", `${pages.length} Page`);
      } catch (err) {
        return done("error", err?.message || String(err));
      }
    }, "onRequestGet");
  }
});

// api/admin/projects/fb-connect.js
var onRequestGet9;
var init_fb_connect = __esm({
  "api/admin/projects/fb-connect.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_auth();
    init_admin_token();
    init_events();
    init_facebook_oauth();
    onRequestGet9 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      if (!pid) return new Response("missing project", { status: 400 });
      const appId = await getAppId(env);
      const appSecret = await getAppSecret(env);
      if (!appId || !appSecret) {
        return new Response(JSON.stringify({
          error: "facebook_app_not_configured",
          detail: "Nh\u1EADp App ID v\xE0 App Secret tr\u01B0\u1EDBc khi k\u1EBFt n\u1ED1i."
        }), { status: 400, headers: { "content-type": "application/json" } });
      }
      await track(env, { event: "channel_connect_started", projectId: pid, props: { channel: "facebook" } });
      const adminToken = await getAdminToken(env);
      const state = await signState(adminToken, pid);
      const version = await getApiVersion(env);
      const url = buildAuthUrl({ appId, redirectUri: fbRedirectUri(request), state, version });
      return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
    }, "onRequestGet");
  }
});

// api/admin/projects/logo.js
function extFor3(mime) {
  return {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg"
  }[mime] || "bin";
}
function imageUrlFor3(key) {
  return "/image/" + key.split("/").map(encodeURIComponent).join("/");
}
function decodeBase643(b64) {
  const m = String(b64 || "").match(/^data:[^;]+;base64,(.+)$/i);
  const raw = m ? m[1] : String(b64 || "");
  const bin = atob(raw.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
var MAX_BYTES4, ALLOWED_MIME3, onRequestPost26;
var init_logo = __esm({
  "api/admin/projects/logo.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    MAX_BYTES4 = 2 * 1024 * 1024;
    ALLOWED_MIME3 = /* @__PURE__ */ new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
    __name(extFor3, "extFor");
    __name(imageUrlFor3, "imageUrlFor");
    __name(decodeBase643, "decodeBase64");
    onRequestPost26 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      if (!tenant || !tenant.activeProjectId) {
        return json(400, { error: "missing_or_invalid_project" });
      }
      if (!env.IMAGES) return json(500, { error: "r2_binding_missing" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const mime = String(body?.content_type || "").toLowerCase();
      if (!ALLOWED_MIME3.has(mime)) {
        return json(400, { error: "unsupported_mime", allowed: [...ALLOWED_MIME3] });
      }
      let bytes;
      try {
        bytes = decodeBase643(body?.base64);
      } catch {
        return json(400, { error: "base64_decode_failed" });
      }
      if (!bytes.length) return json(400, { error: "empty_body" });
      if (bytes.length > MAX_BYTES4) {
        return json(413, { error: "too_large", max_bytes: MAX_BYTES4, got_bytes: bytes.length });
      }
      const key = `project/${tenant.activeProjectId}/logo/${newId()}.${extFor3(mime)}`;
      try {
        await env.IMAGES.put(key, bytes, {
          httpMetadata: {
            contentType: mime,
            cacheControl: "public, max-age=31536000, immutable"
          }
        });
      } catch (e) {
        return json(500, { error: "r2_put_failed", detail: String(e?.message || e).slice(0, 200) });
      }
      const logoUrl = imageUrlFor3(key);
      await env.DB.prepare(
        `UPDATE projects SET logo_url = ?, updated_at = ? WHERE id = ?`
      ).bind(logoUrl, nowSec(), tenant.activeProjectId).run();
      audit(env, "admin", "project_logo_upload", tenant.activeProjectId, {
        mime,
        size_bytes: bytes.length,
        filename: String(body?.filename || "").slice(0, 200)
      });
      return json(200, { ok: true, logo_url: logoUrl });
    }, "onRequestPost");
  }
});

// api/admin/projects/profile.js
var MAX_NAME, onRequestGet10, onRequestPatch2;
var init_profile = __esm({
  "api/admin/projects/profile.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    MAX_NAME = 120;
    onRequestGet10 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      if (!pid) return json(200, { ok: true, project: null });
      const project = await env.DB.prepare(
        `SELECT p.id, p.slug, p.name, p.website_url, p.site_name, p.publishing_url, p.custom_domain,
            (SELECT COUNT(*) FROM blog_posts b WHERE b.project_id = p.id AND b.status = 'published') AS published_posts
       FROM projects p WHERE p.id = ? LIMIT 1`
      ).bind(pid).first().catch(() => null);
      return json(200, { ok: true, project });
    }, "onRequestGet");
    onRequestPatch2 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      if (!pid) return json(400, { error: "missing_project" });
      let body = {};
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const project = await env.DB.prepare(
        "SELECT id, slug, name, website_url, site_name, publishing_url, custom_domain FROM projects WHERE id = ? LIMIT 1"
      ).bind(pid).first().catch(() => null);
      if (!project) return json(404, { error: "project_not_found" });
      const sets = [];
      const args = [];
      if (body.name != null) {
        const name = String(body.name).trim().slice(0, MAX_NAME);
        if (!name) return json(400, { error: "empty_name" });
        sets.push("name = ?", "site_name = ?");
        args.push(name, name);
      }
      if (body.website_url != null) {
        const url = String(body.website_url).trim();
        if (url && !/^https?:\/\/.+/i.test(url)) {
          return json(400, { error: "bad_url", detail: "URL ph\u1EA3i b\u1EAFt \u0111\u1EA7u b\u1EB1ng http:// ho\u1EB7c https://" });
        }
        sets.push("website_url = ?");
        args.push(url);
      }
      if (body.slug != null) {
        const next = slugify(String(body.slug));
        if (!next) return json(400, { error: "bad_slug" });
        if (next !== project.slug) {
          const published = await env.DB.prepare(
            "SELECT COUNT(*) AS n FROM blog_posts WHERE project_id = ? AND status = 'published'"
          ).bind(pid).first().catch(() => ({ n: 0 }));
          if ((published?.n || 0) > 0) {
            return json(409, {
              error: "slug_locked",
              detail: "D\u1EF1 \xE1n \u0111\xE3 c\xF3 b\xE0i xu\u1EA5t b\u1EA3n \u2014 \u0111\u1ED5i slug s\u1EBD l\xE0m h\u1ECFng link c\u0169. D\xF9ng t\xEAn mi\u1EC1n ri\xEAng thay v\xEC \u0111\u1ED5i slug."
            });
          }
          const taken = await env.DB.prepare("SELECT id FROM projects WHERE slug = ? AND id != ? LIMIT 1").bind(next, pid).first().catch(() => null);
          if (taken) return json(409, { error: "slug_taken" });
          sets.push("slug = ?");
          args.push(next);
          const origin = (() => {
            try {
              return new URL(project.publishing_url || "").origin;
            } catch {
              return "";
            }
          })();
          if (origin) {
            sets.push("publishing_url = ?");
            args.push(`${origin}/${next}`);
          }
        }
      }
      if (!sets.length) return json(400, { error: "nothing_to_update" });
      sets.push("updated_at = ?");
      args.push(Math.floor(Date.now() / 1e3));
      args.push(pid);
      await env.DB.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).bind(...args).run();
      audit(env, "admin", "project_profile_update", pid, JSON.stringify({ fields: Object.keys(body) }));
      const updated = await env.DB.prepare(
        "SELECT id, slug, name, website_url, site_name, publishing_url, custom_domain FROM projects WHERE id = ? LIMIT 1"
      ).bind(pid).first();
      return json(200, { ok: true, project: updated });
    }, "onRequestPatch");
  }
});

// api/admin/projects/publishing.js
function safeConfigJson(config) {
  if (config == null) return "{}";
  const obj = typeof config === "string" ? (() => {
    try {
      return JSON.parse(config);
    } catch {
      return {};
    }
  })() : config;
  const j = JSON.stringify(obj || {});
  if (j.length > 8 * 1024) throw new Error("config_too_large");
  return j;
}
async function loadRow(env, projectId) {
  return env.DB.prepare(
    `SELECT project_id, publisher_type, endpoint_url, auth_header, config_json
       FROM project_publishing_configs WHERE project_id = ? LIMIT 1`
  ).bind(projectId).first().catch(() => null);
}
var PUBLISHER_TYPES, onRequestGet11, onRequestPost27;
var init_publishing = __esm({
  "api/admin/projects/publishing.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_secret_vault();
    init_events();
    init_facebook();
    init_facebook_oauth();
    PUBLISHER_TYPES = ["internal_d1", "webhook", "custom_api", "wordpress", "facebook"];
    __name(safeConfigJson, "safeConfigJson");
    __name(loadRow, "loadRow");
    onRequestGet11 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      if (!pid) return json(400, { error: "missing_project" });
      const row = await loadRow(env, pid);
      let config = {};
      try {
        config = JSON.parse(row?.config_json || "{}");
      } catch {
      }
      const scoped = await getVaultSecret(env, facebookTokenName(pid));
      const global = scoped ? "" : await getVaultSecret(env, "FACEBOOK_PAGE_TOKEN");
      const appId = await getAppId(env);
      const appSecret = await getAppSecret(env);
      const pending = await readPendingPages(env, pid).catch(() => null);
      let lastResult = null;
      try {
        const row2 = await env.DB.prepare("SELECT value FROM settings WHERE key = ? LIMIT 1").bind(`facebook_last_result__${pid}`).first();
        if (row2?.value) {
          lastResult = JSON.parse(row2.value);
          await env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(`facebook_last_result__${pid}`).run();
        }
      } catch {
      }
      return json(200, {
        ok: true,
        project_id: pid,
        publisher_type: row?.publisher_type || "internal_d1",
        endpoint_url: row?.endpoint_url || "",
        auth_header: row?.auth_header ? "set" : "",
        config,
        // Status only — never the plaintext token.
        token: {
          set: !!(scoped || global),
          source: scoped ? "project" : global ? "global" : "unset"
        },
        app: { app_id: appId, api_version: await getApiVersion(env), id_set: !!appId, secret_set: !!appSecret },
        // A tenant may connect their own Page but must not touch the shared
        // Meta app credentials.
        can_manage_app: auth?.via === "bearer" || auth?.role === "super_admin",
        pending_pages: pending ? pending.length : 0,
        last_result: lastResult,
        allowed_types: PUBLISHER_TYPES
      });
    }, "onRequestGet");
    onRequestPost27 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      let body = {};
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const pid = tenant?.activeProjectId || String(body?.project_id || "").trim() || null;
      if (!pid) return json(400, { error: "missing_project" });
      if (body?.action === "save_app") {
        const superGate = await requireSuperAdmin(env, request);
        if (superGate.error) return superGate.error;
        if (typeof body?.app_id === "string") await setAppId(env, body.app_id);
        if (typeof body?.api_version === "string") {
          const v = body.api_version.trim();
          if (v && !/^v\d+\.\d+$/.test(v)) return json(400, { error: "bad_api_version", detail: "D\u1EA1ng \u0111\xFAng: v23.0" });
          const t2 = Math.floor(Date.now() / 1e3);
          await env.DB.prepare(
            `INSERT INTO settings (key, value, updated_at) VALUES ('facebook_api_version', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
          ).bind(v, t2).run();
        }
        let secretState = "unchanged";
        if (typeof body?.app_secret === "string") {
          const val = body.app_secret.trim();
          await setVaultSecret(env, FB_APP_SECRET_NAME, val);
          secretState = val ? "stored" : "cleared";
        }
        audit(env, "admin", "fb_app_save", pid, { secret: secretState });
        return json(200, { ok: true, app_id: await getAppId(env), api_version: await getApiVersion(env), secret: secretState });
      }
      if (body?.action === "pages") {
        const pages = await readPendingPages(env, pid);
        if (!pages) return json(200, { ok: true, pages: [], expired: true });
        return json(200, {
          ok: true,
          pages: pages.map(({ token, ...rest }) => rest)
        });
      }
      if (body?.action === "select_page") {
        const pageId = String(body?.page_id || "").trim();
        if (!pageId) return json(400, { error: "missing_page_id" });
        const pages = await readPendingPages(env, pid);
        if (!pages) return json(400, { error: "pending_expired", detail: "Danh s\xE1ch Page \u0111\xE3 h\u1EBFt h\u1EA1n. B\u1EA5m K\u1EBFt n\u1ED1i Facebook l\u1EA1i." });
        const chosen = pages.find((p) => p.id === pageId);
        if (!chosen) return json(404, { error: "page_not_found" });
        await setVaultSecret(env, facebookTokenName(pid), chosen.token);
        const t2 = Math.floor(Date.now() / 1e3);
        await env.DB.prepare(
          `INSERT INTO project_publishing_configs (project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at)
       VALUES (?, 'facebook', '', '', ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         publisher_type = 'facebook',
         config_json = excluded.config_json,
         updated_at = excluded.updated_at`
        ).bind(pid, JSON.stringify({ page_id: chosen.id, page_name: chosen.name }), t2, t2).run();
        await clearPendingPages(env, pid);
        audit(env, "admin", "fb_select_page", pid, { page_id: chosen.id });
        await track(env, { event: "channel_connected", projectId: pid, props: { channel: "facebook", page: chosen.name } });
        return json(200, { ok: true, page: { id: chosen.id, name: chosen.name } });
      }
      if (body?.action === "disconnect") {
        await setVaultSecret(env, facebookTokenName(pid), "");
        await clearPendingPages(env, pid);
        const t2 = Math.floor(Date.now() / 1e3);
        await env.DB.prepare(
          `INSERT INTO project_publishing_configs (project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at)
       VALUES (?, 'internal_d1', '', '', '{}', ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         publisher_type = 'internal_d1', config_json = '{}', updated_at = excluded.updated_at`
        ).bind(pid, t2, t2).run();
        audit(env, "admin", "fb_disconnect", pid, {});
        await track(env, { event: "channel_disconnected", projectId: pid, props: { channel: "facebook" } });
        return json(200, { ok: true });
      }
      if (body?.action === "test") {
        const savedRow = await loadRow(env, pid);
        let savedCfg = {};
        try {
          savedCfg = JSON.parse(savedRow?.config_json || "{}");
        } catch {
        }
        const pageIdToCheck = body?.page_id || body?.config?.page_id || savedCfg.page_id;
        try {
          const page = await verifyFacebookPage({
            env,
            projectId: pid,
            pageId: pageIdToCheck,
            token: typeof body?.token === "string" && body.token.trim() ? body.token.trim() : void 0
          });
          return json(200, { ok: true, page });
        } catch (err) {
          return json(400, { ok: false, error: err.message, graph: err.graph || null });
        }
      }
      const type = String(body?.publisher_type || "internal_d1").trim();
      if (!PUBLISHER_TYPES.includes(type)) return json(400, { error: "bad_publisher_type", allowed: PUBLISHER_TYPES });
      let configJson;
      try {
        configJson = safeConfigJson(body?.config);
      } catch (e) {
        return json(400, { error: String(e.message || e) });
      }
      const t = Math.floor(Date.now() / 1e3);
      await env.DB.prepare(
        `INSERT INTO project_publishing_configs (project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET
       publisher_type = excluded.publisher_type,
       endpoint_url = excluded.endpoint_url,
       auth_header = excluded.auth_header,
       config_json = excluded.config_json,
       updated_at = excluded.updated_at`
      ).bind(
        pid,
        type,
        String(body?.endpoint_url || "").slice(0, 500),
        String(body?.auth_header || "").slice(0, 500),
        configJson,
        t,
        t
      ).run();
      let tokenState = "unchanged";
      if (typeof body?.token === "string") {
        const val = body.token.trim();
        await setVaultSecret(env, facebookTokenName(pid), val);
        tokenState = val ? "stored" : "cleared";
      }
      audit(env, "admin", "publishing_config_save", pid, { publisher_type: type, token: tokenState });
      return json(200, { ok: true, project_id: pid, publisher_type: type, token: tokenState });
    }, "onRequestPost");
  }
});

// api/admin/providers/gurouter-models.js
var onRequestGet12;
var init_gurouter_models = __esm({
  "api/admin/providers/gurouter-models.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_ai();
    onRequestGet12 = /* @__PURE__ */ __name(async ({ env, request }) => {
      try {
        const gate = await adminGate(env, request);
        if (gate) return gate;
        const overlayed = await vaultedEnv(env);
        const apiKey = overlayed?.GUROUTER_API_KEY;
        if (!apiKey) {
          return json(400, {
            ok: false,
            error: "gurouter_not_configured",
            hint: "Save GUROUTER_API_KEY in Settings first."
          });
        }
        const baseUrl = (overlayed?.GUROUTER_BASE_URL || "https://gurouter.com/v1").replace(/\/+$/, "");
        const res = await fetch(`${baseUrl}/models`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          }
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          return json(res.status, {
            ok: false,
            error: "gurouter_upstream_error",
            detail: txt.slice(0, 500)
          });
        }
        const data = await res.json().catch(() => ({}));
        const rawList = Array.isArray(data) ? data : data?.data || [];
        const models = rawList.map((m) => {
          if (typeof m === "string") return { id: m, label: m };
          const id = m.id || m.name;
          return {
            id,
            label: m.name || m.display_name || id,
            owned_by: m.owned_by || m.provider || ""
          };
        }).filter((m) => !!m.id);
        return json(200, {
          ok: true,
          count: models.length,
          models
        });
      } catch (err) {
        return json(500, {
          ok: false,
          error: "server_error",
          detail: err.message
        });
      }
    }, "onRequestGet");
  }
});

// api/admin/providers/test.js
var onRequestPost28;
var init_test2 = __esm({
  "api/admin/providers/test.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_ai();
    onRequestPost28 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body = {};
      try {
        body = await request.json();
      } catch {
      }
      const wanted = String(body?.name || "").trim();
      let names;
      if (wanted) {
        names = [wanted];
      } else {
        const list = await listProviders(env);
        names = list?.text || [];
      }
      const results = [];
      for (const n of names) {
        const r = await pingTextProvider(env, n);
        results.push({ name: n, ...r });
      }
      audit(env, "admin", "provider_test", null, {
        tested: names.length,
        failed: results.filter((r) => !r.ok).map((r) => r.name)
      });
      return json(200, { ok: true, results });
    }, "onRequestPost");
  }
});

// api/admin/providers/test-image.js
var onRequestPost29;
var init_test_image = __esm({
  "api/admin/providers/test-image.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_ai();
    init_image();
    onRequestPost29 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body = {};
      try {
        body = await request.json();
      } catch {
      }
      const prompt = body?.prompt || "A modern retail clothing store with warm lighting, wood shelves, cinematic composition, photorealistic, 8k";
      try {
        const t0 = Date.now();
        const res = await generateImage(env, {
          prompt,
          provider: body?.provider || "workers-ai",
          source: "test-generate"
        });
        const ms = Date.now() - t0;
        const fmt = sniffImageFormat(res.bytes);
        let r2Upload = false;
        let r2Key = null;
        if (env.IMAGES && res.bytes) {
          r2Key = `test-hero-${Date.now()}.${fmt.ext}`;
          await env.IMAGES.put(r2Key, res.bytes, {
            httpMetadata: { contentType: fmt.type, cacheControl: "public, max-age=3600" }
          });
          r2Upload = true;
        }
        return json(200, {
          ok: true,
          ms,
          bytes_length: res.bytes?.length || 0,
          format: fmt,
          provider: res.ai_provider,
          r2_uploaded: r2Upload,
          image_url: r2Key ? `https://gu-seo.pages.dev/image/${r2Key}` : null
        });
      } catch (err) {
        return json(500, {
          ok: false,
          error: "image_generation_failed",
          detail: err.message || String(err)
        });
      }
    }, "onRequestPost");
  }
});

// api/admin/refresh/run.js
async function weeklyRefreshCount(env, projectId) {
  const since = nowSec() - 7 * 86400;
  const row = projectId ? await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM refresh_jobs r JOIN blog_posts p ON p.id = r.post_id
          WHERE r.status = 'published' AND r.created_at > ? AND (p.project_id = ? OR p.project_id IS NULL)`
  ).bind(since, projectId).first().catch(() => ({ n: 0 })) : await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM refresh_jobs WHERE status = 'published' AND created_at > ?`
  ).bind(since).first().catch(() => ({ n: 0 }));
  return row?.n || 0;
}
var WEEKLY_CAP, onRequestPost30;
var init_run = __esm({
  "api/admin/refresh/run.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_ai();
    init_sanitise();
    init_aliases();
    init_internal_links();
    init_settings();
    init_usage();
    init_indexnow();
    init_google_indexing();
    init_aliases();
    init_dedup();
    init_quality();
    init_project_scope();
    WEEKLY_CAP = 2;
    __name(weeklyRefreshCount, "weeklyRefreshCount");
    onRequestPost30 = /* @__PURE__ */ __name(async ({ request, env, waitUntil }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      if (!env?.DB) return json(500, { error: "no_db" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      let jobId = String(body?.job_id || "");
      let post;
      if (jobId) {
        const job = await env.DB.prepare("SELECT * FROM refresh_jobs WHERE id = ? LIMIT 1").bind(jobId).first();
        if (!job) return json(404, { error: "job_not_found" });
        if (job.status === "published") return json(200, { ok: true, status: "published", idempotent: true });
        post = await env.DB.prepare("SELECT * FROM blog_posts WHERE id = ? LIMIT 1").bind(job.post_id).first();
        if (!post) return json(404, { error: "post_not_found" });
      } else {
        const postId = String(body?.post_id || "");
        if (!postId) return json(400, { error: "missing_job_or_post_id" });
        post = await env.DB.prepare("SELECT * FROM blog_posts WHERE id = ? LIMIT 1").bind(postId).first();
        if (!post) return json(404, { error: "post_not_found" });
        jobId = newId();
        const t2 = nowSec();
        await env.DB.prepare(
          `INSERT INTO refresh_jobs (id, post_id, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, 'created', ?, ?)`
        ).bind(jobId, post.id, String(body?.reason || "manual"), t2, t2).run();
      }
      const failJob = /* @__PURE__ */ __name(async (msg) => {
        await env.DB.prepare(
          `UPDATE refresh_jobs SET status='failed', error=?, updated_at=? WHERE id=?`
        ).bind(String(msg).slice(0, 500), nowSec(), jobId).run().catch(() => {
        });
      }, "failJob");
      if (await weeklyRefreshCount(env, post.project_id || null) >= WEEKLY_CAP) {
        return json(429, { error: "refresh_cap_reached", detail: `Max ${WEEKLY_CAP} refreshes per 7 days per project.` });
      }
      const source = request.headers.get("X-Source-Cron") === "1" ? "cron-refresh" : "admin-refresh";
      if (source === "cron-refresh" && !body.allow_over_budget) {
        const b = await checkBudget(env, source);
        if (!b.allowed) {
          await failJob("budget_exceeded");
          return json(429, { error: "budget_exceeded", month_spend_usd: b.spend, budget_usd: b.budget, pct: b.pct });
        }
      }
      const aliases = await buildAliasMap(env, post.project_id || null);
      const settings = await loadSettings(env);
      let out;
      try {
        out = await generateContent(env, {
          kind: "article",
          seed: `Rewrite, expand and update this article for 2026. Keep the same topic and search intent, fix outdated facts, add concrete examples with numbers, keep Vietnamese natural and expert. Original title: "${post.title}". Primary keyword hint: "${post.topic_seed || post.slug}".

Original body (rewrite from this, do not copy verbatim):
${String(post.body_markdown || "").slice(0, 6e3)}`,
          provider: body.provider || settings.default_ai_provider || void 0,
          source,
          projectId: post.project_id || null,
          brand: {
            name: settings.site_name || "this site",
            url: settings.site_url || "/",
            cta: settings.site_cta,
            tone: settings.brand_voice_tone || settings.site_tone || void 0,
            audience: settings.brand_target_audience || settings.site_audience || void 0,
            business_type: settings.brand_business_type || void 0,
            key_themes: settings.brand_key_themes || void 0,
            topics_to_avoid: settings.brand_topics_to_avoid || void 0,
            service_area: settings.brand_service_area || void 0,
            aliases
          }
        });
      } catch (e) {
        const msg = String(e.message || e).slice(0, 800);
        await failJob("text:" + msg);
        return json(502, { error: "refresh_generation_failed", detail: msg });
      }
      out.body_markdown = sanitiseMarkdownLinks(out.body_markdown, { aliases });
      if (out.title) {
        const cleaned = String(out.title).replace(/^Blog(?:\s*[:\-]\s*|(?=[A-Z]))/, "");
        if (cleaned !== out.title) {
          out.title = cleaned;
          out.slug = slugify(cleaned);
        }
      }
      const verdict = scorePost({
        title: out.title || post.title,
        body_markdown: out.body_markdown,
        meta_description: out.meta_description || post.meta_description,
        slug: out.slug || post.slug
      });
      if (verdict.band === "bad" && !body.force) {
        await failJob(`quality:${verdict.score}`);
        return json(502, { error: "refresh_quality_too_low", quality: verdict });
      }
      let newSlug = post.slug;
      if (out.slug && out.slug !== post.slug) {
        const clash = await env.DB.prepare("SELECT 1 FROM blog_posts WHERE slug = ? LIMIT 1").bind(out.slug).first().catch(() => null);
        if (!clash) {
          newSlug = out.slug;
          await env.DB.prepare(
            `INSERT OR IGNORE INTO blog_post_redirects (old_slug, new_slug, created_at) VALUES (?, ?, ?)`
          ).bind(post.slug, newSlug, nowSec()).run().catch(() => {
          });
        }
      }
      try {
        const pillarRow = post.topic_seed ? await env.DB.prepare(
          `SELECT pillar_key FROM content_clusters WHERE cluster_key = ? AND status = 'active' LIMIT 1`
        ).bind(String(post.topic_seed).slice(0, 120)).first().catch(() => null) : null;
        const targets = await loadLinkTargets(env, newSlug, { limit: 80, pillarKey: pillarRow?.pillar_key || null, projectId: post.project_id || null });
        if (targets.length) {
          const { body: linkedBody } = injectInternalLinks(out.body_markdown, newSlug, targets);
          out.body_markdown = linkedBody;
        }
      } catch {
      }
      const t = nowSec();
      await env.DB.prepare(
        `UPDATE blog_posts SET title = ?, meta_description = ?, body_markdown = ?, keywords = ?,
       slug = ?, last_refresh_at = ?, refresh_count = COALESCE(refresh_count, 0) + 1 WHERE id = ?`
      ).bind(
        out.title || post.title,
        out.meta_description || post.meta_description,
        out.body_markdown,
        out.keywords || post.keywords,
        newSlug,
        t,
        post.id
      ).run();
      await env.DB.prepare(
        `UPDATE refresh_jobs SET status='published', updated_at=? WHERE id=?`
      ).bind(t, jobId).run();
      const base = await publicBaseFor(env, post.project_id || null, request);
      const blogHost = new URL(base).hostname;
      const newUrls = [`${base}/blog`, `${base}/blog/${newSlug}`];
      waitUntil(pingIndexNow(env, newUrls, request, blogHost).catch(() => {
      }));
      waitUntil(onPublish(env, newUrls).catch(() => {
      }));
      waitUntil(syncSitemapAliases(env, post.project_id || null).catch(() => {
      }));
      waitUntil(storeEmbedding(env, newSlug, {
        title: out.title || post.title,
        body_markdown: out.body_markdown,
        meta_description: out.meta_description || post.meta_description
      }).catch(() => {
      }));
      audit(env, source.startsWith("cron") ? "cron" : "admin", "refresh_run", post.id, {
        job_id: jobId,
        slug: newSlug,
        quality: { score: verdict.score, band: verdict.band }
      });
      return json(200, { ok: true, status: "published", post_id: post.id, slug: newSlug, renamed: newSlug !== post.slug, quality: verdict });
    }, "onRequestPost");
  }
});

// api/admin/refresh/scan.js
var STALE_DAYS, REFRESH_COOLDOWN_DAYS, onRequestPost31;
var init_scan2 = __esm({
  "api/admin/refresh/scan.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    STALE_DAYS = 90;
    REFRESH_COOLDOWN_DAYS = 30;
    onRequestPost31 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      if (!env?.DB) return json(500, { error: "no_db" });
      let body;
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      const projectId = String(body?.project_id || body?.project || "").trim() || null;
      const limit = Math.min(20, Math.max(1, parseInt(body?.limit, 10) || 10));
      const t = nowSec();
      const staleBefore = t - STALE_DAYS * 86400;
      const cooldownBefore = t - REFRESH_COOLDOWN_DAYS * 86400;
      const rows = projectId ? await env.DB.prepare(
        `SELECT id, slug, title, published_at, last_refresh_at, refresh_count
           FROM blog_posts
          WHERE status = 'published' AND published_at < ?
            AND (project_id = ? OR project_id IS NULL)
            AND (last_refresh_at IS NULL OR last_refresh_at < ?)
          ORDER BY published_at ASC LIMIT ?`
      ).bind(staleBefore, projectId, cooldownBefore, limit).all().catch(() => ({ results: [] })) : await env.DB.prepare(
        `SELECT id, slug, title, published_at, last_refresh_at, refresh_count
           FROM blog_posts
          WHERE status = 'published' AND published_at < ?
            AND (last_refresh_at IS NULL OR last_refresh_at < ?)
          ORDER BY published_at ASC LIMIT ?`
      ).bind(staleBefore, cooldownBefore, limit).all().catch(() => ({ results: [] }));
      const created = [];
      for (const p of rows?.results || []) {
        const open = await env.DB.prepare(
          `SELECT 1 FROM refresh_jobs WHERE post_id = ? AND status = 'created' LIMIT 1`
        ).bind(p.id).first().catch(() => null);
        if (open) continue;
        const id = newId();
        await env.DB.prepare(
          `INSERT INTO refresh_jobs (id, post_id, reason, status, created_at, updated_at)
       VALUES (?, ?, 'stale', 'created', ?, ?)`
        ).bind(id, p.id, t, t).run().catch(() => {
        });
        created.push({ job_id: id, post_id: p.id, slug: p.slug, title: p.title, reason: "stale" });
      }
      audit(env, "admin", "refresh.scan", projectId, { candidates: created.length });
      return json(200, { ok: true, count: created.length, jobs: created });
    }, "onRequestPost");
  }
});

// api/admin/topics/score.js
var onRequestPost32;
var init_score = __esm({
  "api/admin/topics/score.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_projects();
    init_project_topics();
    onRequestPost32 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const projectId = String(body?.project_id || body?.project || "gulagi").trim();
      const project = await getProject(env, projectId);
      if (!project) return json(404, { error: "project_not_found" });
      const ranked = await scoreProjectTopics(env, project);
      audit(env, "admin", "topics.score", project.id, { ranked: ranked.length });
      return json(200, { ok: true, count: ranked.length, topics: ranked.slice(0, 20) });
    }, "onRequestPost");
  }
});

// api/admin/update/apply.js
async function fetchLatestSha() {
  try {
    const r = await fetch(
      "https://api.github.com/repos/Benjamin-Bloch/pages-seo/commits/main",
      { headers: { "User-Agent": "pages-seo-update", Accept: "application/vnd.github+json" } }
    );
    if (!r.ok) return "";
    const d = await r.json();
    return d?.sha || "";
  } catch {
    return "";
  }
}
var CF_API, onRequestPost33;
var init_apply2 = __esm({
  "api/admin/update/apply.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_settings();
    CF_API = "https://api.cloudflare.com/client/v4";
    __name(fetchLatestSha, "fetchLatestSha");
    onRequestPost33 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const token = String(body?.token || "").trim();
      if (!token) return json(400, { error: "token_required", detail: "Paste a Cloudflare API token with Pages:Edit scope." });
      const s = await loadSettings(env);
      if (s.install_method !== "browser" && s.install_method !== "maintainer") {
        return json(409, {
          error: "not_supported_for_install_method",
          detail: "In-app update is only available for installs done via the browser or maintainer flow (Git-linked). For CLI installs, re-run the terminal installer command."
        });
      }
      const accountId = String(s.install_cf_account || "").trim();
      const project = String(s.install_cf_project || "").trim();
      if (!accountId || !project) {
        return json(409, { error: "missing_install_metadata", detail: "Account id or project slug not recorded at install time. Use the CLI updater instead." });
      }
      const branch = String(s.production_branch || "main").trim() || "main";
      const form = new FormData();
      form.append("branch", branch);
      const r = await fetch(
        `${CF_API}/accounts/${accountId}/pages/projects/${project}/deployments`,
        { method: "POST", headers: { Authorization: "Bearer " + token }, body: form }
      );
      let respBody = null;
      try {
        respBody = await r.json();
      } catch {
      }
      if (!r.ok) {
        const detail = Array.isArray(respBody?.errors) && respBody.errors[0]?.message || `Cloudflare returned HTTP ${r.status}`;
        return json(r.status || 502, { error: "cloudflare_error", detail });
      }
      const latestSha = await fetchLatestSha();
      if (latestSha) await setSetting(env, "installed_sha", latestSha);
      await setSetting(env, "update_dismissed_sha", latestSha || "");
      await audit(env, "admin", "update_apply", "", JSON.stringify({
        project,
        account: accountId,
        new_sha: latestSha || null
      }));
      return json(200, {
        ok: true,
        deployment_id: respBody?.result?.id || null,
        deployment_url: respBody?.result?.url || null,
        new_sha: latestSha || null
      });
    }, "onRequestPost");
  }
});

// api/install/d1/delete.js
async function cfFetch(token, path, init) {
  const r = await fetch(CF_API2 + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...init?.headers || {}
    }
  });
  let body = null;
  try {
    body = await r.json();
  } catch {
  }
  return { status: r.status, ok: r.ok, body };
}
function firstError(body) {
  if (Array.isArray(body?.errors) && body.errors.length) {
    return body.errors.map((e) => e.message || String(e)).join(" \xB7 ");
  }
  return body?.error || null;
}
var CF_API2, onRequestPost34;
var init_delete = __esm({
  "api/install/d1/delete.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    CF_API2 = "https://api.cloudflare.com/client/v4";
    __name(cfFetch, "cfFetch");
    __name(firstError, "firstError");
    onRequestPost34 = /* @__PURE__ */ __name(async ({ request }) => {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json(400, { ok: false, error: "bad_json" });
      }
      const token = String(payload?.token || "").trim();
      const accountId = String(payload?.account_id || "").trim().toLowerCase();
      const uuid = String(payload?.uuid || "").trim().toLowerCase();
      if (!token) return json(400, { ok: false, error: "missing_token" });
      if (!/^[a-f0-9]{32}$/.test(accountId)) return json(400, { ok: false, error: "bad_account_id" });
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(uuid)) {
        return json(400, { ok: false, error: "bad_uuid" });
      }
      const r = await cfFetch(token, `/accounts/${accountId}/d1/database/${uuid}`, {
        method: "DELETE"
      });
      if (r.ok) return json(200, { ok: true, uuid, deleted: true });
      if (r.status === 401) return json(401, { ok: false, error: "token_rejected", detail: firstError(r.body) });
      if (r.status === 403) return json(403, { ok: false, error: "d1_write_denied", detail: "Your token can't delete D1 databases. Re-create it with D1:Edit checked." });
      if (r.status === 404) return json(404, { ok: false, error: "db_not_found", detail: "Already deleted or never existed." });
      return json(502, {
        ok: false,
        error: "cf_api_error",
        detail: firstError(r.body) || "HTTP " + r.status
      });
    }, "onRequestPost");
  }
});

// api/install/d1/list.js
async function cfFetch2(token, path) {
  const r = await fetch(CF_API3 + path, {
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }
  });
  let body = null;
  try {
    body = await r.json();
  } catch {
  }
  return { status: r.status, ok: r.ok, body };
}
function firstError2(body) {
  if (Array.isArray(body?.errors) && body.errors.length) {
    return body.errors.map((e) => e.message || String(e)).join(" \xB7 ");
  }
  return body?.error || null;
}
async function resolveAccount(token, accountIdHint) {
  if (accountIdHint && /^[a-f0-9]{32}$/i.test(accountIdHint)) {
    const r = await cfFetch2(token, `/accounts/${accountIdHint}`);
    if (r.ok && r.body?.result?.id) {
      return { id: r.body.result.id, name: r.body.result.name };
    }
  }
  const accountsR = await cfFetch2(token, "/accounts");
  if (!accountsR.ok || !accountsR.body?.result?.length) return null;
  const a = accountsR.body.result[0];
  return { id: a.id, name: a.name };
}
var CF_API3, FREE_TIER_D1_CAP, onRequestPost35;
var init_list2 = __esm({
  "api/install/d1/list.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    CF_API3 = "https://api.cloudflare.com/client/v4";
    FREE_TIER_D1_CAP = 10;
    __name(cfFetch2, "cfFetch");
    __name(firstError2, "firstError");
    __name(resolveAccount, "resolveAccount");
    onRequestPost35 = /* @__PURE__ */ __name(async ({ request }) => {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json(400, { ok: false, error: "bad_json" });
      }
      const token = String(payload?.token || "").trim();
      if (!token) return json(400, { ok: false, error: "missing_token" });
      const account = await resolveAccount(token, payload?.account_id);
      if (!account) {
        return json(401, {
          ok: false,
          error: "token_rejected",
          detail: "Token didn't resolve any account. Re-create it on /install."
        });
      }
      const databases = [];
      for (let page = 1; page <= 5; page++) {
        const r = await cfFetch2(
          token,
          `/accounts/${account.id}/d1/database?page=${page}&per_page=50`
        );
        if (!r.ok) {
          if (r.status === 403) {
            return json(403, {
              ok: false,
              error: "d1_read_denied",
              detail: "Your token can't list D1 databases. Re-create it with the D1:Edit scope included."
            });
          }
          const detail = firstError2(r.body) || "HTTP " + r.status;
          return json(502, { ok: false, error: "cf_api_error", detail });
        }
        const rows = r.body?.result || [];
        for (const d of rows) {
          databases.push({
            uuid: d.uuid,
            name: d.name,
            created_at: d.created_at,
            num_tables: d.num_tables ?? null,
            file_size: d.file_size ?? null,
            version: d.version ?? null
          });
        }
        if (rows.length < 50) break;
      }
      return json(200, {
        ok: true,
        account,
        limit: FREE_TIER_D1_CAP,
        count: databases.length,
        databases
      }, {
        // Result is account-private — never cache at any layer.
        "cache-control": "no-store"
      });
    }, "onRequestPost");
  }
});

// _lib/oauth_cookie.js
function toB64Url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64Url(s) {
  let b64 = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function deriveKey2(secret) {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: SALT, iterations: PBKDF2_ITER3, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
function readCookie2(req, name) {
  const hdr = req.headers.get("cookie") || "";
  for (const c of hdr.split(/;\s*/)) {
    const eq = c.indexOf("=");
    if (eq < 0) continue;
    if (c.slice(0, eq).trim() === name) return c.slice(eq + 1).trim();
  }
  return null;
}
async function setOAuthCookie(env, payload) {
  if (!env?.GITHUB_OAUTH_CLIENT_SECRET) throw new Error("oauth_secret_missing");
  const key = await deriveKey2(env.GITHUB_OAUTH_CLIENT_SECRET);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv, 0);
  packed.set(ct, iv.length);
  return [
    `${COOKIE_NAME}=${toB64Url(packed)}`,
    `Max-Age=${TTL_SEC}`,
    `Path=${COOKIE_PATH}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}
async function readOAuthCookie(env, request) {
  if (!env?.GITHUB_OAUTH_CLIENT_SECRET) return null;
  const raw = readCookie2(request, COOKIE_NAME);
  if (!raw) return null;
  try {
    const key = await deriveKey2(env.GITHUB_OAUTH_CLIENT_SECRET);
    const packed = fromB64Url(raw);
    if (packed.length < 12 + 16) return null;
    const iv = packed.slice(0, 12);
    const ct = packed.slice(12);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return null;
  }
}
var COOKIE_NAME, COOKIE_PATH, TTL_SEC, PBKDF2_ITER3, SALT;
var init_oauth_cookie = __esm({
  "_lib/oauth_cookie.js"() {
    init_functionsRoutes_0_09583509623234443();
    COOKIE_NAME = "ps_gh";
    COOKIE_PATH = "/api";
    TTL_SEC = 60 * 60;
    PBKDF2_ITER3 = 1e5;
    SALT = new TextEncoder().encode("pages-seo:oauth-cookie:v1");
    __name(toB64Url, "toB64Url");
    __name(fromB64Url, "fromB64Url");
    __name(deriveKey2, "deriveKey");
    __name(readCookie2, "readCookie");
    __name(setOAuthCookie, "setOAuthCookie");
    __name(readOAuthCookie, "readOAuthCookie");
  }
});

// api/install/github/cf-app.js
var CF_APP_SLUGS, onRequestGet13;
var init_cf_app = __esm({
  "api/install/github/cf-app.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_oauth_cookie();
    CF_APP_SLUGS = /* @__PURE__ */ new Set([
      "cloudflare-workers-and-pages",
      "cloudflare-pages"
      // legacy app name, just in case
    ]);
    onRequestGet13 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const session = await readOAuthCookie(env, request);
      if (!session?.token) return json(401, { ok: false, error: "gh_not_connected" });
      const r = await fetch("https://api.github.com/user/installations?per_page=100", {
        headers: {
          Authorization: "token " + session.token,
          Accept: "application/vnd.github+json",
          "User-Agent": "pages-seo-install"
        }
      });
      if (!r.ok) {
        return json(502, { ok: false, error: "github_list_failed", detail: "HTTP " + r.status });
      }
      const body = await r.json().catch(() => ({}));
      const installations = (body?.installations || []).map((i) => ({
        app_slug: i.app_slug || "",
        account: i.account?.login || "",
        html_url: i.html_url || ""
      }));
      const installed = installations.some((i) => CF_APP_SLUGS.has(i.app_slug));
      return json(200, { ok: true, installed, installations });
    }, "onRequestGet");
  }
});

// api/install/github/fork.js
function ghHeaders(token) {
  return {
    Authorization: "token " + token,
    Accept: "application/vnd.github+json",
    "User-Agent": "pages-seo-install"
  };
}
async function findCfInstallation(token) {
  const r = await fetch("https://api.github.com/user/installations?per_page=100", {
    headers: ghHeaders(token)
  });
  if (!r.ok) return null;
  const d = await r.json().catch(() => ({}));
  const list = Array.isArray(d?.installations) ? d.installations : [];
  const hit = list.find((i) => i?.app_slug === CF_APP_SLUG);
  if (!hit) return null;
  return {
    id: hit.id,
    repository_selection: hit.repository_selection,
    // 'all' | 'selected'
    target_login: hit.account?.login || null
  };
}
async function addRepoToInstallation(token, installation, repoId) {
  if (installation.repository_selection === "all") {
    return { ok: true, action: "all_mode" };
  }
  const r = await fetch(
    `https://api.github.com/user/installations/${installation.id}/repositories/${repoId}`,
    { method: "PUT", headers: ghHeaders(token) }
  );
  if (r.status === 204) return { ok: true, action: "added" };
  if (r.status === 304) return { ok: true, action: "already" };
  let detail = "HTTP " + r.status;
  try {
    const d = await r.json();
    detail = d?.message || detail;
  } catch {
  }
  return { ok: false, action: "failed", detail };
}
async function ensureCfAppAccess(token, repoId, repoFullName) {
  if (!repoId) return { ok: false, reason: "no_repo_id" };
  try {
    const installation = await findCfInstallation(token);
    if (!installation) {
      return {
        ok: false,
        reason: "not_installed",
        install_url: `https://github.com/apps/${CF_APP_SLUG}/installations/new`
      };
    }
    const result = await addRepoToInstallation(token, installation, repoId);
    return {
      ok: result.ok,
      reason: result.action,
      installation_id: installation.id,
      target: installation.target_login,
      detail: result.detail || null
    };
  } catch (e) {
    return { ok: false, reason: "exception", detail: String(e?.message || e) };
  }
}
async function lookupRepo(token, fullName) {
  const r = await fetch(`https://api.github.com/repos/${fullName}`, { headers: ghHeaders(token) });
  if (r.status === 404) return { exists: false };
  if (!r.ok) return { exists: null, error: "HTTP " + r.status };
  const d = await r.json();
  return {
    exists: true,
    id: d?.id || null,
    is_fork: !!d?.fork,
    parent_full_name: d?.parent?.full_name || null,
    default_branch: d?.default_branch || "main",
    owner: d?.owner?.login,
    name: d?.name,
    html_url: d?.html_url
  };
}
var UPSTREAM_OWNER, UPSTREAM_REPO, CF_APP_SLUG, onRequestPost36;
var init_fork = __esm({
  "api/install/github/fork.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_oauth_cookie();
    UPSTREAM_OWNER = "Benjamin-Bloch";
    UPSTREAM_REPO = "pages-seo";
    CF_APP_SLUG = "cloudflare-workers-and-pages";
    __name(ghHeaders, "ghHeaders");
    __name(findCfInstallation, "findCfInstallation");
    __name(addRepoToInstallation, "addRepoToInstallation");
    __name(ensureCfAppAccess, "ensureCfAppAccess");
    __name(lookupRepo, "lookupRepo");
    onRequestPost36 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const session = await readOAuthCookie(env, request);
      if (!session?.token) return json(401, { ok: false, error: "gh_not_connected" });
      if (!session?.login) return json(401, { ok: false, error: "no_gh_login" });
      const token = session.token;
      const login = session.login;
      const fullName = `${login}/${UPSTREAM_REPO}`;
      const existing = await lookupRepo(token, fullName);
      if (existing.exists && existing.is_fork) {
        const parentOk = existing.parent_full_name && existing.parent_full_name.toLowerCase() === `${UPSTREAM_OWNER}/${UPSTREAM_REPO}`.toLowerCase();
        if (parentOk) {
          const sync = await fetch(
            `https://api.github.com/repos/${fullName}/merge-upstream`,
            {
              method: "POST",
              headers: { ...ghHeaders(token), "Content-Type": "application/json" },
              body: JSON.stringify({ branch: existing.default_branch || "main" })
            }
          );
          let syncResult = null;
          try {
            syncResult = await sync.json();
          } catch {
          }
          const cfAccess2 = await ensureCfAppAccess(token, existing.id, `${existing.owner}/${existing.name}`);
          return json(200, {
            ok: true,
            action: sync.ok && syncResult?.merge_type !== "none" ? "reused_synced" : "reused",
            owner: existing.owner,
            repo: existing.name,
            full_name: `${existing.owner}/${existing.name}`,
            default_branch: existing.default_branch,
            html_url: existing.html_url,
            sync_result: sync.ok ? { merge_type: syncResult?.merge_type || "unknown" } : { error: syncResult?.message || "HTTP " + sync.status },
            cf_app_access: cfAccess2
          });
        }
        return json(409, {
          ok: false,
          error: "wrong_parent",
          detail: `${fullName} is a fork of ${existing.parent_full_name}, not the upstream pages-seo. Rename it on GitHub or use a different account.`
        });
      }
      if (existing.exists && !existing.is_fork) {
        return json(409, {
          ok: false,
          error: "name_taken",
          detail: `You already have a repository named "${UPSTREAM_REPO}" on GitHub that isn't a fork. Rename it on GitHub (or delete it) so we can create the fork.`,
          html_url: existing.html_url
        });
      }
      const r = await fetch(
        `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/forks`,
        {
          method: "POST",
          headers: { ...ghHeaders(token), "Content-Type": "application/json" },
          // Empty body — GitHub uses the authenticated user as the
          // fork owner by default. We could pass { name: 'something' }
          // to rename but want to keep the canonical name.
          body: "{}"
        }
      );
      if (!r.ok) {
        let detail = "HTTP " + r.status;
        try {
          const d = await r.json();
          detail = d?.message || detail;
        } catch {
        }
        return json(502, { ok: false, error: "fork_failed", detail });
      }
      const created = await r.json().catch(() => ({}));
      const cfAccess = await ensureCfAppAccess(token, created.id, created.full_name || fullName);
      return json(200, {
        ok: true,
        action: "created",
        owner: created.owner?.login || login,
        repo: created.name || UPSTREAM_REPO,
        full_name: created.full_name || fullName,
        default_branch: created.default_branch || "main",
        html_url: created.html_url || `https://github.com/${fullName}`,
        cf_app_access: cfAccess
      });
    }, "onRequestPost");
  }
});

// api/update/github/callback.js
function readCookie3(req, name) {
  const hdr = req.headers.get("cookie") || "";
  for (const c of hdr.split(/;\s*/)) {
    const eq = c.indexOf("=");
    if (eq < 0) continue;
    if (c.slice(0, eq).trim() === name) return c.slice(eq + 1).trim();
  }
  return null;
}
function fail(url, flow, code, msg) {
  const dest = "/" + (VALID_FLOWS.has(flow) ? flow : "update");
  const u = new URL(dest, url);
  u.searchParams.set("gh", "error");
  u.searchParams.set("error", code);
  if (msg) u.searchParams.set("detail", msg.slice(0, 200));
  return Response.redirect(u.toString(), 302);
}
var VALID_FLOWS, onRequestGet14;
var init_callback = __esm({
  "api/update/github/callback.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_oauth_cookie();
    VALID_FLOWS = /* @__PURE__ */ new Set(["install", "update"]);
    __name(readCookie3, "readCookie");
    __name(fail, "fail");
    onRequestGet14 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const url = new URL(request.url);
      if (!env?.GITHUB_OAUTH_CLIENT_ID || !env?.GITHUB_OAUTH_CLIENT_SECRET) {
        return fail(url, "update", "oauth_not_configured");
      }
      const code = String(url.searchParams.get("code") || "");
      const rawState = String(url.searchParams.get("state") || "");
      if (!code) return fail(url, "update", "missing_code");
      if (!rawState) return fail(url, "update", "missing_state");
      const parts = rawState.split(":");
      let nonce, flow, userState;
      if (parts.length >= 3 && VALID_FLOWS.has(parts[1])) {
        nonce = parts[0];
        flow = parts[1];
        userState = parts.slice(2).join(":");
      } else {
        nonce = parts[0];
        flow = "update";
        userState = parts.slice(1).join(":");
      }
      if (!/^[0-9a-f]{32}$/.test(nonce)) return fail(url, flow, "bad_nonce");
      const expected = readCookie3(request, "ps_gh_nonce");
      if (!expected || expected !== nonce) {
        return fail(url, flow, "nonce_mismatch", "Cookie nonce missing or did not match. Try Connect GitHub again.");
      }
      let token = "";
      try {
        const r = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: env.GITHUB_OAUTH_CLIENT_ID,
            client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
            code,
            redirect_uri: `${url.origin}/api/update/github/callback`
          })
        });
        const d = await r.json();
        if (d?.error) return fail(url, flow, d.error, d.error_description);
        token = String(d?.access_token || "");
        if (!token) return fail(url, flow, "no_token");
      } catch (e) {
        return fail(url, flow, "exchange_failed", String(e?.message || e));
      }
      let login = "";
      try {
        const r = await fetch("https://api.github.com/user", {
          headers: { Authorization: "token " + token, Accept: "application/vnd.github+json", "User-Agent": "pages-seo-update" }
        });
        if (r.ok) {
          const d = await r.json();
          login = String(d?.login || "");
        }
      } catch {
      }
      const cookie = await setOAuthCookie(env, { token, login, ts: Math.floor(Date.now() / 1e3) });
      const dest = new URL("/" + flow, url);
      dest.searchParams.set("gh", "connected");
      if (userState) dest.searchParams.set("state", userState);
      return new Response(null, {
        status: 302,
        headers: new Headers([
          ["Location", dest.toString()],
          // Clear the nonce cookie and set the token cookie. The nonce
          // cookie was set at Path=/api/update; clear it with the same
          // path so the browser actually expires it.
          ["Set-Cookie", "ps_gh_nonce=; Max-Age=0; Path=/api/update; HttpOnly; Secure; SameSite=Lax"],
          ["Set-Cookie", cookie]
        ])
      });
    }, "onRequestGet");
  }
});

// api/update/github/repos.js
function ghHeaders2(token) {
  return {
    Authorization: "token " + token,
    Accept: "application/vnd.github+json",
    "User-Agent": "pages-seo-update"
  };
}
function isPagesSeoFork(repo) {
  if (!repo?.fork) return false;
  if ((repo.name || "").toLowerCase() === DEFAULT_REPO_NAME) return true;
  return false;
}
async function verifyFork(token, fullName) {
  const r = await fetch(`https://api.github.com/repos/${fullName}`, { headers: ghHeaders2(token) });
  if (!r.ok) return null;
  const d = await r.json();
  if (!d?.fork) return null;
  const parent = d?.parent?.full_name;
  if (!parent || parent.toLowerCase() !== UPSTREAM_FULL_NAME.toLowerCase()) return null;
  return {
    owner: d.owner?.login,
    name: d.name,
    full_name: d.full_name,
    default_branch: d.default_branch || "main",
    html_url: d.html_url,
    updated_at: d.updated_at || null
  };
}
var UPSTREAM_FULL_NAME, DEFAULT_REPO_NAME, SCAN_PAGES, PER_PAGE, onRequestGet15;
var init_repos = __esm({
  "api/update/github/repos.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_oauth_cookie();
    UPSTREAM_FULL_NAME = "Benjamin-Bloch/pages-seo";
    DEFAULT_REPO_NAME = "pages-seo";
    SCAN_PAGES = 4;
    PER_PAGE = 30;
    __name(ghHeaders2, "ghHeaders");
    __name(isPagesSeoFork, "isPagesSeoFork");
    __name(verifyFork, "verifyFork");
    onRequestGet15 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const session = await readOAuthCookie(env, request);
      if (!session?.token) return json(401, { ok: false, error: "gh_not_connected" });
      const token = session.token;
      const login = session.login || "";
      if (login) {
        const guess = `${login}/${DEFAULT_REPO_NAME}`;
        const verified = await verifyFork(token, guess);
        if (verified) {
          return json(200, {
            ok: true,
            login,
            auto: verified,
            candidates: [verified],
            searched_count: 1,
            more_pages: false
          });
        }
      }
      const candidates = [];
      let searched = 0;
      let morePages = false;
      for (let page = 1; page <= SCAN_PAGES; page++) {
        const r = await fetch(
          `https://api.github.com/user/repos?per_page=${PER_PAGE}&page=${page}&type=owner&sort=updated`,
          { headers: ghHeaders2(token) }
        );
        if (!r.ok) break;
        const rows = await r.json().catch(() => []);
        if (!Array.isArray(rows) || !rows.length) break;
        searched += rows.length;
        for (const repo of rows) {
          if (isPagesSeoFork(repo)) {
            const v = await verifyFork(token, repo.full_name);
            if (v) candidates.push(v);
          }
        }
        if (rows.length < PER_PAGE) {
          morePages = false;
          break;
        }
        if (page === SCAN_PAGES) {
          morePages = true;
          break;
        }
      }
      const seen = /* @__PURE__ */ new Set();
      const unique = candidates.filter((c) => {
        const k = c.full_name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return json(200, {
        ok: true,
        login,
        auto: unique.length === 1 ? unique[0] : null,
        candidates: unique,
        searched_count: searched,
        more_pages: morePages
      });
    }, "onRequestGet");
  }
});

// api/update/github/start.js
var VALID_FLOWS2, onRequestGet16;
var init_start2 = __esm({
  "api/update/github/start.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    VALID_FLOWS2 = /* @__PURE__ */ new Set(["install", "update"]);
    onRequestGet16 = /* @__PURE__ */ __name(async ({ env, request }) => {
      if (!env?.GITHUB_OAUTH_CLIENT_ID) {
        return json(503, {
          error: "oauth_not_configured",
          detail: "GITHUB_OAUTH_CLIENT_ID is not set on this Pages project."
        });
      }
      const url = new URL(request.url);
      const state = String(url.searchParams.get("state") || "").slice(0, 4096);
      const flowRaw = String(url.searchParams.get("flow") || "update");
      const flow = VALID_FLOWS2.has(flowRaw) ? flowRaw : "update";
      const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
      const nonce = Array.from(nonceBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      const stateOut = `${nonce}:${flow}:${state}`;
      const params = new URLSearchParams({
        client_id: env.GITHUB_OAUTH_CLIENT_ID,
        redirect_uri: `${url.origin}/api/update/github/callback`,
        // public_repo  — create the fork, read repo metadata
        // read:user    — list the user's GitHub App installations so we can
        //                add the new fork to the Cloudflare app's repo list
        //                without sending them through the manual UI flow
        // user:email   — fetch the user's primary verified email so the
        //                site's first-run setup form can prefill it (saves
        //                them typing it on the magic-link screen)
        scope: "public_repo read:user user:email",
        state: stateOut,
        allow_signup: "false"
      });
      return new Response(null, {
        status: 302,
        headers: {
          Location: `https://github.com/login/oauth/authorize?${params}`,
          // Cookie path stays at /api/update so the callback can read it.
          // /install needs the OAuth state too, but it talks to the
          // callback-issued ps_gh cookie (set at / path) which any
          // route under the site can read.
          "Set-Cookie": `ps_gh_nonce=${nonce}; Max-Age=600; Path=/api/update; HttpOnly; Secure; SameSite=Lax`
        }
      });
    }, "onRequestGet");
  }
});

// api/update/github/status.js
var onRequestGet17;
var init_status = __esm({
  "api/update/github/status.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_oauth_cookie();
    onRequestGet17 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const c = await readOAuthCookie(env, request);
      if (c?.token) return json(200, { connected: true, login: c.login || null });
      return json(200, { connected: false });
    }, "onRequestGet");
  }
});

// api/update/github/sync.js
var NAME_RX, onRequestPost37;
var init_sync2 = __esm({
  "api/update/github/sync.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_oauth_cookie();
    NAME_RX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
    onRequestPost37 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const session = await readOAuthCookie(env, request);
      if (!session?.token) return json(401, { ok: false, error: "gh_not_connected" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { ok: false, error: "bad_json" });
      }
      const owner = String(body?.owner || "").trim();
      const repo = String(body?.repo || "").trim() || "pages-seo";
      if (!NAME_RX.test(owner)) return json(400, { ok: false, error: "bad_owner" });
      if (!NAME_RX.test(repo)) return json(400, { ok: false, error: "bad_repo" });
      if (session.login && session.login.toLowerCase() !== owner.toLowerCase()) {
        return json(403, {
          ok: false,
          error: "owner_mismatch",
          detail: `You connected as @${session.login} but are trying to sync ${owner}/${repo}. Re-connect with the right GitHub account.`
        });
      }
      const r = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/merge-upstream`,
        {
          method: "POST",
          headers: {
            Authorization: "token " + session.token,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "pages-seo-update",
            // Avoid stale 304s; the merge endpoint is happy with a fresh
            // payload every time.
            "If-None-Match": ""
          },
          body: JSON.stringify({ branch: "main" })
        }
      );
      let respBody = null;
      try {
        respBody = await r.json();
      } catch {
      }
      if (!r.ok) {
        return json(r.status === 401 ? 401 : 502, {
          ok: false,
          error: "github_merge_failed",
          detail: respBody?.message || `HTTP ${r.status}`
        });
      }
      let newSha = "";
      try {
        const headR = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/commits/main`,
          { headers: { Accept: "application/vnd.github+json", "User-Agent": "pages-seo-update" } }
        );
        if (headR.ok) {
          const d = await headR.json();
          newSha = String(d?.sha || "");
        }
      } catch {
      }
      return json(200, {
        ok: true,
        merge_type: respBody?.merge_type || "unknown",
        // 'fast-forward' | 'none' | 'merge'
        base_branch: respBody?.base_branch || "unknown",
        new_sha: newSha
      });
    }, "onRequestPost");
  }
});

// api/admin/projects/[id].js
var onRequestGet18, onRequestPut2, onRequestDelete3;
var init_id = __esm({
  "api/admin/projects/[id].js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_projects();
    onRequestGet18 = /* @__PURE__ */ __name(async ({ request, env, params }) => {
      const gate = await requireSuperAdmin(env, request);
      if (gate.error) return gate.error;
      const idOrSlug = params.id;
      const project = await getProject(env, idOrSlug);
      if (!project) return json(404, { error: "project_not_found" });
      return json(200, { ok: true, project });
    }, "onRequestGet");
    onRequestPut2 = /* @__PURE__ */ __name(async ({ request, env, params }) => {
      const gate = await requireSuperAdmin(env, request);
      if (gate.error) return gate.error;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      body.id = params.id;
      try {
        const project = await upsertProject(env, body);
        return json(200, { ok: true, project });
      } catch (err) {
        return json(500, { error: err.message || "failed_to_update_project" });
      }
    }, "onRequestPut");
    onRequestDelete3 = /* @__PURE__ */ __name(async ({ request, env, params }) => {
      const gate = await requireSuperAdmin(env, request);
      if (gate.error) return gate.error;
      const idOrSlug = params.id;
      const protectedSlugs = ["gulagi", "gurouter"];
      const project = await env.DB.prepare("SELECT id, slug FROM projects WHERE id = ? OR slug = ? LIMIT 1").bind(idOrSlug, idOrSlug).first();
      if (!project) return json(404, { error: "project_not_found" });
      if (protectedSlugs.includes(project.slug)) {
        return json(400, { error: "protected_project", detail: "Kh\xF4ng th\u1EC3 x\xF3a d\u1EF1 \xE1n h\u1EC7 th\u1ED1ng c\u1ED1t l\xF5i" });
      }
      await env.DB.prepare("DELETE FROM project_brands WHERE project_id = ?").bind(project.id).run().catch(() => {
      });
      await env.DB.prepare("DELETE FROM project_ai_configs WHERE project_id = ?").bind(project.id).run().catch(() => {
      });
      await env.DB.prepare("DELETE FROM project_publishing_configs WHERE project_id = ?").bind(project.id).run().catch(() => {
      });
      await env.DB.prepare("DELETE FROM project_schedules WHERE project_id = ?").bind(project.id).run().catch(() => {
      });
      await env.DB.prepare("DELETE FROM project_topics WHERE project_id = ?").bind(project.id).run().catch(() => {
      });
      await env.DB.prepare("DELETE FROM blog_embeds WHERE project_id = ?").bind(project.id).run().catch(() => {
      });
      await env.DB.prepare("DELETE FROM content_calendar WHERE project_id = ?").bind(project.id).run().catch(() => {
      });
      await env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(project.id).run();
      return json(200, { ok: true, deleted_id: project.id });
    }, "onRequestDelete");
  }
});

// _lib/agent_markup.js
function renderBlock(tag, body) {
  if (tag === "box" || tag.startsWith("box.")) {
    const variant = tag.startsWith("box.") ? tag.slice(4) : "";
    const cls2 = ["agent-box"];
    if (variant && BOX_VARIANTS.has(variant)) cls2.push(variant);
    return `<div class="${cls2.join(" ")}">${renderInner(
      body,
      /*inList*/
      false
    )}</div>`;
  }
  if (LIST_CONTAINERS.has(tag)) {
    const tagName = tag === "ordered" ? "ol" : "ul";
    const inner = renderInner(
      body,
      /*inList*/
      true
    );
    return `<${tagName}>${inner}</${tagName}>`;
  }
  if (tag === "item") {
    return `<p>${inlineRender(body)}</p>`;
  }
  const def = BLOCK_TAGS[tag];
  if (!def) {
    return `<p>${inlineRender(body)}</p>`;
  }
  if (def.void) return `<${def.tag} />`;
  const cls = def.cls ? ` class="${def.cls}"` : "";
  return `<${def.tag}${cls}>${inlineRender(body)}</${def.tag}>`;
}
function renderInner(text, inList) {
  const out = parseBlocks(text, inList);
  return out.trim();
}
function parseBlocks(text, inList) {
  if (!text) return "";
  let i = 0, out = "";
  const N = text.length;
  while (i < N) {
    const open = text.slice(i).match(/\/\.([\w.-]+)\.\//);
    if (!open) {
      const rest = text.slice(i).trim();
      if (rest) out += inList ? "" : inlineRender(rest);
      break;
    }
    const gap = text.slice(i, i + open.index).trim();
    if (gap) out += inList ? "" : inlineRender(gap);
    const tag = open[1];
    const tagStart = i + open.index;
    const tagEnd = tagStart + open[0].length;
    if (BLOCK_TAGS[tag]?.void) {
      out += renderBlock(tag, "");
      i = tagEnd;
      continue;
    }
    let depth = 1;
    let scan = tagEnd;
    let closeAt = -1;
    while (scan < N) {
      const o = text.slice(scan).match(/\/\.([\w.-]+)\.\//);
      const c = text.slice(scan).indexOf("/./");
      const oIdx = o ? scan + o.index : -1;
      const cIdx = c >= 0 ? scan + c : -1;
      if (cIdx < 0) break;
      if (oIdx >= 0 && oIdx < cIdx) {
        const innerTag = o[1];
        const innerEnd = oIdx + o[0].length;
        if (BLOCK_TAGS[innerTag]?.void) {
          scan = innerEnd;
          continue;
        }
        depth++;
        scan = innerEnd;
        continue;
      }
      depth--;
      if (depth === 0) {
        closeAt = cIdx;
        break;
      }
      scan = cIdx + 3;
    }
    if (closeAt < 0) {
      out += inList ? "" : inlineRender(open[0]);
      i = tagEnd;
      continue;
    }
    const body = text.slice(tagEnd, closeAt);
    if (inList && tag === "item") {
      out += `<li>${inlineRender(body.trim())}</li>`;
    } else {
      out += renderBlock(tag, body);
    }
    i = closeAt + 3;
  }
  return out;
}
function hasAgentMarkup(s) {
  return /\/\.[\w.-]+\.\//.test(String(s || ""));
}
function extractBlocks(src) {
  const blocks = /* @__PURE__ */ new Map();
  let n = 0;
  const placeholderFor = /* @__PURE__ */ __name(() => `

AGENT_BLOCK_${(++n).toString(36).padStart(4, "0")}

`, "placeholderFor");
  let i = 0, out = "";
  const text = String(src || "");
  const N = text.length;
  while (i < N) {
    const open = text.slice(i).match(/\/\.([\w.-]+)\.\//);
    if (!open) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, i + open.index);
    const tag = open[1];
    const tagStart = i + open.index;
    const tagEnd = tagStart + open[0].length;
    if (BLOCK_TAGS[tag]?.void) {
      const ph2 = placeholderFor();
      blocks.set(ph2.trim(), renderBlock(tag, ""));
      out += ph2;
      i = tagEnd;
      continue;
    }
    let depth = 1, scan = tagEnd, closeAt = -1;
    while (scan < N) {
      const o = text.slice(scan).match(/\/\.([\w.-]+)\.\//);
      const c = text.slice(scan).indexOf("/./");
      const oIdx = o ? scan + o.index : -1;
      const cIdx = c >= 0 ? scan + c : -1;
      if (cIdx < 0) break;
      if (oIdx >= 0 && oIdx < cIdx) {
        const innerTag = o[1];
        const innerEnd = oIdx + o[0].length;
        if (BLOCK_TAGS[innerTag]?.void) {
          scan = innerEnd;
          continue;
        }
        depth++;
        scan = innerEnd;
        continue;
      }
      depth--;
      if (depth === 0) {
        closeAt = cIdx;
        break;
      }
      scan = cIdx + 3;
    }
    if (closeAt < 0) {
      out += open[0];
      i = tagEnd;
      continue;
    }
    const body = text.slice(tagEnd, closeAt);
    const ph = placeholderFor();
    blocks.set(ph.trim(), renderBlock(tag, body));
    out += ph;
    i = closeAt + 3;
  }
  return { md: out, blocks };
}
function restoreBlocks(html2, blocks) {
  if (!blocks.size) return html2;
  html2 = html2.replace(/<p>\s*(AGENT_BLOCK_[0-9a-z]+)\s*<\/p>/g, "$1");
  return html2.replace(/AGENT_BLOCK_[0-9a-z]+/g, (m) => blocks.get(m) ?? m);
}
var BLOCK_TAGS, BOX_VARIANTS, LIST_CONTAINERS;
var init_agent_markup = __esm({
  "_lib/agent_markup.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_markdown();
    BLOCK_TAGS = {
      "h1": { tag: "h2" },
      // demoted
      "h2": { tag: "h2" },
      "h3": { tag: "h3" },
      "h4": { tag: "h4" },
      "p": { tag: "p" },
      "callout": { tag: "aside", cls: "agent-callout" },
      "divider": { tag: "hr", void: true }
    };
    BOX_VARIANTS = /* @__PURE__ */ new Set(["amber", "green", "red", "blue", "grey"]);
    LIST_CONTAINERS = /* @__PURE__ */ new Set(["list", "ordered"]);
    __name(renderBlock, "renderBlock");
    __name(renderInner, "renderInner");
    __name(parseBlocks, "parseBlocks");
    __name(hasAgentMarkup, "hasAgentMarkup");
    __name(extractBlocks, "extractBlocks");
    __name(restoreBlocks, "restoreBlocks");
  }
});

// _lib/markdown.js
function escape(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function inlineNonCode(out) {
  out = out.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, (_, alt, url) => `<img src="${url}" alt="${alt}" loading="lazy" decoding="async" />`);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, (_, text, url) => {
    const isExternal = /^https?:/i.test(url);
    const rel = isExternal ? ' rel="nofollow noopener"' : "";
    return `<a href="${url}"${rel}>${text}</a>`;
  });
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, (m, pre, rawUrl) => {
    let url = rawUrl;
    let trail = "";
    const punct = url.match(/[.,;:!?]+$/);
    if (punct) {
      trail = punct[0];
      url = url.slice(0, -trail.length);
    }
    if (url.endsWith(")") && !url.includes("(")) {
      trail = ")" + trail;
      url = url.slice(0, -1);
    }
    if (!url) return m;
    return `${pre}<a href="${url}" rel="nofollow noopener">${url}</a>${trail}`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  out = out.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;!?]|$)/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return out;
}
function inline(s) {
  const parts = escape(s).split(/`([^`]+)`/);
  let out = "";
  for (let k = 0; k < parts.length; k++) {
    out += k % 2 === 1 ? `<code>${parts[k]}</code>` : inlineNonCode(parts[k]);
  }
  return out;
}
function splitInlineHeadings(md) {
  return md.replace(/([^\n#])(\n?)(#{1,6}\s+)/g, (_, prev, nl, h) => {
    if (nl) return prev + nl + h;
    return prev + "\n" + h;
  });
}
function renderMarkdown(md) {
  const src = String(md || "").replace(/\r\n/g, "\n");
  if (!hasAgentMarkup(src)) return renderMarkdownInner(src);
  const { md: stripped, blocks } = extractBlocks(src);
  const html2 = renderMarkdownInner(stripped);
  return restoreBlocks(html2, blocks);
}
function renderMarkdownInner(md) {
  const normalised = splitInlineHeadings(String(md || "").replace(/\r\n/g, "\n"));
  const lines = normalised.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([a-zA-Z0-9_-]*)\s*$/);
    if (fence) {
      const marker = fence[1][0];
      const lang = fence[2] || "";
      i++;
      const code = [];
      while (i < lines.length && !new RegExp("^\\s*" + (marker === "`" ? "`{3,}" : "~{3,}") + "\\s*$").test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      const cls = lang ? ` class="language-${escape(lang)}"` : "";
      out.push(`<pre><code${cls}>${escape(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push("<hr />");
      i++;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>+\s?/, ""));
        i++;
      }
      const paras = quoted.join("\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
      const inner = paras.map((p) => `<p>${inline(p.replace(/\n/g, " "))}</p>`).join("");
      out.push(`<blockquote>${inner}</blockquote>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h && h[2].length <= 140) {
      const rawLevel = h[1].length;
      const level = Math.min(Math.max(rawLevel === 1 ? 2 : rawLevel, 2), 6);
      out.push(`<h${level}>${inline(h[2].trim())}</h${level}>`);
      i++;
      continue;
    }
    if (h && h[2].length > 140) {
      const rawLevel = h[1].length;
      const level = Math.min(Math.max(rawLevel === 1 ? 2 : rawLevel, 2), 6);
      const text = h[2];
      let splitAt = -1;
      const sentence = text.search(/[.!?]\s+[A-Z]/);
      if (sentence > 0 && sentence < 120) splitAt = sentence + 1;
      else {
        const ws = text.lastIndexOf(" ", 80);
        if (ws > 20) splitAt = ws;
      }
      if (splitAt > 0) {
        out.push(`<h${level}>${inline(text.slice(0, splitAt).trim())}</h${level}>`);
        out.push(`<p>${inline(text.slice(splitAt).trim())}</p>`);
      } else {
        out.push(`<h${level}>${inline(text.trim())}</h${level}>`);
      }
      i++;
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const headers = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map(alignOf);
      i += 2;
      const body = [];
      while (i < lines.length && isTableRow(lines[i])) {
        body.push(splitRow(lines[i]));
        i++;
      }
      out.push(renderTable(headers, aligns, body));
      continue;
    }
    if (LIST_RE.test(line)) {
      const listLines = [];
      while (i < lines.length && LIST_RE.test(lines[i])) {
        listLines.push(lines[i]);
        i++;
      }
      out.push(renderList(listLines));
      continue;
    }
    const startsTable = /* @__PURE__ */ __name((idx) => isTableRow(lines[idx]) && idx + 1 < lines.length && isTableDivider(lines[idx + 1]), "startsTable");
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^#{1,6}\s+/.test(lines[i]) && !LIST_RE.test(lines[i]) && !startsTable(i) && !/^\s*>\s?/.test(lines[i]) && !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i]) && !/^\s*(`{3,}|~{3,})/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    if (buf.length) out.push(`<p>${inline(buf.join(" "))}</p>`);
    else i++;
  }
  return out.join("\n");
}
function isTableRow(line) {
  const t = (line || "").trim();
  return t.includes("|") && !/^#{1,6}\s/.test(t) && !/^[-*]\s/.test(t);
}
function isTableDivider(line) {
  const t = (line || "").trim();
  if (!t.includes("|") && !t.includes("-")) return false;
  const cells = splitRow(t);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c.trim()));
}
function splitRow(line) {
  let t = (line || "").trim();
  t = t.replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.trim());
}
function alignOf(cell) {
  const c = (cell || "").trim();
  const l = c.startsWith(":"), r = c.endsWith(":");
  if (l && r) return "center";
  if (r) return "right";
  if (l) return "left";
  return "";
}
function renderTable(headers, aligns, body) {
  const al = /* @__PURE__ */ __name((i) => aligns[i] ? ` style="text-align:${aligns[i]}"` : "", "al");
  const head = headers.map((h, idx) => `<th${al(idx)}>${inline(h)}</th>`).join("");
  const rows = body.map((cells) => {
    const tds = headers.map((_, idx) => `<td${al(idx)}>${inline(cells[idx] || "")}</td>`).join("");
    return `<tr>${tds}</tr>`;
  }).join("");
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderList(listLines) {
  const items = listLines.map((ln) => {
    const m = ln.match(LIST_RE);
    const indent = m[1].replace(/\t/g, "    ").length;
    const ordered = /\d/.test(m[2]);
    const text = ln.slice(m[0].length);
    return { indent, ordered, text };
  });
  const widths = [...new Set(items.map((it) => it.indent))].sort((a, b) => a - b);
  const depthOf = /* @__PURE__ */ __name((indent) => widths.indexOf(indent), "depthOf");
  let html2 = "";
  const stack = [];
  let openLi = -1;
  for (const it of items) {
    const depth = depthOf(it.indent);
    const tag = it.ordered ? "ol" : "ul";
    while (stack.length - 1 > depth) {
      html2 += `</li></${stack.pop()}>`;
      openLi = stack.length - 1;
    }
    if (stack.length - 1 === depth) {
      if (openLi === depth) html2 += "</li>";
    } else {
      html2 += `<${tag}>`;
      stack.push(tag);
    }
    html2 += `<li>${inline(it.text.trim())}`;
    openLi = depth;
  }
  while (stack.length) {
    html2 += `</li></${stack.pop()}>`;
  }
  return html2;
}
var inlineRender, LIST_RE;
var init_markdown = __esm({
  "_lib/markdown.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_agent_markup();
    __name(escape, "escape");
    __name(inlineNonCode, "inlineNonCode");
    __name(inline, "inline");
    inlineRender = inline;
    __name(splitInlineHeadings, "splitInlineHeadings");
    __name(renderMarkdown, "renderMarkdown");
    __name(renderMarkdownInner, "renderMarkdownInner");
    __name(isTableRow, "isTableRow");
    __name(isTableDivider, "isTableDivider");
    __name(splitRow, "splitRow");
    __name(alignOf, "alignOf");
    __name(renderTable, "renderTable");
    LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+/;
    __name(renderList, "renderList");
  }
});

// api/public/post/[slug].js
function imageUrlFor4(key) {
  if (!key) return null;
  return "/image/" + key.split("/").map(encodeURIComponent).join("/");
}
var onRequestGet19;
var init_slug = __esm({
  "api/public/post/[slug].js"() {
    init_functionsRoutes_0_09583509623234443();
    init_markdown();
    __name(imageUrlFor4, "imageUrlFor");
    onRequestGet19 = /* @__PURE__ */ __name(async ({ env, params }) => {
      if (!env?.DB) {
        return new Response(JSON.stringify({ error: "no_db" }), {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" }
        });
      }
      const slug = String(params.slug || "").trim();
      if (!slug || !/^[a-z0-9-]{1,120}$/.test(slug)) {
        return new Response(JSON.stringify({ error: "invalid_slug" }), {
          status: 400,
          headers: { "content-type": "application/json; charset=utf-8" }
        });
      }
      const row = await env.DB.prepare(
        `SELECT slug, title, meta_description, keywords, hero_image_key, hero_image_alt,
            body_markdown, ai_provider, published_at
       FROM blog_posts
      WHERE status = 'published' AND slug = ? LIMIT 1`
      ).bind(slug).first().catch(() => null);
      if (!row) {
        return new Response(JSON.stringify({ error: "not_found" }), {
          status: 404,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*"
          }
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        post: {
          slug: row.slug,
          title: row.title,
          meta_description: row.meta_description,
          keywords: row.keywords,
          hero_image_url: imageUrlFor4(row.hero_image_key),
          hero_image_alt: row.hero_image_alt,
          body_html: renderMarkdown(row.body_markdown || ""),
          provider: row.ai_provider,
          published_at: row.published_at,
          published_iso: new Date((row.published_at || 0) * 1e3).toISOString()
        }
      }), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          // Body content rarely changes after publish; long cache is fine.
          "cache-control": "public, max-age=600",
          "access-control-allow-origin": "*"
        }
      });
    }, "onRequestGet");
  }
});

// _lib/page_render.js
function brand(env, project = null) {
  let homeHost = "";
  try {
    homeHost = new URL(project?.website_url || "").hostname;
  } catch {
  }
  const isGulagi = !project || !homeHost || /(^|\.)gulagi\.com$/.test(homeHost);
  return {
    name: project?.site_name || env?.SITE_NAME || "Gulagi",
    description: project?.site_description || env?.SITE_DESCRIPTION || "T\u1EA1o website cho qu\xE1n t\u1EEB Google Maps",
    logoUrl: project?.logo_url || env?.SITE_LOGO_URL || null,
    themeColor: project?.theme_color || null,
    homeUrl: project?.website_url || env?.SITE_SIGNUP_URL || "https://gulagi.com",
    ctaSignupUrl: env?.SITE_SIGNUP_URL || "https://gulagi.com",
    isGulagi
  };
}
function themeStyle(hex) {
  if (!hex) return "";
  return `<style>:root{--brand:${hex};--brand-light:color-mix(in srgb,${hex} 12%,#fff);--brand-dark:color-mix(in srgb,${hex} 82%,#000);--link:${hex}}</style>`;
}
function jsonLD({ site, post, host, kind, settings, basePath = "" }) {
  const isArticle = kind === "blog";
  const baseUrl = `https://${host}`;
  const orgId = `${baseUrl}/#org`;
  const webId = `${baseUrl}/#website`;
  const pageId = `${baseUrl}${post.urlPath}#main`;
  const useCover = settings?.hero_image_mode === "cover" && settings?._has_default_template;
  const coverV = settings?._default_template_v ? `?v=${settings._default_template_v}` : "";
  const heroAbs = useCover ? `${baseUrl}/cover/${encodeURIComponent(post.slug || "home")}.svg${coverV}` : post.hero_image_key ? `${baseUrl}/image/${post.hero_image_key}` : `${baseUrl}/og/${encodeURIComponent(post.slug || "home")}.svg`;
  const graph = [
    {
      "@type": "Organization",
      "@id": orgId,
      name: site.name,
      url: baseUrl,
      ...site.logoUrl ? { logo: { "@type": "ImageObject", url: site.logoUrl } } : {}
    },
    {
      "@type": "WebSite",
      "@id": webId,
      url: baseUrl,
      name: site.name,
      description: site.description,
      publisher: { "@id": orgId },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${baseUrl}${basePath}/blog?q={search_term_string}` },
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@type": isArticle ? "Article" : "WebPage",
      "@id": pageId,
      headline: post.title,
      description: post.meta_description,
      url: `${baseUrl}${post.urlPath}`,
      image: { "@type": "ImageObject", url: heroAbs, width: HERO_W, height: HERO_H },
      datePublished: new Date((post.published_at || 0) * 1e3).toISOString(),
      dateModified: new Date((post.modified_at || post.published_at || 0) * 1e3).toISOString(),
      author: { "@id": orgId },
      publisher: { "@id": orgId },
      isPartOf: { "@id": webId },
      inLanguage: "vi",
      mainEntityOfPage: { "@type": "WebPage", "@id": `${baseUrl}${post.urlPath}` }
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Trang ch\u1EE7", item: `${baseUrl}/` },
        isArticle ? { "@type": "ListItem", position: 2, name: "Blog", item: `${baseUrl}${basePath}/blog` } : null,
        { "@type": "ListItem", position: isArticle ? 3 : 2, name: post.title }
      ].filter(Boolean)
    }
  ];
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}
function extractFAQ(post) {
  const body = post.body_markdown || "";
  const faqs = [];
  const faqRegex = /(?:^|\n)#+\s*(?:FAQ|Câu hỏi thường gặp|Hỏi đáp)[\s\S]*?((?:^- .+\n?)+)/gim;
  let match2 = faqRegex.exec(body);
  while (match2 !== null) {
    const lines = match2[1].split("\n").filter((l) => l.trim().startsWith("-"));
    for (const line of lines) {
      const qa = line.replace(/^-\s*/, "").split(/\?\s*(:|–|-)\s*/);
      if (qa.length >= 2) {
        faqs.push({ question: qa[0].trim() + "?", answer: qa[1].trim() });
      }
    }
    match2 = faqRegex.exec(body);
  }
  if (faqs.length === 0) {
    const h3Regex = /(?:^|\n)###\s+(.+\?)\s*\n\n((?:(?!^#{2,3}\s)[^\n]+(?:\n|$))+)/gim;
    let h3Match = h3Regex.exec(body);
    while (h3Match !== null) {
      faqs.push({ question: h3Match[1].trim(), answer: h3Match[2].trim().split("\n")[0].trim() });
      h3Match = h3Regex.exec(body);
    }
  }
  return faqs.length > 0 ? [{
    "@type": "FAQPage",
    mainEntity: faqs.slice(0, 8).map((fa) => ({
      "@type": "Question",
      name: fa.question,
      acceptedAnswer: { "@type": "Answer", text: fa.answer }
    }))
  }] : [];
}
function renderContentPage({ env, request, post, kind, related = [], settings = {}, basePath = "", project = null }) {
  const host = new URL(request.url).hostname;
  const site = brand(env, project);
  const customHost = project?.custom_domain ? normalizeHost(project.custom_domain) : null;
  const effectiveHost = customHost || requestHost(request) || host;
  const effectiveBasePath = customHost ? "" : basePath;
  const effectiveUrlPath = customHost ? project?.slug ? post.urlPath.replace(new RegExp(`^/${project.slug}`), "") : post.urlPath : post.urlPath;
  const dateStr = new Date((post.published_at || 0) * 1e3).toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const wordCount2 = (post.body_markdown || "").split(/\s+/).length;
  const readMin = Math.max(1, Math.ceil(wordCount2 / 200));
  const isVi = true;
  const useCoverEndpoint = settings?.hero_image_mode === "cover" && settings?._has_default_template;
  const heroSrc = useCoverEndpoint ? `/cover/${esc(post.slug || "home")}.svg${settings?._default_template_v ? "?v=" + settings._default_template_v : ""}` : post.hero_image_key ? `/image/${esc(post.hero_image_key)}` : `/og/${esc(post.slug || "home")}.svg`;
  const heroAlt = esc(post.hero_image_alt || post.title);
  const heroImg = `
<div class="hero-wrap" style="aspect-ratio:${HERO_W}/${HERO_H}">
  <img class="hero" src="${heroSrc}" alt="${heroAlt}" width="${HERO_W}" height="${HERO_H}" decoding="async" fetchpriority="high" onload="this.classList.add('is-loaded')" onerror="this.classList.add('is-loaded')" />
</div>`;
  const bodyHTML = renderMarkdown(post.body_markdown).replace(/(href=")\/(blog|p)\//g, `$1${effectiveBasePath}/$2/`);
  const excerpt = /* @__PURE__ */ __name((s, n) => {
    const t = String(s || "");
    if (t.length <= n) return t;
    const cut = t.slice(0, n);
    return cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).replace(/[,;:.\s]+$/, "") + "\u2026";
  }, "excerpt");
  const relatedHTML = kind === "blog" && related.length ? `
<aside class="read-next">
  <h2 class="read-next-title">\u0110\u1ECDc ti\u1EBFp</h2>
  <ul class="read-next-list">
    ${related.map((r) => {
    const rSrc = r.hero_image_key ? `/image/${esc(r.hero_image_key)}` : `/cover/${esc(r.slug)}.svg`;
    return `
      <li>
        <a href="${effectiveBasePath}/blog/${esc(r.slug)}">
          <img src="${rSrc}" alt="${esc(r.hero_image_alt || r.title)}" width="640" height="336" loading="lazy" decoding="async" />
          <div class="read-next-meta">
            <h3>${esc(r.title)}</h3>
            ${r.meta_description ? `<p>${esc(excerpt(r.meta_description, 140))}</p>` : ""}
          </div>
        </a>
      </li>`;
  }).join("")}
  </ul>
</aside>` : "";
  const gv = String(settings?.google_site_verification || "").trim();
  const bv = String(settings?.bing_site_verification || "").trim();
  const verifyMetas = [
    gv ? `<meta name="google-site-verification" content="${esc(gv)}" />` : "",
    bv ? `<meta name="msvalidate.01" content="${esc(bv)}" />` : ""
  ].filter(Boolean).join("\n");
  const preloadHero = `<link rel="preload" as="image" href="${heroSrc}" fetchpriority="high" />`;
  const faqSchema = extractFAQ(post);
  const ldGraph = jsonLD({ site, post: { ...post, urlPath: effectiveUrlPath }, host: effectiveHost, kind, settings, basePath: effectiveBasePath });
  const ldExtra = faqSchema.length ? `,${faqSchema.map((f) => JSON.stringify(f)).join(",")}` : "";
  const ldJson = ldGraph.replace("}", `${ldExtra}}`);
  const shareUrl = `https://${effectiveHost}${effectiveUrlPath}`;
  const shareTitle = encodeURIComponent(post.title);
  const shareUrlEnc = encodeURIComponent(shareUrl);
  const isPreview = post?.status === "preview";
  const blogSlug = post?.slug || "";
  const blogSlugEsc = JSON.stringify(blogSlug).replace(/</g, "\\u003c");
  const beaconScript = !isPreview && blogSlug ? `
  // View beacon
  var viewFired = false;
  if (document.visibilityState === 'visible') {
    viewFired = true;
    try {
      fetch('/api/blog/views' + PS_Q, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blog_slug: blogSlug, project: PS_PROJECT })
      }).catch(function() {});
    } catch (e) {}
  }
  var hideFired = false;
  window.addEventListener('pagehide', function() {
    if (hideFired) return;
    hideFired = true;
    try {
      var readTimeMs = Math.round((window.performance && performance.now) ? performance.now() : 0);
      var payload = JSON.stringify({ blog_slug: blogSlug, project: PS_PROJECT, read_time_ms: readTimeMs });
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/blog/views' + PS_Q, blob);
      } else {
        fetch('/api/blog/views' + PS_Q, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        }).catch(function() {});
      }
    } catch (e) {}
  });` : "";
  const authorName = site.isGulagi ? "\u0110\u1ED9i ng\u0169 Gulagi" : site.name;
  const authorBio = site.isGulagi ? "Chuy\xEAn gia gi\u1EA3i ph\xE1p s\u1ED1 gi\xFAp qu\xE1n c\xE0 ph\xEA, nh\xE0 h\xE0ng, c\u1EEDa h\xE0ng b\xE1n l\u1EBB chuy\u1EC3n \u0111\u1ED5i s\u1ED1 hi\u1EC7u qu\u1EA3." : site.description || `B\xE0i vi\u1EBFt t\u1EEB ${site.name}.`;
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(post.title)} \xB7 ${esc(site.name)}</title>
<meta name="description" content="${esc(post.meta_description)}" />
${post.keywords ? `<meta name="keywords" content="${esc(post.keywords)}" />` : ""}
<link rel="canonical" href="https://${effectiveHost}${effectiveUrlPath}" />
<meta name="robots" content="index,follow,max-image-preview:large" />
<link rel="alternate" type="application/rss+xml" title="${esc(site.name)} \u2014 RSS feed" href="https://${effectiveHost}${effectiveBasePath}/feed.xml" />
${verifyMetas}
<meta property="og:type" content="${kind === "blog" ? "article" : "website"}" />
<meta property="og:title" content="${esc(post.title)}" />
<meta property="og:description" content="${esc(post.meta_description)}" />
<meta property="og:url" content="https://${effectiveHost}${effectiveUrlPath}" />
<meta property="og:image" content="https://${effectiveHost}${heroSrc}" />
<meta property="og:image:width" content="${HERO_W}" />
<meta property="og:image:height" content="${HERO_H}" />
<meta property="og:site_name" content="${esc(site.name)}" />
<meta property="og:locale" content="vi_VN" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(post.title)}" />
<meta name="twitter:description" content="${esc(post.meta_description)}" />
<meta name="twitter:image" content="https://${effectiveHost}${heroSrc}" />
${preloadHero}
<link rel="stylesheet" href="/style.css" />
${themeStyle(site.themeColor)}
<script type="application/ld+json">${ldJson}<\/script>
</head>
<body>

<header class="site-header${site.themeColor ? " is-themed" : ""}">
  <div class="header-inner">
    <a class="header-brand" href="${esc(site.homeUrl)}">
      ${site.logoUrl ? `<img class="header-logo-img" src="${esc(site.logoUrl)}" alt="${esc(site.name)}" height="28" />` : `<span class="header-logo">${esc(site.name)}</span>`}
    </a>
    <nav class="header-nav">
      <a href="${esc(site.homeUrl)}">Trang ch\u1EE7</a>
      <a href="${effectiveBasePath}/blog" class="active">Blog</a>
      ${site.isGulagi ? `<a href="${esc(site.ctaSignupUrl)}" class="header-cta">T\u1EA1o website ngay</a>` : ""}
    </nav>
  </div>
</header>

<main class="post-shell">
  <div class="crumb"><a href="${esc(site.homeUrl)}">Trang ch\u1EE7</a>${kind === "blog" ? ` \xB7 <a href="${effectiveBasePath}/blog">Blog</a>` : ""} \xB7 <span>${esc(post.title.slice(0, 40))}\u2026</span></div>
  <h1 class="post-title">${esc(post.title)}</h1>
  <div class="post-meta">
    <span class="post-date">${esc(dateStr)}</span>
    <span class="post-sep">\xB7</span>
    <span class="post-read">${readMin} ph\xFAt \u0111\u1ECDc</span>
  </div>
  ${heroImg}
  <article class="prose">
    ${bodyHTML}
    ${site.isGulagi ? `
    <div class="article-cta">
      <div class="cta-box">
        <h3>T\u1EA1o website cho qu\xE1n c\u1EE7a b\u1EA1n ngay</h3>
        <p>Ch\u1EC9 c\u1EA7n d\xE1n link Google Maps, Gulagi s\u1EBD t\u1EF1 \u0111\u1ED9ng t\u1EA1o website chuy\xEAn nghi\u1EC7p cho qu\xE1n.</p>
        <div class="mini-builder">
          <form id="mini-builder-form" onsubmit="event.preventDefault();var url=this.querySelector('input').value.trim();if(url){window.location.href='${esc(site.ctaSignupUrl)}/?maps='+encodeURIComponent(url);}">
            <input type="url" placeholder="D\xE1n link Google Maps c\u1EE7a qu\xE1n..." required class="mini-builder-input" />
            <button type="submit" class="mini-builder-btn">T\u1EA1o web ngay \u2192</button>
          </form>
        </div>
        <a href="${esc(site.ctaSignupUrl)}" class="cta-btn" style="margin-top:12px">B\u1EAFt \u0111\u1EA7u mi\u1EC5n ph\xED \u2192</a>
      </div>
    </div>
    <div class="lead-form-box">
      <h3>T\u1EA3i c\u1EA9m nang t\u0103ng \u0111\u01A1n</h3>
      <p>Nh\u1EADn ngay t\xE0i li\u1EC7u h\u01B0\u1EDBng d\u1EABn t\u1ED1i \u01B0u Google Maps &amp; t\u0103ng doanh thu cho qu\xE1n.</p>
      <form id="lead-capture-form" class="lead-form">
        <div class="lead-form-fields">
          <input type="text" id="lead-name" name="name" placeholder="H\u1ECD v\xE0 t\xEAn" class="lead-input" />
          <input type="email" id="lead-email" name="email" placeholder="Email nh\u1EADn t\xE0i li\u1EC7u" class="lead-input" />
          <input type="tel" id="lead-phone" name="phone" placeholder="S\u1ED1 \u0111i\u1EC7n tho\u1EA1i" class="lead-input" />
        </div>
        <button type="submit" id="lead-submit-btn" class="lead-submit-btn">Nh\u1EADn c\u1EA9m nang mi\u1EC5n ph\xED \u2192</button>
        <div id="lead-form-msg" class="lead-form-msg" role="status" aria-live="polite"></div>
      </form>
    </div>` : ""}
  </article>
  <div class="share-bar">
    <span class="share-label">Chia s\u1EBB b\xE0i vi\u1EBFt:</span>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrlEnc}" target="_blank" rel="noopener" class="share-btn share-fb">Facebook</a>
    <a href="https://zalo.me/oa/share?url=${shareUrlEnc}" target="_blank" rel="noopener" class="share-btn share-zalo">Zalo</a>
    <button class="share-btn share-copy" onclick="navigator.clipboard.writeText('${shareUrl}').then(()=>this.textContent='\u0110\xE3 copy!')">Sao ch\xE9p link</button>
  </div>
  <div class="feedback-block" id="feedback-block">
    <div class="feedback-title">B\xE0i vi\u1EBFt n\xE0y c\xF3 h\u1EEFu \xEDch?</div>
    <div class="feedback-actions">
      <button type="button" class="feedback-btn feedback-yes" id="feedback-btn-yes" data-rating="yes">C\xF3</button>
      <button type="button" class="feedback-btn feedback-no" id="feedback-btn-no" data-rating="no">Kh\xF4ng</button>
    </div>
    <div class="feedback-comment-wrap">
      <input type="text" class="feedback-comment-input" id="feedback-comment" placeholder="\xDD ki\u1EBFn \u0111\xF3ng g\xF3p th\xEAm (kh\xF4ng b\u1EAFt bu\u1ED9c)..." maxlength="500" />
    </div>
    <div class="feedback-msg" id="feedback-msg" role="status" aria-live="polite"></div>
  </div>
  <div class="author-box">
    <div class="author-info">
      <strong>${esc(authorName)}</strong>
      <p>${esc(authorBio)}</p>
    </div>
  </div>
  ${relatedHTML}
</main>

${site.isGulagi ? `<div class="sticky-cta" id="sticky-cta">
  <a href="${esc(site.ctaSignupUrl)}" class="sticky-cta-btn">D\xE1n link Google Maps \u2014 T\u1EA1o web qu\xE1n 30s</a>
</div>` : ""}

<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      ${site.logoUrl ? `<img src="${esc(site.logoUrl)}" alt="${esc(site.name)}" height="24" />` : `<strong>${esc(site.name)}</strong>`} \u2014 ${esc(site.description)}
    </div>
    <div class="footer-links">
      <a href="${esc(site.homeUrl)}">Trang ch\u1EE7</a>
      <a href="${effectiveBasePath}/blog">Blog</a>
      <a href="${effectiveBasePath}/feed.xml">RSS</a>
    </div>
    <div class="footer-copy">\xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} ${esc(site.name)}. B\u1EA3o l\u01B0u m\u1ECDi quy\u1EC1n.</div>
  </div>
</footer>

<script>
window.addEventListener('scroll', function() {
  var btn = document.getElementById('sticky-cta');
  if (btn) btn.classList.toggle('visible', window.scrollY > 600);
});
(function() {
  var blogSlug = ${blogSlugEsc};
  var PS_BP = ${JSON.stringify(basePath)};
  var PS_PROJECT = PS_BP ? PS_BP.slice(1) : '';
  var PS_Q = PS_PROJECT ? ('?project=' + encodeURIComponent(PS_PROJECT)) : '';
${beaconScript}
  // Feedback widget
  var fbBlock = document.getElementById('feedback-block');
  if (fbBlock) {
    var btnYes = document.getElementById('feedback-btn-yes');
    var btnNo = document.getElementById('feedback-btn-no');
    var commentInput = document.getElementById('feedback-comment');
    var fbMsg = document.getElementById('feedback-msg');
    var fbVoted = false;

    function sendFeedback(rating) {
      if (fbVoted) return;
      fbVoted = true;
      if (btnYes) btnYes.disabled = true;
      if (btnNo) btnNo.disabled = true;
      if (fbMsg) fbMsg.textContent = '';
      var commentVal = commentInput ? commentInput.value.trim().slice(0, 500) : '';

      fetch('/api/blog/feedback' + PS_Q, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blog_slug: blogSlug,
          rating: rating,
          comment: commentVal
        })
      }).then(function(res) {
        if (res.ok) {
          fbBlock.textContent = '';
          var thanksEl = document.createElement('div');
          thanksEl.className = 'feedback-thanks';
          thanksEl.textContent = 'C\u1EA3m \u01A1n ph\u1EA3n h\u1ED3i c\u1EE7a b\u1EA1n!';
          fbBlock.appendChild(thanksEl);
        } else {
          fbVoted = false;
          if (btnYes) btnYes.disabled = false;
          if (btnNo) btnNo.disabled = false;
          if (fbMsg) fbMsg.textContent = 'G\u1EEDi th\u1EA5t b\u1EA1i, th\u1EED l\u1EA1i sau.';
        }
      }).catch(function() {
        fbVoted = false;
        if (btnYes) btnYes.disabled = false;
        if (btnNo) btnNo.disabled = false;
        if (fbMsg) fbMsg.textContent = 'G\u1EEDi th\u1EA5t b\u1EA1i, th\u1EED l\u1EA1i sau.';
      });
    }

    if (btnYes) btnYes.addEventListener('click', function() { sendFeedback('yes'); });
    if (btnNo) btnNo.addEventListener('click', function() { sendFeedback('no'); });
  }

  // Lead form
  var leadForm = document.getElementById('lead-capture-form');
  if (leadForm) {
    var leadName = document.getElementById('lead-name');
    var leadEmail = document.getElementById('lead-email');
    var leadPhone = document.getElementById('lead-phone');
    var leadSubmit = document.getElementById('lead-submit-btn');
    var leadMsg = document.getElementById('lead-form-msg');

    leadForm.addEventListener('submit', function(e) {
      e.preventDefault();
      if (!leadMsg) return;
      leadMsg.textContent = '';
      leadMsg.className = 'lead-form-msg';

      var nameVal = leadName ? leadName.value.trim() : '';
      var emailVal = leadEmail ? leadEmail.value.trim() : '';
      var phoneVal = leadPhone ? leadPhone.value.trim() : '';

      if (!emailVal && !phoneVal) {
        leadMsg.className = 'lead-form-msg error';
        leadMsg.textContent = 'Vui l\xF2ng nh\u1EADp email ho\u1EB7c s\u1ED1 \u0111i\u1EC7n tho\u1EA1i.';
        return;
      }

      if (leadSubmit) leadSubmit.disabled = true;

      fetch('/api/blog/leads' + PS_Q, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameVal,
          email: emailVal,
          phone: phoneVal,
          source: 'blog',
          blog_slug: blogSlug
        })
      }).then(function(res) {
        if (res.ok) {
          leadMsg.className = 'lead-form-msg success';
          leadMsg.textContent = '\u0110\xE3 nh\u1EADn th\xF4ng tin!';
          leadForm.reset();
        } else {
          leadMsg.className = 'lead-form-msg error';
          leadMsg.textContent = 'G\u1EEDi th\u1EA5t b\u1EA1i, th\u1EED l\u1EA1i sau.';
        }
        if (leadSubmit) leadSubmit.disabled = false;
      }).catch(function() {
        leadMsg.className = 'lead-form-msg error';
        leadMsg.textContent = 'G\u1EEDi th\u1EA5t b\u1EA1i, th\u1EED l\u1EA1i sau.';
        if (leadSubmit) leadSubmit.disabled = false;
      });
    });
  }
})();
<\/script>
</body>
</html>`;
}
var HERO_W, HERO_H;
var init_page_render = __esm({
  "_lib/page_render.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_markdown();
    init_util();
    init_project_scope();
    HERO_W = 1200;
    HERO_H = 630;
    __name(brand, "brand");
    __name(themeStyle, "themeStyle");
    __name(jsonLD, "jsonLD");
    __name(extractFAQ, "extractFAQ");
    __name(renderContentPage, "renderContentPage");
  }
});

// blog/index.js
async function renderBlogIndex({ env, request, page = 1, projectSlug = null, basePath = "" }) {
  const host = new URL(request.url).hostname;
  const baseUrl = `https://${host}`;
  page = Math.max(1, parseInt(page, 10) || 1);
  let project = null;
  if (projectSlug) {
    project = await resolveProjectBySlug(env, projectSlug).catch(() => null);
    if (!project) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  } else {
    project = await resolveProjectForRequest(env, request).catch(() => null);
  }
  const projectId = project?.id || null;
  const bp = basePath || (projectSlug ? `/${projectSlug}` : "");
  const totalSql = projectId ? `SELECT COUNT(*) AS n FROM blog_posts WHERE status='published' AND project_id = ?` : `SELECT COUNT(*) AS n FROM blog_posts WHERE status='published'`;
  const totalRow = await (projectId ? env.DB.prepare(totalSql).bind(projectId) : env.DB.prepare(totalSql)).first().catch(() => ({ n: 0 }));
  const total = totalRow?.n || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages && page !== 1) {
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  }
  const offset = (page - 1) * PAGE_SIZE;
  const pageSql = projectId ? `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at
       FROM blog_posts WHERE status='published' AND project_id = ?
       ORDER BY published_at DESC LIMIT ? OFFSET ?` : `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at
       FROM blog_posts WHERE status='published'
       ORDER BY published_at DESC LIMIT ? OFFSET ?`;
  const r = await (projectId ? env.DB.prepare(pageSql).bind(projectId, PAGE_SIZE, offset) : env.DB.prepare(pageSql).bind(PAGE_SIZE, offset)).all();
  const posts = r.results || [];
  const settings = await loadSettings(env).catch(() => ({}));
  const isVi = true;
  const homeHost = (() => {
    try {
      return new URL(project?.website_url || "").hostname;
    } catch {
      return "";
    }
  })();
  const isGulagi = !project || !homeHost || /(^|\.)gulagi\.com$/.test(homeHost);
  const homeUrl = project?.website_url || "https://gulagi.com";
  const siteName = project?.site_name || env.SITE_NAME || settings.site_name || "Gulagi";
  const siteDesc = project?.site_description || env.SITE_DESCRIPTION || settings.site_description || (isVi ? `B\xE0i vi\u1EBFt v\xE0 gi\u1EA3i ph\xE1p ph\xE1t tri\u1EC3n kinh doanh t\u1EEB ${siteName}.` : `Articles from ${siteName}.`);
  const items = posts.map((p, i) => {
    const date = isVi ? new Date((p.published_at || 0) * 1e3).toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "long",
      day: "numeric"
    }) : new Date((p.published_at || 0) * 1e3).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    const imgSrc = p.hero_image_key ? `/image/${esc(p.hero_image_key)}` : `/cover/${esc(p.slug)}.svg`;
    const loadAttrs = i === 0 ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"';
    const img = `<img src="${imgSrc}" alt="${esc(p.hero_image_alt || p.title)}" width="640" height="336" ${loadAttrs} />`;
    return `
      <li>
        ${img}
        <div class="blog-meta">
          <div class="blog-date">${esc(date)}</div>
          <h2><a href="${bp}/blog/${esc(p.slug)}">${esc(p.title)}</a></h2>
          <p>${esc((p.meta_description || "").slice(0, 200))}</p>
        </div>
      </li>`;
  }).join("");
  const customHost = project?.custom_domain ? normalizeHost(project.custom_domain) : null;
  const effectiveBaseUrl = customHost ? `https://${customHost}` : baseUrl;
  const effectiveBp = customHost ? "" : bp;
  const canonical = page === 1 ? `${effectiveBaseUrl}${effectiveBp}/blog` : `${effectiveBaseUrl}${effectiveBp}/blog/page/${page}`;
  const prevHref = page === 2 ? `${bp}/blog` : page > 2 ? `${bp}/blog/page/${page - 1}` : null;
  const nextHref = page < totalPages ? `${bp}/blog/page/${page + 1}` : null;
  const relLinks = [
    prevHref ? `<link rel="prev" href="${prevHref}" />` : "",
    nextHref ? `<link rel="next" href="${nextHref}" />` : ""
  ].filter(Boolean).join("");
  const windowSize = 3;
  const pageNums = [];
  for (let i = Math.max(1, page - windowSize); i <= Math.min(totalPages, page + windowSize); i++) {
    pageNums.push(i);
  }
  const pagerLinks = pageNums.map((i) => {
    const href = i === 1 ? `${bp}/blog` : `${bp}/blog/page/${i}`;
    const aria = i === page ? ' aria-current="page"' : "";
    const cls = i === page ? "pager-num pager-current" : "pager-num";
    return `<a class="${cls}" href="${href}"${aria}>${i}</a>`;
  }).join(" ");
  const pagerHTML = totalPages > 1 ? `
<nav class="pager" aria-label="Blog pagination">
  ${prevHref ? `<a class="pager-prev" rel="prev" href="${prevHref}">${isVi ? "\u2190 Trang tr\u01B0\u1EDBc" : "\u2190 Newer"}</a>` : ""}
  <span class="pager-nums">${pagerLinks}</span>
  ${nextHref ? `<a class="pager-next" rel="next" href="${nextHref}">${isVi ? "Trang sau \u2192" : "Older \u2192"}</a>` : ""}
  <span class="pager-pos">${isVi ? `Trang ${page} tr\xEAn ${totalPages} \xB7 ${total} b\xE0i vi\u1EBFt` : `Page ${page} of ${totalPages} \xB7 ${total} post${total === 1 ? "" : "s"}`}</span>
</nav>` : total > 0 ? `
<nav class="pager pager-single" aria-label="Blog pagination">
  <span class="pager-pos">${isVi ? `${total} b\xE0i vi\u1EBFt` : `${total} post${total === 1 ? "" : "s"}`}</span>
</nav>` : "";
  const titleStr = page === 1 ? isVi ? `Blog \xB7 ${siteName}` : `Blog \xB7 ${siteName}` : isVi ? `Blog \xB7 Trang ${page} \xB7 ${siteName}` : `Blog \xB7 page ${page} \xB7 ${siteName}`;
  const ldJson = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${effectiveBaseUrl}/#website`,
        url: effectiveBaseUrl,
        name: siteName,
        description: siteDesc,
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${effectiveBaseUrl}${effectiveBp}/blog?q={search_term_string}` },
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": "CollectionPage",
        "@id": `${canonical}#page`,
        url: canonical,
        name: titleStr,
        isPartOf: { "@id": `${effectiveBaseUrl}/#website` },
        mainEntity: {
          "@type": "ItemList",
          itemListElement: posts.map((p, i) => ({
            "@type": "ListItem",
            position: offset + i + 1,
            url: `${effectiveBaseUrl}${effectiveBp}/blog/${p.slug}`,
            name: p.title
          }))
        }
      }
    ]
  });
  const gv = String(settings?.google_site_verification || "").trim();
  const bv = String(settings?.bing_site_verification || "").trim();
  const verifyMetas = [
    gv ? `<meta name="google-site-verification" content="${esc(gv)}" />` : "",
    bv ? `<meta name="msvalidate.01" content="${esc(bv)}" />` : ""
  ].filter(Boolean).join("\n");
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(titleStr)}</title>
<meta name="description" content="${esc(siteDesc)}" />
<link rel="canonical" href="${canonical}" />
${relLinks}
${verifyMetas}
<link rel="alternate" type="application/rss+xml" title="${esc(siteName)} \u2014 RSS feed" href="${effectiveBaseUrl}${effectiveBp}/feed.xml" />
<meta name="robots" content="index,follow" />
<meta property="og:title" content="${esc(titleStr)}" />
<meta property="og:description" content="${esc(siteDesc)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:type" content="website" />
${posts[0] ? `<meta property="og:image" content="${baseUrl}${posts[0].hero_image_key ? `/image/${esc(posts[0].hero_image_key)}` : `/cover/${esc(posts[0].slug)}.svg`}" />` : ""}
<meta name="twitter:card" content="${posts[0] ? "summary_large_image" : "summary"}" />
${posts[0] ? `<link rel="preload" as="image" href="${posts[0].hero_image_key ? `/image/${esc(posts[0].hero_image_key)}` : `/cover/${esc(posts[0].slug)}.svg`}" fetchpriority="high" />` : ""}
<link rel="preload" href="/_fonts/inter-400.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/_fonts/instrument-serif-400.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="/style.css" />
${themeStyle(project?.theme_color)}
<script type="application/ld+json">${ldJson}<\/script>
</head>
<body>
<header class="site-header${project?.theme_color ? " is-themed" : ""}">
  <div class="header-inner">
    <a class="header-brand" href="${esc(homeUrl)}">
      ${project?.logo_url ? `<img class="header-logo-img" src="${esc(project.logo_url)}" alt="${esc(siteName)}" height="28" />` : `<span class="header-logo">${esc(siteName)}</span>`}
    </a>
    <nav class="header-nav">
      <a href="${esc(homeUrl)}">Trang ch\u1EE7</a>
      <a href="${bp}/blog" class="active">Blog</a>
      ${isGulagi ? `<a href="${esc(homeUrl)}" class="header-cta">T\u1EA1o website ngay</a>` : ""}
    </nav>
  </div>
</header>
<main class="blog-index">
  <header class="blog-index-head">
    <div>
      <h1>Blog${page > 1 ? ` <span class="page-suffix">\u2014 page ${page}</span>` : ""}</h1>
      <p class="lede">${esc(siteDesc)}</p>
    </div>
    <!-- Search box. Filters the visible list via /api/widget?q=\u2026
         (same endpoint the embed widget uses), so result ordering
         is consistent across surfaces. Falls back to the canonical
         /blog?q= URL if JavaScript is disabled \u2014 Google's
         SearchAction JSON-LD targets that URL too. -->
    <form id="blog-search-form" role="search" action="${bp}/blog" method="GET" class="blog-search">
      <input id="blog-search-input"
             type="search" name="q"
             placeholder="${isVi ? "T\xECm ki\u1EBFm b\xE0i vi\u1EBFt\u2026" : "Search posts\u2026"}"
             autocomplete="off" spellcheck="false"
             aria-label="${isVi ? "T\xECm ki\u1EBFm b\xE0i vi\u1EBFt" : "Search posts"}"
             value="" />
      <button type="submit" class="blog-search-go" aria-label="Search">\u2192</button>
    </form>
  </header>
  ${posts.length ? `<ul id="blog-list">${items}</ul>` : `<ul id="blog-list" hidden></ul><p id="blog-noposts" class="lede">${isVi ? "C\xE1c b\xE0i vi\u1EBFt s\u1EBD s\u1EDBm xu\u1EA5t hi\u1EC7n." : "First post lands soon."}</p>`}
  <div id="blog-empty" class="blog-empty" hidden></div>
  ${pagerHTML}
</main>

<!-- Inline client-side search. Reads ?q= from the URL on load to
     pre-fill the input (so /blog?q=foo works from a deep link or
     SearchAction). Debounces 200ms; fetches /api/widget for matches
     and re-renders the list inline without leaving the page.

     Defence in depth: the renderer never uses innerHTML on the
     server response. Cards are built via document.createElement and
     textContent so post-supplied strings can't be HTML-injected
     even if the API ever returned tainted data. -->
<script>
(function () {
  var PS_BP = ${JSON.stringify(bp)};
  var PS_PROJECT = ${JSON.stringify(project?.slug || "")};
  var form  = document.getElementById('blog-search-form');
  var input = document.getElementById('blog-search-input');
  var list  = document.getElementById('blog-list');
  var empty = document.getElementById('blog-empty');
  var pager = document.querySelector('main.blog-index .pager');
  var noposts = document.getElementById('blog-noposts');
  if (!form || !input || !list) return;

  // Restore q from URL on first paint.
  try {
    var q0 = new URL(location.href).searchParams.get('q') || '';
    if (q0) { input.value = q0; doSearch(q0, false); }
  } catch (e) {}

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    doSearch(input.value.trim(), true);
  });

  // Debounced live filter as the user types.
  var t = null;
  input.addEventListener('input', function () {
    if (t) clearTimeout(t);
    t = setTimeout(function () { doSearch(input.value.trim(), false); }, 200);
  });

  function setEmpty(msg) {
    if (msg) { empty.hidden = false; empty.textContent = msg; }
    else { empty.hidden = true; empty.textContent = ''; }
  }

  function clearList() {
    while (list.firstChild) list.removeChild(list.firstChild);
  }

  function buildItem(p) {
    var li = document.createElement('li');
    if (p.image) {
      var img = document.createElement('img');
      img.src = p.image;
      img.alt = p.title || '';
      img.setAttribute('width',  '640');
      img.setAttribute('height', '336');
      img.loading  = 'lazy';
      img.decoding = 'async';
      li.appendChild(img);
    }
    var meta = document.createElement('div');
    meta.className = 'blog-meta';
    var date = document.createElement('div');
    date.className = 'blog-date';
    date.textContent = p.date || '';
    meta.appendChild(date);
    var h2 = document.createElement('h2');
    var a  = document.createElement('a');
    a.href = (PS_BP || '') + '/blog/' + encodeURIComponent(p.slug);
    a.textContent = p.title || '';
    h2.appendChild(a);
    meta.appendChild(h2);
    var pgr = document.createElement('p');
    pgr.textContent = (p.excerpt || '').slice(0, 200);
    meta.appendChild(pgr);
    li.appendChild(meta);
    return li;
  }

  function setUrlQ(q) {
    try {
      var u = new URL(location.href);
      if (q) u.searchParams.set('q', q); else u.searchParams.delete('q');
      history.replaceState({}, '', u.pathname + (u.search || '') + (u.hash || ''));
    } catch (e) {}
  }

  function doSearch(q, hardSubmit) {
    setUrlQ(q);
    if (!q) {
      if (hardSubmit) { location.href = (PS_BP || '') + '/blog'; return; }
      fetchPage('', 1);
      return;
    }
    fetchPage(q, 1);
  }

  function fetchPage(q, page) {
    var url = '/api/widget?per_page=10&page=' + page + (q ? '&q=' + encodeURIComponent(q) : '');
    if (PS_PROJECT) url += '&project=' + encodeURIComponent(PS_PROJECT);
    fetch(url, { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (d) {
        clearList();
        list.hidden = false;
        if (noposts) noposts.hidden = true;
        if (!d.posts || !d.posts.length) {
          setEmpty(q ? 'No posts match "' + q + '".' : 'First post lands soon.');
          if (pager) pager.style.display = 'none';
          return;
        }
        setEmpty('');
        for (var i = 0; i < d.posts.length; i++) {
          list.appendChild(buildItem(d.posts[i]));
        }
        // Hide server-rendered pager while in search mode.
        if (pager) pager.style.display = q ? 'none' : '';
      })
      .catch(function () {
        setEmpty('Search failed. Try again, or browse the full list.');
      });
  }
})();
<\/script>
<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <strong>${esc(siteName)}</strong> \u2014 ${esc(siteDesc)}
    </div>
    <div class="footer-links">
      <a href="${esc(homeUrl)}">Trang ch\u1EE7</a>
      <a href="${bp}/blog">Blog</a>
      <a href="${bp}/feed.xml">RSS</a>
    </div>
    <div class="footer-copy">\xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} ${esc(siteName)}. B\u1EA3o l\u01B0u m\u1ECDi quy\u1EC1n.</div>
  </div>
</footer>
</body>
</html>`;
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin"
    }
  });
}
var PAGE_SIZE, onRequestGet20;
var init_blog = __esm({
  "blog/index.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_settings();
    init_page_render();
    init_project_scope();
    PAGE_SIZE = 10;
    __name(renderBlogIndex, "renderBlogIndex");
    onRequestGet20 = /* @__PURE__ */ __name((ctx) => renderBlogIndex({ env: ctx.env, request: ctx.request, page: 1 }), "onRequestGet");
  }
});

// [project]/blog/page/[page].js
var onRequestGet21;
var init_page = __esm({
  "[project]/blog/page/[page].js"() {
    init_functionsRoutes_0_09583509623234443();
    init_blog();
    init_project_scope();
    onRequestGet21 = /* @__PURE__ */ __name(async (ctx) => {
      const slug = String(ctx.params?.project || "").toLowerCase();
      const project = await resolveProjectBySlugPath(ctx.env, slug).catch(() => null);
      if (!project) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      const page = parseInt(ctx.params?.page, 10);
      if (!Number.isFinite(page) || page < 1) {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      }
      if (page === 1) {
        return new Response(null, { status: 301, headers: { location: new URL(`/${slug}/blog`, ctx.request.url).toString() } });
      }
      return renderBlogIndex({ env: ctx.env, request: ctx.request, page, projectSlug: slug, basePath: `/${slug}` });
    }, "onRequestGet");
  }
});

// api/admin/activation.js
var SITE_ORIGIN, onRequestGet22;
var init_activation = __esm({
  "api/admin/activation.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_settings();
    init_ai();
    SITE_ORIGIN = "https://seo.gulagi.com";
    onRequestGet22 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      if (!pid) return json(200, { ok: true, steps: [], complete: false });
      const now = Math.floor(Date.now() / 1e3);
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const project = await env.DB.prepare(
        "SELECT id, slug, name, custom_domain, publishing_url, created_at FROM projects WHERE id = ? LIMIT 1"
      ).bind(pid).first().catch(() => null);
      const one = /* @__PURE__ */ __name(async (sql, args) => env.DB.prepare(sql).bind(...args).first().catch(() => null), "one");
      const settings = await loadSettings(env).catch(() => ({}));
      const providers = await listProviders(env).catch(() => ({ text: [] }));
      const brandRow = await one("SELECT business_type, audience FROM project_brands WHERE project_id = ?", [pid]);
      const hasBrandDna = !!(brandRow?.business_type || brandRow?.audience || settings.brand_business_type || settings.brand_target_audience);
      const slots = await one(
        `SELECT COUNT(*) AS n FROM content_calendar
      WHERE project_id = ? AND scheduled_for >= ? AND status IN ('scheduled','generating','draft')`,
        [pid, today]
      );
      const hasSchedule = (slots?.n || 0) > 0;
      const firstPost = await one(
        `SELECT published_at FROM blog_posts
      WHERE project_id = ? AND status = 'published'
      ORDER BY published_at ASC LIMIT 1`,
        [pid]
      );
      const postCount = await one(
        "SELECT COUNT(*) AS n FROM blog_posts WHERE project_id = ? AND status = 'published'",
        [pid]
      );
      const hasPost = !!firstPost?.published_at;
      const hasDomain = !!project?.custom_domain;
      const channel = await one(
        "SELECT publisher_type FROM project_publishing_configs WHERE project_id = ? LIMIT 1",
        [pid]
      );
      const hasChannel = !!channel?.publisher_type && channel.publisher_type !== "internal_d1";
      const hasProviders = (providers.text || []).length > 0;
      const steps = [
        {
          key: "brand_dna",
          title: "T\u1EA1o Brand DNA",
          detail: "AI \u0111\u1ECDc website c\u1EE7a b\u1EA1n \u0111\u1EC3 l\u1EA5y gi\u1ECDng v\u0103n, kh\xE1ch h\xE0ng m\u1EE5c ti\xEAu v\xE0 ch\u1EE7 \u0111\u1EC1.",
          done: hasBrandDna,
          action: { label: "T\u1EA1o Brand DNA", href: "#brand" }
        },
        {
          key: "providers",
          title: "Ki\u1EC3m tra AI provider",
          detail: "Workers AI \u0111\xE3 b\u1EADt s\u1EB5n. Th\xEAm key ri\xEAng n\u1EBFu mu\u1ED1n ch\u1EA5t l\u01B0\u1EE3ng cao h\u01A1n.",
          done: hasProviders,
          optional: true,
          action: { label: "M\u1EDF C\xE0i \u0111\u1EB7t", href: "#settings" }
        },
        {
          key: "schedule",
          title: "L\xEAn l\u1ECBch n\u1ED9i dung 28 ng\xE0y",
          detail: "Cron d\xF9ng l\u1ECBch n\xE0y \u0111\u1EC3 bi\u1EBFt m\u1ED7i ng\xE0y vi\u1EBFt b\xE0i g\xEC.",
          done: hasSchedule,
          action: { label: "L\xEAn l\u1ECBch", href: "#calendar" }
        },
        {
          key: "first_post",
          title: "Xu\u1EA5t b\u1EA3n b\xE0i \u0111\u1EA7u ti\xEAn",
          detail: "B\u01B0\u1EDBc n\xE0y ch\u1EE9ng minh to\xE0n b\u1ED9 chu\u1ED7i t\u1EA1o n\u1ED9i dung ch\u1EA1y \u0111\u01B0\u1EE3c.",
          done: hasPost,
          action: { label: "T\u1EA1o b\xE0i ngay", href: "#blog" }
        },
        {
          key: "domain",
          title: "G\u1EAFn t\xEAn mi\u1EC1n ri\xEAng",
          detail: "Blog ch\u1EA1y tr\xEAn domain c\u1EE7a b\u1EA1n thay v\xEC \u0111\u01B0\u1EDDng d\u1EABn m\u1EB7c \u0111\u1ECBnh.",
          done: hasDomain,
          optional: true,
          action: { label: "Thi\u1EBFt l\u1EADp t\xEAn mi\u1EC1n", href: "#overview" }
        },
        {
          key: "channel",
          title: "K\u1EBFt n\u1ED1i k\xEAnh m\u1EA1ng x\xE3 h\u1ED9i",
          detail: "T\u1EF1 \u0111\u1ED9ng \u0111\u0103ng b\xE0i m\u1EDBi l\xEAn Facebook Page c\u1EE7a b\u1EA1n.",
          done: hasChannel,
          optional: true,
          action: { label: "K\u1EBFt n\u1ED1i k\xEAnh", href: "#publishing" }
        }
      ];
      const required = steps.filter((s) => !s.optional);
      const doneRequired = required.filter((s) => s.done).length;
      let timeToFirstPostHours = null;
      if (firstPost?.published_at && project?.created_at) {
        timeToFirstPostHours = Math.round((firstPost.published_at - project.created_at) / 3600 * 10) / 10;
      }
      return json(200, {
        ok: true,
        project_id: pid,
        project_slug: project?.slug || null,
        steps,
        required_total: required.length,
        required_done: doneRequired,
        complete: doneRequired === required.length,
        optional_done: steps.filter((s) => s.optional && s.done).length,
        metrics: {
          time_to_first_post_hours: timeToFirstPostHours,
          published_posts: postCount?.n || 0,
          scheduled_slots: slots?.n || 0,
          days_since_created: project?.created_at ? Math.floor((now - project.created_at) / 86400) : null
        },
        blog_url: project?.custom_domain ? `https://${project.custom_domain}` : `${SITE_ORIGIN}/${project?.slug || ""}`.replace(/\/$/, "")
      });
    }, "onRequestGet");
  }
});

// api/admin/aliases/index.js
function validUrl(u) {
  if (typeof u !== "string") return false;
  const s = u.trim();
  if (!s) return false;
  if (s.startsWith("/")) return true;
  if (/^https?:\/\/.+/i.test(s)) return true;
  return false;
}
async function tenantOf(env, request) {
  const auth = await requireAdminAsync(env, request);
  const tenant = await resolveTenantContext(env, request, auth);
  return tenant?.activeProjectId || null;
}
var NAME_RX2, onRequestGet23, onRequestPost38, onRequestPatch3, onRequestDelete4;
var init_aliases2 = __esm({
  "api/admin/aliases/index.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_aliases();
    NAME_RX2 = /^[a-z0-9][a-z0-9_-]{0,40}$/;
    __name(validUrl, "validUrl");
    __name(tenantOf, "tenantOf");
    onRequestGet23 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const pid = await tenantOf(env, request);
      const map = await buildAliasMap(env, pid);
      const items = Object.entries(map).map(([name, v]) => ({ name, ...v }));
      const order = /* @__PURE__ */ __name((i) => i.kind === "reserved" ? 0 : i.kind === "manual" ? 1 : 2, "order");
      items.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
      let owned = 0, shared = 0;
      if (pid) {
        const r = await env.DB.prepare(
          `SELECT
         SUM(CASE WHEN project_id = ? THEN 1 ELSE 0 END) AS owned,
         SUM(CASE WHEN project_id = ''  THEN 1 ELSE 0 END) AS shared
       FROM site_aliases`
        ).bind(pid).first().catch(() => null);
        owned = r?.owned || 0;
        shared = r?.shared || 0;
      }
      return json(200, { ok: true, project_id: pid, aliases: items, reserved: RESERVED_NAMES, counts: { owned, shared } });
    }, "onRequestGet");
    onRequestPost38 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const pid = await tenantOf(env, request);
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const name = String(body?.name || "").trim().toLowerCase();
      const u = String(body?.url || "").trim();
      const desc = String(body?.description || "").trim().slice(0, 300);
      if (!NAME_RX2.test(name)) return json(400, { error: "bad_name", detail: "lowercase letters, digits, _ or -; up to 40 chars." });
      if (RESERVED_NAMES.includes(name)) return json(409, { error: "reserved_name", detail: "Built-in alias; pick a different name." });
      if (!validUrl(u)) return json(400, { error: "bad_url", detail: "Must be root-relative (/path) or absolute https://\u2026" });
      const now = nowSec();
      await env.DB.prepare(
        `INSERT INTO site_aliases (id, project_id, name, url, description, kind, created_at, updated_at)
     VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, 'manual', ?, ?)
     ON CONFLICT(project_id, name) DO UPDATE SET
       url = excluded.url,
       description = excluded.description,
       kind = 'manual',
       updated_at = excluded.updated_at`
      ).bind(pid || "", name, u, desc || null, now, now).run();
      await audit(env, "admin", "aliases.upsert", name, JSON.stringify({ url: u, project_id: pid }));
      return json(200, { ok: true, name });
    }, "onRequestPost");
    onRequestPatch3 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const pid = await tenantOf(env, request);
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const name = String(body?.name || "").trim().toLowerCase();
      if (!name) return json(400, { error: "missing_name" });
      if (RESERVED_NAMES.includes(name)) return json(409, { error: "reserved_name" });
      const sets = [];
      const args = [];
      if (body.url !== void 0) {
        if (!validUrl(body.url)) return json(400, { error: "bad_url" });
        sets.push("url = ?");
        args.push(body.url.trim());
      }
      if (body.description !== void 0) {
        sets.push("description = ?");
        args.push(String(body.description || "").trim().slice(0, 300) || null);
      }
      if (!sets.length) return json(400, { error: "nothing_to_update" });
      sets.push("updated_at = ?");
      args.push(nowSec());
      const r = await env.DB.prepare(
        `UPDATE site_aliases SET ${sets.join(", ")} WHERE name = ? AND project_id = ?`
      ).bind(...args, name, pid || "").run();
      if (!r?.meta?.changes) return json(404, { error: "not_found_or_shared" });
      await audit(env, "admin", "aliases.update", name, JSON.stringify({ project_id: pid }));
      return json(200, { ok: true });
    }, "onRequestPatch");
    onRequestDelete4 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const pid = await tenantOf(env, request);
      const name = (new URL(request.url).searchParams.get("name") || "").toLowerCase();
      if (!name) return json(400, { error: "missing_name" });
      if (RESERVED_NAMES.includes(name)) return json(409, { error: "reserved_name" });
      const r = await env.DB.prepare(
        `DELETE FROM site_aliases WHERE name = ? AND kind = 'manual' AND project_id = ?`
      ).bind(name, pid || "").run();
      if (!r?.meta?.changes) return json(404, { error: "not_found_or_not_manual" });
      await audit(env, "admin", "aliases.delete", name, JSON.stringify({ project_id: pid }));
      return json(200, { ok: true });
    }, "onRequestDelete");
  }
});

// api/admin/analytics.js
var onRequestGet24;
var init_analytics = __esm({
  "api/admin/analytics.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    onRequestGet24 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      if (!env?.DB) return json(500, { error: "no_db" });
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      const since = Math.floor(Date.now() / 1e3) - 30 * 86400;
      const run = /* @__PURE__ */ __name(async (sql, args = [], mode = "first") => {
        const stmt = pid ? env.DB.prepare(sql).bind(pid, ...args) : env.DB.prepare(sql).bind(...args);
        const res = await stmt[mode === "all" ? "all" : "first"]().catch(() => null);
        return mode === "all" ? res?.results || [] : res;
      }, "run");
      const publishedFilter = pid ? `status='published' AND project_id = ?` : `status='published'`;
      const projectFilter = pid ? `project_id = ?` : `1=1`;
      const [blogCount, progCount, leadCount, feedback, topViews, aiCost, latestLeads] = await Promise.all([
        run(`SELECT COUNT(*) as n FROM blog_posts WHERE ${publishedFilter}`),
        run(`SELECT COUNT(*) as n FROM prog_pages WHERE ${publishedFilter}`),
        run(`SELECT COUNT(*) as n FROM leads WHERE ${projectFilter}`),
        run(`SELECT rating, COUNT(*) as n FROM feedback WHERE ${projectFilter} GROUP BY rating`, [], "all"),
        run(`SELECT blog_slug, view_count, total_read_time_ms FROM blog_views WHERE ${projectFilter} ORDER BY view_count DESC LIMIT 10`, [], "all"),
        run(`SELECT COALESCE(SUM(cost_usd), 0) as total FROM ai_usage WHERE created_at > ? AND ${projectFilter}`, [since]),
        run(`SELECT id, name, email, phone, source, blog_slug, created_at FROM leads WHERE ${projectFilter} ORDER BY created_at DESC LIMIT 5`, [], "all")
      ]);
      return json(200, {
        ok: true,
        project_id: pid,
        project_slug: tenant?.activeProjectSlug || null,
        total_posts: (blogCount?.n || 0) + (progCount?.n || 0),
        total_leads: leadCount?.n || 0,
        feedback,
        top_views: topViews,
        ai_cost_30d: aiCost?.total || 0,
        latest_leads: latestLeads
      });
    }, "onRequestGet");
  }
});

// api/admin/attention.js
function item(id, severity, title, detail, action, count = null) {
  return { id, severity, title, detail, count, action };
}
var CRON_STALE_HOURS, STUCK_JOB_HOURS, BUDGET_WARN_PCT, onRequestGet25;
var init_attention = __esm({
  "api/admin/attention.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_settings();
    init_ai();
    init_usage();
    CRON_STALE_HOURS = 36;
    STUCK_JOB_HOURS = 1;
    BUDGET_WARN_PCT = 80;
    __name(item, "item");
    onRequestGet25 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      const now = Math.floor(Date.now() / 1e3);
      const items = [];
      const scope = /* @__PURE__ */ __name((col = "project_id") => pid ? `${col} = ?` : "1=1", "scope");
      const binds = /* @__PURE__ */ __name((extra = []) => pid ? [pid, ...extra] : extra, "binds");
      const countOf = /* @__PURE__ */ __name(async (sql, args) => {
        const r = await env.DB.prepare(sql).bind(...args).first().catch(() => null);
        return r?.n ?? 0;
      }, "countOf");
      const reconnect = await countOf(
        `SELECT COUNT(*) AS n FROM social_posts WHERE ${scope()} AND needs_reconnect = 1`,
        binds()
      );
      if (reconnect) {
        items.push(item(
          "social_reconnect",
          "critical",
          "K\xEAnh m\u1EA1ng x\xE3 h\u1ED9i c\u1EA7n k\u1EBFt n\u1ED1i l\u1EA1i",
          `${reconnect} b\xE0i kh\xF4ng \u0111\u0103ng \u0111\u01B0\u1EE3c v\xEC token ho\u1EB7c quy\u1EC1n \u0111\xE3 h\u1EBFt hi\u1EC7u l\u1EF1c. K\u1EBFt n\u1ED1i l\u1EA1i r\u1ED3i b\u1EA5m "\u0110\u0103ng l\u1EA1i".`,
          { label: "M\u1EDF K\xEAnh xu\u1EA5t b\u1EA3n", href: "#publishing" },
          reconnect
        ));
      }
      const socialFailed = await countOf(
        `SELECT COUNT(*) AS n FROM social_posts
      WHERE ${scope()} AND status = 'failed' AND needs_reconnect = 0`,
        binds()
      );
      if (socialFailed) {
        items.push(item(
          "social_failed",
          "warning",
          "B\xE0i \u0111\u0103ng m\u1EA1ng x\xE3 h\u1ED9i th\u1EA5t b\u1EA1i",
          `${socialFailed} b\xE0i \u0111ang ch\u1EDD th\u1EED l\u1EA1i t\u1EF1 \u0111\u1ED9ng. N\u1EBFu l\u1ED7i l\u1EB7p l\u1EA1i, xem chi ti\u1EBFt v\xE0 \u0111\u0103ng l\u1EA1i th\u1EE7 c\xF4ng.`,
          { label: "Xem b\xE0i \u0111\u0103ng", href: "#social" },
          socialFailed
        ));
      }
      const stuck = await countOf(
        `SELECT COUNT(*) AS n FROM blog_jobs
      WHERE ${scope()} AND status NOT IN ('published','failed') AND updated_at < ?`,
        binds([now - STUCK_JOB_HOURS * 3600])
      );
      if (stuck) {
        items.push(item(
          "blog_stuck",
          "critical",
          "B\xE0i vi\u1EBFt b\u1ECB k\u1EB9t gi\u1EEFa chu\u1ED7i",
          `${stuck} job kh\xF4ng ho\xE0n t\u1EA5t sau ${STUCK_JOB_HOURS} gi\u1EDD. Cron s\u1EBD t\u1EF1 d\u1ECDn v\xE0 ch\u1EA1y l\u1EA1i, nh\u01B0ng n\xEAn ki\u1EC3m tra provider.`,
          { label: "M\u1EDF Blog", href: "#blog" },
          stuck
        ));
      }
      const blogFailed = await countOf(
        `SELECT COUNT(*) AS n FROM blog_jobs
      WHERE ${scope()} AND status = 'failed' AND created_at > ?`,
        binds([now - 7 * 86400])
      );
      if (blogFailed) {
        items.push(item(
          "blog_failed",
          "warning",
          "B\xE0i vi\u1EBFt t\u1EA1o th\u1EA5t b\u1EA1i",
          `${blogFailed} job th\u1EA5t b\u1EA1i trong 7 ng\xE0y qua. Xem l\u1ED7i c\u1EE5 th\u1EC3 \u1EDF b\u1EA3ng "B\u1EA3n nh\xE1p & th\u1EA5t b\u1EA1i".`,
          { label: "M\u1EDF Blog", href: "#blog" },
          blogFailed
        ));
      }
      const progFailed = await countOf(
        `SELECT COUNT(*) AS n FROM prog_keywords WHERE ${scope()} AND status = 'failed'`,
        binds()
      );
      if (progFailed) {
        items.push(item(
          "prog_failed",
          "warning",
          "Trang Programmatic SEO th\u1EA5t b\u1EA1i",
          `${progFailed} t\u1EEB kh\xF3a kh\xF4ng t\u1EA1o \u0111\u01B0\u1EE3c trang. Xem l\u1ED7i r\u1ED3i b\u1EA5m th\u1EED l\u1EA1i.`,
          { label: "M\u1EDF Programmatic SEO", href: "#prog" },
          progFailed
        ));
      }
      const budget = await checkBudget(env, "admin").catch(() => null);
      if (budget?.budget > 0) {
        if (budget.spend >= budget.budget) {
          items.push(item(
            "budget_exceeded",
            "critical",
            "\u0110\xE3 ch\u1EA1m ng\xE2n s\xE1ch AI th\xE1ng n\xE0y",
            `Chi ${budget.spend.toFixed(2)}$ / ${budget.budget}$. Cron \u0111\xE3 d\u1EEBng t\u1EA1o n\u1ED9i dung cho t\u1EDBi khi t\u0103ng ng\xE2n s\xE1ch ho\u1EB7c sang th\xE1ng m\u1EDBi.`,
            { label: "M\u1EDF C\xE0i \u0111\u1EB7t", href: "#settings" }
          ));
        } else if (budget.pct >= BUDGET_WARN_PCT) {
          items.push(item(
            "budget_warning",
            "warning",
            "Ng\xE2n s\xE1ch AI s\u1EAFp h\u1EBFt",
            `\u0110\xE3 d\xF9ng ${budget.pct}% (${budget.spend.toFixed(2)}$ / ${budget.budget}$).`,
            { label: "M\u1EDF C\xE0i \u0111\u1EB7t", href: "#settings" }
          ));
        }
      }
      const providers = await listProviders(env).catch(() => ({ text: [] }));
      if (!(providers.text || []).length) {
        items.push(item(
          "no_provider",
          "critical",
          "Ch\u01B0a c\xF3 AI provider n\xE0o ho\u1EA1t \u0111\u1ED9ng",
          "Kh\xF4ng c\xF3 provider n\xE0o s\u1EB5n s\xE0ng n\xEAn cron kh\xF4ng th\u1EC3 t\u1EA1o b\xE0i. Th\xEAm API key ho\u1EB7c b\u1EADt Workers AI.",
          { label: "M\u1EDF C\xE0i \u0111\u1EB7t", href: "#settings" }
        ));
      }
      const last = await env.DB.prepare(
        `SELECT MAX(published_at) AS last FROM blog_posts
      WHERE status = 'published' AND ${scope()}`
      ).bind(...binds()).first().catch(() => null);
      const lastAt = last?.last || null;
      if (lastAt) {
        const ageH = Math.round((now - lastAt) / 3600);
        if (ageH > CRON_STALE_HOURS) {
          items.push(item(
            "cron_stale",
            "critical",
            "Cron c\xF3 v\u1EBB \u0111\xE3 d\u1EEBng",
            `B\xE0i m\u1EDBi nh\u1EA5t c\xE1ch \u0111\xE2y ${ageH} gi\u1EDD. Ki\u1EC3m tra cron worker v\xE0 l\u1ECBch n\u1ED9i dung.`,
            { label: "M\u1EDF L\u1ECBch n\u1ED9i dung", href: "#calendar" }
          ));
        }
      }
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const upcoming = await countOf(
        `SELECT COUNT(*) AS n FROM content_calendar
      WHERE ${scope()} AND scheduled_for >= ? AND status IN ('scheduled','generating','draft')`,
        binds([today])
      );
      if (!upcoming) {
        items.push(item(
          "no_schedule",
          "info",
          "L\u1ECBch n\u1ED9i dung \u0111ang tr\u1ED1ng",
          "Kh\xF4ng c\xF2n slot n\xE0o trong t\u01B0\u01A1ng lai. L\xEAn l\u1ECBch \u0111\u1EC3 cron ti\u1EBFp t\u1EE5c t\u1EA1o b\xE0i.",
          { label: "L\xEAn l\u1ECBch", href: "#calendar" }
        ));
      }
      const s = await loadSettings(env).catch(() => ({}));
      const brandRow = pid ? await env.DB.prepare("SELECT business_type, audience FROM project_brands WHERE project_id = ? LIMIT 1").bind(pid).first().catch(() => null) : null;
      if (!(brandRow?.business_type || brandRow?.audience || s.brand_business_type || s.brand_target_audience)) {
        items.push(item(
          "no_brand_dna",
          "warning",
          "Ch\u01B0a c\xF3 Brand DNA",
          "Kh\xF4ng c\xF3 Brand DNA th\xEC n\u1ED9i dung s\u1EBD chung chung, kh\xF4ng \u0111\xFAng gi\u1ECDng th\u01B0\u01A1ng hi\u1EC7u.",
          { label: "T\u1EA1o Brand DNA", href: "#brand" }
        ));
      }
      if (pid) {
        const proj = await env.DB.prepare(
          "SELECT custom_domain FROM projects WHERE id = ? LIMIT 1"
        ).bind(pid).first().catch(() => null);
        if (proj && !proj.custom_domain) {
          items.push(item(
            "no_domain",
            "info",
            "Ch\u01B0a thi\u1EBFt l\u1EADp t\xEAn mi\u1EC1n ri\xEAng",
            "Blog \u0111ang ch\u1EA1y tr\xEAn \u0111\u01B0\u1EDDng d\u1EABn m\u1EB7c \u0111\u1ECBnh. G\u1EAFn t\xEAn mi\u1EC1n ri\xEAng \u0111\u1EC3 th\u01B0\u01A1ng hi\u1EC7u chuy\xEAn nghi\u1EC7p h\u01A1n.",
            { label: "Thi\u1EBFt l\u1EADp t\xEAn mi\u1EC1n", href: "#overview" }
          ));
        }
      }
      const channel = await env.DB.prepare(
        "SELECT publisher_type FROM project_publishing_configs WHERE project_id = ? LIMIT 1"
      ).bind(pid).first().catch(() => null);
      if (!channel?.publisher_type || channel.publisher_type === "internal_d1") {
        items.push(item(
          "no_channel",
          "info",
          "Ch\u01B0a k\u1EBFt n\u1ED1i k\xEAnh m\u1EA1ng x\xE3 h\u1ED9i",
          "B\xE0i vi\u1EBFt ch\u1EC9 \u0111\u0103ng l\xEAn blog. K\u1EBFt n\u1ED1i Facebook Page \u0111\u1EC3 m\u1ED7i b\xE0i m\u1EDBi t\u1EF1 \u0111\u1ED9ng \u0111\u01B0\u1EE3c chia s\u1EBB.",
          { label: "K\u1EBFt n\u1ED1i k\xEAnh", href: "#publishing" }
        ));
      }
      const rank = { critical: 0, warning: 1, info: 2 };
      items.sort((a, b) => rank[a.severity] - rank[b.severity]);
      const counts = items.reduce((acc, i) => {
        acc[i.severity] = (acc[i.severity] || 0) + 1;
        return acc;
      }, { critical: 0, warning: 0, info: 0 });
      return json(200, {
        ok: true,
        project_id: pid,
        generated_at: now,
        counts,
        total: items.length,
        items
      });
    }, "onRequestGet");
  }
});

// api/admin/audit.js
var onRequestGet26;
var init_audit = __esm({
  "api/admin/audit.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    onRequestGet26 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      if (!env.DB) return json(503, { error: "no_db_binding" });
      const u = new URL(request.url);
      const limit = Math.min(200, parseInt(u.searchParams.get("limit"), 10) || 50);
      const before = parseInt(u.searchParams.get("before"), 10) || 0;
      const action = String(u.searchParams.get("action") || "").trim();
      const actor = String(u.searchParams.get("actor") || "").trim();
      const onlyFailures = u.searchParams.get("only_failures") === "1";
      const where = [];
      const binds = [];
      if (before) {
        where.push("created_at < ?");
        binds.push(before);
      }
      if (action) {
        where.push("action LIKE ?");
        binds.push(`%${action}%`);
      }
      if (actor) {
        where.push("actor = ?");
        binds.push(actor);
      }
      if (onlyFailures) where.push("(action LIKE '%fail%' OR action LIKE '%error%')");
      const sql = `SELECT id, actor, action, target_id, details, created_at
                 FROM audit_log
                 ${where.length ? "WHERE " + where.join(" AND ") : ""}
                 ORDER BY created_at DESC LIMIT ?`;
      binds.push(limit);
      const r = await env.DB.prepare(sql).bind(...binds).all();
      const entries = (r?.results || []).map((row) => {
        let details = row.details;
        if (typeof details === "string" && details.length && /^[{\[]/.test(details)) {
          try {
            details = JSON.parse(details);
          } catch {
          }
        }
        return { ...row, details };
      });
      return json(200, {
        ok: true,
        entries,
        next_before: entries.length === limit ? entries[entries.length - 1].created_at : null
      });
    }, "onRequestGet");
  }
});

// _lib/scrape.js
function decode(s) {
  return String(s || "").replace(ENTITY_RE, (m) => {
    if (m in ENTITY_MAP) return ENTITY_MAP[m];
    if (m.startsWith("&#x") || m.startsWith("&#X")) {
      const cp = parseInt(m.slice(3, -1), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    if (m.startsWith("&#")) {
      const cp = parseInt(m.slice(2, -1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return m;
  });
}
function extractMeta(html2, name) {
  const re1 = new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${name}["'][^>]*content\\s*=\\s*["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']+)["'][^>]*(?:name|property)\\s*=\\s*["']${name}["']`, "i");
  const m = re1.exec(html2) || re2.exec(html2);
  return decode(m ? m[1] : "").trim();
}
function extractAll(html2, selector) {
  const re = new RegExp(`<${selector}\\b[^>]*>([\\s\\S]*?)<\\/${selector}>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(html2)) !== null) {
    const text = decode(m[1].replace(TAG_RE, " ")).replace(WS_RE, " ").trim();
    if (text && text.length < 240) out.push(text);
    if (out.length >= 30) break;
  }
  return out;
}
function extractBodyText(html2) {
  let s = html2.replace(SKIP_TAG_RE, " ").replace(COMMENT_RE, " ");
  const main = s.match(/<(main|article)\b[\s\S]*?<\/\1>/i);
  if (main) s = main[0];
  else {
    const body = s.match(/<body\b[\s\S]*?<\/body>/i);
    if (body) s = body[0];
  }
  s = s.replace(/<(nav|footer|aside|header)\b[\s\S]*?<\/\1>/gi, " ");
  s = decode(s.replace(TAG_RE, " ")).replace(WS_RE, " ").trim();
  return s.slice(0, MAX_BODY_TEXT);
}
async function scrapeUrl(rawUrl, { timeoutMs = 12e3 } = {}) {
  const errors = [];
  let target;
  try {
    target = new URL(rawUrl.trim());
  } catch {
    throw new Error("invalid_url");
  }
  if (!/^https?:$/.test(target.protocol)) throw new Error("only_http_https");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(target.toString(), {
      headers: {
        // Many marketing sites serve different (or no) content to bot UAs.
        // Mimic a normal browser so we get the same HTML a human would.
        "User-Agent": "Mozilla/5.0 (compatible; pages-seo/1.0; +https://github.com/Benjamin-Bloch/pages-seo)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-GB,en;q=0.9"
      },
      redirect: "follow",
      signal: ctrl.signal
    });
  } catch (err) {
    clearTimeout(t);
    if (err?.name === "AbortError") throw new Error("timeout");
    throw new Error("fetch_failed: " + String(err?.message || err).slice(0, 120));
  }
  clearTimeout(t);
  if (!res.ok) throw new Error("http_" + res.status);
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("html") && !ct.includes("xml")) {
    throw new Error("not_html_content_type: " + ct);
  }
  let buf = "";
  const reader = res.body?.getReader();
  if (reader) {
    let total = 0;
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      buf += new TextDecoder().decode(value, { stream: true });
      if (total >= MAX_HTML_BYTES) errors.push("html_truncated");
    }
  } else {
    buf = await res.text();
    if (buf.length > MAX_HTML_BYTES) {
      buf = buf.slice(0, MAX_HTML_BYTES);
      errors.push("html_truncated");
    }
  }
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(buf);
  const title = titleMatch ? decode(titleMatch[1].replace(WS_RE, " ").trim()) : "";
  const meta = {
    description: extractMeta(buf, "description"),
    og_title: extractMeta(buf, "og:title"),
    og_description: extractMeta(buf, "og:description"),
    og_site_name: extractMeta(buf, "og:site_name"),
    keywords: extractMeta(buf, "keywords")
  };
  const headings = {
    h1: extractAll(buf, "h1"),
    h2: extractAll(buf, "h2"),
    h3: extractAll(buf, "h3")
  };
  const body_text = extractBodyText(buf);
  return {
    url: target.toString(),
    status: res.status,
    title,
    meta,
    headings,
    body_text,
    errors
  };
}
function scrapeToPromptInput(scrape) {
  const lines = [];
  lines.push(`URL: ${scrape.url}`);
  if (scrape.title) lines.push(`Page title: ${scrape.title}`);
  if (scrape.meta?.description) lines.push(`Meta description: ${scrape.meta.description}`);
  if (scrape.meta?.og_title && scrape.meta.og_title !== scrape.title) lines.push(`OG title: ${scrape.meta.og_title}`);
  if (scrape.meta?.og_description) lines.push(`OG description: ${scrape.meta.og_description}`);
  if (scrape.meta?.og_site_name) lines.push(`OG site name: ${scrape.meta.og_site_name}`);
  if (scrape.headings?.h1?.length) lines.push(`H1: ${scrape.headings.h1.slice(0, 5).join(" | ")}`);
  if (scrape.headings?.h2?.length) lines.push(`H2: ${scrape.headings.h2.slice(0, 12).join(" | ")}`);
  if (scrape.headings?.h3?.length) lines.push(`H3: ${scrape.headings.h3.slice(0, 12).join(" | ")}`);
  if (scrape.body_text) {
    lines.push("", "Body content (extracted, lightly cleaned):");
    lines.push(scrape.body_text);
  }
  return lines.join("\n");
}
var MAX_HTML_BYTES, MAX_BODY_TEXT, SKIP_TAG_RE, COMMENT_RE, TAG_RE, WS_RE, ENTITY_MAP, ENTITY_RE;
var init_scrape = __esm({
  "_lib/scrape.js"() {
    init_functionsRoutes_0_09583509623234443();
    MAX_HTML_BYTES = 8e5;
    MAX_BODY_TEXT = 6e3;
    SKIP_TAG_RE = /<(script|style|template|noscript|svg|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi;
    COMMENT_RE = /<!--[\s\S]*?-->/g;
    TAG_RE = /<[^>]+>/g;
    WS_RE = /\s+/g;
    ENTITY_MAP = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
      "&#39;": "'",
      "&nbsp;": " ",
      "&hellip;": "\u2026",
      "&mdash;": "\u2014",
      "&ndash;": "\u2013",
      "&lsquo;": "\u2018",
      "&rsquo;": "\u2019",
      "&ldquo;": "\u201C",
      "&rdquo;": "\u201D"
    };
    ENTITY_RE = /&(?:amp|lt|gt|quot|apos|nbsp|hellip|mdash|ndash|lsquo|rsquo|ldquo|rdquo|#39|#x?[0-9a-fA-F]+);/g;
    __name(decode, "decode");
    __name(extractMeta, "extractMeta");
    __name(extractAll, "extractAll");
    __name(extractBodyText, "extractBodyText");
    __name(scrapeUrl, "scrapeUrl");
    __name(scrapeToPromptInput, "scrapeToPromptInput");
  }
});

// api/admin/brand-dna.js
function buildBrandPrompt(scrapeBlock, hints) {
  const serviceAreaHint = hints?.service_area ? `The operator has specified service area: "${hints.service_area}" \u2014 keep that exactly.` : "Suggest a service_area only if it is unambiguous from the content. Otherwise return an empty string.";
  const topicsHint = hints?.topics_to_avoid ? `The operator has specified topics to avoid: "${hints.topics_to_avoid}" \u2014 keep that exactly.` : "topics_to_avoid is optional. Leave it empty unless the source clearly signals subjects the brand should never touch (e.g. competitor names, off-strategy product lines).";
  return [
    "You are an experienced brand strategist analysing a business based on its website.",
    "Read the scraped homepage content below and produce a structured Brand DNA.",
    "Be specific, concrete, and grounded in what the page actually says \u2014 do NOT invent claims.",
    "If a section can't be confidently inferred, return an empty string for that field.",
    "",
    "## Scraped content",
    scrapeBlock,
    "",
    "## What to produce",
    "- business_type: 4\u20138 sentences describing what the business does, its model, its differentiators, and what kind of customer it pursues. Read like a brief written by someone who understands the industry, not a marketing blurb.",
    "- voice_tone: 2\u20134 sentences describing the brand voice as a writer should use it. Note tone, register, what to emphasise, what to avoid. Make it actionable for a content writer.",
    "- target_audience: 3\u20136 sentences. Demographics, psychographics, intent. Include both the primary segment and any secondary segments. Note what jobs the customer is hiring this brand to do.",
    '- key_themes: 4\u201310 short topic phrases the content engine should cover. One per line, short noun phrases (e.g. "preventive dentistry", "emergency dental appointments").',
    "- service_area: " + serviceAreaHint,
    "- topics_to_avoid: " + topicsHint,
    "",
    "## Output format",
    "Return STRICT JSON only \u2014 no markdown fences, no prose outside the braces:",
    "{",
    '  "business_type": "...",',
    '  "voice_tone": "...",',
    '  "target_audience": "...",',
    '  "key_themes": "theme one\\ntheme two\\ntheme three",',
    '  "service_area": "...",',
    '  "topics_to_avoid": "..."',
    "}",
    "Use real newlines inside body strings, but escape them as \\n in JSON.",
    "Do not wrap output in code fences."
  ].join("\n");
}
async function callForBrandDNA(env, prompt, preferredProvider) {
  const overlayed = await vaultedEnv(env);
  const available = (await listProviders(overlayed)).text;
  if (!available.length) throw new Error("no_text_providers_configured");
  const order = preferredProvider && available.includes(preferredProvider) ? [preferredProvider, ...available.filter((p) => p !== preferredProvider)] : available;
  const settings = await loadSettings(env);
  const errs = [];
  for (const name of order) {
    try {
      const { text, model } = await runProvider2(overlayed, name, prompt);
      await recordUsage(env, settings, {
        provider: name,
        model,
        prompt_tokens: estimateTokens(prompt),
        completion_tokens: estimateTokens(text),
        estimated: true,
        kind: "brand-dna",
        source: "admin-brand-dna"
      });
      return { provider: name, parsed: looseJsonParse2(text) };
    } catch (e) {
      errs.push(`${name}: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  await recordUsage(env, settings, {
    provider: order[0] || "unknown",
    kind: "brand-dna",
    source: "admin-brand-dna",
    ok: false,
    error: errs.join(" | ")
  });
  throw new Error("all_providers_failed \u2014 " + errs.join(" | "));
}
async function runProvider2(env, name, prompt) {
  const SYS = "You are a brand strategist. You return strict JSON only.";
  switch (name) {
    case "workers-ai": {
      const model = env.WORKERS_AI_TEXT_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
      const r = await env.AI.run(model, {
        messages: [{ role: "system", content: SYS }, { role: "user", content: prompt }],
        max_tokens: 4096
      });
      const raw = r?.response ?? r?.result?.response ?? r;
      let text = "";
      if (raw && typeof raw === "object" && !Array.isArray(raw) && raw.business_type) {
        text = JSON.stringify(raw);
      } else {
        text = typeof raw === "string" ? raw : JSON.stringify(raw);
      }
      return { text, model };
    }
    case "openai": {
      const model = env.OPENAI_TEXT_MODEL || "gpt-5";
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, instructions: SYS, input: prompt, text: { format: { type: "json_object" } } })
      });
      if (!r.ok) throw new Error("openai_http_" + r.status);
      const d = await r.json();
      if (d.output_text) return { text: d.output_text, model };
      for (const item2 of d.output || []) {
        if (item2.type !== "message") continue;
        for (const c of item2.content || []) if (c.type === "output_text" && c.text) return { text: c.text, model };
      }
      throw new Error("openai_empty");
    }
    case "anthropic": {
      const model = env.ANTHROPIC_TEXT_MODEL || "claude-fable-5";
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 4096, system: SYS, messages: [{ role: "user", content: prompt }] })
      });
      if (!r.ok) throw new Error("anthropic_http_" + r.status);
      const d = await r.json();
      return { text: (d.content || []).filter((c) => c.type === "text").map((c) => c.text).join(""), model };
    }
    case "gemini": {
      const model = env.GEMINI_TEXT_MODEL || "gemini-2.5-pro";
      const u = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      const r = await fetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYS }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.6 }
        })
      });
      if (!r.ok) throw new Error("gemini_http_" + r.status);
      const d = await r.json();
      return { text: (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""), model };
    }
    case "groq":
    case "deepseek":
    case "mistral":
    case "together":
    case "cerebras": {
      const map = {
        groq: { url: "https://api.groq.com/openai/v1/chat/completions", key: env.GROQ_API_KEY, model: env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile" },
        deepseek: { url: "https://api.deepseek.com/v1/chat/completions", key: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_TEXT_MODEL || "deepseek-chat" },
        mistral: { url: "https://api.mistral.ai/v1/chat/completions", key: env.MISTRAL_API_KEY, model: env.MISTRAL_TEXT_MODEL || "mistral-large-latest" },
        together: { url: "https://api.together.xyz/v1/chat/completions", key: env.TOGETHER_API_KEY, model: env.TOGETHER_TEXT_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
        cerebras: { url: "https://api.cerebras.ai/v1/chat/completions", key: env.CEREBRAS_API_KEY, model: env.CEREBRAS_TEXT_MODEL || "llama-3.3-70b" }
      }[name];
      const r = await fetch(map.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${map.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: map.model,
          messages: [{ role: "system", content: SYS }, { role: "user", content: prompt }],
          temperature: 0.6,
          response_format: { type: "json_object" }
        })
      });
      if (!r.ok) throw new Error(`${name}_http_` + r.status);
      const d = await r.json();
      return { text: d?.choices?.[0]?.message?.content || "", model: map.model };
    }
    default:
      throw new Error("unknown_provider: " + name);
  }
}
function looseJsonParse2(text) {
  let s = String(text || "").trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  try {
    return JSON.parse(s);
  } catch {
  }
  let out = "", inStr = false, escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = ch.charCodeAt(0);
    if (!inStr) {
      out += ch;
      if (ch === '"') inStr = true;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      out += ch;
      inStr = false;
      continue;
    }
    if (code < 32) {
      out += code === 10 ? "\\n" : code === 13 ? "\\r" : code === 9 ? "\\t" : "\\u" + code.toString(16).padStart(4, "0");
      continue;
    }
    out += ch;
  }
  return JSON.parse(out);
}
function sanitiseField(s, max) {
  return String(s || "").trim().slice(0, max);
}
var BRAND_DNA_KEYS, onRequestGet27, onRequestPost39, onRequestPut3;
var init_brand_dna = __esm({
  "api/admin/brand-dna.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_events();
    init_scrape();
    init_settings();
    init_ai();
    init_usage();
    BRAND_DNA_KEYS = [
      "brand_business_type",
      "brand_voice_tone",
      "brand_target_audience",
      "brand_key_themes",
      "brand_topics_to_avoid",
      "brand_service_area"
    ];
    __name(buildBrandPrompt, "buildBrandPrompt");
    __name(callForBrandDNA, "callForBrandDNA");
    __name(runProvider2, "runProvider");
    __name(looseJsonParse2, "looseJsonParse");
    __name(sanitiseField, "sanitiseField");
    onRequestGet27 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      if (!tenant || !tenant.activeProjectId) {
        return json(400, { error: "missing_or_invalid_project" });
      }
      let brandRow = null;
      if (env?.DB?.prepare) {
        brandRow = await env.DB.prepare(
          `SELECT business_type, tone, audience, key_themes, topics_to_avoid, service_area, cta
         FROM project_brands WHERE project_id = ? LIMIT 1`
        ).bind(tenant.activeProjectId).first().catch(() => null);
      }
      const projectRow = env?.DB?.prepare ? await env.DB.prepare(
        `SELECT logo_url, theme_color FROM projects WHERE id = ? LIMIT 1`
      ).bind(tenant.activeProjectId).first().catch(() => null) : null;
      const identity = {
        logo_url: projectRow?.logo_url || "",
        theme_color: projectRow?.theme_color || ""
      };
      if (brandRow) {
        return json(200, {
          ok: true,
          brand: {
            business_type: brandRow.business_type || "",
            voice_tone: brandRow.tone || "",
            target_audience: brandRow.audience || "",
            key_themes: brandRow.key_themes || "",
            topics_to_avoid: brandRow.topics_to_avoid || "",
            service_area: brandRow.service_area || "",
            cta: brandRow.cta || "",
            ...identity
          },
          project_id: tenant.activeProjectId,
          project_slug: tenant.activeProjectSlug
        });
      }
      const s = await loadSettings(env);
      return json(200, {
        ok: true,
        brand: {
          business_type: s.brand_business_type || "",
          voice_tone: s.brand_voice_tone || "",
          target_audience: s.brand_target_audience || "",
          key_themes: s.brand_key_themes || "",
          topics_to_avoid: s.brand_topics_to_avoid || "",
          service_area: s.brand_service_area || "",
          cta: s.brand_cta || "",
          source_url: s.brand_source_url || "",
          generated_at: s.brand_generated_at || "",
          ...identity
        },
        project_id: tenant.activeProjectId,
        project_slug: tenant.activeProjectSlug
      });
    }, "onRequestGet");
    onRequestPost39 = /* @__PURE__ */ __name(async ({ env, request, waitUntil }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      if (!tenant || !tenant.activeProjectId) {
        return json(400, { error: "missing_or_invalid_project" });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const url = String(body?.url || "").trim();
      if (!url) return json(400, { error: "missing_url" });
      let scrape;
      try {
        scrape = await scrapeUrl(url);
      } catch (e) {
        return json(502, { error: "scrape_failed", detail: String(e?.message || e) });
      }
      if (!scrape.body_text || scrape.body_text.length < 200) {
        return json(422, {
          error: "scrape_too_thin",
          detail: "The page returned < 200 chars of usable body content. Most likely a JS-only site. Try a different URL (e.g. /about) or paste content manually.",
          scrape_summary: { title: scrape.title, headings: scrape.headings, body_chars: scrape.body_text.length }
        });
      }
      const prompt = buildBrandPrompt(scrapeToPromptInput(scrape), {
        service_area: body.service_area || "",
        topics_to_avoid: body.topics_to_avoid || ""
      });
      let result;
      try {
        result = await callForBrandDNA(env, prompt, body.provider);
      } catch (e) {
        return json(502, { error: "generation_failed", detail: String(e?.message || e) });
      }
      const p = result.parsed || {};
      const brand2 = {
        business_type: sanitiseField(p.business_type, 2400),
        voice_tone: sanitiseField(p.voice_tone, 1200),
        target_audience: sanitiseField(p.target_audience, 2e3),
        key_themes: sanitiseField(p.key_themes, 1200),
        topics_to_avoid: sanitiseField(body.topics_to_avoid || p.topics_to_avoid, 600),
        service_area: sanitiseField(body.service_area || p.service_area, 400),
        cta: sanitiseField(body.cta || p.cta, 400),
        source_url: scrape.url,
        provider: result.provider
      };
      waitUntil(audit(env, "admin", "brand_dna_generate", null, { url: scrape.url, provider: result.provider, project_id: tenant.activeProjectId }));
      waitUntil(track(env, { event: "brand_dna_generated", projectId: tenant.activeProjectId, props: { provider: result.provider } }));
      return json(200, {
        ok: true,
        brand: brand2,
        project_id: tenant.activeProjectId,
        project_slug: tenant.activeProjectSlug,
        scrape_summary: {
          title: scrape.title,
          body_chars: scrape.body_text.length,
          h2_count: scrape.headings.h2.length
        }
      });
    }, "onRequestPost");
    onRequestPut3 = /* @__PURE__ */ __name(async ({ env, request, waitUntil }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      if (!tenant || !tenant.activeProjectId) {
        return json(400, { error: "missing_or_invalid_project" });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const business_type = sanitiseField(body.business_type, 2400);
      const voice_tone = sanitiseField(body.voice_tone || body.tone, 1200);
      const target_audience = sanitiseField(body.target_audience || body.audience, 2e3);
      const key_themes = sanitiseField(body.key_themes, 1200);
      const topics_to_avoid = sanitiseField(body.topics_to_avoid, 600);
      const service_area = sanitiseField(body.service_area, 400);
      const cta = sanitiseField(body.cta, 400);
      const source_url = sanitiseField(body.source_url, 400);
      const t = nowSec();
      if (env?.DB?.prepare) {
        await env.DB.prepare(
          `INSERT INTO project_brands (project_id, business_type, tone, audience, key_themes, topics_to_avoid, service_area, cta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         business_type = excluded.business_type,
         tone = excluded.tone,
         audience = excluded.audience,
         key_themes = excluded.key_themes,
         topics_to_avoid = excluded.topics_to_avoid,
         service_area = excluded.service_area,
         cta = excluded.cta,
         updated_at = excluded.updated_at`
        ).bind(
          tenant.activeProjectId,
          business_type,
          voice_tone,
          target_audience,
          key_themes,
          topics_to_avoid,
          service_area,
          cta,
          t,
          t
        ).run();
      }
      const hasLogo = Object.prototype.hasOwnProperty.call(body, "logo_url");
      const hasColor = Object.prototype.hasOwnProperty.call(body, "theme_color");
      if (hasLogo && body.logo_url) return json(400, { error: "logo_url_is_server_assigned" });
      let themeColor = null;
      if (hasColor) {
        const raw = String(body.theme_color || "").trim().toLowerCase();
        if (raw !== "") {
          if (!/^#[0-9a-f]{6}$/.test(raw)) return json(400, { error: "invalid_theme_color" });
          themeColor = raw;
        }
      }
      if (env?.DB?.prepare && (hasLogo || hasColor)) {
        const sets = [];
        const binds = [];
        if (hasLogo) {
          sets.push("logo_url = ?");
          binds.push(null);
        }
        if (hasColor) {
          sets.push("theme_color = ?");
          binds.push(themeColor);
        }
        sets.push("updated_at = ?");
        binds.push(t, tenant.activeProjectId);
        await env.DB.prepare(
          `UPDATE projects SET ${sets.join(", ")} WHERE id = ?`
        ).bind(...binds).run();
      }
      const fields = {
        brand_business_type: business_type,
        brand_voice_tone: voice_tone,
        brand_target_audience: target_audience,
        brand_key_themes: key_themes,
        brand_topics_to_avoid: topics_to_avoid,
        brand_service_area: service_area,
        brand_source_url: source_url,
        brand_generated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      for (const [k, v] of Object.entries(fields)) await setSetting(env, k, v);
      audit(env, "admin", "brand_dna_save", null, { source_url: fields.brand_source_url, project_id: tenant.activeProjectId });
      let planned = false;
      const skipAutoPlan = !!body?.skip_auto_plan;
      try {
        if (!skipAutoPlan && env?.DB?.prepare) {
          const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
          const future = await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM content_calendar
          WHERE scheduled_for >= ? AND status IN ('scheduled','generating','draft')
            AND (project_id = ? OR project_id IS NULL)`
          ).bind(today, tenant.activeProjectId).first().catch(() => ({ n: 0 }));
          if (!future || !future.n) {
            planned = true;
            const url = new URL(request.url);
            waitUntil(
              fetch(`${url.origin}/api/admin/calendar/plan`, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-project-id": tenant.activeProjectId,
                  cookie: request.headers.get("cookie") || ""
                },
                body: JSON.stringify({ days: 28, replace: false, project_id: tenant.activeProjectId })
              }).catch(() => {
              })
            );
          }
        }
      } catch {
      }
      return json(200, {
        ok: true,
        saved: BRAND_DNA_KEYS.length,
        planning: planned,
        project_id: tenant.activeProjectId,
        project_slug: tenant.activeProjectSlug
      });
    }, "onRequestPut");
  }
});

// api/admin/brand-filter-queue.js
function buildBatchPrompt(brand2, keywords) {
  return [
    "You are filtering an SEO keyword queue for a specific brand.",
    "For each keyword, decide whether the brand should write a landing page about it.",
    "",
    "# Brand context",
    brand2.brand_business_type || "(no business type set)",
    "",
    brand2.brand_target_audience ? "# Target audience\n" + brand2.brand_target_audience + "\n" : "",
    brand2.brand_key_themes ? "# Key themes this brand covers\n" + brand2.brand_key_themes + "\n" : "",
    brand2.brand_topics_to_avoid ? "# Topics to AVOID (these must always be drop)\n" + brand2.brand_topics_to_avoid + "\n" : "",
    brand2.brand_service_area ? "# Service area: " + brand2.brand_service_area : "",
    "",
    "# Rules",
    "- KEEP if the keyword fits the brand's business and target audience, even loosely.",
    "- DROP if the keyword is off-brand (unrelated industry), explicitly listed in topics-to-avoid,",
    "  targets a wrong service area, or has clearly different commercial intent.",
    "- When in doubt, KEEP \u2014 it's easier to delete a generated page than to miss a useful keyword.",
    "",
    "# Keywords to evaluate",
    ...keywords.map((k, i) => `${i + 1}. ${k}`),
    "",
    "# Output",
    "Return STRICT JSON, no prose, no markdown fences. One verdict per input keyword in the same order.",
    'Each verdict object: { "n": <1-based index>, "v": "keep" | "drop", "r": "<one short reason, \u2264 60 chars>" }',
    "{",
    '  "verdicts": [',
    '    { "n": 1, "v": "keep", "r": "in core service area" },',
    '    { "n": 2, "v": "drop", "r": "wrong industry" }',
    "  ]",
    "}"
  ].filter(Boolean).join("\n");
}
async function evaluateBatch(env, brand2, keywords) {
  const prompt = buildBatchPrompt(brand2, keywords);
  const overlayed = await vaultedEnv(env);
  const settings = await loadSettings(env);
  const available = (await listProviders(overlayed)).text;
  if (!available.length) throw new Error("no_text_providers_configured");
  const SYS = "You filter keyword queues for SEO. Strict JSON output only.";
  let raw = "";
  let usedProvider = "";
  let usedModel = "";
  for (const name of available) {
    try {
      const r = await callProvider(overlayed, name, SYS, prompt);
      raw = r.text;
      usedModel = r.model;
      usedProvider = name;
      break;
    } catch {
    }
  }
  if (!raw) throw new Error("all_providers_failed");
  await recordUsage(env, settings, {
    provider: usedProvider,
    model: usedModel,
    prompt_tokens: estimateTokens(SYS + prompt),
    completion_tokens: estimateTokens(raw),
    estimated: true,
    kind: "brand-filter",
    source: "admin-brand-filter"
  });
  const parsed = looseJsonParse3(raw);
  const verdicts = Array.isArray(parsed?.verdicts) ? parsed.verdicts : [];
  const out = keywords.map((kw, i) => {
    const v = verdicts.find((x) => Number(x?.n) === i + 1);
    return {
      keyword: kw,
      verdict: v?.v === "drop" ? "drop" : "keep",
      reason: String(v?.r || "").slice(0, 120)
    };
  });
  return { provider: usedProvider, verdicts: out };
}
async function callProvider(env, name, system, prompt) {
  switch (name) {
    case "workers-ai": {
      const model = env.WORKERS_AI_TEXT_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
      const r2 = await env.AI.run(model, {
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        max_tokens: 2048
      });
      const raw = r2?.response ?? r2?.result?.response ?? r2;
      let text = "";
      if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.verdicts)) {
        text = JSON.stringify(raw);
      } else {
        text = typeof raw === "string" ? raw : JSON.stringify(raw);
      }
      return { text, model };
    }
    case "openai": {
      const model = env.OPENAI_TEXT_MODEL || "gpt-5";
      const r2 = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          instructions: system,
          input: prompt,
          text: { format: { type: "json_object" } }
        })
      });
      if (!r2.ok) throw new Error("openai_http_" + r2.status);
      const d2 = await r2.json();
      if (d2.output_text) return { text: d2.output_text, model };
      for (const item2 of d2.output || []) {
        if (item2.type !== "message") continue;
        for (const c of item2.content || []) if (c.type === "output_text" && c.text) return { text: c.text, model };
      }
      throw new Error("openai_empty");
    }
    case "anthropic": {
      const model = env.ANTHROPIC_TEXT_MODEL || "claude-fable-5";
      const r2 = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system,
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (!r2.ok) throw new Error("anthropic_http_" + r2.status);
      const d2 = await r2.json();
      return { text: (d2.content || []).filter((c) => c.type === "text").map((c) => c.text).join(""), model };
    }
    case "gemini": {
      const model = env.GEMINI_TEXT_MODEL || "gemini-2.5-pro";
      const u = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      const r2 = await fetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.4 }
        })
      });
      if (!r2.ok) throw new Error("gemini_http_" + r2.status);
      const d2 = await r2.json();
      return { text: (d2.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join(""), model };
    }
    default:
      const map = {
        groq: { url: "https://api.groq.com/openai/v1/chat/completions", key: env.GROQ_API_KEY, model: env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile" },
        deepseek: { url: "https://api.deepseek.com/v1/chat/completions", key: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_TEXT_MODEL || "deepseek-chat" },
        mistral: { url: "https://api.mistral.ai/v1/chat/completions", key: env.MISTRAL_API_KEY, model: env.MISTRAL_TEXT_MODEL || "mistral-large-latest" },
        together: { url: "https://api.together.xyz/v1/chat/completions", key: env.TOGETHER_API_KEY, model: env.TOGETHER_TEXT_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
        cerebras: { url: "https://api.cerebras.ai/v1/chat/completions", key: env.CEREBRAS_API_KEY, model: env.CEREBRAS_TEXT_MODEL || "llama-3.3-70b" }
      }[name];
      if (!map) throw new Error("unknown_provider: " + name);
      const r = await fetch(map.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${map.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: map.model,
          messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
          temperature: 0.4,
          response_format: { type: "json_object" }
        })
      });
      if (!r.ok) throw new Error(`${name}_http_` + r.status);
      const d = await r.json();
      return { text: d?.choices?.[0]?.message?.content || "", model: map.model };
  }
}
function looseJsonParse3(text) {
  let s = String(text || "").trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  try {
    return JSON.parse(s);
  } catch {
  }
  let out = "", inStr = false, esc2 = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = ch.charCodeAt(0);
    if (!inStr) {
      out += ch;
      if (ch === '"') inStr = true;
      continue;
    }
    if (esc2) {
      out += ch;
      esc2 = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      esc2 = true;
      continue;
    }
    if (ch === '"') {
      out += ch;
      inStr = false;
      continue;
    }
    if (code < 32) {
      out += code === 10 ? "\\n" : code === 13 ? "\\r" : code === 9 ? "\\t" : "\\u" + code.toString(16).padStart(4, "0");
      continue;
    }
    out += ch;
  }
  return JSON.parse(out);
}
var DEFAULT_BATCH, MAX_BATCH, MAX_KEYWORDS, onRequestPost40;
var init_brand_filter_queue = __esm({
  "api/admin/brand-filter-queue.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_settings();
    init_ai();
    init_usage();
    DEFAULT_BATCH = 15;
    MAX_BATCH = 30;
    MAX_KEYWORDS = 500;
    __name(buildBatchPrompt, "buildBatchPrompt");
    __name(evaluateBatch, "evaluateBatch");
    __name(callProvider, "callProvider");
    __name(looseJsonParse3, "looseJsonParse");
    onRequestPost40 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body;
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      const dryRun = body?.dry_run === true;
      const batchSize = Math.min(MAX_BATCH, Math.max(5, parseInt(body?.batch_size, 10) || DEFAULT_BATCH));
      const settings = await loadSettings(env);
      if (!settings.brand_business_type && !settings.brand_target_audience && !settings.brand_key_themes) {
        return json(400, { error: "no_brand_dna", hint: "Set the brand DNA first (Brand DNA tab \u2192 Generate + Save)." });
      }
      const pending = await env.DB.prepare(
        `SELECT id, keyword FROM prog_keywords WHERE status='pending' ORDER BY priority DESC, created_at ASC LIMIT ?`
      ).bind(MAX_KEYWORDS).all();
      const rows = pending?.results || [];
      if (!rows.length) return json(200, { ok: true, evaluated: 0, kept: 0, dropped: 0, sample: [], dry_run: dryRun });
      const verdicts = [];
      let usedProvider = "";
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
              reason: r.verdicts[j].reason
            });
          }
        } catch (e) {
          for (const k of slice) verdicts.push({ id: k.id, keyword: k.keyword, verdict: "keep", reason: "batch_error: " + String(e?.message || e).slice(0, 60) });
        }
      }
      const drops = verdicts.filter((v) => v.verdict === "drop");
      const keeps = verdicts.length - drops.length;
      if (!dryRun && drops.length) {
        const t = nowSec();
        for (const d of drops) {
          await env.DB.prepare(
            `UPDATE prog_keywords SET status='failed', error=?, updated_at=? WHERE id=?`
          ).bind("brand_filter: " + d.reason, t, d.id).run();
        }
        audit(env, "admin", "brand_filter_queue", null, {
          provider: usedProvider,
          evaluated: verdicts.length,
          dropped: drops.length
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
        dropped_sample: drops.slice(0, 20)
      });
    }, "onRequestPost");
  }
});

// api/admin/calendar/index.js
function todayUtc2() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function isValidDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}
async function enrichWithPosts(env, rows) {
  const ids = rows.map((r2) => r2.post_id).filter(Boolean);
  if (!ids.length) return rows;
  const placeholders = ids.map(() => "?").join(",");
  const r = await env.DB.prepare(
    `SELECT id, slug, title, hero_image_key FROM blog_posts WHERE id IN (${placeholders})`
  ).bind(...ids).all().catch(() => ({ results: [] }));
  const byId = Object.fromEntries((r.results || []).map((p) => [p.id, p]));
  return rows.map((row) => ({
    ...row,
    post: row.post_id ? byId[row.post_id] || null : null
  }));
}
var VALID_STATUSES, onRequestGet28, onRequestPost41, onRequestPatch4, onRequestDelete5;
var init_calendar = __esm({
  "api/admin/calendar/index.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    VALID_STATUSES = ["scheduled", "generating", "draft", "published", "skipped"];
    __name(todayUtc2, "todayUtc");
    __name(isValidDate, "isValidDate");
    __name(enrichWithPosts, "enrichWithPosts");
    onRequestGet28 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      const activeProjectId = tenant?.activeProjectId || null;
      const url = new URL(request.url);
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      let q, args;
      const projectClause = activeProjectId ? `project_id = ?` : `1=1`;
      if (isValidDate(from) && isValidDate(to)) {
        q = `SELECT * FROM content_calendar WHERE scheduled_for >= ? AND scheduled_for <= ? AND ${projectClause} ORDER BY scheduled_for ASC, created_at ASC`;
        args = activeProjectId ? [from, to, activeProjectId] : [from, to];
      } else {
        q = `SELECT * FROM content_calendar WHERE ${projectClause} ORDER BY scheduled_for ASC LIMIT 120`;
        args = activeProjectId ? [activeProjectId] : [];
      }
      const r = await env.DB.prepare(q).bind(...args).all().catch(() => ({ results: [] }));
      const rows = await enrichWithPosts(env, r.results || []);
      return json(200, {
        ok: true,
        slots: rows,
        today: todayUtc2(),
        project_id: activeProjectId,
        project_slug: tenant?.activeProjectSlug || null
      });
    }, "onRequestGet");
    onRequestPost41 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      const activeProjectId = tenant?.activeProjectId || null;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const scheduled_for = String(body?.scheduled_for || "").trim();
      const title = String(body?.title || "").trim();
      if (!isValidDate(scheduled_for)) return json(400, { error: "bad_date", detail: "scheduled_for must be YYYY-MM-DD" });
      if (!title) return json(400, { error: "missing_title" });
      const id = newId();
      const now = nowSec();
      await env.DB.prepare(
        `INSERT INTO content_calendar
       (id, project_id, scheduled_for, title, primary_keyword, angle, status, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'scheduled', 'manual', ?, ?)`
      ).bind(
        id,
        activeProjectId,
        scheduled_for,
        title.slice(0, 200),
        String(body?.primary_keyword || "").trim().slice(0, 120) || null,
        String(body?.angle || "").trim().slice(0, 500) || null,
        now,
        now
      ).run();
      await audit(env, "admin", "calendar.create", id, JSON.stringify({ scheduled_for, title, project_id: activeProjectId }));
      return json(200, { ok: true, id, project_id: activeProjectId });
    }, "onRequestPost");
    onRequestPatch4 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const id = String(body?.id || "").trim();
      if (!id) return json(400, { error: "missing_id" });
      const sets = [];
      const args = [];
      if (body.scheduled_for !== void 0) {
        if (!isValidDate(body.scheduled_for)) return json(400, { error: "bad_date" });
        sets.push("scheduled_for = ?");
        args.push(body.scheduled_for);
      }
      if (body.title !== void 0) {
        const t = String(body.title || "").trim();
        if (!t) return json(400, { error: "empty_title" });
        sets.push("title = ?");
        args.push(t.slice(0, 200));
      }
      if (body.primary_keyword !== void 0) {
        sets.push("primary_keyword = ?");
        args.push(String(body.primary_keyword || "").trim().slice(0, 120) || null);
      }
      if (body.angle !== void 0) {
        sets.push("angle = ?");
        args.push(String(body.angle || "").trim().slice(0, 500) || null);
      }
      if (body.status !== void 0) {
        if (!VALID_STATUSES.includes(body.status)) return json(400, { error: "bad_status" });
        sets.push("status = ?");
        args.push(body.status);
      }
      if (!sets.length) return json(400, { error: "nothing_to_update" });
      sets.push("updated_at = ?");
      args.push(nowSec());
      args.push(id);
      const r = await env.DB.prepare(
        `UPDATE content_calendar SET ${sets.join(", ")} WHERE id = ?`
      ).bind(...args).run();
      if (!r?.meta?.changes) return json(404, { error: "not_found" });
      await audit(env, "admin", "calendar.update", id, "");
      return json(200, { ok: true });
    }, "onRequestPatch");
    onRequestDelete5 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const id = new URL(request.url).searchParams.get("id");
      if (!id) return json(400, { error: "missing_id" });
      const row = await env.DB.prepare(
        `SELECT status FROM content_calendar WHERE id = ?`
      ).bind(id).first().catch(() => null);
      if (!row) return json(404, { error: "not_found" });
      if (row.status === "published") return json(409, { error: "cannot_delete_published" });
      await env.DB.prepare(`DELETE FROM content_calendar WHERE id = ?`).bind(id).run();
      await audit(env, "admin", "calendar.delete", id, "");
      return json(200, { ok: true });
    }, "onRequestDelete");
  }
});

// api/admin/competitors/index.js
var onRequestGet29;
var init_competitors = __esm({
  "api/admin/competitors/index.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    onRequestGet29 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      if (!env?.DB) return json(500, { error: "no_db" });
      const url = new URL(request.url);
      const projectId = (url.searchParams.get("project_id") || "").trim();
      const keyword = (url.searchParams.get("keyword") || "").trim().slice(0, 200);
      if (!projectId) {
        const rows2 = await env.DB.prepare(
          `SELECT project_id, keyword, competitor_url, title, word_count, h2_count, link_count, created_at
         FROM competitor_snapshots ORDER BY created_at DESC LIMIT 20`
        ).all().catch(() => ({ results: [] }));
        return json(200, { ok: true, snapshots: rows2?.results || [] });
      }
      const rows = keyword ? await env.DB.prepare(
        `SELECT competitor_url, title, word_count, h2_count, link_count, created_at
           FROM competitor_snapshots WHERE project_id = ? AND keyword = ?
           ORDER BY created_at DESC LIMIT 20`
      ).bind(projectId, keyword).all().catch(() => ({ results: [] })) : await env.DB.prepare(
        `SELECT keyword, competitor_url, title, word_count, h2_count, link_count, created_at
           FROM competitor_snapshots WHERE project_id = ?
           ORDER BY created_at DESC LIMIT 20`
      ).bind(projectId).all().catch(() => ({ results: [] }));
      return json(200, { ok: true, snapshots: rows?.results || [] });
    }, "onRequestGet");
  }
});

// _lib/widget_render.js
function jsString(s) {
  return "'" + String(s ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(new RegExp("\u2028", "g"), "\\u2028").replace(new RegExp("\u2029", "g"), "\\u2029") + "'";
}
function imageUrlFor5(key, slug) {
  if (key) return "/image/" + key.split("/").map(encodeURIComponent).join("/");
  if (slug) return "/cover/" + encodeURIComponent(slug) + ".svg";
  return null;
}
function widgetBody({
  title,
  accent = "#0a0a0a",
  apiBase,
  embedId = "",
  perPage = 10,
  // Project slug this bundle is scoped to. Baked in by /api/embed/<id>
  // from the embed row so the widget shows that project's posts on any
  // host; a data-project attribute on the script tag overrides it.
  project = "",
  // Copy language. Baked from the project's `language` column and
  // re-applied at runtime from the /api/widget response, so one cached
  // bundle serves a Vietnamese project and an English one.
  lang = "vi",
  // True when the title is just a fallback. The bundle then prefers the
  // project's site_name from the API instead of the global site name.
  titleAuto = false,
  // theme: 'auto' | 'light' | 'dark' — controls prefers-color-scheme
  // override. The bundle still honours system preference when 'auto'.
  theme = "auto",
  // Optional full palette override. Any key not present falls back to
  // the defaults baked into the CSS.
  palette = {},
  // unused articles parameter still accepted for backwards compat.
  articles
  // eslint-disable-line no-unused-vars
}) {
  const themeCSS = theme === "dark" ? ".ps-blog{color-scheme:dark;}" : theme === "light" ? ".ps-blog{color-scheme:light;}" : "";
  const overrides = [
    palette.bg ? `--ps-bg:${palette.bg};` : "",
    palette.fg ? `--ps-fg:${palette.fg};` : "",
    palette.muted ? `--ps-muted:${palette.muted};` : "",
    palette.line ? `--ps-line:${palette.line};` : "",
    palette.accent ? `--ps-accent:${palette.accent};` : ""
  ].join("");
  const overridesCSS = overrides ? `.ps-blog{${overrides}}` : "";
  const css = `
${themeCSS}
${overridesCSS}
.ps-blog {
  --ps-accent: ${accent};
  --ps-bg: #ffffff;
  --ps-fg: #0a0a0a;
  --ps-muted: #6b6760;
  --ps-line: #e8e5dd;
  --ps-card: #fafaf7;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--ps-fg);
  max-width: 920px;
  margin: 0 auto;
  line-height: 1.55;
  --ps-radius: 12px;
}
@media (prefers-color-scheme: dark) {
  .ps-blog { --ps-bg: #0e0f12; --ps-fg: #f0eee8; --ps-muted: #a09c93; --ps-line: #262932; --ps-card: #15171c; }
}
.ps-blog { padding: 24px 0; }

.ps-blog-toolbar {
  display: flex; gap: 12px; align-items: center;
  margin: 0 0 18px;
  padding: 0 0 14px;
  border-bottom: 1px solid var(--ps-line);
  flex-wrap: wrap;
}
.ps-blog-head { display: flex; align-items: baseline; gap: 12px; flex: 1; min-width: 200px; }
.ps-blog-head h2 {
  font-size: 1.5rem; margin: 0; font-weight: 600;
  letter-spacing: -0.01em; color: var(--ps-fg);
}
.ps-blog-count { font-size: 0.82rem; color: var(--ps-muted); }
.ps-blog-search {
  flex: 1; min-width: 200px; max-width: 320px;
  padding: 8px 12px;
  background: var(--ps-card);
  border: 1px solid var(--ps-line);
  border-radius: 8px;
  color: var(--ps-fg); font: inherit; font-size: 0.92rem;
  outline: none;
  transition: border-color .12s;
}
.ps-blog-search:focus { border-color: var(--ps-accent); }
.ps-blog-back {
  background: transparent; border: 0; color: var(--ps-accent);
  font: inherit; font-size: 0.9rem; cursor: pointer; padding: 6px 0;
  display: none;
}
.ps-blog-back.show { display: inline-block; }

.ps-blog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}
.ps-blog-card {
  background: var(--ps-bg);
  border: 1px solid var(--ps-line);
  border-radius: var(--ps-radius);
  overflow: hidden;
  text-decoration: none; color: inherit;
  display: flex; flex-direction: column;
  transition: transform .12s ease, border-color .12s;
}
.ps-blog-card:hover { transform: translateY(-2px); border-color: var(--ps-accent); }
.ps-blog-card.is-focused {
  border-color: var(--ps-accent);
  box-shadow: 0 0 0 2px var(--ps-accent);
}
.ps-blog-card-imgwrap {
  position: relative;
  width: 100%; aspect-ratio: 1.7;
  background: var(--ps-card);
}
.ps-blog-card img {
  display: block; width: 100%; height: 100%;
  object-fit: cover; background: var(--ps-card);
}
.ps-blog-card .ps-card-body {
  padding: 14px 16px 16px;
  display: flex; flex-direction: column; gap: 6px; flex: 1;
}
.ps-blog-card h3 {
  font-size: 1rem; margin: 0; letter-spacing: -0.005em;
  line-height: 1.3; color: var(--ps-fg);
}
.ps-blog-card p {
  font-size: 0.88rem; margin: 0; color: var(--ps-muted);
  line-height: 1.5; flex: 1;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  overflow: hidden;
}
.ps-blog-card .ps-card-date {
  font-size: 0.74rem; color: var(--ps-muted);
  text-transform: uppercase; letter-spacing: 0.04em;
  margin-top: auto;
}

.ps-blog-pager {
  margin-top: 20px;
  display: flex; gap: 6px; align-items: center; justify-content: center;
  flex-wrap: wrap;
}
.ps-blog-pager button {
  background: var(--ps-card);
  border: 1px solid var(--ps-line);
  color: var(--ps-fg);
  border-radius: 6px;
  padding: 6px 10px;
  font: inherit; font-size: 0.85rem;
  cursor: pointer;
  min-width: 32px;
}
.ps-blog-pager button:hover { border-color: var(--ps-accent); color: var(--ps-accent); }
.ps-blog-pager button.is-current { background: var(--ps-accent); color: var(--ps-bg); border-color: var(--ps-accent); }
.ps-blog-pager button:disabled { opacity: 0.4; cursor: not-allowed; }
.ps-blog-pager-info { font-size: 0.78rem; color: var(--ps-muted); margin-left: 8px; }

.ps-blog-footer {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--ps-line);
  font-size: 0.78rem;
  color: var(--ps-muted);
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px; flex-wrap: wrap;
}
.ps-blog-footer a { color: var(--ps-accent); text-decoration: none; }
.ps-blog-footer a:hover { text-decoration: underline; }

.ps-blog-article { max-width: 720px; margin: 0 auto; }
.ps-blog-article-meta {
  display: flex; align-items: center; gap: 12px;
  font-size: 0.85rem; color: var(--ps-muted);
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.ps-blog-article-share {
  background: var(--ps-card); border: 1px solid var(--ps-line);
  color: var(--ps-fg); padding: 4px 10px; border-radius: 6px;
  font: inherit; font-size: 0.8rem; cursor: pointer;
  margin-left: auto;
}
.ps-blog-article-share:hover { border-color: var(--ps-accent); color: var(--ps-accent); }
.ps-blog-article h1 {
  font-size: 1.9rem; line-height: 1.15; margin: 0 0 10px;
  font-weight: 600; letter-spacing: -0.015em; color: var(--ps-fg);
}
.ps-blog-article img.ps-art-hero {
  display: block; width: 100%; aspect-ratio: 1.9; object-fit: cover;
  border-radius: var(--ps-radius); margin: 0 0 24px; background: var(--ps-card);
}
.ps-blog-article .ps-art-body { font-size: 1.02rem; line-height: 1.72; color: var(--ps-fg); }
.ps-blog-article .ps-art-body h2 { font-size: 1.3rem; margin: 28px 0 10px; letter-spacing: -0.005em; }
.ps-blog-article .ps-art-body h3 { font-size: 1.1rem; margin: 24px 0 10px; }
.ps-blog-article .ps-art-body p  { margin: 0 0 16px; }
.ps-blog-article .ps-art-body ul, .ps-blog-article .ps-art-body ol { padding-left: 22px; margin: 0 0 16px; }
.ps-blog-article .ps-art-body li { margin-bottom: 4px; }
.ps-blog-article .ps-art-body a  { color: var(--ps-accent); text-decoration: underline; text-underline-offset: 2px; }
.ps-blog-article .ps-art-body strong { color: var(--ps-fg); font-weight: 600; }
.ps-blog-article .ps-art-body code { background: rgba(0,0,0,0.05); padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }
@media (prefers-color-scheme: dark) {
  .ps-blog-article .ps-art-body code { background: rgba(255,255,255,0.06); }
}
.ps-blog-article .ps-art-body blockquote {
  border-left: 3px solid var(--ps-accent);
  padding: 4px 16px; margin: 0 0 16px 0;
  color: var(--ps-muted); font-style: italic;
}

.ps-blog-skel {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;
}
.ps-blog-skel-card {
  background: var(--ps-card);
  border: 1px solid var(--ps-line);
  border-radius: var(--ps-radius);
  overflow: hidden;
  animation: ps-skel-pulse 1.2s ease-in-out infinite;
}
.ps-blog-skel-card-img { aspect-ratio: 1.7; background: var(--ps-line); }
.ps-blog-skel-card-body { padding: 14px 16px 16px; }
.ps-blog-skel-line { background: var(--ps-line); border-radius: 4px; height: 14px; margin: 4px 0; }
.ps-blog-skel-line.short { width: 50%; }
@keyframes ps-skel-pulse { 0%,100%{opacity:1;} 50%{opacity:.5;} }

.ps-blog-empty {
  padding: 48px 20px; text-align: center;
  color: var(--ps-muted); font-style: italic;
}
.ps-blog-empty button {
  margin-top: 12px;
  background: transparent; border: 1px solid var(--ps-line);
  color: var(--ps-accent); padding: 6px 14px; border-radius: 6px;
  font: inherit; cursor: pointer;
}

.ps-blog-kbd {
  display: inline-block;
  background: var(--ps-card); border: 1px solid var(--ps-line);
  border-bottom-width: 2px;
  border-radius: 4px; padding: 0 5px;
  font-family: ui-monospace, Menlo, monospace; font-size: 0.78em;
  color: var(--ps-muted);
}
`;
  return `(function(){
'use strict';
var PS_TITLE = ${jsString(title)};
var PS_API = ${jsString(apiBase)};
var PS_EMBED_ID = ${jsString(embedId)};
var PS_PER_PAGE = ${Number.isFinite(perPage) ? perPage : 10};
var PS_TITLE_AUTO = ${titleAuto ? "true" : "false"};
var PS_LANG = ${jsString(lang)};
var PS_T_MAP = {
  vi: {
    loading_post: '\u0110ang t\u1EA3i b\xE0i vi\u1EBFt\u2026',
    failed: 'Kh\xF4ng t\u1EA3i \u0111\u01B0\u1EE3c b\xE0i vi\u1EBFt. H\xE3y t\u1EA3i l\u1EA1i trang.',
    back: '\u2190 Xem t\u1EA5t c\u1EA3 b\xE0i',
    empty_site: 'Ch\u01B0a c\xF3 b\xE0i vi\u1EBFt n\xE0o.',
    empty_search: 'Kh\xF4ng c\xF3 b\xE0i vi\u1EBFt n\xE0o kh\u1EDBp t\u1EEB kho\xE1.',
    no_more: 'B\u1EA1n \u0111\xE3 xem h\u1EBFt b\xE0i.',
    search_placeholder: 'T\xECm b\xE0i vi\u1EBFt\u2026',
    share: 'Chia s\u1EBB',
    copied: '\u0110\xE3 sao ch\xE9p li\xEAn k\u1EBFt',
    view_site: 'Xem to\xE0n b\u1ED9 website \u2192',
    page_of: 'Trang',
  },
  en: {
    loading_post: 'Loading article\u2026',
    failed: 'Could not load this article. Try refreshing the page.',
    back: '\u2190 Back to all posts',
    empty_site: 'No posts yet.',
    empty_search: 'No posts match your search.',
    no_more: 'You\\'ve reached the end.',
    search_placeholder: 'Search posts\u2026',
    share: 'Share',
    copied: 'Link copied',
    view_site: 'View full site \u2192',
    page_of: 'Page',
  }
};
if (!PS_T_MAP[PS_LANG]) PS_LANG = 'vi';
var PS_T = PS_T_MAP[PS_LANG];

// Resolve the mount node. data-target on the <script> tag wins, so
// several embeds can coexist on one page with distinct container ids;
// #ps-blog stays the default for hand-written legacy snippets.
var PS_PROJECT = ${jsString(project)};
var PS_TARGET_SEL = '';
try {
  var psScript = document.currentScript || (function () {
    var all = document.getElementsByTagName('script');
    return all[all.length - 1];
  })();
  if (psScript && psScript.dataset) {
    PS_PROJECT = String(psScript.dataset.project || '').trim() || PS_PROJECT;
    PS_TARGET_SEL = String(psScript.dataset.target || '').trim();
  }
} catch (e) {}

var container = null;
if (PS_TARGET_SEL) {
  try { container = document.querySelector(PS_TARGET_SEL); } catch (e) { container = null; }
}
if (!container) container = document.getElementById('ps-blog');
if (!container) {
  console.warn('pages-seo embed: no mount element found (data-target="' + PS_TARGET_SEL + '" or #ps-blog)');
  return;
}

// \u2500\u2500 srcdoc detection \u2500\u2500
// Some sandboxed iframes (Notion embeds, etc.) load us via srcdoc.
// In that case popstate / history don't behave the way we expect,
// so we treat clicks on cards as "open in a new tab" rather than
// inline.
var inSrcdoc = false;
try {
  inSrcdoc = (window.location.href === 'about:srcdoc') ||
             (window.self !== window.top && window.location.origin === 'null');
} catch (e) { inSrcdoc = true; }

var docOrig = { title: document.title, desc: '' };
var descMeta = document.querySelector('meta[name="description"]');
if (descMeta) docOrig.desc = descMeta.getAttribute('content') || '';

// Optional host hook: window.psBlog.onOpen(post) is called whenever
// a post is opened inline. Useful for analytics.
function fireOnOpen(post) {
  try {
    var h = window.psBlog && window.psBlog.onOpen;
    if (typeof h === 'function') h(post);
  } catch (e) { /* host hook must not break the widget */ }
}

// \u2500\u2500 routing \u2500\u2500
// We use hash routing (#post=slug) so we don't collide with the
// host page's query string. Old ?post= links are still honoured on
// initial load for backwards compat.
function readRoute() {
  var slug = '';
  try {
    var hash = window.location.hash.replace(/^#/, '');
    var hp = new URLSearchParams(hash);
    slug = hp.get('post') || '';
    if (!slug) {
      var qp = new URL(window.location.href).searchParams;
      slug = qp.get('post') || '';
    }
  } catch (e) {}
  return slug;
}
function setRoute(slug) {
  if (inSrcdoc) return;
  try {
    var newHash = slug ? '#post=' + encodeURIComponent(slug) : '';
    if (window.location.hash !== newHash) {
      // Use replaceState so the back button takes us out of the
      // widget rather than cycling through every visited post.
      history.replaceState({}, '', window.location.pathname + window.location.search + newHash);
    }
  } catch (e) {}
}

// \u2500\u2500 DOM helpers \u2500\u2500
function make(tag, cls, txt) {
  var el = document.createElement(tag);
  if (cls) el.className = cls;
  if (txt != null) el.textContent = txt;
  return el;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

// Inject the CSS once, even if multiple widget instances exist on
// the page.
var styleId = 'ps-blog-styles';
if (!document.getElementById(styleId)) {
  var style = document.createElement('style');
  style.id = styleId;
  style.textContent = ${jsString(css)};
  document.head.appendChild(style);
}

// \u2500\u2500 build skeleton \u2500\u2500
clear(container);
var root = make('div', 'ps-blog');

var toolbar = make('div', 'ps-blog-toolbar');
var head = make('div', 'ps-blog-head');
var h2 = make('h2', null, PS_TITLE);
var count = make('span', 'ps-blog-count');
head.appendChild(h2); head.appendChild(count);
var search = document.createElement('input');
search.type = 'search';
search.className = 'ps-blog-search';
search.placeholder = PS_T.search_placeholder;
search.setAttribute('aria-label', PS_T.search_placeholder);
var back = document.createElement('button');
back.type = 'button'; back.className = 'ps-blog-back'; back.textContent = PS_T.back;
toolbar.appendChild(head);
toolbar.appendChild(search);
toolbar.appendChild(back);
root.appendChild(toolbar);

var content = document.createElement('div');
root.appendChild(content);

var footer = document.createElement('div');
footer.className = 'ps-blog-footer';
footer.appendChild(make('span', null, ''));
var siteLink = document.createElement('a');
siteLink.href = PS_API + '/blog'; siteLink.target = '_blank'; siteLink.rel = 'noopener';
siteLink.textContent = PS_T.view_site;
footer.appendChild(siteLink);
root.appendChild(footer);

container.appendChild(root);

// \u2500\u2500 state \u2500\u2500
var state = {
  q: '',
  page: 1,
  total: 0,
  totalPages: 1,
  posts: [],
  inArticle: false,
  focusedIdx: 0,
  scrollY: 0,                // remember list scroll so we restore on back
  listScrollEl: null,         // window or a scroll parent (host iframe etc)
  loading: false,
};

function paramsString() {
  var p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.page > 1) p.set('page', String(state.page));
  p.set('per_page', String(PS_PER_PAGE));
  return p.toString();
}

// \u2500\u2500 views \u2500\u2500
function renderSkeleton() {
  clear(content);
  var skel = make('div', 'ps-blog-skel');
  for (var i = 0; i < Math.min(PS_PER_PAGE, 6); i++) {
    var c = make('div', 'ps-blog-skel-card');
    c.appendChild(make('div', 'ps-blog-skel-card-img'));
    var b = make('div', 'ps-blog-skel-card-body');
    b.appendChild(make('div', 'ps-blog-skel-line'));
    b.appendChild(make('div', 'ps-blog-skel-line short'));
    c.appendChild(b);
    skel.appendChild(c);
  }
  content.appendChild(skel);
}

function renderList() {
  clear(content);
  if (!state.posts.length) {
    var empty = make('div', 'ps-blog-empty');
    empty.textContent = state.q ? PS_T.empty_search : PS_T.empty_site;
    if (state.q) {
      var clearBtn = document.createElement('button');
      clearBtn.textContent = 'Clear search';
      clearBtn.onclick = function () { search.value = ''; state.q = ''; state.page = 1; load(); search.focus(); };
      empty.appendChild(clearBtn);
    }
    content.appendChild(empty);
    return;
  }
  var grid = make('div', 'ps-blog-grid');
  for (var i = 0; i < state.posts.length; i++) {
    grid.appendChild(buildCard(state.posts[i], i));
  }
  content.appendChild(grid);
  if (state.totalPages > 1) renderPager();
  // Restore focus to the previously focused card after re-render
  // (e.g. when paging via keyboard).
  highlightFocused();
}

function buildCard(p, idx) {
  var card = document.createElement('a');
  card.className = 'ps-blog-card';
  card.href = PS_API + '/blog/' + encodeURIComponent(p.slug);
  card.setAttribute('data-idx', String(idx));
  card.setAttribute('data-slug', p.slug);
  if (inSrcdoc) { card.target = '_blank'; card.rel = 'noopener'; }

  if (p.image) {
    var imgwrap = make('div', 'ps-blog-card-imgwrap');
    var img = document.createElement('img');
    img.src = PS_API + p.image;
    img.alt = p.title || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    imgwrap.appendChild(img);
    card.appendChild(imgwrap);
  }

  var body = make('div', 'ps-card-body');
  body.appendChild(make('h3', null, p.title || ''));
  if (p.excerpt) body.appendChild(make('p', null, p.excerpt));
  body.appendChild(make('div', 'ps-card-date', p.date || ''));
  card.appendChild(body);

  card.addEventListener('click', function (e) {
    if (inSrcdoc) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    openArticle(p.slug, true);
  });

  return card;
}

function renderPager() {
  var pager = make('div', 'ps-blog-pager');
  var prev = document.createElement('button');
  prev.textContent = '\u2190'; prev.title = 'Previous page';
  prev.disabled = state.page <= 1;
  prev.onclick = function () { goPage(state.page - 1); };
  pager.appendChild(prev);

  // Page-number window: show first, last, current \xB1 2, ellipsis
  // gaps. Keeps the bar compact for sites with 50+ pages.
  var win = pageWindow(state.page, state.totalPages, 2);
  var lastShown = 0;
  for (var i = 0; i < win.length; i++) {
    var n = win[i];
    if (n - lastShown > 1) {
      pager.appendChild(make('span', 'ps-blog-pager-info', '\u2026'));
    }
    var btn = document.createElement('button');
    btn.textContent = String(n);
    if (n === state.page) btn.className = 'is-current';
    btn.onclick = (function (nn) { return function () { goPage(nn); }; })(n);
    pager.appendChild(btn);
    lastShown = n;
  }

  var next = document.createElement('button');
  next.textContent = '\u2192'; next.title = 'Next page';
  next.disabled = state.page >= state.totalPages;
  next.onclick = function () { goPage(state.page + 1); };
  pager.appendChild(next);

  var info = make('span', 'ps-blog-pager-info',
    PS_T.page_of + ' ' + state.page + ' of ' + state.totalPages + ' \xB7 ' + state.total + ' posts');
  pager.appendChild(info);

  content.appendChild(pager);
}

function pageWindow(page, total, halfWidth) {
  var set = new Set();
  set.add(1); set.add(total);
  for (var i = page - halfWidth; i <= page + halfWidth; i++) {
    if (i >= 1 && i <= total) set.add(i);
  }
  return Array.from(set).sort(function (a, b) { return a - b; });
}

function goPage(n) {
  n = Math.max(1, Math.min(state.totalPages, n));
  if (n === state.page) return;
  state.page = n;
  state.focusedIdx = 0;
  load();
  // Scroll the widget into view if it's offscreen; don't scroll
  // the page if the widget is already visible.
  try {
    var rect = container.getBoundingClientRect();
    if (rect.top < 0 || rect.top > window.innerHeight) {
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (e) {}
}

function highlightFocused() {
  var cards = content.querySelectorAll('.ps-blog-card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].classList.toggle('is-focused', i === state.focusedIdx);
  }
}

function updateCount() {
  if (state.total === 0) count.textContent = '';
  else count.textContent = state.q
    ? '(' + state.total + ' result' + (state.total === 1 ? '' : 's') + ')'
    : '(' + state.total + ' post' + (state.total === 1 ? '' : 's') + ')';
}

// \u2500\u2500 network \u2500\u2500
function load() {
  if (state.loading) return;
  state.loading = true;
  renderSkeleton();
  var url = PS_API + '/api/widget?' + paramsString();
  if (PS_PROJECT) url += '&project=' + encodeURIComponent(PS_PROJECT);
  if (PS_EMBED_ID) url += '&embed=' + encodeURIComponent(PS_EMBED_ID);
  fetch(url, { credentials: 'omit' })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (data) {
      state.loading = false;
      if (data.language && PS_T_MAP[data.language] && data.language !== PS_LANG) {
        PS_LANG = data.language;
        PS_T = PS_T_MAP[PS_LANG];
        search.placeholder = PS_T.search_placeholder;
        search.setAttribute('aria-label', PS_T.search_placeholder);
        back.textContent = PS_T.back;
      }
      if (PS_TITLE_AUTO && data.site_name) {
        h2.textContent = data.site_name + ' \xB7 Blog';
      }
      if (data.theme_color) {
        container.style.setProperty('--ps-accent', data.theme_color);
      }
      state.posts = data.posts || [];
      state.total = data.total || 0;
      state.totalPages = data.total_pages || 1;
      if (state.page > state.totalPages) state.page = state.totalPages;
      updateCount();
      renderList();
    })
    .catch(function () {
      state.loading = false;
      clear(content);
      var empty = make('div', 'ps-blog-empty', PS_T.failed);
      content.appendChild(empty);
    });
}

// \u2500\u2500 article view \u2500\u2500
function openArticle(slug, push) {
  state.inArticle = true;
  state.scrollY = window.pageYOffset || document.documentElement.scrollTop;
  back.classList.add('show');
  if (push) setRoute(slug);
  search.style.display = 'none';

  clear(content);
  // Article skeleton.
  var skel = make('div', 'ps-blog-skel');
  for (var i = 0; i < 1; i++) {
    var c = make('div', 'ps-blog-skel-card');
    c.appendChild(make('div', 'ps-blog-skel-card-img'));
    var b = make('div', 'ps-blog-skel-card-body');
    for (var j = 0; j < 6; j++) b.appendChild(make('div', 'ps-blog-skel-line' + (j === 5 ? ' short' : '')));
    c.appendChild(b);
    skel.appendChild(c);
  }
  content.appendChild(skel);

  fetch(PS_API + '/api/public/post/' + encodeURIComponent(slug), { credentials: 'omit' })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (data) {
      if (!data || !data.post) return Promise.reject('no_post');
      var post = data.post;
      if (!inSrcdoc) {
        document.title = post.title + ' \xB7 ' + docOrig.title;
        if (descMeta) descMeta.setAttribute('content', post.meta_description || docOrig.desc);
      }
      fireOnOpen(post);

      clear(content);
      var art = make('article', 'ps-blog-article');
      art.appendChild(make('h1', null, post.title || ''));

      var meta = make('div', 'ps-blog-article-meta');
      var pubDate = (state.posts.find(function (x) { return x.slug === slug; }) || {}).date || '';
      meta.appendChild(make('span', null, pubDate));
      var shareBtn = document.createElement('button');
      shareBtn.className = 'ps-blog-article-share';
      shareBtn.type = 'button';
      shareBtn.textContent = PS_T.share;
      shareBtn.onclick = function () { sharePost(post, slug, shareBtn); };
      meta.appendChild(shareBtn);
      art.appendChild(meta);

      if (post.hero_image_url) {
        var hi = document.createElement('img');
        hi.className = 'ps-art-hero';
        hi.src = PS_API + post.hero_image_url;
        hi.alt = post.title || '';
        hi.loading = 'lazy'; hi.decoding = 'async';
        art.appendChild(hi);
      }

      var bodyEl = make('div', 'ps-art-body');
      // Server-side markdown.js produces sanitised HTML \u2014 that's
      // the documented contract. We open external links in a new
      // tab so the host page doesn't lose context.
      bodyEl.innerHTML = String(post.body_html || '');
      var links = bodyEl.querySelectorAll('a');
      for (var k = 0; k < links.length; k++) {
        links[k].target = '_blank';
        links[k].rel = 'noopener noreferrer';
      }
      // Make sure scripts in body_html \u2014 if any slipped through \u2014
      // never execute. Defence in depth on top of server sanitise.
      var scripts = bodyEl.querySelectorAll('script');
      for (var s = 0; s < scripts.length; s++) scripts[s].remove();
      art.appendChild(bodyEl);

      content.appendChild(art);
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
    })
    .catch(function () {
      clear(content);
      content.appendChild(make('div', 'ps-blog-empty', PS_T.failed));
    });
}

function sharePost(post, slug, btn) {
  var shareUrl = PS_API + '/blog/' + encodeURIComponent(slug);
  if (navigator.share) {
    navigator.share({
      title: post.title || '',
      text: post.meta_description || '',
      url: shareUrl,
    }).catch(function () { /* user dismissed */ });
    return;
  }
  // Fallback \u2014 copy URL to clipboard.
  try {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl);
      var originalText = btn.textContent;
      btn.textContent = PS_T.copied;
      setTimeout(function () { btn.textContent = originalText; }, 1500);
    } else {
      window.prompt('Copy this URL:', shareUrl);
    }
  } catch (e) {
    window.prompt('Copy this URL:', shareUrl);
  }
}

function returnToList() {
  state.inArticle = false;
  back.classList.remove('show');
  search.style.display = '';
  setRoute('');
  if (!inSrcdoc) {
    document.title = docOrig.title;
    if (descMeta && docOrig.desc) descMeta.setAttribute('content', docOrig.desc);
  }
  renderList();
  try { window.scrollTo(0, state.scrollY); } catch (e) {}
}

back.addEventListener('click', function (e) {
  e.preventDefault();
  returnToList();
});

// \u2500\u2500 search \u2500\u2500
var searchTimer = null;
search.addEventListener('input', function () {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(function () {
    state.q = search.value.trim();
    state.page = 1;
    state.focusedIdx = 0;
    load();
  }, 250);
});

// \u2500\u2500 keyboard nav \u2500\u2500
function isTextField(el) {
  if (!el) return false;
  var tag = (el.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
document.addEventListener('keydown', function (e) {
  // Only act when the widget is visible AND the user isn't typing
  // somewhere else on the page.
  if (state.inArticle) {
    if (e.key === 'Escape') { returnToList(); e.preventDefault(); }
    return;
  }
  if (isTextField(e.target) && e.target !== search) return;
  if (e.key === '/' && e.target !== search) {
    e.preventDefault(); search.focus(); search.select();
    return;
  }
  if (e.target === search) {
    if (e.key === 'Escape') { search.value = ''; state.q = ''; state.page = 1; load(); }
    if (e.key === 'Enter') { e.preventDefault(); search.blur(); }
    return;
  }
  if (e.key === 'j' || e.key === 'ArrowDown') {
    if (state.focusedIdx < state.posts.length - 1) state.focusedIdx++;
    highlightFocused();
    e.preventDefault();
  } else if (e.key === 'k' || e.key === 'ArrowUp') {
    if (state.focusedIdx > 0) state.focusedIdx--;
    highlightFocused();
    e.preventDefault();
  } else if (e.key === 'Enter') {
    var p = state.posts[state.focusedIdx];
    if (p) openArticle(p.slug, true);
  } else if (e.key === 'ArrowLeft' && state.page > 1) {
    goPage(state.page - 1); e.preventDefault();
  } else if (e.key === 'ArrowRight' && state.page < state.totalPages) {
    goPage(state.page + 1); e.preventDefault();
  }
});

// \u2500\u2500 popstate (back button) \u2500\u2500
window.addEventListener('hashchange', function () {
  var slug = readRoute();
  if (slug) {
    if (!state.inArticle) openArticle(slug, false);
  } else if (state.inArticle) {
    returnToList();
  }
});

// \u2500\u2500 boot \u2500\u2500
var initialSlug = readRoute();
load();
if (initialSlug) {
  // Wait until first list load finishes so excerpt + image are
  // available for the article meta.
  setTimeout(function () { openArticle(initialSlug, false); }, 100);
}

// Expose minimal API on window so hosts can integrate.
window.psBlog = window.psBlog || {};
window.psBlog.refresh = load;
window.psBlog.openPost = function (slug) { openArticle(slug, true); };
window.psBlog.state = state;
})();`;
}
var init_widget_render = __esm({
  "_lib/widget_render.js"() {
    init_functionsRoutes_0_09583509623234443();
    __name(jsString, "jsString");
    __name(imageUrlFor5, "imageUrlFor");
    __name(widgetBody, "widgetBody");
  }
});

// _lib/embed_settings.js
function hexOrNull(v) {
  const m = String(v || "").trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  return m ? "#" + m[1].toLowerCase() : null;
}
function sanitizeEmbedSettings(settings) {
  const out = {};
  if (!settings || typeof settings !== "object") return out;
  if (settings.title) out.title = String(settings.title).slice(0, 100);
  const accent = hexOrNull(settings.accent);
  if (accent) out.accent = accent;
  const perPage = parseInt(settings.per_page ?? settings.limit, 10);
  if (Number.isFinite(perPage) && perPage > 0 && perPage <= 50) out.per_page = perPage;
  if (EMBED_THEMES.includes(settings.theme)) out.theme = settings.theme;
  if (settings.palette && typeof settings.palette === "object") {
    const pal = {};
    for (const k of EMBED_PALETTE_KEYS) {
      const c = hexOrNull(settings.palette[k]);
      if (c) pal[k] = c;
    }
    if (Object.keys(pal).length) out.palette = pal;
  }
  return out;
}
function snippetFor(origin, id) {
  const containerId = `ps-blog-${String(id).slice(0, 8)}`;
  return `<div id="${containerId}"></div>
<script src="${origin}/api/embed/${id}" data-target="#${containerId}" defer><\/script>`;
}
function embedWidgetOptions({ settings = {}, embed: embed2 = {}, origin = "" }) {
  const perPage = Math.min(50, Math.max(
    1,
    parseInt(settings.per_page, 10) || parseInt(settings.limit, 10) || 10
  ));
  const title = String(settings.title || embed2.name || "Blog").slice(0, 100);
  const accent = String(settings.accent || embed2.project_theme_color || "#0a0a0a").slice(0, 24);
  const theme = EMBED_THEMES.includes(settings.theme) ? settings.theme : "auto";
  const palette = sanitizeEmbedSettings({ palette: settings.palette }).palette || {};
  return {
    title,
    accent,
    theme,
    palette,
    perPage,
    apiBase: origin,
    embedId: embed2.id || "",
    project: String(embed2.project_slug || ""),
    lang: String(embed2.project_language || "vi"),
    titleAuto: !settings.title
  };
}
var EMBED_THEMES, EMBED_PALETTE_KEYS;
var init_embed_settings = __esm({
  "_lib/embed_settings.js"() {
    init_functionsRoutes_0_09583509623234443();
    EMBED_THEMES = ["auto", "light", "dark"];
    EMBED_PALETTE_KEYS = ["bg", "fg", "muted", "line", "accent"];
    __name(hexOrNull, "hexOrNull");
    __name(sanitizeEmbedSettings, "sanitizeEmbedSettings");
    __name(snippetFor, "snippetFor");
    __name(embedWidgetOptions, "embedWidgetOptions");
  }
});

// api/admin/embed-preview.js
function html(js) {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>Embed preview</title>
<style>
  html, body { margin: 0; padding: 0; }
  body { background: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  @media (prefers-color-scheme: dark) { body { background: #0e0f12; } }
  .wrap { padding: 20px; }
</style>
</head>
<body>
<div class="wrap"><div id="ps-blog"></div></div>
<script>${js}<\/script>
</body>
</html>`;
}
var onRequestGet30;
var init_embed_preview = __esm({
  "api/admin/embed-preview.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_auth();
    init_widget_render();
    init_embed_settings();
    __name(html, "html");
    onRequestGet30 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      if (!env?.DB) return new Response("no_db", { status: 500 });
      const url = new URL(request.url);
      const q = url.searchParams;
      const id = String(q.get("id") || "").trim();
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      let embed2 = null;
      if (id && /^[a-zA-Z0-9_-]{6,64}$/.test(id)) {
        embed2 = await env.DB.prepare(
          `SELECT e.id, e.name, e.settings_json, e.project_id,
              p.slug AS project_slug, p.language AS project_language,
              p.theme_color AS project_theme_color
         FROM blog_embeds e LEFT JOIN projects p ON p.id = e.project_id
        WHERE e.id = ? LIMIT 1`
        ).bind(id).first().catch(() => null);
      }
      const projectId = embed2?.project_id || tenant?.activeProjectId || null;
      if (!embed2 && projectId) {
        const p = await env.DB.prepare(
          `SELECT slug AS project_slug, language AS project_language, theme_color AS project_theme_color
         FROM projects WHERE id = ? LIMIT 1`
        ).bind(projectId).first().catch(() => null);
        embed2 = { id: "", name: String(q.get("name") || "Blog"), ...p || {} };
      }
      let saved = {};
      if (embed2?.settings_json) {
        try {
          saved = JSON.parse(embed2.settings_json) || {};
        } catch {
        }
      }
      const paletteFromQuery = {
        bg: q.get("bg"),
        fg: q.get("fg"),
        muted: q.get("muted"),
        line: q.get("line"),
        accent: q.get("palette_accent")
      };
      const hasPaletteQuery = Object.values(paletteFromQuery).some(Boolean);
      const merged = sanitizeEmbedSettings({
        title: q.get("title") ?? saved.title,
        accent: q.get("accent") ?? saved.accent,
        per_page: q.get("per_page") ?? saved.per_page ?? saved.limit,
        theme: q.get("theme") ?? saved.theme,
        palette: hasPaletteQuery ? paletteFromQuery : saved.palette
      });
      const js = widgetBody({
        title: merged.title || embed2?.name || "Blog",
        accent: merged.accent || embed2?.project_theme_color || "#0a0a0a",
        apiBase: `${url.protocol}//${url.host}`,
        embedId: id || "",
        perPage: merged.per_page || 10,
        theme: merged.theme || "auto",
        palette: merged.palette || {},
        project: String(embed2?.project_slug || ""),
        lang: String(embed2?.project_language || "vi"),
        titleAuto: !merged.title
      });
      return new Response(html(js), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }, "onRequestGet");
  }
});

// api/admin/embeds.js
function newEmbedId() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let b64 = btoa(String.fromCharCode.apply(null, Array.from(bytes)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function safeSettings(settings) {
  const j = JSON.stringify(sanitizeEmbedSettings(settings));
  if (j.length > SETTINGS_MAX_BYTES) throw new Error("settings_too_large");
  return j;
}
var SETTINGS_MAX_BYTES, onRequestGet31, onRequestPost42, onRequestPut4, onRequestDelete6;
var init_embeds = __esm({
  "api/admin/embeds.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_embed_settings();
    SETTINGS_MAX_BYTES = 8 * 1024;
    __name(newEmbedId, "newEmbedId");
    __name(safeSettings, "safeSettings");
    onRequestGet31 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      const r = await env.DB.prepare(
        `SELECT id, name, settings_json, created_at, updated_at
       FROM blog_embeds WHERE (project_id = ? OR project_id IS NULL)
       ORDER BY updated_at DESC LIMIT 100`
      ).bind(pid).all();
      const url = new URL(request.url);
      const origin = `${url.protocol}//${url.host}`;
      const embeds = (r?.results || []).map((e) => {
        let settings = {};
        try {
          settings = JSON.parse(e.settings_json || "{}");
        } catch {
        }
        return {
          ...e,
          settings,
          embed_url: `${origin}/api/embed/${e.id}`,
          preview_url: `${origin}/api/embed/${e.id}`,
          snippet: snippetFor(origin, e.id),
          settings_json: void 0
        };
      });
      return json(200, { ok: true, embeds });
    }, "onRequestGet");
    onRequestPost42 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const name = String(body?.name || "").trim().slice(0, 120);
      if (!name) return json(400, { error: "missing_name" });
      let settings_json;
      try {
        settings_json = safeSettings(body?.settings);
      } catch (e) {
        return json(400, { error: String(e.message || e) });
      }
      const id = newEmbedId();
      const t = nowSec();
      await env.DB.prepare(
        `INSERT INTO blog_embeds (id, name, settings_json, project_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(id, name, settings_json, pid, t, t).run();
      audit(env, "admin", "embed_create", id, { name, project_id: pid });
      return json(200, { ok: true, id });
    }, "onRequestPost");
    onRequestPut4 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      const url = new URL(request.url);
      const id = String(url.searchParams.get("id") || "").trim();
      if (!id) return json(400, { error: "missing_id" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const sets = [];
      const binds = [];
      if (body.name != null) {
        const n = String(body.name).trim().slice(0, 120);
        if (!n) return json(400, { error: "empty_name" });
        sets.push("name=?");
        binds.push(n);
      }
      if (body.settings != null) {
        try {
          sets.push("settings_json=?");
          binds.push(safeSettings(body.settings));
        } catch (e) {
          return json(400, { error: String(e.message || e) });
        }
      }
      if (!sets.length) return json(400, { error: "no_updates" });
      sets.push("updated_at=?");
      binds.push(nowSec());
      binds.push(id, pid);
      const r = await env.DB.prepare(
        `UPDATE blog_embeds SET ${sets.join(", ")}
      WHERE id = ? AND (project_id = ? OR project_id IS NULL)`
      ).bind(...binds).run();
      audit(env, "admin", "embed_update", id, {});
      return json(200, { ok: true, changed: r?.meta?.changes || 0 });
    }, "onRequestPut");
    onRequestDelete6 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      const url = new URL(request.url);
      const id = String(url.searchParams.get("id") || "").trim();
      if (!id) return json(400, { error: "missing_id" });
      await env.DB.prepare(
        "DELETE FROM blog_embeds WHERE id = ? AND (project_id = ? OR project_id IS NULL)"
      ).bind(id, pid).run();
      audit(env, "admin", "embed_delete", id, {});
      return json(200, { ok: true });
    }, "onRequestDelete");
  }
});

// api/admin/google-search-console/index.js
var onRequestGet32, onRequestPost43, onRequestDelete7;
var init_google_search_console = __esm({
  "api/admin/google-search-console/index.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_secret_vault();
    init_settings();
    init_google_indexing();
    onRequestGet32 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const s = await loadSettings(env);
      const desc = await describeConfig(env);
      return json(200, {
        ...desc,
        explicit_property: String(s.google_sc_property || "").trim(),
        use_indexing_api: String(s.google_use_indexing_api || "") === "1"
      });
    }, "onRequestGet");
    onRequestPost43 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      let savedJson = false;
      if (body.sa_json !== void 0) {
        const raw = String(body.sa_json || "").trim();
        if (!raw) {
          await setVaultSecret(env, "GOOGLE_SA_JSON", "");
          savedJson = true;
        } else {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            return json(400, { error: "invalid_json", detail: "sa_json is not valid JSON" });
          }
          if (!parsed.client_email || !parsed.private_key) {
            return json(400, { error: "invalid_service_account", detail: "JSON is missing client_email and/or private_key \u2014 paste the full service-account file from Google Cloud." });
          }
          await setVaultSecret(env, "GOOGLE_SA_JSON", raw);
          savedJson = true;
        }
      }
      if (body.property !== void 0) {
        await setSetting(env, "google_sc_property", String(body.property || "").trim().slice(0, 200));
      }
      if (body.use_indexing_api !== void 0) {
        await setSetting(env, "google_use_indexing_api", body.use_indexing_api ? "1" : "");
      }
      audit(env, "admin", "gsc_settings_save", null, {
        saved_json: savedJson,
        changed_property: body.property !== void 0,
        changed_use_indexing_api: body.use_indexing_api !== void 0
      });
      return json(200, { ok: true });
    }, "onRequestPost");
    onRequestDelete7 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      await setVaultSecret(env, "GOOGLE_SA_JSON", "");
      await setSetting(env, "google_sc_property", "");
      await setSetting(env, "google_use_indexing_api", "");
      audit(env, "admin", "gsc_settings_clear", null, {});
      return json(200, { ok: true, cleared: true });
    }, "onRequestDelete");
  }
});

// api/admin/indexnow-ping.js
function extractLocs(xml2) {
  const out = [];
  const rx = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = rx.exec(xml2)) !== null) {
    const u = m[1].trim();
    if (u) out.push(u);
  }
  return out;
}
var onRequestPost44;
var init_indexnow_ping = __esm({
  "api/admin/indexnow-ping.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_indexnow();
    init_project_scope();
    __name(extractLocs, "extractLocs");
    onRequestPost44 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      let body = {};
      try {
        body = await request.json();
      } catch {
      }
      const base = await publicBaseFor(env, tenant?.activeProjectId || null, request);
      const host = new URL(base).hostname;
      let urls;
      let source;
      if (Array.isArray(body?.urls) && body.urls.length) {
        urls = body.urls;
        source = "caller_supplied";
      } else {
        try {
          const r2 = await fetch(`${base}/sitemap-pages.xml`);
          if (!r2.ok) throw new Error("sitemap_http_" + r2.status);
          const text = await r2.text();
          urls = extractLocs(text).filter((u) => u.includes(host));
          source = "sitemap";
        } catch {
          urls = [];
          source = "failed";
        }
      }
      if (!urls.length) return json(400, { error: "no_urls", source, host });
      const r = await pingIndexNow(env, urls, request, host);
      audit(env, "admin", "indexnow_ping", tenant?.activeProjectId || null, { url_count: urls.length, host, ok: r.ok, rate_limited: r.rate_limited, source });
      const meta = { urls, url_count: urls.length, source, host };
      if (r.rate_limited) {
        return json(200, { ok: true, rate_limited: true, status: r.status, message: "IndexNow rate limited (too many pings). Bing will crawl naturally.", ...meta });
      }
      if (r.error) return json(502, { ok: false, error: r.error, ...meta });
      return json(r.ok ? 200 : 502, { ok: r.ok, status: r.status, ...meta });
    }, "onRequestPost");
  }
});

// _lib/insights.js
function isoWeek(ts) {
  const d = new Date(ts * 1e3);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const fDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fDayNum + 3);
  const week = 1 + Math.round((t - firstThursday) / (7 * DAY * 1e3));
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)) * 10) / 10;
}
function weekOffset(createdAt, publishedAt) {
  return Math.floor((publishedAt - createdAt) / (7 * DAY));
}
async function computeInsights(env, { maxProjects = 2e3 } = {}) {
  const now = Math.floor(Date.now() / 1e3);
  const projects = (await env.DB.prepare(
    `SELECT id, slug, name, status, created_at, custom_domain
       FROM projects ORDER BY created_at ASC LIMIT ?`
  ).bind(maxProjects).all().catch(() => ({ results: [] }))).results || [];
  const posts = (await env.DB.prepare(
    `SELECT project_id, published_at FROM blog_posts
      WHERE status = 'published' AND project_id IS NOT NULL
      ORDER BY published_at ASC LIMIT 50000`
  ).all().catch(() => ({ results: [] }))).results || [];
  const brandRows = (await env.DB.prepare(
    "SELECT project_id FROM project_brands WHERE business_type IS NOT NULL OR audience IS NOT NULL"
  ).all().catch(() => ({ results: [] }))).results || [];
  const calRows = (await env.DB.prepare(
    "SELECT DISTINCT project_id FROM content_calendar WHERE project_id IS NOT NULL"
  ).all().catch(() => ({ results: [] }))).results || [];
  const channelRows = (await env.DB.prepare(
    "SELECT project_id FROM project_publishing_configs WHERE publisher_type != 'internal_d1' AND publisher_type IS NOT NULL"
  ).all().catch(() => ({ results: [] }))).results || [];
  const byProject = /* @__PURE__ */ new Map();
  for (const p of posts) {
    if (!byProject.has(p.project_id)) byProject.set(p.project_id, []);
    byProject.get(p.project_id).push(p.published_at);
  }
  const hasBrand = new Set(brandRows.map((r) => r.project_id));
  const hasCal = new Set(calRows.map((r) => r.project_id));
  const hasChannel = new Set(channelRows.map((r) => r.project_id));
  const total = projects.length;
  const withBrand = projects.filter((p) => hasBrand.has(p.id)).length;
  const withCal = projects.filter((p) => hasCal.has(p.id)).length;
  const withPost = projects.filter((p) => (byProject.get(p.id) || []).length > 0).length;
  const activeW2 = projects.filter((p) => (byProject.get(p.id) || []).some((t) => weekOffset(p.created_at, t) >= 1)).length;
  const activeW4 = projects.filter((p) => (byProject.get(p.id) || []).some((t) => weekOffset(p.created_at, t) >= 3)).length;
  const withChannel = projects.filter((p) => hasChannel.has(p.id)).length;
  const oldestAgeDays = projects.length ? Math.floor((now - Math.min(...projects.map((p) => p.created_at))) / DAY) : 0;
  const pct = /* @__PURE__ */ __name((n) => total ? Math.round(n / total * 1e3) / 10 : 0, "pct");
  const funnel = [
    { key: "signup", label: "\u0110\u0103ng k\xFD d\u1EF1 \xE1n", count: total, pct: 100 },
    { key: "brand_dna", label: "C\xF3 Brand DNA", count: withBrand, pct: pct(withBrand) },
    { key: "schedule", label: "C\xF3 l\u1ECBch n\u1ED9i dung", count: withCal, pct: pct(withCal) },
    { key: "first_post", label: "Xu\u1EA5t b\u1EA3n b\xE0i \u0111\u1EA7u ti\xEAn", count: withPost, pct: pct(withPost) },
    { key: "channel", label: "K\u1EBFt n\u1ED1i k\xEAnh MXH", count: withChannel, pct: pct(withChannel) },
    { key: "week2", label: "C\xF2n ho\u1EA1t \u0111\u1ED9ng tu\u1EA7n 2", count: activeW2, pct: pct(activeW2), measurable_after_days: 14, measurable: oldestAgeDays >= 14 },
    { key: "week4", label: "C\xF2n ho\u1EA1t \u0111\u1ED9ng tu\u1EA7n 4", count: activeW4, pct: pct(activeW4), measurable_after_days: 28, measurable: oldestAgeDays >= 28 }
  ];
  const ttfp = [];
  for (const p of projects) {
    const times = byProject.get(p.id);
    if (!times?.length) continue;
    const hours = Math.round((times[0] - p.created_at) / 3600 * 10) / 10;
    if (hours >= 0) ttfp.push(hours);
  }
  ttfp.sort((a, b) => a - b);
  const timeToFirstPost = {
    n: ttfp.length,
    median_hours: percentile(ttfp, 0.5),
    p25_hours: percentile(ttfp, 0.25),
    p75_hours: percentile(ttfp, 0.75),
    under_24h: ttfp.filter((h) => h < 24).length,
    under_72h: ttfp.filter((h) => h < 72).length
  };
  const cohorts = /* @__PURE__ */ new Map();
  for (const p of projects) {
    const wk = isoWeek(p.created_at);
    if (!cohorts.has(wk)) cohorts.set(wk, { cohort: wk, size: 0, w1: 0, w2: 0, w3: 0, w4: 0, posts: 0, first_ts: p.created_at });
    const c = cohorts.get(wk);
    c.size++;
    c.first_ts = Math.min(c.first_ts, p.created_at);
    const times = byProject.get(p.id) || [];
    c.posts += times.length;
    for (const t of times) {
      const off = weekOffset(p.created_at, t);
      if (off === 0) c.w1++;
      else if (off === 1) c.w2++;
      else if (off === 2) c.w3++;
      else if (off === 3) c.w4++;
    }
  }
  const retention = [...cohorts.values()].sort((a, b) => b.cohort.localeCompare(a.cohort)).slice(0, 12).map((c) => {
    const weeks_elapsed = Math.floor((now - c.first_ts) / (7 * DAY));
    return {
      cohort: c.cohort,
      size: c.size,
      posts: c.posts,
      w1: c.w1,
      w2: c.w2,
      w3: c.w3,
      w4: c.w4,
      weeks_elapsed,
      w1_pct: c.size ? Math.round(c.w1 / c.size * 100) : 0,
      w2_pct: c.size ? Math.round(c.w2 / c.size * 100) : 0,
      w3_pct: c.size ? Math.round(c.w3 / c.size * 100) : 0,
      w4_pct: c.size ? Math.round(c.w4 / c.size * 100) : 0
    };
  });
  const weeks = /* @__PURE__ */ new Map();
  for (const p of posts) {
    const wk = isoWeek(p.published_at);
    if (!weeks.has(wk)) weeks.set(wk, { week: wk, posts: 0, projects: /* @__PURE__ */ new Set() });
    const w = weeks.get(wk);
    w.posts++;
    w.projects.add(p.project_id);
  }
  const weekly = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-12).map((w) => ({ week: w.week, posts: w.posts, projects: w.projects.size }));
  const projectRows = projects.map((p) => {
    const times = byProject.get(p.id) || [];
    const first = times[0] || null;
    const last = times.length ? times[times.length - 1] : null;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      status: p.status,
      created_at: p.created_at,
      age_days: Math.floor((now - p.created_at) / DAY),
      posts: times.length,
      first_post_hours: first ? Math.round((first - p.created_at) / 3600 * 10) / 10 : null,
      days_since_last_post: last ? Math.floor((now - last) / DAY) : null,
      has_brand_dna: hasBrand.has(p.id),
      has_schedule: hasCal.has(p.id),
      has_channel: hasChannel.has(p.id),
      // "healthy" = published something in the last 7 days.
      healthy: !!last && now - last < 7 * DAY
    };
  }).sort((a, b) => b.posts - a.posts);
  const eventRows = (await env.DB.prepare(
    `SELECT event, COUNT(*) AS n, MAX(created_at) AS last_at
       FROM product_events GROUP BY event ORDER BY n DESC`
  ).all().catch(() => ({ results: [] }))).results || [];
  const totalPosts = posts.length;
  const healthy = projectRows.filter((p) => p.healthy).length;
  return {
    generated_at: now,
    totals: {
      projects: total,
      projects_active: projects.filter((p) => p.status === "active").length,
      projects_healthy: healthy,
      published_posts: totalPosts,
      posts_per_project: total ? Math.round(totalPosts / total * 10) / 10 : 0,
      events_recorded: eventRows.reduce((a, e) => a + e.n, 0),
      // How long the oldest project has existed. Drives the "not measurable
      // yet" flags so a young install doesn't report week-2 retention as 0%.
      oldest_project_age_days: oldestAgeDays
    },
    funnel,
    time_to_first_post: timeToFirstPost,
    retention,
    weekly,
    projects: projectRows,
    events: eventRows.map((e) => ({ event: e.event, count: e.n, last_at: e.last_at }))
  };
}
var DAY;
var init_insights = __esm({
  "_lib/insights.js"() {
    init_functionsRoutes_0_09583509623234443();
    DAY = 86400;
    __name(isoWeek, "isoWeek");
    __name(percentile, "percentile");
    __name(weekOffset, "weekOffset");
    __name(computeInsights, "computeInsights");
  }
});

// api/admin/insights.js
var onRequestGet33;
var init_insights2 = __esm({
  "api/admin/insights.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_insights();
    onRequestGet33 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await requireSuperAdmin(env, request);
      if (gate.error) return gate.error;
      if (!env?.DB) return json(500, { error: "no_db" });
      const url = new URL(request.url);
      const includeProjects = url.searchParams.get("projects") !== "0";
      const data = await computeInsights(env);
      if (!includeProjects) delete data.projects;
      return json(200, { ok: true, ...data });
    }, "onRequestGet");
  }
});

// api/admin/login.js
function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
var MAX_FAILS, LOCKOUT_SEC, onRequestPost45;
var init_login = __esm({
  "api/admin/login.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_passwords();
    init_admin_token();
    MAX_FAILS = 5;
    LOCKOUT_SEC = 60 * 60;
    __name(clientIp, "clientIp");
    onRequestPost45 = /* @__PURE__ */ __name(async ({ env, request }) => {
      if (!env?.DB) return json(500, { error: "no_db" });
      const adminToken = await getAdminToken(env);
      if (!adminToken) {
        return json(503, { error: "config_incomplete", detail: "ADMIN_TOKEN secret required (used as the session-signing key)." });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const email = String(body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      if (!email || !password) return json(400, { error: "missing_fields" });
      const ip = clientIp(request);
      const rlKey = `${email}|${ip}`;
      const now = nowSec();
      const rl = await env.DB.prepare(
        `SELECT failures, locked_until FROM login_attempts WHERE key = ? LIMIT 1`
      ).bind(rlKey).first().catch(() => null);
      if (rl?.locked_until && rl.locked_until > now) {
        return json(429, {
          error: "locked",
          retry_after_sec: rl.locked_until - now
        });
      }
      const user = await env.DB.prepare(
        `SELECT id, email, password_hash, password_salt FROM users WHERE email = ? LIMIT 1`
      ).bind(email).first().catch(() => null);
      const ok = user && await verifyPassword(password, user.password_hash, user.password_salt);
      if (!ok) {
        const fails = (rl?.failures || 0) + 1;
        const lockedUntil = fails >= MAX_FAILS ? now + LOCKOUT_SEC : null;
        await env.DB.prepare(
          `INSERT INTO login_attempts (key, failures, locked_until, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         failures = excluded.failures,
         locked_until = excluded.locked_until,
         updated_at = excluded.updated_at`
        ).bind(rlKey, fails, lockedUntil, now).run().catch(() => null);
        return json(401, { error: "invalid_credentials" });
      }
      await env.DB.prepare(
        `DELETE FROM login_attempts WHERE key = ?`
      ).bind(rlKey).run().catch(() => null);
      const sessionId = newSessionId();
      const expires = sessionExpirySec();
      await env.DB.prepare(
        `INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?)`
      ).bind(
        sessionId,
        user.id,
        now,
        expires,
        (request.headers.get("user-agent") || "").slice(0, 400)
      ).run();
      await env.DB.prepare(
        `UPDATE users SET last_login_at = ? WHERE id = ?`
      ).bind(now, user.id).run().catch(() => null);
      const token = await signSession(sessionId, await getAdminToken(env));
      const maxAge = expires - now;
      return new Response(JSON.stringify({ ok: true, email: user.email }), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "set-cookie": buildSessionCookie(token, maxAge),
          "cache-control": "no-store"
        }
      });
    }, "onRequestPost");
  }
});

// api/admin/logout.js
var onRequestPost46;
var init_logout = __esm({
  "api/admin/logout.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_passwords();
    init_admin_token();
    onRequestPost46 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const raw = readCookie(request, SESSION_COOKIE);
      const token = env?.DB ? await getAdminToken(env) : "";
      if (raw && token) {
        const sessionId = await verifySessionToken(raw, token);
        if (sessionId) {
          await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run().catch(() => null);
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "set-cookie": buildSessionCookieClear(),
          "cache-control": "no-store"
        }
      });
    }, "onRequestPost");
  }
});

// _lib/schema.js
var SCHEMA_SQL;
var init_schema = __esm({
  "_lib/schema.js"() {
    init_functionsRoutes_0_09583509623234443();
    SCHEMA_SQL = `
-- pages-seo: D1 schema.
--
-- Apply with:  wrangler d1 execute pages-seo --remote --file=schema/init.sql
--
-- Five concepts:
--   blog_posts        \u2014 daily-cron-generated long-form blog posts.
--   blog_jobs         \u2014 multi-step generation state, persists between
--                       the 4 short HTTP calls that produce one post.
--                       Cloudflare Pages Functions kill background work
--                       aggressively, so we serialise via the DB instead.
--   blog_topic_usage  \u2014 dedupes the topic pool (60-day cooldown).
--   prog_pages        \u2014 programmatic landing pages, one per keyword.
--   prog_keywords     \u2014 the imported keyword list with status per row
--                       (pending / done / failed). Lets a big batch run
--                       across multiple cron windows without losing state.

CREATE TABLE IF NOT EXISTS blog_posts (
  id              TEXT PRIMARY KEY,                  -- 16-byte hex
  slug            TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  meta_description TEXT NOT NULL,
  body_markdown   TEXT NOT NULL,
  hero_image_key  TEXT,                              -- R2 object key (nullable)
  hero_image_alt  TEXT,
  status          TEXT NOT NULL DEFAULT 'published', -- published | review | hidden
  topic_seed      TEXT,
  keywords        TEXT,                              -- comma-separated long-tails
  ai_provider     TEXT,                              -- 'workers-ai' | 'openai'
  created_at      INTEGER NOT NULL,
  published_at    INTEGER NOT NULL,
  hidden_at       INTEGER,
  -- AI similarity dedup (v1.0.5+). JSON-encoded float array from
  -- @cf/baai/bge-base-en-v1.5 (768-d). Nullable so existing rows
  -- keep working; new posts are embedded at publish time.
  embedding       TEXT,
  embedding_model TEXT,
  embedding_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_blog_status_published_at
  ON blog_posts(status, published_at DESC);

-- Slug renames (v1.0.5+). Maps old_slug -> new_slug; the /blog/<slug>
-- handler does a 301 redirect when it finds a row here. Lets us clean
-- up bad AI-generated slugs without breaking inbound links.
CREATE TABLE IF NOT EXISTS blog_post_redirects (
  old_slug   TEXT PRIMARY KEY,
  new_slug   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS blog_jobs (
  id              TEXT PRIMARY KEY,
  status          TEXT NOT NULL DEFAULT 'created',   -- created | text_done | image_done | published | failed
  topic_key       TEXT,
  topic_angle     TEXT,
  -- /text outputs
  primary_query   TEXT,
  title           TEXT,
  slug            TEXT,
  meta_description TEXT,
  body_markdown   TEXT,
  keywords        TEXT,
  hero_image_prompt TEXT,
  hero_image_alt  TEXT,
  -- /image output
  hero_image_key  TEXT,
  -- /publish output
  blog_post_id    TEXT,
  -- any step's failure
  error           TEXT,
  ai_provider     TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blog_jobs_status_created
  ON blog_jobs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS blog_topic_usage (
  topic_key       TEXT PRIMARY KEY,
  last_used_at    INTEGER NOT NULL,
  times_used      INTEGER NOT NULL DEFAULT 1
);

-- Programmatic-SEO landing pages \u2014 one per imported keyword.
CREATE TABLE IF NOT EXISTS prog_pages (
  id              TEXT PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,
  keyword         TEXT NOT NULL,                     -- the source keyword phrase
  title           TEXT NOT NULL,
  meta_description TEXT NOT NULL,
  body_markdown   TEXT NOT NULL,
  hero_image_key  TEXT,
  hero_image_alt  TEXT,
  status          TEXT NOT NULL DEFAULT 'published', -- published | hidden
  ai_provider     TEXT,
  created_at      INTEGER NOT NULL,
  published_at    INTEGER NOT NULL,
  hidden_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_prog_status
  ON prog_pages(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_prog_keyword
  ON prog_pages(keyword);

-- The uploaded keyword pool. Cron processes pending rows in priority
-- order. \`score\`/\`intent\` come from the heuristic scorer; \`priority\`
-- can be overridden by the admin (defaults to score). \`canonical\` is
-- the normalised form used for dedupe.
CREATE TABLE IF NOT EXISTS prog_keywords (
  id              TEXT PRIMARY KEY,
  keyword         TEXT UNIQUE NOT NULL,
  canonical       TEXT,                              -- normalised form for dedupe
  intent          TEXT,                              -- transactional|commercial|informational|navigational|junk
  score           INTEGER NOT NULL DEFAULT 0,        -- 0-100, from scorer
  priority        INTEGER NOT NULL DEFAULT 0,        -- admin-overridable; defaults to score
  status          TEXT NOT NULL DEFAULT 'pending',   -- pending | processing | done | failed
  page_id         TEXT,                              -- links to prog_pages when done
  error           TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prog_kw_status
  ON prog_keywords(status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_prog_kw_canonical
  ON prog_keywords(canonical);

-- Brand/voice/SEO settings. Single-row key/value store the admin UI
-- edits. The blog + programmatic generation chain reads these and
-- injects them into the LLM prompt so every post inherits the same
-- voice, tone, audience, and CTA without re-passing per-request.
-- Common keys:
--   site_cta         \u2014 call-to-action injected into the closing paragraph
--   site_tone        \u2014 voice description (e.g. "warm but authoritative\u2026")
--   site_audience    \u2014 who you're writing for
--   site_signup_url  \u2014 overrides /signup alias
--   site_pricing_url \u2014 overrides /pricing alias
--   site_contact_url \u2014 overrides /contact alias
--   article_min_words, article_max_words   \u2014 length targets (numeric strings)
--   prog_min_words, prog_max_words         \u2014 length targets for prog pages
--   default_ai_provider                    \u2014 preferred provider name
CREATE TABLE IF NOT EXISTS settings (
  key             TEXT PRIMARY KEY,
  value           TEXT,
  updated_at      INTEGER NOT NULL
);

-- Cover image editor: uploaded background/logo assets, plus saved
-- composition templates.
--
-- Workflow:
--   1. Admin uploads background images + logos via /api/admin/cover/upload.
--      The bytes go to R2; one row per asset in cover_assets.
--   2. Admin builds a template in the canvas editor: chooses a bg + logo,
--      adds text layers, drags everything into place. Saves to
--      cover_templates with a JSON spec (see functions/_lib/cover_render.js
--      for the spec shape).
--   3. When generating a blog post, the admin can pick a saved template;
--      the editor renders the final PNG client-side from { title } +
--      template, and uploads it as the post's hero_image_key.
CREATE TABLE IF NOT EXISTS cover_assets (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,                 -- background | logo
  r2_key          TEXT NOT NULL,                 -- R2 object key
  original_name   TEXT,
  mime            TEXT,
  size_bytes      INTEGER NOT NULL DEFAULT 0,
  width           INTEGER,                       -- optional, client-supplied
  height          INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cover_assets_kind ON cover_assets(kind, created_at DESC);

CREATE TABLE IF NOT EXISTS cover_templates (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  is_default      INTEGER NOT NULL DEFAULT 0,    -- 1 = use for new posts unless overridden
  spec_json       TEXT NOT NULL,                 -- JSON: { width, height, layers: [...] }
  thumb_r2_key    TEXT,                          -- optional preview PNG
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cover_templates_updated ON cover_templates(updated_at DESC);

-- Per-call AI usage log. Every LLM/image generation writes one row.
-- We compute cost client-side from a per-provider price table (see
-- functions/_lib/usage.js + the pricing_* keys in \`settings\`). Workers
-- AI rows have estimated tokens (no API returns them) and cost 0 on
-- the free tier.
CREATE TABLE IF NOT EXISTS ai_usage (
  id                TEXT PRIMARY KEY,                -- 16-byte hex
  provider          TEXT NOT NULL,                   -- workers-ai | openai | anthropic | \u2026
  model             TEXT,                            -- specific model variant
  kind              TEXT NOT NULL,                   -- text | image | brand-dna | brand-filter
  source            TEXT,                            -- blog | prog | preview | admin | cron
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  estimated         INTEGER NOT NULL DEFAULT 0,      -- 1 = tokens are estimates (no API)
  cost_usd          REAL    NOT NULL DEFAULT 0,
  ok                INTEGER NOT NULL DEFAULT 1,      -- 0 = error, 1 = success
  error             TEXT,
  created_at        INTEGER NOT NULL                 -- unix seconds
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider_created ON ai_usage(provider, created_at DESC);

-- Admin user accounts. Email + password (PBKDF2-SHA256 with a
-- per-user salt, 200k iterations). The original ADMIN_TOKEN bearer
-- header still works as a recovery / cron credential, so even if the
-- users table is empty or corrupted you can always reach the admin.
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,                -- 16-byte hex
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT NOT NULL,                   -- base64
  password_salt   TEXT NOT NULL,                   -- base64, 16 bytes
  created_at      INTEGER NOT NULL,
  last_login_at   INTEGER
);

-- Active login sessions. One row per signed-in browser session. We
-- store the token's id (not the token itself); the cookie value is
-- \`<id>.<hmac>\` and the HMAC is verified using ADMIN_TOKEN as the
-- shared secret. Lets us revoke individual sessions without rotating
-- the master token.
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,                -- 16-byte hex
  user_id         TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  user_agent      TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, expires_at);

-- Rate limit table: tracks login attempts per email + IP combo so
-- brute-force attempts hit a wall after 5 failures.
CREATE TABLE IF NOT EXISTS login_attempts (
  key             TEXT PRIMARY KEY,                -- email + '|' + ip (or 'ip:' + ip)
  failures        INTEGER NOT NULL DEFAULT 0,
  locked_until    INTEGER,                          -- unix seconds; null when unlocked
  updated_at      INTEGER NOT NULL
);

-- Encrypted-at-rest API key vault. Used when the admin wants to set
-- LLM provider keys from the dashboard rather than via
-- \`wrangler pages secret put\`. Ciphertext is AES-GCM with a key derived
-- from ADMIN_TOKEN. See functions/_lib/secret_vault.js.
CREATE TABLE IF NOT EXISTS secrets_vault (
  key_name        TEXT PRIMARY KEY,                  -- e.g. OPENAI_API_KEY
  ciphertext      TEXT NOT NULL,                     -- base64(IV || ciphertext-with-tag)
  updated_at      INTEGER NOT NULL
);

-- Embeddable blog widget definitions. Each row is one shareable
-- widget \u2014 admin gets a \`<script src="/api/embed/<id>" defer><\/script>\`
-- snippet they can paste on any external site. The widget renders the
-- toolkit's published blog posts inside a \`<div id="ps-blog">\`.
--
-- \`settings_json\` carries per-embed style/limit overrides (max posts,
-- heading text, accent colour) without needing schema changes.
CREATE TABLE IF NOT EXISTS blog_embeds (
  id              TEXT PRIMARY KEY,                -- public uuid-ish; appears in the URL
  name            TEXT NOT NULL,                   -- admin label
  settings_json   TEXT,                            -- JSON {limit, title, accent, ...}
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_embeds_updated ON blog_embeds(updated_at DESC);

-- Audit log: every action (cron, manual, errors) for visibility.
CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY,
  actor           TEXT,
  action          TEXT NOT NULL,
  target_id       TEXT,
  details         TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_action_created
  ON audit_log(action, created_at DESC);

-- Content calendar: planned upcoming articles. One row per slot.
--
-- Lifecycle:
--   scheduled  \u2192 planner created it (or admin added one) for a future date
--   generating \u2192 cron is mid-chain (linked via blog_jobs.id)
--   draft      \u2192 admin manually edited and held back
--   published  \u2192 linked to a blog_posts row via post_id
--
-- The cron picks slots in \`scheduled_for\` order, oldest first, where
-- status='scheduled' AND scheduled_for <= today. One slot per day is
-- the convention; nothing enforces it (admin can add multiple if they
-- want a backlog day to catch up).
CREATE TABLE IF NOT EXISTS content_calendar (
  id              TEXT PRIMARY KEY,                -- 16-byte hex
  scheduled_for   TEXT NOT NULL,                   -- YYYY-MM-DD (UTC)
  title           TEXT NOT NULL,
  primary_keyword TEXT,
  angle           TEXT,                            -- 1-2 sentences of editorial direction
  status          TEXT NOT NULL DEFAULT 'scheduled',
  source          TEXT,                            -- 'planner' | 'manual'
  job_id          TEXT,                            -- \u2192 blog_jobs.id once cron starts
  post_id         TEXT,                            -- \u2192 blog_posts.id once published
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calendar_date_status
  ON content_calendar(scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_calendar_status_date
  ON content_calendar(status, scheduled_for);

-- Internal link aliases the AI prompt mentions by name. Empty by
-- default \u2014 the operator adds entries from the Aliases admin tab.
-- Two kinds:
--   - manual: operator-curated (e.g. login \u2192 /login - "user sign-in")
--   - sitemap: auto-imported references to a published blog post /
--     programmatic page. These let the AI link to "/blog/<slug>" or
--     "/p/<slug>" by a friendly name, without polluting the manual
--     curation list.
--
-- When two rows share the same \`name\`, manual wins on lookup.
--
-- NOTE: this is the LEGACY shape (name as primary key, no project scoping).
-- Migration 002 rebuilds it as (id, project_id, name) so each project owns its
-- own alias vocabulary. The legacy shape is kept here on purpose so a fresh
-- install takes the same upgrade path as an existing one \u2014 the migration is
-- then exercised by every install, not only by old databases.
CREATE TABLE IF NOT EXISTS site_aliases (
  name            TEXT PRIMARY KEY,                -- lowercase identifier the AI uses
  url             TEXT NOT NULL,                   -- absolute or root-relative URL
  description     TEXT,                            -- short blurb shown to the LLM
  kind            TEXT NOT NULL DEFAULT 'manual',  -- manual | sitemap
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aliases_kind ON site_aliases(kind);

-- Installer state. One row per install attempt keyed by the project
-- slug + a fingerprint of the API token (we never store the token
-- itself). Lets a half-finished install resume on retry rather than
-- restarting from step 1.
CREATE TABLE IF NOT EXISTS install_state (
  project          TEXT NOT NULL,                    -- pages slug the user chose
  token_fp         TEXT NOT NULL,                    -- sha256 of the token, first 16 hex chars
  account_id       TEXT,
  d1_id            TEXT,
  r2_name          TEXT,
  pages_created    INTEGER NOT NULL DEFAULT 0,       -- 0 | 1
  deploy_started   INTEGER NOT NULL DEFAULT 0,       -- 0 | 1
  pages_url        TEXT,
  last_error       TEXT,
  last_step        TEXT,
  setup_token      TEXT,                             -- one-time magic-link token for the new site's /api/setup
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  PRIMARY KEY (project, token_fp)
);
CREATE INDEX IF NOT EXISTS idx_install_updated ON install_state(updated_at DESC);

-- Admin notices. Surfaces backend conditions the admin SPA can't
-- detect on its own \u2014 e.g. a cron tick noticed no default cover
-- template is installed, or the AI provider chain exhausted budget.
-- Notices are dedup'd by \`kind\`: re-recording an existing kind that
-- is still undismissed is a no-op (idempotent). Dismissing one and
-- recording it again creates a fresh row, so a recurring issue
-- doesn't get permanently silenced by an old click.
CREATE TABLE IF NOT EXISTS admin_notices (
  id            TEXT PRIMARY KEY,                 -- 16-byte hex
  kind          TEXT NOT NULL,                    -- slug, e.g. 'cover_template_missing'
  severity      TEXT NOT NULL DEFAULT 'warn',     -- info | warn | error
  title         TEXT NOT NULL,
  detail        TEXT,                             -- short paragraph; null OK
  action_url    TEXT,                             -- optional deep link
  action_label  TEXT,                             -- optional CTA label
  created_at    INTEGER NOT NULL,
  dismissed_at  INTEGER                           -- NULL = active
);
CREATE INDEX IF NOT EXISTS idx_admin_notices_active
  ON admin_notices(dismissed_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notices_kind
  ON admin_notices(kind, dismissed_at);

-- ============================================================================
-- MULTI-PROJECT / MULTI-BRAND EXTENSIONS (Phase 1)
-- ============================================================================

-- Core projects table
CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,                  -- 16-byte hex or slug identifier
  slug            TEXT UNIQUE NOT NULL,              -- unique project slug (e.g. 'gulagi', 'gurouter')
  name            TEXT NOT NULL,                     -- human readable project name
  description     TEXT,
  website_url     TEXT,                              -- main website url
  publishing_url  TEXT,                              -- target publishing endpoint/docs url
  language        TEXT NOT NULL DEFAULT 'vi',        -- content language (e.g. 'vi', 'en')
  timezone        TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  status          TEXT NOT NULL DEFAULT 'active',    -- active | paused | archived
  approval_mode   TEXT NOT NULL DEFAULT 'auto',      -- auto | approval
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);

-- Brand guidelines & identity per project
CREATE TABLE IF NOT EXISTS project_brands (
  project_id         TEXT PRIMARY KEY,
  business_type      TEXT,
  tone               TEXT,
  audience           TEXT,
  key_themes         TEXT,                           -- newline- or comma-separated themes
  topics_to_avoid    TEXT,
  service_area       TEXT,
  cta                TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

-- Project Knowledge Base (FAQs, guidelines, domain facts)
CREATE TABLE IF NOT EXISTS project_knowledge (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  title           TEXT NOT NULL,
  content_type    TEXT NOT NULL DEFAULT 'notes',     -- docs | faq | guidelines | notes
  content         TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_pid ON project_knowledge(project_id);

-- AI configuration per project
CREATE TABLE IF NOT EXISTS project_ai_configs (
  project_id              TEXT PRIMARY KEY,
  default_text_provider   TEXT NOT NULL DEFAULT 'workers-ai',
  default_image_provider  TEXT NOT NULL DEFAULT 'workers-ai',
  text_model              TEXT,
  image_model             TEXT,
  min_words               INTEGER NOT NULL DEFAULT 1500,
  max_words               INTEGER NOT NULL DEFAULT 3000,
  temperature             REAL NOT NULL DEFAULT 0.7,
  system_prompt_override  TEXT,
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);

-- Publishing configuration per project (Internal D1, Webhook, Custom API, WordPress)
CREATE TABLE IF NOT EXISTS project_publishing_configs (
  project_id       TEXT PRIMARY KEY,
  publisher_type   TEXT NOT NULL DEFAULT 'internal_d1', -- internal_d1 | webhook | custom_api | wordpress
  endpoint_url     TEXT,
  auth_header      TEXT,
  config_json      TEXT,                              -- JSON options for publisher
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

-- Topic Candidates & Repository per project
CREATE TABLE IF NOT EXISTS project_topics (
  id                   TEXT PRIMARY KEY,
  project_id           TEXT NOT NULL,
  key                  TEXT NOT NULL,
  angle                TEXT NOT NULL,
  category             TEXT,
  source               TEXT NOT NULL DEFAULT 'ai',    -- ai | manual | research
  relevance_score      INTEGER NOT NULL DEFAULT 80,
  business_value_score INTEGER NOT NULL DEFAULT 80,
  status               TEXT NOT NULL DEFAULT 'candidate', -- candidate | selected | used | archived
  times_used           INTEGER NOT NULL DEFAULT 0,
  last_used_at         INTEGER,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_topics_pid_status
  ON project_topics(project_id, status);

-- Per-project schedules for autonomous publishing
CREATE TABLE IF NOT EXISTS project_schedules (
  project_id          TEXT PRIMARY KEY,
  frequency           TEXT NOT NULL DEFAULT 'daily',  -- daily | weekly | custom
  cron_expression     TEXT NOT NULL DEFAULT '0 8 * * *',
  preferred_time_utc  TEXT NOT NULL DEFAULT '08:00',
  is_active           INTEGER NOT NULL DEFAULT 1,
  last_run_at         INTEGER,
  next_run_at         INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

-- Structured AI Run logs for cost and token tracking
CREATE TABLE IF NOT EXISTS ai_runs (
  id                TEXT PRIMARY KEY,
  project_id        TEXT,
  task_type         TEXT NOT NULL,                    -- topic | outline | article | seo | image | quality
  provider          TEXT NOT NULL,
  model             TEXT,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL NOT NULL DEFAULT 0,
  duration_ms       INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'success',  -- success | error
  error             TEXT,
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_pid_created ON ai_runs(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS leads (
  id              TEXT PRIMARY KEY,
  name            TEXT,
  email           TEXT,
  phone           TEXT,
  source          TEXT,
  blog_slug       TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

CREATE TABLE IF NOT EXISTS feedback (
  id              TEXT PRIMARY KEY,
  blog_slug       TEXT NOT NULL,
  rating          TEXT NOT NULL,
  comment         TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);

CREATE TABLE IF NOT EXISTS blog_views (
  id                  TEXT PRIMARY KEY,
  blog_slug           TEXT NOT NULL,
  view_count          INTEGER NOT NULL DEFAULT 0,
  last_viewed         INTEGER NOT NULL,
  total_read_time_ms  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_blog_views_slug ON blog_views(blog_slug);

CREATE TABLE IF NOT EXISTS trend_topics (
  id               TEXT PRIMARY KEY,
  topic            TEXT NOT NULL,
  source           TEXT NOT NULL,
  relevance_score  INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending',
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trend_topics_created ON trend_topics(created_at DESC);

-- ============================================================================
-- PHASE 2 ADVANCED: competitor analysis, topical authority, content refresh
-- Additive only. Columns use D1-supported ALTER TABLE ... ADD COLUMN.
-- ============================================================================

ALTER TABLE project_topics ADD COLUMN competition_score INTEGER DEFAULT 50;
ALTER TABLE project_topics ADD COLUMN freshness_score INTEGER DEFAULT 50;
ALTER TABLE project_topics ADD COLUMN search_intent TEXT DEFAULT '';

ALTER TABLE blog_posts ADD COLUMN last_refresh_at INTEGER;
ALTER TABLE blog_posts ADD COLUMN refresh_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  keyword         TEXT NOT NULL,
  competitor_url  TEXT NOT NULL,
  title           TEXT,
  word_count      INTEGER NOT NULL DEFAULT 0,
  h2_count        INTEGER NOT NULL DEFAULT 0,
  link_count      INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_competitor_keyword_created
  ON competitor_snapshots(project_id, keyword, created_at DESC);

CREATE TABLE IF NOT EXISTS content_clusters (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  pillar_key      TEXT NOT NULL,
  cluster_key     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clusters_project_pillar
  ON content_clusters(project_id, pillar_key);

CREATE TABLE IF NOT EXISTS refresh_jobs (
  id              TEXT PRIMARY KEY,
  post_id         TEXT NOT NULL,
  reason          TEXT NOT NULL DEFAULT 'stale',
  status          TEXT NOT NULL DEFAULT 'created',
  error           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_post_created
  ON refresh_jobs(post_id, created_at DESC);

-- Per-project scoping for engagement, programmatic, and trend tables so
-- each project's admin sees only its own numbers.
ALTER TABLE leads ADD COLUMN project_id TEXT;
ALTER TABLE feedback ADD COLUMN project_id TEXT;
ALTER TABLE blog_views ADD COLUMN project_id TEXT;
ALTER TABLE prog_pages ADD COLUMN project_id TEXT;
ALTER TABLE trend_topics ADD COLUMN project_id TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_project ON leads(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_project ON feedback(project_id, created_at DESC);

-- \u2500\u2500 Core-table project scoping \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
-- These columns were present in production but MISSING from this file, so a
-- fresh install produced a schema with no project_id anywhere and the whole
-- multi-project layer failed. Production only worked because it had been
-- migrated incrementally. \`scripts/check-schema-drift.mjs\` compares a live
-- database against this file and is what caught it \u2014 run it after any schema
-- edit.
--
-- ADD COLUMN is not idempotent in SQLite; the migration runner tolerates
-- "duplicate column name" so re-applying this file against an existing
-- database is safe.
ALTER TABLE blog_posts      ADD COLUMN project_id TEXT;
ALTER TABLE blog_posts      ADD COLUMN category TEXT;
ALTER TABLE blog_jobs       ADD COLUMN project_id TEXT;
ALTER TABLE content_calendar ADD COLUMN project_id TEXT;
ALTER TABLE prog_keywords   ADD COLUMN project_id TEXT;
ALTER TABLE users           ADD COLUMN project_id TEXT;
ALTER TABLE users           ADD COLUMN role TEXT;

CREATE INDEX IF NOT EXISTS idx_blog_posts_project    ON blog_posts(project_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_jobs_project     ON blog_jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_project      ON content_calendar(project_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_prog_keywords_project ON prog_keywords(project_id, status);
CREATE INDEX IF NOT EXISTS idx_blog_views_project ON blog_views(project_id);
CREATE INDEX IF NOT EXISTS idx_prog_pages_project ON prog_pages(project_id);
CREATE INDEX IF NOT EXISTS idx_trend_topics_project ON trend_topics(project_id, created_at DESC);

ALTER TABLE ai_usage ADD COLUMN project_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ai_usage_project ON ai_usage(project_id, created_at DESC);

-- Per-project public branding. Empty/NULL falls back to the global
-- SITE_NAME / SITE_DESCRIPTION / SITE_LOGO_URL env values.
ALTER TABLE projects ADD COLUMN site_name TEXT;
ALTER TABLE projects ADD COLUMN site_description TEXT;
ALTER TABLE projects ADD COLUMN logo_url TEXT;

-- Embeds belong to a project: the snippet is scoped to that project's
-- posts, not to whatever host the embed happens to be pasted on.
ALTER TABLE blog_embeds ADD COLUMN project_id TEXT;
CREATE INDEX IF NOT EXISTS idx_embeds_project ON blog_embeds(project_id, updated_at DESC);

-- Per-project accent colour used by the public blog and the embed widget.
-- NULL means the stylesheet default applies. Additive only.
ALTER TABLE projects ADD COLUMN theme_color TEXT;
ALTER TABLE projects ADD COLUMN custom_domain TEXT;




-- Free tier & quotas: plan_tier ('free' | 'pro' | 'enterprise'),
-- default plan is 'free', post_limit 100 posts for free tier.
ALTER TABLE users ADD COLUMN plan_tier TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN post_limit INTEGER DEFAULT 100;

-- Registration OTP verifications table:
CREATE TABLE IF NOT EXISTS email_verifications (
  email       TEXT PRIMARY KEY COLLATE NOCASE,
  otp_code    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  verified_at INTEGER
);
`;
  }
});

// _lib/migrations_bundle.js
var migrations_bundle_exports = {};
__export(migrations_bundle_exports, {
  MIGRATIONS: () => MIGRATIONS
});
var MIGRATIONS;
var init_migrations_bundle = __esm({
  "_lib/migrations_bundle.js"() {
    init_functionsRoutes_0_09583509623234443();
    MIGRATIONS = [
      { id: "001_social_posts", sql: "-- ============================================================================\n-- Social distribution queue\n-- ============================================================================\n-- One row per (blog post, channel) publication attempt. Publishing to an\n-- external network is not transactional with the blog write, so it gets\n-- its own durable job: the blog publish enqueues, and the cron drains.\n-- Without this, a dropped connection or a Facebook 5xx silently loses the\n-- post \u2014 the old fire-and-forget waitUntil() only wrote an audit line.\n--\n--   status: pending | publishing | published | failed | skipped\n--   next_attempt_at: unix seconds; exponential backoff between attempts\n--   needs_reconnect: 1 when the failure is a credential problem (bad or\n--     expired token, missing permission). Retrying is pointless until a\n--     human reconnects the channel, so the UI surfaces it as an action.\nCREATE TABLE IF NOT EXISTS social_posts (\n  id              TEXT PRIMARY KEY,\n  project_id      TEXT,\n  blog_post_id    TEXT NOT NULL,\n  channel         TEXT NOT NULL DEFAULT 'facebook',\n  status          TEXT NOT NULL DEFAULT 'pending',\n  attempts        INTEGER NOT NULL DEFAULT 0,\n  max_attempts    INTEGER NOT NULL DEFAULT 5,\n  next_attempt_at INTEGER NOT NULL,\n  external_id     TEXT,\n  external_url    TEXT,\n  error           TEXT,\n  needs_reconnect INTEGER NOT NULL DEFAULT 0,\n  created_at      INTEGER NOT NULL,\n  updated_at      INTEGER NOT NULL,\n  published_at    INTEGER\n);\n\n-- Idempotency: a retried blog publish must not enqueue a second time.\nCREATE UNIQUE INDEX IF NOT EXISTS idx_social_post_channel\n  ON social_posts(blog_post_id, channel);\n\n-- The drain query: due jobs, oldest first.\nCREATE INDEX IF NOT EXISTS idx_social_due\n  ON social_posts(status, next_attempt_at);\n\nCREATE INDEX IF NOT EXISTS idx_social_project\n  ON social_posts(project_id, created_at DESC);" },
      { id: "002_project_scoped_aliases", sql: "-- 002: project-scoped internal-link aliases.\n--\n-- The problem: site_aliases was global. buildAliasMap() returned EVERY row to\n-- every project, so the AI writing for project A was told it could link to\n-- project B's pages, and the sanitiser would happily expand those names into\n-- A's article. A cross-tenant content leak, not just a cosmetic one.\n--\n-- Why the table is rebuilt rather than ALTERed: the legacy table has\n-- `name TEXT PRIMARY KEY`, so only one row per name can exist in the whole\n-- database. Two projects could not each own a `login` alias. SQLite cannot\n-- change a primary key in place, so the table is recreated.\n--\n-- Nothing is dropped. The legacy table is RENAMED to site_aliases_legacy and\n-- left in place as a recovery copy; all rows are copied forward first.\n--\n-- project_id uses '' (not NULL) for \"global\". SQLite treats NULLs as distinct\n-- in a unique index, so a NULL-scoped row could be inserted twice and\n-- `ON CONFLICT(project_id, name)` would never fire for it. The empty string\n-- keeps the constraint meaningful.\n--\n-- This runs on fresh installs too \u2014 schema/init.sql still declares the legacy\n-- shape, so every database takes the same upgrade path and the migration is\n-- exercised by every install rather than only by old ones.\n\nALTER TABLE site_aliases RENAME TO site_aliases_legacy;\n\nCREATE TABLE IF NOT EXISTS site_aliases (\n  id          TEXT PRIMARY KEY,\n  project_id  TEXT NOT NULL DEFAULT '',   -- '' = shared/legacy\n  name        TEXT NOT NULL,\n  url         TEXT NOT NULL,\n  description TEXT,\n  kind        TEXT NOT NULL DEFAULT 'manual',  -- manual | sitemap\n  created_at  INTEGER NOT NULL,\n  updated_at  INTEGER NOT NULL\n);\n\n-- Scope + name is the identity. Composite so each project owns its own\n-- vocabulary; '' still allows one shared row per name.\nCREATE UNIQUE INDEX IF NOT EXISTS idx_site_aliases_scope\n  ON site_aliases(project_id, name);\n\nCREATE INDEX IF NOT EXISTS idx_site_aliases_project\n  ON site_aliases(project_id, kind);\n\n-- Copy every legacy row forward as global (''). Existing installs keep\n-- working exactly as before until an operator re-syncs per project.\nINSERT INTO site_aliases (id, project_id, name, url, description, kind, created_at, updated_at)\n  SELECT lower(hex(randomblob(16))), '', name, url, description, kind, created_at, updated_at\n    FROM site_aliases_legacy;" },
      { id: "003_product_events", sql: "-- 003: product events.\n--\n-- Deliberately narrow. Most of what a product owner wants to know is already\n-- derivable from the data the product writes anyway:\n--\n--   activation      projects.created_at \u2192 first blog_posts.published_at\n--   retention       blog_posts.published_at grouped by project and week\n--   activity        posts per week, per project\n--\n-- Deriving those is strictly better than logging them: it is retroactive\n-- (no gap before instrumentation existed), it cannot drift from the real\n-- state, and it costs no writes on the hot path.\n--\n-- This table exists only for the things that are NOT derivable \u2014 the moments\n-- where someone chose to do something and we would otherwise have no record\n-- of the choice: which setup step they abandoned, whether they tried to\n-- connect a channel and it failed, that kind of thing. That is the\n-- information needed to explain a drop-off, not just measure it.\n--\n-- Writes are fire-and-forget: a failure to record an event must never fail\n-- the user action it describes.\n\nCREATE TABLE IF NOT EXISTS product_events (\n  id         TEXT PRIMARY KEY,\n  event      TEXT NOT NULL,\n  project_id TEXT,\n  user_id    TEXT,\n  props_json TEXT,\n  created_at INTEGER NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_product_events_name_time\n  ON product_events(event, created_at DESC);\n\nCREATE INDEX IF NOT EXISTS idx_product_events_project\n  ON product_events(project_id, created_at DESC);" },
      { id: "004_project_onboarding", sql: "-- 004: per-project onboarding state.\n--\n-- The bug this fixes: onboarding was tracked as `settings.onboarding_complete`,\n-- a GLOBAL row. The settings table has no project_id, so the first project that\n-- finished the wizard marked EVERY project complete \u2014 which is why a brand new\n-- account sailed straight past the setup step. The Brand DNA and schedule\n-- checks were read from the same global settings row for the same reason.\n--\n-- State now lives on the project itself.\n--\n-- Backfill: a project that already has Brand DNA AND calendar slots has, in\n-- fact, been set up, so it is marked complete. Without this every existing\n-- install would be dropped into the wizard on next login \u2014 correct per the\n-- letter of the rule, wrong for the operator, and it would have looked like\n-- the upgrade broke their site.\n--\n-- The guard (`onboarding_complete_at IS NULL`) keeps the statement idempotent.\n\nALTER TABLE projects ADD COLUMN onboarding_complete_at INTEGER;\n\nUPDATE projects\n   SET onboarding_complete_at = strftime('%s', 'now')\n WHERE onboarding_complete_at IS NULL\n   AND EXISTS (\n     SELECT 1 FROM project_brands b\n      WHERE b.project_id = projects.id\n        AND (b.business_type IS NOT NULL OR b.audience IS NOT NULL)\n   )\n   AND EXISTS (\n     SELECT 1 FROM content_calendar c\n      WHERE c.project_id = projects.id\n   );" }
    ];
  }
});

// _lib/migrations.js
function splitSql(sql) {
  return String(sql || "").split(/;\s*(?:\r?\n|$)/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
}
async function applyStatements(env, sql, { tolerate = true } = {}) {
  let applied = 0;
  const skipped = [];
  for (const stmt of splitSql(sql)) {
    try {
      await env.DB.prepare(stmt).run();
      applied++;
    } catch (err) {
      const msg = String(err?.message || err);
      if (tolerate && BENIGN.test(msg)) {
        skipped.push(msg);
        continue;
      }
      throw new Error(`migration statement failed: ${msg}
---
${stmt.slice(0, 300)}`);
    }
  }
  return { applied, skipped: skipped.length };
}
async function ensureMigrationTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id         TEXT PRIMARY KEY,
       applied_at INTEGER NOT NULL
     )`
  ).run();
}
async function appliedMigrations(env) {
  await ensureMigrationTable(env);
  const { results } = await env.DB.prepare("SELECT id FROM schema_migrations ORDER BY id").all().catch(() => ({ results: [] }));
  return new Set((results || []).map((r) => r.id));
}
async function runMigrations(env, { logger = console } = {}) {
  if (!env?.DB?.prepare) return { ok: false, error: "no_db" };
  await ensureMigrationTable(env);
  const already = await appliedMigrations(env);
  const baseline = await applyStatements(env, SCHEMA_SQL, { tolerate: true });
  const applied = [];
  const failed = [];
  for (const m of MIGRATIONS) {
    if (already.has(m.id)) continue;
    try {
      const res = await applyStatements(env, m.sql, { tolerate: true });
      await env.DB.prepare(
        "INSERT OR REPLACE INTO schema_migrations (id, applied_at) VALUES (?, ?)"
      ).bind(m.id, Math.floor(Date.now() / 1e3)).run();
      applied.push({ id: m.id, statements: res.applied });
      logger?.log?.(`  \u2713 migration ${m.id} (${res.applied} statements)`);
    } catch (err) {
      failed.push({ id: m.id, error: String(err?.message || err) });
      logger?.error?.(`  \u2717 migration ${m.id}: ${err?.message || err}`);
      break;
    }
  }
  return {
    ok: failed.length === 0,
    baseline,
    applied,
    failed,
    total: MIGRATIONS.length,
    previously_applied: already.size
  };
}
var BENIGN;
var init_migrations = __esm({
  "_lib/migrations.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_schema();
    init_migrations_bundle();
    BENIGN = /duplicate column name|already exists|duplicate index/i;
    __name(splitSql, "splitSql");
    __name(applyStatements, "applyStatements");
    __name(ensureMigrationTable, "ensureMigrationTable");
    __name(appliedMigrations, "appliedMigrations");
    __name(runMigrations, "runMigrations");
  }
});

// api/admin/migrate.js
var onRequestPost47, onRequestGet34;
var init_migrate = __esm({
  "api/admin/migrate.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_migrations();
    onRequestPost47 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await requireSuperAdmin(env, request);
      if (gate.error) return gate.error;
      if (!env?.DB) return json(500, { error: "no_db" });
      const before = await appliedMigrations(env);
      const report = await runMigrations(env, { logger: { log: /* @__PURE__ */ __name(() => {
      }, "log"), error: /* @__PURE__ */ __name(() => {
      }, "error") } });
      const after = await appliedMigrations(env);
      return json(report.ok ? 200 : 500, {
        ok: report.ok,
        applied: report.applied,
        failed: report.failed,
        baseline_statements: report.baseline?.applied ?? 0,
        migrations_total: report.total,
        migrations_before: before.size,
        migrations_after: after.size
      });
    }, "onRequestPost");
    onRequestGet34 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await requireSuperAdmin(env, request);
      if (gate.error) return gate.error;
      const { MIGRATIONS: MIGRATIONS2 } = await Promise.resolve().then(() => (init_migrations_bundle(), migrations_bundle_exports));
      const applied = await appliedMigrations(env);
      return json(200, {
        ok: true,
        applied: [...applied],
        pending: MIGRATIONS2.filter((m) => !applied.has(m.id)).map((m) => m.id),
        total: MIGRATIONS2.length
      });
    }, "onRequestGet");
  }
});

// api/admin/notices.js
var onRequestGet35;
var init_notices = __esm({
  "api/admin/notices.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    onRequestGet35 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      if (!env?.DB) return json(503, { ok: false, error: "no_db_binding" });
      try {
        const rows = await env.DB.prepare(
          `SELECT id, kind, severity, title, detail, action_url, action_label, created_at
         FROM admin_notices
        WHERE dismissed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 50`
        ).all();
        const notices = rows?.results || [];
        return json(200, { ok: true, count: notices.length, notices }, {
          "cache-control": "no-store"
        });
      } catch (e) {
        return json(200, { ok: true, count: 0, notices: [], note: "table_missing" });
      }
    }, "onRequestGet");
  }
});

// api/admin/onboarding.js
async function stateFor(env, pid) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const project = await env.DB.prepare(
    "SELECT id, slug, name, onboarding_complete_at FROM projects WHERE id = ? LIMIT 1"
  ).bind(pid).first().catch(() => null);
  const brand2 = await env.DB.prepare(
    "SELECT business_type, audience FROM project_brands WHERE project_id = ? LIMIT 1"
  ).bind(pid).first().catch(() => null);
  const hasBrandDna = !!(brand2?.business_type || brand2?.audience);
  const future = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM content_calendar
      WHERE project_id = ? AND scheduled_for >= ? AND status IN ('scheduled','generating','draft')`
  ).bind(pid, today).first().catch(() => ({ n: 0 }));
  const hasFutureSlots = !!future?.n;
  const providers = await listProviders(env).catch(() => ({ text: [] }));
  return {
    project_id: pid,
    project_slug: project?.slug || null,
    marked_complete_at: project?.onboarding_complete_at || null,
    has_brand_dna: hasBrandDna,
    has_future_slots: hasFutureSlots,
    providers_configured: providers.text || []
  };
}
var onRequestGet36, onRequestPost48, onRequestDelete8;
var init_onboarding = __esm({
  "api/admin/onboarding.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_ai();
    init_events();
    __name(stateFor, "stateFor");
    onRequestGet36 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      if (!pid) return json(200, { ok: true, complete: false, steps: [] });
      const s = await stateFor(env, pid);
      const providers = (s.providers_configured || []).length > 0;
      const steps = [
        { key: "brand_dna", required: true, done: s.has_brand_dna },
        { key: "providers", required: false, done: providers },
        { key: "schedule", required: true, done: s.has_future_slots }
      ];
      const required = steps.filter((x) => x.required);
      const complete = required.every((x) => x.done);
      return json(200, { ok: true, ...s, steps, complete });
    }, "onRequestGet");
    onRequestPost48 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      if (!pid) return json(400, { error: "missing_project" });
      const s = await stateFor(env, pid);
      const missing = [];
      if (!s.has_brand_dna) missing.push("brand_dna");
      if (!s.has_future_slots) missing.push("schedule");
      if (missing.length) {
        return json(409, { error: "incomplete", missing, detail: "Ho\xE0n t\u1EA5t Brand DNA v\xE0 l\u1ECBch n\u1ED9i dung tr\u01B0\u1EDBc." });
      }
      const t = nowSec();
      await env.DB.prepare("UPDATE projects SET onboarding_complete_at = ? WHERE id = ?").bind(t, pid).run();
      await track(env, { event: "onboarding_complete", projectId: pid });
      return json(200, { ok: true, project_id: pid, marked_at: t });
    }, "onRequestPost");
    onRequestDelete8 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      if (!pid) return json(400, { error: "missing_project" });
      await env.DB.prepare("UPDATE projects SET onboarding_complete_at = NULL WHERE id = ?").bind(pid).run();
      return json(200, { ok: true, project_id: pid });
    }, "onRequestDelete");
  }
});

// api/admin/preview-sample.js
var DEFAULT_TOPIC, onRequestPost49;
var init_preview_sample = __esm({
  "api/admin/preview-sample.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_ai();
    init_sanitise();
    init_aliases();
    init_auth();
    init_page_render();
    init_settings();
    DEFAULT_TOPIC = "Practical tips for someone starting out";
    onRequestPost49 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      let body = {};
      try {
        body = await request.json();
      } catch {
      }
      const kind = body.kind === "programmatic" ? "programmatic" : "article";
      const seed = String(body.topic || DEFAULT_TOPIC).slice(0, 240);
      const settings = await loadSettings(env);
      const provider = body.provider ? String(body.provider) : settings.default_ai_provider || void 0;
      const brand2 = {
        // settings.site_name / site_url resolve Pages secret first, then
        // D1 setting — works on CLI + browser + 1-click Deploy installs.
        name: body.brand?.name || settings.site_name,
        url: body.brand?.url || settings.site_url,
        cta: body.brand?.cta || settings.site_cta,
        tone: body.brand?.tone || settings.brand_voice_tone || settings.site_tone || void 0,
        audience: body.brand?.audience || settings.brand_target_audience || settings.site_audience || void 0,
        business_type: body.brand?.business_type || settings.brand_business_type || void 0,
        key_themes: body.brand?.key_themes || settings.brand_key_themes || void 0,
        topics_to_avoid: body.brand?.topics_to_avoid || settings.brand_topics_to_avoid || void 0,
        service_area: body.brand?.service_area || settings.brand_service_area || void 0,
        aliases: await buildAliasMap(env, tenant?.activeProjectId || null)
      };
      let content;
      try {
        content = await generateContent(env, { kind, seed, provider, brand: brand2, source: "preview" });
      } catch (e) {
        return json(502, { error: "text_failed", detail: String(e?.message || e).slice(0, 400) });
      }
      content.body_markdown = sanitiseMarkdownLinks(content.body_markdown, { aliases: brand2.aliases });
      let imageDataUrl = null;
      let imageError = null;
      if (body.with_image) {
        try {
          const img = await generateImage(env, { prompt: content.hero_image_prompt, provider, source: "preview" });
          let bin = "";
          const chunk = 32768;
          for (let i = 0; i < img.bytes.length; i += chunk) {
            bin += String.fromCharCode.apply(null, img.bytes.subarray(i, i + chunk));
          }
          imageDataUrl = "data:image/png;base64," + btoa(bin);
        } catch (e) {
          imageError = String(e?.message || e).slice(0, 400);
        }
      }
      const pseudoPost = {
        slug: content.slug,
        title: content.title,
        meta_description: content.meta_description,
        body_markdown: content.body_markdown,
        hero_image_key: null,
        // we inline the image below instead of /image/<key>
        hero_image_alt: content.hero_image_alt,
        keywords: content.keywords,
        published_at: Math.floor(Date.now() / 1e3),
        status: "preview",
        urlPath: (kind === "blog" || kind === "article" ? "/blog/" : "/p/") + content.slug
      };
      let html2 = renderContentPage({ env, request, post: pseudoPost, kind: kind === "programmatic" ? "prog" : "blog" });
      if (imageDataUrl) {
        const safeAlt = (pseudoPost.hero_image_alt || pseudoPost.title).replace(/"/g, "&quot;");
        html2 = html2.replace(
          '<article class="prose">',
          `<img class="hero" src="${imageDataUrl}" alt="${safeAlt}" /><article class="prose">`
        );
      }
      return json(200, {
        ok: true,
        content,
        image_data_url: imageDataUrl,
        image_error: imageError,
        html: html2
      });
    }, "onRequestPost");
  }
});

// api/admin/pricing.js
var onRequestGet37, onRequestPost50;
var init_pricing = __esm({
  "api/admin/pricing.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_prices();
    onRequestGet37 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const { prices, source, fetched_at, stale } = await loadPrices(env);
      return json(200, {
        ok: true,
        prices,
        source,
        fetched_at,
        stale
      });
    }, "onRequestGet");
    onRequestPost50 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      try {
        const r = await refreshPricesFromModelsDev(env);
        return json(200, { ok: true, ...r });
      } catch (e) {
        return json(502, { error: "refresh_failed", detail: String(e?.message || e).slice(0, 200) });
      }
    }, "onRequestPost");
  }
});

// api/admin/projects.js
var onRequestGet38, onRequestPost51;
var init_projects2 = __esm({
  "api/admin/projects.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_projects();
    onRequestGet38 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await requireSuperAdmin(env, request);
      if (gate.error) return gate.error;
      const url = new URL(request.url);
      const status = url.searchParams.get("status") || "all";
      const projects = await listProjects(env, { status });
      return json(200, { ok: true, projects });
    }, "onRequestGet");
    onRequestPost51 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await requireSuperAdmin(env, request);
      if (gate.error) return gate.error;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      if (!body.slug || !body.name) {
        return json(400, { error: "missing_required_fields", hint: "slug and name are required" });
      }
      try {
        const project = await upsertProject(env, body);
        return json(200, { ok: true, project });
      } catch (err) {
        return json(500, { error: err.message || "failed_to_save_project" });
      }
    }, "onRequestPost");
  }
});

// api/admin/providers.js
var onRequestGet39;
var init_providers = __esm({
  "api/admin/providers.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_ai();
    onRequestGet39 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      return json(200, await listProviders(env));
    }, "onRequestGet");
  }
});

// api/admin/secrets.js
var ALLOWED, MIN_LEN, MAX_LEN, onRequestGet40, onRequestPost52, onRequestDelete9;
var init_secrets = __esm({
  "api/admin/secrets.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_secret_vault();
    init_secret_vault();
    ALLOWED = [
      "GUROUTER_API_KEY",
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GEMINI_API_KEY",
      "GROQ_API_KEY",
      "DEEPSEEK_API_KEY",
      "MISTRAL_API_KEY",
      "TOGETHER_API_KEY",
      "CEREBRAS_API_KEY",
      // Model overrides for providers
      "WORKERS_AI_TEXT_MODEL",
      "ANTHROPIC_TEXT_MODEL",
      "OPENAI_TEXT_MODEL",
      "GEMINI_TEXT_MODEL",
      "GUROUTER_TEXT_MODEL",
      "GROQ_TEXT_MODEL",
      "DEEPSEEK_TEXT_MODEL",
      "MISTRAL_TEXT_MODEL",
      "TOGETHER_TEXT_MODEL",
      "CEREBRAS_TEXT_MODEL"
    ];
    MIN_LEN = 2;
    MAX_LEN = 512;
    onRequestGet40 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const status = await describeKeys(env, ALLOWED);
      const values = {};
      for (const k of ALLOWED) {
        if (k.endsWith("_MODEL")) {
          const val = env?.[k] && String(env[k]).trim() || await getVaultSecret(env, k) || "";
          if (val) values[k] = val;
        }
      }
      return json(200, { ok: true, keys: status, values, allowed: ALLOWED });
    }, "onRequestGet");
    onRequestPost52 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const name = String(body?.name || "").trim().toUpperCase();
      if (!ALLOWED.includes(name)) return json(400, { error: "unknown_key", allowed: ALLOWED });
      const value = typeof body?.value === "string" ? body.value.trim() : "";
      if (value && (value.length < MIN_LEN || value.length > MAX_LEN)) {
        return json(400, { error: "value_length_out_of_range", min: MIN_LEN, max: MAX_LEN });
      }
      let result;
      try {
        result = await setVaultSecret(env, name, value);
      } catch (e) {
        return json(500, { error: "vault_error", detail: String(e?.message || e).slice(0, 200) });
      }
      audit(env, "admin", value ? "secret_set" : "secret_delete", name, {});
      return json(200, { ok: true, name, ...result });
    }, "onRequestPost");
    onRequestDelete9 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const url = new URL(request.url);
      const name = String(url.searchParams.get("name") || "").trim().toUpperCase();
      if (!ALLOWED.includes(name)) return json(400, { error: "unknown_key", allowed: ALLOWED });
      try {
        await setVaultSecret(env, name, "");
      } catch (e) {
        return json(500, { error: "vault_error", detail: String(e?.message || e).slice(0, 200) });
      }
      audit(env, "admin", "secret_delete", name, {});
      return json(200, { ok: true, name, deleted: true });
    }, "onRequestDelete");
  }
});

// api/admin/settings.js
var onRequestGet41, onRequestPut5;
var init_settings2 = __esm({
  "api/admin/settings.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_settings();
    onRequestGet41 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const settings = await loadSettings(env);
      return json(200, { ok: true, settings, keys: listSettingKeys() });
    }, "onRequestGet");
    onRequestPut5 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "invalid_json" });
      }
      if (!body || typeof body !== "object") return json(400, { error: "body_required" });
      const keys = listSettingKeys();
      const updated = [];
      const errors = {};
      for (const [k, v] of Object.entries(body)) {
        if (!keys.includes(k)) {
          errors[k] = "unknown_key";
          continue;
        }
        try {
          await setSetting(env, k, v);
          updated.push(k);
        } catch (e) {
          errors[k] = String(e?.message || e).slice(0, 200);
        }
      }
      audit(env, "admin", "settings_update", null, { updated });
      return json(200, { ok: true, updated, errors });
    }, "onRequestPut");
  }
});

// api/admin/social.js
var onRequestGet42, onRequestPost53;
var init_social = __esm({
  "api/admin/social.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_social_queue();
    onRequestGet42 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      const url = new URL(request.url);
      const status = url.searchParams.get("status") || null;
      const limit = Math.min(500, parseInt(url.searchParams.get("limit"), 10) || 100);
      const jobs = await listSocialPosts(env, { projectId: pid, status, limit });
      const all = status ? await listSocialPosts(env, { projectId: pid, limit: 500 }) : jobs;
      const counts = { pending: 0, publishing: 0, published: 0, failed: 0, skipped: 0 };
      for (const j of all) if (counts[j.status] != null) counts[j.status]++;
      return json(200, { ok: true, project_id: pid, jobs, counts });
    }, "onRequestGet");
    onRequestPost53 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const auth = await requireAdminAsync(env, request);
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      let body = {};
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const id = String(body?.id || "").trim();
      if (!id) return json(400, { error: "missing_id" });
      if (body?.action === "retry") {
        const r = await retrySocialPost(env, { projectId: pid, id });
        audit(env, "admin", "social_retry", id, { ok: r.ok, error: r.error || null });
        if (!r.ok && r.error === "not_found") return json(404, { error: "not_found" });
        return json(200, { ok: true, result: r });
      }
      if (body?.action === "cancel") {
        const r = await cancelSocialPost(env, { projectId: pid, id });
        audit(env, "admin", "social_cancel", id, { ok: r.ok });
        return json(r.ok ? 200 : 404, { ok: r.ok, error: r.ok ? void 0 : "not_found" });
      }
      return json(400, { error: "unknown_action" });
    }, "onRequestPost");
  }
});

// api/admin/status.js
async function checkDb(env) {
  if (!env.DB) return { ok: false, detail: "env.DB binding missing" };
  try {
    const r = await env.DB.prepare("SELECT 1 AS ok").first();
    return r?.ok === 1 ? { ok: true } : { ok: false, detail: "unexpected response" };
  } catch (e) {
    return { ok: false, detail: String(e?.message || e).slice(0, 200) };
  }
}
async function checkR2(env) {
  if (!env.IMAGES) return { ok: false, detail: "env.IMAGES binding missing" };
  try {
    await env.IMAGES.list({ prefix: "__status_probe__", limit: 1 });
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: String(e?.message || e).slice(0, 200) };
  }
}
async function checkAI(env) {
  if (!env.AI) return { ok: false, detail: "env.AI binding missing \u2014 Workers AI not bound on this Pages project" };
  return { ok: true, detail: "binding present (not invoked \u2014 call /api/admin/providers/test to probe end-to-end)" };
}
async function checkContent(env) {
  if (!env.DB) return { ok: false, detail: "DB unavailable" };
  try {
    const blogs = await env.DB.prepare(
      `SELECT COUNT(*) AS n, MAX(published_at) AS last FROM blog_posts WHERE status='published'`
    ).first();
    const progs = await env.DB.prepare(
      `SELECT COUNT(*) AS n, MAX(published_at) AS last FROM prog_pages WHERE status='published'`
    ).first();
    const lastBlogTs = blogs?.last || 0;
    const ageDays = lastBlogTs ? Math.floor((Date.now() / 1e3 - lastBlogTs) / 86400) : null;
    return {
      ok: true,
      blogs: blogs?.n || 0,
      blogs_last_published_at: lastBlogTs || null,
      blogs_age_days: ageDays,
      progs: progs?.n || 0,
      progs_last_published_at: progs?.last || 0
    };
  } catch (e) {
    return { ok: false, detail: String(e?.message || e).slice(0, 200) };
  }
}
async function checkRecentFailures(env) {
  if (!env.DB) return { ok: true, count: 0, detail: "DB unavailable" };
  try {
    const since = Math.floor(Date.now() / 1e3) - 7 * 86400;
    const r = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM audit_log
       WHERE created_at >= ? AND (action LIKE '%fail%' OR action LIKE '%error%')`
    ).bind(since).first();
    const count = r?.n || 0;
    return {
      ok: count === 0,
      count,
      detail: count ? `${count} failure-flagged audit entries in the last 7d` : "no failures in last 7d"
    };
  } catch (e) {
    return { ok: false, detail: String(e?.message || e).slice(0, 200) };
  }
}
async function checkBudget2(env) {
  if (!env.DB) return { ok: true, detail: "DB unavailable" };
  try {
    const monthStart = (() => {
      const d = /* @__PURE__ */ new Date();
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      return Math.floor(d.getTime() / 1e3);
    })();
    const r = await env.DB.prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS spent FROM ai_usage WHERE ts >= ?`
    ).bind(monthStart).first().catch(() => ({ spent: 0 }));
    const settings = await loadSettings(env).catch(() => ({}));
    const cap = parseFloat(settings?.monthly_budget_usd || "10") || 10;
    const spent = parseFloat(r?.spent || 0);
    const pct = cap ? Math.round(spent / cap * 100) : 0;
    const warnPct = parseInt(settings?.budget_warn_pct || "80", 10) || 80;
    return {
      ok: pct < 100,
      detail: `$${spent.toFixed(4)} / $${cap.toFixed(2)} (${pct}%)`,
      spent_usd: spent,
      cap_usd: cap,
      pct,
      warn_at_pct: warnPct,
      warning: pct >= warnPct
    };
  } catch (e) {
    return { ok: true, detail: "budget table not present yet" };
  }
}
async function checkProviders(env) {
  const settings = await loadSettings(env).catch(() => ({}));
  const list = [];
  for (const [k, v] of Object.entries(settings || {})) {
    if (/_api_key$|^openai_|^anthropic_|^groq_|^google_ai_|^together_/.test(k)) {
      list.push({ key: k, configured: !!String(v || "").trim() });
    }
  }
  const ai = !!env.AI;
  return {
    ok: ai || list.some((p) => p.configured),
    workers_ai_binding: ai,
    providers: list
  };
}
async function checkRepairSecrets(env) {
  const settings = await loadSettings(env).catch(() => ({}));
  const need = ["CF_API_TOKEN", "CF_ACCOUNT_ID", "CF_PROJECT", "CF_D1_ID", "CF_R2_NAME"];
  const missing = need.filter((k) => {
    const fromEnv = env?.[k] && String(env[k]).trim();
    if (fromEnv) return false;
    const fromSettingKey = {
      "CF_ACCOUNT_ID": "install_cf_account",
      "CF_PROJECT": "install_cf_project",
      "CF_D1_ID": "install_d1_id",
      "CF_R2_NAME": "install_r2_name"
    }[k];
    if (fromSettingKey && settings?.[fromSettingKey]) return false;
    return true;
  });
  return {
    ok: missing.length === 0,
    missing,
    detail: missing.length ? `${missing.length} secret(s) missing \u2014 site can't self-repair bindings` : "all CF_* secrets present"
  };
}
var onRequestGet43;
var init_status2 = __esm({
  "api/admin/status.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_settings();
    __name(checkDb, "checkDb");
    __name(checkR2, "checkR2");
    __name(checkAI, "checkAI");
    __name(checkContent, "checkContent");
    __name(checkRecentFailures, "checkRecentFailures");
    __name(checkBudget2, "checkBudget");
    __name(checkProviders, "checkProviders");
    __name(checkRepairSecrets, "checkRepairSecrets");
    onRequestGet43 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const [db, r2, ai, content, failures, budget, providers, repair] = await Promise.all([
        checkDb(env),
        checkR2(env),
        checkAI(env),
        checkContent(env),
        checkRecentFailures(env),
        checkBudget2(env),
        checkProviders(env),
        checkRepairSecrets(env)
      ]);
      const checks = [
        { id: "db", label: "D1 database", ...db },
        { id: "r2", label: "R2 bucket", ...r2 },
        { id: "ai", label: "Workers AI", ...ai },
        { id: "content", label: "Published content", ...content },
        { id: "failures", label: "Recent failures (7d)", ...failures },
        { id: "budget", label: "Monthly spend", ...budget },
        { id: "providers", label: "AI providers", ...providers },
        { id: "repair", label: "Self-repair secrets", ...repair }
      ];
      const all_ok = checks.every((c) => c.ok !== false);
      return json(200, {
        ok: true,
        all_ok,
        checked_at: Math.floor(Date.now() / 1e3),
        checks
      });
    }, "onRequestGet");
  }
});

// api/admin/topics.js
var onRequestGet44, onRequestPost54;
var init_topics2 = __esm({
  "api/admin/topics.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_projects();
    init_project_topics();
    onRequestGet44 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const url = new URL(request.url);
      const projectId = url.searchParams.get("project_id");
      if (!projectId) return json(400, { error: "missing_project_id" });
      const status = url.searchParams.get("status") || "candidate";
      const topics = await listProjectTopics(env, projectId, { status });
      return json(200, { ok: true, topics });
    }, "onRequestGet");
    onRequestPost54 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const projectId = body.project_id;
      if (!projectId) return json(400, { error: "missing_project_id" });
      const project = await getProject(env, projectId);
      if (!project) return json(404, { error: "project_not_found" });
      if (body.action === "generate") {
        const count = parseInt(body.count, 10) || 5;
        const topics = await generateAutonomousTopics(env, project, { count });
        return json(200, { ok: true, count: topics.length, topics });
      }
      if (!body.key) return json(400, { error: "missing_topic_key" });
      const topic = await addProjectTopic(env, {
        projectId,
        key: body.key,
        angle: body.angle,
        category: body.category,
        source: body.source || "manual",
        relevanceScore: body.relevance_score || 85,
        businessValueScore: body.business_value_score || 85
      });
      return json(200, { ok: true, topic });
    }, "onRequestPost");
  }
});

// api/admin/trend-discover.js
var onRequestGet45, onRequestPost55, ALLOWED_STATUS, onRequestPatch5;
var init_trend_discover = __esm({
  "api/admin/trend-discover.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_ai();
    init_projects();
    onRequestGet45 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      if (!env?.DB) return json(500, { error: "no_db" });
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      const sql = pid ? `SELECT * FROM trend_topics WHERE project_id = ? ORDER BY created_at DESC LIMIT 20` : `SELECT * FROM trend_topics ORDER BY created_at DESC LIMIT 20`;
      const stmt = pid ? env.DB.prepare(sql).bind(pid) : env.DB.prepare(sql);
      const { results } = await stmt.all().catch(() => ({ results: [] }));
      return json(200, { ok: true, project_id: pid, topics: results || [] });
    }, "onRequestGet");
    onRequestPost55 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      if (!env?.DB) return json(500, { error: "no_db" });
      const tenant = await resolveTenantContext(env, request, auth);
      if (!tenant?.activeProjectId) return json(400, { error: "missing_or_invalid_project" });
      const project = await getProject(env, tenant.activeProjectId);
      if (!project) return json(404, { error: "project_not_found" });
      const prompt = `You are a trend analyst for ${project?.name || "this brand"} in ${project?.brand?.service_area || "Vietnam"}.
Identify 5 trending topics this week that:
1. Relate to: ${project?.brand?.key_themes || "local business, shop, website, SEO, marketing"}
2. Are likely searched by: ${project?.brand?.audience || "local shop owners"}
3. Have commercial potential for this brand

Return STRICT JSON array of objects: [{"topic":"...","relevance_score":80,"source":"analysis"}]
Write ALL topic titles in the project's content language (${project?.language || "vi"}). Score 0-100.`;
      let trendResult;
      try {
        trendResult = await generateContent(env, {
          kind: "article",
          seed: prompt,
          brand: project?.brand,
          source: "admin-trend"
        });
      } catch (err) {
        return json(500, { error: "trend_generation_failed", detail: err.message });
      }
      const text = trendResult?.body_markdown || trendResult?.text || "";
      const match2 = text.match(/\[[\s\S]*\]/);
      let items = [];
      try {
        items = JSON.parse(match2?.[0] || "[]");
      } catch {
        items = [];
      }
      if (!items.length && (trendResult?.keywords || trendResult?.title)) {
        const kwList = (trendResult.keywords || "").split(",").map((s) => s.trim()).filter(Boolean);
        if (trendResult.title) kwList.unshift(trendResult.title);
        items = kwList.slice(0, 5).map((topic) => ({ topic, relevance_score: 80, source: "ai" }));
      }
      let saved = 0;
      for (const item2 of items) {
        if (item2.topic) {
          await env.DB.prepare(
            `INSERT INTO trend_topics (id, project_id, topic, source, relevance_score, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`
          ).bind(newId(), project.id, item2.topic, item2.source || "ai", item2.relevance_score || 80, nowSec()).run().catch(() => {
          });
          saved++;
        }
      }
      return json(200, { ok: true, project_id: project.id, generated: saved });
    }, "onRequestPost");
    ALLOWED_STATUS = ["pending", "scheduled", "published", "archived", "failed"];
    onRequestPatch5 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      if (!env?.DB) return json(500, { error: "no_db" });
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const id = String(body?.id || "").trim();
      const status = String(body?.status || "").trim();
      if (!id) return json(400, { error: "missing_id" });
      if (!ALLOWED_STATUS.includes(status)) return json(400, { error: "bad_status", allowed: ALLOWED_STATUS });
      const owned = pid ? await env.DB.prepare(`SELECT id FROM trend_topics WHERE id = ? AND project_id = ? LIMIT 1`).bind(id, pid).first().catch(() => null) : await env.DB.prepare(`SELECT id FROM trend_topics WHERE id = ? LIMIT 1`).bind(id).first().catch(() => null);
      if (!owned) return json(404, { error: "not_found" });
      const r = await env.DB.prepare(
        `UPDATE trend_topics SET status = ? WHERE id = ?${pid ? " AND project_id = ?" : ""}`
      ).bind(...pid ? [status, id, pid] : [status, id]).run();
      return json(200, { ok: true, changed: r?.meta?.changes || 0 });
    }, "onRequestPatch");
  }
});

// api/admin/update/index.js
function ghHeaders3(env) {
  const h = {
    "User-Agent": "pages-seo-update",
    Accept: "application/vnd.github+json"
  };
  if (env?.GITHUB_TOKEN) {
    h.Authorization = "Bearer " + String(env.GITHUB_TOKEN).trim();
  }
  return h;
}
async function fetchLatest(env) {
  const r = await fetch(
    `https://api.github.com/repos/${UPSTREAM_OWNER2}/${UPSTREAM_REPO2}/commits/${BRANCH}`,
    { headers: ghHeaders3(env), signal: AbortSignal.timeout(8e3) }
  );
  if (!r.ok) throw new Error("github_latest_" + r.status);
  return r.json();
}
async function fetchCompare(base, head, env) {
  const r = await fetch(
    `https://api.github.com/repos/${UPSTREAM_OWNER2}/${UPSTREAM_REPO2}/compare/${base}...${head}`,
    { headers: ghHeaders3(env), signal: AbortSignal.timeout(8e3) }
  );
  if (!r.ok) throw new Error("github_compare_" + r.status);
  return r.json();
}
function short(sha) {
  return String(sha || "").slice(0, 7);
}
function readCachedLatest(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.sha ? parsed : null;
  } catch {
    return null;
  }
}
async function loadLatestCached(env, s) {
  const now = Math.floor(Date.now() / 1e3);
  const checkedAt = Number(s.upstream_check_at || 0);
  const cached = readCachedLatest(s.upstream_check_json);
  if (cached && now - checkedAt < UPSTREAM_TTL_SEC) {
    return { latest: cached, cached: true, stale: false };
  }
  try {
    const fresh = await fetchLatest(env);
    await setSetting(env, "upstream_check_json", JSON.stringify(fresh)).catch(() => {
    });
    await setSetting(env, "upstream_check_at", String(now)).catch(() => {
    });
    return { latest: fresh, cached: false, stale: false };
  } catch (e) {
    if (cached) return { latest: cached, cached: true, stale: true };
    return { latest: null, cached: false, stale: false, error: String(e?.message || e) };
  }
}
async function buildUpdateReport(env) {
  const s = await loadSettings(env);
  const installedSha = String(s.installed_sha || "").trim();
  const installMethod = String(s.install_method || "").trim();
  const fetched = await loadLatestCached(env, s);
  if (!fetched.latest) {
    return json(200, {
      ok: false,
      error: "github_unreachable",
      detail: fetched.error || "upstream check failed",
      install_method: installMethod,
      current: null,
      latest: null,
      ahead: 0,
      up_to_date: false,
      can_apply: false,
      can_apply_reason: "check_failed",
      repo: { owner: UPSTREAM_OWNER2, name: UPSTREAM_REPO2 },
      commits: [],
      files_changed: 0,
      additions: 0,
      deletions: 0
    });
  }
  const latest = fetched.latest;
  const latestSha = latest.sha;
  const current = installedSha ? {
    sha: installedSha,
    short: short(installedSha),
    date: null
    // filled in below if compare succeeds
  } : null;
  if (!installedSha) {
    return json(200, {
      ok: true,
      install_method: installMethod,
      current: null,
      latest: { sha: latestSha, short: short(latestSha), date: latest.commit?.author?.date || null, message: (latest.commit?.message || "").split("\n")[0] },
      ahead: null,
      up_to_date: false,
      can_apply: false,
      can_apply_reason: "unknown_install_sha",
      repo: { owner: s.install_repo_owner || "", name: s.install_repo_name || "" },
      commits: [],
      files_changed: 0,
      additions: 0,
      deletions: 0
    });
  }
  if (installedSha === latestSha) {
    return json(200, {
      ok: true,
      install_method: installMethod,
      current: { ...current, date: latest.commit?.author?.date || null },
      latest: { sha: latestSha, short: short(latestSha), date: latest.commit?.author?.date || null, message: (latest.commit?.message || "").split("\n")[0] },
      ahead: 0,
      up_to_date: true,
      can_apply: false,
      can_apply_reason: "up_to_date",
      repo: { owner: s.install_repo_owner || "", name: s.install_repo_name || "" },
      commits: [],
      files_changed: 0,
      additions: 0,
      deletions: 0
    });
  }
  let cmp;
  try {
    cmp = await fetchCompare(installedSha, latestSha, env);
  } catch (e) {
    return json(502, { ok: false, error: "github_compare_failed", detail: String(e?.message || e) });
  }
  const commits = (cmp.commits || []).map((c) => ({
    sha: c.sha,
    short: short(c.sha),
    message: (c.commit?.message || "").split("\n")[0].slice(0, 200),
    date: c.commit?.author?.date || null,
    url: c.html_url,
    author: c.author?.login || c.commit?.author?.name || "unknown"
  }));
  const canApply = installMethod === "browser" || installMethod === "maintainer";
  const canApplyReason = canApply ? installMethod + "_install" : installMethod === "cli" ? "cli_install" : "unknown_method";
  return json(200, {
    ok: true,
    install_method: installMethod,
    current: { ...current, date: null },
    // we don't fetch the installed commit's date; cheap to skip
    latest: {
      sha: latestSha,
      short: short(latestSha),
      date: latest.commit?.author?.date || null,
      message: (latest.commit?.message || "").split("\n")[0]
    },
    ahead: commits.length,
    up_to_date: false,
    can_apply: canApply,
    can_apply_reason: canApplyReason,
    repo: { owner: s.install_repo_owner || "", name: s.install_repo_name || "" },
    commits,
    files_changed: cmp.files?.length || 0,
    additions: (cmp.files || []).reduce((n, f) => n + (f.additions || 0), 0),
    deletions: (cmp.files || []).reduce((n, f) => n + (f.deletions || 0), 0)
  });
}
var UPSTREAM_OWNER2, UPSTREAM_REPO2, BRANCH, onRequestGet46, UPSTREAM_TTL_SEC;
var init_update = __esm({
  "api/admin/update/index.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_settings();
    UPSTREAM_OWNER2 = "hophat";
    UPSTREAM_REPO2 = "Gu-SEO";
    BRANCH = "main";
    __name(ghHeaders3, "ghHeaders");
    __name(fetchLatest, "fetchLatest");
    __name(fetchCompare, "fetchCompare");
    __name(short, "short");
    onRequestGet46 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      try {
        return await buildUpdateReport(env);
      } catch (e) {
        return json(200, {
          ok: false,
          error: "update_check_failed",
          detail: String(e?.message || e).slice(0, 200),
          install_method: "",
          current: null,
          latest: null,
          ahead: 0,
          up_to_date: false,
          can_apply: false,
          can_apply_reason: "check_failed",
          repo: { owner: UPSTREAM_OWNER2, name: UPSTREAM_REPO2 },
          commits: [],
          files_changed: 0,
          additions: 0,
          deletions: 0
        });
      }
    }, "onRequestGet");
    UPSTREAM_TTL_SEC = 600;
    __name(readCachedLatest, "readCachedLatest");
    __name(loadLatestCached, "loadLatestCached");
    __name(buildUpdateReport, "buildUpdateReport");
  }
});

// api/admin/usage.js
function windowStart(name) {
  const now = Date.now();
  if (name === "24h") return Math.floor((now - 24 * 36e5) / 1e3);
  if (name === "7d") return Math.floor((now - 7 * 24 * 36e5) / 1e3);
  const d = /* @__PURE__ */ new Date();
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
  return Math.floor(m.getTime() / 1e3);
}
var onRequestGet47;
var init_usage2 = __esm({
  "api/admin/usage.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_settings();
    init_usage();
    __name(windowStart, "windowStart");
    onRequestGet47 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await adminGate(env, request);
      if (gate) return gate;
      const url = new URL(request.url);
      const window = url.searchParams.get("window") || "month";
      const since = windowStart(window);
      const settings = await loadSettings(env);
      const budget = parseFloat(settings.monthly_budget_usd) || 0;
      const warnPct = parseFloat(settings.budget_warn_pct) || 80;
      const [total, byProvider, byKind, daily, recent] = await Promise.all([
        env.DB.prepare(
          `SELECT COUNT(*) AS calls,
              COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
              COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
              COALESCE(SUM(total_tokens), 0) AS total_tokens,
              COALESCE(SUM(cost_usd), 0) AS cost_usd,
              SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS errors
         FROM ai_usage WHERE created_at >= ?`
        ).bind(since).first(),
        env.DB.prepare(
          `SELECT provider, COUNT(*) AS calls,
              COALESCE(SUM(total_tokens),0) AS tokens,
              COALESCE(SUM(cost_usd),0) AS cost
         FROM ai_usage WHERE created_at >= ?
         GROUP BY provider ORDER BY cost DESC`
        ).bind(since).all(),
        env.DB.prepare(
          `SELECT kind, COUNT(*) AS calls,
              COALESCE(SUM(total_tokens),0) AS tokens,
              COALESCE(SUM(cost_usd),0) AS cost
         FROM ai_usage WHERE created_at >= ?
         GROUP BY kind ORDER BY cost DESC`
        ).bind(since).all(),
        env.DB.prepare(
          // Daily rollup. SQLite has no DATE_TRUNC; floor-divide unix
          // timestamp into 86400-second buckets, then humanise client-side.
          `SELECT (created_at / 86400) * 86400 AS bucket,
              COUNT(*) AS calls,
              COALESCE(SUM(cost_usd),0) AS cost
         FROM ai_usage WHERE created_at >= ?
         GROUP BY bucket ORDER BY bucket ASC`
        ).bind(since).all(),
        env.DB.prepare(
          `SELECT created_at, provider, model, kind, source,
              prompt_tokens, completion_tokens, total_tokens, cost_usd, ok, error
         FROM ai_usage ORDER BY created_at DESC LIMIT 25`
        ).all()
      ]);
      const monthBudgetSpend = window === "month" ? total?.cost_usd || 0 : await monthSpend(env);
      const budgetState = await checkBudget(env, "admin");
      return json(200, {
        ok: true,
        window,
        since,
        total: {
          calls: total?.calls || 0,
          prompt_tokens: total?.prompt_tokens || 0,
          completion_tokens: total?.completion_tokens || 0,
          total_tokens: total?.total_tokens || 0,
          cost_usd: +(total?.cost_usd || 0).toFixed(4),
          errors: total?.errors || 0
        },
        by_provider: (byProvider?.results || []).map((r) => ({ ...r, cost: +Number(r.cost).toFixed(4) })),
        by_kind: (byKind?.results || []).map((r) => ({ ...r, cost: +Number(r.cost).toFixed(4) })),
        daily: (daily?.results || []).map((r) => ({ date: new Date(r.bucket * 1e3).toISOString().slice(0, 10), calls: r.calls, cost: +Number(r.cost).toFixed(4) })),
        recent: (recent?.results || []).map((r) => ({
          ...r,
          cost_usd: +Number(r.cost_usd).toFixed(6)
        })),
        budget: {
          monthly_usd: budget,
          month_spend_usd: +monthBudgetSpend.toFixed(4),
          pct: budget > 0 ? +(monthBudgetSpend / budget * 100).toFixed(1) : 0,
          warn_pct: warnPct,
          over_warn: budget > 0 && monthBudgetSpend >= budget * warnPct / 100,
          over_budget: budget > 0 && monthBudgetSpend >= budget,
          cron_blocked: budgetState.allowed === false
        }
      });
    }, "onRequestGet");
  }
});

// api/admin/users.js
function validEmail(s) {
  return typeof s === "string" && s.length > 3 && s.length < 200 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}
function hasKey(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}
async function projectExists(env, id) {
  if (!id) return false;
  const r = await env.DB.prepare(
    `SELECT id FROM projects WHERE id = ? LIMIT 1`
  ).bind(id).first().catch(() => null);
  return !!r;
}
var MIN_PW, MAX_PW, ROLES, onRequestGet48, onRequestPost56, onRequestPut6, onRequestDelete10;
var init_users = __esm({
  "api/admin/users.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_passwords();
    MIN_PW = 8;
    MAX_PW = 256;
    ROLES = ["super_admin", "project_admin"];
    __name(validEmail, "validEmail");
    __name(hasKey, "hasKey");
    __name(projectExists, "projectExists");
    onRequestGet48 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await requireSuperAdmin(env, request);
      if (gate.error) return gate.error;
      const r = await env.DB.prepare(
        `SELECT u.id, u.email, u.role, u.project_id, u.created_at, u.last_login_at,
            p.name AS project_name
       FROM users u LEFT JOIN projects p ON p.id = u.project_id
      ORDER BY u.created_at ASC`
      ).all();
      return json(200, { ok: true, users: r?.results || [] });
    }, "onRequestGet");
    onRequestPost56 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await requireSuperAdmin(env, request);
      if (gate.error) return gate.error;
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const email = String(body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      if (!validEmail(email)) return json(400, { error: "invalid_email" });
      if (password.length < MIN_PW || password.length > MAX_PW) {
        return json(400, { error: "password_length", min: MIN_PW, max: MAX_PW });
      }
      const role = ROLES.includes(String(body?.role || "")) ? String(body.role) : "project_admin";
      const projectId = body?.project_id ? String(body.project_id).trim() : null;
      if (role === "project_admin") {
        if (!projectId) return json(400, { error: "project_required" });
        if (!await projectExists(env, projectId)) return json(400, { error: "unknown_project" });
      } else if (projectId && !await projectExists(env, projectId)) {
        return json(400, { error: "unknown_project" });
      }
      const existing = await env.DB.prepare(
        `SELECT id FROM users WHERE email = ? LIMIT 1`
      ).bind(email).first().catch(() => null);
      if (existing) return json(409, { error: "email_already_exists" });
      let creds;
      try {
        creds = await hashPassword(password);
      } catch (e) {
        return json(400, { error: String(e?.message || e) });
      }
      const id = newId();
      const t = nowSec();
      await env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, password_salt, created_at, role, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, email, creds.hash, creds.salt, t, role, projectId).run();
      audit(env, "admin", "user_create", id, { email, role, project_id: projectId });
      return json(200, { ok: true, id, email, role, project_id: projectId });
    }, "onRequestPost");
    onRequestPut6 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await requireSuperAdmin(env, request);
      if (gate.error) return gate.error;
      const url = new URL(request.url);
      const id = String(url.searchParams.get("id") || "").trim();
      if (!id) return json(400, { error: "missing_id" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const row = await env.DB.prepare(
        `SELECT id, role, project_id FROM users WHERE id = ? LIMIT 1`
      ).bind(id).first().catch(() => null);
      if (!row) return json(404, { error: "user_not_found" });
      const wantsPassword = body?.password !== void 0 && body?.password !== null;
      const wantsRole = hasKey(body, "role");
      const wantsProject = hasKey(body, "project_id");
      if (!wantsPassword && !wantsRole && !wantsProject) return json(400, { error: "no_fields" });
      const nextRole = wantsRole ? String(body.role) : row.role || "project_admin";
      if (wantsRole && !ROLES.includes(nextRole)) return json(400, { error: "invalid_role" });
      const projectTouched = wantsProject || wantsRole;
      const nextProject = wantsProject ? body.project_id ? String(body.project_id).trim() : null : row.project_id;
      if (projectTouched && nextProject && !await projectExists(env, nextProject)) {
        return json(400, { error: "unknown_project" });
      }
      if (projectTouched && nextRole === "project_admin" && !nextProject) {
        return json(400, { error: "project_required" });
      }
      const fields = [];
      if (wantsPassword) {
        const password = String(body.password);
        if (password.length < MIN_PW || password.length > MAX_PW) {
          return json(400, { error: "password_length", min: MIN_PW, max: MAX_PW });
        }
        const creds = await hashPassword(password);
        await env.DB.prepare(
          `UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?`
        ).bind(creds.hash, creds.salt, id).run();
        await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run().catch(() => null);
        fields.push("password");
      }
      if (wantsRole) {
        await env.DB.prepare(`UPDATE users SET role = ? WHERE id = ?`).bind(nextRole, id).run();
        fields.push("role");
      }
      if (wantsProject) {
        await env.DB.prepare(`UPDATE users SET project_id = ? WHERE id = ?`).bind(nextProject, id).run();
        fields.push("project_id");
      }
      audit(env, "admin", "user_update", id, { fields });
      return json(200, { ok: true, id, role: nextRole, project_id: nextProject, fields });
    }, "onRequestPut");
    onRequestDelete10 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const gate = await requireSuperAdmin(env, request);
      if (gate.error) return gate.error;
      const url = new URL(request.url);
      const id = String(url.searchParams.get("id") || "").trim();
      if (!id) return json(400, { error: "missing_id" });
      if (gate.auth?.userId && gate.auth.userId === id) {
        return json(400, { error: "cannot_delete_self" });
      }
      const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
      if ((cnt?.n || 0) <= 1) {
        return json(400, { error: "cannot_delete_last_user", hint: "Create another user before deleting this one." });
      }
      const target = await env.DB.prepare(
        `SELECT role FROM users WHERE id = ? LIMIT 1`
      ).bind(id).first().catch(() => null);
      if (target && (target.role || "super_admin") === "super_admin") {
        const supers = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' OR role IS NULL`
        ).first();
        if ((supers?.n || 0) <= 1) return json(400, { error: "cannot_delete_last_super_admin" });
      }
      await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
      await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run().catch(() => null);
      audit(env, "admin", "user_delete", id, {});
      return json(200, { ok: true });
    }, "onRequestDelete");
  }
});

// api/admin/whoami.js
var onRequestGet49;
var init_whoami = __esm({
  "api/admin/whoami.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_config();
    init_site_identity();
    onRequestGet49 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const missing = await missingConfig(env);
      if (missing.length) {
        let usersCount = 0;
        if (env?.DB) {
          try {
            const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first();
            usersCount = r?.n || 0;
          } catch {
          }
        }
        return json(503, { ...configError(missing), needs_setup: usersCount === 0 });
      }
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      const identity = await getSiteIdentity(env);
      const role = auth.role || "super_admin";
      const projectId = auth.projectId || null;
      let projects = [];
      let planTier = auth.planTier || "pro";
      let postLimit = 100;
      let postCount = 0;
      if (env?.DB && auth.userId) {
        try {
          const u = await env.DB.prepare("SELECT plan_tier, post_limit FROM users WHERE id = ?").bind(auth.userId).first();
          if (u) {
            planTier = u.plan_tier || "free";
            postLimit = u.post_limit || 100;
          }
          if (projectId) {
            const c = await env.DB.prepare("SELECT COUNT(*) AS total FROM blog_posts WHERE project_id = ?").bind(projectId).first();
            postCount = c?.total || 0;
          }
        } catch {
        }
      }
      if (env?.DB) {
        try {
          if (role === "super_admin") {
            const res = await env.DB.prepare(
              `SELECT p.id, p.slug, p.name, p.website_url, p.publishing_url, p.custom_domain, p.site_name, p.site_description, p.logo_url,
                 c.publisher_type, c.endpoint_url FROM projects p
             LEFT JOIN project_publishing_configs c ON c.project_id = p.id
           ORDER BY p.created_at ASC`
            ).all();
            projects = res?.results || [];
          } else if (role === "project_admin" && projectId) {
            const res = await env.DB.prepare(
              `SELECT p.id, p.slug, p.name, p.website_url, p.publishing_url, p.custom_domain, p.site_name, p.site_description, p.logo_url,
                 c.publisher_type, c.endpoint_url FROM projects p
             LEFT JOIN project_publishing_configs c ON c.project_id = p.id
            WHERE p.id = ? LIMIT 1`
            ).bind(projectId).all();
            projects = res?.results || [];
          }
        } catch {
        }
      }
      return json(200, {
        ok: true,
        email: auth.email || null,
        via: auth.via,
        role,
        plan_tier: planTier,
        post_limit: postLimit,
        post_count: postCount,
        project_id: projectId,
        projects,
        site_name: identity.name,
        site_url: identity.url
      });
    }, "onRequestGet");
  }
});

// api/ai-prompt/diagnose.js
function cleanUrl(input) {
  if (!input) return null;
  let s = String(input).trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return u.origin;
  } catch {
    return null;
  }
}
async function probe(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: opts.method || "GET",
      signal: ctrl.signal,
      headers: { "user-agent": "pages-seo-diagnose/1" },
      redirect: "follow"
    });
    const ct = r.headers.get("content-type") || "";
    let body = "";
    try {
      const buf = await r.arrayBuffer();
      body = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 64 * 1024));
    } catch {
    }
    return { ok: r.ok, status: r.status, body, contentType: ct };
  } catch (e) {
    return { ok: false, status: 0, body: "", contentType: "", error: String(e?.name || e?.message || "fetch_failed") };
  } finally {
    clearTimeout(t);
  }
}
function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
async function runDiagnostics(site) {
  const u = /* @__PURE__ */ __name((path) => site + path, "u");
  const [home, admin, health, setup, sitemap, robots, cover, blog] = await Promise.all([
    probe(u("/")),
    probe(u("/admin")),
    probe(u("/api/health")),
    probe(u("/api/setup")),
    probe(u("/sitemap.xml")),
    probe(u("/robots.txt")),
    probe(u("/cover/_does-not-exist.svg")),
    probe(u("/blog"))
  ]);
  const findings = [];
  const add = /* @__PURE__ */ __name((severity, id, title, detail, extra = {}) => findings.push({ severity, id, title, detail, ...extra }), "add");
  if (home.status === 0) {
    add(
      "critical",
      "site_unreachable",
      "Site is unreachable",
      `Couldn't reach ${site}. Network error: ${home.error || "timeout"}. Domain may be wrong or the deployment is down.`,
      { url: site }
    );
    return { findings, reachable: false };
  }
  if (home.status >= 500) {
    add(
      "critical",
      "site_5xx",
      `Homepage returns ${home.status}`,
      "Server-side error on the homepage. The Pages Function is probably crashing \u2014 usually a missing binding or env var.",
      { url: site }
    );
  } else if (home.status >= 400) {
    add(
      "warning",
      "site_4xx",
      `Homepage returns ${home.status}`,
      "Homepage is rejecting requests. Likely a routing or auth issue.",
      { url: site }
    );
  } else {
    add("ok", "site_reachable", "Site reachable", `Homepage returns ${home.status}.`);
  }
  const setupJson = tryJson(setup.body);
  if (setup.status === 503 && setupJson?.error === "no_db_binding") {
    add(
      "critical",
      "no_db_binding",
      "D1 database not bound",
      'The Pages project is missing the D1 binding called "DB". /repair \u2192 Fix D1 binding resolves this.',
      { url: "https://seo.benjaminb.xyz/repair" }
    );
  } else if (setup.status === 200 && setupJson?.needs_setup === true) {
    add(
      "warning",
      "needs_setup",
      "First-run setup not completed",
      "The site is deployed but the admin account hasn't been created. Open /admin to finish setup.",
      { url: u("/admin") }
    );
  } else if (setup.status === 200 && setupJson?.ok === true) {
    add("ok", "setup_ok", "Setup status nominal", "No setup gates blocking; admin should load.");
  } else if (setup.status === 0) {
    add(
      "warning",
      "setup_unreachable",
      "/api/setup unreachable",
      "Couldn't reach the setup endpoint. The deployment may not have Functions bound."
    );
  }
  const adminBody = admin.body || "";
  const whoami = await probe(u("/api/admin/whoami"));
  const whoamiJson = tryJson(whoami.body);
  if (whoami.status === 503 && whoamiJson?.error === "config_incomplete") {
    const missing = whoamiJson.missing || [];
    add(
      "critical",
      "config_incomplete",
      `Missing config: ${missing.join(", ") || "unknown"}`,
      `The admin endpoints require ${missing.join(", ")} \u2014 either as Pages secrets or in the D1 settings table. Restore them via \`wrangler pages secret put\` or by re-running /repair \u2192 "Add self-repair secrets".`,
      { missing }
    );
  } else if (whoami.status === 401 || whoami.status === 200) {
    add("ok", "admin_healthy", "Admin endpoints healthy", `/api/admin/whoami returns ${whoami.status} (expected; means env+DB are wired).`);
  } else if (whoami.status >= 500) {
    add(
      "critical",
      "admin_5xx",
      `/api/admin/whoami returns ${whoami.status}`,
      "The admin API is crashing. Check Cloudflare \u2192 Pages \u2192 pages-seo \u2192 Logs for the stack trace."
    );
  }
  if (sitemap.status === 200 && /<urlset|<sitemapindex/.test(sitemap.body)) {
    add("ok", "sitemap_ok", "Sitemap valid", "/sitemap.xml returns a proper XML sitemap.");
  } else if (sitemap.status === 200) {
    add(
      "warning",
      "sitemap_bad",
      "Sitemap response not XML",
      "/sitemap.xml returns 200 but the body doesn't look like a sitemap. Likely the SPA fallback handler is intercepting."
    );
  } else if (sitemap.status === 0 || sitemap.status >= 500) {
    add(
      "warning",
      "sitemap_down",
      `Sitemap returns ${sitemap.status || "timeout"}`,
      "Sitemap endpoint is failing \u2014 search engines can't crawl your posts. Usually means /sitemap.xml.js function crashed (missing DB binding)."
    );
  }
  if (robots.status === 200 && /sitemap:/i.test(robots.body)) {
    add("ok", "robots_ok", "robots.txt present", "robots.txt references the sitemap correctly.");
  } else if (robots.status !== 200) {
    add(
      "info",
      "robots_missing",
      `/robots.txt returns ${robots.status || "timeout"}`,
      "Optional but recommended. Not blocking anything."
    );
  }
  if (cover.status >= 500) {
    add(
      "warning",
      "cover_renderer_crash",
      `/cover/<slug>.svg returns ${cover.status}`,
      "The live cover SVG renderer is crashing. Daily blog hero images won't generate. Check the cover template config in /admin \u2192 Covers."
    );
  } else if (cover.status === 404 || cover.status === 200 && cover.contentType.includes("svg")) {
    add("ok", "cover_ok", "Cover renderer responding", `${cover.status} from /cover/.svg endpoint.`);
  }
  if (blog.status >= 500) {
    add(
      "warning",
      "blog_5xx",
      `/blog returns ${blog.status}`,
      "The public blog index is crashing. Probably a DB query failure."
    );
  } else if (blog.status === 200 && /No posts yet|Waiting for the cron/.test(blog.body)) {
    add(
      "info",
      "no_posts",
      "No blog posts published yet",
      "Either the daily cron hasn't run, or it's running but failing. Check /admin \u2192 System \u2192 Audit log for cron errors."
    );
  } else if (blog.status === 200) {
    add("ok", "blog_ok", "Public blog listing healthy", "/blog returns 200 with post content.");
  }
  return { findings, reachable: true };
}
function buildTargetedPrompt(site, findings, ctx) {
  const critical = findings.filter((f) => f.severity === "critical");
  const warnings = findings.filter((f) => f.severity === "warning");
  const ok = findings.filter((f) => f.severity === "ok");
  const summary = critical.length ? `${critical.length} CRITICAL issue${critical.length === 1 ? "" : "s"} found.` : warnings.length ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"} found; site is mostly healthy.` : "No critical issues. The site appears healthy.";
  const fmtFinding = /* @__PURE__ */ __name((f) => {
    const lines = [`- [${f.severity.toUpperCase()}] ${f.title}`, `    ${f.detail}`];
    if (f.url) lines.push(`    Action URL: ${f.url}`);
    return lines.join("\n");
  }, "fmtFinding");
  const detected = [
    ...critical.map(fmtFinding),
    ...warnings.map(fmtFinding)
  ].join("\n");
  const okList = ok.length ? `
ALSO PASSED (don't waste time on these):
${ok.map((f) => `- ${f.title}`).join("\n")}` : "";
  const personal = [];
  if (ctx.slug) personal.push(`- Project slug: ${ctx.slug}`);
  if (site) personal.push(`- Live site:    ${site}`);
  if (ctx.admin) personal.push(`- Admin panel:  ${ctx.admin}`);
  if (ctx.gh) personal.push(`- GitHub fork:  ${ctx.gh}`);
  if (ctx.version) personal.push(`- Version:      ${ctx.version}`);
  return `You are helping me fix a broken pages-seo install. pages-seo is an open-source programmatic SEO toolkit that runs on Cloudflare Pages (Workers AI default, 8 cloud LLM providers as fallback). Source: github.com/Benjamin-Bloch/pages-seo. Docs + error reference: https://seo.benjaminb.xyz/docs and https://seo.benjaminb.xyz/docs#errors.

I have very little technical experience. Walk me through each fix ONE AT A TIME. After each step, wait for me to confirm I've done it. If a step errors, diagnose the error message before moving on.

MY INSTALL:
${personal.join("\n")}

DIAGNOSTIC SCAN RESULTS (${(/* @__PURE__ */ new Date()).toISOString()}):
${summary}

WHAT'S BROKEN \u2014 fix these in order:
${detected || "(no specific failures detected by the black-box scan; ask me what symptom I'm actually seeing)"}
${okList}

Standard pages-seo failure modes you may encounter:
- "no_db_binding" \u2192 /repair \u2192 "Fix D1 binding" PATCHes the Pages project to re-attach the DB binding.
- "config_incomplete" + missing SITE_NAME/SITE_URL/ADMIN_TOKEN \u2192 either set them as Pages secrets (\`wrangler pages secret put SITE_NAME\`) or write fallback rows to D1 (\`site_name_db\`, \`site_url_db\`, \`admin_token\` in the settings table).
- Self-repair secrets missing (CF_API_TOKEN/CF_ACCOUNT_ID/CF_PROJECT/CF_D1_ID/CF_R2_NAME) \u2192 /repair \u2192 "Add self-repair secrets" populates them.
- Cover SVG not rendering \u2192 check /admin \u2192 Covers, ensure a default template is installed.
- Daily cron not producing posts \u2192 /admin \u2192 System \u2192 Audit log will show the last failure; provider key may be unset.

Start by acknowledging which CRITICAL issue we're tackling first (if any), tell me concretely what to click or run, then wait for me to confirm before moving on.`;
}
var PROBE_TIMEOUT_MS, onRequestGet50;
var init_diagnose = __esm({
  "api/ai-prompt/diagnose.js"() {
    init_functionsRoutes_0_09583509623234443();
    PROBE_TIMEOUT_MS = 6e3;
    __name(cleanUrl, "cleanUrl");
    __name(probe, "probe");
    __name(tryJson, "tryJson");
    __name(runDiagnostics, "runDiagnostics");
    __name(buildTargetedPrompt, "buildTargetedPrompt");
    onRequestGet50 = /* @__PURE__ */ __name(async ({ request }) => {
      const url = new URL(request.url);
      const site = cleanUrl(url.searchParams.get("site"));
      const format = String(url.searchParams.get("format") || "text").toLowerCase();
      if (!site) {
        return new Response(JSON.stringify({ error: "missing_site", detail: "Pass ?site=https://my-site.pages.dev" }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }
      const ctx = {
        slug: (url.searchParams.get("slug") || "").slice(0, 64) || null,
        admin: cleanUrl(url.searchParams.get("admin")) || site + "/admin",
        gh: (url.searchParams.get("gh") || "").slice(0, 120) || null,
        version: (url.searchParams.get("version") || "").slice(0, 40) || null
      };
      const { findings } = await runDiagnostics(site);
      const prompt = buildTargetedPrompt(site, findings, ctx);
      if (format === "json") {
        return new Response(JSON.stringify({
          ok: true,
          site,
          ran_at: Math.floor(Date.now() / 1e3),
          summary: {
            critical: findings.filter((f) => f.severity === "critical").length,
            warning: findings.filter((f) => f.severity === "warning").length,
            info: findings.filter((f) => f.severity === "info").length,
            ok: findings.filter((f) => f.severity === "ok").length
          },
          findings,
          prompt
        }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "access-control-allow-origin": "*"
          }
        });
      }
      return new Response(prompt, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "access-control-allow-origin": "*"
        }
      });
    }, "onRequestGet");
  }
});

// api/blog/feedback.js
var onRequestPost57;
var init_feedback = __esm({
  "api/blog/feedback.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_project_scope();
    onRequestPost57 = /* @__PURE__ */ __name(async ({ request, env }) => {
      if (!env?.DB) return json(500, { error: "no_db" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const blogSlug = String(body?.blog_slug || "").trim().slice(0, 200);
      const rating = String(body?.rating || "").trim();
      const comment = String(body?.comment || "").trim().slice(0, 500);
      if (!blogSlug || !rating) return json(400, { error: "provide blog_slug and rating" });
      if (!["yes", "no"].includes(rating)) return json(400, { error: "rating must be yes or no" });
      const project = await resolveProjectForRequest(env, request).catch(() => null);
      await env.DB.prepare(
        `INSERT INTO feedback (id, project_id, blog_slug, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(newId(), project?.id || null, blogSlug, rating, comment || null, nowSec()).run();
      return json(200, { ok: true });
    }, "onRequestPost");
  }
});

// api/blog/leads.js
var onRequestPost58, onRequestGet51;
var init_leads = __esm({
  "api/blog/leads.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_project_scope();
    onRequestPost58 = /* @__PURE__ */ __name(async ({ request, env }) => {
      if (!env?.DB) return json(500, { error: "no_db" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const name = String(body?.name || "").trim().slice(0, 120);
      const email = String(body?.email || "").trim().slice(0, 200);
      const phone = String(body?.phone || "").trim().slice(0, 40);
      const source = String(body?.source || "blog").trim().slice(0, 40);
      const blogSlug = String(body?.blog_slug || "").trim().slice(0, 200);
      if (!email && !phone) return json(400, { error: "provide email or phone" });
      const project = await resolveProjectForRequest(env, request).catch(() => null);
      await env.DB.prepare(
        `INSERT INTO leads (id, project_id, name, email, phone, source, blog_slug, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(newId(), project?.id || null, name, email, phone, source, blogSlug || null, nowSec()).run();
      return json(200, { ok: true });
    }, "onRequestPost");
    onRequestGet51 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      if (!env?.DB) return json(500, { error: "no_db" });
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      const sql = pid ? `SELECT id, name, email, phone, source, blog_slug, created_at FROM leads WHERE project_id = ? ORDER BY created_at DESC LIMIT 100` : `SELECT id, name, email, phone, source, blog_slug, created_at FROM leads ORDER BY created_at DESC LIMIT 100`;
      const stmt = pid ? env.DB.prepare(sql).bind(pid) : env.DB.prepare(sql);
      const { results } = await stmt.all().catch(() => ({ results: [] }));
      return json(200, { ok: true, leads: results || [] });
    }, "onRequestGet");
  }
});

// api/blog/views.js
var onRequestPost59, onRequestGet52;
var init_views = __esm({
  "api/blog/views.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    init_project_scope();
    onRequestPost59 = /* @__PURE__ */ __name(async ({ request, env }) => {
      if (!env?.DB) return json(500, { error: "no_db" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const blogSlug = String(body?.blog_slug || "").trim();
      const readTimeMs = parseInt(body?.read_time_ms || "0", 10);
      if (!blogSlug) return json(400, { error: "provide blog_slug" });
      const project = await resolveProjectForRequest(env, request).catch(() => null);
      const projectId = project?.id || null;
      const existing = await env.DB.prepare(
        `SELECT id, view_count, total_read_time_ms FROM blog_views WHERE blog_slug = ? LIMIT 1`
      ).bind(blogSlug).first().catch(() => null);
      if (existing) {
        await env.DB.prepare(
          `UPDATE blog_views SET view_count = view_count + 1, total_read_time_ms = total_read_time_ms + ?, last_viewed = ?, project_id = COALESCE(project_id, ?) WHERE id = ?`
        ).bind(readTimeMs || 0, nowSec(), projectId, existing.id).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO blog_views (id, project_id, blog_slug, view_count, last_viewed, total_read_time_ms) VALUES (?, ?, ?, 1, ?, ?)`
        ).bind(newId(), projectId, blogSlug, nowSec(), readTimeMs || 0).run();
      }
      return json(200, { ok: true });
    }, "onRequestPost");
    onRequestGet52 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const auth = await requireAdminAsync(env, request);
      if (!auth) return json(401, { error: "unauthorized" });
      if (!env?.DB) return json(500, { error: "no_db" });
      const tenant = await resolveTenantContext(env, request, auth);
      const pid = tenant?.activeProjectId || null;
      const sql = pid ? `SELECT blog_slug, view_count, total_read_time_ms, last_viewed FROM blog_views WHERE project_id = ? ORDER BY view_count DESC LIMIT 50` : `SELECT blog_slug, view_count, total_read_time_ms, last_viewed FROM blog_views ORDER BY view_count DESC LIMIT 50`;
      const stmt = pid ? env.DB.prepare(sql).bind(pid) : env.DB.prepare(sql);
      const { results } = await stmt.all().catch(() => ({ results: [] }));
      return json(200, { ok: true, views: results || [] });
    }, "onRequestGet");
  }
});

// api/install/check.js
var URL_RX, onRequestGet53;
var init_check = __esm({
  "api/install/check.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    URL_RX = /^https:\/\/[a-z0-9-]+\.pages\.dev$/i;
    onRequestGet53 = /* @__PURE__ */ __name(async ({ request }) => {
      const u = new URL(request.url).searchParams.get("url") || "";
      if (!URL_RX.test(u)) return json(400, { ok: false, error: "bad_url" });
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8e3);
      try {
        const r = await fetch(u + "/api/setup", { signal: ctrl.signal, redirect: "manual" });
        clearTimeout(timeout);
        if (r.status !== 200) {
          return json(200, { ok: true, live: false, status: r.status });
        }
        const body = await r.json().catch(() => null);
        return json(200, { ok: true, live: !!(body && body.ok), needs_setup: !!body?.needs_setup });
      } catch (e) {
        clearTimeout(timeout);
        return json(200, { ok: true, live: false, error: String(e?.message || e).slice(0, 120) });
      }
    }, "onRequestGet");
  }
});

// api/install/deploy-status.js
async function cfFetch3(token, path) {
  const r = await fetch(CF_API4 + path, {
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }
  });
  let body = null;
  try {
    body = await r.json();
  } catch {
  }
  return { status: r.status, ok: r.ok, body };
}
function firstError3(body) {
  if (Array.isArray(body?.errors) && body.errors.length) {
    return body.errors.map((e) => e.message || String(e)).join(" \xB7 ");
  }
  return body?.error || null;
}
function bucket(stageStatus) {
  if (!stageStatus) return "unknown";
  const s = String(stageStatus).toLowerCase();
  if (s === "success") return "success";
  if (s === "failure" || s === "failed" || s === "canceled" || s === "cancelled") return "failure";
  if (s === "active" || s === "queued" || s === "idle") return "building";
  return "unknown";
}
function summariseFailure(deployment) {
  const stages = Array.isArray(deployment?.stages) ? deployment.stages : [];
  const failed = stages.find((s) => bucket(s?.status) === "failure");
  if (failed?.name) return `Failed during '${failed.name}' stage.`;
  const latest = deployment?.latest_stage;
  if (latest?.name && bucket(latest?.status) === "failure") {
    return `Failed during '${latest.name}' stage.`;
  }
  return "Build failed \u2014 open the build log for details.";
}
var CF_API4, onRequestPost60;
var init_deploy_status = __esm({
  "api/install/deploy-status.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    CF_API4 = "https://api.cloudflare.com/client/v4";
    __name(cfFetch3, "cfFetch");
    __name(firstError3, "firstError");
    __name(bucket, "bucket");
    __name(summariseFailure, "summariseFailure");
    onRequestPost60 = /* @__PURE__ */ __name(async ({ request }) => {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json(400, { ok: false, error: "bad_json" });
      }
      const token = String(payload?.token || "").trim();
      const accountId = String(payload?.account_id || "").trim().toLowerCase();
      const project = String(payload?.project || "").trim().toLowerCase();
      if (!token) return json(400, { ok: false, error: "missing_token" });
      if (!/^[a-f0-9]{32}$/.test(accountId)) return json(400, { ok: false, error: "bad_account_id" });
      if (!/^[a-z][a-z0-9-]{1,32}$/.test(project)) return json(400, { ok: false, error: "bad_project" });
      const r = await cfFetch3(
        token,
        `/accounts/${accountId}/pages/projects/${project}/deployments?per_page=5&env=production`
      );
      if (r.status === 401 || r.status === 403) {
        return json(401, { ok: false, error: "token_rejected", detail: firstError3(r.body) });
      }
      if (r.status === 404) {
        return json(404, { ok: false, error: "project_not_found" });
      }
      if (!r.ok) {
        return json(502, { ok: false, error: "cf_api_error", detail: firstError3(r.body) || "HTTP " + r.status });
      }
      const deployments = r.body?.result || [];
      if (!deployments.length) {
        return json(200, { ok: true, deployment_id: null, status: "unknown", stage: null });
      }
      const latest = deployments[0];
      const status = bucket(latest?.latest_stage?.status);
      const stage = latest?.latest_stage?.name || null;
      const out = {
        ok: true,
        deployment_id: latest?.id || null,
        short_id: (latest?.id || "").slice(0, 8),
        status,
        stage,
        created_on: latest?.created_on || null,
        deployment_url: latest?.url || null,
        build_log_url: latest?.id ? `https://dash.cloudflare.com/${accountId}/pages/view/${project}/${latest.id}` : null,
        error_summary: status === "failure" ? summariseFailure(latest) : null
      };
      return json(200, out, { "cache-control": "no-store" });
    }, "onRequestPost");
  }
});

// api/install/diagnose.js
async function cfFetch4(token, path) {
  const r = await fetch(CF_API5 + path, {
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    }
  });
  let body = null;
  try {
    body = await r.json();
  } catch {
  }
  return { status: r.status, ok: r.ok, body };
}
function firstError4(body) {
  if (Array.isArray(body?.errors) && body.errors.length) {
    return body.errors.map((e) => e.message || String(e)).join(" \xB7 ");
  }
  return body?.error || null;
}
function check(id, label, severity, ok, detail, fix) {
  return { id, label, severity, ok, detail, fix: fix || null };
}
function envHas(envVars, name) {
  return !!envVars?.[name];
}
function summarise(checks) {
  const summary = { critical: 0, warning: 0, info: 0, healthy: 0 };
  for (const c of checks) {
    if (c.ok) summary.healthy++;
    else summary[c.severity] = (summary[c.severity] || 0) + 1;
  }
  return { ok: true, summary, checks };
}
var CF_API5, UPSTREAM_OWNER3, UPSTREAM_REPO3, onRequestPost61;
var init_diagnose2 = __esm({
  "api/install/diagnose.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    CF_API5 = "https://api.cloudflare.com/client/v4";
    UPSTREAM_OWNER3 = "Benjamin-Bloch";
    UPSTREAM_REPO3 = "pages-seo";
    __name(cfFetch4, "cfFetch");
    __name(firstError4, "firstError");
    __name(check, "check");
    __name(envHas, "envHas");
    onRequestPost61 = /* @__PURE__ */ __name(async ({ request }) => {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json(400, { ok: false, error: "bad_json" });
      }
      const token = String(payload?.token || "").trim();
      const project = String(payload?.project || "").trim().toLowerCase();
      if (!token) return json(400, { ok: false, error: "missing_token" });
      if (!project) return json(400, { ok: false, error: "missing_project" });
      const checks = [];
      let accountId = null;
      let accountName = null;
      {
        const r = await cfFetch4(token, "/accounts");
        if (!r.ok || !r.body?.result?.length) {
          checks.push(check(
            "account",
            "Cloudflare account access",
            "critical",
            false,
            firstError4(r.body) || "HTTP " + r.status,
            null
            // can't auto-fix a bad token; user has to recreate
          ));
          return json(200, summarise(checks));
        }
        accountId = r.body.result[0].id;
        accountName = r.body.result[0].name || "";
        checks.push(check(
          "account",
          "Cloudflare account access",
          "critical",
          true,
          `Token works for ${accountName || accountId}.`
        ));
      }
      let projectData = null;
      {
        const r = await cfFetch4(token, `/accounts/${accountId}/pages/projects/${project}`);
        if (!r.ok) {
          checks.push(check(
            "project_exists",
            "Pages project exists",
            "critical",
            false,
            `No Pages project named "${project}" on this account. Did you mistype the slug?`,
            null
          ));
          return json(200, summarise(checks));
        }
        projectData = r.body?.result;
        checks.push(check(
          "project_exists",
          "Pages project exists",
          "critical",
          true,
          `Project found at ${projectData.subdomain || project + ".pages.dev"}.`
        ));
      }
      const prodEnvVars = projectData?.deployment_configs?.production?.env_vars || {};
      const prodBindings = projectData?.deployment_configs?.production || {};
      let d1Id = null;
      {
        const dbBinding = prodBindings.d1_databases?.DB;
        if (!dbBinding?.id) {
          checks.push(check(
            "d1_bound",
            "D1 database bound",
            "critical",
            false,
            "env.DB binding is missing on production.",
            { action: "rebind" }
          ));
        } else {
          d1Id = dbBinding.id;
          const dbR = await cfFetch4(token, `/accounts/${accountId}/d1/database/${d1Id}`);
          if (!dbR.ok) {
            checks.push(check(
              "d1_bound",
              "D1 database bound",
              "critical",
              false,
              `Binding references D1 ${d1Id.slice(0, 8)}\u2026 but that database no longer exists.`,
              { action: "rebind" }
            ));
          } else {
            checks.push(check(
              "d1_bound",
              "D1 database bound",
              "critical",
              true,
              `Bound to "${dbR.body?.result?.name || d1Id.slice(0, 12)}".`
            ));
          }
        }
      }
      let r2Name = null;
      {
        const r2Binding = prodBindings.r2_buckets?.IMAGES;
        if (!r2Binding?.name) {
          checks.push(check(
            "r2_bound",
            "R2 bucket bound",
            "critical",
            false,
            "env.IMAGES binding is missing on production.",
            { action: "rebind" }
          ));
        } else {
          r2Name = r2Binding.name;
          const probe2 = await cfFetch4(token, `/accounts/${accountId}/r2/buckets/${r2Name}`);
          if (!probe2.ok) {
            checks.push(check(
              "r2_bound",
              "R2 bucket bound",
              "critical",
              false,
              `Binding references "${r2Name}" but no R2 bucket of that name exists.`,
              { action: "rebind" }
            ));
          } else {
            checks.push(check(
              "r2_bound",
              "R2 bucket bound",
              "critical",
              true,
              `Bound to ${r2Name}.`
            ));
          }
        }
      }
      {
        const aiBinding = prodBindings.ai_bindings?.AI;
        if (!aiBinding) {
          checks.push(check(
            "ai_bound",
            "Workers AI bound",
            "warning",
            false,
            "env.AI binding missing. Daily blog hero-image generation needs this when in AI mode.",
            { action: "rebind" }
          ));
        } else {
          checks.push(check(
            "ai_bound",
            "Workers AI bound",
            "warning",
            true,
            "Workers AI binding present."
          ));
        }
      }
      {
        const need = ["CF_API_TOKEN", "CF_ACCOUNT_ID", "CF_PROJECT", "CF_D1_ID", "CF_R2_NAME"];
        const missing = need.filter((k) => !envHas(prodEnvVars, k));
        if (missing.length) {
          checks.push(check(
            "cf_secrets",
            "Self-repair secrets",
            "warning",
            false,
            `${missing.length} missing: ${missing.join(", ")}. Site can't self-heal future binding drops without these.`,
            { action: "add_secrets" }
          ));
        } else {
          checks.push(check(
            "cf_secrets",
            "Self-repair secrets",
            "warning",
            true,
            "All 5 CF_* secrets present."
          ));
        }
      }
      {
        const need = ["SITE_NAME", "SITE_URL", "ADMIN_TOKEN"];
        const missing = need.filter((k) => !envHas(prodEnvVars, k));
        if (missing.length) {
          checks.push(check(
            "site_env",
            "Site identity env vars",
            "warning",
            false,
            `${missing.length} missing: ${missing.join(", ")}. /admin will refuse to load until these are present.`,
            null
            // user-supplied values; can't auto-fix
          ));
        } else {
          checks.push(check(
            "site_env",
            "Site identity env vars",
            "warning",
            true,
            "SITE_NAME, SITE_URL, ADMIN_TOKEN all set."
          ));
        }
      }
      let ghSource = null;
      {
        const src = projectData?.source;
        if (src?.type !== "github" || !src?.config?.owner || !src?.config?.repo_name) {
          checks.push(check(
            "github_source",
            "GitHub source connected",
            "info",
            false,
            "Project is not connected to a GitHub source. Updates via /update or admin Updates tab won't work.",
            null
          ));
        } else {
          ghSource = src.config;
          checks.push(check(
            "github_source",
            "GitHub source connected",
            "info",
            true,
            `Connected to ${ghSource.owner}/${ghSource.repo_name} (branch ${ghSource.production_branch || "main"}).`
          ));
        }
      }
      if (ghSource) {
        try {
          const upstream = await fetch(
            `https://api.github.com/repos/${UPSTREAM_OWNER3}/${UPSTREAM_REPO3}/commits/main`,
            { headers: { "User-Agent": "pages-seo-diagnose", Accept: "application/vnd.github+json" } }
          );
          const fork = await fetch(
            `https://api.github.com/repos/${ghSource.owner}/${ghSource.repo_name}/commits/${ghSource.production_branch || "main"}`,
            { headers: { "User-Agent": "pages-seo-diagnose", Accept: "application/vnd.github+json" } }
          );
          if (upstream.ok && fork.ok) {
            const u = await upstream.json();
            const f = await fork.json();
            if (u.sha === f.sha) {
              checks.push(check(
                "fork_sync",
                "Fork synced with upstream",
                "info",
                true,
                `Fork is at upstream HEAD (${u.sha.slice(0, 7)}).`
              ));
            } else {
              const cmp = await fetch(
                `https://api.github.com/repos/${ghSource.owner}/${ghSource.repo_name}/compare/${ghSource.production_branch || "main"}...${UPSTREAM_OWNER3}:${UPSTREAM_REPO3}:main`,
                { headers: { "User-Agent": "pages-seo-diagnose", Accept: "application/vnd.github+json" } }
              );
              if (cmp.ok) {
                const c = await cmp.json();
                const ahead = c.ahead_by || 0;
                const behind = c.behind_by || 0;
                const detail = behind > 0 ? `Fork is ${behind} commit${behind === 1 ? "" : "s"} behind upstream. New features + fixes haven't reached this install yet.` : ahead > 0 ? `Fork is ${ahead} commit${ahead === 1 ? "" : "s"} ahead of upstream (you have local edits).` : "Up to date.";
                checks.push(check(
                  "fork_sync",
                  "Fork synced with upstream",
                  behind > 0 ? "info" : "info",
                  behind === 0,
                  detail,
                  behind > 0 ? { action: "sync_fork", args: { owner: ghSource.owner, repo: ghSource.repo_name, branch: ghSource.production_branch || "main" } } : null
                ));
              } else {
                checks.push(check(
                  "fork_sync",
                  "Fork synced with upstream",
                  "info",
                  false,
                  "Couldn't compare fork to upstream (GitHub API rate limit?). Try again in a minute.",
                  null
                ));
              }
            }
          } else {
            checks.push(check(
              "fork_sync",
              "Fork synced with upstream",
              "info",
              false,
              "Couldn't reach GitHub. Will re-check next run.",
              null
            ));
          }
        } catch (e) {
          checks.push(check(
            "fork_sync",
            "Fork synced with upstream",
            "info",
            false,
            "GitHub lookup failed: " + String(e?.message || e).slice(0, 120),
            null
          ));
        }
      }
      {
        const r = await cfFetch4(token, `/accounts/${accountId}/pages/projects/${project}/deployments?per_page=1`);
        if (r.ok && r.body?.result?.length) {
          const last = r.body.result[0];
          const stage = last.latest_stage?.status || (last.deployment_trigger?.metadata?.commit_hash ? "pending" : "unknown");
          const phase = last.latest_stage?.name || "";
          const ok = stage === "success";
          checks.push(check(
            "last_deploy",
            "Last deployment",
            ok ? "info" : "warning",
            ok,
            ok ? `Last deploy succeeded ${new Date(last.modified_on || last.created_on).toLocaleDateString("en-GB")} (${(last.deployment_trigger?.metadata?.commit_hash || "").slice(0, 7) || "manual"}).` : `Last deploy failed in phase "${phase}". Trigger a fresh deploy to retry.`,
            ok ? null : { action: "redeploy" }
          ));
        } else {
          checks.push(check(
            "last_deploy",
            "Last deployment",
            "info",
            false,
            "No deployment history found. Trigger one to populate this.",
            { action: "redeploy" }
          ));
        }
      }
      {
        const domains = projectData?.domains || [];
        const customDomains = domains.filter((d) => !d.endsWith(".pages.dev"));
        if (customDomains.length === 0) {
          checks.push(check(
            "custom_domain",
            "Custom domain",
            "info",
            true,
            "Using the default *.pages.dev domain. Add a custom domain in the CF dashboard if you want a branded URL."
          ));
        } else {
          checks.push(check(
            "custom_domain",
            "Custom domain",
            "info",
            true,
            `Serving ${customDomains.length} custom domain${customDomains.length === 1 ? "" : "s"}: ${customDomains.join(", ")}.`
          ));
        }
      }
      if (ghSource) {
        try {
          const r = await fetch(
            `https://api.github.com/repos/${ghSource.owner}/${ghSource.repo_name}/compare/${UPSTREAM_OWNER3}:${UPSTREAM_REPO3}:main...${ghSource.production_branch || "main"}`,
            { headers: { "User-Agent": "pages-seo-diagnose", Accept: "application/vnd.github+json" } }
          );
          if (r.ok) {
            const c = await r.json();
            const ahead = c.ahead_by || 0;
            const files = (c.files || []).map((f) => f.filename).slice(0, 12);
            if (ahead > 0) {
              checks.push(check(
                "source_drift",
                "Source code edits",
                "info",
                false,
                `Fork has ${ahead} commit${ahead === 1 ? "" : "s"} on top of upstream${files.length ? " touching: " + files.join(", ") + (files.length === 12 ? "\u2026" : "") : ""}. Update via /update will require resolving conflicts.`,
                null
              ));
            } else {
              checks.push(check(
                "source_drift",
                "Source code edits",
                "info",
                true,
                "No local edits \u2014 fork matches upstream verbatim."
              ));
            }
          }
        } catch {
        }
      }
      return json(200, summarise(checks));
    }, "onRequestPost");
    __name(summarise, "summarise");
  }
});

// api/install/fix.js
async function cfFetch5(token, path, init = {}) {
  const r = await fetch(CF_API6 + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
  let body = null;
  try {
    body = await r.json();
  } catch {
  }
  return { status: r.status, ok: r.ok, body };
}
function firstError5(body) {
  if (Array.isArray(body?.errors) && body.errors.length) {
    return body.errors.map((e) => e.message || String(e)).join(" \xB7 ");
  }
  return body?.error || null;
}
async function resolveAccountId(token) {
  const r = await cfFetch5(token, "/accounts");
  if (!r.ok || !r.body?.result?.length) {
    throw new Error("token_rejected: " + (firstError5(r.body) || ""));
  }
  return r.body.result[0].id;
}
async function findD1Id(token, accountId, name) {
  const r = await cfFetch5(token, `/accounts/${accountId}/d1/database?name=${encodeURIComponent(name)}&per_page=10`);
  const hit = (r.body?.result || []).find((d) => d.name === name);
  return hit?.uuid || null;
}
async function findR2Name(token, accountId, name) {
  const r = await cfFetch5(token, `/accounts/${accountId}/r2/buckets?per_page=100`);
  const buckets = r.body?.result?.buckets || r.body?.result || [];
  return buckets.find((b) => b.name === name) ? name : null;
}
async function fetchProject(token, accountId, project) {
  const r = await cfFetch5(token, `/accounts/${accountId}/pages/projects/${project}`);
  if (!r.ok) throw new Error("project_not_found");
  return r.body?.result;
}
async function rebindAction(token, accountId, project, env) {
  const proj = await fetchProject(token, accountId, project);
  const d1Id = await findD1Id(token, accountId, project);
  if (!d1Id) throw new Error('d1_not_found: no D1 database named "' + project + '"');
  const r2 = await findR2Name(token, accountId, project + "-images");
  if (!r2) throw new Error('r2_not_found: no R2 bucket named "' + project + '-images"');
  const prodEnv = proj?.deployment_configs?.production?.env_vars || {};
  const prevEnv = proj?.deployment_configs?.preview?.env_vars || prodEnv;
  const bindings = {
    d1_databases: { DB: { id: d1Id } },
    r2_buckets: { IMAGES: { name: r2 } },
    ai_bindings: { AI: {} }
  };
  const r = await cfFetch5(token, `/accounts/${accountId}/pages/projects/${project}`, {
    method: "PATCH",
    body: JSON.stringify({
      deployment_configs: {
        production: { ...bindings, env_vars: prodEnv },
        preview: { ...bindings, env_vars: prevEnv }
      }
    })
  });
  if (!r.ok) throw new Error("patch_failed: " + (firstError5(r.body) || r.status));
  const after = await fetchProject(token, accountId, project);
  const verified = after?.deployment_configs?.production?.d1_databases?.DB?.id === d1Id;
  audit(env, "admin", "repair_rebind", project, { d1Id, r2, verified });
  return { ok: true, action: "rebind", d1: { id: d1Id, name: project }, r2: { name: r2 }, verified };
}
async function addSecretsAction(token, accountId, project, env) {
  const proj = await fetchProject(token, accountId, project);
  const prodEnv = proj?.deployment_configs?.production?.env_vars || {};
  const prevEnv = proj?.deployment_configs?.preview?.env_vars || prodEnv;
  const d1Id = proj?.deployment_configs?.production?.d1_databases?.DB?.id || await findD1Id(token, accountId, project);
  const r2 = proj?.deployment_configs?.production?.r2_buckets?.IMAGES?.name || await findR2Name(token, accountId, project + "-images");
  if (!d1Id || !r2) {
    throw new Error("bindings_required_first: run rebind before add_secrets");
  }
  const secretFields = {
    CF_API_TOKEN: { type: "secret_text", value: token },
    CF_ACCOUNT_ID: { type: "secret_text", value: accountId },
    CF_PROJECT: { type: "plain_text", value: project },
    CF_D1_ID: { type: "secret_text", value: d1Id },
    CF_R2_NAME: { type: "plain_text", value: r2 }
  };
  const r = await cfFetch5(token, `/accounts/${accountId}/pages/projects/${project}`, {
    method: "PATCH",
    body: JSON.stringify({
      deployment_configs: {
        production: { env_vars: { ...prodEnv, ...secretFields } },
        preview: { env_vars: { ...prevEnv, ...secretFields } }
      }
    })
  });
  if (!r.ok) throw new Error("patch_failed: " + (firstError5(r.body) || r.status));
  audit(env, "admin", "repair_add_secrets", project, {});
  return { ok: true, action: "add_secrets" };
}
async function syncForkAction({ args, request, env }) {
  const session = await readOAuthCookie(env, request).catch(() => null);
  if (!session?.token) {
    return {
      ok: false,
      error: "gh_oauth_required",
      detail: "Sign in with GitHub first. The /repair page has a link in the help text \u2014 open /install and sign in once, then come back.",
      sign_in_url: "/api/update/github/start?flow=install&state="
    };
  }
  const owner = args?.owner;
  const repo = args?.repo;
  const branch = args?.branch || "main";
  if (!owner || !repo) return { ok: false, error: "missing_args" };
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/merge-upstream`, {
    method: "POST",
    headers: {
      Authorization: "token " + session.token,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "pages-seo-repair"
    },
    body: JSON.stringify({ branch })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    return {
      ok: false,
      error: "merge_failed",
      detail: body?.message || "HTTP " + r.status,
      hint: "If the merge has conflicts you'll need to resolve them on GitHub manually, then re-run repair."
    };
  }
  audit(env, "admin", "repair_sync_fork", owner + "/" + repo, { branch, merge_type: body?.merge_type });
  return { ok: true, action: "sync_fork", merge_type: body?.merge_type || "unknown", base_branch: body?.base_branch || branch };
}
async function redeployAction(token, accountId, project, env) {
  const r = await cfFetch5(token, `/accounts/${accountId}/pages/projects/${project}/deployments`, {
    method: "POST"
  });
  if (!r.ok) throw new Error("deploy_failed: " + (firstError5(r.body) || r.status));
  audit(env, "admin", "repair_redeploy", project, {});
  return { ok: true, action: "redeploy" };
}
var CF_API6, onRequestPost62;
var init_fix = __esm({
  "api/install/fix.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_oauth_cookie();
    CF_API6 = "https://api.cloudflare.com/client/v4";
    __name(cfFetch5, "cfFetch");
    __name(firstError5, "firstError");
    __name(resolveAccountId, "resolveAccountId");
    __name(findD1Id, "findD1Id");
    __name(findR2Name, "findR2Name");
    __name(fetchProject, "fetchProject");
    __name(rebindAction, "rebindAction");
    __name(addSecretsAction, "addSecretsAction");
    __name(syncForkAction, "syncForkAction");
    __name(redeployAction, "redeployAction");
    onRequestPost62 = /* @__PURE__ */ __name(async ({ env, request }) => {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json(400, { ok: false, error: "bad_json" });
      }
      const token = String(payload?.token || "").trim();
      const project = String(payload?.project || "").trim().toLowerCase();
      const action = String(payload?.action || "").trim();
      if (!token) return json(400, { ok: false, error: "missing_token" });
      if (!project) return json(400, { ok: false, error: "missing_project" });
      if (!action) return json(400, { ok: false, error: "missing_action" });
      let accountId;
      try {
        accountId = await resolveAccountId(token);
      } catch (e) {
        return json(401, { ok: false, error: "token_rejected", detail: String(e?.message || e).slice(0, 200) });
      }
      try {
        if (action === "rebind") {
          const out = await rebindAction(token, accountId, project, env);
          return json(200, out);
        }
        if (action === "add_secrets") {
          const out = await addSecretsAction(token, accountId, project, env);
          return json(200, out);
        }
        if (action === "sync_fork") {
          const out = await syncForkAction({ args: payload.args, request, env });
          return json(out.ok ? 200 : 400, out);
        }
        if (action === "redeploy") {
          const out = await redeployAction(token, accountId, project, env);
          return json(200, out);
        }
        return json(400, { ok: false, error: "unknown_action", got: action });
      } catch (e) {
        return json(500, { ok: false, error: "fix_failed", detail: String(e?.message || e).slice(0, 240) });
      }
    }, "onRequestPost");
  }
});

// api/install/projects.js
async function cfFetch6(token, path) {
  const r = await fetch(CF_API7 + path, {
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    }
  });
  let body = null;
  try {
    body = await r.json();
  } catch {
  }
  return { status: r.status, ok: r.ok, body };
}
function firstError6(body) {
  if (Array.isArray(body?.errors) && body.errors.length) {
    return body.errors.map((e) => e.message || String(e)).join(" \xB7 ");
  }
  return body?.error || null;
}
var CF_API7, onRequestPost63;
var init_projects3 = __esm({
  "api/install/projects.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    CF_API7 = "https://api.cloudflare.com/client/v4";
    __name(cfFetch6, "cfFetch");
    __name(firstError6, "firstError");
    onRequestPost63 = /* @__PURE__ */ __name(async ({ request }) => {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json(400, { ok: false, error: "bad_json" });
      }
      const token = String(payload?.token || "").trim();
      if (!token) return json(400, { ok: false, error: "missing_token" });
      const accountsR = await cfFetch6(token, "/accounts");
      if (!accountsR.ok || !accountsR.body?.result?.length) {
        const detail = firstError6(accountsR.body) || "HTTP " + accountsR.status;
        return json(accountsR.status === 401 || accountsR.status === 403 ? 401 : 502, {
          ok: false,
          error: "token_rejected",
          detail,
          hint: "The token didn't list any accounts. Re-create it via the link on /repair \u2014 make sure Account Settings: Read is checked."
        });
      }
      const account = accountsR.body.result[0];
      const accountId = account.id;
      const projects = [];
      for (let page = 1; page <= 8; page++) {
        const r = await cfFetch6(
          token,
          `/accounts/${accountId}/pages/projects?page=${page}&per_page=25`
        );
        if (!r.ok) {
          return json(502, {
            ok: false,
            error: "pages_list_failed",
            detail: firstError6(r.body) || "HTTP " + r.status
          });
        }
        const rows = r.body?.result || [];
        for (const p of rows) projects.push(p);
        if (rows.length < 25) break;
      }
      const slugs = projects.map((p) => p.name);
      const d1Hits = /* @__PURE__ */ new Set();
      const r2Hits = /* @__PURE__ */ new Set();
      try {
        const d1R = await cfFetch6(token, `/accounts/${accountId}/d1/database?per_page=50`);
        if (d1R.ok) {
          for (const d of d1R.body?.result || []) {
            if (slugs.includes(d.name)) d1Hits.add(d.name);
          }
        }
      } catch {
      }
      try {
        const r2R = await cfFetch6(token, `/accounts/${accountId}/r2/buckets?per_page=50`);
        if (r2R.ok) {
          const buckets = r2R.body?.result?.buckets || r2R.body?.result || [];
          for (const b of buckets) {
            const expected = b.name.replace(/-images$/, "");
            if (slugs.includes(expected)) r2Hits.add(expected);
          }
        }
      } catch {
      }
      const out = projects.map((p) => ({
        name: p.name,
        subdomain: p.subdomain || `${p.name}.pages.dev`,
        created_on: p.created_on || null,
        domains: p.domains || [],
        has_pages_seo_d1: d1Hits.has(p.name),
        has_pages_seo_r2: r2Hits.has(p.name),
        looks_like_pages_seo: d1Hits.has(p.name) && r2Hits.has(p.name)
      }));
      out.sort((a, b) => {
        if (a.looks_like_pages_seo !== b.looks_like_pages_seo) {
          return a.looks_like_pages_seo ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      return json(200, {
        ok: true,
        account: { id: accountId, name: account.name || "" },
        projects: out
      });
    }, "onRequestPost");
  }
});

// api/install/provision.js
function fail2(at, status, detail, extras = {}) {
  return json(status, { ok: false, failed_at: at, error: "install_failed", detail, ...extras });
}
function isGithubInstallError(msg) {
  if (!msg) return false;
  return /Git installation|git integration|github app|connect.*git|reinstalling your installation/i.test(msg);
}
async function tokenFingerprint(token) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomHex32() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function cfFetch7(token, path, init = {}) {
  const res = await fetch(CF_API8 + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
  }
  return { res, body };
}
function firstErrorMessage(body) {
  if (!body) return null;
  if (Array.isArray(body.errors) && body.errors.length) {
    return body.errors.map((e) => e.message || String(e)).join(" \xB7 ");
  }
  return body.error || body.detail || null;
}
async function loadState(env, project, fp) {
  if (!env?.DB) return null;
  return env.DB.prepare(
    `SELECT * FROM install_state WHERE project = ? AND token_fp = ? LIMIT 1`
  ).bind(project, fp).first().catch(() => null);
}
async function saveStep(env, project, fp, patch) {
  if (!env?.DB) return;
  const now = nowSec();
  const existing = await loadState(env, project, fp);
  if (existing) {
    const sets = [];
    const args = [];
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${k} = ?`);
      args.push(v);
    }
    sets.push("updated_at = ?");
    args.push(now);
    args.push(project, fp);
    await env.DB.prepare(
      `UPDATE install_state SET ${sets.join(", ")} WHERE project = ? AND token_fp = ?`
    ).bind(...args).run().catch(() => {
    });
  } else {
    const cols = ["project", "token_fp", "created_at", "updated_at", ...Object.keys(patch)];
    const vals = [project, fp, now, now, ...Object.values(patch)];
    const placeholders = cols.map(() => "?").join(", ");
    await env.DB.prepare(
      `INSERT INTO install_state (${cols.join(", ")}) VALUES (${placeholders})`
    ).bind(...vals).run().catch(() => {
    });
  }
}
async function ensureAccount(token) {
  const r = await cfFetch7(token, "/accounts");
  if (!r.res.ok || !r.body?.result?.length) {
    throw new Error(firstErrorMessage(r.body) || "Token rejected by Cloudflare (check scopes).");
  }
  return { id: r.body.result[0].id, name: r.body.result[0].name };
}
async function findD1(token, accountId, name) {
  const direct = await cfFetch7(token, `/accounts/${accountId}/d1/database?name=${encodeURIComponent(name)}&per_page=10`);
  if (direct.res.ok) {
    const hit = (direct.body?.result || []).find((r) => r.name === name);
    if (hit) return hit.uuid;
    if (Array.isArray(direct.body?.result)) return null;
  }
  for (let page = 1; page <= 5; page++) {
    const listR = await cfFetch7(token, `/accounts/${accountId}/d1/database?page=${page}&per_page=50`);
    if (!listR.res.ok) break;
    const rows = listR.body?.result || [];
    const hit = rows.find((r) => r.name === name);
    if (hit) return hit.uuid;
    if (rows.length < 50) break;
  }
  return null;
}
async function ensureD1(token, accountId, name) {
  const existing = await findD1(token, accountId, name);
  if (existing) return { id: existing, name, reused: true };
  const createR = await cfFetch7(token, `/accounts/${accountId}/d1/database`, {
    method: "POST",
    body: JSON.stringify({ name })
  });
  if (createR.res.ok && createR.body?.result?.uuid) {
    return { id: createR.body.result.uuid, name, reused: false };
  }
  const msg = firstErrorMessage(createR.body) || "";
  if (/already exists/i.test(msg)) {
    const after = await findD1(token, accountId, name);
    if (after) return { id: after, name, reused: true };
  }
  throw new Error(msg || "Failed to create D1 database.");
}
async function findR2(token, accountId, name) {
  let cursor = "";
  for (let i = 0; i < 5; i++) {
    const url = `/accounts/${accountId}/r2/buckets?per_page=100${cursor ? "&cursor=" + cursor : ""}`;
    const r = await cfFetch7(token, url);
    if (!r.res.ok) return null;
    const buckets = r.body?.result?.buckets || r.body?.result || [];
    const hit = buckets.find((b) => b.name === name);
    if (hit) return name;
    cursor = r.body?.result_info?.cursor || "";
    if (!cursor) break;
  }
  return null;
}
async function ensureR2(token, accountId, name) {
  const existing = await findR2(token, accountId, name);
  if (existing) return { name, reused: true };
  const r = await cfFetch7(token, `/accounts/${accountId}/r2/buckets`, {
    method: "POST",
    body: JSON.stringify({ name })
  });
  if (r.res.ok) return { name, reused: false };
  if (r.res.status === 409) return { name, reused: true };
  const msg = firstErrorMessage(r.body) || `R2 create failed (HTTP ${r.res.status})`;
  if (/already exists/i.test(msg)) return { name, reused: true };
  throw new Error(msg);
}
async function findPagesProject(token, accountId, project) {
  const r = await cfFetch7(token, `/accounts/${accountId}/pages/projects/${project}`);
  if (r.res.ok && r.body?.result?.subdomain) {
    return { subdomain: r.body.result.subdomain };
  }
  return null;
}
async function ensurePagesProject(token, accountId, project, siteName, d1Id, r2Name, owner, repoName, setupToken) {
  const existing = await findPagesProject(token, accountId, project);
  if (existing) return { subdomain: existing.subdomain, reused: true };
  const stripBindingsCmd = `printf '%s\\n' 'name = "` + project + `"' 'compatibility_date = "2026-05-18"' 'pages_build_output_dir = "./public"' > wrangler.toml`;
  const payload = {
    name: project,
    production_branch: PROD_BRANCH,
    source: {
      type: "github",
      config: {
        owner,
        repo_name: repoName,
        production_branch: PROD_BRANCH,
        production_deployments_enabled: true,
        deployments_enabled: true
      }
    },
    build_config: {
      build_command: stripBindingsCmd,
      destination_dir: "public",
      root_dir: ""
    },
    deployment_configs: {
      production: {
        d1_databases: { DB: { id: d1Id } },
        r2_buckets: { IMAGES: { name: r2Name } },
        ai_bindings: { AI: {} },
        env_vars: {
          SITE_NAME: { type: "plain_text", value: siteName },
          SITE_URL: { type: "plain_text", value: "" },
          SETUP_TOKEN: { type: "secret_text", value: setupToken },
          CF_API_TOKEN: { type: "secret_text", value: token },
          CF_ACCOUNT_ID: { type: "secret_text", value: accountId },
          CF_PROJECT: { type: "plain_text", value: project },
          CF_D1_ID: { type: "secret_text", value: d1Id },
          CF_R2_NAME: { type: "plain_text", value: r2Name }
        }
      },
      preview: {
        d1_databases: { DB: { id: d1Id } },
        r2_buckets: { IMAGES: { name: r2Name } },
        ai_bindings: { AI: {} },
        env_vars: {
          SITE_NAME: { type: "plain_text", value: siteName },
          SITE_URL: { type: "plain_text", value: "" },
          SETUP_TOKEN: { type: "secret_text", value: setupToken },
          CF_API_TOKEN: { type: "secret_text", value: token },
          CF_ACCOUNT_ID: { type: "secret_text", value: accountId },
          CF_PROJECT: { type: "plain_text", value: project },
          CF_D1_ID: { type: "secret_text", value: d1Id },
          CF_R2_NAME: { type: "plain_text", value: r2Name }
        }
      }
    }
  };
  const r = await cfFetch7(token, `/accounts/${accountId}/pages/projects`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  if (r.res.ok && r.body?.result?.subdomain) {
    return { subdomain: r.body.result.subdomain, reused: false };
  }
  const msg = firstErrorMessage(r.body) || "";
  if (/already exists|name is unavailable/i.test(msg)) {
    const after = await findPagesProject(token, accountId, project);
    if (after) return { subdomain: after.subdomain, reused: true };
  }
  throw new Error(msg || `Pages create failed (HTTP ${r.res.status})`);
}
async function patchProjectConfig(token, accountId, project, opts) {
  const { pagesUrl, siteName, d1Id, r2Name, setupToken } = opts;
  const env_vars = {
    SITE_NAME: { type: "plain_text", value: siteName },
    SITE_URL: { type: "plain_text", value: pagesUrl },
    SETUP_TOKEN: { type: "secret_text", value: setupToken },
    CF_API_TOKEN: { type: "secret_text", value: token },
    CF_ACCOUNT_ID: { type: "secret_text", value: accountId },
    CF_PROJECT: { type: "plain_text", value: project },
    CF_D1_ID: { type: "secret_text", value: d1Id },
    CF_R2_NAME: { type: "plain_text", value: r2Name }
  };
  const bindings = {
    d1_databases: { DB: { id: d1Id } },
    r2_buckets: { IMAGES: { name: r2Name } },
    ai_bindings: { AI: {} }
  };
  const body = JSON.stringify({
    deployment_configs: {
      production: { ...bindings, env_vars },
      preview: { ...bindings, env_vars }
    }
  });
  const r = await cfFetch7(token, `/accounts/${accountId}/pages/projects/${project}`, {
    method: "PATCH",
    body
  });
  return { ok: r.res.ok, body: r.body };
}
async function verifyBindings(token, accountId, project, expected) {
  const r = await cfFetch7(token, `/accounts/${accountId}/pages/projects/${project}`);
  if (!r.res.ok) return { ok: false, reason: "fetch_failed" };
  const prod = r.body?.result?.deployment_configs?.production || {};
  const dbOk = prod?.d1_databases?.DB?.id === expected.d1Id;
  const r2Ok = prod?.r2_buckets?.IMAGES?.name === expected.r2Name;
  const aiOk = !!prod?.ai_bindings?.AI;
  const missing = [];
  if (!dbOk) missing.push("DB");
  if (!r2Ok) missing.push("IMAGES");
  if (!aiOk) missing.push("AI");
  return { ok: missing.length === 0, missing };
}
async function triggerDeploy(token, accountId, project) {
  await cfFetch7(token, `/accounts/${accountId}/pages/projects/${project}/deployments`, {
    method: "POST"
  }).catch(() => {
  });
}
async function fetchGithubPrimaryEmail(ghToken) {
  if (!ghToken) return "";
  try {
    const r = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: "token " + ghToken,
        Accept: "application/vnd.github+json",
        "User-Agent": "pages-seo-install"
      }
    });
    if (!r.ok) return "";
    const list = await r.json();
    if (!Array.isArray(list)) return "";
    const primary = list.find((e) => e?.primary && e?.verified);
    if (primary?.email) return String(primary.email);
    const anyVerified = list.find((e) => e?.verified);
    return anyVerified?.email ? String(anyVerified.email) : "";
  } catch {
    return "";
  }
}
var CF_API8, PROD_BRANCH, DEFAULT_REPO_NAME2, SLUG_RX, onRequestPost64, onRequestGet54;
var init_provision = __esm({
  "api/install/provision.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_oauth_cookie();
    CF_API8 = "https://api.cloudflare.com/client/v4";
    PROD_BRANCH = "main";
    DEFAULT_REPO_NAME2 = "pages-seo";
    SLUG_RX = /^[a-z][a-z0-9-]{1,32}$/;
    __name(fail2, "fail");
    __name(isGithubInstallError, "isGithubInstallError");
    __name(tokenFingerprint, "tokenFingerprint");
    __name(randomHex32, "randomHex32");
    __name(cfFetch7, "cfFetch");
    __name(firstErrorMessage, "firstErrorMessage");
    __name(loadState, "loadState");
    __name(saveStep, "saveStep");
    __name(ensureAccount, "ensureAccount");
    __name(findD1, "findD1");
    __name(ensureD1, "ensureD1");
    __name(findR2, "findR2");
    __name(ensureR2, "ensureR2");
    __name(findPagesProject, "findPagesProject");
    __name(ensurePagesProject, "ensurePagesProject");
    __name(patchProjectConfig, "patchProjectConfig");
    __name(verifyBindings, "verifyBindings");
    __name(triggerDeploy, "triggerDeploy");
    __name(fetchGithubPrimaryEmail, "fetchGithubPrimaryEmail");
    onRequestPost64 = /* @__PURE__ */ __name(async ({ env, request }) => {
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const token = String(body?.token || "").trim();
      const owner = String(body?.owner || "").trim();
      const repoName = String(body?.repo || "").trim() || DEFAULT_REPO_NAME2;
      const project = String(body?.project || "").trim().toLowerCase();
      const siteName = String(body?.site_name || "").trim();
      if (!token) return fail2("validate", 400, "API token required");
      if (!owner) return fail2("validate", 400, "GitHub owner required \u2014 fork the repo to your account first");
      if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner)) return fail2("validate", 400, "GitHub owner: letters, digits, dashes only.");
      if (!/^[A-Za-z0-9._-]{1,100}$/.test(repoName)) return fail2("validate", 400, "Repo name: letters, digits, dot, dash, underscore.");
      if (!SLUG_RX.test(project)) return fail2("validate", 400, "Project slug: lowercase letters/digits/dashes, 2\u201333 chars, must start with a letter");
      if (!siteName) return fail2("validate", 400, "Site name required");
      const fp = await tokenFingerprint(token);
      let state = await loadState(env, project, fp) || {};
      const setupToken = state.setup_token || randomHex32();
      if (!state.setup_token) {
        await saveStep(env, project, fp, { setup_token: setupToken });
      }
      let account;
      if (state.account_id) {
        account = { id: state.account_id };
      } else {
        try {
          account = await ensureAccount(token);
        } catch (e) {
          await saveStep(env, project, fp, { last_step: "account", last_error: String(e.message || e) });
          return fail2("account", 401, String(e.message || e));
        }
        await saveStep(env, project, fp, { account_id: account.id, last_step: "account", last_error: null });
      }
      let d1Id = state.d1_id;
      if (!d1Id) {
        try {
          const d1 = await ensureD1(token, account.id, project);
          d1Id = d1.id;
          await saveStep(env, project, fp, { d1_id: d1Id, last_step: "d1", last_error: null });
        } catch (e) {
          const msg = String(e.message || e);
          await saveStep(env, project, fp, { last_step: "d1", last_error: msg });
          const extras = /databases per account|d1.*limit|d1.*quota/i.test(msg) ? { hint: "d1_quota_exceeded", account_id: account.id } : {};
          return fail2("d1", 500, msg, extras);
        }
      }
      let r2Name = state.r2_name;
      if (!r2Name) {
        const desiredName = project + "-images";
        try {
          const r2 = await ensureR2(token, account.id, desiredName);
          r2Name = r2.name;
          await saveStep(env, project, fp, { r2_name: r2Name, last_step: "r2", last_error: null });
        } catch (e) {
          await saveStep(env, project, fp, { last_step: "r2", last_error: String(e.message || e) });
          return fail2("r2", 500, String(e.message || e));
        }
      }
      let pagesUrl = state.pages_url;
      if (!state.pages_created) {
        try {
          const p = await ensurePagesProject(token, account.id, project, siteName, d1Id, r2Name, owner, repoName, setupToken);
          pagesUrl = `https://${p.subdomain}`;
          await saveStep(env, project, fp, {
            pages_created: 1,
            pages_url: pagesUrl,
            last_step: "pages",
            last_error: null
          });
        } catch (e) {
          const msg = String(e.message || e);
          await saveStep(env, project, fp, { last_step: "pages", last_error: msg });
          const extras = isGithubInstallError(msg) ? {
            hint: "github_app_required",
            owner,
            repo: repoName,
            fork_url: `https://github.com/Benjamin-Bloch/pages-seo/fork`,
            repo_url: `https://github.com/${owner}/${repoName}`,
            github_app_install_url: `https://github.com/apps/cloudflare-workers-and-pages/installations/new/permissions?suggested_target_id=&repository_ids[]=`
          } : {};
          return fail2("pages", 500, msg, extras);
        }
      }
      await patchProjectConfig(token, account.id, project, {
        pagesUrl,
        siteName,
        d1Id,
        r2Name,
        setupToken
      });
      let verify = await verifyBindings(token, account.id, project, { d1Id, r2Name });
      let bindingsRetried = false;
      if (!verify.ok) {
        bindingsRetried = true;
        await patchProjectConfig(token, account.id, project, {
          pagesUrl,
          siteName,
          d1Id,
          r2Name,
          setupToken
        });
        verify = await verifyBindings(token, account.id, project, { d1Id, r2Name });
      }
      await saveStep(env, project, fp, {
        last_step: "bindings",
        last_error: verify.ok ? null : "bindings_missing_after_retry: " + (verify.missing || []).join(",")
      });
      if (!state.deploy_started) {
        await triggerDeploy(token, account.id, project);
        await saveStep(env, project, fp, { deploy_started: 1, last_step: "deploy", last_error: null });
      }
      let installedSha = "";
      try {
        const ghr = await fetch("https://api.github.com/repos/Benjamin-Bloch/pages-seo/commits/main", {
          headers: { "User-Agent": "pages-seo-installer", Accept: "application/vnd.github+json" }
        });
        if (ghr.ok) {
          const d = await ghr.json();
          if (d?.sha) installedSha = String(d.sha);
        }
      } catch {
      }
      let ghEmail = "";
      try {
        const session = await readOAuthCookie(env, request);
        ghEmail = await fetchGithubPrimaryEmail(session?.token);
      } catch {
      }
      const setupParams = new URLSearchParams({ setup: setupToken });
      if (ghEmail) setupParams.set("email", ghEmail);
      return json(200, {
        ok: true,
        pages_url: pagesUrl,
        account: { id: account.id },
        project,
        d1: { id: d1Id, name: project },
        r2: { name: r2Name },
        installed_sha: installedSha,
        resumed: !!state.account_id,
        // true if any state existed before this call
        // The new admin's first-visit URL. The token is one-time: once
        // /api/setup on the new site has accepted it (and created the
        // first user), it stops working.
        admin_setup_url: `${pagesUrl}/admin?${setupParams}`,
        setup_token: setupToken,
        site_name: siteName,
        gh_email: ghEmail || null
      });
    }, "onRequestPost");
    onRequestGet54 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const u = new URL(request.url);
      const project = (u.searchParams.get("project") || "").toLowerCase();
      const fp = u.searchParams.get("token_fp") || "";
      if (!project || !fp) return json(400, { error: "missing_params" });
      const state = await loadState(env, project, fp);
      if (!state) return json(404, { ok: false, found: false });
      return json(200, { ok: true, found: true, state });
    }, "onRequestGet");
  }
});

// api/install/redeploy.js
async function cfFetch8(token, path, init) {
  const r = await fetch(CF_API9 + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...init?.headers || {}
    }
  });
  let body = null;
  try {
    body = await r.json();
  } catch {
  }
  return { status: r.status, ok: r.ok, body };
}
function firstError7(body) {
  if (Array.isArray(body?.errors) && body.errors.length) {
    return body.errors.map((e) => e.message || String(e)).join(" \xB7 ");
  }
  return body?.error || null;
}
async function syncFork(ghToken, owner, repo) {
  try {
    const r = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/merge-upstream`,
      {
        method: "POST",
        headers: {
          Authorization: "token " + ghToken,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "pages-seo-install"
        },
        body: JSON.stringify({ branch: UPSTREAM_BRANCH })
      }
    );
    let body = null;
    try {
      body = await r.json();
    } catch {
    }
    if (!r.ok) {
      return { error: body?.message || "HTTP " + r.status, status: r.status };
    }
    return {
      merge_type: body?.merge_type || "unknown",
      base_branch: body?.base_branch || UPSTREAM_BRANCH,
      message: body?.message || ""
    };
  } catch (e) {
    return { error: String(e?.message || e).slice(0, 200) };
  }
}
async function triggerCfDeploy(token, accountId, project) {
  const r = await cfFetch8(
    token,
    `/accounts/${accountId}/pages/projects/${project}/deployments`,
    { method: "POST" }
  );
  if (r.status === 401 || r.status === 403) {
    return { error: "token_rejected", detail: firstError7(r.body) };
  }
  if (!r.ok) {
    return { error: "cf_api_error", detail: firstError7(r.body) || "HTTP " + r.status };
  }
  const result = r.body?.result || {};
  return {
    id: result.id || null,
    url: result.url || null
  };
}
var CF_API9, UPSTREAM_BRANCH, onRequestPost65;
var init_redeploy = __esm({
  "api/install/redeploy.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_oauth_cookie();
    CF_API9 = "https://api.cloudflare.com/client/v4";
    UPSTREAM_BRANCH = "main";
    __name(cfFetch8, "cfFetch");
    __name(firstError7, "firstError");
    __name(syncFork, "syncFork");
    __name(triggerCfDeploy, "triggerCfDeploy");
    onRequestPost65 = /* @__PURE__ */ __name(async ({ env, request }) => {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json(400, { ok: false, error: "bad_json" });
      }
      const token = String(payload?.token || "").trim();
      const accountId = String(payload?.account_id || "").trim().toLowerCase();
      const project = String(payload?.project || "").trim().toLowerCase();
      const owner = String(payload?.owner || "").trim();
      const repo = String(payload?.repo || "").trim();
      if (!token) return json(400, { ok: false, error: "missing_token" });
      if (!/^[a-f0-9]{32}$/.test(accountId)) return json(400, { ok: false, error: "bad_account_id" });
      if (!/^[a-z][a-z0-9-]{1,32}$/.test(project)) return json(400, { ok: false, error: "bad_project" });
      if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner)) return json(400, { ok: false, error: "bad_owner" });
      if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo)) return json(400, { ok: false, error: "bad_repo" });
      let ghToken = "";
      try {
        const session = await readOAuthCookie(env, request);
        ghToken = session?.token || "";
      } catch {
      }
      const sync = ghToken ? await syncFork(ghToken, owner, repo) : { error: "no_github_session", detail: "Sign in with GitHub again to sync your fork. Triggering Cloudflare redeploy with current fork state." };
      const deploy = await triggerCfDeploy(token, accountId, project);
      if (deploy.error === "token_rejected") {
        return json(401, { ok: false, error: "token_rejected", detail: deploy.detail, sync });
      }
      if (deploy.error) {
        return json(502, { ok: false, error: deploy.error, detail: deploy.detail, sync });
      }
      return json(200, { ok: true, sync, deploy });
    }, "onRequestPost");
  }
});

// api/install/repair.js
async function cfFetch9(token, path, init = {}) {
  const res = await fetch(CF_API10 + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
  }
  return { res, body };
}
function firstError8(body) {
  if (Array.isArray(body?.errors) && body.errors.length) {
    return body.errors.map((e) => e.message || String(e)).join(" \xB7 ");
  }
  return body?.error || null;
}
async function resolveAccount2(token) {
  const r = await cfFetch9(token, "/accounts");
  if (!r.res.ok || !r.body?.result?.length) {
    throw new Error(firstError8(r.body) || "Token rejected by Cloudflare.");
  }
  return r.body.result[0].id;
}
async function findD12(token, accountId, name) {
  const r = await cfFetch9(token, `/accounts/${accountId}/d1/database?name=${encodeURIComponent(name)}&per_page=50`);
  if (!r.res.ok) return null;
  const hit = (r.body?.result || []).find((row) => row.name === name);
  return hit ? hit.uuid : null;
}
async function findR22(token, accountId, name) {
  let cursor = "";
  for (let i = 0; i < 5; i++) {
    const url = `/accounts/${accountId}/r2/buckets?per_page=100${cursor ? "&cursor=" + cursor : ""}`;
    const r = await cfFetch9(token, url);
    if (!r.res.ok) return null;
    const buckets = r.body?.result?.buckets || r.body?.result || [];
    if (buckets.find((b) => b.name === name)) return name;
    cursor = r.body?.result_info?.cursor || "";
    if (!cursor) break;
  }
  return null;
}
var CF_API10, onRequestPost66;
var init_repair = __esm({
  "api/install/repair.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    CF_API10 = "https://api.cloudflare.com/client/v4";
    __name(cfFetch9, "cfFetch");
    __name(firstError8, "firstError");
    __name(resolveAccount2, "resolveAccount");
    __name(findD12, "findD1");
    __name(findR22, "findR2");
    onRequestPost66 = /* @__PURE__ */ __name(async ({ request }) => {
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const token = String(body?.token || "").trim();
      const project = String(body?.project || "").trim().toLowerCase();
      let accountId = String(body?.account_id || "").trim();
      if (!token) return json(400, { error: "missing_token" });
      if (!project) return json(400, { error: "missing_project" });
      try {
        if (!accountId) accountId = await resolveAccount2(token);
        const projR = await cfFetch9(token, `/accounts/${accountId}/pages/projects/${project}`);
        if (!projR.res.ok) {
          return json(404, { error: "project_not_found", detail: firstError8(projR.body) || "HTTP " + projR.res.status });
        }
        const proj = projR.body?.result;
        const pagesUrl = proj?.subdomain ? `https://${proj.subdomain}` : "";
        const d1Id = await findD12(token, accountId, project);
        if (!d1Id) return json(404, { error: "d1_not_found", detail: `No D1 database named "${project}". Re-run /install instead.` });
        const r2Name = await findR22(token, accountId, `${project}-images`);
        if (!r2Name) return json(404, { error: "r2_not_found", detail: `No R2 bucket named "${project}-images". Re-run /install instead.` });
        const existingProdEnv = proj?.deployment_configs?.production?.env_vars || {};
        const existingPrevEnv = proj?.deployment_configs?.preview?.env_vars || existingProdEnv;
        const mergedProdEnv = {
          ...existingProdEnv,
          CF_API_TOKEN: { type: "secret_text", value: token },
          CF_ACCOUNT_ID: { type: "secret_text", value: accountId },
          CF_PROJECT: { type: "plain_text", value: project },
          CF_D1_ID: { type: "secret_text", value: d1Id },
          CF_R2_NAME: { type: "plain_text", value: r2Name },
          SITE_URL: existingProdEnv.SITE_URL || { type: "plain_text", value: pagesUrl }
        };
        const mergedPrevEnv = {
          ...existingPrevEnv,
          CF_API_TOKEN: { type: "secret_text", value: token },
          CF_ACCOUNT_ID: { type: "secret_text", value: accountId },
          CF_PROJECT: { type: "plain_text", value: project },
          CF_D1_ID: { type: "secret_text", value: d1Id },
          CF_R2_NAME: { type: "plain_text", value: r2Name },
          SITE_URL: existingPrevEnv.SITE_URL || { type: "plain_text", value: pagesUrl }
        };
        const bindings = {
          d1_databases: { DB: { id: d1Id } },
          r2_buckets: { IMAGES: { name: r2Name } },
          ai_bindings: { AI: {} }
        };
        const patchBody = JSON.stringify({
          deployment_configs: {
            production: { ...bindings, env_vars: mergedProdEnv },
            preview: { ...bindings, env_vars: mergedPrevEnv }
          }
        });
        let patchR = await cfFetch9(token, `/accounts/${accountId}/pages/projects/${project}`, { method: "PATCH", body: patchBody });
        let verifyR = await cfFetch9(token, `/accounts/${accountId}/pages/projects/${project}`);
        let prodAfter = verifyR.body?.result?.deployment_configs?.production || {};
        let dbOk = prodAfter?.d1_databases?.DB?.id === d1Id;
        let r2Ok = prodAfter?.r2_buckets?.IMAGES?.name === r2Name;
        let aiOk = !!prodAfter?.ai_bindings?.AI;
        let retried = false;
        if (!(dbOk && r2Ok && aiOk)) {
          retried = true;
          await cfFetch9(token, `/accounts/${accountId}/pages/projects/${project}`, { method: "PATCH", body: patchBody });
          verifyR = await cfFetch9(token, `/accounts/${accountId}/pages/projects/${project}`);
          prodAfter = verifyR.body?.result?.deployment_configs?.production || {};
          dbOk = prodAfter?.d1_databases?.DB?.id === d1Id;
          r2Ok = prodAfter?.r2_buckets?.IMAGES?.name === r2Name;
          aiOk = !!prodAfter?.ai_bindings?.AI;
        }
        const deployR = await cfFetch9(token, `/accounts/${accountId}/pages/projects/${project}/deployments`, { method: "POST" });
        const healthy = dbOk && r2Ok && aiOk;
        return json(healthy ? 200 : 500, {
          ok: healthy,
          project,
          pages_url: pagesUrl,
          bindings: { DB: dbOk, IMAGES: r2Ok, AI: aiOk },
          patch_retried: retried,
          deploy_triggered: deployR.res.ok,
          detail: healthy ? null : "Bindings still missing after two PATCH attempts."
        });
      } catch (e) {
        return json(500, { error: "repair_failed", detail: String(e?.message || e) });
      }
    }, "onRequestPost");
  }
});

// api/public/latest-post.js
var onRequestGet55;
var init_latest_post = __esm({
  "api/public/latest-post.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    onRequestGet55 = /* @__PURE__ */ __name(async ({ env }) => {
      if (!env?.DB) {
        return json(200, { ok: true, post: null, note: "no_db" });
      }
      try {
        const row = await env.DB.prepare(
          `SELECT slug, title, meta_description, keywords, hero_image_key,
              published_at, ai_provider, LENGTH(body_markdown) AS body_chars
         FROM blog_posts
        WHERE status = 'published'
        ORDER BY published_at DESC LIMIT 1`
        ).first();
        if (!row) {
          return new Response(JSON.stringify({ ok: true, post: null }), {
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "public, max-age=60",
              "access-control-allow-origin": "*"
            }
          });
        }
        return new Response(JSON.stringify({
          ok: true,
          post: {
            slug: row.slug,
            title: row.title,
            meta_description: row.meta_description,
            keywords: row.keywords,
            body_chars: row.body_chars,
            provider: row.ai_provider,
            published_at: row.published_at,
            published_iso: new Date((row.published_at || 0) * 1e3).toISOString(),
            hero_image_url: row.hero_image_key ? "/image/" + row.hero_image_key.split("/").map(encodeURIComponent).join("/") : null,
            url: "/blog/" + row.slug
          }
        }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "public, max-age=300",
            // 5 minutes
            "access-control-allow-origin": "*"
          }
        });
      } catch (e) {
        return json(500, { ok: false, error: String(e?.message || e).slice(0, 200) });
      }
    }, "onRequestGet");
  }
});

// api/public/register.js
function validEmail2(s) {
  return typeof s === "string" && s.length > 3 && s.length < 200 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}
var MIN_PW2, MAX_PW2, onRequestPost67;
var init_register = __esm({
  "api/public/register.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_passwords();
    init_admin_token();
    init_events();
    MIN_PW2 = 8;
    MAX_PW2 = 256;
    __name(validEmail2, "validEmail");
    onRequestPost67 = /* @__PURE__ */ __name(async ({ env, request }) => {
      if (!env?.DB) return json(500, { error: "no_db" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const email = String(body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      const websiteUrl = String(body?.website_url || "").trim();
      if (!validEmail2(email)) return json(400, { error: "invalid_email" });
      if (password.length < MIN_PW2 || password.length > MAX_PW2) {
        return json(400, { error: "password_length", min: MIN_PW2, max: MAX_PW2 });
      }
      const localPart = email.split("@")[0].replace(/[^a-z0-9]+/gi, " ").trim();
      const brandName = String(body?.brand_name || body?.name || "").trim() || (localPart ? localPart.charAt(0).toUpperCase() + localPart.slice(1) : "D\u1EF1 \xE1n m\u1EDBi");
      const otp = String(body?.otp || body?.otp_code || "").trim();
      if (!otp || otp.length !== 6) {
        return json(400, { error: "otp_required", detail: "Vui l\xF2ng nh\u1EADp m\xE3 x\xE1c th\u1EF1c OTP 6 s\u1ED1 \u0111\xE3 \u0111\u01B0\u1EE3c g\u1EEDi qua email." });
      }
      const existing = await env.DB.prepare(
        "SELECT id FROM users WHERE email = ? LIMIT 1"
      ).bind(email).first().catch(() => null);
      if (existing) {
        return json(409, { error: "email_already_exists", detail: "Email n\xE0y \u0111\xE3 \u0111\u01B0\u1EE3c \u0111\u0103ng k\xFD t\xE0i kho\u1EA3n." });
      }
      const now = nowSec();
      const verification = await env.DB.prepare(
        "SELECT otp_code, expires_at FROM email_verifications WHERE email = ? LIMIT 1"
      ).bind(email).first().catch(() => null);
      if (!verification) {
        return json(400, { error: "otp_not_found", detail: "Ch\u01B0a c\xF3 m\xE3 OTP n\xE0o \u0111\u01B0\u1EE3c g\u1EEDi cho email n\xE0y. Vui l\xF2ng b\u1EA5m G\u1EEDi OTP." });
      }
      if (verification.expires_at < now) {
        return json(400, { error: "otp_expired", detail: "M\xE3 OTP \u0111\xE3 h\u1EBFt hi\u1EC7u l\u1EF1c (qu\xE1 10 ph\xFAt). Vui l\xF2ng y\xEAu c\u1EA7u m\xE3 m\u1EDBi." });
      }
      if (verification.otp_code !== otp) {
        return json(400, { error: "otp_invalid", detail: "M\xE3 OTP kh\xF4ng ch\xEDnh x\xE1c. Vui l\xF2ng ki\u1EC3m tra l\u1EA1i h\u1ED9p th\u01B0 Gmail." });
      }
      await env.DB.prepare("UPDATE email_verifications SET verified_at = ? WHERE email = ?").bind(now, email).run();
      let creds;
      try {
        creds = await hashPassword(password);
      } catch (e) {
        return json(400, { error: String(e?.message || e) });
      }
      const t = nowSec();
      const userId = newId();
      const projectId = `proj_${newId().slice(0, 12)}`;
      let baseSlug = slugify(brandName) || "brand";
      let slug = baseSlug;
      for (let i = 1; i <= 10; i++) {
        const existingSlug = await env.DB.prepare(
          "SELECT id FROM projects WHERE slug = ? LIMIT 1"
        ).bind(slug).first().catch(() => null);
        if (!existingSlug) break;
        slug = `${baseSlug}-${i}`;
      }
      const url = new URL(request.url);
      const publishingUrl = `${url.origin}/${slug}`;
      await env.DB.prepare(
        `INSERT INTO projects (
      id, slug, name, description, website_url, publishing_url,
      site_name, site_description, language, timezone, status, approval_mode,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'vi', 'Asia/Ho_Chi_Minh', 'active', 'auto', ?, ?)`
      ).bind(
        projectId,
        slug,
        brandName,
        `SEO & Content Hub cho ${brandName}`,
        // Deliberately empty, NOT `https://<slug>.com`. Fabricating a domain meant
        // the setup wizard prefilled its website field with a URL that does not
        // exist, so the first thing the operator did was click "read my site" and
        // watch it fail on an address they never typed. Empty forces them to enter
        // the real one.
        websiteUrl,
        publishingUrl,
        brandName,
        `Chuy\xEAn trang n\u1ED9i dung & gi\u1EA3i ph\xE1p t\u1EEB ${brandName}`,
        t,
        t
      ).run();
      await env.DB.prepare(
        `INSERT INTO project_ai_configs (
      project_id, default_text_provider, default_image_provider, text_model, image_model, min_words, max_words, temperature, system_prompt_override, created_at, updated_at
    ) VALUES (?, 'workers-ai', 'workers-ai', '@cf/meta/llama-3.3-70b-instruct', '@cf/black-forest-labs/flux-1-schnell', 1200, 2500, 0.7, '', ?, ?)`
      ).bind(projectId, t, t).run();
      await env.DB.prepare(
        `INSERT INTO project_publishing_configs (
      project_id, publisher_type, endpoint_url, auth_header, config_json, created_at, updated_at
    ) VALUES (?, 'internal_d1', '', '', '{}', ?, ?)`
      ).bind(projectId, t, t).run();
      await env.DB.prepare(
        `INSERT INTO project_schedules (
      project_id, frequency, cron_expression, preferred_time_utc, is_active, created_at, updated_at
    ) VALUES (?, 'daily', '0 1 * * *', '01:00', 1, ?, ?)`
      ).bind(projectId, t, t).run();
      await env.DB.prepare(
        `INSERT INTO users (
      id, email, password_hash, password_salt, created_at, role, project_id, plan_tier, post_limit
    ) VALUES (?, ?, ?, ?, ?, 'project_admin', ?, 'free', 100)`
      ).bind(
        userId,
        email,
        creds.hash,
        creds.salt,
        t,
        projectId
      ).run();
      audit(env, "user", "register_free", userId, { email, project_id: projectId, plan: "free", post_limit: 100 });
      await track(env, { event: "signup", projectId, userId, props: { plan: "free" } });
      const adminToken = await getAdminToken(env);
      if (!adminToken) {
        return json(200, { ok: true, id: userId, email, project_id: projectId, plan_tier: "free", post_limit: 100 });
      }
      const sessionId = newSessionId();
      const expires = sessionExpirySec();
      await env.DB.prepare(
        `INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?)`
      ).bind(
        sessionId,
        userId,
        t,
        expires,
        (request.headers.get("user-agent") || "").slice(0, 400)
      ).run();
      const token = await signSession(sessionId, adminToken);
      const maxAge = expires - t;
      return new Response(JSON.stringify({
        ok: true,
        id: userId,
        email,
        project_id: projectId,
        project_slug: slug,
        plan_tier: "free",
        post_limit: 100
      }), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "set-cookie": buildSessionCookie(token, maxAge),
          "cache-control": "no-store"
        }
      });
    }, "onRequestPost");
  }
});

// api/public/send-otp.js
function validEmail3(s) {
  return typeof s === "string" && s.length > 3 && s.length < 200 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}
var onRequestPost68;
var init_send_otp = __esm({
  "api/public/send-otp.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_email_smtp();
    __name(validEmail3, "validEmail");
    onRequestPost68 = /* @__PURE__ */ __name(async ({ env, request }) => {
      if (!env?.DB) return json(500, { error: "no_db" });
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const email = String(body?.email || "").trim().toLowerCase();
      const brandName = String(body?.brand_name || body?.name || "GU SEO").trim();
      if (!validEmail3(email)) return json(400, { error: "invalid_email", detail: "Email kh\xF4ng \u0111\xFAng \u0111\u1ECBnh d\u1EA1ng" });
      const existing = await env.DB.prepare(
        "SELECT id FROM users WHERE email = ? LIMIT 1"
      ).bind(email).first().catch(() => null);
      if (existing) {
        return json(409, { error: "email_already_exists", detail: "Email n\xE0y \u0111\xE3 \u0111\u01B0\u1EE3c s\u1EED d\u1EE5ng. Vui l\xF2ng \u0111\u0103ng nh\u1EADp." });
      }
      const now = nowSec();
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      const otpCode = String(1e5 + array[0] % 9e5);
      const expiresAt = now + 10 * 60;
      await env.DB.prepare(
        `INSERT INTO email_verifications (email, otp_code, created_at, expires_at, verified_at)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(email) DO UPDATE SET
       otp_code = excluded.otp_code,
       created_at = excluded.created_at,
       expires_at = excluded.expires_at,
       verified_at = NULL`
      ).bind(email, otpCode, now, expiresAt).run();
      try {
        await sendOtpEmail({
          toEmail: email,
          otpCode,
          brandName
        });
        return json(200, {
          ok: true,
          email,
          expires_in_sec: 600,
          message: "M\xE3 OTP \u0111\xE3 \u0111\u01B0\u1EE3c g\u1EEDi \u0111\u1EBFn email c\u1EE7a b\u1EA1n."
        });
      } catch (err) {
        return json(500, {
          error: "smtp_send_failed",
          detail: "Kh\xF4ng th\u1EC3 g\u1EEDi email OTP qua m\xE1y ch\u1EE7 Gmail: " + (err.message || String(err))
        });
      }
    }, "onRequestPost");
  }
});

// api/update/diff.js
function ghHeaders4() {
  return {
    "User-Agent": "pages-seo-update",
    Accept: "application/vnd.github+json"
  };
}
function short2(sha) {
  return String(sha || "").slice(0, 7);
}
var UPSTREAM_OWNER4, UPSTREAM_REPO4, BRANCH2, onRequestGet56;
var init_diff = __esm({
  "api/update/diff.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    UPSTREAM_OWNER4 = "Benjamin-Bloch";
    UPSTREAM_REPO4 = "pages-seo";
    BRANCH2 = "main";
    __name(ghHeaders4, "ghHeaders");
    __name(short2, "short");
    onRequestGet56 = /* @__PURE__ */ __name(async ({ request }) => {
      const url = new URL(request.url);
      const base = String(url.searchParams.get("base") || "").trim();
      if (base && !/^[0-9a-f]{7,40}$/.test(base)) {
        return json(400, { ok: false, error: "bad_sha" });
      }
      let latest;
      try {
        const r = await fetch(
          `https://api.github.com/repos/${UPSTREAM_OWNER4}/${UPSTREAM_REPO4}/commits/${BRANCH2}`,
          { headers: ghHeaders4() }
        );
        if (!r.ok) {
          return json(502, { ok: false, error: "github_latest_failed", detail: "HTTP " + r.status });
        }
        latest = await r.json();
      } catch (e) {
        return json(502, { ok: false, error: "github_unreachable", detail: String(e?.message || e) });
      }
      const latestSha = latest.sha;
      const latestOut = {
        sha: latestSha,
        short: short2(latestSha),
        date: latest.commit?.author?.date || null,
        message: (latest.commit?.message || "").split("\n")[0]
      };
      if (!base) {
        let recent = [];
        try {
          const r = await fetch(
            `https://api.github.com/repos/${UPSTREAM_OWNER4}/${UPSTREAM_REPO4}/commits?per_page=30`,
            { headers: ghHeaders4() }
          );
          if (r.ok) {
            const arr = await r.json();
            if (Array.isArray(arr)) {
              recent = arr.map((c) => ({
                sha: c.sha,
                short: short2(c.sha),
                message: (c.commit?.message || "").split("\n")[0].slice(0, 200),
                date: c.commit?.author?.date || null,
                url: c.html_url,
                author: c.author?.login || c.commit?.author?.name || "unknown"
              }));
            }
          }
        } catch {
        }
        return json(200, {
          ok: true,
          latest: latestOut,
          current: null,
          ahead: null,
          up_to_date: false,
          commits: [],
          recent,
          files_changed: 0,
          additions: 0,
          deletions: 0
        });
      }
      if (base === latestSha || latestSha.startsWith(base) || base.startsWith(latestSha.slice(0, base.length))) {
        return json(200, {
          ok: true,
          latest: latestOut,
          current: { sha: base, short: short2(base) },
          ahead: 0,
          up_to_date: true,
          commits: [],
          files_changed: 0,
          additions: 0,
          deletions: 0
        });
      }
      let cmp;
      try {
        const r = await fetch(
          `https://api.github.com/repos/${UPSTREAM_OWNER4}/${UPSTREAM_REPO4}/compare/${base}...${latestSha}`,
          { headers: ghHeaders4() }
        );
        if (!r.ok) {
          return json(502, { ok: false, error: "github_compare_failed", detail: "HTTP " + r.status });
        }
        cmp = await r.json();
      } catch (e) {
        return json(502, { ok: false, error: "github_unreachable", detail: String(e?.message || e) });
      }
      const commits = (cmp.commits || []).map((c) => ({
        sha: c.sha,
        short: short2(c.sha),
        message: (c.commit?.message || "").split("\n")[0].slice(0, 200),
        date: c.commit?.author?.date || null,
        url: c.html_url,
        author: c.author?.login || c.commit?.author?.name || "unknown"
      }));
      return json(200, {
        ok: true,
        latest: latestOut,
        current: { sha: base, short: short2(base) },
        ahead: commits.length,
        up_to_date: commits.length === 0,
        commits,
        files_changed: cmp.files?.length || 0,
        additions: (cmp.files || []).reduce((n, f) => n + (f.additions || 0), 0),
        deletions: (cmp.files || []).reduce((n, f) => n + (f.deletions || 0), 0)
      });
    }, "onRequestGet");
  }
});

// api/update/rebuild.js
async function cf(token, path, init = {}) {
  const r = await fetch(CF_API11 + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
  let body = null;
  try {
    body = await r.json();
  } catch {
  }
  return { res: r, body };
}
function firstErrorMessage2(body) {
  if (!body) return null;
  if (Array.isArray(body.errors) && body.errors.length) {
    return body.errors.map((e) => e.message || String(e)).join(" \xB7 ");
  }
  return body.error || body.detail || null;
}
var CF_API11, NAME_RX3, onRequestPost69;
var init_rebuild = __esm({
  "api/update/rebuild.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    CF_API11 = "https://api.cloudflare.com/client/v4";
    __name(cf, "cf");
    __name(firstErrorMessage2, "firstErrorMessage");
    NAME_RX3 = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
    onRequestPost69 = /* @__PURE__ */ __name(async ({ request }) => {
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { ok: false, error: "bad_json" });
      }
      const token = String(body?.token || "").trim();
      const owner = String(body?.owner || "").trim();
      const repo = String(body?.repo || "").trim() || "pages-seo";
      if (!token) return json(400, { ok: false, error: "token_required" });
      if (!NAME_RX3.test(owner)) return json(400, { ok: false, error: "bad_owner" });
      if (!NAME_RX3.test(repo)) return json(400, { ok: false, error: "bad_repo" });
      const accR = await cf(token, "/accounts");
      if (!accR.res.ok || !accR.body?.result?.length) {
        return json(401, { ok: false, error: "token_rejected", detail: firstErrorMessage2(accR.body) || "check scopes" });
      }
      const accountId = accR.body.result[0].id;
      let page = 1, perPage = 25, found = null;
      while (page <= 8) {
        const listR = await cf(token, `/accounts/${accountId}/pages/projects?page=${page}&per_page=${perPage}`);
        if (!listR.res.ok) {
          return json(502, { ok: false, error: "list_projects_failed", detail: firstErrorMessage2(listR.body) || "HTTP " + listR.res.status });
        }
        const rows = listR.body?.result || [];
        for (const p of rows) {
          const src = p?.source?.config || {};
          if (src.owner && src.repo_name && src.owner.toLowerCase() === owner.toLowerCase() && src.repo_name.toLowerCase() === repo.toLowerCase()) {
            found = p;
            break;
          }
        }
        if (found) break;
        if (rows.length < perPage) break;
        page++;
      }
      if (!found) {
        return json(404, {
          ok: false,
          error: "project_not_found",
          detail: `No Pages project on this Cloudflare account is linked to ${owner}/${repo}. Did you select the wrong account, or use the CLI install path?`
        });
      }
      const projectName = found.name;
      const subdomain = found.subdomain || `${projectName}.pages.dev`;
      const depR = await cf(token, `/accounts/${accountId}/pages/projects/${projectName}/deployments`, { method: "POST" });
      if (!depR.res.ok) {
        return json(depR.res.status || 502, {
          ok: false,
          error: "deploy_failed",
          detail: firstErrorMessage2(depR.body) || "HTTP " + depR.res.status
        });
      }
      return json(200, {
        ok: true,
        project: projectName,
        pages_url: `https://${subdomain}`,
        deployment_id: depR.body?.result?.id || null
      });
    }, "onRequestPost");
  }
});

// api/embed/[id].js
var CACHE_SEC, onRequestGet57;
var init_id2 = __esm({
  "api/embed/[id].js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_widget_render();
    init_embed_settings();
    CACHE_SEC = 300;
    onRequestGet57 = /* @__PURE__ */ __name(async ({ env, params, request }) => {
      if (!env?.DB) return json(500, { error: "no_db" });
      const id = String(params.id || "").trim();
      if (!id || !/^[a-zA-Z0-9_-]{6,64}$/.test(id)) {
        return new Response("// embed: invalid id\n", {
          status: 404,
          headers: { "content-type": "application/javascript; charset=utf-8" }
        });
      }
      const embed2 = await env.DB.prepare(
        `SELECT e.id, e.name, e.settings_json, p.slug AS project_slug, p.language AS project_language,
            p.theme_color AS project_theme_color
       FROM blog_embeds e LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.id = ? LIMIT 1`
      ).bind(id).first().catch(() => null);
      let settings = {};
      if (embed2?.settings_json) {
        try {
          settings = JSON.parse(embed2.settings_json) || {};
        } catch {
        }
      }
      const url = new URL(request.url);
      const js = widgetBody(embedWidgetOptions({
        settings,
        embed: { ...embed2 || {}, id },
        origin: `${url.protocol}//${url.host}`
      }));
      return new Response(js, {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": `public, max-age=${CACHE_SEC}`,
          "access-control-allow-origin": "*"
        }
      });
    }, "onRequestGet");
  }
});

// blog/page/[page].js
var onRequestGet58;
var init_page2 = __esm({
  "blog/page/[page].js"() {
    init_functionsRoutes_0_09583509623234443();
    init_blog();
    onRequestGet58 = /* @__PURE__ */ __name(({ env, request, params }) => {
      const page = parseInt(params.page, 10);
      if (!Number.isFinite(page) || page < 1) {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      }
      if (page === 1) {
        const u = new URL(request.url);
        u.pathname = "/blog";
        return new Response(null, { status: 301, headers: { location: u.toString() } });
      }
      return renderBlogIndex({ env, request, page });
    }, "onRequestGet");
  }
});

// blog/[slug].js
var onRequestGet59;
var init_slug2 = __esm({
  "blog/[slug].js"() {
    init_functionsRoutes_0_09583509623234443();
    init_page_render();
    init_settings();
    init_project_scope();
    onRequestGet59 = /* @__PURE__ */ __name(async ({ env, request, params }) => {
      const slug = String(params.slug || "").toLowerCase();
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      }
      const projectSlug = String(params.project || "").toLowerCase() || null;
      const basePath = projectSlug ? `/${projectSlug}` : "";
      try {
        const r = await env.DB.prepare(
          `SELECT new_slug FROM blog_post_redirects WHERE old_slug = ? LIMIT 1`
        ).bind(slug).first();
        if (r?.new_slug) {
          return Response.redirect(new URL(`${basePath}/blog/${r.new_slug}`, request.url).toString(), 301);
        }
      } catch {
      }
      let project = null;
      if (projectSlug) {
        project = await resolveProjectBySlug(env, projectSlug).catch(() => null);
        if (!project) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      } else {
        project = await resolveProjectForRequest(env, request).catch(() => null);
      }
      const projectId = project?.id || null;
      const postSql = projectId ? `SELECT slug, title, meta_description, body_markdown, hero_image_key, hero_image_alt,
              keywords, status, published_at
         FROM blog_posts WHERE slug = ? AND project_id = ? LIMIT 1` : `SELECT slug, title, meta_description, body_markdown, hero_image_key, hero_image_alt,
              keywords, status, published_at
         FROM blog_posts WHERE slug = ? LIMIT 1`;
      const post = await (projectId ? env.DB.prepare(postSql).bind(slug, projectId) : env.DB.prepare(postSql).bind(slug)).first();
      if (!post) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      if (post.status === "hidden") return new Response("Gone", { status: 410, headers: { "content-type": "text/plain" } });
      if (post.status === "review") return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      post.urlPath = `${basePath}/blog/` + post.slug;
      const relatedSql = projectId ? `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at
         FROM blog_posts
        WHERE status='published' AND slug != ? AND project_id = ?
        ORDER BY published_at DESC LIMIT 3` : `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at
         FROM blog_posts
        WHERE status='published' AND slug != ?
        ORDER BY published_at DESC LIMIT 3`;
      const relatedRows = await (projectId ? env.DB.prepare(relatedSql).bind(slug, projectId) : env.DB.prepare(relatedSql).bind(slug)).all().catch(() => ({ results: [] }));
      const related = relatedRows.results || [];
      const settings = await loadSettings(env).catch(() => ({}));
      if (settings?.hero_image_mode === "cover") {
        try {
          const t = await env.DB.prepare(
            "SELECT updated_at FROM cover_templates WHERE is_default = 1 LIMIT 1"
          ).first();
          settings._has_default_template = !!t;
          settings._default_template_v = t?.updated_at || 0;
        } catch {
          settings._has_default_template = false;
          settings._default_template_v = 0;
        }
      }
      return new Response(renderContentPage({ env, request, post, kind: "blog", related, settings, basePath, project }), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=600, s-maxage=3600",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin"
        }
      });
    }, "onRequestGet");
  }
});

// [project]/blog/[slug].js
var onRequestGet60;
var init_slug3 = __esm({
  "[project]/blog/[slug].js"() {
    init_functionsRoutes_0_09583509623234443();
    init_slug2();
    init_project_scope();
    onRequestGet60 = /* @__PURE__ */ __name(async (ctx) => {
      const projectSlug = String(ctx.params?.project || "").toLowerCase();
      const project = await resolveProjectBySlugPath(ctx.env, projectSlug).catch(() => null);
      if (!project) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      return onRequestGet59({ env: ctx.env, request: ctx.request, params: { project: projectSlug, slug: ctx.params?.slug } });
    }, "onRequestGet");
  }
});

// p/[slug].js
var onRequestGet61;
var init_slug4 = __esm({
  "p/[slug].js"() {
    init_functionsRoutes_0_09583509623234443();
    init_page_render();
    init_settings();
    init_project_scope();
    onRequestGet61 = /* @__PURE__ */ __name(async ({ env, request, params }) => {
      const slug = String(params.slug || "").toLowerCase();
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      }
      const projectSlug = String(params.project || "").toLowerCase() || null;
      const basePath = projectSlug ? `/${projectSlug}` : "";
      let project = null;
      if (projectSlug) {
        project = await resolveProjectBySlug(env, projectSlug).catch(() => null);
        if (!project) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      } else {
        project = await resolveProjectForRequest(env, request).catch(() => null);
      }
      const projectId = project?.id || null;
      const post = projectId ? await env.DB.prepare(
        `SELECT slug, title, meta_description, body_markdown, hero_image_key, hero_image_alt,
                status, published_at
           FROM prog_pages WHERE slug = ? AND project_id = ? LIMIT 1`
      ).bind(slug, projectId).first() : await env.DB.prepare(
        `SELECT slug, title, meta_description, body_markdown, hero_image_key, hero_image_alt,
                status, published_at
           FROM prog_pages WHERE slug = ? LIMIT 1`
      ).bind(slug).first();
      if (!post) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      if (post.status === "hidden") return new Response("Gone", { status: 410, headers: { "content-type": "text/plain" } });
      post.urlPath = `${basePath}/p/` + post.slug;
      const settings = await loadSettings(env).catch(() => ({}));
      if (settings?.hero_image_mode === "cover") {
        try {
          const t = await env.DB.prepare(
            "SELECT updated_at FROM cover_templates WHERE is_default = 1 LIMIT 1"
          ).first();
          settings._has_default_template = !!t;
          settings._default_template_v = t?.updated_at || 0;
        } catch {
          settings._has_default_template = false;
          settings._default_template_v = 0;
        }
      }
      return new Response(renderContentPage({ env, request, post, kind: "programmatic", settings, basePath, project }), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=600, s-maxage=3600",
          "x-content-type-options": "nosniff",
          "referrer-policy": "strict-origin-when-cross-origin"
        }
      });
    }, "onRequestGet");
  }
});

// [project]/p/[slug].js
var onRequestGet62;
var init_slug5 = __esm({
  "[project]/p/[slug].js"() {
    init_functionsRoutes_0_09583509623234443();
    init_slug4();
    init_project_scope();
    onRequestGet62 = /* @__PURE__ */ __name(async (ctx) => {
      const projectSlug = String(ctx.params?.project || "").toLowerCase();
      const project = await resolveProjectBySlugPath(ctx.env, projectSlug).catch(() => null);
      if (!project) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      return onRequestGet61({ env: ctx.env, request: ctx.request, params: { project: projectSlug, slug: ctx.params?.slug } });
    }, "onRequestGet");
  }
});

// api/ai-prompt.js
function cleanUrl2(input, fallback) {
  if (!input) return fallback;
  let s = String(input).trim();
  if (!s) return fallback;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return u.origin + u.pathname.replace(/\/$/, "");
  } catch {
    return fallback;
  }
}
function cleanSlug(input) {
  if (!input) return null;
  const s = String(input).toLowerCase().trim().replace(/[^a-z0-9-]/g, "").slice(0, 64);
  return s || null;
}
function cleanGhUrl(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (!/^https?:\/\/github\.com\/[^/]+\/[^/]+/i.test(s)) return null;
  try {
    const u = new URL(s);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return "https://github.com/" + parts[0] + "/" + parts[1];
  } catch {
    return null;
  }
}
function ctxLines(ctx) {
  const out = [];
  if (ctx.slug) out.push(`- Project slug: ${ctx.slug}`);
  if (ctx.site) out.push(`- Live site: ${ctx.site}`);
  if (ctx.admin) out.push(`- Admin: ${ctx.admin}`);
  if (ctx.gh) out.push(`- GitHub fork: ${ctx.gh}`);
  if (ctx.acct) out.push(`- CF account: ${ctx.acct}`);
  if (ctx.version) out.push(`- Version: ${ctx.version}`);
  return out;
}
function hasCtx(ctx) {
  return Object.values(ctx).some(Boolean);
}
function ccInstall(ctx) {
  const ctxBlock = hasCtx(ctx) ? `
## My environment

${ctxLines(ctx).join("\n")}
` : "";
  return `# Task: install pages-seo on my Cloudflare account

You are Claude Code running on my local machine. Install pages-seo
(open-source self-hosted programmatic-SEO + daily-AI-blog toolkit
for Cloudflare Pages) into my Cloudflare account, end to end. Do
not ask me to do anything you can do yourself.
${ctxBlock}
## Constraints (read before acting)

- The canonical installer is at https://seo.benjaminb.xyz/install/run.sh.
  Read it with WebFetch first. It is idempotent and uses \`wrangler\`
  exclusively \u2014 no GitHub App, no OAuth, no API tokens to paste.
- I have \`wrangler\` installed and logged in to my Cloudflare account.
  If \`wrangler whoami\` fails, stop and tell me to run \`wrangler login\`.
- Never \`rm -rf\` outside a tempdir you created yourself. The installer
  works from a fresh tempdir; respect that.
- Do not commit, push, or create GitHub PRs. The installer uses Direct
  Upload \u2014 no GitHub link is created.
- If a step needs a value I haven't given you (project slug, admin
  email, admin password), ask me ONCE in a single message that lists
  every value you need. Then proceed without further prompts.

## Step plan

1. \`wrangler whoami\` \u2014 confirm I'm authenticated. Halt if not.
2. Pull the installer: \`curl -fsSL https://seo.benjaminb.xyz/install/run.sh -o /tmp/pages-seo-install.sh\`
3. Read \`/tmp/pages-seo-install.sh\` so you understand what it will do.
4. Ask me for: project slug, site name, admin email, admin password.
   (Validate slug matches \`^[a-z][a-z0-9-]{1,32}$\` before continuing.)
5. Run the installer: \`bash /tmp/pages-seo-install.sh\`. Pipe answers via
   stdin in the order it asks. Stream stdout so I can see progress.
6. Verify install: GET \`https://<slug>.pages.dev/api/health\`. Expect
   HTTP 200, JSON with \`db: "ok"\`. If not, diagnose before reporting done.
7. Verify admin: GET \`https://<slug>.pages.dev/admin\`. Expect HTTP 200.
8. Tell me the magic-link URL the installer wrote to its tmpfile \u2014 do
   NOT print it to your final summary text (it contains my password).
   Print only the file path, like: "first-run link is at /tmp/.../admin-link.txt".

## Done criteria

\`/api/health\` returns 200 with \`db: ok\` AND \`/admin\` returns 200 AND
you have told me where the first-run link file is. Anything less is
not done \u2014 keep diagnosing.

## Start now

Run \`wrangler whoami\` and report what you find.`;
}
function ccUpdate(ctx) {
  const ctxBlock = hasCtx(ctx) ? `
## My install

${ctxLines(ctx).join("\n")}
` : `
## My install

Ask me for my project slug and live site URL before doing anything else. Validate slug matches \`^[a-z][a-z0-9-]{1,32}$\`.
`;
  const slugRef = ctx.slug ? `"${ctx.slug}"` : "the slug I give you";
  const siteRef = ctx.site || `https://<slug>.pages.dev`;
  return `# Task: update my pages-seo install to the latest release

You are Claude Code on my machine. Bring my existing pages-seo deploy
up to the latest tagged release without losing data.
${ctxBlock}
## Constraints

- Upstream is \`Benjamin-Bloch/pages-seo\` on GitHub. The latest stable
  is whatever \`/api/version\` on my site reports as \`tag\`.
- \`wrangler\` is logged in to the same Cloudflare account that owns
  the existing project. If not, halt and tell me to fix that.
- DO NOT drop or recreate the D1 database. DO NOT delete the R2 bucket.
  D1 schema migrations are applied additively by the install script;
  it is safe to re-run.
- Preserve existing Pages env vars and secrets. The installer only
  sets values it owns (\`SITE_NAME\`, \`SITE_URL\`) and skips anything
  already present.

## Step plan

1. Get current version: \`curl -s ${siteRef}/api/version\`. Note the
   \`tag\` and \`sha\` fields. If \`up_to_date\` is true, stop here and
   tell me there's nothing to do.
2. Get latest upstream: \`curl -s https://api.github.com/repos/Benjamin-Bloch/pages-seo/releases/latest\`.
   Compare to step 1. Tell me what's new (release name + 1-line summary
   from the body).
3. Re-run the installer with the same slug: \`curl -fsSL https://seo.benjaminb.xyz/install/run.sh | bash\`,
   answering with slug ${slugRef} when asked. It detects the existing
   D1/R2/Pages project and only re-uploads code.
4. Wait for the Pages deploy to go live. Poll
   \`${siteRef}/api/version\` every 10 seconds (max 5 minutes) until
   \`sha\` matches the new release.
5. Verify health: GET \`${siteRef}/api/health\`. Expect \`db: ok\`,
   \`posts.cron_likely_alive: true\`, \`jobs.in_flight_stuck: 0\`.
6. Update the in-admin install marker so the dashboard stops showing
   "N commits behind": call \`POST ${siteRef}/api/admin/update/dismiss\`
   with my admin token if I have one set, OR tell me to click "Mark
   as up to date" in /admin \u2192 Updates.

## Done criteria

\`/api/version\` reports the new tag AND \`/api/health\` is healthy.
Otherwise keep working.

## Start now

Fetch \`${siteRef}/api/version\` and report the current vs latest.`;
}
function ccRepair(ctx) {
  const ctxBlock = hasCtx(ctx) ? `
## My install

${ctxLines(ctx).join("\n")}
` : `
## My install

Ask me for my site URL before doing anything else.
`;
  const siteRef = ctx.site || `https://<my-slug>.pages.dev`;
  return `# Task: diagnose and fix my broken pages-seo install

You are Claude Code on my machine. My pages-seo deploy is misbehaving.
Find the root cause and fix it \u2014 do not just describe what might be wrong.
${ctxBlock}
## Diagnostic ladder (run in order, stop at the first failure)

1. **DNS + TLS.** \`curl -sI ${siteRef}\` \u2014 expect HTTP 200 or 30x.
   - Connection refused / TLS error \u2192 custom domain or Pages project
     is gone. Run \`wrangler pages project list\` and look for the
     project.
2. **Site responds.** \`curl -s ${siteRef}/api/health | jq .\` \u2014
   expect \`{ok: true, db: "ok"}\`.
   - \`db: "unbound"\` \u2192 D1 binding lost. Re-bind:
     \`wrangler pages project edit --d1 DB=<d1-id>\`. The D1 id is in
     \`wrangler d1 list\` (look for the one whose name matches my slug).
   - \`db: "error"\` \u2192 schema drift. Re-apply via
     \`wrangler d1 execute <db-name> --remote --file=schema/init.sql\`
     from a fresh clone of the repo.
3. **Cron alive.** Check \`posts.cron_likely_alive\` in the health
   response. \`false\` means no post in the last 36 hours.
   - The cron is a separate Worker named \`pages-seo-cron\` (or
     similar). \`wrangler tail pages-seo-cron\` and trigger a manual
     run: \`curl -X POST ${siteRef}/api/admin/blog/cron-tick\` with my
     ADMIN_TOKEN bearer. If 401, the cron's \`ADMIN_TOKEN\` is out of
     sync \u2014 rotate both with \`wrangler pages secret put ADMIN_TOKEN\`
     and \`wrangler secret put ADMIN_TOKEN --name pages-seo-cron\`.
4. **Stuck jobs.** \`jobs.in_flight_stuck > 0\` means a generation
   step died silently. Query D1 to see which job:
   \`wrangler d1 execute <db-name> --remote --command="SELECT id, status, updated_at FROM blog_jobs WHERE status NOT IN ('published','failed') ORDER BY updated_at DESC LIMIT 5"\`.
5. **Admin won't load.** \`curl -sI ${siteRef}/admin\` returns non-200.
   Check \`wrangler pages deployment list\` for the project \u2014 the
   latest deploy may have failed. If so, redeploy the latest commit.
6. **AI provider failing.** If posts show but content is blank,
   GET \`${siteRef}/api/admin/system/status\` (needs admin token) and
   look for provider error messages. Typical cause: missing
   \`OPENAI_API_KEY\` / billing exhausted on Workers AI free tier.

## Reporting

For each step you run, tell me the exact command, the result, and
your interpretation in one sentence. Do not move to the next step
until the current one is green.

## Constraints

- Never delete a D1 database without my explicit "yes, delete it"
  confirmation. D1 holds every post I've ever generated.
- Never \`wrangler pages project delete\`. Ever.
- If you suggest a fix that requires a secret rotation, generate the
  new value yourself with \`openssl rand -hex 32\` and rotate it in
  both the Pages project AND the cron Worker in the same step.

## Start now

What's the symptom? Give me your first \`curl\` command, then run it.`;
}
function cxInstall(ctx) {
  return `# Task: prepare a pages-seo install branch I can deploy locally

You are running in a sandboxed environment with the upstream
\`Benjamin-Bloch/pages-seo\` repo (or my fork of it) cloned. You
do NOT have Cloudflare credentials, so you cannot deploy yourself \u2014
your job is to produce a branch I can deploy with one \`bash\` command
on my own machine.

## What pages-seo is

Self-hosted programmatic-SEO + daily-AI-blog toolkit for Cloudflare
Pages. Workers AI by default, 8 cloud providers as fallback. D1 for
storage, R2 for images. The repo is structured as Cloudflare Pages
Functions (\`functions/api/**.js\`), static assets in \`public/\`, and
a cron Worker in \`cron-worker/\`.

## Read first (do this before touching anything)

1. \`cat README.md\` \u2014 overview, install paths, current version.
2. \`cat schema/init.sql\` \u2014 DB schema. You will not modify this.
3. \`ls public/install/\` \u2014 the installer scripts (run.sh, run.py, run.js).
4. \`cat wrangler.template.toml\` \u2014 the deploy config the installer
   uses. Real deploys substitute D1 / R2 ids into a working
   \`wrangler.toml\`.

## Your output

A single shell command for me to run on my local machine that:
1. Has \`wrangler\` and a Cloudflare account ready.
2. Provisions D1 + R2 + Pages project named after the slug.
3. Uploads the code.
4. Sets the first-run secrets.

The canonical one-liner is already maintained upstream:

\`\`\`
curl -fsSL https://seo.benjaminb.xyz/install/run.sh | bash
\`\`\`

Verify by reading \`public/install/run.sh\` that it still:
- Takes 4 prompts (slug, site name, admin email, admin password)
- Calls \`wrangler d1 create\`, \`wrangler r2 bucket create\`,
  \`wrangler pages deploy\`, \`wrangler pages secret put\`.
- Writes a 0600 tmpfile with the first-run admin link.

If any of those are missing or broken in the current repo, FIX them
and open a PR titled \`fix(install): <what>\`. Do not invent new
install paths or alternative scripts.

## What you must NOT do

- Do not embed Cloudflare API tokens in the repo.
- Do not edit \`schema/init.sql\` to add my data \u2014 schema changes are
  separate PRs.
- Do not modify \`functions/_lib/auth.js\` to weaken admin auth.
- Do not commit \`wrangler.toml\` (it has my real ids); the repo only
  ships \`wrangler.template.toml\`.

## When you're done

Reply with exactly this block, filling in the values:

\`\`\`
INSTALL COMMAND
---------------
$ curl -fsSL <url> | bash

YOU WILL BE ASKED FOR
---------------------
- Project slug (lowercase, dashes, e.g. my-blog)
- Site name
- Admin email
- Admin password (8+ chars)

EXPECTED RUNTIME
----------------
2\u20134 minutes; final magic link saved to a tmpfile, not stdout.

VERIFY
------
$ curl -sI https://<slug>.pages.dev/api/health    # expect HTTP 200
$ curl -s  https://<slug>.pages.dev/api/health    # expect db: "ok"
\`\`\`

## Start now

\`cat README.md | head -50\` and tell me which install path the
current repo recommends.`;
}
function cxUpdate(ctx) {
  const slugRef = ctx.slug ? `"${ctx.slug}"` : "<my-slug>";
  const siteRef = ctx.site || `https://<my-slug>.pages.dev`;
  return `# Task: bring my pages-seo fork up to date with upstream

You are in a sandboxed environment with my fork of
\`Benjamin-Bloch/pages-seo\` cloned. You can edit files, resolve
conflicts, and open PRs. You cannot deploy \u2014 that's my job.

## My install context

- Slug: ${slugRef}
- Live site: ${siteRef}
- Current version: ${ctx.version || "check /api/version"}

## Step plan

1. \`git remote -v\` \u2014 confirm upstream is set to
   \`https://github.com/Benjamin-Bloch/pages-seo.git\`. If not, add it:
   \`git remote add upstream https://github.com/Benjamin-Bloch/pages-seo.git\`.
2. \`git fetch upstream --tags\` \u2014 pull in new commits and tags.
3. \`git log HEAD..upstream/main --oneline\` \u2014 show me the list of
   commits I'm behind.
4. \`git tag --sort=-creatordate | head -5\` \u2014 show me the latest tags.
5. Read upstream's \`CHANGELOG.md\` for the latest version's entry.
   Summarise:
   - What's added (1 bullet each)
   - What's fixed
   - Any breaking changes (schema, env vars, removed endpoints)
6. \`git merge upstream/main\` on a new branch
   \`update/<new-tag>\`. If there are conflicts:
   - **Generated files** (\`functions/_lib/schema.js\`,
     \`public/install/index.html\` cache-buster strings): always
     accept upstream.
   - **Code I've forked** (anything outside \`functions/\`,
     \`public/\`, \`schema/\`, \`cron-worker/\` that I clearly own):
     keep mine.
   - **Anything ambiguous**: stop, list the conflict files, and ask
     me before resolving.
7. If schema changed in upstream's \`schema/init.sql\`, do NOT delete
   any existing tables. \`init.sql\` is idempotent (uses
   \`CREATE TABLE IF NOT EXISTS\` and \`ALTER TABLE \u2026 ADD COLUMN\`).
8. Re-bundle the schema: \`node scripts/bundle-schema.js\`. Commit
   the regenerated \`functions/_lib/schema.js\`.
9. Push the branch and open a PR titled
   \`chore: update to <new-tag>\` with the changelog summary in the
   body.

## What I do next (after you finish)

\`\`\`
gh pr checkout <PR#>     # locally
bash deploy.sh           # rebuilds + wrangler pages deploy
\`\`\`

## Constraints

- Never \`git push --force\`. Use \`git push -u origin update/<tag>\`.
- Never resolve a conflict in \`auth.js\`, \`settings.js\`, or anywhere
  inside \`functions/api/admin/\` without telling me first. Those are
  security-sensitive.
- If upstream removed an endpoint I'm using, flag it in the PR body
  \u2014 don't silently delete my caller code.

## Start now

Run \`git remote -v\` then \`git fetch upstream --tags\`. Report what
you find.`;
}
function cxRepair(ctx) {
  const siteRef = ctx.site || `https://<my-slug>.pages.dev`;
  return `# Task: produce a code fix for my broken pages-seo install

You are in a sandboxed environment with my fork of
\`Benjamin-Bloch/pages-seo\` cloned. You cannot reach my live
infrastructure. I will paste diagnostic output below; your job is
to identify the bug in code and produce a PR.

## What I'll paste

The output of one or more of:
- \`curl -s ${siteRef}/api/health\`
- \`curl -s ${siteRef}/api/version\`
- The contents of \`/admin \u2192 System \u2192 Status\` (a list of red checks)
- A Cloudflare deployment log
- An error message from the admin UI
- A pasted screenshot description

## How to work

1. **Read what I paste before assuming anything.** Match it against
   the error catalogue in \`functions/_lib/errors.js\` (if present)
   and the docs at the upstream's \`/docs#errors\` anchor.
2. **Find the call site.** \`grep -rn '<error_code>' functions/\` to
   locate where the error originates.
3. **Trace forward and backward.** Where is the failing input set?
   Where is the failure consumed? Show me both ends.
4. **Propose a fix as a diff.** Use the \`Edit\` tool. Keep the change
   minimal \u2014 don't refactor surrounding code.
5. **Open a PR.** Title: \`fix(<scope>): <one-line>\`. Body MUST include:
   - The error or symptom I reported (quoted exactly).
   - The root cause (one paragraph).
   - Why this is the minimal fix (one sentence).
   - A test plan I can run locally to verify.

## Common failure modes (don't waste my time re-deriving these)

| Symptom | Root cause | Fix scope |
|---|---|---|
| \`/api/health\` returns \`db: "unbound"\` | Pages project lost D1 binding | Config fix, not a code change. Tell me to re-bind. |
| \`/api/health\` returns \`db: "error"\` | Schema drift or D1 outage | Re-apply \`schema/init.sql\` |
| \`cron_likely_alive: false\` | Cron \`ADMIN_TOKEN\` mismatch | Rotation, not code |
| \`jobs.in_flight_stuck > 0\` | A generation step crashed silently | Check \`functions/_lib/providers/*\` for swallowed errors |
| Posts publish empty | AI provider hit budget cap | Check \`/api/admin/system/status\` for provider error |
| \`/admin\` shows old version after deploy | \`installed_sha\` stale in D1 | Code fix in \`/api/admin/update/apply.js\` or a one-shot DB update |
| New install errors with \`no_db_binding\` immediately | \`wrangler.toml\` substitution failed | Fix in \`public/install/run.sh\` |

## Constraints

- Do NOT modify \`schema/init.sql\` unless the bug IS the schema.
- Do NOT widen \`adminGate\` or relax auth.
- Do NOT add a try/catch that swallows the error. Either fix the
  upstream cause or rethrow with more context.
- Do NOT commit secrets. If the bug requires a new env var, document
  it in the PR body for me to add via \`wrangler pages secret put\`.

## Start now

Reply with: "Paste the diagnostic output and I'll trace it." Then
wait for me. Do not start grepping random files yet.`;
}
function cpInstall(ctx) {
  return `# Task: walk me through installing pages-seo from this IDE

You are GitHub Copilot Chat in my IDE. Help me install pages-seo
(self-hosted SEO + daily-AI-blog toolkit for Cloudflare Pages). I am
sitting at the editor and will run every terminal command myself
after you propose it \u2014 you do NOT run anything unsupervised.

## Working agreement

1. Give me ONE command at a time in a fenced bash block. Wait for me
   to run it and paste the result before giving the next.
2. When I paste a result, parse it and react to what's actually there
   \u2014 don't move to the next step if the previous one errored.
3. If I report I haven't installed a prerequisite (Node, wrangler),
   pause and walk me through that prerequisite. Don't push forward.
4. Never tell me to paste an API token into a chat \u2014 the installer
   uses \`wrangler\` which has my Cloudflare session.

## The install path

There's an upstream one-command installer at
\`https://seo.benjaminb.xyz/install/run.sh\`. It uses \`wrangler\`
(no GitHub App, no API tokens to paste), provisions D1 + R2 + Pages,
and hands me a one-time admin link.

## Step 1 \u2014 Prereq check

Ask me to run these and paste output:

\`\`\`bash
node --version
wrangler --version
wrangler whoami
\`\`\`

If \`node\` is missing \u2192 I need Node 20+. Point me at
https://nodejs.org/.
If \`wrangler\` is missing \u2192 \`npm install -g wrangler\`.
If \`wrangler whoami\` fails \u2192 \`wrangler login\` opens a browser.

## Step 2 \u2014 Collect inputs

Ask me for these in ONE message:
- Project slug (lowercase, dashes, 2\u201333 chars, starts with a letter)
- Site name (display name, anything)
- Admin email
- Admin password (8+ chars, don't echo back to me when I send it)

## Step 3 \u2014 Run the installer

\`\`\`bash
curl -fsSL https://seo.benjaminb.xyz/install/run.sh | bash
\`\`\`

The script will prompt for the four values from step 2. Tell me to
type them as prompted (don't pre-fill via env vars \u2014 the script
masks the password).

## Step 4 \u2014 Verify

\`\`\`bash
curl -sI https://<my-slug>.pages.dev/api/health
curl -s  https://<my-slug>.pages.dev/api/health | jq
\`\`\`

Expect 200 + \`db: "ok"\`. If not, switch to the repair mode of this
prompt (I'll tell you).

## Step 5 \u2014 First login

The installer writes the magic-link URL to a tmpfile path and prints
the path. It also tries to copy the URL to my clipboard. Tell me to
either paste from clipboard or \`cat\` that tmpfile path into my
browser. The link works once.

## What you should NOT do

- Do not propose installing arbitrary npm packages.
- Do not propose editing files in the upstream repo's working copy \u2014
  the installer works in a tempdir, not in my project.
- Do not log my admin password into the chat history.

## Start now

Ask me the prereq-check question (step 1). Wait for my output.`;
}
function cpUpdate(ctx) {
  const slugRef = ctx.slug ? `"${ctx.slug}"` : "my slug";
  const siteRef = ctx.site || `https://<my-slug>.pages.dev`;
  return `# Task: update my pages-seo install to the latest release

You are GitHub Copilot Chat in my IDE. Walk me through updating my
existing pages-seo deploy. One command at a time, wait for my output,
react to what I actually paste.

## My install

- Slug: ${slugRef}
- Live site: ${siteRef}
- Current version: ${ctx.version || "we will check"}

## Step 1 \u2014 See where I am

Ask me to run:

\`\`\`bash
curl -s ${siteRef}/api/version | jq '{tag, sha: .short, up_to_date, ahead}'
\`\`\`

If \`up_to_date\` is \`true\` \u2192 stop, there's nothing to do.
If \`up_to_date\` is \`false\` \u2192 note the \`ahead\` count and the
current \`tag\`.

## Step 2 \u2014 See what's new

\`\`\`bash
curl -s https://api.github.com/repos/Benjamin-Bloch/pages-seo/releases/latest | jq '{tag_name, name, published_at, body}' | head -40
\`\`\`

Summarise the new release in 3 bullets max. Flag any breaking changes
(schema, env vars, removed endpoints) explicitly \u2014 I need to know
before I deploy.

## Step 3 \u2014 Re-run the installer with the same slug

The installer is idempotent. It detects the existing D1, R2, and
Pages project by name and only re-uploads code. Existing data is
preserved.

\`\`\`bash
curl -fsSL https://seo.benjaminb.xyz/install/run.sh | bash
\`\`\`

Tell me to use slug ${slugRef} when prompted. Tell me to use the same
admin email; for password, I can re-enter the current one (it gets
hashed fresh but my existing admin user is preserved).

## Step 4 \u2014 Verify

\`\`\`bash
curl -s ${siteRef}/api/version | jq '{tag, sha: .short, up_to_date}'
curl -s ${siteRef}/api/health  | jq
\`\`\`

Expect \`up_to_date: true\` and \`db: "ok"\` and
\`posts.cron_likely_alive: true\`. If any are off, switch to repair.

## Step 5 \u2014 Clear the "N commits behind" banner

If the admin UI still shows "X commits behind" after a successful
deploy, that's a known UX quirk: the \`installed_sha\` setting in D1
isn't auto-updated by direct-upload deploys. Tell me to either:
- Click "Mark as up to date" in /admin \u2192 System \u2192 Updates, or
- Hit \`POST ${siteRef}/api/admin/update/dismiss\` with my admin
  bearer token.

## Constraints

- Do NOT propose \`wrangler d1 execute \u2026 --command="DROP TABLE\`
  anything. The installer's schema is additive.
- Do NOT propose deleting and recreating the Pages project.

## Start now

Give me step 1's command and wait for my paste.`;
}
function cpRepair(ctx) {
  const siteRef = ctx.site || `https://<my-slug>.pages.dev`;
  return `# Task: help me fix my broken pages-seo install

You are GitHub Copilot Chat in my IDE. Something on my pages-seo
deploy is broken. Diagnose by sequence, not by guessing. One
command at a time. React to my actual output.

## My install

- Live site: ${siteRef}

## How to triage

Always start at the cheapest check and only escalate if it fails.
The ladder is: DNS/TLS \u2192 health endpoint \u2192 schema \u2192 cron \u2192
provider \u2192 admin route. Do not skip rungs.

## Step 1 \u2014 Is the site reachable?

\`\`\`bash
curl -sI ${siteRef}
\`\`\`

- HTTP 200/30x \u2192 site is up; go to step 2.
- Connection refused / TLS error \u2192 Pages project or custom domain
  is gone. Have me run \`wrangler pages project list\` and look
  for the project.
- HTTP 522 / 530 \u2192 Cloudflare edge can't reach origin (very rare for
  Pages; usually a region outage). Wait 5 min and retry.

## Step 2 \u2014 Is the backend alive?

\`\`\`bash
curl -s ${siteRef}/api/health | jq
\`\`\`

Interpret the response field by field:
- \`db: "unbound"\` \u2192 D1 binding lost. Fix:
  \`wrangler pages project edit\` and re-attach the D1 by id from
  \`wrangler d1 list\`.
- \`db: "error"\` \u2192 schema drift. Have me re-apply
  \`schema/init.sql\` via \`wrangler d1 execute\` with \`--remote\`.
- \`db: "ok"\` and \`posts.cron_likely_alive: false\` \u2192 cron stopped.
  Go to step 3.
- \`db: "ok"\` and \`jobs.in_flight_stuck > 0\` \u2192 a generation step
  died. Go to step 4.

## Step 3 \u2014 Cron is stale

The cron is a separate Worker (\`pages-seo-cron\` or similar). The
most common cause is \`ADMIN_TOKEN\` drift between the cron Worker
and the Pages project \u2014 the cron POSTs to the Pages API with its
token, gets a 401, and silently does nothing.

Have me run:

\`\`\`bash
wrangler tail pages-seo-cron --format=pretty
\`\`\`

Then trigger a manual run:

\`\`\`bash
curl -X POST ${siteRef}/api/admin/blog/cron-tick \\
  -H "authorization: Bearer $ADMIN_TOKEN"
\`\`\`

If the tail shows a 401, rotate the token on both sides:

\`\`\`bash
NEW_TOKEN=$(openssl rand -hex 32)
echo "$NEW_TOKEN" | wrangler pages secret put ADMIN_TOKEN --project-name <my-slug>
echo "$NEW_TOKEN" | wrangler secret put ADMIN_TOKEN --name pages-seo-cron
\`\`\`

## Step 4 \u2014 Stuck job

\`\`\`bash
wrangler d1 execute <db-name> --remote \\
  --command="SELECT id, status, error, updated_at FROM blog_jobs WHERE status NOT IN ('published','failed') ORDER BY updated_at DESC LIMIT 5"
\`\`\`

Read \`error\` for each row. Typical patterns:
- \`provider_budget_exceeded\` \u2192 AI free tier exhausted; add a
  fallback provider key in /admin.
- \`provider_timeout\` \u2192 flaky upstream; mark the job failed and
  rerun.

## Step 5 \u2014 Admin route is dead

If \`/admin\` 404s but \`/api/health\` is fine, the static build was
truncated. Re-run the installer (idempotent, no data loss):

\`\`\`bash
curl -fsSL https://seo.benjaminb.xyz/install/run.sh | bash
\`\`\`

## Constraints

- Never propose \`wrangler d1 delete\` or
  \`wrangler r2 bucket delete\`. D1 is the source of truth for every
  post I've written.
- If I mention I've already tried something, don't retry it.
- If diagnostics return something not in this prompt, say so and ask
  me before guessing.

## Start now

Ask me one question: "What's the symptom \u2014 what URL, what do you see,
what do you expect?" Then wait for my answer before running step 1.`;
}
function chInstall(ctx) {
  const ctxBlock = hasCtx(ctx) ? `
My install details (use these in your answers, not placeholders):
${ctxLines(ctx).join("\n")}
` : "";
  return `You are walking me through installing pages-seo, an open-source
self-hosted programmatic-SEO + daily-AI-blog toolkit for Cloudflare
Pages. I am not technical. You will be my pair-programmer over chat.

The upstream is at https://github.com/Benjamin-Bloch/pages-seo. The
maintainer's live demo is at https://seo.benjaminb.xyz.
${ctxBlock}
RULES FOR THIS CONVERSATION:

1. ONE STEP AT A TIME. After every step you give me, end with:
   "Reply 'done' when you've finished, or paste any error you see."
   Then stop. Do not give the next step until I reply.
2. If I paste an error, diagnose THAT error before doing anything
   else. Don't dump the next step on top of an unresolved problem.
3. Commands go in fenced code blocks. URLs go as clickable links.
4. If you genuinely don't know the answer, say "I don't know \u2014 let's
   check https://seo.benjaminb.xyz/docs". Don't guess.

WHAT WE'RE GOING TO DO:

We'll use the terminal installer (one curl command). It uses
\`wrangler\` (the Cloudflare CLI) \u2014 no GitHub App, no API tokens to
paste, just my Cloudflare login. It takes 2\u20134 minutes.

What I'll need:
- A Cloudflare account (free tier is enough). Sign up:
  https://dash.cloudflare.com/sign-up
- Node 20 or newer on my machine.
- About 5 minutes.

THE SEQUENCE (give me these one at a time, waiting between):

Step A \u2014 Check I have Node 20+:
   \`node --version\`
   If missing or older than 20: send me to https://nodejs.org/ to
   install it.

Step B \u2014 Install wrangler:
   \`npm install -g wrangler\`

Step C \u2014 Log in to Cloudflare:
   \`wrangler login\`
   This pops a browser. I click Allow.

Step D \u2014 Pick names:
   Ask me ONE question that lists all of:
   - Project slug (lowercase, dashes only, e.g. \`my-blog\`)
   - Site name (display name, anything)
   - Admin email
   - Admin password (8+ chars)

Step E \u2014 Run the installer:
   \`curl -fsSL https://seo.benjaminb.xyz/install/run.sh | bash\`
   It prompts for the four values from step D. Tell me to type them
   when asked.

Step F \u2014 Wait, then verify:
   \`curl -s https://<my-slug>.pages.dev/api/health\`
   Expect a JSON response with \`"db":"ok"\`.

Step G \u2014 Open admin:
   The installer either copied a "first-run" link to my clipboard or
   wrote it to a tmpfile path. Tell me how to use it. The link works
   once.

COMMON FAILURE MODES (you know these, so don't make me Google them):

- "wrangler: command not found" after npm install \u2192 my npm global
  bin isn't on PATH. Run \`npm config get prefix\`, add \`<that>/bin\`
  to PATH.
- "Authentication error" during install \u2192 \`wrangler login\` didn't
  complete. Re-run it.
- Installer says "D1 quota exceeded" \u2192 free tier limit is 10 D1
  databases. Delete old test ones in the Cloudflare dashboard or
  upgrade.
- \`/api/health\` returns \`"db":"unbound"\` after a clean install \u2192
  binding race; wait 60 seconds and retry once.

START NOW:

Greet me in one sentence, then ask step A. Wait for my reply.`;
}
function chUpdate(ctx) {
  const slugRef = ctx.slug || "<my-slug>";
  const siteRef = ctx.site || `https://<my-slug>.pages.dev`;
  const ctxBlock = hasCtx(ctx) ? `
My install:
${ctxLines(ctx).join("\n")}
` : "";
  return `You are helping me update an existing pages-seo install
(self-hosted SEO + daily-AI-blog toolkit for Cloudflare Pages) to the
latest version. I am not technical. Pair-program with me over chat.
${ctxBlock}
RULES:

1. ONE STEP AT A TIME. After each step, end with: "Reply 'done' when
   finished, or paste any error." Then stop.
2. If I paste an error, fix it before moving on.
3. Don't suggest editing my codebase by hand \u2014 the supported update
   path is to re-run the installer.

WHAT WE'RE DOING:

Re-running the installer with the same project slug. It detects my
existing D1, R2, and Pages project by name and only updates the
code. My data is preserved. Takes 2 minutes.

THE SEQUENCE:

Step A \u2014 Confirm current version:
   \`curl -s ${siteRef}/api/version\`
   Tell me what tag I'm on and what's the latest. If I'm up to date,
   stop \u2014 there's nothing to do.

Step B \u2014 Show me what's new:
   \`curl -s https://api.github.com/repos/Benjamin-Bloch/pages-seo/releases/latest\`
   Read the release body. Summarise in 3 bullets max. Flag any
   breaking changes (schema, env vars).

Step C \u2014 Re-run installer:
   \`curl -fsSL https://seo.benjaminb.xyz/install/run.sh | bash\`
   Tell me to enter slug \`${slugRef}\` when prompted. Same admin
   email. I can re-enter the same password.

Step D \u2014 Verify:
   \`curl -s ${siteRef}/api/version\` \u2192 should show the new tag.
   \`curl -s ${siteRef}/api/health\` \u2192 should show \`db: ok\` and
   \`cron_likely_alive: true\`.

Step E \u2014 If admin still shows "N commits behind":
   That's a known UX quirk; tell me to click "Mark as up to date" in
   /admin \u2192 System \u2192 Updates.

COMMON FAILURES:

- Installer hangs after "Provisioning resources" \u2192 \`wrangler\` lost
  its session. Run \`wrangler login\` and re-run.
- New deploy is live (\`/api/version\` shows new tag) but \`/admin\`
  shows old version \u2192 hard refresh (Cmd-Shift-R / Ctrl-Shift-R).

START NOW:

Greet me, then ask step A. Wait.`;
}
function chRepair(ctx) {
  const slugRef = ctx.slug || "<my-slug>";
  const siteRef = ctx.site || `https://<my-slug>.pages.dev`;
  const ctxBlock = hasCtx(ctx) ? `
My install:
${ctxLines(ctx).join("\n")}
` : "";
  return `You are helping me fix a broken pages-seo install
(self-hosted SEO + daily-AI-blog toolkit for Cloudflare Pages). I am
not technical. Pair-program with me over chat \u2014 one step at a time,
wait for my output, then react.
${ctxBlock}
RULES:

1. Start by asking me what the symptom is. Don't guess.
2. ONE diagnostic at a time. End with: "Paste what you see."
3. Don't tell me to "check the logs" without telling me which log
   and how. Always give me the exact command.
4. If diagnostics return something unexpected, say so and ask before
   guessing what it means.

THE LADDER (use in order; only escalate if the previous rung passes):

Rung 1 \u2014 Is the site reachable?
   \`curl -sI ${siteRef}\`
   200 or 30x \u2192 up. Connection refused \u2192 Pages project gone.

Rung 2 \u2014 Is the backend alive?
   \`curl -s ${siteRef}/api/health\`
   Look for:
   - \`db: "ok"\` \u2192 good
   - \`db: "unbound"\` \u2192 D1 binding lost. Open Cloudflare dashboard
     \u2192 Pages \u2192 my project \u2192 Settings \u2192 Functions \u2192 D1 database
     bindings. Re-attach the D1 with binding name \`DB\`.
   - \`db: "error"\` \u2192 schema drift; tell me to visit
     /admin \u2192 System \u2192 Status and click "Repair schema".
   - \`posts.cron_likely_alive: false\` \u2192 no post in 36+ hours; go to
     rung 3.
   - \`jobs.in_flight_stuck > 0\` \u2192 a generation died; go to rung 4.

Rung 3 \u2014 Cron stopped:
   Visit \`${siteRef}/admin\` \u2192 System \u2192 Status. The "Cron last
   ping" card tells me when the daily cron last contacted the site.
   If it's been > 36 hours, the most common cause is an
   \`ADMIN_TOKEN\` mismatch between the cron Worker and the Pages
   project. The fix is in \`/admin \u2192 System \u2192 Repair \u2192 Rotate
   admin token\` \u2014 it updates both sides.

Rung 4 \u2014 Stuck job:
   /admin \u2192 Posts. Look for any post with status "review" or
   "pending" older than an hour. Click "Retry" on that job, or
   "Mark failed" to skip it.

Rung 5 \u2014 Admin won't load at all:
   Browser dev tools \u2192 Network tab \u2192 reload. Tell me the HTTP status
   of the /admin request and the first JS file it loads.

COMMON SYMPTOMS:

| What I see | What it means | First thing to try |
|---|---|---|
| Site shows the maintainer's marketing page, not my content | Fork sync issue (Direct Upload install) \u2014 usually means a re-deploy failed midway | Re-run installer |
| Posts appear but content is blank | AI provider hit budget cap | /admin \u2192 System \u2192 Status \u2014 check provider status |
| OG / cover images are missing | R2 binding lost or bucket renamed | Re-bind R2 in Pages settings |
| /admin says "N commits behind" forever | UX quirk, install marker stale | Click "Mark as up to date" |
| Cron used to work, now silent | Most likely \`ADMIN_TOKEN\` drift | Repair \u2192 Rotate admin token |

DON'T:

- Don't tell me to delete and reinstall. D1 holds every post I've
  ever generated.
- Don't suggest editing code. The supported repair path is the
  in-admin Repair UI or re-running the installer.

START NOW:

Ask me: "What URL are you on, and what do you see vs what you
expect?" Wait for my answer. Then pick the right rung based on what
I tell you.`;
}
var TOOLS, VALID_TOOLS, VALID_MODES, onRequestGet63;
var init_ai_prompt = __esm({
  "api/ai-prompt.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    __name(cleanUrl2, "cleanUrl");
    __name(cleanSlug, "cleanSlug");
    __name(cleanGhUrl, "cleanGhUrl");
    __name(ctxLines, "ctxLines");
    __name(hasCtx, "hasCtx");
    __name(ccInstall, "ccInstall");
    __name(ccUpdate, "ccUpdate");
    __name(ccRepair, "ccRepair");
    __name(cxInstall, "cxInstall");
    __name(cxUpdate, "cxUpdate");
    __name(cxRepair, "cxRepair");
    __name(cpInstall, "cpInstall");
    __name(cpUpdate, "cpUpdate");
    __name(cpRepair, "cpRepair");
    __name(chInstall, "chInstall");
    __name(chUpdate, "chUpdate");
    __name(chRepair, "chRepair");
    TOOLS = {
      "claude-code": { install: ccInstall, update: ccUpdate, repair: ccRepair },
      "codex": { install: cxInstall, update: cxUpdate, repair: cxRepair },
      "copilot": { install: cpInstall, update: cpUpdate, repair: cpRepair },
      "chat": { install: chInstall, update: chUpdate, repair: chRepair }
    };
    VALID_TOOLS = Object.keys(TOOLS);
    VALID_MODES = ["install", "update", "repair"];
    onRequestGet63 = /* @__PURE__ */ __name(async ({ request }) => {
      const url = new URL(request.url);
      const toolRaw = String(url.searchParams.get("tool") || "chat").toLowerCase();
      const tool = VALID_TOOLS.includes(toolRaw) ? toolRaw : "chat";
      const modeRaw = String(url.searchParams.get("mode") || "install").toLowerCase();
      const mode = VALID_MODES.includes(modeRaw) ? modeRaw : "install";
      const format = String(url.searchParams.get("format") || "text").toLowerCase();
      const ctx = {
        slug: cleanSlug(url.searchParams.get("slug")),
        site: cleanUrl2(url.searchParams.get("site"), null),
        admin: cleanUrl2(url.searchParams.get("admin"), null),
        gh: cleanGhUrl(url.searchParams.get("gh")),
        acct: (url.searchParams.get("acct") || "").slice(0, 64) || null,
        version: (url.searchParams.get("version") || "").slice(0, 40) || null
      };
      const isPersonal = Object.values(ctx).some(Boolean);
      const prompt = TOOLS[tool][mode](ctx);
      if (format === "json") {
        return json(200, {
          ok: true,
          tool,
          mode,
          prompt,
          personalized: isPersonal,
          context: ctx,
          tools_available: VALID_TOOLS,
          modes_available: VALID_MODES,
          length: prompt.length
        });
      }
      return new Response(prompt, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": isPersonal ? "no-store" : "public, max-age=300",
          "access-control-allow-origin": "*"
        }
      });
    }, "onRequestGet");
  }
});

// api/changes.js
function ghHeaders5(env) {
  const h = {
    "User-Agent": "pages-seo-changes",
    Accept: "application/vnd.github+json"
  };
  if (env?.GITHUB_TOKEN) {
    h.Authorization = "Bearer " + String(env.GITHUB_TOKEN).trim();
  }
  return h;
}
function short3(sha) {
  return String(sha || "").slice(0, 7);
}
function splitMessage(msg) {
  const s = String(msg || "");
  const nl = s.indexOf("\n");
  if (nl === -1) return { subject: s.slice(0, 200), body: "" };
  return {
    subject: s.slice(0, nl).slice(0, 200),
    body: s.slice(nl + 1).trim().slice(0, 1200)
  };
}
var UPSTREAM_OWNER5, UPSTREAM_REPO5, BRANCH3, EDGE_CACHE_SEC, BROWSER_CACHE_SEC, MAX_COMMITS, onRequestGet64;
var init_changes = __esm({
  "api/changes.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    UPSTREAM_OWNER5 = "Benjamin-Bloch";
    UPSTREAM_REPO5 = "pages-seo";
    BRANCH3 = "main";
    EDGE_CACHE_SEC = 300;
    BROWSER_CACHE_SEC = 60;
    MAX_COMMITS = 100;
    __name(ghHeaders5, "ghHeaders");
    __name(short3, "short");
    __name(splitMessage, "splitMessage");
    onRequestGet64 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const url = new URL(request.url);
      const since = String(url.searchParams.get("since") || "").trim().toLowerCase();
      const limit = Math.min(MAX_COMMITS, Math.max(1, parseInt(url.searchParams.get("limit"), 10) || 50));
      if (!since) return json(400, { ok: false, error: "missing_since", detail: "pass ?since=<sha>" });
      if (!/^[0-9a-f]{7,40}$/.test(since)) {
        return json(400, { ok: false, error: "bad_sha", detail: "since must be 7-40 hex chars" });
      }
      let latest;
      try {
        const r = await fetch(
          `https://api.github.com/repos/${UPSTREAM_OWNER5}/${UPSTREAM_REPO5}/commits/${BRANCH3}`,
          { headers: ghHeaders5(env) }
        );
        if (!r.ok) {
          return json(502, { ok: false, error: "github_latest_failed", detail: "HTTP " + r.status });
        }
        latest = await r.json();
      } catch (e) {
        return json(502, { ok: false, error: "github_unreachable", detail: String(e?.message || e) });
      }
      const latestOut = {
        sha: latest.sha,
        short: short3(latest.sha),
        message: (latest.commit?.message || "").split("\n")[0].slice(0, 200),
        date: latest.commit?.author?.date || null,
        html_url: latest.html_url
      };
      if (since === latestOut.sha || latestOut.sha.startsWith(since) || since.startsWith(latestOut.sha.slice(0, since.length))) {
        return new Response(JSON.stringify({
          ok: true,
          since,
          latest: latestOut,
          up_to_date: true,
          ahead: 0,
          commits: []
        }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": `public, max-age=${BROWSER_CACHE_SEC}, s-maxage=${EDGE_CACHE_SEC}, stale-while-revalidate=86400`,
            "access-control-allow-origin": "*"
          }
        });
      }
      let cmp;
      try {
        const r = await fetch(
          `https://api.github.com/repos/${UPSTREAM_OWNER5}/${UPSTREAM_REPO5}/compare/${since}...${latestOut.sha}`,
          { headers: ghHeaders5(env) }
        );
        if (!r.ok) {
          if (r.status === 404) {
            return json(409, {
              ok: false,
              error: "sha_not_ancestor",
              detail: "The installed SHA is not in upstream main's history. Your fork has diverged \u2014 see /docs#ts-marketing-page.",
              latest: latestOut
            });
          }
          return json(502, { ok: false, error: "github_compare_failed", detail: "HTTP " + r.status });
        }
        cmp = await r.json();
      } catch (e) {
        return json(502, { ok: false, error: "github_unreachable", detail: String(e?.message || e) });
      }
      const commits = (cmp.commits || []).slice(0, limit).map((c) => {
        const { subject, body } = splitMessage(c.commit?.message);
        return {
          sha: c.sha,
          short: short3(c.sha),
          subject,
          body,
          date: c.commit?.author?.date || null,
          url: c.html_url,
          author: c.author?.login || c.commit?.author?.name || "unknown"
        };
      });
      return new Response(JSON.stringify({
        ok: true,
        since,
        latest: latestOut,
        up_to_date: commits.length === 0,
        ahead: commits.length,
        commits
      }, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": `public, max-age=${BROWSER_CACHE_SEC}, s-maxage=${EDGE_CACHE_SEC}, stale-while-revalidate=86400`,
          "access-control-allow-origin": "*"
        }
      });
    }, "onRequestGet");
  }
});

// api/github-stats.js
async function fetchJson(url, headers) {
  const r = await fetch(url, { headers, cf: { cacheTtl: 600 } });
  if (!r.ok) throw new Error(`${url} \u2192 HTTP ${r.status}`);
  return r.json();
}
var OWNER, REPO, EDGE_CACHE_SEC2, BROWSER_CACHE_SEC2, onRequestGet65;
var init_github_stats = __esm({
  "api/github-stats.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    OWNER = "Benjamin-Bloch";
    REPO = "pages-seo";
    EDGE_CACHE_SEC2 = 600;
    BROWSER_CACHE_SEC2 = 120;
    __name(fetchJson, "fetchJson");
    onRequestGet65 = /* @__PURE__ */ __name(async ({ env }) => {
      const headers = {
        "User-Agent": "pages-seo-github-stats",
        "Accept": "application/vnd.github+json"
      };
      if (env?.GITHUB_TOKEN) headers["Authorization"] = `Bearer ${env.GITHUB_TOKEN}`;
      try {
        const repoUrl = `https://api.github.com/repos/${OWNER}/${REPO}`;
        const releaseUrl = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
        const [repo, releaseRes] = await Promise.all([
          fetchJson(repoUrl, headers),
          fetch(releaseUrl, { headers, cf: { cacheTtl: 600 } })
        ]);
        let latest_tag = null;
        if (releaseRes.ok) {
          const r = await releaseRes.json();
          latest_tag = r?.tag_name || null;
        }
        return json(200, {
          ok: true,
          stargazers_count: repo.stargazers_count ?? 0,
          forks_count: repo.forks_count ?? 0,
          open_issues_count: repo.open_issues_count ?? 0,
          latest_tag,
          html_url: repo.html_url || `https://github.com/${OWNER}/${REPO}`,
          fetched_at: Math.floor(Date.now() / 1e3)
        }, {
          "cache-control": `public, max-age=${BROWSER_CACHE_SEC2}, s-maxage=${EDGE_CACHE_SEC2}, stale-while-revalidate=86400`,
          "access-control-allow-origin": "*"
        });
      } catch (err) {
        return json(502, { ok: false, error: "upstream_failed", detail: String(err.message || err).slice(0, 200) }, {
          "cache-control": "no-store",
          "access-control-allow-origin": "*"
        });
      }
    }, "onRequestGet");
  }
});

// api/health.js
var onRequestGet66;
var init_health = __esm({
  "api/health.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    onRequestGet66 = /* @__PURE__ */ __name(async ({ env }) => {
      const now = Math.floor(Date.now() / 1e3);
      let db = "unbound";
      const posts = { count: null, last_published: null };
      const jobs = { in_flight_stuck: null };
      if (env?.DB) {
        try {
          const r1 = await env.DB.prepare(
            `SELECT COUNT(*) AS n, MAX(published_at) AS last
           FROM blog_posts WHERE status = 'published'`
          ).first();
          db = r1 && typeof r1.n === "number" ? "ok" : "error";
          posts.count = r1?.n ?? 0;
          posts.last_published = r1?.last ?? null;
          const r2 = await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM blog_jobs
          WHERE status NOT IN ('published','failed')
            AND updated_at < ?`
          ).bind(now - 3600).first();
          jobs.in_flight_stuck = r2?.n ?? 0;
        } catch {
          db = "error";
        }
      }
      if (posts.last_published != null) {
        const ageH = (now - posts.last_published) / 3600;
        posts.hours_since_last = Math.round(ageH);
        posts.cron_likely_alive = ageH < 36;
      }
      return json(200, {
        ok: true,
        db,
        ts: now,
        posts,
        jobs
      }, {
        // Never cache — monitors should see the current state.
        "cache-control": "no-store"
      });
    }, "onRequestGet");
  }
});

// api/repair-bindings.js
async function tokensMatch(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b))
  ]);
  const xa = new Uint8Array(ha), xb = new Uint8Array(hb);
  let acc = 0;
  for (let i = 0; i < xa.length; i++) acc |= xa[i] ^ xb[i];
  return acc === 0;
}
async function authorise(env, request, body) {
  if (env?.DB) {
    const auth = await requireAdminAsync(env, request);
    if (auth) return { ok: true, via: auth.via };
  }
  const expected = String(env?.SETUP_TOKEN || "").trim();
  if (expected) {
    const supplied = String(body?.setup_token || "").trim();
    if (await tokensMatch(supplied, expected)) {
      return { ok: true, via: "setup_token" };
    }
  }
  return { ok: false };
}
function missingEnvVars(env) {
  const need = ["CF_API_TOKEN", "CF_ACCOUNT_ID", "CF_PROJECT", "CF_D1_ID", "CF_R2_NAME"];
  return need.filter((k) => !env?.[k] || !String(env[k]).trim());
}
async function cfFetch10(token, path, init = {}) {
  const res = await fetch(CF_API12 + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
  }
  return { res, body };
}
async function getProject2(token, accountId, project) {
  const r = await cfFetch10(token, `/accounts/${accountId}/pages/projects/${project}`);
  if (!r.res.ok) return null;
  return r.body?.result || null;
}
function checkBindings(proj, expected) {
  const prod = proj?.deployment_configs?.production || {};
  return {
    DB: prod?.d1_databases?.DB?.id === expected.d1Id,
    IMAGES: prod?.r2_buckets?.IMAGES?.name === expected.r2Name,
    AI: !!prod?.ai_bindings?.AI
  };
}
async function patchBindings(env, proj) {
  const token = String(env.CF_API_TOKEN).trim();
  const accountId = String(env.CF_ACCOUNT_ID).trim();
  const project = String(env.CF_PROJECT).trim();
  const d1Id = String(env.CF_D1_ID).trim();
  const r2Name = String(env.CF_R2_NAME).trim();
  const existingProdEnv = proj?.deployment_configs?.production?.env_vars || {};
  const existingPrevEnv = proj?.deployment_configs?.preview?.env_vars || existingProdEnv;
  const bindings = {
    d1_databases: { DB: { id: d1Id } },
    r2_buckets: { IMAGES: { name: r2Name } },
    ai_bindings: { AI: {} }
  };
  const body = JSON.stringify({
    deployment_configs: {
      production: { ...bindings, env_vars: existingProdEnv },
      preview: { ...bindings, env_vars: existingPrevEnv }
    }
  });
  const r = await cfFetch10(token, `/accounts/${accountId}/pages/projects/${project}`, {
    method: "PATCH",
    body
  });
  return { ok: r.res.ok, body: r.body };
}
async function triggerDeploy2(env) {
  const token = String(env.CF_API_TOKEN).trim();
  const accountId = String(env.CF_ACCOUNT_ID).trim();
  const project = String(env.CF_PROJECT).trim();
  const r = await cfFetch10(token, `/accounts/${accountId}/pages/projects/${project}/deployments`, {
    method: "POST"
  });
  return { ok: r.res.ok };
}
var CF_API12, onRequestGet67, onRequestPost70;
var init_repair_bindings = __esm({
  "api/repair-bindings.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_auth();
    CF_API12 = "https://api.cloudflare.com/client/v4";
    __name(tokensMatch, "tokensMatch");
    __name(authorise, "authorise");
    __name(missingEnvVars, "missingEnvVars");
    __name(cfFetch10, "cfFetch");
    __name(getProject2, "getProject");
    __name(checkBindings, "checkBindings");
    __name(patchBindings, "patchBindings");
    __name(triggerDeploy2, "triggerDeploy");
    onRequestGet67 = /* @__PURE__ */ __name(async ({ env }) => {
      const missing = missingEnvVars(env);
      if (missing.length) {
        return json(503, {
          ok: false,
          error: "self_repair_unavailable",
          detail: "This site was installed before self-repair credentials were added. Re-run /install on seo.benjaminb.xyz to upgrade.",
          missing
        });
      }
      const token = String(env.CF_API_TOKEN).trim();
      const accountId = String(env.CF_ACCOUNT_ID).trim();
      const project = String(env.CF_PROJECT).trim();
      const d1Id = String(env.CF_D1_ID).trim();
      const r2Name = String(env.CF_R2_NAME).trim();
      const proj = await getProject2(token, accountId, project);
      if (!proj) {
        return json(502, { ok: false, error: "project_lookup_failed" });
      }
      const status = checkBindings(proj, { d1Id, r2Name });
      const healthy = status.DB && status.IMAGES && status.AI;
      return json(200, { ok: true, healthy, bindings: status, project });
    }, "onRequestGet");
    onRequestPost70 = /* @__PURE__ */ __name(async ({ env, request }) => {
      let body = {};
      try {
        body = await request.json();
      } catch {
      }
      const auth = await authorise(env, request, body);
      if (!auth.ok) return json(401, { error: "unauthorized" });
      const missing = missingEnvVars(env);
      if (missing.length) {
        return json(503, {
          ok: false,
          error: "self_repair_unavailable",
          detail: "Missing CF_* secrets. Re-run /install to upgrade this site.",
          missing
        });
      }
      const token = String(env.CF_API_TOKEN).trim();
      const accountId = String(env.CF_ACCOUNT_ID).trim();
      const project = String(env.CF_PROJECT).trim();
      const d1Id = String(env.CF_D1_ID).trim();
      const r2Name = String(env.CF_R2_NAME).trim();
      const proj = await getProject2(token, accountId, project);
      if (!proj) return json(502, { ok: false, error: "project_lookup_failed" });
      const before = checkBindings(proj, { d1Id, r2Name });
      const wasHealthy = before.DB && before.IMAGES && before.AI;
      await patchBindings(env, proj);
      let after = await getProject2(token, accountId, project).then((p) => checkBindings(p, { d1Id, r2Name }));
      let retried = false;
      if (!(after.DB && after.IMAGES && after.AI)) {
        retried = true;
        await patchBindings(env, proj);
        after = await getProject2(token, accountId, project).then((p) => checkBindings(p, { d1Id, r2Name }));
      }
      const deploy = await triggerDeploy2(env);
      const healthy = after.DB && after.IMAGES && after.AI;
      return json(healthy ? 200 : 500, {
        ok: healthy,
        via: auth.via,
        was_healthy: wasHealthy,
        bindings_before: before,
        bindings_after: after,
        patch_retried: retried,
        deploy_triggered: deploy.ok
      });
    }, "onRequestPost");
  }
});

// api/setup.js
function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function userCount(env) {
  try {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first();
    return r?.n || 0;
  } catch {
    return 0;
  }
}
async function expectedSetupToken(env) {
  if (env?.SETUP_TOKEN && String(env.SETUP_TOKEN).trim()) {
    return String(env.SETUP_TOKEN).trim();
  }
  if (!env?.DB) return "";
  try {
    const s = await loadSettings(env);
    return String(s?.setup_token || "").trim();
  } catch {
    return "";
  }
}
async function tokensMatch2(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b))
  ]);
  const xa = new Uint8Array(ha), xb = new Uint8Array(hb);
  let acc = 0;
  for (let i = 0; i < xa.length; i++) acc |= xa[i] ^ xb[i];
  return acc === 0;
}
var EMAIL_RX, MIN_PW3, MAX_PW3, onRequestGet68, onRequestPost71;
var init_setup = __esm({
  "api/setup.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_passwords();
    init_settings();
    init_migrations();
    EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    MIN_PW3 = 8;
    MAX_PW3 = 256;
    __name(randomHex, "randomHex");
    __name(userCount, "userCount");
    __name(expectedSetupToken, "expectedSetupToken");
    __name(tokensMatch2, "tokensMatch");
    onRequestGet68 = /* @__PURE__ */ __name(async ({ env }) => {
      if (!env?.DB) return json(503, { error: "no_db_binding" });
      const n = await userCount(env);
      const expected = await expectedSetupToken(env);
      return json(200, {
        ok: true,
        needs_setup: n === 0,
        requires_token: !!expected
      });
    }, "onRequestGet");
    onRequestPost71 = /* @__PURE__ */ __name(async ({ env, request }) => {
      if (!env?.DB) return json(503, { error: "no_db_binding" });
      if (await userCount(env) > 0) {
        return json(409, { error: "setup_already_done", detail: "An admin user already exists." });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json(400, { error: "bad_json" });
      }
      const expected = await expectedSetupToken(env);
      if (expected) {
        const supplied = String(body?.setup_token || "").trim();
        if (!await tokensMatch2(supplied, expected)) {
          return json(401, { error: "bad_setup_token", detail: "Open /admin?setup=<token> from the install URL you were given." });
        }
      }
      const email = String(body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      const site_name = String(body?.site_name || "").trim();
      const site_url = String(body?.site_url || "").trim();
      if (!EMAIL_RX.test(email)) return json(400, { error: "invalid_email" });
      if (password.length < MIN_PW3 || password.length > MAX_PW3) {
        return json(400, { error: "password_length", min: MIN_PW3, max: MAX_PW3 });
      }
      if (!site_name) return json(400, { error: "missing_site_name" });
      if (!/^https?:\/\/.+/i.test(site_url)) return json(400, { error: "invalid_site_url" });
      const migrationReport = await runMigrations(env, { logger: { log: /* @__PURE__ */ __name(() => {
      }, "log"), error: /* @__PURE__ */ __name(() => {
      }, "error") } });
      if (!migrationReport.ok) {
        return json(500, {
          error: "migration_failed",
          detail: migrationReport.failed?.[0]?.error || "unknown",
          failed: migrationReport.failed
        });
      }
      const adminToken = randomHex(32);
      const indexnowKey = randomHex(32);
      await setSetting(env, "admin_token", adminToken);
      await setSetting(env, "indexnow_key", indexnowKey);
      await setSetting(env, "site_name_db", site_name);
      await setSetting(env, "site_url_db", site_url);
      if (body.install_method) await setSetting(env, "install_method", String(body.install_method).slice(0, 16));
      if (body.installed_sha) await setSetting(env, "installed_sha", String(body.installed_sha).slice(0, 64));
      if (body.install_repo_owner) await setSetting(env, "install_repo_owner", String(body.install_repo_owner).slice(0, 80));
      if (body.install_repo_name) await setSetting(env, "install_repo_name", String(body.install_repo_name).slice(0, 100));
      if (body.install_cf_account) await setSetting(env, "install_cf_account", String(body.install_cf_account).slice(0, 64));
      if (body.install_cf_project) await setSetting(env, "install_cf_project", String(body.install_cf_project).slice(0, 64));
      let creds;
      try {
        creds = await hashPassword(password);
      } catch (e) {
        return json(400, { error: String(e?.message || e) });
      }
      const id = newId();
      const t = nowSec();
      await env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, password_salt, created_at)
     VALUES (?, ?, ?, ?, ?)`
      ).bind(id, email, creds.hash, creds.salt, t).run();
      await setSetting(env, "onboarding_complete", String(nowSec()));
      return json(200, { ok: true, email, site_url });
    }, "onRequestPost");
  }
});

// api/version.js
function ghHeaders6(env) {
  const h = {
    "User-Agent": "pages-seo-version",
    Accept: "application/vnd.github+json"
  };
  if (env?.GITHUB_TOKEN) {
    h.Authorization = "Bearer " + String(env.GITHUB_TOKEN).trim();
  }
  return h;
}
function short4(sha) {
  return String(sha || "").slice(0, 7);
}
async function fetchLatestCommit(env) {
  const r = await fetch(
    `https://api.github.com/repos/${UPSTREAM_OWNER6}/${UPSTREAM_REPO6}/commits/${BRANCH4}`,
    { headers: ghHeaders6(env) }
  );
  if (!r.ok) return { error: "github_latest_failed", detail: "HTTP " + r.status };
  const c = await r.json();
  return {
    sha: c.sha,
    short: short4(c.sha),
    message: (c.commit?.message || "").split("\n")[0].slice(0, 200),
    date: c.commit?.author?.date || null,
    html_url: c.html_url,
    author: c.author?.login || c.commit?.author?.name || null
  };
}
async function fetchLatestTag(env) {
  try {
    const r = await fetch(
      `https://api.github.com/repos/${UPSTREAM_OWNER6}/${UPSTREAM_REPO6}/releases/latest`,
      { headers: ghHeaders6(env) }
    );
    if (r.status === 404 || !r.ok) {
      return { tag: null, tag_html_url: null, tag_name: null, tag_published_at: null, release_notes: null };
    }
    const d = await r.json();
    return {
      tag: d.tag_name || null,
      tag_html_url: d.html_url || null,
      tag_name: d.name || d.tag_name || null,
      tag_published_at: d.published_at || null,
      // Trim long release bodies — typical changelogs are well under 4 KB.
      release_notes: String(d.body || "").slice(0, 4e3) || null
    };
  } catch {
    return { tag: null, tag_html_url: null, tag_name: null, tag_published_at: null, release_notes: null };
  }
}
async function fetchRecentCommits(env, { perPage = 20 } = {}) {
  try {
    const r = await fetch(
      `https://api.github.com/repos/${UPSTREAM_OWNER6}/${UPSTREAM_REPO6}/commits?sha=${BRANCH4}&per_page=${perPage}`,
      { headers: ghHeaders6(env) }
    );
    if (!r.ok) return [];
    const arr = await r.json();
    if (!Array.isArray(arr)) return [];
    return arr.map((c) => ({
      sha: c.sha,
      short: short4(c.sha),
      message: (c.commit?.message || "").split("\n")[0].slice(0, 200),
      date: c.commit?.author?.date || null,
      url: c.html_url,
      author: c.author?.login || c.commit?.author?.name || null
    }));
  } catch {
    return [];
  }
}
async function fetchCommitsSinceTag(env, tag) {
  if (!tag) return null;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${UPSTREAM_OWNER6}/${UPSTREAM_REPO6}/compare/${encodeURIComponent(tag)}...${BRANCH4}`,
      { headers: ghHeaders6(env) }
    );
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d.ahead_by === "number" ? d.ahead_by : null;
  } catch {
    return null;
  }
}
var UPSTREAM_OWNER6, UPSTREAM_REPO6, BRANCH4, EDGE_CACHE_SEC3, BROWSER_CACHE_SEC3, onRequestGet69;
var init_version = __esm({
  "api/version.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    UPSTREAM_OWNER6 = "Benjamin-Bloch";
    UPSTREAM_REPO6 = "pages-seo";
    BRANCH4 = "main";
    EDGE_CACHE_SEC3 = 300;
    BROWSER_CACHE_SEC3 = 60;
    __name(ghHeaders6, "ghHeaders");
    __name(short4, "short");
    __name(fetchLatestCommit, "fetchLatestCommit");
    __name(fetchLatestTag, "fetchLatestTag");
    __name(fetchRecentCommits, "fetchRecentCommits");
    __name(fetchCommitsSinceTag, "fetchCommitsSinceTag");
    onRequestGet69 = /* @__PURE__ */ __name(async ({ request, env }) => {
      const [commit, tag, recent_commits] = await Promise.all([
        fetchLatestCommit(env),
        fetchLatestTag(env),
        fetchRecentCommits(env, { perPage: 20 })
      ]);
      if (commit?.error) {
        return json(502, {
          ok: false,
          error: commit.error,
          detail: commit.detail,
          hint: "GitHub may be rate-limiting or briefly unreachable. The cached response from /api/version will resume serving as soon as a successful refresh lands."
        });
      }
      const commits_since_tag = tag?.tag && tag.tag !== commit.sha ? await fetchCommitsSinceTag(env, tag.tag) : tag?.tag ? 0 : null;
      return new Response(JSON.stringify({
        ok: true,
        sha: commit.sha,
        short: commit.short,
        message: commit.message,
        date: commit.date,
        html_url: commit.html_url,
        author: commit.author,
        tag: tag.tag,
        tag_html_url: tag.tag_html_url,
        tag_name: tag.tag_name || null,
        tag_published_at: tag.tag_published_at || null,
        release_notes: tag.release_notes || null,
        commits_since_tag,
        recent_commits,
        fetched_at: Math.floor(Date.now() / 1e3)
      }, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          // Browsers refresh after 1 min, edge caches for 5 min, and
          // the stale-while-revalidate buys us 1 day of "stale but
          // usable" service if GitHub goes down briefly.
          "cache-control": `public, max-age=${BROWSER_CACHE_SEC3}, s-maxage=${EDGE_CACHE_SEC3}, stale-while-revalidate=86400`,
          "access-control-allow-origin": "*"
        }
      });
    }, "onRequestGet");
  }
});

// api/widget.js
function fmtDate(secs) {
  if (!secs) return { date: "", iso: "" };
  const d = new Date(secs * 1e3);
  if (isNaN(d.getTime())) return { date: "", iso: "" };
  return {
    date: d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    iso: d.toISOString()
  };
}
var MAX_PER_PAGE, MAX_Q_LENGTH, MAX_TAG_LENGTH, onRequestGet70;
var init_widget = __esm({
  "api/widget.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_widget_render();
    init_project_scope();
    MAX_PER_PAGE = 50;
    MAX_Q_LENGTH = 100;
    MAX_TAG_LENGTH = 200;
    __name(fmtDate, "fmtDate");
    onRequestGet70 = /* @__PURE__ */ __name(async ({ env, request }) => {
      if (!env?.DB) {
        return new Response(JSON.stringify({ error: "no_db_binding", posts: [], total: 0 }), {
          status: 503,
          headers: { "content-type": "application/json", "access-control-allow-origin": "*" }
        });
      }
      const url = new URL(request.url);
      const q = String(url.searchParams.get("q") || "").trim().slice(0, MAX_Q_LENGTH);
      const tag = String(url.searchParams.get("tag") || "").trim().slice(0, MAX_TAG_LENGTH).toLowerCase();
      const legacyCount = parseInt(url.searchParams.get("count"), 10);
      const page = Math.max(1, parseInt(url.searchParams.get("page"), 10) || 1);
      const perPage = Math.max(1, Math.min(
        MAX_PER_PAGE,
        parseInt(url.searchParams.get("per_page"), 10) || legacyCount || 10
      ));
      const where = ["status = 'published'"];
      const binds = [];
      const requestedSlug = String(url.searchParams.get("project") || "").trim().toLowerCase();
      let scopedProject = null;
      if (requestedSlug) {
        const project = await resolveProjectBySlug(env, requestedSlug);
        scopedProject = project;
        if (!project) {
          return new Response(JSON.stringify({ posts: [], total: 0, page: 1, per_page: perPage, total_pages: 1, q, tag }), {
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
              "access-control-allow-origin": "*"
            }
          });
        }
        where.push("project_id = ?");
        binds.push(project.id);
      } else {
        const project = await resolveProjectForRequest(env, request).catch(() => null);
        scopedProject = project;
        if (project?.id) {
          where.push("project_id = ?");
          binds.push(project.id);
        }
      }
      if (q) {
        where.push("(title LIKE ? OR meta_description LIKE ? OR slug LIKE ?)");
        const like = `%${q}%`;
        binds.push(like, like, like);
      }
      if (tag) {
        where.push("(',' || LOWER(keywords) || ',') LIKE ?");
        binds.push(`%,${tag},%`);
      }
      const whereSQL = "WHERE " + where.join(" AND ");
      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM blog_posts ${whereSQL}`
      ).bind(...binds).first().catch(() => ({ n: 0 }));
      const total = countRow?.n || 0;
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      const safePage = Math.min(page, totalPages);
      const offset = (safePage - 1) * perPage;
      const rows = await env.DB.prepare(
        `SELECT slug, title, meta_description, hero_image_key, keywords, published_at
       FROM blog_posts ${whereSQL}
       ORDER BY published_at DESC
       LIMIT ? OFFSET ?`
      ).bind(...binds, perPage, offset).all().catch(() => ({ results: [] }));
      const posts = (rows.results || []).map((r) => {
        const d = fmtDate(r.published_at);
        return {
          slug: r.slug,
          title: r.title,
          excerpt: r.meta_description || "",
          image: imageUrlFor5(r.hero_image_key, r.slug),
          date: d.date,
          iso: d.iso,
          keywords: r.keywords || ""
        };
      });
      return new Response(JSON.stringify({
        posts,
        total,
        page: safePage,
        per_page: perPage,
        total_pages: totalPages,
        q,
        tag,
        site_name: scopedProject?.site_name || null,
        language: scopedProject?.language || "vi",
        theme_color: scopedProject?.theme_color || null
      }), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=60, s-maxage=300",
          "access-control-allow-origin": "*"
        }
      });
    }, "onRequestGet");
  }
});

// _lib/cover_svg.js
function xml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
}
function wrapText(text, fontSize, layerWidthPx, maxLines = 6) {
  const charBudget = Math.max(8, Math.floor(layerWidthPx / (fontSize * 0.55)));
  const lines = [];
  for (const para of String(text).split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const trial = line ? line + " " + w : w;
      if (trial.length <= charBudget) line = trial;
      else {
        if (line) lines.push(line);
        line = w;
        if (lines.length >= maxLines) break;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
  }
  if (lines.length >= maxLines) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S{1,8}$/, "") + "\u2026";
  }
  return lines.slice(0, maxLines);
}
function googleFontFamily(stack) {
  const m = String(stack || "").match(/"([^"]+)"/);
  if (!m) return "";
  const fam = m[1].trim();
  if (/^(Times New Roman|Helvetica Neue|Courier New|Trebuchet MS|Arial|Impact)$/i.test(fam)) return "";
  return fam;
}
function selfHostedFontUrl(family, weight) {
  const w = String(weight || "400").replace(/\D/g, "") || "400";
  return SELF_HOSTED_FONTS[`${family}|${w}`] || null;
}
function colour(v) {
  if (!v) return "#000";
  return String(v);
}
function urlToR2Key2(url) {
  return String(url || "").replace(/^\/image\//, "").split("/").map(decodeURIComponent).join("/");
}
function needsInlining(href) {
  return typeof href === "string" && href.startsWith("/image/");
}
async function inlineFromR2(href, env) {
  if (!env?.IMAGES) return href;
  const key = urlToR2Key2(href);
  if (!key) return href;
  try {
    const obj = await env.IMAGES.get(key);
    if (!obj) return href;
    const buf = await obj.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let s = "";
    const chunk = 32768;
    for (let i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    const b64 = btoa(s);
    const mime = obj.httpMetadata?.contentType || "image/png";
    return `data:${mime};base64,${b64}`;
  } catch {
    return href;
  }
}
async function buildInlineMap(spec, env) {
  const out = /* @__PURE__ */ new Map();
  if (!env) return out;
  const urls = /* @__PURE__ */ new Set();
  if (needsInlining(spec?.background?.url)) urls.add(spec.background.url);
  for (const l of spec?.layers || []) {
    if (l?.kind === "logo" && needsInlining(l.url)) urls.add(l.url);
  }
  if (!urls.size) return out;
  const arr = [...urls];
  const resolved = await Promise.all(arr.map((u) => inlineFromR2(u, env)));
  arr.forEach((u, i) => out.set(u, resolved[i]));
  return out;
}
function renderLayer(layer, ctx, inlined) {
  const opacity = layer.opacity != null ? layer.opacity : 1;
  const rot = layer.rotation || 0;
  const cx = layer.x + layer.w / 2;
  const cy = layer.y + layer.h / 2;
  const transform = rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : "";
  const opAttr = opacity < 1 ? ` opacity="${opacity}"` : "";
  if (layer.kind === "box") {
    const fill = colour(layer.fill || "rgba(0,0,0,0.55)");
    const r = layer.radius || 0;
    return `<rect x="${layer.x}" y="${layer.y}" width="${layer.w}" height="${layer.h}" rx="${r}" ry="${r}" fill="${xml(fill)}"${opAttr}${transform}/>`;
  }
  if (layer.kind === "text") {
    const fontSize = layer.size || 60;
    const family = layer.family || "system-ui, sans-serif";
    const weight = layer.weight || "600";
    const italic = layer.italic ? "italic" : "normal";
    const align = layer.align || "left";
    const color = colour(layer.color || "#ffffff");
    const lineH = fontSize * (layer.lineHeight || 1.15);
    const display = renderTemplate(layer.text || "", ctx);
    const lines = wrapText(display, fontSize, layer.w);
    const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
    const anchorX = align === "center" ? layer.x + layer.w / 2 : align === "right" ? layer.x + layer.w : layer.x;
    const shadowId = layer.shadow ? `shadow-${Math.random().toString(36).slice(2, 8)}` : "";
    const shadowDef = layer.shadow ? `
  <defs>
    <filter id="${shadowId}" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="2" stdDeviation="${(layer.shadowBlur != null ? layer.shadowBlur : 8) / 2}" flood-color="${xml(layer.shadowColor || "rgba(0,0,0,0.6)")}"/>
    </filter>
  </defs>` : "";
    const filterAttr = shadowId ? ` filter="url(#${shadowId})"` : "";
    const tspans = lines.map(
      (line, i) => `<tspan x="${anchorX}" dy="${i === 0 ? 0 : lineH}">${xml(line)}</tspan>`
    ).join("");
    return `${shadowDef}<text x="${anchorX}" y="${layer.y + fontSize * 0.85}"
  font-family="${xml(family)}"
  font-size="${fontSize}"
  font-weight="${xml(weight)}"
  font-style="${italic}"
  fill="${xml(color)}"
  text-anchor="${anchor}"${opAttr}${filterAttr}${transform}>${tspans}</text>`;
  }
  if (layer.kind === "logo" && layer.url) {
    const href = inlined && inlined.get(layer.url) || layer.url;
    return `<image href="${xml(href)}" x="${layer.x}" y="${layer.y}" width="${layer.w}" height="${layer.h}" preserveAspectRatio="xMidYMid meet"${opAttr}${transform}/>`;
  }
  return "";
}
async function renderCoverSvg(spec, ctx, env) {
  const W2 = spec?.width || 1200;
  const H2 = spec?.height || 630;
  const layers = Array.isArray(spec?.layers) ? spec.layers : [];
  const inlined = await buildInlineMap(spec, env);
  const fontFaces = /* @__PURE__ */ new Map();
  for (const l of layers) {
    if (l.kind !== "text") continue;
    const fam = googleFontFamily(l.family);
    if (!fam) continue;
    const url = selfHostedFontUrl(fam, l.weight);
    if (!url) continue;
    const w = String(l.weight || "400").replace(/\D/g, "") || "400";
    const key = `${fam}|${w}`;
    if (!fontFaces.has(key)) {
      fontFaces.set(key, { family: fam, weight: w, url });
    }
  }
  const fontRules = [...fontFaces.values()].map(
    ({ family, weight, url }) => `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:swap;src:url("${url}") format("woff2");}`
  ).join("");
  const styleBlock = fontRules ? `<style><![CDATA[${fontRules}]]></style>` : "<style></style>";
  let backgroundEl = "";
  if (spec?.background?.url) {
    const bgHref = inlined.get(spec.background.url) || spec.background.url;
    backgroundEl = `<image href="${xml(bgHref)}" x="0" y="0" width="${W2}" height="${H2}" preserveAspectRatio="xMidYMid slice"/>`;
  } else {
    backgroundEl = `<rect x="0" y="0" width="${W2}" height="${H2}" fill="#0a0c10"/>`;
  }
  const layerEls = layers.map((l) => renderLayer(l, ctx, inlined)).filter(Boolean).join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W2} ${H2}" width="${W2}" height="${H2}">
  ${styleBlock}
  ${backgroundEl}
  ${layerEls}
</svg>`;
}
var SELF_HOSTED_FONTS;
var init_cover_svg = __esm({
  "_lib/cover_svg.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_template();
    __name(xml, "xml");
    __name(wrapText, "wrapText");
    __name(googleFontFamily, "googleFontFamily");
    SELF_HOSTED_FONTS = {
      "Inter|400": "/_fonts/inter-400.woff2",
      "Inter|500": "/_fonts/inter-500.woff2",
      "Inter|600": "/_fonts/inter-600.woff2",
      "Instrument Serif|400": "/_fonts/instrument-serif-400.woff2"
    };
    __name(selfHostedFontUrl, "selfHostedFontUrl");
    __name(colour, "colour");
    __name(urlToR2Key2, "urlToR2Key");
    __name(needsInlining, "needsInlining");
    __name(inlineFromR2, "inlineFromR2");
    __name(buildInlineMap, "buildInlineMap");
    __name(renderLayer, "renderLayer");
    __name(renderCoverSvg, "renderCoverSvg");
  }
});

// _lib/notices.js
async function recordNotice(env, notice) {
  if (!env?.DB) return;
  if (!notice?.kind || !notice?.title) return;
  const kind = String(notice.kind).slice(0, 64);
  const title = String(notice.title).slice(0, 200);
  const detail = notice.detail ? String(notice.detail).slice(0, 1200) : null;
  const severity = VALID_SEVERITIES.has(notice.severity) ? notice.severity : "warn";
  const actionUrl = notice.action_url ? String(notice.action_url).slice(0, 500) : null;
  const actionLabel = notice.action_label ? String(notice.action_label).slice(0, 60) : null;
  try {
    const existing = await env.DB.prepare(
      `SELECT id FROM admin_notices
        WHERE kind = ? AND dismissed_at IS NULL
        LIMIT 1`
    ).bind(kind).first();
    if (existing?.id) return;
    await env.DB.prepare(
      `INSERT INTO admin_notices
         (id, kind, severity, title, detail, action_url, action_label, created_at, dismissed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    ).bind(
      newId(),
      kind,
      severity,
      title,
      detail,
      actionUrl,
      actionLabel,
      nowSec()
    ).run();
  } catch {
  }
}
async function clearNotice(env, kind) {
  if (!env?.DB || !kind) return;
  try {
    await env.DB.prepare(
      `UPDATE admin_notices SET dismissed_at = ?
        WHERE kind = ? AND dismissed_at IS NULL`
    ).bind(nowSec(), String(kind).slice(0, 64)).run();
  } catch {
  }
}
var VALID_SEVERITIES;
var init_notices2 = __esm({
  "_lib/notices.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    VALID_SEVERITIES = /* @__PURE__ */ new Set(["info", "warn", "error"]);
    __name(recordNotice, "recordNotice");
    __name(clearNotice, "clearNotice");
  }
});

// cover/[slug].svg.js
var onRequestGet71;
var init_slug_svg = __esm({
  "cover/[slug].svg.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_cover_svg();
    init_template();
    init_settings();
    init_notices2();
    onRequestGet71 = /* @__PURE__ */ __name(async ({ env, request, params }) => {
      const slug = String(params.slug || "").toLowerCase();
      if (!/^[a-z0-9-]{1,200}$/.test(slug)) {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      }
      let post = null;
      let kind = "blog";
      try {
        post = await env.DB.prepare(
          `SELECT slug, title, meta_description, body_markdown, hero_image_key, hero_image_alt,
              keywords, ai_provider, status, published_at
       FROM blog_posts WHERE slug = ? AND status='published' LIMIT 1`
        ).bind(slug).first();
        if (!post) {
          post = await env.DB.prepare(
            `SELECT slug, title, meta_description, body_markdown, hero_image_key, hero_image_alt,
                keyword, ai_provider, status, published_at
         FROM prog_pages WHERE slug = ? AND status='published' LIMIT 1`
          ).bind(slug).first();
          kind = "programmatic";
        }
      } catch {
      }
      let template = null;
      try {
        template = await env.DB.prepare(
          `SELECT spec_json FROM cover_templates WHERE is_default = 1 LIMIT 1`
        ).first();
      } catch {
      }
      if (!template?.spec_json) {
        recordNotice(env, {
          kind: "cover_template_missing",
          severity: "warn",
          title: "No default cover template",
          detail: "Posts without an AI-generated hero image fall back to a plain card. Set a default in Covers, or run the install-default-cover script.",
          action_url: "/admin#covers",
          action_label: "Open Covers"
        });
        return new Response("No default cover template configured", {
          status: 404,
          headers: { "content-type": "text/plain" }
        });
      }
      clearNotice(env, "cover_template_missing");
      let spec;
      try {
        spec = JSON.parse(template.spec_json);
      } catch {
        return new Response("Template spec corrupt", { status: 500, headers: { "content-type": "text/plain" } });
      }
      const settings = await loadSettings(env).catch(() => ({}));
      const fakePost = post || { slug, title: slug.replace(/-/g, " "), body_markdown: "", published_at: 0 };
      fakePost.urlPath = kind === "blog" ? `/blog/${slug}` : `/p/${slug}`;
      const ctx = buildBrandContext({ env, settings, post: fakePost, request, kind });
      const svg = await renderCoverSvg(spec, ctx, env);
      return new Response(svg, {
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
          // Browser cache 1 day, edge 1 hour. Templates are rarely-changing
          // but the source of truth is D1; an hour at the edge is enough
          // freshness for OG scrapers and slow enough to coast.
          // 5 min browser, 15 min edge. Short enough that template
          // edits propagate quickly (a stale ?v= cache key catches
          // the rest), long enough to amortise the R2-inline cost
          // across a normal day's traffic.
          "cache-control": "public, max-age=300, s-maxage=900"
        }
      });
    }, "onRequestGet");
  }
});

// og/[slug].svg.js
function fallbackSpec() {
  return {
    width: W,
    height: H,
    layers: [
      { id: "bg", kind: "box", x: 0, y: 0, w: W, h: H, fill: "#0a0c10", radius: 0 },
      { id: "rule", kind: "box", x: 80, y: 60, w: 200, h: 2, fill: "#d4af62", radius: 0 },
      {
        id: "eyebrow",
        kind: "text",
        x: 80,
        y: 80,
        w: 700,
        h: 30,
        text: "{brand.name|upper}",
        size: 22,
        family: '"JetBrains Mono", monospace',
        weight: "600",
        align: "left",
        color: "#d4af62",
        shadow: false
      },
      {
        id: "title",
        kind: "text",
        x: 80,
        y: 280,
        w: 1040,
        h: 240,
        text: "{title}",
        size: 76,
        family: '"Playfair Display", Georgia, serif',
        weight: "700",
        align: "left",
        color: "#f5f0e6",
        shadow: false
      },
      {
        id: "sig",
        kind: "text",
        x: 80,
        y: 560,
        w: 600,
        h: 30,
        text: "{pub_date|date:long} \xB7 {reading_time}",
        size: 16,
        family: '"JetBrains Mono", monospace',
        weight: "400",
        align: "left",
        color: "rgba(245,240,230,0.55)",
        shadow: false
      }
    ]
  };
}
var W, H, onRequestGet72;
var init_slug_svg2 = __esm({
  "og/[slug].svg.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_cover_svg();
    init_template();
    init_settings();
    init_util();
    W = 1200;
    H = 630;
    __name(fallbackSpec, "fallbackSpec");
    onRequestGet72 = /* @__PURE__ */ __name(async ({ env, request, params }) => {
      const slug = String(params.slug || "").toLowerCase();
      if (!/^[a-z0-9-]{1,200}$/.test(slug)) {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      }
      let post = null;
      let kind = "blog";
      try {
        post = await env.DB.prepare(
          `SELECT slug, title, meta_description, body_markdown, hero_image_key,
              keywords, ai_provider, status, published_at
       FROM blog_posts WHERE slug = ? AND status='published' LIMIT 1`
        ).bind(slug).first();
        if (!post) {
          post = await env.DB.prepare(
            `SELECT slug, title, meta_description, body_markdown, hero_image_key,
                keyword, ai_provider, status, published_at
         FROM prog_pages WHERE slug = ? AND status='published' LIMIT 1`
          ).bind(slug).first();
          kind = "programmatic";
        }
      } catch {
      }
      let spec = null;
      try {
        const row = await env.DB.prepare(
          `SELECT spec_json FROM cover_templates WHERE is_default = 1 LIMIT 1`
        ).first();
        if (row?.spec_json) spec = JSON.parse(row.spec_json);
      } catch {
      }
      if (!spec) spec = fallbackSpec();
      const settings = await loadSettings(env).catch(() => ({}));
      const fakePost = post || { slug, title: slug.replace(/-/g, " "), body_markdown: "", published_at: 0 };
      fakePost.urlPath = kind === "blog" ? `/blog/${slug}` : `/p/${slug}`;
      const ctx = buildBrandContext({ env, settings, post: fakePost, request, kind });
      const svg = await renderCoverSvg(spec, ctx, env);
      return new Response(svg, {
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
          // OG card lookups go through social-share scrapers that cache
          // aggressively on their own end (Twitter, Slack, FB all
          // cache for hours-to-days regardless of our headers), so a
          // short server-side cache is fine — the practical refresh
          // rate is dominated by the scrapers' own caches.
          "cache-control": "public, max-age=300, s-maxage=900"
        }
      });
    }, "onRequestGet");
  }
});

// image/[[path]].js
var onRequestGet73;
var init_path = __esm({
  "image/[[path]].js"() {
    init_functionsRoutes_0_09583509623234443();
    onRequestGet73 = /* @__PURE__ */ __name(async ({ env, params }) => {
      const parts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
      const key = parts.join("/");
      if (!key || !/^[a-zA-Z0-9._/-]+$/.test(key) || key.includes("..")) {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      }
      if (!env.IMAGES) return new Response("R2 not bound", { status: 500 });
      const obj = await env.IMAGES.get(key);
      if (!obj) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set("cache-control", "public, max-age=31536000, immutable");
      headers.set("etag", obj.httpEtag);
      headers.set("access-control-allow-origin", "*");
      return new Response(obj.body, { headers });
    }, "onRequestGet");
  }
});

// [project]/blog/index.js
var onRequestGet74;
var init_blog2 = __esm({
  "[project]/blog/index.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_blog();
    init_project_scope();
    onRequestGet74 = /* @__PURE__ */ __name(async (ctx) => {
      const slug = String(ctx.params?.project || "").toLowerCase();
      const project = await resolveProjectBySlugPath(ctx.env, slug).catch(() => null);
      if (!project) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      return renderBlogIndex({ env: ctx.env, request: ctx.request, page: 1, projectSlug: slug, basePath: `/${slug}` });
    }, "onRequestGet");
  }
});

// feed.xml.js
function rfc822(epoch) {
  return new Date((epoch || 0) * 1e3).toUTCString();
}
var ITEMS_LIMIT, onRequestGet75;
var init_feed_xml = __esm({
  "feed.xml.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_settings();
    init_util();
    init_project_scope();
    ITEMS_LIMIT = 30;
    __name(rfc822, "rfc822");
    onRequestGet75 = /* @__PURE__ */ __name(async ({ env, request, params }) => {
      const settings = await loadSettings(env).catch(() => ({}));
      const projectSlug = String(params?.project || "").toLowerCase() || null;
      const basePath = projectSlug ? `/${projectSlug}` : "";
      const project = projectSlug ? await resolveProjectBySlug(env, projectSlug).catch(() => null) : await resolveProjectForRequest(env, request).catch(() => null);
      if (projectSlug && !project) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      const projectId = project?.id || null;
      const customHost = project?.custom_domain ? normalizeHost(project.custom_domain) : null;
      const feedOrigin = customHost ? `https://${customHost}` : new URL(request.url).origin;
      const feedBasePath = customHost ? "" : basePath;
      const siteUrl = `${feedOrigin}${feedBasePath}/`;
      const feedUrl = `${feedOrigin}${feedBasePath}/feed.xml`;
      const siteName = project?.site_name || env.SITE_NAME || settings.site_name || "pages-seo";
      const siteDesc = project?.site_description || env.SITE_DESCRIPTION || settings.site_description || `Articles from ${siteName}.`;
      const postsSql = projectId ? `SELECT slug, title, meta_description, published_at
         FROM blog_posts
        WHERE status = 'published' AND project_id = ?
        ORDER BY published_at DESC LIMIT ?` : `SELECT slug, title, meta_description, published_at
         FROM blog_posts
        WHERE status = 'published'
        ORDER BY published_at DESC LIMIT ?`;
      const rows = await (projectId ? env.DB.prepare(postsSql).bind(projectId, ITEMS_LIMIT) : env.DB.prepare(postsSql).bind(ITEMS_LIMIT)).all().catch(() => ({ results: [] }));
      const posts = rows.results || [];
      const lastBuild = posts.length ? rfc822(posts[0].published_at) : (/* @__PURE__ */ new Date()).toUTCString();
      const items = posts.map((p) => {
        const url = `${feedOrigin}${feedBasePath}/blog/${p.slug}`;
        return `    <item>
      <title>${esc(p.title || "")}</title>
      <link>${esc(url)}</link>
      <guid isPermaLink="true">${esc(url)}</guid>
      <description>${esc((p.meta_description || "").slice(0, 500))}</description>
      <pubDate>${rfc822(p.published_at)}</pubDate>
    </item>`;
      }).join("\n");
      const xml2 = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(siteName)}</title>
    <link>${esc(siteUrl)}</link>
    <description>${esc(siteDesc)}</description>
    <language>en</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <ttl>300</ttl>
    <atom:link href="${esc(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
      return new Response(xml2, {
        headers: {
          "content-type": "application/rss+xml; charset=utf-8",
          // Same cache tier as sitemap.xml — fresh enough for aggregators
          // (which typically poll every 30-60 min) without burning D1
          // reads on bot crawls.
          "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400"
        }
      });
    }, "onRequestGet");
  }
});

// [project]/feed.xml.js
var onRequestGet76;
var init_feed_xml2 = __esm({
  "[project]/feed.xml.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_feed_xml();
    init_project_scope();
    onRequestGet76 = /* @__PURE__ */ __name(async (ctx) => {
      const slug = String(ctx.params?.project || "").toLowerCase();
      const project = await resolveProjectBySlugPath(ctx.env, slug).catch(() => null);
      if (!project) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      return onRequestGet75({ env: ctx.env, request: ctx.request, params: { project: slug } });
    }, "onRequestGet");
  }
});

// [project]/rss.xml.js
var onRequestGet77;
var init_rss_xml = __esm({
  "[project]/rss.xml.js"() {
    init_functionsRoutes_0_09583509623234443();
    onRequestGet77 = /* @__PURE__ */ __name(async () => new Response(null, {
      status: 301,
      headers: { location: "feed.xml", "cache-control": "public, max-age=3600" }
    }), "onRequestGet");
  }
});

// sitemap.xml.js
function isoDay(secOrZero) {
  const ms = (secOrZero || 0) * 1e3;
  if (!ms) return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return new Date(ms).toISOString().slice(0, 10);
}
function renderIndex(site, lastmod, basePath = "") {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<sitemapindex xmlns="${SITEMAP_NS}">`,
    "  <sitemap>",
    `    <loc>${site}${basePath}/sitemap-pages.xml</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    "  </sitemap>",
    "</sitemapindex>"
  ].join("\n");
}
function renderUrlset(site, entries) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="${SITEMAP_NS}" xmlns:image="${IMAGE_NS}">`,
    ...entries.map((e) => {
      const imgs = (e.images || []).map(
        (img) => `    <image:image>
      <image:loc>${esc(img.loc)}</image:loc>${img.title ? `
      <image:title>${esc(img.title)}</image:title>` : ""}${img.caption ? `
      <image:caption>${esc(img.caption)}</image:caption>` : ""}
    </image:image>`
      ).join("\n");
      return `  <url>
    <loc>${site}${e.path}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
${imgs ? imgs + "\n" : ""}  </url>`;
    }),
    "</urlset>"
  ].join("\n");
}
async function fetchEntries(env, host, project = null, basePath = "") {
  const site = `https://${host}`;
  const projectId = project?.id || null;
  const blogsSql = projectId ? `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at
         FROM blog_posts WHERE status='published' AND project_id = ?
         ORDER BY published_at DESC LIMIT 5000` : `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at
         FROM blog_posts WHERE status='published'
         ORDER BY published_at DESC LIMIT 5000`;
  const blogs = await (projectId ? env.DB.prepare(blogsSql).bind(projectId) : env.DB.prepare(blogsSql)).all().catch(() => ({ results: [] }));
  const progsSql = projectId ? `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at
         FROM prog_pages WHERE status='published' AND project_id = ?
         ORDER BY published_at DESC LIMIT 10000` : `SELECT slug, title, meta_description, hero_image_key, hero_image_alt, published_at
         FROM prog_pages WHERE status='published'
         ORDER BY published_at DESC LIMIT 10000`;
  const progs = await (projectId ? env.DB.prepare(progsSql).bind(projectId) : env.DB.prepare(progsSql)).all().catch(() => ({ results: [] }));
  const totalBlogsSql = projectId ? `SELECT COUNT(*) AS n FROM blog_posts WHERE status='published' AND project_id = ?` : `SELECT COUNT(*) AS n FROM blog_posts WHERE status='published'`;
  const totalBlogsRow = await (projectId ? env.DB.prepare(totalBlogsSql).bind(projectId) : env.DB.prepare(totalBlogsSql)).first().catch(() => ({ n: 0 }));
  const totalPages = Math.max(1, Math.ceil((totalBlogsRow?.n || 0) / PAGE_SIZE));
  const today = isoDay(0);
  const entries = basePath ? [{ path: `${basePath}/blog`, priority: "1.0", changefreq: "daily", lastmod: today }] : [
    { path: "/", priority: "1.0", changefreq: "weekly", lastmod: today },
    { path: "/blog", priority: "0.9", changefreq: "daily", lastmod: today }
  ];
  for (let i = 2; i <= totalPages; i++) {
    entries.push({ path: `${basePath}/blog/page/${i}`, priority: "0.5", changefreq: "weekly", lastmod: today });
  }
  for (const p of blogs.results || []) {
    const images = p.hero_image_key ? [{
      loc: `${site}/image/${p.hero_image_key}`,
      title: p.title,
      caption: p.hero_image_alt || p.meta_description || ""
    }] : [];
    entries.push({
      path: `${basePath}/blog/${p.slug}`,
      priority: "0.7",
      changefreq: "monthly",
      lastmod: isoDay(p.published_at),
      images
    });
  }
  for (const p of progs.results || []) {
    const images = p.hero_image_key ? [{
      loc: `${site}/image/${p.hero_image_key}`,
      title: p.title,
      caption: p.hero_image_alt || p.meta_description || ""
    }] : [];
    entries.push({
      path: `${basePath}/p/${p.slug}`,
      priority: "0.6",
      changefreq: "monthly",
      lastmod: isoDay(p.published_at),
      images
    });
  }
  return entries;
}
async function pagesUrlset({ env, request, projectSlug = null, basePath = "" }) {
  const host = requestHost(request);
  let project = null;
  if (projectSlug) {
    project = await resolveProjectBySlug(env, projectSlug).catch(() => null);
    if (!project) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  } else {
    project = await resolveProjectByHost(env, host).catch(() => null);
  }
  const customHost = project?.custom_domain ? normalizeHost(project.custom_domain) : null;
  const effectiveHost = customHost || host;
  const effectiveBasePath = customHost ? "" : basePath || (projectSlug ? `/${projectSlug}` : "");
  const entries = await fetchEntries(env, effectiveHost, project, effectiveBasePath);
  const body = renderUrlset(`https://${effectiveHost}`, entries);
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600"
    }
  });
}
var SITEMAP_NS, IMAGE_NS, onRequestGet78;
var init_sitemap_xml = __esm({
  "sitemap.xml.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    init_blog();
    init_project_scope();
    SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
    IMAGE_NS = "http://www.google.com/schemas/sitemap-image/1.1";
    __name(isoDay, "isoDay");
    __name(renderIndex, "renderIndex");
    __name(renderUrlset, "renderUrlset");
    __name(fetchEntries, "fetchEntries");
    onRequestGet78 = /* @__PURE__ */ __name(async ({ env, request, params }) => {
      const host = requestHost(request);
      const projectSlug = String(params?.project || "").toLowerCase() || null;
      let project = null;
      if (projectSlug) {
        project = await resolveProjectBySlug(env, projectSlug).catch(() => null);
        if (!project) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      } else {
        project = await resolveProjectByHost(env, host).catch(() => null);
      }
      const customHost = project?.custom_domain ? normalizeHost(project.custom_domain) : null;
      const effectiveHost = customHost || host;
      const effectiveBasePath = customHost ? "" : projectSlug ? `/${projectSlug}` : "";
      const body = renderIndex(`https://${effectiveHost}`, isoDay(0), effectiveBasePath);
      return new Response(body, {
        headers: {
          "content-type": "application/xml; charset=utf-8",
          "cache-control": "public, max-age=3600"
        }
      });
    }, "onRequestGet");
    __name(pagesUrlset, "pagesUrlset");
  }
});

// [project]/sitemap-pages.xml.js
var onRequestGet79;
var init_sitemap_pages_xml = __esm({
  "[project]/sitemap-pages.xml.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_sitemap_xml();
    init_project_scope();
    onRequestGet79 = /* @__PURE__ */ __name(async (ctx) => {
      const slug = String(ctx.params?.project || "").toLowerCase();
      const project = await resolveProjectBySlugPath(ctx.env, slug).catch(() => null);
      if (!project) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      return pagesUrlset({ env: ctx.env, request: ctx.request, projectSlug: slug, basePath: `/${slug}` });
    }, "onRequestGet");
  }
});

// [project]/sitemap.xml.js
var onRequestGet80;
var init_sitemap_xml2 = __esm({
  "[project]/sitemap.xml.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_sitemap_xml();
    init_project_scope();
    onRequestGet80 = /* @__PURE__ */ __name(async (ctx) => {
      const slug = String(ctx.params?.project || "").toLowerCase();
      const project = await resolveProjectBySlugPath(ctx.env, slug).catch(() => null);
      if (!project) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      return onRequestGet78({ env: ctx.env, request: ctx.request, params: { project: slug } });
    }, "onRequestGet");
  }
});

// docs/index.js
function renderToc() {
  return `<nav class="docs-toc" aria-label="Table of contents">
  <strong>On this page</strong>
  <ol>${SECTIONS.map((s) => `<li><a href="#${esc(s.id)}">${esc(s.title)}</a></li>`).join("")}</ol>
</nav>`;
}
function renderSections() {
  return SECTIONS.map(
    (s) => `<section id="${esc(s.id)}" class="docs-section">
  <h2>${esc(s.title)} <a class="anchor" href="#${esc(s.id)}" aria-label="link">#</a></h2>
  ${s.content}
</section>`
  ).join("\n");
}
var SECTIONS, onRequestGet81;
var init_docs = __esm({
  "docs/index.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    SECTIONS = [
      { id: "quick-start", title: "Quick start", level: 1, content: `
<p class="lede">Two ways to install pages-seo. Pick whichever you can run.</p>
<h3>Browser install (recommended)</h3>
<ol>
  <li>Go to <a href="/install">/install</a></li>
  <li>Click <em>Sign in with GitHub</em>. We use OAuth to look up your account and create a fork of <code>Benjamin-Bloch/pages-seo</code>.</li>
  <li>Click <em>Create a Cloudflare API token</em>. The link pre-selects the right permissions; click <em>Continue</em>, <em>Continue</em>, <em>Create</em>, then copy the token.</li>
  <li>Paste the token back into the install tab (we attempt to auto-paste from clipboard).</li>
  <li>Type your site name. The Pages subdomain comes from a slug auto-derived from the name.</li>
  <li>Click <em>Install</em>. The installer creates D1, R2, the Pages project, applies the schema, hands you a one-time magic link.</li>
  <li>Open the link to set your admin email + password on your new site.</li>
</ol>
<h3>CLI install</h3>
<p>If you'd rather stay in the terminal, paste one of these in your shell. Each is the same logic in a different language \u2014 pick what you have installed.</p>
<pre><code># bash
curl -fsSL https://seo.benjaminb.xyz/install/run.sh | bash

# python
curl -fsSL https://seo.benjaminb.xyz/install/run.py | python3

# node
curl -fsSL https://seo.benjaminb.xyz/install/run.js | node</code></pre>
<p>Both paths end in the same place: <code>https://&lt;your-slug&gt;.pages.dev/admin</code>.</p>
` },
      { id: "setup", title: "Setup walkthrough", level: 1, content: `
<p>The full happy-path install with what each step actually does.</p>

<h3 id="setup-prereqs">Prerequisites</h3>
<ul>
  <li>A Cloudflare account (free tier is enough).</li>
  <li>A GitHub account.</li>
  <li>If using the CLI: <code>node \u2265 18</code> + <code>npm</code> (wrangler bootstraps from there).</li>
</ul>

<h3 id="setup-github">Step 1 \u2014 Sign in with GitHub</h3>
<p>The OAuth scope we request is <code>public_repo read:user user:email</code>. We use these for: creating your fork (<code>public_repo</code>), listing your Cloudflare GitHub App installation (<code>read:user</code>), and prefilling your admin email (<code>user:email</code>). We do NOT request private-repo access. Your token never leaves the browser tab + the encrypted cookie that holds it for the duration of the install.</p>

<h3 id="setup-fork">Step 2 \u2014 Fork the upstream repo</h3>
<p>We create <code>&lt;your-login&gt;/pages-seo</code> via the GitHub API. If you already have that name taken by a non-fork repo, the installer tells you and asks you to rename it on GitHub first.</p>

<h3 id="setup-cf-app">Step 3 \u2014 Authorise the Cloudflare GitHub App</h3>
<p>Cloudflare Pages can only see GitHub repos owned by an account that has authorised the <em>Cloudflare Workers and Pages</em> app. The installer attempts to add your new fork to your existing installation automatically (via <code>PUT /user/installations/:id/repositories/:repo_id</code>). If you've never installed the app at all, you'll be sent to <a href="https://github.com/apps/cloudflare-workers-and-pages/installations/new" target="_blank">github.com/apps/cloudflare-workers-and-pages</a> to do that once.</p>

<h3 id="setup-cf-token">Step 4 \u2014 Cloudflare API token</h3>
<p>The token link pre-selects six permissions on your account: <code>Cloudflare Pages: Edit</code>, <code>D1: Edit</code>, <code>Workers R2: Edit</code>, <code>Workers AI: Edit</code>, <code>Workers Scripts: Edit</code>, <code>Account Settings: Read</code>. The token is account-scoped (NOT user-API-key-scoped) so the blast radius is minimal \u2014 anyone who steals it can manage Pages/D1/R2/AI on your account, nothing else.</p>

<h3 id="setup-provision">Step 5 \u2014 Provisioning</h3>
<p>The installer runs six idempotent steps:</p>
<ol>
  <li>Resolve your account id from the token.</li>
  <li>Create (or reuse) a D1 database named <code>&lt;your-slug&gt;</code>.</li>
  <li>Create (or reuse) an R2 bucket named <code>&lt;your-slug&gt;-images</code>.</li>
  <li>Create the Pages project bound to your fork + D1 + R2 + Workers AI.</li>
  <li>PATCH the project bindings (Cloudflare's POST sometimes silently drops them; we verify and retry).</li>
  <li>Trigger the first deployment.</li>
</ol>
<p>State is saved to the installer's own D1 keyed by <code>(project_slug, token_fingerprint)</code>. If you close the tab mid-install, re-opening <a href="/install">/install</a> and pasting the same token resumes from the last completed step.</p>

<h3 id="setup-magic-link">Step 6 \u2014 Magic link</h3>
<p>The installer hands you a one-time URL <code>/admin?setup=&lt;hex&gt;&amp;email=&lt;your-gh-email&gt;</code>. Visit it once to set your admin password. The token is consumed on first POST; re-using it returns 401.</p>
` },
      { id: "troubleshooting", title: "Troubleshooting", level: 1, content: `
<p>Symptom \u2192 cause \u2192 fix. If your symptom isn't here, check the <a href="#errors">error code reference</a> below.</p>

<h3 id="ts-marketing-page">My site shows the maintainer's marketing page</h3>
<p><strong>Cause:</strong> your fork is stale \u2014 you forked before the marketing/installer code was moved to a separate repo. Cloudflare Pages built the wrong commit.</p>
<p><strong>Fix:</strong> open <a href="/update">/update</a>, sign in with GitHub, click <em>Sync from upstream</em>, then redeploy. Or rerun <a href="/install">/install</a> with the same slug \u2014 the auto-sync step runs.</p>

<h3 id="ts-no-db-binding">/admin shows <code>no_db_binding</code></h3>
<p><strong>Cause:</strong> Cloudflare Pages occasionally drops D1/R2 bindings during a project update. The site's Functions can't see <code>env.DB</code>.</p>
<p><strong>Fix:</strong> if you installed before this fix shipped, visit <a href="/repair">/repair</a>, paste your CF token, repair runs the bindings PATCH that fixes you. If you installed after, the site fixes itself on first /admin visit by calling its own <code>/api/repair-bindings</code> endpoint. See also <a href="#err-no_db_binding">#err-no_db_binding</a>.</p>

<h3 id="ts-cron-not-firing">Daily blog isn't generating</h3>
<p><strong>Cause:</strong> either the cron trigger isn't set on the Pages project, your monthly budget is exceeded, no provider is configured, or the AI binding is missing.</p>
<p><strong>Fix:</strong> in /admin \u2192 Settings, check that at least one provider is configured with a non-zero rate limit. Check /admin \u2192 Usage for spend this month. Click <em>Test provider</em> next to each one to verify the key works. If the cron itself isn't firing, the Cloudflare dashboard's project \u2192 Settings \u2192 Cron Triggers should show one entry pointing at the rebuild endpoint.</p>

<h3 id="ts-images-broken">Hero images don't load</h3>
<p><strong>Cause:</strong> R2 binding missing (<code>r2_binding_missing</code>), or the image generator hit a provider error and the post shipped without a key.</p>
<p><strong>Fix:</strong> /admin \u2192 Status (when this page lands) shows R2 health. If R2 is fine, click into the post in the calendar; if <code>hero_image_key</code> is null, click <em>Regenerate image</em>. If you're on cover-mode the hero is server-rendered from <code>/cover/&lt;slug&gt;.svg</code> \u2014 no per-post storage needed.</p>

<h3 id="ts-install-cf-app">"Internal issue with your Cloudflare Pages Git installation"</h3>
<p><strong>Cause:</strong> Cloudflare can't see your fork because the <em>Cloudflare Workers and Pages</em> GitHub App either isn't installed or doesn't have access to the new fork.</p>
<p><strong>Fix:</strong> click the <em>Manage permissions</em> link in the install failure pane. You'll land on github.com pre-narrowed to your new fork; tick it, save. Retry install \u2014 it'll resume from where it stopped.</p>

<h3 id="ts-gh-rate-limit">"GitHub API rate limit exceeded"</h3>
<p><strong>Cause:</strong> the unauthenticated GitHub API has a 60-req/hr-per-IP cap, and the installer uses it for upstream commit lookups.</p>
<p><strong>Fix:</strong> wait an hour. Or sign in with GitHub first \u2014 the authenticated cap is 5000/hr.</p>

<h3 id="ts-stuck-install">Install tab crashed mid-flow</h3>
<p><strong>Cause:</strong> network blip, browser refresh, or just closing the tab.</p>
<p><strong>Fix:</strong> reopen <a href="/install">/install</a> in the same browser. The installer remembers the slug + token fingerprint and resumes from the last completed step. If you used a different browser, paste the same CF token \u2014 state is keyed by token fingerprint.</p>
` },
      { id: "errors", title: "Error code reference", level: 1, content: `
<p>Every error code emitted by the install and admin APIs. Searchable by URL anchor (e.g. <code>/docs#err-wrong_parent</code>).</p>

<dl class="err-dl">
  <dt id="err-bad_json"><code>bad_json</code></dt>
  <dd>The request body didn't parse as JSON. Usually a missing <code>Content-Type</code> header or a truncated body. Refresh the page and try again.</dd>

  <dt id="err-missing_id"><code>missing_id</code></dt>
  <dd>An endpoint that needs <code>?id=\u2026</code> got called without one. Open the page again from the link that surfaced the action.</dd>

  <dt id="err-unauthorized"><code>unauthorized</code></dt>
  <dd>Your session cookie expired or the admin bearer token didn't match. Sign back in at <code>/admin</code>.</dd>

  <dt id="err-no_db_binding"><code>no_db_binding</code></dt>
  <dd>The Pages project lost its D1 binding. See <a href="#ts-no-db-binding">troubleshooting</a> for the repair path. Won't recur after a fresh install \u2014 the install flow now PATCHes and verifies bindings.</dd>

  <dt id="err-r2_binding_missing"><code>r2_binding_missing</code></dt>
  <dd>Same shape as no_db_binding but for the R2 bucket. Same repair flow at <a href="/repair">/repair</a>.</dd>

  <dt id="err-wrong_parent"><code>wrong_parent</code></dt>
  <dd>You have a repo called <code>pages-seo</code> on GitHub but it's a fork of something other than <code>Benjamin-Bloch/pages-seo</code>. Rename it on GitHub or use a different account.</dd>

  <dt id="err-name_taken"><code>name_taken</code></dt>
  <dd>You have a non-fork repo called <code>pages-seo</code> on GitHub. Rename or delete it, then retry the install.</dd>

  <dt id="err-fork_failed"><code>fork_failed</code></dt>
  <dd>GitHub refused the fork creation. Most common reason: you're a member of the <code>Benjamin-Bloch</code> org with conflicting permissions. Use a personal account.</dd>

  <dt id="err-github_app_required"><code>github_app_required</code></dt>
  <dd>The Cloudflare Workers and Pages GitHub App doesn't have access to your fork. The error response includes a deep link to authorise it. See <a href="#ts-install-cf-app">troubleshooting</a>.</dd>

  <dt id="err-token-rejected"><code>Token rejected by Cloudflare</code></dt>
  <dd>The CF API token failed the <code>/accounts</code> probe. Re-create the token from the install page \u2014 the link pre-selects the right scopes.</dd>

  <dt id="err-base64_decode_failed"><code>base64_decode_failed</code></dt>
  <dd>An uploaded asset or applied cover PNG wasn't valid base64. Re-upload from the original file.</dd>

  <dt id="err-too_large"><code>too_large / asset_too_large</code></dt>
  <dd>Cover assets are capped at 10MB; .template imports at 60MB total. Compress the image first.</dd>

  <dt id="err-spec_too_large"><code>spec_too_large</code></dt>
  <dd>A cover template's JSON spec is over 64KB. Usually means a runaway logo URL or duplicated layer; load the template, prune layers you don't need.</dd>

  <dt id="err-wrong_format"><code>wrong_format</code></dt>
  <dd>An imported <code>.template</code> file didn't declare <code>format: "pages-seo-cover-template"</code>. Make sure you exported it from a pages-seo install of this version or newer.</dd>

  <dt id="err-not_implemented"><code>not_implemented (501)</code></dt>
  <dd>Server-side template rendering for new blog covers isn't wired up yet (the satori integration is a follow-up). The blog generator falls back to AI image generation automatically \u2014 this is not a fatal error.</dd>
</dl>

<h3 id="errors-runtime">Runtime / operational</h3>

<p>Codes that show up after install, surfaced by <code>/api/health</code>, the admin status panel, or the cron tail.</p>

<dl class="err-dl">
  <dt id="err-db-unbound"><code>db: "unbound"</code></dt>
  <dd><strong>Cause:</strong> the Pages project lost its D1 binding (usually after a manual config edit in the Cloudflare dashboard, or a redeploy of an older commit without bindings). <strong>Fix:</strong> dashboard \u2192 Pages \u2192 your project \u2192 Settings \u2192 Functions \u2192 D1 bindings \u2192 re-attach the D1 with binding name <code>DB</code>. Or from CLI: <code>wrangler pages project edit --d1 DB=&lt;d1-id&gt;</code> with the id from <code>wrangler d1 list</code>. The repair UI at <code>/repair</code> does this automatically.</dd>

  <dt id="err-db-error"><code>db: "error"</code></dt>
  <dd><strong>Cause:</strong> schema drift (your D1 doesn't match what the code expects, usually because a deploy added a column but the schema was never re-applied) OR transient D1 outage. <strong>Fix:</strong> re-apply the schema \u2014 <code>wrangler d1 execute &lt;db-name&gt; --remote --file=schema/init.sql</code>. The schema is idempotent (uses <code>CREATE TABLE IF NOT EXISTS</code> / <code>ALTER TABLE ... ADD COLUMN</code>) so no data is lost. If the error persists, check the Cloudflare status page.</dd>

  <dt id="err-cron-stale"><code>cron_likely_alive: false</code></dt>
  <dd><strong>Cause:</strong> no post has been published in the last 36 hours, so the cron probably isn't ticking. By far the most common reason is <strong><code>ADMIN_TOKEN</code> drift</strong> \u2014 the cron Worker has a different token than the Pages project, the cron POSTs return 401, and the cron silently does nothing. <strong>Fix:</strong> rotate the token on <em>both sides in the same step</em>: <pre><code>NEW=$(openssl rand -hex 32)
echo "$NEW" | wrangler pages secret put ADMIN_TOKEN --project-name &lt;slug&gt;
echo "$NEW" | wrangler secret put ADMIN_TOKEN --name pages-seo-cron</code></pre>Trigger a manual run to verify: <code>curl -X POST &lt;site&gt;/api/admin/blog/cron-tick -H "authorization: Bearer $NEW"</code>.</dd>

  <dt id="err-jobs-stuck"><code>jobs.in_flight_stuck &gt; 0</code></dt>
  <dd><strong>Cause:</strong> a generation step crashed silently \u2014 typically because a Pages Function isolate was killed mid-run (the CPU/wall-clock cap), or an upstream AI provider returned a malformed response. Jobs older than 1 hour in a non-terminal state are flagged. <strong>Fix:</strong> query D1 for the stuck rows: <pre><code>wrangler d1 execute &lt;db-name&gt; --remote --command="SELECT id, status, error, updated_at FROM blog_jobs WHERE status NOT IN ('published','failed') ORDER BY updated_at DESC LIMIT 5"</code></pre>Read the <code>error</code> column. Most are <code>provider_timeout</code> or <code>provider_budget_exceeded</code> \u2014 see below.</dd>

  <dt id="err-provider_timeout"><code>provider_timeout</code></dt>
  <dd><strong>Cause:</strong> the AI provider didn't respond in time (Cloudflare Pages Functions cap at 30s wall-clock). Workers AI under heavy load is the usual culprit. <strong>Fix:</strong> in <code>/admin \u2192 System \u2192 Providers</code>, add a fallback (OpenAI / Anthropic / Groq are fastest). The provider chain retries the next one automatically when one fails. Mark the stuck job failed with the admin UI's "Retry" / "Skip" buttons.</dd>

  <dt id="err-provider_budget_exceeded"><code>provider_budget_exceeded</code></dt>
  <dd><strong>Cause:</strong> Workers AI free tier (10k Neurons/day) ran out, OR a paid provider hit its rate limit / billing cap. <strong>Fix:</strong> wait until midnight UTC for Workers AI to reset, OR add a fallback provider key in <code>/admin \u2192 System \u2192 Providers</code>. Each provider entry has an optional daily budget cap \u2014 check it's not set to something low.</dd>

  <dt id="err-admin-token-drift"><code>ADMIN_TOKEN drift</code> (cron returns 401 silently)</dt>
  <dd><strong>Cause:</strong> the cron Worker's <code>ADMIN_TOKEN</code> secret doesn't match what the Pages project expects. Happens after a manual token rotation that only updated one side. <strong>Fix:</strong> the <code>cron_likely_alive: false</code> remedy above rotates both in one step. Verify with <code>wrangler tail pages-seo-cron --format=pretty</code> \u2014 a healthy tick logs a 200; a 401 confirms the drift.</dd>

  <dt id="err-installed-sha-stale"><code>installed_sha</code> stale (admin shows "N commits behind" forever)</dt>
  <dd><strong>Cause:</strong> Direct-Upload deploys (the default for CLI installs) don't update D1's <code>installed_sha</code> setting because there's no GitHub webhook to fire. The deployed code IS up to date \u2014 only the marker is stale. <strong>Fix:</strong> click <em>Mark as up to date</em> in <code>/admin \u2192 System \u2192 Updates</code>, OR <code>POST /api/admin/update/dismiss</code> with the admin bearer token. Cosmetic, never blocks anything.</dd>

  <dt id="err-cf-token-missing-scope"><code>Cloudflare API token missing scope</code></dt>
  <dd><strong>Cause:</strong> the CF API token used by the browser installer / repair flow doesn't have one of the six required permissions. <strong>Fix:</strong> recreate the token at <a href="https://dash.cloudflare.com/profile/api-tokens" rel="noopener" target="_blank">dash.cloudflare.com/profile/api-tokens</a> with exactly: Cloudflare Pages: Edit, D1: Edit, Workers R2: Edit, Workers AI: Edit, Workers Scripts: Edit, Account Settings: Read. The token-create link on <code>/install</code> pre-selects these.</dd>

  <dt id="err-deploy-button-auth-10000"><code>Authentication error [code: 10000]</code> (Deploy to Cloudflare button)</dt>
  <dd><strong>Cause:</strong> the API token Cloudflare auto-generates for Workers Builds on new projects doesn't include <code>Pages:Edit</code> scope, so the first deploy fails. Cloudflare-side limitation of the 1-click button \u2014 not fixable from the repo. <strong>Status:</strong> we've removed the 1-click button from <a href="/install">/install</a> until Cloudflare ships a fix. <strong>If you already hit this:</strong> finish in the dashboard. Create a fresh token at <a href="https://dash.cloudflare.com/profile/api-tokens" rel="noopener" target="_blank">dash.cloudflare.com/profile/api-tokens</a> with the six Account permissions (Pages, D1, R2, Workers AI, Workers Scripts, Account Settings). Then in your Pages project: Settings \u2192 Build &amp; deployments \u2192 API token \u2192 paste it. Re-trigger the deploy. Or scrap the half-broken project and re-install via <a href="/install">/install</a>'s browser flow \u2014 that one actually works end-to-end.</dd>

  <dt id="err-pages-deploy-failed"><code>Pages deploy failed</code></dt>
  <dd><strong>Cause:</strong> the most recent deployment attempt errored \u2014 usually a Functions bundle size cap (~10MB) or a syntax error in code pushed from a custom fork. <strong>Fix:</strong> <code>wrangler pages deployment list --project-name=&lt;slug&gt;</code> to see the failed deployment id, then open the build log link in the Cloudflare dashboard. If the issue is bundle size, check that <code>node_modules/</code> isn't being uploaded \u2014 only <code>public/</code> + <code>functions/</code> ship.</dd>

  <dt id="err-r2-bucket-renamed"><code>R2 bucket renamed or missing</code></dt>
  <dd><strong>Cause:</strong> R2 bucket was deleted or renamed in the dashboard; hero images return 404 but the site otherwise works. <strong>Fix:</strong> re-create or rename the bucket back to <code>&lt;slug&gt;-images</code>, OR update the binding: dashboard \u2192 Pages \u2192 your project \u2192 Settings \u2192 Functions \u2192 R2 bindings. The schema and posts table are unaffected \u2014 images regenerate on next cron tick.</dd>

  <dt id="err-cf-rate-limit"><code>Cloudflare rate-limited</code> (during install / repair)</dt>
  <dd><strong>Cause:</strong> the CF API enforces ~1200 requests per 5-minute window per token. Re-running the installer repeatedly can hit it. <strong>Fix:</strong> wait 5 minutes. The installer is idempotent \u2014 re-run with the same slug and it resumes from where it stopped.</dd>
</dl>
` },
      { id: "update", title: "Updating your install", level: 1, content: `
<p>Two ways to pull the latest pages-seo into your fork + redeploy:</p>

<h3>In /admin \u2192 Updates</h3>
<p>The Updates tab compares your installed commit SHA to upstream <code>main</code> and shows a diff summary. Click <em>Sync &amp; deploy</em> to merge upstream into your fork and trigger a Pages rebuild. Works for browser-installed sites (which have a GitHub fork to sync from). CLI installs see a message explaining how to <code>git pull</code> + <code>wrangler pages deploy</code> manually.</p>

<h3>At seo.benjaminb.xyz/update</h3>
<p>Hosted equivalent \u2014 useful if your /admin is broken. Sign in with GitHub, we look up your fork automatically, show the diff, sync, and trigger a deploy. Works on any pages-seo install on any Cloudflare account.</p>

<h3>If sync fails with merge conflicts</h3>
<p>You've edited the fork directly. Open your fork on GitHub, resolve the conflict in the PR our sync attempt created, then retry. The installer never edits files in your fork \u2014 conflicts only happen if you did.</p>
` },
      { id: "admin-tour", title: "Admin tour", level: 1, content: `
<p>Every tab in /admin and what it's for.</p>
<ul>
  <li><strong>Overview</strong> \u2014 quick actions (run today's blog now, ping IndexNow), recent posts, recent jobs.</li>
  <li><strong>Daily blog</strong> \u2014 manually run the blog chain (text \u2192 image \u2192 publish) or inspect jobs. Per-step retry available on failed jobs.</li>
  <li><strong>Programmatic</strong> \u2014 keyword queue + generated landing pages. Upload CSV of keywords, the cron walks the queue one per day (configurable).</li>
  <li><strong>SEO</strong> \u2014 IndexNow keys, sitemap URL, robots.txt preview.</li>
  <li><strong>Brand DNA</strong> \u2014 free-form brand description that prompts feed off. Tone, audience, topics-to-avoid.</li>
  <li><strong>Links</strong> \u2014 internal-link aliases. Sync from sitemap to teach the AI which URLs exist.</li>
  <li><strong>Calendar</strong> \u2014 full content calendar with intent classification + priority sorting.</li>
  <li><strong>Usage</strong> \u2014 token spend + budget. Hard-stop the cron at the configured cap.</li>
  <li><strong>Covers</strong> \u2014 Canva-style cover designer. See <a href="#covers">cover templates</a>.</li>
  <li><strong>Embeds</strong> \u2014 copy-pastable widget HTML for cross-posting your /blog to other sites.</li>
  <li><strong>Updates</strong> \u2014 fork-sync + deploy. See <a href="#update">updating</a>.</li>
  <li><strong>Settings</strong> \u2014 providers, budgets, brand colours, verification metas, hero-image mode.</li>
</ul>
` },
      { id: "covers", title: "Cover templates", level: 1, content: `
<p>Cover templates render a per-post hero image from a layered spec, with text variables substituted at render time. Two reasons to use them:</p>
<ul>
  <li>Brand consistency \u2014 every post gets the same visual identity, with the title swapped in.</li>
  <li>Storage efficiency \u2014 no per-post PNG. Backgrounds + logos live once in R2; the SVG is rendered on demand at <code>/cover/&lt;slug&gt;.svg</code> and cached at the edge.</li>
</ul>

<h3>Available variables</h3>
<p>Every variable below can be used inside any text layer. They chain with filters using the pipe character: <code>{title|truncate:60|upper}</code>.</p>
<pre><code>{title}             post title
{slug}              URL slug
{excerpt}           first 200 chars, markdown stripped
{primary_keyword}   target search query
{keywords}          comma-separated keywords
{reading_time}      "5 min read"
{word_count}        body word count
{pub_date_long}     "18 May 2026"
{pub_date_short}    "2026-05-18"
{pub_year}, {pub_month}, {pub_day}, {pub_dow}
{update_date}, {today_long}, {year}, {now}
{brand.name}, {brand.url}, {brand.domain}, {brand.tagline}
{brand.cta}, {brand.tone}, {brand.audience}
{brand.business_type}, {brand.service_area}
{brand.key_themes}, {brand.topics_to_avoid}
{brand.logo_url}, {brand.primary_color}, {brand.accent_color}
{site.host}, {site.url}, {site.canonical}
{has_image}, {has_logo}        booleans for {if X}</code></pre>

<h3>Available filters</h3>
<pre><code>{x|upper} {x|lower} {x|title} {x|capitalize}
{x|truncate:N} {x|default:"foo"}
{x|slug} {x|kebab} {x|snake} {x|trim} {x|escape}
{x|first_word} {x|domain}
{x|ordinal}      1 \u2192 "1st"
{x|pad:2}        "5" \u2192 "05"
{x|number_format}    1234567 \u2192 "1,234,567"
{x|pluralize:"post"} 2 \u2192 "2 posts"
{x|replace:"old:new"}
{x|prepend:"x"} {x|append:"x"}
{x|read_time}    estimate from word count
{x|date:fmt}     long, short, us, iso, year, month, day, dow, relative, or YYYY-MM-DD-HH-mm-DOW template
{if x}\u2026{/if}    {if !x}\u2026{/if}</code></pre>

<h3>Sharing templates</h3>
<p>Click <em>Export</em> on any template to download a <code>.template</code> file containing the spec + every embedded background/logo (base64). On another install, click <em>Import .template\u2026</em> in the Templates rail. Assets get re-uploaded to the receiver's R2; the spec URLs are rewritten automatically.</p>
` },
      { id: "self-host", title: "Self-hosting reference", level: 1, content: `
<h3>Environment variables (Pages project)</h3>
<p>Set in the Cloudflare dashboard \u2192 your Pages project \u2192 Settings \u2192 Environment variables. All optional unless noted.</p>
<dl class="ref-dl">
  <dt><code>SITE_NAME</code></dt><dd>Display name. Falls back to settings table's <code>site_name</code>.</dd>
  <dt><code>SITE_URL</code></dt><dd>Canonical base URL. Falls back to settings.</dd>
  <dt><code>SITE_DESCRIPTION</code></dt><dd>For meta description on home + blog index.</dd>
  <dt><code>SITE_LOGO_URL</code></dt><dd>Logo for JSON-LD Organization.logo.</dd>
  <dt><code>ADMIN_TOKEN</code></dt><dd>64-char hex. Recovery credential \u2014 if you lose the password, bearer this in <code>Authorization: Bearer &lt;token&gt;</code> headers to admin APIs.</dd>
  <dt><code>SETUP_TOKEN</code></dt><dd>Magic-link token for /api/setup. Used once on first run; not needed afterwards.</dd>
  <dt><code>CF_API_TOKEN</code> / <code>CF_ACCOUNT_ID</code> / <code>CF_PROJECT</code> / <code>CF_D1_ID</code> / <code>CF_R2_NAME</code></dt><dd>Set by the installer. Used by <code>/api/repair-bindings</code> to self-heal if Cloudflare drops bindings.</dd>
</dl>

<h3>Bindings</h3>
<ul>
  <li><code>DB</code> \u2014 D1 database. Schema in <code>functions/_lib/schema.js</code>.</li>
  <li><code>IMAGES</code> \u2014 R2 bucket. Stores cover assets + hero images.</li>
  <li><code>AI</code> \u2014 Workers AI (Flux for image gen + Llama for fallback text gen). Free tier.</li>
</ul>

<h3>Settings (D1 table)</h3>
<p>Editable in /admin \u2192 Settings. Key list: see <code>functions/_lib/settings.js</code>. The most useful ones:</p>
<dl class="ref-dl">
  <dt><code>hero_image_mode</code></dt><dd><code>ai</code> (default) generates a fresh image per post via the configured AI provider. <code>cover</code> renders /cover/&lt;slug&gt;.svg from the default template instead.</dd>
  <dt><code>monthly_budget_usd</code></dt><dd>Hard cap. The cron stops when this month's spend reaches it.</dd>
  <dt><code>budget_warn_pct</code></dt><dd>Show a banner when spend crosses this % of budget.</dd>
  <dt><code>google_site_verification</code> / <code>bing_site_verification</code></dt><dd>Meta-tag values from the respective webmaster consoles.</dd>
  <dt><code>brand_primary_color</code> / <code>brand_accent_color</code> / <code>site_tagline</code> / <code>brand_logo_url</code></dt><dd>Brand identity for cover templates and JSON-LD.</dd>
</dl>
` }
    ];
    __name(renderToc, "renderToc");
    __name(renderSections, "renderSections");
    onRequestGet81 = /* @__PURE__ */ __name(async ({ request }) => {
      const url = new URL(request.url);
      const host = url.hostname;
      const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Docs \xB7 pages-seo</title>
<meta name="description" content="Setup, update, troubleshooting, and error reference for pages-seo. Self-hosted programmatic SEO on Cloudflare." />
<link rel="canonical" href="https://${host}/docs" />
<meta name="robots" content="index,follow" />
<link rel="preload" href="/_fonts/inter-400.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/_fonts/instrument-serif-400.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/_fonts/jetbrains-mono-400.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="/marketing.css" />
<style>
  /* Docs page uses marketing.css for the nav/footer shell. The docs
     content area is constrained to match the marketing max-width so
     the text column aligns with the nav's inner padding. */
  :root { --docs-max: 1100px; }
  .docs-wrap { max-width: var(--docs-max); margin: 0 auto; padding: 52px max(28px, calc((100vw - var(--docs-max)) / 2 + 28px)) 96px; }
  .docs-head { margin-bottom: 36px; }
  .docs-head h1 { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; font-size: clamp(2rem, 4vw, 3rem); line-height: 1.05; margin: 0 0 10px; letter-spacing: -0.015em; }
  .docs-head p { color: var(--muted, #6a7484); font-size: 17px; margin: 0; max-width: 560px; }
  .docs-grid { display: grid; grid-template-columns: 200px 1fr; gap: 52px; margin-top: 8px; }
  .docs-toc { position: sticky; top: 80px; align-self: start; font-size: 13px; }
  .docs-toc strong { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--muted, #6a7484); display: block; margin-bottom: 10px; font-family: 'JetBrains Mono', monospace; }
  .docs-toc ol { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }
  .docs-toc a { color: var(--ink); text-decoration: none; font-size: 13px; padding: 5px 10px; display: block; border-radius: 5px; transition: background .12s, color .12s; }
  .docs-toc a:hover { background: var(--bg-2, #f0ece4); color: var(--ink); }
  .docs-section { margin-bottom: 60px; scroll-margin-top: 28px; }
  .docs-section h2 { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; font-style: italic; font-size: 26px; margin: 0 0 16px; display: flex; align-items: baseline; gap: 10px; letter-spacing: -0.01em; border-bottom: 1px solid var(--line, rgba(0,0,0,.08)); padding-bottom: 10px; }
  .docs-section h2 .anchor { color: var(--muted, #999); text-decoration: none; font-size: 14px; font-style: normal; font-family: monospace; opacity: 0; transition: opacity .12s; }
  .docs-section h2:hover .anchor { opacity: 1; }
  .docs-section h3 { font-size: 16px; font-weight: 600; margin: 28px 0 8px; letter-spacing: -0.01em; }
  .docs-section p, .docs-section li, .docs-section dd { line-height: 1.65; font-size: 14.5px; color: var(--ink, #131210); }
  .docs-section pre { background: var(--bg-2, #f0ece4); padding: 14px 16px; border-radius: 8px; overflow-x: auto; font-size: 12.5px; line-height: 1.55; margin: 12px 0; }
  .docs-section code { font-size: 0.88em; background: var(--bg-2, #f0ece4); padding: 1px 5px; border-radius: 3px; font-family: 'JetBrains Mono', monospace; }
  .docs-section pre code { background: none; padding: 0; font-size: inherit; }
  .docs-section ol, .docs-section ul { padding-left: 22px; }
  .docs-section ol li, .docs-section ul li { margin-bottom: 6px; }
  .docs-section dl { margin: 16px 0; }
  .docs-section dt { font-weight: 600; margin-top: 16px; }
  .docs-section dd { margin: 4px 0 0; color: var(--muted, #4a5060); }
  .err-dl dt, .ref-dl dt { font-family: 'JetBrains Mono', monospace; font-size: 13px; }
  .err-dl dt code, .ref-dl dt code { font-size: 1em; background: none; padding: 0; }
  .lede { font-size: 16px; color: var(--muted, #4a5060); }
  .foot { max-width: var(--docs-max); margin: 0 auto; padding: 28px max(28px, calc((100vw - var(--docs-max)) / 2 + 28px)); font-size: 13px; color: var(--muted, #666); border-top: 1px solid var(--line, rgba(0,0,0,.08)); }
  .foot a { color: var(--muted, #666); text-decoration: none; }
  .foot a:hover { color: var(--ink); }
  @media (max-width: 820px) {
    .docs-wrap { padding: 36px 20px 80px; }
    .docs-grid { grid-template-columns: 1fr; gap: 28px; }
    .docs-toc { position: static; background: var(--bg-2, #f0ece4); padding: 16px; border-radius: 8px; }
    .docs-head h1 { font-size: 2rem; }
  }
</style>
</head>
<body>
<header class="nav">
  <a class="brand" href="/">pages-seo</a>
  <nav>
    <a href="/install">Install</a>
    <a href="/update">Update</a>
    <a href="/docs" aria-current="page">Docs</a>
  </nav>
</header>
<main class="docs-wrap">
  <header class="docs-head">
    <h1>pages-seo docs</h1>
    <p>Setup, update, troubleshooting, error reference, and self-hosting notes.</p>
  </header>
  <div class="docs-grid">
    ${renderToc()}
    <div class="docs-body">${renderSections()}</div>
  </div>
</main>
<footer class="foot">
  <span>pages-seo</span> \xB7 <a href="/">Home</a> \xB7 <a href="/install">Install</a> \xB7 <a href="/docs">Docs</a>
</footer>
</body>
</html>`;
      return new Response(body, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          // Edge-cached for an hour; users get fresh docs within an hour
          // of any deploy. Browser cache short (5 min) so refreshes hit
          // the CDN copy.
          "cache-control": "public, max-age=300, s-maxage=3600"
        }
      });
    }, "onRequestGet");
  }
});

// embed/index.js
var VALID_THEME, onRequestGet82;
var init_embed = __esm({
  "embed/index.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_util();
    VALID_THEME = ["auto", "light", "dark"];
    onRequestGet82 = /* @__PURE__ */ __name(async ({ request }) => {
      const url = new URL(request.url);
      const count = Math.min(50, Math.max(1, parseInt(url.searchParams.get("count"), 10) || 5));
      const title = String(url.searchParams.get("title") || "").trim().slice(0, 100);
      const themeRaw = String(url.searchParams.get("theme") || "auto");
      const theme = VALID_THEME.includes(themeRaw) ? themeRaw : "auto";
      const titleAttr = title ? `
  data-title="${esc(title)}"` : "";
      const themeAttr = theme !== "auto" ? `
  data-theme="${theme}"` : "";
      const body = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${esc(title || "Blog")}</title>
<style>
  html, body { margin: 0; padding: 12px; background: transparent; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
</style>
</head>
<body>
<div id="ps-embed-host"></div>
<script
  src="/widget.js"
  data-target="#ps-embed-host"
  data-count="${count}"${titleAttr}${themeAttr}
  defer><\/script>
</body>
</html>`;
      return new Response(body, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=300",
          "x-content-type-options": "nosniff"
        }
      });
    }, "onRequestGet");
  }
});

// robots.txt.js
var onRequestGet83;
var init_robots_txt = __esm({
  "robots.txt.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_project_scope();
    onRequestGet83 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const host = requestHost(request);
      const project = await resolveProjectByHost(env, host).catch(() => null);
      const customHost = project?.custom_domain ? normalizeHost(project.custom_domain) : null;
      const sitemapHost = customHost || host;
      const body = `# pages-seo robots policy
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin

# AI training crawlers \u2014 block by default.
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: CCBot
Disallow: /

Sitemap: https://${sitemapHost}/sitemap.xml

# Feeds for aggregators (Feedly, Inoreader, etc.)
# Not part of the robots spec but conventional alongside Sitemap.
# Most aggregators rely on <link rel="alternate"> in HTML; this is a
# belt-and-braces signal for the ones that scrape robots.txt too.
`;
      return new Response(body, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=3600"
        }
      });
    }, "onRequestGet");
  }
});

// rss.xml.js
var onRequestGet84;
var init_rss_xml2 = __esm({
  "rss.xml.js"() {
    init_functionsRoutes_0_09583509623234443();
    onRequestGet84 = /* @__PURE__ */ __name(async () => new Response(null, {
      status: 301,
      headers: { location: "/feed.xml", "cache-control": "public, max-age=3600" }
    }), "onRequestGet");
  }
});

// sitemap-pages.xml.js
var onRequestGet85;
var init_sitemap_pages_xml2 = __esm({
  "sitemap-pages.xml.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_sitemap_xml();
    onRequestGet85 = pagesUrlset;
  }
});

// widget.js.js
var onRequestGet86;
var init_widget_js = __esm({
  "widget.js.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_widget_render();
    init_site_identity();
    onRequestGet86 = /* @__PURE__ */ __name(async ({ env, request }) => {
      const url = new URL(request.url);
      const apiBase = `${url.protocol}//${url.host}`;
      const id = await getSiteIdentity(env);
      const title = id.name ? `${id.name} \xB7 Blog` : "Blog";
      const js = widgetBody({ title, apiBase, perPage: 10, titleAuto: true });
      return new Response(js, {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "public, max-age=300, s-maxage=600",
          "access-control-allow-origin": "*"
        }
      });
    }, "onRequestGet");
  }
});

// admin/_middleware.js
var onRequest;
var init_middleware = __esm({
  "admin/_middleware.js"() {
    init_functionsRoutes_0_09583509623234443();
    onRequest = /* @__PURE__ */ __name(async ({ request, env, next }) => {
      const url = new URL(request.url);
      if (url.pathname === "/admin" || url.pathname === "/admin/") {
        if (env?.ASSETS?.fetch) {
          const html2 = await env.ASSETS.fetch(new URL("/admin.html", url));
          const headers = new Headers(html2.headers);
          headers.set("Cache-Control", "no-store");
          return new Response(html2.body, { status: html2.status, headers });
        }
        return next();
      }
      return next();
    }, "onRequest");
  }
});

// [indexnow_key].txt.js
var onRequestGet87;
var init_indexnow_key_txt = __esm({
  "[indexnow_key].txt.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_indexnow_key();
    onRequestGet87 = /* @__PURE__ */ __name(async ({ params, env }) => {
      const requested = String(params.indexnow_key || "").toLowerCase();
      const expected = (await getIndexNowKey(env)).toLowerCase();
      if (!expected || requested !== expected) {
        return new Response("not found", { status: 404 });
      }
      return new Response(expected, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=3600"
        }
      });
    }, "onRequestGet");
  }
});

// _lib/maintainer.js
async function isMaintainer(env) {
  if (env?.IS_MAINTAINER === "1" || env?.IS_MAINTAINER === "true") return true;
  if (!env?.DB) return false;
  try {
    const s = await loadSettings(env);
    return s?.is_maintainer === "1" || s?.is_maintainer === "true";
  } catch {
    return false;
  }
}
var init_maintainer = __esm({
  "_lib/maintainer.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_settings();
    __name(isMaintainer, "isMaintainer");
  }
});

// _middleware.js
var INSTALLER_RX, INSTALLER_API_RX, onRequest2;
var init_middleware2 = __esm({
  "_middleware.js"() {
    init_functionsRoutes_0_09583509623234443();
    init_maintainer();
    init_project_scope();
    INSTALLER_RX = /^\/(install|update)(\/.*)?$/;
    INSTALLER_API_RX = /^\/api\/(install|update)(\/.*)?$/;
    onRequest2 = /* @__PURE__ */ __name(async ({ request, env, next }) => {
      const url = new URL(request.url);
      const path = url.pathname;
      const isInstallerSurface = INSTALLER_RX.test(path) || INSTALLER_API_RX.test(path);
      const isRoot = path === "/" || path === "/index.html";
      if (!isInstallerSurface && !isRoot) {
        return next();
      }
      if (isRoot) {
        const host = requestHost(request);
        const customProject = await resolveProjectByHost(env, host, path);
        if (customProject?.custom_domain && normalizeHost(customProject.custom_domain) === normalizeHost(host)) {
          return Response.redirect(new URL("/blog", request.url).toString(), 302);
        }
      }
      const maintainer = await isMaintainer(env);
      if (maintainer) {
        return next();
      }
      if (isInstallerSurface) {
        return new Response("Not Found", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" }
        });
      }
      if (env?.ASSETS?.fetch) {
        const signin = await env.ASSETS.fetch(new URL("/sign-in.html", url));
        if (signin.ok) {
          const headers = new Headers(signin.headers);
          headers.set("Cache-Control", "public, max-age=300");
          return new Response(signin.body, { status: signin.status, headers });
        }
      }
      return Response.redirect(new URL("/admin", url).toString(), 302);
    }, "onRequest");
  }
});

// ../.wrangler/tmp/pages-vCJkTM/functionsRoutes-0.09583509623234443.mjs
var routes;
var init_functionsRoutes_0_09583509623234443 = __esm({
  "../.wrangler/tmp/pages-vCJkTM/functionsRoutes-0.09583509623234443.mjs"() {
    init_export();
    init_import();
    init_sync();
    init_delete_job();
    init_embed_backfill();
    init_image();
    init_jobs();
    init_list();
    init_post();
    init_publish();
    init_rename_slug();
    init_retry_job();
    init_start();
    init_text();
    init_plan();
    init_scan();
    init_apply();
    init_render_server();
    init_templates();
    init_templates();
    init_templates();
    init_templates();
    init_upload();
    init_upload();
    init_upload();
    init_tick();
    init_weekly_digest();
    init_test();
    init_dismiss();
    init_generate_next();
    init_pull_keywords();
    init_queue();
    init_queue();
    init_upload2();
    init_domain();
    init_domain();
    init_fb_callback();
    init_fb_connect();
    init_logo();
    init_profile();
    init_profile();
    init_publishing();
    init_publishing();
    init_gurouter_models();
    init_test2();
    init_test_image();
    init_run();
    init_scan2();
    init_score();
    init_apply2();
    init_delete();
    init_list2();
    init_cf_app();
    init_fork();
    init_callback();
    init_repos();
    init_start2();
    init_status();
    init_sync2();
    init_id();
    init_id();
    init_id();
    init_slug();
    init_page();
    init_activation();
    init_aliases2();
    init_aliases2();
    init_aliases2();
    init_aliases2();
    init_analytics();
    init_attention();
    init_audit();
    init_brand_dna();
    init_brand_dna();
    init_brand_dna();
    init_brand_filter_queue();
    init_calendar();
    init_calendar();
    init_calendar();
    init_calendar();
    init_competitors();
    init_embed_preview();
    init_embeds();
    init_embeds();
    init_embeds();
    init_embeds();
    init_google_search_console();
    init_google_search_console();
    init_google_search_console();
    init_indexnow_ping();
    init_insights2();
    init_login();
    init_logout();
    init_migrate();
    init_migrate();
    init_notices();
    init_onboarding();
    init_onboarding();
    init_onboarding();
    init_preview_sample();
    init_pricing();
    init_pricing();
    init_projects2();
    init_projects2();
    init_providers();
    init_secrets();
    init_secrets();
    init_secrets();
    init_settings2();
    init_settings2();
    init_social();
    init_social();
    init_status2();
    init_topics2();
    init_topics2();
    init_trend_discover();
    init_trend_discover();
    init_trend_discover();
    init_update();
    init_usage2();
    init_users();
    init_users();
    init_users();
    init_users();
    init_whoami();
    init_diagnose();
    init_feedback();
    init_leads();
    init_leads();
    init_views();
    init_views();
    init_check();
    init_deploy_status();
    init_diagnose2();
    init_fix();
    init_projects3();
    init_provision();
    init_provision();
    init_redeploy();
    init_repair();
    init_latest_post();
    init_register();
    init_send_otp();
    init_diff();
    init_rebuild();
    init_id2();
    init_page2();
    init_slug3();
    init_slug5();
    init_ai_prompt();
    init_changes();
    init_github_stats();
    init_health();
    init_repair_bindings();
    init_repair_bindings();
    init_setup();
    init_setup();
    init_version();
    init_widget();
    init_slug2();
    init_slug_svg();
    init_slug_svg2();
    init_slug4();
    init_path();
    init_blog2();
    init_feed_xml2();
    init_rss_xml();
    init_sitemap_pages_xml();
    init_sitemap_xml2();
    init_blog();
    init_docs();
    init_embed();
    init_feed_xml();
    init_robots_txt();
    init_rss_xml2();
    init_sitemap_pages_xml2();
    init_sitemap_xml();
    init_widget_js();
    init_middleware();
    init_indexnow_key_txt();
    init_middleware2();
    routes = [
      {
        routePath: "/api/admin/cover/templates/export",
        mountPath: "/api/admin/cover/templates",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet]
      },
      {
        routePath: "/api/admin/cover/templates/import",
        mountPath: "/api/admin/cover/templates",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost]
      },
      {
        routePath: "/api/admin/aliases/sync",
        mountPath: "/api/admin/aliases",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost2]
      },
      {
        routePath: "/api/admin/blog/delete-job",
        mountPath: "/api/admin/blog",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost3]
      },
      {
        routePath: "/api/admin/blog/embed-backfill",
        mountPath: "/api/admin/blog",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost4]
      },
      {
        routePath: "/api/admin/blog/image",
        mountPath: "/api/admin/blog",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost5]
      },
      {
        routePath: "/api/admin/blog/jobs",
        mountPath: "/api/admin/blog",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet2]
      },
      {
        routePath: "/api/admin/blog/list",
        mountPath: "/api/admin/blog",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet3]
      },
      {
        routePath: "/api/admin/blog/post",
        mountPath: "/api/admin/blog",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost6]
      },
      {
        routePath: "/api/admin/blog/publish",
        mountPath: "/api/admin/blog",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost7]
      },
      {
        routePath: "/api/admin/blog/rename-slug",
        mountPath: "/api/admin/blog",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost8]
      },
      {
        routePath: "/api/admin/blog/retry-job",
        mountPath: "/api/admin/blog",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost9]
      },
      {
        routePath: "/api/admin/blog/start",
        mountPath: "/api/admin/blog",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost10]
      },
      {
        routePath: "/api/admin/blog/text",
        mountPath: "/api/admin/blog",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost11]
      },
      {
        routePath: "/api/admin/calendar/plan",
        mountPath: "/api/admin/calendar",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost12]
      },
      {
        routePath: "/api/admin/competitors/scan",
        mountPath: "/api/admin/competitors",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost13]
      },
      {
        routePath: "/api/admin/cover/apply",
        mountPath: "/api/admin/cover",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost14]
      },
      {
        routePath: "/api/admin/cover/render-server",
        mountPath: "/api/admin/cover",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost15]
      },
      {
        routePath: "/api/admin/cover/templates",
        mountPath: "/api/admin/cover",
        method: "DELETE",
        middlewares: [],
        modules: [onRequestDelete]
      },
      {
        routePath: "/api/admin/cover/templates",
        mountPath: "/api/admin/cover",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet4]
      },
      {
        routePath: "/api/admin/cover/templates",
        mountPath: "/api/admin/cover",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost16]
      },
      {
        routePath: "/api/admin/cover/templates",
        mountPath: "/api/admin/cover",
        method: "PUT",
        middlewares: [],
        modules: [onRequestPut]
      },
      {
        routePath: "/api/admin/cover/upload",
        mountPath: "/api/admin/cover",
        method: "DELETE",
        middlewares: [],
        modules: [onRequestDelete2]
      },
      {
        routePath: "/api/admin/cover/upload",
        mountPath: "/api/admin/cover",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet5]
      },
      {
        routePath: "/api/admin/cover/upload",
        mountPath: "/api/admin/cover",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost17]
      },
      {
        routePath: "/api/admin/cron/tick",
        mountPath: "/api/admin/cron",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost18]
      },
      {
        routePath: "/api/admin/cron/weekly-digest",
        mountPath: "/api/admin/cron",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost19]
      },
      {
        routePath: "/api/admin/google-search-console/test",
        mountPath: "/api/admin/google-search-console",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost20]
      },
      {
        routePath: "/api/admin/notices/dismiss",
        mountPath: "/api/admin/notices",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost21]
      },
      {
        routePath: "/api/admin/prog/generate-next",
        mountPath: "/api/admin/prog",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost22]
      },
      {
        routePath: "/api/admin/prog/pull-keywords",
        mountPath: "/api/admin/prog",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost23]
      },
      {
        routePath: "/api/admin/prog/queue",
        mountPath: "/api/admin/prog",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet6]
      },
      {
        routePath: "/api/admin/prog/queue",
        mountPath: "/api/admin/prog",
        method: "PATCH",
        middlewares: [],
        modules: [onRequestPatch]
      },
      {
        routePath: "/api/admin/prog/upload",
        mountPath: "/api/admin/prog",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost24]
      },
      {
        routePath: "/api/admin/projects/domain",
        mountPath: "/api/admin/projects",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet7]
      },
      {
        routePath: "/api/admin/projects/domain",
        mountPath: "/api/admin/projects",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost25]
      },
      {
        routePath: "/api/admin/projects/fb-callback",
        mountPath: "/api/admin/projects",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet8]
      },
      {
        routePath: "/api/admin/projects/fb-connect",
        mountPath: "/api/admin/projects",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet9]
      },
      {
        routePath: "/api/admin/projects/logo",
        mountPath: "/api/admin/projects",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost26]
      },
      {
        routePath: "/api/admin/projects/profile",
        mountPath: "/api/admin/projects",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet10]
      },
      {
        routePath: "/api/admin/projects/profile",
        mountPath: "/api/admin/projects",
        method: "PATCH",
        middlewares: [],
        modules: [onRequestPatch2]
      },
      {
        routePath: "/api/admin/projects/publishing",
        mountPath: "/api/admin/projects",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet11]
      },
      {
        routePath: "/api/admin/projects/publishing",
        mountPath: "/api/admin/projects",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost27]
      },
      {
        routePath: "/api/admin/providers/gurouter-models",
        mountPath: "/api/admin/providers",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet12]
      },
      {
        routePath: "/api/admin/providers/test",
        mountPath: "/api/admin/providers",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost28]
      },
      {
        routePath: "/api/admin/providers/test-image",
        mountPath: "/api/admin/providers",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost29]
      },
      {
        routePath: "/api/admin/refresh/run",
        mountPath: "/api/admin/refresh",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost30]
      },
      {
        routePath: "/api/admin/refresh/scan",
        mountPath: "/api/admin/refresh",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost31]
      },
      {
        routePath: "/api/admin/topics/score",
        mountPath: "/api/admin/topics",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost32]
      },
      {
        routePath: "/api/admin/update/apply",
        mountPath: "/api/admin/update",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost33]
      },
      {
        routePath: "/api/install/d1/delete",
        mountPath: "/api/install/d1",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost34]
      },
      {
        routePath: "/api/install/d1/list",
        mountPath: "/api/install/d1",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost35]
      },
      {
        routePath: "/api/install/github/cf-app",
        mountPath: "/api/install/github",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet13]
      },
      {
        routePath: "/api/install/github/fork",
        mountPath: "/api/install/github",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost36]
      },
      {
        routePath: "/api/update/github/callback",
        mountPath: "/api/update/github",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet14]
      },
      {
        routePath: "/api/update/github/repos",
        mountPath: "/api/update/github",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet15]
      },
      {
        routePath: "/api/update/github/start",
        mountPath: "/api/update/github",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet16]
      },
      {
        routePath: "/api/update/github/status",
        mountPath: "/api/update/github",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet17]
      },
      {
        routePath: "/api/update/github/sync",
        mountPath: "/api/update/github",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost37]
      },
      {
        routePath: "/api/admin/projects/:id",
        mountPath: "/api/admin/projects",
        method: "DELETE",
        middlewares: [],
        modules: [onRequestDelete3]
      },
      {
        routePath: "/api/admin/projects/:id",
        mountPath: "/api/admin/projects",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet18]
      },
      {
        routePath: "/api/admin/projects/:id",
        mountPath: "/api/admin/projects",
        method: "PUT",
        middlewares: [],
        modules: [onRequestPut2]
      },
      {
        routePath: "/api/public/post/:slug",
        mountPath: "/api/public/post",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet19]
      },
      {
        routePath: "/:project/blog/page/:page",
        mountPath: "/:project/blog/page",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet21]
      },
      {
        routePath: "/api/admin/activation",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet22]
      },
      {
        routePath: "/api/admin/aliases",
        mountPath: "/api/admin/aliases",
        method: "DELETE",
        middlewares: [],
        modules: [onRequestDelete4]
      },
      {
        routePath: "/api/admin/aliases",
        mountPath: "/api/admin/aliases",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet23]
      },
      {
        routePath: "/api/admin/aliases",
        mountPath: "/api/admin/aliases",
        method: "PATCH",
        middlewares: [],
        modules: [onRequestPatch3]
      },
      {
        routePath: "/api/admin/aliases",
        mountPath: "/api/admin/aliases",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost38]
      },
      {
        routePath: "/api/admin/analytics",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet24]
      },
      {
        routePath: "/api/admin/attention",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet25]
      },
      {
        routePath: "/api/admin/audit",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet26]
      },
      {
        routePath: "/api/admin/brand-dna",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet27]
      },
      {
        routePath: "/api/admin/brand-dna",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost39]
      },
      {
        routePath: "/api/admin/brand-dna",
        mountPath: "/api/admin",
        method: "PUT",
        middlewares: [],
        modules: [onRequestPut3]
      },
      {
        routePath: "/api/admin/brand-filter-queue",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost40]
      },
      {
        routePath: "/api/admin/calendar",
        mountPath: "/api/admin/calendar",
        method: "DELETE",
        middlewares: [],
        modules: [onRequestDelete5]
      },
      {
        routePath: "/api/admin/calendar",
        mountPath: "/api/admin/calendar",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet28]
      },
      {
        routePath: "/api/admin/calendar",
        mountPath: "/api/admin/calendar",
        method: "PATCH",
        middlewares: [],
        modules: [onRequestPatch4]
      },
      {
        routePath: "/api/admin/calendar",
        mountPath: "/api/admin/calendar",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost41]
      },
      {
        routePath: "/api/admin/competitors",
        mountPath: "/api/admin/competitors",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet29]
      },
      {
        routePath: "/api/admin/embed-preview",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet30]
      },
      {
        routePath: "/api/admin/embeds",
        mountPath: "/api/admin",
        method: "DELETE",
        middlewares: [],
        modules: [onRequestDelete6]
      },
      {
        routePath: "/api/admin/embeds",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet31]
      },
      {
        routePath: "/api/admin/embeds",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost42]
      },
      {
        routePath: "/api/admin/embeds",
        mountPath: "/api/admin",
        method: "PUT",
        middlewares: [],
        modules: [onRequestPut4]
      },
      {
        routePath: "/api/admin/google-search-console",
        mountPath: "/api/admin/google-search-console",
        method: "DELETE",
        middlewares: [],
        modules: [onRequestDelete7]
      },
      {
        routePath: "/api/admin/google-search-console",
        mountPath: "/api/admin/google-search-console",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet32]
      },
      {
        routePath: "/api/admin/google-search-console",
        mountPath: "/api/admin/google-search-console",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost43]
      },
      {
        routePath: "/api/admin/indexnow-ping",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost44]
      },
      {
        routePath: "/api/admin/insights",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet33]
      },
      {
        routePath: "/api/admin/login",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost45]
      },
      {
        routePath: "/api/admin/logout",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost46]
      },
      {
        routePath: "/api/admin/migrate",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet34]
      },
      {
        routePath: "/api/admin/migrate",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost47]
      },
      {
        routePath: "/api/admin/notices",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet35]
      },
      {
        routePath: "/api/admin/onboarding",
        mountPath: "/api/admin",
        method: "DELETE",
        middlewares: [],
        modules: [onRequestDelete8]
      },
      {
        routePath: "/api/admin/onboarding",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet36]
      },
      {
        routePath: "/api/admin/onboarding",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost48]
      },
      {
        routePath: "/api/admin/preview-sample",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost49]
      },
      {
        routePath: "/api/admin/pricing",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet37]
      },
      {
        routePath: "/api/admin/pricing",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost50]
      },
      {
        routePath: "/api/admin/projects",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet38]
      },
      {
        routePath: "/api/admin/projects",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost51]
      },
      {
        routePath: "/api/admin/providers",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet39]
      },
      {
        routePath: "/api/admin/secrets",
        mountPath: "/api/admin",
        method: "DELETE",
        middlewares: [],
        modules: [onRequestDelete9]
      },
      {
        routePath: "/api/admin/secrets",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet40]
      },
      {
        routePath: "/api/admin/secrets",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost52]
      },
      {
        routePath: "/api/admin/settings",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet41]
      },
      {
        routePath: "/api/admin/settings",
        mountPath: "/api/admin",
        method: "PUT",
        middlewares: [],
        modules: [onRequestPut5]
      },
      {
        routePath: "/api/admin/social",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet42]
      },
      {
        routePath: "/api/admin/social",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost53]
      },
      {
        routePath: "/api/admin/status",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet43]
      },
      {
        routePath: "/api/admin/topics",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet44]
      },
      {
        routePath: "/api/admin/topics",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost54]
      },
      {
        routePath: "/api/admin/trend-discover",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet45]
      },
      {
        routePath: "/api/admin/trend-discover",
        mountPath: "/api/admin",
        method: "PATCH",
        middlewares: [],
        modules: [onRequestPatch5]
      },
      {
        routePath: "/api/admin/trend-discover",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost55]
      },
      {
        routePath: "/api/admin/update",
        mountPath: "/api/admin/update",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet46]
      },
      {
        routePath: "/api/admin/usage",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet47]
      },
      {
        routePath: "/api/admin/users",
        mountPath: "/api/admin",
        method: "DELETE",
        middlewares: [],
        modules: [onRequestDelete10]
      },
      {
        routePath: "/api/admin/users",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet48]
      },
      {
        routePath: "/api/admin/users",
        mountPath: "/api/admin",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost56]
      },
      {
        routePath: "/api/admin/users",
        mountPath: "/api/admin",
        method: "PUT",
        middlewares: [],
        modules: [onRequestPut6]
      },
      {
        routePath: "/api/admin/whoami",
        mountPath: "/api/admin",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet49]
      },
      {
        routePath: "/api/ai-prompt/diagnose",
        mountPath: "/api/ai-prompt",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet50]
      },
      {
        routePath: "/api/blog/feedback",
        mountPath: "/api/blog",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost57]
      },
      {
        routePath: "/api/blog/leads",
        mountPath: "/api/blog",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet51]
      },
      {
        routePath: "/api/blog/leads",
        mountPath: "/api/blog",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost58]
      },
      {
        routePath: "/api/blog/views",
        mountPath: "/api/blog",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet52]
      },
      {
        routePath: "/api/blog/views",
        mountPath: "/api/blog",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost59]
      },
      {
        routePath: "/api/install/check",
        mountPath: "/api/install",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet53]
      },
      {
        routePath: "/api/install/deploy-status",
        mountPath: "/api/install",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost60]
      },
      {
        routePath: "/api/install/diagnose",
        mountPath: "/api/install",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost61]
      },
      {
        routePath: "/api/install/fix",
        mountPath: "/api/install",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost62]
      },
      {
        routePath: "/api/install/projects",
        mountPath: "/api/install",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost63]
      },
      {
        routePath: "/api/install/provision",
        mountPath: "/api/install",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet54]
      },
      {
        routePath: "/api/install/provision",
        mountPath: "/api/install",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost64]
      },
      {
        routePath: "/api/install/redeploy",
        mountPath: "/api/install",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost65]
      },
      {
        routePath: "/api/install/repair",
        mountPath: "/api/install",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost66]
      },
      {
        routePath: "/api/public/latest-post",
        mountPath: "/api/public",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet55]
      },
      {
        routePath: "/api/public/register",
        mountPath: "/api/public",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost67]
      },
      {
        routePath: "/api/public/send-otp",
        mountPath: "/api/public",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost68]
      },
      {
        routePath: "/api/update/diff",
        mountPath: "/api/update",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet56]
      },
      {
        routePath: "/api/update/rebuild",
        mountPath: "/api/update",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost69]
      },
      {
        routePath: "/api/embed/:id",
        mountPath: "/api/embed",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet57]
      },
      {
        routePath: "/blog/page/:page",
        mountPath: "/blog/page",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet58]
      },
      {
        routePath: "/:project/blog/:slug",
        mountPath: "/:project/blog",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet60]
      },
      {
        routePath: "/:project/p/:slug",
        mountPath: "/:project/p",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet62]
      },
      {
        routePath: "/api/ai-prompt",
        mountPath: "/api",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet63]
      },
      {
        routePath: "/api/changes",
        mountPath: "/api",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet64]
      },
      {
        routePath: "/api/github-stats",
        mountPath: "/api",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet65]
      },
      {
        routePath: "/api/health",
        mountPath: "/api",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet66]
      },
      {
        routePath: "/api/repair-bindings",
        mountPath: "/api",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet67]
      },
      {
        routePath: "/api/repair-bindings",
        mountPath: "/api",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost70]
      },
      {
        routePath: "/api/setup",
        mountPath: "/api",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet68]
      },
      {
        routePath: "/api/setup",
        mountPath: "/api",
        method: "POST",
        middlewares: [],
        modules: [onRequestPost71]
      },
      {
        routePath: "/api/version",
        mountPath: "/api",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet69]
      },
      {
        routePath: "/api/widget",
        mountPath: "/api",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet70]
      },
      {
        routePath: "/blog/:slug",
        mountPath: "/blog",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet59]
      },
      {
        routePath: "/cover/:slug.svg",
        mountPath: "/cover",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet71]
      },
      {
        routePath: "/og/:slug.svg",
        mountPath: "/og",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet72]
      },
      {
        routePath: "/p/:slug",
        mountPath: "/p",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet61]
      },
      {
        routePath: "/image/:path*",
        mountPath: "/image",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet73]
      },
      {
        routePath: "/:project/blog",
        mountPath: "/:project/blog",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet74]
      },
      {
        routePath: "/:project/feed.xml",
        mountPath: "/:project",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet76]
      },
      {
        routePath: "/:project/rss.xml",
        mountPath: "/:project",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet77]
      },
      {
        routePath: "/:project/sitemap-pages.xml",
        mountPath: "/:project",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet79]
      },
      {
        routePath: "/:project/sitemap.xml",
        mountPath: "/:project",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet80]
      },
      {
        routePath: "/blog",
        mountPath: "/blog",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet20]
      },
      {
        routePath: "/docs",
        mountPath: "/docs",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet81]
      },
      {
        routePath: "/embed",
        mountPath: "/embed",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet82]
      },
      {
        routePath: "/feed.xml",
        mountPath: "/",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet75]
      },
      {
        routePath: "/robots.txt",
        mountPath: "/",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet83]
      },
      {
        routePath: "/rss.xml",
        mountPath: "/",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet84]
      },
      {
        routePath: "/sitemap-pages.xml",
        mountPath: "/",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet85]
      },
      {
        routePath: "/sitemap.xml",
        mountPath: "/",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet78]
      },
      {
        routePath: "/widget.js",
        mountPath: "/",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet86]
      },
      {
        routePath: "/admin",
        mountPath: "/admin",
        method: "",
        middlewares: [onRequest],
        modules: []
      },
      {
        routePath: "/:indexnow_key.txt",
        mountPath: "/",
        method: "GET",
        middlewares: [],
        modules: [onRequestGet87]
      },
      {
        routePath: "/",
        mountPath: "/",
        method: "",
        middlewares: [onRequest2],
        modules: []
      }
    ];
  }
});

// ../node_modules/wrangler/templates/pages-template-worker.ts
init_functionsRoutes_0_09583509623234443();

// ../node_modules/path-to-regexp/dist.es2015/index.js
init_functionsRoutes_0_09583509623234443();
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode2 = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode2(value, key);
        });
      } else {
        params[key.name] = decode2(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};

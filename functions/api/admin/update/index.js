// GET /api/admin/update
//
// Reports the user's installed commit SHA vs upstream main HEAD, plus
// the commit list between them and the changed-files diff stats from
// GitHub's public compare API. The Updates admin tab calls this on
// mount and on every refresh.
//
// Response shape:
//   {
//     ok: true,
//     install_method: 'browser' | 'cli' | '',
//     current: { sha: '<40-char hex>', short: '<7>', date: '<iso>' } | null,
//     latest:  { sha, short, date, message },
//     ahead:   N,                       // commits upstream is ahead by
//     up_to_date: bool,
//     can_apply: bool,                  // true only for browser installs
//     can_apply_reason: '<string>',     // why or why-not
//     repo: { owner, name },
//     commits: [ { sha, short, message, date, url, author } ],
//     files_changed: N,
//     additions: N,
//     deletions: N,
//     changelog_chunks: [ '<markdown>' ] | null,   // segments of CHANGELOG.md matching this range
//   }
//
// We use the unauthenticated GitHub API for read endpoints. Rate limit
// is 60/hour per source IP; Pages Functions share an outbound IP per
// colo so this is reasonable for a self-hosted admin tool that checks
// once per page load.

import { json } from '../../../_lib/util.js';
import { adminGate } from '../../../_lib/auth.js';
import { loadSettings, setSetting } from '../../../_lib/settings.js';

const UPSTREAM_OWNER = 'hophat';
const UPSTREAM_REPO  = 'Gu-SEO';
const BRANCH = 'main';

// Version checks talk to GitHub directly. We deliberately do NOT proxy
// through the upstream maintainer's site (seo.benjaminb.xyz): it is a
// third party we don't control, and when it flapped it took this
// endpoint down with a 502 and broke the admin UI.

// Authenticate when GITHUB_TOKEN is bound. The unauth fallback uses
// Cloudflare's shared edge-IP pool (60 req/hr) which can 502; the
// admin UI handles those as transient.
function ghHeaders(env) {
  const h = {
    'User-Agent': 'pages-seo-update',
    Accept: 'application/vnd.github+json',
  };
  if (env?.GITHUB_TOKEN) {
    h.Authorization = 'Bearer ' + String(env.GITHUB_TOKEN).trim();
  }
  return h;
}

async function fetchLatest(env) {
  const r = await fetch(
    `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/commits/${BRANCH}`,
    { headers: ghHeaders(env), signal: AbortSignal.timeout(8000) },
  );
  if (!r.ok) throw new Error('github_latest_' + r.status);
  return r.json();
}

async function fetchCompare(base, head, env) {
  // GitHub's compare endpoint returns commits + stats in one call.
  // Capped at 250 commits — way more than any sane update window.
  const r = await fetch(
    `https://api.github.com/repos/${UPSTREAM_OWNER}/${UPSTREAM_REPO}/compare/${base}...${head}`,
    { headers: ghHeaders(env), signal: AbortSignal.timeout(8000) },
  );
  if (!r.ok) throw new Error('github_compare_' + r.status);
  return r.json();
}

function short(sha) { return String(sha || '').slice(0, 7); }

// The admin shell calls this on every mount, so it must never be able
// to take the dashboard down with it: any unexpected throw is caught
// and reported as JSON rather than surfacing as an edge 502.
export const onRequestGet = async ({ env, request }) => {
  const gate = await adminGate(env, request); if (gate) return gate;

  try {
    return await buildUpdateReport(env);
  } catch (e) {
    return json(200, {
      ok: false,
      error: 'update_check_failed',
      detail: String(e?.message || e).slice(0, 200),
      install_method: '',
      current: null,
      latest: null,
      ahead: 0,
      up_to_date: false,
      can_apply: false,
      can_apply_reason: 'check_failed',
      repo: { owner: UPSTREAM_OWNER, name: UPSTREAM_REPO },
      commits: [],
      files_changed: 0,
      additions: 0,
      deletions: 0,
    });
  }
};

// The dashboard mounts this check on every page load, and the GitHub
// REST API allows only 60 unauthenticated requests per hour for the
// whole egress IP — a shared Pages colo burns that in minutes, after
// which subrequests start failing. Cache the answer in settings so we
// touch GitHub at most once per TTL no matter how many admins load the
// console, and serve the stale copy if a refresh fails.
const UPSTREAM_TTL_SEC = 600;

function readCachedLatest(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.sha ? parsed : null;
  } catch { return null; }
}

async function loadLatestCached(env, s) {
  const now = Math.floor(Date.now() / 1000);
  const checkedAt = Number(s.upstream_check_at || 0);
  const cached = readCachedLatest(s.upstream_check_json);
  if (cached && now - checkedAt < UPSTREAM_TTL_SEC) {
    return { latest: cached, cached: true, stale: false };
  }
  try {
    const fresh = await fetchLatest(env);
    await setSetting(env, 'upstream_check_json', JSON.stringify(fresh)).catch(() => {});
    await setSetting(env, 'upstream_check_at', String(now)).catch(() => {});
    return { latest: fresh, cached: false, stale: false };
  } catch (e) {
    if (cached) return { latest: cached, cached: true, stale: true };
    return { latest: null, cached: false, stale: false, error: String(e?.message || e) };
  }
}

async function buildUpdateReport(env) {
  const s = await loadSettings(env);
  const installedSha = String(s.installed_sha || '').trim();
  const installMethod = String(s.install_method || '').trim();

  const fetched = await loadLatestCached(env, s);
  if (!fetched.latest) {
    return json(200, {
      ok: false,
      error: 'github_unreachable',
      detail: fetched.error || 'upstream check failed',
      install_method: installMethod,
      current: null,
      latest: null,
      ahead: 0,
      up_to_date: false,
      can_apply: false,
      can_apply_reason: 'check_failed',
      repo: { owner: UPSTREAM_OWNER, name: UPSTREAM_REPO },
      commits: [],
      files_changed: 0,
      additions: 0,
      deletions: 0,
    });
  }
  const latest = fetched.latest;
  const latestSha = latest.sha;

  // Build the current-version block — null if we don't know what was
  // installed (CLI installs don't set installed_sha, or it was lost).
  const current = installedSha ? {
    sha: installedSha,
    short: short(installedSha),
    date: null, // filled in below if compare succeeds
  } : null;

  // If we don't know the installed SHA, return latest + a "we don't
  // know what you have" message. UI handles this.
  if (!installedSha) {
    return json(200, {
      ok: true,
      install_method: installMethod,
      current: null,
      latest: { sha: latestSha, short: short(latestSha), date: latest.commit?.author?.date || null, message: (latest.commit?.message || '').split('\n')[0] },
      ahead: null,
      up_to_date: false,
      can_apply: false,
      can_apply_reason: 'unknown_install_sha',
      repo: { owner: s.install_repo_owner || '', name: s.install_repo_name || '' },
      commits: [],
      files_changed: 0,
      additions: 0,
      deletions: 0,
    });
  }

  if (installedSha === latestSha) {
    return json(200, {
      ok: true,
      install_method: installMethod,
      current: { ...current, date: latest.commit?.author?.date || null },
      latest: { sha: latestSha, short: short(latestSha), date: latest.commit?.author?.date || null, message: (latest.commit?.message || '').split('\n')[0] },
      ahead: 0,
      up_to_date: true,
      can_apply: false,
      can_apply_reason: 'up_to_date',
      repo: { owner: s.install_repo_owner || '', name: s.install_repo_name || '' },
      commits: [],
      files_changed: 0,
      additions: 0,
      deletions: 0,
    });
  }

  // Compare installed → upstream HEAD.
  let cmp;
  try { cmp = await fetchCompare(installedSha, latestSha, env); }
  catch (e) { return json(502, { ok: false, error: 'github_compare_failed', detail: String(e?.message || e) }); }

  const commits = (cmp.commits || []).map((c) => ({
    sha: c.sha,
    short: short(c.sha),
    message: (c.commit?.message || '').split('\n')[0].slice(0, 200),
    date:    c.commit?.author?.date || null,
    url:     c.html_url,
    author:  c.author?.login || c.commit?.author?.name || 'unknown',
  }));

  // Git-linked installs (browser + maintainer) can trigger a redeploy
  // via the Cloudflare API. CLI installs are Direct Upload and have
  // no equivalent — the operator re-runs the install one-liner.
  const canApply = installMethod === 'browser' || installMethod === 'maintainer';
  const canApplyReason = canApply
    ? installMethod + '_install'
    : (installMethod === 'cli' ? 'cli_install' : 'unknown_method');

  return json(200, {
    ok: true,
    install_method: installMethod,
    current: { ...current, date: null },  // we don't fetch the installed commit's date; cheap to skip
    latest: {
      sha: latestSha,
      short: short(latestSha),
      date: latest.commit?.author?.date || null,
      message: (latest.commit?.message || '').split('\n')[0],
    },
    ahead: commits.length,
    up_to_date: false,
    can_apply: canApply,
    can_apply_reason: canApplyReason,
    repo: { owner: s.install_repo_owner || '', name: s.install_repo_name || '' },
    commits,
    files_changed: cmp.files?.length || 0,
    additions: (cmp.files || []).reduce((n, f) => n + (f.additions || 0), 0),
    deletions: (cmp.files || []).reduce((n, f) => n + (f.deletions || 0), 0),
  });
}

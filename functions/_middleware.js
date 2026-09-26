// Top-level middleware.
//
// One job left on every request: decide what `/` should return.
//
// The marketing page in public/index.html is the upstream maintainer's.
// On a user's install the same file would leak someone else's branding
// and installer links, so `/` is served as a minimal sign-in landing
// instead. We serve public/sign-in.html via the ASSETS binding rather
// than redirecting, so the URL stays clean.
//
// Maintainer detection is via env.IS_MAINTAINER==='1' or
// settings.is_maintainer==='1'. See _lib/maintainer.js. Cached on
// env after the first read.
//
// A project that owns this host through a custom domain gets /blog
// instead: its visitors are looking for content, not for a demo.

import { isMaintainer } from './_lib/maintainer.js';
import { resolveProjectByHost, requestHost, normalizeHost } from './_lib/project_scope.js';

export const onRequest = async ({ request, env, next }) => {
  const url = new URL(request.url);
  const path = url.pathname;
  const isRoot = path === '/' || path === '/index.html';

  if (!isRoot) {
    return next();
  }

  const host = requestHost(request);
  const customProject = await resolveProjectByHost(env, host, path);
  if (customProject?.custom_domain && normalizeHost(customProject.custom_domain) === normalizeHost(host)) {
    return Response.redirect(new URL('/blog', request.url).toString(), 302);
  }

  if (await isMaintainer(env)) {
    return next();
  }

  // User install: gate.
  if (env?.ASSETS?.fetch) {
    const signin = await env.ASSETS.fetch(new URL('/sign-in.html', url));
    if (signin.ok) {
      const headers = new Headers(signin.headers);
      headers.set('Cache-Control', 'public, max-age=300');
      return new Response(signin.body, { status: signin.status, headers });
    }
  }
  // Fallback if the file is missing for any reason — redirect to /admin.
  return Response.redirect(new URL('/admin', request.url).toString(), 302);
};

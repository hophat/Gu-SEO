// GET /api/embed/<id>
//
// Returns a self-contained embed widget for a named embed.
// Settings (title, accent, per_page, theme, palette) come from the
// blog_embeds row.
//
// Host page:
//   <div id="ps-blog"></div>
//   <script src="https://<your-site>/api/embed/<id>" defer></script>
//
// Like /widget.js, the bundle fetches /api/widget at runtime rather
// than embedding posts inline. That keeps the cached bundle small
// and means publishing a new post is reflected without re-fetching
// the embed JS.

import { json } from '../../_lib/util.js';
import { widgetBody } from '../../_lib/widget_render.js';

const CACHE_SEC = 300;

export const onRequestGet = async ({ env, params, request }) => {
  if (!env?.DB) return json(500, { error: 'no_db' });
  const id = String(params.id || '').trim();
  if (!id || !/^[a-zA-Z0-9_-]{6,64}$/.test(id)) {
    return new Response('// embed: invalid id\n', {
      status: 404,
      headers: { 'content-type': 'application/javascript; charset=utf-8' },
    });
  }

  const embed = await env.DB.prepare(
    `SELECT e.id, e.name, e.settings_json, p.slug AS project_slug, p.language AS project_language
       FROM blog_embeds e LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.id = ? LIMIT 1`
  ).bind(id).first().catch(() => null);

  let settings = {};
  if (embed?.settings_json) {
    try { settings = JSON.parse(embed.settings_json) || {}; } catch { /* default */ }
  }

  // Settings: title, accent, per_page (was "limit" — kept for back-
  // compat), theme, palette. Anything missing falls back to defaults.
  const perPage = Math.min(50, Math.max(1,
    parseInt(settings.per_page, 10) || parseInt(settings.limit, 10) || 10));
  const title  = String(settings.title || embed?.name || 'Blog').slice(0, 100);
  const accent = String(settings.accent || '#0a0a0a').slice(0, 24);
  const theme  = ['auto', 'light', 'dark'].includes(settings.theme) ? settings.theme : 'auto';

  // Sanitise the palette: only known keys with short hex/rgba/css-name
  // values pass through.
  const palette = {};
  if (settings.palette && typeof settings.palette === 'object') {
    for (const k of ['bg', 'fg', 'muted', 'line', 'accent']) {
      const v = settings.palette[k];
      if (typeof v === 'string' && v.length <= 32 && /^[#a-zA-Z0-9(),.%/\s-]+$/.test(v)) {
        palette[k] = v;
      }
    }
  }

  const url = new URL(request.url);
  const apiBase = `${url.protocol}//${url.host}`;
  // The embed is scoped to its own project, not to the host it is
  // pasted on — that host is the customer's site and resolves to no
  // project at all.
  const js = widgetBody({
    title, accent, apiBase, embedId: id, perPage, theme, palette,
    project: String(embed?.project_slug || ''),
    lang: String(embed?.project_language || 'vi'),
    // An operator-named embed keeps its title; anything else falls back
    // to the project's site_name from the API.
    titleAuto: !settings.title,
  });

  return new Response(js, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_SEC}`,
      'access-control-allow-origin': '*',
    },
  });
};

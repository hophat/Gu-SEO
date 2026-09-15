// Shared sanitizer for blog_embeds.settings_json.
//
// Both the admin writer (/api/admin/embeds) and the live preview
// (/api/admin/embed-preview) must agree on what a valid settings object
// looks like, otherwise the preview shows colours the save would drop.
//
// Whitelist only: anything the widget doesn't read is discarded, and
// colours must be #rgb / #rrggbb — the values are interpolated straight
// into the widget's CSS, so free-form strings would be an injection
// vector.

export const EMBED_THEMES = ['auto', 'light', 'dark'];
export const EMBED_PALETTE_KEYS = ['bg', 'fg', 'muted', 'line', 'accent'];

export function hexOrNull(v) {
  const m = String(v || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  return m ? '#' + m[1].toLowerCase() : null;
}

export function sanitizeEmbedSettings(settings) {
  const out = {};
  if (!settings || typeof settings !== 'object') return out;

  if (settings.title) out.title = String(settings.title).slice(0, 100);

  const accent = hexOrNull(settings.accent);
  if (accent) out.accent = accent;

  // `per_page` is what /api/embed reads; `limit` is the legacy key the
  // old admin wrote. Accept both, store the canonical one.
  const perPage = parseInt(settings.per_page ?? settings.limit, 10);
  if (Number.isFinite(perPage) && perPage > 0 && perPage <= 50) out.per_page = perPage;

  if (EMBED_THEMES.includes(settings.theme)) out.theme = settings.theme;

  if (settings.palette && typeof settings.palette === 'object') {
    const pal = {};
    for (const k of EMBED_PALETTE_KEYS) {
      const c = hexOrNull(settings.palette[k]);
      if (c) pal[k] = c;
    }
    if (Object.keys(pal).length) out.palette = pal;
  }

  return out;
}

// Build the copy-paste snippet for a host site.
//
// The widget mounts into #ps-blog by default, which means two embeds on one
// page fight over the same node. Every embed therefore gets its own
// container id and points the script at it with data-target (supported at
// runtime, previously never emitted). The `ps-blog-` prefix guarantees the
// id starts with a letter so it stays a valid CSS selector target.
export function snippetFor(origin, id) {
  const containerId = `ps-blog-${String(id).slice(0, 8)}`;
  return `<div id="${containerId}"></div>\n<script src="${origin}/api/embed/${id}" data-target="#${containerId}" defer></script>`;
}

// Build the runtime options /api/embed and the preview both feed to
// widgetBody(). `embed` carries the project defaults (slug, language,
// theme colour) so a preview of an unsaved embed still looks right.
export function embedWidgetOptions({ settings = {}, embed = {}, origin = '' }) {
  const perPage = Math.min(50, Math.max(1,
    parseInt(settings.per_page, 10) || parseInt(settings.limit, 10) || 10));
  const title = String(settings.title || embed.name || 'Blog').slice(0, 100);
  const accent = String(settings.accent || embed.project_theme_color || '#0a0a0a').slice(0, 24);
  const theme = EMBED_THEMES.includes(settings.theme) ? settings.theme : 'auto';
  const palette = sanitizeEmbedSettings({ palette: settings.palette }).palette || {};

  return {
    title, accent, theme, palette, perPage,
    apiBase: origin,
    embedId: embed.id || '',
    project: String(embed.project_slug || ''),
    lang: String(embed.project_language || 'vi'),
    titleAuto: !settings.title,
  };
}

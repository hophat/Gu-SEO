// Cover-spec policy — the one owner of what a cover template is
// allowed to be before anything renders it.
//
// Two rules live here, because they were previously copy-pasted into
// three places (the SVG renderer, the React Covers page and the
// vanilla editor) and had already drifted apart:
//
//   1. isRenderableSpec() — can this stored spec paint anything? A
//      spec with no background image and no layers paints a black
//      rectangle with no text, which is what readers saw when the
//      default template row was saved as `{}`.
//   2. fallbackCoverSpec() — the branded 1200x630 card served instead,
//      plus COVER_SPEC_SIZE (the canvas both the renderer and the
//      editor assume) and normalizeCoverSpec() (the shape every
//      consumer can rely on).
//
// Who reads what:
//
//   - Server: renderCoverSvg() in cover_svg.js, the /cover and /og
//     routes, and the templates API.
//   - Browsers: never this file. The templates API carries the policy
//     to both clients — every row comes back with a normalised `spec`
//     and a `renderable` flag, and the payload carries `starter_spec`
//     — so src/admin/pages/Covers.jsx and the unbundled
//     public/cover-editor.js hold no copy of the card and cannot
//     disagree with the renderer. The editor is plain script (no
//     bundler), so the API is its only honest source.
//
// Everything returned here is a fresh object; callers own what they
// get and may mutate it freely.

export const COVER_SPEC_SIZE = Object.freeze({ width: 1200, height: 630 });

// A spec counts as renderable when it either paints a background image
// or has at least one layer. Anything else is a blank canvas.
export function isRenderableSpec(spec) {
  if (!spec || typeof spec !== 'object') return false;
  if (spec.background && spec.background.url) return true;
  return Array.isArray(spec.layers) && spec.layers.length > 0;
}

// Give a stored spec the shape every consumer assumes: real positive
// dimensions (OG size when missing or nonsense), an array of layers and
// an explicit background slot. Deep-copies, so callers never share a
// reference with a parsed D1 row.
export function normalizeCoverSpec(spec) {
  const s = spec && typeof spec === 'object' ? JSON.parse(JSON.stringify(spec)) : {};
  if (!Number.isFinite(s.width) || s.width <= 0) s.width = COVER_SPEC_SIZE.width;
  if (!Number.isFinite(s.height) || s.height <= 0) s.height = COVER_SPEC_SIZE.height;
  if (!Array.isArray(s.layers)) s.layers = [];
  if (!('background' in s)) s.background = null;
  return s;
}

// The branded card, in the shape templates are stored in so it can be
// saved back as a real template. It serves three roles:
//
//   1. /cover/<slug>.svg and /og/<slug>.svg when the default template's
//      spec is unusable (the hero <img> and the og:image stay alive).
//   2. The last-resort render inside renderCoverSvg(), so no caller can
//      produce a black, textless cover.
//   3. The starter design a browser client seeds an empty or new
//      template with (sent to them as `starter_spec`).
//
// Visually it mirrors the "main — official" editorial template the
// installer seeds: near-black card, accent rule, brand eyebrow, big
// serif title, metadata footer.
export function fallbackCoverSpec() {
  return {
    width: COVER_SPEC_SIZE.width,
    height: COVER_SPEC_SIZE.height,
    background: null,
    layers: [
      { id: 'bg', kind: 'box', x: 0, y: 0, w: 1200, h: 630, fill: '#0a0c10', radius: 0 },
      { id: 'rule', kind: 'box', x: 80, y: 60, w: 200, h: 2, fill: '#d4af62', radius: 0 },
      { id: 'eyebrow', kind: 'text', x: 80, y: 80, w: 700, h: 30,
        text: '{brand.name|upper}',
        size: 22, family: '"JetBrains Mono", monospace', weight: '600',
        align: 'left', color: '#d4af62', shadow: false,
      },
      { id: 'title', kind: 'text', x: 80, y: 280, w: 1040, h: 240,
        text: '{title}',
        size: 76, family: '"Playfair Display", Georgia, serif', weight: '700',
        align: 'left', color: '#f5f0e6', shadow: false,
      },
      { id: 'sig', kind: 'text', x: 80, y: 560, w: 600, h: 30,
        text: '{pub_date|date:long} · {reading_time}',
        size: 16, family: '"JetBrains Mono", monospace', weight: '400',
        align: 'left', color: 'rgba(245,240,230,0.55)', shadow: false,
      },
    ],
  };
}

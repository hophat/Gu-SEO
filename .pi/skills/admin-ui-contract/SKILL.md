---
name: admin-ui-contract
description: "How to build and change the pages-seo admin dashboard in src/admin/** — adding a page or component, calling the admin API through src/admin/api.js, using design tokens, handling the cover editor, and rebuilding the committed public/admin-dist bundle. Use for any React/Vite change in src/, any 'admin page/component/dashboard' request, any admin UI bug, or any build/check failure in check-jsx, check:contrast, or check-public."
---

# Admin UI contract

The admin dashboard is a Vite + React app at `src/admin` whose output is written into `public/`
and **gitignored**. Two consequences: `src/admin/**` is the tracked, canonical copy — a fresh
clone rebuilds the panel — and `public/admin-dist/` is disposable build output. Never hand-edit it,
never try to commit it.

```bash
npm run admin:build      # vite build: root src/admin → outDir public/admin-dist (gitignored)
```

`git ls-files public/admin-dist` returns nothing — that is correct, not a broken setup. The
contrast to know: `functions_dist/` **is** tracked and **is** committed, so a `functions/` change
without `npm run build:functions` blocks a release.

## Layout as it exists

```
src/admin/
  index.html  main.jsx  App.jsx        App.jsx owns the view switch (no router)
  api.js                                   the single API boundary
  theme.js  hooks/useTheme.jsx
  styles/tokens.css                        colours, spacing, type — read before styling
  components/  StatusChip, CoverEditor, SetupWizard, PageContainer, ChannelCards, VideoStatusTag
  pages/       Overview Status Blog Posts? … Projects Settings Covers Video Calendar Links …
  lib/         projectUrl.js, status.js, videoQueue.js
```

Add a page by following an existing one in `pages/` and registering it in `App.jsx`. Do not
introduce a router or a state library to solve a view switch.

## The API boundary

`src/admin/api.js` is the only place that talks to `/api/admin/**`. Extend it rather than calling
`fetch` from a component:

- auth header and error handling live there; a component that hand-rolls `fetch` silently loses
  both
- the server contract is the auth gate + `json()` envelope from
  `/skill:pages-function-endpoint`; a 401/503 is a valid server answer, not a UI bug
- stable error codes (`'slug_required'`, `'unauthorized'`) are what the UI branches on

If the UI needs data the API does not return, that is a Functions-layer change — report it
rather than inventing a second source.

## Styling

Read `src/admin/styles/tokens.css` first. New colour, spacing, radius, or type goes in as a
token; a hex literal inside a component is a review finding. `npm run check:contrast` enforces
the contrast rules in that file — it is why a "harmless" new colour fails the build.

Theme is toggled via `theme.js` / `useTheme.jsx`; hardcoding a light-mode assumption breaks the
dark theme.

## The cover editor is special

Cover policy — what counts as a paintable template (`isRenderableSpec`), the canvas size, spec
normalisation, and the branded starter card (`fallbackCoverSpec`) — lives **only** in
`functions/_lib/cover_spec.js`. It reaches the browser through `/api/admin/cover/templates`:
each template row carries `renderable` plus a normalised `spec`, and the payload carries
`starter_spec`.

`src/admin/components/CoverEditor.jsx` uses that payload. `public/cover-editor.js` is a second,
**unbundled** client with no import capability, so it also reads the same rule from the same API.
Never paste the rule or the starter card into either file. If a cover decision is missing, extend
`cover_spec.js` / the templates payload — that is a `functions-worker` task.

## The build gates

```bash
npm run check-jsx        # JSX imports resolve
npm run check:contrast   # token contrast
npm run check-public     # no symlinks under public/; no stale mirrors
npm run admin:build      # regenerate public/admin-dist  → then re-run check-public
node scripts/run-admin-hook-tests.mjs   # when a hook / api.js / video queue path changed
```

`check-public` exists for a specific CI failure: Workers Builds refuses a build output directory
containing symlinks, while local `wrangler pages deploy` follows them silently — so a setup that
works locally breaks in CI. It also blocks committing a stale mirror of a canonical source.
Rebuild after every `src/` change so local `dev`/`wrangler pages dev` runs match what CI builds.

## Checklist

- [ ] Change is in `src/admin/**`, routed through `api.js`
- [ ] Colours/spacing from `tokens.css`; theme toggle still works
- [ ] No cover policy duplicated client-side
- [ ] `npm run admin:build` run; `public/admin-dist` left untracked
- [ ] `check-jsx`, `check:contrast`, `check-public` green
- [ ] No attempt to commit anything under `public/admin-dist/`

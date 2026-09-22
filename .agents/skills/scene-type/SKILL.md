---
name: scene-type
description: Add one new scene type to the video pipeline — a visual the current vocabulary cannot express (a photo grid, a price table, a team row). Use when a storyboard needs a look that does not exist yet. Touches video-agent/scenes.mjs, video-agent/storyboard.mjs, the shell CSS in video-agent/render-video.mjs, and the test suite.
whenToUse: A video needs a visual the scene vocabulary cannot express, and the change is one self-contained scene type.
---

# Adding a scene type

A scene type is one thing a storyboard can ask for: `hook`, `ui_demo`,
`bars`, `location`. Adding one is a **code change with a test**, not a
one-off composition — that is what keeps the videos reproducible, the
guards enforceable, and the output the same on every render.

## The four files, and why each

1. **`video-agent/scenes.mjs`** — the renderer (`export function gallery(...)`)
   and a `case` in `sceneInner`. This is the only place that writes markup.
2. **`video-agent/storyboard.mjs`** — add the type to `SCENE_TYPES` (or
   `VISUAL_TYPES` / `GRAPHIC_TYPES` / `PROSE_ONLY_TYPES`, which decides how
   the slideshow gate counts it) **and** to the vocabulary of every beat
   that may use it in `BEATS`. A type no beat allows can never appear.
3. **`video-agent/render-video.mjs`** — the CSS, inside `businessShell`.
   Class names are shared with every other scene, so prefix them.
4. **`scripts/run-video-agent-tests.mjs`** — a test that pins the markup the
   scene draws, and (if it takes assets) that it degrades when the asset is
   missing.

## Rules that are not negotiable

- **Escape every string** with `esc()`. Every field of a scene is model
  output derived from a source; one unescaped label injects markup into the
  page the renderer loads.
- **Deterministic**: no `Math.random`, no `Date.now`, no network call, no
  `repeat: -1`. The same scene must always produce the same string, because
  the renderer seeks the timeline and a frame must be reproducible.
- **SVG draws shapes, HTML draws text.** SVG `<text>` cannot wrap, and
  Vietnamese labels are long.
- **Degrade, never break.** A missing asset shows the text, not a broken
  frame. A scene with no data renders nothing rather than throwing.
- **On-screen text is a caption**: the storyboard clamps it to 8 words
  before it reaches you; do not re-introduce a sentence.
- **Assets are referenced by role** (`site:0`, `hero`, `map`, `photo:1`) and
  resolved at compose time. A scene currently gets ONE asset (`scene.asset`).
  To use several, extend the schema: validate each one in
  `sanitizeStoryboard` (an asset that does not exist is dropped, and the
  drop is reported) and read them in `sceneInner`.
- **Numbers must come from the source.** If the scene shows a number, it may
  only be one the storyboard already verified.

## Verify — in this order

```bash
npm test                      # the suite must stay green
npm run build:functions       # a broken import only fails at deploy otherwise
```

Then **look at it**. A test pins markup; only a frame shows whether the
scene reads:

```bash
node scripts/scene-preview.mjs storyboard.json --assets ./some/dir
```

That composes the storyboard, runs `hyperframes check` (the framework's
validator — it must report 0 errors), renders, and writes one PNG per scene
under `.scene-preview/frames/`. Open them. A scene that passes every test
and looks wrong is not done.

## Report

Say which scene type you added, which beats allow it, the exact test names
you added, and paste the `hyperframes check` summary line. If you could not
make the frame look right, say so instead of leaving it.

#!/usr/bin/env node
// Render ONE storyboard to frames you can look at.
//
//   node scripts/scene-preview.mjs storyboard.json --assets ./some/dir
//
// Why this exists: the video pipeline renders blind. Every visual defect
// found so far — a blank screenshot inside the phone frame, a chart label
// wrapped over four lines, a map cropped past its pin, a button hidden
// behind its neighbour — was found by hand-building a preview and looking
// at a frame, never by a test. This turns that into one command.
//
// What it does: compose the storyboard with the real shell, run
// `hyperframes check` (the validator the framework's own skill names, which
// the production path was not calling), render with the real hyperframes,
// then cut one frame per scene so each scene can be judged on its own.
//
// The storyboard is the same shape the agent produces:
//   { "intent": "local_business", "duration": 20, "scenes": [ { "type": …, "text": …, "say": …, "duration": … } ] }
// Asset roles resolve either from an `assets` map in the JSON (role -> file)
// or from files in --assets named after the role (site:0 -> site0.png).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// render-video.mjs refuses to load without config; a preview needs none.
process.env.BASE_URL ||= 'https://preview.invalid';
process.env.ADMIN_TOKEN ||= 'preview';

const HF_VERSION = '0.8.56';
const log = (m) => console.log(`[scene-preview] ${m}`);

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? 'true' : v;
}

const storyFile = process.argv[2];
if (!storyFile || storyFile.startsWith('--')) {
  console.error('usage: node scripts/scene-preview.mjs <storyboard.json> [--assets <dir>] [--out <dir>] [--keep]');
  process.exit(2);
}

const storyboard = JSON.parse(readFileSync(resolve(storyFile), 'utf8'));
if (!Array.isArray(storyboard.scenes) || !storyboard.scenes.length) {
  console.error('storyboard has no scenes');
  process.exit(2);
}

const outDir = resolve(arg('out', join(ROOT, '.scene-preview')));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'assets'), { recursive: true });

// ── assets ────────────────────────────────────────────────────────────
// A role is `site:0`, `hero`, `map`, `photo:1`. The composition only ever
// sees a path, so a role becomes `assets/<something>` in the workspace.
const assetDir = arg('assets', '');
const ROLES = new Set(storyboard.scenes.flatMap((s) => [s.asset, ...(s.assets || []), s.asset2]).filter(Boolean));
const assets = {};
for (const role of ROLES) {
  const explicit = storyboard.assets?.[role];
  let src = explicit ? resolve(explicit) : null;
  if (!src && assetDir) {
    const stem = role.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const hit = readdirSync(assetDir).find((f) => basename(f, extname(f)).replace(/[^a-z0-9]/gi, '').toLowerCase() === stem);
    if (hit) src = join(assetDir, hit);
  }
  if (!src || !existsSync(src)) {
    log(`asset "${role}" not found — the scene will degrade, which is itself worth seeing`);
    continue;
  }
  const dest = `assets/${role.replace(/[^a-z0-9]/gi, '')}${extname(src)}`;
  copyFileSync(src, join(outDir, dest));
  assets[role] = dest;
}
log(`assets: ${Object.keys(assets).length ? Object.keys(assets).join(', ') : 'none'}`);

// ── audio ─────────────────────────────────────────────────────────────
// Silent, scene-length tracks: the preview is about what the frame looks
// like, and a silent bed keeps the render fast and deterministic.
const segs = storyboard.scenes.map((s) => Math.max(1, Number(s.duration) || 3) - 0.35);
segs.forEach((d, i) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono',
    '-t', d.toFixed(2), '-b:a', '128k', join(outDir, 'assets', `seg${i}.mp3`)], { encoding: 'utf8' });
  if (r.status !== 0) { console.error('ffmpeg could not write a silent segment:', r.stderr); process.exit(1); }
});

// ── compose ───────────────────────────────────────────────────────────
const { composeStoryboardHtml } = await import(join(ROOT, 'video-agent/render-video.mjs'));
const job = { slug: 'preview', kind: 'preview', project: storyboard.project || { accent: '#1677ff' } };
const html = composeStoryboardHtml(job, storyboard, segs, assets, null, null);
writeFileSync(join(outDir, 'index.html'), html);
log(`composed ${storyboard.scenes.length} scenes, ${storyboard.scenes.reduce((a, s) => a + s.dur, 0).toFixed(1)}s`);

// ── check (the gate the production path was skipping) ─────────────────
const check = spawnSync('npx', ['-y', `hyperframes@${HF_VERSION}`, 'check'],
  { cwd: outDir, encoding: 'utf8', timeout: 5 * 60 * 1000 });
const checkOut = `${check.stdout || ''}${check.stderr || ''}`.trim();
log(check.status === 0 ? 'hyperframes check: ok' : `hyperframes check: FAILED (exit ${check.status})`);
if (check.status !== 0) console.log(checkOut.split('\n').slice(-25).join('\n'));

// ── render ────────────────────────────────────────────────────────────
log('rendering…');
const ren = spawnSync('npx', ['-y', `hyperframes@${HF_VERSION}`, 'render', '--no-browser-gpu'],
  { cwd: outDir, encoding: 'utf8', timeout: 15 * 60 * 1000 });
if (ren.status !== 0) {
  console.error(`render failed (exit ${ren.status}):\n${`${ren.stdout || ''}${ren.stderr || ''}`.slice(-1200)}`);
  process.exit(1);
}
const renders = join(outDir, 'renders');
const mp4 = readdirSync(renders).filter((f) => f.endsWith('.mp4'))
  .map((f) => ({ f, m: existsSync(join(renders, f)) ? 1 : 0 }))
  .map(({ f }) => f)[0];
if (!mp4) { console.error('render produced no mp4'); process.exit(1); }
const video = join(renders, mp4);

// ── one frame per scene ───────────────────────────────────────────────
// A contact sheet is not enough to judge a scene: cut each one on its own
// so a single scene can be looked at properly.
mkdirSync(join(outDir, 'frames'), { recursive: true });
const frames = [];
for (const [i, s] of storyboard.scenes.entries()) {
  const at = ((Number(s.start) || 0) + (Number(s.dur) || 3) / 2).toFixed(2);
  const out = join(outDir, 'frames', `scene-${i}-${s.type}.png`);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', at, '-i', video, '-frames:v', '1', out], { encoding: 'utf8' });
  if (r.status === 0) frames.push(out);
}
const sheet = join(outDir, 'sheet.png');
spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf', `fps=1/${(storyboard.scenes[0].dur || 3).toFixed(2)},scale=320:-1,tile=3x3`, '-frames:v', '1', sheet]);

console.log('');
log(`video   ${video}`);
log(`sheet   ${sheet}`);
for (const f of frames) log(`frame   ${f}`);
log(`open the frames and judge each scene — that is the step no test replaces`);

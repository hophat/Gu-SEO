// WCAG contrast check for the admin palette and the blog tokens.
// Run: node scripts/check-contrast.js
// Fails loudly rather than printing a wall of numbers, so it can gate a build.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const L = (hex) => {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const ratio = (a, b) => {
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// ── The blog's real tokens ────────────────────────────────────────
// Read out of public/style.css rather than restated here. A gate that
// duplicates the palette it guards is a gate that silently passes the
// day someone edits one side: the blog tokens below are the ones that
// shipped a 1.24:1 hairline for exactly that reason. Parsing the file
// means the only way to pass is to make the stylesheet pass.
const css = readFileSync(join(REPO_ROOT, 'public', 'style.css'), 'utf8');

const block = (start, end) => {
  const from = css.indexOf(start);
  if (from < 0) throw new Error(`check-contrast: ${start} not found in public/style.css`);
  const to = end ? css.indexOf(end, from) : css.length;
  return css.slice(from, to < 0 ? css.length : to);
};

const token = (name, scope = css) => {
  const m = scope.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  if (!m) throw new Error(`check-contrast: --${name} not found in public/style.css`);
  return m[1];
};

const LIGHT = block(':root {', '@media (prefers-color-scheme: dark)');
const DARK = block('@media (prefers-color-scheme: dark)', 'html[lang="vi"]');
const t = (name, scope = LIGHT) => token(name, scope);

// [label, foreground, background, minimum] — 4.5 for body text, 3.0 for
// large text (>=18.66px bold or >=24px) and for UI component boundaries.
const PAIRS = [
  // Light mode — body text
  ['ink on bg',              '#0f1419', '#ffffff', 4.5],
  ['ink-dim on bg',          '#5b6570', '#ffffff', 4.5],
  ['ink-faint on bg',        '#666f76', '#ffffff', 4.5],
  ['accent text on bg',      '#c64a0c', '#ffffff', 4.5],
  ['link on bg',             '#b8430a', '#ffffff', 4.5],

  // Light mode — the primary button. White label on an orange fill.
  ['primary button label',   '#ffffff', '#c64a0c', 4.5],
  ['primary hover label',    '#ffffff', '#a83c08', 4.5],

  // Light mode — chips (12px text, so 4.5 applies)
  ['chip good',              '#12703a', '#f0fdf4', 4.5],
  ['chip warn',              '#a34a07', '#fffbeb', 4.5],
  ['chip bad',               '#b91c1c', '#fef2f2', 4.5],
  ['chip info',              '#b8430a', '#fff4ef', 4.5],
  ['chip muted',             '#5b6570', '#f2f4f4', 4.5],
  ['chip plain border',      '#5b6570', '#ffffff', 3.0],

  // Light mode — hairlines and focus ring
  ['line on bg',             '#e7e9ea', '#ffffff', 1.0],
  ['line-2 on bg',           '#d0d5d8', '#ffffff', 1.0],
  ['focus ring on bg',       '#0f1419', '#ffffff', 3.0],
  ['focus ring on accent-soft', '#0f1419', '#fff4ef', 3.0],

  // Dark mode — body text
  ['dark ink on bg',         '#e8ecee', '#0f1214', 4.5],
  ['dark ink-dim on bg',     '#9aa4ad', '#0f1214', 4.5],
  ['dark ink-faint on bg',   '#848e97', '#0f1214', 4.5],
  ['dark accent on bg',      '#ff7a33', '#0f1214', 4.5],

  // Dark mode — the primary button takes near-black label text, not white
  ['dark primary label',     '#0f1214', '#ff7a33', 4.5],

  // Dark mode — chips
  ['dark chip good',         '#4ade80', '#16191c', 4.5],
  ['dark chip warn',         '#fbbf24', '#16191c', 4.5],
  ['dark chip bad',          '#f87171', '#16191c', 4.5],
  ['dark chip info',         '#ff7a33', '#1e1a18', 4.5],
  ['dark chip muted',        '#9aa4ad', '#16191c', 4.5],

  // Dark mode — hairlines and focus
  ['dark line on bg',        '#262b2f', '#0f1214', 1.0],
  ['dark line-2 on bg',      '#3a4147', '#0f1214', 1.0],
  ['dark focus ring on bg',  '#ffffff', '#0f1214', 3.0],
];

// ── The blog palette, read from the stylesheet ────────────────────
// Each row is a pairing that actually occurs in public/style.css. The
// minimum is the WCAG level for the *role*: 4.5 for text, 3.0 for a
// control edge or a focus ring, 1.5 for a decorative separator.
const BLOG = [
  ['— blog, light —', '', '', 0],
  ['ink on paper',            t('ink'), t('bg'), 4.5],
  ['ink on raised',           t('ink'), t('bg-2'), 4.5],
  ['ink-2 (prose) on paper',  t('ink-2'), t('bg'), 4.5],
  ['ink-2 (prose) on raised', t('ink-2'), t('bg-2'), 4.5],
  ['muted (excerpt) on paper', t('muted'), t('bg'), 4.5],
  ['muted on raised',         t('muted'), t('bg-2'), 4.5],
  ['muted-2 (meta) on paper', t('muted-2'), t('bg'), 4.5],
  ['muted-2 (meta) on raised', t('muted-2'), t('bg-2'), 4.5],
  ['link on paper',           t('link'), t('bg'), 4.5],
  ['link on raised',          t('link'), t('bg-2'), 4.5],
  ['brand-ink (accent text)', t('brand-ink'), t('bg'), 4.5],
  ['brand-ink on raised',     t('brand-ink'), t('bg-2'), 4.5],
  ['on-brand label',          t('on-brand'), t('brand-fill'), 4.5],
  ['hover fill label',        t('on-brand'), t('brand-dark'), 4.5],
  ['status fail on raised',   t('fail'), t('bg-2'), 4.5],
  ['status warn on raised',   t('warn'), t('bg-2'), 4.5],
  ['status pass on raised',   t('pass'), t('bg-2'), 4.5],
  ['share facebook on paper', t('share-fb'), t('bg'), 4.5],
  ['share zalo on paper',     t('share-zalo'), t('bg'), 4.5],
  ['hairline separator',      t('line'), t('bg'), 1.5],
  ['control edge (underline)', t('line-strong'), t('bg'), 3.0],
  ['control edge on raised',  t('line-strong'), t('bg-2'), 3.0],
  ['focus ring on paper',     t('brand-ink'), t('bg'), 3.0],
  ['brand-ink on brand-light', t('brand-ink'), t('brand-light'), 4.5],

  ['— the plate (both schemes) —', '', '', 0],
  ['footer body on plate',    t('plate-ink-1'), t('plate'), 4.5],
  ['footer link on plate',    t('plate-ink-2'), t('plate'), 4.5],
  ['footer copy on plate',    t('plate-ink-3'), t('plate'), 4.5],
  ['wordmark on plate',       t('plate-ink-1'), t('plate'), 4.5],
  ['code block on plate',     t('plate-ink-1'), t('plate'), 4.5],

  ['— blog, dark —', '', '', 0],
  ['d ink on paper',          t('ink', DARK), t('bg', DARK), 4.5],
  ['d ink-2 (prose) on paper', t('ink-2', DARK), t('bg', DARK), 4.5],
  ['d muted on paper',        t('muted', DARK), t('bg', DARK), 4.5],
  ['d muted on raised',       t('muted', DARK), t('bg-2', DARK), 4.5],
  ['d muted-2 on paper',      t('muted-2', DARK), t('bg', DARK), 4.5],
  ['d muted-2 on raised',     t('muted-2', DARK), t('bg-2', DARK), 4.5],
  ['d link on paper',         t('link', DARK), t('bg', DARK), 4.5],
  ['d brand on paper',        t('brand', DARK), t('bg', DARK), 4.5],
  ['d brand-ink on paper',    t('brand-ink', DARK), t('bg', DARK), 4.5],
  ['d on-brand label',        t('on-brand', DARK), t('brand-fill', DARK), 4.5],
  ['d status fail',           t('fail', DARK), t('bg', DARK), 4.5],
  ['d status warn',           t('warn', DARK), t('bg', DARK), 4.5],
  ['d status pass',           t('pass', DARK), t('bg', DARK), 4.5],
  ['d share facebook',        t('share-fb', DARK), t('bg', DARK), 4.5],
  ['d share zalo',            t('share-zalo', DARK), t('bg', DARK), 4.5],
  ['d control edge on raised', t('line-strong', DARK), t('bg-2', DARK), 3.0],
  ['d focus ring on paper',   t('brand-ink', DARK), t('bg', DARK), 3.0],
];

let failed = 0;
console.log('pair                              ratio   min   result');
console.log('-'.repeat(60));
for (const [label, fg, bg, min] of PAIRS) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(
    `${label.padEnd(32)} ${r.toFixed(2).padStart(5)}  ${min.toFixed(1).padStart(4)}   ${ok ? 'PASS' : 'FAIL'}`,
  );
}
console.log('-'.repeat(60));
console.log(failed === 0 ? 'All admin pairs pass.' : `${failed} admin pair(s) below target.`);

console.log('\nblog tokens, read from public/style.css');
console.log('-'.repeat(60));
for (const [label, fg, bg, min] of BLOG) {
  if (min === 0) {
    console.log(label);
    continue;
  }
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(
    `${label.padEnd(32)} ${r.toFixed(2).padStart(5)}  ${min.toFixed(1).padStart(4)}   ${ok ? 'PASS' : 'FAIL'}   ${fg} on ${bg}`,
  );
}
console.log('-'.repeat(60));

// ── Tenant accents ───────────────────────────────────────────────
// A project can set any theme_color, and themeStyle() derives the fill,
// the label and the ink step from it. This walks the hue range to prove
// the derivation never hands back a step that fails its own target.
const { themeStyle } = await import(join(REPO_ROOT, 'functions', '_lib', 'page_render.js'));
console.log('\ntenant accents — derived by themeStyle()');
console.log('-'.repeat(60));
const HUES = [
  '#e05a2b', '#c0392b', '#b7791f', '#eab308', '#fde68a', '#2b6cb0',
  '#0f766e', '#7c3aed', '#db2777', '#065f46', '#7f1d1d', '#4a5568',
  '#ffffff', '#000000',
];
for (const hue of HUES) {
  const out = themeStyle(hue);
  const got = Object.fromEntries([...out.matchAll(/--([\w-]+):([^;}]+)/g)].map((m) => [m[1], m[2].trim()]));
  const checks = [
    ['ink on paper',  got['brand-ink'], token('bg'), 4.5],
    ['fill label',    got['on-brand'], got['brand-fill'], 4.5],
  ];
  const worst = Math.min(...checks.map(([, f, b, m]) => ratio(f, b) - m));
  const ok = worst >= 0;
  if (!ok) failed++;
  const ratios = checks.map(([, f, b, m]) => `${ratio(f, b).toFixed(2)}/${m}`).join('  ');
  console.log(
    `${hue} -> ${got['brand-ink']}  ${ok ? 'PASS' : 'FAIL'}   ink ${ratios}`.padEnd(72),
  );
}
console.log('-'.repeat(60));

// The previous palette, for reference — these are the values this replaced.
const OLD = [
  ['old good chip', '#52c41a', '#ffffff'],
  ['old warn chip', '#faad14', '#ffffff'],
  ['old bad chip',  '#ff4d4f', '#ffffff'],
];
console.log('\nPrevious palette at 12px on white (for comparison):');
for (const [label, fg, bg] of OLD) {
  console.log(`  ${label.padEnd(16)} ${ratio(fg, bg).toFixed(2)}:1`);
}

console.log(failed === 0 ? '\nAll pairs pass.' : `\n${failed} pair(s) below target.`);
process.exit(failed === 0 ? 0 : 1);

// WCAG contrast check for the admin palette.
// Run: node scripts/check-contrast.js
// Fails loudly rather than printing a wall of numbers, so it can gate a build.

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

// [label, foreground, background, minimum] — 4.5 for body text, 3.0 for
// large text (>=18.66px bold or >=24px) and for UI component boundaries.
const PAIRS = [
  // Light mode — body text
  ['ink on bg',              '#0f1419', '#ffffff', 4.5],
  ['ink-dim on bg',          '#5b6570', '#ffffff', 4.5],
  ['ink-faint on bg',        '#666f76', '#ffffff', 4.5],
  ['accent on bg',           '#0f1419', '#ffffff', 4.5],

  // Light mode — chips (12px text, so 4.5 applies)
  ['chip good',              '#15803d', '#f0fdf4', 4.5],
  ['chip warn',              '#b45309', '#fffbeb', 4.5],
  ['chip bad',               '#b91c1c', '#fef2f2', 4.5],
  ['chip info',              '#0f1419', '#eff1f1', 4.5],
  ['chip muted',             '#5b6570', '#f2f4f4', 4.5],
  ['chip plain border',      '#5b6570', '#ffffff', 3.0],

  // Light mode — hairlines and focus ring
  ['line on bg',             '#e7e9ea', '#ffffff', 1.0],
  ['line-2 on bg',           '#d0d5d8', '#ffffff', 1.0],
  ['focus ring on bg',       '#0f1419', '#ffffff', 3.0],
  ['focus ring on accent-soft', '#0f1419', '#eff1f1', 3.0],

  // Dark mode — body text
  ['dark ink on bg',         '#e8ecee', '#0f1214', 4.5],
  ['dark ink-dim on bg',     '#9aa4ad', '#0f1214', 4.5],
  ['dark ink-faint on bg',   '#848e97', '#0f1214', 4.5],
  ['dark accent on bg',      '#ffffff', '#0f1214', 4.5],

  // Dark mode — chips
  ['dark chip good',         '#4ade80', '#16191c', 4.5],
  ['dark chip warn',         '#fbbf24', '#16191c', 4.5],
  ['dark chip bad',          '#f87171', '#16191c', 4.5],
  ['dark chip info',         '#e8ecee', '#1e2327', 4.5],
  ['dark chip muted',        '#9aa4ad', '#16191c', 4.5],

  // Dark mode — hairlines and focus
  ['dark line on bg',        '#262b2f', '#0f1214', 1.0],
  ['dark line-2 on bg',      '#3a4147', '#0f1214', 1.0],
  ['dark focus ring on bg',  '#ffffff', '#0f1214', 3.0],
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
console.log(failed === 0 ? 'All pairs pass.' : `${failed} pair(s) below target.`);

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

process.exit(failed === 0 ? 0 : 1);

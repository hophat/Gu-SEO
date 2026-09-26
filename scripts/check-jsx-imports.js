// Catch JSX component references that are used but never imported.
//
// Why this exists: `vite build` will happily bundle a file that renders
// <Tag /> after `Tag` was removed from the import list. The failure is not
// a build error — it surfaces at runtime as
//   Uncaught ReferenceError: Tag is not defined
// the moment the lazy-loaded chunk for that page is fetched. Tree-shaking
// never reports it because the identifier is just an unresolved global as
// far as the bundler is concerned.
//
// So: every capitalised JSX tag used in a file must appear in that file's
// import list, or be defined locally, or be a known ambient React global.
//
// Run: node scripts/check-jsx-imports.js   (exits 1 on any miss)

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['src/admin'];

// JSX tags React provides without an import.
const AMBIENT = new Set(['Fragment']);

// Files whose JSX is not React at all.
const SKIP = new Set([]);

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.jsx')) out.push(p);
  }
  return out;
};

// `<Tag` or `<Tag ` or `<Tag>` or `<Tag/>` — an opening tag, not a comparison.
const jsxTags = (src) => {
  const found = new Set();
  for (const m of src.matchAll(/<([A-Z][A-Za-z0-9_$]*)(\s|\/?>)/g)) found.add(m[1]);
  return found;
};

const importedNames = (src) => {
  const names = new Set();
  // `import { a, b as c } from 'x'` and `import X from 'x'`
  for (const m of src.matchAll(/^import\s+([^;]*?)\s+from\s+['"]/gm)) {
    const clause = m[1];
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const t = part.trim();
        if (!t) continue;
        const as = t.split(/\s+as\s+/);
        names.add((as[1] || as[0]).trim());
      }
    }
    const def = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
    for (const piece of def.split(/\s+/)) {
      if (piece && piece !== '*' && piece !== 'as' && !piece.startsWith('*')) {
        names.add(piece);
      }
    }
  }
  return names;
};

const locallyDefined = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/(?:function|const|let|var|class)\s+([A-Z][A-Za-z0-9_$]*)/g)) {
    names.add(m[1]);
  }
  // Destructured aliases — the dominant antd pattern in this codebase:
  //   const { Text, Title } = Typography;
  //   const { Sider, Header, Content } = Layout;
  //   const { TextArea } = Input;
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t) continue;
      // `a: b` renames b to a; `a` keeps its name.
      const [orig, renamed] = t.split(':').map((s) => s.trim());
      names.add(renamed || orig);
    }
  }
  return names;
};

let failures = 0;
let checked = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (SKIP.has(file)) continue;
    const src = readFileSync(file, 'utf8');
    const used = jsxTags(src);
    if (!used.size) continue;
    checked++;

    const have = importedNames(src);
    locallyDefined(src).forEach((n) => have.add(n));
    AMBIENT.forEach((n) => have.add(n));

    const missing = [...used].filter((t) => !have.has(t)).sort();
    if (missing.length) {
      failures++;
      console.log(`${relative('.', file)}`);
      for (const m of missing) console.log(`    <${m}>  — used but not imported`);
    }
  }
}

if (failures === 0) {
  console.log(`check-jsx-imports: ok (${checked} files, every JSX tag resolved)`);
  process.exit(0);
}
console.log(`\ncheck-jsx-imports: ${failures} file(s) reference a component that is not imported.`);
console.log('These bundle fine and only fail at runtime, when the chunk loads.');
process.exit(1);

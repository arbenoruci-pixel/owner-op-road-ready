import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['source', 'lib', 'app', 'components', 'scripts'];
const NEEDLES = [
  'Change saved',
  '>Undo<',
  "'Undo'",
  '"Undo"',
  'undoToast',
  'undoState',
  'setUndo',
  'onUndo',
  'snackbar',
  'toast',
];
const EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx', '.css']);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const matches = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const found = NEEDLES.filter(needle => line.includes(needle));
      if (found.length) matches.push({ file, line:index + 1, found, text:line.trim().slice(0, 500) });
    });
  }
}

console.log('UNDO_DIAGNOSTIC_BEGIN');
for (const match of matches) {
  console.log(`${match.file}:${match.line} [${match.found.join(', ')}] ${match.text}`);
}
console.log(`UNDO_DIAGNOSTIC_COUNT=${matches.length}`);
console.log('UNDO_DIAGNOSTIC_END');

const appPath = 'source/src/app/App.jsx';
const appLines = fs.readFileSync(appPath, 'utf8').split(/\r?\n/);
console.log('STARTUP_EFFECT_DIAGNOSTIC_BEGIN');
for (let i = 0; i < appLines.length; i += 1) {
  if (!/\b(?:React\.)?useEffect\s*\(\s*\(\)\s*=>\s*\{/.test(appLines[i])) continue;
  const block = [];
  let depth = 0;
  let started = false;
  for (let j = i; j < Math.min(appLines.length, i + 120); j += 1) {
    const line = appLines[j];
    block.push(`${j + 1}: ${line.trim()}`);
    for (const ch of line) {
      if (ch === '{') { depth += 1; started = true; }
      else if (ch === '}') depth -= 1;
    }
    if (started && depth <= 0 && /\}\s*,\s*\[/.test(line)) break;
  }
  const joined = block.join(' ');
  if (/setState\s*\(|normalizeState\s*\(|reconcile|repair|restore|saveAppSnapshot/.test(joined)) {
    console.log(`EFFECT_AT_${i + 1} ${joined.slice(0, 6000)}`);
  }
}
console.log('STARTUP_EFFECT_DIAGNOSTIC_END');

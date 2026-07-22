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

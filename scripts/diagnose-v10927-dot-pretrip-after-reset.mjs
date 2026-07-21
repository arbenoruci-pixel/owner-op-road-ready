import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.git', '.next', 'node_modules', '.vercel']);
const patterns = [
  /Pre-trip review after 10h\+ rest/i,
  /10h\+ rest/i,
  /continuous OFF\/SB/i,
  /pretrip.*reset/i,
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

let matches = 0;
for (const file of walk(ROOT)) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (!patterns.some(pattern => pattern.test(line))) return;
    matches += 1;
    const start = Math.max(0, index - 45);
    const end = Math.min(lines.length, index + 70);
    console.log(`\n===== DOT RESET MATCH ${matches}: ${path.relative(ROOT, file)}:${index + 1} =====`);
    for (let i = start; i < end; i += 1) {
      console.log(`${String(i + 1).padStart(4, '0')}: ${lines[i]}`);
    }
  });
}

console.log(`\nDIAGNOSTIC v109.2.7 matches=${matches}`);
throw new Error('DIAGNOSTIC_STOP_v10927_DOT_PRETRIP_AFTER_RESET');

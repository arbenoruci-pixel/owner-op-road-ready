import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'source/src/modules/editor/EditEventSheet.jsx');

if (!fs.existsSync(TARGET)) {
  throw new Error(`DIAGNOSTIC: generated editor not found at ${TARGET}`);
}

const text = fs.readFileSync(TARGET, 'utf8');
const lines = text.split(/\r?\n/);
const needles = [
  'Edit Duty Status',
  'select one or more',
  'Pre-trip inspection',
  'Delivery / Unloading',
  'selectedReasons',
  'selectedActivities',
  'function save',
  'const save',
  'handleSave',
  'onSave(',
  'onSave?.(',
];

const hitLines = new Set();
for (let i = 0; i < lines.length; i += 1) {
  if (needles.some(needle => lines[i].includes(needle))) hitLines.add(i);
}

const ranges = [];
for (const hit of [...hitLines].sort((a, b) => a - b)) {
  const start = Math.max(0, hit - 28);
  const end = Math.min(lines.length - 1, hit + 45);
  const last = ranges.at(-1);
  if (last && start <= last.end + 1) last.end = Math.max(last.end, end);
  else ranges.push({ start, end });
}

console.log(`DIAGNOSTIC EditEventSheet length=${lines.length} lines, matches=${hitLines.size}`);
if (!ranges.length) {
  console.log(text.slice(0, 16000));
} else {
  for (const range of ranges.slice(0, 8)) {
    console.log(`\n----- EDIT DUTY SOURCE LINES ${range.start + 1}-${range.end + 1} -----`);
    for (let i = range.start; i <= range.end; i += 1) {
      console.log(`${String(i + 1).padStart(4, '0')}: ${lines[i]}`);
    }
  }
}

throw new Error('DIAGNOSTIC_STOP_v10925_EDIT_DUTY_SAVE');

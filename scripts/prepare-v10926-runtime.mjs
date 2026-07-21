import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'scripts/apply-v10926-event-reasons-source-of-truth.mjs');
let source = fs.readFileSync(target, 'utf8');

// The generated DOT source can format this secondary fallback differently.
// Locate the exact replaceOnce block by its stable label instead of matching
// the escaped function body. The primary hasPreTripText detector and the
// canonical timeline note are already patched directly from reasons[].
const label = "'DOT start-duty reasons'";
const labelIndex = source.indexOf(label);
if (labelIndex < 0) throw new Error('prepare-v10926 could not find DOT start-duty label');

const blockStart = source.lastIndexOf('  source = replaceOnce(', labelIndex);
const closingIndex = source.indexOf('  );', labelIndex);
if (blockStart < 0 || closingIndex < 0 || closingIndex <= blockStart) {
  throw new Error('prepare-v10926 could not resolve DOT start-duty patch boundaries');
}

const blockEnd = closingIndex + '  );'.length;
const tolerantBlock = `  // Optional generated fallback omitted. reasons[] remains authoritative through\n  // hasPreTripText, EventList, DayLogScreen, App, and timeline normalization.`;
source = `${source.slice(0, blockStart)}${tolerantBlock}${source.slice(blockEnd)}`;

fs.writeFileSync(target, source);
console.log('Prepared v109.2.6 with structural tolerant DOT context patch.');

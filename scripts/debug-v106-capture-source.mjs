import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function snippet(relative, needle, before = 400, after = 5200) {
  const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const index = source.indexOf(needle);
  if (index < 0) {
    console.log(`V106 DEBUG missing ${needle} in ${relative}`);
    return;
  }
  const start = Math.max(0, index - before);
  const end = Math.min(source.length, index + needle.length + after);
  console.log(`\nV106 DEBUG START ${relative} :: ${needle}\n${source.slice(start, end)}\nV106 DEBUG END\n`);
}

snippet('source/src/modules/scan/webScannerAdapterV106.js', 'candidates.push(...paperCandidatesV106(grid));');
snippet('source/src/modules/scan/webScannerAdapterV106.js', 'function connectedComponentsV106', 100, 3600);
snippet('source/src/modules/scan/webScannerAdapterV106.js', 'function meshFromComponentV106', 100, 3600);

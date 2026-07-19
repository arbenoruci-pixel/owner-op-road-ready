import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'source/src/modules/scan/SmartDocumentCaptureV106.jsx'), 'utf8');
function snippet(needle, radius = 3200) {
  const index = source.indexOf(needle);
  if (index < 0) { console.log(`V106 LIVE DEBUG missing ${needle}`); return; }
  console.log(`\nV106 LIVE DEBUG START ${needle}\n${source.slice(Math.max(0,index-radius), Math.min(source.length,index+needle.length+radius))}\nV106 LIVE DEBUG END\n`);
}
for (const needle of [
  'function capturePage()',
  'async function capturePage()',
  'function openSource(',
  'const frameFound',
  'setLiveCandidate(strongest)',
  'liveCandidate',
  'processSelection(',
]) snippet(needle);

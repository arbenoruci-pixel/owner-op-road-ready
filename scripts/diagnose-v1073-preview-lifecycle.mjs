import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relative = 'source/src/modules/scan/SmartDocumentCaptureV106.jsx';
const lines = fs.readFileSync(path.join(root, relative), 'utf8').split(/\r?\n/);
console.log('=== PREVIEW LIFECYCLE ===');
for (let i = 179; i < Math.min(lines.length, 250); i += 1) {
  console.log(String(i + 1) + ': ' + lines[i].slice(0, 700));
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relative = 'source/src/modules/scan/SmartDocumentCaptureV106.jsx';
const lines = fs.readFileSync(path.join(root, relative), 'utf8').split(/\r?\n/);
const matches = [];
lines.forEach((line, index) => {
  if (line.includes('setPreviewUrls') || line.includes('fileUrl(') || line.includes('previewUrls.')) matches.push(index);
});
console.log('=== PREVIEW URL MUTATIONS ===');
const printed = new Set();
for (const match of matches) {
  for (let index = Math.max(0, match - 12); index <= Math.min(lines.length - 1, match + 12); index += 1) {
    if (printed.has(index)) continue;
    printed.add(index);
    console.log(String(index + 1) + ': ' + lines[index].slice(0, 700));
  }
  console.log('---');
}

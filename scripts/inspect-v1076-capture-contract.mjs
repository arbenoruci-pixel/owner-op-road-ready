import fs from 'node:fs';
const source = fs.readFileSync('source/src/modules/scan/SmartDocumentCaptureV106.jsx', 'utf8');
const start = source.indexOf('onComplete');
let end = start;
let depth = 0;
let seen = false;
for (let i = start; i < source.length; i += 1) {
  const char = source[i];
  if (char === '(') { depth += 1; seen = true; }
  if (char === ')') depth -= 1;
  if (seen && depth === 0 && char === ';') { end = i + 1; break; }
}
console.log('V1076_ONCOMPLETE_EXACT=' + source.slice(start, end).replace(/\s+/g, ' '));
const openSource = source.indexOf('async function openSource');
console.log('V1076_OPEN_SOURCE=' + source.slice(openSource, openSource + 3600).replace(/\s+/g, ' '));

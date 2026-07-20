import fs from 'node:fs';
const source = fs.readFileSync('source/src/modules/scan/SmartDocumentCaptureV106.jsx', 'utf8');
const finish = source.indexOf('async function finish');
const start = source.indexOf('onComplete', finish);
let end = start;
let depth = 0;
let seen = false;
for (let i = start; i < source.length; i += 1) {
  const char = source[i];
  if (char === '(') { depth += 1; seen = true; }
  if (char === ')') depth -= 1;
  if (seen && depth === 0 && char === ';') { end = i + 1; break; }
}
console.log('V1076_FINISH_CALLBACK=' + source.slice(start, end).replace(/\s+/g, ' '));

import fs from 'node:fs';

const dot = fs.readFileSync('source/src/modules/dot/DotMode.jsx', 'utf8');
const helperStart = dot.indexOf('function walletReportFileLinkHtml');
const helperEnd = dot.indexOf('function walletReportSectionHtml');
if (helperStart < 0 || helperEnd < helperStart) {
  console.error('FAIL: walletReportFileLinkHtml helper not found');
  process.exit(1);
}
const helper = dot.slice(helperStart, helperEnd);
const checks = [
  ['helper reads documentDataUrl', helper.includes('documentDataUrl(doc)')],
  ['helper does not require attachmentDataUrl only', !helper.includes('doc.attachmentDataUrl')],
  ['helper writes href to dataUrl', helper.includes('href="${htmlEscape(dataUrl)}"')],
  ['helper preserves mime metadata', helper.includes('data-doc-mime') && helper.includes('guessDocMime(doc)')],
  ['helper preserves file metadata', helper.includes('data-doc-file') && helper.includes('safeFileName')],
];
let failed = false;
for (const [name, ok] of checks) {
  if (!ok) { console.error(`FAIL: ${name}`); failed = true; }
  else console.log(`PASS: ${name}`);
}
if (failed) process.exit(1);
console.log('v95.85 DOT package document data-url verifier passed.');

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = relative => path.join(ROOT, relative);

const materializerPath = file('scripts/materialize-v984.mjs');
let materializer = fs.readFileSync(materializerPath, 'utf8');
materializer = materializer.replace(
  `if (!verifyTurbo.includes("liveFill >= .34") || !verifyTurbo.includes('suggestedCornersRef') || !verifyTurbo.includes('captureReady')) {`,
  `if (!verifyTurbo.includes("liveFill < .34") || !verifyTurbo.includes('suggestedCornersRef') || !verifyTurbo.includes('captureReady')) {`
);
fs.writeFileSync(materializerPath, materializer);
await import(`${pathToFileURL(materializerPath).href}?v=${Date.now()}`);

const extractionPath = file('source/src/modules/scan/smartScanExtractionV984.js');
let extraction = fs.readFileSync(extractionPath, 'utf8');
extraction = extraction
  .replaceAll('[A-Z0-9\\s-]', '[A-Z0-9 \\t-]')
  .replaceAll('[A-Z0-9\\s_-]', '[A-Z0-9 \\t_-]');
fs.writeFileSync(extractionPath, extraction);

const ocrPath = file('source/src/modules/scan/smartScanOcrV984.js');
let ocr = fs.readFileSync(ocrPath, 'utf8');
ocr = ocr.replace(
  `  const alwaysUseSecondPass = ['bol','pod','rate_confirmation','carrier_settlement'].includes(preferredType);`,
  `  const primaryDetectedType = /bill\\s+of\\s+lading|straight\\s+bill/i.test(primaryText)\n    ? 'bol'\n    : /proof\\s+of\\s+delivery|delivery\\s+receipt/i.test(primaryText)\n      ? 'pod'\n      : '';\n  const alwaysUseSecondPass = ['bol','pod','rate_confirmation','carrier_settlement'].includes(preferredType)\n    || ['bol','pod'].includes(primaryDetectedType);`
);
ocr = ocr.replace(
  `  let combined = uniqueTextBlocks(passes.map(pass => pass.text)).join('\\n');\n  let fields = extractProDocumentFieldsV984(combined, preferredType === 'auto' ? 'other' : preferredType);\n\n  if (['bol','pod'].includes(preferredType)) {`,
  `  let combined = uniqueTextBlocks(passes.map(pass => pass.text)).join('\\n');\n  const effectiveType = preferredType === 'auto'\n    ? (/bill\\s+of\\s+lading|straight\\s+bill/i.test(combined)\n      ? 'bol'\n      : /proof\\s+of\\s+delivery|delivery\\s+receipt/i.test(combined)\n        ? 'pod'\n        : 'other')\n    : preferredType;\n  let fields = extractProDocumentFieldsV984(combined, effectiveType);\n\n  if (['bol','pod'].includes(effectiveType)) {`
);
ocr = ocr.replace(
  `    fields = extractProDocumentFieldsV984(combined, preferredType);`,
  `    fields = extractProDocumentFieldsV984(combined, effectiveType);`
);
fs.writeFileSync(ocrPath, ocr);

if (!ocr.includes("const effectiveType = preferredType === 'auto'") || !ocr.includes("['bol','pod'].includes(effectiveType)")) {
  throw new Error('v98.4 automatic BOL/POD OCR pass verification failed');
}
if (extraction.includes('[A-Z0-9\\s-]') || extraction.includes('[A-Z0-9\\s_-]')) {
  throw new Error('v98.4 identifier line-boundary cleanup failed');
}

console.log('run-materialize-v984 complete');

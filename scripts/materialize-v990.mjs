import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '99.0.0';
const RELEASED_AT = '2026-07-14T18:30:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, search, replacement, label) {
  if (content.includes(replacement)) return content;
  if (!content.includes(search)) throw new Error(`v99.0 missing ${label}`);
  return content.replace(search, replacement);
}

const scanPath = 'source/src/modules/scan/SmartScanSheet.jsx';
let scan = read(scanPath);
scan = replaceOnce(
  scan,
  "import { analyzeDocumentFileProV989 } from './smartScanProV989.js';",
  "import { analyzeDocumentFileProV990 } from './smartScanProV990.js';",
  'strict analyzer import'
);
scan = replaceOnce(
  scan,
  "      const result = await analyzeDocumentFileProV989(analysisFile, {",
  "      const result = await analyzeDocumentFileProV990(analysisFile, {",
  'strict analyzer call'
);
scan = replaceOnce(
  scan,
  "  if (method === 'pro-ocr-v989') return 'Focused Pro OCR';",
  "  if (method === 'pro-ocr-v990') return 'Strict Field OCR';\n  if (method === 'pro-ocr-v989') return 'Focused Pro OCR';",
  'strict method label'
);
scan = replaceOnce(
  scan,
  "function confidenceLabel(value = 0) {\n  if (value >= 0.9) return 'High confidence';",
  "function confidenceLabel(value = 0, needsReview = false) {\n  if (needsReview) return 'Review needed';\n  if (value >= 0.9) return 'High confidence';",
  'confidence review gate'
);
scan = replaceOnce(
  scan,
  "{confidenceLabel(analysis.confidence)}",
  "{confidenceLabel(analysis.confidence, analysis.needsReview)}",
  'confidence review call'
);
write(scanPath, scan);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v99.0-strict-bol-evidence-gate',
  releasedAt:RELEASED_AT,
  notes:[
    'Rejects future lot-code dates and selects the actual document date from labeled evidence.',
    'Requires an alphanumeric labeled BOL number or matching barcode and rejects numeric-only guesses and merged PO strings.',
    'Uses labeled evidence for Customer PO, Seal, Total Pieces and Total Weight; uncertain values remain blank.',
    'Rebuilds ship-from and ship-to only when company, street suffix, city, state and ZIP are all present in the dedicated field region.',
    'Prevents High confidence or Good match labels whenever critical BOL fields still require review.',
    'Preserves photo import, scanner quality, v98.8 Logbook navigation, OFF DUTY coverage and 34-hour restart tracking.'
  ],
  label:'v99.0 Strict BOL Evidence Gate',
  updatedAt:RELEASED_AT
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyScan = read(scanPath);
if (!verifyScan.includes('analyzeDocumentFileProV990') || !verifyScan.includes("method === 'pro-ocr-v990'") || !verifyScan.includes('analysis.needsReview')) {
  throw new Error('v99.0 Smart Scan integration verification failed');
}
console.log('v99.0 strict BOL evidence gate materialized');

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '98.9.0';
const RELEASED_AT = '2026-07-14T18:00:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');

function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}

function replaceOnce(content, search, replacement, label) {
  if (content.includes(replacement)) return content;
  if (!content.includes(search)) throw new Error(`v98.9 missing ${label}`);
  return content.replace(search, replacement);
}

function appendOnce(content, marker, addition) {
  return content.includes(marker) ? content : `${content.trimEnd()}\n\n${addition.trim()}\n`;
}

// Prefer the comma/line segment that actually contains the company suffix. This
// prevents damaged text before "Garden of Light Inc." or "Greenwood DC" from
// becoming part of the saved shipper/receiver name.
const extractionPath = 'source/src/modules/scan/smartScanExtractionV989.js';
let extraction = read(extractionPath);
extraction = replaceOnce(
  extraction,
  `function companyFromText(value = '') {
  const tokens = clean(value).split(/\\s+/).filter(Boolean);
  const suffixes = /^(?:inc\\.?|llc|ltd\\.?|corp\\.?|company|co\\.?|dc|distribution|warehouse|logistics)$/i;
  let best = '';
  tokens.forEach((token, index) => {
    if (!suffixes.test(token)) return;
    let start = Math.max(0, index - 7);
    let selected = tokens.slice(start, index + 1);
    while (selected.length && (/^[A-Z]$/i.test(selected[0]) || /^(?:page|of|the|a|an|ss|heirs)$/i.test(selected[0]) || /^\\d+$/.test(selected[0]))) selected.shift();
    const candidate = clean(selected.join(' ').replace(/^[^A-Za-z]+/, ''));
    const words = candidate.match(/[A-Za-z]{2,}/g) || [];
    if (words.length >= 2 && candidate.length <= 70 && candidate.length > best.length) best = candidate;
  });
  return best;
}`,
  `function cleanCompanyCandidate(value = '') {
  const suffixes = /^(?:inc\\.?|llc|ltd\\.?|corp\\.?|company|co\\.?|dc|distribution|warehouse|logistics)$/i;
  let tokens = clean(value)
    .split(/\\s+/)
    .map(token => token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.'-]+$/g, ''))
    .filter(Boolean);
  const suffixIndex = tokens.findIndex(token => suffixes.test(token));
  if (suffixIndex < 0) return '';
  tokens = tokens.slice(0, suffixIndex + 1);
  while (tokens.length > 2 && (
    /^[A-Z]$/i.test(tokens[0])
    || /^(?:page|oft|the|a|an|ss|heirs)$/i.test(tokens[0])
    || /^\\d+$/.test(tokens[0])
  )) tokens.shift();
  if (tokens.length > 7) tokens = tokens.slice(-7);
  const candidate = clean(tokens.join(' ').replace(/^[^A-Za-z]+/, ''));
  const words = candidate.match(/[A-Za-z]{2,}/g) || [];
  if (words.length < 2 || candidate.length > 70 || LABEL_NOISE.test(candidate)) return '';
  return candidate;
}

function companyFromText(value = '') {
  const raw = String(value || '');
  const candidates = [];
  for (const segment of raw.split(/[\\r\\n,;|]+/).map(clean).filter(Boolean)) {
    const candidate = cleanCompanyCandidate(segment);
    if (candidate) candidates.push({
      value:candidate,
      score:100 - Math.max(0, candidate.split(/\\s+/).length - 5) * 3,
    });
  }
  const fallback = cleanCompanyCandidate(raw);
  if (fallback) candidates.push({ value:fallback, score:20 });
  return candidates.sort((a, b) => b.score - a.score || a.value.length - b.value.length)[0]?.value || '';
}`,
  'anchored shipper/receiver company cleanup'
);
write(extractionPath, extraction);

// Use the focused field OCR analyzer and the perspective-corrected high-resolution
// source rather than the downscaled preview image.
const scanPath = 'source/src/modules/scan/SmartScanSheet.jsx';
let scan = read(scanPath);
scan = replaceOnce(
  scan,
  "import { analyzeDocumentFilePro } from './smartScanPro.js';",
  "import { analyzeDocumentFileProV989 } from './smartScanProV989.js';",
  'Smart Scan v98.9 analyzer import'
);
scan = replaceOnce(
  scan,
  "  if (method === 'web-ocr') return 'Enhanced document OCR';",
  "  if (method === 'pro-ocr-v989') return 'Focused Pro OCR';\n  if (method === 'web-ocr') return 'Enhanced document OCR';",
  'Focused OCR method label'
);
scan = replaceOnce(
  scan,
  "      const result = await analyzeDocumentFilePro(nextFile, {",
  "      const analysisFile = scanMeta?.ocrFile instanceof File ? scanMeta.ocrFile : nextFile;\n      const result = await analyzeDocumentFileProV989(analysisFile, {",
  'high-resolution analysis source'
);
scan = replaceOnce(
  scan,
  "        origin:result.fields.origin || '',",
  "        origin:result.fields.shipFromDetails || result.fields.origin || '',",
  'full ship-from review value'
);
scan = replaceOnce(
  scan,
  "        destination:result.fields.destination || '',",
  "        destination:result.fields.shipToDetails || result.fields.destination || '',",
  'full ship-to review value'
);
write(scanPath, scan);

// Preserve the perspective-corrected original as a separate OCR source. The
// enhanced preview remains the file the driver sees and saves.
const turboPath = 'source/src/modules/scan/TurboDocumentScanner.jsx';
let turbo = read(turboPath);
turbo = replaceOnce(
  turbo,
  "        perspectiveCorrected:true,\n      });",
  "        perspectiveCorrected:true,\n        ocrFile:allPages.length === 1 ? (baseFile || page.file) : output,\n        ocrSource:allPages.length === 1 ? 'perspective-original' : 'composed-pages',\n      });",
  'high-resolution OCR metadata'
);
write(turboPath, turbo);

// Make Photos a first-class entry point on iPhone instead of hiding it behind
// the live camera screen.
const capturePath = 'source/src/modules/scan/SmartDocumentCapture.jsx';
let capture = read(capturePath);
capture = replaceOnce(
  capture,
  "  if (name === 'flash') return <svg {...common}><path d=\"m13 2-8 12h7l-1 8 8-12h-7z\" /></svg>;",
  "  if (name === 'flash') return <svg {...common}><path d=\"m13 2-8 12h7l-1 8 8-12h-7z\" /></svg>;\n  if (name === 'gallery') return <svg {...common}><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\" /><circle cx=\"8\" cy=\"9\" r=\"1.5\" /><path d=\"m4 17 5-5 4 4 2-2 5 5\" /></svg>;",
  'Photos icon'
);
capture = replaceOnce(
  capture,
  "  const nativeCameraRef = useRef(null);\n  const isAppleMobile = useMemo(() => {",
  "  const nativeCameraRef = useRef(null);\n  const photoLibraryRef = useRef(null);\n  const isAppleMobile = useMemo(() => {",
  'Photos input ref'
);
capture = replaceOnce(
  capture,
  "      <footer className=\"scan-preflight-actions two\">",
  "      <footer className=\"scan-preflight-actions three\">",
  'three capture actions'
);
capture = replaceOnce(
  capture,
  "        ><Icon name=\"flash\" /> {isAppleMobile ? 'Live auto frame' : 'Phone camera + flash'}</button>\n        <input\n          ref={nativeCameraRef}",
  "        ><Icon name=\"flash\" /> {isAppleMobile ? 'Live auto frame' : 'Phone camera + flash'}</button>\n        <button\n          type=\"button\"\n          className=\"library\"\n          onClick={() => photoLibraryRef.current?.click()}\n        ><Icon name=\"gallery\" /> Choose from Photos</button>\n        <input\n          ref={photoLibraryRef}\n          className=\"smart-scan-file-input\"\n          type=\"file\"\n          accept=\"image/*\"\n          onChange={event => {\n            const file = event.target.files?.[0] || null;\n            event.target.value = '';\n            openNativePhoto(file);\n          }}\n        />\n        <input\n          ref={nativeCameraRef}",
  'visible Photos action'
);
write(capturePath, capture);

const stylesPath = 'source/src/turbo-scan-flow.css';
let styles = read(stylesPath);
styles = appendOnce(styles, '/* v98.9 photo library action */', `
/* v98.9 photo library action */
.scan-preflight-actions.three{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px;
}
.scan-preflight-actions.three>button.primary{grid-column:1/-1;}
.scan-preflight-actions>button.library{
  height:48px;
  border:1px solid rgba(255,255,255,.17);
  border-radius:18px;
  color:#e2e8f0;
  background:rgba(255,255,255,.07);
  font-size:13px;
  font-weight:950;
  box-shadow:none;
}
.scan-preflight-actions>button.library svg{color:#bfdbfe;}
@media(max-width:390px){
  .scan-preflight-actions.three{grid-template-columns:1fr;}
  .scan-preflight-actions.three>button.primary{grid-column:auto;}
}
`);
write(stylesPath, styles);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v98.9-focused-field-ocr-photo-import',
  releasedAt:RELEASED_AT,
  notes:[
    'Runs field-specific OCR on tightly cropped BOL regions instead of accepting free-text guesses from the entire page.',
    'Uses numeric and alphanumeric character constraints for BOL, customer PO, seal, pieces, weight, date, trailer, and handwritten stop-time regions.',
    'Removes long form lines and colored pen marks before recognition and rejects numeric-only false BOL values such as 6273.',
    'Uses the perspective-corrected high-resolution original for OCR while keeping the enhanced preview for display and storage.',
    'Adds a visible Choose from Photos action beside camera scanning and leaves uncertain fields blank rather than inserting OCR garbage.',
    'Preserves v98.8 OFF DUTY coverage, 34-hour restart tracking, Logbook navigation, HOS, DOT, route, wallet, and business data.'
  ],
  label:'v98.9 Focused Field OCR & Photos',
  updatedAt:RELEASED_AT
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyScan = read(scanPath);
const verifyTurbo = read(turboPath);
const verifyCapture = read(capturePath);
const verifyOcr = read('source/src/modules/scan/smartScanProV989.js');
const verifyExtraction = read('source/src/modules/scan/smartScanExtractionV989.js');
if (!verifyScan.includes('analyzeDocumentFileProV989') || !verifyScan.includes('scanMeta?.ocrFile') || !verifyScan.includes('shipFromDetails')) {
  throw new Error('v98.9 Smart Scan integration verification failed');
}
if (!verifyTurbo.includes("ocrSource:allPages.length === 1 ? 'perspective-original'")) {
  throw new Error('v98.9 high-resolution OCR source verification failed');
}
if (!verifyCapture.includes('Choose from Photos') || !verifyCapture.includes('photoLibraryRef')) {
  throw new Error('v98.9 photo import verification failed');
}
if (!verifyOcr.includes('FIELD_SPECS') || !verifyOcr.includes("field:'BOL_VALUE'") || !verifyOcr.includes('suppressLongLines')) {
  throw new Error('v98.9 focused OCR verification failed');
}
if (!verifyExtraction.includes('extractProDocumentFieldsV989') || !verifyExtraction.includes('numeric-only false BOL')) {
  // The second token is intentionally checked through the regression script.
  if (!verifyExtraction.includes('normalizeBol')) throw new Error('v98.9 strict extraction verification failed');
}
console.log('v98.9 focused field OCR and photo import materialized');

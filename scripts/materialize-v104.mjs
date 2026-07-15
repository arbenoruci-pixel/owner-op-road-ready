import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '100.4.0';
const RELEASED_AT = '2026-07-15T18:30:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v100.4 missing ${label}`);
  return content.replace(before, after);
}

const scanPath = 'source/src/modules/scan/SmartScanSheetV100.jsx';
let scan = read(scanPath);
scan = replaceOnce(
  scan,
  "import { analyzeSmartDocumentV102 } from './smartDocumentReaderV102.js';",
  "import { analyzeSmartDocumentV104, parseSmartDocumentTextByTypeV104 } from './smartDocumentReaderV104.js';",
  'v104 reader import'
);
scan = scan.replace(/analyzeSmartDocumentV102\(/g, 'analyzeSmartDocumentV104(');

const changeTypeReplacement = `  function changeType(id) {
    const meta = documentTypeMeta(id);
    const parsed = parseSmartDocumentTextByTypeV104(id, analysis?.text || '', {}, new Date());
    const parsedResult = { ...(analysis || {}), type:meta, detectedType:meta, fields:parsed };
    const parsedFields = initialFields(parsedResult, analysis?.scanMeta || {}, state);
    const evidence = Math.max(0, Math.min(1, Number(parsed.documentEvidence || 0)));
    const nextConfidence = Math.min(analysis?.nativePdfText ? .99 : .96, (analysis?.nativePdfText ? .62 : .38) + evidence * (analysis?.nativePdfText ? .36 : .58));

    setAnalysis(current => ({
      ...(current || {}),
      type:meta,
      detectedType:meta,
      fields:parsed,
      confidence:nextConfidence,
      needsReview:parsed.needsFieldReview === true || nextConfidence < .82,
      typeDecision:{
        ...(current?.typeDecision || {}),
        id,
        type:meta,
        reason:'Driver corrected the document type; fields were re-read with the matching parser.',
        manualCorrection:true,
      },
    }));
    setSelectedType(id);
    setFields(current => {
      const next = {
        ...parsedFields,
        title:meta.label,
        notes:current.notes || '',
        linkToLogbook:linkableType(id),
        linkDay:current.linkDay || parsedFields.linkDay,
        linkEventId:current.linkEventId || '',
      };
      const suggestion = suggestSmartDocumentLinkV100(state, id, next);
      setLinkSuggestion(suggestion);
      if (!current.linkDay || current.linkDay === linkSuggestion?.day) next.linkDay = suggestion.day || next.linkDay;
      if (!current.linkEventId) next.linkEventId = suggestion.eventId || '';
      return next;
    });
  }

  function scanAgain`;
const changeTypePattern = /  function changeType\(id\) \{[\s\S]*?\n  \}\n\n  function scanAgain/;
if (!scan.includes("reason:'Driver corrected the document type; fields were re-read with the matching parser.'")) {
  if (!changeTypePattern.test(scan)) throw new Error('v100.4 missing changeType function');
  scan = scan.replace(changeTypePattern, changeTypeReplacement);
}

if (!scan.includes('smart-type-decision-v104')) {
  scan = replaceOnce(
    scan,
    "<em>{methodLabel(analysis.method)} · {confidence}%</em></div>",
    "<em>{methodLabel(analysis.method)} · {confidence}%</em>{analysis.typeDecision?.autoCorrected ? <small className=\"smart-type-decision-v104\">Smart type correction: {analysis.typeDecision.reason}</small> : null}</div>",
    'type correction explanation'
  );
}
write(scanPath, scan);

const stylePath = 'source/src/turbo-scan-flow.css';
let styles = read(stylePath);
if (!styles.includes('/* v100.4 smart type correction */')) {
  styles += `\n\n/* v100.4 smart type correction */\n.smart-type-decision-v104{display:block;margin-top:7px;color:#2563eb;font-size:10px;font-weight:900;line-height:1.35;}\n`;
}
write(stylePath, styles);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v100.4-smart-document-type-arbitration',
  releasedAt:RELEASED_AT,
  notes:[
    'Fixes LoadConfirmation and Rate Confirmation PDFs being misclassified as Bills of Lading because legal pages mention BOL paperwork.',
    'Uses structural trucking evidence such as filename, Order number, Leg number, Stop Information, Load At, Deliver To, carrier fields and Total Pay.',
    'Overrides an incorrect BOL preference when the PDF has decisive Rate Confirmation evidence, while still allowing a manual type correction.',
    'Re-runs the correct field parser whenever the driver taps a different document type, so changing BOL to Rate Con immediately fills the Rate Con fields.',
    'Keeps native PDF.js extraction, multi-stop routing, Driver Mission Guide, Logbook linking, HOS, DOT and business records.'
  ],
  label:'v100.4 Smart Document Type Arbitration',
  updatedAt:RELEASED_AT
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyScan = read(scanPath);
const verifyReader = read('source/src/modules/scan/smartDocumentReaderV104.js');
const verifyArbiter = read('source/src/modules/scan/documentTypeArbiterV104.js');
if (!verifyScan.includes('analyzeSmartDocumentV104') || !verifyScan.includes('parseSmartDocumentTextByTypeV104') || !verifyScan.includes('smart-type-decision-v104')) throw new Error('v100.4 scanner integration failed');
if (!verifyReader.includes('arbitrateDocumentTypeV104') || !verifyReader.includes('parseRateConfirmationV102')) throw new Error('v100.4 reader integration failed');
if (!verifyArbiter.includes('Total\\s+Pay') || !verifyArbiter.includes('first page is an actual BOL title')) throw new Error('v100.4 type arbitration failed');
console.log('v100.4 Smart Document Type Arbitration materialized');
await import('./verify-smart-document-type-v104.mjs');
await import('./materialize-v105.mjs');

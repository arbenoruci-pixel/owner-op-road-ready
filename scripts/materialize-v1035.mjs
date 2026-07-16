import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '103.5.0';
const RELEASED_AT = '2026-07-16T16:30:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v103.5 missing ${label}`);
  return content.replace(before, after);
}
function replacePattern(content, pattern, replacement, label, marker = '') {
  if (marker && content.includes(marker)) return content;
  if (!pattern.test(content)) throw new Error(`v103.5 missing ${label}`);
  return content.replace(pattern, replacement);
}
function appendOnce(content, marker, addition) {
  return content.includes(marker) ? content : `${content.trimEnd()}\n\n${addition.trim()}\n`;
}

const sheetPath = 'source/src/modules/scan/SmartScanSheetV100.jsx';
let sheet = read(sheetPath);
if (!sheet.includes("from './smartPodMatchV1035.js'")) {
  sheet = replaceOnce(
    sheet,
    "import { dispatchSmartDocumentLinkV100, suggestSmartDocumentLinkV100 } from './smartDocumentLinkV100.js';",
    "import { dispatchSmartDocumentLinkV100, suggestSmartDocumentLinkV100 } from './smartDocumentLinkV100.js';\nimport { applySmartPodMatchV1035, applySmartPodSuggestionV1035, matchSmartPodToLoadV1035, podBillingPatchV1035 } from './smartPodMatchV1035.js';",
    'POD match import'
  );
}

sheet = replacePattern(
  sheet,
  /      const baseFields = initialFields\(result, scanMeta, state\);\n      const suggestion = suggestSmartDocumentLinkV100\(state, nextType, baseFields\);\n      baseFields\.linkDay = suggestion\.day \|\| baseFields\.linkDay;\n      baseFields\.linkEventId = suggestion\.eventId \|\| '';\n      setAnalysis\(\{ \.\.\.result, scanMeta \}\);\n      setSelectedType\(nextType\);\n      setFields\(baseFields\);\n      setLinkSuggestion\(suggestion\);/,
  `      const baseFields = initialFields(result, scanMeta, state);
      const podMatchV1035 = matchSmartPodToLoadV1035(state, nextType, baseFields, result);
      const matchedFieldsV1035 = applySmartPodMatchV1035(baseFields, podMatchV1035);
      const rawSuggestionV1035 = suggestSmartDocumentLinkV100(state, nextType, matchedFieldsV1035);
      const suggestion = applySmartPodSuggestionV1035(rawSuggestionV1035, podMatchV1035);
      matchedFieldsV1035.linkDay = suggestion.day || matchedFieldsV1035.linkDay;
      matchedFieldsV1035.linkEventId = suggestion.eventId || matchedFieldsV1035.linkEventId || '';
      setAnalysis({ ...result, scanMeta, podLoadMatchV1035:podMatchV1035 });
      setSelectedType(nextType);
      setFields(matchedFieldsV1035);
      setLinkSuggestion(suggestion);`,
  'POD match after OCR',
  'podLoadMatchV1035:podMatchV1035'
);

sheet = replacePattern(
  sheet,
  /    setFields\(current => \{\n      const next = \{([\s\S]*?)\n      \};\n      const suggestion = suggestSmartDocumentLinkV100\(state, id, next\);\n      setLinkSuggestion\(suggestion\);/,
  `    setFields(current => {
      let next = {$1
      };
      const podMatchV1035 = matchSmartPodToLoadV1035(state, id, next, analysis || {});
      next = applySmartPodMatchV1035(next, podMatchV1035);
      const suggestion = applySmartPodSuggestionV1035(suggestSmartDocumentLinkV100(state, id, next), podMatchV1035);
      setLinkSuggestion(suggestion);`,
  'POD match after manual type correction',
  'matchSmartPodToLoadV1035(state, id, next'
);

if (!sheet.includes('const podMatchPreviewV1035')) {
  const anchor = sheet.includes('const automationVerifiedV107')
    ? /  const automationVerifiedV107 = ([^;]+);/
    : /  const selectedMeta = useMemo\(([^\n]+)\);/;
  sheet = replacePattern(
    sheet,
    anchor,
    match => `${match}\n  const podMatchPreviewV1035 = selectedType === 'pod' ? matchSmartPodToLoadV1035(state, selectedType, fields, analysis || {}) : null;`,
    'POD match preview'
  );
}

if (!sheet.includes('smart-pod-match-v1035')) {
  sheet = replaceOnce(
    sheet,
    '        <section className="smart-scan-fields-card"><div className="smart-scan-section-title"><span>Review details</span><em>Confirm before save</em></div><div className="smart-scan-form-grid">',
    `        {selectedType === 'pod' && podMatchPreviewV1035?.matched && <section className="smart-pod-match-v1035">
          <div><b>Load matched automatically</b><span>{podMatchPreviewV1035.loadNo}</span></div>
          <p>{podMatchPreviewV1035.loadOnly ? podMatchPreviewV1035.reason : [podMatchPreviewV1035.stopSequence ? 'Stop ' + podMatchPreviewV1035.stopSequence + ' of ' + podMatchPreviewV1035.stopCount : '', podMatchPreviewV1035.stopPo ? 'PO ' + podMatchPreviewV1035.stopPo : '', podMatchPreviewV1035.linkDay ? 'Log day ' + podMatchPreviewV1035.linkDay : ''].filter(Boolean).join(' · ')}</p>
          <small>{podMatchPreviewV1035.reason}</small>
        </section>}

        <section className="smart-scan-fields-card"><div className="smart-scan-section-title"><span>Review details</span><em>Confirm before save</em></div><div className="smart-scan-form-grid">`,
    'POD match review card'
  );
}

sheet = sheet.replaceAll('podBillingPatchV1031({', 'podBillingPatchV1035({');
sheet = sheet.replace(
  `          podDocumentId:stored.localDocument.local_id,
        });`,
  `          podDocumentId:stored.localDocument.local_id,
          fields,
        });`
);
write(sheetPath, sheet);

const linkPath = 'source/src/modules/scan/smartDocumentLinkV100.js';
let link = read(linkPath);
link = link.replace(
  `      const exactRef = loadNo && refsFromObject(leg).includes(ref(loadNo));
      if (!exactEvent && !exactRef) return leg;`,
  `      const exactRef = !eventId && loadNo && refsFromObject(leg).includes(ref(loadNo));
      if (!exactEvent && !exactRef) return leg;`
);
write(linkPath, link);

const cssPath = 'source/src/command-center.css';
let css = read(cssPath);
css = appendOnce(css, '/* v103.5 POD load match */', `
/* v103.5 POD load match */
.smart-pod-match-v1035{
  margin:0 0 14px;
  padding:13px 14px;
  border:1px solid #86efac;
  border-radius:16px;
  background:#f0fdf4;
  color:#172033;
}
.smart-pod-match-v1035>div{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.smart-pod-match-v1035 b{font-size:14px;font-weight:950;}
.smart-pod-match-v1035 span{padding:5px 9px;border-radius:999px;background:#16a34a;color:#fff;font-size:13px;font-weight:950;}
.smart-pod-match-v1035 p{margin:8px 0 4px;font-size:12px;font-weight:900;color:#166534;}
.smart-pod-match-v1035 small{display:block;font-size:11px;font-weight:750;color:#475569;line-height:1.35;}
`);
write(cssPath, css);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) {
  lock.packages[''].version = VERSION;
  lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
}
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v103.5-pod-load-stop-autofill',
  releasedAt:RELEASED_AT,
  notes:[
    'Automatically fills a POD Load number from the active Rate Confirmation when the document matches a receiver stop.',
    'Matches PODs using load/order/leg references, stop PO, receiver city/company, OCR text and an existing delivery event.',
    'Links a POD to the actual delivery log day instead of blindly using the document issue date.',
    'Keeps low-confidence OCR review confirmation while eliminating unnecessary manual Load-number entry.',
    'Attaches a stop POD only to its exact delivery event and route stop, not every leg sharing the same load number.',
    'Keeps intermediate multi-stop PODs in progress and opens Billing/Factoring only after the final-stop POD.'
  ],
  label:'v103.5 POD Load & Stop Match',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const checks = [
  [sheetPath,'podLoadMatchV1035:podMatchV1035'],
  [sheetPath,'smart-pod-match-v1035'],
  [sheetPath,'podBillingPatchV1035'],
  [linkPath,'const exactRef = !eventId'],
  ['source/src/modules/scan/smartPodMatchV1035.js','pod_ratecon_stop_v1035'],
];
for (const [relative, marker] of checks) if (!read(relative).includes(marker)) throw new Error(`v103.5 verification missing ${marker} in ${relative}`);
console.log('v103.5 POD load and stop match materialized');
await import('./verify-pod-load-match-v1035.mjs');

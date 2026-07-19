import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '105.0.0';
const RELEASED_AT = '2026-07-19T06:00:01.000Z';
const file = p => path.join(ROOT, p);
const read = p => fs.readFileSync(file(p), 'utf8');
const write = (p, value) => { fs.mkdirSync(path.dirname(file(p)), { recursive:true }); fs.writeFileSync(file(p), value); };
function r(value, before, after, label) {
  if (value.includes(after)) return value;
  if (!value.includes(before)) throw new Error(`v105 missing ${label}`);
  return value.replace(before, after);
}
function rx(value, pattern, after, marker, label) {
  if (marker && value.includes(marker)) return value;
  if (!pattern.test(value)) throw new Error(`v105 missing ${label}`);
  return value.replace(pattern, after);
}
const append = (value, marker, addition) => value.includes(marker) ? value : `${value.trimEnd()}\n\n${addition.trim()}\n`;

write('source/src/modules/scan/SmartScanSheet.jsx', "export { default } from './SmartScanSheetV105.jsx';\n");
let scan = read('source/src/modules/scan/SmartScanSheetV105.jsx');
scan = r(scan,
  "export default function SmartScanSheetV105({ state, profile = {}, onClose, onOpenBusiness }) {",
  "export default function SmartScanSheetV105({ state, profile = {}, onClose, onOpenBusiness, initialPreferredType = 'auto' }) {",
  'scanner preferred type prop');
scan = r(scan,
  "  async function chooseFile(nextFile, preferredType = 'auto', scanMeta = {}) {\n    if (!nextFile) return;",
  "  async function chooseFile(nextFile, preferredType = 'auto', scanMeta = {}) {\n    if (!nextFile) return;\n    const requestedType = preferredType !== 'auto' ? preferredType : (initialPreferredType || 'auto');",
  'scanner requested type');
scan = scan.replace("        preferredType,\n        scanMeta,", "        preferredType:requestedType,\n        scanMeta,")
  .replace("      const fallbackType = preferredType !== 'auto' ? preferredType : 'other';", "      const fallbackType = requestedType !== 'auto' ? requestedType : 'other';");
write('source/src/modules/scan/SmartScanSheetV105.jsx', scan);

let vault = read('source/src/modules/documents/DocumentVaultV105.jsx');
vault = r(vault,
  "import { documentTypeMeta, SMART_DOCUMENT_TYPES } from '../scan/smartScan.js';",
  "import { TRUCK_DOCUMENT_TYPES_V1040 as SMART_DOCUMENT_TYPES, truckDocumentTypeMetaV1040 as documentTypeMeta } from '../scan/truckDocumentCatalogV1040.js';",
  'Vault trucking catalog');
write('source/src/modules/documents/DocumentVaultV105.jsx', vault);

// Non-load receipts may be linked to a load after explicit evidence or driver
// confirmation. A shared date/location alone must never preselect a load.
const foundationPath = 'source/src/modules/documents/documentFoundationV105.js';
let foundation = read(foundationPath);
foundation = r(foundation,
  "  let chosen = top;\n  if ((!chosen || chosen.matchScore < 24) && active && loadLike) {",
  "  let chosen = top;\n  if (!loadLike && chosen && !chosen.strongReference) chosen = null;\n  if ((!chosen || chosen.matchScore < 24) && active && loadLike) {",
  'non-load document match guard');
write(foundationPath, foundation);

const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
app = r(app,
  "import { applyDayBackupToState } from '../core/backup/dayTransfer.js';",
  "import { applyDayBackupToState } from '../core/backup/dayTransfer.js';\nimport { applyVaultDocumentCommitV105, repairRoadReadyFoundationV105, ROAD_READY_DOCUMENT_COMMIT_EVENT_V105 } from '../modules/documents/documentFoundationV105.js';",
  'App document foundation import');
app = r(app,
  "  return reconcileCertificationStatusesV1032(repairMultiStopProgressStateV1043(repairMultiStopDeliveryStateV1034(inspectionNormalized, { source:'normalize_v1034' }), { source:'normalize_v1043' }));",
  "  return reconcileCertificationStatusesV1032(repairRoadReadyFoundationV105(repairMultiStopProgressStateV1043(repairMultiStopDeliveryStateV1034(inspectionNormalized, { source:'normalize_v1034' }), { source:'normalize_v1043' }), { source:'normalize_v105' }));",
  'canonical state normalization');
app = app.replaceAll(
  "return markRecert(repairMultiStopProgressStateV1043(repairMultiStopDeliveryStateV1034(next, { source:'state_write_v1034' }), { source:'state_write_v1043' }));",
  "return markRecert(repairRoadReadyFoundationV105(repairMultiStopProgressStateV1043(repairMultiStopDeliveryStateV1034(next, { source:'state_write_v1034' }), { source:'state_write_v1043' }), { source:'state_write_v105' }));");
app = rx(app,
  /(  React\.useEffect\(\(\) => \{\n    function onSmartDocumentLink\(event\) \{[\s\S]*?\n  \}, \[\]\);)/,
  `$1\n\n  React.useEffect(() => {\n    function onVaultDocumentCommit(event) {\n      const payload = event?.detail;\n      if (!payload) return;\n      setState(current => repairRoadReadyFoundationV105(applyVaultDocumentCommitV105(current, payload), { source:'document_commit_v105' }));\n    }\n    window.addEventListener(ROAD_READY_DOCUMENT_COMMIT_EVENT_V105, onVaultDocumentCommit);\n    return () => window.removeEventListener(ROAD_READY_DOCUMENT_COMMIT_EVENT_V105, onVaultDocumentCommit);\n  }, []);`,
  'onVaultDocumentCommit', 'Vault document listener');
write(appPath, app);

const homePath = 'source/src/modules/home/HomeScreen.jsx';
let home = read(homePath);
home = r(home,
  "import SmartScanSheet from '../scan/SmartScanSheet.jsx';",
  "import SmartScanSheet from '../scan/SmartScanSheet.jsx';\nimport DocumentVaultV105 from '../documents/DocumentVaultV105.jsx';\nimport { loadDocumentSummaryV105, migrateBusinessStoreV105 } from '../documents/documentFoundationV105.js';",
  'Home Vault imports');
home = r(home,
  "  const [scanOpen, setScanOpen] = useState(false);",
  "  const [scanOpen, setScanOpen] = useState(false);\n  const [scanPreferredType, setScanPreferredType] = useState('auto');",
  'Home preferred scan state');
home = r(home,
  "        onClose={() => setScanOpen(false)}\n        onOpenBusiness={section => { setScanOpen(false); setBusinessSection(section); }}",
  "        initialPreferredType={scanPreferredType}\n        onClose={() => { setScanOpen(false); setScanPreferredType('auto'); }}\n        onOpenBusiness={section => { setScanOpen(false); setScanPreferredType('auto'); setBusinessSection(section); }}",
  'Home scanner props');
home = r(home,
  "  if (businessSection === 'settlements') {",
  "  if (businessSection === 'documents') {\n    return <DocumentVaultV105 state={state} onBack={() => setBusinessSection('')} onScan={() => { setScanPreferredType('auto'); setScanOpen(true); }} />;\n  }\n\n  if (businessSection === 'settlements') {",
  'Home documents route');
home = r(home,
  "  const activeLoad = useMemo(() => activeGuideLoadSummaryV105(state, businessStore) || activeLoadSummary(state, businessStore), [state, businessStore]);",
  "  const activeLoadCore = useMemo(() => activeGuideLoadSummaryV105(state, businessStore) || activeLoadSummary(state, businessStore), [state, businessStore]);\n  const activeLoad = useMemo(() => {\n    if (!activeLoadCore) return null;\n    const vaultStore = migrateBusinessStoreV105(businessStore, state);\n    const documentSummary = loadDocumentSummaryV105(vaultStore, activeLoadCore.loadNo);\n    return { ...activeLoadCore, docs:documentSummary.documents, documentSummary };\n  }, [activeLoadCore, businessStore, state]);",
  'Home central document checklist');
home = home.replace("onOpenScan={() => setScanOpen(true)}", "onOpenScan={type => { setScanPreferredType(type || 'auto'); setScanOpen(true); }}")
  .replace("<button type=\"button\" className=\"command-scan-btn\" onClick={() => setScanOpen(true)}>", "<button type=\"button\" className=\"command-scan-btn\" onClick={() => { setScanPreferredType('auto'); setScanOpen(true); }}>");
home = r(home,
  "  const moduleCards = [\n    { id:'logbook',",
  "  const moduleCards = [\n    { id:'documents', icon:'receipt', title:'Documents', detail:'Vault · load folders · needs review', metric:String(business.documentCount || 0), tone:'indigo', onClick:() => setBusinessSection('documents') },\n    { id:'logbook',",
  'Home Documents module card');
write(homePath, home);

const adaptivePath = 'source/src/modules/home/AdaptiveHomeV1038.jsx';
let adaptive = read(adaptivePath);
adaptive = adaptive.replace(
  "{activeLoad?.docs?.length === 0 ? <button type=\"button\" className=\"adaptive-alert-v1038\" onClick={onScan}",
  "{!activeLoad?.documentSummary?.bolPresent ? <button type=\"button\" className=\"adaptive-alert-v1038\" onClick={() => onScan?.('bol')}");
adaptive = r(adaptive,
  "        <Quick title=\"Scan paperwork\" detail=\"BOL · POD · receipt\" onClick={onScan}/>\n        <Quick title=\"Billing\" detail={activeLoad?.gross ? money(activeLoad.gross) : 'Load folder'} onClick={() => onSection('billing')}/>",
  "        <Quick title=\"Scan paperwork\" detail=\"BOL · POD · receipt\" onClick={onScan}/>\n        <Quick title=\"Documents\" detail=\"Load folder · Vault\" onClick={() => onSection('documents')}/>\n        <Quick title=\"Billing\" detail={activeLoad?.gross ? money(activeLoad.gross) : 'Load folder'} onClick={() => onSection('billing')}/>",
  'active-load Documents shortcut');
write(adaptivePath, adaptive);

const profilePath = 'source/src/modules/setup/operatorProfile.js';
let profile = read(profilePath);
profile = r(profile,
  "  { id:'loads', label:'Loads & Documents', detail:'Rate confirmations, BOL, POD, stops and billing' },",
  "  { id:'loads', label:'Loads & Billing', detail:'Load identity, stops, rates and billing' },\n  { id:'documents', label:'Document Vault', detail:'Searchable originals, load folders, broker folders and review queue' },",
  'Documents module catalog');
profile = profile.replace("leased_on:['loads','settlements'", "leased_on:['loads','documents','settlements'")
  .replace("own_authority:['loads','fuel'", "own_authority:['loads','documents','fuel'")
  .replace("business_only:['fuel'", "business_only:['documents','fuel'")
  .replace("driver:['loads','wallet'", "driver:['loads','documents','wallet'")
  .replace("small_fleet:['loads','settlements'", "small_fleet:['loads','documents','settlements'");
profile = r(profile,
  "  const rawModules = uniqueModules(value.modules);\n  const modules = rawModules.length ? rawModules : (mode ? defaultsForMode(mode) : []);",
  "  const rawModules = uniqueModules(value.modules);\n  const baseModules = rawModules.length ? rawModules : (mode ? defaultsForMode(mode) : []);\n  const modules = uniqueModules([...(mode ? ['documents'] : []), ...baseModules]);",
  'existing profile Documents migration');
write(profilePath, profile);

const cssPath = 'source/src/command-center.css';
write(cssPath, append(read(cssPath), '/* v105 Road Ready OS Foundation */', `/* v105 Road Ready OS Foundation */\n${read('source/src/road-ready-os-v105.css')}`));

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) { lock.packages[''].version = VERSION; lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' }; }
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v105-road-ready-os-document-foundation',
  releasedAt:RELEASED_AT,
  notes:[
    'Adds a searchable Document Vault with load folders, broker folders, Needs Review, original-file viewing, editing and archive/restore.',
    'Uses canonical Load identity so BOL, PO, sales order, delivery number and dates cannot silently replace the Load number.',
    'Replaces the long scanner review with three driver decisions: document type, load folder and document date.',
    'Uses one central document checklist for Home, Driver Mission, load folders and billing readiness.',
    'Keeps OCR suggestions outside canonical state until the driver confirms them; originals are preserved even when reading is uncertain.',
    'Repairs mixed active-load state and hidden Pre-trip labels while preserving duty times, duty statuses and locations.'
  ],
  label:'v105 Road Ready OS Document Foundation',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

for (const [relative, marker] of [
  ['source/src/modules/scan/SmartScanSheet.jsx','SmartScanSheetV105'],
  ['source/src/modules/scan/SmartScanSheetV105.jsx','CHECK 3 ITEMS'],
  ['source/src/modules/documents/DocumentVaultV105.jsx','Every document has a home'],
  ['source/src/modules/documents/documentFoundationV105.js','!loadLike && chosen && !chosen.strongReference'],
  ['source/src/modules/home/HomeScreen.jsx',"businessSection === 'documents'"],
  ['source/src/modules/home/AdaptiveHomeV1038.jsx','Load folder · Vault'],
  ['source/src/app/App.jsx','ROAD_READY_DOCUMENT_COMMIT_EVENT_V105'],
  ['source/src/modules/setup/operatorProfile.js',"id:'documents'"],
  [cssPath,'v105 Road Ready OS Foundation'],
]) if (!read(relative).includes(marker)) throw new Error(`v105 verification missing ${marker} in ${relative}`);

console.log('v105 Road Ready OS document foundation materialized');
await import('./verify-road-ready-os-v105.mjs');

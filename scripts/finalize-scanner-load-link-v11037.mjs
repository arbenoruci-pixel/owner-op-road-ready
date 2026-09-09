import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = path => fs.readFileSync(path, 'utf8');
function patch(path, before, after) {
  const source = read(path);
  if (after ? source.includes(after) : !source.includes(before)) return;
  assert.equal(source.split(before).length - 1, 1, `110.3.7 anchor: ${path}: ${before.slice(0,100)}`);
  fs.writeFileSync(path, source.replace(before, after));
}
const sheet='source/src/modules/scan/SmartScanSheetV105.jsx';
fs.copyFileSync('scripts/v11037/scanLoadAssignmentV11037.js','source/src/modules/scan/scanLoadAssignmentV11037.js');
patch(sheet,"import { qualifyScanResultV11036 }", "import { matchScanDocumentToLoadV11037 as matchDocumentToLoadV105, initialScanLoadV11037 } from './scanLoadAssignmentV11037.js';\nimport { qualifyScanResultV11036 }");
patch(sheet,'  matchDocumentToLoadV105,\n','');
patch(sheet,"  const [selectedLoadNo, setSelectedLoadNo] = useState('');", "  const [selectedLoadNo, setSelectedLoadNo] = useState('');\n  const [loadSelectionSourceV11037, setLoadSelectionSourceV11037] = useState('unassigned');");
patch(sheet,"    setSelectedLoadNo('');", "    setSelectedLoadNo('');\n    setLoadSelectionSourceV11037('unassigned');");
patch(sheet,"  function applyResult(result, preferredLoadNo = '') {", "  function applyResult(result, preferredLoadNo = '', preserveLoadChoice = false) {");
patch(sheet,`    const loadNo = typeId === 'rate_confirmation'
      ? normalizeCanonicalLoadNoV105(rateConNewLoad || preferredLoadNo)
      : chooseRateConLoadNoV10964({
          typeId,
          preferredLoadNo,
          extractedLoadNo:rateConNewLoad,
          match:nextMatch,
        });`, `    const loadNo = initialScanLoadV11037(result, nextMatch, preferredLoadNo, preserveLoadChoice);`);
patch(sheet,'    setSelectedLoadNo(safeSelectedLoadV11034);',"    setSelectedLoadNo(safeSelectedLoadV11034);\n    setLoadSelectionSourceV11037(preserveLoadChoice ? (safeSelectedLoadV11034 ? 'driver_selected' : 'driver_unassigned') : safeSelectedLoadV11034 ? 'document_reference' : 'unassigned');");
patch(sheet,"    setLinkToLogbook(documentLinkableV1040(typeId) && (Boolean(loadNo) || typeId === 'gate_pass'));", "    setLinkToLogbook(false); // Logbook linking is an explicit driver choice.");
patch(sheet,'    applyResult({...result, userSelectedTypeV11036:typeId});',"    applyResult({...result, userSelectedTypeV11036:typeId}, selectedLoadNo, loadSelectionSourceV11037.startsWith('driver_'));");
patch(sheet,'    setSelectedLoadNo(normalized);',"    setSelectedLoadNo(normalized);\n    setLoadSelectionSourceV11037(normalized ? 'driver_selected' : 'driver_unassigned');");
patch(sheet,'    setLinkToLogbook(documentLinkableV1040(selectedType) && Boolean(normalized));','    setLinkToLogbook(false); // Changing folders also resets the Logbook destination.');
patch(sheet,"        canonicalLoadId:finalMatchCandidate?.id || match?.canonicalLoadId || `load_${selectedLoadNo}`,", "        canonicalLoadId:selectedLoadNo ? finalMatchCandidate?.id || `load_${selectedLoadNo}` : '',");
patch(sheet,"        broker:finalMatchCandidate?.broker || match?.broker || '',", "        broker:selectedLoadNo ? finalMatchCandidate?.broker || (match?.loadNo === selectedLoadNo ? match.broker : '') || '' : '',");
patch(sheet,'        canonicalLoadNo:selectedLoadNo,',"        canonicalLoadNo:selectedLoadNo,\n        loadAssignmentStatusV11037:selectedLoadNo ? loadSelectionSourceV11037 : 'unassigned',\n        linkEventId:'', eventId:'', stopId:'',");
patch(sheet,"          loadNo:statementV1103?'':selectedLoadNo,", "          loadNo:statementV1103?'':selectedLoadNo,\n          loadAssignmentStatusV11037:statementV1103 || !selectedLoadNo ? 'unassigned' : loadSelectionSourceV11037,");
patch(sheet,"      const archiveLinkV1103=statementV1103?{status:'statement',eventId:'',day:''}:resolveArchiveDocumentLink(record,state);", "      const archiveLinkV1103=statementV1103?{status:'statement',eventId:'',day:''}:record.linkToLogbook ? resolveArchiveDocumentLink(record,state) : {status:'unassigned',eventId:'',day:''};");
patch(sheet,"        loadNo:selectedLoadNo || storageFieldsV10964.loadNo || storageFieldsV10964.orderNo || '',", "        loadNo:selectedLoadNo || '',");
patch(sheet,"{analysis?.liveBolContextV11035 ? <em>Current live pickup BOL · verify before saving</em> : match?.reason ? <em>{selectedLoadNo === match.loadNo ? match.reason : 'Driver-selected load folder'}</em> : null}", "{<em>{!selectedLoadNo ? match?.reason || 'Choose a folder or save for review.' : loadSelectionSourceV11037 === 'driver_selected' ? 'You selected this load folder.' : match?.loadNo === selectedLoadNo ? match.reason : 'Load number read from this document. Verify before saving.'}</em>}");
patch(sheet,"{match?.automatic && selectedLoadNo === match.loadNo ? 'Strong match' : 'Confirmed'}", "{loadSelectionSourceV11037 === 'driver_selected' ? 'Your selection' : 'Reference match'}");
patch(sheet,'            <select value={selectedLoadNo || \'\'}', '            <select aria-label="Load folder" value={selectedLoadNo || \'\'}');
patch(sheet,'            <select value={selectedType}', '            <select aria-label="Document type" value={selectedType}');
patch(sheet,'            <input type="date" value={documentDate', '            <input aria-label="Document date" type="date" value={documentDate');
const storage='source/src/modules/scan/rateConSaveStabilityV10964.js';
patch(storage,"    'type','title','loadNo','canonicalLoadNo','orderNo'", "    'loadAssignmentStatusV11037','type','title','loadNo','canonicalLoadNo','orderNo'");
const foundation='source/src/modules/documents/documentFoundationV105.js';
patch(foundation,'    originalPreserved:analysis?.scanMeta?.originalPreserved !== false,',"    loadAssignmentStatusV11037:fields.loadAssignmentStatusV11037 || '',\n    originalPreserved:analysis?.scanMeta?.originalPreserved !== false,");
patch(foundation,'function cleanLegacyDocumentV105(document = {}, state = {}, businessStore = {}) {',"function cleanLegacyDocumentV105(document = {}, state = {}, businessStore = {}) {\n  document = {...document, loadAssignmentStatusV11037:document.loadAssignmentStatusV11037 || document.extracted?.loadAssignmentStatusV11037 || document.metadata?.loadAssignmentStatusV11037 || ''};");
patch(foundation,"    if (migrated.status === 'needs_review' && LOAD_DOCUMENT_TYPES_V105.has(migrated.type) && !migrated.canonicalLoadNo) {", "    if (migrated.loadAssignmentStatusV11037 !== 'unassigned' && migrated.status === 'needs_review' && LOAD_DOCUMENT_TYPES_V105.has(migrated.type) && !migrated.canonicalLoadNo) {");
const archive='source/src/modules/owneros/archiveEvidenceV1103.js';
patch(archive,'export function resolveArchiveDocumentLink(doc = {}, state = {}) {',"export function resolveArchiveDocumentLink(doc = {}, state = {}) {\n  if (doc.loadAssignmentStatusV11037 && !doc.linkToLogbook) return {status:'unassigned',eventId:'',day:''};");
const business='source/src/modules/business/businessStore.js';
patch(business,'      canonicalLoadId:record.canonicalLoadId, broker:record.broker, stopId:record.stopId,', '      loadAssignmentStatusV11037:record.loadAssignmentStatusV11037,\n      canonicalLoadId:record.canonicalLoadId, broker:record.broker, stopId:record.stopId,');
const css='source/src/command-center.css';
if(!read(css).includes('/* scan-load-link-11037 */'))fs.appendFileSync(css,'\n/* scan-load-link-11037 */\n'+read('scripts/v11037/scanContrastV11037.css'));
const VERSION='110.3.7', BUILD='v110307-evidence-only-load-link';
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.6');assert.equal(meta.build,'v110306-smart-document-capture');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
for(const path of ['package.json','package-lock.json']) {const data=JSON.parse(read(path));data.version=VERSION;if(data.packages?.[''])data.packages[''].version=VERSION;fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');}
for(const path of ['release-version.json','public/app-version.json']) {const data=JSON.parse(read(path));Object.assign(data,{version:VERSION,build:BUILD,force:false,label:'v110.3.7 Document Load Matching',notes:['Load folders require a unique reference from the document or driver selection.','Unassigned scans stay unassigned after saving and reopening.','Readable scanner review in light and dark app themes.']});fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']])fs.writeFileSync(path,read(path).replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`));
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(path,read(path).replace(/App v\d+\.\d+\.\d+/g,`App v${VERSION}`).replace(/APP V\d+\.\d+\.\d+/g,`APP V${VERSION}`));
console.log('PASS — scanner load assignment and contrast 110.3.7 installed');

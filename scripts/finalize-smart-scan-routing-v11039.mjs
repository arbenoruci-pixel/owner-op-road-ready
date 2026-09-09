import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = path => fs.readFileSync(path,'utf8');
function patch(path,before,after) {
  const source=read(path); if(source.includes(after))return;
  assert.equal(source.split(before).length-1,1,`110.3.9 anchor: ${path}: ${before.slice(0,90)}`);
  fs.writeFileSync(path,source.replace(before,after));
}
const root='source/src/modules/scan/';
for(const name of ['smartScanRoutingV11039.js','smartScanEvidenceV11039.js'])fs.copyFileSync('scripts/v11039/'+name,root+name);
const home='source/src/modules/home/AdaptiveHomeV1038.jsx';
patch(home,'Ready for the next Rate Con','Smart Scan');
patch(home,'Scan it once. Road Ready will build the route, stop sequence, appointments, instructions and document checklist.','Scan a Rate Con, BOL, POD, receipt or permit. Review the document type and where it will be saved.');
patch(home,'<button type="button" onClick={onScan}>Scan Rate Con</button>','<button type="button" onClick={() => onScan?.(\'auto\')}>Smart Scan</button>');
patch(home,'<Quick title="Scan" detail="Documents" onClick={onScan}/>','<Quick title="Smart Scan" detail="All documents" onClick={() => onScan?.(\'auto\')}/>');
patch(home,'<Quick title="Scan paperwork" detail="BOL · POD · receipt" onClick={onScan}/>','<Quick title="Smart Scan" detail="BOL · POD · receipt" onClick={() => onScan?.(\'auto\')}/>');
const oldHome='source/src/modules/home/ActiveLoadLiveV102.jsx';
patch(oldHome,'<button type="button" onClick={onScan}>Scan Rate Con</button>','<button type="button" onClick={() => onScan?.(\'auto\')}>Smart Scan</button>');
const screen='source/src/modules/home/HomeScreen.jsx';
patch(screen,"import React,", "import { normalizeScanPreferenceV11039 } from '../scan/smartScanRoutingV11039.js';\nimport React,");
patch(screen,"setScanPreferredType(type || 'auto');",'setScanPreferredType(normalizeScanPreferenceV11039(type));');
const scanner=root+'v3/RoadReadyScannerV3.jsx';
patch(scanner,'>Scan Anything</b>','>Smart Scan</b>');
const sheet=root+'SmartScanSheetV105.jsx';
patch(sheet,"import { documentFieldRowsV11038 }", "import { scanNeedsLoadV11039, scanDestinationV11039, normalizeScanPreferenceV11039 } from './smartScanRoutingV11039.js';\nimport { documentFieldRowsV11038 }");
patch(sheet,"  return ['rate_confirmation','load_tender','bol','pod','delivery_receipt','gate_pass','lumper_receipt','scale_ticket','detention_approval','layover_approval','tonu','osd_report','claim_notice','load_invoice'].includes(typeId);",'  return scanNeedsLoadV11039(typeId);');
patch(sheet,"    const requestedType = preferredType !== 'auto' ? preferredType : (initialPreferredType || 'auto');","    const preference = normalizeScanPreferenceV11039(preferredType);\n    const requestedType = preference !== 'auto' ? preference : normalizeScanPreferenceV11039(initialPreferredType);");
patch(sheet,'<b>Scan Anything</b>','<b>Smart Scan</b>');
patch(sheet,"  const canSave = Boolean(file", "  const filingDestination = saved ? scanDestinationV11039(saved.record) : null;\n  const canSave = Boolean(file");
patch(sheet,"value={selectedMeta.family?.label || selectedMeta.target || 'Documents'}", "value={scanDestinationV11039({type:selectedType}).label}");
patch(sheet,"<ConfirmCard label=\"Filed to\" value={saved.record.canonicalLoadNo ? `Load ${saved.record.canonicalLoadNo}` : 'Needs Review'} detail={!saved.record.canonicalLoadNo ? 'Choose a load folder after reviewing the document.' : saved.record.stopSequence ? `Stop ${saved.record.stopSequence} · ${saved.record.stopCompany || saved.record.stopLocation}` : saved.record.broker || 'Load folder'} tone={saved.record.canonicalLoadNo ? 'good' : 'review'}/>",'<ConfirmCard label="Filed to" value={filingDestination.label} detail={filingDestination.detail} tone={filingDestination.tone}/>');
patch(sheet,"requiresLoad && (!selectedLoadNo || !documentDate) ? 'Save for review'", "(!documentDate || selectedType === 'other' || requiresLoad && !selectedLoadNo) ? 'Save for review'");
// Unresolved documents stay available for review without adding invented dated
// transactions or zero-dollar financial records to the operational totals.
patch(sheet,"  const bucket = operationalBucket(meta);", "  if (record.status === 'needs_review') return store;\n  const bucket = operationalBucket(meta);");
patch(sheet,"    date:record.documentDate || localDateKey(),", "    date:record.documentDate,");
patch(root+'rateConSaveStabilityV10964.js',"      id:record.id || '',","      id:record.id || '',\n      type:record.type || meta.id || 'other',\n      status:record.status || '',\n      folder:record.folder || '',");
const foundation='source/src/modules/documents/documentFoundationV105.js';
patch(foundation,"import { rateConBackedBusinessLoadV11029", "import { LOAD_SCAN_TYPES_V11039, scanFolderV11039 } from '../scan/smartScanRoutingV11039.js';\nimport { rateConBackedBusinessLoadV11029");
const f=read(foundation);const start=f.indexOf('const LOAD_DOCUMENT_TYPES_V105 = new Set([');const end=f.indexOf('\n]);',start)+4;
if(start>=0){assert.ok(end>start);fs.writeFileSync(foundation,f.slice(0,start)+'const LOAD_DOCUMENT_TYPES_V105 = LOAD_SCAN_TYPES_V11039;'+f.slice(end));}
const f2=read(foundation);const folderStart=f2.indexOf("export function documentFolderV105(typeId = 'other', record = {}) {");const folderEnd=f2.indexOf('\nfunction titleForVaultV105',folderStart);
assert.ok(folderStart>=0 && folderEnd>folderStart);
fs.writeFileSync(foundation,f2.slice(0,folderStart)+"export function documentFolderV105(typeId = 'other', record = {}) { return scanFolderV11039(typeId, record); }\n"+f2.slice(folderEnd));
patch(foundation,'  const verified = Boolean(userConfirmed && (!requiresLoad || canonicalLoadNo));',"  const verified = Boolean(userConfirmed && typeId !== 'other' && date && (!requiresLoad || canonicalLoadNo));");
const assignment=root+'scanLoadAssignmentV11037.js';
patch(assignment,"import { collectLoadCandidatesV105", "import { LOAD_SCAN_TYPES_V11039 } from './smartScanRoutingV11039.js';\nimport { collectLoadCandidatesV105");
patch(assignment,"const loadFolderTypes = new Set(['rate_confirmation','load_tender','bol','pod','delivery_receipt','gate_pass','lumper_receipt','scale_ticket','detention_approval','layover_approval','tonu','osd_report','claim_notice','load_invoice']);",'const loadFolderTypes = LOAD_SCAN_TYPES_V11039;');
const router=root+'engines/isolatedDocumentRouterV10959.js';
patch(router,"import { qualifyDocumentFieldsV11038 }", "import { preserveDocumentDecisionV11039 } from '../smartScanRoutingV11039.js';\nimport { classifySmartScanStructureV11039, qualifyRateConReferenceV11039 } from '../smartScanEvidenceV11039.js';\nimport { qualifyDocumentFieldsV11038 }");
patch(router,"export async function analyzeTruckDocumentIsolatedV10959(file,options={}){return qualifyDocumentFieldsV11038(enforceStructuralBolV11034(await analyzeTruckDocumentIsolatedBaseV11034(file,options)));}",`export function finalizeSmartScanAnalysisV11039(generic,options={},file=null) {
  const routed=routeIsolatedDocumentV10959(normalizeEngineInputV1(file,generic,options));
  const structure=classifySmartScanStructureV11039(generic.text);
  let result=applyWinnerV10959(generic,routed);
  if(structure && structure.typeId !== result.type?.id && !(structure.typeId==='bol' && result.type?.id==='pod')) {
    result={...reanalyzeGenericTruckDocumentTypeV1040(generic,structure.typeId,options),confidence:structure.confidence,needsReview:true,engineTrace:routed.trace,method:'smart-scan-structure-v11039',structureEvidenceV11039:structure.reason};
  }
  return qualifyRateConReferenceV11039(qualifyDocumentFieldsV11038(preserveDocumentDecisionV11039(result,enforceStructuralBolV11034)));
}
export async function analyzeTruckDocumentIsolatedV10959(file,options={}) {
  return finalizeSmartScanAnalysisV11039(await analyzeGenericTruckDocumentV1040(file,options),options,file);
}`);
// A colon is also an explicit BOL label (common on Home Depot paperwork).
const semantics=root+'documentFieldSemanticsV11038.js';
patch(semantics,"  bolNo:'(?:B[O0]L|B[\\\\/]L|BILL[ \\\\t]+OF[ \\\\t]+LADING)[ \\\\t]*(?:N[O0]\\\\.?|NUMBER|#)',", "  bolNo:'(?:B[O0]L|B[\\\\/]L|BILL[ \\\\t]+OF[ \\\\t]+LADING)[ \\\\t]*(?:N[O0]\\\\.?|NUMBER|#|(?=:))',");
const VERSION='110.3.9',BUILD='v110309-smart-scan-routing';
patch('scripts/test-duty-graph-continuity.mjs',"assert.equal(meta.version,'110.3.8');assert.equal(meta.build,'v110308-labeled-shipping-fields');",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`);
for(const p of ['scripts/browser-ratecon-one-way-v11029.mjs','scripts/verify-adaptive-home-v1038.mjs'])fs.writeFileSync(p,read(p).replaceAll('/Ready for the next Rate Con/','/Smart Scan/'));
for(const p of ['package.json','package-lock.json']){const d=JSON.parse(read(p));d.version=VERSION;if(d.packages?.[''])d.packages[''].version=VERSION;fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');}
for(const p of ['release-version.json','public/app-version.json']){const d=JSON.parse(read(p));Object.assign(d,{version:VERSION,build:BUILD,force:false,label:'v110.3.9 Smart Scan',notes:['Smart Scan reads all supported document types from Home.','POD decisions survive BOL structural recovery.','Filing destinations follow document type; unresolved scans stay in review.']});fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');}
for(const [p,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']])fs.writeFileSync(p,read(p).replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`));
for(const p of [screen,'source/src/shared/ui/ToolsSheet.jsx'])fs.writeFileSync(p,read(p).replace(/App v\d+\.\d+\.\d+/g,`App v${VERSION}`).replace(/APP V\d+\.\d+\.\d+/g,`APP V${VERSION}`));
if(!read('scripts/test-scanner-load-link-v11037.mjs').includes('export {mount,resetStore}'))fs.appendFileSync('scripts/test-scanner-load-link-v11037.mjs','\nexport {mount,resetStore};\n');
console.log('PASS — Smart Scan entry, classification and filing 110.3.9 installed');

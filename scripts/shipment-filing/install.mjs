import fs from 'node:fs';
import assert from 'node:assert/strict';
function patch(file,before,after){const source=fs.readFileSync(file,'utf8');if(source.includes(after))return;assert.equal(source.split(before).length,2,'Shipment filing anchor: '+file+' / '+before.slice(0,90));fs.writeFileSync(file,source.replace(before,()=>after));}
const scan='source/src/modules/scan/',foundation='source/src/modules/documents/documentFoundationV105.js';
fs.copyFileSync('scripts/shipment-filing/candidates.js',scan+'shipmentFiling.js');
// The shared migration matcher must also refuse the polluted volatile aliases.
const src=fs.readFileSync(foundation,'utf8'),start=src.indexOf('    const guide = info.guideId ?'),end=src.indexOf('    add(infoCandidate);',start);
if(!src.includes('// CURRENT_FORM_IS_NOT_IDENTITY')){assert.ok(start>0&&end>start);fs.writeFileSync(foundation,src.slice(0,start)+`    // CURRENT_FORM_IS_NOT_IDENTITY: a new BOL can coexist with an old selected guide.
    infoCandidate.active = true;
    infoCandidate.updatedAt = numberV105(info.updatedAt);
    infoCandidate.sourceKinds = ['load_info'];
    addAliasV105(infoCandidate, 'load_number', infoLoadNo, 'load_info');
`+src.slice(end));}
patch(foundation,'  candidateLimit = 8,','  candidateLimit = 8,\n  candidateOverride = null,');
patch(foundation,"} = {}) {\n  const candidates = collectLoadCandidatesV105(state, businessStore);\n  const active", "} = {}) {\n  const candidates = candidateOverride || collectLoadCandidatesV105(state, businessStore);\n  const active");
for(const file of [scan+'scanLoadAssignmentV11037.js',scan+'SmartScanSheetV105.jsx']){
 patch(file,'const collectLoadCandidatesV105=(state,store)=>libraryScanCandidates(collectBaseCandidatesV110434(state,store),store);',"const collectLoadCandidatesV105=collectShipmentScanCandidates;");
 patch(file,"import {libraryScanCandidates}","import {collectShipmentScanCandidates,shipmentPickerDetails,shipmentFilingFields} from './shipmentFiling.js';\nimport {libraryScanCandidates}");
}
const match=scan+'scanLoadAssignmentV11037.js';
patch(match,'const base = matchDocumentToLoadV105({...options,candidateLimit:Infinity});','const base = matchDocumentToLoadV105({...options,candidateLimit:Infinity,candidateOverride:collectLoadCandidatesV105(options.state,options.businessStore)});');
patch(match,"broker:chosen.broker, stop:ranked.stopMatch || null,","broker:chosen.broker, referenceOnly:Boolean(chosen.shipmentFiling), shipmentReference:chosen.shipmentReference || '', stop:ranked.stopMatch || null,");
patch(match,"reason:'A reference read from this document matches this load.',","reason:chosen.shipmentFiling?'BOL matches the recorded pickup. Broker load number is not linked yet.':'A reference read from this document matches this load.',");
patch(match,'if (!chosen || !ranked || ranked.brokerIdentityConflict)', 'if (!chosen || chosen.shipmentAmbiguous || !ranked || ranked.brokerIdentityConflict)');
const picker=scan+'loadPickerV110472.js';
patch(picker,"const referenceOnly=hasContext&&context.current?.identity==='reference'", "const referenceOnly=candidate.shipmentFiling||hasContext&&context.current?.identity==='reference'");
const ui=scan+'LoadFolderPicker.jsx';
patch(ui,'disabled={item.referenceOnly}','disabled={item.referenceOnly&&!item.shipmentFiling}');
patch(ui,"item.referenceOnly?'Needs a load link'", "item.shipmentFiling?'Recorded pickup':item.referenceOnly?'Needs a load link'");
patch(ui,"value?'Load '+value:'Choose a load'", "value?(chosen?.shipmentFiling?'Shipment / BOL ':'Load ')+value:'Choose a load'");
patch(ui,'<h3>Unlinked references</h3>','<h3>Recorded shipments</h3>');
const badge=scan+'scanAssignmentSafety.js';
patch(badge,"return match.source==='document_route'?'Route/date match':'Reference match';", "return match.referenceOnly?'Shipment reference match':match.source==='document_route'?'Route/date match':'Reference match';");
const sheet=scan+'SmartScanSheetV105.jsx';
patch(sheet,'const candidates = useMemo(() => loadPickerCandidates(', 'const candidates = useMemo(() => shipmentPickerDetails(loadPickerCandidates(');
patch(sheet,'operationalCandidateContext(state,store)), [state, store]);','operationalCandidateContext(state,store)),analysis||{}), [state, store, analysis]);');
patch(sheet,'analysisWithProjection(analysis,readerReviewV110345,selectedType,selectedLoadNo,loadSelectionSourceV11037,',"analysisWithProjection(analysis,readerReviewV110345,selectedType,selectedLoad?.shipmentFiling?'':selectedLoadNo,loadSelectionSourceV11037,");
patch(sheet,'[analysis,readerReviewV110345,selectedType,selectedLoadNo,loadSelectionSourceV11037]);','[analysis,readerReviewV110345,selectedType,selectedLoadNo,loadSelectionSourceV11037,selectedLoad?.shipmentFiling]);');
// A reference selection is a filing target, never a fabricated broker load ID.
patch(sheet,'      const currentStore = migrateBusinessStoreV105(readBusinessStore(), state);',`      const shipmentFields=shipmentFilingFields(selectedLoad);
      const selectedLoadNo=selectedLoad?.shipmentFiling?'':filingSelectedLoadNo;
      const currentStore = migrateBusinessStoreV105(readBusinessStore(), state);`);
patch(sheet,'  async function save() {','  const filingSelectedLoadNo=selectedLoadNo;\n  async function save() {');
patch(sheet,'<b>Load {selectedLoadNo}</b>',"<b>{selectedLoad?.shipmentFiling?'Shipment / BOL ':'Load '}{selectedLoadNo}</b>");
patch(sheet,"{selectedLoad?.broker || (confirmedInstructionPlanV110311", "{selectedLoad?.shipmentFiling?(selectedLoad.company||selectedLoad.destination||'Recorded pickup'):(selectedLoad?.broker || (confirmedInstructionPlanV110311");
patch(sheet,"match?.broker) || 'Load folder'}</em>","match?.broker) || 'Load folder')}</em>");
patch(sheet,'      if(statementV1103)Object.assign(mergedFields,', '      Object.assign(mergedFields,shipmentFields);\n      if(statementV1103)Object.assign(mergedFields,');
patch(sheet,'      storageFieldsV10964.readerAnalysisV1=', '      Object.assign(storageFieldsV10964,shipmentFields);\n      storageFieldsV10964.readerAnalysisV1=');
patch(sheet,'      record.evidenceOnlyV110413=Boolean(evidenceContextV110413);',`      Object.assign(record,shipmentFields);
      if(shipmentFields.shipmentReference){record.canonicalLoadId='';record.broker='';record.folder='shipment:'+shipmentFields.shipmentReference;record.reviewReason='Shipment saved; broker load number is not linked yet.';}
      record.evidenceOnlyV110413=Boolean(evidenceContextV110413);`);
// Carry the explicit shipment identity through local/remote storage and reopen.
patch(sheet,"          resumeDocumentIdV110312,", "          ...shipmentFields,\n          resumeDocumentIdV110312,");
patch(sheet,"loadAssignmentStatusV11037:statementV1103 || !selectedLoadNo ? 'unassigned' : loadSelectionSourceV11037,", "loadAssignmentStatusV11037:shipmentFields.shipmentReference?'shipment_reference':statementV1103 || !selectedLoadNo ? 'unassigned' : loadSelectionSourceV11037,");
patch(scan+'rateConSaveStabilityV10964.js',"      folder:record.folder || '',","      folder:record.folder || '',\n      documentScope:record.documentScope || '',\n      shipmentReference:record.shipmentReference || '',");
patch(foundation,"    folder:documentFolderV105(type, { canonicalLoadNo, status }),", "    folder:documentFolderV105(type, { ...document, canonicalLoadNo, status }),");
patch(foundation,"if (migrated.loadAssignmentStatusV11037 !== 'unassigned'", "if (migrated.documentScope !== 'shipment' && migrated.loadAssignmentStatusV11037 !== 'unassigned'");
patch(foundation,'    if (document.broker) {',`    if (document.documentScope==='shipment' && document.shipmentReference) {
      const ref=normalizeReferenceV105(document.shipmentReference),key='shipment:'+ref;
      const folder=loads.get(key)||{id:key,kind:'shipment',label:'Shipment / BOL '+ref,count:0,needsReview:0,updatedAt:0};
      folder.count++;folder.needsReview+=document.status==='needs_review'?1:0;folder.updatedAt=Math.max(folder.updatedAt,numberV105(document.updatedAt));loads.set(key,folder);
    }
    if (document.broker) {`);
patch(foundation,'a.loadNo.localeCompare(b.loadNo)),', "textV105(a.loadNo||a.id).localeCompare(textV105(b.loadNo||b.id))),");
const routing=scan+'smartScanRoutingV11039.js';
patch(routing,"  if (record.status === 'needs_review'", "  if(record.documentScope==='shipment'&&record.shipmentReference)return 'shipment:'+record.shipmentReference;\n  if (record.status === 'needs_review'");
patch(routing,"  if (folder.startsWith('load:'))", "  if(folder.startsWith('shipment:'))return {label:'Shipment / BOL '+record.shipmentReference,detail:'Original saved with the recorded shipment. Broker load number still needs a link.',tone:'review'};\n  if (folder.startsWith('load:'))");
const vault='source/src/modules/documents/DocumentVaultV105.jsx';
patch(vault,"    else if (folder.startsWith('load:'))", "    else if (folder.startsWith('shipment:')) list = list.filter(document => document.documentScope==='shipment' && 'shipment:'+document.shipmentReference===folder);\n    else if (folder.startsWith('load:'))");
console.log('PASS — scanner separates recorded shipments from broker loads and ignores stale form aliases');

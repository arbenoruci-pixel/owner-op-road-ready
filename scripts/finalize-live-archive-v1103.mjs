import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const read=path=>fs.readFileSync(path,'utf8');
const write=(path,source)=>fs.writeFileSync(path,source);
function once(source,before,after,label=before.slice(0,60)) {
  if(source.includes(after))return source;
  assert.equal(source.split(before).length-1,1,'Archive anchor changed: '+label);
  return source.replace(before,after);
}
function section(source,start,end,replacement) {
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Archive section changed: '+start);
  return source.slice(0,a)+replacement+source.slice(b);
}
function prepend(source,line){
  if(source.includes(line))return source;
  const directive=source.match(/^\s*['"]use client['"];?/);
  return directive?directive[0]+'\n'+line+'\n'+source.slice(directive[0].length):line+'\n'+source;
}

// Public read-only Logbook integration; the editor/RODS writer stays unchanged.
const api='source/src/modules/logbook/public-api.js';
let source=read(api);
const exportLine="export { readArchiveLogbookDay } from './archiveDayV1103.js';";
if(!source.includes(exportLine))source+='\n'+exportLine+'\n';
write(api,source);

const mileage='source/src/modules/owneros/loadEvidenceV10976.js';
source=prepend(read(mileage),"import { archiveLoadMileage } from './archiveEvidenceV1103.js';");
source=section(source,'export function mileageEvidenceForLoadV10976(',"const RETURN_KEY=", "export function mileageEvidenceForLoadV10976(state={},loadNo=''){return archiveLoadMileage(state,loadNo);}\n");
write(mileage,source);

const reconcile='source/src/modules/owneros/loadFolderReconciliationV10974.js';
source=prepend(read(reconcile),"import { projectArchiveState, archiveDocument, archiveDocumentKey, deduplicateArchiveDocuments } from './archiveEvidenceV1103.js';");
source=section(source,'function docKey(d={}){','function richness(',"function docKey(d={}){return archiveDocumentKey(d)||JSON.stringify([loadOf(d),typeOf(d),fileNameOf(d),d.created_at]);}\n");
source=once(source,"  aliases.set('178564','424590-1');","  aliases.set('178564','424590-1');\n  state=projectArchiveState(state,Object.fromEntries(aliases));");
source=once(source,'    if(!prev||richness(raw)>richness(prev)) mergedDocs.set(key,raw);','    mergedDocs.set(key,prev?deduplicateArchiveDocuments([prev,raw])[0]:raw);');
source=once(source,'  const allDocs=[...mergedDocs.values()];','  const allDocs=[...mergedDocs.values()].map(doc=>archiveDocument(doc,state));');
source=once(source,'const requiredStops=repairedCount>0?repairedCount:Math.max(existing,explicitMax,uniquePods&&existing?uniquePods:0);','const requiredStops=repairedCount>0?repairedCount:existing;');
write(reconcile,source);

const supporting='source/src/modules/owneros/supportingDocumentsV10977.js';
source=prepend(read(supporting),"import { deduplicateArchiveDocuments } from './archiveEvidenceV1103.js';");
source=section(source,'export function logicalDeduplicateDocumentsV10977(', 'export const SUPPORTING_DOCUMENT_GROUPS_V10977=', 'export function logicalDeduplicateDocumentsV10977(documents=[]){return deduplicateArchiveDocuments(documents);}\n\n');
write(supporting,source);

const engine='source/src/modules/owneros/loadFolderEngineV10969.js';
source=prepend(read(engine),"import { archiveDeliveryStops, assignArchivePods, finalizeArchiveFolder, verifiedArchiveDocument } from './archiveEvidenceV1103.js';");
source=section(source,'function deliveryStops(', 'function rowDate(', 'function deliveryStops(load={},legs=[]){return archiveDeliveryStops(load,legs);}\n');
source=once(source,'const values=[load.revenue,load.rate,load.grossRevenue,load.totalRevenue,','const values=[load.gross,load.revenue,load.rate,load.grossRevenue,load.totalRevenue,');
source=once(source,"fuelCandidates(store).filter(r=>refs(r).includes(t)||(!refs(r).filter(Boolean).length&&days.includes(rowDate(r))))","fuelCandidates(store).filter(r=>refs(r).includes(t))");
source=once(source,"(store.expenses||[]).filter(r=>refs(r).includes(t)||(!refs(r).filter(Boolean).length&&days.includes(rowDate(r))))","(store.expenses||[]).filter(r=>refs(r).includes(t))");
source=section(source,'  const assigned=new Map(),unassigned=[];', '\n  const mileage=', '  const {assigned,unassigned,missingStops,podComplete}=assignArchivePods(pods,stops);');
source=once(source,"fuelComplete=fuelDocs.length>0||fuelRows.some(r=>r.receiptAttached===true||r.receiptId||r.documentId)||fuelRows.length>0", "fuelComplete=fuelDocs.some(verifiedArchiveDocument)&&fuelRows.some(r=>fuelDocs.some(d=>(d.local_id||d.id)===r.documentId))");
source=once(source,"  return {id:load.id||`load_${loadNo}`,loadNo,loadType,", "  return finalizeArchiveFolder({id:load.id||`load_${loadNo}`,loadNo,loadType,");
source=once(source,'supporting:supporting.total}};','supporting:supporting.total}},state,load);');
write(engine,source);

const historical='source/src/modules/owneros/historicalLogbookV10981.js';
source=prepend(read(historical),"import { readArchiveLogbookDay } from '../logbook/public-api.js';\nimport { archiveDayMileage, archiveLoadMileage } from './archiveEvidenceV1103.js';");
source=section(source,"export function normalizedHistoricalTimelineV10981(",'function totalsFor(',"export function normalizedHistoricalTimelineV10981(state={},day=''){return readArchiveLogbookDay(state,day);}\n");
source=section(source,"function dailyMiles(",'function drivingMiles(',"function dailyMiles(state={},day=''){return archiveDayMileage(state,day).miles;}\n");
source=section(source,"function drivingMiles(",'function driverId(',"function drivingMiles(state={},day=''){return archiveDayMileage(state,day).miles;}\n\n");
source=once(source,'const existing=versions.find(snapshot=>snapshot.checksum===hash);if(existing&&!force)return existing;','const existing=versions.at(-1);if(existing?.checksum===hash)return existing;');
source=section(source,'export function latestHistoricalLogbookSnapshotV10981(', '\nfunction pdfEscape(',"export function latestHistoricalLogbookSnapshotV10981({state={},folder={},day=''}){return ensureHistoricalLogbookSnapshotV10981({state,folder,day});}\n");
source=source.replace('metadata.totalVehicleMiles||0',"metadata.totalVehicleMiles??'Not recorded'").replace('metadata.totalDrivingMiles||0',"metadata.totalDrivingMiles??'Not recorded'");
const milesPdf=String.raw`
export function buildCurrentMilesPdfV1103({state={},folder={}}={}) {
 const mileage=archiveLoadMileage(state,folder.loadNo),ops=[];
 drawText(ops,'ROAD READY - CURRENT MILEAGE EVIDENCE',34,760,14,true);
 drawText(ops,'Load '+text(folder.loadNo),34,735,11,true);
 drawText(ops,mileage.detail,34,714,8);
 drawText(ops,'DATE           DAY MILES       LOAD MILES       SOURCE / REVIEW',34,688,8,true);
 let y=666;
 const pages=[];
 for(const row of mileage.dayEvidence) {
  if(y<80){pages.push({content:ops.join('\n')});ops.length=0;y=750;}
  const allocation=row.allocations[text(folder.loadNo).toUpperCase()];
  drawText(ops,row.day+'    '+(row.miles??'Unknown')+'          '+(allocation?.miles??'Unassigned')+'          '+row.source+' / '+row.status,34,y,8);y-=20;
 }
 drawText(ops,'Day totals may include other loads or empty travel. Each day is counted once in weekly totals.',34,55,7);
 drawText(ops,'Generated '+new Date().toISOString(),34,36,7);
 pages.push({content:ops.join('\n')});return buildPdf(pages);
}
export function openCurrentMilesPdfV1103(input={}) {const blob=buildCurrentMilesPdfV1103(input);openBlob(blob,'current-miles-'+text(input.folder?.loadNo)+'.pdf');return blob;}
`;
if(!source.includes('export function buildCurrentMilesPdfV1103'))source+='\n'+milesPdf;
write(historical,source);

const folders='source/src/modules/owneros/LoadFoldersV10969.jsx';
source=prepend(read(folders),"import { archiveWeeks, projectArchiveState } from './archiveEvidenceV1103.js';\nimport { openCurrentMilesPdfV1103 } from './historicalLogbookV10981.js';");
source=prepend(source,"import FuelEvidenceRepairV1103 from './FuelEvidenceRepairV1103.jsx';");
source=prepend(source,"import WeeklyEvidenceV1103 from './WeeklyEvidenceV1103.jsx';");
source=once(source,'<RepairImportPanelV10975 onApplied={()=>setRevision(v=>v+1)}/>','<RepairImportPanelV10975 onApplied={()=>setRevision(v=>v+1)}/><FuelEvidenceRepairV1103 onApplied={()=>setRevision(v=>v+1)}/>');
source=section(source,' const weeks=useMemo(', ' const selectedWeek='," const weeks=useMemo(()=>archiveWeeks(folders,projectArchiveState(state),{...businessStore,documents:allDocuments}).map(week=>({...week,start:week.start||'undated',label:week.start?weekLabel(week.start):'Date needs confirmation'})),[folders,state,businessStore,allDocuments]);\n");
source=once(source,'<div className="load-folder-search-v10969">','<WeeklyEvidenceV1103 week={selectedWeek} documents={allDocuments} state={state}/><div className="load-folder-search-v10969">');
source=once(source,'<span>{week.items.length} loads</span>','<span>{week.items.length} loads</span><span>{week.fuel.length} fuel purchases</span><span>{week.documents.length} documents</span>');
source=source.replace("const VERSION='109.8.1';","const VERSION='110.3.0';");
source=section(source,' function openHistoricalMiles(', ' function openHistoricalLogbookDay('," function openHistoricalMiles(folder){return()=>openCurrentMilesPdfV1103({state:projectArchiveState(state),folder});}\n");
source=source.replace('Full immutable daily Logbooks use exact load-linked dates and complete driver timelines.','Current Logbooks and mileage follow saved event edits. Exported files keep their generation date.');
source=source.replace('Historical evidence v109.8.1','Live archive');
source=source.replace("'No mileage found on linked Logbook days'","'Mileage needs review'");
source=source.replaceAll('Historical Audit Evidence','Current Audit Evidence').replaceAll('Open Historical Logbook','Open Current Logbook').replaceAll('Rebuild Historical Logbooks','Refresh Current Logbooks');
source=once(source,'<span>{vaultDocumentLabelV102(document)}</span>','<span>{/^(logbook_snapshot|miles_snapshot)$/.test(docType(document))?\'Saved export · \':\'\'}{vaultDocumentLabelV102(document)}</span>');
write(folders,source);

// TAR headers must preserve the complete path. Manifest paths are verifiable.
const audit='source/src/modules/owneros/auditExportV10973.js';
source=read(audit);
source=source.replace('function buildTar(entries=[])','export function buildTar(entries=[])');
source=once(source,"  put(0,100,name);", "  if(name.length>100){const split=name.lastIndexOf('/');assertTarPath(name,split);put(345,155,name.slice(0,split));name=name.slice(split+1);}\n  put(0,100,name);");
if(!source.includes('function assertTarPath('))source=prepend(source,"function assertTarPath(name,split){if(split<1||split>155||name.slice(split+1).length>100)throw new Error('Archive path is too long: '+name);}");
source=once(source,'    manifest.push({id:doc.local_id||doc.id,path,','    const sha256=blob?[...new Uint8Array(await crypto.subtle.digest(\'SHA-256\',await blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,\'0\')).join(\'\'):null;\n    manifest.push({sha256,linkedEventId:doc.linkedEventId||\'\',linkDay:doc.linkDay||\'\',archiveLink:doc.archiveLink||null,stopSequence:doc.stopSequence||0,reviewStatus:doc.reviewStatus||doc.status||\'\',id:doc.local_id||doc.id,path,');
source=source.replace('if(!folder.rateCons.length) issues.push','if(!folder.isAmazon&&!folder.rateCons.length) issues.push');
source=once(source,'safeName(doc.original_file_name||doc.title||`document-${index+1}`);','safeName(doc.original_file_name||doc.title||`document-${index+1}`).slice(0,90);');
source=source.replace('safeName(loadNo)','safeName(loadNo).slice(0,40)');
source=source.replace('if(folder.counts.pods>folder.counts.stops && folder.counts.stops>0)','if(folder.podAssignments?.size>folder.counts.stops && folder.counts.stops>0)');
write(audit,source);

// The restore path must understand the USTAR prefix written by the exporter.
const repairImport='source/src/modules/owneros/repairImportV10975.js';
source=read(repairImport);
source=once(source,"const name=bytesToText(header.slice(0,100)).replace(/\\0.*$/,'');", "const leaf=bytesToText(header.slice(0,100)).replace(/\\0.*$/,'');const prefix=bytesToText(header.slice(345,500)).replace(/\\0.*$/,'');const name=prefix?prefix+'/'+leaf:leaf;");
source=source.replace('function parseTar(bytes)','export function parseTar(bytes)');
source=once(source,"existingHashes.has(hash)||(['rate_confirmation','pod'].includes(doc.documentType)&&logical.has(key))","existingHashes.has(hash+'|'+key)");
source=once(source,"existing.map(d=>text(d.sha256||d.content_hash||d.metadata?.sha256).toLowerCase()).filter(Boolean)","existing.filter(d=>text(d.sha256||d.content_hash||d.metadata?.sha256)).map(d=>text(d.sha256||d.content_hash||d.metadata?.sha256).toLowerCase()+'|'+`${upper(d.load_no||d.loadNo||d.extracted?.loadNo)}|${text(d.type||d.extracted?.type).toLowerCase()}|${Number(d.stopSequence||d.extracted?.stopSequence||0)}`)");
source=once(source,'existingHashes.add(hash);logical.add(key);','existingHashes.add(hash+\'|\'+key);logical.add(key);');
write(repairImport,source);

// Preserve each document family's structured fields through all quota compaction paths.
const familyKeys=['linkEventId','eventId','stopId','pickupStopId','deliveryStopId','merchant','vendor','city','state','cityState','location','gallons','fuelGallons','fuelType','pricePerGallon','transactionId','transactionDate','transactionTime','odometer','iftaEligible','receiverName','receivedBy','podSigned','signaturePresent','deliveredAt','damageNote','damageNotes','deliveryDate','serviceDescription','labor','parts','vin','actualPay','netPay','deductions','documentScope','transactionCount','periodStart','periodEnd','statementVerified'];
const compact='source/src/modules/scan/rateConSaveStabilityV10964.js';
source=read(compact);
source=once(source,'  const out = {};\n  for (const [key, value] of Object.entries(fields || {})) {','  '+JSON.stringify(familyKeys)+'.forEach(key=>allowed.add(key));\n  const out = {};\n  if(Array.isArray(fields.transactions))out.transactions=fields.transactions.map(row=>({...row}));\n  for (const [key, value] of Object.entries(fields || {})) {');
write(compact,source);
const business='source/src/modules/business/businessStore.js';
source=read(business);
source=once(source,'  const out = {};\n  for (const [key, item] of Object.entries(value)) {','  '+JSON.stringify(familyKeys)+'.forEach(key=>keep.add(key));\n  const out = {};\n  if(Array.isArray(value.transactions))out.transactions=value.transactions.map(row=>({...row}));\n  for (const [key, item] of Object.entries(value)) {');
write(business,source);

const router='source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';
source=read(router);
source=once(source,"import { analyzeFuelReceiptV1 } from './fuelReceiptEngineV1.js';","import { analyzeFuelReceiptV1103 as analyzeFuelReceiptV1 } from '../../document-readers/fuel-receipt/FuelReceiptReaderV1103.js';");
write(router,source);

const scan='source/src/modules/scan/SmartScanSheetV105.jsx';
source=prepend(read(scan),"import { resolveArchiveDocumentLink } from '../owneros/archiveEvidenceV1103.js';\nimport { parseFuelStatement, fuelStatementFields, upsertFuelTransactions } from '../document-readers/fuel-receipt/fuelStatementV1103.js';");
source=once(source,"  const bucket = operationalBucket(meta);","  if(meta.id==='fuel_receipt' && fields.documentScope==='statement')return upsertFuelTransactions(store,record,fields);\n  const bucket = operationalBucket(meta);");
source=once(source,"      equipment:fields.equipment || '',\n      aliases:","      equipment:fields.equipment || '',\n      stops:Array.isArray(fields.stops)?fields.stops:[],\n      aliases:");
source=once(source,'      const mergedFields = {','      const statementV1103=meta.id===\'fuel_receipt\'?parseFuelStatement(/\\.csv$/i.test(file.name||\'\')?await file.text():analysis?.text||\'\'):null;\n      if(statementV1103&&!statementV1103.valid)throw new Error(\'Fuel statement needs review: \'+statementV1103.issues.map(i=>i.code).join(\', \'));\n      const mergedFields = {');
source=once(source,'      const storageFieldsV10964 = compactRateConSaveFieldsV10964(mergedFields);','      if(statementV1103)Object.assign(mergedFields,fuelStatementFields(statementV1103));\n      const storageFieldsV10964 = compactRateConSaveFieldsV10964(mergedFields);');
source=once(source,'      let nextStore = upsertVaultDocumentV105(currentStore, record, state);','      const archiveLinkV1103=resolveArchiveDocumentLink(record,state);\n      record.archiveLink=archiveLinkV1103;\n      record.linkedEventId=archiveLinkV1103.eventId || \'\';\n      if(archiveLinkV1103.day)record.linkDay=archiveLinkV1103.day;\n      if(statementV1103){record.canonicalLoadNo=\'\';record.loadNo=\'\';record.canonicalLoadId=\'\';}\n      let nextStore = upsertVaultDocumentV105(currentStore, record, state);');
source=once(source,'      writeBusinessStore(nextStore);\n      const savedViewV10964', '      writeBusinessStore(nextStore);\n      if(record.linkToLogbook)dispatchVaultDocumentCommitV105({document:record,record,documentId:record.id,day:record.linkDay,eventId:record.linkedEventId,loadNo:record.canonicalLoadNo});\n      const savedViewV10964');
source=once(source,"          linkDay:linkToLogbook ? linkDay : '',\n          family:","          linkDay:linkToLogbook ? linkDay : '',\n          logDate:linkToLogbook ? linkDay : '',\n          eventChainId:storageFieldsV10964.linkEventId || null,\n          family:");
// A multi-date statement belongs to its transactions; it cannot be attached wholesale to one load or duty event.
source=source.replace('if(statementV1103)Object.assign(mergedFields,fuelStatementFields(statementV1103));',"if(statementV1103)Object.assign(mergedFields,fuelStatementFields(statementV1103),{canonicalLoadNo:'',loadNo:'',linkDay:'',linkToLogbook:false,stopSequence:0});");
source=source.replace('          loadNo:selectedLoadNo,',"          loadNo:statementV1103?'':selectedLoadNo,");
source=source.replace("          linkDay:linkToLogbook ? linkDay : '',","          linkDay:!statementV1103 && linkToLogbook ? linkDay : '',")
  .replace("          logDate:linkToLogbook ? linkDay : '',","          logDate:!statementV1103 && linkToLogbook ? linkDay : '',")
  .replace('          eventChainId:storageFieldsV10964.linkEventId || null,','          eventChainId:statementV1103?null:storageFieldsV10964.linkEventId || null,');
source=source.replace('      const archiveLinkV1103=resolveArchiveDocumentLink(record,state);',"      record.sha256=stored.localDocument?.sha256 || '';\n      if(statementV1103)Object.assign(record,{canonicalLoadNo:'',loadNo:'',load_no:'',canonicalLoadId:'',broker:'',stopSequence:0,linkToLogbook:false,linkDay:'',linkedEventId:'',documentScope:'statement'});\n      const archiveLinkV1103=statementV1103?{status:'statement',eventId:'',day:''}:resolveArchiveDocumentLink(record,state);");
write(scan,source);

const scanStorage='source/src/modules/scan/quotaSafeScanStorageV10963.js';
source=read(scanStorage);
const hashFunction="async function originalSha256V1103(blob){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');}";
source=prepend(source,hashFunction);
source=once(source,"value.slice(0, key === 'stops' ? 40 : 24)","value.slice(0, key === 'transactions' ? value.length : key === 'stops' ? 40 : 24)");
source=once(source,"  const originalFileName = safeFileNameV10963(file.name || 'document.bin');","  const originalFileName = safeFileNameV10963(file.name || 'document.bin');\n  const originalHashV1103=await originalSha256V1103(file);");
source=once(source,'    const existing = await recentDuplicateV10963(db, signature);\n    if (existing) {','    let existing = await recentDuplicateV10963(db, signature);\n    if(existing){const prior=await blobForDocumentV10963(db,existing.client_document_id);const hash=existing.sha256 || (prior?.blob?await originalSha256V1103(prior.blob):null);if(hash!==originalHashV1103)existing=null;}\n    if (existing) {');
source=once(source,'        ...existing,\n        title:', '        ...existing,\n        sha256:originalHashV1103,\n        title:');
source=once(source,'    local_id:localId,\n    server_id:null,','    local_id:localId,\n    sha256:originalHashV1103,\n    server_id:null,');
write(scanStorage,source);

// Do not include persisted login sessions in a shareable device safety archive.
const safety='lib/local-db/safetyArchive.js';
source=read(safety);
source=once(source,"    if (!LOCAL_PREFIXES.some(prefix => lower.startsWith(prefix))) continue;", "    if (!LOCAL_PREFIXES.some(prefix => lower.startsWith(prefix))) continue;\n    if (/(?:auth|access.?token|refresh.?token|password|secret)/i.test(lower)) continue;");
write(safety,source);

// The public API lock change is the reviewed additive export above.
const locksPath='module-locks.v1.json',locks=JSON.parse(read(locksPath));
assert.equal(locks.files[api],'9076fbd5bce90b635f5aefae6258243b40afa92d4f17c8c174d522a4438a6dab','Unexpected public API baseline');
locks.files[api]=crypto.createHash('sha256').update(read(api)).digest('hex');
write(locksPath,JSON.stringify(locks,null,2)+'\n');

const VERSION='110.3.0',BUILD='v110300-live-archive-evidence';
for(const path of ['release-version.json','public/app-version.json']) {
  const meta=JSON.parse(read(path));
  Object.assign(meta,{version:VERSION,build:BUILD,force:false,label:'Live archive evidence',updatedAt:new Date().toISOString(),releasedAt:new Date().toISOString(),
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || meta.sourceCommit || null,
    notes:['Current archive reports follow saved Logbook event changes.','Daily mileage is counted once; unassigned load mileage is shown for review.','Fuel statements preserve each transaction and its date.','Original document hashes and complete archive paths are preserved.']});
  write(path,JSON.stringify(meta,null,2)+'\n');
}
for(const [path,prefix] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
  source=read(path).replace(new RegExp('(const '+prefix+'_VERSION = )[\'\"][^\'\"]+[\'\"]'),"$1'"+VERSION+"'")
    .replace(new RegExp('(const '+prefix+'_BUILD = )[\'\"][^\'\"]+[\'\"]'),"$1'"+BUILD+"'");write(path,source);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx'])write(path,read(path).replace(/(App v|APP V)110\.2\.12/g,'$1'+VERSION));
const continuityTest='scripts/test-duty-graph-continuity.mjs';
source=read(continuityTest).replace("assert.equal(meta.version,'110.2.12');assert.equal(meta.build,'v110212-duty-graph-continuity');assert.equal(meta.force,false);",`assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');assert.equal(meta.force,false);`);
write(continuityTest,source);
console.log('PASS — live archive, mileage, verified document links, statement handling and exact exports materialized');

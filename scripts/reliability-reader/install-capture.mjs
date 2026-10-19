import fs from 'node:fs';
import path from 'node:path';
import {moduleDirectiveFirst,prependModuleImport} from './importOrder.mjs';

export function installCapture(root){
 const here=path.dirname(new URL(import.meta.url).pathname),scan='source/src/modules/scan/',owner='source/src/modules/owneros/';
 const read=file=>fs.readFileSync(path.join(root,file),'utf8'),write=(file,text)=>fs.writeFileSync(path.join(root,file),moduleDirectiveFirst(text));
 const patch=(file,before,after)=>{const text=read(file);if(text.includes(after))return;if(text.split(before).length!==2)throw Error('Capture reliability anchor changed: '+file+' / '+before.slice(0,90));write(file,text.replace(before,()=>after));};
 const addImport=(file,line)=>{if(!read(file).includes(line))write(file,prependModuleImport(read(file),line));};
 for(const name of ['captureOriginals','captureTransfer'])write(scan+name+'.js',fs.readFileSync(path.join(here,name+'.js'),'utf8'));
 const capture=scan+'captureAssetStoreV106.js';
 addImport(capture,"import Dexie from 'dexie';");
 addImport(capture,"import {persistCaptureRun,resolveCaptureOriginal} from './captureOriginals.js';");
 patch(capture,'export async function persistCaptureAssetsV106({','async function legacyPersistCaptureAssetsV106({');
 if(!read(capture).includes('// capture-reliability:writer'))write(capture,read(capture)+`\n// capture-reliability:writer
export async function persistCaptureAssetsV106(options={}){
 return persistCaptureRun(options,{db:getOwnerOpDb(),groupAssets:groupCaptureAssetsV106,waitFor:promise=>Dexie.waitFor(promise)});
}
`);
 patch(capture,'  if (row?.blob) return row.blob;','  if(row)return (await resolveCaptureOriginal(getOwnerOpDb(),row)).blob;');
 patch(capture,`  const rows = await db.capture_asset_blobs.where('client_document_id').equals(clientDocumentId).toArray();
  if (!rows.some(row => row.capture_run_id === runId)) return false;
  await db.transaction('rw', db.capture_asset_blobs, db.documents_local, async () => {`,
 `  return db.transaction('rw', db.capture_asset_blobs, db.documents_local, async () => {
    // Read and select within the same transaction as concurrent capture saves.
    const rows = await db.capture_asset_blobs.where('client_document_id').equals(clientDocumentId).toArray();
    if (!rows.some(row => row.capture_run_id === runId)) return false;`);
 patch(capture,'    const selected = rows.filter(row => row.capture_run_id === runId).map(descriptorV106);','    const selected = rows.filter(row => row.capture_run_id === runId).map(row=>descriptorV106({...row,current:true}));');
 patch(capture,"      capture_runs:(document?.capture_runs || []).map(run => ({ ...run, current:run.runId === runId })),\n      updated_at:new Date().toISOString(),\n    });\n  });\n  return true;", "      capture_runs:(document?.capture_runs || []).map(run => ({ ...run, current:run.runId === runId })),\n      updated_at:new Date().toISOString(),\n    });\n    return true;\n  });");

 const safety='lib/local-db/safetyArchive.js';
 addImport(safety,"import {validateCaptureArchive} from '../../source/src/modules/scan/captureOriginals.js';");
 patch(safety,'  const payloadJson = JSON.stringify(payload);','  await validateCaptureArchive(dexie);\n  const payloadJson = JSON.stringify(payload);');
 const portable='source/src/modules/backup/portableBackupV110429.js';
 addImport(portable,"import {validateCaptureArchive} from '../scan/captureOriginals.js';");
 patch(portable,'  validateOriginalReferences(rowsByTable.document_blobs||[]);','  validateOriginalReferences(rowsByTable.document_blobs||[]);\n  await validateCaptureArchive(rowsByTable);');
 const large='source/src/modules/backup/largeBackupV110431.js';
 addImport(large,"import {validateCaptureDatabase,validateCaptureGraph} from '../scan/captureOriginals.js';");
 patch(large," if(!db)throw new Error('The document database is unavailable.');"," if(!db)throw new Error('The document database is unavailable.');\n await validateCaptureDatabase(db,{check:()=>checkAbort(signal)});");
 patch(large," payload.state=await serialize(state);payload.businessStore=await serialize(businessStore);"," validateCaptureGraph(payload.dexie);\n payload.state=await serialize(state);payload.businessStore=await serialize(businessStore);");
 const everything='source/src/modules/backup/everythingZipV110430.js';
 addImport(everything,"import {validateCaptureArchive} from '../scan/captureOriginals.js';");
 patch(everything,"  const entries=[], manifest=[], seen=new Map(), docPaths=new Map();","  await validateCaptureArchive(archive.payload?.dexie||{});\n  const entries=[], manifest=[], seen=new Map(), docPaths=new Map();");

 const account='lib/owner-op-cloud/accountSyncV110455.js';
 addImport(account,"import {validateCaptureAccountRecords,validateCaptureAccountInstall} from '../../source/src/modules/scan/captureOriginals.js';");
 patch(account,' dirty.clear();return out;',' if(scope===\'all\')validateCaptureAccountRecords(out);\n dirty.clear();return out;');
 patch(account," const next=bundleFrom(mergeScope(rawRecords,decoded,scope),local.state);await check();await flushAppSnapshots();",` if(scope==='all')await validateCaptureAccountInstall(records,async(key,table,id)=>{
  const stageKey=staged.get(key);if(!stageKey)return db.table(table).get(id);
  const row=await db.account_receive_staging.get(stageKey);
  if(!row||!same(row.encoded,records[key]))throw Error('Received capture checkpoint is missing. Retry sync.');
  return row.decoded;
 },{check});
 const next=bundleFrom(mergeScope(rawRecords,decoded,scope),local.state);await check();await flushAppSnapshots();`);
 patch(account,"     const receipt=await checked(cloudClient().rpc('road_ready_account_commit_v1',{p_device:device(),p_expected:0,p_payload:payload}));", "     validateCaptureAccountRecords(payload.records);\n     const receipt=await checked(cloudClient().rpc('road_ready_account_commit_v1',{p_device:device(),p_expected:0,p_payload:payload}));");
 patch(account,"   const payload={...(remote?.payload||{}),format:FORMAT,records:mergeScope(remote?.payload?.records||{},merge.records,scope)};let revision=remote?.revision||0;", "   const payload={...(remote?.payload||{}),format:FORMAT,records:mergeScope(remote?.payload?.records||{},merge.records,scope)};let revision=remote?.revision||0;\n   if(scope==='all')validateCaptureAccountRecords(payload.records);");

 const transfer=owner+'transferStorageV110412.js';
 addImport(transfer,"import {readCaptureEvidence,importCaptureEvidence} from '../scan/captureOriginals.js';");
 patch(transfer,"  row.linkToLogbook = false;",`  // Source-device owner IDs and cloud checkpoints cannot bind a newly imported
  // filing. Verified transfer bytes establish its destination owner below.
  for(const key of ['original_client_document_id','originalClientDocumentId','original_blob_id','originalBlobId','cloud_document_id_v1','cloud_client_document_id_v1','original_cloud_client_document_id_v1','original_server_id_v1','original_upload_v1','upload_metadata_v1','original_sync_state','metadata_sync_state'])delete row[key];
  row.linkToLogbook = false;`);
 if(!read(transfer).includes('export async function readTransferCaptureAssets'))write(transfer,read(transfer)+`\nexport async function readTransferCaptureAssets(record){return readCaptureEvidence(getOwnerOpDb(),record);}\n`);
 patch(transfer,"      await db.transaction('rw', db.documents_local, db.document_blobs, async () => {", "      await db.transaction('rw', db.documents_local, db.document_blobs, ...(checked.captureDecoded?.length?[db.capture_asset_blobs]:[]), async () => {");
 patch(transfer,'        if(options.finalizeDocuments)await options.finalizeDocuments({db,rows,next});',"        if(checked.captureDecoded?.length)await importCaptureEvidence(db,checked.captureDecoded,{waitFor:promise=>Dexie.waitFor(promise)});\n        if(options.finalizeDocuments)await options.finalizeDocuments({db,rows,next});");
 const transferCore=owner+'transferCoreV110412.js';
 addImport(transferCore,"import {encodeTransferCaptures,compactCaptureTransfer,expandCaptureTransfer,decodeTransferCaptures} from '../scan/captureTransfer.js';");
 patch(transferCore,'export async function prepareTransfer(options, readBlob, onProgress = () => {}) {','export async function prepareTransfer(options, readBlob, onProgress = () => {}, readCaptures=async()=>[]) {');
 patch(transferCore,'  let totalBytes = 0;','  let totalBytes = 0;const captureContent=new Set();');
 patch(transferCore,'    documents.push({record, original:{base64:base64(bytes), size:bytes.length, type:originalType(blob.type || record.mime_type), sha256:await digest(bytes)}});',`    documents.push({record, original:{base64:base64(bytes), size:bytes.length, type:originalType(blob.type || record.mime_type), sha256:await digest(bytes)}});
    const item=documents.at(-1);captureContent.add(item.original.sha256);
    const captures=await encodeTransferCaptures(record,readCaptures);
    if(captures.length){item.captures=captures;for(const capture of captures)if(!captureContent.has(capture.original.sha256)){captureContent.add(capture.original.sha256);totalBytes+=capture.original.size;}}
    if(totalBytes>MAX_FILE_BYTES*.65)throw Error('This scope includes too much saved photo evidence for one transfer. Export a smaller scope.');`);
 patch(transferCore,'  const payload = compactTransferOriginals({format:FORMAT, version:1, createdAt:new Date().toISOString(), scope:selected.scope, records:clone(selected.records), documents});','  const payload = compactCaptureTransfer(compactTransferOriginals({format:FORMAT, version:1, createdAt:new Date().toISOString(), scope:selected.scope, records:clone(selected.records), documents}));');
 patch(transferCore,'  payload=expandTransferOriginals(payload);','  payload=expandTransferOriginals(expandCaptureTransfer(payload));');
 patch(transferCore,'  return {...payload, decoded};','  const captureDecoded=await decodeTransferCaptures(payload.documents,MAX_FILE_BYTES*.65-total);\n  return {...payload, decoded, captureDecoded};');
 const panel=owner+'TransferPanelV110412.jsx';
 patch(panel,'import {importTransfer,readTransferOriginal}', 'import {importTransfer,readTransferOriginal,readTransferCaptureAssets}');
 patch(panel,'originals…`));','originals…`),readTransferCaptureAssets);');

 const packet=owner+'evidenceWorkspacePacketV110453.js';
 patch(packet,"import {readTransferOriginal} from './transferStorageV110412.js';", "import {readTransferOriginal,readTransferCaptureAssets} from './transferStorageV110412.js';");
 patch(packet,' const createdAt=new Date().toISOString(),label=PACKETS[filters.scenario]||PACKETS.all;',` // capture-reliability:selected-evidence
 const originalCount=files.size,captureAssets=[],captureReader=arguments[2]?.readCaptureAssets||readTransferCaptureAssets;
 for(const row of rows.filter(item=>item.kind==='document'))for(const item of await captureReader(row.source)){
  checkAbort(signal);const checks=await inspectBlob(item.blob,{signal}),contentKey=checks.size+':'+checks.hashes.join(':');
  let path=files.get(contentKey);
  if(!path){path='Capture-versions/'+String(files.size+1).padStart(4,'0')+'-'+safeName(item.record.file_name||'saved-photo');zip.add(path,item.blob,checks);files.set(contentKey,path);}
  captureAssets.push({...item.record,documentId:row.id,path,chunkSha256:checks.hashes});
 }
 const captureFiles=files.size-originalCount;
 if(captureAssets.length)await zip.text('Capture-versions.json',JSON.stringify({format:'road_ready_capture_evidence_v1',assets:captureAssets},null,2),{signal});
 const createdAt=new Date().toISOString(),label=PACKETS[filters.scenario]||PACKETS.all;`);
 let packetText=read(packet);packetText=packetText.replaceAll('originals:files.size','originals:originalCount,captureAssets,captureFiles').replace("+files.size+' original files</p>'","+originalCount+' original files'+(captureFiles?' · '+captureFiles+' saved photo files':'')+'</p>'");write(packet,packetText);

 const documents='source/src/modules/backup/documentsExportV110433.js';
 addImport(documents,"import {readCaptureEvidence} from '../scan/captureOriginals.js';");
 patch(documents,'// scanner variants, retry queues or localStorage, and cannot certify a device backup.','// retry queues or localStorage, and cannot certify a device backup. Saved capture\n// versions are included only for the documents belonging to this export.');
 patch(documents,"    return true;\n  }\n  // Keep every saved original", "    return path;\n  }\n  // Keep every saved original");
 patch(documents,'  // Current legacy wallet, logbook and business attachments can predate the vault.',`  const captureVersions=[];
  for(const record of documents)for(const item of await readCaptureEvidence(db,record)){
    const path=await addOriginal(item.blob,{...record,original_file_name:item.record.file_name,type:'capture-variant'},'',true);
    captureVersions.push({...item.record,path});
  }
  if(captureVersions.length)await zip.text('Documents/Capture-versions.json',JSON.stringify(captureVersions,null,2),{signal});
  // Current legacy wallet, logbook and business attachments can predate the vault.`);
 patch(documents,"  async function addOriginal(blob, record = {}, fallback = '') {", "  async function addOriginal(blob, record = {}, fallback = '', isCapture = false) {");
 patch(documents,'    if (id) found.add(id);','    if (id && !isCapture) found.add(id);');
 patch(documents,"    const path=await addOriginal(item.blob,{...record,original_file_name:item.record.file_name,type:'capture-variant'});", "    const path=await addOriginal(item.blob,{...record,original_file_name:item.record.file_name,type:'capture-variant'},'',true);");
 console.log('PASS — immutable capture byte owners, complete selected exports and verified restore/account references installed');
}

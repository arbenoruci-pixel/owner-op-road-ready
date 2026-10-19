import fs from 'node:fs';
import path from 'node:path';
import {moduleDirectiveFirst,prependModuleImport} from './importOrder.mjs';
import {installCapture} from './install-capture.mjs';
const root=path.resolve(process.argv[2]||process.cwd()),here=path.dirname(new URL(import.meta.url).pathname);
const scan='source/src/modules/scan/';
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const write=(file,source)=>fs.writeFileSync(path.join(root,file),moduleDirectiveFirst(source));
function patch(file,before,after){const source=read(file);if(source.includes(after))return;if(source.split(before).length!==2)throw Error('Reader reliability anchor changed: '+file+' / '+before.slice(0,100));write(file,source.replace(before,after));}
function addImport(file,names,from){
 let source=read(file);const pattern=/^import\s*\{([^}]+)\}\s*from\s*(['"])([^'"]+)\2;?\n?/gm;
 const imports=[...source.matchAll(pattern)].filter(match=>match[3]===from),members=new Set(names.split(',').map(value=>value.trim()));
 for(const match of imports)for(const member of match[1].split(','))members.add(member.trim());
 const line=`import {${[...members].join(',')}} from '${from}';`;
 if(imports.length){let first=true;source=source.replace(pattern,(whole,fields,quote,origin)=>origin!==from?whole:first?(first=false,line+'\n'):'');write(file,source);return;}
 write(file,prependModuleImport(source,line));
}
function addDefaultImport(file,name,from){
 let source=moduleDirectiveFirst(read(file));const line=`import ${name} from '${from}';`;
 if(!source.includes(line))source=prependModuleImport(source,line);
 write(file,source);
}
function replaceFunction(file,name,replacement){let source=read(file);const marker='// reader-reliability:'+name;if(source.includes(marker))return;const start=source.indexOf('export async function '+name+'(');if(start<0)throw Error('Missing function '+name+' in '+file);
 if(name==='addOriginal'){source=source.slice(0,start)+marker+'\n'+replacement;write(file,source);return;}
 throw Error('Unbounded function patch is not permitted: '+name);
}
for(const name of ['originalStore','documentSave','cloudOriginal','saveAdapter','filingContext','transferContent','documentSyncLabel'])write(scan+name+'.js',fs.readFileSync(path.join(here,name+'.js'),'utf8'));

// Both scanner entrypoints use one durable writer. Legacy code remains in the
// generated module for compatibility but is no longer the exported save path.
for(const [file,name]of [[scan+'quotaSafeScanStorageV10963.js','saveScannedDocumentQuotaSafeV10963'],[scan+'scanStorage.js','saveScannedDocument']]){
 patch(file,'export async function '+name+'(','async function legacy_'+name+'(');
 const line=`export {saveScannedDocumentReliable as ${name}} from './saveAdapter.js';`;
 if(!read(file).includes(line))write(file,read(file)+'\n'+line+'\n');
}

// Replace point reads throughout the materialized runtime, retaining raw table
// enumeration for backup/account transport (one owner and small references).
const excluded=new Set(['originalStore.js','documentSave.js','saveAdapter.js']);
function visit(dir){if(!fs.existsSync(path.join(root,dir)))return;for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
 const file=path.posix.join(dir,entry.name);if(entry.isDirectory())visit(file);else if(/\.js$/.test(file)&&!excluded.has(entry.name)){
  let source=read(file);const pattern=/db\.document_blobs\.where\('client_document_id'\)\.equals\(([^\n;]+?)\)\.first\(\)/g;
  if(!pattern.test(source))continue;pattern.lastIndex=0;source=source.replace(pattern,'readOriginalRow(db, $1)');write(file,source);
  let from=path.posix.relative(path.posix.dirname(file),scan+'originalStore.js');if(!from.startsWith('.'))from='./'+from;addImport(file,'readOriginalRow',from);
 }
}}
visit('source/src');visit('lib/owner-op-cloud');

// Explicit Add context is frozen for this open sheet, including asynchronous
// classification/review callbacks. It never supplies the document's own date.
const sheet=scan+'SmartScanSheetV105.jsx';
addImport(sheet,'freezeFilingContext,retainFilingChoice,assertFilingContext,filingContextMessage','./filingContext.js');
patch(sheet,'const storageFieldsV10964 = compactRateConSaveFieldsV10964(mergedFields);','const storageFieldsV10964 = {...mergedFields}; // Preserve the complete reviewed fields, appointments and source boundaries.');
patch(sheet,"  const [file, setFile] = useState(null);","  const [fixedFilingContext] = useState(()=>freezeFilingContext(evidenceContextV110413));\n  const [file, setFile] = useState(null);");
for(const [state,setter,key]of [['selectedType','setSelectedType','type'],['selectedLoadNo','setSelectedLoadNo','loadNo'],['selectedStopSequence','setSelectedStopSequence','stopSequence'],['loadSelectionSourceV11037','setLoadSelectionSourceV11037','assignment'],['linkToLogbook','setLinkToLogbook','linkToLogbook']]){
 let source=read(sheet);if(source.includes('function '+setter+'(value) {'))continue;
 const expression=new RegExp(`const \\[${state},\\s*${setter}\\]\\s*=\\s*useState\\(([^;]+)\\);`),match=source.match(expression);
 if(!match)throw Error('Missing filing state '+state);
 source=source.replace(expression,`const [${state}, ${setter}State] = useState(()=>retainFilingChoice(fixedFilingContext,'${key}',${match[1]}));\n  function ${setter}(value) { ${setter}State(previous=>retainFilingChoice(fixedFilingContext,'${key}',typeof value==='function'?value(previous):value)); }`);write(sheet,source);
}
patch(sheet,'      const currentStore = migrateBusinessStoreV105(readBusinessStore(), state);',"      assertFilingContext(fixedFilingContext,{type:selectedType,loadNo:selectedLoadNo,stopSequence:selectedStopSequence,linkToLogbook});\n      const currentStore = migrateBusinessStoreV105(readBusinessStore(), state);");
patch(sheet,'value={selectedType} onChange=', 'value={selectedType} disabled={Boolean(fixedFilingContext)} onChange=');
patch(sheet,"<LoadFolderPicker candidates={candidates} value={selectedLoadNo || ''} onChange={chooseLoad} createLoadNo={selectedType === 'rate_confirmation' ? primaryLoadReference(analysis) : ''}/>","(fixedFilingContext?<ConfirmCard label=\"2 · Load folder\" value={'Load '+fixedFilingContext.loadNo} detail=\"Selected from Add; this folder is fixed for this document.\"/>:<LoadFolderPicker candidates={candidates} value={selectedLoadNo || ''} onChange={chooseLoad} createLoadNo={selectedType === 'rate_confirmation' ? primaryLoadReference(analysis) : ''}/>)");
patch(sheet,'Requested folder: Load {evidenceContextV110413.loadNo}. Confirm the folder below; source references may differ.', '{filingContextMessage(fixedFilingContext,sourceAnalysisV110393 || analysis)}');
patch(sheet,"    setStage('saving');\n    setMessage('');\n    try {", "    setStage('saving');\n    setMessage('');\n    let durableOriginal=false;\n    try {");
patch(sheet,'      const captureStorageV3 = await persistCaptureAssetsV106({','      durableOriginal=true;\n      const captureStorageV3 = await persistCaptureAssetsV106({');
patch(sheet,'      stored.capture = captureStorageV3;', "      if((analysis?.scanMeta?.captureAssets||[]).length&&captureStorageV3.status!=='stored')throw Error('Original scan photos could not be stored. Keep these pages open and retry.');\n      stored.capture = captureStorageV3;");
patch(sheet,'      writeBusinessStore(nextStore);', '      writeBusinessStore(nextStore,{preserveEvidence:true});');
// A RateCon describes the whole load. Reimport must not become a different
// filing when the matcher discovers a delivery stop in the now-saved guide.
patch(sheet,'      const meta = selectedMeta;',"      const meta = selectedMeta;\n      const filingStopSequence=meta.id==='rate_confirmation'?0:Number(selectedStopSequence||0);");
patch(sheet,'        stop:selectedStop,\n        stopSequence:Number(selectedStopSequence || 0),','        stop:filingStopSequence?selectedStop:null,\n        stopSequence:filingStopSequence,');
patch(sheet,'        loadNo:selectedLoadNo,\n        stopSequence:Number(selectedStopSequence || 0),','        loadNo:selectedLoadNo,\n        stopSequence:filingStopSequence,');
patch(sheet,'        selectedStopSequence,\n        selectedStop,','        selectedStopSequence:filingStopSequence,\n        selectedStop:filingStopSequence?selectedStop:null,');
patch(sheet,"saved.stored.cloud?.status === 'synced' ? 'Cloud synced' : 'Saved in this app on this device'", "['synced','original_synced'].includes(saved.stored.cloud?.status) ? 'Cloud original saved' : 'Saved in this app on this device'");
patch(sheet,"      setMessage(`Document was not saved. ${String(error?.message || error)}`);", "      setMessage(`${durableOriginal?'The original is saved on this device; filing did not finish. Retry keeps the same document.':'Document was not saved.'} ${String(error?.message || error)}`);");
const business='source/src/modules/business/businessStore.js';
patch(business,'export function writeBusinessStore(value = {}) {','export function writeBusinessStore(value = {},options={}) {');
patch(business,'    if (!isBusinessQuotaErrorV10963(error)) throw error;','    if(options.preserveEvidence)throw error; // Explicit document saves keep complete review/history or fail visibly.\n    if (!isBusinessQuotaErrorV10963(error)) throw error;');
const documentFoundation='source/src/modules/documents/documentFoundationV105.js';
patch(documentFoundation,"    syncState:textV105(stored.cloud?.status || local.sync_state || existing?.syncState || 'local_only'),", "    syncState:textV105(stored.cloud?.status || local.sync_state || existing?.syncState || 'local_only'),\n    originalSyncState:textV105(local.original_sync_state||(['synced','original_synced'].includes(stored.cloud?.status)?'synced':existing?.originalSyncState)||''),\n    metadataSyncState:stored.cloud?.metadataPending?'pending_account':textV105(local.metadata_sync_state||existing?.metadataSyncState),\n    cloudSyncScope:textV105(stored.cloud?.scope||existing?.cloudSyncScope),");
const documentVault='source/src/modules/documents/DocumentVaultV105.jsx';
addImport(documentVault,'documentSyncLabel','../scan/documentSyncLabel.js');
patch(documentVault,"{document.syncState === 'synced' ? 'Cloud synced' : 'Available offline'}",'{documentSyncLabel(document)}');

// Archive transfer shares the binary payload and restores each independent
// filing. Original historical rows and signed versions are never removed.
const transfer='source/src/modules/owneros/transferStorageV110412.js';
addImport(transfer,'storeOriginalRow','../scan/originalStore.js');
addImport(transfer,'resolveCloudOriginalClientId','../scan/originalStore.js');
patch(transfer,'export async function readTransferOriginal(record) {','export async function readTransferOriginal(record) {\n  record={...record,original_cloud_client_document_id_v1:await resolveCloudOriginalClientId(getOwnerOpDb(),record)};');
const navigationOriginal='source/src/core/navigation/documentOriginalV110477.js';
addImport(navigationOriginal,'originalClientId','../../modules/scan/originalStore.js');
addImport(navigationOriginal,'cloudOriginalClientId','../../modules/scan/originalStore.js');
if(!read(navigationOriginal).includes('const originalId='))patch(navigationOriginal,"  if(!/^[a-zA-Z0-9_-]{1,160}$/.test(clientId))return null;", "  const originalId=originalClientId(record)||clientId;\n  if(!/^[a-zA-Z0-9_-]{1,160}$/.test(originalId))return null;");
patch(navigationOriginal,'const originalId=originalClientId(record)||clientId;','const originalId=cloudOriginalClientId(record)||clientId;');
patch(navigationOriginal,'body:JSON.stringify({client_document_id:clientId})','body:JSON.stringify({client_document_id:originalId})');
const savedFileActions='source/src/modules/owneros/SavedDocumentFilesV110344.jsx';
addImport(savedFileActions,'resolveCloudOriginalClientId','../scan/originalStore.js');
patch(savedFileActions,"          const response = await fetch('/api/documents/read-original',", "          const cloudClientId=await resolveCloudOriginalClientId(getOwnerOpDb(),doc);\n          const response = await fetch('/api/documents/read-original',");
patch(savedFileActions,'body:JSON.stringify({client_document_id:doc.client_document_id})','body:JSON.stringify({client_document_id:cloudClientId})');
patch(transfer,'if (original) await db.document_blobs.put(restored); else await db.document_blobs.add(restored);','await storeOriginalRow(db,restored,{sha256:item.original.sha256,waitFor:promise=>Dexie.waitFor(promise)});');
patch(transfer,"await db.document_blobs.add({local_blob_id:`transfer-blob-${clientId}`, client_document_id:clientId, blob:item.blob, created_at:new Date().toISOString()});", "const savedOriginal=await storeOriginalRow(db,{local_blob_id:`transfer-blob-${clientId}`,client_document_id:clientId,blob:item.blob,created_at:new Date().toISOString()},{sha256:item.original.sha256,waitFor:promise=>Dexie.waitFor(promise)});\n          row.original_client_document_id=savedOriginal.owner.client_document_id;row.original_blob_id=savedOriginal.owner.local_blob_id;await db.documents_local.put(row);");
const transferCore='source/src/modules/owneros/transferCoreV110412.js';
addImport(transferCore,'compactTransferOriginals,expandTransferOriginals','../scan/transferContent.js');
if(!read(transferCore).includes('const payload = compactCaptureTransfer('))patch(transferCore,'const payload = {format:FORMAT, version:1, createdAt:new Date().toISOString(), scope:selected.scope, records:clone(selected.records), documents};','const payload = compactTransferOriginals({format:FORMAT, version:1, createdAt:new Date().toISOString(), scope:selected.scope, records:clone(selected.records), documents});');
if(!read(transferCore).includes('payload=expandTransferOriginals(expandCaptureTransfer(payload))'))patch(transferCore,'export async function validateTransfer(payload) {','export async function validateTransfer(payload) {\n  payload=expandTransferOriginals(payload);');

const library='source/src/modules/owneros/libraryStorageV110434.js';
addImport(library,'storeOriginalRow','../scan/originalStore.js');
patch(library,"await db.document_blobs.put({local_blob_id:saved?.local_blob_id||'library-blob-'+row.client_document_id,client_document_id:row.client_document_id,blob:original,created_at:new Date().toISOString()});", "const originalSaved=await storeOriginalRow(db,{local_blob_id:saved?.local_blob_id||'library-blob-'+row.client_document_id,client_document_id:row.client_document_id,blob:original,created_at:new Date().toISOString()},{sha256:d.sha256,waitFor:promise=>Dexie.waitFor(promise)});row.original_client_document_id=originalSaved.owner.client_document_id;row.original_blob_id=originalSaved.owner.local_blob_id;");
const offline='source/src/modules/owneros/offlineOriginalV110371.js';
addImport(offline,'storeOriginalRow','../scan/originalStore.js');
addDefaultImport(offline,'Dexie','dexie');
patch(offline,"    await db.document_blobs.put({local_blob_id:`offline-original-${document.client_document_id}`,\n      client_document_id:document.client_document_id, blob, created_at:new Date().toISOString()});", "    const original=await storeOriginalRow(db,{local_blob_id:`offline-original-${document.client_document_id}`,client_document_id:document.client_document_id,blob,created_at:new Date().toISOString()},{sha256:current.sha256||undefined,waitFor:promise=>Dexie.waitFor(promise)});");
patch(offline,"{local_blob_state:'available', offline_original_saved_at:new Date().toISOString()}", "{local_blob_state:'available',original_client_document_id:original.owner.client_document_id,original_blob_id:original.owner.local_blob_id,offline_original_saved_at:new Date().toISOString()}");

const evidence='source/src/modules/owneros/evidenceWorkspaceStorageV110453.js';
addImport(evidence,'saveDocument','../scan/documentSave.js');addImport(evidence,'sha256Original','../scan/originalStore.js');
addDefaultImport(evidence,'Dexie','dexie');
replaceFunction(evidence,'addOriginal',fs.readFileSync(path.join(here,'evidenceAdd.js'),'utf8'));

// Checklist capture records the supplied original date separately from the
// upload date; a captured POD is still evidence pending source review.
const attachment=scan+'attachmentContextV110426.js';
patch(attachment,'  writeStore(upsertRecord(readStore(), record, state));','  await writeStore(upsertRecord(readStore(), record, state));');
patch(attachment,'export async function saveLoadAttachment({file, context, date, state, storage, buildRecord, upsertRecord, readStore, writeStore})', 'export async function saveLoadAttachment({file, context, date, signatureConfirmed=false, state, storage, buildRecord, upsertRecord, readStore, writeStore})');
patch(attachment,"{podSigned:true, signatureSource:'driver_added_signed_pod'}", "{podSigned:signatureConfirmed===true,signatureSource:signatureConfirmed?'driver_checked_original_signature':'signature_needs_review',signatureReviewV1:{status:signatureConfirmed?'driver_confirmed':'needs_review',confirmedAt:signatureConfirmed?new Date().toISOString():null}}" );
patch(attachment,"...(context.type === 'pod' ? {podSigned:true} : {})", "...(context.type === 'pod' ? {podSigned:fields.podSigned,signatureSource:fields.signatureSource,signatureReviewV1:fields.signatureReviewV1} : {})" );
const attachmentSheet=scan+'LoadAttachmentSheetV110426.jsx';
patch(attachmentSheet,"  const [saved, setSaved] = useState(false);", "  const [documentDate,setDocumentDate]=useState(''),[signatureConfirmed,setSignatureConfirmed]=useState(false);\n  const [saved, setSaved] = useState(false);");
patch(attachmentSheet,'await saveLoadAttachment({file, context:target, date:localDateKey(), state,','await saveLoadAttachment({file,context:target,date:documentDate,signatureConfirmed,state,');
patch(attachmentSheet,'readStore:readBusinessStore, writeStore:writeBusinessStore,','readStore:readBusinessStore,writeStore:next=>writeBusinessStore(next,{preserveEvidence:true}),');
patch(attachmentSheet,"              warning = 'The finished document is saved. Some original scan photos could not be kept; keep your paper or camera originals.';", "              throw Error('Original scan photos could not be stored. Keep these pages open and retry.');");
patch(attachmentSheet,'    {saved ? <section', '    {!saved?<section aria-label="Document details" style={{padding:16}}><label>Document date, if printed<input aria-label="Document date" type="date" value={documentDate} onChange={event=>setDocumentDate(event.target.value)}/></label><p>The upload date is kept separately.</p>{target.type===\'pod\'?<label><input type="checkbox" checked={signatureConfirmed} onChange={event=>setSignatureConfirmed(event.target.checked)}/>I checked the receiver signature on the original.</label>:null}{target.type===\'pod\'&&!signatureConfirmed?<p>Saved as POD; signature remains pending review.</p>:null}</section>:null}\n    {saved ? <section');
const capture=scan+'captureAssetStoreV106.js';
patch(capture,'        ].slice(-8),','        ], // Preserve every valid capture version and its recovery history.');

// The file export and full backup retain every filing in their availability
// index even when its bytes live in a shared owner row.
for(const [file,kind]of [['source/src/modules/backup/largeBackupV110431.js','large'],['source/src/modules/backup/everythingZipV110430.js','everything']]){
 addImport(file,'originalCoverage','../scan/originalStore.js');
 if(kind==='large')patch(file,'const missing=documents.filter(d=>!documentIds.has(d.client_document_id))','const coveredOriginals=originalCoverage(documents,documentIds);\n const missing=documents.filter(d=>!coveredOriginals.has(d.client_document_id))');
 else patch(file,'const missing=documents.filter(d=>!docPaths.has(d.client_document_id||d.local_id))','const coveredOriginals=originalCoverage(documents,docPaths.keys());\n  const missing=documents.filter(d=>!coveredOriginals.has(d.client_document_id||d.local_id))');
}
const docsExport='source/src/modules/backup/documentsExportV110433.js';
addImport(docsExport,'readOriginalRow','../scan/originalStore.js');
patch(docsExport,'await addOriginal(row.blob, record, row.file_name || row.local_blob_id);','await addOriginal(row.blob||(await readOriginalRow(db,row.client_document_id,row.local_blob_id))?.blob, record, row.file_name || row.local_blob_id);');
const portable='source/src/modules/backup/portableBackupV110429.js';
addImport(portable,'validateOriginalReferences','../scan/originalStore.js');
patch(portable,'  const state=await deserializeValue(payload.state,resolveZipFile), businessStore=', '  validateOriginalReferences(rowsByTable.document_blobs||[]);\n  const state=await deserializeValue(payload.state,resolveZipFile), businessStore=');
const pod='lib/documents/podCheckpointV1.js';
addImport(pod,'encodedOriginalRow','../../source/src/modules/scan/originalStore.js');
patch(pod,'  const encoded = blobs[0][1].blob;','  const encoded = encodedOriginalRow(records,blobs[0][1])?.blob;');

// The existing legacy queue remains disabled/enabled exactly as configured.
// If used, its read path resolves shared originals and keeps bytes after sync.
const sync='lib/sync/clientSync.js';
addImport(sync,'readOriginalRow','../../source/src/modules/scan/originalStore.js');
addImport(sync,'uploadDocumentOriginal','../../source/src/modules/scan/cloudOriginal.js');
{
 let source=read(sync),start=source.indexOf('// reader-reliability:legacy-upload');if(start<0)start=source.indexOf('async function syncDocumentUpload(');const end=source.indexOf('\nasync function pushDutyEventBatch(',start);
 if(start<0||end<0)throw Error('Legacy document uploader boundary changed.');
 source=source.slice(0,start)+fs.readFileSync(path.join(here,'legacyUpload.js'),'utf8')+'\n'+source.slice(end);write(sync,source);
}
write('lib/sync/documentQueue.js',fs.readFileSync(path.join(here,'documentQueue.js'),'utf8'));
// Same authenticated business endpoint, schema and ownership checks. A retry
// after a partial document/link commit must finish that link or fail visibly.
const commitRoute='app/api/documents/commit-upload/route.js';
patch(commitRoute,'    const { data: document, error: insertError } = await admin','    let { data: document, error: insertError } = await admin');
patch(commitRoute,`    if (insertError) {
      if (insertError.code === '23505') {
        const { data: existing, error: existingError } = await admin
          .from('documents')
          .select('*')
          .eq('client_document_id', clientDocumentId)
          .single();
        if (existingError) throw existingError;
        return jsonOk({ status: 'duplicate', document: existing });
      }
      throw insertError;
    }`, `    // reader-reliability:duplicate-commit
    let duplicate = false;
    if (insertError) {
      if (insertError.code !== '23505') throw insertError;
      const {data:existing,error:existingError}=await admin.from('documents').select('*')
        .eq('driver_id',driverResult.driver.id).eq('client_document_id',clientDocumentId).maybeSingle();
      if(existingError)throw existingError;
      if(!existing)return jsonError('document_identity_conflict',409);
      if(existing.storage_path!==storagePath||(existing.sha256||null)!==(documentInsert.sha256||null))return jsonError('document_original_conflict',409);
      const fields=['type','original_file_name','mime_type','file_size_bytes','title','notes','issued_on','expires_on'];
      if(fields.some(key=>String(existing[key]??'')!==String(documentInsert[key]??'')))return jsonError('document_metadata_requires_review',409);
      document=existing;duplicate=true;
      // Exact repeated metadata continues to the link phase. It is not yet a
      // successful retry if the preceding attempt stopped before that phase.
    }`);
patch(commitRoute,"    const logDay = await findLogDay(admin, driverResult.driver.id, logDate);", "    const logDay = await findLogDay(admin, driverResult.driver.id, logDate);\n    if(logDate&&!logDay)return jsonError('document_log_day_not_found',409);");
if(!read(commitRoute).includes('// reader-reliability:stable-link')){
patch(commitRoute,`    if (shouldLink) {
      const { data: linkRow, error: linkError } = await admin
        .from('document_links')
        .insert({
          document_id: document.id,
          driver_id: driverResult.driver.id,
          log_day_id: logDay?.id || null,
          duty_event_chain_id: dutyEventChainId,
          load_id: body.load_id || body.loadId || null,
          relation_type: relationType || 'supporting_document',
          created_by: auth.user.id
        })
        .select('*')
        .single();
      if (linkError) throw linkError;
      link = linkRow;
    }`, `    if (shouldLink) {
      const desired={document_id:document.id,driver_id:driverResult.driver.id,log_day_id:logDay?.id||null,
        duty_event_chain_id:dutyEventChainId,load_id:body.load_id||body.loadId||null,
        relation_type:relationType||'supporting_document',created_by:auth.user.id};
      const {data:links,error:lookupError}=await admin.from('document_links').select('*')
        .eq('document_id',document.id).eq('driver_id',driverResult.driver.id);
      if(lookupError)throw lookupError;
      const keys=['log_day_id','duty_event_chain_id','load_id','relation_type'];
      link=(links||[]).find(row=>keys.every(key=>(row[key]||null)===(desired[key]||null)))||null;
      if(!link){
        const {data:linkRow,error:linkError}=await admin.from('document_links').insert(desired).select('*').single();
        if(linkError)throw linkError;
        link=linkRow;
      }
    }`);
patch(commitRoute,`      if(!link){
        const {data:linkRow,error:linkError}=await admin.from('document_links').insert(desired).select('*').single();
        if(linkError)throw linkError;
        link=linkRow;
      }`, `      if(!link){
        // reader-reliability:stable-link
        // Exact concurrent retries share one new UUID. Existing legacy link
        // IDs were found above and remain untouched.
        const input=JSON.stringify([desired.driver_id,desired.document_id,...keys.map(key=>desired[key]||null)]);
        const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input))).slice(0,16);
        bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;
        const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
        desired.id=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
        const {data:linkRow,error:linkError}=await admin.from('document_links').insert(desired).select('*').single();
        if(linkError){
          if(linkError.code!=='23505')throw linkError;
          const {data:existing,error:retryError}=await admin.from('document_links').select('*')
            .eq('id',desired.id).eq('driver_id',desired.driver_id).eq('document_id',desired.document_id).maybeSingle();
          if(retryError)throw retryError;
          if(!existing||!keys.every(key=>(existing[key]||null)===(desired[key]||null)))return jsonError('document_link_conflict',409);
          link=existing;
        }else link=linkRow;
      }`);
}
patch(commitRoute,"return jsonOk({ status: 'processed', document, link });", "return jsonOk({status:duplicate?'duplicate':'processed',document,link});");
installCapture(root);
console.log('PASS — isolated Reader reliability runtime installed');

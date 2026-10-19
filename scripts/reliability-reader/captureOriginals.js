import {sha256Original,readOriginalRow} from './originalStore.js';

// A capture row remains a page/variant/run record. Only its immutable bytes can
// be shared. Existing byte-owning rows are never rewritten into references.
export const CAPTURE_REFERENCE='capture_original_ref_v1';
const tables=new Set(['document_blobs','capture_asset_blobs']);
const keyFor=table=>table==='document_blobs'?'local_blob_id':'local_asset_id';
const hashOf=row=>String(row?.sha256||row?.original_sha256||'').toLowerCase();
const sizeOf=row=>Number(row?.file_size_bytes||row?.original_size_bytes||row?.blob?.size||0);
const validHash=value=>/^[a-f0-9]{64}$/.test(value||'');
const fail=message=>{throw Error('Saved photo evidence '+message+'. Existing files were kept.');};
const uid=prefix=>prefix+'_'+crypto.randomUUID();
const queue=new Map();
async function exclusive(db,run){
 const name='road-ready-capture-originals-v1:'+String(db?.name||'local');
 if(globalThis.navigator?.locks?.request)return navigator.locks.request(name,run);
 const prior=queue.get(name)||Promise.resolve(),next=prior.catch(()=>{}).then(run);queue.set(name,next);
 try{return await next;}finally{if(queue.get(name)===next)queue.delete(name);}
}
function refOf(row){
 const ref=row?.[CAPTURE_REFERENCE];if(!ref)return null;
 if(!ref||typeof ref!=='object'||!tables.has(ref.table)||typeof ref.id!=='string'||!ref.id||ref.id.length>300||!validHash(ref.sha256)||!Number.isSafeInteger(ref.size)||ref.size<=0)fail('has an invalid original reference');
 if(row.blob)fail('has ambiguous original bytes and a reference');
 if(hashOf(row)&&hashOf(row)!==ref.sha256||sizeOf(row)&&sizeOf(row)!==ref.size)fail('has a mismatched reference checksum or size');
 return ref;
}
function checkClaim(row,hash,size){
 if(hashOf(row)&&hashOf(row)!==hash||sizeOf(row)&&sizeOf(row)!==size)fail('does not match its saved checksum or size');
}
function nextReference(table,row){
 const ref=refOf(row);if(ref)return ref;
 if(table==='document_blobs'&&row?.original_blob_id)return {table:'document_blobs',id:row.original_blob_id,sha256:hashOf(row),size:sizeOf(row)};
 return null;
}
async function resolveWith(getRow,initial,{verify=true,readBinary=value=>value,waitFor=p=>p,verified=new Map(),check=()=>{}}={}){
 let row=initial,table='capture_asset_blobs';const seen=new Set(),claims=[];
 while(row){
  const key=table+':'+String(row[keyFor(table)]||'');
  if(seen.has(key)||seen.size>=16)fail('has a reference cycle');seen.add(key);claims.push(row);
  const ref=nextReference(table,row);if(!ref)break;
  await check();table=ref.table;row=await getRow(table,ref.id);if(!row)fail('is missing its referenced original');
  claims.push({sha256:ref.sha256,file_size_bytes:ref.size});
 }
 if(!row?.blob)fail('is missing its original bytes');
 const blob=await readBinary(row.blob);if(!(blob instanceof Blob)||!blob.size)fail('has unavailable original bytes');
 let hash=hashOf(row),size=blob.size;
 if(verify){
  const key=table+':'+row[keyFor(table)]+':'+hash+':'+size;
  hash=verified.get(key)||await waitFor(sha256Original(blob));verified.set(key,hash);
 }
 if(!validHash(hash))fail('has no verified original checksum');
 for(const claim of claims)checkClaim(claim,hash,size);
 return {blob,sha256:hash,size,table,id:row[keyFor(table)],owner:row};
}
export async function resolveCaptureOriginal(db,row,options={}){
 if(!db?.capture_asset_blobs||!db?.document_blobs)fail('storage is unavailable');
 return resolveWith((table,id)=>db.table(table).get(id),row,options);
}
function rowIndex(groups={}){
 const index=new Map();for(const table of tables)for(const row of groups[table]||[])if(row?.[keyFor(table)]){const key=table+':'+row[keyFor(table)];if(index.has(key))fail('has duplicate original identities');index.set(key,row);}
 return (table,id)=>index.get(table+':'+id);
}
// Structural validation works before cloud RPCs and on encoded JSON/ZIP rows.
// It does not replace verification of the decoded owner's actual bytes.
export function validateCaptureGraph(groups={}){
 const get=rowIndex(groups);
 for(const first of groups.capture_asset_blobs||[]){
  if(!first?.[CAPTURE_REFERENCE])continue;
  let row=first,table='capture_asset_blobs';const seen=new Set(),claims=[];
  while(row){
   const key=table+':'+row[keyFor(table)];if(seen.has(key)||seen.size>=16)fail('has a reference cycle');seen.add(key);claims.push(row);
   const ref=nextReference(table,row);if(!ref)break;
   claims.push({sha256:ref.sha256,file_size_bytes:ref.size});table=ref.table;row=get(table,ref.id);if(!row)fail('is missing its referenced original');
  }
  if(!row?.blob)fail('is missing its original bytes');
  const hash=hashOf(row)||hashOf(first),size=sizeOf(row)||sizeOf(first);if(!validHash(hash)||!size)fail('has no original checksum or size');
  for(const claim of claims)checkClaim(claim,hash,size);
 }
 return true;
}
export async function captureBinary(value){
 if(value instanceof Blob)return value;
 if(value?.__roadReadyBinary==='Blob'||value?.__roadReadyBinary==='File'){
  const bytes=Uint8Array.from(atob(value.base64),character=>character.charCodeAt(0));
  if(bytes.length!==value.size)fail('has incomplete archived bytes');return new Blob([bytes],{type:value.mimeType||value.type||'application/octet-stream'});
 }
 if(value?.__roadReadyStoredBinaryV110458===1&&value.bytes instanceof ArrayBuffer)return new Blob([value.bytes],{type:value.type});
 fail('cannot resolve its archived bytes');
}
export async function validateCaptureArchive(groups={},options={}){
 validateCaptureGraph(groups);const get=rowIndex(groups),verified=new Map();
 for(const row of groups.capture_asset_blobs||[])if(row?.[CAPTURE_REFERENCE]||hashOf(row))await resolveWith(get,row,{...options,readBinary:options.readBinary||captureBinary,verified});
 return true;
}
export async function validateCaptureDatabase(db,options={}){
 const table=db?.capture_asset_blobs||db?.tables?.find(item=>item.name==='capture_asset_blobs');if(!table)return true;
 if(!table.toCollection?.().primaryKeys)return validateCaptureArchive({capture_asset_blobs:await table.toArray(),document_blobs:await db.table('document_blobs').toArray()},options);
 const verified=new Map();
 for(const id of await db.capture_asset_blobs.toCollection().primaryKeys()){
  const row=await db.capture_asset_blobs.get(id);
  if(row?.[CAPTURE_REFERENCE]||hashOf(row))await resolveCaptureOriginal(db,row,{...options,verified});
 }
 return true;
}
function groupsFromRecords(records){
 const groups={document_blobs:[],capture_asset_blobs:[]};
 for(const [key,row]of Object.entries(records||{})){
  const parts=JSON.parse(key);if(parts[0]==='table'&&tables.has(parts[1])){if(String(row?.[keyFor(parts[1])]||'')!==parts[2])fail('has a mismatched account record identity');groups[parts[1]].push(row);}
 }
 return groups;
}
export function validateCaptureAccountRecords(records){return validateCaptureGraph(groupsFromRecords(records));}
export async function validateCaptureAccountInstall(records,readRow,{check=()=>{}}={}){
 const groups=groupsFromRecords(records);validateCaptureGraph(groups);const verified=new Map();
 const get=async(table,id)=>{const key=JSON.stringify(['table',table,String(id)]);if(!Object.hasOwn(records,key))return null;return readRow(key,table,id);};
 for(const raw of groups.capture_asset_blobs)if(raw?.[CAPTURE_REFERENCE]||hashOf(raw)){
  await check();const row=await get('capture_asset_blobs',raw.local_asset_id);if(!row)fail('is missing a received capture record');
  await resolveWith(get,row,{verified,check});
 }
 return true;
}
function descriptor(row){return {localAssetId:row.local_asset_id,runId:row.capture_run_id,variants:row.variants||[],fileName:row.file_name||'',mimeType:row.mime_type||'',fileSizeBytes:sizeOf(row),sha256:hashOf(row),createdAt:row.created_at||'',current:row.current!==false};}
async function findOwner(db,hash,size,{waitFor,cache}){
 if(cache.has(hash))return cache.get(hash);
 for(const table of ['document_blobs','capture_asset_blobs']){
  for(const id of await db.table(table).toCollection().primaryKeys()){
   const row=await db.table(table).get(id);if(!row?.blob?.size||row.blob.size!==size||row.original_blob_id||row[CAPTURE_REFERENCE])continue;
   if(hashOf(row)&&hashOf(row)!==hash)continue;
   const actual=await waitFor(sha256Original(row.blob));if(hashOf(row)&&hashOf(row)!==actual)fail('contains a damaged existing original');
   if(actual===hash){const owner={table,id,row};cache.set(hash,owner);return owner;}
  }
 }
 return null;
}
async function putCapture(db,row,blob,{waitFor,cache}){
 const hash=row.sha256,previous=await db.capture_asset_blobs.get(row.local_asset_id);
 if(previous){
  const saved=await resolveCaptureOriginal(db,previous,{waitFor});
  if(saved.sha256!==hash||previous.client_document_id!==row.client_document_id||previous.capture_run_id!==row.capture_run_id||JSON.stringify(previous.variants||[])!==JSON.stringify(row.variants||[]))fail('conflicts with an existing capture version');
  return previous;
 }
 const owner=await findOwner(db,hash,blob.size,{waitFor,cache});
 if(owner){row={...row,[CAPTURE_REFERENCE]:{table:owner.table,id:owner.id,sha256:hash,size:blob.size}};delete row.blob;}
 else {row={...row,blob};cache.set(hash,{table:'capture_asset_blobs',id:row.local_asset_id,row});}
 await db.capture_asset_blobs.put(row);return row;
}
export async function persistCaptureRun({clientDocumentId='',assets=[],captureManifest=null,scannerVersion='106.0.0'}={}, {db,groupAssets,waitFor=p=>p}={}){
 if(!clientDocumentId||!db?.capture_asset_blobs||!db?.document_blobs||!db?.documents_local)fail('storage is unavailable');
 const groups=groupAssets(assets),runId=uid('capture_run'),createdAt=new Date().toISOString();
 if(!groups.length){const prior=await db.documents_local.where('client_document_id').equals(clientDocumentId).first();return {status:'stored',runId:prior?.capture_run_id||'',assets:prior?.capture_assets||[],captureManifest:prior?.capture_manifest||captureManifest,stored:prior?.capture_asset_count||0};}
 const prepared=[];for(const group of groups){if(!(group.file instanceof Blob)||!group.file.size)fail('has an empty source photo');prepared.push({...group,sha256:await sha256Original(group.file)});}
 return exclusive(db,()=>db.transaction('rw',db.capture_asset_blobs,db.document_blobs,db.documents_local,async()=>{
  const prior=await db.documents_local.where('client_document_id').equals(clientDocumentId).first();if(!prior)fail('has no saved document record');
  const rows=[],cache=new Map();
  // The main finished image is already saved by the document writer. Prefer its
  // canonical byte owner without copying it again as a display capture.
  const main=await readOriginalRow(db,clientDocumentId);if(main?.blob?.size){const hash=await waitFor(sha256Original(main.blob));checkClaim(main,hash,main.blob.size);cache.set(hash,{table:'document_blobs',id:main.local_blob_id,row:main});}
  for(const group of prepared){
   const row={local_asset_id:uid('capture_asset'),client_document_id:clientDocumentId,capture_run_id:runId,current:true,variants:group.variants,variant_kind:group.variants[0]?.kind||'capture-variant',page_index:Number(group.variants[0]?.pageIndex||0),file_name:group.name,mime_type:group.mimeType,file_size_bytes:group.file.size,sha256:group.sha256,scanner_version:scannerVersion,created_at:createdAt};
   rows.push(await putCapture(db,row,group.file,{waitFor,cache}));
  }
  await db.capture_asset_blobs.where('client_document_id').equals(clientDocumentId).modify(row=>{row.current=row.capture_run_id===runId;});
  const descriptors=rows.map(descriptor);
  await db.documents_local.put({...prior,capture_manifest:captureManifest,capture_run_id:runId,capture_assets:descriptors,capture_asset_count:descriptors.length,capture_runs:[...(prior.capture_runs||[]).map(run=>({...run,current:false})),{runId,current:true,scannerVersion,createdAt,assetCount:descriptors.length}],updated_at:createdAt});
  return {status:'stored',runId,assets:descriptors,captureManifest,stored:rows.length};
 }));
}
export async function readCaptureEvidence(db,record){
 if(!db?.capture_asset_blobs)return [];
 const client=String(record?.client_document_id||record?.clientDocumentId||'');if(!client)return [];
 const ids=await db.capture_asset_blobs.where('client_document_id').equals(client).primaryKeys(),result=[],verified=new Map(),binary=new Map();
 const local=await db.documents_local.where('client_document_id').equals(client).first();
 if(!ids.length&&Number(local?.capture_asset_count||record?.capture_asset_count||0)>0)fail('is missing its saved capture versions');
 for(const id of ids){
  const row=await db.capture_asset_blobs.get(id),resolved=await resolveCaptureOriginal(db,row,{verified});
  // Only the selected capture's metadata crosses an export boundary. The byte
  // owner's document, load, run, and filing metadata remain outside the packet.
  const metadata={...row};delete metadata.blob;delete metadata[CAPTURE_REFERENCE];
  if(!binary.has(resolved.sha256))binary.set(resolved.sha256,resolved.blob);
  result.push({record:{...metadata,sha256:resolved.sha256,file_size_bytes:resolved.size},blob:binary.get(resolved.sha256).slice(0,resolved.size,row.mime_type||resolved.blob.type)});
 }
 return result;
}
export async function importCaptureEvidence(db,entries,{waitFor=p=>p}={}){
 const cache=new Map(),clients=new Set();
 for(const item of entries||[]){
  const row={...item.record};delete row.blob;delete row[CAPTURE_REFERENCE];
  if(!row.local_asset_id||!row.capture_run_id||!row.client_document_id||!(item.blob instanceof Blob)||!validHash(row.sha256)||await waitFor(sha256Original(item.blob))!==row.sha256||item.blob.size!==row.file_size_bytes)fail('has an invalid transferred capture');
  const document=await db.documents_local.where('client_document_id').equals(row.client_document_id).first();if(!document)fail('has no document for the transferred capture');
  const existingRun=document.capture_run_id;row.current=existingRun?row.capture_run_id===existingRun:row.current!==false;
  await putCapture(db,row,item.blob,{waitFor,cache});clients.add(row.client_document_id);
 }
 for(const client of clients){
  const document=await db.documents_local.where('client_document_id').equals(client).first(),rows=await db.capture_asset_blobs.where('client_document_id').equals(client).toArray();
  const current=document.capture_run_id||rows.find(row=>row.current!==false)?.capture_run_id||'',runs=new Map((document.capture_runs||[]).map(run=>[run.runId,run]));
  for(const row of rows)if(!runs.has(row.capture_run_id))runs.set(row.capture_run_id,{runId:row.capture_run_id,current:row.capture_run_id===current,createdAt:row.created_at,scannerVersion:row.scanner_version,assetCount:rows.filter(item=>item.capture_run_id===row.capture_run_id).length});
  const descriptors=rows.filter(row=>row.capture_run_id===current).map(descriptor);
  await db.documents_local.put({...document,capture_run_id:current,capture_assets:descriptors,capture_asset_count:descriptors.length,capture_runs:[...runs.values()]});
 }
 return entries?.length||0;
}

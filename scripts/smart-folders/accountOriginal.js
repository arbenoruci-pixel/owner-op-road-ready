// Read one exact account original on demand; never restore a workspace or edit logs.
const text=v=>String(v??'').trim();
const idOf=d=>text(d?.client_document_id||d?.clientDocumentId);
export function findAccountOriginal(records,clientId){
 const entries=Object.entries(records||{}),metadata=[],blobs=[];
 for(const [key,value]of entries){
  let parts;try{parts=JSON.parse(key);}catch{continue;}
  if(parts[0]==='table'&&parts[1]==='document_blobs'&&idOf(value)===clientId)blobs.push(value.blob||value.data);
  if(parts[0]==='table'&&parts[1]==='documents_local'&&idOf(value)===clientId)metadata.push(value);
  if(parts[0]==='business'&&parts[1]==='documents'&&idOf(value)===clientId)metadata.push(value);
  if(parts[0]==='business-array'&&parts[1]==='documents')metadata.push(...(Array.isArray(value)?value:[]).filter(d=>idOf(d)===clientId));
 }
 for(const d of metadata)if(d.dataUrl?.__rrAccountFile===1)blobs.push(d.dataUrl);
 const refs=blobs.filter(v=>v?.__rrAccountFile===1);
 // Blob and DataURL encodings can describe exactly the same verified bytes.
 // Representation metadata is not evidence of a different original.
 const distinct=new Map();
 for(const r of refs){
  const identity=JSON.stringify([r.size,Array.isArray(r.chunks)?r.chunks.map(c=>[c?.sha256,c?.bytes]):r.chunks]);
  if(!distinct.has(identity))distinct.set(identity,r);
 }
 if(distinct.size>1)throw Error('This document has conflicting saved originals. Open it on the phone where it was saved.');
 return [...distinct.values()][0]||null;
}
export async function readAccountDocumentOriginal(clientId,{getSession,getWorkspace,readFile,getBackups,hashBytes}){
 if(!/^[a-zA-Z0-9_-]{1,160}$/.test(clientId))return {signedIn:false,blob:null};
 const session=await getSession(),uid=session?.user?.id;if(!uid)return {signedIn:false,blob:null};
 const workspace=await getWorkspace(uid);
 if(workspace&&workspace.user_id!==uid)throw Error('This original belongs to a different account.');
 const file=findAccountOriginal(workspace?.payload?.records,clientId);
 if(!file){
  const fingerprint=accountOriginalFingerprint(workspace?.payload?.records,clientId);
  if(!fingerprint||!getBackups||!hashBytes)return {signedIn:true,blob:null};
  const check=async()=>{if((await getSession())?.user?.id!==uid)throw Error('Account changed. Reopen this document.');};
  await check();const backups=await getBackups(uid);await check();
  const candidates=backupOriginalCandidates(backups,uid,fingerprint);
  for(const candidate of candidates){
   await check();const original=await readFile(candidate,{uid,check});await check();
   if(original.size===fingerprint.size&&await hashBytes(await original.arrayBuffer())===fingerprint.sha256){
    await check();return {signedIn:true,blob:original};
   }
  }
  return {signedIn:true,blob:null};
 }
 if(!Number.isInteger(file.size)||file.size<=0||file.size>50*1024*1024||!Array.isArray(file.chunks)||file.chunks.some(c=>!/^[a-f0-9]{64}$/.test(c.sha256)||!Number.isInteger(c.bytes)||c.bytes<=0))throw Error('The saved original is incomplete.');
 const check=async()=>{if((await getSession())?.user?.id!==uid)throw Error('Account changed. Reopen this document.');};
 await check();const blob=await readFile(file,{uid,check});await check();
 return {signedIn:true,blob};
}

// Missing archive rows may still have an immutable private backup. Require the
// current document's exact fingerprint; names/routes are never evidence of identity.
export function accountOriginalFingerprint(records,clientId){
 const matches=[];
 for(const [key,value] of Object.entries(records||{})){
  let parts;try{parts=JSON.parse(key);}catch{continue;}
  if(parts[0]==='table'&&parts[1]==='documents_local'&&idOf(value)===clientId)matches.push(value);
  if(parts[0]==='business'&&parts[1]==='documents'&&idOf(value)===clientId)matches.push(value);
  if(parts[0]==='business-array'&&parts[1]==='documents')matches.push(...(Array.isArray(value)?value:[]).filter(d=>idOf(d)===clientId));
 }
 const hashes=new Set(matches.map(row=>text(row.sha256).toLowerCase()).filter(Boolean));
 if(hashes.size>1)throw Error('This document has conflicting saved fingerprints. Review its source before opening it.');
 const fingerprints=new Map();
 for(const row of matches){
  const sha256=text(row.sha256).toLowerCase(),size=Number(row.fileSizeBytes??row.size_bytes??row.file_size_bytes);
  if(!/^[a-f0-9]{64}$/.test(sha256)||!Number.isSafeInteger(size)||size<=0||size>50*1024*1024)continue;
  fingerprints.set(sha256+':'+size,{sha256,size,mime:text(row.mimeType||row.mime_type)||'application/octet-stream'});
 }
 if(fingerprints.size>1)throw Error('This document has conflicting saved fingerprints. Review its source before opening it.');
 return [...fingerprints.values()][0]||null;
}
export function backupOriginalCandidates(backups,uid,fingerprint){
 const unique=new Map();let budget=0;
 for(const backup of backups||[]){
  if(backup.user_id!==uid)throw Error('This original belongs to a different account.');
  for(const entry of backup.manifest?.files||[]){
   if(entry.size!==fingerprint.size||!Array.isArray(entry.chunks)||!entry.chunks.length)continue;
   const chunks=entry.chunks;
   if(chunks.some(c=>!/^[a-f0-9]{64}$/.test(c.sha256)||!Number.isSafeInteger(c.bytes)||c.bytes<=0||c.bytes>1024*1024)||chunks.reduce((n,c)=>n+c.bytes,0)!==entry.size)continue;
   if(chunks.length===1&&chunks[0].sha256!==fingerprint.sha256)continue;
   const identity=JSON.stringify(chunks.map(c=>[c.sha256,c.bytes]));
   if(unique.has(identity))continue;
   if(unique.size>=8||budget+entry.size>100*1024*1024)continue;
   unique.set(identity,{__rrAccountFile:1,kind:'Blob',size:entry.size,mime:fingerprint.mime,chunks});budget+=entry.size;
  }
 }
 return [...unique.values()];
}

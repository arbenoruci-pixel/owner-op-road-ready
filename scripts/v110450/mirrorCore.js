// Immutable, content-addressed backup pieces. No local records are changed here.
export const PART_BYTES=1024*1024;
export async function bounded(request,milliseconds=45000){let timer;try{return await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Cloud connection timed out. Backup will retry.')),milliseconds);})]);}finally{clearTimeout(timer);}}
export const hashBytes=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
export function objectPath(uid,sha){if(!/^[a-f0-9-]{36}$/i.test(uid)||!/^[a-f0-9]{64}$/.test(sha))throw Error('Invalid backup object identity');return `${uid}/temporary-backup/${sha}.bin`;}
export async function verifiedPiece(storage,uid,blob,known=new Set()){
 const bytes=await blob.arrayBuffer(),sha256=await hashBytes(bytes),path=objectPath(uid,sha256);
 if(!known.has(sha256)){
  const result=await bounded(storage.upload(path,bytes,{upsert:false,contentType:'application/octet-stream',cacheControl:'0'}));
  if(result.error&&!/already exists|duplicate|resource exists/i.test(result.error.message||''))throw result.error;
  const check=await bounded(storage.download(path));if(check.error)throw check.error;
  const stored=await check.data.arrayBuffer();
  if(stored.byteLength!==bytes.byteLength||await hashBytes(stored)!==sha256)throw Error('Cloud copy did not match the original. Retry backup.');
  known.add(sha256);
 }
 return {sha256,bytes:bytes.byteLength};
}
export async function uploadEntries(entries,storage,uid,known=new Set(),onProgress=()=>{},check=()=>{}){
 const files=[];let done=0,total=[...entries.values()].reduce((n,e)=>n+e.size,0);
 for(const [name,entry] of entries){
  const chunks=[];
  for(let at=0;at<entry.size;at+=PART_BYTES){check();const part=entry.blob.slice(at,at+PART_BYTES);chunks.push(await verifiedPiece(storage,uid,part,known));done+=part.size;onProgress(`Checking cloud copy · ${Math.round(done/1048576)} / ${Math.round(total/1048576)} MB`);}
  files.push({name,size:entry.size,crc:entry.crc,chunks});
 }
 return files;
}
export function knownPieces(manifest){return new Set((manifest?.files||[]).flatMap(f=>(f.chunks||[]).map(c=>c.sha256)));}
export async function downloadEntries(manifest,storage,uid,onProgress=()=>{}){
 if(manifest?.format!=='road_ready_cloud_mirror_v1'||!Array.isArray(manifest.files))throw Error('Unsupported cloud backup');
 const entries=[];
 for(const file of manifest.files){
  onProgress('Checking '+file.name);const parts=[];let size=0;
  for(const chunk of file.chunks){const result=await bounded(storage.download(objectPath(uid,chunk.sha256)));if(result.error)throw result.error;const bytes=await result.data.arrayBuffer();if(bytes.byteLength!==chunk.bytes||await hashBytes(bytes)!==chunk.sha256)throw Error('A cloud backup file failed verification.');parts.push(new Blob([bytes]));size+=bytes.byteLength;}
  if(size!==file.size)throw Error('A cloud backup file is incomplete.');entries.push({name:file.name,blob:new Blob(parts),size,crc:file.crc});
 }
 return entries;
}

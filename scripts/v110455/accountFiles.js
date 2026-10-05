import {hashBytes,verifiedPiece,objectPath,PART_BYTES,bounded} from './mirrorCoreV110450.js';
const fileRef=v=>v&&typeof v==='object'&&v.__rrAccountFile===1;
export function piecesOf(value,set=new Set()){if(fileRef(value)){for(const c of value.chunks)set.add(c.sha256);}else if(value&&typeof value==='object')for(const v of Object.values(value))piecesOf(v,set);return set;}
export async function encode(value,{storage,uid,known,onProgress=()=>{},check=()=>{}}){
 async function file(blob,kind,prefix=''){
  const chunks=[];for(let at=0;at<blob.size;at+=PART_BYTES){await check();chunks.push(await verifiedPiece(storage,uid,blob.slice(at,at+PART_BYTES),known));onProgress('Syncing document files…');}
  return {__rrAccountFile:1,kind,size:blob.size,mime:blob.type,prefix,chunks};
 }
 async function visit(v){
  if(v instanceof Blob)return file(v,'Blob');
  if(v instanceof ArrayBuffer||ArrayBuffer.isView(v))return file(new Blob([v]),'ArrayBuffer');
  if(typeof v==='string'&&/^data:[^,]*;base64,/.test(v)){const at=v.indexOf(','),parts=[];for(let p=at+1;p<v.length;p+=131072){const raw=atob(v.slice(p,p+131072));parts.push(Uint8Array.from(raw,c=>c.charCodeAt(0)));}return file(new Blob(parts,{type:v.slice(5,at).split(';')[0]}),'DataURL',v.slice(0,at+1));}
  if(typeof v==='string'&&v.length>65536)return file(new Blob([v],{type:'text/plain'}),'Text');
  if(Array.isArray(v)){const out=[];for(const x of v)out.push(await visit(x));return out;}
  if(v&&typeof v==='object'){const out={};for(const [k,x] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Invalid record field.');if(x!==undefined)out[k]=await visit(x);}return out;}
  return v;
 }
 return visit(value);
}
export async function readFile(ref,{storage,uid,check=()=>{}}){
 if(!fileRef(ref)||!Array.isArray(ref.chunks)||!['Blob','ArrayBuffer','DataURL','Text'].includes(ref.kind))throw Error('Invalid account file.');
 const parts=[];let size=0;
 for(const c of ref.chunks){await check();const r=await bounded(storage.download(objectPath(uid,c.sha256)));if(r.error)throw r.error;const bytes=await r.data.arrayBuffer();if(bytes.byteLength!==c.bytes||await hashBytes(bytes)!==c.sha256)throw Error('A document failed verification. Local data was kept.');parts.push(bytes);size+=bytes.byteLength;}
 if(size!==ref.size)throw Error('A document is incomplete. Local data was kept.');
 return new Blob(parts,{type:ref.mime||'application/octet-stream'});
}
export async function decode(value,opts,cache=new Map()){
 if(fileRef(value)){
  const id=JSON.stringify(value);if(cache.has(id))return cache.get(id);
  const blob=await readFile(value,opts);let out=blob;
  if(value.kind==='ArrayBuffer')out=await blob.arrayBuffer();
  if(value.kind==='Text')out=await blob.text();
  if(value.kind==='DataURL'){if(!/^data:[^,]*;base64,$/.test(value.prefix))throw Error('Invalid image.');const parts=[];for(let offset=0;offset<blob.size;offset+=786432){const bytes=new Uint8Array(await blob.slice(offset,offset+786432).arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));parts.push(btoa(raw));}out=value.prefix+parts.join('');}
  cache.set(id,out);return out;
 }
 if(Array.isArray(value)){const out=[];for(const v of value)out.push(await decode(v,opts,cache));return out;}
 if(value&&typeof value==='object'){const out={};for(const [k,v] of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Invalid record field.');out[k]=await decode(v,opts,cache);}return out;}
 return value;
}
export async function snapshotBundle(snapshot,opts){
 const index=snapshot.manifest.files.find(f=>f.name==='Road-Ready-Backup.roadready.json');if(!index)throw Error('Saved account index is missing.');
 const archive=JSON.parse(await(await readFile({__rrAccountFile:1,kind:'Text',size:index.size,chunks:index.chunks},opts)).text());
 if(await hashBytes(new TextEncoder().encode(JSON.stringify(archive.payload)))!==archive.payloadSha256)throw Error('Saved account index failed verification.');
 const files=new Map(snapshot.manifest.files.map(f=>[f.name,f]));
 function convert(v){
  if(v?.__roadReadyZipFile){const f=files.get(v.path);if(!f||f.size!==v.size)throw Error('A saved original is missing.');return {__rrAccountFile:1,kind:v.__roadReadyZipFile,size:f.size,mime:v.mimeType||'',prefix:v.prefix||'',chunks:f.chunks};}
  if(Array.isArray(v))return v.map(convert);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,convert(x)]));return v;
 }
 const p=convert(archive.payload),locals={};
 for(const row of p.localStorage||[]){let value=row.value;if(value?.__roadReadyJsonString)value=value.__roadReadyJsonString;else if(typeof value==='string'){try{value=JSON.parse(value);}catch{}}locals[row.key]=value;}
 return {state:p.state||{},business:p.businessStore||{},tables:p.dexie||{},locals};
}

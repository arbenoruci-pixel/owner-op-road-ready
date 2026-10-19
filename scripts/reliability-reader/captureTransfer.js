import {sha256Original} from './originalStore.js';
import {CAPTURE_REFERENCE} from './captureOriginals.js';

const bytesToBase64=bytes=>{let text='';for(let at=0;at<bytes.length;at+=24576)text+=btoa(String.fromCharCode(...bytes.subarray(at,at+24576)));return text;};
const fromBase64=value=>{if(typeof value!=='string'||value.length%4||/[^A-Za-z0-9+/=]/.test(value))throw Error('Invalid capture original encoding.');return Uint8Array.from(atob(value),character=>character.charCodeAt(0));};
const identity=record=>String(record?.client_document_id||record?.clientDocumentId||record?.local_id||record?.localDocumentId||record?.id||'');
const validHash=value=>/^[a-f0-9]{64}$/.test(value||'');
function cleanRecord(record){const copy={...record};delete copy.blob;delete copy[CAPTURE_REFERENCE];return copy;}
function validateRecord(record,client){
 if(!record||typeof record!=='object'||record.client_document_id!==client||typeof record.local_asset_id!=='string'||!record.local_asset_id||record.local_asset_id.length>300||typeof record.capture_run_id!=='string'||!record.capture_run_id||record.capture_run_id.length>300||!Array.isArray(record.variants)||record.variants.length>100||!record.variants.length)throw Error('Invalid capture version identity or scope.');
 for(const item of record.variants)if(!item||typeof item.kind!=='string'||!item.kind||!Number.isInteger(item.pageIndex)||item.pageIndex<0||item.pageIndex>=200)throw Error('Invalid capture page or variant.');
 if(record.blob||record[CAPTURE_REFERENCE])throw Error('A portable capture must contain its selected metadata and resolved original.');
}
export async function encodeTransferCaptures(record,readCaptures){
 const captures=[];for(const item of await readCaptures(record)||[]){
  const metadata=cleanRecord(item.record);validateRecord(metadata,identity(record));
  if(!(item.blob instanceof Blob)||!item.blob.size)throw Error('A capture original is missing.');
  const sha256=await sha256Original(item.blob);if(metadata.sha256!==sha256||metadata.file_size_bytes!==item.blob.size)throw Error('A capture original failed verification.');
  captures.push({record:metadata,original:{base64:bytesToBase64(new Uint8Array(await item.blob.arrayBuffer())),size:item.blob.size,type:metadata.mime_type||item.blob.type,sha256}});
 }
 return captures;
}
// A capture-bearing envelope is explicitly versioned. An older client must
// reject it instead of importing a document while losing its source versions.
export function compactCaptureTransfer(payload){
 if(!payload.documents?.some(item=>item.captures?.length))return payload;
 const originals={};
 function keep(original){
  const resolved=original?.ref?payload.originals?.[original.ref]:original;
  if(!resolved||!validHash(resolved.sha256))throw Error('A capture transfer original is missing.');
  const prior=originals[resolved.sha256];
  if(prior&&(prior.base64!==resolved.base64||prior.size!==resolved.size))throw Error('Conflicting capture transfer originals.');
  originals[resolved.sha256]={base64:resolved.base64,size:resolved.size,sha256:resolved.sha256};
  return {ref:resolved.sha256,sha256:resolved.sha256,size:resolved.size,type:original.type||resolved.type};
 }
 const documents=payload.documents.map(item=>({...item,original:keep(item.original),captures:(item.captures||[]).map(capture=>({...capture,record:cleanRecord(capture.record),original:keep(capture.original)}))}));
 return {...payload,version:3,originals,documents};
}
export function expandCaptureTransfer(payload){
 if(payload?.version!==3)return payload;
 if(payload.format!=='road-ready-document-transfer'||!payload.originals||typeof payload.originals!=='object'||Array.isArray(payload.originals)||!Array.isArray(payload.documents))throw Error('Invalid capture transfer.');
 function resolve(ref){
  const original=ref?.ref&&Object.hasOwn(payload.originals,ref.ref)?payload.originals[ref.ref]:null;
  if(!original||!validHash(ref.ref)||ref.ref!==ref.sha256||ref.ref!==original.sha256||ref.size!==original.size||typeof ref.type!=='string')throw Error('A capture transfer reference is missing or damaged.');
  return {...original,type:ref.type};
 }
 return {...payload,version:1,documents:payload.documents.map(item=>({...item,original:resolve(item.original),captures:(item.captures||[]).map(capture=>({...capture,original:resolve(capture.original)}))}))};
}
export async function decodeTransferCaptures(documents,maxBytes){
 const decoded=[],ids=new Set(),content=new Set((documents||[]).map(item=>item.original?.sha256).filter(Boolean));let total=0;
 for(const item of documents||[]){
  if(item.captures!=null&&!Array.isArray(item.captures))throw Error('Invalid capture version list.');
  if((item.captures||[]).length>10000)throw Error('Too many capture versions in one transfer.');
  for(const capture of item.captures||[]){
   const record=capture?.record,original=capture?.original;validateRecord(record,identity(item.record));
   if(ids.has(record.local_asset_id))throw Error('Duplicate capture version ID in transfer.');ids.add(record.local_asset_id);
   if(!Number.isSafeInteger(original?.size)||original.size<=0||!validHash(original.sha256)||record.sha256!==original.sha256||record.file_size_bytes!==original.size||!/^image\/(?:png|jpeg|jpg|webp|gif|tiff|bmp|heic|heif|avif)$/.test(original.type||''))throw Error('Invalid capture original metadata.');
   if(!content.has(original.sha256)){total+=original.size;content.add(original.sha256);}if(total>maxBytes)throw Error('Capture transfer is too large. Export a smaller scope.');
   const bytes=fromBase64(original.base64),blob=new Blob([bytes],{type:original.type});
   if(bytes.length!==original.size||await sha256Original(blob)!==original.sha256)throw Error('A capture original is damaged or incomplete.');
   decoded.push({record:cleanRecord(record),blob});
  }
 }
 return decoded;
}

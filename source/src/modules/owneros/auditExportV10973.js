'use client';

import { vaultBlobV102, vaultDocumentLoadNoV102, vaultDocumentTypeV102 } from './documentVaultV102.js';

function text(value=''){ return String(value ?? '').replace(/\s+/g,' ').trim(); }
function safeName(value='file'){ return text(value||'file').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,160)||'file'; }
function jsonBytes(value){ return new TextEncoder().encode(JSON.stringify(value,null,2)); }
function strBytes(value){ return new TextEncoder().encode(String(value)); }
function octal(value,length){ return Math.max(0,Number(value)||0).toString(8).padStart(length-1,'0')+'\0'; }
function tarHeader(name,size,mtime=Math.floor(Date.now()/1000)){
  const header=new Uint8Array(512); const enc=new TextEncoder();
  const put=(offset,length,value)=>header.set(enc.encode(String(value).slice(0,length)),offset);
  put(0,100,name); put(100,8,'0000644\0'); put(108,8,'0000000\0'); put(116,8,'0000000\0');
  put(124,12,octal(size,12)); put(136,12,octal(mtime,12)); put(148,8,'        '); header[156]='0'.charCodeAt(0);
  put(257,6,'ustar\0'); put(263,2,'00');
  let sum=0; for(const byte of header) sum+=byte; put(148,8,sum.toString(8).padStart(6,'0')+'\0 ');
  return header;
}
function buildTar(entries=[]){
  const chunks=[]; let total=1024;
  for(const entry of entries){ const bytes=entry.bytes instanceof Uint8Array?entry.bytes:new Uint8Array(entry.bytes||[]); const pad=(512-(bytes.length%512))%512; chunks.push(tarHeader(entry.name,bytes.length),bytes,new Uint8Array(pad)); total+=512+bytes.length+pad; }
  chunks.push(new Uint8Array(1024)); const out=new Uint8Array(total); let offset=0; for(const chunk of chunks){ out.set(chunk,offset); offset+=chunk.length; } return out;
}
async function gzip(bytes){
  if(typeof CompressionStream==='undefined') return {blob:new Blob([bytes],{type:'application/x-tar'}),extension:'tar'};
  const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return {blob:await new Response(stream).blob(),extension:'tar.gz'};
}
function download(blob,name){ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),30000); }

export function analyzeAuditDataV10973(folders=[],documents=[]){
  const issues=[];
  for(const folder of folders){
    const prefix=`Load ${folder.loadNo}`;
    if(folder.counts.pods>folder.counts.stops && folder.counts.stops>0) issues.push({severity:'error',code:'POD_OVERMATCH',loadNo:folder.loadNo,message:`${prefix}: ${folder.counts.pods} PODs but only ${folder.counts.stops} delivery stops.`});
    if(folder.counts.stops===0 && folder.counts.pods>0) issues.push({severity:'error',code:'POD_WITHOUT_STOPS',loadNo:folder.loadNo,message:`${prefix}: POD exists but no delivery stops are defined.`});
    if(!folder.rateCons.length) issues.push({severity:'warning',code:'RATE_CON_MISSING',loadNo:folder.loadNo,message:`${prefix}: Rate Confirmation is not linked.`});
    if(/dhl yard|location after pickup|unless otherwise instructed/i.test(folder.title)) issues.push({severity:'error',code:'ROUTE_IS_INSTRUCTION',loadNo:folder.loadNo,message:`${prefix}: route appears to contain an instruction instead of real origin/destination.`});
    if(folder.days.length>1){ const first=new Date(folder.days[0]+'T12:00:00'); const last=new Date(folder.days.at(-1)+'T12:00:00'); const span=Math.round((last-first)/86400000); if(Number.isFinite(span)&&span>14) issues.push({severity:'warning',code:'DATE_SPAN_SUSPICIOUS',loadNo:folder.loadNo,message:`${prefix}: linked dates span ${span} days (${folder.days[0]} to ${folder.days.at(-1)}).`}); }
    if(/^(?:BEE|T)?\d{10,}$/i.test(folder.loadNo)) issues.push({severity:'warning',code:'LOAD_NUMBER_SUSPICIOUS',loadNo:folder.loadNo,message:`${prefix}: identifier may be a shipment/document ID rather than a load number.`});
    if(folder.unassignedPods?.length) issues.push({severity:'warning',code:'POD_STOP_UNASSIGNED',loadNo:folder.loadNo,message:`${prefix}: ${folder.unassignedPods.length} POD(s) are not assigned to a delivery stop.`});
  }
  for(const doc of documents){
    const docDate=text(doc.vaultDate||doc.documentDate||doc.extracted?.documentDate||doc.extracted?.date);
    if(!docDate) issues.push({severity:'warning',code:'DOCUMENT_DATE_MISSING',documentId:doc.local_id||doc.id,message:`Document ${doc.original_file_name||doc.title||doc.local_id}: date is not verified.`});
  }
  return {version:'109.7.3',generatedAt:new Date().toISOString(),summary:{errors:issues.filter(i=>i.severity==='error').length,warnings:issues.filter(i=>i.severity==='warning').length,total:issues.length},issues};
}

export async function exportRoadReadyAuditPackageV10973({folders=[],documents=[],state={},businessStore={}}={}){
  const generatedAt=new Date().toISOString();
  const report=analyzeAuditDataV10973(folders,documents);
  const manifest=[]; const entries=[];
  entries.push({name:'audit/report.json',bytes:jsonBytes(report)});
  entries.push({name:'audit/load-folders.json',bytes:jsonBytes(folders)});
  entries.push({name:'audit/app-state.json',bytes:jsonBytes(state)});
  entries.push({name:'audit/business-store.json',bytes:jsonBytes(businessStore)});
  for(let index=0;index<documents.length;index++){
    const doc=documents[index]; const blob=await vaultBlobV102(doc); const loadNo=vaultDocumentLoadNoV102(doc)||'UNASSIGNED'; const type=vaultDocumentTypeV102(doc)||'other';
    const original=safeName(doc.original_file_name||doc.title||`document-${index+1}`); const path=`originals/Load-${safeName(loadNo)}/${type}/${String(index+1).padStart(3,'0')}-${original}`;
    manifest.push({id:doc.local_id||doc.id,path,loadNo,type,title:doc.title,originalFileName:doc.original_file_name,mimeType:doc.mime_type,sizeBytes:blob?.size||doc.file_size_bytes||0,blobIncluded:Boolean(blob),classification:doc.classification,extracted:doc.extracted,metadata:doc.metadata,createdAt:doc.created_at,updatedAt:doc.updated_at});
    if(blob) entries.push({name:path,bytes:new Uint8Array(await blob.arrayBuffer())});
  }
  entries.push({name:'audit/document-manifest.json',bytes:jsonBytes(manifest)});
  entries.push({name:'README.txt',bytes:strBytes(`Road Ready Complete Audit Package\nGenerated: ${generatedAt}\n\nContains app state, business records, smart load folders, automated anomaly report, document metadata and every locally available original file.\n\nOpen audit/report.json first.\n`)});
  const tar=buildTar(entries); const packed=await gzip(tar); const stamp=generatedAt.slice(0,19).replace(/[:T]/g,'-'); download(packed.blob,`road-ready-complete-audit-${stamp}.${packed.extension}`);
  return {ok:true,files:entries.length,originals:manifest.filter(item=>item.blobIncluded).length,missingOriginals:manifest.filter(item=>!item.blobIncluded).length,report};
}

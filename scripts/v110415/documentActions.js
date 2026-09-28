'use client';
import {readTransferOriginal} from './transferStorageV110412.js';
import {assertSourceHash} from './evidenceCoreV110413.js';
import {digest,MAX_FILE_BYTES} from './transferCoreV110412.js';

async function originalFile(doc){
  const blob=await readTransferOriginal(doc);
  if(!blob?.size)throw new Error('This original is unavailable. Connect or use the device where it was saved.');
  if(blob.size>MAX_FILE_BYTES)throw new Error('This original is too large to prepare here.');
  assertSourceHash(doc,await digest(await blob.arrayBuffer()));
  const name=String(doc.original_file_name||doc.fileName||doc.title||'document').replace(/[\\/\u0000-\u001f]/g,'-');
  return new File([blob],name,{type:blob.type||doc.mime_type||doc.mimeType||'application/octet-stream'});
}
export async function sourceFile(doc,pages=[]){
  const file=await originalFile(doc);
  if(!pages.length)return file;
  if(file.type.startsWith('image/')&&pages.every(n=>n===1))return file;
  if(file.type!=='application/pdf')throw new Error('Saved page references need a PDF original. Open the full original to review.');
  const {PDFDocument}=await import('pdf-lib'),source=await PDFDocument.load(await file.arrayBuffer());
  if(pages.some(n=>!Number.isInteger(n)||n<1||n>source.getPageCount()))throw new Error('A saved page reference is unavailable. Open the full original to review.');
  const selected=await PDFDocument.create();for(const page of await selected.copyPages(source,[...new Set(pages)].map(n=>n-1)))selected.addPage(page);
  return new File([await selected.save()],file.name.replace(/\.pdf$/i,'')+'-selected-pages.pdf',{type:'application/pdf'});
}
export async function openSource(doc,pages=[]){
  const preview=window.open('','_blank');
  try{const file=await sourceFile(doc,pages),url=URL.createObjectURL(file);if(preview)preview.location.href=url;else window.location.assign(url);setTimeout(()=>URL.revokeObjectURL(url),120000);return {ok:true};}
  catch(error){preview?.close?.();throw error;}
}
export async function prepareLoadFiles(documents){
  const files=[];let total=0;
  for(const doc of documents){const file=await originalFile(doc);total+=file.size;if(total>MAX_FILE_BYTES)throw new Error('Share these originals separately from View originals.');files.push(file);}
  if(!files.length)throw new Error('Add a document first.');return files;
}

'use client';

import { buildLoadFoldersV10969 } from './loadFolderEngineV10969.js';
import { readRepairOverlayV10975 } from './repairImportV10975.js';

function text(v=''){return String(v??'').replace(/\s+/g,' ').trim();}
function upper(v=''){return text(v).toUpperCase();}
function typeOf(d={}){return text(d.document_type||d.type||d.classification?.selectedType||d.extracted?.type||d.metadata?.relationType).toLowerCase();}
function loadOf(d={}){return upper(d.load_no||d.loadNo||d.canonicalLoadNo||d.extracted?.canonicalLoadNo||d.extracted?.loadNo||d.metadata?.loadNo);}
function stopOf(d={}){const n=Number(d.stopSequence||d.stop_sequence||d.extracted?.stopSequence||d.metadata?.stopSequence||0);return Number.isFinite(n)?n:0;}
function docId(d={}){return text(d.local_id||d.localDocumentId||d.client_document_id||d.clientDocumentId||d.server_document_id||d.serverDocumentId||d.id);}
function normalizeBusinessDoc(d={}){return {...d,local_id:d.local_id||d.localDocumentId||d.id,client_document_id:d.client_document_id||d.clientDocumentId,server_document_id:d.server_document_id||d.serverDocumentId,original_file_name:d.original_file_name||d.fileName,mime_type:d.mime_type||d.mimeType,file_size_bytes:d.file_size_bytes||d.fileSizeBytes,load_no:d.load_no||d.loadNo||d.canonicalLoadNo,document_type:d.document_type||d.type,document_date:d.document_date||d.documentDate,created_at:d.created_at||d.createdAt,updated_at:d.updated_at||d.updatedAt};}
function docKey(d={}){
  const hash=text(d.sha256||d.content_hash||d.contentHash||d.captureManifest?.sha256||d.metadata?.sha256);
  if(hash) return `hash:${hash}`;
  const type=typeOf(d),load=loadOf(d),name=text(d.original_file_name||d.fileName).toLowerCase(),size=Number(d.file_size_bytes||d.fileSizeBytes||0);
  const reference=text(d.extracted?.bolNo||d.extracted?.billOfLading||d.extracted?.invoiceNo||d.extracted?.receiptNo||d.extracted?.shipmentId||'');
  if(['rate_confirmation','load_tender'].includes(type)) return `logical:${load}|${type}|${name}|${size}`;
  return `logical:${load}|${type}|${name}|${size}|${reference}`;
}
function richness(d={}){return Object.keys(d).length+Object.keys(d.extracted||{}).length*2+Object.keys(d.classification||{}).length;}
function suspiciousId(v=''){const s=upper(v);return !s||/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)||/^COUNT/i.test(s)||/^BEE[A-Z0-9]{8,}$/i.test(s)||/^T\d{10,}$/i.test(s)||/^\d{10,}$/.test(s)||/^0{2,}\d{8,}$/.test(s);}
function instruction(v=''){return /dhl yard|location after pickup|unless otherwise instructed|do not depart|remain on site/i.test(text(v));}
function applyDocRepair(doc,assignment){if(!assignment)return doc;return {...doc,load_no:assignment.loadNo||loadOf(doc),document_type:assignment.documentType||typeOf(doc),document_date:assignment.documentDate||doc.document_date,stopSequence:assignment.stopSequence||stopOf(doc),repairOverlayApplied:true};}

export function reconcileLoadFoldersV10974({loads=[],documents=[],state={},businessStore={}}={}){
  const overlay=readRepairOverlayV10975();
  const assignments=new Map((overlay.documentAssignments||[]).map(x=>[x.documentId,x]));
  const merged=new Map();
  for(const rawDoc of [...(documents||[]),...(businessStore.documents||[]).map(normalizeBusinessDoc)]){
    if(!rawDoc) continue; const assignment=assignments.get(docId(rawDoc)); if(assignment?.ignore) continue; const raw=applyDocRepair(rawDoc,assignment); const key=docKey(raw); const prev=merged.get(key); if(!prev||richness(raw)>richness(prev)) merged.set(key,raw);
  }
  const allDocs=[...merged.values()];
  const aliases=new Map((overlay.loadCorrections||[]).filter(x=>x.aliasFrom&&x.loadNo).map(x=>[x.aliasFrom,x.loadNo]));
  const repairedLoads=(loads||[]).map(load=>{const original=upper(load.loadNo||load.canonicalLoadNo);const mapped=aliases.get(original)||original;const fix=(overlay.loadCorrections||[]).find(x=>x.loadNo===mapped||x.aliasFrom===original);return {...load,loadNo:mapped,canonicalLoadNo:mapped,...(fix?.origin?{origin:fix.origin}:{}),...(fix?.destination?{destination:fix.destination}:{}),...(fix?.broker?{broker:fix.broker}:{}),repairLegacy:!!fix?.legacy,repairIgnored:!!fix?.ignore,repairDeliveryStops:Number(fix?.deliveryStops||0)};}).filter(x=>!x.repairIgnored);
  const authoritative=new Set(repairedLoads.map(l=>upper(l.loadNo||l.canonicalLoadNo)).filter(Boolean));
  for(const legs of Object.values(state.routeLegsByDay||{})) for(const leg of legs||[]) {const raw=upper(leg.loadNo||leg.orderNo||leg.shippingDocs);const n=aliases.get(raw)||raw;if(n)authoritative.add(n);}
  for(const d of allDocs) if(['rate_confirmation','load_tender'].includes(typeOf(d))&&!suspiciousId(loadOf(d))) authoritative.add(loadOf(d));
  const reviewItems=allDocs.filter(d=>{const n=loadOf(d);return !n||suspiciousId(n)||!authoritative.has(n);});
  const accepted=allDocs.filter(d=>!reviewItems.includes(d));
  const enrichedLoads=repairedLoads.map(load=>{
    const n=upper(load.loadNo||load.canonicalLoadNo); const docs=accepted.filter(d=>loadOf(d)===n);
    const explicitMax=Math.max(0,...docs.map(stopOf)); const existing=(load.stops||[]).filter(s=>s.type==='delivery').length;
    const podCount=docs.filter(d=>['pod','delivery_receipt'].includes(typeOf(d))).length; const ratePresent=docs.some(d=>['rate_confirmation','load_tender'].includes(typeOf(d)));
    const inferredByPod=ratePresent&&existing>0&&podCount===existing+1?podCount:0; const requiredStops=Math.max(existing,explicitMax,inferredByPod,Number(load.repairDeliveryStops||0));
    const extra=[]; for(let i=existing+1;i<=requiredStops;i++) extra.push({type:'delivery',sequence:i,stopSequence:i,company:`Delivery stop ${i}`,source:Number(load.repairDeliveryStops||0)>=i?'repair_import':explicitMax>=i?'document_stop_sequence':'pod_count_evidence'});
    const origin=instruction(load.origin)?'':load.origin; const destination=instruction(load.destination)?'':load.destination;
    return {...load,origin,destination,stops:[...(load.stops||[]),...extra]};
  });
  const folders=buildLoadFoldersV10969({loads:enrichedLoads,documents:accepted,state,businessStore:{...businessStore,documents:accepted}}).map(folder=>{const source=enrichedLoads.find(l=>upper(l.loadNo)===folder.loadNo);return source?.repairLegacy?{...folder,status:folder.status==='complete'?'complete':'legacy_review',legacy:true}:folder;});
  return {folders,reviewItems,allDocuments:allDocs,repairOverlay:overlay};
}

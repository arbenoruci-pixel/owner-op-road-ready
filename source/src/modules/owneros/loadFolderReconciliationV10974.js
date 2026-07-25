'use client';

import { buildLoadFoldersV10969 } from './loadFolderEngineV10969.js';

function text(v=''){return String(v??'').replace(/\s+/g,' ').trim();}
function upper(v=''){return text(v).toUpperCase();}
function typeOf(d={}){return text(d.document_type||d.type||d.classification?.selectedType||d.extracted?.type||d.metadata?.relationType).toLowerCase();}
function loadOf(d={}){return upper(d.load_no||d.loadNo||d.canonicalLoadNo||d.extracted?.canonicalLoadNo||d.extracted?.loadNo||d.metadata?.loadNo);}
function stopOf(d={}){const n=Number(d.stopSequence||d.stop_sequence||d.extracted?.stopSequence||d.metadata?.stopSequence||0);return Number.isFinite(n)?n:0;}
function normalizeBusinessDoc(d={}){return {...d,local_id:d.local_id||d.localDocumentId||d.id,client_document_id:d.client_document_id||d.clientDocumentId,server_document_id:d.server_document_id||d.serverDocumentId,original_file_name:d.original_file_name||d.fileName,mime_type:d.mime_type||d.mimeType,file_size_bytes:d.file_size_bytes||d.fileSizeBytes,load_no:d.load_no||d.loadNo||d.canonicalLoadNo,document_type:d.document_type||d.type,document_date:d.document_date||d.documentDate,created_at:d.created_at||d.createdAt,updated_at:d.updated_at||d.updatedAt};}
function docKey(d={}){return text(d.local_id||d.localDocumentId||d.client_document_id||d.clientDocumentId||d.server_document_id||d.serverDocumentId)||[loadOf(d),typeOf(d),text(d.original_file_name||d.fileName),Number(d.file_size_bytes||d.fileSizeBytes||0)].join('|');}
function richness(d={}){return Object.keys(d).length+Object.keys(d.extracted||{}).length*2+Object.keys(d.classification||{}).length;}
function suspiciousId(v=''){const s=upper(v);return !s||/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)||/^COUNT/i.test(s)||/^BEE[A-Z0-9]{8,}$/i.test(s)||/^T\d{10,}$/i.test(s)||/^\d{10,}$/.test(s)||/^0{2,}\d{8,}$/.test(s);}
function instruction(v=''){return /dhl yard|location after pickup|unless otherwise instructed|do not depart|remain on site/i.test(text(v));}

export function reconcileLoadFoldersV10974({loads=[],documents=[],state={},businessStore={}}={}){
  const merged=new Map();
  for(const raw of [...(documents||[]),...(businessStore.documents||[]).map(normalizeBusinessDoc)]){
    if(!raw) continue; const key=docKey(raw); const prev=merged.get(key); if(!prev||richness(raw)>richness(prev)) merged.set(key,raw);
  }
  const allDocs=[...merged.values()];
  const authoritative=new Set((loads||[]).map(l=>upper(l.loadNo||l.canonicalLoadNo)).filter(Boolean));
  for(const legs of Object.values(state.routeLegsByDay||{})) for(const leg of legs||[]) {const n=upper(leg.loadNo||leg.orderNo||leg.shippingDocs);if(n)authoritative.add(n);}
  for(const d of allDocs) if(['rate_confirmation','load_tender'].includes(typeOf(d))&&!suspiciousId(loadOf(d))) authoritative.add(loadOf(d));
  const reviewItems=allDocs.filter(d=>{const n=loadOf(d);return !n||suspiciousId(n)||!authoritative.has(n);});
  const accepted=allDocs.filter(d=>!reviewItems.includes(d));
  const enrichedLoads=(loads||[]).map(load=>{
    const n=upper(load.loadNo||load.canonicalLoadNo); const docs=accepted.filter(d=>loadOf(d)===n);
    const maxStop=Math.max(0,...docs.map(stopOf)); const existing=(load.stops||[]).filter(s=>s.type==='delivery').length;
    const extra=[]; for(let i=existing+1;i<=maxStop;i++) extra.push({type:'delivery',sequence:i,stopSequence:i,company:`Delivery stop ${i}`,source:'document_evidence'});
    const origin=instruction(load.origin)?'':load.origin; const destination=instruction(load.destination)?'':load.destination;
    return {...load,origin,destination,stops:[...(load.stops||[]),...extra]};
  });
  const folders=buildLoadFoldersV10969({loads:enrichedLoads,documents:accepted,state,businessStore:{...businessStore,documents:accepted}});
  return {folders,reviewItems,allDocuments:allDocs};
}

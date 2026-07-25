'use client';

import { buildLoadFoldersV10969 } from './loadFolderEngineV10969.js';
import { readRepairOverlayV10975 } from './repairImportV10975.js';

function text(v=''){return String(v??'').replace(/\s+/g,' ').trim();}
function upper(v=''){return text(v).toUpperCase();}
function canonicalType(v=''){
  const s=text(v).toLowerCase().replace(/[\s-]+/g,'_');
  if(/^(rate_?con|rate_confirmation|carrier_confirmation|load_tender|rat)$/.test(s)) return 'rate_confirmation';
  if(/^(bol|bill_of_lading|signed_bol)$/.test(s)) return 'bol';
  if(/^(pod|proof_of_delivery|delivery_receipt|signed_delivery_receipt)$/.test(s)) return 'pod';
  if(/(supporting.*packet|billing.*packet|factoring.*packet|invoice.*packet)/.test(s)) return 'supporting_packet';
  return s||'other';
}
function typeOf(d={}){return canonicalType(d.document_type||d.type||d.classification?.selectedType||d.extracted?.type||d.metadata?.relationType);}
function loadOf(d={}){return upper(d.load_no||d.loadNo||d.canonicalLoadNo||d.extracted?.canonicalLoadNo||d.extracted?.loadNo||d.metadata?.loadNo);}
function stopOf(d={}){const n=Number(d.stopSequence||d.stop_sequence||d.extracted?.stopSequence||d.metadata?.stopSequence||0);return Number.isFinite(n)?n:0;}
function docId(d={}){return text(d.local_id||d.localDocumentId||d.client_document_id||d.clientDocumentId||d.server_document_id||d.serverDocumentId||d.id);}
function normalizeBusinessDoc(d={}){return {...d,local_id:d.local_id||d.localDocumentId||d.id,client_document_id:d.client_document_id||d.clientDocumentId,server_document_id:d.server_document_id||d.serverDocumentId,original_file_name:d.original_file_name||d.fileName,mime_type:d.mime_type||d.mimeType,file_size_bytes:d.file_size_bytes||d.fileSizeBytes,load_no:d.load_no||d.loadNo||d.canonicalLoadNo,document_type:d.document_type||d.type,document_date:d.document_date||d.documentDate,created_at:d.created_at||d.createdAt,updated_at:d.updated_at||d.updatedAt};}
function referenceOf(d={}){return upper(d.extracted?.bolNo||d.extracted?.billOfLading||d.extracted?.podNo||d.extracted?.shipmentId||d.extracted?.invoiceNo||d.extracted?.receiptNo||d.metadata?.referenceNo||'');}
function fileNameOf(d={}){return text(d.original_file_name||d.fileName||d.title).toLowerCase().replace(/\(\d+\)(?=\.[a-z0-9]+$)/,'');}
function docKey(d={}){
  const hash=text(d.sha256||d.content_hash||d.contentHash||d.captureManifest?.sha256||d.metadata?.sha256).toLowerCase();
  if(hash) return `hash:${hash}`;
  const type=typeOf(d),load=loadOf(d),stop=stopOf(d),ref=referenceOf(d),name=fileNameOf(d),size=Number(d.file_size_bytes||d.fileSizeBytes||0);
  if(type==='rate_confirmation') return `core:${load}|rate_confirmation`;
  if(type==='pod') return ref?`core:${load}|pod|${ref}`:`core:${load}|pod|stop:${stop||0}|${name}|${size}`;
  if(type==='bol') return ref?`core:${load}|bol|${ref}`:`core:${load}|bol|stop:${stop||0}|${name}|${size}`;
  if(type==='supporting_packet') return `support:${load}|${name}|${size}`;
  return `other:${load}|${type}|${ref||name}|${size}`;
}
function richness(d={}){return Object.keys(d).length+Object.keys(d.extracted||{}).length*2+Object.keys(d.classification||{}).length+(text(d.sha256)?5:0);}
function suspiciousId(v=''){const s=upper(v);return !s||/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)||/^COUNT/i.test(s)||/^BEE[A-Z0-9]{8,}$/i.test(s)||/^T\d{10,}$/i.test(s)||/^\d{10,}$/.test(s)||/^0{2,}\d{8,}$/.test(s);}
function instruction(v=''){return /dhl yard|location after pickup|unless otherwise instructed|do not depart|remain on site/i.test(text(v));}
function applyDocRepair(doc,assignment,aliases){
  const assigned=assignment?{...doc,load_no:assignment.loadNo||loadOf(doc),document_type:assignment.documentType||typeOf(doc),document_date:assignment.documentDate||doc.document_date,stopSequence:Number(assignment.stopSequence||stopOf(doc)),repairOverlayApplied:true}:doc;
  const current=loadOf(assigned),mapped=aliases.get(current)||current;
  return {...assigned,load_no:mapped,canonicalLoadNo:mapped,document_type:typeOf(assigned)};
}
function mergeLoad(base={},incoming={}){
  const stops=[...(base.stops||[]),...(incoming.stops||[])];
  const seen=new Set();
  const uniqueStops=stops.filter(stop=>{const key=`${text(stop.type)}|${Number(stop.sequence||stop.stopSequence||0)}|${text(stop.company||stop.location)}`;if(seen.has(key))return false;seen.add(key);return true;});
  return {...base,...incoming,origin:incoming.origin||base.origin,destination:incoming.destination||base.destination,broker:incoming.broker||base.broker,stops:uniqueStops,repairLegacy:!!(base.repairLegacy||incoming.repairLegacy),repairIgnored:!!(base.repairIgnored&&incoming.repairIgnored),repairDeliveryStops:Math.max(Number(base.repairDeliveryStops||0),Number(incoming.repairDeliveryStops||0))};
}

export function reconcileLoadFoldersV10974({loads=[],documents=[],state={},businessStore={}}={}){
  const overlay=readRepairOverlayV10975();
  const aliases=new Map((overlay.loadCorrections||[]).filter(x=>x.aliasFrom&&x.loadNo).map(x=>[upper(x.aliasFrom),upper(x.loadNo)]));
  const assignments=new Map((overlay.documentAssignments||[]).map(x=>[x.documentId,x]));
  const mergedDocs=new Map();
  for(const rawDoc of [...(documents||[]),...(businessStore.documents||[]).map(normalizeBusinessDoc)]){
    if(!rawDoc) continue;
    const assignment=assignments.get(docId(rawDoc));
    if(assignment?.ignore) continue;
    const raw=applyDocRepair(rawDoc,assignment,aliases),key=docKey(raw),prev=mergedDocs.get(key);
    if(!prev||richness(raw)>richness(prev)) mergedDocs.set(key,raw);
  }
  const allDocs=[...mergedDocs.values()];
  const loadMap=new Map();
  for(const load of loads||[]){
    const original=upper(load.loadNo||load.canonicalLoadNo),mapped=aliases.get(original)||original;
    const fix=(overlay.loadCorrections||[]).find(x=>upper(x.loadNo)===mapped||upper(x.aliasFrom)===original);
    const repaired={...load,loadNo:mapped,canonicalLoadNo:mapped,...(fix?.origin?{origin:fix.origin}:{}),...(fix?.destination?{destination:fix.destination}:{}),...(fix?.broker?{broker:fix.broker}:{}),repairLegacy:!!fix?.legacy,repairIgnored:!!fix?.ignore,repairDeliveryStops:Number(fix?.deliveryStops||0)};
    if(repaired.repairIgnored) continue;
    loadMap.set(mapped,loadMap.has(mapped)?mergeLoad(loadMap.get(mapped),repaired):repaired);
  }
  const repairedLoads=[...loadMap.values()];
  const authoritative=new Set(repairedLoads.map(l=>upper(l.loadNo)).filter(Boolean));
  for(const legs of Object.values(state.routeLegsByDay||{})) for(const leg of legs||[]){const raw=upper(leg.loadNo||leg.orderNo||leg.shippingDocs),n=aliases.get(raw)||raw;if(n)authoritative.add(n);}
  for(const d of allDocs) if(typeOf(d)==='rate_confirmation'&&!suspiciousId(loadOf(d))) authoritative.add(loadOf(d));
  const reviewItems=allDocs.filter(d=>{const n=loadOf(d);return !n||suspiciousId(n)||!authoritative.has(n);});
  const accepted=allDocs.filter(d=>!reviewItems.includes(d));
  const enrichedLoads=repairedLoads.map(load=>{
    const n=upper(load.loadNo),docs=accepted.filter(d=>loadOf(d)===n),explicitMax=Math.max(0,...docs.map(stopOf));
    const deliveries=(load.stops||[]).filter(s=>s.type==='delivery'),existing=deliveries.length;
    const uniquePods=new Set(docs.filter(d=>typeOf(d)==='pod').map(d=>referenceOf(d)||`stop:${stopOf(d)}|${fileNameOf(d)}`)).size;
    const requiredStops=Math.max(existing,explicitMax,Number(load.repairDeliveryStops||0),uniquePods&&existing?uniquePods:0);
    const extra=[];for(let i=existing+1;i<=requiredStops;i++)extra.push({type:'delivery',sequence:i,stopSequence:i,company:`Delivery stop ${i}`,source:'reconciled_evidence'});
    return {...load,origin:instruction(load.origin)?'':load.origin,destination:instruction(load.destination)?'':load.destination,stops:[...(load.stops||[]),...extra]};
  });
  const folders=buildLoadFoldersV10969({loads:enrichedLoads,documents:accepted,state,businessStore:{...businessStore,documents:accepted}}).map(folder=>{const source=enrichedLoads.find(l=>upper(l.loadNo)===folder.loadNo);return source?.repairLegacy?{...folder,status:folder.status==='complete'?'complete':'legacy_review',legacy:true}:folder;});
  return {folders,reviewItems,allDocuments:allDocs,repairOverlay:overlay};
}

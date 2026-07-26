'use client';

function text(v=''){return String(v??'').replace(/\s+/g,' ').trim();}
function compact(v=''){return text(v).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
function rawType(d={}){return text(d.document_type||d.type||d.classification?.selectedType||d.extracted?.type||d.metadata?.relationType);}
function haystack(d={}){return [rawType(d),d.title,d.original_file_name,d.fileName,d.extracted?.title,d.extracted?.merchant,d.extracted?.description,d.metadata?.relationType].map(text).join(' ').toLowerCase();}
function upper(v=''){return text(v).toUpperCase();}
function loadOf(d={}){return upper(d.load_no||d.loadNo||d.canonicalLoadNo||d.extracted?.canonicalLoadNo||d.extracted?.loadNo||d.metadata?.loadNo);}
function stopOf(d={}){const n=Number(d.stopSequence||d.stop_sequence||d.extracted?.stopSequence||d.metadata?.stopSequence||0);return Number.isFinite(n)?n:0;}
function referenceOf(d={}){return upper(d.extracted?.bolNo||d.extracted?.billOfLading||d.extracted?.podNo||d.extracted?.shipmentId||d.metadata?.referenceNo||'');}

export function normalizedDocumentTypeV10977(d={}){
 const raw=compact(rawType(d)),h=haystack(d);
 if(/supporting.*packet|billing.*packet|factoring.*packet|invoice.*packet/.test(raw+' '+h))return 'supporting_packet';
 if(['rate_confirmation','rate_con','ratecon','carrier_confirmation','load_confirmation','load_tender','rat'].includes(raw)||/\brate\s*(confirmation|con)\b|carrier confirmation|load tender/.test(h))return 'rate_confirmation';
 if(['pod','proof_of_delivery','delivery_receipt','signed_bol'].includes(raw)||/proof of delivery|delivery receipt|signed\s+bol/.test(h))return 'pod';
 if(['bol','bill_of_lading'].includes(raw)||/bill of lading|\bbol\b/.test(h))return 'bol';
 if(['fuel_receipt','fuel'].includes(raw))return 'fuel_receipt';
 if(/lumper/.test(raw+' '+h))return 'lumper_receipt';
 if(/scale|cat[_ -]?scale|weight ticket/.test(raw+' '+h))return 'scale_ticket';
 if(/invoice/.test(raw+' '+h))return 'invoice';
 return raw||'other';
}

function fingerprint(d={}){
 const hash=text(d.sha256||d.hash||d.fileHash||d.content_hash||d.contentHash||d.captureManifest?.sha256||d.metadata?.sha256).toLowerCase();if(hash)return `hash:${hash}`;
 const source=text(d.original_id||d.originalId||d.source_document_id||d.sourceDocumentId||d.metadata?.sourceDocumentId);if(source)return `source:${source}`;
 const outlook=text(d.outlook_attachment_id||d.outlookAttachmentId||d.attachment_id||d.attachmentId||d.metadata?.outlookAttachmentId);if(outlook)return `outlook:${outlook}`;
 const blob=text(d.blob_id||d.blobId||d.storage_key||d.storageKey||d.object_key||d.objectKey||d.local_uri||d.localUri);if(blob)return `blob:${blob}`;
 const name=text(d.original_file_name||d.fileName||d.name).toLowerCase().replace(/\(\d+\)(?=\.[a-z0-9]+$)/,'');
 const size=Number(d.size_bytes||d.size||d.fileSize||d.file_size_bytes||d.fileSizeBytes||d.metadata?.size_bytes||0);
 if(name&&size>0)return `file:${name}:${size}`;
 return '';
}
function logicalKey(d={}){
 const type=normalizedDocumentTypeV10977(d),load=loadOf(d),stop=stopOf(d),ref=referenceOf(d);
 if(type==='rate_confirmation'&&load)return `core:${load}|rate_confirmation`;
 if(type==='bol'&&load)return `core:${load}|bol|stop:${stop||0}`;
 if(type==='pod'&&load)return stop?`core:${load}|pod|stop:${stop}`:ref?`core:${load}|pod|${ref}`:'';
 if(type==='supporting_packet'&&load){const physical=fingerprint(d);return physical?`support:${load}|${physical}`:'';}
 return '';
}
function richness(d={}){return Object.values(d||{}).filter(v=>v!==null&&v!==undefined&&v!=='').length+Object.values(d.extracted||{}).filter(v=>v!==null&&v!==undefined&&v!=='').length*2+(text(d.sha256||d.content_hash)?5:0);}
export function logicalDeduplicateDocumentsV10977(documents=[]){
 const physical=new Map(),unkeyed=[];
 for(const doc of documents||[]){const key=fingerprint(doc);if(!key){unkeyed.push(doc);continue;}const prior=physical.get(key);if(!prior||richness(doc)>richness(prior))physical.set(key,doc);}
 const logical=new Map(),other=[];
 for(const doc of [...physical.values(),...unkeyed]){const key=logicalKey(doc);if(!key){other.push(doc);continue;}const prior=logical.get(key);if(!prior||richness(doc)>richness(prior))logical.set(key,doc);}
 return [...logical.values(),...other];
}

export const SUPPORTING_DOCUMENT_GROUPS_V10977=[
 {id:'lumper',label:'Lumper receipts',icon:'LMP',test:(t,h)=>/lumper/.test(t+' '+h)},
 {id:'scale',label:'Scale tickets',icon:'SCL',test:(t,h)=>/(scale|cat[_ -]?scale|weight ticket)/.test(t+' '+h)},
 {id:'inspection',label:'Inspections',icon:'INS',test:(t,h)=>/(inspection|pre[_ -]?trip|post[_ -]?trip|vehicle inspection|trailer inspection)/.test(t+' '+h)},
 {id:'toll',label:'Toll documents',icon:'TOL',test:(t,h)=>/(toll|i-pass|ipass|ezpass|e-zpass)/.test(t+' '+h)},
 {id:'fuel',label:'Fuel receipts',icon:'FUL',test:(t,h)=>/(fuel|diesel|def receipt|gas station)/.test(t+' '+h)},
 {id:'trailer',label:'Trailer & equipment documents',icon:'TRL',test:(t,h)=>/(trailer|equipment|gate pass|interchange|return receipt|chassis)/.test(t+' '+h)},
 {id:'tracking',label:'Tracking & compliance',icon:'TRK',test:(t,h)=>/(fourkites|macro ?point|tracking|dhl mobile|compliance|check call)/.test(t+' '+h)},
 {id:'billing',label:'Billing, factoring & original packets',icon:'BIL',test:(t,h)=>/(supporting_packet|factoring|billing packet|original packet|invoice packet)/.test(t+' '+h)},
 {id:'payment',label:'Payment & accessorials',icon:'PAY',test:(t,h)=>/(detention|layover|tonu|truck ordered not used|accessorial|invoice|quick pay|payment|receipt)/.test(t+' '+h)},
 {id:'other',label:'Other supporting documents',icon:'OTH',test:()=>true},
];

const CORE_TYPES=new Set(['rate_confirmation','bol','pod']);
export function organizeSupportingDocumentsV10977(documents=[]){
 const groups=new Map(SUPPORTING_DOCUMENT_GROUPS_V10977.map(g=>[g.id,{...g,documents:[]}])) ;
 for(const doc of logicalDeduplicateDocumentsV10977(documents)){
  const type=normalizedDocumentTypeV10977(doc); if(CORE_TYPES.has(type)) continue;
  const h=haystack(doc); const group=SUPPORTING_DOCUMENT_GROUPS_V10977.find(g=>g.test(type,h))||SUPPORTING_DOCUMENT_GROUPS_V10977.at(-1);
  groups.get(group.id).documents.push(doc);
 }
 return [...groups.values()].filter(g=>g.documents.length>0);
}

export function supportingDocumentCountsV10977(documents=[]){
 const groups=organizeSupportingDocumentsV10977(documents);return {total:groups.reduce((s,g)=>s+g.documents.length,0),groups:Object.fromEntries(groups.map(g=>[g.id,g.documents.length])),organized:groups};
}

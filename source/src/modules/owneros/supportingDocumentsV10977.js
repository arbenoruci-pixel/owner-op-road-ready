'use client';

function text(v=''){return String(v??'').replace(/\s+/g,' ').trim();}
function compact(v=''){return text(v).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
function rawType(d={}){return text(d.document_type||d.type||d.classification?.selectedType||d.extracted?.type||d.metadata?.relationType);}
function haystack(d={}){return [rawType(d),d.title,d.original_file_name,d.fileName,d.extracted?.title,d.extracted?.merchant,d.extracted?.description,d.metadata?.relationType].map(text).join(' ').toLowerCase();}

export function normalizedDocumentTypeV10977(d={}){
 const raw=compact(rawType(d)),h=haystack(d);
 if(['rate_confirmation','rate_con','ratecon','carrier_confirmation','load_confirmation','load_tender','rat'].includes(raw)||/\brate\s*(confirmation|con)\b|carrier confirmation|load tender/.test(h))return 'rate_confirmation';
 if(['pod','proof_of_delivery','delivery_receipt','signed_bol'].includes(raw)||/proof of delivery|delivery receipt|signed\s+bol/.test(h))return 'pod';
 if(['bol','bill_of_lading'].includes(raw)||/bill of lading|\bbol\b/.test(h))return 'bol';
 if(['fuel_receipt','fuel'].includes(raw))return 'fuel_receipt';
 return raw;
}

function fingerprint(d={}){
 const hash=text(d.sha256||d.hash||d.fileHash||d.content_hash||d.metadata?.sha256).toLowerCase();if(hash)return `hash:${hash}`;
 const name=text(d.original_file_name||d.fileName||d.name).toLowerCase();
 const size=Number(d.size_bytes||d.size||d.fileSize||d.metadata?.size_bytes||0);
 if(name&&size>0)return `file:${name}:${size}`;
 const blob=text(d.blob_id||d.storage_key||d.storageKey||d.object_key||d.local_uri||d.localUri);if(blob)return `blob:${blob}`;
 const id=text(d.original_id||d.source_document_id||d.metadata?.sourceDocumentId);if(id)return `source:${id}`;
 return '';
}
function richness(d={}){return Object.values(d||{}).filter(v=>v!==null&&v!==undefined&&v!=='').length+Object.values(d.extracted||{}).filter(v=>v!==null&&v!==undefined&&v!=='').length*2;}
export function logicalDeduplicateDocumentsV10977(documents=[]){
 const keyed=new Map(),unkeyed=[];
 for(const doc of documents||[]){const key=fingerprint(doc);if(!key){unkeyed.push(doc);continue;}const prior=keyed.get(key);if(!prior||richness(doc)>richness(prior))keyed.set(key,doc);}
 return [...keyed.values(),...unkeyed];
}

export const SUPPORTING_DOCUMENT_GROUPS_V10977=[
 {id:'lumper',label:'Lumper receipts',icon:'LMP',test:(t,h)=>/lumper/.test(t+' '+h)},
 {id:'scale',label:'Scale tickets',icon:'SCL',test:(t,h)=>/(scale|cat[_ -]?scale|weight ticket)/.test(t+' '+h)},
 {id:'inspection',label:'Inspection records',icon:'INS',test:(t,h)=>/(inspection|pre[_ -]?trip|post[_ -]?trip|vehicle inspection|trailer inspection)/.test(t+' '+h)},
 {id:'toll',label:'Toll records',icon:'TOL',test:(t,h)=>/(toll|i-pass|ipass|ezpass|e-zpass)/.test(t+' '+h)},
 {id:'fuel',label:'Fuel receipts',icon:'FUL',test:(t,h)=>/(fuel|diesel|def receipt|gas station)/.test(t+' '+h)},
 {id:'trailer',label:'Trailer & equipment',icon:'TRL',test:(t,h)=>/(trailer|equipment|gate pass|interchange|return receipt|chassis)/.test(t+' '+h)},
 {id:'tracking',label:'Tracking & compliance',icon:'TRK',test:(t,h)=>/(fourkites|macro ?point|tracking|dhl mobile|compliance|check call)/.test(t+' '+h)},
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

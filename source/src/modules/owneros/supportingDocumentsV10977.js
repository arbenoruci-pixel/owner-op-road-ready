'use client';

function text(v=''){return String(v??'').replace(/\s+/g,' ').trim();}
function typeOf(d={}){return text(d.document_type||d.type||d.classification?.selectedType||d.extracted?.type||d.metadata?.relationType).toLowerCase();}
function haystack(d={}){return [typeOf(d),d.title,d.original_file_name,d.fileName,d.extracted?.title,d.extracted?.merchant,d.extracted?.description,d.metadata?.relationType].map(text).join(' ').toLowerCase();}

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

const CORE_TYPES=new Set(['rate_confirmation','load_tender','bol','pod','delivery_receipt']);
export function organizeSupportingDocumentsV10977(documents=[]){
 const groups=new Map(SUPPORTING_DOCUMENT_GROUPS_V10977.map(g=>[g.id,{...g,documents:[]}])) ;
 for(const doc of documents||[]){
  const type=typeOf(doc); if(CORE_TYPES.has(type)) continue;
  const h=haystack(doc); const group=SUPPORTING_DOCUMENT_GROUPS_V10977.find(g=>g.test(type,h))||SUPPORTING_DOCUMENT_GROUPS_V10977.at(-1);
  groups.get(group.id).documents.push(doc);
 }
 return [...groups.values()].filter(g=>g.documents.length>0);
}

export function supportingDocumentCountsV10977(documents=[]){
 const groups=organizeSupportingDocumentsV10977(documents);return {total:groups.reduce((s,g)=>s+g.documents.length,0),groups:Object.fromEntries(groups.map(g=>[g.id,g.documents.length])),organized:groups};
}

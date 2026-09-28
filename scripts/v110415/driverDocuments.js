// Presentation of saved evidence only. Originals, filing and business data are unchanged.
import {buildEvidence,LOAD_RULES,componentsOf,hasReviewedEvidence,evidenceLoadResolver,loadOf,idOf,kindOf,documentFacts,day,localToday,text,list} from './evidenceCoreV110413.js';
import {uniqueDocumentFiles,savedExport} from './documentBrowserV110404.js';

export function shortPlace(value){
  const clean=text(value).replace(/\s+/g,' '),parts=clean.split(',').map(text).filter(Boolean);
  if(parts.length>1&&/^[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test(parts.at(-1)))return parts.at(-2)+', '+parts.at(-1).slice(0,2);
  return clean;
}
export function shortDay(value){const d=day(value);return d?new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';}
export function loadReviewRows(model,folder,businessStore={}){
  const resolve=evidenceLoadResolver(businessStore),ref=resolve(folder?.loadNo);
  return [...model.checks,...model.issues].filter(r=>['missing','review'].includes(r.status)&&(!folder||r.loadNo&&resolve(r.loadNo)===ref||r.document&&resolve(loadOf(r.document))===ref));
}
export function loadView(folder,allDocuments,businessStore={},today=localToday()){
  const resolve=evidenceLoadResolver(businessStore),ref=resolve(folder.loadNo);
  const stored=list(businessStore.loads).find(l=>resolve(loadOf(l))===ref)||{};
  const load={...folder,...stored,loadNo:ref,origin:folder.origin||stored.origin,destination:folder.destination||stored.destination};
  const files=uniqueDocumentFiles(allDocuments.filter(d=>resolve(loadOf(d))===ref&&!savedExport(d)));
  const model=buildEvidence({documents:allDocuments,loads:[load],businessStore,loadNo:ref,today});
  const open=loadReviewRows(model,folder,businessStore),missing=open.filter(r=>r.status==='missing').length,review=open.filter(r=>r.status==='review').length;
  const rows=model.checks.filter(r=>r.area==='load').map(row=>{
    const rule=LOAD_RULES.find(r=>r.id===row.kind),kinds=rule?.kinds||[row.kind];
    const candidates=files.flatMap(doc=>{
      const parts=componentsOf(doc).filter(c=>kinds.includes(c.kind)&&resolve(c.fields?.loadNo||loadOf(doc))===ref);
      if(!parts.length)return [];
      const preferred=kinds.find(kind=>parts.some(c=>c.kind===kind));
      const pages=[...new Set(parts.filter(c=>c.kind===preferred).flatMap(c=>list(c.pages)))].sort((a,b)=>a-b);
      return [{doc,pages,verified:hasReviewedEvidence(doc,kinds,ref,businessStore)}];
    }).sort((a,b)=>Number(b.verified)-Number(a.verified));
    return {...row,label:row.kind==='pod'?'Signed POD':row.label,sources:candidates};
  });
  const stage=text(load.documentWorkflowStage||load.serviceStatus||load.status).toLowerCase();
  const routeNote=/source discrepancy|(?:route|location).{0,35}(?:conflict|discrepan)|(?:conflict|discrepan).{0,35}(?:route|location)/i.test(text(load.notes))?text(load.notes):'';
  let status={label:'Documents on file',tone:'saved'};
  if(stage==='tonu'||stage==='cancelled')status={label:stage==='tonu'?'Cancelled · TONU':'Cancelled',tone:'neutral'};
  else if(routeNote)status={label:'Check route',tone:'warning'};
  else if(missing)status={label:`${missing} missing`,tone:'warning'};
  else if(review)status={label:`${review} ${review===1?'detail':'details'} to check`,tone:'warning'};
  else if(day(load.deliveryDate)>today&&!['delivered','invoiced','submitted','paid'].includes(stage))status={label:`Delivery ${shortDay(load.deliveryDate)}`,tone:'neutral'};
  else if(!files.length)status={label:'No documents yet',tone:'neutral'};
  const delivered=['delivered','invoiced','submitted','paid'].includes(stage)||!!load.deliveredDate||rows.some(r=>r.kind==='pod'&&r.status==='ready');
  const signedDate=rows.find(r=>r.kind==='pod'&&r.status==='ready')?.sources.find(s=>s.verified);
  const date=day(load.deliveredDate)||day(load.deliveryDate)||day(signedDate&&documentFacts(signedDate.doc).date);
  return {load,files,rows,open,missing,review,routeNote,status,attention:missing+review+(routeNote?1:0),onFile:rows.filter(r=>r.sources.length).length,
    origin:shortPlace(load.origin)||'Pickup not set',destination:shortPlace(load.destination)||'Delivery not set',
    service:stage==='tonu'?'Cancelled · TONU':stage==='cancelled'?'Cancelled':delivered?`Delivered${date?' '+shortDay(date):''}`:day(load.deliveryDate)?`Delivery ${shortDay(load.deliveryDate)}`:'Delivery date not set',
    amount:Number(load.gross||load.revenue||0)};
}

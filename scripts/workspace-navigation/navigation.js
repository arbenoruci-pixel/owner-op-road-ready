// Navigation and filing projections. Recorded duty and original evidence stay owned by their existing modules.
const text=value=>String(value??'').trim();
const ref=value=>text(value).toUpperCase();
const views=new Set(['logs','logbook','day','wallet','dot','backup','driveMode','unsigned']);
export function openWorkspace(state,view){
  if(!views.has(view))return state;
  return {...state,view,sheet:null,workspaceReturnViews:{...state.workspaceReturnViews,[view]:views.has(state.view)?state.view:'logs'}};
}
export function returnWorkspace(state,view,fallback='logs'){
  const target=state.workspaceReturnViews?.[view];
  return {...state,view:views.has(target)&&target!==view?target:fallback,sheet:null,selectMode:false,selectedIds:[]};
}
export function recordLogDay(record,state){
  const active=state.activeDriverId||state.teamDrivers?.[0]?.id||'driver_primary';
  if(record?.driverId!==active||!/^\d{4}-\d{2}-\d{2}$/.test(text(record?.day)))return '';
  return [state.eventsByDay,state.formByDay,state.signatureByDay].some(book=>Object.hasOwn(book||{},record.day))?record.day:'';
}
export function shipmentLogDay(state,reference,today){
  const wanted=ref(reference),days=[];
  if(!wanted)return today;
  for(const [day,legs]of Object.entries(state.routeLegsByDay||{}))for(const leg of legs||[]){
    if(![leg.loadNo,leg.shippingDocs,leg.bol].some(value=>ref(value)===wanted)||!leg.pickupEventId)continue;
    for(const [eventDay,events]of Object.entries(state.eventsByDay||{}))if(eventDay<=today&&(events||[]).some(event=>event.id===leg.pickupEventId))days.push(eventDay);
  }
  return days.sort().at(-1)||today;
}
export function driveStatusLabel(status){return {OFF:'OFF DUTY',SB:'SLEEPER BERTH',ON:'ON DUTY',D:'DRIVING'}[status]||'OFF DUTY';}
const filingTypes={fuel:'fuel_receipt',repair:'maintenance',tolls:'toll_receipt',expense:'other_expense',settlement:'carrier_settlement'};
export function projectFiledDocument(doc){
  const filing=doc.evidenceFilingV1;
  if(filing?.version!==1||!filing.confirmed)return doc;
  return {...doc,type:filingTypes[filing.category]||filing.category,document_type:filingTypes[filing.category]||filing.category,
    load_no:text(filing.loadNo),loadNo:text(filing.loadNo),canonicalLoadNo:text(filing.loadNo),document_date:text(filing.date),documentDate:text(filing.date),
    extracted:{...doc.extracted,type:filingTypes[filing.category]||filing.category,loadNo:text(filing.loadNo),canonicalLoadNo:text(filing.loadNo),date:text(filing.date),documentDate:text(filing.date)}};
}
const recordKeys=doc=>[
  ['local',doc.local_id||doc.localDocumentId||doc.id],['client',doc.client_document_id||doc.clientDocumentId],['server',doc.server_document_id||doc.serverDocumentId]
].filter(([,value])=>text(value)).map(([kind,value])=>kind+':'+text(value));
export function localFileRecord(doc,localDocuments=[]){
  const keys=new Set(recordKeys(doc));
  const matches=localDocuments.filter(local=>recordKeys(local).some(key=>keys.has(key)));
  return matches.length===1?matches[0]:null;
}
export const canFileDocument=(doc,localDocuments=[])=>Boolean(localFileRecord(doc,localDocuments));
export function projectDocumentFilings(documents=[]){
  const filed=documents.filter(doc=>doc?.evidenceFilingV1?.version===1&&doc.evidenceFilingV1.confirmed);
  const stamp=doc=>Date.parse(doc.evidenceFilingV1.updatedAt||doc.updated_at)||Number(doc.updatedAt)||0;
  return documents.filter(Boolean).map(doc=>{
    const keys=new Set(recordKeys(doc));
    const candidates=filed.filter(other=>recordKeys(other).some(key=>keys.has(key))&&!(doc.sha256&&other.sha256&&doc.sha256!==other.sha256)).sort((a,b)=>stamp(b)-stamp(a));
    if(!candidates.length)return projectFiledDocument(doc);
    const first=candidates[0],sameTime=candidates.filter(other=>stamp(other)===stamp(first));
    if(new Set(sameTime.map(other=>JSON.stringify(other.evidenceFilingV1))).size>1)return projectFiledDocument(doc);
    return projectFiledDocument({...doc,evidenceFilingV1:first.evidenceFilingV1});
  });
}

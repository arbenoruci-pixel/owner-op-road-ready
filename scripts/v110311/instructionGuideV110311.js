import {buildDriverLoadGuideV103,dispatchSmartDocumentLinkV100} from './loadGuideV103.js';
import {applyVaultDocumentCommitV105,upsertBusinessLoadV105} from '../documents/documentFoundationV105.js';
import {readBusinessStore} from '../business/businessStore.js';
import {INSTRUCTION_GUIDE_SOURCE_V110311,instructionGuideBackedV110311,instructionRefV110311 as ref,instructionBrokerKeyV110311 as brokerKey} from './instructionAuthorityV110311.js';
const same=(a,b)=>ref(a.loadNo||a.canonicalLoadNo)===ref(b.loadNo||b.canonicalLoadNo)&&brokerKey(a.broker)===brokerKey(b.broker);
export function buildInstructionGuideV110311(plan,record={},previous={}) {
 if(!plan||record.type!=='load_tender'||record.status!=='verified'||ref(record.canonicalLoadNo)!==ref(plan.loadNo)||brokerKey(record.broker)!==brokerKey(plan.broker))return null;
 const fields={...plan.fields,loadNo:plan.loadNo,orderNo:plan.loadNo,broker:plan.broker,stops:plan.stops};
 for(const key of ['total','gross','grossPay','netPay','linehaul','fuelSurcharge'])delete fields[key];
 const guide=buildDriverLoadGuideV103(fields,{sourceText:plan.sourceText,documentId:record.id,createdAt:record.createdAt});
 guide.id=`instruction_guide_${brokerKey(plan.broker)}_${ref(plan.loadNo)}`;
 guide.source=INSTRUCTION_GUIDE_SOURCE_V110311;guide.instructionEvidenceV110311=true;
 guide.stops=guide.stops.map((stop,i)=>({...stop,pickupNumber:plan.stops[i]?.pickupNumber||''}));
 guide.steps=guide.steps.map(step=>{const stop=guide.stops.find(s=>step.phase==='pickup'?s.type==='pickup':s.type==='delivery'&&s.deliverySequence===step.stopSequence);return step.kind==='route'&&stop?{...step,location:stop.address}:step;});
 guide.sourceDocumentId=record.id;guide.instructionsDocumentId=record.id;
 guide.documents={documentIds:[record.id],instructionsDocumentId:record.id};guide.risks=plan.risks||[];
 guide.rate=undefined;guide.linehaul=undefined;guide.paymentStatus='not_provided';
 const returns=guide.stops.filter(s=>s.role==='trailer_return');
 const freightFinal=guide.stops.filter(s=>s.type==='delivery'&&s.role!=='trailer_return').at(-1);
 if(returns.length&&freightFinal){
  guide.steps=guide.steps.map(step=>{
   const stop=guide.stops.find(s=>s.deliverySequence===step.stopSequence&&s.role==='trailer_return');
   if(step.id==='final_pod')return {...step,phase:`delivery_${freightFinal.deliverySequence}`,day:freightFinal.date,city:freightFinal.city,state:freightFinal.state,location:freightFinal.cityState,stopSequence:freightFinal.deliverySequence,title:'Save delivery POD',detail:'Save the signed delivery paperwork before returning the trailer.'};
   if(!stop)return step;
   const titles={route:'Navigate to trailer return',status:step.status==='D'?'Drive to trailer return':'Log trailer return',manual:'Inspect and photograph returned trailer',complete_stop:'Confirm trailer returned'};
   return {...step,title:titles[step.kind]||step.title,detail:stop.address,checklist:step.kind==='manual'?['Photograph all sides','Record damage and return receipt']:step.checklist,reason:step.kind==='status'&&step.status==='ON'?'Trailer drop / Return':step.reason};
  });
  const pod=guide.steps.find(s=>s.id==='final_pod');guide.steps=guide.steps.filter(s=>s.id!=='final_pod');
  const at=guide.steps.findIndex(s=>s.id===`depart_delivery_${freightFinal.deliverySequence}`);guide.steps.splice(at>=0?at:guide.steps.length,0,pod);
 }
 guide.steps=guide.steps.filter(s=>!(s.id==='accept_tracking'&&guide.risks.some(r=>r.id==='macropoint')));
 guide.steps.splice(1,0,...guide.risks.map(r=>({id:'instruction_'+r.id,kind:'manual',phase:'before_pickup',title:r.title,detail:r.detail,checklist:[],loadNo:guide.loadNo,action:'toggle_done'})));
 if(previous&&same(previous,guide)){
  if(previous.gross||previous.rate){guide.rate=previous.gross||previous.rate;guide.paymentStatus='existing_load';}
 }
 return guide;
}
export function persistInstructionGuideV110311(store,record,plan) {
 if(!plan)return {store,record,guide:null};
 const exact=(store.loads||[]).filter(l=>ref(l.loadNo||l.canonicalLoadNo)===ref(plan.loadNo));
 if(exact.some(l=>l.broker&&brokerKey(l.broker)!==brokerKey(plan.broker)))return {store,record,guide:null};
 const previous=exact.find(l=>same(l,plan))||{},guide=buildInstructionGuideV110311(plan,record,previous);
 if(!guide)return {store,record,guide:null};
 record.instructionGuide=guide;
 const load={...previous,id:previous.id||`load_${plan.loadNo}`,loadNo:plan.loadNo,canonicalLoadNo:plan.loadNo,broker:plan.broker,origin:guide.origin,destination:guide.destination,pickupDate:guide.pickupDate,deliveryDate:guide.deliveryDate,stops:guide.stops,source:previous.source||INSTRUCTION_GUIDE_SOURCE_V110311,documentId:previous.documentId||record.id,instructionsDocumentId:record.id,status:previous.status||'booked'};
 return {store:upsertBusinessLoadV105(store,load),record,guide};
}
export function applyInstructionGuideV110311(state={},payload={}) {
 const record=payload.record||{},incoming=record.instructionGuide||buildInstructionGuideV110311(record.extracted?.instructionPlanV110311,record);
 if(!instructionGuideBackedV110311(incoming))return state;
 const existing=Object.values(state.loadGuidesById||{}).find(g=>same(g,incoming));
 const closed=existing&&(existing.status==='completed'||existing.excludedFromActiveLoad);
 const id=existing?.id||incoming.id;
 const guide={...incoming,...(existing||{}),id,stops:incoming.stops,steps:incoming.steps,risks:incoming.risks,requirements:{...existing?.requirements,...incoming.requirements},instructionsDocumentId:record.id,manualDone:{...existing?.manualDone},completedStopIds:[...(existing?.completedStopIds||[])],documents:{...existing?.documents,documentIds:[...new Set([...(existing?.documents?.documentIds||[]),record.id])],instructionsDocumentId:record.id},updatedAt:Math.max(Number(incoming.updatedAt||0),Number(existing?.updatedAt||0))};
 const active=state.loadGuidesById?.[state.activeLoadGuideId];
 const activate=!closed&&(payload.activate!==false||!active||Number(incoming.createdAt||0)>=Number(active.createdAt||0));
 let next={...state,loadGuidesById:{...state.loadGuidesById,[id]:guide}};
 if(activate){next.activeLoadGuideId=id;next.loadInfo={guideId:id,loadNo:guide.loadNo,orderNo:guide.loadNo,shippingDocs:guide.loadNo,broker:guide.broker,origin:guide.origin,destination:guide.destination,stops:guide.stops,pickupDate:guide.pickupDate,deliveryDate:guide.deliveryDate,pickupNumber:guide.pickupNumber,driverRequirements:guide.requirements,trackingProvider:guide.trackingProvider,source:guide.source,rate:guide.rate,gross:guide.rate,instructionsDocumentId:record.id};}
 if(record.linkToLogbook){
  next=applyVaultDocumentCommitV105(next,{record});
  next.logbookDocumentReferences={...next.logbookDocumentReferences,[record.id]:{contractVersion:1,documentId:record.id,day:record.linkDay||record.documentDate,eventId:'',loadNo:record.canonicalLoadNo,status:'reference_only'}};
 }
 return {...next,lastInstructionGuideV110311:{guideId:id,documentId:record.id}};
}
export function instructionPayloadV110311(record,activate=true){return {type:{id:'load_tender'},typeId:'load_tender',record,documentId:record.id,loadNo:record.canonicalLoadNo,day:record.linkToLogbook?record.linkDay||record.documentDate:'',activate};}
export function restoreInstructionGuidesV110311(state={},store={}) {
 let next=state;
 for(const record of (store.documents||[]).filter(d=>d.type==='load_tender'&&d.status==='verified'&&(d.instructionGuide||d.extracted?.instructionPlanV110311)).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0))){
  if(Object.values(next.loadGuidesById||{}).some(g=>g.documents?.documentIds?.includes(record.id)&&g.steps?.length))continue;
  next=applyInstructionGuideV110311(next,instructionPayloadV110311(record,false));
 }
 return next;
}
export function finishInstructionScanV110311(saved={},onClose,onOpenGuide) {
 const record=(readBusinessStore().documents||[]).find(d=>d.id===saved.record?.id);
 if(record && !record.instructionGuide)record.instructionGuide=buildInstructionGuideV110311(record.extracted?.instructionPlanV110311,record);
 if(record?.instructionGuide){dispatchSmartDocumentLinkV100(instructionPayloadV110311(record));onClose?.();onOpenGuide?.();return true;}
 onClose?.();return false;
}

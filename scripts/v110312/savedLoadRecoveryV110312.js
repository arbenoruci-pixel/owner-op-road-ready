import {buildDriverLoadGuideV103} from './loadGuideV103.js';
import {buildInstructionGuideV110311} from './instructionGuideV110311.js';
import {instructionRefV110311 as ref,instructionBrokerKeyV110311 as brokerKey,instructionGuideBackedV110311} from './instructionAuthorityV110311.js';
import {rateConBackedGuideV11029} from './rateConAuthorityV11029.js';
import {applyVaultDocumentCommitV105} from '../documents/documentFoundationV105.js';
import {readBusinessStore} from '../business/businessStore.js';
export const SAVED_LOAD_GUIDE_EVENT_V110312='road-ready:saved-load-guide-v110312';
const terminal=value=>/^(?:completed|delivered|closed|cancelled|canceled|archived|dismissed|paid|superseded)$/i.test(String(value||''));
const identity=value=>[ref(value?.canonicalLoadNo||value?.loadNo||value?.orderNo),brokerKey(value?.broker)].join('|');
const stamp=value=>Number(value)||Date.parse(value)||0;
export function usableSavedGuideV110312(guide) {
 return Boolean(guide && rateConBackedGuideV11029(guide) && guide.steps?.length && guide.stops?.length>=2 && !terminal(guide.status) && !guide.excludedFromActiveLoad);
}
export function buildSavedDocumentGuideV110312(record={},store={}) {
 if(record.status!=='verified'||!record.canonicalLoadNo||!record.broker)return null;
 if((store.loads||[]).some(l=>ref(l.loadNo||l.canonicalLoadNo)===ref(record.canonicalLoadNo)&&l.broker&&brokerKey(l.broker)!==brokerKey(record.broker)))return null;
 const cached=record.instructionGuide||record.loadGuideV110312;
 if(cached && identity(cached)===identity(record) && cached.steps?.length)return cached;
 if(record.type==='load_tender')return buildInstructionGuideV110311(record.extracted?.instructionPlanV110311,record);
 if(record.type!=='rate_confirmation')return null;
 const fields={...record.extracted},stops=fields.stops;
 if(fields.broker&&brokerKey(fields.broker)!==brokerKey(record.broker))return null;
 if(fields.orderNo&&ref(fields.orderNo)!==ref(record.canonicalLoadNo))return null;
 if(!fields.guideSourceTextV110312 && !/load-document-evidence-v110310/.test(record.classification?.method||'')){for(const key of ['total','gross','grossPay','linehaul','fuelSurcharge'])delete fields[key];}
 if(!Array.isArray(stops)||stops.length<2||stops.some(s=>!s.city||!s.state||!/^\d{4}-\d{2}-\d{2}$/.test(s.date||'')))return null;
 const guide=buildDriverLoadGuideV103({...fields,loadNo:record.canonicalLoadNo,orderNo:record.canonicalLoadNo,broker:record.broker},{documentId:record.id,sourceText:fields.guideSourceTextV110312||'',createdAt:stamp(record.createdAt)});
 guide.source='rate_confirmation_guide_v103';guide.sourceDocumentId=record.id;guide.savedDocumentGuideV110312=true;
 guide.updatedAt=stamp(record.updatedAt)||stamp(record.createdAt);guide.documents={documentIds:[record.id],rateConfirmationDocumentId:record.id};
 for(const risk of fields.guideRisksV110312||[])guide.steps.splice(1,0,{id:'saved_risk_'+risk.id,kind:'manual',title:risk.title,detail:risk.detail,phase:'before_pickup',action:'toggle_done'});
 return guide;
}
export function restoreSavedLoadGuidesV110312(state={},store={},preferredDocumentId='') {
 if(!state||typeof state!=='object')return state;
 const guides={...state.loadGuidesById};let next={...state,loadGuidesById:guides};
 const records=(store.documents||[]).filter(d=>d&&['rate_confirmation','load_tender'].includes(d.type));
 for(const record of records){
  const existing=Object.values(guides).find(g=>g&&identity(g)===identity(record));
  if(existing?.steps?.length)continue;
  const guide=buildSavedDocumentGuideV110312(record,store);if(!guide)continue;
  // Existing completion and progress are retained, including older inactive guides.
  guides[existing?.id||guide.id]={...guide,...existing,id:existing?.id||guide.id,steps:guide.steps,stops:guide.stops};
 }
 const candidates=Object.values(guides).filter(g=>usableSavedGuideV110312(g)&&!(store.loads||[]).some(l=>identity(l)===identity(g)&&terminal(l.status)));
 const requested=preferredDocumentId?candidates.find(g=>g.sourceDocumentId===preferredDocumentId||g.documents?.documentIds?.includes(preferredDocumentId)):null;
 const activation=records.filter(d=>stamp(d.guideActivationRequestedAtV110312)>stamp(state.loadGuideActivationV110312?.at)).sort((a,b)=>stamp(b.guideActivationRequestedAtV110312)-stamp(a.guideActivationRequestedAtV110312))[0];
 const queued=activation?candidates.find(g=>g.sourceDocumentId===activation.id||g.documents?.documentIds?.includes(activation.id)):null;
 const active=candidates.find(g=>g.id===state.activeLoadGuideId)||candidates.find(g=>g.id===state.loadInfo?.guideId);
 const cutoff=new Date(Date.now()-14*86400000).toISOString().slice(0,10);
 const selected=requested||queued||active||candidates.filter(g=>(g.deliveryDate||g.pickupDate||'')>=cutoff).sort((a,b)=>stamp(b.createdAt)-stamp(a.createdAt))[0];
 if(selected){
  if(queued?.id===selected.id)next.loadGuideActivationV110312={documentId:activation.id,at:stamp(activation.guideActivationRequestedAtV110312)};
  for(const key of ['activeLoad','activeLoadSummary','activeMission','currentLoad'])if(next[key]&&identity(next[key])!==identity(selected))next[key]=null;
  const changed=selected.id!==state.activeLoadGuideId||selected.id!==state.loadInfo?.guideId||identity(selected)!==identity(state.loadInfo);
  if(changed){next.activeLoadGuideId=selected.id;next.loadInfo={guideId:selected.id,loadNo:selected.loadNo,orderNo:selected.loadNo,shippingDocs:selected.loadNo,broker:selected.broker,source:selected.source,origin:selected.origin,destination:selected.destination,stops:selected.stops,pickupDate:selected.pickupDate,deliveryDate:selected.deliveryDate,rate:selected.rate,gross:selected.rate,driverRequirements:selected.requirements,trackingProvider:selected.trackingProvider,instructionsDocumentId:selected.instructionsDocumentId};}
  for(const record of records.filter(d=>identity(d)===identity(selected)&&d.status==='verified'&&d.linkToLogbook)){
   if(next.logbookDocumentReferences?.[record.id])continue;
   next=applyVaultDocumentCommitV105(next,{record});
   next.logbookDocumentReferences={...next.logbookDocumentReferences,[record.id]:{contractVersion:1,documentId:record.id,day:record.linkDay||record.documentDate,eventId:'',loadNo:record.canonicalLoadNo,status:'reference_only'}};
  }
 }
 const keys=['activeLoad','activeLoadSummary','activeMission','currentLoad','loadGuideActivationV110312','loadGuidesById','activeLoadGuideId','loadInfo','documentsByDay','logbookDocumentReferences'];
 return keys.every(k=>JSON.stringify(state[k])===JSON.stringify(next[k]))?state:next;
}
export function pendingSavedLoadScanV110312(state={},store={}) {
 return (store.documents||[]).filter(d=>d&&['load_tender','rate_confirmation'].includes(d.type)&&!terminal(d.status)&&!terminal(d.reviewStatus))
 .filter(d=>!Object.values(state.loadGuidesById||{}).some(g=>g&&(g.sourceDocumentId===d.id||g.documents?.documentIds?.includes(d.id))&&g.steps?.length))
 .filter(d=>!(store.loads||[]).some(l=>d.canonicalLoadNo&&identity(l)===identity(d)&&terminal(l.status)))
 .sort((a,b)=>stamp(b.createdAt)-stamp(a.createdAt))[0]||null;
}
export function finishSavedScanV110312(saved={},onClose,onOpenGuide) {
 const store=readBusinessStore(),record=(store.documents||[]).find(d=>d.id===saved.record?.id);
 const guide=record&&buildSavedDocumentGuideV110312(record,store);
 if(guide){window.dispatchEvent(new CustomEvent(SAVED_LOAD_GUIDE_EVENT_V110312,{detail:{documentId:record.id}}));onClose?.();onOpenGuide?.();return true;}
 onClose?.();return false;
}

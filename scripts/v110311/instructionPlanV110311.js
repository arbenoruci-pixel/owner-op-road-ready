import {analyzeRateConRiskV10970} from '../scan/rateConRiskReviewV10970.js';
import {isTqlInstructionsV110310} from '../scan/loadDocumentEvidenceV110310.js';
import {instructionRefV110311,instructionBrokerKeyV110311} from './instructionAuthorityV110311.js';
const clean=v=>String(v||'').replace(/\[\[PAGE:\d+\]\]|Page\s+\d+\s+of\s+\d+/gi,' ').replace(/\s+/g,' ').trim();
function date(v=''){const m=String(v).match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/);if(!m)return '';const y=+(m[3].length===2?'20'+m[3]:m[3]),mo=+m[1],d=+m[2],t=new Date(Date.UTC(y,mo-1,d));return t.getUTCFullYear()===y&&t.getUTCMonth()===mo-1&&t.getUTCDate()===d?`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';}
export function instructionStopsV110311(text='') {
 const lines=String(text).split(/\r?\n/).map(clean).filter(Boolean),stops=[];let section='';
 for(let i=0;i<lines.length;i++){
  if(/^PICKUPS$/i.test(lines[i]))section='pickup';else if(/^DROPS$/i.test(lines[i]))section='delivery';
  if(!section)continue;
  const hit=lines[i].match(/\b([A-Za-z][A-Za-z .'-]{1,50})\s+([A-Z]{2})\s+(\d{5})\b(.*\b\d{1,2}\/\d{1,2}\/\d{4}\b.*)/);
  if(!hit)continue;
  const dates=[...hit[4].matchAll(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g)].map(m=>date(m[0])).filter(Boolean);if(dates.length!==1)continue;
  const ahead=lines.slice(i+1,i+10),info=ahead.findIndex(l=>/^Information:/i.test(l)),addressLines=info>=0?ahead.slice(info+1,info+4):[];
  const addressCity=addressLines.map(l=>l.match(/^([A-Za-z][A-Za-z .'-]+),?\s+([A-Z]{2})\s+(\d{5})$/)).find(Boolean);
  const city=addressCity?.[1]||hit[1].trim(),state=addressCity?.[2]||hit[2],zip=addressCity?.[3]||hit[3];
  const street=addressLines.find(l=>/^\d+\s+[A-Za-z]/.test(l))||'';
  const prefix=lines[i].slice(0,hit.index).trim();
  const prior=lines[i-1]||'',next=lines[i+1]||'';
  let company=prefix || (/^[A-Z][A-Z ()&.,'-]{4,}$/.test(prior)&&!/^(?:FCFS|APPT|CONSIGNEE|SHED|CITY)/.test(prior)?prior:'');
  if(company&&/^[A-Z][A-Z ()&.,'-]{4,}$/.test(next)&&!/^INFORMATION|FCFS|APPT/.test(next))company+=' '+next;
  company=company||addressLines.find(l=>/^[A-Z][A-Z &'-]+$/.test(l))||(section==='pickup'?'Pickup':'Delivery');
  const window=lines.slice(Math.max(0,i-2),i+3).join(' '),time=window.match(/\b(FCFS|Appt)\s+(\d{1,2}:\d{2})\s+to\b/i);
  const after=time?window.slice(time.index+time[0].length):'',end=after.match(/\b\d{1,2}:\d{2}\b/)?.[0]||'';
  const appointment=time?`${time[1]} ${time[2]}${end?'–'+end:''}`:'';
  const pickupNumber=section==='pickup'?(hit[4].match(/^\s*(\d{5,16})\s+\d{1,2}\//)?.[1]||''):'';
  const deliveryPo=section==='delivery'?(lines[i-2]||'').match(/^(\d{4,16})\s*[-–]?$/)?.[1]||'':'';
  stops.push({id:`instruction_stop_${stops.length+1}`,type:section,sequence:stops.length,deliverySequence:section==='delivery'?stops.filter(s=>s.type==='delivery').length+1:0,company,street,city,state,zip,cityState:`${city}, ${state}`,address:[street,`${city}, ${state} ${zip}`].filter(Boolean).join(', '),date:dates[0],time:time?.[2]||'',appointment,pickupNumber,poNumber:deliveryPo});
 }
 const first=stops[0],last=stops.at(-1);
 if(stops.length>2&&/LOAD\s+OUT\s+RETURN|EMPTY\s+(?:TRAILER\s+)?RETURN/i.test(text)&&instructionRefV110311(first.cityState)===instructionRefV110311(last.cityState)){last.role='trailer_return';last.company+=' · Trailer return';}
 return stops;
}
export function instructionPlanV110311(analysis={}) {
 if(analysis.type?.id!=='load_tender'||!isTqlInstructionsV110310(analysis.text))return null;
 const refs=[...new Set([...analysis.text.matchAll(/\bTQL\s+PO\s*#\s*(\d{5,12})\b/gi)].map(m=>m[1]))];if(refs.length!==1)return null;
 const stops=instructionStopsV110311(analysis.text);if(stops[0]?.type!=='pickup'||!stops.some(s=>s.type==='delivery'))return null;
 const risks=analyzeRateConRiskV10970(analysis).items.map(r=>({id:r.id,title:r.title,detail:clean(r.detail).slice(0,500),severity:r.severity}));
 return {version:1,loadNo:refs[0],broker:'Total Quality Logistics (TQL)',stops,risks,fields:{...analysis.fields,loadNo:refs[0],orderNo:refs[0],broker:'Total Quality Logistics (TQL)',stops,origin:stops[0].cityState,destination:stops.at(-1).cityState,pickupDate:stops[0].date,deliveryDate:stops.at(-1).date},sourceText:String(analysis.text).slice(0,16000)};
}
export function instructionFolderV110311(plan,candidates=[]) {
 if(!plan)return '';
 const exact=candidates.filter(c=>instructionRefV110311(c.loadNo)===instructionRefV110311(plan.loadNo));
 if(exact.some(c=>c.broker&&instructionBrokerKeyV110311(c.broker)!==instructionBrokerKeyV110311(plan.broker)))return '';
 return plan.loadNo;
}

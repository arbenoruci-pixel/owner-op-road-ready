import {captureInspection as captureSigned,assertInspectionComplete as assertSigned} from './inspectionSignedLegacy.js';
import {canonical,dailyModel} from './core.js';
export {assertArchiveCoverage} from './inspectionSignedLegacy.js';

const previousDay=day=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);};
function fingerprint(content){let hash=2166136261;for(const c of canonical(content))hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;return 'rods-110.1.0-'+hash.toString(16).padStart(8,'0');}
function signedRows(state,day){
  const sig=state.signatureByDay?.[day],content=sig?.certifiedContent;
  return sig?.signed===true&&content?.version===1&&content.day===day&&Array.isArray(content.events)&&sig.certifiedFingerprint===fingerprint(content)?content.events:null;
}
// Canonical signed content stores recorded transitions. Midnight continuation
// is a separate read-only view, evidenced by the immediately preceding signed
// day. Never replace a signed event, fill an interior gap, or infer Driving.
export function captureInspection(state,at=new Date()){
  const {dotWallet,...logState}=state; // Wallet originals have their own verified capture.
  const pack=captureSigned(logState,at);
  for(const snapshot of pack.snapshots){
    if(snapshot.inspectionView.source!=='signed')continue;
    const day=snapshot.sourceDay,events=snapshot.inspectionView.events;
    const start=events.length?events[0].startMin:1440,priorDay=previousDay(day),prior=signedRows(state,priorDay);
    if(!Number.isInteger(start)||start<=0||start>1440||!prior?.length)continue;
    const last=prior.at(-1);
    if(!['OFF','SB','ON'].includes(last.status)||last.endMin!==1440||!Number.isInteger(last.startMin)||last.startMin<0||last.startMin>=1440)continue;
    if(prior.some((e,i)=>!Number.isInteger(e.startMin)||!Number.isInteger(e.endMin)||e.endMin<=e.startMin||e.startMin<0||e.endMin>1440||(i>0&&prior[i-1].endMin>e.startMin)))continue;
    const carry={status:last.status,startMin:0,endMin:start,city:last.city||'',state:last.state||'',note:last.status==='SB'?'Sleeper Berth':last.status==='ON'?'On Duty':'Off Duty',source:'known_midnight_carry',displayOnly:true};
    snapshot.inspectionView={...snapshot.inspectionView,events:[carry,...events],continuity:{previousDay:priorDay,signedAt:state.signatureByDay[priorDay].signedAt,fingerprint:state.signatureByDay[priorDay].certifiedFingerprint}};
  }
  return pack;
}
export function assertInspectionUnchanged(captured,state){
  if(canonical(captureInspection(state,new Date(captured.capturedAt)))!==canonical(captured))throw Error('The inspection records changed. Prepare the link again.');
}
export function assertInspectionComplete(pack){
  assertSigned(pack);
  for(const field of ['driverName','carrierName','usdot','unit','mainOffice'])if(!String(pack.profile[field]||'').trim())throw Error('Complete the driver and carrier details before preparing inspection.');
  for(const snapshot of pack.snapshots){
    if(dailyModel(snapshot).warnings.length)throw Error('Review the recorded log time for '+snapshot.sourceDay+'.');
    const sig=snapshot.dayData.signature;
    if(snapshot.sourceDay!==pack.endDay&&snapshot.inspectionView.source==='signed'){
      if(sig.certifiedFingerprint!==fingerprint(sig.certifiedContent))throw Error('The saved signature for '+snapshot.sourceDay+' could not be verified. Open that log day.');
    }
  }
}

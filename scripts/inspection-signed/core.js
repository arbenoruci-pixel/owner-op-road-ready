import {captureInspection as captureWorkingInspection} from './inspectionSnapshotLegacy.js';
import {canonical,minuteAt} from './core.js';
export {assertArchiveCoverage} from './inspectionSnapshotLegacy.js';

const isDot=e=>e?.status==='ON'&&!e.deleted&&!e.deletedAt&&!e.voided&&/\bDOT Inspection\b/i.test([e.note,e.description,...(Array.isArray(e.reasons)?e.reasons:[])].join(' '));
export function inspectionBoundary(state,day,at,zone){
  const now=minuteAt(at,zone);
  const event=(state.eventsByDay?.[day]||[]).filter(e=>isDot(e)&&Number.isInteger(e.startMin)&&e.startMin>=0&&e.startMin<=now).sort((a,b)=>b.startMin-a.startMin)[0];
  return {cutoff:event?event.startMin:now,event:event?structuredClone(event):null};
}
function clip(events,cutoff){
  return events.filter(e=>Number(e.startMin)<cutoff).map(e=>({...e,endMin:Math.min(Number(e.endMin),cutoff)}));
}
// Inspection is a read-only projection of the signed evidence. It never merges
// account backups or writes to events/signatures. A later unsigned draft cannot
// replace the content that the driver's stored signature actually certifies.
export function captureInspection(state,at=new Date()){
  const pack=captureWorkingInspection(state,at);
  const boundary=inspectionBoundary(state,pack.endDay,at,pack.timeZone);
  pack.source='signed-logbook';
  pack.snapshots=pack.snapshots.map(snapshot=>{
    const day=snapshot.sourceDay,sig=state.signatureByDay?.[day],content=sig?.certifiedContent;
    delete snapshot.rawDayBuckets;
    if(day!==pack.endDay&&sig?.signed===true&&content?.version===1&&content.day===day&&Array.isArray(content.events)){
      const signed=structuredClone(content),signature=structuredClone(sig),form=signed.form||{},context=sig.certificationContext||{};
      delete signature.certificationHistory;
      snapshot.dayData={events:signed.events,inspection:signed.inspection,manualMiles:signed.miles,form:signed.dayForm||{},routeLegs:signed.routeLegs||[],signature,certifyStatus:'Certified'};
      snapshot.profileAtBackup={...context.profileAtBackup,driverName:form.driver||sig.driverName||'',carrierName:form.carrier||'',mainOffice:form.mainOffice||'',unit:form.truck||'',trailer:form.trailer||''};
      snapshot.homeTerminalTimeZone=signed.homeTimezone||context.homeTimezone||pack.timeZone;
      snapshot.inspectionView={...snapshot.inspectionView,source:'signed',events:signed.events,timeZone:snapshot.homeTerminalTimeZone,cutoff:1440,certification:'Certified',certified:true};
      snapshot.summary={events:signed.events.length,certified:true,signed:true,manualMiles:signed.miles};
      snapshot.driverSignature=null; // Use only the signature saved for this date.
    }else if(day===pack.endDay){
      const rows=clip(snapshot.inspectionView.events,boundary.cutoff);
      if(boundary.event)rows.push({...boundary.event,endMin:boundary.cutoff});
      snapshot.inspectionView={...snapshot.inspectionView,events:rows,cutoff:boundary.cutoff,dotEvent:boundary.event?{id:boundary.event.id,startMin:boundary.cutoff}:null,certification:'Active day / Not certified yet',certified:false};
      snapshot.dayData={...snapshot.dayData,events:structuredClone(rows),certifyStatus:'Active day / Not certified yet'};
      delete snapshot.dayData.signature;
      snapshot.driverSignature=null;
      snapshot.summary={...snapshot.summary,events:rows.length,certified:false,signed:false};
    }
    return snapshot;
  });
  return pack;
}
export function assertInspectionUnchanged(captured,state){
  const current=captureInspection(state,new Date(captured.capturedAt));
  if(canonical(current)!==canonical(captured))throw Error('The inspection logbook changed while preparing the link. Prepare it again.');
}
export function assertInspectionComplete(pack){
  for(const snapshot of pack.snapshots){
    if(snapshot.sourceDay!==pack.endDay&&!snapshot.inspectionView.certified)throw Error('Sign the log for '+snapshot.sourceDay+' before preparing the inspection.');
  }
}

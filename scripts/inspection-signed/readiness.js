import {captureInspection} from '../../../../lib/owner-op-cloud/inspectionSnapshot.js';
import {logbookReportGaps} from '../logbook/public-api.js';
export {officerEmailLink} from './inspectionEmail.js';

export function inspectionReadiness(state,at=new Date()){
  const pack=captureInspection(state,at),profile=pack.profile;
  const fields=[['driverName','Driver'],['carrierName','Carrier'],['usdot','USDOT'],['unit','Truck'],['mainOffice','Main office']];
  const missing=fields.filter(([key])=>!String(profile[key]||'').trim()).map(([,label])=>label);
  const days=pack.snapshots.map(snapshot=>{
    const view=snapshot.inspectionView,today=snapshot.sourceDay===pack.endDay;
    const gaps=logbookReportGaps(view.events,view.cutoff);
    const signed=today||view.certified;
    return {day:snapshot.sourceDay,today,signed,gaps,issues:[],eventCount:view.events.length,blocked:!signed||gaps.length>0};
  });
  return {today:pack.endDay,zone:pack.timeZone,profile,missing,days,logsReady:days.every(row=>!row.blocked)};
}

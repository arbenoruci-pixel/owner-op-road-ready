import {RECOVERY_KIND,dayValue,dayHeader,digest} from './core.js';
import {visible} from '../v110451/recordsCore.js';
export async function fixture(){
 const driverId='driver_primary',uid='synthetic-user',deviceId='synthetic-phone',days=['2026-11-10','2026-11-11'];
 const original={activeDriverId:driverId,eventsByDay:{},signatureByDay:{},certifyStatus:{},inspectionByDay:{},manualMilesByDay:{},formByDay:{}};
 for(const [i,day]of days.entries()){
  original.eventsByDay[day]=[{id:'event-'+i,status:'SB',startMin:0,endMin:700,note:'original '+i},{id:'event-'+i+'-2',status:'D',startMin:700,endMin:800,manualMiles:34.2}];
  original.manualMilesByDay[day]=34.2;original.certifyStatus[day]=i?'Needs signature':'Certified';
  if(!i)original.signatureByDay[day]={signed:true,signedAt:1234,signatureDataUrl:'data:image/png;base64,c3ludGhldGljLW9yaWdpbmFs',certifiedFingerprint:'original-fingerprint',certifiedContent:{events:structuredClone(original.eventsByDay[day])}};
 }
 const current={...structuredClone(original),eventsByDay:{'2026-11-15':[{id:'today',status:'ON',startMin:20,endMin:50}]},signatureByDay:{},certifyStatus:{},manualMilesByDay:{},currentStatus:'ON',gpsTrip:{miles:7},dotWallet:{original:'preserve'},view:'home',routeLegsByDay:{today:[{id:'keep'}]},teamLogbooksByDriverId:{other:{eventsByDay:{keep:[{id:'other'}]}}}};
 const request={id:'request',user_id:uid,device_id:deviceId,kind:RECOVERY_KIND,status:'pending',before_data:Object.fromEntries(days.map(d=>[d,{empty:true}])),patch:{version:1,authorization:'restore-original-retained-days',driverId,days:{}}};
 for(const day of days){const value=dayValue(original,driverId,day);request.patch.days[day]={header:await digest(dayHeader(value,driverId,day)),count:value.eventsByDay.length,events:await Promise.all(value.eventsByDay.map(async(e,index)=>({id:e.id,index,hash:await digest(visible(e))})))};}
 return {original,current,request,context:{uid,deviceId,today:'2026-11-15'},days};
}

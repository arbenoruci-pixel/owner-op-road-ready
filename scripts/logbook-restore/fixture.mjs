import {RECOVERY_KIND,dayValue,dayHeader,digest} from './core.js';
import {visible} from '../v110451/recordsCore.js';
import {createCertificationRecord} from '../../source/src/modules/logbook/certificationV110.js';
export async function fixture(){
 const driverId='driver_primary',uid='synthetic-user',deviceId='synthetic-phone',days=['2026-11-10','2026-11-11'];
 const original={activeDriverId:driverId,homeTerminalTimeZone:'America/New_York',eventsByDay:{},signatureByDay:{},certifyStatus:{},inspectionByDay:{},manualMilesByDay:{},formByDay:{},routeLegsByDay:{'2026-11-10':[{id:'original-trip',pickupDay:'2026-11-10',pickupMin:700,fromCity:'Example',fromState:'IL',deliveryDay:'2026-11-11',deliveryMin:600,toCity:'Sample',toState:'OH',shippingDocs:'TEST-ONLY'}]}};
 for(const [i,day]of days.entries()){
  original.eventsByDay[day]=[{id:'event-'+i,status:'SB',startMin:0,endMin:700,note:'original '+i},{id:'event-'+i+'-2',status:'D',startMin:700,endMin:800,manualMiles:34.2},{id:'event-'+i+'-3',status:'OFF',startMin:800,endMin:1440}];
  original.manualMilesByDay[day]=34.2;original.certifyStatus[day]=i?'Needs signature':'Certified';
  if(!i)original.signatureByDay[day]=createCertificationRecord(original,day,{driverName:'Synthetic Driver',now:Date.parse('2026-11-15T12:00:00Z'),signatureDataUrl:'data:image/png;base64,c3ludGhldGljLW9yaWdpbmFs'});
 }
 const current={...structuredClone(original),eventsByDay:{'2026-11-15':[{id:'today',status:'ON',startMin:20,endMin:50}]},signatureByDay:{},certifyStatus:{},manualMilesByDay:{},currentStatus:'ON',gpsTrip:{miles:7},dotWallet:{original:'preserve'},view:'home',routeLegsByDay:{today:[{id:'keep'}]},teamLogbooksByDriverId:{other:{eventsByDay:{keep:[{id:'other'}]}}}};
 const request={id:'request',user_id:uid,device_id:deviceId,kind:RECOVERY_KIND,status:'pending',before_data:Object.fromEntries(days.map(d=>[d,{empty:true}])),patch:{version:1,authorization:'restore-original-retained-days',driverId,days:{}}};
 for(const day of days){const value=dayValue(original,driverId,day);request.patch.days[day]={header:await digest(dayHeader(value,driverId,day)),count:value.eventsByDay.length,events:await Promise.all(value.eventsByDay.map(async(e,index)=>({id:e.id,index,hash:await digest(visible(e))})))};}
 request.patch.routes={};request.before_data.routeBuckets={};
 for(const day of days){const routes=original.routeLegsByDay[day]||[];request.patch.routes[day]={hash:await digest(routes),count:routes.length};request.before_data.routeBuckets[day]=await digest(current.routeLegsByDay[day]||[]);}
 return {original,current,request,context:{uid,deviceId,today:'2026-11-15'},days};
}

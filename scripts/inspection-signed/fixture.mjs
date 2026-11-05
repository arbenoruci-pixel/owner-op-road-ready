import {eightDays} from '../../lib/owner-op-cloud/core.js';
import {createCertificationRecord} from '../../source/src/modules/logbook/certificationV110.js';
export const at=new Date('2026-11-05T00:30:00Z'),today='2026-11-04';
export function fixture(){
  const state={activeDriverId:'driver_primary',activeDay:today,homeTerminalTimeZone:'America/New_York',driverProfile:{name:'Test Driver'},carrierName:'Test Carrier',carrierDot:'1234567',dotNumber:'1234567',mainOfficeAddress:'Test office',driver:{truck:'228',trailer:'4201'},currentTrailer:'4201',currentStatus:'ON',currentReason:'DOT Inspection',signatureByDay:{},certifyStatus:{},manualMilesByDay:{},formByDay:{},eventsByDay:{}};
  for(const day of eightDays(today)){
    state.eventsByDay[day]=[{id:'event-'+day,status:'OFF',startMin:0,endMin:1440,city:'Test City',state:'NY',source:'manual',note:'Off Duty'}];
    if(day!==today){state.manualMilesByDay[day]=63;state.signatureByDay[day]=createCertificationRecord(state,day,{driverName:'Test Driver',now:+at-86400000,signatureDataUrl:'data:image/png;base64,dGVzdA=='});state.certifyStatus[day]='Certified';}
  }
  state.eventsByDay[today]=[{id:'drive',status:'D',startMin:0,endMin:1162,city:'Test City',state:'NY',source:'live_status'},{id:'dot',status:'ON',startMin:1162,endMin:1170,note:'DOT Inspection',reasons:['DOT Inspection'],city:'Test City',state:'NY',source:'live_status'}];
  return state;
}

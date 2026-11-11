import { certificationContent, certificationFingerprintV1032 } from '../../source/src/modules/logbook/certificationV110.js';

// Synthetic reproduction of interval lengths only; no uploaded customer
// signature, address, GPS, shipment reference or backup is committed.
export const day = '2026-11-06', at = new Date('2026-11-11T14:00:00Z');
export function fixture({signed = true} = {}) {
  const intervals = [['SB',0,421],['ON',421,437],['D',437,466],['ON',466,529],
    ['D',529,602],['SB',602,756],['ON',756,771],['D',771,978],
    ['OFF',978,1008],['D',1008,1353],['SB',1353,1383]];
  const state = { activeDay:day, homeTerminalTimeZone:'America/New_York', currentStatus:'ON',
    driverProfile:{name:'Test Driver'}, driver:{truck:'TEST',trailer:'TEST'},
    carrierName:'Test Carrier', mainOfficeAddress:'Test Office', usdot:'TEST',
    eventsByDay:{[day]:intervals.map(([status,startMin,endMin],i) => ({id:'event-'+i, status,startMin,endMin,
      source:'live_status',city:'Test City',state:'IL',note:status==='SB'?'Sleeper Berth':status==='ON'?'Pre-trip inspection':'Driving'}))},
    signatureByDay:{}, certifyStatus:{}, inspectionByDay:{}, routeLegsByDay:{}, formByDay:{},
    manualMilesByDay:{[day]:518}, logbookEditHistoryByDay:{}, dotWallet:{documents:{}} };
  if (signed) {
    const content = certificationContent(state, day);
    state.signatureByDay[day] = {signed:true, signedAt:at.getTime()-86400000,
      signatureDataUrl:'data:image/png;base64,dGVzdA==', certifiedContent:content,
      certificationContext:{version:1,form:content.form,homeTimezone:content.homeTimezone},
      certifiedFingerprint:certificationFingerprintV1032(state,day), certificationHistory:[{marker:'original-history'}]};
    state.certifyStatus[day] = 'Certified';
  }
  return state;
}

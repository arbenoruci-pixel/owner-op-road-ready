// Synthetic identities and locations; interval/status pattern from the reported day.
export const day = '2026-09-09';
export function coverageFixture() {
  const intervals = [['D',0,24],['SB',24,750],['ON',750,778],['D',778,1227],['OFF',1227,1257],['D',1257,1321],['SB',1321,1322]];
  const events = intervals.map(([status,startMin,endMin],i)=>({
    id:'coverage-fixture-'+i,status,startMin,endMin,city:'Chicago',state:'IL',
    source:i===4?'manual':'live_status',note:i===2?'Pre-trip inspection':status==='SB'?'Sleeper Berth':status==='D'?'Driving': 'Off Duty · Break',
    ...(status==='D'?{manualMiles:10}:{})
  }));
  return {view:'day',activeDay:day,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,
    homeTerminalTimeZone:'America/New_York',driver:{truck:'TEST',trailer:'TEST'},driverProfile:{name:'Synthetic Driver'},
    carrierName:'Synthetic Carrier',mainOfficeAddress:'Test Office',currentTrailer:'TEST',currentStatus:'SB',
    currentReason:'Sleeper Berth',currentLocation:{city:'Chicago',state:'IL'},eventsByDay:{[day]:events},
    certifyStatus:{[day]:'Needs signature'},signatureByDay:{},inspectionByDay:{[day]:{complete:true,type:'pretrip',checked:['brakes','lights','tires','mirrors','coupling','documents']}},routeLegsByDay:{},formByDay:{},
    driverSignature:{dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4WQAAAAASUVORK5CYII=',driverName:'Synthetic Driver'},loadGuidesById:{},dotWallet:{documents:{}}};
}

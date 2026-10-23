export const day='2026-10-22',today='2026-10-23';
export const at=new Date('2026-10-23T10:40:00Z');
const row=(id,status,startMin,endMin,extra={})=>({
  id,status,startMin,endMin,source:'live_status',city:'Example City',state:'OH',
  note:status==='SB'?'Sleeper Berth':status==='D'?'Driving':'Pre-trip inspection',...extra,
});
// Synthetic records retain only the reported times; no customer identity,
// signature, coordinates or uploaded backup is included in the repository.
export function fixture({sentinel=false,nextDayRest=415}={}) {
  return {
    activeDay:day,homeTerminalTimeZone:'America/New_York',currentStatus:'SB',
    driverProfile:{name:'Synthetic Driver'},driver:{truck:'TEST',trailer:'TEST'},
    eventsByDay:{[day]:[
      row('drive-before-reset','D',0,230),
      row('full-reset','SB',230,844),
      row('pretrip','ON',844,874,{reasons:['Pre-trip inspection']}),
      row('drive-after-reset','D',874,1303),
      row('evening-rest','SB',1303,sentinel?1304:1440),
    ],[today]:[
      row('morning-rest','SB',0,nextDayRest-137),
      row('morning-on','ON',nextDayRest-137,nextDayRest-107),
    ]},
    signatureByDay:{[day]:{signed:true,marker:'retain-original-signature'}},
    certifyStatus:{[day]:'Needs signature'},inspectionByDay:{[day]:{complete:true}},
    formByDay:{[day]:{driverName:'Synthetic Driver'}},routeLegsByDay:{},
    logbookEditHistoryByDay:{},
  };
}

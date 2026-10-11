export const day = '2026-10-09', prior = '2026-10-08', next = '2026-10-10';
export const at = new Date('2026-10-11T18:24:00Z');
const row = (id,status,startMin,endMin,extra={}) => ({id,status,startMin,endMin,source:'live_status',city:'Synthetic city',state:'PA',...extra});
export function fixture() {
  return {
    view:'day',activeDay:day,sheet:null,selectedEventId:null,selectedIds:[],selectMode:false,
    homeTerminalTimeZone:'America/New_York',driver:{truck:'TEST',trailer:'TEST'},
    driverProfile:{name:'Synthetic Driver'},carrierName:'Synthetic Carrier',mainOfficeAddress:'Test Office',
    currentTrailer:'TEST',currentStatus:'SB',currentLocation:{city:'Synthetic city',state:'PA'},
    eventsByDay:{
      [prior]:[row('prior-rest','SB',1300,1301)],
      [day]:[row('pti','ON',610,627),row('drive-am','D',627,930),row('break','OFF',930,1038),row('on-pm','ON',1038,1053),row('drive-pm','D',1053,1054)],
      [next]:[row('midnight-drive','D',0,42,{source:'manual_drive_midnight_continuation',crossMidnightContinuation:true,crossMidnightFromDay:day,crossMidnightFromEventId:'drive-pm'}),row('next-rest','SB',42,1440)],
    },
    signatureByDay:{[prior]:{marker:'keep prior signature'}},certifyStatus:{[day]:'Needs signature'},
    logbookEditHistoryByDay:{},inspectionByDay:{},routeLegsByDay:{},formByDay:{},loadGuidesById:{},dotWallet:{documents:{}},
  };
}
export const insert = (startMin=1425,endMin=1440) => ({id:'insert_draft',status:'ON',startMin,endMin,city:'Synthetic city',state:'PA',note:'Waiting',reasons:['Waiting']});

// Synthetic minute-only regression fixtures. No uploaded records, names,
// locations, signatures or account metadata are included.
export const row=(id,status,startAbs,endAbs,extra={})=>({id,status,startAbs,endAbs,...extra});
export function overnightFixture({extraDrive=0,restEnd=1383,live=true}={}) {
  return [
    row('morning-rest','SB',0,421),row('pretrip','ON',421,437),
    row('drive-a','D',437,466),row('unload','ON',466,529),
    row('drive-b','D',529,602),row('short-rest','SB',602,756),
    row('load','ON',756,771),row('drive-c','D',771,978),
    row('break','OFF',978,1008),row('drive-d','D',1008,1353+extraDrive),
    row('night-rest','SB',1353+extraDrive,Math.max(1354+extraDrive,restEnd),
      live?{source:'live_status'}:{source:'manual',manualEndLocked:true}),
  ];
}
export const range=(type,startMin,endMin,extra={})=>({id:`${type}_${startMin}`,eventId:'drive-d',
  status:'D',type,startMin,endMin,severity:'high',text:`Recorded ${type} range`,...extra});

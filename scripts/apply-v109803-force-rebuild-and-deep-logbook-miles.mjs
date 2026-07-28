import fs from 'node:fs';
const path='source/src/modules/owneros/historicalLogbookV10981.js';
let src=fs.readFileSync(path,'utf8');

const oldMiles=/function dayRecordCandidates\(state=\{\},day=''\)\{[\s\S]*?function drivingMiles\(state=\{\},day='',events=\[\]\)\{[\s\S]*?return dailyMiles\(state,day,events\);\n\}/;
const deepMiles=`function recordDay(value={}){return isoDay(value.logDate||value.log_date||value.day||value.date||value.serviceDate||value.service_date||value.metadata?.logDate||value.form?.day);}
function deepDailyRecords(state={},day=''){
 const found=[],seen=new Set();
 function walk(value,key='',depth=0){
  if(value==null||depth>7)return;
  if(typeof value!=='object')return;
  if(seen.has(value))return;seen.add(value);
  const keyedDay=isoDay(key),ownDay=recordDay(value);
  if(keyedDay===day||ownDay===day)found.push(value);
  if(Array.isArray(value)){for(const item of value)walk(item,'',depth+1);return;}
  for(const [childKey,child] of Object.entries(value))walk(child,childKey,depth+1);
 }
 walk(state,'',0);return found;
}
function dayRecordCandidates(state={},day=''){
 const direct=[state.dailyMilesByDay?.[day],state.manualMilesByDay?.[day],state.milesByDay?.[day],state.logDays?.[day],state.days?.[day],state.dayDataByDate?.[day],state.logbookByDay?.[day],state.dailyLogByDay?.[day],state.dailyLogs?.[day],state.formsByDay?.[day]];
 const expanded=direct.flatMap(value=>value&&typeof value==='object'?[value,value.form,value.general,value.logbook,value.dailyLog,value.logForm,value.metadata,value.totals,value.distance]:[value]);
 return [...expanded,...deepDailyRecords(state,day)].filter(value=>value!=null);
}
function milesFromValue(value){
 if(value==null)return 0;
 if(typeof value==='number'||typeof value==='string')return num(value);
 for(const candidate of [value.distanceMiles,value.distance_miles,value.distance,value.vehicleMiles,value.vehicle_miles,value.totalVehicleMiles,value.total_vehicle_miles,value.totalMiles,value.total_miles,value.dailyMiles,value.daily_miles,value.miles,value.total,value.form?.distance,value.form?.distanceMiles,value.general?.distance,value.metadata?.distance,value.totals?.distance]){const miles=num(candidate);if(miles>0)return miles;}
 const start=num(value.startOdometer||value.start_odometer||value.odometerStart||value.odometer_start),end=num(value.endOdometer||value.end_odometer||value.odometerEnd||value.odometer_end);
 return end>start?end-start:0;
}
function dailyMiles(state={},day='',events=[]){for(const value of dayRecordCandidates(state,day)){const miles=milesFromValue(value);if(miles>0)return miles;}const odometers=events.flatMap(event=>[num(event.odometer||event.odometerMiles||event.odometer_miles)]).filter(value=>value>0);return odometers.length>1?Math.max(...odometers)-Math.min(...odometers):0;}
function drivingMiles(state={},day='',events=[]){for(const value of dayRecordCandidates(state,day)){const stored=num(value?.drivingMiles||value?.driving_miles||value?.totalDrivingMiles||value?.total_driving_miles||value?.driveMiles||value?.drive_miles);if(stored>0)return stored;}return dailyMiles(state,day,events);}`;
if(!oldMiles.test(src))throw new Error('Deep historical mileage anchors missing');
src=src.replace(oldMiles,deepMiles);

src=src.replace("export function ensureHistoricalLogbookSnapshotV10981({state={},folder={},day=''}){","export function ensureHistoricalLogbookSnapshotV10981({state={},folder={},day='',force=false}){");
src=src.replace("const existing=versions.find(snapshot=>snapshot.checksum===hash);if(existing)return existing;","const existing=versions.find(snapshot=>snapshot.checksum===hash);if(existing&&!force)return existing;");
src=src.replace("snapshot=ensureHistoricalLogbookSnapshotV10981({state,folder,day});results.push", "snapshot=ensureHistoricalLogbookSnapshotV10981({state,folder,day,force:true});results.push");
if(!src.includes("force=false")||!src.includes("force:true")||!src.includes('deepDailyRecords'))throw new Error('Force rebuild/deep miles patch failed');
fs.writeFileSync(path,src);
console.log('PASS — v109.8.3 force rebuild creates a new snapshot and reads deep daily Logbook Distance');

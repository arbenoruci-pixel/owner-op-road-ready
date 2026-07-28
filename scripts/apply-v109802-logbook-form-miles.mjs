import fs from 'node:fs';
const path='source/src/modules/owneros/historicalLogbookV10981.js';
let src=fs.readFileSync(path,'utf8');
const replacement=`function dayRecordCandidates(state={},day=''){
 const direct=[
  state.dailyMilesByDay?.[day],state.manualMilesByDay?.[day],state.milesByDay?.[day],
  state.logDays?.[day],state.days?.[day],state.dayDataByDate?.[day],state.logbookByDay?.[day],
  state.dailyLogByDay?.[day],state.dailyLogs?.[day],state.formsByDay?.[day]
 ];
 const nested=direct.flatMap(value=>value&&typeof value==='object'?[value,value.form,value.general,value.logbook,value.dailyLog,value.logForm,value.metadata,value.totals,value.distance]:[value]);
 return nested.filter(value=>value!=null);
}
function milesFromValue(value){
 if(value==null)return 0;
 if(typeof value==='number'||typeof value==='string')return num(value);
 for(const candidate of [value.distanceMiles,value.distance_miles,value.distance,value.vehicleMiles,value.vehicle_miles,value.totalVehicleMiles,value.total_vehicle_miles,value.totalMiles,value.total_miles,value.dailyMiles,value.daily_miles,value.miles,value.total]){const miles=num(candidate);if(miles>0)return miles;}
 const start=num(value.startOdometer||value.start_odometer||value.odometerStart||value.odometer_start),end=num(value.endOdometer||value.end_odometer||value.odometerEnd||value.odometer_end);
 return end>start?end-start:0;
}
function dailyMiles(state={},day='',events=[]){
 for(const value of dayRecordCandidates(state,day)){const miles=milesFromValue(value);if(miles>0)return miles;}
 const odometers=events.flatMap(event=>[num(event.odometer||event.odometerMiles||event.odometer_miles)]).filter(value=>value>0);
 return odometers.length>1?Math.max(...odometers)-Math.min(...odometers):0;
}
function drivingMiles(state={},day='',events=[]){
 const direct=[state.drivingMilesByDay?.[day],state.dailyDrivingMilesByDay?.[day],state.driveMilesByDay?.[day]];
 for(const value of [...direct,...dayRecordCandidates(state,day)]){
  const stored=num(value?.drivingMiles||value?.driving_miles||value?.totalDrivingMiles||value?.total_driving_miles||value?.driveMiles||value?.drive_miles);
  if(stored>0)return stored;
 }
 return dailyMiles(state,day,events);
}`;
const pattern=/function dailyMiles\(state=\{\},day='',events=\[\]\)\{[\s\S]*?\}\nfunction drivingMiles\(state=\{\},day='',events=\[\]\)\{[\s\S]*?\}/;
if(!pattern.test(src))throw new Error('Historical miles functions not found');
src=src.replace(pattern,replacement);
if(!src.includes('value.distanceMiles')||!src.includes('state.dayDataByDate?.[day]'))throw new Error('Daily Logbook miles patch failed');
fs.writeFileSync(path,src);
console.log('PASS — v109.8.2 historical Logbook reads Distance and all daily form mileage fields');

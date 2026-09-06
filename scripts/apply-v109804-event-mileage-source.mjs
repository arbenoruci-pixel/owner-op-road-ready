import fs from 'node:fs';
const path='source/src/modules/owneros/historicalLogbookV10981.js';
let src=fs.readFileSync(path,'utf8');
// Match the complete pair, including nested blocks. The old lazy brace match
// left a stray return outside drivingMiles and blocked every production build.
const old=/function dailyMiles\(state=\{\},day='',events=\[\]\)\{[\s\S]*?(?=\nfunction driverId\()/;
const replacement=`function eventMileageSummary(events=[]){
 const driving=(events||[]).filter(event=>statusOf(event)==='D');
 const segmentMiles=driving.reduce((sum,event)=>sum+num(event.manualMiles||event.manual_miles||event.drivingMiles||event.driving_miles||event.distanceMiles||event.distance_miles),0);
 const suggestedTotals=driving.map(event=>num(event.manualMilesSuggestion?.dailyTotal||event.manual_miles_suggestion?.daily_total||event.mileageSuggestion?.dailyTotal)).filter(value=>value>0);
 const suggestedTotal=suggestedTotals.length?Math.max(...suggestedTotals):0;
 return {segmentMiles:Number(segmentMiles.toFixed(2)),suggestedTotal:Number(suggestedTotal.toFixed(2))};
}
function dailyMiles(state={},day='',events=[]){
 for(const value of dayRecordCandidates(state,day)){const miles=milesFromValue(value);if(miles>0)return miles;}
 const eventMiles=eventMileageSummary(events);
 if(eventMiles.suggestedTotal>0)return eventMiles.suggestedTotal;
 if(eventMiles.segmentMiles>0)return eventMiles.segmentMiles;
 const odometers=events.flatMap(event=>[num(event.odometer||event.odometerMiles||event.odometer_miles)]).filter(value=>value>0);
 return odometers.length>1?Math.max(...odometers)-Math.min(...odometers):0;
}
function drivingMiles(state={},day='',events=[]){
 for(const value of dayRecordCandidates(state,day)){const stored=num(value?.drivingMiles||value?.driving_miles||value?.totalDrivingMiles||value?.total_driving_miles||value?.driveMiles||value?.drive_miles);if(stored>0)return stored;}
 const eventMiles=eventMileageSummary(events);
 if(eventMiles.segmentMiles>0)return eventMiles.segmentMiles;
 if(eventMiles.suggestedTotal>0)return eventMiles.suggestedTotal;
 return dailyMiles(state,day,events);
}
`;
if(!old.test(src))throw new Error('Historical event mileage anchors missing');
src=src.replace(old,replacement);
if(!src.includes('event.manualMiles')||!src.includes('manualMilesSuggestion?.dailyTotal'))throw new Error('Event mileage patch failed');
fs.writeFileSync(path,src);
console.log('PASS — historical event mileage functions retain their complete boundaries');

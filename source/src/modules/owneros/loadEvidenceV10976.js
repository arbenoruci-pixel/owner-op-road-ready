'use client';
function text(v=''){return String(v??'').replace(/\s+/g,' ').trim();}
function upper(v=''){return text(v).toUpperCase();}
function num(v=0){const n=Number(v);return Number.isFinite(n)?n:0;}
function day(v=''){const s=text(v);return /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0,10))?s.slice(0,10):'';}
function refs(obj={}){return [obj.loadNo,obj.load_no,obj.shippingDocs,obj.shipping_documents,obj.orderNo,obj.order_no,obj.pickedUpLoadNo,obj.deliveredLoadNo,obj.canonicalLoadNo].map(upper).filter(Boolean);}
function milesOf(obj={}){const direct=num(obj)||num(obj?.total||obj?.miles||obj?.totalMiles||obj?.total_miles||obj?.dailyMiles||obj?.daily_miles||obj?.manualMiles||obj?.manual_miles||obj?.distance||obj?.distanceMiles||obj?.distance_miles||obj?.form?.distance||obj?.form?.distanceMiles);if(direct>0)return direct;const segments=obj?.segments||obj?.routeSegments||[];return (segments||[]).reduce((sum,s)=>sum+num(s?.miles||s?.distance||s?.distanceMiles),0);}
function explicitDay(obj={}){for(const value of [obj.logDate,obj.log_date,obj.eventDate,obj.event_date,obj.dutyDate,obj.duty_date,obj.day,obj.date,obj.serviceDate,obj.service_date]){const d=day(value);if(d)return d;}return '';}
function linkedDaysForLoad(state={},target=''){
 const linked=new Set();
 function record(containerDay,record){if(!refs(record).includes(target))return;linked.add(explicitDay(record)||day(containerDay));}
 for(const [containerDay,events] of Object.entries(state.eventsByDay||{}))for(const event of events||[])record(containerDay,event);
 for(const [containerDay,legs] of Object.entries(state.routeLegsByDay||{}))for(const leg of legs||[])record(containerDay,leg);
 for(const [containerDay,value] of Object.entries(state.days||state.logDays||state.dayDataByDate||{})){
  if(refs(value).includes(target))linked.add(explicitDay(value)||day(containerDay));
  for(const event of value.events||[])record(containerDay,event);
 }
 linked.delete('');return linked;
}
function mileageEntries(source={}){return Object.entries(source||{}).map(([key,value])=>({key,value,actualDay:explicitDay(value)||day(key)}));}
export function mileageEvidenceForLoadV10976(state={},loadNo=''){
 const target=upper(loadNo),rows=[],seen=new Set(),linkedDays=linkedDaysForLoad(state,target);
 function add(date,value,source){const d=explicitDay(value)||day(date),m=milesOf(value);if(!d||m<=0||(!linkedDays.has(d)&&!refs(value).includes(target)))return;const key=`${d}:${m}`;if(seen.has(key))return;seen.add(key);rows.push({day:d,miles:m,source});}
 const directSources=[state.milesByLoad?.[target],state.dailyMilesByLoad?.[target],state.manualMilesByLoad?.[target],state.loadMiles?.[target]].filter(Boolean);
 for(const value of directSources){if(Array.isArray(value))for(const row of value)add(explicitDay(row),row,'load_mileage');else for(const [d,row] of Object.entries(value||{}))add(d,row,'load_mileage');}
 for(const entry of mileageEntries(state.manualMilesByDay))if(linkedDays.has(entry.actualDay))add(entry.actualDay,entry.value,'manualMilesByDay');
 for(const entry of mileageEntries(state.dailyMilesByDay))if(linkedDays.has(entry.actualDay))add(entry.actualDay,entry.value,'dailyMilesByDay');
 for(const entry of mileageEntries(state.days||state.logDays||state.dayDataByDate))if(linkedDays.has(entry.actualDay))add(entry.actualDay,entry.value,'linked_logbook_day');
 const total=rows.reduce((s,r)=>s+r.miles,0);return {complete:total>0,total,rows:rows.sort((a,b)=>a.day.localeCompare(b.day)),linkedDays:[...linkedDays].sort()};
}
const RETURN_KEY='road_ready_trailer_return_by_load_v1';
export function readTrailerReturnsV10976(){if(typeof window==='undefined')return {};try{return JSON.parse(localStorage.getItem(RETURN_KEY)||'{}')||{};}catch{return {};}}
export function markTrailerReturnedV10976(loadNo,trailerId=''){if(typeof window==='undefined')return;const all=readTrailerReturnsV10976();all[upper(loadNo)]={returned:true,trailerId:text(trailerId),returnedAt:new Date().toISOString()};localStorage.setItem(RETURN_KEY,JSON.stringify(all));window.dispatchEvent(new Event('road-ready-trailer-return-changed'));}
export function undoTrailerReturnedV10976(loadNo){if(typeof window==='undefined')return;const all=readTrailerReturnsV10976();delete all[upper(loadNo)];localStorage.setItem(RETURN_KEY,JSON.stringify(all));window.dispatchEvent(new Event('road-ready-trailer-return-changed'));}
export function trailerReturnEvidenceV10976({state={},loadNo='',trailerId='',events=[]}={}){const target=upper(loadNo),stored=readTrailerReturnsV10976()[target],explicit=state.trailerReturnByLoad?.[target]||state.trailerReturns?.[target],event=(events||[]).find(e=>/trailer\s+(returned|return complete|dropped at return)|equipment return complete/i.test(text(e.note||e.description||e.reason))),returned=!!(stored?.returned||explicit?.returned||explicit===true||event);return {required:!!text(trailerId),returned,trailerId:text(trailerId),evidence:stored?'manual confirmation':explicit?'app state':event?'logbook event':''};}
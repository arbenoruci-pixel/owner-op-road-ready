'use client';

function text(v=''){return String(v??'').replace(/\s+/g,' ').trim();}
function upper(v=''){return text(v).toUpperCase();}
function num(v=0){const n=Number(v);return Number.isFinite(n)?n:0;}
function day(v=''){const s=text(v);return /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0,10))?s.slice(0,10):'';}
function refs(obj={}){return [obj.loadNo,obj.load_no,obj.shippingDocs,obj.shipping_documents,obj.orderNo,obj.order_no,obj.pickedUpLoadNo,obj.deliveredLoadNo].map(upper).filter(Boolean);}
function milesOf(obj={}){return num(obj.totalMiles||obj.total_miles||obj.dailyMiles||obj.daily_miles||obj.manualMiles||obj.manual_miles||obj.distance||obj.distanceMiles||obj.distance_miles||obj.form?.distance||obj.form?.distanceMiles);}

export function mileageEvidenceForLoadV10976(state={},loadNo=''){
  const target=upper(loadNo); const rows=[]; const seen=new Set();
  function add(date,value,source){const d=day(date),m=milesOf(value);if(!d||m<=0)return;const key=`${d}:${m}`;if(seen.has(key))return;seen.add(key);rows.push({day:d,miles:m,source});}
  for(const [d,value] of Object.entries(state.manualMilesByDay||{})) add(d,value,'manualMilesByDay');
  for(const [d,value] of Object.entries(state.dailyMilesByDay||{})) add(d,value,'dailyMilesByDay');
  for(const [d,value] of Object.entries(state.days||state.logDays||state.dayDataByDate||{})){
    const linked=refs(value).includes(target)||(value.events||[]).some(e=>refs(e).includes(target));
    if(linked)add(d,value,'logbook_day');
  }
  for(const [d,events] of Object.entries(state.eventsByDay||{})){
    if((events||[]).some(e=>refs(e).includes(target))){
      const container=(state.days||state.logDays||state.dayDataByDate||{})[d]||{};
      add(d,container,'linked_logbook_day');
    }
  }
  const total=rows.reduce((s,r)=>s+r.miles,0);
  return {complete:total>0,total,rows:rows.sort((a,b)=>a.day.localeCompare(b.day))};
}

const RETURN_KEY='road_ready_trailer_return_by_load_v1';
export function readTrailerReturnsV10976(){if(typeof window==='undefined')return {};try{return JSON.parse(localStorage.getItem(RETURN_KEY)||'{}')||{};}catch{return {};}}
export function markTrailerReturnedV10976(loadNo,trailerId=''){if(typeof window==='undefined')return;const all=readTrailerReturnsV10976();all[upper(loadNo)]={returned:true,trailerId:text(trailerId),returnedAt:new Date().toISOString()};localStorage.setItem(RETURN_KEY,JSON.stringify(all));window.dispatchEvent(new Event('road-ready-trailer-return-changed'));}
export function undoTrailerReturnedV10976(loadNo){if(typeof window==='undefined')return;const all=readTrailerReturnsV10976();delete all[upper(loadNo)];localStorage.setItem(RETURN_KEY,JSON.stringify(all));window.dispatchEvent(new Event('road-ready-trailer-return-changed'));}
export function trailerReturnEvidenceV10976({state={},loadNo='',trailerId='',events=[]}={}){
  const target=upper(loadNo);const stored=readTrailerReturnsV10976()[target];
  const explicit=state.trailerReturnByLoad?.[target]||state.trailerReturns?.[target];
  const event=(events||[]).find(e=>/trailer\s+(returned|return complete|dropped at return)|equipment return complete/i.test(text(e.note||e.description||e.reason)));
  const returned=!!(stored?.returned||explicit?.returned||explicit===true||event);
  return {required:!!text(trailerId),returned,trailerId:text(trailerId),evidence:stored?'manual confirmation':explicit?'app state':event?'logbook event':''};
}

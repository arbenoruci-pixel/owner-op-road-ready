import fs from 'node:fs';

const VERSION='109.7.18';
const BUILD='v109718-actual-load-day-evidence';
const read=p=>fs.readFileSync(p,'utf8');
const write=(p,v)=>fs.writeFileSync(p,v);
const writeJson=(p,v)=>write(p,JSON.stringify(v,null,2)+'\n');

write('source/src/modules/owneros/loadEvidenceV10976.js',`'use client';
function text(v=''){return String(v??'').replace(/\\s+/g,' ').trim();}
function upper(v=''){return text(v).toUpperCase();}
function num(v=0){const n=Number(v);return Number.isFinite(n)?n:0;}
function day(v=''){const s=text(v);const m=s.match(/\\d{4}-\\d{2}-\\d{2}/);return m?m[0]:'';}
function refs(obj={}){return [obj.loadNo,obj.load_no,obj.shippingDocs,obj.shipping_documents,obj.orderNo,obj.order_no,obj.pickedUpLoadNo,obj.deliveredLoadNo,obj.canonicalLoadNo].map(upper).filter(Boolean);}
function milesOf(obj={}){const direct=num(obj)||num(obj?.total||obj?.miles||obj?.totalMiles||obj?.total_miles||obj?.dailyMiles||obj?.daily_miles||obj?.manualMiles||obj?.manual_miles||obj?.distance||obj?.distanceMiles||obj?.distance_miles||obj?.form?.distance||obj?.form?.distanceMiles);if(direct>0)return direct;const segments=obj?.segments||obj?.routeSegments||[];return (segments||[]).reduce((sum,s)=>sum+num(s?.miles||s?.distance||s?.distanceMiles),0);}
export function actualEvidenceDayV109718(obj={},containerDay=''){for(const value of [obj.logDate,obj.log_date,obj.eventDate,obj.event_date,obj.dutyDate,obj.duty_date,obj.serviceDate,obj.service_date,obj.pickupDay,obj.pickupDate,obj.deliveryDay,obj.deliveryDate,obj.completedDate,obj.deliveredAt,obj.completedAt,obj.transactionDate,obj.postedAt,obj.date,obj.day]){const d=day(value);if(d)return d;}return day(containerDay);}
function linkedDaysForLoad(state={},target=''){
 const linked=new Set();
 function record(containerDay,record){if(!refs(record).includes(target))return;const d=actualEvidenceDayV109718(record,containerDay);if(d)linked.add(d);}
 for(const [containerDay,events] of Object.entries(state.eventsByDay||{}))for(const event of events||[])record(containerDay,event);
 for(const [containerDay,legs] of Object.entries(state.routeLegsByDay||{}))for(const leg of legs||[])record(containerDay,leg);
 for(const [containerDay,value] of Object.entries(state.days||state.logDays||state.dayDataByDate||{})){
  if(refs(value).includes(target)){const d=actualEvidenceDayV109718(value,containerDay);if(d)linked.add(d);}
  for(const event of value.events||[])record(containerDay,event);
 }
 return linked;
}
function mileageEntries(source={}){return Object.entries(source||{}).map(([key,value])=>({key,value,actualDay:actualEvidenceDayV109718(value,key)}));}
export function mileageEvidenceForLoadV10976(state={},loadNo=''){
 const target=upper(loadNo),rows=[],seen=new Set(),linkedDays=linkedDaysForLoad(state,target);
 function add(date,value,source){const d=actualEvidenceDayV109718(value,date),m=milesOf(value);if(!d||m<=0||(!linkedDays.has(d)&&!refs(value).includes(target)))return;const key=\\`\${d}:\${m}:\${source}\\`;if(seen.has(key))return;seen.add(key);rows.push({day:d,miles:m,source});}
 const directSources=[state.milesByLoad?.[target],state.dailyMilesByLoad?.[target],state.manualMilesByLoad?.[target],state.loadMiles?.[target]].filter(Boolean);
 for(const value of directSources){if(Array.isArray(value))for(const row of value)add('',row,'load_mileage');else for(const [d,row] of Object.entries(value||{}))add(d,row,'load_mileage');}
 for(const entry of mileageEntries(state.manualMilesByDay))if(linkedDays.has(entry.actualDay))add(entry.actualDay,entry.value,'manualMilesByDay');
 for(const entry of mileageEntries(state.dailyMilesByDay))if(linkedDays.has(entry.actualDay))add(entry.actualDay,entry.value,'dailyMilesByDay');
 for(const entry of mileageEntries(state.days||state.logDays||state.dayDataByDate))if(linkedDays.has(entry.actualDay))add(entry.actualDay,entry.value,'linked_logbook_day');
 const total=rows.reduce((s,r)=>s+r.miles,0);return {complete:total>0,total,rows:rows.sort((a,b)=>a.day.localeCompare(b.day)),linkedDays:[...linkedDays].sort()};
}
const RETURN_KEY='road_ready_trailer_return_by_load_v1';
export function readTrailerReturnsV10976(){if(typeof window==='undefined')return {};try{return JSON.parse(localStorage.getItem(RETURN_KEY)||'{}')||{};}catch{return {};}}
export function markTrailerReturnedV10976(loadNo,trailerId=''){if(typeof window==='undefined')return;const all=readTrailerReturnsV10976();all[upper(loadNo)]={returned:true,trailerId:text(trailerId),returnedAt:new Date().toISOString()};localStorage.setItem(RETURN_KEY,JSON.stringify(all));window.dispatchEvent(new Event('road-ready-trailer-return-changed'));}
export function undoTrailerReturnedV10976(loadNo){if(typeof window==='undefined')return;const all=readTrailerReturnsV10976();delete all[upper(loadNo)];localStorage.setItem(RETURN_KEY,JSON.stringify(all));window.dispatchEvent(new Event('road-ready-trailer-return-changed'));}
export function trailerReturnEvidenceV10976({state={},loadNo='',trailerId='',events=[]}={}){const target=upper(loadNo),stored=readTrailerReturnsV10976()[target],explicit=state.trailerReturnByLoad?.[target]||state.trailerReturns?.[target],event=(events||[]).find(e=>/trailer\\s+(returned|return complete|dropped at return)|equipment return complete/i.test(text(e.note||e.description||e.reason))),returned=!!(stored?.returned||explicit?.returned||explicit===true||event);return {required:!!text(trailerId),returned,trailerId:text(trailerId),evidence:stored?'manual confirmation':explicit?'app state':event?'logbook event':''};}
`);

const enginePath='source/src/modules/owneros/loadFolderEngineV10969.js';
let engine=read(enginePath);
engine=engine.replace("import { mileageEvidenceForLoadV10976, trailerReturnEvidenceV10976 } from './loadEvidenceV10976.js';","import { actualEvidenceDayV109718, mileageEvidenceForLoadV10976, trailerReturnEvidenceV10976 } from './loadEvidenceV10976.js';");
engine=engine.replace(/function loadEvents\(state=\{\},loadNo=''\)\{[^\n]+\}/,"function loadEvents(state={},loadNo=''){const t=upper(loadNo);return Object.entries(state.eventsByDay||{}).flatMap(([container,events])=>(events||[]).filter(e=>refs(e).includes(t)).map(e=>({...e,day:actualEvidenceDayV109718(e,container)}))).filter(e=>e.day);}");
engine=engine.replace(/function loadRouteLegs\(state=\{\},loadNo=''\)\{[^\n]+\}/,"function loadRouteLegs(state={},loadNo=''){const t=upper(loadNo);return Object.entries(state.routeLegsByDay||{}).flatMap(([container,legs])=>(legs||[]).filter(l=>refs(l).includes(t)).map(l=>({...l,day:actualEvidenceDayV109718(l,container)}))).filter(l=>l.day);}");
engine=engine.replace("const operationalDays=unique([...events.map(e=>e.day),...legs.map(l=>l.day)]).sort(),days=unique([...operationalDays,...docs.map(docDay)]).sort();","const loadDates=[load.pickupDate,load.pickupDay,load.deliveryDate,load.deliveryDay,load.completedDate,load.deliveredAt,load.completedAt].map(date).filter(Boolean);const operationalDays=unique([...events.map(e=>e.day),...legs.map(l=>l.day),...loadDates]).sort(),days=unique([...operationalDays,...docs.map(docDay)]).sort();");
engine=engine.replace("export const LOAD_FOLDER_ENGINE_VERSION_V10969 = '109.7.12';",`export const LOAD_FOLDER_ENGINE_VERSION_V10969 = '${VERSION}';`);
write(enginePath,engine);

write('source/src/modules/owneros/DotAuditCenterV109714.jsx',`'use client';
import React,{useMemo,useState} from 'react';
import { openVaultDocumentV102, vaultDocumentTypeV102 } from './documentVaultV102.js';
import { reconcileLoadFoldersV10974 } from './loadFolderReconciliationV10974.js';

function text(v=''){return String(v??'').replace(/\\s+/g,' ').trim();}
function day(v=''){const m=text(v).match(/\\d{4}-\\d{2}-\\d{2}/);return m?m[0]:'';}
function fmt(d=''){if(!d)return '';const x=new Date(\\`\${d}T12:00:00\\`);return Number.isNaN(x.getTime())?d:x.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'});}
function monday(dateKey=''){const d=new Date(\\`\${dateKey}T12:00:00\\`);const n=(d.getDay()+6)%7;d.setDate(d.getDate()-n);return d.toISOString().slice(0,10);}
function plus(d,n){const x=new Date(\\`\${d}T12:00:00\\`);x.setDate(x.getDate()+n);return x.toISOString().slice(0,10);}
function money(v=0){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('en-US',{style:'currency',currency:'USD'}):'$0.00';}
function docLabel(type=''){return ({rate_confirmation:'Rate Confirmation',bol:'BOL',pod:'POD',fuel_receipt:'Fuel receipt',invoice:'Invoice',factoring_packet:'Factoring packet',inspection:'Inspection',lumper_receipt:'Lumper',scale_ticket:'Scale ticket',toll:'Toll'})[type]||type.replace(/_/g,' ');}

export function buildDotAuditDaysV109714({state={},loads=[],documents=[],businessStore={},ownerStore={}}={}){
 const model=reconcileLoadFoldersV10974({loads,documents,state,businessStore});
 const invoices=[...(ownerStore.invoices||[]),...(businessStore.invoices||[])];
 const inspections=state.inspectionByDay||state.inspectionsByDay||{};
 const rows=[];
 for(const folder of model.folders||[]){
  const activeDays=[...new Set([...(folder.days||[]),...(folder.mileage?.linkedDays||[])].map(day).filter(Boolean))].sort();
  for(const dateKey of activeDays){
   const mileageRows=(folder.mileage?.rows||[]).filter(r=>day(r.day)===dateKey);
   const mileage={total:mileageRows.reduce((s,r)=>s+Number(r.miles||0),0),rows:mileageRows};
   const docs=folder.documents||[];
   const types=docs.map(vaultDocumentTypeV102);
   const invoiceRows=invoices.filter(x=>String(x.loadNo||x.load_no||'').trim().toUpperCase()===folder.loadNo);
   const eventRows=(folder.events||[]).filter(e=>day(e.day)===dateKey);
   const routeRows=(folder.legs||[]).filter(l=>day(l.day)===dateKey);
   const inspectionRows=Array.isArray(inspections[dateKey])?inspections[dateKey]:inspections[dateKey]?[inspections[dateKey]]:[];
   rows.push({date:dateKey,loadNo:folder.loadNo,load:folder,folder,docs,fuelRows:folder.fuelRows||[],invoiceRows,eventRows,routeRows,inspectionRows,mileage,counts:{rate:types.filter(t=>t==='rate_confirmation').length,bol:types.filter(t=>t==='bol').length,pod:types.filter(t=>t==='pod').length,fuel:(folder.fuelRows||[]).length+types.filter(t=>t==='fuel_receipt').length,invoice:invoiceRows.length+types.filter(t=>t==='invoice').length,inspection:inspectionRows.length+types.filter(t=>t==='inspection').length}});
  }
 }
 return rows.sort((a,b)=>b.date.localeCompare(a.date)||a.loadNo.localeCompare(b.loadNo));
}

export default function DotAuditCenterV109714({state={},loads=[],documents=[],businessStore={},ownerStore={},onOpenLog}){
 const rows=useMemo(()=>buildDotAuditDaysV109714({state,loads,documents,businessStore,ownerStore}),[state,loads,documents,businessStore,ownerStore]);
 const weeks=useMemo(()=>{const map=new Map();for(const r of rows){const w=monday(r.date);if(!map.has(w))map.set(w,[]);map.get(w).push(r);}return [...map.entries()].sort((a,b)=>b[0].localeCompare(a[0]));},[rows]);
 const [week,setWeek]=useState('');const [selectedDay,setSelectedDay]=useState('');
 const weekRows=week?(weeks.find(([w])=>w===week)?.[1]||[]):[];
 const days=[...new Set(weekRows.map(r=>r.date))].sort((a,b)=>b.localeCompare(a));
 const dayRows=selectedDay?weekRows.filter(r=>r.date===selectedDay):[];
 if(selectedDay)return <section className="dot-audit-v109714"><button className="dot-back-v109714" onClick={()=>setSelectedDay('')}>‹ Days in week</button><header><span>DOT OFFICER VIEW</span><b>{fmt(selectedDay)}</b><em>{dayRows.length} load{dayRows.length===1?'':'s'} with activity</em></header><button className="dot-log-v109714" onClick={()=>onOpenLog?.(selectedDay)}>Open full Logbook day</button>{dayRows.map(r=><article key={r.loadNo}><h3>Load {r.loadNo}</h3><p>{[r.load.origin,r.load.destination].filter(Boolean).join(' → ')||'Route linked from Logbook'}</p><div className="dot-proof-grid-v109714"><span>Log events <b>{r.eventRows.length}</b></span><span>Miles <b>{Number(r.mileage.total||0).toFixed(0)}</b></span><span>Rate Con <b>{r.counts.rate}</b></span><span>BOL <b>{r.counts.bol}</b></span><span>POD <b>{r.counts.pod}</b></span><span>Fuel <b>{r.counts.fuel}</b></span><span>Inspection <b>{r.counts.inspection}</b></span><span>Billing <b>{r.counts.invoice}</b></span></div>{r.invoiceRows.length?<div className="dot-billing-v109714">{r.invoiceRows.map((x,i)=><span key={x.id||i}>{x.invoiceNo||'Invoice'} · {money(x.total)} · {x.status||'saved'}</span>)}</div>:null}<div className="dot-docs-v109714">{r.docs.map((doc,i)=><button key={doc.local_id||doc.id||i} onClick={()=>openVaultDocumentV102(doc)}>{docLabel(vaultDocumentTypeV102(doc))}<small>{doc.title||doc.original_file_name}</small></button>)}</div></article>)}</section>;
 if(week)return <section className="dot-audit-v109714"><button className="dot-back-v109714" onClick={()=>setWeek('')}>‹ All weeks</button><header><span>DOT AUDIT WEEK</span><b>{fmt(week)} – {fmt(plus(week,6))}</b><em>Select the exact day requested by the officer</em></header><div className="dot-day-list-v109714">{days.map(d=>{const rs=weekRows.filter(r=>r.date===d);return <button key={d} onClick={()=>setSelectedDay(d)}><b>{fmt(d)}</b><em>{rs.length} load{rs.length===1?'':'s'} · {rs.reduce((s,r)=>s+r.docs.length,0)} documents</em><span>›</span></button>})}</div></section>;
 return <section className="dot-audit-v109714"><header><span>DOT AUDIT CENTER</span><b>Open the exact week and day</b><em>Each real load day includes the reconciled packet: Logbook, that day's miles, Rate Con, BOL, POD, fuel, inspections and billing.</em></header><div className="dot-week-list-v109714">{weeks.map(([w,rs])=><button key={w} onClick={()=>setWeek(w)}><b>{fmt(w)} – {fmt(plus(w,6))}</b><em>{new Set(rs.map(r=>r.loadNo)).size} loads · {new Set(rs.map(r=>r.date)).size} active days · {rs.reduce((s,r)=>s+r.docs.length,0)} linked documents</em><span>›</span></button>)}</div>{!weeks.length?<p>No dated load activity found yet.</p>:null}</section>;
}
`);

for(const p of ['package.json','package-lock.json'])if(fs.existsSync(p)){const data=JSON.parse(read(p));data.version=VERSION;data.engines={...(data.engines||{}),node:'24.x'};if(data.packages?.['']){data.packages[''].version=VERSION;data.packages[''].engines={...(data.packages[''].engines||{}),node:'24.x'};}writeJson(p,data);}
const now=new Date().toISOString();
writeJson('release-version.json',{version:VERSION,build:BUILD,label:'v109.7.18 Actual Load-Day Evidence'});
writeJson('public/app-version.json',{version:VERSION,build:BUILD,releasedAt:now,updatedAt:now,label:'v109.7.18 Actual Load-Day Evidence',force:true,notes:['Miles attach only to the actual date stored on the load event, route leg or Logbook record.','DOT day view uses the reconciled load folder so Rate Con, BOL, POD, fuel and billing appear together.','Today is never substituted when a historical load event has its own date.']});
let update=read('source/src/core/update/appUpdate.js');update=update.replace(/const FALLBACK_APP_VERSION\s*=\s*['"][^'"]+['"];?/,`const FALLBACK_APP_VERSION = '${VERSION}';`).replace(/const FALLBACK_APP_BUILD\s*=\s*['"][^'"]+['"];?/,`const FALLBACK_APP_BUILD = '${BUILD}';`);write('source/src/core/update/appUpdate.js',update);
let sw=read('public/sw.js');sw=sw.replace(/const OWNER_OP_SW_VERSION\s*=\s*['"][^'"]+['"];?/,`const OWNER_OP_SW_VERSION = '${VERSION}';`).replace(/const OWNER_OP_SW_BUILD\s*=\s*['"][^'"]+['"];?/,`const OWNER_OP_SW_BUILD = '${BUILD}';`);write('public/sw.js',sw);
console.log('PASS — v109.7.18 actual load-day evidence applied last');

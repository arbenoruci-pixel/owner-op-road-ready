'use client';
import React,{useMemo,useState} from 'react';
import { openVaultDocumentV102, vaultDocumentLoadNoV102, vaultDocumentTypeV102 } from './documentVaultV102.js';

function text(v=''){return String(v??'').replace(/\s+/g,' ').trim();}
function upper(v=''){return text(v).toUpperCase();}
function day(v=''){const s=text(v);const m=s.match(/\d{4}-\d{2}-\d{2}/);return m?m[0]:'';}
function eventDay(row={},fallback=''){return day(row.logDate||row.eventDate||row.dutyDate||row.date||row.day||row.timestamp||row.createdAt)||day(fallback);}
function refs(row={}){return [row.loadNo,row.load_no,row.shippingDocs,row.shipping_documents,row.orderNo,row.order_no,row.canonicalLoadNo,row.pickedUpLoadNo,row.deliveredLoadNo].map(upper).filter(Boolean);}
function fmt(d=''){if(!d)return '';const x=new Date(`${d}T12:00:00`);return Number.isNaN(x.getTime())?d:x.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'});}
function monday(dateKey=''){const d=new Date(`${dateKey}T12:00:00`);const n=(d.getDay()+6)%7;d.setDate(d.getDate()-n);return d.toISOString().slice(0,10);}
function plus(d,n){const x=new Date(`${d}T12:00:00`);x.setDate(x.getDate()+n);return x.toISOString().slice(0,10);}
function money(v=0){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('en-US',{style:'currency',currency:'USD'}):'$0.00';}
function docLabel(type=''){return ({rate_confirmation:'Rate Confirmation',bol:'BOL',pod:'POD',fuel_receipt:'Fuel receipt',invoice:'Invoice',factoring_packet:'Factoring packet',inspection:'Inspection',lumper_receipt:'Lumper',scale_ticket:'Scale ticket',toll:'Toll'})[type]||type.replace(/_/g,' ');}

export function buildDotAuditDaysV109714({state={},loads=[],documents=[],businessStore={},ownerStore={}}={}){
 const dateLoads=new Map();
 function link(dateKey,loadNo,source){const d=day(dateKey),n=upper(loadNo);if(!d||!n)return;const key=`${d}:${n}`;if(!dateLoads.has(key))dateLoads.set(key,{date:d,loadNo:n,sources:new Set()});dateLoads.get(key).sources.add(source);}
 for(const [container,events] of Object.entries(state.eventsByDay||{}))for(const e of events||[])for(const n of refs(e))link(eventDay(e,container),n,'logbook');
 for(const [container,legs] of Object.entries(state.routeLegsByDay||{}))for(const l of legs||[])for(const n of refs(l))link(eventDay(l,container),n,'route');
 for(const load of loads||[]){const n=upper(load.loadNo);for(const d of [load.pickupDate,load.deliveryDate,load.completedDate,load.deliveredAt,load.date])if(day(d))link(day(d),n,'load');}
 const docsByLoad=new Map();for(const doc of documents||[]){const n=upper(vaultDocumentLoadNoV102(doc));if(!n)continue;if(!docsByLoad.has(n))docsByLoad.set(n,[]);docsByLoad.get(n).push(doc);}
 const fuel=[...(businessStore.fuel||[]),...(ownerStore.fuelImports||[])];
 const invoices=ownerStore.invoices||[];
 const inspections=state.inspectionByDay||state.inspectionsByDay||{};
 const rows=[...dateLoads.values()].map(base=>{
   const load=(loads||[]).find(x=>upper(x.loadNo)===base.loadNo)||{loadNo:base.loadNo};
   const docs=docsByLoad.get(base.loadNo)||[];
   const fuelRows=fuel.filter(x=>upper(x.loadNo)===base.loadNo||(!x.loadNo&&day(x.date)===base.date));
   const invoiceRows=invoices.filter(x=>upper(x.loadNo)===base.loadNo);
   const eventRows=Object.entries(state.eventsByDay||{}).flatMap(([container,events])=>(events||[]).filter(e=>eventDay(e,container)===base.date&&refs(e).includes(base.loadNo)));
   const routeRows=Object.entries(state.routeLegsByDay||{}).flatMap(([container,legs])=>(legs||[]).filter(l=>eventDay(l,container)===base.date&&refs(l).includes(base.loadNo)));
   const inspectionRows=(inspections[base.date]||[]); const mileage=state.dailyMilesByDay?.[base.date]||state.manualMilesByDay?.[base.date]||{};
   const types=docs.map(vaultDocumentTypeV102);
   return {...base,sources:[...base.sources],load,docs,fuelRows,invoiceRows,eventRows,routeRows,inspectionRows,mileage,counts:{rate:types.filter(t=>t==='rate_confirmation').length,bol:types.filter(t=>t==='bol').length,pod:types.filter(t=>t==='pod').length,fuel:fuelRows.length+types.filter(t=>t==='fuel_receipt').length,invoice:invoiceRows.length+types.filter(t=>t==='invoice').length,inspection:inspectionRows.length+types.filter(t=>t==='inspection').length}};
 }).sort((a,b)=>b.date.localeCompare(a.date)||a.loadNo.localeCompare(b.loadNo));
 return rows;
}

export default function DotAuditCenterV109714({state={},loads=[],documents=[],businessStore={},ownerStore={},onOpenLog}){
 const rows=useMemo(()=>buildDotAuditDaysV109714({state,loads,documents,businessStore,ownerStore}),[state,loads,documents,businessStore,ownerStore]);
 const weeks=useMemo(()=>{const map=new Map();for(const r of rows){const w=monday(r.date);if(!map.has(w))map.set(w,[]);map.get(w).push(r);}return [...map.entries()].sort((a,b)=>b[0].localeCompare(a[0]));},[rows]);
 const [week,setWeek]=useState('');const [selectedDay,setSelectedDay]=useState('');
 const weekRows=week?(weeks.find(([w])=>w===week)?.[1]||[]):[];
 const days=[...new Set(weekRows.map(r=>r.date))].sort((a,b)=>b.localeCompare(a));
 const dayRows=selectedDay?weekRows.filter(r=>r.date===selectedDay):[];
 if(selectedDay)return <section className="dot-audit-v109714"><button className="dot-back-v109714" onClick={()=>setSelectedDay('')}>‹ Days in week</button><header><span>DOT OFFICER VIEW</span><b>{fmt(selectedDay)}</b><em>{dayRows.length} load{dayRows.length===1?'':'s'} with activity</em></header><button className="dot-log-v109714" onClick={()=>onOpenLog?.(selectedDay)}>Open full Logbook day</button>{dayRows.map(r=><article key={r.loadNo}><h3>Load {r.loadNo}</h3><p>{[r.load.origin,r.load.destination].filter(Boolean).join(' → ')||'Route linked from Logbook'}</p><div className="dot-proof-grid-v109714"><span>Log events <b>{r.eventRows.length}</b></span><span>Miles <b>{Number(r.mileage.total||r.mileage.miles||0).toFixed(0)}</b></span><span>Rate Con <b>{r.counts.rate}</b></span><span>BOL <b>{r.counts.bol}</b></span><span>POD <b>{r.counts.pod}</b></span><span>Fuel <b>{r.counts.fuel}</b></span><span>Inspection <b>{r.counts.inspection}</b></span><span>Billing <b>{r.counts.invoice}</b></span></div>{r.invoiceRows.length?<div className="dot-billing-v109714">{r.invoiceRows.map((x,i)=><span key={x.id||i}>{x.invoiceNo||'Invoice'} · {money(x.total)} · {x.status||'saved'}</span>)}</div>:null}<div className="dot-docs-v109714">{r.docs.map(doc=><button key={doc.local_id} onClick={()=>openVaultDocumentV102(doc)}>{docLabel(vaultDocumentTypeV102(doc))}<small>{doc.title||doc.original_file_name}</small></button>)}</div></article>)}</section>;
 if(week)return <section className="dot-audit-v109714"><button className="dot-back-v109714" onClick={()=>setWeek('')}>‹ All weeks</button><header><span>DOT AUDIT WEEK</span><b>{fmt(week)} – {fmt(plus(week,6))}</b><em>Select the exact day requested by the officer</em></header><div className="dot-day-list-v109714">{days.map(d=>{const rs=weekRows.filter(r=>r.date===d);return <button key={d} onClick={()=>setSelectedDay(d)}><b>{fmt(d)}</b><em>{rs.length} load{rs.length===1?'':'s'} · {rs.reduce((s,r)=>s+r.docs.length,0)} documents</em><span>›</span></button>})}</div></section>;
 return <section className="dot-audit-v109714"><header><span>DOT AUDIT CENTER</span><b>Open the exact week and day</b><em>Each load day includes its full load packet: Logbook, miles, Rate Con, BOL, POD, fuel, inspections and billing.</em></header><div className="dot-week-list-v109714">{weeks.map(([w,rs])=><button key={w} onClick={()=>setWeek(w)}><b>{fmt(w)} – {fmt(plus(w,6))}</b><em>{new Set(rs.map(r=>r.loadNo)).size} loads · {new Set(rs.map(r=>r.date)).size} active days · {rs.reduce((s,r)=>s+r.docs.length,0)} linked documents</em><span>›</span></button>)}</div>{!weeks.length?<p>No dated load activity found yet.</p>:null}</section>;
}

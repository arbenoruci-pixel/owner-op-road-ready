'use client';

import { displayEventsForDay } from '../../core/timeline/displayTimeline.js';
import { validateLogForSigning } from '../logbook/signing.js';

const STORE_KEY='road_ready_historical_logbook_snapshots_v2';
const SNAPSHOT_SCHEMA='road-ready-full-daily-logbook-v2';
const VALID_STATUSES=['OFF','SB','D','ON'];

function text(value=''){return String(value??'').replace(/\s+/g,' ').trim();}
function isoDay(value=''){const valueText=text(value).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(valueText)?valueText:'';}
function num(value=0){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;}
function upper(value=''){return text(value).toUpperCase();}
function previousDay(day){const date=new Date(`${day}T12:00:00Z`);date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10);}
function statusOf(event={}){const status=upper(event.status||event.dutyStatus||event.duty_status||'OFF');return VALID_STATUSES.includes(status)?status:'OFF';}
function minuteOf(value,fallback=0){return Math.max(0,Math.min(1440,num(value??fallback)));}
function timeLabel(minute=0){const value=Math.max(0,Math.min(1440,Math.round(num(minute))));if(value===1440)return'24:00';const hour=Math.floor(value/60),mins=value%60;return `${String(hour).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;}
function durationLabel(minutes=0){const value=Math.max(0,Math.round(num(minutes)));return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;}
function locationOf(event={}){return text(event.location||event.locationName||event.location_name||[event.city,event.state].filter(Boolean).join(', '))||'Location not recorded';}
function eventSource(event={}){return text(event.origin||event.source||event.eventOrigin||event.event_origin||event.recordOrigin||event.record_origin||'Driver');}
function remarksOf(event={}){return text(event.note||event.notes||event.remark||event.remarks||event.description||event.annotation||event.annotations||event.editReason||event.edit_reason);}
function eventVersionKey(event={}){return text(event.replacesEventId||event.replaces_event_id||event.originalEventId||event.original_event_id||event.parentEventId||event.parent_event_id||event.id);}
function isEffectiveEvent(event={}){const state=upper(event.recordStatus||event.record_status||event.eventStatus||event.event_status||event.statusCode||'');if(/INVALID|REJECT|SUPERSEDED|INACTIVE|DELETED/.test(state))return false;if(event.invalid===true||event.rejected===true||event.superseded===true||event.deleted===true||event.active===false)return false;return true;}
function rawEventsForDay(state={},day=''){return Array.isArray(state.eventsByDay?.[day])?state.eventsByDay[day]:[];}
function effectiveDisplayEvents(state={},day=''){
 const displayed=displayEventsForDay(rawEventsForDay(state,day),false)||[];
 const byVersion=new Map();
 for(const event of displayed.filter(isEffectiveEvent)){
  const key=eventVersionKey(event)||`${event.startMin}-${event.endMin}-${statusOf(event)}`;
  const previous=byVersion.get(key);
  const stamp=text(event.updatedAt||event.updated_at||event.editTimestamp||event.edit_timestamp||event.createdAt||event.created_at);
  const previousStamp=text(previous?.updatedAt||previous?.updated_at||previous?.editTimestamp||previous?.edit_timestamp||previous?.createdAt||previous?.created_at);
  if(!previous||stamp>=previousStamp)byVersion.set(key,event);
 }
 return [...byVersion.values()].sort((a,b)=>minuteOf(a.startMin)-minuteOf(b.startMin)||text(a.id).localeCompare(text(b.id)));
}
function midnightStatus(state={},day=''){
 const previous=effectiveDisplayEvents(state,previousDay(day));
 if(previous.length)return statusOf(previous.at(-1));
 const current=effectiveDisplayEvents(state,day);
 return current.length?statusOf(current[0]):'OFF';
}
export function normalizedHistoricalTimelineV10981(state={},day=''){
 const source=effectiveDisplayEvents(state,day);
 const rows=[];
 let cursor=0;
 let currentStatus=midnightStatus(state,day);
 for(const event of source){
  const start=minuteOf(event.startMin,event.minute),end=Math.max(start,minuteOf(event.endMin,start));
  if(start>cursor)rows.push({id:`carry-${cursor}`,status:currentStatus,startMin:cursor,endMin:start,location:'Carry-forward from prior status',origin:'System carry-forward',remarks:'Status carried forward to preserve complete 24-hour coverage.'});
  if(end>start){rows.push({...event,status:statusOf(event),startMin:start,endMin:end,location:locationOf(event),origin:eventSource(event),remarks:remarksOf(event)});cursor=end;currentStatus=statusOf(event);}
 }
 if(cursor<1440)rows.push({id:`tail-${cursor}`,status:currentStatus,startMin:cursor,endMin:1440,location:'Status continuation',origin:'System continuation',remarks:'Status continued through 24:00.'});
 return rows.sort((a,b)=>a.startMin-b.startMin);
}
function totalsFor(events=[]){const totals={OFF:0,SB:0,D:0,ON:0};for(const event of events)totals[statusOf(event)]+=Math.max(0,num(event.endMin)-num(event.startMin));return totals;}
function loadReferences(folder={}){return [...new Set([folder.loadNo,folder.load_no,folder.title,...(folder.events||[]).flatMap(event=>[event.loadNo,event.load_no,event.shippingDocs,event.shipping_documents]),...(folder.legs||[]).flatMap(leg=>[leg.loadNo,leg.load_no,leg.shippingDocs,leg.shipping_documents])].map(text).filter(Boolean))].join(' · ');}
export function historicalLogbookDatesV10981(folder={}){return [...new Set([...(folder.days||[]),...(folder.events||[]).map(event=>event.day),...(folder.legs||[]).flatMap(leg=>[leg.day,leg.pickupDay,leg.deliveryDay]),...(folder.mileage?.linkedDays||[]),...(folder.mileage?.rows||[]).map(row=>row.day)].map(isoDay).filter(Boolean))].sort();}
function dailyMiles(state={},day='',events=[]){const candidates=[state.dailyMilesByDay?.[day],state.manualMilesByDay?.[day],state.milesByDay?.[day],state.logDays?.[day],state.days?.[day]];for(const value of candidates){const miles=num(value?.totalMiles||value?.total_miles||value?.miles||value?.total||value);if(miles>0)return miles;}const odometers=events.flatMap(event=>[num(event.odometer||event.odometerMiles||event.odometer_miles)]).filter(value=>value>0);return odometers.length>1?Math.max(...odometers)-Math.min(...odometers):0;}
function drivingMiles(state={},day='',events=[]){const value=state.drivingMilesByDay?.[day]??state.dailyDrivingMilesByDay?.[day];const stored=num(value?.miles||value?.total||value);if(stored>0)return stored;return dailyMiles(state,day,events);}
function driverId(state={}){return text(state.driver?.id||state.driverId||state.driver_id||state.driverProfile?.id||state.driverProfile?.email||state.driver?.email||'driver');}
function metadataFor(state={},folder={},day='',events=[]){
 const load=folder.load||folder;
 const certification=state.signatureByDay?.[day]||{};
 const violations=(validateLogForSigning(state,day)||[]).filter(issue=>issue.code!=='active_day').map(issue=>text(issue.message||issue.label||issue.code)).filter(Boolean);
 return {schema:SNAPSHOT_SCHEMA,logDate:day,loadId:text(folder.id||folder.loadId||folder.load_id||folder.loadNo),loadNo:text(folder.loadNo||folder.load_no),driverId:driverId(state),driverName:text(state.driverProfile?.name||state.driverSignature?.driverName||state.driver?.name||'Driver not set'),carrier:text(state.carrierName||state.companyName||'Carrier not set'),dotNumber:text(state.dotNumber||state.usdot||state.carrierDot),truck:text(load.truckNo||load.truck||state.driver?.truck||state.currentTruck||'Truck not set'),trailer:text(folder.trailerId||load.trailerNo||load.trailer||state.currentTrailer||state.driver?.trailer),shippingDocuments:loadReferences(folder)||'None linked',homeTerminal:text(state.homeTerminal||state.homeTerminalAddress||state.driverProfile?.homeTerminal||'Home terminal not set'),mainOffice:text(state.mainOfficeAddress||state.companyAddress||'Main office not set'),totalVehicleMiles:dailyMiles(state,day,events),totalDrivingMiles:drivingMiles(state,day,events),certified:!!certification.signed,certifiedAt:text(certification.signedAt||certification.certifiedAt),violations};
}
function snapshotPayload(state={},folder={},day=''){const events=normalizedHistoricalTimelineV10981(state,day);return {metadata:metadataFor(state,folder,day,events),events:events.map(event=>({id:text(event.id),status:statusOf(event),startMin:num(event.startMin),endMin:num(event.endMin),location:locationOf(event),odometer:num(event.odometer||event.odometerMiles||event.odometer_miles)||null,engineHours:num(event.engineHours||event.engine_hours)||null,origin:eventSource(event),remarks:remarksOf(event),annotation:text(event.annotation||event.annotations||event.editReason||event.edit_reason),edited:!!(event.edited||event.isEdited||event.editReason||event.edit_reason)})),totals:totalsFor(events)};}
function stableStringify(value){if(Array.isArray(value))return`[${value.map(stableStringify).join(',')}]`;if(value&&typeof value==='object')return`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;return JSON.stringify(value);}
function checksum(value){let hash=2166136261;const source=stableStringify(value);for(let index=0;index<source.length;index+=1){hash^=source.charCodeAt(index);hash=Math.imul(hash,16777619);}return`fnv1a-${(hash>>>0).toString(16).padStart(8,'0')}`;}
function readStore(){if(typeof window==='undefined')return{};try{return JSON.parse(localStorage.getItem(STORE_KEY)||'{}')||{};}catch{return{};}}
function writeStore(store){if(typeof window!=='undefined')localStorage.setItem(STORE_KEY,JSON.stringify(store));}
function snapshotBaseKey(payload={}){const meta=payload.metadata||{};return`${text(meta.loadId||meta.loadNo)}|${text(meta.driverId)}|${isoDay(meta.logDate)}`;}
export function ensureHistoricalLogbookSnapshotV10981({state={},folder={},day=''}){
 const payload=snapshotPayload(state,folder,day);const hash=checksum(payload),store=readStore(),base=snapshotBaseKey(payload),versions=Array.isArray(store[base])?store[base]:[];
 const existing=versions.find(snapshot=>snapshot.checksum===hash);if(existing)return existing;
 const snapshot={snapshotId:`${base}|v${versions.length+1}`,version:versions.length+1,generatedAt:new Date().toISOString(),checksum:hash,...payload};
 store[base]=[...versions,snapshot];writeStore(store);return snapshot;
}
export function latestHistoricalLogbookSnapshotV10981({state={},folder={},day=''}){const probe=snapshotPayload(state,folder,day),versions=readStore()[snapshotBaseKey(probe)]||[];return versions.at(-1)||null;}

function pdfEscape(value=''){return text(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[^\x20-\x7E]/g,'?');}
function drawText(ops,value,x,y,size=8,bold=false){ops.push(`BT /${bold?'F2':'F1'} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);}
function line(ops,x1,y1,x2,y2,width=1){ops.push(`${width} w ${x1} ${y1} m ${x2} ${y2} l S`);}
function buildDayPage(snapshot={}){
 const {metadata={},events=[],totals={}}=snapshot,ops=[];drawText(ops,'ROAD READY - DRIVER DAILY LOG',34,760,15,true);drawText(ops,metadata.logDate||'',460,760,11,true);
 drawText(ops,`Driver: ${metadata.driverName}`,34,738,9,true);drawText(ops,`Carrier: ${metadata.carrier}${metadata.dotNumber?` / USDOT ${metadata.dotNumber}`:''}`,300,738,8);
 drawText(ops,`Truck: ${metadata.truck}   Trailer: ${metadata.trailer||'N/A'}`,34,722,8);drawText(ops,`Load / Shipping docs: ${metadata.shippingDocuments}`,300,722,8);
 drawText(ops,`Home terminal: ${metadata.homeTerminal}`,34,706,8);drawText(ops,`Main office: ${metadata.mainOffice}`,300,706,8);
 drawText(ops,`Vehicle miles: ${metadata.totalVehicleMiles||0}   Driving miles: ${metadata.totalDrivingMiles||0}`,34,690,8);drawText(ops,`Certification: ${metadata.certified?'CERTIFIED':'NOT CERTIFIED'}${metadata.certifiedAt?` at ${metadata.certifiedAt}`:''}`,300,690,8);
 const left=58,right=574,top=656,rowHeight=24,statuses=['OFF','SB','D','ON'];
 for(let hour=0;hour<=24;hour+=1){const x=left+(hour/24)*(right-left);line(ops,x,top,x,top-rowHeight*4,hour%6===0?0.8:0.25);if(hour%2===0)drawText(ops,hour===24?'24':String(hour).padStart(2,'0'),x-4,top+7,6);}
 statuses.forEach((status,index)=>{const y=top-index*rowHeight-rowHeight/2;drawText(ops,status,31,y-2,7,true);line(ops,left,top-index*rowHeight,right,top-index*rowHeight,0.5);});line(ops,left,top-rowHeight*4,right,top-rowHeight*4,0.5);
 const center=status=>top-statuses.indexOf(status)*rowHeight-rowHeight/2,xFor=minute=>left+(Math.max(0,Math.min(1440,num(minute)))/1440)*(right-left);
 events.forEach((event,index)=>{const y=center(event.status);line(ops,xFor(event.startMin),y,xFor(event.endMin),y,3);const next=events[index+1];if(next&&next.status!==event.status)line(ops,xFor(next.startMin),y,xFor(next.startMin),center(next.status),1.3);});
 drawText(ops,`TOTALS  OFF ${durationLabel(totals.OFF)}   SB ${durationLabel(totals.SB)}   D ${durationLabel(totals.D)}   ON ${durationLabel(totals.ON)}`,34,542,10,true);
 drawText(ops,'EVENTS',34,522,9,true);drawText(ops,'#  STATUS  START-END  DUR   LOCATION / ODOMETER / ENGINE HOURS / ORIGIN / REMARKS',34,508,6,true);
 let y=494;events.slice(0,17).forEach((event,index)=>{const details=[locationOf(event),event.odometer!=null?`ODO ${event.odometer}`:'',event.engineHours!=null?`ENG ${event.engineHours}`:'',event.origin,event.remarks,event.annotation].filter(Boolean).join(' | ');drawText(ops,`${String(index+1).padStart(2,'0')} ${event.status.padEnd(3)} ${timeLabel(event.startMin)}-${timeLabel(event.endMin)} ${durationLabel(event.endMin-event.startMin)} ${details}`.slice(0,132),34,y,6.2);y-=15;});
 if(events.length>17)drawText(ops,`${events.length-17} additional events continue on the next page.`,34,y,7,true);
 y=210;drawText(ops,'WARNINGS / VIOLATIONS',34,y,8,true);const warnings=metadata.violations?.length?metadata.violations:['None recorded'];warnings.slice(0,4).forEach((warning,index)=>drawText(ops,`- ${warning}`.slice(0,125),34,y-15-index*13,6.5));
 drawText(ops,`Snapshot ${snapshot.snapshotId} | checksum ${snapshot.checksum} | generated ${snapshot.generatedAt}`,34,32,6);
 return {content:ops.join('\n')};
}
function buildContinuationPage(snapshot={}){const events=snapshot.events||[];if(events.length<=17)return null;const ops=[];drawText(ops,`ROAD READY - EVENT DETAIL CONTINUED - ${snapshot.metadata?.logDate||''}`,34,760,13,true);let y=735;events.slice(17).forEach((event,index)=>{const details=[locationOf(event),event.odometer!=null?`ODO ${event.odometer}`:'',event.engineHours!=null?`ENG ${event.engineHours}`:'',event.origin,event.remarks,event.annotation].filter(Boolean).join(' | ');drawText(ops,`${String(index+18).padStart(2,'0')} ${event.status} ${timeLabel(event.startMin)}-${timeLabel(event.endMin)} ${durationLabel(event.endMin-event.startMin)} ${details}`.slice(0,132),34,y,6.2);y-=15;});return {content:ops.join('\n')};}
function buildPdf(pages=[]){const encoder=new TextEncoder(),objects=[],pageRefs=[];let nextId=5;for(const page of pages){const pageId=nextId++,contentId=nextId++,bytes=encoder.encode(page.content||'');pageRefs.push(pageId);objects.push({id:contentId,body:`<< /Length ${bytes.length} >>\nstream\n${page.content||''}\nendstream`},{id:pageId,body:`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`});}objects.push({id:1,body:'<< /Type /Catalog /Pages 2 0 R >>'},{id:2,body:`<< /Type /Pages /Kids [${pageRefs.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`},{id:3,body:'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'},{id:4,body:'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'});objects.sort((a,b)=>a.id-b.id);const chunks=[encoder.encode('%PDF-1.4\n')],offsets=[0];let offset=chunks[0].length;for(const object of objects){offsets[object.id]=offset;const chunk=encoder.encode(`${object.id} 0 obj\n${object.body}\nendobj\n`);chunks.push(chunk);offset+=chunk.length;}const size=Math.max(...objects.map(object=>object.id))+1,xrefStart=offset;let xref=`xref\n0 ${size}\n0000000000 65535 f \n`;for(let id=1;id<size;id+=1)xref+=`${String(offsets[id]||0).padStart(10,'0')} 00000 n \n`;xref+=`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;chunks.push(encoder.encode(xref));return new Blob(chunks,{type:'application/pdf'});}
function openBlob(blob,fileName){const url=URL.createObjectURL(blob);const opened=window.open(url,'_blank','noopener,noreferrer');if(!opened){const link=document.createElement('a');link.href=url;link.download=fileName;document.body.appendChild(link);link.click();link.remove();}window.setTimeout(()=>URL.revokeObjectURL(url),120000);}
export function openHistoricalLogbookPdfV10981({state={},folder={},day=''}){const snapshot=ensureHistoricalLogbookSnapshotV10981({state,folder,day});const pages=[buildDayPage(snapshot),buildContinuationPage(snapshot)].filter(Boolean);openBlob(buildPdf(pages),`historical-logbook-${snapshot.metadata.loadNo||snapshot.metadata.loadId}-${day}-v${snapshot.version}.pdf`);return snapshot;}
export function openAllHistoricalLogbooksPdfV10981({state={},folder={}}){const days=historicalLogbookDatesV10981(folder);const snapshots=days.map(day=>ensureHistoricalLogbookSnapshotV10981({state,folder,day}));const pages=snapshots.flatMap(snapshot=>[buildDayPage(snapshot),buildContinuationPage(snapshot)].filter(Boolean));if(pages.length)openBlob(buildPdf(pages),`historical-logbooks-${text(folder.loadNo||folder.id||'load')}.pdf`);return snapshots;}
export function rebuildHistoricalLogbooksV10981({state={},folders=[]}){const results=[];for(const folder of folders){for(const day of historicalLogbookDatesV10981(folder)){try{const before=latestHistoricalLogbookSnapshotV10981({state,folder,day}),snapshot=ensureHistoricalLogbookSnapshotV10981({state,folder,day});results.push({loadNo:text(folder.loadNo),day,status:before?.checksum===snapshot.checksum?'unchanged':'created',snapshotId:snapshot.snapshotId});}catch(error){results.push({loadNo:text(folder.loadNo),day,status:'failed',error:text(error?.message||error)});}}}return results;}

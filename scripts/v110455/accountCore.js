// Shared account records. Device navigation, credentials and transport queues stay local.
export const FORMAT='road_ready_account_v1';
export const UI_FIELDS=new Set(['view','activeDay','activeDriverId','sheet','selectedEventId','selectedIds','selectMode','homeGpsStatus','gpsPanelOpen','roadGuardTabRequest','updateState','gpsTrip']);
export const LOG_FIELDS=['eventsByDay','certifyStatus','inspectionByDay','signatureByDay','driverSignature','currentStatus','currentReason','currentLocation','gpsTrip','manualDrivingSession','dutySafetyBackupByDay','formByDay','manualMilesByDay','dailyMilesByDay','milesByDay','drivingMilesByDay','dailyDrivingMilesByDay','driveMilesByDay','dayDataByDate','logbookByDay','dailyLogByDay','dailyLogs','formsByDay','logDays','days'];
export const DAY_FIELDS=LOG_FIELDS.filter(k=>/ByDay$|ByDate$/.test(k)||['certifyStatus','logbookByDay','dailyLogs','dailyLogByDay','formsByDay','logDays','days'].includes(k));
export const TABLE_KEYS={documents_local:'local_id',document_blobs:'local_blob_id',capture_asset_blobs:'local_asset_id',document_links_local:'local_id',inspections_local:'local_id',drivers_local:'id',log_days_local:'local_id'};
export const LOCAL_KEYS=['owner-op-road-ready-operator-profile-v1','owner-op-road-ready-home-terminal-timezone-v1','road-ready-owner-ops-v102'];
export function canonical(v){if(v===undefined)return 'undefined';if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
export const same=(a,b)=>canonical(a)===canonical(b);
const key=(...parts)=>JSON.stringify(parts),valid=k=>!['__proto__','constructor','prototype'].includes(k);
export function recordsFrom(bundle){
 const {state={},business={},tables={},locals={}}=bundle,out={};
 const active=state.activeDriverId||state.teamDrivers?.[0]?.id||'driver_primary';
 const books={...(state.teamLogbooksByDriverId||{}),[active]:Object.fromEntries(LOG_FIELDS.filter(k=>state[k]!==undefined).map(k=>[k,state[k]]))};
 for(const [k,v] of Object.entries(state))if(valid(k)&&!UI_FIELDS.has(k)&&!LOG_FIELDS.includes(k)&&k!=='teamLogbooksByDriverId'&&k!=='coDrivers')out[key('state',k)]=k==='driverProfile'?Object.fromEntries(Object.entries(v||{}).filter(([f])=>f!=='name')):v;
 // A driver's entire day is one conflict unit: signatures cannot drift from its events.
 for(const [id,book] of Object.entries(books)){
  const daily=DAY_FIELDS.filter(f=>book[f]&&typeof book[f]==='object'&&!Array.isArray(book[f])&&Object.keys(book[f]).every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)));
  const days=new Set(daily.flatMap(f=>Object.keys(book[f]||{})));
  for(const day of days){const value={};for(const f of daily)if(book[f]?.[day]!==undefined)value[f]=book[f][day];out[key('day',id,day)]=value;}
  for(const [f,v] of Object.entries(book))if(valid(f)&&!daily.includes(f)&&!UI_FIELDS.has(f))out[key('book',id,f)]=v;
 }
 for(const [bucket,value] of Object.entries(business)){
  if(bucket==='updatedAt')continue;
  if(Array.isArray(value)&&new Set(value.map(r=>r?.id).filter(Boolean)).size<value.filter(r=>r?.id).length){out[key('business-array',bucket)]=value;continue;}
  if(Array.isArray(value)){const used=new Set();value.forEach((r,i)=>{const id=String(r?.id||'row-'+i);if(used.has(id))throw Error('Duplicate record identity in '+bucket+'. Review before synchronizing.');used.add(id);out[key('business',bucket,id)]=r;});out[key('bucket',bucket)]=true;}
  else out[key('business-setting',bucket)]=value;
 }
 for(const [name,primary] of Object.entries(TABLE_KEYS))for(const row of tables[name]||[]){if(row[primary]===undefined)throw Error('Missing document identity.');out[key('table',name,String(row[primary]))]=row;}
 for(const k of LOCAL_KEYS)if(locals[k]!==undefined&&locals[k]!==null)out[key('local',k)]=locals[k];
 return out;
}
export function bundleFrom(records,localState={}){
 const state={},business={},tables=Object.fromEntries(Object.keys(TABLE_KEYS).map(k=>[k,[]])),locals={},books={};
 for(const [k,value] of Object.entries(records)){
  const [kind,a,b]=JSON.parse(k);if(!valid(a))throw Error('Invalid record field.');
  if(kind==='state')state[a]=value;
  else if(kind==='day'){books[a]||={};for(const [f,v] of Object.entries(value)){if(!DAY_FIELDS.includes(f))throw Error('Invalid driver day.');books[a][f]||={};books[a][f][b]=v;}}
  else if(kind==='book'){if(!valid(b))throw Error('Invalid driver field.');(books[a]||={})[b]=value;}
  else if(kind==='bucket')business[a]||=[];
  else if(kind==='business')(business[a]||=[]).push(value);
  else if(kind==='business-setting'||kind==='business-array')business[a]=value;
  else if(kind==='table'&&TABLE_KEYS[a])tables[a].push(value);
  else if(kind==='local'&&LOCAL_KEYS.includes(a))locals[a]=value;
 }
 const active=state.teamDrivers?.some(d=>d.id===localState.activeDriverId)?localState.activeDriverId:state.teamDrivers?.[0]?.id||Object.keys(books)[0]||'driver_primary';
 Object.assign(state,books[active]||{});state.teamLogbooksByDriverId=books;state.activeDriverId=active;
 for(const k of UI_FIELDS)if(k!=='activeDriverId'&&localState[k]!==undefined)state[k]=localState[k];
 state.view||='home';state.sheet=null;state.selectedIds=[];state.selectMode=false;
 if(state.teamDrivers?.length){state.driverProfile={...state.driverProfile,name:state.teamDrivers.find(d=>d.id===active)?.name||state.driverProfile?.name};state.coDrivers=state.teamDrivers.filter(d=>d.id!==active).map(d=>d.name).join(', ');}
 return {state,business,tables,locals};
}
export function mergeRecords(base={},local={},remote={}){
 const records={},conflicts=[];
 for(const k of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
  const b=base[k],l=local[k],r=remote[k];let v;
  if(same(l,r)||same(r,b))v=l;
  else if(same(l,b))v=r;
  else{conflicts.push({key:k,base:b,local:l,remote:r});v=l;}
  if(v!==undefined)records[k]=v;
 }
 return {records,conflicts};
}
export function hasData({state={},business={},tables={}}){
 if(Object.values(business).some(v=>Array.isArray(v)&&v.length)||Object.values(tables).some(v=>v.length))return true;
 const books=[state,...Object.values(state.teamLogbooksByDriverId||{})];
 return books.some(b=>Object.values(b.eventsByDay||{}).some(v=>v?.length)||Object.values(b.signatureByDay||{}).some(v=>v?.signed||v?.signatureDataUrl)||Object.keys(b.formByDay||{}).length>0)||Object.values(state.dotWallet?.documents||{}).some(d=>d.attachmentDataUrl||d.present)||Object.values(state.routeLegsByDay||{}).some(v=>v?.length);
}
export function validatePayload(payload){if(payload?.format!==FORMAT||!payload.records||typeof payload.records!=='object'||Array.isArray(payload.records))throw Error('Unsupported account data.');for(const k of Object.keys(payload.records)){const p=JSON.parse(k);if(!Array.isArray(p)||!p.every(x=>typeof x==='string'&&valid(x)))throw Error('Invalid account record.');}return payload;}

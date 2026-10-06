// Shared account records. Device navigation, credentials and transport queues stay local.
export const FORMAT='road_ready_account_v1';
export const LOCAL_REPORTS=new Set(['_integrityRepairV107','logIntegrityRepairV1051','roadReadyFoundationV105']);
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
 return normalizeRecords(out);
}
export function bundleFrom(records,localState={}){
 const state=Object.fromEntries([...LOCAL_REPORTS].filter(k=>localState[k]!==undefined).map(k=>[k,localState[k]])),business={},tables=Object.fromEntries(Object.keys(TABLE_KEYS).map(k=>[k,[]])),locals={},books={};
 for(const [k,value] of Object.entries(records)){
  const [kind,a,b]=JSON.parse(k);if(!valid(a))throw Error('Invalid record field.');
  if(kind==='state'&&!LOCAL_REPORTS.has(a))state[a]=value;
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
// Normalization bookkeeping is local; it must never block shared user records.
export function checklistText(item){
 if(!item||typeof item!=='object'||Array.isArray(item))return item;
 const keys=Object.keys(item);
 if(keys.length&&keys.every((k,i)=>k===String(i)&&typeof item[k]==='string'&&item[k].length===1))return keys.map(k=>item[k]).join('');
 return item;
}
function cleanGuide(guide){
 if(!guide||typeof guide!=='object')return guide;
 const out={...guide};
 if(Array.isArray(guide.steps))out.steps=guide.steps.map(step=>{
  if(!step||typeof step!=='object')return step;
  const next={...step};if(Array.isArray(next.checklist))next.checklist=next.checklist.map(checklistText);else if(next.checklist==null)delete next.checklist;return next;
 });
 return out;
}
export function repairChecklistState(state){
 if(!state?.loadGuidesById)return state;
 const guides=Object.fromEntries(Object.entries(state.loadGuidesById).map(([id,g])=>[id,cleanGuide(g)]));
 return same(guides,state.loadGuidesById)?state:{...state,loadGuidesById:guides};
}
export function normalizeRecords(records={}){
 const out={};for(const [k,v] of Object.entries(records)){
  const [kind,field]=JSON.parse(k);if(kind==='state'&&LOCAL_REPORTS.has(field))continue;
  out[k]=kind==='state'&&field==='loadGuidesById'&&v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([id,g])=>[id,cleanGuide(g)])):v;
 }return out;
}
const without=(v,fields)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).filter(([k])=>!fields.includes(k))):v;
function semanticValue(k,v){
 const [kind,field]=JSON.parse(k);
 if(kind==='state'&&field==='loadInfo')return without(v,['updatedAt']);
 if(kind==='guide')return without(v,['updatedAt','integrityRepairedAt','logIntegrityRepairedAt']);
 if(kind==='state'&&field==='loadGuidesById'&&v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([id,g])=>[id,semanticValue(key('guide',id),g)]));
 return v;
}
const recordSame=(k,a,b)=>same(semanticValue(k,a),semanticValue(k,b));
export function equivalentRecords(a={},b={}){
 a=normalizeRecords(a);b=normalizeRecords(b);return [...new Set([...Object.keys(a),...Object.keys(b)])].every(k=>recordSame(k,a[k],b[k]));
}
export function mergeRecords(base={},local={},remote={}){
 base=normalizeRecords(base);local=normalizeRecords(local);remote=normalizeRecords(remote);
 const records={},conflicts=[];
 function merge(k,b,l,r,extra={}){
  if(recordSame(k,l,r))return r; // Stable cloud timestamps prevent normalization churn.
  if(recordSame(k,r,b))return l;
  if(recordSame(k,l,b))return r;
  conflicts.push({key:k,base:b,local:l,remote:r,...extra});return l;
 }
 for(const k of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
  const b=base[k],l=local[k],r=remote[k];let v;
  if(k===key('state','loadGuidesById')&&[b,l,r].every(x=>x===undefined||x&&typeof x==='object'&&!Array.isArray(x))){
   v={};for(const id of new Set([...Object.keys(b||{}),...Object.keys(l||{}),...Object.keys(r||{})])){
    const guide=merge(key('guide',id),b?.[id],l?.[id],r?.[id],{recordKey:k,memberId:id});if(guide!==undefined)v[id]=guide;
   }
  }else v=merge(k,b,l,r);
  if(v!==undefined)records[k]=v;
 }
 return {records,conflicts};
}
export function resolveConflict(records,c,side){
 const value=c[side];
 if(c.recordKey){const group={...(records[c.recordKey]||{})};if(value===undefined)delete group[c.memberId];else group[c.memberId]=value;records[c.recordKey]=group;}
 else if(value===undefined)delete records[c.key];else records[c.key]=value;
}
export function hasData({state={},business={},tables={}}){
 if(Object.values(business).some(v=>Array.isArray(v)&&v.length)||Object.values(tables).some(v=>v.length))return true;
 const books=[state,...Object.values(state.teamLogbooksByDriverId||{})];
 return books.some(b=>Object.values(b.eventsByDay||{}).some(v=>v?.length)||Object.values(b.signatureByDay||{}).some(v=>v?.signed||v?.signatureDataUrl)||Object.keys(b.formByDay||{}).length>0)||Object.values(state.dotWallet?.documents||{}).some(d=>d.attachmentDataUrl||d.present)||Object.values(state.routeLegsByDay||{}).some(v=>v?.length);
}
export function validatePayload(payload){if(payload?.format!==FORMAT||!payload.records||typeof payload.records!=='object'||Array.isArray(payload.records))throw Error('Unsupported account data.');for(const k of Object.keys(payload.records)){const p=JSON.parse(k);if(!Array.isArray(p)||!p.every(x=>typeof x==='string'&&valid(x)))throw Error('Invalid account record.');}return payload;}

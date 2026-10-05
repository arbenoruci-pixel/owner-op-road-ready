// Read models retain source identities. Repairs patch the original, never a review copy.
export const canonical=value=>JSON.stringify(sort(value));
function sort(value){if(Array.isArray(value))return value.map(sort);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])]));return value;}
export const same=(a,b)=>canonical(a)===canonical(b);
const secret=/^(?:.*(?:password|access_token|refresh_token|authorization|api_key|apikey|credential|secret).*)$/i;
export function visible(value){
 if(value===undefined)return null;
 if(typeof Blob!=='undefined'&&value instanceof Blob)return {fileBytes:value.size,mimeType:value.type,originalInBackup:true};
 if(value instanceof ArrayBuffer||ArrayBuffer.isView(value))return {fileBytes:value.byteLength,originalInBackup:true};
 if(typeof value==='string'&&/^data:[^,]*;base64,/.test(value))return {embeddedFile:true,originalInBackup:true,encodedLength:value.length};
 if(Array.isArray(value))return value.map(visible);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!secret.test(k)&&!['__proto__','constructor','prototype'].includes(k)).map(([k,v])=>[k,visible(v)]));
 return value;
}
const editable={
 business_loads:['loadNo','broker','origin','destination','pickup','delivery','pickupDate','deliveryDate','gross','notes','status','documentWorkflowStage','bolNo','poNumber','pickupNumber','deliveryNumber','trailerId'],
 business_documents:['type','loadNo','date','documentDate','title','notes','broker','origin','destination','total','gross','bolNo','podSigned','stopSequence'],
 business_expenses:['date','amount','total','category','merchant','notes','loadNo'],
 business_fuel:['date','gallons','amount','total','state','merchant','notes','loadNo'],
 business_maintenance:['date','amount','total','type','vendor','notes','vehicle'],
 business_settlements:['date','amount','gross','net','notes','loadNo'],
 documents:['load_no','loadNo','type','document_type','document_date','title','expires_on','status','stopSequence','stop_sequence','extracted','classification'],
 routes:['loadNo','shippingDocs','fromCity','fromState','toCity','toState','pickupDay','deliveryDay','pickupDate','deliveryDate','status','notes'],
 wallet:['title','expiresOn','issuedOn','documentNumber','notes'],
};
export function allowedFields(record){return record?.origin==='device'&&!record.locator?.fragment&&!record.locator?.duplicate?(editable[record.kind]||[]):[];}
export function validatePatch(record,patch,unset=[]){
 if(!patch||Array.isArray(patch)||typeof patch!=='object'||!Array.isArray(unset))throw Error('Invalid correction.');
 const fields=allowedFields(record),keys=[...Object.keys(patch),...unset];
 if(!keys.length||keys.some(k=>!fields.includes(k))||new Set(keys).size!==keys.length)throw Error('This field must be edited in its original app workflow.');
 const raw=JSON.stringify(patch);if(raw.length>200000||/data:[^,]*;base64,|"(?:__proto__|constructor|prototype)"/.test(raw))throw Error('Original files cannot be replaced by a record correction.');
 for(const [key,value] of Object.entries(patch))if(value!==null&&typeof value==='object'&&!['extracted','classification'].includes(key))throw Error('Invalid field value.');
 return true;
}
export function patchValue(value,patch,unset=[]){const next={...value,...patch};for(const key of unset)delete next[key];return next;}
const loadOf=v=>String(v?.loadNo||v?.load_no||v?.shippingDocs||v?.extracted?.loadNo||'');
const dayOf=v=>String(v?.log_date||v?.document_date||v?.date||v?.pickupDate||'').slice(0,10);
export function idOf(v){return v?.id||v?.local_id||v?.local_asset_id||v?.client_document_id||v?.local_blob_id||v?.client_mutation_id||v?.source_id||v?.key;}
export function projectRecords({state={},business={},tables={},localRows=[]}){
 const out=[],used=new Map();
 function add(key,kind,data,locator={},extra={}){
  const clean=visible(data),serialized=JSON.stringify(clean);
  if(serialized.length>400000){
   const parts=typeof clean==='string'?Array.from({length:Math.ceil(clean.length/100000)},(_,i)=>[String(i),clean.slice(i*100000,(i+1)*100000)]):Object.entries(clean);
   for(const [field,part] of parts)add(key+'/part/'+field,kind,part,{...locator,fragment:true},extra);return;
  }
  if(used.has(key)){
   const first=used.get(key);first.locator={...first.locator,duplicate:true,duplicateOf:key};
   locator={...locator,duplicate:true,duplicateOf:key};let occurrence=2;
   while(used.has(key+'/duplicate/'+occurrence))occurrence++;
   key+='/duplicate/'+occurrence;
  }
  const record={record_key:key,kind,origin:'device',locator,data:clean,load_no:loadOf(data),day:dayOf(data),driver_id:'',...extra};used.set(key,record);out.push(record);
 }
 for(const [bucket,value] of Object.entries(business)){
  if(Array.isArray(value))value.forEach((r,i)=>add('business/'+bucket+'/'+(idOf(r)||'row-'+i),'business_'+bucket,r,{store:'business',bucket,id:String(idOf(r)||''),index:i}));
  else add('business-setting/'+bucket,'settings',value,{store:'business-setting',key:bucket});
 }
 const active=String(state.activeDriverId||state.teamDrivers?.[0]?.id||'driver_primary'),books={...Object.fromEntries((state.teamDrivers||[]).filter(d=>d.id).map(d=>[d.id,{}])),...(state.teamLogbooksByDriverId||{}),[active]:state};
 for(const [driverId,book] of Object.entries(books)){
  add('driver/'+driverId,'drivers',state.teamDrivers?.find(r=>r.id===driverId)||{id:driverId,name:book.driverProfile?.name||''},{},{driver_id:driverId});
  const days=new Set(['eventsByDay','formByDay','signatureByDay','inspectionByDay','certifyStatus'].flatMap(field=>Object.keys(book[field]||{})));
  for(const day of days){
   const events=book.eventsByDay?.[day]||[];
   add('day/'+driverId+'/'+day,'logbook_days',{day,driverId,events:events.length,certifyStatus:book.certifyStatus?.[day]||'',signature:book.signatureByDay?.[day]||null,inspection:book.inspectionByDay?.[day]||null,form:book.formByDay?.[day]||null},{},{driver_id:driverId,day});
   events.forEach((event,i)=>add('event/'+driverId+'/'+day+'/'+(event.id||i),'duty_events',event,{store:'state-event',driverId,day,id:event.id||'',index:i},{driver_id:driverId,day}));
   for(const [field,kind] of [['formByDay','forms'],['signatureByDay','signatures'],['inspectionByDay','inspections']])if(book[field]?.[day])add(kind+'/'+driverId+'/'+day,kind,book[field][day],{store:'state-day',driverId,field,day},{driver_id:driverId,day});
  }
  if(driverId!==active)for(const [field,value] of Object.entries(book))if(!['eventsByDay','formByDay','signatureByDay','inspectionByDay','certifyStatus'].includes(field))add('driver-setting/'+driverId+'/'+field,'saved_records',value,{},{driver_id:driverId});
 }
 for(const [day,rows] of Object.entries(state.routeLegsByDay||{}))if(Array.isArray(rows))rows.forEach((r,i)=>add('route/'+day+'/'+(r.id||i),'routes',r,{store:'state-route',day,id:r.id||'',index:i},{day}));
 for(const [key,value] of Object.entries(state.dotWallet?.documents||{}))add('wallet/'+key,'wallet',value,{store:'wallet',key});
 const handled=new Set(['eventsByDay','formByDay','signatureByDay','inspectionByDay','certifyStatus','teamLogbooksByDriverId','teamDrivers','routeLegsByDay','dotWallet']);
 for(const [key,value] of Object.entries(state))if(!handled.has(key)&&!secret.test(key))add('state/'+key,'saved_records',value,{store:'state-field',key});
 if(state.dotWallet)add('wallet/settings','settings',Object.fromEntries(Object.entries(state.dotWallet).filter(([k])=>k!=='documents')),{});
 for(const [table,rows] of Object.entries(tables))for(let i=0;i<rows.length;i++){
  const primary={app_snapshots:'key',sync_meta:'key',drivers_local:'id',documents_local:'local_id',log_days_local:'local_id',duty_events_local:'local_id',document_links_local:'local_id',inspections_local:'local_id',document_blobs:'local_blob_id',capture_asset_blobs:'local_asset_id',mutation_queue:'client_mutation_id',id_maps:'source_id'};
  const row=rows[i],id=String(row[primary[table]]??idOf(row)??i);
  if(table==='sync_meta'&&/(auth|session|token|record-sync|cloud-mirror)/i.test(id))continue;
  const kind=table==='documents_local'?'documents':table==='document_blobs'?'document_files':table==='capture_asset_blobs'?'capture_assets':table==='app_snapshots'?'recovery_snapshots':'recovery_history';
  if(table==='app_snapshots'){add('db/'+table+'/'+id,kind,{key:row.key,updated_at:row.updated_at,stateKeys:Object.keys(row.state||{}),fullCopyInBackup:true},{store:'db',table,id});continue;}
  add('db/'+table+'/'+id,kind,row,{store:'db',table,id});
 }
 for(const {key,value} of localRows)if(!/(auth|session|token|password|secret|cloud-|record-sync)/i.test(key)){let parsed;try{parsed=JSON.parse(value);}catch{parsed=value;}add('local/'+key,'local_settings',parsed,{store:'local',key});}
 return out;
}
export function sourceRecord(bundle,record){
 const l=record.locator||{};
 const unique=rows=>{if(rows.length>1)throw Error('Conflict: multiple saved records share this identity. Review them separately.');return rows[0];};
 if(l.store==='business')return unique((bundle.business?.[l.bucket]||[]).filter(r=>String(idOf(r)||'')===l.id&&l.id));
 if(l.store==='db'&&l.table==='documents_local')return bundle.tables.documents_local?.find(r=>String(r.local_id)===l.id);
 if(l.store==='state-route')return unique((bundle.state.routeLegsByDay?.[l.day]||[]).filter(r=>String(r.id||'')===l.id&&l.id));
 if(l.store==='wallet')return bundle.state.dotWallet?.documents?.[l.key];
 return undefined;
}
export function prepareCorrection(bundle,record,change){
 validatePatch(record,change.patch,change.unset||[]);const raw=sourceRecord(bundle,record);
 if(!raw)throw Error('The original record is unavailable or has no stable identity.');
 const current=visible(raw),after=patchValue(change.before_data,change.patch,change.unset||[]);
 if(same(current,after))return {alreadyApplied:true,raw};
 if(!same(current,change.before_data))throw Error('Conflict: this record changed on the device. Both versions are retained.');
 return {alreadyApplied:false,raw,next:patchValue(raw,change.patch,change.unset||[])};
}

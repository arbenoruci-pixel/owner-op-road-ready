import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {buildLargeBackup,inspectLargeBackup} from './largeBackupV110431.js';
import {ChunkedZip,readStoredZip,inspectBlob,sha256} from './chunkedZipV110431.js';
import {verifyDeviceSafetyArchive} from '../../../../lib/local-db/safetyArchive.js';
import {selectRange,day,assertWindow,list,object} from './transferCore.js';
import {hashBlob,hashValue} from './transferHash.js';
const STATE_KEY='owner-op-road-ready-state-v1';
const KIND='owner_op_road_ready_transfer';
export async function readRows(db){const rows={};for(const t of db.tables)if(!/^(mutation_queue|account_receive_staging)$/.test(t.name))rows[t.name]=await t.toArray();return rows;}
export function rowDatabase(rows){return {tables:Object.keys(rows).map(name=>({name,toCollection:()=>({offset:at=>({limit:n=>({toArray:async()=>rows[name].slice(at,at+n)})})})})),table:name=>({toArray:async()=>rows[name]||[]})};}
export async function buildRangeArchive({state,businessStore,from,to,db=getOwnerOpDb(),appVersion='',onProgress=()=>{},signal}={}){
 assertWindow(from,to);if(!db)throw Error('Device storage is unavailable.');onProgress('Reading selected records…');
 const selected=selectRange(state,businessStore,await readRows(db),from,to);
 const counts=Object.fromEntries(Object.entries(selected.rows).map(([k,v])=>[k,v.length]));
 selected.rows.app_snapshots=[{key:STATE_KEY,state:selected.state}];
 selected.state={...selected.state,transferWindow:{from,to}};
 const result=await buildLargeBackup({state:selected.state,businessStore:selected.businessStore,db:rowDatabase(selected.rows),localRows:[],inventory:{logDays:Object.keys(selected.state.eventsByDay||{}).length,documentBlobRows:list(selected.rows.document_blobs).length},appVersion,onProgress,signal});
 const files=await readStoredZip(result.file),zip=new ChunkedZip(),fileHashes=[];
 for(const [path,e]of files){if(path==='Road-Ready-Backup.roadready.json')continue;onProgress('Checking '+path+'…');const sha=await hashBlob(e.blob,{signal});fileHashes.push({path,bytes:e.size,sha256:sha});zip.add(path,e.blob,await inspectBlob(e.blob,{signal}));}
 const payload={...result.archive.payload,transferMetadata:{kind:KIND,version:1,window:{from,to},hosContext:selected.hosContext,driver:state.teamDrivers||[state.driverProfile||{}],timezone:state.homeTerminalTimeZone||'America/Chicago',counts,fileHashes}};
 const archive={...result.archive,payload,payloadSha256:await sha256(new TextEncoder().encode(JSON.stringify(payload)))};
 await zip.text('Road-Ready-Backup.roadready.json',JSON.stringify(archive),{signal});
 await zip.text('Transfer-Manifest.json',JSON.stringify({kind:KIND,version:1,payloadSha256:archive.payloadSha256,window:{from,to},counts,fileHashes},null,2),{signal});
 return {...result,archive,file:zip.file(`road-ready-${from}-to-${to}.zip`)};
}
async function decode(value,resolve){
 if(value instanceof Blob||value instanceof ArrayBuffer||ArrayBuffer.isView(value))return value;
 if(value?.__roadReadyZipFile){if(!resolve)throw Error('This JSON index requires its original ZIP. Choose the ZIP directly.');return resolve(value);}
 if(value?.__roadReadyJsonString)return JSON.stringify(await decode(value.__roadReadyJsonString,resolve));
 if(value?.__roadReadyBinary){const raw=atob(value.base64||''),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(bytes.length!==value.size||value.sha256&&await sha256(bytes)!==value.sha256)throw Error('A saved original is damaged.');return value.__roadReadyBinary==='ArrayBuffer'?bytes.buffer:new Blob([bytes],{type:value.mimeType||'application/octet-stream'});}
 if(Array.isArray(value)){const rows=[];for(const r of value)rows.push(await decode(r,resolve));return rows;}
 if(object(value)){const out={};for(const [k,v]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Invalid backup field.');out[k]=await decode(v,resolve);}return out;}return value;
}
function legacyState(p){if(p.kind==='owner_op_road_ready_day_backup'&&day(p.sourceDay)&&Array.isArray(p.dayData?.events)){const d=p.sourceDay,b=p.dayData,out={homeTerminalTimeZone:p.homeTerminalTimeZone,eventsByDay:{[d]:b.events}};for(const [field,key]of [['signatureByDay','signature'],['inspectionByDay','inspection'],['routeLegsByDay','routeLegs'],['routeByDay','route'],['formByDay','form'],['manualMilesByDay','manualMiles'],['certifyStatus','certifyStatus']])if(b[key]!==undefined)out[field]={[d]:b[key]};return out;}if(object(p.state))return p.state;if(object(p.appState))return p.appState;if(object(p.eventsByDay))return p;
 if(day(p.day)&&Array.isArray(p.events))return {activeDriverId:p.driverId||'driver_primary',eventsByDay:{[p.day]:p.events},signatureByDay:p.signature?{[p.day]:p.signature}:{},inspectionByDay:p.inspection?{[p.day]:p.inspection}:{}};
 return null;}
export async function inspectTransfer(file,{onProgress=()=>{}}={}){
 const magic=new Uint8Array(await file.slice(0,4).arrayBuffer());let payload,archive,resolve,files,verified=false,kind='legacy';
 if(magic[0]===80&&magic[1]===75){
 files=await readStoredZip(file);
 if(files.has('Road-Ready-Backup.roadready.json')){const checked=await inspectLargeBackup(file,{onProgress});archive=checked.archive;payload=archive.payload;resolve=checked.resolveZipFile;verified=true;kind=payload.transferMetadata?'date range':'complete backup';
 // A date package has a complete integrity manifest as well as chunk hashes.
 for(const f of payload.transferMetadata?.fileHashes||[]){const e=files.get(f.path);if(!e||e.size!==f.bytes||await hashBlob(e.blob)!==f.sha256)throw Error('Missing or corrupted file: '+f.path);}
 }else if(files.has('RoadReady-Import.json')){
 const e=files.get('RoadReady-Import.json');if(e.size>16*1048576)throw Error('Document index is too large.');const m=JSON.parse(await e.blob.text());if(m.format!=='road-ready-load-library'||m.version!==1)throw Error('Unsupported document ZIP.');
 const docs=[],blobs=[];for(const d of list(m.documents)){const original=files.get(d.path);if(!original||original.size!==d.bytes||await hashBlob(original.blob)!==d.sha256)throw Error('Missing or corrupted file: '+d.name);docs.push({local_id:d.id,client_document_id:d.id,type:d.type,document_type:d.type,load_no:d.loadNo||'',document_date:d.date,original_file_name:d.name,mime_type:d.mime,sha256:d.sha256,sourceManifest:m.id,extracted:{loadNo:d.loadNo||''}});blobs.push({local_blob_id:'blob-'+d.id,client_document_id:d.id,blob:original.blob.slice(0,original.size,d.mime)});}
 payload={state:{eventsByDay:{}},businessStore:{loads:m.loads||[]},dexie:{documents_local:docs,document_blobs:blobs}};verified=true;kind='document ZIP';
 }else throw Error('This ZIP is a reading/audit export or an unsupported archive. Export by Date or Export Everything creates an importable package.');
 }else{
 if(file.size>256*1048576)throw Error('This JSON is too large for safe iPhone import. Export a ZIP from the source device.');
 archive=JSON.parse(await file.text());
 if(archive.kind==='owner_op_road_ready_device_safety_archive'){const v=await verifyDeviceSafetyArchive(archive);if(!v.ok)throw Error('Backup checksum failed: '+v.reason);payload=archive.payload;verified=true;kind='complete backup';}
 else if(archive.kind==='owner_op_road_ready_zip_backup')throw Error('Choose the original ZIP. This index needs the files inside its ZIP.');
 else{const state=legacyState(archive);if(!state)throw Error('This file is an audit report or unsupported format. Choose a Road Ready backup, week, day or date-range package.');payload={state,businessStore:archive.businessStore||{},dexie:{}};kind=({'owner_op_road_ready_cycle_week_export':'one week','owner_op_road_ready_day_backup':'single day','owner_op_road_ready_date_range_backup':'date range','owner_op_road_ready_full_backup':'complete backup'})[archive.kind]||'legacy';}
 }
 const data=await decode(payload,resolve);for(const [table,count]of Object.entries(data.transferMetadata?.counts||{}))if(!Array.isArray(data.dexie?.[table])||data.dexie[table].length!==count)throw Error('Record count mismatch: '+table);if(!object(data.state)||!object(data.state.eventsByDay))throw Error('This package has no Road Ready logbook records.');
 const days=Object.keys(data.state.eventsByDay).filter(day).sort();const window=data.transferMetadata?.window||{from:days[0]||'',to:days.at(-1)||''};
 return {data,kind,verified,window,token:hashValue({payload:archive?.payloadSha256||hashValue(payload),kind}),filename:file.name};
}

import React,{useEffect,useMemo,useRef,useState} from 'react';
import {CURRENT_APP_VERSION} from '../../core/update/appUpdate.js';
import {readBusinessStore,writeBusinessStore} from '../business/businessStore.js';
import {buildFullBackupPayloadV105,fullBackupFileNameV105,fullBackupSummaryV105} from './fullBackupV105.js';
import {buildDeviceSafetyArchive,buildDeviceSafetyInventory} from '../../../../lib/local-db/safetyArchive.js';
import {prepareBackupFile,sharePreparedBackupFile} from '../../../../lib/local-db/backupFile.js';
import {decoratePortableArchiveV110429,inspectPortableArchiveV110429,restorePortableArchiveV110429} from './portableBackupV110429.js';

const DEVICE_SAFETY_META_KEY='owner-op-road-ready-last-device-safety-export-v1';

function formatBytes(bytes=0){
 const value=Number(bytes||0);
 if(value<1024)return value+' B';
 if(value<1024*1024)return (value/1024).toFixed(1)+' KB';
 return (value/1024/1024).toFixed(2)+' MB';
}
function safeDate(value){
 const d=new Date(value||0);if(Number.isNaN(d.getTime()))return '';
 return d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
function everythingFilename(date=new Date()){
 const stamp=date.toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'').replace('T','-');
 return `road-ready-everything-${stamp}.roadready.json`;
}
function saveVerifiedMeta({createdAt,filename,sha256,bytes,inventory}){
 localStorage.setItem(DEVICE_SAFETY_META_KEY,JSON.stringify({createdAt,filename,sha256,bytes,inventory}));
}

export default function BackupLogsScreen({state,onBack,onBuildBackup,onImportBackup}){
 const everythingInputRef=useRef(null),reviewInputRef=useRef(null),preparedRef=useRef(null);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [inventory,setInventory]=useState(null),[prepared,setPrepared]=useState(null),[lastExport,setLastExport]=useState(null);
 const summary=useMemo(()=>fullBackupSummaryV105(state,readBusinessStore()),[state]);

 async function scan(){
  try{setInventory(await buildDeviceSafetyInventory(state,readBusinessStore()));}catch(e){setError(e?.message||'Could not read device data.');}
 }
 useEffect(()=>{scan();},[state]);
 useEffect(()=>()=>{if(prepared?.url)URL.revokeObjectURL(prepared.url);},[prepared]);
 useEffect(()=>{if(prepared)preparedRef.current?.scrollIntoView?.({block:'start',behavior:'smooth'});},[prepared]);

 function setPreparedFile(file,details={}){
  if(prepared?.url)URL.revokeObjectURL(prepared.url);
  setPrepared({...details,file,url:URL.createObjectURL(file)});
  setStatus('File ready. Tap Save / Share and choose Save to Files.');
 }
 async function savePrepared(){
  if(!prepared||busy)return;setBusy(true);setError('');
  try{
   const result=await sharePreparedBackupFile(prepared.file);
   if(result.mode==='shared'){
    if(prepared.verifiedMeta)saveVerifiedMeta(prepared.verifiedMeta);
    setLastExport({filename:prepared.file.name,createdAt:new Date().toISOString()});
    setStatus('Saved/shared: '+prepared.file.name);
   }else if(result.mode==='cancelled')setStatus('Save cancelled. The file is still ready below.');
   else setStatus('Share menu did not open. Use Download file below.');
  }catch(e){setError(e?.message||'Could not share the backup.');}
  finally{setBusy(false);}
 }

 async function exportEverything(){
  if(busy)return;setBusy(true);setError('');setPrepared(null);
  try{
   setStatus('Packing logbooks, loads, documents and original files…');
   const {archive,verification}=await buildDeviceSafetyArchive({
    state,businessStore:readBusinessStore(),appVersion:CURRENT_APP_VERSION,onProgress:setStatus,
   });
   const portable=decoratePortableArchiveV110429(archive);
   const file=prepareBackupFile(portable,everythingFilename(),{compact:true});
   setPreparedFile(file,{kind:'everything',verifiedMeta:{
    createdAt:archive.createdAt,filename:file.name,sha256:verification.sha256,bytes:file.size,inventory:archive.inventory,
   }});
   setInventory(archive.inventory);
   setStatus('Everything is packed. This same file can restore another device or be uploaded to ChatGPT for review.');
  }catch(e){setError(e?.message||'Export Everything failed.');setStatus('Your device data was not changed.');}
  finally{setBusy(false);}
 }

 async function exportReview(){
  if(busy)return;setBusy(true);setError('');setPrepared(null);
  try{
   setStatus('Preparing readable review file…');
   const now=new Date().toISOString();
   const payload=buildFullBackupPayloadV105(state,readBusinessStore(),{appVersion:CURRENT_APP_VERSION,createdAt:now,source:'chatgpt_review_export_v110429'});
   payload.chatgptReview={purpose:'Review Road Ready logbooks, loads, duty events and app records in ChatGPT.',originalDocumentsIncluded:false,tip:'Use Export Everything when original document files or device migration are needed.'};
   setPreparedFile(prepareBackupFile(payload,fullBackupFileNameV105()),{kind:'review'});
  }catch(e){setError(e?.message||'Review export failed.');}
  finally{setBusy(false);}
 }

 async function importEverything(file){
  if(!file||busy)return;setBusy(true);setError('');setPrepared(null);
  try{
   setStatus('Checking complete Road Ready backup…');
   const archive=JSON.parse(await file.text());
   const checked=await inspectPortableArchiveV110429(archive);
   const inv=checked.inventory||{};
   const message=[
    'IMPORT EVERYTHING FROM THIS ROAD READY FILE?',
    '',
    `${inv.logDays||0} log days · ${inv.events||0} duty events`,
    `${inv.documentBlobRows||0} original document files · ${inv.businessLoads||0} loads`,
    '',
    'This will replace Road Ready data on this device. Cancel now if you want to export the current device first.'
   ].join('\n');
   if(typeof window!=='undefined'&&!window.confirm(message)){setStatus('Import cancelled. Nothing changed.');return;}
   const restored=await restorePortableArchiveV110429(archive,{onProgress:setStatus});
   writeBusinessStore(restored.businessStore||{});
   if(onImportBackup){
    await onImportBackup({
     kind:'owner_op_road_ready_full_backup',schemaVersion:2,state:restored.state,businessStore:restored.businessStore,
     summary:fullBackupSummaryV105(restored.state||{},restored.businessStore||{}),
    },{filename:file.name,summary:checked.inventory||{},schemaVersion:Number(archive.schemaVersion||1),portable:true});
   }
   saveVerifiedMeta({createdAt:archive.createdAt,filename:file.name,sha256:checked.verification.sha256,bytes:file.size,inventory:archive.inventory});
   setStatus('Import complete. Reloading Road Ready with the restored device data…');
   setTimeout(()=>window.location.reload(),700);
  }catch(e){setError(e?.message||'Import Everything failed.');setStatus('Current device data was left in place unless the verified restore had already started.');}
  finally{if(everythingInputRef.current)everythingInputRef.current.value='';setBusy(false);}
 }

 return <div className="backup-screen">
  <header className="backup-head"><button type="button" onClick={onBack}>‹</button><div><span>Move / Review</span><b>Export & Import Everything</b></div><span/></header>
  <main className="backup-body">
   {status?<div className="backup-toast" role="status" aria-live="polite">{status}</div>:null}
   {error?<div className="backup-toast" role="alert">{error}</div>:null}

   {prepared?<section className="backup-info-card ready" ref={preparedRef} tabIndex={-1} aria-label="File ready">
    <b>File ready</b><p style={{overflowWrap:'anywhere'}}>{prepared.file.name}</p><span>{formatBytes(prepared.file.size)}</span>
    <button type="button" className="backup-primary" onClick={savePrepared} disabled={busy}>Save / Share</button>
    <a className="backup-secondary" style={{display:'flex',alignItems:'center',justifyContent:'center',textDecoration:'none',marginTop:10}} href={prepared.url} download={prepared.file.name}>Download file</a>
   </section>:null}

   <section className="backup-status-card">
    <span className="backup-eyebrow">Portable Road Ready file</span>
    <b>Move the whole app to another phone or iPad</b>
    <p>One verified file includes logbooks, duty events, signatures, inspections, loads, business records, saved app state, BOL/POD/Rate Con records and original document files stored on this device.</p>
    {inventory?<div className="backup-mini-grid">
     <div><strong>{inventory.logDays||0}</strong><span>log days</span></div>
     <div><strong>{inventory.events||0}</strong><span>duty events</span></div>
     <div><strong>{inventory.businessLoads||0}</strong><span>loads</span></div>
     <div><strong>{inventory.documentBlobRows||0}</strong><span>original files</span></div>
    </div>:<p>Reading device inventory…</p>}
   </section>

   <section className="backup-actions-card">
    <b>Export Everything</b>
    <p>Use this for a new device, disaster recovery, or upload the same file to ChatGPT. A readable review index is included near the top of the file; original documents stay inside the verified backup.</p>
    <button type="button" className="backup-primary" onClick={exportEverything} disabled={busy}>Export Everything</button>
   </section>

   <section className="backup-actions-card">
    <b>Import Everything</b>
    <p>Choose an Export Everything file from Files on a new iPhone or iPad. Road Ready verifies the checksum before restoring the complete local database.</p>
    <button type="button" className="backup-primary" onClick={()=>everythingInputRef.current?.click()} disabled={busy}>Import Everything</button>
    <input ref={everythingInputRef} type="file" accept=".roadready,.json,application/json" hidden onChange={e=>importEverything(e.target.files?.[0])}/>
   </section>

   <section className="backup-actions-card">
    <b>ChatGPT review — smaller file</b>
    <p>For routine logbook review, this smaller readable JSON contains all logbook/app records without embedding original document binaries. Use Export Everything when you also want the document files.</p>
    <button type="button" className="backup-secondary" onClick={exportReview} disabled={busy}>Export for ChatGPT Review</button>
   </section>

   <section className="backup-info-card">
    <b>What to do when changing devices</b>
    <p>On the old device: Export Everything → Save to Files/iCloud. On the new device: open Road Ready → Import Everything → choose that file. You can also attach that same file in ChatGPT and ask for a logbook, load, or document review.</p>
   </section>

   {lastExport?<section className="backup-info-card ready"><b>Last export</b><p>{lastExport.filename}</p><span>{safeDate(lastExport.createdAt)}</span></section>:null}
  </main>
 </div>;
}

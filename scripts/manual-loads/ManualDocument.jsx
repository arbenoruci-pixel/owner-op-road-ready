'use client';
import React,{useRef,useState} from 'react';
import AttachmentIntake from '../scan/AttachmentIntakeV110427.jsx';
import {localDateKey} from '../business/businessStore.js';
import {buildVaultDocumentV105} from '../documents/documentFoundationV105.js';
import {saveScannedDocumentQuotaSafeV10963} from '../scan/quotaSafeScanStorageV10963.js';
import {persistCaptureAssetsV106} from '../scan/captureAssetStoreV106.js';
import {attachmentCaptureMetadata} from '../scan/attachmentCaptureV110427.js';
import {backendDocumentTypeV1040,truckDocumentTypeMetaV1040} from '../scan/truckDocumentCatalogV1040.js';
import {createAnalysisProjection} from '../../../../packages/smart-reader-core/src/analysisProjection.js';
import {assertManualOriginal,exactLoad,loadKey} from './manualLoadCore.js';
import {persistManualStore,readBusinessStore} from './manualLoadRuntime.js';
import {originalState,recordedPodReview,routeStops} from './folderReview.js';
const labels={rate_confirmation:'Ratecon',bol:'Pickup BOL',pod:'POD',fuel_receipt:'Fuel receipt',other:'Other document'};
export default function ManualDocument({target,type,onClose,onSaved,state}){
 const [day,setDay]=useState(localDateKey()),[signed,setSigned]=useState(false),[ready,setReady]=useState(false),[saved,setSaved]=useState(false),[notice,setNotice]=useState('');
 const [pendingSignature,setPendingSignature]=useState(false),[drop,setDrop]=useState('');
 const stops=routeStops(target).filter(stop=>!stop.pickup);
 const busy=useRef(false),pending=useRef(null);
 async function save(file,ignoredType,scanMeta={}){
  if(busy.current)throw Error('This file is still saving.');busy.current=true;
  try{
   const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
   const before=readBusinessStore(),context={id:target.id,loadNo:target.loadNo,type,day,signed,pendingSignature,sha256};assertManualOriginal(before,context);
   const fields={type,title:labels[type]+' · Load '+target.loadNo,loadNo:target.loadNo,canonicalLoadNo:target.loadNo,date:day,documentDate:day,linkToLogbook:false,loadAssignmentStatusV11037:'driver_selected',...(type==='pod'?{podSigned:signed,signatureSource:signed?'driver_checked_receiver_signature':'driver_marked_for_review',stopSequence:Number(drop)||0}:{})};
   fields.readerAnalysisV1=createAnalysisProjection({selectedType:type,selectedLoadNo:target.loadNo,assignment:'driver_selected',source:{fileName:file.name||''}});
   const {captureAssets,...capture}=attachmentCaptureMetadata(scanMeta);
   const stored=pending.current?.sha256===sha256?pending.current.stored:await saveScannedDocumentQuotaSafeV10963({file,type:backendDocumentTypeV1040(type),title:fields.title,metadata:{...capture,loadNo:target.loadNo,relationType:type,linkToLogbook:false},extracted:fields,classification:{selectedType:type,method:'driver_manual_folder',confidence:0}});
   pending.current={sha256,stored};
   if(captureAssets.length){const result=await persistCaptureAssetsV106({clientDocumentId:stored.localDocument?.client_document_id||'',assets:captureAssets,captureManifest:capture.captureManifest||null,scannerVersion:capture.scannerVersion});stored.capture=result;if(result.status!=='stored')setNotice('The finished document is saved. Keep your original camera photos; some scan source photos could not be stored.');}
   if(stored.warning)setNotice(stored.warning);
   const fresh=readBusinessStore(),current=exactLoad(fresh,target.id,target.loadNo);
   if(type==='pod' && (current.notes||'')!==(target.storedNote??target.notes??''))throw Error('The load note changed. Reopen the folder and check this POD before saving.');
   if((fresh.documents||[]).some(d=>d.sha256===sha256))throw Error('This original was saved while you were working. Open it from Documents.');
   const record=buildVaultDocumentV105({stored,type:truckDocumentTypeMetaV1040(type),fields,analysis:{fields,method:'driver_manual_folder'},match:{matched:true,loadNo:target.loadNo,canonicalLoadId:target.id,broker:target.broker||''},selectedLoadNo:target.loadNo,documentDate:day,userConfirmed:true,linkToLogbook:false});
   if(loadKey(record.canonicalLoadNo)!==loadKey(target.loadNo)||record.status!=='verified')throw Error('The document could not be linked to this load. It has not been marked saved.');
   Object.assign(record,{sha256,evidenceOnlyV110413:true,attachmentSource:'driver_manual_folder',linkToLogbook:false,linkDay:'',linkedEventId:'',...(type==='pod'?{podSigned:signed,stopSequence:Number(drop)||0,driverReceiverReview:recordedPodReview({...target,...current,notes:current.notes||target.notes,stops:current.stops?.length?current.stops:target.stops},{sha256},signed,drop)}:{})});
   record.localBlobConfirmed=stored.storage?.localBlob===true;
   if(stored.cloud?.status==='synced' && stored.cloud.storagePath) record.originalUploadPath=stored.cloud.storagePath;
   const identity=stored.localDocument?.client_document_id;
   if((fresh.documents||[]).some(d=>identity&&(d.clientDocumentId===identity||d.client_document_id===identity)))throw Error('This original already has a saved folder. Its existing assignment was kept.');
   persistManualStore({...fresh,documents:[record,...(fresh.documents||[])],updatedAt:Date.now()});setSaved(record);onSaved?.(record);
  }finally{busy.current=false;}
 }
 if(saved)return <section className="rr-manual" aria-label="Document saved">
  <h2>{labels[type]} saved</h2><p>Load {target.loadNo}</p>
  <p>{originalState(saved)}</p>{type==='pod'?<p>{saved.podSigned?'Receiver signature checked':'Receiver signature needs review'}</p>:null}
  <p>Broker and factoring · Nothing sent by this capture.</p>
  {notice?<p role="status">{notice}</p>:null}<button onClick={onClose}>Back to load folder</button>
 </section>;
 return <section className="rr-manual" aria-label="Add document manually"><h2>{labels[type]} · {target.loadNo}</h2>{!ready?<>
  <label>Document date<input type="date" value={day} onChange={e=>setDay(e.target.value)}/></label>
  {type==='pod'?<><label className="rr-manual-check"><input type="checkbox" checked={signed} onChange={e=>{setSigned(e.target.checked);setPendingSignature(false);}}/>I checked that the receiver signed this delivery document.</label>
   <label className="rr-manual-check"><input type="checkbox" checked={pendingSignature} onChange={e=>{setPendingSignature(e.target.checked);setSigned(false);}}/>Signature missing or unclear · save for review</label>
   {stops.length>1?<label>Delivery stop<select value={drop} onChange={e=>setDrop(e.target.value)}><option value="">Choose a stop</option>{stops.map(s=><option key={s.sequence} value={s.sequence}>{s.sequence} · {s.name}</option>)}</select></label>:null}</>:null}
  <div className="rr-manual-actions"><button onClick={onClose}>Cancel</button><button disabled={!day||type==='pod'&&(!signed&&!pendingSignature||stops.length>1&&!drop)} onClick={()=>setReady(true)}>Choose photo or PDF</button></div>
 </>:<AttachmentIntake documentLabel={labels[type]} loadNo={target.loadNo} onReady={save} onClose={onClose}/>}</section>;
}

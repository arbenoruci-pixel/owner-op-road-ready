'use client';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {BUSINESS_STORE_KEY,BUSINESS_STORE_EVENT} from '../business/businessStore.js';
import {CATALOG,clone,text,list,idOf,loadOf,kindOf,day,validateFacts,makeBookEntry,documentFacts,possibleFuelDuplicate,sourceHashes,assertSourceHash} from './evidenceCoreV110413.js';
import {readOwnerOpsStoreV102} from './ownerOpsStoreV102.js';
import {readTransferOriginal} from './transferStorageV110412.js';
import {digest} from './transferCoreV110412.js';

function currentStore(storage) {
  if(window.__OWNER_OP_BUSINESS_STORE_VOLATILE_V10963__)throw new Error('Device storage is full. Free space before saving.');
  const before=storage.getItem(BUSINESS_STORE_KEY);
  let store;try{store=before?JSON.parse(before):{};}catch{throw new Error('Saved business records could not be read.');}
  if(!store||typeof store!=='object'||Array.isArray(store))throw new Error('Saved business records could not be read.');
  return {before,store};
}
const locked=run=>navigator.locks?.request?navigator.locks.request('road-ready-document-transfer',run):run();
function announce(){window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT));window.dispatchEvent(new Event('road-ready-repair-applied'));}
export function applyFactsToDocument(doc,kind,fields,source='driver_review',components=[]) {
  const before={loadNo:loadOf(doc),kind:kindOf(doc),fields:documentFacts(doc)};
  const next={...doc,evidenceOnlyV110413:true,type:kind,document_type:kind,load_no:fields.loadNo||'',loadNo:fields.loadNo||'',canonicalLoadNo:fields.loadNo||'',document_date:fields.date||'',documentDate:fields.date||'',date:fields.date||'',updated_at:new Date().toISOString(),reviewStatus:'verified'};
  next.extracted={...doc.extracted,...fields,type:kind,loadNo:fields.loadNo||'',canonicalLoadNo:fields.loadNo||'',date:fields.date||'',documentDate:fields.date||'',loadAssignmentStatusV11037:fields.loadNo?'driver_selected':'unassigned',evidenceFactsV1:{version:1,reviewedAt:next.updated_at,source,sourceSha256:doc.sha256||'',fields:clone(fields),components:clone(components)}};
  next.auditTrail=[...list(doc.auditTrail),{at:next.updated_at,action:'evidence_review',source,before,after:{loadNo:fields.loadNo||'',kind,fields}}].slice(-30);
  if(before.loadNo!==fields.loadNo||day(before.fields.date)!==day(fields.date)){
    for(const key of ['linkedEventId','linkEventId','eventId','duty_event_chain_id','log_day_id','archiveLink','archiveEventDay','archiveEventDays'])delete next[key];
    next.linkToLogbook=false;next.linkDay='';
    for(const key of ['linkEventId','linkedEventId','eventId','dutyEventId','linkDay','logDate'])delete next.extracted[key];
    next.extracted.linkToLogbook=false;
    if(next.metadata){next.metadata={...next.metadata};for(const key of ['eventId','eventChainId','event_chain_id','linkEventId','linkedEventId','logDate'])delete next.metadata[key];}
  }
  return next;
}
export function mirrorFacts(store,doc) {
  const rows=list(store.documents),key=idOf(doc),index=rows.findIndex(d=>idOf(d)===key||d.localDocumentId===doc.local_id||d.id===doc.local_id);
  const previous=index<0?{}:rows[index];
  const mirror={...previous,id:previous.id||doc.local_id,localDocumentId:doc.local_id,clientDocumentId:doc.client_document_id,type:doc.type,document_type:doc.type,loadNo:doc.load_no,canonicalLoadNo:doc.load_no,documentDate:doc.document_date,date:doc.document_date,title:doc.title,fileName:doc.original_file_name,mimeType:doc.mime_type,sha256:doc.sha256,fileSizeBytes:doc.file_size_bytes,extracted:doc.extracted,reviewStatus:doc.reviewStatus||'needs_review',updatedAt:Date.now(),createdAt:previous.createdAt||Date.now()};
  // Remove stale snake-case mirrors as well; they otherwise win in folder reconciliation.
  Object.assign(mirror,{load_no:doc.load_no,document_date:doc.document_date,canonicalLoadId:doc.load_no?`load_${doc.load_no}`:''});
  mirror.evidenceOnlyV110413=true;
  if(doc.linkToLogbook===false){mirror.linkToLogbook=false;mirror.linkDay='';mirror.linkedEventId='';}
  if(index<0)rows.push(mirror);else rows[index]=mirror;
  store.documents=rows;
}
export async function saveReviewedFacts(doc,kind,input,{book=false}={}) {
  const fields=validateFacts(kind,input),db=getOwnerOpDb();if(!db)throw new Error('Device storage is unavailable.');
  const original=await readTransferOriginal(doc);if(!original?.size)throw new Error('Open or restore the original before confirming its evidence.');
  const sourceHash=await digest(await original.arrayBuffer());assertSourceHash(doc,sourceHash);
  return locked(async()=>{
    const storage=window.localStorage,{before,store}=currentStore(storage);let written=null,result;
    try{
      await db.transaction('rw',db.documents_local,async()=>{
        const matches=await db.documents_local.where('client_document_id').equals(doc.client_document_id||idOf(doc)).toArray();
        if(matches.length!==1)throw new Error('The saved original could not be identified uniquely. Reopen the document.');
        const current=matches[0];
        assertSourceHash(current,sourceHash);
        if(JSON.stringify(sourceHashes(current))!==JSON.stringify(sourceHashes(doc)))throw new Error('The original changed. Reopen it before reviewing.');
        if(text(current.extracted?.evidenceFactsV1?.reviewedAt)!==text(doc.extracted?.evidenceFactsV1?.reviewedAt))throw new Error('These details were changed on this device. Reopen the document.');
        // A metadata review of a packet keeps its already-reviewed page components.
        // Reassigning the packet requires a fresh component review instead.
        const components=kind===kindOf(current)&&fields.loadNo===loadOf(current)?list(current.extracted?.evidenceFactsV1?.components):[];
        const next=applyFactsToDocument({...current,sha256:sourceHash,file_size_bytes:original.size},kind,fields,'driver_review',components);
        if(book){
          if(list(current.extracted?.transactions).length>1)throw new Error('This is a statement. Import its individual transactions through the statement workflow.');
          const {bucket,row}=makeBookEntry(next,fields),ids=[idOf(current),current.local_id];
          const duplicates=['fuel','expenses','maintenance'].flatMap(b=>list(store[b]).filter(r=>ids.includes(r.sourceDocumentId||r.documentId||r.clientDocumentId)||row.sourceDocumentHash&&r.sourceDocumentHash===row.sourceDocumentHash).map(r=>({bucket:b,row:r})));
          if(!duplicates.length&&bucket==='fuel'&&[...list(store.fuel),...list(readOwnerOpsStoreV102().fuelImports)].some(r=>possibleFuelDuplicate(row,r)))throw new Error('This purchase may already exist in Fuel or an imported fuel statement. Save the source details and reconcile the existing transaction before adding another entry.');
          if(duplicates.length){
            const old=duplicates[0];
            if(duplicates.length!==1||old.bucket!==bucket||old.row.evidenceVersion!==1)throw new Error('This source already has a book entry. Review the existing entry in Expenses or Fuel.');
            const prior=documentFacts(current);
            const expected=makeBookEntry(current,prior).row;
            if(Object.keys(expected).filter(k=>!['id','reviewedAt'].includes(k)).some(k=>JSON.stringify(old.row[k])!==JSON.stringify(expected[k])))throw new Error('The book entry was edited separately. Review that entry before changing it here.');
            store[bucket]=list(store[bucket]).map(r=>r.id===old.row.id?{...r,...row,id:r.id,updatedAt:Date.now()}:r);
          }else(store[bucket]||=[]).push({...row,createdAt:Date.now(),updatedAt:Date.now()});
        }
        mirrorFacts(store,next);await db.documents_local.put(next);
        if(storage.getItem(BUSINESS_STORE_KEY)!==before)throw new Error('Records changed while saving. Try again.');
        written=JSON.stringify({...store,updatedAt:Date.now()});storage.setItem(BUSINESS_STORE_KEY,written);result=next;
      });
    }catch(error){if(written!==null&&storage.getItem(BUSINESS_STORE_KEY)===written){if(before===null)storage.removeItem(BUSINESS_STORE_KEY);else storage.setItem(BUSINESS_STORE_KEY,before);}throw error;}
    announce();return result;
  });
}
export async function addExpectedLoad(input) {
  const fields=validateFacts('rate_confirmation',input);
  if(!fields.loadNo||!day(fields.pickupDate))throw new Error('Enter the broker load number and pickup / service date.');
  return locked(async()=>{
    const {before,store}=currentStore(localStorage);
    if(list(store.loads).some(l=>loadOf(l)===fields.loadNo))throw new Error('This load already exists. Open its checklist.');
    (store.loads||=[]).push({id:`expected-${crypto.randomUUID()}`,loadNo:fields.loadNo,broker:fields.merchant||'',origin:fields.origin||'',destination:fields.destination||'',pickupDate:fields.pickupDate,deliveryDate:fields.deliveryDate||'',documentTransferDays:[fields.pickupDate],documentWorkflowStage:input.stage==='tonu'?'tonu':'booked',status:'archived',active:false,source:'expected_document_load',createdAt:Date.now(),updatedAt:Date.now()});
    if(localStorage.getItem(BUSINESS_STORE_KEY)!==before)throw new Error('Records changed. Try again.');
    localStorage.setItem(BUSINESS_STORE_KEY,JSON.stringify({...store,updatedAt:Date.now()}));announce();
  });
}
export async function addExpectation(input) {
  if(!CATALOG[input.kind]||!text(input.label))throw new Error('Enter a document name and type.');
  if(!day(input.date))throw new Error('Choose the date this document is expected.');
  const fields=validateFacts(input.kind,{loadNo:input.loadNo||''});
  if(!['load','ifta','tax','audit'].includes(input.area||'load'))throw new Error('Choose a checklist area.');
  return locked(async()=>{
    const {before,store}=currentStore(localStorage);
    (store.evidenceExpectations||=[]).push({id:`expectation-${crypto.randomUUID()}`,label:text(input.label).slice(0,150),kind:input.kind,loadNo:fields.loadNo,date:input.date,area:input.area||'load'});
    if(localStorage.getItem(BUSINESS_STORE_KEY)!==before)throw new Error('Records changed. Try again.');
    localStorage.setItem(BUSINESS_STORE_KEY,JSON.stringify({...store,updatedAt:Date.now()}));announce();
  });
}

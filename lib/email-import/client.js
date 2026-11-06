'use client';
import {cloudSession} from '../owner-op-cloud/client.js';
import {readBusinessStore,writeBusinessStore} from '../../source/src/modules/business/businessStore.js';

async function request(action,{payload,signal}={}){
  const session=await cloudSession();
  if(!session?.access_token)throw Error('Sign in to Road Ready to connect email.');
  const response=await fetch('/api/email-import/'+action,{method:payload?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store',signal});
  if(!response.ok){const value=await response.json().catch(()=>({}));throw Error(value.error||'Email is unavailable. Please try again.');}
  // Ignore a result received after the Road Ready account changed.
  const current=await cloudSession();if(current?.user?.id!==session.user.id)throw Error('Your Road Ready account changed. Open email again.');
  return response;
}
export async function emailApi(action,payload,signal){return (await request(action,{payload,signal})).json();}
export async function readEmailDocument(item,connectionId,signal){
  const r=await request('read',{payload:{messageId:item.messageId,attachmentId:item.attachmentId,connectionId},signal});
  if(r.headers.get('content-type')?.includes('application/json'))return r.json();
  const provenance=JSON.parse(decodeURIComponent(r.headers.get('x-email-provenance')||'')),receipt=r.headers.get('x-email-receipt');
  if(!receipt||!/^[a-f0-9]{64}$/.test(provenance.sha256))throw Error('This document could not be verified. Try again.');
  const previous=(readBusinessStore().documents||[]).find(d=>d.emailImport?.accountId===provenance.accountId&&d.emailImport?.sha256===provenance.sha256);
  if(previous){await r.body?.cancel();return {duplicate:true,documentId:previous.id};}
  const blob=await r.blob();
  const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(actual!==provenance.sha256)throw Error('The download was interrupted. Please try again.');
  return {file:new File([blob],item.name,{type:blob.type}),provenance:{...provenance,receipt,subject:item.subject,sender:item.sender,receivedAt:item.receivedAt}};
}
export async function acknowledgeEmailDocument(record,signal){
  if(!record?.emailImport?.receipt||!record.id)return;
  await emailApi('ack',{receipt:record.emailImport.receipt,documentId:record.id},signal);
  const store=readBusinessStore(),existing=(store.documents||[]).find(d=>d.id===record.id);
  if(existing?.emailImport?.receipt===record.emailImport.receipt&&!existing.emailImport.acknowledged)writeBusinessStore({...store,documents:store.documents.map(d=>d.id===record.id?{...d,emailImport:{...d.emailImport,acknowledged:true}}:d)});
}
export async function retryEmailReceipts(signal){
  // This ledger contains only documents whose existing Save workflow completed.
  // Reopening the inbox also repairs a failed/offline acknowledgement.
  for(const record of (readBusinessStore().documents||[]).filter(d=>d.emailImport?.receipt&&!d.emailImport.acknowledged).slice(-40)){
    if(signal?.aborted)return;
    try{await acknowledgeEmailDocument(record,signal);}catch{return;}
  }
}

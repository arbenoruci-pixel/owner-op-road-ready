'use client';
import {cloudClient,cloudSession} from './client.js';
import {bounded} from './mirrorCoreV110450.js';
import {readFile} from './accountFilesV110455.js';
import {findAccountOriginal,readAccountDocumentOriginal} from './documentOriginalCore.js';
import {getOwnerOpDb} from '../local-db/dexie.js';
export function readCurrentAccountOriginal(clientId){
 return readAccountDocumentOriginal(clientId,{
  getSession:()=>bounded(cloudSession(),10000),
  getWorkspace:async uid=>{
   const cached=(await getOwnerOpDb()?.sync_meta.get('account-sync-v110455:base'))?.value;
   const records=cached?.uid===uid?(cached.remoteRecords||cached.records):null;
   if(records&&findAccountOriginal(records,clientId))return {user_id:uid,payload:{records}};
   try {
    const {data,error,status}=await bounded(cloudClient().from('road_ready_account_workspaces').select('user_id,payload').eq('user_id',uid).maybeSingle(),20000);
    if(error){if(status>=500||status===0)error.transientOriginalLookup=true;throw error;}return data;
   } catch(cause) {
    if(!cause?.transientOriginalLookup&&cause?.message!=='Cloud connection timed out. Pending changes remain saved on this device.')throw cause;
    const error=new Error('Could not retrieve this account’s original. Check your connection and try again.',{cause});
    error.code='ACCOUNT_ORIGINAL_UNAVAILABLE';throw error;
   }
  },
  readFile:(file,{uid,check})=>readFile(file,{uid,check,storage:cloudClient().storage.from('owner-op-private')}),
 });
}

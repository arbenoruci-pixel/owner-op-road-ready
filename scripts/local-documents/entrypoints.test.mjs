import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {runAuthorizedFullMigration} from '../../lib/owner-op-cloud/migration.js';
const read=p=>fs.readFileSync(p,'utf8');
test('old full migration and manual archive entry points cannot start network work',async()=>{
 assert.equal((await runAuthorizedFullMigration()).status,'disabled');
 const text=read('lib/owner-op-cloud/cloudMirrorV110450.js'),start=text.indexOf('export function runMirror('),end=text.indexOf('\nfunction canonical(',start);
 let shown;const run=new Function('show',text.slice(start,end).replace('export ','')+';return runMirror;')(v=>{shown=v;});
 assert.equal((await run({force:true})).disabled,true);assert.equal(shown.phase,'disabled');
 assert.ok(text.includes('export async function downloadMirror'));
});
test('retired queue work acknowledges locally and cannot remove an original',async()=>{
 const text=read('lib/sync/clientSync.js'),start=text.indexOf('async function syncDocumentUpload('),end=text.indexOf('\nasync function pushDutyEventBatch',start);
 const run=new Function(text.slice(start,end)+';return syncDocumentUpload;')();assert.deepEqual(await run(),{status:'processed',localOnly:true});
 for(const path of ['source/src/modules/scan/scanStorage.js','source/src/modules/scan/quotaSafeScanStorageV10963.js','lib/documents/saveLocalOriginal.js'])assert.doesNotMatch(read(path),/fetch\(|uploadToSignedUrl|\.delete\(|\.clear\(/);
 const backup=read('lib/owner-op-cloud/client.js');assert.doesNotMatch(backup,/action:\s*['"]upload_document/);assert.match(backup,/action: 'upload_log'/);
});
test('legacy upload routes reject stale clients without accessing Supabase',async()=>{
 for(const name of ['create-upload','commit-upload']){
  const {POST}=await import(`../../app/api/documents/${name}/route.js`);const r=await POST();assert.equal(r.status,409);assert.equal((await r.json()).error,'local_originals_only');
 }
});
test('legacy log backup refuses embedded document originals without rewriting any log data',async()=>{
 const {containsOriginal}=await import('../../lib/documents/localOriginalPolicy.js'),{makeSnapshot,canonical,validDay}=await import('../../lib/owner-op-cloud/core.js'),{buildDayBackupPayload}=await import('../../source/src/core/backup/dayTransfer.js');
 const text=read('lib/owner-op-cloud/client.js'),start=text.indexOf('export async function backupLocalData('),end=text.indexOf('\nexport async function readCloudFile',start),calls=[];
 const state={eventsByDay:{'2026-11-07':[{id:'off',status:'OFF',startMin:0,endMin:1440}]},documentsByDay:{'2026-11-07':[{attachmentDataUrl:'data:application/pdf;base64,b3JpZ2luYWw='}]}};
 const before=structuredClone(state),context={navigator:{onLine:true},hasVerifiedDeviceSafetyBackup:()=>true,cloudSession:async()=>({user:{id:'test'}}),localState:async()=>state,readJournal:()=>({}),saveJournal(){},emitStatus(){},cloudApi:async p=>{calls.push(p);return{};},makeSnapshot,canonical,validDay,buildDayBackupPayload,containsOriginal,sha256:async()=> 'hash'};
 const run=new Function(...Object.keys(context),'let busy=false;'+text.slice(start,end).replace('export ','')+';return backupLocalData;')(...Object.values(context));
 const result=await run();assert.equal(calls.length,0);assert.match(result.errors[0],/original document/);assert.deepEqual(state,before);
 delete state.documentsByDay;await run();assert.equal(calls.length,1);assert.equal(calls[0].action,'upload_log');assert.deepEqual(state.eventsByDay,before.eventsByDay);
});

import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {fixture,at} from '../inspection-signed/fixture.mjs';
import {captureInspection,assertInspectionUnchanged,assertInspectionComplete} from '../../lib/owner-op-cloud/inspectionSnapshot.js';
import {captureInspectionWallet,assertWalletUnchanged,walletFileHash,assertWalletManifest} from '../../lib/owner-op-cloud/inspectionWallet.js';
import {canonical} from '../../lib/owner-op-cloud/core.js';
class FixedDate extends Date{constructor(...args){super(...(args.length?args:[at]));}static now(){return +at;}}
async function setup(options={}){
 const state=fixture();state.dotWallet={documents:{driver_license:{attachmentDataUrl:'data:image/png;base64,iVBORw0KGgo=',attachmentName:'license.png',number:'original'},insurance:{photoDataUrl:'data:application/pdf;base64,JVBERi0xLjQ=',attachmentName:'insurance.pdf'}}};
 const before=structuredClone(state),wallet=captureInspectionWallet(state),expected=await Promise.all(wallet.map(async row=>({...row,sha256:await walletFileHash(row)})));
 const calls=[];let packet,attempt=0,checks=0;
 const query={select:c=>{assert.equal(c,'revision');return query;},eq:()=>query,maybeSingle:async()=>({data:{revision:7}})};
 const context={Date:FixedDate,navigator:{onLine:!options.offline},window:{},canonical,captureInspection:s=>captureInspection(s,at),assertInspectionUnchanged,assertInspectionComplete,captureInspectionWallet,assertWalletUnchanged,walletFileHash,assertWalletManifest,
 cloudSession:async()=>({user:{id:'owner'}}),assertActiveDevice:async()=>({active:!options.revoked,receive:!!options.receive,generation:options.switchDevice&&++checks>2?2:1,sid:'session'}),deviceId:()=> 'device',flushAppSnapshots:async()=>{},bounded:async p=>p,cloudClient:()=>({from:()=>query}),localState:async()=>{throw Error('live phone required');},
 cloudApi:async p=>{calls.push(p);
  if(p.action==='catalog')return {days:[],wallet:options.alreadyUploaded?expected.map(row=>({document_key:row.key,sha256:row.sha256,metadata:row.metadata,revision:2})):[]};
  if(p.action==='upload_document'){if(options.uploadFailure)throw Error('Upload interrupted');if(options.walletChange)state.dotWallet.documents.insurance.photoDataUrl='data:application/pdf;base64,JVBERi0xLjU=';return {revision:1};}
  if(p.action==='create_snapshot_share'){if(options.revisionRace&&attempt++===0)throw Object.assign(Error('Account records changed'),{status:409});packet=p;if(options.logChange)state.eventsByDay['2026-11-04'][0].note='Changed';return {id:'share',token:'capability',log_count:8,document_count:p.wallet_keys.length,captured_at:p.inspection.capturedAt};}
  if(p.action==='inspect')return {items:expected.map(row=>({kind:'wallet',item_key:'wallet:'+row.key,sha256:options.wrongFile?'wrong':row.sha256,metadata:row.metadata}))};
  if(p.action==='revoke_share')return {revoked:true};throw Error('Unexpected operation '+p.action);
 }};
 const code=fs.readFileSync('scripts/inspection-package/client.js','utf8').replace(/^import .*;\n/gm,'').replace('export async function createCurrentInspectionShare','async function createCurrentInspectionShare');
 vm.runInNewContext(code+'\nglobalThis.create=createCurrentInspectionShare;',context);
 return {state,before,calls,packet:()=>packet,create:()=>context.create({getState:()=>state})};
}
test('one package uses current phone originals, all wallet files and exact signed logs without account reconciliation',async()=>{
 const t=await setup(),share=await t.create();assert.equal(share.document_count,2);assert.equal(share.log_count,8);
 assert.deepEqual(Array.from(t.packet().wallet_keys),['driver_license','insurance']);
 assert.equal(t.calls.filter(p=>p.action==='upload_document').length,2);
 assert.ok(t.calls.some(p=>p.action==='inspect'));assert.deepEqual(t.state,t.before);
 assert.ok(!t.calls.some(p=>/sync|save_day|upload_log|commit_account/.test(p.action)));
});
test('unchanged originals are verified and reused without uploading again',async()=>{const t=await setup({alreadyUploaded:true});await t.create();assert.equal(t.calls.filter(p=>p.action==='upload_document').length,0);});
test('offline, revoked or receiving devices, changed wallet and failed uploads never publish a link',async()=>{
 for(const options of [{offline:true},{revoked:true},{receive:true},{switchDevice:true},{walletChange:true},{uploadFailure:true}]){const t=await setup(options);await assert.rejects(t.create());assert.equal(t.packet(),undefined);}
});
test('changed logs or a different immutable wallet file revoke the unpublished link',async()=>{
 for(const options of [{logChange:true},{wrongFile:true}]){const t=await setup(options);await assert.rejects(t.create());assert.equal(t.calls.at(-1).action,'revoke_share');}
});
test('a single background revision race retries with unchanged captured facts',async()=>{const t=await setup({revisionRace:true});await t.create();assert.equal(t.calls.filter(p=>p.action==='create_snapshot_share').length,2);assert.deepEqual(t.state,t.before);});

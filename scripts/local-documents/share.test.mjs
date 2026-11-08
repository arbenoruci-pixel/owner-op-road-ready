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
  if(p.action==='upload_document'){if(options.uploadFailure)throw Object.assign(Error('HTTP 402 storage quota'),{status:402});if(options.walletChange)state.dotWallet.documents.insurance.photoDataUrl='data:application/pdf;base64,JVBERi0xLjU=';return {revision:1};}
  if(p.action==='create_snapshot_share'){if(options.revisionRace&&attempt++===0)throw Object.assign(Error('Account records changed'),{status:409});packet=p;if(options.logChange)state.eventsByDay['2026-11-04'][0].note='Changed';return {id:'share',token:'capability',log_count:8,document_count:p.wallet_keys.length,captured_at:p.inspection.capturedAt};}
  if(p.action==='inspect')return {items:expected.filter(row=>packet.wallet_keys.includes(row.key)).map(row=>({kind:'wallet',item_key:'wallet:'+row.key,sha256:options.wrongFile?'wrong':row.sha256,metadata:row.metadata}))};
  if(p.action==='revoke_share')return {revoked:true};throw Error('Unexpected operation '+p.action);
 }};
 const code=fs.readFileSync('lib/owner-op-cloud/inspectionShare.js','utf8').replace(/^import .*;\n/gm,'').replace('export async function createCurrentInspectionShare','async function createCurrentInspectionShare');
 vm.runInNewContext(code+'\nglobalThis.create=createCurrentInspectionShare;',context);
 return {state,before,calls,packet:()=>packet,create:walletKeys=>context.create({getState:()=>state,walletKeys})};
}
test('only selected current-phone originals upload; unselected documents and signed logbooks are untouched',async()=>{
 for(const selected of [[],['insurance'],['driver_license']]){
  const t=await setup();await t.create(selected);
  assert.deepEqual(t.calls.filter(p=>p.action==='upload_document').map(p=>p.document_key),selected);
  assert.deepEqual(Array.from(t.packet().wallet_keys),selected);assert.deepEqual(t.state,t.before);
 }
});
test('402 when preparing a selected document leaves its local original and every log unchanged',async()=>{
 const t=await setup({uploadFailure:true});await assert.rejects(t.create(['insurance']),/402/);
 assert.equal(t.packet(),undefined);assert.deepEqual(t.state,t.before);assert.equal(t.calls.filter(p=>p.action==='upload_document').length,1);
 assert.ok(!t.calls.some(p=>/delete|remove|revoke|upload_log|save_day/.test(p.action)));
});
test('unknown document selection fails before any file upload',async()=>{
 const t=await setup();await assert.rejects(t.create(['missing']),/unavailable/);assert.equal(t.calls.length,0);assert.deepEqual(t.state,t.before);
});

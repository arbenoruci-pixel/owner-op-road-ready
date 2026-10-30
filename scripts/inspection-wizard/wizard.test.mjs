import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyInspectionRecords} from './sync.js';
import {sameSyncState,retainSyncNavigation} from '../../lib/owner-op-cloud/inspectionSyncState.js';
import {inspectionReadiness,officerEmailLink} from '../../source/src/modules/dot/inspectionReadiness.js';
import {createCertificationRecord} from '../../source/src/modules/logbook/certificationV110.js';
import {captureInspection} from '../../lib/owner-op-cloud/inspectionSnapshot.js';
import {eightDays} from '../../lib/owner-op-cloud/core.js';
import {validInspectionUsdot,saveInspectionUsdot} from './identity.js';

const at=new Date('2026-10-30T16:00:00Z');
export function fixture(){
  const days=eightDays('2026-10-30'),state={activeDriverId:'driver_primary',activeDay:days.at(-1),view:'dot',sheet:null,
    driverProfile:{name:'Test Driver'},driver:{truck:'TEST-228',trailer:'TEST-529'},carrierName:'Test Carrier',carrierDot:'1234567',mainOfficeAddress:'Test office',homeTerminalAddress:'Test terminal',homeTerminalTimeZone:'America/New_York',currentStatus:'ON',currentReason:'DOT Inspection',currentLocation:{city:'Test City',state:'IL'},currentTrailer:'TEST-529',
    signatureByDay:{},formByDay:{},inspectionByDay:{},routeLegsByDay:{},eventsByDay:Object.fromEntries(days.map((day,i)=>[day,[{id:'event-'+i,status:'OFF',startMin:0,endMin:1440,city:'Test City',state:'IL',note:'Off Duty',source:'manual'}]]))};
  state.eventsByDay[days.at(-1)]=[{id:'today-off',status:'OFF',startMin:0,endMin:600,city:'Test City',state:'IL',source:'manual'},{id:'dot',status:'ON',startMin:600,endMin:601,city:'Test City',state:'IL',note:'DOT Inspection',source:'live_status'}];
  for(const day of days.slice(0,-1))state.signatureByDay[day]=createCertificationRecord(state,day,{driverName:'Test Driver',now:+at});
  return state;
}
test('busy/transient synchronization retries with a fresh pass and returns a verified revision',async()=>{
  const queue=[{busy:true},{transient:true,reason:'Records changed during sync'},{revision:7}],calls=[],messages=[];
  const result=await verifyInspectionRecords(async opts=>{calls.push(opts);return queue.shift();},m=>messages.push(m),{wait:async()=>{}});
  assert.equal(result.revision,7);assert.equal(calls.length,3);assert.ok(calls.every(o=>o.fresh===true&&o.scope==='records'));assert.equal(messages.length,2);
});
test('logs-only sharing proceeds after records receive while originals continue in background',async()=>{
  const response={revision:8,recordsReady:true,handoffPending:true};
  assert.equal((await verifyInspectionRecords(async()=>response)).revision,8);
  await assert.rejects(verifyInspectionRecords(async()=>response,()=>{},{includeDocuments:true}),/receiving saved documents/);
  await assert.rejects(verifyInspectionRecords(async()=>({...response,recordsReady:false})),/receiving saved documents/);
});
test('conflicts, device locks, pause and actual network errors never turn into success',async()=>{
  for(const response of [{conflicts:['day']},{blocked:true},{paused:true},{disabled:true},{offline:true},{signedOut:true},{error:'Device revoked'}]){
    let count=0;await assert.rejects(verifyInspectionRecords(async()=>{count++;return response;}),/could not be verified/);assert.equal(count,1);
  }
});
test('hung verification is bounded; indefinite spinner does not survive the deadline',async()=>{
  await assert.rejects(verifyInspectionRecords(()=>new Promise(()=>{}),()=>{},{timeoutMs:15}),/timed out/);
});
test('navigation is ignored by reconciliation while edits, signatures and driver switches remain guarded',()=>{
  const state=fixture(),navigated={...state,view:'day',activeDay:'2026-10-29',dotPreparationReturn:true,roadGuardTabRequest:{tab:'sign'}};
  assert.equal(sameSyncState(state,navigated),true);
  for(const mutate of [s=>s.eventsByDay['2026-10-29'][0].note='Edited',s=>s.signatureByDay['2026-10-29'].signed=false,s=>s.activeDriverId='other']){
    const changed=structuredClone(state);mutate(changed);assert.equal(sameSyncState(state,changed),false);
  }
  const installed=retainSyncNavigation({...state,carrierName:'Received'},navigated);
  assert.equal(installed.view,'day');assert.equal(installed.activeDay,'2026-10-29');assert.equal(installed.dotPreparationReturn,true);assert.equal(installed.carrierName,'Received');
});
test('readiness covers exactly eight dates without certifying today or changing any records',()=>{
  const state=fixture(),before=structuredClone(state),result=inspectionReadiness(state,at);
  assert.equal(result.days.length,8);assert.equal(result.logsReady,true);assert.equal(result.days.at(-1).today,true);assert.deepEqual(state,before);
  delete state.signatureByDay['2026-10-29'];assert.equal(inspectionReadiness(state,at).logsReady,false);
  const missing=fixture();missing.eventsByDay={};assert.ok(inspectionReadiness(missing,at).days.some(d=>d.gaps.length));
  const changed=fixture();changed.eventsByDay['2026-10-29'][0].note='Changed';assert.equal(inspectionReadiness(changed,at).days.find(d=>d.day==='2026-10-29').signed,false);
});
test('email is a direct mailto of the reviewed snapshot with the correct recipient and link',()=>{
  const share={token:'test-token',expires_at:new Date(Date.now()+3600000).toISOString(),inspection:captureInspection(fixture(),at)};
  const href=officerEmailLink('officer+unit@example.gov',share,'https://test.example');
  const parsed=new URL(href);assert.equal(decodeURIComponent(parsed.pathname),'officer+unit@example.gov');
  assert.match(parsed.searchParams.get('body'),/https:\/\/test.example\/inspection#test-token/);assert.match(parsed.searchParams.get('body'),/Test Driver/);
  assert.equal(officerEmailLink('x@example.gov\nBcc:bad@example.org',share,''),'');
  assert.equal(officerEmailLink('officer@example.gov',{...share,expires_at:'invalid'},''),'');
  assert.equal(officerEmailLink('officer@example.gov',{...share,expires_at:'2020-01-01'},''),'');
});
test('missing USDOT can be explicitly saved without changing historic logs or signatures',()=>{
  const state=fixture();delete state.carrierDot;
  const before=structuredClone(state);
  assert.ok(inspectionReadiness(state,at).missing.includes('USDOT'));
  for(const invalid of ['', '0', 'MC12345', '123-456', '1234567890']){
    assert.equal(validInspectionUsdot(invalid),false);
    assert.throws(()=>saveInspectionUsdot(state,invalid),/digits only/);
  }
  const next=saveInspectionUsdot(state,' 7654321 ');
  assert.equal(next.dotNumber,'7654321');
  assert.deepEqual(state,before);
  assert.equal(next.eventsByDay,state.eventsByDay);
  assert.equal(next.signatureByDay,state.signatureByDay);
  assert.equal(next.formByDay,state.formByDay);
  const restored=JSON.parse(JSON.stringify(next));
  assert.ok(!inspectionReadiness(restored,at).missing.includes('USDOT'));
  assert.equal(captureInspection(restored,at).profile.usdot,'7654321');
  const share={token:'test-token',expires_at:new Date(Date.now()+3600000).toISOString(),inspection:captureInspection(restored,at)};
  assert.match(new URL(officerEmailLink('officer@example.gov',share,'https://test.example')).searchParams.get('body'),/USDOT 7654321/);
});
test('saved ON DUTY DOT activity opens preparation and all old email entry points route through it',()=>{
  const app=fs.readFileSync('source/src/app/App.jsx','utf8'),dot=fs.readFileSync('source/src/modules/dot/DotMode.jsx','utf8');
  assert.ok(app.includes("/\\bDOT Inspection\\b/i.test([reason,...reasons].join(' ')) ? 'dot'"));
  assert.ok(app.includes('Return to DOT preparation'));assert.ok(dot.includes("useState('prepare')"));
  assert.ok(app.includes('onSaveUsdot={value=>setState(s=>saveInspectionUsdot(s,value))}'));
  assert.ok(dot.includes('onSaveUsdot={onSaveUsdot}'));
  assert.ok(dot.includes("function emailOfficer() {setStage('prepare');}"));assert.ok(!dot.includes('window.location.href = mailto'));
  const sync=fs.readFileSync('lib/owner-op-cloud/accountSyncV110455.js','utf8');
  assert.ok(sync.includes('if(active && fresh)'));assert.ok(sync.includes('sameSyncState'));assert.ok(sync.includes('retainSyncNavigation'));
});

// A conflict must remain reviewable inside inspection; choices are still checked
// against the exact retained versions by syncAccount before any write.
test('inspection returns exact conflicts and forwards explicit choices on retry',async()=>{
  const conflicts=[{key:'["state","loadInfo"]',local:{bol:'TEST-BOL-100'},remote:{bol:''}}];
  await assert.rejects(verifyInspectionRecords(async()=>({conflicts})),error=>{assert.equal(error.conflicts,conflicts);return true;});
  const choices={[conflicts[0].key]:'local'};let received;
  const receipt=await verifyInspectionRecords(async options=>{received=options;return {revision:9};},()=>{},{choices});
  assert.equal(received.choices,choices);assert.equal(received.scope,'records');assert.equal(receipt.revision,9);
  await assert.rejects(verifyInspectionRecords(async()=>({conflicts}),()=>{},{choices}),error=>error.conflicts===conflicts);
});

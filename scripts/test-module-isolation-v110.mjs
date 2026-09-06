import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createCertificationRecord, certificationStatusV1032 as status, reconcileCertificationStatusesV1032 as reconcile, upgradeVerifiedLegacyCertifications } from '../source/src/modules/logbook/certificationV110.js';
import { certificationFingerprintV1032 as legacyFingerprint } from '../source/src/modules/logbook/certificationFingerprintV1032.js';
import { runExternalCommand, preserveRecordedDays, LOGBOOK_PROTECTED_KEYS } from '../source/src/modules/logbook/public-api.js';
import { uploadVerified } from '../lib/owner-op-cloud/verifiedStorageV110.js';
import { makeSnapshot, canonical } from '../lib/owner-op-cloud/core.js';
import { buildDayBackupPayload } from '../source/src/core/backup/dayTransfer.js';
let passed = 0;
async function test(name,fn){await fn();passed++;console.log('PASS — '+name);}
const day='2026-07-10';
const base=()=>({activeDay:day,homeTerminalTimeZone:'America/Chicago',driver:{truck:'12',trailer:'53'},driverProfile:{name:'Test Driver'},carrierName:'Test Carrier',mainOfficeAddress:'Test Office',currentTrailer:'53',currentStatus:'OFF',currentLocation:{city:'Chicago',state:'IL'},
 eventsByDay:{[day]:[{id:'a',status:'OFF',startMin:0,endMin:480,city:'Chicago',state:'IL',note:'Off Duty'},{id:'b',status:'ON',startMin:480,endMin:510,city:'Chicago',state:'IL',note:'Pre-trip inspection'},{id:'c',status:'D',startMin:510,endMin:900,city:'Chicago',state:'IL',note:'Driving',shippingDocs:'LOAD-1',manualMiles:200},{id:'d',status:'OFF',startMin:900,endMin:1440,city:'Rochelle',state:'IL',note:'Off Duty'}]},
 inspectionByDay:{[day]:{complete:true,type:'pretrip',checked:['lights','brakes'],completedAt:1000,sourceStartMin:480,sourceEndMin:510,city:'Chicago',state:'IL'}},manualMilesByDay:{[day]:200},
 routeLegsByDay:{[day]:[{id:'leg',kind:'loaded',status:'open',pickupDay:day,pickupMin:510,fromCity:'Chicago',fromState:'IL',toCity:'Rochelle',toState:'IL',shippingDocs:'LOAD-1'}]},formByDay:{[day]:{truck:'12',totalMiles:200}},signatureByDay:{},certifyStatus:{[day]:'Needs signature'},driverSignature:{dataUrl:'data:image/png;base64,dGVzdA==',driverName:'Test Driver'}});
function signed(){const s=base();s.signatureByDay[day]=createCertificationRecord(s,day,{driverName:'Test Driver',now:10000});s.certifyStatus[day]='Certified';return s;}
await test('baseline reproduces trailer-induced legacy invalidation',()=>{const s=base();assert.notEqual(legacyFingerprint(s,day),legacyFingerprint({...s,currentTrailer:'99'},day));});
await test('sign, serialize, reload retains certification',()=>assert.equal(status(JSON.parse(JSON.stringify(signed())),day).status,'Certified'));
await test('truck, trailer, company and global profile changes leave signed history alone',()=>{const s=signed();s.currentTrailer='99';s.driver.truck='NEW';s.driverProfile.name='Next Driver';s.carrierName='New Carrier';assert.equal(status(s,day).status,'Certified');});
await test('later delivery and mission status leave pickup-day certification alone',()=>{const s=signed();Object.assign(s.routeLegsByDay[day][0],{status:'delivered',deliveryDay:'2026-07-12',deliveryMin:300,toCity:'Different'});assert.equal(status(s,day).status,'Certified');});
for(const [name,mutate] of [
 ['time',s=>s.eventsByDay[day][2].startMin++],['location',s=>s.eventsByDay[day][2].city='Other'],['status',s=>s.eventsByDay[day][2].status='ON'],['miles',s=>s.manualMilesByDay[day]++],['inspection',s=>s.inspectionByDay[day].complete=false],['day form',s=>s.formByDay[day].truck='99'],['same-day route',s=>s.routeLegsByDay[day][0].pickupMin++],['shipping reference',s=>s.eventsByDay[day][2].shippingDocs='LOAD-2']])await test(name+' edit requires recertification',()=>{const s=signed();mutate(s);assert.equal(status(s,day).status,'Needs Recertification');});
await test('re-sign preserves the prior attestation and clears stale flags',()=>{const s=signed();s.signatureByDay[day].needsRecertification=true;s.eventsByDay[day][2].manualMiles=210;s.signatureByDay[day]=createCertificationRecord(s,day,{now:20000});assert.equal(status(s,day).status,'Certified');assert.equal(s.signatureByDay[day].certificationHistory[0].signedAt,10000);});
await test('checksum collision cannot hide changed signed content',()=>{const s=signed();s.signatureByDay[day].certifiedContent.miles=1;assert.equal(status(s,day).status,'Needs Recertification');});
await test('legacy upgrade requires a matching existing fingerprint and keeps signature time',()=>{const s=base();s.signatureByDay[day]={signed:true,signedAt:99,certifiedFingerprint:legacyFingerprint(s,day)};s.certifyStatus[day]='Certified';const upgraded=upgradeVerifiedLegacyCertifications(s);assert.equal(upgraded.signatureByDay[day].signedAt,99);assert.ok(upgraded.signatureByDay[day].certificationContext);assert.equal(status(upgraded,day).status,'Certified');});
await test('mismatching legacy log is never automatically re-signed',()=>{const s=base();s.signatureByDay[day]={signed:true,signedAt:99,certifiedFingerprint:'rods-103.2.0-deadbeef'};s.certifyStatus[day]='Needs Recertification';const n=reconcile(upgradeVerifiedLegacyCertifications(s));assert.equal(n.signatureByDay[day].certifiedFingerprint,'rods-103.2.0-deadbeef');assert.equal(n.certifyStatus[day],'Needs Recertification');});
for(const source of ['documents','loads','scanner','wallet'])await test(source+' cannot mutate signed events, certificates, live status or day data',()=>{const s=signed(),before=JSON.stringify(s);const next=runExternalCommand(s,d=>{d.eventsByDay[day][0].city='CHANGED';d.signatureByDay[day].signed=false;d.currentStatus='D';d.routeLegsByDay={};d.dotWallet={documents:{new:{title:'New document'}}};return d;},source,{documentId:'doc-new',day});assert.equal(JSON.stringify(s),before);for(const key of LOGBOOK_PROTECTED_KEYS)assert.deepEqual(next[key],s[key]);assert.equal(next.dotWallet.documents.new.title,'New document');assert.equal(status(next,day).status,'Certified');});
await test('failed integration leaves original state byte-identical',()=>{const s=signed(),before=JSON.stringify(s);assert.throws(()=>runExternalCommand(s,d=>{d.eventsByDay[day]=[];throw Error('Reader failed');},'documents'));assert.equal(JSON.stringify(s),before);});
await test('historical normalization cannot replace existing day buckets',()=>{const s=signed(),p=structuredClone(s);p.eventsByDay[day]=[];p.signatureByDay[day]={signed:false};p.currentStatus='ON';const n=preserveRecordedDays(s,p,'2026-09-06');assert.deepEqual(n.eventsByDay,s.eventsByDay);assert.deepEqual(n.signatureByDay,s.signatureByDay);assert.equal(n.currentStatus,'ON');});
await test('signed cloud snapshots ignore current fleet metadata',()=>{const s=signed();const a=makeSnapshot(s,day,buildDayBackupPayload);s.currentTrailer='NEW';s.driver.truck='NEW';s.carrierName='NEW';const b=makeSnapshot(s,day,buildDayBackupPayload);assert.equal(canonical(a),canonical(b));});
const hash=async bytes=>createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
const blob=new Blob(['%PDF-1.7\nsynthetic fixture'],{type:'application/pdf'}),sha=await hash(await blob.arrayBuffer());
await test('storage uses raw ArrayBuffer and verifies downloaded checksum before commit',async()=>{let uploaded=false;const result=await uploadVerified({upload:async(_p,bytes,options)=>{assert.ok(bytes instanceof ArrayBuffer);assert.equal(options.upsert,false);uploaded=true;return {};},download:async()=>({data:blob})},'test.pdf',blob,'application/pdf',sha,hash);assert.ok(uploaded);assert.equal(result.sizeBytes,blob.size);});
await test('empty local file never calls upload',async()=>{await assert.rejects(()=>uploadVerified({upload:()=>assert.fail('must not upload')},'p',new Blob([]),'application/pdf',sha,hash),/empty/);});
await test('corrupt downloaded bytes are rejected',async()=>{await assert.rejects(()=>uploadVerified({upload:async()=>({}),download:async()=>({data:new Blob(['corrupt'])})},'p',blob,'application/pdf',sha,hash),/integrity/);});
await test('duplicate retry succeeds only for identical cloud bytes',async()=>{const r=await uploadVerified({upload:async()=>({error:{message:'The resource already exists'}}),download:async()=>({data:blob})},'p',blob,'application/pdf',sha,hash);assert.equal(r.sha256,sha);});
await test('genuine upload failure is surfaced',async()=>{await assert.rejects(()=>uploadVerified({upload:async()=>({error:Error('denied')})},'p',blob,'application/pdf',sha,hash),/denied/);});
const app=fs.readFileSync('source/src/app/App.jsx','utf8');
await test('runtime signing and all document adapters are wired through boundaries',()=>{assert.match(app,/MODULE_ISOLATION_V110/);assert.equal((app.match(/runExternalCommand\(current, draft/g)||[]).length,3);assert.match(app,/legacyLoadGuideActionV108\(draft, detail\)/);assert.equal((app.match(/saveAppSnapshot\(APP_STATE_KEY, signedStateV110\)/g)||[]).length,2);assert.match(app,/preserveRecordedDays\(saved, corrected/);assert.doesNotMatch(app,/metadataOnlyReason =/);});
// Exercise the exact generated startup normalizer (without rendering JSX).
await test('actual startup normalize -> sign -> reload is idempotent for recorded days',async()=>{
 const start=app.indexOf('function defaultInitialState()');assert.ok(start>0);
 let prefix=app.slice(0,start).replace(/^import .* from ['"][^'"]+\.jsx['"];?\n/gm,'').replace(/^import React[^\n]+\n/gm,'').replace(/^import .* from ['"][^'"]*(?:clientSync|authBridge)\.js['"];?\n/gm,'');
 // No browser-only work is invoked by this synthetic startup fixture.
 const file='source/src/app/.normalize-v110-test.mjs';
 fs.writeFileSync(file,prefix+'\n'+app.match(/function sorted\(events\) \{[\s\S]*?\n\}/)[0]+'\nexport { normalizeState };\n');
 try{const {normalizeState}=await import(pathToFileURL(process.cwd()+'/'+file));const s=signed();const n=normalizeState(JSON.parse(JSON.stringify(s)));assert.deepEqual(n.eventsByDay[day],s.eventsByDay[day]);assert.deepEqual(n.signatureByDay[day],s.signatureByDay[day]);assert.equal(status(n,day).status,'Certified');const n2=normalizeState(JSON.parse(JSON.stringify(n)));assert.equal(status(n2,day).status,'Certified');assert.deepEqual(n2.eventsByDay[day],s.eventsByDay[day]);}finally{fs.rmSync(file,{force:true});}
});
console.log(`${passed} module isolation/certification/transport checks passed`);

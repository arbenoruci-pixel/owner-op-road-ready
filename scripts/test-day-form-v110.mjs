import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCertificationRecord, certificationStatusV1032 as status } from '../source/src/modules/logbook/certificationV110.js';
import { applyDayFormEdit, readLogbookDayState } from '../source/src/modules/logbook/public-api.js';
import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';
import { makeSnapshot } from '../lib/owner-op-cloud/core.js';
import { buildDayBackupPayload } from '../source/src/core/backup/dayTransfer.js';
const day='2026-07-10';
function signed(){const s={activeDay:day,homeTerminalTimeZone:'America/Chicago',driver:{truck:'12',trailer:'53'},driverProfile:{name:'Test Driver'},carrierName:'Test Carrier',mainOfficeAddress:'Test Office',currentTrailer:'53',eventsByDay:{[day]:[{id:'1',status:'ON',startMin:0,endMin:1440,city:'Chicago',state:'IL',note:'On Duty'}]},signatureByDay:{},certifyStatus:{[day]:'Certified'},driverSignature:{dataUrl:'data:image/png;base64,dGVzdA==',driverName:'Test Driver'},formByDay:{[day]:{truck:'12'}}};s.signatureByDay[day]=createCertificationRecord(s,day,{driverName:'Test Driver',now:10000});return s;}
const test=(name,fn)=>{fn();console.log('PASS — '+name);};
test('historical form edits preserve live fleet and require recertification',()=>{const before=signed();const next=applyDayFormEdit(before,{...before,currentTrailer:'EDITED',driver:{truck:'99'}},{truck:'99',trailer:'EDITED'},day);assert.deepEqual(next.driver,before.driver);assert.equal(next.currentTrailer,before.currentTrailer);assert.equal(readLogbookDayState(next,day).driver.truck,'99');assert.equal(status(next,day).status,'Needs Recertification');});
test('unchanged form save never reopens a signed log',()=>{const before=signed();const next=applyDayFormEdit(before,{...before},{driverName:'Test Driver',truck:'12',trailer:'53'},day);assert.deepEqual(next.formByDay,before.formByDay);assert.equal(status(next,day).status,'Certified');});
test('explicit empty daily truck is visible and checked before signing',()=>{const before=signed(),next=applyDayFormEdit(before,before,{truck:''},day);assert.equal(readLogbookDayState(next,day).driver.truck,'');assert.ok(validateLogForSigning(next,day).some(x=>/vehicle|truck/i.test(x.title+' '+x.detail)));assert.equal(status(next,day).status,'Needs Recertification');});
test('new signature image stays pinned after global signature changes',()=>{const s=signed(),image=s.signatureByDay[day].signatureDataUrl;s.driverSignature.dataUrl='data:image/png;base64,NEW';assert.equal(s.signatureByDay[day].signatureDataUrl,image);assert.equal(status(s,day).status,'Certified');});
test('recertified daily form appears in cloud snapshot',()=>{let s=signed();s=applyDayFormEdit(s,s,{truck:'99'},day);s.signatureByDay[day]=createCertificationRecord(s,day,{now:20000});assert.equal(status(s,day).status,'Certified');assert.equal(makeSnapshot(s,day,buildDayBackupPayload).profileAtBackup.unit,'99');});
test('client directives appear exactly once before imports',()=>{for(const path of ['source/src/app/App.jsx','lib/owner-op-cloud/migration.js']){const source=fs.readFileSync(path,'utf8');assert.match(source,/^'use client';/);assert.equal((source.match(/['"]use client['"]/g)||[]).length,1);}});
console.log('6 daily form and signature-image regressions passed');

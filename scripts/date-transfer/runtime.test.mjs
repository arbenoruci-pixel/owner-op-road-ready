import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getHomeTerminalTimeZone} from '../../source/src/core/time/homeTerminalTime.js';
import {rawCoverageIssues} from '../../source/src/core/compliance/rawRodsChecks.js';
const read=f=>fs.readFileSync(f,'utf8');
assert.equal(read('source/src/modules/backup/BackupLogsScreen.jsx').split('<TransferPanel').length-1,1);
assert(read('source/src/app/App.jsx').includes('onApplyTransfer={next => setState(next)}'));
assert.equal(getHomeTerminalTimeZone({}),'America/Chicago');assert.equal(getHomeTerminalTimeZone({homeTerminalTimeZone:'America/New_York'}),'America/New_York');
// DST and midnight assertions use Intl directly and the app's terminal helpers.
for(const [utc,expected]of [['2026-10-05T04:59:00Z','10/04/2026'],['2026-10-05T05:00:00Z','10/05/2026']])assert.equal(new Intl.DateTimeFormat('en-US',{timeZone:getHomeTerminalTimeZone({}),year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(utc)),expected);
assert(read('scripts/build-v110.mjs').indexOf("'date-transfer/install.mjs'")>read('scripts/build-v110.mjs').indexOf("'hos-rest-review/install.mjs'"));
assert(!read('source/src/modules/backup/transferStorage.js').includes('.clear('));assert(!read('source/src/modules/backup/transferStorage.js').includes('.removeItem('));
console.log('PASS — final materialized UI; terminal Chicago default with configured zones retained; Chicago midnight; additive import and final installer placement');

const evidence={'2026-10-06':[{id:'original-future',status:'D',startMin:10,endMin:20}]},before=JSON.stringify(evidence);const future=rawCoverageIssues(evidence,'2026-10-06',{today:'2026-10-05',nowMinute:60});assert.equal(future.total,0);assert.equal(future.targetEnd,0);assert.equal(future.issues[0].code||future.issues[0].id,'future_day');assert.equal(JSON.stringify(evidence),before);

const {selectRange}=await import('./core.js');const {calculateHosClocks}=await import('../../source/src/core/hos/hosEngine.js');const cycleSource={homeTerminalTimeZone:'America/Chicago',currentStatus:'OFF',eventsByDay:{}};for(let i=1;i<=7;i++)cycleSource.eventsByDay['2026-10-0'+i]=[{id:'on-'+i,status:'ON',startMin:0,endMin:600},{id:'off-'+i,status:'OFF',startMin:600,endMin:1440}];cycleSource.eventsByDay['2026-10-08']=[{id:'rest',status:'OFF',startMin:0,endMin:1440}];const portableCycle=selectRange(cycleSource,{}, {},'2026-10-08','2026-10-08');assert.equal(portableCycle.hosContext.days.length,7);const sourceCycle=calculateHosClocks(cycleSource,new Date('2026-10-08T05:00:00Z')),restoredCycle=calculateHosClocks(portableCycle.state,new Date('2026-10-08T05:00:00Z'));assert.equal(sourceCycle.cycle.usedMinutes,4200);assert.equal(restoredCycle.cycle.usedMinutes,sourceCycle.cycle.usedMinutes);assert.deepEqual(portableCycle.state.eventsByDay,cycleSource.eventsByDay);console.log('PASS — date package retains supporting 70/8 duty evidence and exact original event times');

const {inspectPageIdentity}=await import('../../source/src/modules/scan/documentIdentityV110334.js');
const compactBol='BOL#82004117\nSHIP FROM: Example Door Company\nSHIP TO: Example Millwork\nCARRIER: Example Carrier LLC\nSHIPPING DATE: 09/09/2026\nPO NUMBER: 12345678, 87654321';
assert.equal(inspectPageIdentity(compactBol)?.typeId,'bol');
assert.equal(inspectPageIdentity('BOL#82004117'),null,'A reference alone does not establish document type');
assert.equal(inspectPageIdentity('RATE CONFIRMATION\nTOTAL CARRIER PAY $2400\n'+compactBol)?.typeId,'rate_confirmation');
console.log('PASS — compact BOL heading requires shipping parties; RateCon reference retains RateCon identity');

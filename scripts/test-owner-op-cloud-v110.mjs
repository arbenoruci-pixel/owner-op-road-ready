import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {canonical,eightDays,validDay,homeDay,minuteAt,dailyModel,makeSnapshot,walletMetadata} from '../lib/owner-op-cloud/core.js';
let passed=0;function test(name,fn){fn();passed++;console.log('PASS — '+name);}
test('exactly eight dates including current day',()=>assert.deepEqual(eightDays('2026-09-06'),['2026-08-30','2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06']));
test('leap day and invalid dates',()=>{assert.equal(eightDays('2024-03-01')[6],'2024-02-29');assert.equal(validDay('2026-02-30'),false);});
test('home terminal date is independent of device timezone',()=>{const d=new Date('2026-09-06T04:30:00Z');assert.equal(homeDay(d,'America/New_York'),'2026-09-06');assert.equal(homeDay(d,'America/Chicago'),'2026-09-05');});
test('home-terminal minute conversion',()=>assert.equal(minuteAt('2026-09-06T12:30:00Z','America/New_York'),510));
test('stable payload hash input ignores object key order',()=>assert.equal(canonical({b:2,a:{d:4,c:3}}),canonical({a:{c:3,d:4},b:2})));
test('missing log remains missing and never becomes off duty',()=>{const m=dailyModel({dayData:{events:[]}});assert.equal(m.totals.OFF,0);assert.equal(m.rows.length,0);assert.ok(m.warnings.length);});
test('gaps remain visible in officer view',()=>{const m=dailyModel({dayData:{events:[{status:'D',startMin:60,endMin:120}]}});assert.equal(m.totals.D,60);assert.ok(m.warnings.some(x=>x.includes('00:00')));});
test('overlaps are flagged',()=>{const m=dailyModel({dayData:{events:[{status:'D',startMin:0,endMin:120},{status:'ON',startMin:60,endMin:180}]}});assert.ok(m.warnings.some(x=>x.includes('Overlapping')));});
test('current-day display stops at snapshot minute',()=>{const m=dailyModel({dayData:{events:[{status:'D',startMin:0,endMin:1440}]}},100);assert.equal(m.totals.D,100);});
test('expense totals are never interpreted as miles',()=>assert.equal(dailyModel({dayData:{events:[],form:{total:125}}}).miles,null));
test('explicit zero miles is preserved',()=>assert.equal(dailyModel({dayData:{events:[],form:{distance:0}}}).miles,0));
test('wallet database metadata excludes file bytes',()=>{const m=walletMetadata({number:'A1',attachmentDataUrl:'data:image/png;base64,abc',notes:'x'});assert.equal(m.number,'A1');assert.equal(m.attachmentDataUrl,undefined);});
test('backup preserves additional day-specific fields',()=>{const state={eventsByDay:{'2026-09-05':[{id:'x'}]},customByDay:{'2026-09-05':{original:true}}};const before=JSON.stringify(state);const p=makeSnapshot(state,'2026-09-05',()=>({createdAt:'transient',dayData:{events:[]}}));assert.deepEqual(p.rawDayBuckets.customByDay,{original:true});assert.equal(p.createdAt,undefined);assert.equal(JSON.stringify(state),before);});
if(fs.existsSync('source/src/modules/owneros/historicalLogbookV10981.js')){const r=spawnSync(process.execPath,['--check','source/src/modules/owneros/historicalLogbookV10981.js'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);passed++;console.log('PASS — generated historical renderer parses after mileage patch');}
console.log(`${passed} Owner Operator cloud checks passed`);

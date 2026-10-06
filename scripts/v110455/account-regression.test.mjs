import assert from 'node:assert/strict';
import fs from 'node:fs';
import {recordsFrom,mergeRecords,bundleFrom,equivalentRecords,resolveConflict,repairChecklistState} from './accountCore.js';
const key=x=>JSON.stringify(['state',x]),guide=(n,t)=>({id:n,loadNo:n,rate:1200,updatedAt:t,logIntegrityRepairedAt:t,steps:[{id:'pickup',checklist:['Pickup # 7HR',{label:'Seal checked',done:true}]}]});
const old={loadInfo:{loadNo:'A',pickupDate:'2026-10-05',updatedAt:10},loadGuidesById:{a:guide('A',10),b:guide('B',10)},_integrityRepairV107:{repairedAt:10},logIntegrityRepairV1051:{repairedAt:10},roadReadyFoundationV105:{repairedAt:10}};
const current=structuredClone(old);current.loadInfo.updatedAt=20;current.loadGuidesById.a.logIntegrityRepairedAt=20;current.loadGuidesById.a.steps[0].checklist[0]={...'Pickup # 7HR'};for(const k of ['_integrityRepairV107','logIntegrityRepairV1051','roadReadyFoundationV105'])current[k].repairedAt=20;
const legacy=s=>Object.fromEntries(Object.entries(s).map(([k,v])=>[key(k),v])),cloud=legacy(old),phone=legacy(current);
const merge=mergeRecords({},phone,cloud);assert.deepEqual(merge.conflicts,[]);assert.equal(equivalentRecords(phone,cloud),true);assert.equal(merge.records[key('loadInfo')].updatedAt,10);assert.equal(merge.records[key('loadGuidesById')].a.steps[0].checklist[0],'Pickup # 7HR');assert.ok(!merge.records[key('_integrityRepairV107')]);assert.equal(bundleFrom(merge.records,current).state._integrityRepairV107.repairedAt,20);
const local=structuredClone(cloud),remote=structuredClone(cloud);local[key('loadGuidesById')].a.rate=1300;remote[key('loadGuidesById')].b.rate=1400;
const separate=mergeRecords(cloud,local,remote);assert.equal(separate.conflicts.length,0);assert.equal(separate.records[key('loadGuidesById')].a.rate,1300);assert.equal(separate.records[key('loadGuidesById')].b.rate,1400);
remote[key('loadGuidesById')].a.rate=1500;const conflict=mergeRecords(cloud,local,remote);assert.equal(conflict.conflicts.length,1);assert.equal(conflict.conflicts[0].memberId,'a');resolveConflict(conflict.records,conflict.conflicts[0],'remote');assert.equal(conflict.records[key('loadGuidesById')].a.rate,1500);assert.equal(conflict.records[key('loadGuidesById')].b.rate,1400);
const different=structuredClone(current);different.loadInfo.pickupDate='2026-10-06';assert.equal(mergeRecords({},legacy(different),cloud).conflicts.length,1,'Genuine dates must stay protected');
const deleted=structuredClone(cloud);delete deleted[key('loadGuidesById')].a;assert.ok(!mergeRecords(cloud,deleted,cloud).records[key('loadGuidesById')].a);assert.equal(mergeRecords(cloud,deleted,remote).conflicts.length,1);
const repaired=repairChecklistState(current);assert.equal(repaired.loadGuidesById.a.steps[0].checklist[0],'Pickup # 7HR');assert.deepEqual(repaired.loadGuidesById.a.steps[0].checklist[1],{label:'Seal checked',done:true});assert.equal(repairChecklistState(repaired),repaired);
if(process.env.INCIDENT_DIR){
 const saved=JSON.parse(fs.readFileSync(process.env.INCIDENT_DIR+'/rr-sync-incident-state.json'))[0].state;
 const indexed=Object.fromEntries(JSON.parse(fs.readFileSync(process.env.INCIDENT_DIR+'/rr-sync-incident-phone.json')).map(r=>[r.record_key.split('/')[1],r.data]));
 const check=mergeRecords({},legacy(indexed),legacy(saved));assert.deepEqual(check.conflicts,[],'The five customer-reported conflicts must disappear');assert.equal(Object.keys(check.records[key('loadGuidesById')]).length,9);assert.equal(equivalentRecords(legacy(indexed),legacy(saved)),true);console.log('PASS exact incident replay: 5 false conflicts resolved, all 9 guides preserved');
}
console.log('PASS stable account comparison: repair metadata, checklist recovery, per-load merge, real conflicts, deletes, retained local reports');

const {repairRoadReadyStateV107}=await import('../../source/src/core/integrity/logbookIntegrityV107.js');
const cloned=repairRoadReadyStateV107({loadGuidesById:{x:{...guide('X',1),status:'closed'}},eventsByDay:{},inspectionByDay:{'2026-10-05':{complete:true,source:'auto_on_duty',sourceEventId:'orphan'}}});
assert.equal(cloned.loadGuidesById.x.steps[0].checklist[0],'Pickup # 7HR','Legacy normalizer must preserve strings when performing a repair');
console.log('PASS runtime normalization keeps checklist text intact');

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {acknowledgeDays,omitNewEmptyDays,pendingDaysKey,queueDayChanges,reviewDriverDays} from '../../lib/owner-op-cloud/logbookHandoffDays.js';
import {recordsFrom} from '../../lib/owner-op-cloud/accountCoreV110455.js';

const date = '2020-01-03', uid = 'test-account';
const state = events => ({eventsByDay:{[date]:events}});
const empty = state([]);
const morning = state([{id:'pretrip',status:'ON',startMin:400,endMin:420}]);
const full = state([...morning.eventsByDay[date],{id:'drive',status:'D',startMin:420,endMin:701}]);
const records = state => recordsFrom({state});
const day = Object.keys(records(full)).find(k=>JSON.parse(k)[0]==='day');
const dbFixture = () => {
  const memory = new Map();
  return {transaction: async (...args)=>args.at(-1)(),sync_meta:{
    get: async k=>structuredClone(memory.get(k)),
    put: async row=>memory.set(row.key,structuredClone(row)),delete: async k=>memory.delete(k),
  }};
};

test('receiving an empty, incomplete, missing or equal-length divergent day preserves exact local events for review',()=>{
  const local=records(full);
  for(const other of [empty,morning,state(full.eventsByDay[date].map(e=>({...e,endMin:e.endMin+1}))),{}]){
    const remote=records(other);
    const result=reviewDriverDays({records:remote,conflicts:[]},local,remote,{},true);
    assert.deepEqual(result.records[day],local[day]);
    assert.deepEqual(result.conflicts.find(c=>c.key===day),{key:day,local:local[day],remote:remote[day]});
  }
  const remote=records(full);
  assert.equal(reviewDriverDays({records:remote,conflicts:[]},{},remote,{},true).conflicts.length,0);
});

test('a blank client cannot publish over a recorded server day without review',()=>{
  const local=records(empty),remote=records(full);
  assert.equal(reviewDriverDays({records:local,conflicts:[]},local,remote,{},false).conflicts[0].key,day);
});
test('persisted pending days survive restart, unconfirmed upload and concurrent edits, then clear on exact confirmation',async()=>{
  const db=dbFixture(),key=pendingDaysKey(uid);
  await queueDayChanges(db,uid,empty,morning,'t1');
  const first=(await db.sync_meta.get(key)).value;
  await acknowledgeDays(db,uid,first,records(morning),records(morning),records(empty),null);
  assert.deepEqual((await db.sync_meta.get(key)).value,first);
  await queueDayChanges(db,uid,morning,full,'t2');
  await acknowledgeDays(db,uid,first,records(morning),records(morning),records(morning),null);
  const latest=(await db.sync_meta.get(key)).value;
  assert.deepEqual(latest[day].day,records(full)[day]);
  await acknowledgeDays(db,uid,latest,records(full),records(full),records(full),null);
  assert.equal(await db.sync_meta.get(key),undefined);
});

test('a newly initialized empty date stays local even across repeated syncs',()=>{
  const local=records(empty);
  const merged=reviewDriverDays({records:{},conflicts:[]},local,{}, {},false);
  assert.deepEqual(merged.records[day],local[day]);
  assert.ok(!(day in omitNewEmptyDays(merged.records,{},{})));
  assert.deepEqual(omitNewEmptyDays(records(full),{}, {})[day],records(full)[day]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecordIndexer} from './recordIndexer.js';
function fixture(options={}){
 let now=0,serial=0,available=true,syncs=0,polls=0;const timers=new Map();
 const queue=createRecordIndexer({sync:async()=>{syncs++;return {};},corrections:async()=>{polls++;},available:()=>available,
  setTimer:(fn,delay)=>{timers.set(++serial,{fn,at:now+delay});return serial;},clearTimer:id=>timers.delete(id),...options});
 async function advance(ms){const target=now+ms;for(let i=0;i<100;i++){const first=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!first)break;now=first[1].at;timers.delete(first[0]);first[1].fn();for(let j=0;j<8;j++)await Promise.resolve();}now=target;}
 return {queue,advance,timers,available:v=>{available=v;},counts:()=>({syncs,polls})};
}
test('idle correction polling never repeatedly indexes unchanged records',async()=>{
 const f=fixture();f.queue.start();await f.advance(15000);assert.equal(f.counts().syncs,1);
 await f.advance(270000);assert.deepEqual(f.counts(),{syncs:1,polls:3});f.queue.stop();
});
test('durable saves coalesce and another save during the pass stays pending',async()=>{
 let release;const f=fixture({sync:()=>new Promise(resolve=>{release=resolve;})});
 f.queue.start();await f.advance(15000);f.queue.saved();f.queue.saved();release({});await f.advance(0);
 assert.equal(f.queue.inspect().acknowledged,1);assert.equal(f.queue.inspect().dirty,3);
 await f.advance(30000);assert.equal(f.queue.inspect().running,true);release({});await f.advance(0);assert.equal(f.queue.inspect().acknowledged,3);f.queue.stop();
});
test('hidden/offline work waits for wake and never acknowledges unsent changes',async()=>{
 const f=fixture();f.available(false);f.queue.start();await f.advance(300000);assert.equal(f.counts().syncs,0);
 assert.equal(f.queue.inspect().acknowledged,0);f.available(true);f.queue.wake();await f.advance(0);assert.equal(f.counts().syncs,1);f.queue.stop();
});
test('temporary failures back off and exhaust a bounded index attempt budget',async()=>{
 let attempts=0;const f=fixture({sync:async()=>{attempts++;return {error:'timeout'};}});f.queue.start();
 await f.advance(900000);assert.equal(attempts,6);assert.equal(f.queue.inspect().blocked,true);assert.equal(f.queue.inspect().acknowledged,0);assert.equal(f.counts().polls,0);assert.equal(f.timers.size,0);
 f.queue.wake({retry:true});await f.advance(0);assert.equal(attempts,7);f.queue.stop();
});
test('disabled indexing stops correction polls until an explicit retry rechecks settings',async()=>{
 let enabled=false,attempts=0;const f=fixture({sync:async()=>{attempts++;return enabled?{}:{disabled:true};}});
 f.queue.start();await f.advance(900000);assert.equal(attempts,1);assert.equal(f.counts().polls,0);assert.equal(f.timers.size,0);assert.equal(f.queue.inspect().acknowledged,0);
 f.queue.wake();await f.advance(900000);assert.equal(attempts,1);assert.equal(f.counts().polls,0);
 enabled=true;f.queue.wake({retry:true});await f.advance(0);assert.equal(attempts,2);assert.equal(f.queue.inspect().acknowledged,1);
 await f.advance(90000);assert.equal(f.counts().polls,1);f.queue.stop();
});
test('an interrupted pass retains its dirty generation and cleanup stops timers',async()=>{
 let n=0;const f=fixture({sync:async()=>++n===1?{deferred:true}:{}});f.queue.start();await f.advance(15000);assert.equal(f.queue.inspect().acknowledged,0);
 await f.advance(5000);assert.equal(f.queue.inspect().acknowledged,1);f.queue.stop();await f.advance(500000);assert.equal(n,2);assert.equal(f.timers.size,0);
});

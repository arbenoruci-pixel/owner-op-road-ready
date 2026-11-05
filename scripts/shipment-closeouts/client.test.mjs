import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('scripts/shipment-closeouts/client.js','utf8').replace(/^import .*;$/gm,'').replaceAll('export function','function');
const {startShipmentReviewSync}=vm.runInNewContext(source+';({startShipmentReviewSync})',{setTimeout,clearTimeout,AbortController,queueMicrotask,JSON,Object});
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
 const values=new Map(),emitted=[],requests=[];let auth,initial,unsubscribed=false;
 const client={auth:{getSession:()=>new Promise(r=>initial=r),onAuthStateChange:cb=>{auth=cb;return{data:{subscription:{unsubscribe:()=>unsubscribed=true}}};}},from:table=>{
  const request={table};requests.push(request);const q={select:()=>q,eq:(key,value)=>{request[key]=value;return q;},order:()=>q,range:()=>q,abortSignal:signal=>{request.signal=signal;return new Promise(resolve=>request.resolve=resolve);}};return q;
 }};
 const sync=startShipmentReviewSync(client,{storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},emit:r=>emitted.push(r)});
 return{sync,values,requests,emitted,auth:uid=>auth('SIGNED_IN',uid?{user:{id:uid}}:null),initial:uid=>initial({data:{session:{user:{id:uid}}}}),get unsubscribed(){return unsubscribed;}};
}
test('read-only refresh saves an account cache and preserves it through network errors',async()=>{
 const f=fixture();f.initial('account-a');await tick();assert.equal(f.requests[0].user_id,'account-a');assert.equal(f.requests[0].table,'road_ready_shipment_reviews');
 f.requests[0].resolve({data:[{id:'review-a'}]});await tick();assert.equal(f.emitted.at(-1)[0].id,'review-a');
 f.sync.refresh();await tick();f.requests[1].resolve({error:Error('offline')});await tick();assert.equal(f.emitted.at(-1)[0].id,'review-a');assert.match(f.values.get('road-ready-shipment-reviews-v1:account-a'),/review-a/);f.sync.stop();assert.equal(f.unsubscribed,true);
});
test('account switching clears stale reviews and ignores the old account response and delayed initial session',async()=>{
 const f=fixture();f.auth('account-a');await tick();f.auth('account-b');await tick();assert.equal(f.requests[0].signal.aborted,true);assert.equal(f.emitted.at(-1).length,0);
 f.requests[1].resolve({data:[{id:'review-b'}]});await tick();f.requests[0].resolve({data:[{id:'review-a'}]});f.initial('account-a');await tick();
 assert.equal(f.emitted.at(-1)[0].id,'review-b');assert.equal(f.values.has('road-ready-shipment-reviews-v1:account-a'),false);f.auth(null);assert.equal(f.emitted.at(-1).length,0);f.sync.stop();
});

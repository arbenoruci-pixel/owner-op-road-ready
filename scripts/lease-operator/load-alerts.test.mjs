import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../public/operator-load-alerts-sw.js', import.meta.url), 'utf8');
const handlers = new Map();
const notifications = [];
const received = [];
const opened = [];
const operator = {
  url:'https://roadready.example/operator', postMessage:msg=>received.push(msg.type),
  navigate:async url=>opened.push(url), focus:async()=>opened.push('focus'),
};
let pages = [operator, {url:'https://roadready.example/',postMessage:()=>assert.fail('Wrong app notified')}];
const self = {
  location:new URL(operator.url), addEventListener:(name,callback)=>handlers.set(name,callback),
  clients:{matchAll:async()=>pages,openWindow:async url=>opened.push(url)},
  registration:{showNotification:async(title,options)=>notifications.push({title,...options})},
};
vm.runInNewContext(source,{self,URL});
async function dispatch(type,data) {
  let work;
  handlers.get(type)({...data,waitUntil:task=>{work=task}});
  await work;
}
const loadId = '6a243bd0-e923-4909-b93f-20f921e677fb';
await dispatch('push',{data:{json:()=>({loadId})}});
await dispatch('push',{data:{json:()=>({loadId})}});
assert.equal(notifications[0].tag,notifications[1].tag);
assert.match(notifications[0].title,/New load assigned/);
assert.deepEqual(received,['RR_LOAD_ASSIGNED','RR_LOAD_ASSIGNED']);
await dispatch('notificationclick',{notification:{close(){}}});
assert.deepEqual(opened,['https://roadready.example/operator','focus']);
pages=[];
await dispatch('notificationclick',{notification:{close(){}}});
assert.equal(opened.at(-1),'/operator');
await dispatch('push',{data:null});
assert.equal(notifications.at(-1).tag,'rr-load-assigned');
console.log('Load alert worker verified.');

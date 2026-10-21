import test from 'node:test';
import assert from 'node:assert/strict';
import {bounded} from './deadline.js';
test('deadline cancels the actual outstanding query and returns a recoverable error',async()=>{
 let signal;
 const request={abortSignal(s){signal=s;return new Promise(resolve=>s.addEventListener('abort',()=>resolve({error:{message:'aborted'}})));}};
 await assert.rejects(bounded(request,2),/timed out.*saved on this device/);
 assert.equal(signal.aborted,true);
});
test('successful queries clear their cancellation timer',async()=>{
 let signal;const result=await bounded({abortSignal(s){signal=s;return Promise.resolve({data:[1]});}},5);
 assert.deepEqual(result,{data:[1]});await new Promise(resolve=>setTimeout(resolve,10));assert.equal(signal.aborted,false);
});
test('transport failures remain explicit and ordinary storage promises still work',async()=>{
 await assert.rejects(bounded(Promise.reject(Error('offline')),10),/offline/);
 assert.equal(await bounded(Promise.resolve('file'),10),'file');
});

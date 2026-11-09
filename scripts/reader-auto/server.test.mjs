import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiReaderHandlers} from '../../lib/reader-ai/server.js';
const image='data:image/png;base64,iVBORw0KGgo=';
const request=()=>new Request('https://app.test/api/reader/classify',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer synthetic'},body:JSON.stringify({operation:'read',image,text:'UNTRUSTED OCR',pageNumber:1})});
const reading={kind:'bol',quality:'readable',mixed:false,delivery:'pickup_only',fields:[{field:'bolNumber',value:'B-1234',quote:'BOL: B-1234',location:'top',clear:true}]};
const env=()=>({READER_AI_ENABLED:'true',READER_AI_GATEWAY_KEY:'synthetic-secret',READER_AI_MODEL:'example/vision'});
test('two independent image calls, shared budget, cached result and approved session',async()=>{
 const calls=[];let authorizations=0;
 const api=createAiReaderHandlers({env,authorize:async()=>{authorizations++;return 'user';},fetcher:async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(reading)}}]});}});
 const response=await api.POST(request()),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.result.verified,true);assert.equal(body.result.passes,2);assert.equal(calls.length,2);
 assert.ok(calls[0].messages[1].content[0].text.includes('UNTRUSTED OCR'));
 assert.ok(!JSON.stringify(calls[1].messages).includes('UNTRUSTED OCR'));assert.ok(!JSON.stringify(calls[1].messages).includes('B-1234'));
 assert.equal(calls[0].messages[1].content[1].image_url.url,image);
 assert.ok(calls.every(c=>c.messages[0].content.includes('Allowed fields by kind:')&&c.messages[0].content.includes('receiptDate')),'provider knows the exact per-kind keys enforced by validation');
 assert.equal((await (await api.POST(request())).json()).cached,true);assert.equal(calls.length,2);assert.equal(authorizations,2);
 assert.ok(!JSON.stringify(body).includes('synthetic-secret'));
});
test('one inconsistent or malformed reading cannot grant automatic acceptance',async()=>{
 let calls=0;const api=createAiReaderHandlers({env,authorize:async()=> 'user',fetcher:async()=>{calls++;const value=structuredClone(reading);if(calls===2){value.fields[0].value='B-1239';value.fields[0].quote='BOL: B-1239';}return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});}});
 const body=await (await api.POST(request())).json();assert.equal(body.result.fields.length,0);assert.deepEqual(body.result.unresolved,['bolNumber']);
 const bad=createAiReaderHandlers({env,authorize:async()=> 'user',fetcher:async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]})});
 assert.equal((await bad.POST(request())).status,502);
});
test('unapproved sessions never cause image requests',async()=>{
 const api=createAiReaderHandlers({env,authorize:async()=>{throw Object.assign(new Error('signed_out'),{code:'signed_out',status:403});},fetcher:()=>assert.fail('No provider call')});
 assert.equal((await api.POST(request())).status,403);
});
test('each double read consumes two calls and cancellation aborts both providers',async()=>{
 let calls=0;
 const api=createAiReaderHandlers({env,authorize:async()=> 'user',fetcher:async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(reading)}}]});}});
 const fresh=text=>new Request('https://app.test/api/reader/classify',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer synthetic'},body:JSON.stringify({operation:'read',image,text,pageNumber:1})});
 assert.equal((await api.POST(fresh('one'))).status,200);assert.equal((await api.POST(fresh('two'))).status,200);
 assert.equal((await api.POST(fresh('three'))).status,429);assert.equal(calls,4);
 const abort=new AbortController(),signals=[];
 const waiting=createAiReaderHandlers({env,authorize:async()=> 'other',fetcher:async(_,options)=>{signals.push(options.signal);if(signals.length===2)queueMicrotask(()=>abort.abort());return new Promise(()=>{});}});
 const cancelled=new Request(request(),{signal:abort.signal});
 assert.equal((await waiting.POST(cancelled)).status,503);assert.equal(signals.length,2);assert.ok(signals.every(s=>s.aborted));
});

test('wrapped image evidence survives the real provider response envelope',async()=>{
 const value=structuredClone(reading);
 value.fields.push({field:'shipper',value:'Test Liverpool Warehouse 100 Test Blvd, Liverpool, NY 13090',quote:'Test Liverpool Warehouse\n100 Test Blvd, Liverpool, NY 13090',location:'top',clear:true});
 const api=createAiReaderHandlers({env,authorize:async()=> 'user',fetcher:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]})});
 const response=await api.POST(request()),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.result.verified,true);
 assert.equal(body.result.fields.find(f=>f.field==='shipper').quotes[0],value.fields[1].quote);
});

test('smart response failures identify the cause without exposing the source or credentials',async()=>{
 const badQuote=structuredClone(reading);badQuote.fields[0].quote='PRIVATE SOURCE: B-9999';
 const badSchema={...reading,extra:'PRIVATE SOURCE'};
 for(const [choice,expected] of [
  [{finish_reason:'stop',message:{refusal:'PRIVATE SOURCE'}},'refused_output'],
  [{finish_reason:'length',message:{content:'PRIVATE SOURCE'}},'token_limit'],
  [{finish_reason:'content_filter',message:{content:'PRIVATE SOURCE'}},'incomplete_output'],
  [{finish_reason:'stop',message:{content:'PRIVATE SOURCE'}},'invalid_json'],
  [{finish_reason:'stop',message:{content:JSON.stringify(badSchema)}},'invalid_schema'],
  [{finish_reason:'stop',message:{content:JSON.stringify(badQuote)}},'value_not_in_quote'],
 ]){
  const api=createAiReaderHandlers({env,authorize:async()=> 'user',fetcher:async()=>Response.json({choices:[choice]})});
  const response=await api.POST(request()),body=await response.json();
  assert.equal(response.status,502);assert.equal(body.diagnostic.outputIssue,expected);
  assert.ok(!JSON.stringify(body).includes('PRIVATE SOURCE'));assert.ok(!JSON.stringify(body).includes('synthetic-secret'));
 }
});

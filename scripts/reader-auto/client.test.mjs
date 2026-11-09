import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomaticReader} from '../../lib/reader-ai/read.js';
import {createAiFallback} from '../../lib/reader-ai/fallback.js';
import {createAiReaderHandlers} from '../../lib/reader-ai/server.js';
const image='data:image/png;base64,iVBORw0KGgo=',file=new Blob([Buffer.from(image.split(',')[1],'base64')],{type:'image/png'});
const reading={kind:'bol',quality:'readable',mixed:false,delivery:'pickup_only',fields:[{field:'bolNumber',value:'B-1234',quote:'BOL: B-1234',location:'top',clear:true}]};
const review={pageCount:1,pages:[{id:'page-1',number:1,observations:[{source:'ocr',lines:[{text:'BOL No ~~ B-1234'}]}]}],documents:[{id:'document-1',pageIds:['page-1'],boundaryReview:false}],pageIdentities:[{pageId:'page-1',kind:'unknown',status:'uncertain'}]};
const env=()=>({READER_AI_ENABLED:'true',READER_AI_GATEWAY_KEY:'synthetic',READER_AI_MODEL:'example/vision'});
function fixture(overrides={}){
 let time=100000,calls=0;const operations=[],statuses=[],waits=[],progress=[];
 const server=createAiReaderHandlers({env,now:()=>time,authorize:async()=> 'user',fetcher:async()=>{calls++;return overrides.provider?.()||Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(reading)}}]});}});
 const fetcher=async(url,options={})=>{
   if(options.method!=='POST')return server.GET(new Request('https://app.test'+url));
   const input=JSON.parse(options.body);operations.push(input.operation||'classify');
   const response=await server.POST(new Request('https://app.test'+url,options));statuses.push(response.status);return response;
 };
 const deps={identify:()=>review,sources:()=>[{pageNumber:1,file}],session:async()=>({access_token:'synthetic',user:{id:'user'}}),prepare:async()=>image,fetcher,wait:async ms=>{waits.push(ms);time+=ms;},...overrides};
 return {deps,server,operations,statuses,waits,progress,calls:()=>calls,read:options=>createAutomaticReader(deps)({pageCount:1},file,{onProgress:(_,text)=>progress.push(text),...options})};
}
test('uncertain phone OCR uses one double read before review, without legacy classification',async()=>{
 const h=fixture();const result=await createAiFallback(h.deps)({pageCount:1},file,{automaticReading:true});
 assert.equal(result.automaticReadingStage.state,'completed');assert.equal(result.automaticReadingStage.accountId,'user');
 assert.deepEqual(h.operations,['read']);assert.equal(h.calls(),2);assert.equal(result.aiClassification,undefined);
 assert.match(result.automaticReadingStage.originalHash,/^[a-f0-9]{64}$/);
});
test('a temporarily exhausted shared budget waits once and completes without increasing the cap',async()=>{
 const h=fixture();
 for(const text of ['previous-one','previous-two'])assert.equal((await h.server.POST(new Request('https://app.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'read',image,text,pageNumber:1})}))).status,200);
 assert.equal(h.calls(),4);
 const result=await h.read();assert.equal(result.automaticReadingStage.state,'completed');
 assert.deepEqual(h.statuses,[429,200]);assert.deepEqual(h.waits,[60100]);assert.equal(h.calls(),6);
 assert.ok(h.progress.some(p=>p.includes('Waiting briefly')));
});
test('provider limits stay bounded and are reported separately from the local budget',async()=>{
 const h=fixture({provider:()=>Response.json({error:'busy'},{status:429})});
 const result=await createAiFallback(h.deps)({pageCount:1},file,{automaticReading:true});
 assert.equal(result.automaticReadingStage.state,'error');assert.equal(result.automaticReadingStage.limitScope,'provider');
 assert.equal(h.waits.length,0);assert.deepEqual(h.operations,['read']);assert.equal(h.calls(),2);
});
test('invalid image readings never start legacy paid calls automatically',async()=>{
 const h=fixture({provider:()=>Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]})});
 const result=await createAiFallback(h.deps)({pageCount:1},file,{automaticReading:true});
 assert.equal(result.automaticReadingStage.reason,'invalid_ai_result');assert.deepEqual(h.operations,['read']);assert.equal(h.calls(),2);
});
test('account changes and cancellation cannot apply completed readings',async()=>{
 let count=0;const h=fixture({session:async()=>({access_token:'synthetic',user:{id:++count===1?'user':'other'}})});
 assert.equal((await h.read()).automaticReadingStage.reason,'account_changed');
 const stop=new AbortController();stop.abort();await assert.rejects(h.read({signal:stop.signal}),{name:'AbortError'});
});
test('multi-page scans retain the existing review flow without a partial automatic read',async()=>{
 const h=fixture({identify:()=>({...review,pageCount:2,pages:[...review.pages,{id:'page-2',number:2}]})});
 assert.equal(await h.read(),null);assert.equal(h.calls(),0);
});
test('offline scans retain local review without a provider or capability request',async()=>{
 const h=fixture({online:()=>false,fetcher:()=>assert.fail('Offline must not request a service')});
 assert.equal(await h.read(),null);assert.equal(h.calls(),0);
});
test('returning to pages while waiting for allowance cancels the queued read',async()=>{
 const stop=new AbortController(),h=fixture({wait:async()=>{stop.abort();return new Promise(()=>{});}});
 for(const text of ['previous-one','previous-two'])await h.server.POST(new Request('https://app.test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'read',image,text,pageNumber:1})}));
 await assert.rejects(h.read({signal:stop.signal}),{name:'AbortError'});
 assert.deepEqual(h.statuses,[429]);assert.equal(h.calls(),4);
});

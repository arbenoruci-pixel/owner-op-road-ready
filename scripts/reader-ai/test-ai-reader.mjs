import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readDocument,textObservation} from '../../packages/smart-reader-core/src/index.js';
import {aiClassificationReason,validateAiClassification,AI_READER_VERSION} from '../../lib/reader-ai/policy.js';
import {createAiFallback} from '../../lib/reader-ai/fallback.js';
import {confirmReviewedKind} from '../../lib/reader-ai/confirm.js';
import {authorizeReader,createAiReaderHandlers} from '../../lib/reader-ai/server.js';

const evidence=(...codes)=>codes.map(code=>({code,quote:code==='receiver_acknowledgement'?'Received by: J. Doe':code,location:'bottom'}));
const pod=()=>({kind:'pod',certainty:'clear',quality:'readable',mixed:false,delivery:'receiver_signed',evidence:evidence('shipping_structure','receiver_acknowledgement')});
const image='data:image/jpeg;base64,/9j/2Q==';
const config={READER_AI_ENABLED:'true',READER_AI_GATEWAY_KEY:'test-server-secret',READER_AI_MODEL:'example/vision'};
const body=(extra={})=>({image,text:'damaged OCR',pageNumber:1,...extra});
const request=(data=body(),headers={})=>new Request('https://app.test/api/reader/classify',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer user-token',...headers},body:JSON.stringify(data)});
const completion=(value=pod())=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
const user={id:'user-a',email_confirmed_at:'2026-09-21'};
const identify=analysis=>readDocument({documentId:'test',pages:analysis.pageTexts.map((text,i)=>({id:'page-'+(i+1),number:i+1,observations:[textObservation(text)]}))});
const bol='BILL OF LADING\nBOL No: B-1234\nSHIP FROM: Mill\nSHIP TO: Market\nWeight: 1200 LB';
const rate='RATE CONFIRMATION\nLoad No: L-1234\nCarrier: Test Trucking\nTotal Carrier Pay: $2400\nPickup Date: 2026-09-21\nDelivery Date: 2026-09-22';

test('clear local types skip AI; missing extraction details do not trigger it',async()=>{
  for(const kind of ['bol','pod','fuel_receipt','rate_confirmation','unloading_receipt','packing_list'])assert.equal(aiClassificationReason({kind,status:'supported'},''),null);
  assert.equal(aiClassificationReason({kind:'pod',status:'confirmed'},''),null);
  assert.equal(aiClassificationReason({kind:'bol',status:'supported'},'Receiver signature: _____'),'delivery_acknowledgement');
  const assist=createAiFallback({identify:()=>({pages:[{id:'p',number:1,observations:[]}],pageIdentities:[{pageId:'p',kind:'fuel_receipt',status:'supported'}]}),fetcher:()=>assert.fail('clear type must not use network')});
  const original={needsReview:true,fields:{documentDate:''}};
  assert.equal(await assist(original),original);
});

test('POD evidence must belong to a completed receiver acknowledgement',()=>{
  assert.equal(validateAiClassification(pod()).status,'suggested');
  for(const delivery of ['blank','pickup_only','uncertain','none'])assert.equal(validateAiClassification({...pod(),delivery}).status,'needs_review');
  assert.equal(validateAiClassification({...pod(),evidence:evidence('shipping_structure','heading')}).status,'needs_review');
  assert.equal(validateAiClassification({...pod(),kind:'bol',evidence:evidence('heading','shipping_structure')}).status,'needs_review');
});

test('fuel and lumper require transaction evidence; certainty alone is insufficient',()=>{
  const fuel={...pod(),kind:'fuel_receipt',delivery:'none',evidence:evidence('fuel_product','fuel_dispensing','payment')};
  assert.equal(validateAiClassification(fuel).status,'suggested');
  assert.equal(validateAiClassification({...fuel,evidence:evidence('fuel_product','heading')}).status,'needs_review');
  assert.equal(validateAiClassification({...fuel,kind:'unloading_receipt',evidence:evidence('unloading_service','payment')}).status,'suggested');
  for(const delta of [{mixed:true},{quality:'unreadable'},{certainty:'uncertain'}])assert.equal(validateAiClassification({...fuel,...delta}).status,'needs_review');
  assert.throws(()=>validateAiClassification({...fuel,loadNo:'invented'}),/invalid_ai_result/);
  assert.throws(()=>validateAiClassification({...fuel,evidence:[{code:'heading',quote:'',location:'top'}]}),/invalid_ai_result/);
});

test('disabled endpoint makes zero authentication or provider requests',async()=>{
  const handlers=createAiReaderHandlers({env:()=>({}),authorize:()=>assert.fail('disabled'),fetcher:()=>assert.fail('disabled')});
  assert.deepEqual(await (await handlers.GET()).json(),{enabled:false,version:AI_READER_VERSION});
  assert.equal((await handlers.POST(request())).status,503);
});

test('uses current approved app session; rejects unapproved users before inference',async()=>{
  for(const approved of [true,false]){
    const calls=[];
    const authFetch=async(url,options)=>{calls.push({url,options});return Response.json(url.endsWith('/user')?user:{approved});};
    if(approved)assert.equal(await authorizeReader(request(),authFetch),'user-a');
    else await assert.rejects(authorizeReader(request(),authFetch),/signed_out/);
    assert.equal(calls.length,2);assert.match(calls[1].url,/rpc\/owner_op_access_v1$/);
    assert.equal(calls[1].options.headers.authorization,'Bearer user-token');
  }
  await assert.rejects(authorizeReader(request(body(),{Authorization:''}),()=>assert.fail()),/signed_out/);
  let calls=0;
  const handlers=createAiReaderHandlers({env:()=>config,authorize:async()=>{throw Object.assign(new Error('signed_out'),{code:'signed_out',status:403});},fetcher:()=>{calls++;}});
  assert.equal((await handlers.POST(request())).status,403);assert.equal(calls,0);
});

test('strict image input rejects URLs, invalid bytes, oversized bodies and injected parameters',async()=>{
  const handlers=createAiReaderHandlers({env:()=>config,authorize:async()=>user.id,fetcher:()=>assert.fail('invalid input must not call AI')});
  for(const input of [body({image:'https://attacker.test/private'}),body({image:'data:image/jpeg;base64,dGVzdA=='}),body({pageNumber:0}),body({pageNumber:2.2}),body({model:'expensive/model'}),body({text:'x'.repeat(6001)})])assert.equal((await handlers.POST(request(input))).status,400);
  assert.equal((await handlers.POST(request(body(),{'Content-Length':'3000000'}))).status,413);
  assert.equal((await handlers.POST(request(body(),{'Content-Type':'text/plain'}))).status,415);
});

test('server calls the fixed model with the image, keeps credentials private and scopes cache to account',async()=>{
  let calls=0;
  const handlers=createAiReaderHandlers({env:()=>config,authorize:async r=>r.headers.get('authorization'),fetcher:async(url,options)=>{
    calls++;assert.equal(url,'https://ai-gateway.vercel.sh/v1/chat/completions');
    assert.equal(options.headers.Authorization,'Bearer test-server-secret');
    const payload=JSON.parse(options.body);assert.equal(payload.model,'example/vision');assert.equal(payload.messages[1].content[1].image_url.url,image);
    assert.equal(payload.max_completion_tokens,1200);assert.equal(payload.response_format.json_schema.strict,true);
    return completion();
  }});
  const first=await handlers.POST(request());const value=await first.json();
  assert.equal(value.result.status,'suggested');assert.equal(value.result.canAutoFile,false);assert.equal(value.result.verified,false);
  assert.equal(JSON.stringify(value).includes('test-server-secret'),false);assert.match(first.headers.get('cache-control'),/no-store/);
  const cached=await (await handlers.POST(request(body({pageNumber:2})))).json();
  assert.equal(cached.cached,true);assert.equal(cached.pageNumber,2);assert.equal(calls,1);
  await handlers.POST(request(body(),{Authorization:'Bearer other-account'}));assert.equal(calls,2);
});

test('provider refusal, malformed JSON and incomplete output never become classifications',async()=>{
  for(const raw of [{choices:[{finish_reason:'length',message:{content:JSON.stringify(pod())}}]},{choices:[{finish_reason:'stop',message:{refusal:'cannot'}}]},{choices:[{finish_reason:'stop',message:{content:'not json'}}]}]){
    const handlers=createAiReaderHandlers({env:()=>config,authorize:async()=>user.id,fetcher:async()=>Response.json(raw)});
    const result=await handlers.POST(request());assert.equal(result.status,502);assert.equal((await result.json()).error,'invalid_ai_result');
  }
});

test('quota/provider failures do not retry or expose provider errors',async()=>{
  for(const status of [402,429,500]){
    let calls=0;
    const handlers=createAiReaderHandlers({env:()=>config,authorize:async()=>user.id,fetcher:async()=>{calls++;return Response.json({secret:'provider internals'},{status});}});
    const response=await handlers.POST(request());const value=await response.json();
    assert.equal(value.error,status===500?'unavailable':'limit_reached');assert.equal(JSON.stringify(value).includes('provider internals'),false);assert.equal(calls,1);
  }
});

test('best-effort instance throttle caps requests and rejects concurrent work',async()=>{
  let calls=0;
  const handlers=createAiReaderHandlers({env:()=>config,authorize:async()=>user.id,fetcher:async()=>{calls++;return completion();}});
  for(let i=0;i<4;i++)assert.equal((await handlers.POST(request(body({text:'request '+i})))).status,200);
  assert.equal((await handlers.POST(request(body({text:'fifth'})))).status,429);assert.equal(calls,4);
  let release;
  const concurrent=createAiReaderHandlers({env:()=>config,authorize:async()=>user.id,fetcher:()=>new Promise(resolve=>{release=resolve;})});
  const pending=concurrent.POST(request());
  while(!release)await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal((await concurrent.POST(request(body({text:'another'})))).status,429);
  release(completion());assert.equal((await pending).status,200);
});

function fallbackHarness({pageTexts=['unreadable'],enabled=true,status=200,account='a',onPost,online=true,source=true}={}){
  const calls=[],analysis={pageTexts,type:{id:'bol'},fields:{bolNo:'KEEP-123'},typeEvidenceV110334:{mixedDocuments:true,clearShipmentFields:true}};
  const assist=createAiFallback({identify,sources:()=>source?pageTexts.map((_,i)=>({pageNumber:i+1,file:{number:i+1}})):[],session:async()=>({access_token:'test',user:{id:account}}),prepare:async file=>image,online:()=>online,
    fetcher:async(url,options={})=>{calls.push(options);if(options.method!=='POST')return Response.json({enabled,version:AI_READER_VERSION,model:'example/vision'});
      onPost?.(JSON.parse(options.body));
      if(status!==200)return Response.json({ok:false,error:'limit_reached'},{status});
      return Response.json({ok:true,pageNumber:JSON.parse(options.body).pageNumber,result:{...validateAiClassification(pod()),imageHash:createHash('sha256').update(Buffer.from(image.split(',')[1],'base64')).digest('hex')}});
    }});
  return {calls,analysis,assist};
}

test('fallback sends only the uncertain page and preserves clear primary type, fields and packet guards',async()=>{
  const h=fallbackHarness({pageTexts:[rate,'HL OF LADNG damaged words']});
  const before=structuredClone(h.analysis);const result=await h.assist(h.analysis);
  assert.equal(result.type.id,'bol');assert.deepEqual(result.fields,before.fields);assert.deepEqual(result.typeEvidenceV110334,before.typeEvidenceV110334);assert.deepEqual(h.analysis,before);
  assert.equal(result.aiClassification.pages.length,1);assert.equal(result.aiClassification.pages[0].pageNumber,2);
  assert.equal(result.aiClassification.pages[0].result.kind,'pod');
  assert.equal(result.aiSourcePages.length,1);assert.equal(result.aiSourcePages[0].pageNumber,2);
  assert.equal('file' in result.aiClassification.pages[0],false,'saved AI provenance excludes source blobs');
  const posts=h.calls.filter(call=>call.method==='POST');assert.equal(posts.length,1);assert.equal(JSON.parse(posts[0].body).pageNumber,2);
});

test('fallback skips offline, unconfigured and absent image cases without an inference request',async()=>{
  for(const settings of [{online:false},{enabled:false},{source:false}]){
    const h=fallbackHarness(settings);const result=await h.assist(h.analysis);
    assert.equal(h.calls.filter(call=>call.method==='POST').length,0);assert.equal(result.type.id,'bol');
    assert.equal(result.aiClassification.pages[0].status,settings.online===false?'offline':settings.enabled===false?'not_configured':'source_unavailable');
  }
});

test('repeat scans use cache and large unclear packets stop after two pages',async()=>{
  const h=fallbackHarness({pageTexts:['unclear first','unclear second','unclear third']});
  const first=await h.assist(h.analysis);assert.equal(h.calls.filter(call=>call.method==='POST').length,2);assert.equal(first.aiClassification.pages[2].status,'limit_reached');
  const single=fallbackHarness();await single.assist(single.analysis);await single.assist(single.analysis);assert.equal(single.calls.filter(call=>call.method==='POST').length,1);
});

test('manual selection, cancellation and quota errors preserve the local result',async()=>{
  const h=fallbackHarness();assert.equal(await h.assist(h.analysis,null,{preferredType:'bol'}),h.analysis);assert.equal(h.calls.length,0);
  const controller=new AbortController();controller.abort();await assert.rejects(h.assist(h.analysis,null,{signal:controller.signal}),{name:'AbortError'});
  const failed=fallbackHarness({pageTexts:['one','two','three'],status:429});const result=await failed.assist(failed.analysis);
  assert.equal(failed.calls.filter(call=>call.method==='POST').length,1);assert.equal(result.aiClassification.pages.length,3);assert.ok(result.aiClassification.pages.every(p=>p.status==='limit_reached'));
});

test('cancelling an active fallback rejects its late result',async()=>{
  const controller=new AbortController();
  const h=fallbackHarness({onPost:()=>controller.abort()});
  await assert.rejects(h.assist(h.analysis,null,{signal:controller.signal}),{name:'AbortError'});
  assert.equal(h.analysis.aiClassification,undefined);
});

test('server cancellation aborts pending inference and returns no suggestion',async()=>{
  const controller=new AbortController();let started;
  const ready=new Promise(resolve=>{started=resolve;});
  const handlers=createAiReaderHandlers({env:()=>config,authorize:async()=>user.id,fetcher:async(_url,options)=>{
    started();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));
  }});
  const req=new Request(request(),{signal:controller.signal});
  const pending=handlers.POST(req);await ready;controller.abort();
  const response=await pending;assert.equal(response.status,503);assert.equal((await response.json()).result,undefined);
});

test('confirming an already suggested kind records the human choice and preserves fields',()=>{
  const result=readDocument({documentId:'current-kind',pages:[{id:'p',number:1,observations:[{...textObservation(bol),sourceImageId:'current-kind:p:original'}]}]});
  const group=result.documents[0];assert.equal(group.kind,'bol');
  const request={documentId:result.documentId,groupId:group.id,kind:'bol',userConfirmed:true,expectedRevision:result.reviewRevision,pageId:'p',sourceImageId:'current-kind:p:original'};
  const next=confirmReviewedKind(result,request);
  assert.equal(next.documents[0].typeCorrection.origin,'human');assert.equal(next.documents[0].identityStatus,'confirmed');assert.equal(next.documents[0].canAutoFile,false);
  assert.deepEqual(next.documents[0].fields,group.fields);assert.equal(result.documents[0].typeCorrection,undefined);
  assert.throws(()=>confirmReviewedKind(result,{...request,userConfirmed:false}));
  assert.throws(()=>confirmReviewedKind(result,{...request,expectedRevision:99}));
  assert.throws(()=>confirmReviewedKind(result,{...request,sourceImageId:'foreign-image'}));
});

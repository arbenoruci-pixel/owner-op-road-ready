import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAiReaderHandlers} from '../../lib/reader-ai/server.js';
import {createAiExtraction} from '../../lib/reader-ai/extract.js';
import {AI_EXTRACTION_VERSION,AI_EXTRACTION_LIMITS,validateAiExtractionResponse} from '../../lib/reader-ai/extraction.js';
import {AI_READER_VERSION} from '../../lib/reader-ai/policy.js';
import {readDocument,textObservation} from '../../packages/smart-reader-core/src/index.js';
import {confirmPageField} from '../../packages/smart-reader-core/src/recovery.js';

const image='data:image/jpeg;base64,/9j/2Q==',imageHash=createHash('sha256').update(Buffer.from(image.split(',')[1],'base64')).digest('hex');
const env={READER_AI_ENABLED:'true',READER_AI_GATEWAY_KEY:'synthetic-secret',READER_AI_MODEL:'example/vision'};
const raw=(extra={})=>({kind:'bol',quality:'readable',candidates:[{field:'poNumber',rawValue:'PO-7401',quote:'Order reference: PO-7401',location:'middle'}],...extra});
const body=(extra={})=>({image,text:'Order reference: PO-7401',pageNumber:1,operation:'extract',kind:'bol',fields:['poNumber'],...extra});
const req=(value=body())=>new Request('https://app.test/api/reader/classify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
const complete=value=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});

function fixture(){
  const text='BILL OF LADING\nBOL No: B-4321\nSHIP FROM: Test Mill\nSHIP TO: Test Market\nWeight: 1000 LB\nOrder reference: PO-7401';
  const observation={...textObservation(text),sourceImageId:'doc:p1:original'};
  const result=readDocument({documentId:'doc',pages:[{id:'p1',number:1,observations:[observation]}]});
  assert.equal(result.documents[0].identityStatus,'supported');assert.equal(result.documents[0].fields.poNumber.status,'missing');
  return {result,analysis:{type:{id:'bol'},fields:{bolNo:'KEEP'},routing:{autoFile:false},aiClassification:{attemptedPageCount:0}}};
}
function harness({fetchPost,online=()=>true,session=async()=>({access_token:'test',user:{id:'synthetic'}}),setTimer,extra={}}={}){
  const {analysis,result}=fixture(),calls=[];
  const extract=createAiExtraction({prepare:async()=>image,online,session,...(setTimer?{setTimer,clearTimer:()=>{}}:{}),fetcher:async(url,options={})=>{
    calls.push(options);
    if(options.method!=='POST')return Response.json({enabled:true,version:AI_READER_VERSION,model:'example/vision',extraction:{version:AI_EXTRACTION_VERSION}});
    if(fetchPost)return fetchPost(options);
    const result={...validateAiExtractionResponse(raw(),{kind:'bol',fields:['poNumber']}),model:'example/vision',imageHash};
    return Response.json({ok:true,pageNumber:1,result});
  },...extra});
  const args={analysis,result,groupId:result.documents[0].id,pageId:'p1',sourceImageId:'doc:p1:original',file:{synthetic:true}};
  return {analysis,result,calls,extract,args};
}

test('separate extraction operation uses same approved endpoint/auth/budget and strict raw-value schema',async()=>{
  let calls=0,auth=0;
  const handlers=createAiReaderHandlers({env:()=>env,authorize:async()=>{auth++;return 'synthetic';},fetcher:async(url,options)=>{
    calls++;assert.equal(url,'https://ai-gateway.vercel.sh/v1/chat/completions');
    const payload=JSON.parse(options.body);assert.equal(payload.model,'example/vision');assert.equal(payload.max_completion_tokens,1200);
    assert.equal(payload.response_format.json_schema.name,'trucking_document_extraction');assert.equal(payload.response_format.json_schema.strict,true);
    assert.match(payload.messages[0].content,/not document classification/);assert.match(payload.messages[1].content[0].text,/Requested fields: poNumber/);
    return complete(raw());
  }});
  const value=await (await handlers.POST(req())).json();
  assert.equal(value.result.version,AI_EXTRACTION_VERSION);assert.equal(value.diagnostic.stage,'extraction');assert.equal(value.result.verified,false);
  assert.equal(value.result.candidates[0].canAutoFile,false);assert.equal(value.result.candidates[0].rawValue,'PO-7401');assert.equal(value.result.model,'example/vision');
  assert.equal(value.result.imageHash,imageHash);assert.equal(JSON.stringify(value).includes('synthetic-secret'),false);
  assert.equal((await (await handlers.POST(req())).json()).cached,true);assert.equal(calls,1);assert.equal(auth,2);
});

test('extraction rejects unsupported operation/kind/field inputs without paid requests',async()=>{
  const handlers=createAiReaderHandlers({env:()=>env,authorize:async()=> 'synthetic',fetcher:()=>assert.fail('must not contact provider')});
  for(const delta of [{operation:'other'},{kind:'toString'},{kind:'unknown'},{fields:['bankAccount']},{fields:[]},{fields:['poNumber','poNumber']},{operation:'classify'},{fields:['total']}]){
    const response=await handlers.POST(req(body(delta)));assert.equal(response.status,400);
  }
});

test('extraction cannot claim different kind, requested fields, missing quotes or automatic acceptance',async()=>{
  const invalid=[raw({kind:'invoice'}),raw({candidates:[{field:'poNumber',rawValue:'INVENTED',quote:'Order reference: PO-7401',location:'middle'}]}),raw({canAutoFile:true}),raw({quality:'unreadable'}),raw({candidates:[{field:'bolNumber',rawValue:'B-1234',quote:'BOL: B-1234',location:'top'}]})];
  for(const value of invalid){const handlers=createAiReaderHandlers({env:()=>env,authorize:async()=> 'synthetic',fetcher:async()=>complete(value)});const response=await handlers.POST(req());assert.equal(response.status,502);assert.equal((await response.json()).error,'invalid_ai_result');}
});

test('classification and extraction share server throttling rather than creating a second budget',async()=>{
  let calls=0;const classification={kind:'bol',certainty:'clear',quality:'readable',mixed:false,delivery:'blank',evidence:[{code:'heading',quote:'BILL OF LADING',location:'top'},{code:'shipping_structure',quote:'SHIP FROM / SHIP TO',location:'middle'}]};
  const handlers=createAiReaderHandlers({env:()=>env,authorize:async()=> 'synthetic',fetcher:async(_url,options)=>{calls++;return complete(JSON.parse(options.body).response_format.json_schema.name.endsWith('extraction')?raw():classification);}});
  assert.equal((await handlers.POST(req({image,text:'class',pageNumber:1}))).status,200);
  for(let i=0;i<3;i++)assert.equal((await handlers.POST(req(body({text:'extract '+i})))).status,200);
  assert.equal((await handlers.POST(req(body({text:'fifth request'})))).status,429);assert.equal(calls,4);
});

test('explicit extraction creates only review proposals, preserving source/fields/type/load until human confirmation',async()=>{
  const h=harness(),before=structuredClone(h.result),analysisBefore=structuredClone(h.analysis),stage=await h.extract(h.args);
  assert.equal(stage.stage,'extraction');assert.equal(stage.state,'attempted');assert.equal(stage.reason,'source_linked_candidates');assert.equal(stage.attemptedPageCount,1);
  assert.equal(stage.candidates.length,1);const candidate=stage.candidates[0];
  assert.equal(candidate.field,'poNumber');assert.equal(candidate.provenance.providerImage.sourceImageId,'doc:p1:original');assert.equal(candidate.provenance.providerImage.imageHash,imageHash);
  assert.equal(candidate.provenance.evidence[0].sourceLinkVerified,true);assert.equal(candidate.verified,false);assert.equal(candidate.canAutoFile,false);
  assert.deepEqual(h.result,before);assert.deepEqual(h.analysis,analysisBefore);assert.equal(h.result.documents[0].fields.poNumber.value,null);
  const next=confirmPageField(h.result,{documentId:'doc',groupId:candidate.groupId,field:candidate.field,rawValue:candidate.rawValue,pageId:'p1',sourceImageId:'doc:p1:original',expectedRevision:h.result.reviewRevision,userConfirmed:true});
  assert.equal(next.documents[0].fields.poNumber.status,'confirmed');assert.equal(next.documents[0].fields.poNumber.correction.origin,'human');
  assert.equal(next.documents[0].canAutoFile,false);assert.equal(next.documents[0].kind,'bol');assert.deepEqual(next.documents[0].fields.bolNumber,h.result.documents[0].fields.bolNumber);
  assert.throws(()=>confirmPageField(h.result,{documentId:'doc',groupId:candidate.groupId,field:candidate.field,rawValue:candidate.rawValue,pageId:'p1',sourceImageId:'doc:p1:original',expectedRevision:h.result.reviewRevision,userConfirmed:false}));
});

test('image-only hallucinated quote is rejected rather than becoming field evidence',async()=>{
  const h=harness({fetchPost:async()=>Response.json({ok:true,pageNumber:1,result:{...validateAiExtractionResponse(raw({candidates:[{field:'poNumber',rawValue:'PO-9999',quote:'Order reference: PO-9999',location:'middle'}]}),{kind:'bol',fields:['poNumber']}),model:'example/vision',imageHash}})});
  const result=await h.extract(h.args);assert.equal(result.candidates.length,0);assert.equal(result.pages[0].rejectedCount,1);assert.equal(result.pages[0].rejections[0].reason,'source_quote_not_found');assert.equal(result.reason,'no_source_linked_candidates');
});

test('confirmation cannot be overwritten and foreign/cropped originals are not submitted',async()=>{
  const h=harness();assert.equal((await h.extract({...h.args,sourceImageId:'doc:p1:crop'})).reason,'source_unavailable');assert.equal(h.calls.length,0);
  for(const field of Object.values(h.result.documents[0].fields))field.status='confirmed';
  assert.equal((await h.extract(h.args)).reason,'no_missing_fields');assert.equal(h.calls.length,0);
});

test('explicit extraction respects remaining shared scan allowance and reuses cache without another paid request',async()=>{
  const h=harness();h.analysis.aiClassification.attemptedPageCount=3;
  const first=await h.extract(h.args);assert.equal(first.attemptedPageCount,1);
  const limited=await h.extract({...h.args,previous:first});assert.equal(limited.reason,'limit_reached');assert.equal(limited.candidates.length,1,'failed repeat preserves prior unconfirmed proposals');assert.equal(h.calls.filter(call=>call.method==='POST').length,1);
  const cached=harness();const one=await cached.extract(cached.args),two=await cached.extract({...cached.args,previous:one});
  assert.equal(two.attemptedPageCount,1);assert.equal(two.pages[0].cached,true);assert.equal(cached.calls.filter(call=>call.method==='POST').length,1);
});

test('cancelled and timed-out explicit extraction never changes local fields or submits follow-up work',async()=>{
  for(const cancel of [false,true]){
    let deadline,ready;const started=new Promise(resolve=>{ready=resolve;});
    const h=harness({setTimer:callback=>{deadline=callback;return 1;},fetchPost:()=>{ready();return new Promise(()=>{});}}),before=structuredClone(h.result),controller=new AbortController();
    const pending=h.extract({...h.args,signal:controller.signal});await started;
    if(cancel){controller.abort();await assert.rejects(pending,{name:'AbortError'});}else{deadline();const result=await pending;assert.equal(result.state,'error');assert.equal(result.reason,'timed_out');assert.deepEqual(result.candidates,[]);}
    assert.deepEqual(h.result,before);assert.equal(h.calls.filter(call=>call.method==='POST').length,1);
  }
});

test('simultaneous explicit actions cannot multiply provider spend',async()=>{
  let release,ready;const started=new Promise(resolve=>{ready=resolve;});
  const h=harness({fetchPost:()=>{ready();return new Promise(resolve=>{release=resolve;});}});
  const pending=h.extract(h.args);await started;const second=await h.extract(h.args);assert.equal(second.reason,'already_running');
  release(Response.json({ok:true,pageNumber:1,result:{...validateAiExtractionResponse(raw(),{kind:'bol',fields:['poNumber']}),model:'example/vision',imageHash}}));
  assert.equal((await pending).candidates.length,1);assert.equal(h.calls.filter(call=>call.method==='POST').length,1);
});

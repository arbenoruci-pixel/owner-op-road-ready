import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AI_READER_VERSION,validateAiClassification} from '../../lib/reader-ai/policy.js';
import {AI_READER_LIMITS,aiReadingDiagnostics} from '../../lib/reader-ai/diagnostics.js';
import {createAiFallback} from '../../lib/reader-ai/fallback.js';
import {createAiReaderHandlers} from '../../lib/reader-ai/server.js';
import {AI_EXTRACTION_VERSION,AI_EXTRACTION_SCHEMA,validateAiExtraction} from '../../lib/reader-ai/extraction.js';

const image='data:image/jpeg;base64,/9j/2Q==';
const imageHash=createHash('sha256').update(Buffer.from(image.split(',')[1],'base64')).digest('hex');
const classified=()=>({...validateAiClassification({kind:'bol',certainty:'clear',quality:'readable',mixed:false,delivery:'blank',evidence:[{code:'heading',quote:'BILL OF LADING',location:'top'},{code:'shipping_structure',quote:'SHIP FROM / SHIP TO',location:'middle'}]}),model:'example/vision',imageHash});
function harness({text='unreadable',pages=1,fetchPost,fetchStatus,prepare=async()=>image,online=()=>true,session=async()=>({access_token:'synthetic',user:{id:'synthetic-user'}}),setTimer,clearTimer=()=>{}}={}) {
  const calls=[];
  const identify=()=>({pages:Array.from({length:pages},(_,i)=>({id:'p'+(i+1),number:i+1,observations:[{id:'ocr',lines:[{text}]}]})),pageIdentities:[]});
  const analysis={fields:{bolNo:'PRESERVE'},routing:{autoFile:false},pageCount:pages};
  const assist=createAiFallback({identify,online,session,prepare,sources:()=>Array.from({length:pages},(_,i)=>({pageNumber:i+1,file:{synthetic:true}})),...(setTimer?{setTimer,clearTimer}:{}),fetcher:async(url,options={})=>{
    calls.push(options);
    if(options.method!=='POST')return fetchStatus?fetchStatus(options):Response.json({enabled:true,version:AI_READER_VERSION,model:'example/vision'});
    if(fetchPost)return fetchPost(options);
    return Response.json({ok:true,pageNumber:JSON.parse(options.body).pageNumber,result:classified()});
  }});
  return {assist,analysis,calls};
}

test('missing or legacy stages export explicit reasons, not null or invented completion',()=>{
  const result=aiReadingDiagnostics({pageCount:2});
  assert.equal(result.aiClassification.state,'skipped');assert.equal(result.aiClassification.reason,'not_run');
  assert.equal(result.aiClassification.model,null);assert.equal(result.aiClassification.version,AI_READER_VERSION);
  assert.equal(result.aiExtraction.state,'skipped');assert.equal(result.aiExtraction.reason,'not_requested');
  assert.equal(result.aiExtraction.version,AI_EXTRACTION_VERSION);assert.deepEqual(result.aiExtraction.candidates,[]);
});

test('successful classification records bounded truncated input and keeps extraction separate',async()=>{
  const h=harness({text:'x'.repeat(6200)}),original=structuredClone(h.analysis);
  const result=await h.assist(h.analysis),stage=result.aiClassification;
  assert.equal(stage.state,'attempted');assert.equal(stage.reason,'completed');assert.equal(stage.model,'example/vision');
  assert.deepEqual(stage.limits,AI_READER_LIMITS);assert.equal(stage.attemptedPageCount,1);
  assert.equal(stage.pages[0].textCharactersRead,6200);assert.equal(stage.pages[0].textCharactersSent,6000);assert.equal(stage.pages[0].textTruncated,true);
  assert.equal(stage.pages[0].result.verified,false);assert.equal(result.aiExtraction.reason,'not_requested');
  assert.deepEqual(result.fields,original.fields);assert.deepEqual(result.routing,original.routing);assert.deepEqual(h.analysis,original);
  assert.equal(JSON.stringify(stage).includes('synthetic-user'),false);assert.equal(JSON.stringify(stage).includes(image),false);
  const second=await h.assist(h.analysis);assert.equal(second.aiClassification.attemptedPageCount,0);assert.equal(second.aiClassification.cachedPageCount,1);
  assert.equal(h.calls.filter(call=>call.method==='POST').length,1);
});

test('offline, disabled, signed-out and unsupported configuration expose why no request was sent',async()=>{
  const variants=[
    [{online:()=>false},'offline'],
    [{fetchStatus:()=>Response.json({enabled:false})},'not_configured'],
    [{session:async()=>null},'signed_out'],
    [{fetchStatus:()=>Response.json({enabled:true,model:'example/vision',version:'foreign-version'})},'invalid_configuration'],
  ];
  for(const [options,reason] of variants){
    const h=harness(options),result=await h.assist(h.analysis);
    assert.equal(result.aiClassification.reason,reason);assert.equal(result.aiClassification.attemptedPageCount,0);
    assert.equal(h.calls.some(call=>call.method==='POST'),false);assert.equal(result.aiExtraction.reason,'not_requested');
  }
});

test('provider transport failure records one attempted error and prevents further paid pages',async()=>{
  const h=harness({pages:3,fetchPost:()=>{throw new Error('private provider detail');}}),result=await h.assist(h.analysis),stage=result.aiClassification;
  assert.equal(stage.state,'error');assert.equal(stage.attemptedPageCount,1);assert.equal(stage.pages.length,3);
  assert.equal(stage.pages[0].status,'unavailable');assert.equal(stage.pages[0].attempted,true);
  assert.equal(stage.pages[1].attempted,false);assert.equal(stage.pages[1].blockedByPriorPage,true);
  assert.equal(JSON.stringify(result).includes('private provider detail'),false);assert.equal(h.calls.filter(call=>call.method==='POST').length,1);
});

test('scan timeout settles a dependency that ignores abort and records no invented result',async()=>{
  let timeout,started;const ready=new Promise(resolve=>{started=resolve;});
  const h=harness({pages:2,setTimer:(callback,ms)=>{assert.equal(ms,110000);timeout=callback;return 1;},fetchPost:()=>{started();return new Promise(()=>{});}});
  const pending=h.assist(h.analysis);await ready;timeout();
  const result=await pending,stage=result.aiClassification;
  assert.equal(stage.state,'error');assert.equal(stage.attemptedPageCount,1);assert.equal(stage.pages[0].status,'timed_out');
  assert.equal(stage.pages[0].result,undefined);assert.equal(stage.pages[1].attempted,false);assert.equal(result.fields.bolNo,'PRESERVE');
});

test('timeout before availability is distinguishable from disabled configuration',async()=>{
  let timeout,started;const ready=new Promise(resolve=>{started=resolve;});
  const h=harness({setTimer:callback=>{timeout=callback;return 1;},fetchStatus:()=>{started();return new Promise(()=>{});}});
  const pending=h.assist(h.analysis);await ready;timeout();const result=await pending;
  assert.equal(result.aiClassification.reason,'timed_out');assert.equal(result.aiClassification.attemptedPageCount,0);
});

test('server deadline covers uncooperative provider without changing provider or auth budget',async()=>{
  let timeout,started;const ready=new Promise(resolve=>{started=resolve;});let calls=0;
  const handlers=createAiReaderHandlers({env:()=>({READER_AI_ENABLED:'true',READER_AI_GATEWAY_KEY:'mock-only',READER_AI_MODEL:'example/vision'}),authorize:async()=> 'synthetic-user',
    setTimer:(callback,ms)=>{assert.equal(ms,25000);timeout=callback;return 1;},clearTimer:()=>{},fetcher:async(url,options)=>{
      calls++;assert.equal(url,'https://ai-gateway.vercel.sh/v1/chat/completions');assert.equal(JSON.parse(options.body).max_completion_tokens,1200);started();return new Promise(()=>{});
    }});
  const pending=handlers.POST(new Request('https://local.test/api/reader/classify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({image,text:'synthetic',pageNumber:1})}));
  await ready;timeout();const response=await pending,value=await response.json();
  assert.equal(response.status,503);assert.equal(value.error,'timed_out');assert.equal(value.diagnostic.state,'error');assert.equal(value.diagnostic.attempted,true);
  assert.equal(value.diagnostic.model,'example/vision');assert.equal(value.result,undefined);assert.equal(calls,1);assert.equal(JSON.stringify(value).includes('mock-only'),false);
});

const source=()=>({documentId:'synthetic-document',model:'example/vision',pages:[{id:'p1',number:1,observations:[{id:'ocr-1',source:'native_pdf',sourceImageId:'original-p1',lines:[{id:'line-1',text:'BOL No: B-4321'},{id:'line-2',text:'Ship Date: 10/11/2026'}]}]}]});
const proposal=()=>({kind:'bol',candidates:[{field:'bolNumber',rawValue:'B-4321',evidence:[{pageId:'p1',pageNumber:1,sourceImageId:'original-p1',observationId:'ocr-1',lineId:'line-1',quote:'BOL No: B-4321'}]}]});

test('extraction foundation emits typed source-linked review candidates only',()=>{
  const input=proposal(),context=source(),before=structuredClone(context),result=validateAiExtraction(input,context),candidate=result.candidates[0];
  assert.equal(candidate.field,'bolNumber');assert.equal(candidate.valueType,'identifier');assert.equal(candidate.rawValue,'B-4321');
  assert.equal(candidate.status,'needs_review');assert.equal(candidate.verified,false);assert.equal(candidate.canAutoFile,false);
  assert.equal(candidate.provenance.documentId,context.documentId);assert.equal(candidate.provenance.model,'example/vision');
  assert.equal(candidate.provenance.evidence[0].sourceLinkVerified,true);assert.equal(candidate.provenance.evidence[0].semanticVerified,false);
  assert.deepEqual(context,before);assert.equal(input.candidates[0].status,undefined);assert.equal(AI_EXTRACTION_SCHEMA.additionalProperties,false);
});

test('invented values, evidence, field types, cross-page links and extra authority are rejected',()=>{
  const changes=[
    value=>{value.candidates[0].rawValue='B-9999';},
    value=>{value.candidates[0].evidence[0].quote='Invented B-4321';},
    value=>{value.candidates[0].evidence[0].pageId='p2';},
    value=>{value.candidates[0].evidence[0].sourceImageId='foreign-original';},
    value=>{value.candidates[0].evidence[0].observationId='ai-result';},
    value=>{value.candidates[0].evidence[0].lineId='missing-line';},
    value=>{value.candidates[0].field='total';},
    value=>{value.candidates[0].canAutoFile=true;},
    value=>{value.candidates[0].evidence=[];},
    value=>{value.candidates=Array.from({length:25},()=>value.candidates[0]);},
    value=>{value.verified=true;},
  ];
  for(const change of changes){const value=proposal();change(value);assert.throws(()=>validateAiExtraction(value,source()),/invalid_ai_extraction/);}
  const context=source();context.pages[0].observations[0].source='ai';assert.throws(()=>validateAiExtraction(proposal(),context),/invalid_ai_extraction/);
});

test('extraction does not normalize ambiguous dates or promote claims to verified values',()=>{
  const value={kind:'bol',candidates:[{field:'documentDate',rawValue:'10/11/2026',evidence:[{pageId:'p1',pageNumber:1,sourceImageId:'original-p1',observationId:'ocr-1',lineId:'line-2',quote:'Ship Date: 10/11/2026'}]}]};
  const result=validateAiExtraction(value,source());assert.equal(result.candidates[0].rawValue,'10/11/2026');assert.equal(result.candidates[0].valueType,'date');assert.equal(result.candidates[0].value,undefined);
});

test('older saved classifications expose missing history without inventing requests',()=>{
  const result=aiReadingDiagnostics({aiClassification:{version:AI_READER_VERSION,pages:[{pageNumber:1,status:'suggested',result:classified()}]}});
  assert.equal(result.aiClassification.state,'attempted');assert.equal(result.aiClassification.reason,'legacy_diagnostics_unavailable');
  assert.equal(result.aiClassification.attemptedPageCount,0);assert.equal(result.aiClassification.completedPageCount,1);
  assert.equal(result.aiClassification.pages[0].attemptHistory,'not_recorded');assert.equal(result.aiClassification.limitsSource,'current_policy_not_legacy_measurement');
});

test('manual-type skip retains original in-memory page references',async()=>{
  const h=harness();h.analysis.aiSourcePages=[{pageNumber:1,file:{original:'retained'}}];
  const result=await h.assist(h.analysis,null,{preferredType:'bol'});
  assert.equal(result.aiSourcePages,h.analysis.aiSourcePages);assert.equal(result.aiClassification.reason,'user_selected_type');assert.equal(h.calls.length,0);
});

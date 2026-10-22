import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiReaderHandlers} from '../../lib/reader-ai/server.js';
import {createAiFallback} from '../../lib/reader-ai/fallback.js';
import {AI_READER_VERSION} from '../../lib/reader-ai/policy.js';

const image='data:image/jpeg;base64,/9j/2Q==';
const request=()=>new Request('https://example.test/api/reader/classify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,text:'synthetic document',pageNumber:1})});
const env=()=>({READER_AI_ENABLED:'true',READER_AI_GATEWAY_KEY:'synthetic',READER_AI_MODEL:'example/vision'});

test('provider output failures have useful bounded diagnostics and never expose provider text',async()=>{
  for(const [raw,issue] of [
    [{choices:[{finish_reason:'length',message:{content:'private partial output'}}]},'token_limit'],
    [{choices:[{finish_reason:'stop',message:{refusal:'private refusal'}}]},'refused_output'],
    [{choices:[]},'incomplete_output'],
    [{choices:[{finish_reason:'stop',message:{content:'private malformed JSON'}}]},'invalid_json'],
    [{choices:[{finish_reason:'stop',message:{content:'{"private":"schema mismatch"}'}}]},'invalid_schema'],
  ]){
    let calls=0;
    const handlers=createAiReaderHandlers({env,authorize:async()=> 'synthetic',fetcher:async()=>{calls++;return Response.json(raw);}});
    const response=await handlers.POST(request()),result=await response.json();
    assert.equal(response.status,502);assert.equal(result.error,'invalid_ai_result');assert.equal(result.diagnostic.outputIssue,issue);
    assert.equal(calls,1);assert.equal(JSON.stringify(result).includes('private'),false);
  }
});

test('a failed AI response records its cause, preserves local data and stops paid page calls',async()=>{
  const analysis={type:{id:'other'},fields:{keep:'original'},pageCount:2};let posts=0;
  const assist=createAiFallback({identify:()=>({pages:[1,2].map(number=>({id:'p'+number,number,observations:[{lines:[{text:'unreadable'}]}]})),pageIdentities:[]}),
    sources:()=>[1,2].map(pageNumber=>({pageNumber,file:new Blob(['synthetic'])})),session:async()=>({user:{id:'synthetic'},access_token:'synthetic'}),prepare:async()=>image,
    fetcher:async(url,options={})=>{
      if(!options.method)return Response.json({enabled:true,model:'example/vision',version:AI_READER_VERSION});
      posts++;return Response.json({ok:false,error:'invalid_ai_result',diagnostic:{outputIssue:'token_limit'}},{status:502});
    }});
  const result=await assist(analysis,new Blob());
  assert.equal(posts,1);assert.deepEqual(result.fields,analysis.fields);assert.equal(result.type.id,'other');
  assert.equal(result.aiClassification.pages[0].outputIssue,'token_limit');assert.equal(result.aiClassification.pages[1].blockedByPriorPage,true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiReaderHandlers} from '../../lib/reader-ai/server.js';
const project='prj_OsMcJCe943O2dpo2Z9CMXKzRBOtX',team='team_v4qKMAbBij0rd8eZ4FC86tim';
const image='data:image/jpeg;base64,/9j/2Q==';
const classification={kind:'bol',certainty:'clear',quality:'readable',mixed:false,delivery:'blank',evidence:[{code:'heading',quote:'BILL OF LADING',location:'top'},{code:'shipping_structure',quote:'SHIP FROM / SHIP TO',location:'middle'}]};
function token(overrides={}){return [Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({project_id:project,owner_id:team,iss:'https://oidc.vercel.com/tepiha',aud:'https://vercel.com/tepiha',nbf:Math.floor(Date.now()/1000)-1,exp:Math.floor(Date.now()/1000)+7200,...overrides})).toString('base64url'),'synthetic-signature'].join('.');}
const request=(oidc,post=false,text='unreadable')=>new Request('https://app.test/api/reader/classify',{method:post?'POST':'GET',headers:{...(oidc?{'x-vercel-oidc-token':oidc}:{}),...(post?{'Content-Type':'application/json',Authorization:'Bearer app-user'}:{})},...(post?{body:JSON.stringify({image,text,pageNumber:1})}:{})});
const completion=()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(classification)}}]});
test('runtime status activates without a build environment token or project ID and exposes no credential',async()=>{
 const runtimeToken=token(),handlers=createAiReaderHandlers({env:()=>({})});
 const status=await (await handlers.GET(request(runtimeToken))).json();
 assert.deepEqual(status,{enabled:true,version:'document-classification-v2',model:'openai/gpt-5.4-mini'});
 assert.equal(JSON.stringify(status).includes(runtimeToken),false);
 assert.equal((await (await handlers.GET(request())).json()).enabled,false);
});
test('approved user uses the current request token and a fresh token on the next request',async()=>{
 const seen=[],one=token({iat:1}),two=token({iat:2});
 const handlers=createAiReaderHandlers({env:()=>({VERCEL_PROJECT_ID:project,VERCEL_OIDC_TOKEN:'stale-build-token'}),fetcher:async(url,options)=>{
  if(url.endsWith('/user')){assert.equal(options.headers.authorization,'Bearer app-user');return Response.json({id:'approved-user',email_confirmed_at:'2026-09-30'});}
  if(url.endsWith('/owner_op_access_v1'))return Response.json({approved:true});
  assert.equal(url,'https://ai-gateway.vercel.sh/v1/chat/completions');seen.push(options.headers.Authorization);return completion();
 }});
 for(const [oidc,text]of[[one,'first page'],[two,'second page']]){const response=await handlers.POST(request(oidc,true,text));assert.equal(response.status,200);assert.equal((await response.json()).result.status,'suggested');}
 assert.deepEqual(seen,['Bearer '+one,'Bearer '+two]);
});
test('other projects, mismatched runtime identity, invalid scopes and expired tokens stay disabled',async()=>{
 const invalid=[token({project_id:'another'}),token({owner_id:'another'}),token({iss:'https://attacker.test'}),token({aud:'https://attacker.test'}),token({exp:0}),token({nbf:Math.floor(Date.now()/1000)+1000}),'malformed'];
 for(const value of invalid){const handlers=createAiReaderHandlers({env:()=>({VERCEL_PROJECT_ID:project}),authorize:()=>assert.fail('inactive endpoint'),fetcher:()=>assert.fail('inactive endpoint')});assert.equal((await (await handlers.GET(request(value))).json()).enabled,false);assert.equal((await handlers.POST(request(value,true))).status,503);}
 const other=createAiReaderHandlers({env:()=>({VERCEL_PROJECT_ID:'another'})});assert.equal((await (await other.GET(request(token()))).json()).enabled,false);
});
test('kill switch overrides runtime activation and unapproved sessions never reach Gateway',async()=>{
 const disabled=createAiReaderHandlers({env:()=>({READER_AI_ENABLED:'false'})});assert.equal((await (await disabled.GET(request(token()))).json()).enabled,false);
 let paid=0;const guarded=createAiReaderHandlers({env:()=>({}),fetcher:async url=>{if(url.endsWith('/user'))return Response.json({id:'unapproved-user',email_confirmed_at:'2026-09-30'});if(url.endsWith('/owner_op_access_v1'))return Response.json({approved:false});paid++;return completion();}});assert.equal((await guarded.POST(request(token(),true))).status,403);assert.equal(paid,0);
});

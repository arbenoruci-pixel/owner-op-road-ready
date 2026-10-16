import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocumentOriginal} from './original.js';
test('a saved local original is returned without account or network access',async()=>{
 const blob=new Blob(['original']),calls=[];
 const result=await readDocumentOriginal({clientDocumentId:'client'},{readLocal:async id=>{calls.push(id);return blob;},getAccessToken:()=>{throw Error('Unnecessary auth');},fetch:()=>{throw Error('Unnecessary request');}});
 assert.equal(result,blob);assert.deepEqual(calls,['client']);
});
test('legacy metadata with a stable client ID can retrieve its cloud original without cloud flags',async()=>{
 const calls=[],blob=new Blob(['original']);
 const result=await readDocumentOriginal({clientDocumentId:'legacy-client',storagePath:'ignored/untrusted/path'},{readLocal:async()=>null,getAccessToken:async()=> 'synthetic-token',fetch:async(url,options)=>{calls.push({url,options});return {ok:true,status:200,blob:async()=>blob};}});
 assert.equal(result,blob);assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/documents/read-original');
 assert.deepEqual(JSON.parse(calls[0].options.body),{client_document_id:'legacy-client'});assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-token');assert.equal(calls[0].options.cache,'no-store');
});
test('a missing original or invalid identity stays unavailable instead of fabricating a file',async()=>{
 let requests=0;const deps={readLocal:async()=>null,getAccessToken:async()=> 'synthetic-token',fetch:async()=>{requests++;return {ok:false,status:404};}};
 assert.equal(await readDocumentOriginal({client_document_id:'not-found'},deps),null);assert.equal(requests,1);
 assert.equal(await readDocumentOriginal({id:'metadata-only',url:'https://example.invalid/foreign.pdf'},deps),null);
 assert.equal(await readDocumentOriginal({clientDocumentId:'../other-owner'},deps),null);assert.equal(requests,1);
});
test('local inline files need no cloud token and remote file URLs are never followed',async()=>{
 const blob=new Blob(['inline']),calls=[];
 const result=await readDocumentOriginal({clientDocumentId:'old-client',dataUrl:'data:application/pdf;base64,YQ=='},{readLocal:async()=>null,getAccessToken:()=>{throw Error('Unnecessary auth');},fetch:async url=>{calls.push(url);return {blob:async()=>blob};}});
 assert.equal(result,blob);assert.deepEqual(calls,['data:application/pdf;base64,YQ==']);
});
test('authentication failures remain explicit and never fall back to caller-selected storage paths',async()=>{
 let calls=0;const deps={readLocal:async()=>null,getAccessToken:async()=>null,fetch:async()=>{calls++;}};
 await assert.rejects(readDocumentOriginal({clientDocumentId:'client'},deps),/Sign in/);assert.equal(calls,0);
 for(const status of [401,403])await assert.rejects(readDocumentOriginal({clientDocumentId:'client',storage_path:'foreign/file.pdf'},{...deps,getAccessToken:async()=> 'synthetic',fetch:async url=>{assert.equal(url,'/api/documents/read-original');return {ok:false,status};}}),/Sign in/);
});

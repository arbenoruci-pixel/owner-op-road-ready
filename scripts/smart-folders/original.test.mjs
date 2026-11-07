import test from 'node:test';
import assert from 'node:assert/strict';
import {findAccountOriginal,readAccountDocumentOriginal} from './accountOriginal.js';
const file={__rrAccountFile:1,kind:'Blob',size:3,mime:'image/jpeg',chunks:[{sha256:'a'.repeat(64),bytes:3}]};
const records={'["table","document_blobs","blob-a"]':{client_document_id:'client-a',blob:file}};
test('opens an exact private account original using the active login and owner scope',async()=>{
 const blob=new Blob(['pod']),owners=[];
 const r=await readAccountDocumentOriginal('client-a',{getSession:async()=>({user:{id:'owner'}}),getWorkspace:async uid=>{owners.push(uid);return {user_id:uid,payload:{records}};},readFile:async(ref,{uid,check})=>{assert.deepEqual(ref,file);assert.equal(uid,'owner');await check();return blob;}});
 assert.equal(r.blob,blob);assert.deepEqual(owners,['owner']);assert.equal(r.signedIn,true);
});
test('a signed-in metadata-only POD reports absence instead of requesting another login',async()=>{
 const r=await readAccountDocumentOriginal('client-a',{getSession:async()=>({user:{id:'owner'}}),getWorkspace:async uid=>({user_id:uid,payload:{records:{}}}),readFile:()=>assert.fail()});
 assert.deepEqual(r,{signedIn:true,blob:null});
});
test('rejects account mismatch, account switches, malformed chunk paths and ambiguous originals',async()=>{
 const deps={getSession:async()=>({user:{id:'owner'}}),getWorkspace:async()=>({user_id:'other',payload:{records}}),readFile:()=>assert.fail()};
 await assert.rejects(readAccountDocumentOriginal('client-a',deps),/different account/);
 let n=0;await assert.rejects(readAccountDocumentOriginal('client-a',{...deps,getSession:async()=>({user:{id:++n===1?'owner':'other'}}),getWorkspace:async uid=>({user_id:uid,payload:{records}})}),/Account changed/);
 const bad={...file,chunks:[{sha256:'../someone',bytes:3}]};
 await assert.rejects(readAccountDocumentOriginal('client-a',{...deps,getWorkspace:async uid=>({user_id:uid,payload:{records:{'["table","document_blobs","b"]':{client_document_id:'client-a',blob:bad}}}})}),/incomplete/);
 assert.throws(()=>findAccountOriginal({...records,'["table","document_blobs","copy"]':{client_document_id:'client-a',blob:{...file,size:2}}},'client-a'),/conflicting/);
});
test('does not follow caller-selected URLs, filenames, hashes, or another document ID',()=>{
 assert.equal(findAccountOriginal(records,'other-id'),null);
 assert.equal(findAccountOriginal({'["business-array","documents"]':[{clientDocumentId:'client-a',url:'https://foreign.invalid',storagePath:'other/file'}]},'client-a'),null);
});
test('identical Blob and DataURL bytes are one original despite encoding metadata',async()=>{
 const dataUrl={chunks:file.chunks.map(c=>({bytes:c.bytes,sha256:c.sha256})),prefix:'data:image/jpeg;base64,',mime:file.mime,size:file.size,kind:'DataURL',__rrAccountFile:1};
 const copies={...records,'["business","documents","a"]':{clientDocumentId:'client-a',dataUrl}};
 const before=structuredClone(copies);
 assert.deepEqual(findAccountOriginal(copies,'client-a'),file);
 const blob=new Blob(['pod']);
 const result=await readAccountDocumentOriginal('client-a',{getSession:async()=>({user:{id:'owner'}}),getWorkspace:async uid=>({user_id:uid,payload:{records:copies}}),readFile:async ref=>{assert.deepEqual(ref,file);return blob;}});
 assert.equal(result.blob,blob);assert.deepEqual(copies,before);
});
test('same size originals with different bytes or chunk ordering remain conflicting',()=>{
 const chunk=(hash,bytes)=>({sha256:hash.repeat(64),bytes});
 for(const changed of [{...file,chunks:[chunk('b',3)]},{...file,chunks:[chunk('a',2),chunk('b',1)]}]){
  assert.throws(()=>findAccountOriginal({...records,'["business","documents","a"]':{clientDocumentId:'client-a',dataUrl:changed}},'client-a'),/conflicting/);
 }
 const split={...file,chunks:[chunk('a',1),chunk('b',2)]};
 assert.throws(()=>findAccountOriginal({'["table","document_blobs","a"]':{client_document_id:'client-a',blob:split},'["table","document_blobs","b"]':{client_document_id:'client-a',blob:{...split,chunks:[...split.chunks].reverse()}}},'client-a'),/conflicting/);
});

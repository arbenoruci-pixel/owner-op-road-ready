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

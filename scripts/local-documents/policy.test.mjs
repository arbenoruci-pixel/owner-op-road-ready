import test from 'node:test';import assert from 'node:assert/strict';
import {documentScope,containsOriginal,isDocumentRecord} from '../../lib/documents/localOriginalPolicy.js';
import {encode} from '../../lib/owner-op-cloud/accountFilesV110455.js';
import {visible} from '../../lib/owner-op-cloud/recordsCoreV110451.js';
const key=(...p)=>JSON.stringify(p),data='data:application/pdf;base64,b3JpZ2luYWw=';
test('all original forms and serialized recovery values are excluded; original-free records and log signatures retain their scope',()=>{
 for(const value of [new Blob(['original']),new Uint8Array([1]),{__rrAccountFile:1,chunks:[]},{attachmentDataUrl:data},JSON.stringify({previous:{photoDataUrl:data}})])assert.equal(containsOriginal(value),true);
 assert.equal(isDocumentRecord(key('book','driver','driverSignature'),{dataUrl:'data:image/png;base64,c2ln'}),false);
 assert.equal(isDocumentRecord(key('day','driver','2026-11-07'),{eventsByDay:[{status:'OFF'}],signatureByDay:{signatureDataUrl:'data:image/png;base64,c2ln'}}),false);
 const docs={[key('state','dotWallet')]:{documents:{license:{attachmentDataUrl:data}}}},cloud={[key('table','document_blobs','cloud')]:{__rrAccountFile:1,chunks:[]}},scope=documentScope(docs,cloud);
 assert.deepEqual(scope.filter({...docs,...cloud,[key('state','unit')]:'228'}),{[key('state','unit')]:'228'});
 assert.deepEqual(scope.preserve(docs,{[key('state','unit')]:'229'}),{...docs,[key('state','unit')]:'229'});assert.deepEqual(scope.preserve(cloud,{}),cloud);
});
test('encoder independently refuses original bytes before contacting storage',async()=>{
 let uploads=0;const opts={uid:'test',known:new Set(),storage:{upload(){uploads++;throw Error('network prohibited');}}};
 for(const value of [{attachmentDataUrl:data},new Blob(['file']),JSON.stringify({draft:{dataUrl:data}})])await assert.rejects(encode(value,opts),/originals are local/);
 assert.equal(uploads,0);assert.deepEqual(await encode({loadNo:'123',rate:1500},opts),{loadNo:'123',rate:1500});
});
test('search index strips files nested in serialized recovery rows',()=>{
 const v=visible({value:JSON.stringify({state:{dotWallet:{license:{attachmentDataUrl:data}}}})});
 assert.ok(!JSON.stringify(v).includes(data));assert.ok(JSON.stringify(v).includes('embeddedFile'));
});

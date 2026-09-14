import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentOriginalHandlerV110344} from './v110344/readOriginalDocumentV110344.js';

const bytes = new Uint8Array([37,80,68,70,45,49,46,52,10]);
function fixture(overrides = {}) {
  const calls = [];
  const doc = {driver_id:'driver-example', client_document_id:'client-example', storage_path:'driver-example/wallet/original.pdf', file_size_bytes:bytes.length, mime_type:'application/pdf', ...overrides.document};
  const query = {select:() => query, eq:(key,value) => {calls.push([key,value]);return query;}, maybeSingle:async() => ({data:overrides.missing ? null : doc})};
  const handler = createDocumentOriginalHandlerV110344({
    authenticate:async() => overrides.auth || {user:{id:'user-example'}},
    findDriver:async(...args) => {assert.equal(args.length,2,'read never requests profile creation');calls.push(['user',args[1]]);return overrides.driver || {driver:{id:'driver-example'}};},
    createAdmin:() => {calls.push(['admin']);return {from:name => {calls.push(['table',name]);return query;}, storage:{from:bucket => ({download:async path => {calls.push(['download',bucket,path]);return overrides.download || {data:new Blob([bytes])};}})}};},
  });
  const request = body => new Request('https://example.test/api/documents/read-original', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body || {client_document_id:'client-example',storage_path:'another-driver/private.pdf'})});
  return {handler, calls, request};
}
test('authenticated driver receives exact original, using server-owned path and private response', async() => {
  const f=fixture(), result=await f.handler(f.request());
  assert.equal(result.status,200);assert.deepEqual(new Uint8Array(await result.arrayBuffer()),bytes);
  assert.equal(result.headers.get('cache-control'),'private, no-store');
  assert.equal(result.headers.get('content-type'),'application/pdf');
  assert.ok(f.calls.some(c=>c[0]==='driver_id'&&c[1]==='driver-example'));
  assert.ok(f.calls.some(c=>c[0]==='client_document_id'&&c[1]==='client-example'));
  assert.deepEqual(f.calls.find(c=>c[0]==='download'),['download','driver-documents','driver-example/wallet/original.pdf']);
});
test('unauthenticated requests never reach privileged storage',async() => {
  const f=fixture({auth:{error:'invalid_token',status:401}});
  assert.equal((await f.handler(f.request())).status,401);assert.deepEqual(f.calls,[]);
});
for(const [name,options,status] of [
  ['invalid ID',{},400],
  ['unknown driver',{driver:{error:'not_found',status:403}},403],
  ['missing document',{missing:true},404],
  ['different document owner',{document:{driver_id:'another-driver'}},404],
  ['different storage owner',{document:{storage_path:'another-driver/wallet/file.pdf'}},403],
  ['path traversal',{document:{storage_path:'driver-example/../another-driver/file.pdf'}},403],
  ['oversized metadata',{document:{file_size_bytes:26*1024*1024}},413],
]) test(`${name} cannot fetch an original`,async() => {
  const f=fixture(options), result=await f.handler(f.request(name==='invalid ID'?{client_document_id:'../not-an-id'}:undefined));
  assert.equal(result.status,status);assert.equal(f.calls.some(c=>c[0]==='download'),false);
});
test('cloud failures and incomplete originals never return success bytes',async() => {
  for(const download of [{error:{message:'private provider detail'}},{data:new Blob(['short'])}]) {
    const f=fixture({download}), result=await f.handler(f.request());
    assert.equal(result.status,502);assert.doesNotMatch(await result.text(),/private provider detail/);
  }
});

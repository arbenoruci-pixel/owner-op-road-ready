import test from 'node:test';import assert from 'node:assert/strict';
import {createMicrosoftDocumentImport} from '../../lib/email-import/microsoft.js';
const attachment={id:'a/1','@odata.type':'#microsoft.graph.fileAttachment',name:'rate.pdf',contentType:'application/pdf',size:5,isInline:false,contentBytes:btoa('%PDF-')};
test('mail import reads only permitted attachments, keeps originals and rejects duplicates',async()=>{
  const calls=[],api=createMicrosoftDocumentImport({getAccessToken:async()=> 'synthetic',fetcher:async(url,options)=>{
    calls.push({url,options});assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
    if(url.includes('/attachments/'))return Response.json(attachment);
    if(url.includes('/attachments?'))return Response.json({value:[attachment,{...attachment,id:'inline',isInline:true},{...attachment,id:'link','@odata.type':'#microsoft.graph.referenceAttachment'},{...attachment,id:'exe',contentType:'application/x-msdownload'}]});
    return Response.json({value:[{id:'m/1',subject:'Rate confirmation',from:{emailAddress:{address:'broker@example.test'}}}]});
  }});
  const list=await api.list();assert.equal(list.items.length,1);assert.equal(list.items[0].name,'rate.pdf');
  const request={accountId:'account',messageId:'m/1',attachmentId:'a/1'},read=await api.read(request);
  assert.equal(await read.file.text(),'%PDF-');assert.equal(read.requiresReview,true);
  assert.equal((await api.read({...request,knownHashes:[read.provenance.sha256]})).duplicate,true);
  const before=calls.length;await assert.rejects(api.list({cursor:'https://external.test/collect'}));assert.equal(calls.length,before);
  assert.ok(calls.some(c=>c.url.includes('m%2F1/attachments/a%2F1')));assert.equal(JSON.stringify(read.provenance).includes('synthetic'),false);
});
test('mail authentication and inconsistent attachment bytes fail without saving',async()=>{
  const noSession=createMicrosoftDocumentImport({getAccessToken:async()=>null,fetcher:()=>assert.fail('must not fetch')});await assert.rejects(noSession.list(),/Connect Microsoft/);
  const api=createMicrosoftDocumentImport({getAccessToken:async()=> 'synthetic',fetcher:async()=>Response.json({...attachment,size:50})});
  await assert.rejects(api.read({accountId:'a',messageId:'m',attachmentId:'f'}),/size did not match/);
});

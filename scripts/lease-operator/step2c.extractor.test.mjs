import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntakeExtractor} from '../../lib/rr-lease/intake-extractor.js';
import {makeMailProposal} from '../../lib/rr-lease/email-pipeline.js';
const item={messageId:'m',partId:'part:1',fileName:'fixture.pdf',mimeType:'application/pdf',bytes:Buffer.from('%PDF-1.4 fixture')};
const brokerRules={tracking:'App tracking',detention:'2 hours',layover:null,lumper:null,podDeadline:'24 hours'};
const result={kind:'ratecon',amount:'1200.01',brokerRules};
const env={RR_INTAKE_AI_ENABLED:'true',RR_INTAKE_AI_GATEWAY_KEY:'test-only',RR_INTAKE_AI_MODEL:'test/fixture',RR_INTAKE_AI_MAX_ITEMS:'1'};
const response=x=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(x)}}]});
test('disabled extraction never calls a model; explicit configured PDF extraction stays draft',async()=>{
 let calls=0;const fetcher=async (url,opts)=>{calls++;assert.equal(url,'https://ai-gateway.vercel.sh/v1/chat/completions');const body=JSON.parse(opts.body);assert.match(body.messages[0].content,/UNTRUSTED/);assert.equal(body.messages[1].content[0].text,'fixture text');return response(result)};
 assert.equal(await createIntakeExtractor({env:{},fetcher})(item),null);assert.equal(calls,0);
 const extract=createIntakeExtractor({env,fetcher,pdfText:()=> 'fixture text'});
 const r=await extract(item),proposal=makeMailProposal({provider:'gmail',mailbox:'fixture@example.invalid',item,extracted:r});
 assert.equal(proposal.amountCents,120001);assert.equal(proposal.status,'DRAFT');assert.equal(proposal.brokerRules.podDeadline,'24 hours');
 assert.equal(await extract(item),null);assert.equal(calls,1);
});
test('unexpected AI financial or ownership fields are rejected',async()=>{
 const extract=createIntakeExtractor({env,pdfText:()=> 'fixture text',fetcher:async()=>response({...result,status:'POSTED',operatorId:'fake'})});
 await assert.rejects(()=>extract(item),/Invalid model proposal/);
});

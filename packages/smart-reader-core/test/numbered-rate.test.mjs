import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
import {numberedRateInput,numberedRateText} from './numbered-rate-fixture.mjs';
test('numbered Pay Items table and matching footer produce one RateCon with source values',()=>{
  const input=numberedRateInput(),before=JSON.stringify(input),result=readDocument(input),doc=result.documents[0];
  assert.equal(result.documents.length,1);assert.equal(doc.kind,'rate_confirmation');assert.equal(doc.reference,'24680');assert.equal(doc.pageIds.length,2);
  for(const [key,value]of Object.entries({loadNumber:'24680',totalRate:'1700.00',pickupDate:'2026-09-24',deliveryDate:'2026-09-25',documentDate:'2026-09-24',equipment:'Van',miles:'429'})){
    assert.equal(doc.fields[key].value,value,key);
    for(const c of doc.fields[key].candidates)for(const ref of c.evidence)assert.ok(resolveEvidence(result,ref));
  }
  assert.equal(doc.fields.pickupAddress.candidates[0].value,'120 Example Drive, Kingfield, ME 04947');
  assert.equal(doc.fields.deliveryAddress.candidates[0].value,'1 Sample Dr, Rockleigh, NJ 07647');
  assert.equal(doc.fields.shipper.status,'needs_review');assert.equal(doc.canAutoFile,false);assert.equal(JSON.stringify(input),before);
});
test('each independent table signal is required, and invoice instructions are insufficient',()=>{
  for(const text of ['LOAD CONFIRMATION','Pay Items','Total USD 1700.00','1 Pickup','2 Delivery']){
    const result=readDocument(numberedRateInput([numberedRateText[0].replace(text,'UNREADABLE')]));
    assert.notEqual(result.documents[0].kind,'rate_confirmation',text);
  }
});
test('another reference, broken pagination, weak footer, repeated primary and separate documents stay separate',()=>{
  for(const tail of [numberedRateText[1].replace('24680','24681'),numberedRateText[1].replace('Page 2','Page 3'),numberedRateText[1].replace('out of 2','out of 3'),numberedRateText[0], 'INVOICE\n'+numberedRateText[1],numberedRateText[1].replace(/Page 2.*/, '')])assert.equal(readDocument(numberedRateInput([numberedRateText[0],tail])).documents.length,2);
  const input=numberedRateInput();input.pages[1].observations[0].lines.at(-1).confidence=.5;
  assert.equal(readDocument(input).documents.length,2);
});
test('footer/header disagreements cannot join pages or select one load',()=>{
  const input=numberedRateInput();input.pages[0].observations[0].lines.find(l=>l.text==='Load # 24680').text='Load # 11111';
  const result=readDocument(input);assert.equal(result.documents.length,2);assert.equal(result.documents[0].fields.loadNumber.value,null);
});
test('no invented year when explicit full-year anchor is absent or conflicting',()=>{
  for(const text of [numberedRateText[0].replaceAll('2026','26'),numberedRateText[0].replace('Document Date 09/24/2026','Document Date 09/24/2027')]){
    const doc=readDocument(numberedRateInput([text])).documents[0];assert.equal(doc.fields.deliveryDate.value,null);
  }
});

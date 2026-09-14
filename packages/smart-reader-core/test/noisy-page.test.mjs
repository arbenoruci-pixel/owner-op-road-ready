import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
import {noisyPageInput} from './noisy-page-fixture.mjs';

test('noisy headings and complementary same-page reads recover three document types with exact evidence',()=>{
  const input=noisyPageInput(),before=structuredClone(input),result=readDocument(input);
  assert.deepEqual(result.documents.map(d=>d.kind),['bol','bol','unloading_receipt']);
  assert.ok(result.documents.every(d=>d.identityStatus==='needs_review'&&!d.canAutoFile));
  assert.ok(result.pageIdentities[1].evidence.some(v=>v.method==='combined_observations'));
  const origins=new Set();
  for(const identity of result.pageIdentities)for(const vote of identity.evidence)for(const e of [vote.evidence,...vote.supportingEvidence]){
    const {line}=resolveEvidence(result,e);assert.equal(e.quote,line.text);assert.equal(e.pageId,identity.pageId);
    if(identity.pageId==='p2')origins.add(e.observationId);
  }
  assert.equal(origins.size,2);assert.deepEqual(input,before);
});

test('repeated clues cannot replace missing structure or borrow it from another page',()=>{
  const input=noisyPageInput();input.pages=[input.pages[1]];
  const original=input.pages[0].observations[0],retry=input.pages[0].observations[1];
  input.pages[0].observations=[original,structuredClone({...original,id:'duplicate'})];
  assert.equal(readDocument(input).documents[0].kind,'unknown');
  input.pages.push({id:'unrelated',observations:[retry]});
  assert.ok(readDocument(input).documents.every(d=>d.kind==='unknown'));
});

test('instruction and negative prefixes never become a noisy heading',()=>{
  for(const prefix of ['No','Do','To','My','Attach','Please attach','See','Use','Send']){
    const input=noisyPageInput();input.pages=[input.pages[0]];
    input.pages[0].observations[0].lines.find(l=>l.text.startsWith('Xq')).text=prefix+' BILL OF LADING - NOT NEGOTIABLE';
    assert.equal(readDocument(input).documents[0].kind,'unknown',prefix);
  }
  const input=noisyPageInput();input.pages=[input.pages[0]];
  input.pages[0].observations[0].lines.find(l=>l.text.startsWith('Xq')).confidence=.99;
  assert.equal(readDocument(input).documents[0].kind,'unknown','confident words cannot be discarded as scan noise');
});

test('same-page conflicting classifications and numeric disagreements remain unresolved',()=>{
  const input=noisyPageInput();const first=input.pages[0];
  first.observations.push({...structuredClone(input.pages[2].observations[0]),id:'receipt-read'});input.pages=[first];
  assert.equal(readDocument(input).pageIdentities[0].status,'conflicting');
  const receipt=noisyPageInput();receipt.pages=[receipt.pages[2]];
  const retry=structuredClone(receipt.pages[0].observations[0]);retry.id='different-amount';retry.lines.find(l=>l.text==='$185.00').text='$18500';receipt.pages[0].observations.push(retry);
  const result=readDocument(receipt).documents[0];assert.equal(result.kind,'unloading_receipt');assert.equal(result.fields.total.value,null);assert.ok(result.fields.total.issues.includes('conflicting_reads'));
});

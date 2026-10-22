import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,textObservation,resolveEvidence} from '../src/index.js';

import {contractRateInput,title,stamp,first} from './contract-rate-fixture.mjs';

const read=(change=()=>{})=>{const input=contractRateInput();change(input);return readDocument(input);};
const setText=(page,replace)=>{page.observations[0]=textObservation(replace(page.observations[0].lines.map(l=>l.text).join('\n')));};

test('verbal carrier agreement and referenced schedule form one source-linked RateCon',()=>{
  const input=contractRateInput(),before=structuredClone(input),result=readDocument(input);
  assert.deepEqual(input,before);assert.equal(result.pageIdentities[0].kind,'rate_confirmation');
  assert.equal(result.pageIdentities[0].status,'supported');assert.equal(result.documents.length,1);
  const doc=result.documents[0];assert.deepEqual(doc.pageIds,['p1','p2','p3']);
  assert.equal(doc.kind,'rate_confirmation');assert.equal(doc.reference,'654321-0');
  assert.equal(doc.fields.totalRate.value,'4400.00');assert.equal(doc.fields.loadNumber.value,'654321-0');
  assert.equal(doc.canAutoFile,false);assert.equal(doc.requiresReview,true);
  for(const field of Object.values(doc.fields))for(const candidate of field.candidates)for(const evidence of candidate.evidence)resolveEvidence(result,evidence);
});

test('a long contract heading needs the price, counterparties and movement agreement in one read',()=>{
  for(const fragment of ['TOTAL: $ 4,400.00','as BROKER, and EXAMPLE CARRIER LLC, hereafter referred to as Common Carrier:','EXAMPLE TOWN, NY, will move at the following rate:']){
    const result=read(input=>setText(input.pages[0],text=>text.replace(fragment,'')));
    assert.equal(result.pageIdentities[0].kind,'unknown');
  }
  const result=read(input=>setText(input.pages[0],text=>text.replace(title,'Instructions: attach '+title)));
  assert.equal(result.pageIdentities[0].kind,'unknown');
});

test('separate observations cannot pool missing contract structure',()=>{
  const input=contractRateInput();input.pages=input.pages.slice(0,1);
  input.pages[0].observations=[textObservation(first.filter(line=>!line.startsWith('TOTAL:')).join('\n'),{id:'title-only'}),textObservation('TOTAL: $ 4,400.00',{id:'total-only'})];
  assert.equal(readDocument(input).documents[0].kind,'unknown');
});

test('different references, publication stamps, counts and missing page numbers stay separate',()=>{
  for(const [from,to] of [['654321-0','654322-0'],['4:21 PM','4:22 PM'],['Page 2 of 3','Page 2 of 4'],['Page 2 of 3','Page 3 of 3'],[`${stamp} Page 2 of 3`,'']]){
    const result=read(input=>setText(input.pages[1],text=>text.replace(from,to)));
    assert.deepEqual(result.documents[0].pageIds,['p1']);
  }
});

test('a reference-free tail needs the referenced schedule, matching footer and billing context',()=>{
  for(const replacement of [text=>text.replace('4:21 PM','4:22 PM'),text=>text.replace('<<< BILL TO INFORMATION >>> <<< DISPATCH INFORMATION >>>','Unrelated paperwork'),text=>text+'\nLoad #: 999999-0']){
    const result=read(input=>setText(input.pages[2],replacement));
    assert.deepEqual(result.documents[0].pageIds,['p1','p2']);
  }
});

test('a BOL or invoice heading on a later page keeps its boundary even with the same footer',()=>{
  for(const other of ['BILL OF LADING','STRAIGHT BILL OF LADING','INVOICE','PROOF OF DELIVERY']){
    const result=read(input=>setText(input.pages[2],text=>other+'\n'+text));
    assert.deepEqual(result.documents[0].pageIds,['p1','p2']);
  }
});

test('a repeated complete contract remains a separate document',()=>{
  const result=read(input=>{input.pages[1].observations=[textObservation(first.join('\n').replace('Page 1 of 3','Page 2 of 3'))];});
  assert.deepEqual(result.documents[0].pageIds,['p1']);assert.equal(result.documents[1].kind,'rate_confirmation');
});

test('an unresolved labeled load reference cannot be treated as a reference-free schedule tail',()=>{
  const result=read(input=>input.pages[2].observations[0].lines.unshift({id:'weak-reference',text:'Load #: 999999-0',confidence:.4}));
  assert.deepEqual(result.documents[0].pageIds,['p1','p2']);
});

test('conflicting totals are retained as a review conflict',()=>{
  const result=read(input=>setText(input.pages[0],text=>text.replace('TOTAL: $ 4,400.00','TOTAL: $ 4,400.00\nTOTAL: $ 4,500.00')));
  assert.equal(result.documents[0].fields.totalRate.value,null);assert.ok(result.documents[0].fields.totalRate.issues.includes('conflicting_reads'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,confirmField,exportCorrections} from '../src/index.js';
import {mixedPacketInput} from './mixed-packet-fixture.mjs';
import {normalizeValue} from '../src/profiles.js';

test('mixed pages keep BOL and unloading receipt fields and evidence separate',()=>{
  const result=readDocument(mixedPacketInput());
  assert.deepEqual(result.documents.map(d=>[d.kind,d.pageIds]),[['bol',['p1']],['bol',['p2']],['unloading_receipt',['p3']]]);
  assert.equal(result.pageCount,3);
  assert.deepEqual(result.documents[0].fields.shipper.candidates.map(c=>c.rawValue),['Example Foods Inc']);
  assert.deepEqual(result.documents[0].fields.carrier.candidates,[]);
  assert.deepEqual(result.documents[1].fields.shipper.candidates.map(c=>c.rawValue),['Northern Foods']);
  assert.deepEqual(result.documents[1].fields.carrier.candidates.filter(c=>c.value).map(c=>c.rawValue),['Example Logistics']);
  assert.equal(result.documents[1].identityStatus,'needs_review');
  const receipt=result.documents[2];
  assert.equal(receipt.fields.receiptNumber.value,'R-17');
  assert.equal(receipt.fields.receiptDate.value,'2026-07-17');
  assert.equal(receipt.fields.currency.value,null,'a dollar symbol alone does not establish the currency');
  assert.deepEqual(receipt.fields.total.candidates.map(c=>c.rawValue),['$185.00']);
  assert.equal(receipt.checks[0].status,'passed');
  for(const group of result.documents){
    assert.equal(group.canAutoFile,false);assert.equal(group.fields.gross,undefined);
    for(const field of Object.values(group.fields))for(const c of field.candidates)for(const e of [...c.evidence,...(c.labelEvidence||[])]){
      assert.ok(group.pageIds.includes(e.pageId));resolveEvidence(result,e);
    }
  }
  for(const vote of result.pageIdentities[1].evidence)for(const e of [vote.evidence,...vote.supportingEvidence])resolveEvidence(result,e);
});

test('ruling fragments can be skipped while unreadable text and addresses still stop a party proposal',()=>{
  for(const [name,text,height,confidence] of [['unreadable','garbled letters',.01,.2],['address','123 North Main Street',.01,.95]]){
    const input=mixedPacketInput();input.pages.splice(1);
    input.pages[0].observations[0].lines.push({text,box:{x:.07,y:.113,width:.25,height},confidence});
    const candidates=readDocument(input).documents[0].fields.shipper.candidates;
    assert.ok(!candidates.some(c=>c.rawValue==='Example Foods Inc'),name);
  }
  for(const raw of ['——','|','1234'])assert.equal(normalizeValue('party',raw).value,null);
  for(const raw of ['3M','GE','H&M','Élan Logistics','签运物流'])assert.equal(normalizeValue('party',raw).value,raw);
});

test('shipping structure needs every independent clue and receipt wording cannot classify generic bills',()=>{
  const input=mixedPacketInput();input.pages=[input.pages[1]];
  input.pages[0].observations[0].lines=input.pages[0].observations[0].lines.filter(l=>!l.text.startsWith('TOTAL NET WEIGHT'));
  assert.equal(readDocument(input).documents[0].kind,'unknown');
  const receipt=mixedPacketInput();receipt.pages=[receipt.pages[2]];
  receipt.pages[0].observations[0].lines=receipt.pages[0].observations[0].lines.filter(l=>l.text!=='LOAD DETAILS');
  assert.equal(readDocument(receipt).documents[0].kind,'unknown');
});

test('receipt arithmetic rechecks corrections and never borrows an amount from another page',()=>{
  let result=readDocument(mixedPacketInput());
  const edit=(key,raw)=>{
    const group=result.documents[2],field=group.fields[key];
    result=confirmField(result,{documentId:result.documentId,groupId:group.id,field:key,rawValue:raw,evidence:field.candidates[0].evidence[0],userConfirmed:true,expectedRevision:result.reviewRevision,expectedRawValues:field.candidates.map(c=>c.rawValue)});
  };
  edit('total','195.00');assert.equal(result.documents[2].checks[0].status,'needs_review');
  edit('fee','15.00');assert.equal(result.documents[2].checks[0].status,'passed');
  assert.equal(result.documents[2].fields.total.value,'195.00');
  assert.equal(result.documents[0].fields.total,undefined);
  assert.ok(exportCorrections(result).every(c=>c.trainingEligible===false&&c.evidence.pageId==='p3'));
  const input=mixedPacketInput();input.pages[2].observations[0].lines=input.pages[2].observations[0].lines.filter(l=>l.text!=='$5.00');
  assert.equal(readDocument(input).documents[2].checks[0].status,'not_checked');
});

test('separate receipts with reused IDs remain separate and conflicting OCR amounts stay unresolved',()=>{
  const input=mixedPacketInput(),copy=structuredClone(input.pages[2]);copy.id='p4';input.pages.push(copy);
  assert.equal(readDocument(input).documents.length,4);
  const retry=structuredClone(input.pages[2].observations[0]);retry.id='retry';retry.lines.find(l=>l.text==='$185.00').text='$195.00';
  input.pages[2].observations.push(retry);
  const receipt=readDocument(input).documents[2];assert.equal(receipt.fields.total.value,null);assert.ok(receipt.fields.total.issues.includes('conflicting_reads'));assert.equal(receipt.checks[0].status,'not_checked');
  for(const date of ['31-Feb-2026','07/14/2026 25:00:00','09/10/2026'])assert.equal(normalizeValue('date',date).value,null);
});

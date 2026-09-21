import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation} from '../src/index.js';
import {isDocumentParty,guardDocumentReading} from '../src/fieldGuards.js';
import {planPartyRegions} from '../src/partyRetry.js';
import {partyBlocksInput,partyBlockPasses} from './party-blocks-fixture.mjs';

test('freight boilerplate cannot become a carrier or consume the crop budget',()=>{
  const input=partyBlocksInput(),result=readDocument(input),carrier=result.documents[0].fields.carrier;
  assert.equal(carrier.status,'supported');assert.equal(carrier.value,'EXAMPLE TRANSPORT');
  assert.deepEqual(carrier.candidates.map(c=>c.rawValue),['EXAMPLE TRANSPORT']);
  assert.equal(isDocumentParty('garbled interest in the goods identified herein, and in'),false);
  assert.equal(guardDocumentReading({fields:{carrierName:'garbled interest in the goods identified herein, and in'}}).fields.carrierName,'');
  for(const name of ['Goods Identified Logistics LLC','Interest Transport Inc','Delivery of Goods LLC'])assert.equal(isDocumentParty(name),true);
  assert.equal(result.pages[0].observations[0].lines.some(line=>line.text.includes('goods identified herein')),true,'raw paragraph remains available');
});

test('two complete consignee blocks support the printed company and facility together',()=>{
  const input=partyBlocksInput(),before=structuredClone(input),result=readDocument(input),field=result.documents[0].fields.consignee;
  assert.equal(field.status,'supported');assert.equal(field.value,'REGIONAL MARKET / TOWN DEPOT #1-2');
  assert.deepEqual(field.issues,[]);assert.equal(field.candidates.length,1);
  const candidate=field.candidates[0];
  assert.equal(candidate.rawValue,'REGIONAL MARKET');assert.equal(candidate.value,'REGIONAL MARKET / TOWN DEPOT #1-2');
  assert.equal(candidate.evidence.length,3);assert.equal(candidate.continuationEvidence.length,3);
  for(const e of [...candidate.evidence,...candidate.labelEvidence,...candidate.continuationEvidence])resolveEvidence(result,e);
  assert.deepEqual(input,before);assert.equal(result.documents[0].canAutoFile,false);
});

test('different facilities and numbered parties retain conflicts and page boundaries',()=>{
  const first=partyBlocksInput(),second=partyBlocksInput({facility:'TOWN DEPOT #12'});
  const page=second.pages[0];page.id='page-2';
  const packet=readDocument({...first,pages:[first.pages[0],page]});assert.equal(packet.documents.length,2);
  const mixed=partyBlocksInput();mixed.pages[0].observations.push({...second.pages[0].observations[0],id:'different',sourceImageId:'other'});
  assert.ok(readDocument(mixed).documents[0].fields.consignee.issues.includes('conflicting_reads'));
});

test('a separate unproven fragment or another column remains a different reading',()=>{
  const input=partyBlocksInput();
  input.pages[0].observations.push(textObservation('TO: TOWN DEPOT #1-2',{id:'unproven-fragment'}));
  assert.ok(readDocument(input).documents[0].fields.consignee.issues.includes('conflicting_reads'),'no crop provenance means no silent alias');
  for(const mode of ['column','distant','no-boxes']){
    const other=partyBlocksInput();other.pages[0].observations.splice(1);
    const lines=other.pages[0].observations[0].lines,tail=lines.find(line=>line.text.startsWith('TO:'));
    if(mode==='column')tail.box.x=.65;
    if(mode==='distant')tail.box.y=.5;
    if(mode==='no-boxes')for(const line of lines)delete line.box;
    const field=readDocument(other).documents[0].fields.consignee;
    assert.ok(field.issues.includes('conflicting_reads'),mode);
    assert.equal(field.candidates.some(c=>c.continuationKind==='party_block'),false,mode);
  }
});

test('party rereads include separate labels and every company row on their own image',()=>{
  const passes=partyBlockPasses();
  passes[0].lines.find(line=>line.text.startsWith('CONSIGNED ')).confidence=70;
  const plans=planPartyRegions(passes);
  assert.equal(plans.length,2);assert.deepEqual(plans.map(p=>p.fieldLabel).sort(),['Consignee','Shipper']);
  const shipper=plans.find(p=>p.fieldLabel==='Shipper'),consignee=plans.find(p=>p.fieldLabel==='Consignee');
  assert.equal(shipper.pageSegMode,'7');assert.equal(consignee.pageSegMode,'6');
  assert.ok(shipper.region.left<=30&&shipper.region.left+shipper.region.width>=310);
  assert.ok(consignee.region.top<=240&&consignee.region.top+consignee.region.height>=269);
  assert.ok(consignee.region.left<=30&&consignee.region.left+consignee.region.width>=335);
  for(const plan of plans){assert.ok(plan.region.width*plan.region.height<=60000);assert.ok(passes.some(pass=>pass.id===plan.sourcePassId));}
  assert.deepEqual(planPartyRegions(passes.map(pass=>({...pass,scope:'region'}))),[]);
  const wrong=partyBlockPasses();for(const pass of wrong)pass.lines=pass.lines.filter(line=>line.text!=='FROM:');
  assert.equal(planPartyRegions(wrong).some(plan=>plan.fieldLabel==='Shipper'),false,'no separate label can be borrowed from another pass');
});

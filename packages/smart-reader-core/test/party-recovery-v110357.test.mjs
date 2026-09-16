import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
import {planPartyRegions} from '../src/partyRetry.js';
import {needsReadingRetry} from '../src/ocrRetry.js';
import {clearestCandidate} from '../src/reviewEvidence.js';

const row=(text,box,confidence=.95)=>({text,box,confidence});
const prefix=()=>row('Shipper: EXAMPLE MILLS,',{x:.05,y:.82,width:.18,height:.012});
const tail=()=>row('LLC #218',{x:.24,y:.82,width:.07,height:.01});
const observation=(id,lines)=>({id,sourceImageId:'image-'+id,lines:[row('BILL OF LADING'),row('BOL#: 123456-001'),row('TO: Example Receiver'),...lines]});
const whole=(value='EXAMPLE MILLS LLC #218')=>observation('whole',[row('Shipper: '+value,{x:.05,y:.82,width:.28,height:.012})]);
const read=observations=>readDocument({documentId:'party-recovery',pages:[{id:'page-1',observations}]});

test('a split legal suffix needs complete same-page corroboration and keeps both exact quotes',()=>{
  for(const reversed of [false,true]){
    const observations=[whole(),observation('split',[tail(),prefix()])];
    const original=structuredClone(observations),result=read(reversed?observations.reverse():observations),field=result.documents[0].fields.shipper;
    assert.equal(field.status,'supported');assert.match(field.value,/EXAMPLE MILLS,? LLC #218/);
    const split=field.candidates.find(c=>c.rawValue==='EXAMPLE MILLS,');
    assert.equal(split.value,'EXAMPLE MILLS, LLC #218');
    assert.equal(split.continuationEvidence[0].quote,'LLC #218');
    for(const candidate of field.candidates)for(const evidence of [...candidate.evidence,...(candidate.continuationEvidence||[])])resolveEvidence(result,evidence);
    assert.deepEqual(observations,reversed?original.reverse():original,'input text and boxes stay unchanged');
    assert.equal(result.documents[0].canAutoFile,false);
  }
});

test('geometry alone cannot accept a split company name',()=>{
  const field=read([observation('split',[prefix(),tail()])]).documents[0].fields.shipper;
  assert.equal(field.status,'needs_review');assert.equal(field.value,null);
  assert.equal(field.candidates[0].value,'EXAMPLE MILLS,');
});

test('suffix recovery rejects distant, cross-column, weak, ambiguous and intervening fragments',()=>{
  const cases=[
    [row('LLC #218',{x:.55,y:.82,width:.07,height:.01})],
    [row('LLC #218',{x:.24,y:.88,width:.07,height:.01})],
    [row('LLC #218',{x:.24,y:.82,width:.07,height:.01},.6)],
    [tail(),row('INC',{x:.245,y:.82,width:.04,height:.01})],
    [tail(),row('OTHER',{x:.231,y:.82,width:.008,height:.01})],
    [row('LLC #1-2',{x:.24,y:.82,width:.07,height:.01})],
  ];
  for(const fragments of cases){
    const field=read([whole(),observation('split',[prefix(),...fragments])]).documents[0].fields.shipper;
    assert.equal(field.status,'needs_review');assert.equal(field.value,null);
    assert.ok(field.issues.includes('conflicting_reads'));
  }
});

test('another page or a layout-only reading cannot corroborate the suffix',()=>{
  const second=observation('split',[prefix(),tail()]);
  const packet=readDocument({documentId:'packet',pages:[{id:'p1',observations:[whole()]},{id:'p2',observations:[second]}]});
  assert.equal(packet.documents.length,2);
  assert.equal(packet.documents[1].fields.shipper.status,'needs_review');
  const layout=observation('layout',[row('Shipper:',{x:.05,y:.2,width:.08,height:.01}),row('EXAMPLE MILLS LLC #218',{x:.14,y:.2,width:.25,height:.01})]);
  assert.equal(read([layout,second]).documents[0].fields.shipper.status,'needs_review');
});

export function partyPass(id,carrier,confidence=95){
  const lines=[['BILL OF LADING',40,95],['BOL#: 123456-001',80,95],['Shipper: Example Mills LLC',140,95],['TO: Example Receiver',180,95],[`Carrier: ${carrier}`,820,confidence]]
    .map(([text,top,confidence])=>({text,left:50,top,width:300,height:20,confidence}));
  return {id,text:lines.map(line=>line.text).join('\n'),imageSize:{width:1000,height:1000},lines,confidence:.95};
}

test('party retries select the weak exact-image line, are bounded, and do not recurse into crops',()=>{
  const passes=[partyPass('clean','TOTAL QUALITY LOGISTICS'),partyPass('sparse','TTA, QUALITY LOGISTICS',72)];
  assert.equal(needsReadingRetry(passes),true);
  const plans=planPartyRegions(passes);
  assert.equal(plans.length,1);assert.equal(plans[0].sourcePassId,'sparse');assert.equal(plans[0].fieldLabel,'Carrier');
  const box=plans[0].region;assert.ok(box.left<=50&&box.top<=820&&box.left+box.width>=350&&box.top+box.height>=840);
  assert.ok(box.width*box.height<=60000);
  assert.deepEqual(planPartyRegions([passes[0]]),[]);
  assert.deepEqual(planPartyRegions(passes.map(pass=>({...pass,scope:'region'}))),[]);
  assert.deepEqual(planPartyRegions(passes.map(({imageSize,...pass})=>pass)),[]);
  assert.deepEqual(planPartyRegions(passes.map(pass=>({...pass,imageSize:{width:5000,height:5000}}))),[]);
  const more=structuredClone(passes);more[1].lines[2].text='Shipper: Other Mills';more[1].lines[3].text='TO: Other Receiver';
  assert.equal(planPartyRegions(more).length,2);
});

test('additional clear crops never erase a different party or meaningful identifier',()=>{
  for(const [good,bad] of [['TOTAL QUALITY LOGISTICS','TTA, QUALITY LOGISTICS'],['ACME #1-2','ACME #12']]){
    const result=read([whole(),observation('a',[row('Carrier: '+good,undefined,.95)]),observation('b',[row('Carrier: '+bad,undefined,.72)]),observation('crop',[row('Carrier: '+good,undefined,.99)])]);
    const field=result.documents[0].fields.carrier;
    assert.equal(field.status,'needs_review');assert.equal(field.value,null);assert.equal(field.candidates.length,2);
    assert.ok(field.issues.includes('conflicting_reads'));assert.equal(result.documents[0].canAutoFile,false);
  }
});

test('clearest source selection prefers available direct evidence without mutating the conflict',()=>{
  const result=read([whole(),observation('weak',[row('Carrier: TTA, QUALITY LOGISTICS',undefined,.72)]),observation('strong',[row('Carrier: TOTAL QUALITY LOGISTICS',undefined,.96)])]);
  const field=result.documents[0].fields.carrier,before=structuredClone(field);
  assert.equal(clearestCandidate(field.candidates).candidate.value,'TOTAL QUALITY LOGISTICS');
  assert.equal(clearestCandidate(field.candidates,e=>e.observationId==='weak').candidate.value,'TTA, QUALITY LOGISTICS');
  assert.deepEqual(field,before);
});

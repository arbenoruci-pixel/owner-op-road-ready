import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
import {planPartyRegions} from '../src/partyRetry.js';
import {passObservation} from '../src/ocrRetry.js';
import {partyBlockPasses} from './party-blocks-fixture.mjs';

function blockPass(id,confidence){
  const pass=structuredClone(partyBlockPasses()[0]);
  pass.id=id;for(const line of pass.lines)line.confidence=confidence;
  return pass;
}
function carrierPass(id,value,confidence){
  const pass=blockPass(id,96);
  pass.lines=pass.lines.filter(line=>!line.text.startsWith('Carrier garbled'));
  Object.assign(pass.lines.find(line=>line.text.startsWith('CARRIER:')),{text:'CARRIER: '+value,confidence});
  return pass;
}
const planFor=(passes,label)=>planPartyRegions(passes).find(plan=>plan.fieldLabel===label);
const read=passes=>readDocument({documentId:'party-sources',pages:[{id:'page-1',observations:passes.map(passObservation)}]});

test('an identical wrapped proposal uses the clearest complete source in either pass order',()=>{
  const passes=[blockPass('weak',86),blockPass('clear',98),blockPass('medium',92)],before=structuredClone(passes);
  for(const order of [passes,[...passes].reverse()]){
    const plan=planFor(order,'Consignee');
    assert.equal(plan.sourcePassId,'clear');assert.equal(plan.pageSegMode,'6');
    assert.ok(plan.region.top<=240&&plan.region.top+plan.region.height>=267);
    assert.ok(plan.region.left<=30&&plan.region.left+plan.region.width>=335);
  }
  assert.deepEqual(passes,before,'planning never rewrites OCR text or its coordinates');
});

test('source quality includes labels and continuation rows, and unknown confidence is not certainty',()=>{
  const clear=blockPass('clear',94),weakTail=blockPass('weak-tail',99),unknown=blockPass('unknown',null);
  weakTail.lines.find(line=>line.text.startsWith('TO:')).confidence=62;
  assert.equal(planFor([weakTail,unknown,clear],'Consignee').sourcePassId,'clear');
  const weakLabel=structuredClone(partyBlockPasses()[1]);weakLabel.id='weak-label';
  for(const line of weakLabel.lines)line.confidence=99;
  weakLabel.lines.find(line=>line.text==='FROM:').confidence=60;
  assert.equal(planFor([weakLabel,clear],'Shipper').sourcePassId,'clear');
});

test('a weaker competing name keeps retry priority and uses its own clearest source',()=>{
  for(const [good,other] of [['ACME #1-2','ACME #12'],['H AND N TRANSPORT','HAND N TRANSPORT'],['REGIONAL MARKET','~~ REGIONAL MARKET']]){
    const passes=[carrierPass('majority',good,99),carrierPass('weak',other,65),carrierPass('weak-best',other,85)];
    // Required fields already have support, so the carrier can use a crop.
    for(const pass of passes)pass.lines=pass.lines.filter(line=>!['FROM:','NORTHERN FOODS'].includes(line.text));
    for(const pass of passes)pass.lines.push({text:'FROM: NORTHERN FOODS',left:30,top:190,width:300,height:12,confidence:98});
    const plan=planFor(passes,'Carrier');
    assert.equal(plan.sourcePassId,'weak-best');
    const result=read([...passes,{...carrierPass('retry',good,99),scope:'region'}]),field=result.documents[0].fields.carrier;
    assert.equal(field.status,'needs_review');assert.equal(field.value,null);
    assert.ok(field.issues.includes('conflicting_reads'));
    assert.deepEqual(new Set(field.candidates.map(candidate=>candidate.value)),new Set([good,other]));
    for(const candidate of field.candidates)for(const evidence of candidate.evidence)resolveEvidence(result,evidence);
    assert.equal(result.documents[0].canAutoFile,false);
  }
});

test('the selected source supplies its own coordinates and bounded retry budget',()=>{
  const weak=blockPass('weak',82),clear=blockPass('clear',98);
  for(const line of clear.lines)line.left+=200;
  const plans=planPartyRegions([weak,clear]);
  assert.equal(plans.length,2);
  const plan=plans.find(plan=>plan.fieldLabel==='Consignee');
  assert.equal(plan.sourcePassId,'clear');assert.ok(plan.region.left>200);
  assert.ok(plan.region.left<=230&&plan.region.left+plan.region.width>=535);
  for(const item of plans)assert.ok(item.region.width*item.region.height<=60000);
  assert.deepEqual(planPartyRegions([weak,clear].map(pass=>({...pass,scope:'region'}))),[]);
});

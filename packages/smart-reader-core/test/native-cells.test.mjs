import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
import {fieldsForProfile} from '../src/engine.js';
import {clearestEvidence} from '../src/reviewEvidence.js';
import {rateInput} from './rate-confirmation-fixture.mjs';

const cell=(id,text,x,y,width=.08,height=.012)=>({id,text,confidence:1,box:{x,y,width,height}});
function input(){
  const value=rateInput();
  value.pages[0].observations.push({id:'native-cells',source:'pdf-text-layer',sourceImageId:'synthetic-page',lines:[
    cell('pro','PRO #',.5,.03,.06),cell('load','86420',.6,.026,.08,.021),
    cell('type-label','Size & Type:',.07,.245,.09),cell('type','POWER ONLY',.18,.246,.08),
    cell('description','Description: SAMPLE',.4,.245,.22),cell('miles-label','Miles:',.7,.245,.044),cell('miles','987',.78,.246,.04),
    cell('weight-label','Weight:',.436,.26,.055),cell('weight','12000',.51,.261,.04),
    cell('haul','\x02 LINE HAUL RATE',.03,.3,.14),cell('haul-amount','2300.00 \x02',.31,.3,.066),
    cell('total-label','\x02 TOTAL RATE',.03,.37,.1),cell('rule','\x02',.26,.372,.008,.008),cell('total','2300.00 \x02',.31,.37,.066),
  ]});return value;
}
const positioned=result=>result.documents[0].fields.totalRate.candidates.flatMap(c=>c.evidence).filter(e=>e.box);
function resolveAll(result){for(const doc of result.documents)for(const field of Object.values(doc.fields))for(const c of field.candidates)
  for(const e of [...c.evidence,...c.labelEvidence||[],...c.continuationEvidence||[]])resolveEvidence(result,e);}

test('split native cells add exact highlights while preserving independently supported decisions',()=>{
  const source=input(),snapshot=JSON.stringify(source),before=readDocument(rateInput()),result=readDocument(source),fields=result.documents[0].fields;
  for(const key of ['loadNumber','totalRate','equipment','miles','weight']){
    assert.equal(fields[key].status,before.documents[0].fields[key].status);
    assert.equal(fields[key].value,before.documents[0].fields[key].value);
    assert.deepEqual(fields[key].issues,before.documents[0].fields[key].issues);
    assert.ok(clearestEvidence(fields[key].candidates.flatMap(c=>c.evidence)).box,key);
  }
  const amount=clearestEvidence(fields.totalRate.candidates[0].evidence);
  assert.equal(amount.lineId,'total');assert.equal(amount.quote,'2300.00');assert.equal(amount.box.y,.37);
  assert.equal(amount.end,7,'trailing table glyph is outside the value quote');
  assert.equal(fields.weight.value,null);assert.ok(fields.weight.issues.includes('weight_unit_required'));
  assert.equal(result.documents[0].canAutoFile,false);assert.equal(JSON.stringify(source),snapshot);resolveAll(result);
});

test('native cells cannot cross rows, intervening labels, missing boxes, observations or conflicting cell positions',()=>{
  for(const change of [
    (o,line)=>{line('total').box.y=.42;},
    (o,line)=>{line('total-label').text='OTHER CHARGES';},
    (o,line)=>{line('total').text='2300.00 Unit # 7';},
    (o,line)=>{line('total').text='23\x0000.00';},
    o=>{o.source='existing-phone-ocr';},
    o=>{o.lines.forEach(l=>delete l.box);},
    o=>{o.lines.push(cell('intervening','Pieces:',.2,.37,.05));},
    o=>{o.lines.push(cell('overlap','9999.00',.311,.37,.06));},
  ]){
    const source=input(),o=source.pages[0].observations[1];change(o,id=>o.lines.find(l=>l.id===id));
    assert.equal(positioned(readDocument(source)).length,0);
  }
  const source=input(),o=source.pages[0].observations[1],amount=o.lines.find(l=>l.id==='total');
  o.lines=o.lines.filter(l=>l!==amount);source.pages[0].observations.push({...o,id:'other-native-read',lines:[amount]});
  assert.equal(positioned(readDocument(source)).length,0);
});

test('geometry-only and weak-label proposals remain reviewable and a different total remains a conflict',()=>{
  const source=input(),page=source.pages[0];page.observations.shift();
  let field=fieldsForProfile([page],'rate_confirmation').totalRate;
  assert.equal(field.status,'needs_review');assert.equal(field.value,null);assert.equal(field.candidates[0].value,'2300.00');
  page.observations[0].lines.find(l=>l.id==='total-label').confidence=.4;
  field=fieldsForProfile([page],'rate_confirmation').totalRate;assert.ok(field.issues.includes('weak_recognition'));
  const conflict=input();conflict.pages[0].observations[1].lines.find(l=>l.id==='total').text='2400.00';
  field=readDocument(conflict).documents[0].fields.totalRate;assert.equal(field.value,null);assert.ok(field.issues.includes('conflicting_reads'));
});

function certificate(){return {id:'certificate',observations:[{id:'native',source:'pdf-text-layer',sourceImageId:'certificate-page',lines:[
  cell('title','CERTIFICATE OF COMPLETION',.06,.04,.3),
  cell('ref-label','REF. NUMBER',.06,.13,.09,.008),cell('date-label','DOCUMENT COMPLETED BY ALL PARTIES ON',.6,.13,.34,.008),
  cell('ref','SYNTHETIC-REFERENCE',.06,.145,.21),cell('date','16 SEP 2026 18:30:00',.73,.145,.21),
  cell('signer','SIGNER TIMESTAMP SIGNATURE',.06,.2,.4),cell('signed','SIGNED',.4,.3,.08),cell('signer-date','15 SEP 2026 10:00:00',.4,.32,.21),
]}]};}

test('separate completion columns retain reference and date boxes without choosing a signer timestamp',()=>{
  const source=rateInput();source.pages.push(certificate());const result=readDocument(source),doc=result.documents[1];
  assert.equal(doc.kind,'signing_certificate');assert.equal(doc.fields.documentReference.candidates[0].value,'SYNTHETIC-REFERENCE');
  assert.equal(doc.fields.date.candidates[0].value,'2026-09-16');assert.equal(doc.fields.date.status,'needs_review');
  assert.equal(clearestEvidence(doc.fields.date.candidates[0].evidence).lineId,'date');
  assert.equal(result.documents[0].fields.pickupDate.candidates[0].value,'2026-09-16');resolveAll(result);
});

test('missing, misaligned and weak completion context cannot establish a century',()=>{
  for(const change of [
    lines=>{lines.find(l=>l.id==='date-label').text='SIGNED ON';},
    lines=>{lines.find(l=>l.id==='date').box.y=.32;},
    lines=>{lines.find(l=>l.id==='ref').box.y=.18;},
    lines=>{lines.find(l=>l.id==='date-label').confidence=.4;},
    lines=>{lines.find(l=>l.id==='date').confidence=.4;},
    lines=>{lines.push(cell('alternative-date','17 SEP 2026 18:30:00',.72,.145,.21));},
  ]){
    const source=rateInput(),cert=certificate();change(cert.observations[0].lines);source.pages.push(cert);
    assert.equal(readDocument(source).documents[0].fields.pickupDate.candidates[0].value,null);
  }
  const source=rateInput(),cert=certificate();cert.observations[0].source='existing-phone-ocr';source.pages.push(cert);
  assert.equal(readDocument(source).documents[1].fields.date.status,'missing');
});

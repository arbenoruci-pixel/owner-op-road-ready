import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
import {normalizeValue,PROFILES} from '../src/profiles.js';
import {fieldMatches} from '../src/layout.js';
import {bolWeightColumnsInput as fixture} from './bol-weight-columns-fixture.mjs';
const field=input=>readDocument(input).documents[0].fields.weight;
test('BOL table reads numeric value below weight, never adjacent CHARGES or freight class',()=>{
 const input=fixture(),before=structuredClone(input),result=readDocument(input),weight=result.documents[0].fields.weight;
 assert.equal(result.documents[0].kind,'bol');assert.deepEqual(weight.candidates.map(c=>c.rawValue),['31,246']);
 assert.equal(weight.value,null);assert.equal(weight.status,'needs_review');assert.equal(weight.candidates[0].unit,null);
 assert.ok(weight.issues.includes('weight_unit_required'));
 for(const c of weight.candidates)for(const e of [...c.evidence,...c.labelEvidence])assert.ok(resolveEvidence(result,e));
 assert.deepEqual(input,before);assert.equal(result.documents[0].canAutoFile,false);
});
test('damaged/missing Class heading cannot widen the weight column into its 60 value',()=>{
 const input=fixture();input.pages[0].observations[0].lines.find(l=>l.text==='Class').text='(SUBJECT TO CORRECTION) [Class';
 assert.deepEqual(field(input).candidates.map(c=>c.rawValue),['31,246']);
});
test('table geometry with an explicit unit stays reviewable, not automatically accepted',()=>{
 const input=fixture();const cell=input.pages[0].observations[0].lines.find(l=>l.text==='31,246');cell.text='31,246 LBS';cell.box.width=.075;
 const weight=field(input);assert.equal(weight.candidates[0].value,'31246 LB');assert.equal(weight.value,null);assert.equal(weight.status,'needs_review');
});
test('merged weight/class cells are not split into invented source ranges',()=>{
 const input=fixture();const lines=input.pages[0].observations[0].lines;const cell=lines.find(l=>l.text==='31,246');cell.text='31,246 60';cell.box.width=.16;
 assert.equal(field(input).candidates.length,0);
});
test('different numeric weight observations remain conflicting',()=>{
 const input=fixture(),second=structuredClone(input.pages[0].observations[0]);second.id='second';second.sourceImageId='other-read';second.lines.find(l=>l.text==='31,246').text='31,248';input.pages[0].observations.push(second);
 const weight=field(input);assert.equal(weight.value,null);assert.ok(weight.issues.includes('conflicting_reads'));assert.deepEqual(weight.candidates.map(c=>c.rawValue),['31,246','31,248']);
});
test('missing geometry does not attach the neighboring number to weight',()=>{
 const input=fixture();for(const l of input.pages[0].observations[0].lines)delete l.box;
 const result=readDocument(input);assert.ok(result.documents.every(d=>!d.fields.weight?.candidates.length));
});
test('readable short dates explicitly require date order and full year review',()=>{
 assert.deepEqual(normalizeValue('ship_date','10-08-26','DATE'),{value:null,issue:'short_date_requires_review'});
 assert.deepEqual(normalizeValue('ship_date','99-99-26','DATE'),{value:null,issue:'invalid_date'});
 const date=readDocument(fixture()).documents[0].fields.documentDate;
 assert.equal(date.value,null);assert.equal(date.candidates[0].rawValue,'10-08-26');assert.ok(date.issues.includes('short_date_requires_review'));
});

test('numeric row guard preserves pipe and brace-wrapped source values',()=>{
 const spec=PROFILES.find(p=>p.id==='bol').fields.weight;
 for(const text of ['| 42,000 LBS |','{ 42,000 LBS }']){
  const rows=[{text:'WEIGHT',confidence:.96,box:{x:.1,y:.4,width:.08,height:.015}},
   {text,confidence:.96,box:{x:.2,y:.4,width:.2,height:.015}}];
  const matches=fieldMatches(rows,spec);assert.equal(matches.length,1,text);
  const match=matches[0];assert.equal(match.line.text.slice(match.start,match.end),'42,000 LBS');
  assert.equal(match.supportMethod,'aligned_measurement_row');
 }
 const words=[{text:'WEIGHT',confidence:.96,box:{x:.1,y:.4,width:.08,height:.015}},
  {text:'| CHARGES |',confidence:.96,box:{x:.2,y:.4,width:.2,height:.015}}];
 assert.equal(fieldMatches(words,spec).length,0);
});

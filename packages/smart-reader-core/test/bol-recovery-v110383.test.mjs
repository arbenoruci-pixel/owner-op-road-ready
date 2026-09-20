import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
import {planBolIdentifierRegion} from '../src/ocrRetry.js';
const row=(text,x,y,width=.3)=>({text,confidence:.96,box:{x,y,width,height:.013}});
function input(){return {documentId:'damaged-shipping-label',pages:[{id:'page',observations:[{id:'sparse',sourceImageId:'paper',lines:[
  row('CARRIER:',.03,.17,.08),row('EXAMPLE TRANSPORT',.16,.17),
  row('FROM:',.03,.20,.08),row('EXAMPLE FOODS',.16,.20),
  row('CONSIGNED',.03,.25,.09),row('REGIONAL MARKET',.16,.25),
  row('TO:',.06,.265,.04),row('TOWN DEPOT',.16,.265),
  row('TOTAL NET WEIGHT:',.48,.84,.2),row('3,373.90',.74,.84,.15),
  row('TOTAL WEIGHT:',.48,.86,.2),row('3,936.84)',.74,.86,.15),
  row('OTAL UNITS: 331',.03,.84,.3),row('OTAL TARE: 562.94',.03,.86,.3),
  row('The original bill of Iading',.03,.94,.5)
]}]}]};}
test('a confusable BOL footer recovers shipping structure with exact source proof',()=>{
  const original=input(),snapshot=JSON.stringify(original),result=readDocument(original),group=result.documents[0];
  assert.equal(group.kind,'bol');assert.equal(group.identityStatus,'needs_review');
  assert.equal(group.fields.shipper.candidates[0].value,'EXAMPLE FOODS');assert.equal(group.fields.carrier.candidates[0].value,'EXAMPLE TRANSPORT');
  assert.equal(group.fields.bolNumber.status,'missing');assert.equal(group.fields.bolNumber.value,null);
  assert.equal(group.fields.weight.candidates[0].numericValue,'3936.84');assert.equal(group.canAutoFile,false);
  assert.equal(group.fields.totalUnits.candidates[0].value,'331');assert.equal(group.fields.totalUnits.status,'needs_review');
  assert.ok(group.fields.totalUnits.issues.includes('damaged_label'));assert.equal(group.fields.tareWeight.candidates[0].numericValue,'562.94');
  const evidence=result.pageIdentities[0].evidence.flatMap(v=>[v.evidence,...v.supportingEvidence]);
  assert.ok(evidence.some(e=>e.quote==='The original bill of Iading'));
  evidence.forEach(e=>resolveEvidence(result,e));assert.equal(JSON.stringify(original),snapshot);
});
test('damaged legal prose remains separate from a real carrier name',()=>{
  const v=input(),lines=v.pages[0].observations[0].lines;
  lines.push({...row('Carrier ackn om edges a0 agrems thas (',.03,.13,.5),confidence:.47});
  const field=readDocument(v).documents[0].fields.carrier;
  assert.deepEqual(field.candidates.map(c=>c.value),['EXAMPLE TRANSPORT']);
  assert.ok(!field.issues.includes('conflicting_reads'));
});
test('footer text alone, missing structure and unrelated I-letter words cannot classify a BOL',()=>{
  for(const marker of ['CARRIER:','FROM:','CONSIGNED']){
    const v=input();v.pages[0].observations[0].lines=v.pages[0].observations[0].lines.filter(l=>l.text!==marker);
    assert.equal(readDocument(v).documents[0].kind,'unknown');
  }
  const v=input();v.pages[0].observations[0].lines.at(-1).text='See bill of Iading instructions';
  assert.equal(readDocument(v).documents[0].kind,'unknown');
  v.pages[0].observations[0].lines=v.pages[0].observations[0].lines.slice(-1);
  v.pages[0].observations[0].lines[0].text='The original bill of Iading';
  assert.equal(readDocument(v).documents[0].kind,'unknown');
});
const word=(text,left,top,width=60)=>({text,left,top,width,height:20});
test('BA NO with neighboring digits and shipping context requests only a bounded diagnostic crop',()=>{
  const words=[word('BA',750,110,30),word('NO:',789,110,32),word('0012345000',835,104,140),word('CARRIER:',40,250,120)];
  const size={width:1000,height:1300},box=planBolIdentifierRegion(words,size);
  assert.ok(box);assert.ok(box.left<=750&&box.left+box.width>=975);assert.ok(box.width*box.height<=1000*1300*.06);
  assert.equal(planBolIdentifierRegion(words.slice(0,3),size),null);
  assert.equal(planBolIdentifierRegion(words.filter(w=>w.text!=='NO:'),size),null);
  assert.equal(planBolIdentifierRegion(words.map(w=>w.text==='0012345000'?{...w,text:'2026'}:w),size),null);
  assert.equal(planBolIdentifierRegion([...words,word('previous',635,110,90)],size),null);
  assert.equal(planBolIdentifierRegion(words.map(w=>({...w,top:w.top+500})),size),null);
});

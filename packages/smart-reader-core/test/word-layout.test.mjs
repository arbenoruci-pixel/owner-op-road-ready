import test from 'node:test';
import assert from 'node:assert/strict';
import {separateWordColumns} from '../src/wordLayout.js';
import {readDocument,resolveEvidence,textObservation} from '../src/index.js';
import {needsReadingRetry,planBolIdentifierRegion} from '../src/ocrRetry.js';
import {wordLayoutFixture} from './word-layout-fixture.mjs';
const observation=pass=>({id:pass.id,sourceImageId:'page-image',lines:separateWordColumns(pass.lines,pass.words,pass.imageSize).map(l=>({text:l.text,confidence:l.confidence/100,box:{x:l.left/1000,y:l.top/1000,width:l.width/1000,height:l.height/1000}}))});

test('word gaps separate shipping columns without adding, dropping or changing words',()=>{
  const pass=wordLayoutFixture(),before=structuredClone(pass),lines=separateWordColumns(pass.lines,pass.words,pass.imageSize);
  assert.equal(lines.map(l=>l.text).join(' '),pass.lines.map(l=>l.text).join(' '));assert.deepEqual(pass,before);
  const r=readDocument({documentId:'columns',pages:[{observations:[observation(pass)]}]}),doc=r.documents[0];
  assert.equal(doc.kind,'bol');assert.equal(doc.fields.bolNumber.value,'B-17');assert.equal(doc.fields.poNumber.value,'ORDER-77');
  for(const [key,value] of [['shipper','Example Foods Inc.'],['consignee','Example Market'],['carrier','Example Logistics']])assert.ok(doc.fields[key].candidates.some(c=>c.value===value),key);
  assert.ok(Object.values(doc.fields).every(f=>f.candidates.every(c=>!c.value?.includes('SALES ORDER'))));
  const e=doc.fields.bolNumber.candidates[0].evidence[0];assert.equal(e.quote,'B-17');assert.ok(e.box.x>.5);resolveEvidence(r,e);
});

test('missing or mismatched word data keeps every original line intact',()=>{
  const pass=wordLayoutFixture();
  assert.deepEqual(separateWordColumns(pass.lines,[],pass.imageSize),pass.lines);
  assert.deepEqual(separateWordColumns(pass.lines,pass.words,{}),pass.lines);
  const words=pass.words.filter(w=>w.line!==2||w.text!=='Bill');
  assert.ok(separateWordColumns(pass.lines,words,pass.imageSize).some(l=>l.text===pass.lines[1].text));
  const invalid=pass.words.map(w=>({...w,left:1001}));assert.deepEqual(separateWordColumns(pass.lines,invalid,pass.imageSize),pass.lines);
});

test('a wide gap cannot erase historical qualifiers, date context or instructions',()=>{
  for(const prefix of ['Previous','Prior','Attach','Copy of','Printed','Delivery','Arrival','Revision']){
    const word=(text,left,i)=>({text,left,top:100,width:text.length*6,height:12,confidence:96,page:1,block:1,paragraph:1,line:1,word:i});
    const words=[word(prefix,50,1),word('BOL',500,2),word('NO:',524,3),word('B-22',548,4)];
    const line={text:words.map(w=>w.text).join(' '),left:50,top:100,width:522,height:12,confidence:96};
    assert.deepEqual(separateWordColumns([line],words,{width:1000,height:1000}),[line],prefix);
  }
});

test('damaged BOL labels offer exact header evidence with an explicit review requirement',()=>{
  for(const label of ['BALNO:','BL NO.:']){
    const base=textObservation('BILL OF LADING\nSHIP FROM: Example Foods\nSHIP TO: Example Market');
    base.sourceImageId='full-page';base.lines.push({text:label+' B-22',box:{x:.5,y:.1,width:.3,height:.02},confidence:.9});
    const input={documentId:'damaged-label',pages:[{observations:[base]}]},r=readDocument(input),field=r.documents[0].fields.bolNumber;
    assert.equal(field.value,null);assert.ok(field.issues.includes('label_needs_review'));assert.equal(field.candidates[0].value,'B-22');resolveEvidence(r,field.candidates[0].evidence[0]);
    base.lines.at(-1).text='Previous '+label+' B-22';assert.equal(readDocument(input).documents[0].fields.bolNumber.candidates.length,0);
    base.lines.at(-1).text=label+' B-22';base.lines.at(-1).box.y=.8;assert.equal(readDocument(input).documents[0].fields.bolNumber.candidates.length,0);
  }
});

test('retry coverage catches confident incomplete OCR while complete fields need no extra pass',()=>{
  assert.equal(needsReadingRetry([{text:'Company letter',confidence:.99}]),true);
  const text='INVOICE\nInvoice No: INV-12\nSubtotal: 100.00\nTax: 5.00\nTotal: 105.00\nCurrency: USD';
  assert.equal(needsReadingRetry([{text,confidence:.99}]),false);
  assert.equal(needsReadingRetry([{text:text.replace('Total: 105.00',''),confidence:.99}]),true);
});

test('an incomplete B/L label keeps a numeric proposal uncertain and preserves conflicting digits',()=>{
  const base=textObservation('BILL OF LADING\nSHIP FROM: Example Foods\nSHIP TO: Example Market');base.sourceImageId='source';
  base.lines.push({text:'BAL 00991234',box:{x:.7,y:.1,width:.2,height:.02},confidence:.85});
  const input={documentId:'label-fragment',pages:[{observations:[base]}]};
  const first=readDocument(input).documents[0].fields.bolNumber;assert.equal(first.value,null);assert.equal(first.candidates[0].value,'00991234');assert.ok(first.issues.includes('label_needs_review'));
  const retry=structuredClone(base);retry.id='retry';retry.lines.at(-1).text='B/L NO: 00991284';input.pages[0].observations.push(retry);
  const field=readDocument(input).documents[0].fields.bolNumber;assert.equal(field.value,null);assert.ok(field.issues.includes('conflicting_reads'));
  base.lines.at(-1).text='BAL department 00991234';input.pages[0].observations=[base];assert.equal(readDocument(input).documents[0].fields.bolNumber.candidates.length,0);
});

test('identifier rereads are small source-bound header regions and exclude prior references',()=>{
  const word=(text,left)=>({text,left,top:100,width:text.length*7,height:20});
  const words=[word('BAL',700),word('NO.:',735),word('00991234',780)];
  const region=planBolIdentifierRegion(words,{width:1000,height:1000});
  assert.ok(region.left<700&&region.left+region.width>836&&region.height<60);
  assert.equal(planBolIdentifierRegion([word('Previous',620),...words],{width:1000,height:1000}),null);
  assert.equal(planBolIdentifierRegion(words.map(w=>({...w,top:700})),{width:1000,height:1000}),null);
  assert.equal(planBolIdentifierRegion([words[0]],{width:1000,height:1000}),null);
  assert.equal(planBolIdentifierRegion(words.map(w=>({...w,left:-1})),{width:1000,height:1000}),null);
});

test('shipping blocks ignore off-column artifacts while retaining a real unreadable first row',()=>{
  const pass=wordLayoutFixture(),o=observation(pass),label=o.lines.find(l=>l.text==='SHIP TO');
  o.lines.push({text:'“d',confidence:0,box:{x:.44,y:.195,width:.01,height:.014}},
    {text:'i',confidence:.6,box:{x:.28,y:.2002,width:.01,height:.001}});
  const input={documentId:'block-artifacts',pages:[{observations:[o]}]};
  assert.equal(readDocument(input).documents[0].fields.consignee.candidates[0].value,'Example Market');
  o.lines.push({text:'unreadable company',confidence:.1,box:{x:.05,y:label.box.y+.015,width:.18,height:.012}});
  assert.ok(!readDocument(input).documents[0].fields.consignee.candidates.some(c=>c.value==='Example Market'));
});

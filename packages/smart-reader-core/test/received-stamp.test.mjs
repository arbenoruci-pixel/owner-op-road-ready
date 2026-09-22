import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation} from '../src/index.js';

// Anonymous layout modeled on a received-stamp report; no customer scan data.
const line=(id,text,x,y,width=.3,confidence=.95)=>({id,text,confidence,box:{x,y,width,height:.015}});
const observation=()=>({id:'page-read',source:'fixture',sourceImageId:'original-page',lines:[
  line('heading','ALTERNATE STRAIGHT BILL OF LADING - SHORT FORM',.1,.02,.7),
  line('from','Ship From: EXAMPLE DISTRIBUTION',.6,.13),
  line('to','Ship To:',.06,.15),
  line('consignee','Consignee:',.06,.18,.075),
  line('company','REGIONAL FOODS OF CONNECTICUT',.155,.18,.3),
  line('shipper','Shipper:',.6,.18,.075),
  line('shipper-name','EXAMPLE DISTRIBUTION',.7,.18,.27),
  line('weight','Total Weight: 1200 LB',.1,.37),
  line('received','RECEIVED',.68,.50,.145),
  line('stamp-company','REGIONAL FOODS OF CT',.66,.525,.2),
  line('cases','CASES: 120',.64,.55),
  line('date','Date: 07/10/2026',.64,.575),
  line('signature','SIGNATURE J. DOE',.64,.60,.24,.45),
  line('boilerplate','RECEIVED, subject to the classifications and tariffs in effect',.04,.84,.9),
]});
const read=(...observations)=>readDocument({documentId:'received-stamp',pages:[{id:'p1',observations}]});

test('named received stamp and filled generic signature refine BOL with source review required',()=>{
  const input=observation(),result=read(input);
  assert.equal(result.pageIdentities[0].kind,'pod');
  assert.equal(result.pageIdentities[0].status,'needs_review');
  assert.equal(result.documents[0].canAutoFile,false);
  const quotes=[];
  for(const vote of result.pageIdentities[0].evidence)for(const e of [vote.evidence,...vote.supportingEvidence]){
    resolveEvidence(result,e);quotes.push(e.quote);
  }
  for(const text of ['RECEIVED','REGIONAL FOODS OF CT','SIGNATURE J. DOE','Consignee:'])assert.ok(quotes.includes(text),text);
  // Even high-confidence text is not visual verification of a signature.
  input.lines.find(l=>l.id==='signature').confidence=.99;
  assert.equal(read(input).pageIdentities[0].status,'needs_review');
});

test('stamp survives the inline consignee and merged time-row OCR layout',()=>{
  const input=observation();
  input.lines=input.lines.filter(l=>l.id!=='company');
  input.lines.find(l=>l.id==='consignee').text='Consignee: REGIONAL FOODS OF CONNECTICUT';
  Object.assign(input.lines.find(l=>l.id==='received'),{text:'IN 10:00 OUT 12:00 PM RECEIVED',box:{x:.16,y:.489,width:.67,height:.03},confidence:.47});
  assert.equal(read(input).pageIdentities[0].kind,'pod');
});

test('receiver labels tolerate a missing colon and final E/S OCR confusion with the same geometry guards',()=>{
  for(const label of ['Consignee','Consignes:']){
    const input=observation();input.lines.find(l=>l.id==='consignee').text=label;
    assert.equal(read(input).pageIdentities[0].kind,'pod');
    input.lines.find(l=>l.id==='company').box.y=.26;
    assert.equal(read(input).pageIdentities[0].kind,'bol');
  }
});

test('blank, pickup, unrelated-company and misplaced signature marks remain BOL',()=>{
  for(const change of [
    input=>{input.lines.find(l=>l.id==='signature').text='SIGNATURE ______';},
    input=>{input.lines.find(l=>l.id==='signature').text='SIGNATURE Print Name';},
    input=>{input.lines.find(l=>l.id==='signature').text='Driver Signature: J. DOE';},
    input=>{input.lines.find(l=>l.id==='stamp-company').text='EXAMPLE DISTRIBUTION';},
    input=>{input.lines.find(l=>l.id==='received').text='RECEIVED, subject to the classifications and tariffs';},
    input=>{input.lines.find(l=>l.id==='signature').box.x=.1;},
    input=>{input.lines.find(l=>l.id==='signature').box.y=.75;},
    input=>{input.lines.splice(input.lines.findIndex(l=>l.id==='signature'),0,line('pickup','PICKUP ACKNOWLEDGEMENT',.64,.59));},
    input=>{input.lines.splice(input.lines.findIndex(l=>l.id==='stamp-company'),0,line('pickup','PICKUP ACKNOWLEDGEMENT',.64,.52));},
    input=>{input.lines.splice(input.lines.findIndex(l=>l.id==='received'),0,line('pickup','PICKUP ACKNOWLEDGEMENT',.64,.48));},
  ]){
    const input=observation();change(input);assert.equal(read(input).pageIdentities[0].kind,'bol',change.toString());
  }
});

test('different OCR observations cannot assemble a receiver stamp',()=>{
  const stamp=observation(),signature=observation();signature.id='other-read';signature.sourceImageId='other-image';
  stamp.lines=stamp.lines.filter(l=>l.id!=='signature');
  signature.lines=signature.lines.filter(l=>!['received','stamp-company'].includes(l.id));
  assert.equal(read(stamp,signature).pageIdentities[0].kind,'bol');
});

test('plain text receiver block is reviewable and boilerplate alone never completes it',()=>{
  const base='BILL OF LADING\nShip From: EXAMPLE DISTRIBUTION\nShip To: REGIONAL FOODS\nWeight: 1200 LB';
  const stamp='RECEIVED\nREGIONAL FOODS\nDate: 07/10/2026\nSIGNATURE J. DOE';
  assert.equal(read(textObservation(base+'\n'+stamp)).pageIdentities[0].kind,'pod');
  assert.equal(read(textObservation(base+'\nRECEIVED, subject to applicable tariffs\nREGIONAL FOODS\nSIGNATURE J. DOE')).pageIdentities[0].kind,'bol');
});

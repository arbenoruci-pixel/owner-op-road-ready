import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,textObservation,resolveEvidence} from '../src/index.js';

const fromText=text=>readDocument({documentId:'identity',pages:[{id:'p1',observations:[textObservation(text)]}]});
import {row,packingInput,risingPackingInput} from './document-identity-fixture.mjs';
const proof=result=>{
  for(const p of result.pageIdentities)for(const vote of p.evidence)for(const e of [vote.evidence,...vote.supportingEvidence])resolveEvidence(result,e);
  for(const d of result.documents)for(const f of Object.values(d.fields))for(const c of f.candidates)
    for(const e of [...c.evidence,...(c.labelEvidence||[])])resolveEvidence(result,e);
};

test('alternate short-form title identifies a BOL without requiring its reference or measurements',()=>{
  const text='ALTERNATE STRAIGHT BILL OF LADING - SHORT FORM\nShip From:\nShipper: Example Distribution\nShip To:\nConsignee: Example Foods';
  const result=fromText(text),doc=result.documents[0];
  assert.equal(doc.kind,'bol');assert.equal(doc.identityStatus,'supported');
  assert.equal(doc.fields.bolNumber.value,null);assert.equal(doc.fields.weight.status,'missing');proof(result);
  for(const negative of [text.replace('ALTERNATE STRAIGHT','Please attach ALTERNATE STRAIGHT'),text.replace(/Ship To:.*$/s,''),text.replace('ALTERNATE','NOT AN')]){
    assert.equal(fromText(negative).documents[0].kind,'unknown');
  }
});

test('damaged Bil spelling needs all the independent shipping structure signals',()=>{
  const lines=['RECEIVED, subject to agreed rates','Below, This Bil of Lading is not subject to filed tariffs.',
    'CARRIER: Example Carrier','FROM: Example Shipping','CONSIGNED','TO: Example Receiving','TOTAL NET WEIGHT: 1234.56'];
  const result=fromText(lines.join('\n'));
  assert.equal(result.documents[0].kind,'bol');assert.equal(result.documents[0].identityStatus,'needs_review');proof(result);
  assert.ok(result.pageIdentities[0].evidence.some(v=>[v.evidence,...v.supportingEvidence].some(e=>e.quote.includes('This Bil of Lading'))));
  for(const missing of [1,2,3,4,6])assert.equal(fromText(lines.filter((_,i)=>i!==missing).join('\n')).documents[0].kind,'unknown');
});

test('packing classification and labeled references work independently of product-table details',()=>{
  for(const tilt of [0,.012,-.012]){
    const input=packingInput({tilt}),before=JSON.stringify(input),result=readDocument(input),doc=result.documents[0];
    assert.equal(doc.kind,'packing_list');assert.equal(doc.identityStatus,'supported');assert.equal(doc.reference,'700012345');
    for(const [key,value]of Object.entries({packingSlipNumber:'700012345',orderNumber:'0012345',poNumber:'902468'})){
      assert.equal(doc.fields[key].value,value,key);assert.equal(doc.fields[key].status,'supported');
      assert.equal(doc.fields[key].candidates[0].evidence.length,2);
    }
    assert.equal(doc.fields.loadNumber.value,null);assert.equal(doc.fields.bolNumber.value,null);
    assert.equal(doc.fields.weight.status,'missing');assert.equal(doc.fields.quantity.status,'missing');
    assert.equal(doc.canAutoFile,false);proof(result);assert.equal(JSON.stringify(input),before);
  }
  const instructions='Please attach PACKING SLIP\nShip To: Example Foods\nPacking Slip Number: 700012345';
  assert.equal(fromText(instructions).documents[0].kind,'unknown');
  const repeated={documentId:'instructions',pages:[{id:'p1',observations:['clean','table'].map(id=>textObservation(instructions,{id}))}]};
  assert.equal(readDocument(repeated).documents[0].kind,'unknown');
});

test('single, conflicting and ambiguous reference rows stay reviewable',()=>{
  const single=packingInput();single.pages[0].observations.pop();
  assert.equal(readDocument(single).documents[0].fields.packingSlipNumber.status,'needs_review');
  const conflict=packingInput();conflict.pages[0].observations[1].lines.find(l=>l.text==='700012345').text='700012346';
  const f=readDocument(conflict).documents[0].fields.packingSlipNumber;
  assert.equal(f.value,null);assert.ok(f.issues.includes('conflicting_reads'));
  const ambiguous=packingInput();for(const o of ambiguous.pages[0].observations)o.lines.push(row('700012346',.76,.12,.08));
  const a=readDocument(ambiguous).documents[0].fields.packingSlipNumber;
  assert.equal(a.value,null);assert.ok(a.issues.includes('ambiguous_reference_row'));
  const pages=packingInput();pages.pages.push({id:'p2',observations:[pages.pages[0].observations.pop()]});
  for(const d of readDocument(pages).documents)assert.equal(d.fields.packingSlipNumber.value,null);
});

test('separate packing, order and PO labels accept hash, No., ID and colon markers',()=>{
  for(const suffix of ['#:','No.:','ID:',':'])for(const tilt of [0,.012,-.012])for(const poLabel of ['Customer PO','PO','P.O.','Purchase Order']){
    const input=packingInput({tilt});
    for(const o of input.pages[0].observations)for(const line of o.lines){
      if(line.text==='Packing Slip Number:')line.text='Packing Slip '+suffix;
      if(line.text==='Order Number:')line.text='Order '+suffix;
      if(line.text==='Customer PO:')line.text=poLabel+' '+suffix;
    }
    const result=readDocument(input),doc=result.documents[0];
    assert.equal(doc.kind,'packing_list',suffix);assert.equal(doc.identityStatus,'supported');
    for(const [key,value]of Object.entries({packingSlipNumber:'700012345',orderNumber:'0012345',poNumber:'902468'})){
      assert.equal(doc.fields[key].value,value,key+' '+suffix);assert.equal(doc.fields[key].status,'supported');
      assert.ok(doc.fields[key].candidates[0].labelEvidence.some(e=>e.quote.endsWith(suffix)));
    }
    assert.equal(doc.fields.loadNumber.value,null);proof(result);
  }
});

test('neighboring customer numbers and dates cannot fill a missing PO',()=>{
  for(const tilt of [0,.012,-.012]){
    const input=packingInput({tilt});for(const o of input.pages[0].observations)o.lines=o.lines.filter(l=>l.text!=='902468');
    const doc=readDocument(input).documents[0];assert.equal(doc.fields.poNumber.value,null);assert.equal(doc.fields.poNumber.candidates.length,0);
  }
});

test('one damaged BOL modifier retains the intact document title as reviewable evidence',()=>{
  const parties='\nShip From: Example Warehouse\nShip To: Example Market';
  for(const modifier of ['LTERNATE','JALTERNATE','ALTERNATF','UNIFOR','UUNIFORM','STRAIGT']){
    const title=modifier+' '+(modifier==='STRAIGT'?'':'STRAIGHT ')+'BILL OF LADING - SHORT FORM';
    const result=fromText(title+parties),doc=result.documents[0];
    assert.equal(doc.kind,'bol',modifier);assert.equal(doc.identityStatus,'needs_review');
    assert.equal(doc.fields.bolNumber.value,null);
    assert.ok(result.pageIdentities[0].evidence.some(v=>v.evidence.quote===title));proof(result);
  }
  for(const title of ['Please attach ALTERNATE STRAIGHT BILL OF LADING - SHORT FORM',
    'NOT AN ALTERNATE STRAIGHT BILL OF LADING - SHORT FORM','UNKNOWN STRAIGHT BILL OF LADING - SHORT FORM',
    'LTERNATE STRAIGHT BILL OF LADNG - SHORT FORM'])assert.equal(fromText(title+parties).documents[0].kind,'unknown');
  assert.equal(fromText('LTERNATE STRAIGHT BILL OF LADING - SHORT FORM\nShip From: Example Warehouse').documents[0].kind,'unknown');
});

test('tilted rows preserve competing digits and do not borrow numbers from another page',()=>{
  const input=packingInput({tilt:-.012});
  input.pages[0].observations[0].lines.find(l=>l.text==='902468').text='902408';
  const result=readDocument(input),doc=result.documents[0];
  assert.equal(doc.fields.packingSlipNumber.value,'700012345');assert.equal(doc.fields.orderNumber.value,'0012345');
  assert.equal(doc.fields.poNumber.value,null);assert.ok(doc.fields.poNumber.issues.includes('conflicting_reads'));proof(result);
  const split=packingInput({tilt:-.012});split.pages.push({id:'p2',observations:[split.pages[0].observations.pop()]});
  for(const d of readDocument(split).documents)assert.equal(d.fields.packingSlipNumber.value,null);
});

test('unequal rising rows use their own date columns and retain weak competing PO digits',()=>{
  const input=risingPackingInput(),before=JSON.stringify(input),result=readDocument(input),doc=result.documents[0];
  assert.equal(doc.fields.packingSlipNumber.value,'700012345');assert.equal(doc.fields.orderNumber.value,'0012345');
  assert.equal(doc.fields.poNumber.value,null);assert.ok(doc.fields.poNumber.issues.includes('conflicting_reads'));
  assert.deepEqual(doc.fields.poNumber.candidates.map(c=>c.rawValue),['902408','902468']);
  assert.equal(doc.fields.loadNumber.value,null);assert.equal(doc.fields.bolNumber.value,null);
  assert.equal(JSON.stringify(input),before);proof(result);
  const missing=risingPackingInput();
  for(const o of missing.pages[0].observations)o.lines=o.lines.filter(l=>!/^9024/.test(l.text));
  assert.equal(readDocument(missing).documents[0].fields.poNumber.candidates.length,0);
  const separate=packingInput({tilt:-.012});
  separate.pages[0].observations[0].lines=separate.pages[0].observations[0].lines.filter(l=>!(/DATE|\//i.test(l.text)));
  separate.pages[0].observations[1].lines=separate.pages[0].observations[1].lines.filter(l=>/DATE|\//i.test(l.text));
  assert.equal(readDocument(separate).documents[0].fields.packingSlipNumber.value,null);
});

test('bracket noise exposes the printed BOL customer PO for review without altering its source',()=>{
  const observation=textObservation('ALTERNATE STRAIGHT BILL OF LADING - SHORT FORM\nShip From: Example Mill\nShip To: Example Market');
  observation.sourceImageId='po-image';
  observation.lines.push(row('{CUSTOMER P.O.#: 902468',.2,.35,.25,.012,.7));
  const result=readDocument({documentId:'po',pages:[{id:'p1',observations:[observation]}]}),f=result.documents[0].fields.poNumber;
  assert.equal(f.status,'needs_review');assert.equal(f.value,null);assert.equal(f.candidates[0].rawValue,'902468');proof(result);
});

test('lumper and explicit POD headings remain distinct with minimal useful information',()=>{
  const receipt=fromText('RECEIPT # R-502\nLOAD DETAILS\nLoad Description: Breakdown pallets\nRELAY PAYMENT DETAILS\nAmount $388.00\nCheckout Fee $10.00\nNET TOTAL $398.00');
  assert.equal(receipt.documents[0].kind,'unloading_receipt');assert.equal(receipt.documents[0].fields.receiptNumber.value,'R-502');
  const pod=fromText('PROOF OF DELIVERY\nBOL No: B-204\nReceived by: Example Receiver');
  assert.equal(pod.documents[0].kind,'pod');assert.equal(pod.documents[0].fields.bolNumber.value,'B-204');
  const unsigned=fromText('BILL OF LADING\nBOL No: B-204\nShip From: Example Mill\nShip To: Example Market\nReceiver signature:');
  assert.equal(unsigned.documents[0].kind,'bol');
});

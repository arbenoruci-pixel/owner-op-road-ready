import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,textObservation,resolveEvidence} from '../src/index.js';

const fromText=text=>readDocument({documentId:'identity',pages:[{id:'p1',observations:[textObservation(text)]}]});
const row=(text,x,y,width=.13,height=.012,confidence=.96)=>({text,confidence,box:{x,y,width,height}});
function packingInput({tilt=0}={}){
  const lines=[row('Packing Slip',.78,.08,.16,.025),row('Ship To:',.05,.19),
    row('Packing Slip Number:',.35,.12,.15),row('700012345',.64,.12+tilt,.08),
    row('Order Number:',.35,.18),row('0012345',.64,.18+tilt,.06),
    row('Order Date:',.35,.20),row('07/08/2026',.64,.20+tilt,.08),
    row('Customer Number:',.35,.22),row('CUSTOMER01',.64,.22+tilt,.08),
    row('Customer PO:',.35,.24),row('902468',.64,.24+tilt,.06),
    row('Ship Date:',.35,.26),row('07/08/2026',.64,.26+tilt,.08)];
  return {documentId:'packing',pages:[{id:'p1',observations:['clean','table'].map(id=>({id,sourceImageId:id+'-image',lines:structuredClone(lines)}))}]};
}
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
  for(const tilt of [0,.012]){
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
  assert.equal(fromText('Please attach PACKING SLIP\nShip To: Example Foods\nPacking Slip Number: 700012345').documents[0].kind,'unknown');
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

test('neighboring customer numbers and dates cannot fill a missing PO',()=>{
  for(const tilt of [0,.012]){
    const input=packingInput({tilt});for(const o of input.pages[0].observations)o.lines=o.lines.filter(l=>l.text!=='902468');
    const doc=readDocument(input).documents[0];assert.equal(doc.fields.poNumber.value,null);assert.equal(doc.fields.poNumber.candidates.length,0);
  }
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

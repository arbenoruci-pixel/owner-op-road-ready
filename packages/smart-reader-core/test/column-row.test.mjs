import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';
import {mixedPacketInput} from './mixed-packet-fixture.mjs';

function mergedRows(){
  const input=mixedPacketInput();input.pages=input.pages.slice(1);
  const observation=(id,rows)=>({id,source:'generic-merged-ocr',sourceImageId:'image-'+id,lines:rows.map(([text,y,confidence=.95])=>({text,confidence,box:{x:.04,y,width:.91,height:.012}}))});
  input.pages[0].observations.unshift(observation('merged-shipping',[
    ['carrier and shipper (or where carrier has been engaged by Example Transport)',.06],
    ['carrier and Example Transport), the property described above is received.',.07],
    ['Unclear header text B/L NO. 0088123456',.09,.62],
    ['CARRIER: Example Logistics SALES ORDER: ORDER-778',.18],
    ['FROM: Northern Foods DELIVERY: DELIVERY-321',.20],
    ['PO#: PO-1144 * If shipper moves between two ports',.55],
    ['CONSIGNEE without recourse on the shipment',.65],
  ]));
  // The same explicit value in the other read remains the same candidate.
  input.pages[0].observations[1].lines.find(l=>l.text==='PO#: ORDER-22').text='PO#: PO-1144';
  input.pages[1].observations.unshift(observation('merged-receipt',[
    ['RECEIPT # R-17 DATE: 17-Jul-2026 QO Phone: (555) 010-1200',.18,.76],
    ['PO No: PO-1144 Load Description: Breakdown',.39],
    ['Trailer No: T-700 Restacks: 0',.45],
  ]));
  input.pages[1].observations[1].lines.find(l=>l.text==='DATE: 17-Jul-2026').text='DATE: 17)ul-2026';
  return input;
}

test('merged OCR rows end at explicit neighbor labels and retain exact value evidence',()=>{
  const input=mergedRows(),snapshot=structuredClone(input),result=readDocument(input),[bol,receipt]=result.documents;
  assert.equal(bol.kind,'bol');assert.equal(receipt.kind,'unloading_receipt');
  assert.deepEqual(bol.fields.shipper.candidates.map(c=>c.rawValue),['Northern Foods']);
  assert.deepEqual(bol.fields.carrier.candidates.map(c=>c.rawValue),['Example Logistics']);
  assert.ok(bol.fields.consignee.candidates.every(c=>!c.rawValue.includes('recourse')));
  assert.equal(bol.fields.bolNumber.candidates[0].rawValue,'0088123456');
  assert.equal(bol.fields.bolNumber.value,null);assert.ok(bol.fields.bolNumber.issues.includes('weak_recognition'));
  assert.deepEqual(bol.fields.poNumber.candidates.map(c=>c.rawValue),['PO-1144']);
  assert.deepEqual(receipt.fields.poNumber.candidates.map(c=>c.rawValue),['PO-1144']);
  assert.deepEqual(receipt.fields.trailerNumber.candidates.map(c=>c.rawValue),['T-700']);
  assert.ok(receipt.fields.receiptDate.candidates.some(c=>c.rawValue==='17-Jul-2026'&&c.value==='2026-07-17'));
  assert.ok(receipt.fields.receiptDate.candidates.some(c=>c.rawValue==='17)ul-2026'&&c.value===null));
  assert.equal(receipt.fields.receiptDate.value,null,'do not silently replace an ambiguous OCR observation');
  for(const d of result.documents)for(const f of Object.values(d.fields))for(const c of f.candidates)for(const evidence of c.evidence){
    const {line}=resolveEvidence(result,evidence);assert.equal(line.text.slice(evidence.start,evidence.end),c.rawValue);
  }
  assert.deepEqual(input,snapshot);
});

test('instruction references and labeled delivery dates do not become document identity or date',()=>{
  const input=mixedPacketInput();input.pages=[input.pages[0]];
  input.pages[0].observations[0].lines.push(...[
    'Please attach BOL No: REQUEST-999','Send B/L NO. REQUEST-123 to the office','Delivery date: 2026-10-19'
  ].map(text=>({text,confidence:.99,box:{x:.1,y:.25,width:.7,height:.01}})));
  const fields=readDocument(input).documents[0].fields;
  assert.equal(fields.bolNumber.candidates.length,0);assert.equal(fields.documentDate.candidates.length,0);
});

test('actual conflicting values survive row segmentation and remain unaccepted',()=>{
  const input=mergedRows();input.pages[0].observations[0].lines.find(l=>l.text.startsWith('FROM:')).text='FROM: Different Company DELIVERY: DELIVERY-321';
  const field=readDocument(input).documents[0].fields.shipper;
  assert.equal(field.value,null);assert.ok(field.issues.includes('conflicting_reads'));
  assert.deepEqual(new Set(field.candidates.map(c=>c.rawValue)),new Set(['Different Company','Northern Foods']));
});


test('date row segmentation retains malformed timestamps for review',()=>{
  for(const stamp of ['2026-07-17 07:41.00','2026-07-17 99:99','2026-07-17 07:41:00Z']){
    const input=mixedPacketInput();input.pages=[input.pages[2]];
    input.pages[0].observations[0].lines.find(l=>l.text==='DATE: 17-Jul-2026').text='DATE: '+stamp+' Phone: (555) 010-1200';
    const field=readDocument(input).documents[0].fields.receiptDate;
    assert.equal(field.candidates[0].rawValue,stamp);
    assert.equal(field.value,null,'an invalid timestamp cannot silently become an accepted date');
  }
});

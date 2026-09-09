import assert from 'node:assert/strict';
import { qualifyDocumentFieldsV11038, documentFieldRowsV11038 } from '../source/src/modules/scan/documentFieldSemanticsV11038.js';
import { qualifyScanResultV11036 } from '../source/src/modules/scan/DocumentEvidenceV11036.js';
import { normalizeEngineInputV1 } from '../source/src/modules/scan/engines/documentEngineContractV1.js';
import { enforceStructuralBolV11034, reanalyzeTruckDocumentTypeIsolatedV10959, routeIsolatedDocumentV10959 } from '../source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';
let count=0;function test(name,fn){fn();count++;console.log('PASS — '+name);}
// Synthetic OCR reproduces the screenshot's layout/field errors; no customer document is included.
const text=`BILL OF LADING
BOL NO: 82004117
TRAILER: TR998877
SHIP FROM
Sample Door Company
SHIP TO
Sample Millwork
CARRIER
Sample Carrier LLC
PACKAGING WEIGHT CLASS
TOTAL WEIGHT: 26,787.42 LB
PREPAID Fgan ADD - FOB SHIPPING POINT
PO NUMBER: INT`;
const contaminated={type:{id:'bol'},text,fields:{loadNo:'82004117',orderNo:'82004117',bolNo:'82004117',poNumber:'INT',total:26787.42,gross:26787.42,broker:'Unverified Broker',merchant:'SHIPPING COPY',documentDate:'2026-09-09',needsFieldReview:true,documentTextLength:7722},confidence:.96};
test('Reproduce the old structural BOL-to-load alias, then keep each reference separate',()=>{
  assert.equal(enforceStructuralBolV11034(contaminated).fields.loadNo,'82004117');
  const fixed=qualifyScanResultV11036(contaminated);
  assert.equal(fixed.fields.bolNo,'82004117');assert.equal(fixed.fields.loadNo,undefined);assert.equal(fixed.fields.orderNo,undefined);
  assert.equal(fixed.fields.total,undefined);assert.equal(fixed.fields.gross,undefined);assert.equal(fixed.fields.poNumber,undefined);
  assert.equal(fixed.fields.weight,26787.42);assert.equal(fixed.fields.weightUnit,'lb');assert.equal(fixed.fields.documentDate,undefined);
  assert.match(fixed.evidenceReviewV11036.evidence.weight.excerpt,/TOTAL WEIGHT/);
  assert.match(fixed.evidenceReviewV11036.evidence.bolNo.excerpt,/BOL NO/);
});
test('The real manual BOL parser also returns typed shipping fields',()=>{
  const fixed=reanalyzeTruckDocumentTypeIsolatedV10959(contaminated,'bol',{});
  assert.equal(fixed.fields.bolNo,'82004117');assert.equal(fixed.fields.poNumber,undefined);assert.equal(fixed.fields.total,undefined);assert.equal(fixed.fields.loadNo,undefined);
  assert.equal(fixed.fields.trailerNo,'TR998877');assert.equal(fixed.fields.carrierName,'Sample Carrier LLC');assert.equal(fixed.fields.broker,undefined);
});
test('Parsed guesses cannot turn themselves into source OCR or signature evidence',()=>{
  const input=normalizeEngineInputV1(null,{text:'Unlabeled document',fields:{bolNo:'12345',total:26787.42,description:'PROOF OF DELIVERY RECEIVER SIGNATURE DELIVERY DATE BOL NUMBER 12345'}});
  assert.equal(input.text,'Unlabeled document');assert.equal(routeIsolatedDocumentV10959(input).winner,null);
});
test('PO matches require a complete label and identifier, never the tail of POINT',()=>{
  for(const line of ['FOB SHIPPING POINT','PO NUMBER: INT','IMPORTANT','POTENTIAL'])assert.equal(qualifyDocumentFieldsV11038({...contaminated,text:line}).fields.poNumber,undefined);
  const one=qualifyDocumentFieldsV11038({...contaminated,text:'P.O. Number: AB12345'});assert.equal(one.fields.poNumber,'AB12345');
  const purchase=qualifyDocumentFieldsV11038({...contaminated,text:'PURCHASE ORDER NUMBER: AB12345'});assert.equal(purchase.fields.poNumber,'AB12345');assert.equal(purchase.fields.orderNo,undefined);
  const many=qualifyDocumentFieldsV11038({...contaminated,text:'PO Numbers: 11801 / 11804 / 14187'});assert.deepEqual(many.fields.poNumbers,['11801','11804','14187']);
});
test('BOL, PRO, load and order labels retain independent values',()=>{
  const fixed=qualifyDocumentFieldsV11038({...contaminated,text:'BOL NO: 82004117\nPRO NO: 31008122\nLOAD NO: 7000155\nORDER NUMBER: AB88117'});
  assert.equal(fixed.fields.bolNo,'82004117');assert.equal(fixed.fields.proNumber,'31008122');assert.equal(fixed.fields.loadNo,'7000155');assert.equal(fixed.fields.orderNo,'AB88117');
});
test('Dates use a date label, adjacent value and calendar validation',()=>{
  for(const [line,expected] of [['DATE: 9/8/26','2026-09-08'],['DATE\n09/08/2026','2026-09-08'],['DOCUMENT DATE: 2026-09-08','2026-09-08'],['DATE: 2/29/2026',undefined],['Printed instructions revised 9/8/2026',undefined],['DELIVERY DATE: 9/10/26',undefined]]) {
    const fixed=qualifyDocumentFieldsV11038({...contaminated,text:line});assert.equal(fixed.fields.documentDate,expected,line);
  }
});
test('Conflicting OCR reference readings stay unresolved',()=>{
  const fixed=qualifyDocumentFieldsV11038({...contaminated,text:'BOL NO: 82004117\nBOL NO: 82004118'});assert.equal(fixed.fields.bolNo,undefined);assert.ok(fixed.evidenceReviewV11036.issues.some(issue=>issue.includes('More than one BOL')));
});
test('Freight and COD charges retain their labels without becoming carrier gross pay',()=>{
  const fixed=qualifyDocumentFieldsV11038({...contaminated,text:text+'\nFREIGHT CHARGES: $125.00\nCOD AMOUNT: $40.00'});
  assert.equal(fixed.fields.freightCharges,125);assert.equal(fixed.fields.codAmount,40);assert.equal(fixed.fields.gross,undefined);
});
test('A weight-table row cannot become an invented total weight or payment',()=>{
  const fixed=qualifyDocumentFieldsV11038({...contaminated,text:'BOL NO: 82004117\nWEIGHT CLASS\n26,787.42 70\n100.00 70'});assert.equal(fixed.fields.weight,undefined);assert.equal(fixed.fields.total,undefined);
});
test('POD shipping fields cannot verify a handwritten signature',()=>{
  const fixed=qualifyDocumentFieldsV11038({...contaminated,type:{id:'pod'},text:text+'\nDELIVERY DATE: 9/10/26\nRECEIVER SIGNATURE: ______'});
  assert.equal(fixed.fields.documentDate,'2026-09-10');assert.equal(fixed.fields.podSigned,false);assert.equal(fixed.fields.signaturePresent,false);
});
test('Review labels expose document fields and exclude internal flags',()=>{
  const rows=documentFieldRowsV11038({...contaminated,fields:{...contaminated.fields,bolNo:'82004117'}});
  assert.ok(rows.some(row=>row.label==='BOL number'));assert.ok(!rows.some(row=>['needsFieldReview','documentTextLength'].includes(row.key)));
});
test('Financial document parsers retain legitimate totals unchanged',()=>{
  for(const id of ['rate_confirmation','fuel_receipt','parts_receipt','repair_invoice']){const input={type:{id},text:'TOTAL $4,800.00',fields:{total:4800,gross:4800}};assert.equal(qualifyDocumentFieldsV11038(input),input);}
});
test('Real Rate Confirmation and fuel routing still read source text and valid amounts',()=>{
  const rate={text:'CARRIER RATE CONFIRMATION\nBROKER: Sample Logistics LLC\nCARRIER: Sample Carrier LLC\nLOAD NO: 7000155\nTOTAL CARRIER PAY $4,800.00\nPICKUP: Chicago, IL\nDELIVERY: Dayton, OH\nDRY VAN\nPlease sign and return',fields:{}};
  const routed=routeIsolatedDocumentV10959(normalizeEngineInputV1(null,rate));assert.equal(routed.winner.typeId,'rate_confirmation');assert.equal(routed.winner.fields.total,4800);
  const fuel={text:'FUEL RECEIPT\nDIESEL\nGALLONS 100.000\nPRICE PER GALLON 3.500\nTOTAL $350.00\nTRANSACTION NUMBER 7800144',fields:{total:350,gallons:100,pricePerGallon:3.5}};
  const fuelRoute=routeIsolatedDocumentV10959(normalizeEngineInputV1(null,fuel));assert.equal(fuelRoute.winner.typeId,'fuel_receipt');assert.equal(fuelRoute.winner.fields.total,350);
});
console.log(`${count} semantic document-field checks passed`);

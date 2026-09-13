import assert from 'node:assert/strict';
import {inspectPageIdentity,decideDocumentIdentity,applyDocumentIdentity} from './v110334/documentIdentity.js';
const bol='BILL OF LADING - NOT NEGOTIABLE\nSHIP FROM: EXAMPLE SHIPPER\nSHIP TO: EXAMPLE RECEIVER\nCARRIER: EXAMPLE TRUCKING\nWEIGHT 2000 LB\nBOL NO: 550012';
const gate='GATE PASS\nArrival Time: 09/13/26 10:30 AM\nTrailer #: 7791\nCarrier: Example Trucking';
const analysis=(text,type='gate_pass')=>({text,type:{id:type},confidence:.96,fields:{}});
assert.equal(decideDocumentIdentity(analysis(bol)).typeId,'bol');
assert.equal(decideDocumentIdentity(analysis(bol.replace('BILL','ILL'))).typeId,'bol');
assert.equal(decideDocumentIdentity(analysis(bol+'\nDriver must obtain gate pass. Appointment 8 AM. Trailer # 791.')).typeId,'bol');
assert.equal(decideDocumentIdentity(analysis(gate)).typeId,'gate_pass');
assert.equal(decideDocumentIdentity(analysis('Carrier Example\nTrailer # 100\nArrival Time 8 AM')).typeId,'other');
assert.equal(decideDocumentIdentity(analysis('')).typeId,'other');
const rate='RATE CONFIRMATION\nTotal Carrier Pay: $2000\nLoad NO: 88007\nDriver must submit signed bill of lading.\nSHIP FROM A\nSHIP TO B\nWEIGHT 1000';
assert.equal(decideDocumentIdentity(analysis(rate)).typeId,'rate_confirmation');
assert.equal(inspectPageIdentity('Drivers must return proof of delivery.\nSHIP TO B\nCARRIER C\nWEIGHT 1000'),null);
assert.equal(decideDocumentIdentity(analysis(bol.replace('BILL OF LADING - NOT NEGOTIABLE','PROOF OF DELIVERY'))).typeId,'pod');
const mixed=decideDocumentIdentity(analysis(`[[PAGE:1]]\n${bol}\n[[PAGE:2]]\n${gate}`));assert.equal(mixed.typeId,'other');assert.equal(mixed.mixedDocuments,true);
const shipments=decideDocumentIdentity(analysis(`[[PAGE:1]]\n${bol}\n[[PAGE:2]]\n${bol.replace('550012','771111')}`));assert.equal(shipments.typeId,'other');assert.match(shipments.reason,/different BOL numbers/);
assert.equal(decideDocumentIdentity(analysis(`[[PAGE:1]]\n${bol}\n[[PAGE:2]]\n${bol}`)).typeId,'bol');
const passes={...analysis('Carrier C\nTrailer # 11'),ocrEvidenceV110323:[{page:1,text:bol,confidence:.8},{page:1,text:bol,confidence:.85}]};assert.equal(decideDocumentIdentity(passes).typeId,'bol');assert.equal(decideDocumentIdentity(passes).pageTypes.length,1);
const conflicting={...passes,ocrEvidenceV110323:[...passes.ocrEvidenceV110323,{page:1,text:gate,confidence:.8}]};assert.equal(decideDocumentIdentity(conflicting).typeId,'other');
assert.equal(decideDocumentIdentity({...analysis('FUEL RECEIPT\nDiesel 20 gallons\nTOTAL $80','fuel_receipt'),lowEvidence:false}).typeId,'fuel_receipt');
const before={...analysis(bol),fields:{bolNo:'550012',loadNo:'old',origin:'Old place'},pages:[{page:1,text:bol}]};
const result=applyDocumentIdentity(before,shipments,id=>({id}),a=>a);
assert.equal(result.fields.bolNo,'');assert.equal(result.type.id,'other');assert.equal(before.fields.bolNo,'550012');assert.equal(result.text,bol);assert.deepEqual(result.pages,before.pages);
assert.deepEqual(result.fields.references,[]);assert.deepEqual(result.fieldEvidence,{});
console.log('PASS — page titles, OCR variants, boilerplate exclusion, unsupported Gate Pass, mixed types/shipments, retries and source preservation');

for(const label of ['BOL:', 'BOL ID', 'BILL OF LADING:']){
 const formatted=bol.replace('BOL NO:',label);
 const different=decideDocumentIdentity(analysis(`[[PAGE:1]]\n${formatted}\n[[PAGE:2]]\n${formatted.replace('550012','771111')}`));
 assert.equal(different.mixedDocuments,true,label);assert.equal(different.clearShipmentFields,true);
 assert.equal(decideDocumentIdentity(analysis(`[[PAGE:1]]\n${formatted}\n[[PAGE:2]]\n${formatted}`)).typeId,'bol',label);
}
for(const extra of ['FUEL RECEIPT\nDiesel 20 gallons\nTOTAL $80','Unrecognized extra sheet']){
 const packet=decideDocumentIdentity(analysis(`[[PAGE:1]]\n${bol}\n[[PAGE:2]]\n${extra}`));
 assert.equal(packet.typeId,'other');assert.equal(packet.mixedDocuments,true);assert.equal(packet.requiresTypeReview,true);
}

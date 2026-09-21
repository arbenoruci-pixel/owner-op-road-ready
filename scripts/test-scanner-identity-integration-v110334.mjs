import assert from 'node:assert/strict';
import {finalizeSmartScanAnalysisV11039,reanalyzeTruckDocumentTypeIsolatedV10959} from '../source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';
import {truckDocumentTypeMetaV1040 as meta} from '../source/src/modules/scan/truckDocumentCatalogV1040.js';
import {matchScanDocumentToLoadV11037,initialScanLoadV11037} from '../source/src/modules/scan/scanLoadAssignmentV11037.js';
import {qualifyScanResultV11036} from '../source/src/modules/scan/DocumentEvidenceV11036.js';
const bol='BILL OF LADING - NOT NEGOTIABLE\nSHIP FROM: EXAMPLE SHIPPER\nSHIP TO: EXAMPLE RECEIVER\nCARRIER: EXAMPLE TRUCKING\nWEIGHT 2000 LB\nBOL NO: 550012';
const gate='GATE PASS\nArrival Time: 09/13/26 10:30 AM\nTrailer #: 7791\nCarrier: Example Trucking';
const run=text=>finalizeSmartScanAnalysisV11039({type:meta('gate_pass'),detectedType:meta('gate_pass'),text,confidence:.95,fields:{},pages:[],method:'synthetic-ocr'});
assert.equal(run(bol).type.id,'bol');
assert.equal(run(bol+'\nDriver must obtain gate pass. Appointment 8 AM. Trailer # 791.').type.id,'bol');
assert.equal(run('CARRIER: Example Trucking\nTRAILER # 7791\nArrival time 8 AM').type.id,'other');
assert.equal(run(gate).type.id,'gate_pass');
const mixed=run(`[[PAGE:1]]\n${bol}\n[[PAGE:2]]\n${gate}`);assert.equal(mixed.type.id,'other');assert.equal(mixed.fields.loadNo,'');assert.equal(mixed.typeEvidenceV110334.mixedDocuments,true);
const shipments=run(`[[PAGE:1]]\n${bol}\n[[PAGE:2]]\n${bol.replace('550012','771111')}`);assert.equal(shipments.type.id,'other');assert.equal(shipments.fields.bolNo,'');
const reviewed=qualifyScanResultV11036(shipments,{});
assert.equal(reviewed.type.id,'other','the UI qualifier must not undo the mixed-document decision');
assert.equal(reviewed.fields.bolNo,'');
// Selecting a type cannot turn a packet of different shipments into one load.
for(const type of ['bol','rate_confirmation']){
 const manual=reanalyzeTruckDocumentTypeIsolatedV10959(shipments,type,{});
 assert.equal(manual.type.id,type,'manual type selection remains available');
 assert.equal(manual.typeEvidenceV110334.mixedDocuments,true,'conflict survives manual type selection');
 const match=matchScanDocumentToLoadV11037({analysis:manual,fields:manual.fields,state:{},businessStore:{loads:[{loadNo:'550012',status:'active'}],documents:[]}});
 assert.equal(match.automatic,false);assert.equal(match.loadNo,'');
 assert.equal(initialScanLoadV11037(manual,match),'');
 assert.equal(initialScanLoadV11037(manual,match,'550012',true),'550012','an explicit driver folder choice is preserved');
}
console.log('PASS — final production router corrects BOL, rejects unsupported Gate Pass and leaves conflicting pages unassigned');

for(const [extra,type] of [['Unrecognized extra sheet','bol'],...['BOL:','BOL ID','BILL OF LADING:'].map(label=>[bol.replace('BOL NO:',label).replace('550012','771111'),'other'])]){
 const packet=qualifyScanResultV11036(run(`[[PAGE:1]]\n${bol}\n[[PAGE:2]]\n${extra}`),{});
 assert.equal(packet.type.id,type);assert.equal(packet.typeEvidenceV110334.mixedDocuments,true);
 assert.equal(packet.typeEvidenceV110334.requiresTypeReview,true);
 assert.equal(packet.fields.bolNo,'');
 const match=matchScanDocumentToLoadV11037({analysis:packet,fields:packet.fields,state:{},businessStore:{loads:[{loadNo:'550012',status:'active'}],documents:[]}});
 assert.equal(match.automatic,false);assert.equal(match.loadNo,'');
}

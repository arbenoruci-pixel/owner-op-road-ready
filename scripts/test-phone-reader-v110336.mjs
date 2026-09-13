import assert from 'node:assert/strict';
import {guardDocumentReading} from '../source/src/modules/scan/documentFieldGuardsV110336.js';
import {finalizeSmartScanAnalysisV11039} from '../source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';
import {readDocument,textObservation} from '../packages/smart-reader-core/src/index.js';
const form='BILL OF LADING\nBILL OF LADING NOT NEGOTIABLE\nSHIPPER Signature/Date Trailer Loaded: Freight Counted Carrier Signature/Date\nCONSIGNEE . Carrier Name: eg\nCARRIER ack; t of packages and required placards.';
const own=readDocument({documentId:'redacted-phone-regression',pages:[{id:'p1',observations:[textObservation(form)]}]}).documents[0];
assert.equal(own.kind,'bol');assert.equal(own.fields.bolNumber.candidates.length,0);
for(const key of ['shipper','consignee','carrier'])assert.equal(own.fields[key].value,null);
for(const type of ['bol','other']){
 const input={type:{id:type},text:form,fields:{shipper:'Signature/Date Trailer Loaded: Freight Counted Carrier Signature/Date',carrierName:'ack; t of packages and required placards.'}};
 const result=finalizeSmartScanAnalysisV11039(input);
 for(const key of ['shipper','carrierName'])assert.ok(!result.fields[key],type+' '+key);
}
const legitimate={fields:{shipper:'Signature Logistics LLC',consignee:'Example Receiver',carrierName:'Example Trucking'}};
assert.equal(guardDocumentReading(legitimate),legitimate,'legitimate company names are retained');
const contaminated={fields:{shipper:'Signature/Date',origin:'Signature/Date'},fieldEvidence:{shipper:{value:'Signature/Date'}},evidenceReviewV11036:{evidence:{shipper:{value:'Signature/Date'}}}};
const guarded=guardDocumentReading(contaminated);assert.equal(guarded.fields.shipper,'');assert.equal(guarded.fields.origin,'');assert.equal(guarded.fieldEvidence.shipper,undefined);assert.equal(guarded.evidenceReviewV11036.evidence.shipper,undefined);assert.equal(contaminated.fields.shipper,'Signature/Date');
console.log('PASS — phone-observed form instructions cannot become party names in either reader');

for(const name of ['3M','GE','H&M','Signature Foods','Sign Company']){const input={fields:{shipper:name}};assert.equal(guardDocumentReading(input),input);}

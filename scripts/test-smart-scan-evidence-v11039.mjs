import assert from 'node:assert/strict';
import {enforceStructuralBolV11034,finalizeSmartScanAnalysisV11039} from '../source/src/modules/scan/engines/isolatedDocumentRouterV10959.js';
import {preserveDocumentDecisionV11039} from '../source/src/modules/scan/smartScanRoutingV11039.js';
import {truckDocumentTypeMetaV1040 as meta} from '../source/src/modules/scan/truckDocumentCatalogV1040.js';
async function test(name,fn){await fn();console.log('PASS — '+name);}
await test('POD remains POD after the production BOL fallback',()=>{
  const input={type:meta('pod'),text:'PROOF OF DELIVERY\nBOL NO: 88004117\nSHIP FROM\nSample Supplier\nSHIP TO\nSample Receiver\nCARRIER: Sample Trucking\nWEIGHT: 1000 LB\nRECEIVER SIGNATURE: _____\nDELIVERY DATE: 9/9/26',fields:{bolNo:'88004117'},confidence:.99};
  assert.equal(enforceStructuralBolV11034(input).type.id,'bol');
  assert.equal(finalizeSmartScanAnalysisV11039(input).type.id,'pod');
  assert.equal(finalizeSmartScanAnalysisV11039(input).fields.signaturePresent,false);
  assert.equal(preserveDocumentDecisionV11039({...input,type:meta('rate_confirmation')},enforceStructuralBolV11034).type.id,'rate_confirmation');
});

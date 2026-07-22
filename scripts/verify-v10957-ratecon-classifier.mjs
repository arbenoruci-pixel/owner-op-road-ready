import assert from 'node:assert/strict';

import {
  classifyPacketPagesV1040,
  classifyTruckDocumentTextV1040,
} from '../source/src/modules/scan/truckDocumentEngineV1040.js';

const redLightningRateCon = `
[[PAGE 1]]
Please have driver call for dispatch.
Confirmation must be signed and returned before driver can be dispatched.
Red Lightning Logistics, LLC.
Carrier: NARTA EXPRESS LLC MC # MC871792
LOAD CONFIRMATION AND PAYMENT AGREEMENT -- PLEASE SIGN & RETURN ASAP
This SOP is incorporated by reference into the Rate Confirmation Agreement.
Flat Rate: $2,700.00
Total: $2,700.00

[[PAGE 2]]
Initial Pickup
Discount Tire Elgin
2451 Bath Rd
ELGIN, IL 60124
Stop #1 (Delivery)
DT 1468 Woodhaven
22160 Allen Rd
WOODHAVEN, MI 48183
LOAD NO: #97155

[[PAGE 3]]
SERVICE COMPLIANCE & ADMINISTRATIVE CHARGES
Failure to submit required POD/BOL documentation within ten days may result in billing delay.
All required documentation, including signed Proof of Delivery and Bill of Lading, must be submitted.
BROKER SIGNATURE: Red Lightning Logistics, LLC. CARRIER SIGNATURE:
`;

const classification = classifyTruckDocumentTextV1040({
  text:redLightningRateCon,
  fileName:'CarrierConfirmation97155_ready_to_sign(1).pdf',
  baseTypeId:'pod',
  preferredType:'auto',
  context:{},
});

assert.equal(
  classification.type.id,
  'rate_confirmation',
  `Expected Rate Confirmation, received ${classification.type.id}. Alternatives: ${classification.alternatives.map(item => `${item.id}:${item.score}`).join(', ')}`,
);
assert.ok(classification.score >= 200, `Expected strong Rate Confirmation score, received ${classification.score}`);
assert.ok(
  classification.evidence.some(item => item.source === 'contract-structure-v10957'),
  'Rate Confirmation decision must include contract-structure evidence',
);

const packet = classifyPacketPagesV1040(redLightningRateCon, {
  fileName:'CarrierConfirmation97155_ready_to_sign(2).pdf',
  pageCount:3,
  context:{},
});
assert.ok(
  packet.pages.every(page => page.classification.type.id !== 'pod'),
  `Contract boilerplate must not turn packet pages into POD pages: ${packet.pages.map(page => `${page.page}:${page.classification.type.id}`).join(', ')}`,
);

const realPod = classifyTruckDocumentTextV1040({
  text:`
PROOF OF DELIVERY
Load No: 97155
Delivered Date: 07/23/2026
Received by: John Smith
Receiver Signature: John Smith
Freight received in good order.
`,
  fileName:'signed_POD_97155.pdf',
  baseTypeId:'pod',
  preferredType:'auto',
  context:{},
});
assert.equal(realPod.type.id, 'pod', `A signed receiver POD must remain POD, received ${realPod.type.id}`);

const realBol = classifyTruckDocumentTextV1040({
  text:`
STRAIGHT BILL OF LADING
BOL Number: ABC123456
Shipper: Example Foods LLC
Consignee: Example Market LLC
Seal Number: 991122
Freight Charges: Prepaid
`,
  fileName:'BOL_ABC123456.pdf',
  baseTypeId:'bol',
  preferredType:'auto',
  context:{},
});
assert.equal(realBol.type.id, 'bol', `A true Bill of Lading must remain BOL, received ${realBol.type.id}`);

console.log('v109.5.7 Rate Confirmation classifier regression passed');

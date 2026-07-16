import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextFlashDecisionV1031, scannerLockDecisionV1031 } from '../source/src/modules/scan/scannerPolicyV1031.js';
import { podBillingPatchV1031, resolvePodDecisionV1031 } from '../source/src/modules/scan/podWorkflowV1031.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const locked = scannerLockDecisionV1031({
  quality:{ paperDetected:true, confidence:.84, coverage:.68, angleScore:.82, sharpness:19, score:91, brightness:154, glareRatio:.012 },
  cornerDelta:.004,
  flashAgeMs:1800,
});
assert.equal(locked.ready,true);
assert.equal(scannerLockDecisionV1031({
  quality:{ paperDetected:true, confidence:.84, coverage:.68, angleScore:.82, sharpness:8, score:75, brightness:154, glareRatio:.012 },
  cornerDelta:.004,
  flashAgeMs:1800,
}).ready,false);
assert.deepEqual(nextFlashDecisionV1031({ mode:'auto', supported:true, torchOn:false, darkFrames:5, brightFrames:0, sinceChangeMs:4000 }).change,false);
assert.deepEqual(nextFlashDecisionV1031({ mode:'auto', supported:true, torchOn:false, darkFrames:6, brightFrames:0, sinceChangeMs:4000 }).desired,true);
assert.deepEqual(nextFlashDecisionV1031({ mode:'off', supported:true, torchOn:true }).desired,false);

const podText = `BILL OF LADING
CONSIGNED TO SYSCO MINNESOTA
RECEIVED SYSCO MINNESOTA WITH THE FOLLOWING EXCEPTIONS
CONSIGNEE SIGNATURE`;
const autoPod = resolvePodDecisionV1031({ preferredType:'auto', detectedType:'bol', text:podText });
assert.equal(autoPod.isPod,true);
assert.equal(autoPod.signedEvidence,true);
const manualPod = resolvePodDecisionV1031({ preferredType:'pod', detectedType:'bol', text:'BILL OF LADING' });
assert.equal(manualPod.isPod,true);
assert.equal(manualPod.signedEvidence,false);

const store = {
  loads:[{ id:'load_1', loadNo:'391912', status:'in_transit', documentId:'rate_1' }],
  documents:[
    { type:'rate_confirmation', loadNo:'391912' },
    { type:'bol', loadNo:'391912' },
    { type:'pod', loadNo:'391912', podSigned:true, extracted:{ type:'pod', podSigned:true } },
  ],
};
const billing = podBillingPatchV1031({ store, loadNo:'391912', date:'2026-07-15', podDocumentId:'pod_1' });
assert.equal(billing.ready,true);
assert.equal(billing.patch.status,'invoice_ready');
assert.equal(billing.patch.factoringStatus,'ready_to_submit');

const turbo = read('source/src/modules/scan/TurboDocumentScanner.jsx');
const reader = read('source/src/modules/scan/smartDocumentReaderV1030.js');
const sheet = read('source/src/modules/scan/SmartScanSheetV100.jsx');
const ownerStore = read('source/src/modules/owneros/ownerOpsStoreV102.js');
assert.match(turbo,/scannerLockDecisionV1031/);
assert.match(turbo,/nextFlashDecisionV1031/);
assert.match(reader,/resolvePodDecisionV1031/);
assert.match(sheet,/Receiver signature \/ RECEIVED stamp is visible/);
assert.match(sheet,/Open Billing \/ Factoring/);
assert.match(ownerStore,/document\.extracted\?\.podSigned !== false/);
assert.doesNotMatch(sheet,/currentStatus\s*=|startMin\s*=|endMin\s*=/);

console.log('verify-turboscan-pod-v1031 passed');
await import('./materialize-v1032.mjs');

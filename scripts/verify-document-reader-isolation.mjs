import assert from 'node:assert/strict';
import { readRateConfirmation } from '../source/src/modules/document-readers/rate-confirmation/public-api.js';
import { readPod } from '../source/src/modules/document-readers/pod/public-api.js';

const input = {
  documentId: 'doc_test_1',
  originalFile: { name: 'test.pdf' },
  normalizedFile: null,
};

const unrelatedState = Object.freeze({
  logbook: Object.freeze({ day: '2026-07-24', events: Object.freeze([{ id: 'e1', status: 'OFF' }]) }),
  pod: Object.freeze({ documentId: 'pod_existing', fields: Object.freeze({ signed: true }) }),
});
const before = JSON.stringify(unrelatedState);

const rateResult = await readRateConfirmation(input, async ({ allowedFields }) => ({
  confidence: 0.98,
  fields: { loadNumber: 'LOAD-123', rate: 2500 },
  evidence: allowedFields,
}));

assert.equal(rateResult.kind, 'RATE_CONFIRMATION');
assert.equal(rateResult.fields.rate, 2500);
assert.equal(JSON.stringify(unrelatedState), before, 'Rate reader changed unrelated state');

const podResult = await readPod({ ...input, documentId: 'doc_test_2' }, async () => ({
  confidence: 0.95,
  fields: { loadNumber: 'LOAD-123', signed: true },
}));

assert.equal(podResult.kind, 'POD');
assert.equal(podResult.fields.signed, true);
assert.equal(JSON.stringify(unrelatedState), before, 'POD reader changed unrelated state');
assert.notEqual(rateResult.readerName, podResult.readerName);
assert.notEqual(rateResult.kind, podResult.kind);

console.log('Document reader isolation verification passed.');

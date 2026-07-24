import assert from 'node:assert/strict';
import {
  DOCUMENT_STATUS,
  DOCUMENT_TYPES,
  WEEK_STATUS,
  addAmendment,
  addDocument,
  auditReadiness,
  createDocument,
  createOpenWeek,
  restoreDocument,
  sealWeek,
  softDeleteDocument,
} from '../source/src/modules/records-vault/public-api.js';

const week = createOpenWeek({
  date: '2026-07-24',
  driverId: 'driver-arben',
  carrierName: 'Narta Express LLC',
  vehicleId: 'unit-101',
}, '2026-07-24T12:00:00Z');

assert.equal(week.weekId, '2026-W30');
assert.equal(week.status, WEEK_STATUS.OPEN);

const log = createDocument({
  id: 'doc-log',
  type: DOCUMENT_TYPES.LOG,
  date: '2026-07-24',
  driverId: 'driver-arben',
  fileName: '2026-07-24-log.pdf',
  storageKey: 'files/doc-log',
}, '2026-07-24T12:01:00Z');

const bol = createDocument({
  id: 'doc-bol',
  type: DOCUMENT_TYPES.BOL,
  date: '2026-07-24',
  driverId: 'driver-arben',
  loadId: 'load-98306',
  fileName: 'load-98306-bol.pdf',
  storageKey: 'files/doc-bol',
}, '2026-07-24T12:02:00Z');

const pod = createDocument({
  id: 'doc-pod',
  type: DOCUMENT_TYPES.POD,
  date: '2026-07-24',
  driverId: 'driver-arben',
  loadId: 'load-98306',
  fileName: 'load-98306-pod.pdf',
  storageKey: 'files/doc-pod',
}, '2026-07-24T12:03:00Z');

let next = addDocument(addDocument(addDocument(week, log), bol), pod);
assert.equal(auditReadiness(next).ready, true);

next = softDeleteDocument(next, 'doc-pod', 'testing restore');
assert.equal(next.documents.find(item => item.id === 'doc-pod').status, DOCUMENT_STATUS.DELETED);
assert.equal(auditReadiness(next).ready, false);

next = restoreDocument(next, 'doc-pod');
assert.equal(auditReadiness(next).ready, true);

const sealed = sealWeek(next, '2026-07-27T01:00:00Z');
assert.equal(sealed.status, WEEK_STATUS.SEALED);
assert.throws(() => softDeleteDocument(sealed, 'doc-pod', 'must fail'), /sealed/i);

const amended = addAmendment(sealed, {
  reason: 'Added a clearer POD copy',
  documentIds: ['doc-pod'],
}, '2026-07-28T01:00:00Z');
assert.equal(amended.revision, 2);
assert.equal(amended.amendments.length, 1);

console.log('Records Vault foundation verification passed.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  certificationFingerprintV1032,
  certificationStatusV1032,
  reconcileCertificationStatusesV1032,
} from '../source/src/modules/logbook/certificationFingerprintV1032.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

const baseState = {
  eventsByDay:{
    '2026-07-10':[
      { id:'a', status:'OFF', startMin:0, endMin:480, city:'Chicago', state:'IL', note:'Off Duty', source:'manual', updatedAt:1 },
      { id:'b', status:'ON', startMin:480, endMin:510, city:'Chicago', state:'IL', note:'Pre-Trip Inspection', source:'manual', updatedAt:2 },
      { id:'c', status:'D', startMin:510, endMin:900, city:'Chicago', state:'IL', note:'Driving', shippingDocs:'391912', source:'gps', updatedAt:3 },
      { id:'d', status:'OFF', startMin:900, endMin:1440, city:'Rochelle', state:'IL', note:'Off Duty', source:'manual', updatedAt:4 },
    ],
  },
  inspectionByDay:{
    '2026-07-10':{ complete:true, type:'pretrip', checked:['brakes','lights'], completedAt:1000, sourceStartMin:480, sourceEndMin:510, city:'Chicago', state:'IL', updatedAt:10 },
  },
  manualMilesByDay:{ '2026-07-10':230 },
  driverProfile:{ name:'Arben Oruci' },
  carrierName:'Narta Express LLC',
  mainOfficeAddress:'9S201 Lake Drive, Willowbrook, IL 60527',
  driver:{ truck:'228', trailer:'7005' },
  currentTrailer:'7005',
  routeLegsByDay:{
    '2026-07-10':[{ id:'leg1', kind:'loaded', status:'delivered', pickupDay:'2026-07-10', pickupMin:510, deliveryDay:'2026-07-10', deliveryMin:900, fromCity:'Chicago', fromState:'IL', toCity:'Rochelle', toState:'IL', shippingDocs:'391912', updatedAt:99 }],
  },
  signatureByDay:{},
  certifyStatus:{},
};

const fingerprint = certificationFingerprintV1032(baseState, '2026-07-10');
const metadataOnly = structuredClone(baseState);
metadataOnly.eventsByDay['2026-07-10'] = metadataOnly.eventsByDay['2026-07-10'].map((event, index) => ({
  ...event,
  id:`new_${index}`,
  source:index % 2 ? 'sync' : 'normalized',
  updatedAt:Date.now() + index,
  client_event_id:`client_${index}`,
}));
metadataOnly.inspectionByDay['2026-07-10'] = { ...metadataOnly.inspectionByDay['2026-07-10'], updatedAt:Date.now(), sourceEventId:'different-id' };
metadataOnly.routeLegsByDay['2026-07-10'][0] = { ...metadataOnly.routeLegsByDay['2026-07-10'][0], id:'new-leg-id', updatedAt:Date.now() };
assert.equal(certificationFingerprintV1032(metadataOnly, '2026-07-10'), fingerprint, 'metadata-only changes must not invalidate certification');

const timeEdit = structuredClone(baseState);
timeEdit.eventsByDay['2026-07-10'][2].startMin = 511;
assert.notEqual(certificationFingerprintV1032(timeEdit, '2026-07-10'), fingerprint, 'time edit must invalidate certification');

const locationEdit = structuredClone(baseState);
locationEdit.eventsByDay['2026-07-10'][2].city = 'Aurora';
assert.notEqual(certificationFingerprintV1032(locationEdit, '2026-07-10'), fingerprint, 'location edit must invalidate certification');

const milesEdit = structuredClone(baseState);
milesEdit.manualMilesByDay['2026-07-10'] = 231;
assert.notEqual(certificationFingerprintV1032(milesEdit, '2026-07-10'), fingerprint, 'miles edit must invalidate certification');

const inspectionEdit = structuredClone(baseState);
inspectionEdit.inspectionByDay['2026-07-10'].checked.push('tires');
assert.notEqual(certificationFingerprintV1032(inspectionEdit, '2026-07-10'), fingerprint, 'inspection edit must invalidate certification');

const signedState = {
  ...baseState,
  signatureByDay:{ '2026-07-10':{ signed:true, signedAt:100, certifiedFingerprint:fingerprint } },
  certifyStatus:{ '2026-07-10':'Needs Recertification' },
};
assert.equal(certificationStatusV1032(signedState, '2026-07-10').status, 'Certified', 'matching fingerprint must override stale textual recert status');

const changedSignedState = structuredClone(signedState);
changedSignedState.eventsByDay['2026-07-10'][2].endMin = 901;
assert.equal(certificationStatusV1032(changedSignedState, '2026-07-10').status, 'Needs Recertification', 'real content change must require recertification');

const legacyCertified = {
  ...baseState,
  signatureByDay:{ '2026-07-10':{ signed:true, signedAt:100 } },
  certifyStatus:{ '2026-07-10':'Certified' },
};
const migrated = reconcileCertificationStatusesV1032(legacyCertified);
assert.ok(migrated.signatureByDay['2026-07-10'].certifiedFingerprint, 'legacy certified day must receive fingerprint');
assert.equal(migrated.certifyStatus['2026-07-10'], 'Certified');

const legacyRecert = {
  ...baseState,
  signatureByDay:{ '2026-07-10':{ signed:true, signedAt:100 } },
  certifyStatus:{ '2026-07-10':'Needs Recertification' },
};
const preserved = reconcileCertificationStatusesV1032(legacyRecert);
assert.equal(preserved.signatureByDay['2026-07-10'].certifiedFingerprint, undefined, 'legacy recertification must not be silently certified');
assert.equal(preserved.certifyStatus['2026-07-10'], 'Needs Recertification');

const app = read('source/src/app/App.jsx');
const signing = read('source/src/modules/logbook/signing.js');
const unsigned = read('source/src/modules/logbook/UnsignedLogsScreen.jsx');
assert.match(app,/certifiedFingerprint:certifiedFingerprintV1032/);
assert.match(app,/reconcileCertificationStatusesV1032/);
assert.match(app,/function signLogDays\(days = \[\]\)/);
assert.match(signing,/certificationStatusV1032/);
assert.match(unsigned,/onSignAll \? onSignAll\(days\)/);
assert.doesNotMatch(app,/eventsByDay\s*=\s*.*certificationFingerprint/);

console.log('verify-certification-fingerprint-v1032 passed');
await import('./materialize-v1033.mjs');

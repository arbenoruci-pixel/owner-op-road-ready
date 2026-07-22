import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  duplicateSignatureV10963,
  isQuotaErrorV10963,
  saveScannedDocumentQuotaSafeV10963,
} from '../source/src/modules/scan/quotaSafeScanStorageV10963.js';
import {
  compactBusinessStoreForQuotaV10963,
  writeBusinessStore,
} from '../source/src/modules/business/businessStore.js';

assert.equal(typeof saveScannedDocumentQuotaSafeV10963, 'function');
assert.equal(isQuotaErrorV10963({ name:'QuotaExceededError', message:'The quota has been exceeded.' }), true);
assert.equal(isQuotaErrorV10963(new Error('network failed')), false);
assert.equal(
  duplicateSignatureV10963({ fileName:'Rate Con 97155.pdf', fileSize:12345, type:'rate_confirmation', loadNo:'97155' }),
  duplicateSignatureV10963({ fileName:'Rate Con 97155.pdf', fileSize:12345, type:'rate_confirmation', loadNo:'97155' }),
  'recent partial-save duplicate detection must be deterministic',
);

const largeStore = {
  loads:[{ id:'load_97155', loadNo:'97155', canonicalLoadNo:'97155', broker:'Red Lightning Logistics, LLC', status:'booked', createdAt:1, updatedAt:2 }],
  settlements:[], fuel:[], maintenance:[], expenses:[],
  documents:[{
    id:'document_97155',
    clientDocumentId:'client_97155',
    type:'rate_confirmation',
    title:'Rate Confirmation · Load 97155',
    canonicalLoadNo:'97155',
    loadNo:'97155',
    broker:'Red Lightning Logistics, LLC',
    documentDate:'2026-07-22',
    status:'verified',
    reviewStatus:'verified',
    folder:'load:97155',
    references:[{ kind:'load_number', value:'97155' }],
    extracted:{
      loadNo:'97155', broker:'Red Lightning Logistics, LLC', origin:'Elgin, IL', destination:'Woodhaven, MI', total:2700,
      intelligence:{ raw:'x'.repeat(1_200_000), packet:{ pages:Array.from({ length:80 }, () => 'x'.repeat(1000)) } },
    },
    classification:{ selectedType:'rate_confirmation', detectedType:'rate_confirmation', confidence:.94, method:'isolated-engine', routing:{ raw:'x'.repeat(800_000) } },
    auditTrail:Array.from({ length:100 }, (_, index) => ({ id:'audit_' + index, at:index, detail:'saved' })),
    createdAt:1,
    updatedAt:2,
  }],
  updatedAt:2,
};

const compact = compactBusinessStoreForQuotaV10963(largeStore);
assert.equal(compact.documents.length, 1);
assert.equal(compact.documents[0].canonicalLoadNo, '97155');
assert.equal(compact.documents[0].broker, 'Red Lightning Logistics, LLC');
assert.equal(compact.documents[0].extracted.origin, 'Elgin, IL');
assert.equal(compact.documents[0].extracted.destination, 'Woodhaven, MI');
assert.equal(compact.documents[0].extracted.intelligence, undefined);
assert.equal(compact.documents[0].classification.routing, undefined);
assert.equal(compact.documents[0].auditTrail.length, 20);

let storedValue = '';
let dispatched = null;
const fakeStorage = {
  getItem() { return storedValue || null; },
  removeItem() { storedValue = ''; },
  setItem(_key, value) {
    if (String(value).length > 180_000) {
      const error = new Error('The quota has been exceeded.');
      error.name = 'QuotaExceededError';
      throw error;
    }
    storedValue = String(value);
  },
};

globalThis.CustomEvent = globalThis.CustomEvent || class CustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
};
globalThis.window = {
  localStorage:fakeStorage,
  dispatchEvent(event) { dispatched = event; },
};
const stored = writeBusinessStore(largeStore);
assert.ok(storedValue.length > 0, 'quota recovery must persist a compact Vault index');
assert.equal(stored.documents[0].canonicalLoadNo, '97155');
assert.equal(JSON.parse(storedValue).documents[0].loadNo, '97155');
assert.equal(dispatched?.type, 'owner-op-business-updated');
delete globalThis.window;

const sheet = fs.readFileSync('source/src/modules/scan/SmartScanSheetV105.jsx', 'utf8');
const storage = fs.readFileSync('source/src/modules/scan/quotaSafeScanStorageV10963.js', 'utf8');
const business = fs.readFileSync('source/src/modules/business/businessStore.js', 'utf8');
const version = JSON.parse(fs.readFileSync('public/app-version.json', 'utf8'));

assert.ok(sheet.includes("saveScannedDocumentQuotaSafeV10963 as saveScannedDocument"), 'production V105 scanner must use quota-safe storage');
assert.ok(sheet.includes('activeRateConFieldsV10962'), 'Rate Confirmation board activation must remain installed');
assert.ok(storage.includes("where('sync_state').equals('synced')"), 'cleanup may remove only originals already cloud-synced');
assert.ok(storage.includes('cloudOnly:cloud.status === \'synced\' && !localBlobStored'), 'cloud-only preservation fallback must be recorded');
assert.ok(storage.includes('recentDuplicateV10963'), 'partial saves must be reused on retry');
assert.equal(storage.includes('app_snapshots.clear'), false, 'quota recovery must never clear Logbook state');
assert.equal(storage.includes('eventsByDay'), false, 'quota recovery must not change duty events');
assert.ok(business.includes('compactBusinessStoreForQuotaV10963'));
assert.equal(version.version, '109.6.3');
assert.equal(version.build, 'v10963-quota-safe-document-save');

console.log('PASS — v109.6.3 saves through iPhone quota pressure, preserves the original locally or in cloud, and keeps Load 97155 board activation intact');

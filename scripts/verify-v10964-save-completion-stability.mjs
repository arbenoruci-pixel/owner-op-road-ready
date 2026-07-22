import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  RATE_CON_SAVE_STABILITY_VERSION_V10964,
  chooseRateConLoadNoV10964,
  compactRateConAnalysisV10964,
  compactRateConSaveFieldsV10964,
  extractRateConLoadNoFromFileV10964,
  savedViewModelV10964,
} from '../source/src/modules/scan/rateConSaveStabilityV10964.js';

assert.equal(RATE_CON_SAVE_STABILITY_VERSION_V10964, '109.6.4');
assert.equal(extractRateConLoadNoFromFileV10964('CarrierConfirmation97155_ready_to_sign(1).pdf'), '97155');
assert.equal(extractRateConLoadNoFromFileV10964('carrier-confirmation-424590-1.pdf'), '424590-1');
assert.equal(extractRateConLoadNoFromFileV10964('invoice-2026-07-22.pdf'), '');

assert.equal(chooseRateConLoadNoV10964({
  typeId:'rate_confirmation',
  extractedLoadNo:'97155',
  match:{ loadNo:'424590-1', status:'completed', strongReference:false },
}), '97155', 'new Rate Con filename/load identity must outrank an old completed PO match');
assert.equal(chooseRateConLoadNoV10964({
  typeId:'rate_confirmation',
  match:{ loadNo:'424590-1', status:'completed', strongReference:false },
}), '', 'weak completed-load match must not be auto-selected for a new Rate Con');
assert.equal(chooseRateConLoadNoV10964({
  typeId:'rate_confirmation',
  match:{ loadNo:'424590-1', status:'completed', strongReference:true },
}), '424590-1', 'an exact strong reference may still match a completed load for filing review');

const huge = 'X'.repeat(300000);
const fields = compactRateConSaveFieldsV10964({
  loadNo:'97155',
  broker:'Red Lightning Logistics, LLC',
  equipment:'Power Only',
  trackingProvider:'FourKites',
  origin:'Elgin, IL',
  destination:'Woodhaven, MI',
  total:2700,
  rawText:huge,
  intelligence:{ packet:huge },
  stops:[
    { type:'pickup', company:'Discount Tire Elgin', address:'2451 Bath Rd', city:'Elgin', state:'IL', date:'2026-07-22' },
    { type:'delivery', company:'DT 1468 Woodhaven', address:'22160 Allen Rd', city:'Woodhaven', state:'MI', date:'2026-07-23', deliverySequence:1 },
  ],
});
assert.equal(fields.loadNo, '97155');
assert.equal(fields.rawText, undefined);
assert.equal(fields.intelligence, undefined);
assert.equal(fields.stops.length, 2);
assert.equal(fields.stops[0].address, '2451 Bath Rd');

const analysis = compactRateConAnalysisV10964({
  type:{ id:'rate_confirmation' },
  detectedType:{ id:'rate_confirmation' },
  confidence:.94,
  method:'isolated-engine:rate-confirmation-engine@1.1.0',
  text:huge,
  packet:{ huge },
  routing:{ huge },
}, fields);
assert.equal(analysis.fields.loadNo, '97155');
assert.ok(analysis.text.length <= 12000);
assert.equal(analysis.packet, undefined);
assert.equal(analysis.routing, undefined);

const saved = savedViewModelV10964({
  record:{ canonicalLoadNo:'97155', broker:'Red Lightning Logistics, LLC', documentDate:'2026-07-22', fileName:'CarrierConfirmation97155.pdf', extracted:{ huge } },
  meta:{ id:'rate_confirmation', label:'Rate Confirmation', huge },
  stored:{ cloud:{ status:'synced', body:{ huge } }, storage:{ localBlob:false, cloudOnly:true } },
});
assert.equal(saved.record.canonicalLoadNo, '97155');
assert.equal(saved.meta.label, 'Rate Confirmation');
assert.equal(saved.stored.cloud.status, 'synced');
assert.equal(saved.record.extracted, undefined);
assert.equal(saved.stored.cloud.body, undefined);

const sheet = fs.readFileSync('source/src/modules/scan/SmartScanSheetV105.jsx', 'utf8');
const business = fs.readFileSync('source/src/modules/business/businessStore.js', 'utf8');
const version = JSON.parse(fs.readFileSync('public/app-version.json', 'utf8'));

assert.ok(sheet.includes("from './rateConSaveStabilityV10964.js'"));
assert.ok(sheet.includes("fileName:nextFile.name || scanMeta?.originalFileName"));
assert.ok(sheet.includes('extractRateConLoadNoFromFileV10964'));
assert.ok(sheet.includes('chooseRateConLoadNoV10964'));
assert.ok(sheet.includes('storageFieldsV10964'));
assert.ok(sheet.includes('savedViewModelV10964'));
assert.ok(sheet.includes("source:'road_ready_os_v105_ratecon_board_v10964'"));
assert.ok(sheet.includes('setFile(null)'));
assert.ok(sheet.includes('setAnalysis(null)'));
assert.ok(!sheet.includes("source:'road_ready_os_v105_ratecon_board_v10962'"), 'old full-analysis dispatch must be removed');
assert.ok(!sheet.includes('extracted:{ ...mergedFields, intelligence }'), 'full intelligence must not be written to iPhone storage');
assert.ok(business.includes('const volatile = window.__OWNER_OP_BUSINESS_STORE_VOLATILE_V10963__'));
assert.ok(business.includes("new CustomEvent(BUSINESS_STORE_EVENT, { detail:null })"));
assert.equal(version.version, '109.6.4');
assert.equal(version.build, 'v10964-save-completion-stability');

console.log('PASS — v109.6.4 saves Rate Con 97155 without full-analysis memory pressure or weak completed-load relinking');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFullBackupPayloadV105,
  extractFullBackupV105,
  fullBackupSummaryV105,
} from '../source/src/modules/backup/fullBackupV105.js';

const state = {
  activeDay:'2026-07-15',
  currentStatus:'OFF',
  currentReason:'Off Duty',
  currentLocation:{ city:'Mounds View', state:'MN' },
  eventsByDay:{
    '2026-07-14':[
      { id:'off_1', status:'OFF', startMin:0, endMin:547, city:'Chicago', state:'IL' },
      { id:'on_1', status:'ON', startMin:547, endMin:562, city:'Chicago', state:'IL', note:'Pre-trip Inspection' },
      { id:'drive_1', status:'D', startMin:562, endMin:693, city:'Chicago', state:'IL' },
    ],
    '2026-07-15':[
      { id:'sb_1', status:'SB', startMin:0, endMin:420, city:'Mounds View', state:'MN' },
    ],
  },
  signatureByDay:{ '2026-07-14':{ signed:true, driverName:'Driver' } },
  inspectionByDay:{ '2026-07-14':{ complete:true, type:'pretrip' } },
  certifyStatus:{ '2026-07-14':'Certified', '2026-07-15':'Active day / Not certified yet' },
  routeLegsByDay:{
    '2026-07-14':[
      { id:'leg_1', loadNo:'391912', fromCity:'Rochelle', fromState:'IL', toCity:'Mounds View', toState:'MN', status:'planned' },
    ],
  },
  documentsByDay:{ '2026-07-14':[{ id:'doc_1', type:'rate_confirmation' }] },
  fuelReceiptsByDay:{ '2026-07-14':[{ id:'fuel_1', total:250 }] },
  loadGuidesById:{ load_391912:{ id:'load_391912', loadNo:'391912', status:'active' } },
  activeLoadGuideId:'load_391912',
  loadInfo:{ loadNo:'391912', pickupCity:'Rochelle', pickupState:'IL', deliveryCity:'Rice', deliveryState:'MN' },
  dotWallet:{ documents:{} },
};
const business = {
  loads:[{ id:'load_business_1', loadNo:'391912' }],
  fuel:[{ id:'fuel_business_1', total:250 }],
  maintenance:[],
  expenses:[],
  settlements:[],
  documents:[{ id:'business_doc_1', type:'rate_confirmation' }],
};

const summary = fullBackupSummaryV105(state, business);
assert.equal(summary.logDays, 2);
assert.equal(summary.events, 4);
assert.equal(summary.signatures, 1);
assert.equal(summary.inspections, 1);
assert.equal(summary.routeLegs, 1);
assert.equal(summary.loadGuides, 1);
assert.equal(summary.businessLoads, 1);

const payload = buildFullBackupPayloadV105(state, business, { appVersion:'100.5.0', createdAt:'2026-07-15T12:00:00.000Z' });
assert.equal(payload.schemaVersion, 2);
assert.equal(payload.state.loadInfo.loadNo, '391912');
assert.equal(payload.businessStore.loads[0].loadNo, '391912');
assert.equal(payload.logbookIndex.length, 2);
assert.ok(payload.logbookIndex.find(day => day.day === '2026-07-14').loadReferences.includes('391912'));

const extracted = extractFullBackupV105(payload);
assert.equal(extracted.state.eventsByDay['2026-07-14'].length, 3);
assert.equal(extracted.businessStore.documents.length, 1);
assert.equal(extracted.summary.events, 4);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logbookHome = fs.readFileSync(path.join(ROOT, 'source/src/modules/logbook/LogbookHomeScreen.jsx'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'source/src/app/App.jsx'), 'utf8');
const backup = fs.readFileSync(path.join(ROOT, 'source/src/modules/backup/BackupLogsScreen.jsx'), 'utf8');
assert.ok(logbookHome.includes('Export / Import all logs'));
assert.ok(logbookHome.includes('onOpenTransfer'));
assert.ok(app.includes("view:'backup'"));
assert.ok(app.includes("view:'logbook'"));
assert.ok(backup.includes('Export all days'));
assert.ok(backup.includes('Import all data'));
assert.ok(backup.includes('automatic_pre_import_safety_v105'));

console.log('verify-full-backup-v105 passed');

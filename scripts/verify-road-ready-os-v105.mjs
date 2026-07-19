import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyVaultDocumentCommitV105,
  buildVaultDocumentV105,
  collectLoadCandidatesV105,
  doesLoadHaveDocumentV105,
  isDateLikeReferenceV105,
  latestOpenLoadV105,
  loadDocumentSummaryV105,
  matchDocumentToLoadV105,
  migrateBusinessStoreV105,
  repairRoadReadyFoundationV105,
  upsertVaultDocumentV105,
} from '../source/src/modules/documents/documentFoundationV105.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function read(relative) { return fs.readFileSync(path.join(ROOT, relative), 'utf8'); }
function pass(condition, label) {
  assert.ok(condition, label);
  console.log(`PASS ${label}`);
}

const event = (id, status, startMin, city, state, note, loadNo = '') => ({
  id, status, startMin, endMin:startMin + 15, city, state, note, description:'',
  loadNo, shippingDocs:loadNo,
});

const state = {
  activeDay:'2026-07-18',
  activeLoadGuideId:'load_guide_391912',
  currentStatus:'OFF',
  currentReason:'Off Duty',
  currentLocation:{ city:'Braidwood', state:'IL' },
  loadInfo:{
    loadNo:'178564',
    shippingDocs:'178564',
    bol:'178564',
    po:'178564',
    broker:'H & N Logistics, LLC',
    rate:4800,
    gross:4800,
    guideId:'load_guide_391912',
    orderNo:'391912',
    legNo:'395851',
    stops:[
      { type:'pickup', city:'on: 2026-07-17' },
      { type:'delivery', city:'Date: 2026-07-18' },
    ],
  },
  loadGuidesById:{
    load_guide_391912:{
      id:'load_guide_391912',
      loadNo:'391912',
      orderNo:'391912',
      legNo:'395851',
      broker:'H & N Logistics, LLC',
      rate:4800,
      status:'active',
      deliveryCount:5,
      completedStopIds:['1','2','3','4','5'],
      stops:[
        { id:'pickup_1', type:'pickup', city:'Rochelle', state:'IL', date:'2026-07-14' },
        { id:'delivery_2', type:'delivery', city:'Mounds View', state:'MN', poNumber:'26144210' },
        { id:'delivery_3', type:'delivery', city:'Brooklyn Center', state:'MN', poNumber:'2792' },
        { id:'delivery_4', type:'delivery', city:'Rogers', state:'MN', poNumber:'26150893478' },
        { id:'delivery_5', type:'delivery', city:'Saint Cloud', state:'MN', poNumber:'4929910' },
        { id:'delivery_6', type:'delivery', city:'Rice', state:'MN', poNumber:'26242159510' },
      ],
    },
    load_guide_98306:{
      id:'load_guide_98306',
      loadNo:'98306',
      status:'active',
      deliveryCount:1,
      completedStopIds:['1'],
      stops:[
        { id:'pickup_1', type:'pickup', city:'on: 2026-07-17' },
        { id:'delivery_1', type:'delivery', city:'Date: 2026-07-18' },
      ],
    },
  },
  routeLegsByDay:{
    '2026-07-14':[
      { id:'g391_1', loadGroupId:'load_guide_391912', loadNo:'391912', stopSequence:1, status:'delivered', stopStatus:'done', toCity:'Mounds View', toState:'MN', po:'26144210' },
    ],
    '2026-07-15':[
      { id:'g391_2', loadGroupId:'load_guide_391912', loadNo:'391912', stopSequence:2, status:'delivered', stopStatus:'done', toCity:'Brooklyn Center', toState:'MN', po:'2792' },
      { id:'g391_3', loadGroupId:'load_guide_391912', loadNo:'391912', stopSequence:3, status:'delivered', stopStatus:'done', toCity:'Rogers', toState:'MN', po:'26150893478' },
    ],
    '2026-07-16':[
      { id:'g391_4', loadGroupId:'load_guide_391912', loadNo:'391912', stopSequence:4, status:'delivered', stopStatus:'done', toCity:'Saint Cloud', toState:'MN', po:'4929910' },
    ],
    '2026-07-17':[
      { id:'g391_5', loadGroupId:'load_guide_391912', loadNo:'391912', stopSequence:5, status:'delivered', stopStatus:'done', toCity:'Rice', toState:'MN', po:'26242159510' },
      { id:'g983', loadGroupId:'load_guide_98306', loadNo:'98306', stopSequence:1, status:'planned', toCity:'Date: 2026-07-18', updatedAt:9999 },
    ],
    '2026-07-18':[
      { id:'l178', loadNo:'178564', shippingDocs:'178564', pickupEventId:'pickup178', status:'open', fromCity:'Sherman', fromState:'IL', toCity:'', toState:'', updatedAt:8000 },
    ],
  },
  eventsByDay:{
    '2026-07-15':[event('delivery1','ON',573,'Mounds View','MN','Pre-trip inspection · Delivery / Unloading','391912')],
    '2026-07-17':[
      event('delivery4','ON',228,'St. Cloud','MN','Pre-trip inspection · Delivery / Unloading','391912'),
      event('pickup983','ON',495,'Lakeville','MN','Pickup / Loading','98306'),
    ],
    '2026-07-18':[
      { ...event('pretrip18','ON',504,'Mount Sterling','IL','Delivery / Unloading · Pre-trip inspection','391912'), description:'Log arrival at stop 1 · Delivery' },
      event('pickup178','ON',635,'Sherman','IL','Pickup / Loading','178564'),
    ],
  },
  inspectionByDay:{
    '2026-07-15':{ source:'auto_on_duty_pretrip_event', sourceEventId:'delivery1', complete:true },
    '2026-07-17':{ source:'auto_on_duty_pretrip_event', sourceEventId:'delivery4', complete:true },
    '2026-07-18':{ source:'auto_on_duty_pretrip_event', sourceEventId:'pretrip18', complete:true },
  },
  certifyStatus:{ '2026-07-17':'Certified' },
  signatureByDay:{ '2026-07-17':{ signed:true } },
  documentsByDay:{
    '2026-07-16':[{ id:'state-doc', type:'pod', title:'State-only POD', date:'2026-07-16', loadNo:'391912' }],
  },
};

const businessStore = {
  loads:[
    { id:'b391', loadNo:'391912', broker:'H & N Logistics, LLC', origin:'Rochelle, IL', destination:'Rice, MN', status:'in_progress' },
    { id:'b983', loadNo:'98306', origin:'on: 2026-07-17', destination:'Date: 2026-07-18', status:'invoiced' },
  ],
  documents:[],
  settlements:[],
  fuel:[],
  maintenance:[],
  expenses:[],
};

pass(isDateLikeReferenceV105('07/19/2026'), 'date cannot become a Load number');
pass(isDateLikeReferenceV105('20260718'), 'compact date cannot become a Load number');
pass(!isDateLikeReferenceV105('391912'), 'real Load number remains valid');

const candidates = collectLoadCandidatesV105(state, businessStore);
pass(candidates.find(candidate => candidate.loadNo === '391912')?.status === 'completed', 'finished five-stop load is completed');
pass(latestOpenLoadV105(state, businessStore)?.loadNo === '178564', 'latest real open pickup becomes active load');

const fuelMatch = matchDocumentToLoadV105({
  state,
  businessStore,
  typeId:'fuel_receipt',
  fields:{ merchant:'Pilot', gallons:120.4, date:'2026-07-18' },
  analysis:{ fields:{} },
});
pass(fuelMatch.loadNo === '', 'ordinary fuel receipt is not forced into an unrelated load folder');

const match = matchDocumentToLoadV105({
  state,
  businessStore,
  typeId:'pod',
  fields:{
    loadNo:'1018266585',
    bolNo:'0025075693',
    poNumber:'26150893478',
    destination:'Rogers, MN',
    date:'2026-07-16',
  },
  analysis:{ fields:{ salesOrder:'1018266585', deliveryNo:'8004932547' } },
});
pass(match.loadNo === '391912', 'sales order is mapped through aliases to canonical Load 391912');
pass(match.stopSequence === 3, 'Rogers POD maps to delivery stop 3');
pass(match.score >= 90, 'PO and receiver evidence produce a strong match');

const repaired = repairRoadReadyFoundationV105(state, { source:'regression' });
pass(repaired.loadInfo.loadNo === '178564', 'mixed loadInfo is rebuilt for Load 178564');
pass(repaired.loadInfo.guideId === '', 'completed 391912 guide is removed from active load');
pass(repaired.loadInfo.broker === '', 'old broker does not leak into the new load');
pass(repaired.activeLoadGuideId === '', 'stale active guide is cleared');
pass(repaired.loadGuidesById.load_guide_391912.status === 'completed', '391912 guide closes');
pass(repaired.loadGuidesById.load_guide_98306.reviewStatus === 'needs_review', 'date-as-city route is quarantined');
pass(repaired.eventsByDay['2026-07-17'][0].note === 'Delivery / Unloading', 'hidden Pre-trip label is removed');
pass(repaired.eventsByDay['2026-07-17'][0].startMin === 228, 'log repair preserves duty time');
pass(repaired.eventsByDay['2026-07-17'][0].status === 'ON', 'log repair preserves duty status');
pass(repaired.eventsByDay['2026-07-17'][0].city === 'St. Cloud', 'log repair preserves location');
pass(repaired.inspectionByDay['2026-07-17'] == null, 'false auto inspection is removed');
pass(repaired.certifyStatus['2026-07-17'] === 'Needs Recertification', 'signed changed note requires driver recertification');
pass(repaired.eventsByDay['2026-07-18'][0].note === 'Pre-trip inspection', 'off-route Jul 18 event keeps the real Pre-trip activity');
pass(repaired.eventsByDay['2026-07-18'][0].description === '', 'stale mission delivery text is removed');
pass(repaired.inspectionByDay['2026-07-18']?.sourceEventId === 'pretrip18', 'real Jul 18 Pre-trip inspection stays linked');
pass(repaired.routeLegsByDay['2026-07-17'].find(leg => leg.id === 'g983').excludedFromActiveLoad === true, 'date-as-city route is excluded from active load');

const record = buildVaultDocumentV105({
  stored:{
    localDocument:{
      local_id:'doc1',
      client_document_id:'client1',
      original_file_name:'signed-bol.jpg',
      mime_type:'image/jpeg',
    },
    cloud:{ status:'local_only' },
  },
  type:{ id:'pod', label:'Proof of Delivery' },
  fields:{ title:'Signed BOL', poNumber:'26150893478', date:'2026-07-16' },
  analysis:{ confidence:.94, method:'truck-document-intelligence-v1042', fields:{ salesOrder:'1018266585' } },
  match,
  selectedLoadNo:'391912',
  selectedStopSequence:3,
  selectedStop:match.stop,
  documentDate:'2026-07-16',
  linkDay:'2026-07-16',
  linkToLogbook:true,
  userConfirmed:true,
});
pass(record.canonicalLoadNo === '391912', 'Vault record stores canonical load separately');
pass(record.stopSequence === 3, 'Vault record stores exact stop');
pass(record.status === 'verified', 'driver-confirmed document is filed');

let store = upsertVaultDocumentV105(businessStore, record, state);
store = upsertVaultDocumentV105(store, record, state);
pass(store.documents.filter(document => document.id === 'doc1').length === 1, 'retry does not duplicate the same document');
pass(loadDocumentSummaryV105(store, '391912').podPresent, 'central checklist sees POD');
pass(doesLoadHaveDocumentV105(store, '391912', 'pod', 3), 'central checklist sees stop POD');

const stateAfterDocument = applyVaultDocumentCommitV105(repaired, { record });
pass(JSON.stringify(stateAfterDocument.eventsByDay) === JSON.stringify(repaired.eventsByDay), 'document commit does not rewrite log events');
pass(stateAfterDocument.loadInfo.loadNo === '178564', 'old POD cannot replace current active load');
pass(stateAfterDocument.loadGuidesById.load_guide_391912.documents.podByStop['3'] === 'doc1', 'mission receives the stop document');
pass(stateAfterDocument.loadGuidesById.load_guide_391912.documents.podDocumentId !== 'doc1', 'intermediate POD does not close final billing');

const migrated = migrateBusinessStoreV105({
  ...businessStore,
  documents:[
    { id:'bad', type:'bol', loadNo:'07/19/2026', date:'2020-07-19', title:'Bill of Lading' },
    { id:'good', type:'rate_confirmation', loadNo:'391912', date:'2026-07-14', title:'Rate Con' },
  ],
}, state);
pass(migrated.documents.find(document => document.id === 'bad').status === 'needs_review', 'date-as-load legacy document moves to Needs Review');
pass(migrated.documents.find(document => document.id === 'bad').canonicalLoadNo === '', 'invalid legacy load link is cleared');
pass(migrated.documents.find(document => document.id === 'good').canonicalLoadNo === '391912', 'valid legacy document is retained');
pass(migrated.documents.some(document => document.id === 'state-doc'), 'state-only log document is imported into the Vault');

const reviewOnlyStore = migrateBusinessStoreV105({ ...businessStore, documents:[{ id:'review-bol', type:'bol', loadNo:'391912', date:'2020-07-19', status:'needs_review' }] }, state);
pass(!doesLoadHaveDocumentV105(reviewOnlyStore, '391912', 'bol'), 'unverified document does not satisfy the load checklist');

pass(read('source/src/modules/scan/SmartScanSheet.jsx').includes('SmartScanSheetV105'), 'v105 scan screen owns production export');
pass(read('source/src/modules/scan/SmartScanSheetV105.jsx').includes('Save document'), 'scan confirmation is focused');
pass(!read('source/src/modules/scan/SmartScanSheetV105.jsx').includes('Pro Document Inbox'), 'technical Pro Inbox wording is removed');
pass(read('source/src/modules/documents/DocumentVaultV105.jsx').includes('Every document has a home'), 'Document Vault is installed');
pass(read('source/src/modules/home/HomeScreen.jsx').includes("businessSection === 'documents'"), 'Home opens Document Vault');
pass(read('source/src/app/App.jsx').includes('ROAD_READY_DOCUMENT_COMMIT_EVENT_V105'), 'safe document commit listener is installed');
pass(read('source/src/modules/setup/operatorProfile.js').includes("id:'documents'"), 'Document Vault is a first-class module');

console.log('PASS — v105 Road Ready OS document foundation regression suite');

import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  applySmartDocumentLinkV103,
  getActiveLoadGuideV103,
  resolveDriverGuideV103,
} from '../source/src/modules/loads/loadGuideV103.js';

const state = {
  activeDay:'2026-07-22',
  currentStatus:'OFF',
  currentLocation:{ city:'Downers Grove', state:'IL' },
  eventsByDay:{
    '2026-07-22':[{ id:'off_1', status:'OFF', startMin:0, endMin:1440, note:'Off Duty' }],
  },
  routeLegsByDay:{},
  loadGuidesById:{},
  activeLoadGuideId:'',
  loadInfo:{},
  documentsByDay:{},
};

const payload = {
  type:{ id:'rate_confirmation', label:'Rate Confirmation' },
  typeId:'rate_confirmation',
  fields:{
    type:'rate_confirmation',
    loadNo:'97155',
    orderNo:'97155',
    broker:'Red Lightning Logistics, LLC',
    carrierName:'NARTA EXPRESS LLC',
    mcNumber:'871792',
    total:2700,
    equipment:'Power Only',
    trackingProvider:'FourKites',
    documentDate:'2026-07-22',
    date:'2026-07-22',
    pickupDate:'2026-07-22',
    deliveryDate:'2026-07-23',
    linkDay:'2026-07-22',
    linkToLogbook:true,
    stops:[
      { id:'pickup_1', type:'pickup', company:'Discount Tire Elgin', city:'Elgin', state:'IL', date:'2026-07-22', time:'16:00' },
      { id:'delivery_1', type:'delivery', company:'DT 1468 Woodhaven', city:'Woodhaven', state:'MI', date:'2026-07-23', time:'08:00' },
    ],
  },
  localDocument:{ local_id:'ratecon_97155', original_file_name:'CarrierConfirmation97155.pdf' },
  analysis:{
    confidence:.93,
    method:'isolated-engine:rate-confirmation-engine@1.1.0',
    text:'CARRIER RATE CONFIRMATION. Flat Rate $2,700. FourKites.',
  },
};

const beforeEvents = JSON.stringify(state.eventsByDay);
const next = applySmartDocumentLinkV103(state, payload);
const guide = getActiveLoadGuideV103(next);
const mission = resolveDriverGuideV103(next, guide);

assert.ok(next.activeLoadGuideId, 'saved Rate Confirmation must set activeLoadGuideId');
assert.ok(guide, 'saved Rate Confirmation must create an active Driver Mission guide');
assert.equal(guide.loadNo, '97155');
assert.equal(guide.status, 'active');
assert.equal(guide.pickupDate, '2026-07-22');
assert.equal(guide.stops.find(stop => stop.type === 'pickup')?.city, 'Elgin');
assert.equal(guide.stops.find(stop => stop.type === 'delivery')?.city, 'Woodhaven');
assert.ok(guide.steps.some(step => step.id === 'route_pickup'), 'mission must include route to pickup');
assert.ok(guide.steps.some(step => step.id === 'arrive_pickup'), 'mission must include pickup arrival');
assert.ok(mission.total > 0, 'mission must contain actionable steps');
assert.equal(next.loadInfo.loadNo, '97155');
assert.equal(next.loadInfo.pickupCity, 'Elgin');
assert.equal(next.loadInfo.pickupState, 'IL');
assert.equal(next.loadInfo.deliveryCity, 'Woodhaven');
assert.equal(next.loadInfo.deliveryState, 'MI');
assert.equal(next.loadInfo.rate, 2700);
assert.equal(next.loadInfo.trackingProvider, 'FourKites');
assert.equal(next.loadInfo.source, 'rate_confirmation_guide_v103');
const legs = Object.values(next.routeLegsByDay || {}).flatMap(rows => Array.isArray(rows) ? rows : []);
assert.equal(legs.length, 1, 'one delivery must create one planned loaded route leg');
assert.equal(legs[0].loadNo, '97155');
assert.equal(legs[0].fromCity, 'Elgin');
assert.equal(legs[0].toCity, 'Woodhaven');
assert.equal(legs[0].status, 'planned');
assert.equal(JSON.stringify(next.eventsByDay), beforeEvents, 'Rate Confirmation activation must not create or modify duty-status events');

const sheet = fs.readFileSync('source/src/modules/scan/SmartScanSheetV105.jsx', 'utf8');
const version = JSON.parse(fs.readFileSync('public/app-version.json', 'utf8'));
const rateV11 = fs.readFileSync('source/src/modules/scan/engines/rateConfirmationEngineV11.js', 'utf8');
const podV1 = fs.readFileSync('source/src/modules/scan/engines/podEngineV1.js', 'utf8');
const bolV1 = fs.readFileSync('source/src/modules/scan/engines/bolEngineV1.js', 'utf8');
const fuelV1 = fs.readFileSync('source/src/modules/scan/engines/fuelReceiptEngineV1.js', 'utf8');

assert.ok(sheet.includes("import { dispatchSmartDocumentLinkV100 } from '../loads/loadGuideV103.js';"), 'production V105 scanner must import the board activation dispatcher');
assert.ok(sheet.includes("if (meta.id === 'rate_confirmation')"), 'only saved Rate Confirmations should run the board activation bridge');
assert.ok(sheet.includes('activeRateConFieldsV10962'), 'V105 save must build reviewed fields for Driver Mission');
assert.ok(sheet.indexOf('dispatchVaultDocumentCommitV105({ record });') < sheet.indexOf('dispatchSmartDocumentLinkV100({'), 'Vault save must complete before board activation dispatch');
assert.ok(rateV11.includes("version:'1.1.0'"), 'Rate Confirmation Engine 1.1 remains unchanged');
assert.ok(podV1.includes("version:'1.0.0'"), 'POD Engine 1.0 remains unchanged');
assert.ok(bolV1.includes("version:'1.0.0'"), 'BOL Engine 1.0 remains unchanged');
assert.ok(fuelV1.includes("version:'1.0.0'"), 'Fuel Engine 1.0 remains unchanged');
assert.equal(version.version, '109.6.2');
assert.equal(version.build, 'v10962-ratecon-board-activation');

console.log('PASS — v109.6.2 saved Rate Con 97155 appears on Home as today’s pickup without changing Logbook duty events');

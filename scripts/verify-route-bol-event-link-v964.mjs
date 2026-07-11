import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyRouteLegDetailsToLinkedEvents, enrichLoadEventFromLinkedRoute } from '../source/src/core/routes/shippingDocsRepair.js';
import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';
import { buildDotOfficerCheck } from '../source/src/core/dot/dotOfficerCheckEngine.js';

const day = '2026-07-10';
const pickup = { id:'pickup1', status:'ON', startMin:600, endMin:630, city:'East Hartford', state:'CT', note:'Pickup / Loading', shippingDocs:'', destination:'' };
const routeLegsByDay = {
  [day]:[{
    id:'leg_pickup1', day, pickupDay:day, pickupEventId:'pickup1', pickupMin:600,
    fromCity:'East Hartford', fromState:'CT', toCity:'Cheshire', toState:'CT',
    shippingDocs:'607 2581', loadNo:'607 2581', kind:'loaded', status:'open', source:'pickup_event',
  }],
};

const eventsByDay = {
  [day]:[
    { id:'off1', status:'OFF', startMin:0, endMin:600, city:'East Hartford', state:'CT', note:'Off Duty' },
    pickup,
    { id:'drive1', status:'D', startMin:630, endMin:1440, city:'East Hartford', state:'CT', note:'Driving' },
  ],
};

const synced = applyRouteLegDetailsToLinkedEvents(eventsByDay, routeLegsByDay);
const linkedPickup = synced[day].find(event => event.id === 'pickup1');
assert.equal(linkedPickup.shippingDocs, '607 2581', 'route BOL is stored on the exact pickup event');
assert.equal(linkedPickup.loadNo, '607 2581');
assert.equal(linkedPickup.bol, '607 2581');
assert.equal(linkedPickup.destination, 'Cheshire, CT', 'Going to is stored on the exact pickup event');
assert.equal(linkedPickup.destinationState, 'CT');
assert.equal(linkedPickup.city, 'East Hartford', 'route edits do not rewrite historical event location');
assert.equal(linkedPickup.startMin, 600, 'route edits do not rewrite historical event time');

const enriched = enrichLoadEventFromLinkedRoute({ routeLegsByDay }, day, pickup);
assert.equal(enriched.shippingDocs, '607 2581', 'older route-only records reopen with BOL');
assert.equal(enriched.destination, 'Cheshire, CT', 'older route-only records reopen with Going to');

const state = {
  activeDay:day,
  eventsByDay:synced,
  routeLegsByDay,
  loadInfo:{},
  inspectionByDay:{ [day]:{ complete:true } },
  signatureByDay:{},
  certifyStatus:{ [day]:'Needs signature' },
  manualMilesByDay:{ [day]:100 },
  driverProfile:{ name:'Arben Oruci' },
  carrierName:'Narta Express LLC',
  mainOfficeAddress:'Willowbrook, IL',
  driver:{ truck:'228' },
  currentLocation:{ city:'Cheshire', state:'CT' },
};
assert.ok(!validateLogForSigning(state, day).some(issue => issue.code === 'missing_shipping_docs'), 'BOL entered on route/event does not loop back as missing at Sign');
assert.ok(!buildDotOfficerCheck(state, day).issues.some(issue => String(issue.id).startsWith('pickup_route_')), 'DOT route check sees both BOL and Going to');

const eventList = fs.readFileSync(new URL('../source/src/modules/logbook/EventList.jsx', import.meta.url), 'utf8');
const editor = fs.readFileSync(new URL('../source/src/modules/editor/EditEventSheet.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../source/src/app/App.jsx', import.meta.url), 'utf8');
assert.match(eventList, /BOL \$\{shippingDocs\}/, 'event card visibly confirms the saved BOL');
assert.match(eventList, /Going to \$\{destination\}/, 'event card visibly confirms the route destination');
assert.match(editor, /Pickup details[\s\S]*BOL \/ Shipping document #[\s\S]*Going to/, 'Edit Event exposes pickup BOL and Going to');
assert.match(app, /applyRouteLegDetailsToLinkedEvents/, 'Form route edits synchronize to the linked event');
assert.match(app, /The linked pickup event is the source of truth for BOL and Going/, 'event-to-route sync is explicit');
assert.match(app, /const ownsDocs = !!eventDocs[\s\S]*loadDetailsExplicit[\s\S]*shippingDocsUpdatedAt/, 'legacy blank event fields cannot erase a valid linked route BOL');
assert.match(editor, /loadDetailsExplicit:!!kind/, 'an intentional exact-event edit is marked as authoritative');

console.log('verify-route-bol-event-link-v964 passed');

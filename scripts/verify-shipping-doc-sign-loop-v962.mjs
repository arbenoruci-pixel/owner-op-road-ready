import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyShippingDocumentReference } from '../source/src/core/routes/shippingDocsRepair.js';
import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';
import { buildDotOfficerCheck } from '../source/src/core/dot/dotOfficerCheckEngine.js';

const day = '2026-07-09';
const base = {
  activeDay:day,
  driverProfile:{ name:'Driver' },
  driver:{ truck:'12', trailer:'53' },
  carrierName:'Carrier',
  mainOfficeAddress:'Office',
  currentTrailer:'Trailer 53',
  eventsByDay:{
    [day]:[
      { id:'off', status:'OFF', startMin:0, endMin:600, city:'Toledo', state:'OH', note:'Off Duty' },
      { id:'pickup', status:'ON', startMin:600, endMin:630, city:'Toledo', state:'OH', note:'Pickup / Loading', destination:'Cheshire, CT', destinationState:'CT' },
      { id:'drive', status:'D', startMin:630, endMin:900, city:'Toledo', state:'OH', note:'Driving', manualMiles:100 },
      { id:'off2', status:'OFF', startMin:900, endMin:1440, city:'Cheshire', state:'CT', note:'Off Duty' },
    ],
  },
  routeLegsByDay:{
    [day]:[
      { id:'leg_pickup', day, pickupDay:day, pickupEventId:'pickup', pickupMin:600, fromCity:'Toledo', fromState:'OH', toCity:'Cheshire', toState:'CT', shippingDocs:'', loadNo:'', kind:'loaded', status:'open' },
    ],
  },
  loadInfo:{},
  inspectionByDay:{ [day]:{ complete:true, sourceEventId:'pickup' } },
  signatureByDay:{},
  certifyStatus:{ [day]:'Needs signature' },
  manualMilesByDay:{ [day]:100 },
  equipment:{ container:'CONT-9988', chassis:'CHAS-1234' },
};

const beforeIssues = validateLogForSigning(base, day);
const beforeBol = beforeIssues.find(issue => issue.code === 'missing_shipping_docs');
assert.ok(beforeBol, 'pickup without docs must block signing');
assert.equal(beforeBol.eventId, 'pickup', 'sign fix points to the exact pickup event');
assert.ok(buildDotOfficerCheck(base, day).issues.some(issue => issue.id === 'missing_shipping_docs'));
assert.ok(beforeBol, 'container/chassis identifiers must not count as BOL/shipping docs');

const unrelatedNoTrailerNote = {
  ...base,
  eventsByDay:{
    [day]:base.eventsByDay[day].map(event => (event.id === 'off'
      ? { ...event, note:'No trailer parking available' }
      : event)),
  },
};
assert.ok(
  validateLogForSigning(unrelatedNoTrailerNote, day).some(issue => issue.code === 'missing_shipping_docs'),
  'an unrelated OFF DUTY no-trailer note must not satisfy a Pickup BOL requirement',
);
assert.ok(
  buildDotOfficerCheck(unrelatedNoTrailerNote, day).issues.some(issue => issue.id === 'missing_shipping_docs'),
  'DOT review must keep the BOL requirement when only an unrelated OFF DUTY note mentions no trailer',
);

const fixed = applyShippingDocumentReference(base, { day, eventId:'pickup', value:'BOL-12345' });
assert.equal(fixed.eventsByDay[day].find(event => event.id === 'pickup').shippingDocs, 'BOL-12345');
assert.equal(fixed.routeLegsByDay[day][0].shippingDocs, 'BOL-12345');
assert.equal(fixed.loadInfo.shippingDocs, 'BOL-12345');
assert.equal(fixed.loadInfo.sourceEventDay, day);
assert.ok(!validateLogForSigning(fixed, day).some(issue => issue.code === 'missing_shipping_docs'), 'signing must see the BOL immediately');
assert.ok(!buildDotOfficerCheck(fixed, day).issues.some(issue => issue.id === 'missing_shipping_docs'), 'DOT check must see the same exact-event BOL');

const cleared = applyShippingDocumentReference(fixed, { day, eventId:'pickup', value:'', allowEmpty:true });
assert.equal(cleared.eventsByDay[day].find(event => event.id === 'pickup').shippingDocs, '');
assert.equal(cleared.routeLegsByDay[day][0].shippingDocs, '');
assert.equal(cleared.loadInfo.shippingDocs, '');
assert.ok(validateLogForSigning(cleared, day).some(issue => issue.code === 'missing_shipping_docs'), 'clearing a BOL must not leave a stale global reference');

const empty = applyShippingDocumentReference(base, { day, eventId:'pickup', value:'Empty / bobtail / no load' });
assert.equal(empty.eventsByDay[day].find(event => event.id === 'pickup').noLoadDeclared, true);
assert.ok(!validateLogForSigning(empty, day).some(issue => issue.code === 'missing_shipping_docs'));

const directEmptyField = {
  ...base,
  routeLegsByDay:{},
  loadInfo:{},
  eventsByDay:{ [day]:base.eventsByDay[day].map(event => (event.id === 'pickup'
    ? { ...event, shippingDocs:'Empty / bobtail / no load', loadNo:'' }
    : event)) },
};
assert.ok(!validateLogForSigning(directEmptyField, day).some(issue => issue.code === 'missing_shipping_docs'), 'an explicit no-load value typed directly in the Pickup field must clear the BOL blocker');

const drivingOnly = {
  ...base,
  eventsByDay:{ [day]:[
    { id:'off', status:'OFF', startMin:0, endMin:600, city:'Toledo', state:'OH', note:'Off Duty' },
    { id:'drive', status:'D', startMin:600, endMin:900, city:'Toledo', state:'OH', note:'Driving', manualMiles:100 },
    { id:'off2', status:'OFF', startMin:900, endMin:1440, city:'Cheshire', state:'CT', note:'Off Duty' },
  ] },
  routeLegsByDay:{},
};
assert.ok(!validateLogForSigning(drivingOnly, day).some(issue => issue.code === 'missing_shipping_docs'), 'driving alone must not force a BOL');

const unrelatedLoadingZone = {
  ...drivingOnly,
  eventsByDay:{ [day]:drivingOnly.eventsByDay[day].map(event => (event.id === 'off'
    ? { ...event, note:'Off Duty near loading zone' }
    : event)) },
};
assert.ok(!validateLogForSigning(unrelatedLoadingZone, day).some(issue => issue.code === 'missing_shipping_docs'), 'an OFF DUTY loading-zone note must not create a BOL requirement');
assert.ok(!buildDotOfficerCheck(unrelatedLoadingZone, day).issues.some(issue => issue.id === 'missing_shipping_docs'), 'DOT review must ignore load words on non-ON DUTY events');

const bolOnlyEvent = {
  ...base,
  routeLegsByDay:{},
  loadInfo:{},
  eventsByDay:{ [day]:base.eventsByDay[day].map(event => (event.id === 'pickup'
    ? { ...event, shippingDocs:'', loadNo:'', bol:'BOL-ONLY-7788' }
    : event)) },
};
assert.ok(!validateLogForSigning(bolOnlyEvent, day).some(issue => issue.code === 'missing_shipping_docs'), 'legacy event.bol must satisfy signing');
assert.ok(!buildDotOfficerCheck(bolOnlyEvent, day).issues.some(issue => issue.id === 'missing_shipping_docs'), 'legacy event.bol must satisfy DOT review');

const shortStructuredBol = {
  ...base,
  routeLegsByDay:{},
  loadInfo:{},
  eventsByDay:{ [day]:base.eventsByDay[day].map(event => (event.id === 'pickup'
    ? { ...event, shippingDocs:'123', loadNo:'123' }
    : event)) },
};
assert.ok(!validateLogForSigning(shortStructuredBol, day).some(issue => issue.code === 'missing_shipping_docs'), 'a short structured BOL value must not fall back into the missing-BOL loop');

const alphaStructuredBol = {
  ...base,
  routeLegsByDay:{},
  loadInfo:{},
  eventsByDay:{ [day]:base.eventsByDay[day].map(event => (event.id === 'pickup'
    ? { ...event, shippingDocs:'ABC', loadNo:'ABC' }
    : event)) },
};
assert.ok(!validateLogForSigning(alphaStructuredBol, day).some(issue => issue.code === 'missing_shipping_docs'), 'an alphabetic structured reference must be accepted as entered');

const wrongDayGlobal = {
  ...base,
  loadInfo:{ shippingDocs:'BOL-FROM-TOMORROW', loadNo:'BOL-FROM-TOMORROW', sourceEventDay:'2026-07-10', sourceEventId:'other-pickup' },
};
assert.ok(validateLogForSigning(wrongDayGlobal, day).some(issue => issue.code === 'missing_shipping_docs'), 'another day’s global load reference must not satisfy this day');

const appSource = fs.readFileSync(new URL('../source/src/app/App.jsx', import.meta.url), 'utf8');
const saveLoadInfoBlock = appSource.match(/function saveLoadInfo\([\s\S]*?\n  }\n\n  function saveDayDistance/)?.[0] || '';
assert.match(saveLoadInfoBlock, /applyShippingDocumentReference/, 'Form BOL edit uses the same exact-event repair path');
assert.match(saveLoadInfoBlock, /allowEmpty:true/, 'Form BOL clear removes exact event/route/global copies');

console.log('v96.2 exact-event BOL/sign loop checks passed');

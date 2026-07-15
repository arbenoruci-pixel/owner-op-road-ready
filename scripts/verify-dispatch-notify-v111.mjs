import assert from 'node:assert/strict';
import {
  buildDispatchMessageV111,
  dispatchChannelsV111,
  dispatchHrefV111,
  loadContactCandidatesV111,
  preferredLoadContactV111,
} from '../source/src/modules/loads/loadContactV111.js';

// Earlier release checks import the Rate Con parser before v101.1 materializes it.
// A cache-busted module URL verifies the file that was actually written by this build.
const { parseRateConfirmationV102 } = await import(`../source/src/modules/scan/rateConfirmationParserV102.js?v111=${Date.now()}`);

const sample = `
H & N Logistics, LLC
Order # 391912
Leg # 395851
Agent: Sarah Johnson Phone: (312) 555-0198
Email: sarah.dispatch@hnlogistics.com
Carrier: Narta Express LLC
MC Number: MC871792
Trailer Type: Reefer
Load At Pieces Weight
ROCHELLE MIXING CENTER
100 Main Street
Rochelle, IL 61068
Earliest date: 07/14/2026 00:00
Pickup #: 5010037538
4,366 CA 41,482 LBS
Deliver To Pieces Weight
REINHART FOODSERVICE
200 Market Road
Rogers, MN 55374
Earliest date: 07/16/2026 07:00
Total Pay (US$): $4,800.00
`;

const parsed = parseRateConfirmationV102(sample);
assert.equal(parsed.orderNo, '391912');
assert.equal(String(parsed.brokerContactName || '').trim(), 'Sarah Johnson');
assert.match(parsed.brokerPhone, /312/);
assert.equal(parsed.brokerEmail, 'sarah.dispatch@hnlogistics.com');
assert.equal(parsed.dispatchPhone, parsed.brokerPhone);
assert.equal(parsed.dispatchEmail, parsed.brokerEmail);
assert.equal(Array.isArray(parsed.brokerContacts), true);
assert.equal(parsed.brokerContacts.length, 1);

const state = {
  homeTerminalTimeZone:'America/Chicago',
  driverProfile:{ name:'Arben Oruci', carrierName:'Narta Express LLC' },
  driver:{ truck:'7005' },
  currentLocation:{ city:'Rochelle', state:'IL' },
  loadInfo:{
    loadNo:'391912',
    broker:'H & N Logistics, LLC',
    brokerContactName:parsed.brokerContactName,
    brokerPhone:parsed.brokerPhone,
    brokerEmail:parsed.brokerEmail,
    pickupNumber:'5010037538',
  },
  loadGuidesById:{
    load_guide_391912:{
      id:'load_guide_391912',
      loadNo:'391912',
      orderNo:'391912',
      broker:'H & N Logistics, LLC',
      brokerContactName:parsed.brokerContactName,
      brokerPhone:parsed.brokerPhone,
      brokerEmail:parsed.brokerEmail,
      stops:[{ type:'pickup', company:'ROCHELLE MIXING CENTER', city:'Rochelle', state:'IL', pickupNumber:'5010037538' }],
      updatedAt:1,
    },
  },
  activeLoadGuideId:'load_guide_391912',
};

const contacts = loadContactCandidatesV111(state);
assert.equal(contacts.length >= 1, true);
const preferred = preferredLoadContactV111(state);
assert.equal(preferred.name, 'Sarah Johnson');
assert.deepEqual(dispatchChannelsV111(preferred), ['sms', 'whatsapp', 'email']);

const message = buildDispatchMessageV111({
  state,
  payload:{ status:'ON', reason:'Pickup / Loading', city:'Rochelle', state:'IL', loadNo:'391912' },
  contact:preferred,
  now:new Date('2026-07-14T14:15:00.000Z'),
});
assert.match(message, /checking in/i);
assert.match(message, /ROCHELLE MIXING CENTER/i);
assert.match(message, /Load 391912/i);
assert.match(message, /Pickup #5010037538/i);
assert.match(message, /Truck 7005/i);

assert.match(dispatchHrefV111('sms', preferred, message, 'Pickup check-in'), /^sms:/);
assert.match(dispatchHrefV111('whatsapp', preferred, message, 'Pickup check-in'), /^https:\/\/wa\.me\//);
assert.match(dispatchHrefV111('email', preferred, message, 'Pickup check-in'), /^mailto:/);

console.log('verify-dispatch-notify-v111 passed');

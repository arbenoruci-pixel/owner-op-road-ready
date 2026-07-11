import assert from 'node:assert/strict';
import { normalizeRoadReadyState } from '../source/src/core/routes/routeNormalization.js';
import { normalizeLogEvents } from '../source/src/core/timeline/timelineEngine.js';

const oldDay = '2026-07-09';
const nextDay = '2026-07-10';
const state = {
  eventsByDay:{
    [oldDay]:[
      {
        id:'off_toledo', status:'OFF', startMin:0, endMin:883,
        city:'Cheshire', state:'CT', note:'Off Duty',
        staleLocationLabel:{ city:'Toledo', state:'OH' },
        locationRepairSource:'route_leg_destination',
      },
    ],
    [nextDay]:[
      { id:'off_cheshire', status:'OFF', startMin:0, endMin:600, city:'Cheshire', state:'CT', note:'Off Duty' },
    ],
  },
  routeLegsByDay:{
    [nextDay]:[
      { id:'later_route', day:nextDay, pickupDay:nextDay, deliveryDay:oldDay, deliveryMin:883, toCity:'Cheshire', toState:'CT', status:'delivered' },
    ],
  },
  loadInfo:{},
};

const normalized = normalizeRoadReadyState(state);
const restored = normalized.eventsByDay[oldDay][0];
assert.equal(restored.city, 'Toledo');
assert.equal(restored.state, 'OH');
assert.equal(restored.locationRepairReverted, true);
assert.equal(restored.staleLocationLabel, undefined);
assert.equal(normalized.eventsByDay[nextDay][0].city, 'Cheshire');
assert.notStrictEqual(normalized.eventsByDay[oldDay][0], normalized.eventsByDay[nextDay][0], 'days keep independent event objects');

const reloadedAfterLaterLocationChange = normalizeRoadReadyState({
  ...normalized,
  currentLocation:{ city:'East Hartford', state:'CT' },
  eventsByDay:{
    ...normalized.eventsByDay,
    [nextDay]:normalized.eventsByDay[nextDay].map(event => ({ ...event, city:'East Hartford', state:'CT' })),
  },
});
assert.equal(reloadedAfterLaterLocationChange.eventsByDay[oldDay][0].city, 'Toledo', 'editing a later day cannot rewrite a historical event location');
assert.equal(reloadedAfterLaterLocationChange.eventsByDay[oldDay][0].state, 'OH');

const continuousOff = normalizeLogEvents([
  { id:'a', status:'OFF', startMin:0, endMin:600, city:'Toledo', state:'OH', note:'Off Duty' },
  { id:'b', status:'OFF', startMin:600, endMin:900, city:'Cheshire', state:'CT', note:'Off Duty' },
]);
assert.equal(continuousOff.length, 1);
assert.equal(continuousOff[0].city, 'Toledo', 'continuous block keeps the location at its start');
assert.equal(continuousOff[0].state, 'OH');

const onActivities = normalizeLogEvents([
  { id:'pretrip', status:'ON', startMin:600, endMin:615, city:'Toledo', state:'OH', note:'Pre-trip inspection' },
  { id:'pickup', status:'ON', startMin:615, endMin:645, city:'Toledo', state:'OH', note:'Pickup / Loading', shippingDocs:'BOL-77', destination:'Cheshire, CT' },
]);
assert.equal(onActivities.length, 2, 'different ON DUTY activities must remain separate exact events');
assert.equal(onActivities[1].id, 'pickup');
assert.equal(onActivities[1].shippingDocs, 'BOL-77');

console.log('v96.2 historical location isolation checks passed');

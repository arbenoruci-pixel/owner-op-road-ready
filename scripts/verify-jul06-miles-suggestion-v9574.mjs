import assert from 'node:assert/strict';
import fs from 'node:fs';
import { suggestedMilesForDayFromRoute } from '../source/src/core/routes/routeNormalization.js';
import { buildDotOfficerCheck } from '../source/src/core/dot/dotOfficerCheckEngine.js';
import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';

const day = '2026-07-06';
const state = {
  activeDay:day,
  eventsByDay:{ [day]:[
    { id:'off', status:'OFF', startMin:0, endMin:40, city:'North Baltimore', state:'OH' },
    { id:'on', status:'ON', startMin:40, endMin:48, city:'North Baltimore', state:'OH', note:'Pre-trip inspection', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z' },
    { id:'d', status:'D', startMin:48, endMin:252, city:'North Baltimore', state:'OH', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z' },
    { id:'sb', status:'SB', startMin:252, endMin:1440, city:'Indianapolis', state:'IN' },
  ] },
  routeLegsByDay:{ [day]:[{ id:'leg113', day, pickupDay:day, fromCity:'North Baltimore', fromState:'OH', toCity:'Greenfield', toState:'IN', shippingDocs:'113NRH53Z', loadNo:'113NRH53Z', miles:206, status:'delivered' }] },
  manualMilesByDay:{},
  driver:{ truck:'228', trailer:'Trailer 53' },
  driverProfile:{ name:'Arben Oruci' },
  carrierName:'Narta Express LLC',
  mainOfficeAddress:'92 201 Lake Drive, Willowbrook, IL 60527',
  inspectionByDay:{ [day]:{ complete:true, sourceEventId:'on', sourceStartMin:40 } },
};

assert.equal(suggestedMilesForDayFromRoute(state, day), 206, 'July 6 route-derived miles suggestion is 206');
const dotIssue = buildDotOfficerCheck(state, day).issues.find(issue => issue.id === 'missing_total_driving_miles');
assert.ok(dotIssue, 'DOT check asks for missing total driving miles');
assert.equal(dotIssue.suggestedMiles, 206, 'DOT miles fix carries 206 suggestion');
assert.ok(/206\.00 mi/.test(dotIssue.detail), 'DOT miles detail displays 206.00 mi recommendation');
const signIssue = validateLogForSigning(state, day).find(issue => issue.code === 'missing_total_driving_miles');
assert.ok(signIssue, 'Sign check asks for missing total driving miles');
assert.equal(signIssue.recommendedMiles, 206, 'Sign miles fix carries 206 suggestion');
assert.ok(/206\.00 mi/.test(signIssue.detail), 'Sign miles detail displays 206.00 mi recommendation');
const formSrc = fs.readFileSync('source/src/modules/logbook/DayLogScreen.jsx', 'utf8');
assert.ok(formSrc.includes('distanceSuggestion: suggestedRouteMiles'), 'Form summary carries route miles suggestion for Add miles flow');
assert.ok(formSrc.includes('Missing · suggestion'), 'Form tab labels missing miles with a recommendation');

console.log('verify-jul06-miles-suggestion-v9574 passed');

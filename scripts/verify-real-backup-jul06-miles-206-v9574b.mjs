import assert from 'node:assert/strict';
import { loadRealBackupState } from './fixtures/real-backup-v9574b.mjs';
import { normalizeRoadReadyState, routeLegsForDayCanonical, routeLegsForDayMiles, suggestedMilesForDayFromRoute } from '../source/src/core/routes/routeNormalization.js';
import { buildDotOfficerCheck } from '../source/src/core/dot/dotOfficerCheckEngine.js';
import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';

const day = '2026-07-06';
const normalized = normalizeRoadReadyState(loadRealBackupState());
const touchingLegs = routeLegsForDayCanonical(normalized, day);
const mileLegs = routeLegsForDayMiles(normalized, day);

assert.ok(touchingLegs.some(leg => leg.loadNo === '114RMB689' || leg.shippingDocs === '114RMB689'), 'fixture includes previous-day 114RMB689 touching July 6');
assert.ok(mileLegs.every(leg => (leg.pickupDay || leg.day) === day), 'manual-mile suggestion only uses primary/pickup driving day legs');
assert.deepEqual(mileLegs.map(leg => leg.loadNo || leg.shippingDocs).filter(Boolean), ['113NRH53Z'], 'July 6 mile recommendation only uses 113NRH53Z');
assert.equal(suggestedMilesForDayFromRoute(normalized, day), 206, 'July 6 route-derived miles suggestion is exactly 206');

const dotIssue = buildDotOfficerCheck(normalized, day).issues.find(issue => issue.id === 'missing_total_driving_miles');
assert.ok(dotIssue, 'DOT check requests missing July 6 miles');
assert.equal(dotIssue.suggestedMiles, 206, 'DOT check suggests 206 miles for July 6');
assert.match(dotIssue.detail, /206\.00 mi/, 'DOT check displays 206.00 mi');

const signIssue = validateLogForSigning(normalized, day).find(issue => issue.code === 'missing_total_driving_miles');
assert.ok(signIssue, 'Sign check requests missing July 6 miles');
assert.equal(signIssue.recommendedMiles, 206, 'Sign check suggests 206 miles for July 6');
assert.match(signIssue.detail, /206\.00 mi/, 'Sign check displays 206.00 mi');

console.log('verify-real-backup-jul06-miles-206-v9574b passed');

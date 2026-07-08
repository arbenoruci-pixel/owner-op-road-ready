#!/usr/bin/env node
import assert from 'node:assert/strict';
import { loadRealBackupState } from './fixtures/real-backup-v9574b.mjs';
import { buildDotOfficerCheck } from '../source/src/core/dot/dotOfficerCheckEngine.js';
import { normalizeRoadReadyState } from '../source/src/core/routes/routeNormalization.js';
import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';

const state = normalizeRoadReadyState(loadRealBackupState());
const check = buildDotOfficerCheck(state, '2026-07-05');
const mainIssues = check.issues.filter(issue => issue.section !== 'previous');
const mainText = mainIssues.map(issue => `${issue.id || ''} ${issue.title || ''} ${issue.detail || ''}`).join('\n');

assert.equal(mainIssues.length, 0, `Jul 05 should not show noisy main DOT Check issues, got:\n${mainText}`);
assert.ok(!/current rest|restWatch/i.test(mainText), 'short OFF/SB rest progress must not show as main DOT Check review');
assert.ok(!/pre-trip timing|pretrip_after_driving/i.test(mainText), 'later pre-trip must not be compared to earlier first driving');
assert.ok(!/inspection link|unlinked_pretrip|stale_inspection/i.test(mainText), 'completed inspection link metadata must not show as main DOT Check review');
assert.ok(!/delivery route link/i.test(mainText), 'delivery route-link metadata must not show as main DOT Check review');

const signIssues = validateLogForSigning(state, '2026-07-05');
const signText = signIssues.map(issue => `${issue.code || ''} ${issue.title || ''} ${issue.detail || ''}`).join('\n');
assert.ok(!/pre-trip timing|pretrip_after_driving|inspection.*link|unlinked_pretrip/i.test(signText), 'signing guard must not surface the noisy pre-trip/inspection link items');

const jul06 = buildDotOfficerCheck(state, '2026-07-06');
const milesIssue = jul06.issues.find(issue => issue.id === 'missing_total_driving_miles');
assert.ok(milesIssue, 'Jul 06 should still require miles until entered');
assert.equal(Number(milesIssue.recommendedMiles || milesIssue.suggestedMiles), 206, 'Jul 06 miles recommendation must stay 206');

console.log('verify-dot-check-no-noisy-review-items-v9578: passed');

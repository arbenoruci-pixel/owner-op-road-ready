#!/usr/bin/env node
import assert from 'node:assert/strict';
import { loadRealBackupState } from './fixtures/real-backup-v9574b.mjs';
import { rawCoverageIssues, buildCoverageFixGroup } from '../source/src/core/compliance/rawRodsChecks.js';
import { buildDotOfficerCheck } from '../source/src/core/dot/dotOfficerCheckEngine.js';
import { normalizeRoadReadyState } from '../source/src/core/routes/routeNormalization.js';
import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';

const state = normalizeRoadReadyState(loadRealBackupState());

for (const day of ['2026-06-29', '2026-06-30']) {
  const coverage = rawCoverageIssues(state.eventsByDay || {}, day, { currentLocation: state.currentLocation || {} });
  assert.equal(coverage.total, 1440, `${day} rest-only artifact should count as 24h coverage`);
  assert.equal(buildCoverageFixGroup(coverage, day), null, `${day} must not build a coverage Fix Wizard group`);
  assert.ok(coverage.restOnlyDerivedCoverage, `${day} should be marked as rest-only derived coverage for checks`);

  const check = buildDotOfficerCheck(state, day);
  const mainIssues = check.issues.filter(issue => issue.section !== 'previous');
  assert.equal(mainIssues.length, 0, `${day} should not show current-day DOT Check issues, got ${mainIssues.map(i => i.id || i.code).join(', ')}`);

  const signIssues = validateLogForSigning(state, day);
  assert.equal(signIssues.length, 0, `${day} should not block signing/review for rest-only artifact day, got ${signIssues.map(i => i.code || i.id).join(', ')}`);
}

const workingDay = '2026-07-06';
const workingCheck = buildDotOfficerCheck(state, workingDay);
const milesIssue = workingCheck.issues.find(issue => issue.id === 'missing_total_driving_miles');
assert.ok(milesIssue, 'Working/driving day should still show missing miles until entered');
assert.equal(Number(milesIssue.suggestedMiles || milesIssue.recommendedMiles), 206, 'Jul 06 miles recommendation must remain 206');

console.log('verify-rest-only-partial-day-no-coverage-fix-v9579: passed');

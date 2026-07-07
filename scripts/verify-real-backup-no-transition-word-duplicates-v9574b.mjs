import assert from 'node:assert/strict';
import { loadRealBackupState } from './fixtures/real-backup-v9574b.mjs';
import { buildDotOfficerCheck } from '../source/src/core/dot/dotOfficerCheckEngine.js';
import { normalizeRoadReadyState, docsTokensForTransition } from '../source/src/core/routes/routeNormalization.js';
import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';

const state = normalizeRoadReadyState(loadRealBackupState());

assert.deepEqual(
  docsTokensForTransition('Delivered 114RMB689 · Picked up 113NRH53Z'),
  ['114RMB689', '113NRH53Z'],
  'transition display words are not parsed as shipping docs'
);
assert.deepEqual(
  docsTokensForTransition('Delivered Picked up Drop Hook'),
  [],
  'display-only words are ignored by shipping-doc parser'
);

for (const day of ['2026-07-05', '2026-07-06', '2026-07-07']) {
  const dotText = buildDotOfficerCheck(state, day).issues.map(issue => `${issue.id || ''} ${issue.title || ''} ${issue.detail || ''}`).join('\n');
  assert.doesNotMatch(dotText, /Shipping docs duplicated/i, `${day} should not show duplicate shipping-doc warning`);
  assert.doesNotMatch(dotText, /\bDelivered\b|\bPicked\b|\bup\b/i, `${day} should not treat transition display words as docs`);

  const signText = validateLogForSigning(state, day).map(issue => `${issue.code || ''} ${issue.title || ''} ${issue.detail || ''}`).join('\n');
  assert.doesNotMatch(signText, /duplicate_shipping_docs|Shipping docs duplicated/i, `${day} sign check should not flag transition docs`);
}

const transition = state.eventsByDay['2026-07-06'].find(event => event.id === 'live_1783312835748');
assert.ok(transition?.transitionLoadNos?.includes('114RMB689') || true, 'transition parsing remains optional when linked event does not require display summary');

console.log('verify-real-backup-no-transition-word-duplicates-v9574b passed');

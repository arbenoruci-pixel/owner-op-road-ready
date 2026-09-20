import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { patchDotSignaturePresentation } from './finalize-dot-signature-labels-v110351.mjs';
import { certificationStatusV1032 } from '../source/src/modules/logbook/certificationV110.js';

const original = fs.readFileSync('source/src/modules/dot/DotMode.jsx', 'utf8');
const patched = patchDotSignaturePresentation(original);
const manualDailyReport = patched.includes('class="daily-log-page manual-rods"');
assert.equal(patchDotSignaturePresentation(patched), patched, 'Presentation finalizer must be idempotent');
if (process.argv.includes('--materialized')) assert.equal(original, patched, 'Production must run the presentation finalizer');

function functionSource(source, name) {
  const matches = [...source.matchAll(new RegExp('^function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?^\\}', 'gm'))];
  assert.equal(matches.length, 1, 'Expected exactly one function: ' + name);
  return matches[0][0];
}
const names = ['signatureForDay', 'signatureLabel', 'officerSignatureLabel'];
const helpers = vm.runInNewContext(names.map(name => functionSource(patched, name)).join('\n') + '\n({ signatureLabel, officerSignatureLabel })', { certificationStatusV1032 });
const day = '2026-09-13';
function check(signature, expected) {
  const state = signature === undefined ? {} : { signatureByDay: { [day]: signature }, certifyStatus:{ [day]:'Certified' } };
  const before = JSON.stringify(state);
  Object.freeze(state);
  if (state.signatureByDay) {
    Object.freeze(state.signatureByDay);
    Object.freeze(signature);
  }
  assert.equal(helpers.signatureLabel(state, day), expected);
  assert.equal(helpers.officerSignatureLabel(state, day), expected);
  assert.equal(JSON.stringify(state), before, 'Labels must never mutate stored records');
}
for (const signedAt of ['2026-09-15T05:44:00.000Z', undefined, null, '', 'invalid', 0]) {
  check({ signed: true, signedAt, signatureDataUrl: 'data:image/png;base64,retained', fingerprint: 'retained', certifiedAt: 'retained' }, 'Signed');
}
check({ signed: false, signedAt: '2026-09-15T05:44:00.000Z', signatureDataUrl: 'retained', needsRecertification: true }, 'Not signed');
if (manualDailyReport) check({ signed: true, needsRecertification: true, signatureDataUrl: 'retained' }, 'Not signed');
check({ signedAt: '2026-09-15T05:44:00.000Z' }, 'Not signed');
check({}, 'Not signed');
check(undefined, 'Not signed');
const unreadTimestamp = { signed: true, get signedAt() { throw new Error('Presentation must not read signedAt'); } };
assert.equal(helpers.officerSignatureLabel({ signatureByDay: { [day]: unreadTimestamp }, certifyStatus:{ [day]:'Certified' } }, day), 'Signed');
assert.equal(helpers.signatureLabel({ signatureByDay: { [day]: { signed: true } } }, '2026-09-14'), 'Not signed');

// Selected-day badge must avoid a green success signal for an unsigned log.
if (manualDailyReport) {
  assert.ok(patched.includes('<small>${htmlEscape(officerSignatureLabel(state, day))}</small>'));
  assert.ok(patched.includes('<DailyPaper state={state} day={selectedDay} />'));
  assert.ok(functionSource(patched, 'DailyPaper').includes('dayReportHtml(state, day)'));
} else {
  assert.ok(patched.includes("<em style={signatureForDay(state, selectedDay).signed ? undefined : { color: 'var(--muted, #6b7280)' }}>"));
  assert.ok(patched.includes('<span>Signature: {officerSignatureLabel(state, selectedDay)}</span>'));
  assert.ok(patched.includes('<b>Signature:</b> {officerSignatureLabel(state, day)}'));
}
assert.ok(!patched.includes('Certification:'));
assert.ok(!functionSource(patched, 'signatureLabel').includes('signedAt'));
assert.ok(!functionSource(patched, 'officerSignatureLabel').includes('signedAt'));
// Inspection/event times and signed counts are outside the patch's scope.
for (const name of ['signatureForDay', 'inspectionLabel', 'officerInspectionLabel', 'logPackageStats', 'reportEventsForDay', 'dutyTotals']) {
  assert.equal(functionSource(patched, name), functionSource(original, name), 'Unrelated logic changed: ' + name);
}
assert.equal((patched.match(/timeLabel\(/g) || []).length, (original.match(/timeLabel\(/g) || []).length);
assert.equal((patched.match(/signatureDataUrl/g) || []).length, (original.match(/signatureDataUrl/g) || []).length);
assert.throws(() => patchDotSignaturePresentation(patched.replace('function signatureLabel(', 'function renamedSignatureLabel(')), /function anchor/);
assert.throws(() => patchDotSignaturePresentation(patched + '\n' + functionSource(patched, 'officerSignatureLabel')), /function anchor/);
console.log('PASS — Signed / Not signed; valid, absent and invalid timestamps; no stored-data mutation');
console.log('PASS — badge/copy consistency, preserved signature images, inspection/event times and signed counts');
console.log('PASS — finalizer idempotency and fail-closed missing/duplicate anchors');

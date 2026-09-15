import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { applySignedOnlyLabels } from './finalize-dot-signed-only-v110351.mjs';

const helpers = [['signatureLabel', 'Not signed'], ['officerSignatureLabel', 'Certification']];
function legacyHelper(name, unsigned) {
  return `function ${name}(state, day) {\n  const sig = signatureForDay(state, day);\n  if (!sig.signed) return '${unsigned}';\n  try { return \`Signed · \${new Date(sig.signedAt).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}\`; }\n  catch { return 'Signed'; }\n}`;
}
const fixture = '// untouched prefix\n' + helpers.map(args => legacyHelper(...args)).join('\n\n') + '\n// untouched suffix\n';
const patched = applySignedOnlyLabels(fixture);
assert.equal(applySignedOnlyLabels(patched), patched, 'Patch must be idempotent');
assert.ok(patched.startsWith('// untouched prefix\n') && patched.endsWith('\n// untouched suffix\n'));
assert.throws(() => applySignedOnlyLabels(fixture.replace('new Date(sig.signedAt)', 'new Date(sig.otherTime)')), /anchor changed/);
assert.throws(() => applySignedOnlyLabels(fixture + '\n' + legacyHelper(...helpers[0])), /Ambiguous/);

function evaluateHelpers(source) {
  const selected = helpers.map(([name]) => {
    const match = source.match(new RegExp(`function ${name}\\(state, day\\) \\{[\\s\\S]*?\\n\\}`));
    assert.ok(match, `${name} must remain available`);
    assert.doesNotMatch(match[0], /signedAt|new Date|toLocaleString/, `${name} must not format signing metadata`);
    return match[0];
  });
  return vm.runInNewContext(selected.join('\n') + '\n({signatureLabel, officerSignatureLabel})', {
    signatureForDay: (state, day) => state.signatureByDay?.[day] || {},
  });
}
function checkBehavior(source) {
  const labels = evaluateHelpers(source);
  const day = '2026-09-13';
  for (const signedAt of ['2026-09-15T05:44:00.000Z', '', null, undefined, 'invalid-date', 0]) {
    const sig = Object.freeze({ signed: true, signedAt, signatureDataUrl: 'test-ink', fingerprint: 'keep' });
    const state = Object.freeze({ signatureByDay: Object.freeze({ [day]: sig }), eventsByDay: Object.freeze({}) });
    const before = JSON.stringify(state);
    for (const [name] of helpers) assert.equal(labels[name](state, day), 'Signed');
    assert.equal(JSON.stringify(state), before, 'Displaying status must not mutate saved records');
  }
  const sig = { signed: true };
  Object.defineProperty(sig, 'signedAt', { get() { throw new Error('Signing time must not be read'); } });
  for (const [name, unsigned] of helpers) {
    assert.equal(labels[name]({ signatureByDay: { [day]: sig } }, day), 'Signed');
    for (const value of [{}, { signed: false }, { signed: false, signedAt: '2026-09-15T05:44:00Z' }]) {
      assert.equal(labels[name]({ signatureByDay: { [day]: value } }, day), unsigned);
    }
    assert.equal(labels[name]({}, day), unsigned);
    assert.equal(labels[name]({ signatureByDay: { '2026-09-12': { signed: true } } }, day), unsigned);
  }
}
checkBehavior(patched);

if (!process.argv.includes('--unit-only')) {
  const source = fs.readFileSync('source/src/modules/dot/DotMode.jsx', 'utf8');
  assert.equal(applySignedOnlyLabels(source), source, 'Production source must already be finalized');
  checkBehavior(source);
  assert.ok(source.includes('<em>{officerSignatureLabel(state, selectedDay)}</em>'), 'Day card must use signed-only label');
  assert.ok(source.includes('Certification: {officerSignatureLabel(state, selectedDay)}'), 'Certification row must use signed-only label');
}
console.log('PASS — signed-only labels, unsigned states, invalid/missing timestamps, day isolation, immutable records, idempotence and anchor guards');

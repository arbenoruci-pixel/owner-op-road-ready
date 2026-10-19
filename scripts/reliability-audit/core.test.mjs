import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AREAS, RULESET, PROFILE_KEY, REVIEWS_KEY, REQUIREMENTS, addDays, archiveAuditIndex, auditIndex, auditTimeZone, buildAudit, canonical, day, emptyProfile, normalizeAudit, packetRowsFor, profileFingerprint, sourceRevision, sourceValidity, todayInZone, updateProfileRecord, updateReviewRecord, validateProfile, validateReview, weekRange } from './core.js';
import { recordsFrom, bundleFrom, mergeRecords } from '../v110455/accountCore.js';

const now = '2026-10-19T18:00:00.000Z';
const profile = validateProfile({ ...emptyProfile(), company: 'Synthetic Carrier LLC', operations: 'interstate_property', jurisdictions: 'IL, NJ, PA', units: '228, 229', iftaApplies: 'required', iftaBase: 'IL', irpApplies: 'required', irpBase: 'NJ', cdl: 'yes', reference: 'Synthetic IFTA license and IRP cab card reviewed for this test', confirmedBy: 'Synthetic Reviewer', effectiveFrom: '2026-01-01' }, now);
const scope = { unit: '228', driverId: 'driver-a', loadNo: '' };
const hash = createHash('sha256').update('synthetic original').digest('hex');
const row = (id, category, options = {}) => ({ id, kind: 'document', name: id + '.pdf', category, date: '2026-10-19', unit: '228', loadNo: '', review: false, source: { sha256: hash, file_size_bytes: 18 }, ...options });
const fuel = row('fuel-1', 'fuel');
const receipt = row('distance-1', 'other');
const insurance = row('insurance-1', 'insurance', { date: '2025-12-15' });
const base = { loads: [{ id: 'load-a', loadNo: 'A100', original: 'retain' }], documents: [{ id: 'source-record', sha256: hash }], [PROFILE_KEY]: profile, [REVIEWS_KEY]: [] };
const model = (options = {}) => buildAudit({ rows: [fuel, receipt, insurance], business: base, area: 'ifta', week: '2026-10-19', scope, today: '2026-10-19', ...options });
const item = (value, id) => value.items.find(v => v.requirement.id === id);
function reviewed(business, requirementId, { area = 'ifta', rows = [fuel, receipt, insurance], week = '2026-10-19', chosen = [fuel], coverageFrom, coverageThrough, ...overrides } = {}) {
  const instance = item(model({ business, rows, area, week }), requirementId), requirement = instance.requirement;
  const draft = { status: 'checked', reviewer: 'Synthetic Reviewer', coverageFrom: coverageFrom || instance.period.from, coverageThrough: coverageThrough || instance.period.to, confirmations: requirement.questions.map(() => true), note: '', ...overrides };
  const refs = chosen.map(r => ({ rowId: r.id, sha256: hash, revision: sourceRevision(r), name: r.name, kind: r.kind }));
  const review = validateReview(requirement, draft, instance, normalizeAudit(business).profile, refs, now);
  return updateReviewRecord(business, review, instance.review, normalizeAudit(business).profile);
}

test('a filed PDF and unknown applicability cannot count as evidence checked', () => {
  const value = model({ business: {} });
  assert.equal(value.counts.checked, 0);
  assert(value.items.every(v => v.status === 'unknown'));
  assert.equal(item(model(), 'ifta-fuel').status, 'needs_review');
  const missingBase = { ...base, [PROFILE_KEY]: { ...profile, iftaBase: '' } };
  assert.equal(item(model({ business: missingBase }), 'ifta-fuel').status, 'unknown');
});
test('explicitly unknown or unsupported IRP base never borrows NJ or IL rules', () => {
  for (const irpBase of ['', 'TX']) {
    const value = model({ area: 'irp', business: { ...base, [PROFILE_KEY]: { ...profile, irpBase } } });
    assert(value.items.every(v => v.status === 'unknown'));
  }
  const value = model({ area: 'irp' });
  assert.equal(item(value, 'irp-card').sources[0].id, 'irpNJ');
});
test('actual coverage, questions and original hash are required to check evidence', () => {
  const instance = item(model(), 'ifta-fuel'), question = instance.requirement;
  const input = { status: 'checked', reviewer: 'Reviewer', coverageFrom: '2026-10-19', coverageThrough: '2026-10-25', confirmations: [true, true, true] };
  assert.throws(() => validateReview(question, input, instance, profile, [], now), /original evidence/);
  const refs = [{ rowId: fuel.id, sha256: hash, revision: sourceRevision(fuel) }];
  assert.throws(() => validateReview(question, { ...input, confirmations: [true] }, instance, profile, refs, now), /each evidence question/);
  assert.throws(() => validateReview(question, { ...input, coverageThrough: '2026-10-23' }, instance, profile, refs, now), /entire selected period/);
  const business = reviewed(base, 'ifta-fuel');
  assert.equal(item(model({ business }), 'ifta-fuel').status, 'checked');
});
test('content changes invalidate a review without deleting the old original or history', () => {
  const business = reviewed(base, 'ifta-fuel'), before = canonical(business);
  const changed = { ...fuel, source: { ...fuel.source, sha256: 'f'.repeat(64) } };
  const value = model({ business, rows: [changed] });
  assert.equal(item(value, 'ifta-fuel').status, 'stale');
  assert.equal(canonical(business), before);
  assert.equal(business[REVIEWS_KEY][0].history[0].after.sourceRefs[0].sha256, hash);
});
test('missing source, conflicting declared hashes and unavailable bytes remain flagged', () => {
  const business = reviewed(base, 'ifta-fuel');
  assert.equal(item(model({ business, rows: [] }), 'ifta-fuel').status, 'stale');
  const conflict = { ...fuel, source: { ...fuel.source, content_hash: 'c'.repeat(64) } };
  assert.equal(item(model({ business, rows: [conflict] }), 'ifta-fuel').status, 'stale');
  assert.equal(item(model({ business, proofs: { [fuel.id]: { revision: sourceRevision(fuel), error: 'Original unavailable offline' } } }), 'ifta-fuel').status, 'stale');
});
test('sync bookkeeping timestamps do not invalidate unchanged original evidence', () => {
  const business = reviewed(base, 'ifta-fuel');
  const synced = { ...fuel, source: { ...fuel.source, updated_at: '2026-10-20T07:00:00Z', updatedAt: '2026-10-20T07:00:00Z', cloud_synced: true } };
  assert.equal(item(model({ business, rows: [synced] }), 'ifta-fuel').status, 'checked');
  assert.equal(item(model({ business, rows: [{ ...synced, unit: '229' }] }), 'ifta-fuel').status, 'stale');
});
test('weeks, vehicles, drivers and load filters cannot reuse another scoped review', () => {
  const business = reviewed(base, 'ifta-fuel');
  for (const option of [{ week: '2026-10-26' }, { scope: { ...scope, unit: '229' } }, { scope: { ...scope, loadNo: 'OTHER' } }]) assert.notEqual(item(model({ business, ...option }), 'ifta-fuel').status, 'checked');
  const log = row('log/driver-a/2026-10-19', 'logs', { kind: 'log', source: { driverId: 'driver-a', events: [{ status: 'ON', startMin: 480, endMin: 510 }] } });
  const driverBusiness = reviewed(base, 'safety-logs', { area: 'safety', rows: [log], chosen: [log] });
  const first = item(model({ area: 'safety', business: driverBusiness, rows: [log], proofs: { [log.id]: { sha256: hash, revision: sourceRevision(log), rowSnapshot: canonical(log.source) } } }), 'safety-logs');
  assert.equal(first.status, 'checked');
  assert.notEqual(item(model({ area: 'safety', business: driverBusiness, rows: [log], scope: { ...scope, driverId: 'driver-b' } }), 'safety-logs').status, 'checked');
});
test('a changed log must be checked again and no audit action rewrites duty events', () => {
  const original = { driverId: 'driver-a', events: [{ id: 'event-1', status: 'SB', startMin: 0, endMin: 600 }], signature: { signed: true } };
  const log = row('log/driver-a/2026-10-19', 'logs', { kind: 'log', source: original });
  const ref = { rowId: log.id, sha256: hash, revision: sourceRevision(log) }, proofs = { [log.id]: { sha256: hash, revision: sourceRevision(log), rowSnapshot: canonical(log.source) } };
  assert.equal(sourceValidity(ref, log, proofs), '');
  const changed = { ...log, source: { ...original, events: [{ ...original.events[0], endMin: 540 }] } };
  assert.match(sourceValidity(ref, changed, proofs), /Check the original again/);
  assert.deepEqual(original.events, [{ id: 'event-1', status: 'SB', startMin: 0, endMin: 600 }]);
});
test('unhashed legacy originals require fresh byte verification after reopen', () => {
  const unhashed = { ...fuel, source: { file_size_bytes: 18 } }, ref = { rowId: fuel.id, sha256: hash, revision: sourceRevision(unhashed) };
  assert.match(sourceValidity(ref, unhashed), /Check the original again/);
  assert.equal(sourceValidity(ref, unhashed, { [fuel.id]: { revision: ref.revision, sha256: hash } }), '');
  assert.match(sourceValidity(ref, unhashed, { [fuel.id]: { revision: ref.revision, sha256: 'f'.repeat(64) } }), /bytes changed/);
});
test('a credential issued last year remains reviewable in its valid week', () => {
  const business = reviewed(base, 'irp-insurance', { area: 'irp', chosen: [insurance], coverageFrom: '2025-12-15', coverageThrough: '2026-12-14' });
  const value = model({ business, area: 'irp' });
  assert.equal(item(value, 'irp-insurance').status, 'checked');
  assert.equal(item(value, 'irp-insurance').candidates[0].date, '2025-12-15');
  assert.deepEqual(packetRowsFor(value).map(r => r.id), [insurance.id]);
});
test('expired and midweek-expiring evidence do not count as checked', () => {
  const business = reviewed(base, 'irp-insurance', { area: 'irp', chosen: [insurance], coverageFrom: '2025-12-15', coverageThrough: '2026-10-21' });
  assert.equal(item(model({ business, area: 'irp' }), 'irp-insurance').status, 'expiring');
  assert.equal(item(model({ business, area: 'irp', week: '2026-10-26' }), 'irp-insurance').status, 'expired');
});
test('not applicable needs a reason and has bounded scope and dates', () => {
  const instance = item(model({ area: 'safety' }), 'safety-defects');
  assert.throws(() => validateReview(instance.requirement, { status: 'not_applicable', reviewer: 'Reviewer', coverageFrom: '2026-10-19', coverageThrough: '2026-10-25' }, instance, profile, [], now), /Explain why/);
  const business = reviewed(base, 'safety-defects', { area: 'safety', status: 'not_applicable', chosen: [], note: 'Synthetic review found no applicable defect event this week.' });
  assert.equal(item(model({ business, area: 'safety' }), 'safety-defects').status, 'not_applicable');
  assert.notEqual(item(model({ business, area: 'safety', week: '2026-10-26' }), 'safety-defects').status, 'not_applicable');
});
test('periodic not-applicable findings cannot carry forward without coverage', () => {
  const business = reviewed(base, 'safety-inspection', { area: 'safety', status: 'not_applicable', chosen: [], note: 'Synthetic unit did not operate in this period.', coverageFrom: '2026-10-19', coverageThrough: '2026-10-25' });
  assert.equal(item(model({ business, area: 'safety' }), 'safety-inspection').status, 'not_applicable');
  assert.equal(item(model({ business, area: 'safety', week: '2026-10-26' }), 'safety-inspection').status, 'coverage');
});
test('inactive requirements do not become document omissions', () => {
  const value = model({ business: { ...base, [PROFILE_KEY]: { ...profile, iftaApplies: 'not_applicable', applicabilityNote: 'Confirmed synthetic non-qualified operation.' } }, rows: [] });
  assert.equal(value.counts.attention, 0);
  assert(value.items.every(i => i.status === 'not_applicable'));
  assert.equal(value.counts.checked, 0);
});
test('quarterly evidence keeps a company/quarter scope separate from a selected load', () => {
  const quarterRows = [row('q3-return', 'other', { date: '2026-10-10', unit: '' })];
  const business = reviewed(base, 'ifta-return', { week: '2026-09-21', rows: quarterRows, chosen: quarterRows, coverageFrom: '2026-07-01', coverageThrough: '2026-09-30' });
  const value = model({ business, rows: quarterRows, week: '2026-09-07', scope: { unit: '229', driverId: 'driver-b', loadNo: 'LOAD-Z' } });
  const result = item(value, 'ifta-return'); assert.equal(result.status, 'checked'); assert.equal(result.scope.unit, ''); assert.equal(result.scope.loadNo, '');
  assert.equal(result.period.id, '2026-Q3');
  assert.notEqual(item(model({ business, rows: quarterRows }), 'ifta-return').status, 'checked');
});
test('a week crossing quarters exposes both quarters and cannot use one filing twice', () => {
  const value = model({ week: '2026-03-30' });
  assert.deepEqual(value.items.filter(i => i.requirement.id === 'ifta-return').map(i => i.period.id), ['2026-Q1', '2026-Q2']);
});
test('quarter still in progress is not called missing or filed', () => {
  assert.equal(item(model(), 'ifta-return').status, 'not_due');
  assert.throws(() => reviewed(base, 'ifta-return', { chosen: [receipt] }), /quarter has not ended/);
  assert.notEqual(item(model({ week: '2026-07-06', today: '2026-11-03' }), 'ifta-return').status, 'not_due');
});
test('annual and rolling checks enforce applicable validity rather than weekly issue date', () => {
  const inspection = row('inspection-1', 'inspection', { date: '2026-01-01' });
  assert.throws(() => reviewed(base, 'safety-inspection', { area: 'safety', rows: [inspection], chosen: [inspection], coverageFrom: '2026-01-01', coverageThrough: '2027-02-01' }), /12-month/);
});
test('a profile/rule change invalidates the prior review and retains its history', () => {
  const business = reviewed(base, 'ifta-fuel');
  const next = updateProfileRecord(business, { ...profile, iftaBase: 'NJ', reference: 'Synthetic new base record' }, profile, '2026-10-20T18:00:00.000Z');
  assert.equal(item(model({ business: next }), 'ifta-fuel').status, 'stale');
  assert.equal(next[REVIEWS_KEY].length, 1); assert.equal(next[PROFILE_KEY].history[0].before.iftaBase, 'IL');
  const oldRule = { ...business, [REVIEWS_KEY]: business[REVIEWS_KEY].map(r => ({ ...r, ruleSet: 'old' })) };
  assert.equal(item(model({ business: oldRule }), 'ifta-fuel').status, 'stale');
});
test('compare-before-save protects concurrent review and profile edits', () => {
  const first = reviewed(base, 'ifta-fuel'), review = first[REVIEWS_KEY][0];
  assert.throws(() => updateReviewRecord(first, { ...review, note: 'stale writer' }, null, profile), /changed on another/);
  const changedProfile = { ...first, [PROFILE_KEY]: { ...profile, reference: 'Changed profile reference' } };
  assert.throws(() => updateReviewRecord(changedProfile, review, review, profile), /profile changed/);
  assert.throws(() => updateProfileRecord(first, profile, emptyProfile(), now), /profile changed/);
});
test('existing business records, distinct review history and source records survive reopen', () => {
  const first = reviewed(base, 'ifta-fuel'), reopened = JSON.parse(JSON.stringify(first));
  const second = reviewed(reopened, 'ifta-fuel', { note: 'Second documented content review.' });
  assert.deepEqual(second.loads, base.loads); assert.deepEqual(second.documents, base.documents);
  assert.equal(second[REVIEWS_KEY].length, 1); assert.equal(second[REVIEWS_KEY][0].history.length, 2);
  assert.equal(item(model({ business: second }), 'ifta-fuel').status, 'checked');
});
test('existing account record transport preserves profiles and independently merges checks', () => {
  const b = recordsFrom({ business: base }), localBusiness = reviewed(base, 'ifta-fuel'), remoteBusiness = reviewed(base, 'ifta-distance', { chosen: [receipt] });
  const local = recordsFrom({ business: localBusiness }), remote = recordsFrom({ business: remoteBusiness }), merged = mergeRecords(b, local, remote);
  assert.equal(merged.conflicts.length, 0);
  const reopened = bundleFrom(merged.records).business;
  assert.deepEqual(reopened[PROFILE_KEY], profile); assert.equal(reopened[REVIEWS_KEY].length, 2);
  assert.equal(item(model({ business: reopened }), 'ifta-distance').status, 'checked');
  assert.equal(item(model({ business: reopened }), 'ifta-fuel').status, 'checked');
});
test('same original supports different audit areas through references, not file copies', () => {
  const ifta = reviewed(base, 'ifta-distance', { chosen: [receipt] }), both = reviewed(ifta, 'irp-distance', { area: 'irp', chosen: [receipt] });
  const refs = both[REVIEWS_KEY].flatMap(r => r.sourceRefs);
  assert.equal(new Set(refs.map(r => r.rowId)).size, 1); assert.equal(new Set(refs.map(r => r.sha256)).size, 1);
  assert.deepEqual(both.documents, base.documents);
});
test('ZIP manifest downgrades missing or changed originals and retains scope/provenance', () => {
  const value = model({ business: reviewed(base, 'ifta-fuel') }), index = auditIndex(value, now);
  assert.equal(index.ruleSet, RULESET); assert.equal(index.confirmedProfile.iftaBase, 'IL');
  assert(index.checks.every(check => check.cadence && check.scope && check.period && check.sources.length));
  const absent = archiveAuditIndex(index, [], [{ id: fuel.id, reason: 'Original unavailable' }]);
  assert.equal(absent.checks.find(c => c.requirement === 'ifta-fuel').status, 'needs_review');
  assert.equal(absent.counts.checked, 0);
  const changed = archiveAuditIndex(index, [{ id: fuel.id, auditSha256: 'c'.repeat(64) }], []);
  assert.equal(changed.checks.find(c => c.requirement === 'ifta-fuel').status, 'needs_review');
  assert.equal(index.checks.find(c => c.requirement === 'ifta-fuel').status, 'checked');
});
test('calendar week uses home-terminal date across device zones and DST', () => {
  assert.equal(todayInZone('America/Chicago', new Date('2026-10-19T03:00:00Z')), '2026-10-18');
  assert.equal(todayInZone('Europe/Tirane', new Date('2026-10-19T03:00:00Z')), '2026-10-19');
  assert.deepEqual(weekRange('2026-11-01'), { from: '2026-10-26', to: '2026-11-01' });
  assert.equal(addDays('2026-03-08', 1), '2026-03-09'); assert.equal(day('2026-02-29'), '');
});
test('actual terminal-zone field wins legacy aliases at Sunday Chicago / Monday UTC', () => {
  const state = { homeTerminalTimeZone: 'America/Chicago', homeTimezone: 'UTC', homeTerminalTimezone: 'Europe/Tirane' }, instant = new Date('2026-10-19T03:00:00Z');
  assert.equal(todayInZone('UTC', instant), '2026-10-19');
  assert.deepEqual(weekRange(todayInZone(auditTimeZone(state), instant)), { from: '2026-10-12', to: '2026-10-18' });
  assert.equal(state.homeTerminalTimeZone, 'America/Chicago');
});

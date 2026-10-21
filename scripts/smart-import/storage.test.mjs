import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStatementCsv, previewStatement} from './core.js';
import {commitStatementReview} from '../../source/src/modules/smart-import/storage.js';

const parsed = () => parseStatementCsv('Date,State,Gallons,Total,Transaction ID\n2026-10-01,IL,100,350,F1', 'Mudflap.csv', {workspaceId: 'sample-owner'});
const review = () => ({file: new File(['source'], 'Mudflap.csv'), fileHash: 'test-hash', context: {workspaceId: 'sample-owner'}, plan: previewStatement(parsed()), snapshot: {serialized: 'initial'}});
const snapshot = () => ({serialized: 'initial', targetKey: 'business', business: {fuel: [], expenses: [], loads: [{id: 'old-load'}]}, ops: {mileageImports: []}});
function dependencies(overrides = {}) {
  const calls = [], output = {};
  return {calls, output, db: {}, lock: async (name, work) => work(), account: () => 'sample-owner', read: snapshot, stage: async () => { calls.push('source'); return {local_id: 'original', statementImportV1: {status: 'staged'}}; }, write: (key, value) => { calls.push('rows'); output[key] = value; }, notify: () => calls.push('notify'), ...overrides};
}
test('source commits before canonical rows; no second fuel ledger is written', async () => {
  const deps = dependencies(), result = await commitStatementReview(review(), deps);
  assert.equal(result.added, 1); assert.deepEqual(deps.calls, ['source', 'rows', 'notify']);
  assert.equal(deps.output.business.fuel.length, 1); assert.equal(deps.output.business.fuel[0].sourceDocumentId, 'original');
  assert.equal(deps.output.business.loads[0].id, 'old-load'); assert.equal(deps.output.business.fuel[0].loadNo, '');
  assert.equal(Object.keys(deps.output).length, 1);
});
test('failure to preserve an original prevents financial writes', async () => {
  const deps = dependencies({stage: async () => { throw Error('source disk full'); }});
  await assert.rejects(commitStatementReview(review(), deps), /disk full/);
  assert.deepEqual(deps.calls, []); assert.deepEqual(deps.output, {});
});
test('a local projection failure does not delete the staged original', async () => {
  let saved = false;
  const deps = dependencies({stage: async () => { saved = true; return {local_id: 'staged-source'}; }, write: () => { throw Error('quota exceeded'); }});
  await assert.rejects(commitStatementReview(review(), deps), /quota/); assert.equal(saved, true);
});
test('a changed post-preview snapshot blocks before staging', async () => {
  const deps = dependencies({read: () => ({...snapshot(), serialized: 'changed'})});
  await assert.rejects(commitStatementReview(review(), deps), /changed after preview/);
  assert.deepEqual(deps.calls, []);
});
test('a concurrent save while storing the source cannot be overwritten', async () => {
  let calls = 0;
  const deps = dependencies({read: () => ({...snapshot(), serialized: ++calls === 1 ? 'initial' : 'other-record-save'})});
  await assert.rejects(commitStatementReview(review(), deps), /changed while saving/);
  assert.deepEqual(deps.calls, ['source']); assert.deepEqual(deps.output, {});
});
test('account changes during source staging stop transaction projection', async () => {
  let accountCalls = 0;
  const deps = dependencies({account: () => ++accountCalls === 1 ? 'sample-owner' : 'other-account'});
  await assert.rejects(commitStatementReview(review(), deps), /account changed/);
  assert.deepEqual(deps.calls, ['source']);
});
test('conflicts block all writes', async () => {
  const input = review(); input.plan.canSave = false;
  const deps = dependencies(); await assert.rejects(commitStatementReview(input, deps), /conflicting/);
  assert.deepEqual(deps.calls, []);
});
test('read-only logbook archives never write business or log state', async () => {
  const input = review(); input.plan = {...input.plan, kind: 'logs', rows: [], added: [], readOnly: true};
  const deps = dependencies({read: () => { throw Error('log archives must not read a financial target'); }});
  const result = await commitStatementReview(input, deps);
  assert.equal(result.readOnly, true); assert.deepEqual(deps.calls, ['source', 'notify']); assert.deepEqual(deps.output, {});
});
test('already-applied duplicate imports make no projection or notification', async () => {
  const input = review(); input.plan = previewStatement(parsed(), parsed().rows);
  const deps = dependencies({stage: async () => ({local_id: 'existing-original', statementImportV1: {status: 'applied'}})});
  const result = await commitStatementReview(input, deps);
  assert.equal(result.added, 0); assert.equal(result.duplicates, 1); assert.deepEqual(deps.calls, []);
});
test('a journal completion failure reports recovery without retrying rows', async () => {
  const deps = dependencies({db: {documents_local: {update: async () => { throw Error('journal write failed'); }}}});
  const result = await commitStatementReview(review(), deps);
  assert.equal(result.added, 1); assert.equal(result.journalPending, true); assert.equal(deps.output.business.fuel.length, 1);
});

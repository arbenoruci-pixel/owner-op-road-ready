import assert from 'node:assert/strict';
import test from 'node:test';
import { checklistFixture } from '../v110321/checklistFixture.mjs';
import { operationalCandidateContext } from '../../source/src/modules/loads/currentLoadV110473.js';
import { resolveDriverGuideV103 } from '../../source/src/modules/loads/loadGuideV103.js';
import { missionSnapshotV1038 } from '../../source/src/modules/home/adaptiveHomeLogicV1038.js';
import { todayStop } from '../../source/src/modules/home/todayStop.js';

test('Today follows the stored guide from its pickup to its receiver, with independent appointment and address', () => {
  const {guide, store, state} = checklistFixture();
  const [pickup, delivery] = guide.stops;
  Object.assign(pickup, {address:'100 Example Road, Howe, IN',appointment:'September 8, 08:00 ET'});
  Object.assign(delivery, {address:'250 Test Drive, Smithfield, RI',appointment:'September 10, 10:30 ET',poNumber:'PO-97'});
  store.loads[0].manualActive = true;
  function readHome() {
    const before = structuredClone({state,store});
    const { current } = operationalCandidateContext(state, store, {day:'2026-09-08', minute:460});
    assert.equal(current.guide.id, guide.id);
    const progress = resolveDriverGuideV103(state, current.guide, store);
    const snapshot = missionSnapshotV1038(progress, current);
    const stop = todayStop(current, store.loads[0], snapshot);
    assert.deepEqual({state,store}, before);
    return stop;
  }
  let stop = readHome();
  assert.equal(stop.label, 'Pickup');
  assert.equal(stop.company, pickup.company);
  assert.equal(stop.appointment, 'September 8, 08:00 ET');
  assert.equal(stop.address.display, '100 Example Road, Howe, IN');
  // The synthetic store already has its BOL. Advance the one pending pickup checklist item.
  guide.manualDone.pickup_ready = 1;
  stop = readHome();
  assert.equal(stop.label, 'Delivery'); assert.equal(stop.company, delivery.company);
  assert.equal(stop.appointment, 'September 10, 10:30 ET');
  assert.deepEqual(stop.address, {display:'250 Test Drive, Smithfield, RI',routable:true});
  assert.equal(stop.reference,'PO # PO-97');
});

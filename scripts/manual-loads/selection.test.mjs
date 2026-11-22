import test from 'node:test';
import assert from 'node:assert/strict';
import {currentOperationalLoad, operationalCandidateContext} from '../../source/src/modules/loads/currentLoadV110473.js';
import {collectShipmentScanCandidates} from '../../source/src/modules/scan/shipmentFiling.js';
import {loadPickerCandidates} from '../../source/src/modules/scan/loadPickerV110472.js';

const when = {day: '2026-11-22', minute: 600};
const row = (loadNo, extra = {}) => ({id: 'row-' + loadNo, loadNo, status: 'booked', ...extra});
const pickup = (day, loadNo) => ({[day]: [{id: day + loadNo, status: 'ON', startMin: 480, note: 'Pickup / Loading', shippingDocs: loadNo, city: 'Chicago', state: 'IL'}]});

function projection(state, loads) {
  const store = {loads};
  const before = structuredClone({state, store});
  const context = operationalCandidateContext(state, store, when);
  assert.deepEqual(currentOperationalLoad(state, store, when), context.current);
  const scan = loadPickerCandidates(collectShipmentScanCandidates(state, store), state, store, context);
  assert.deepEqual({state,store}, before);
  return {current: context.current, activeScan: scan.filter(item => item.active).map(item => item.loadNo)};
}

test('a chosen manual folder overrides a stale form and an unrelated pickup in Home, Mission and Scan', () => {
  const state = {loadInfo: {loadNo: 'OLD-101'}, eventsByDay: pickup('2026-11-21', 'BOL-321')};
  const {current, activeScan} = projection(state, [row('OLD-101'), row('NEW-201', {manualActive: true, destination: 'Columbus, OH'})]);
  assert.equal(current.loadNo, 'NEW-201');
  assert.equal(current.guide, null);
  assert.equal(current.destination, 'Columbus, OH');
  assert.deepEqual(activeScan, ['NEW-201']);
});

test('a single eligible folder is available without a guide or log entry, but competing folders require selection', () => {
  const open = row('MAN-100'), closed = row('END-200', {manualActive: true, status: 'paid', operationalStatus: 'booked'});
  const {current, activeScan} = projection({}, [open, closed]);
  assert.equal(current.recordId, open.id);
  assert.deepEqual(activeScan, ['MAN-100']);
  for (const loads of [[open, row('NEXT-101')], [closed],
    [row('MAN-100',{manualActive:true}),row('NEXT-101',{manualActive:true})],
    [row('MAN-100',{manualActive:true}),row('MAN100')],
    [row('BAD-201', {identityReviewV110326: true})], [row('END-300',{serviceStatus:'completed'})]]) {
    assert.deepEqual(projection({}, loads), {current:null, activeScan:[]});
  }
});

test('the most recent recorded pickup without a route leg stays a shipment reference in each view', () => {
  const state = {loadInfo: {loadNo: 'FORM-201'}, eventsByDay: {
    ...pickup('2026-11-21', 'BOL-321'), ...pickup('2026-11-25', 'FUT-500'),
    '2026-11-23': [{id: 'later', status: 'ON', startMin: 800, note: 'Delivery', shippingDocs: 'BOL-321'}],
  }};
  const {current, activeScan} = projection(state, [row('FORM-201')]);
  assert.equal(current.identity, 'reference');
  assert.equal(current.shipmentReference, 'BOL-321');
  assert.equal(current.canonicalLoadNo, '');
  assert.deepEqual(activeScan, ['BOL-321']);
});

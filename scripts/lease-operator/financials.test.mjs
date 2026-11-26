import assert from 'node:assert/strict';
import test from 'node:test';
import { activityDays, currentWeek, moveDay, paymentRecorded, recordedRevenue, weekStart } from '../../app/operator/financials.js';

test('calendar week starts Monday in Chicago across midnight, DST and year boundaries', () => {
  assert.equal(currentWeek(new Date('2026-11-30T05:58:00Z')), '2026-11-23');
  assert.equal(currentWeek(new Date('2026-11-30T06:00:00Z')), '2026-11-30');
  assert.equal(currentWeek(new Date('2026-03-09T05:01:00Z')), '2026-03-09');
  assert.equal(weekStart('2027-01-01'), '2026-12-28');
  assert.equal(moveDay('2026-12-28', 7), '2027-01-04');
});

test('activity uses actual delivery and purchase dates; pending revenue stays unknown', () => {
  const first = { id: 'l1', actual_delivery_date: '2026-11-25', gross_cents: 125500 };
  const pending = { id: 'l2', actual_delivery_date: null, gross_cents: null };
  const fuel = { id: 'e1', purchased_on: '2026-11-24', amount_cents: 34001 };
  const credit = { id: 'e2', purchased_on: '2026-11-25', amount_cents: -101 };
  assert.deepEqual(activityDays([first, pending], [fuel, credit]), [
    { date: '2026-11-25', loads: [first], expenses: [credit] },
    { date: '2026-11-24', loads: [], expenses: [fuel] },
    { date: '', loads: [pending], expenses: [] },
  ]);
  assert.equal(recordedRevenue([first, pending]), null);
  assert.equal(recordedRevenue([first]), 125500);
  assert.equal(recordedRevenue([]), 0);
});

test('paid display requires an actual dated payment matching the statement balance', () => {
  const real = { status: 'paid', paid_at: '2026-11-25T10:00:00Z', payment_amount_cents: 96501, payment_reference: 'bank-confirmed-101' };
  const now = Date.parse('2026-11-26T13:00:00Z');
  assert.equal(paymentRecorded(real, 96501, now), true);
  for (const change of [{ status: 'issued' }, { payment_reference: ' ' }, { paid_at: '2027-01-04' }, { paid_at: 'invalid' }, { payment_amount_cents: 96000 }]) {
    assert.equal(paymentRecorded({ ...real, ...change }, 96501, now), false);
  }
  assert.equal(paymentRecorded(real, null, now), false);
});

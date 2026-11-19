import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { applicationPayload, reviewRows, validateStep } from '../../app/apply/application.js';
import { recruitingApplication } from '../../lib/recruiting/applications.js';

const answers = {
  activeClassA: 'yes', age24: 'no', cdlState: 'IL', cdlYears: '3',
  otrYears: '5', amazonDuration: 'year', priorCarrier: 'Example Carrier',
  amazonCarrier: 'Example Relay Carrier', drivingHistory: 'review',
  fullName: 'Sample Applicant', email: 'applicant@example.com', phone: '3125550100',
  startDate: '2027-01-01', truckYear: '2020', truckMake: 'Example', truckModel: 'Tractor',
  registrationState: 'IL', registrationStatus: 'current', garagingAddress: '100 Example Dr, Chicago, IL 60601',
  physicalDamage: 'no', documents: ['registration'], consent: true,
};

test('the Amazon duration applicants review matches the months the inbox receives', () => {
  for (const [duration, expectedMonths, expectedLabel] of [
    [{ amazonDuration: 'year' }, 12, '1 year'],
    [{ amazonDuration: 'longer', amazonYears: '1', amazonExtraMonths: '6' }, 18, '1 year 6 months'],
  ]) {
    const values = { ...answers, ...duration };
    for (let step = 0; step < 6; step++) assert.deepEqual(validateStep(step, values), {});
    const row = reviewRows(values)[1].find(([name]) => name === 'Amazon Relay driving');
    assert.equal(row[1], expectedLabel);
    const record = recruitingApplication({ ...applicationPayload(values), requestId: randomUUID() });
    assert.equal(record.amazonMonths, expectedMonths);
    assert.equal(record.cdlMonths, 36);
    assert.equal(record.otrMonths, 60);
    assert.equal(record.age24, false);
  }
});

test('an applicant below the Amazon minimum gets feedback on that answer alone', () => {
  const belowMinimum = { otrYears: '5', amazonDuration: 'under' };
  const errors = validateStep(1, belowMinimum);
  assert.deepEqual(Object.keys(errors), ['amazonDuration']);
  assert.match(errors.amazonDuration, /12 months/);
  assert.deepEqual(validateStep(1, { ...answers, amazonDuration: 'year' }), {});
});

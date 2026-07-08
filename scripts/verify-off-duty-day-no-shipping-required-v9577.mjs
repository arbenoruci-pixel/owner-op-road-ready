import { validateLogForSigning } from '../source/src/modules/logbook/signing.js';

const day = '2026-07-04';
const state = {
  activeDay: day,
  driverProfile: { name: 'Arben Oruci' },
  driver: { name: 'Arben Oruci', truck: '228', trailer: 'Trailer 53', carrier: 'Narta Express LLC', mainOffice: 'Willowbrook, IL' },
  carrierName: 'Narta Express LLC',
  mainOfficeAddress: 'Willowbrook, IL',
  eventsByDay: {
    [day]: [
      { id: 'off_full_day', status: 'OFF', startMin: 0, endMin: 1440, city: 'Chicago', state: 'IL', note: 'Off Duty', description: '' },
    ],
  },
  routeLegsByDay: {},
  loadInfo: {},
  equipment: {},
  inspectionByDay: {},
  signatureByDay: {},
};

const issues = validateLogForSigning(state, day).issues || [];
const shippingIssue = issues.find(issue => /missing_shipping_docs/i.test(String(issue.code || issue.id || '')));
if (shippingIssue) {
  console.error('OFF DUTY day incorrectly requires shipping docs:', shippingIssue);
  process.exit(1);
}
console.log('verify-off-duty-day-no-shipping-required-v9577: passed');

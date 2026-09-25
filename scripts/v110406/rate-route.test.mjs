import assert from 'node:assert/strict';
import test from 'node:test';
import { reanalyzeTruckDocumentTypeV1040 } from '../../source/src/modules/scan/truckDocumentEngineV1040.js';

// Synthetic counterpart of a rate confirmation with separate party/time labels.
const document = `TRUCKLOAD RATE CONFIRMATION
Load # 987654321
Shipper Information:
Name: EXAMPLE SHIPPER
Address: 123 EXAMPLE STREET
MADISON, WI 53703
Pick Up Time:
9/23/2026 4:00 PM
PICK UP INSTRUCTIONS: LOADS AT 4PM SHARP
Consignee Information:
Name: EXAMPLE RECEIVER
Address: 456 SAMPLE ROAD
PORTLAND, ME 04101
Delivery Time:
9/24/2026 1:00 PM
DELIVERY INSTRUCTIONS: DELIVER AT 1PM SHARP
Total Carrier Pay: $1000
The Driver / Carrier is responsible for piece count and condition of load at
time of delivery. For payment of freight charges,
please send the paperwork.`;

const analyze = (text = document, fields = {}, type = 'rate_confirmation') => reanalyzeTruckDocumentTypeV1040({ text, fields, fileName: 'CarrierConfirmationTruckload.pdf' }, type).fields;

test('keeps shipper and consignee cities instead of footer prose and Delivery Time', () => {
  const fields = analyze();
  assert.equal(fields.origin, 'MADISON, WI');
  assert.equal(fields.destination, 'PORTLAND, ME');
  assert.equal(fields.loadNo, '987654321');
});

test('rereading replaces the exact bad cached route values', () => {
  const fields = analyze(document, { origin: 'time of delivery. For payment of freight charges,', destination: 'Time:' });
  assert.equal(fields.origin, 'MADISON, WI');
  assert.equal(fields.destination, 'PORTLAND, ME');
});

test('rejects the legacy INSTRUCTIONS and Information captures', () => {
  const fields = analyze(document, { origin: 'INSTRUCTIONS:', destination: 'Information:' });
  assert.equal(fields.origin, 'MADISON, WI');
  assert.equal(fields.destination, 'PORTLAND, ME');
});

test('preserves existing valid routes and multi-stop details without mutation', () => {
  const seed = { origin: 'Chicago, IL', destination: 'Bangor, ME', stops: [{ city: 'Chicago', state: 'IL', kind: 'pickup' }, { city: 'Bangor', state: 'ME', kind: 'delivery' }] };
  const before = structuredClone(seed);
  const fields = analyze(document, seed);
  assert.equal(fields.origin, before.origin);
  assert.equal(fields.destination, before.destination);
  assert.deepEqual(fields.stops, before.stops);
  assert.deepEqual(seed, before);
});

test('reads locations on the same line as their role labels', () => {
  const fields = analyze('RATE CONFIRMATION\nLoad # 987654321\nOrigin: Chicago, IL\nDestination: Portland, ME');
  assert.equal(fields.origin, 'Chicago, IL');
  assert.equal(fields.destination, 'Portland, ME');
});

test('recovers comma-less postal addresses from invalid cached routes', () => {
  const text = document.replace('MADISON, WI', 'MADISON WI').replace('PORTLAND, ME', 'PORTLAND ME');
  const fields = analyze(text, { origin: 'INSTRUCTIONS:', destination: 'Time:' });
  assert.equal(fields.origin, 'MADISON, WI');
  assert.equal(fields.destination, 'PORTLAND, ME');
});

test('reads inline comma-less postal locations without treating company CO as a state', () => {
  const fields = analyze('RATE CONFIRMATION\nLoad # 987654321\nOrigin: Madison WI 53703\nDestination: Portland ME 04101');
  assert.equal(fields.origin, 'Madison, WI');
  assert.equal(fields.destination, 'Portland, ME');
  const missing = analyze(document.replace('EXAMPLE SHIPPER', 'EXAMPLE CO').replace('MADISON, WI 53703\n', ''));
  assert.equal(missing.origin || '', '');
});

test('does not borrow a destination when the pickup address is missing', () => {
  const fields = analyze(document.replace('MADISON, WI 53703\n', ''));
  assert.equal(fields.origin || '', '');
  assert.equal(fields.destination, 'PORTLAND, ME');
});

test('leaves absent routes empty even when time labels and footer are present', () => {
  const fields = analyze('RATE CONFIRMATION\nLoad # 987654321\nDelivery Time:\n9/24/2026 1PM\ncondition of load at time of delivery. For payment of freight charges,', { origin: 'time of delivery. For payment of freight charges,', destination: 'Time:' });
  assert.equal(fields.origin || '', '');
  assert.equal(fields.destination || '', '');
});

test('does not change explicitly supplied routes on other document types', () => {
  const fields = analyze('BILL OF LADING\nB/L # 987654321', { origin: 'Chicago, IL', destination: 'Portland, ME' }, 'bol');
  assert.equal(fields.origin, 'Chicago, IL');
  assert.equal(fields.destination, 'Portland, ME');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { chicagoDay } from '../../app/operator/financials.js';
import { instructionsSlot, reviewDocuments } from '../../app/operator/roadDocuments.js';

const day = '2026-11-26';
const slot = 'registration:assigned-tractor';
const requirement = {slot_key: slot, title: 'Tractor registration or IRP cab card', expiry_required: true};
const file = {id: 'current', slot_key: slot, title: 'Cab card', category: 'registration', is_ready: true, is_current: true};

test('a missing original, archived version or incomplete upload cannot satisfy a requirement', () => {
  for (const documents of [[], [{...file, is_current: false}], [{...file, is_ready: false}]]) {
    const [item] = reviewDocuments(documents, [requirement], day);
    assert.equal(item.status, 'Missing current document');
    assert.equal(item.title, requirement.title);
    assert.equal(item.required, true);
    assert.match(item.action, /unit or VIN, plate/);
    assert.equal(item.doc, undefined);
  }
});

test('dispatch gets an actionable distinction between missing expiry, expired and future-dated copies', () => {
  const assess = (patch) => reviewDocuments([{...file, ...patch}], [requirement], day)[0];
  assert.match(assess({}).action, /page showing the expiration date/);
  assert.match(assess({expires_on: '2026-11-25'}).action, /renewed/);
  assert.match(assess({issued_on: '2026-11-27', expires_on: '2027-11-26'}).action, /covering today/);
  assert.equal(assess({expires_on: day}).status, 'Expires today');
  assert.equal(assess({expires_on: day}).action, '');
});

test('only the verified current revision counts; optional files and the guide do not complete missing slots', () => {
  const archive = {...file, id: 'previous', is_current: false, expires_on: '2026-10-01'};
  const optional = {...file, slot_key: 'permit:other', category: 'permit', expires_on: '2026-11-01'};
  const guide = {...file, slot_key: instructionsSlot, category: 'carrier_document'};
  const [registration, extra, instructions] = reviewDocuments([archive, {...file, expires_on: '2027-11-01'}, optional, guide], [requirement], day);
  assert.equal(registration.doc.id, 'current');
  assert.equal(registration.versions.length, 2);
  assert.equal(registration.action, '');
  assert.equal(extra.required, false);
  assert.match(extra.status, /Expired/);
  assert.equal(instructions.required, false);
  assert.equal(reviewDocuments([guide], [], day).filter(item => item.required).length, 0);
  assert.equal(reviewDocuments([optional], [requirement], day)[0].status, 'Missing current document');
  assert.equal(reviewDocuments([file], [{...requirement, expiry_required: false}], day)[0].action, '');
});

test('expiry is inclusive to the end of the Chicago calendar date across UTC midnight', () => {
  const expires = {...file, expires_on: day};
  const statusAt = time => reviewDocuments([expires], [requirement], chicagoDay(new Date(time)))[0].status;
  assert.equal(statusAt('2026-11-27T05:59:59Z'), 'Expires today');
  assert.equal(statusAt('2026-11-27T06:00:00Z'), 'Expired Nov 26, 2026');
});

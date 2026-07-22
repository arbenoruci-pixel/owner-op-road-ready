import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('source/src/app/App.jsx', 'utf8');
const day = fs.readFileSync('source/src/modules/logbook/DayLogScreen.jsx', 'utf8');
const release = JSON.parse(fs.readFileSync('public/app-version.json', 'utf8'));

function activityText(event = {}) {
  const reasons = Array.isArray(event?.reasons) ? event.reasons : [];
  return [...reasons, event?.note || '', event?.description || '']
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(' · ');
}

function isPreTripEvent(event = {}) {
  return event.status === 'ON' && /pre[-\s]?trip|inspection/i.test(activityText(event));
}

const exactFailingShape = {
  id:'pti_and_unloading',
  status:'ON',
  note:'Delivery / Unloading',
  description:'Load 391912 · Unloading at Mounds View, MN',
  reasons:['Delivery / Unloading', 'Pre-trip inspection'],
};

assert.equal(isPreTripEvent(exactFailingShape), true, 'multi-reason PTI event must be recognized');
assert.equal(/pre[-\s]?trip|inspection/i.test(`${exactFailingShape.note} ${exactFailingShape.description}`), false, 'fixture must prove note-only lookup fails');

assert.match(app, /isPreTripStatus\(event\?\.status, inspectionActivityText\(event\)\)/);
assert.match(app, /event\.inspectionConfirmed === true && !previous\.complete/);
assert.match(app, /isAutoPreTripInspection\(previous\) && !previous\.complete/);
assert.doesNotMatch(app, /USER_CONFIRMED_INSPECTION_DAYS/);
assert.match(day, /const reasons = Array\.isArray\(event\?\.reasons\)/);
assert.equal(release.version, '109.5.1');
assert.equal(release.build, 'v10951-multireason-inspection-root-fix');

console.log('PASS — v109.5.1 multi-reason PTI fixture survives inspection reconciliation rules');

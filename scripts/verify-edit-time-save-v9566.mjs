// v95.66 verifier: edited start/end time persists and linked adjacent event moves.
// Run: node scripts/verify-edit-time-save-v9566.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyPatchWithNeighbors, normalizeLogEvents } from '../source/src/core/timeline/timelineEngine.js';
import { displayEventsForDay } from '../source/src/core/timeline/displayTimeline.js';

let checks = 0;
function ok(name, fn) {
  fn();
  checks += 1;
  console.log(`PASS ${name}`);
}

const baseDay = [
  { id:'off', status:'OFF', startMin:0, endMin:252, city:'Indianapolis', state:'IN', note:'Off Duty' },
  { id:'on_pretrip', status:'ON', startMin:252, endMin:270, city:'Indianapolis', state:'IN', note:'Pre-trip inspection' },
  { id:'sb', status:'SB', startMin:270, endMin:900, city:'Indianapolis', state:'IN', note:'Sleeper Berth' },
];

ok('timeline edit: shortening ON from 18m to 8m moves next event start', () => {
  const out = applyPatchWithNeighbors(baseDay, 'on_pretrip', { endMin:260 });
  const on = out.find(e => e.id === 'on_pretrip');
  const sb = out.find(e => e.id === 'sb');
  assert.equal(on.startMin, 252);
  assert.equal(on.endMin, 260);
  assert.equal(on.endMin - on.startMin, 8);
  assert.equal(sb.startMin, 260);
  assert.equal(sb.endMin, 900);
});

ok('display after save: event list shows edited 8m, not old 18m', () => {
  const raw = applyPatchWithNeighbors(baseDay, 'on_pretrip', { endMin:260 });
  const display = displayEventsForDay(raw, false, { fillStartWith:'OFF' });
  const on = display.find(e => e.id === 'on_pretrip');
  const sb = display.find(e => e.id === 'sb');
  assert.equal(on.endMin - on.startMin, 8);
  assert.equal(sb.startMin, 260);
});

ok('timeline edit: moving ON start adjusts previous event end', () => {
  const out = applyPatchWithNeighbors(baseDay, 'on_pretrip', { startMin:248 });
  const off = out.find(e => e.id === 'off');
  const on = out.find(e => e.id === 'on_pretrip');
  assert.equal(off.endMin, 248);
  assert.equal(on.startMin, 248);
});

ok('timeline edit: extending ON trims next event start', () => {
  const out = applyPatchWithNeighbors(baseDay, 'on_pretrip', { endMin:280 });
  const on = out.find(e => e.id === 'on_pretrip');
  const sb = out.find(e => e.id === 'sb');
  assert.equal(on.endMin, 280);
  assert.equal(sb.startMin, 280);
});

ok('app updateEvent uses linked-neighbor save path for time edits', () => {
  const src = readFileSync(new URL('../source/src/app/App.jsx', import.meta.url), 'utf8');
  assert.ok(src.includes('applyPatchWithNeighbors'), 'App updateEvent must import/use applyPatchWithNeighbors');
  assert.ok(src.includes('const hasTimeEdit = patch.startMin !== undefined || patch.endMin !== undefined'), 'App updateEvent must detect time edits');
});

ok('edit sheet preview uses linked-neighbor timeline', () => {
  const src = readFileSync(new URL('../source/src/modules/editor/EditEventSheet.jsx', import.meta.url), 'utf8');
  assert.ok(src.includes('applyPatchWithNeighbors'), 'Edit sheet preview must use linked-neighbor timeline');
  assert.ok(!src.includes('applyEditOverride(events, event.id, preview)'), 'Edit sheet preview must not use stale override preview');
});

console.log(`verify-edit-time-save-v9566: ${checks} checks passed`);

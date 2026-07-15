import assert from 'node:assert/strict';
import { resolveRawShiftSelectionV101, shiftSelectedEventsV101 } from '../source/src/core/timeline/multiEventShiftV101.js';

function rows(events) {
  return events.map(event => [event.id, event.startMin, event.endMin]);
}

// Regression: when every real raw row is selected but the raw rows cover only
// part of the day, they must move as one block. The old engine incorrectly sent
// this case to the full-day duty-change mode and blocked it.
{
  const raw = [
    { id:'on1', status:'ON', startMin:600, endMin:615, note:'Pickup' },
    { id:'d1', status:'D', startMin:615, endMin:900 },
    { id:'on2', status:'ON', startMin:900, endMin:930, note:'Delivery' },
  ];
  const result = shiftSelectedEventsV101(raw, ['on1','d1','on2'], 60);
  assert.equal(result.blockedReason, '');
  assert.equal(result.appliedDeltaMin, 60);
  assert.deepEqual(rows(result.events), [
    ['on1',660,675], ['d1',675,960], ['on2',960,990],
  ]);
}

// Standard contiguous middle block later.
{
  const raw = [
    { id:'off1', status:'OFF', startMin:0, endMin:360 },
    { id:'on1', status:'ON', startMin:360, endMin:375 },
    { id:'d1', status:'D', startMin:375, endMin:600 },
    { id:'on2', status:'ON', startMin:600, endMin:615 },
    { id:'off2', status:'OFF', startMin:615, endMin:1440 },
  ];
  const result = shiftSelectedEventsV101(raw, ['on1','d1','on2'], 60);
  assert.equal(result.appliedDeltaMin, 60);
  assert.deepEqual(rows(result.events), [
    ['off1',0,420], ['on1',420,435], ['d1',435,660], ['on2',660,675], ['off2',675,1440],
  ]);
}

// Separated selections move later together. The unselected event between them
// keeps its duration because later groups are moved from the end first.
{
  const raw = [
    { id:'off1', status:'OFF', startMin:0, endMin:300 },
    { id:'on1', status:'ON', startMin:300, endMin:330 },
    { id:'d1', status:'D', startMin:330, endMin:600 },
    { id:'on2', status:'ON', startMin:600, endMin:630 },
    { id:'off2', status:'OFF', startMin:630, endMin:1440 },
  ];
  const result = shiftSelectedEventsV101(raw, ['on1','on2'], 30);
  assert.equal(result.blockedReason, '');
  assert.equal(result.appliedDeltaMin, 30);
  assert.deepEqual(rows(result.events), [
    ['off1',0,330], ['on1',330,360], ['d1',360,630], ['on2',630,660], ['off2',660,1440],
  ]);
  assert.equal(result.mode, 'disjoint_selected_groups_v101');
}

// Display normalization can merge multiple raw ON rows into one visible row.
// Selecting that visible row must move every raw row underneath it.
{
  const raw = [
    { id:'off1', status:'OFF', startMin:0, endMin:300 },
    { id:'on1', status:'ON', startMin:300, endMin:315 },
    { id:'on2', status:'ON', startMin:315, endMin:330 },
    { id:'d1', status:'D', startMin:330, endMin:600 },
  ];
  const display = [
    { id:'off1', status:'OFF', startMin:0, endMin:300 },
    { id:'on1', status:'ON', startMin:300, endMin:330 },
    { id:'d1', status:'D', startMin:330, endMin:600 },
  ];
  assert.deepEqual(resolveRawShiftSelectionV101(raw, display, ['on1']), ['on1','on2']);
}

// If the full requested amount does not fit, movement still happens by the
// maximum available amount instead of silently doing nothing.
{
  const raw = [
    { id:'off1', status:'OFF', startMin:0, endMin:300 },
    { id:'on1', status:'ON', startMin:300, endMin:330 },
    { id:'off2', status:'OFF', startMin:330, endMin:340 },
  ];
  const result = shiftSelectedEventsV101(raw, ['on1'], 30);
  assert.equal(result.blockedReason, '');
  assert.equal(result.appliedDeltaMin, 9);
  assert.deepEqual(rows(result.events), [
    ['off1',0,309], ['on1',309,339], ['off2',339,340],
  ]);
  assert.ok(result.warnings.some(item => item.code === 'clamped'));
}

// Selecting a true full 24-hour timeline still shifts duty-change boundaries
// while keeping midnight fixed.
{
  const raw = [
    { id:'off1', status:'OFF', startMin:0, endMin:360 },
    { id:'d1', status:'D', startMin:360, endMin:600 },
    { id:'off2', status:'OFF', startMin:600, endMin:1440 },
  ];
  const result = shiftSelectedEventsV101(raw, ['off1','d1','off2'], 30);
  assert.equal(result.appliedDeltaMin, 30);
  assert.deepEqual(rows(result.events), [
    ['off1',0,390], ['d1',390,630], ['off2',630,1440],
  ]);
  assert.equal(result.mode, 'duty_changes');
}

console.log('verify-multi-event-shift-v101 passed');

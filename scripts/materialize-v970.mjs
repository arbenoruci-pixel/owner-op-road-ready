import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '97.0.0';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}

const timelinePath = 'source/src/core/timeline/timelineEngine.js';
let timeline = read(timelinePath);

const replacement = `export function shiftSelectedEventsForDay(rawEvents = [], selectedIds = [], deltaMin = 0, options = {}) {
  const requestedDelta = Math.round(Number(deltaMin || 0));
  const selectedSet = new Set((selectedIds || []).filter(Boolean));
  const original = sortEvents(rawEvents || []).filter(Boolean).filter(event => !event.voided).map(cleanShiftEvent);
  const warnings = [];

  if (!original.length) return { events:original, appliedDeltaMin:0, changedEventIds:[], adjustedNeighborIds:[], warnings, blockedReason:'No events on this day' };
  if (!selectedSet.size) return { events:original, appliedDeltaMin:0, changedEventIds:[], adjustedNeighborIds:[], warnings, blockedReason:'Select events first' };
  if (!requestedDelta) return { events:original, appliedDeltaMin:0, changedEventIds:[], adjustedNeighborIds:[], warnings, blockedReason:'Choose a shift amount' };

  const selectedIndexes = original.map((event, index) => selectedSet.has(event.id) ? index : -1).filter(index => index >= 0);
  if (!selectedIndexes.length) return { events:original, appliedDeltaMin:0, changedEventIds:[], adjustedNeighborIds:[], warnings, blockedReason:'Selected events were not found' };
  if (selectedIndexes.length === original.length) return shiftAllDayDutyChanges(original, selectedSet, requestedDelta);

  const groups = [];
  let current = [];
  for (const index of selectedIndexes) {
    if (!current.length || index === current[current.length - 1] + 1) current.push(index);
    else { groups.push(current); current = [index]; }
  }
  if (current.length) groups.push(current);

  const orderedGroups = requestedDelta > 0 ? [...groups].reverse() : groups;
  let working = original.map(event => ({ ...event }));
  const changedEventIds = [];
  const adjustedNeighborIds = [];

  for (const originalGroup of orderedGroups) {
    const groupIds = originalGroup.map(index => original[index]?.id).filter(Boolean);
    const indexes = working.map((event, index) => groupIds.includes(event.id) ? index : -1).filter(index => index >= 0);
    if (!indexes.length) return { events:original, appliedDeltaMin:0, changedEventIds:[], adjustedNeighborIds:[], warnings, blockedReason:'Selected events were not found after timeline update' };

    const firstIdx = indexes[0];
    const lastIdx = indexes[indexes.length - 1];
    const previous = working[firstIdx - 1] || null;
    const nextNeighbor = working[lastIdx + 1] || null;
    const blockStart = Number(working[firstIdx].startMin || 0);
    const blockEnd = Number(working[lastIdx].endMin || 0);

    let minDelta = -blockStart;
    let maxDelta = 1440 - blockEnd;
    if (previous) minDelta = Math.max(minDelta, Number(previous.startMin || 0) + 1 - blockStart);
    if (nextNeighbor) maxDelta = Math.min(maxDelta, Number(nextNeighbor.endMin || 0) - 1 - blockEnd);

    const applied = Math.max(minDelta, Math.min(maxDelta, requestedDelta));
    if (applied !== requestedDelta) {
      return {
        events:original,
        appliedDeltaMin:0,
        changedEventIds:[],
        adjustedNeighborIds:[],
        warnings:[{ code:'shift_blocked', text:'Not enough room to move every selected event by the full amount' }],
        blockedReason:'Not enough room to move every selected event by the full amount',
        mode:'selected_groups_blocked',
      };
    }

    const shiftedStart = blockStart + applied;
    const shiftedEnd = blockEnd + applied;
    working = working.map((event, index) => {
      if (index >= firstIdx && index <= lastIdx && groupIds.includes(event.id)) {
        changedEventIds.push(event.id);
        return {
          ...event,
          startMin:Number(event.startMin || 0) + applied,
          endMin:Number(event.endMin || 0) + applied,
          shiftedAt:Date.now(),
          shiftedByMin:applied,
          shiftedSource:'manual_multi_event_shift',
        };
      }
      if (previous && index === firstIdx - 1) {
        adjustedNeighborIds.push(event.id);
        return { ...event, endMin:shiftedStart, adjustedForShift:true };
      }
      if (nextNeighbor && index === lastIdx + 1) {
        adjustedNeighborIds.push(event.id);
        return { ...event, startMin:shiftedEnd, adjustedForShift:true };
      }
      return { ...event };
    });
    working = sortEvents(working);
  }

  const validationWarnings = validateShiftedTimeline(working);
  const hard = validationWarnings.find(item => item.code === 'overlap' || item.code === 'zero_event' || item.code === 'outside_day');
  if (hard) return { events:original, appliedDeltaMin:0, changedEventIds:[], adjustedNeighborIds:[], warnings:validationWarnings, blockedReason:hard.text };

  return {
    events:working,
    appliedDeltaMin:requestedDelta,
    changedEventIds:[...new Set(changedEventIds)],
    adjustedNeighborIds:[...new Set(adjustedNeighborIds)],
    warnings:validationWarnings.filter(item => item.code === 'gap'),
    blockedReason:'',
    mode:groups.length > 1 ? 'disjoint_selected_groups' : 'selected_block',
  };
}

export function previewInsertOverride`;

if (!timeline.includes("mode:groups.length > 1 ? 'disjoint_selected_groups' : 'selected_block'")) {
  const pattern = /export function shiftSelectedEventsForDay\([\s\S]*?\n}\n\nexport function previewInsertOverride/;
  if (!pattern.test(timeline)) throw new Error('v97.0 patch failed: shift function not found');
  timeline = timeline.replace(pattern, replacement);
}

write(timelinePath, timeline);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v97.0-disjoint-event-shift',
  releasedAt:'2026-07-12T22:10:00.000Z',
  notes:[
    'Lets any selected duty events move together, including separated selections.',
    'Moves every selected group by the full requested amount or rolls the entire change back.',
    'Adjusts neighboring event boundaries so the 24-hour timeline remains continuous.',
    'Preserves durations, recertification, HOS recalculation, and undo behavior.'
  ],
  label:'v97.0 Reliable Multi-event Move',
  updatedAt:'2026-07-12T22:10:00.000Z'
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

if (!timeline.includes("manual_multi_event_shift")) throw new Error('v97.0 verification failed');
console.log('v97.0 reliable multi-event move materialized');

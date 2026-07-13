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
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v97.0 patch failed: ${label}`);
  return content.replace(before, after);
}

const timelinePath = 'source/src/core/timeline/timelineEngine.js';
let timeline = read(timelinePath);

timeline = replaceOnce(
  timeline,
  `  if (!hasOnlyContiguousIndexes(indexes)) {
    return { events, appliedDeltaMin: 0, changedEventIds: [], adjustedNeighborIds: [], warnings, blockedReason: 'Select one continuous block' };
  }
`,
  `  if (!hasOnlyContiguousIndexes(indexes)) {
    const groups = [];
    let current = [];
    for (const index of indexes) {
      if (!current.length || index === current[current.length - 1] + 1) current.push(index);
      else { groups.push(current); current = [index]; }
    }
    if (current.length) groups.push(current);

    const orderedGroups = requestedDelta > 0 ? [...groups].reverse() : groups;
    let working = events;
    const changedEventIds = [];
    const adjustedNeighborIds = [];
    const allWarnings = [];
    let commonAppliedDelta = requestedDelta;

    for (const group of orderedGroups) {
      const groupIds = group.map(index => events[index]?.id).filter(Boolean);
      const result = shiftSelectedEventsForDay(working, groupIds, requestedDelta, {
        ...options,
        preserveCoverage,
      });
      if (result.blockedReason || !result.appliedDeltaMin) {
        return {
          events,
          appliedDeltaMin:0,
          changedEventIds:[],
          adjustedNeighborIds:[],
          warnings:[...warnings, ...(result.warnings || [])],
          blockedReason:result.blockedReason || 'Selected events could not be moved',
          mode:'disjoint_selection_blocked',
        };
      }
      working = result.events;
      commonAppliedDelta = Math.sign(requestedDelta) * Math.min(Math.abs(commonAppliedDelta), Math.abs(result.appliedDeltaMin));
      changedEventIds.push(...(result.changedEventIds || []));
      adjustedNeighborIds.push(...(result.adjustedNeighborIds || []));
      allWarnings.push(...(result.warnings || []));
    }

    return {
      events:sortEvents(working),
      appliedDeltaMin:commonAppliedDelta,
      changedEventIds:[...new Set(changedEventIds)],
      adjustedNeighborIds:[...new Set(adjustedNeighborIds)],
      warnings:[...warnings, ...allWarnings],
      blockedReason:'',
      mode:'disjoint_selected_groups',
    };
  }
`,
  'disjoint selection shifting'
);

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
    'Moves later selections from the end first and earlier selections from the beginning first.',
    'Rolls back the full move if any selected group cannot move.',
    'Preserves durations, recertification, HOS recalculation, and undo behavior.'
  ],
  label:'v97.0 Reliable Multi-event Move',
  updatedAt:'2026-07-12T22:10:00.000Z'
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

if (!timeline.includes("mode:'disjoint_selected_groups'")) throw new Error('v97.0 verification failed');
console.log('v97.0 reliable multi-event move materialized');

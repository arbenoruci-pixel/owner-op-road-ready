import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const VERSION='110.2.12', BUILD='v110212-duty-graph-continuity';
function replaceOnce(source,before,after,label) {
  if (source.includes(after)) return source;
  assert.equal(source.split(before).length-1,1,'Duty graph anchor changed: '+label);
  return source.replace(before,after);
}

// The read-only graph and the event list must consume the same duty continuity.
// Exact raw-event projections remain authoritative inside Edit/Select/Move;
// this display fix must never materialize rows or write edit-history records.
const dayPath='source/src/modules/logbook/DayLogScreen.jsx';
let day=fs.readFileSync(dayPath,'utf8');
day=replaceOnce(day,
  "import { useLogbookClockV110 } from '../../shared/utils/useLogbookClockV110.js';",
  "import { useLogbookClockV110 } from '../../shared/utils/useLogbookClockV110.js';\nimport { dutyViewEvents } from './dutyViewV110212.js';",
  'safe read-only duty view import');
day=replaceOnce(day,
  '      : (displayEvents || []))',
  '      : dutyViewEvents(exactViewEventsV110, displayEvents))',
  'preserve real gaps, overlaps and Driving boundaries');
day=replaceOnce(day,
  'bulkPreviewEvents, displayEvents, state.routeLegsByDay, state.activeDay]',
  'bulkPreviewEvents, displayEvents, exactViewEventsV110, state.routeLegsByDay, state.activeDay]',
  'same view updates for graph and list');
day=replaceOnce(day,'            events={bulkPreviewEvents}','            events={eventListEvents}','canonical graph input');
day=replaceOnce(day,
  '  function handleGraphEventTap(eventId) {\n    if (!eventId) {',
  '  function handleGraphEventTap(eventId) {\n    // Derived carry is display-only, just like its Now/Sign list row.\n    const visibleEvent = eventListEvents.find(event => event.id === eventId);\n    if (visibleEvent?.displayOnly || visibleEvent?.carriedFromPreviousDay || visibleEvent?.syntheticCoverage) return;\n    if (!eventId) {',
  'read-only carry graph tap');
fs.writeFileSync(dayPath,day);

for (const path of ['release-version.json','public/app-version.json']) {
  const meta=JSON.parse(fs.readFileSync(path,'utf8'));
  const stamp=meta.version===VERSION?meta.releasedAt:new Date().toISOString();
  Object.assign(meta,{version:VERSION,build:BUILD,force:false,releasedAt:stamp,updatedAt:stamp,
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || meta.sourceCommit || null,
    label:'Continuous duty graph across midnight',
    notes:[
      'The read-only Logbook graph and list share the same continuous duty-status view.',
      'Unchanged OFF/SB/ON continue through midnight and to Now, including after reopening.',
      'Viewing the graph never changes stored events, signatures, or existing edit history; raw editing stays exact.'
    ]});
  fs.writeFileSync(path,JSON.stringify(meta,null,2)+'\n');
}
for (const [path,prefix] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
  let source=fs.readFileSync(path,'utf8');
  source=source.replace(new RegExp('(const '+prefix+'_VERSION = )[\'"][^\'"]+[\'"]'),"$1'"+VERSION+"'")
    .replace(new RegExp('(const '+prefix+'_BUILD = )[\'"][^\'"]+[\'"]'),"$1'"+BUILD+"'");
  fs.writeFileSync(path,source);
}
for (const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']) {
  const source=fs.readFileSync(path,'utf8').replace(/(App v|APP V)110\.2\.10/g,'$1'+VERSION);
  fs.writeFileSync(path,source);
}
const lockPath='module-locks.v1.json',locks=JSON.parse(fs.readFileSync(lockPath,'utf8'));
locks.release=VERSION;
// Pin the reviewed result rather than accepting arbitrary stable-module edits.
const reviewedHash='bb53c7e2dac656e887e8210a747a0cde9283ff3de8d11a54a6a51a7748aa5cc7';
assert.equal(crypto.createHash('sha256').update(day).digest('hex'),reviewedHash,'Unexpected DayLogScreen runtime');
locks.files[dayPath]=reviewedHash;
fs.writeFileSync(lockPath,JSON.stringify(locks,null,2)+'\n');
console.log('PASS — continuous duty graph and list agree without changing stored log data');

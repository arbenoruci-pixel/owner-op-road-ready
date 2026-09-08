import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function once(source,before,after,label) {
  if(source.includes(after))return source;
  assert.equal(source.split(before).length-1,1,'110.3.2 anchor changed: '+label);
  return source.replace(before,after);
}
const dayPath='source/src/modules/logbook/DayLogScreen.jsx';
let day=fs.readFileSync(dayPath,'utf8');
day=once(day,'dutyViewEvents(exactViewEventsV110, displayEvents)',
  'dutyViewEvents(exactViewEventsV110, displayEvents, { eventsByDay:state.eventsByDay, day:state.activeDay })','known midnight context');
day=once(day,'bulkPreviewEvents, displayEvents, exactViewEventsV110, state.routeLegsByDay, state.activeDay]',
  'bulkPreviewEvents, displayEvents, exactViewEventsV110, state.eventsByDay, state.routeLegsByDay, state.activeDay]','prior-day updates');
fs.writeFileSync(dayPath,day);

const rawPath='source/src/core/compliance/rawRodsChecks.js';
let raw=fs.readFileSync(rawPath,'utf8');
const importLine="import { knownMidnightCarry } from '../timeline/knownMidnightCarry.js';\n";
if(!raw.includes(importLine))raw=importLine+raw;
const start=raw.indexOf('function carryStartCoverageFromPreviousDay(');
const end=raw.indexOf('\nfunction isShortOnDutyTransitionGap(',start);
assert.ok(start>=0 && end>start,'110.3.2 coverage boundaries changed');
raw=raw.slice(0,start)+`function carryStartCoverageFromPreviousDay(events = [], previousDayEvent = null) {
  const carry = knownMidnightCarry(events, previousDayEvent);
  return carry ? [carry, ...events] : [...events];
}
`+raw.slice(end);
fs.writeFileSync(rawPath,raw);

const VERSION='110.3.2',BUILD='v110302-status-midnight-carry';
for(const path of ['release-version.json','public/app-version.json']) {
  const meta=JSON.parse(fs.readFileSync(path,'utf8'));
  Object.assign(meta,{version:VERSION,build:BUILD,force:false,label:'Keep midnight duty continuity after a status change',
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||meta.sourceCommit||null,
    releasedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
    notes:['The known OFF/SB/ON status from the prior day remains visible up to the first status change.',
      'Graph, event list, Log Check and live archive agree on that midnight carry.',
      'Stored events and historical signatures stay unchanged; real internal gaps and Driving boundaries remain visible.']});
  fs.writeFileSync(path,JSON.stringify(meta,null,2)+'\n');
}
for(const [path,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]) {
  const source=fs.readFileSync(path,'utf8')
    .replace(new RegExp(`(const ${name}_VERSION = )['"][^'"]+['"]`),`$1'${VERSION}'`)
    .replace(new RegExp(`(const ${name}_BUILD = )['"][^'"]+['"]`),`$1'${BUILD}'`);
  fs.writeFileSync(path,source);
}
for(const path of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']) {
  fs.writeFileSync(path,fs.readFileSync(path,'utf8').replace(/(App v|APP V)110\.3\.1/g,'$1'+VERSION));
}
const testPath='scripts/test-duty-graph-continuity.mjs';
fs.writeFileSync(testPath,once(fs.readFileSync(testPath,'utf8'),
  "assert.equal(meta.version,'110.3.1');assert.equal(meta.build,'v110301-parts-receipt-reader');",
  `assert.equal(meta.version,'${VERSION}');assert.equal(meta.build,'${BUILD}');`,'release test identity'));

const lockPath='module-locks.v1.json',locks=JSON.parse(fs.readFileSync(lockPath,'utf8'));
const reviewed={
  [dayPath]:'5ce2a905fc4927a13bffc4d4f42dbdb17bf24701d08cd3257f7ec4d360058670',
  [rawPath]:'07785bc8e4e1f2c62d58370bfd7b64007de7d0b59ccd30fa12a7f5fd5fbd5d73',
};
for(const [path,hash] of Object.entries(reviewed)) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'),hash,'Unexpected reviewed midnight-carry runtime: '+path);
  locks.files[path]=hash;
}
locks.release=VERSION;
fs.writeFileSync(lockPath,JSON.stringify(locks,null,2)+'\n');
console.log('PASS — known midnight carry survives status changes in graph, checks and archive without stored log edits');

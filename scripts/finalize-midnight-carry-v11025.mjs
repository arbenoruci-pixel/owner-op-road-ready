import fs from 'node:fs';
import assert from 'node:assert/strict';

// v98.8 owns the legacy display helper, so extend it only after every legacy
// materializer has completed. This keeps the real production chain reproducible.
const displayPath='source/src/core/timeline/displayTimeline.js';
let display=fs.readFileSync(displayPath,'utf8');
display=display.replace('  const today = localDayKey();','  const today = options.today || localDayKey();');
const oldEmpty=`  if (!raw.length && day === today) {
    return [emptyCurrentDayEvent(day, previous, options)];
  }`;
const newEmpty=`  if (!raw.length && day === today) {
    return [emptyCurrentDayEvent(day, previous, options)];
  }
  if (!raw.length && previous && day < today) {
    return [emptyCurrentDayEvent(day, previous, {
      ...options,
      currentStatus:previous.status,
      currentReason:previous.note || previous.description,
      currentLocation:{ city:previous.city || '', state:previous.state || '' },
      nowMinute:1440,
    })];
  }`;
if(display.includes(oldEmpty))display=display.replace(oldEmpty,newEmpty);
const oldCoverage=`    source:'display_timeline',
    displayOnly:true,
    syntheticCoverage:true,`;
const newCoverage=`    source:'display_timeline',
    displayOnly:true,
    syntheticCoverage:true,
    carriedFromPreviousDay:!!previous,
    isLive:Number(options.nowMinute ?? nowMin()) < 1440,`;
if(display.includes(oldCoverage))display=display.replace(oldCoverage,newCoverage);
assert.ok(display.includes('options.today || localDayKey()'),'home-terminal day override missing');
assert.ok(display.includes('carriedFromPreviousDay:!!previous'),'carry marker missing');
fs.writeFileSync(displayPath,display);

// The final 110.2.x Day Log already owns useLogbookClockV110. Reuse that exact
// clock instead of creating a second timer. It updates Now in home-terminal time.
const dayPath='source/src/modules/logbook/DayLogScreen.jsx';
let day=fs.readFileSync(dayPath,'utf8');
const oldBlock=`  const rawDayEvents = state.eventsByDay?.[state.activeDay] || [];
  const displayEvents = useMemo(
    () => displayEventsForDayFromState(state.eventsByDay || {}, state.activeDay, { nowMinute:liveMinuteV1036 }),
    [state.eventsByDay, state.activeDay, liveMinuteV1036]
  );`;
const newBlock=`  const rawDayEvents = state.eventsByDay?.[state.activeDay] || [];
  const displayEvents = useMemo(
    () => displayEventsForDayFromState(state.eventsByDay || {}, state.activeDay, {
      today:clockV110.day,
      nowMinute:liveMinuteV1036,
      currentStatus:state.currentStatus,
      currentReason:state.currentReason,
      currentLocation:state.currentLocation,
    }),
    [state.eventsByDay, state.activeDay, state.currentStatus, state.currentReason, state.currentLocation, clockV110.day, liveMinuteV1036]
  );`;
if(day.includes(oldBlock))day=day.replace(oldBlock,newBlock);
assert.ok(day.includes('today:clockV110.day'),'Day Log exact home-terminal day carry wiring missing');
assert.ok(day.includes('currentStatus:state.currentStatus'),'current-status carry wiring missing');

// Carry-over rows are visual continuity, not editable raw events.
const oldList=`  const eventListEvents = useMemo(
    () => (bulkPreviewEvents || []).map(event => enrichLoadEventFromLinkedRoute(state, state.activeDay, event)),`;
const newList=`  const eventListEvents = useMemo(
    () => (bulkPreviewEvents || []).filter(event => !event.displayOnly && !event.carriedFromPreviousDay).map(event => enrichLoadEventFromLinkedRoute(state, state.activeDay, event)),`;
if(day.includes(oldList))day=day.replace(oldList,newList);
assert.ok(day.includes('!event.carriedFromPreviousDay'),'carry-over edit-list guard missing');
fs.writeFileSync(dayPath,day);

const VERSION='110.2.5',BUILD='v110205-midnight-status-carry';
for(const p of ['release-version.json','public/app-version.json']){
  const meta=JSON.parse(fs.readFileSync(p,'utf8'));
  Object.assign(meta,{version:VERSION,build:BUILD,force:false,sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null,label:'Midnight duty-status carry',notes:['The prior duty status carries across midnight into an otherwise empty new log day.','Current-day carry advances in the selected home-terminal timezone.','Carry coverage is display-only and cannot mutate or reopen the prior signed day.']});
  fs.writeFileSync(p,JSON.stringify(meta,null,2)+'\n');
}
for(const [p,name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'],['public/sw.js','OWNER_OP_SW']]){
  let source=fs.readFileSync(p,'utf8');
  source=source.replace(new RegExp(`(const ${name}_VERSION = )['\"][^'\"]+['\"]`),`$1'${VERSION}'`).replace(new RegExp(`(const ${name}_BUILD = )['\"][^'\"]+['\"]`),`$1'${BUILD}'`);
  fs.writeFileSync(p,source);
}
for(const p of ['source/src/modules/home/HomeScreen.jsx','source/src/shared/ui/ToolsSheet.jsx']){
  let source=fs.readFileSync(p,'utf8');
  source=source.replace(/App v110\.2\.4/g,`App v${VERSION}`).replace(/APP V110\.2\.4/g,`APP V${VERSION}`);
  fs.writeFileSync(p,source);
}
console.log('PASS — 110.2.5 midnight duty-status carry finalized through existing home-terminal clock');

import fs from 'node:fs';
import assert from 'node:assert/strict';

const dayPath='source/src/modules/logbook/DayLogScreen.jsx';
let day=fs.readFileSync(dayPath,'utf8');
day=day.replace(
  "import { homeTerminalConfigFromState } from '../../core/time/homeTerminalTime.js';",
  "import { homeTerminalConfigFromState, homeTerminalDayKey, homeTerminalMinute } from '../../core/time/homeTerminalTime.js';"
);
const oldBlock=`  const rawDayEvents = state.eventsByDay?.[state.activeDay] || [];
  const displayEvents = useMemo(
    () => displayEventsForDayFromState(state.eventsByDay || {}, state.activeDay),
    [state.eventsByDay, state.activeDay]
  );`;
const newBlock=`  const [timelineNowV11025, setTimelineNowV11025] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setTimelineNowV11025(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const timelineZoneV11025 = homeTerminalConfigFromState(state).timeZone;
  const timelineDateV11025 = new Date(timelineNowV11025);
  const timelineTodayV11025 = homeTerminalDayKey(timelineDateV11025, timelineZoneV11025);
  const timelineMinuteV11025 = homeTerminalMinute(timelineDateV11025, timelineZoneV11025);
  const rawDayEvents = state.eventsByDay?.[state.activeDay] || [];
  const displayEvents = useMemo(
    () => displayEventsForDayFromState(state.eventsByDay || {}, state.activeDay, {
      today: timelineTodayV11025,
      nowMinute: timelineMinuteV11025,
    }),
    [state.eventsByDay, state.activeDay, timelineTodayV11025, timelineMinuteV11025]
  );`;
if(day.includes(oldBlock)) day=day.replace(oldBlock,newBlock);
assert.ok(day.includes('timelineMinuteV11025'),'Day Log home-terminal live clock patch missing');

// Carry-over rows are visual continuity, not editable raw events. Keep them out
// of the editable event list while the graph and Log Check see the continuity.
const oldList=`  const eventListEvents = useMemo(
    () => (bulkPreviewEvents || []).map(event => enrichLoadEventFromLinkedRoute(state, state.activeDay, event)),`;
const newList=`  const eventListEvents = useMemo(
    () => (bulkPreviewEvents || []).filter(event => !event.displayOnly && !event.carriedFromPreviousDay).map(event => enrichLoadEventFromLinkedRoute(state, state.activeDay, event)),`;
if(day.includes(oldList)) day=day.replace(oldList,newList);
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
console.log('PASS — 110.2.5 midnight duty-status carry finalized');

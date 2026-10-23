import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Applied after the legacy materializers, before the production build. All
// replacements are validated before any runtime file is written.
const prepared=new Map();
const read=file=>prepared.get(file) ?? fs.readFileSync(file,'utf8');
function patch(file,before,after) {
  const source=read(file);
  if(source.includes(after))return;
  assert.equal(source.split(before).length,2,'Rest review anchor: '+file+' / '+before.slice(0,90));
  prepared.set(file,source.replace(before,()=>after));
}

const hos='source/src/core/hos/hosEngine.js';
patch(hos,`  // Medium rest/split watches stay background-only and never paint the red line.
  const restBlocks = findRestBlocks(fullTimelineV109);
  for (const b of restBlocks) {
    const touchesSelectedDayV109 = b.events.some(event => event.startAbs < activeDayEndAbs && event.endAbs > activeDayStartAbs);
    if (!touchesSelectedDayV109) continue;
    if (b.allSleeper && b.duration >= 2 * HOUR && b.duration < 7 * HOUR) {
      for (const e of b.events) {
        if (e.status === 'SB') pushRange(eventPartOnDay(e, activeDay, e.startAbs, e.endAbs, 'split7watch', \`Sleeper under 7h. Need \${durLabel(7*HOUR-b.duration)} more.\`, 'medium'));
      }
    }
  }`, `  // A 2–7h Sleeper period can be the short split period or ordinary rest.
  // Its duration alone is not a violation. The paired-period engine below
  // still evaluates actual Driving against the 11h/14h limits.
  // REST_REVIEW_WITHOUT_BLANKET_7H_WATCH`);
patch(hos,`    if (restProgressForReviewV109.block.allSleeper && restProgressForReviewV109.duration < 7 * HOUR) {
      warnings.push({ severity:'medium', text:\`Sleeper under 7h. Need \${durLabel(7*HOUR - restProgressForReviewV109.duration)} more for split long period.\` });
    } else {
      warnings.push({ severity:'low', text:\`Rest \${durLabel(restProgressForReviewV109.duration)} / 10h full reset.\` });
    }`, `    // Progress remains informational; a pending split has its own evaluated
    // partner requirement above, rather than an assumed seven-hour minimum.
    warnings.push({ severity:'low', text:\`Rest \${durLabel(restProgressForReviewV109.duration)} / 10h full reset.\` });`);

const engine='source/src/modules/logbook/eventEditingV110.js';
patch(engine,"import { getHomeTerminalTimeZone, homeTerminalDayKey, homeTerminalMinute }", "import { historicalStatusTailV110317 } from '../../core/timeline/historicalStatusTailV110317.js';\nimport { getHomeTerminalTimeZone, homeTerminalDayKey, homeTerminalMinute }");
patch(engine,'const EDIT_FIELDS=new Set(',`// The editor opens the same proven past-day tail as the daily graph. The
// stored snapshot and projectLogbookEvents remain exact, so viewing/cancelling
// and detail-only edits never materialize this derived end.
export function projectEditorLogbookEvents(state={},day=state.activeDay,at=new Date()) {
  const clock=logbookClock(state,at);
  return historicalStatusTailV110317(projectLogbookEvents(state,day,at),!!day && day<clock.day);
}
const EDIT_FIELDS=new Set(`);
patch(engine,`  const projection=projectLogbookEvents(state,day,at);
  const live=projection.find(e=>e.isLive);
  const rows=state.eventsByDay?.[day]||[];
  return {live,rows:rows.map(e=>active(e)&&e.id===live?.id?{...e,endMin:Math.max(e.startMin+1,live.endMin)}:e)};`, `  const projection=projectEditorLogbookEvents(state,day,at);
  const live=projection.find(e=>e.isLive);
  const rows=state.eventsByDay?.[day]||[];
  const tail=projection.at(-1),rawTail=rows.find(e=>active(e)&&e.id===tail?.id);
  const historicalTail=!live && rawTail && tail.endMin>rawTail.endMin ? tail : null;
  return {live,historicalTail,rows:rows.map(e=>active(e)&&e.id===live?.id
    ? {...e,endMin:Math.max(e.startMin+1,live.endMin)}
    : active(e)&&e.id===historicalTail?.id ? {...e,endMin:historicalTail.endMin} : e)};`);
patch(engine,"  if(projected.live?.id===id&&Object.hasOwn(changes,'endMin'))after.paperLogEndV110315=true;", "  if((projected.live?.id===id||projected.historicalTail?.id===id)&&Object.hasOwn(changes,'endMin'))after.paperLogEndV110315=true;");
const api='source/src/modules/logbook/public-api.js';
const exported="export {projectEditorLogbookEvents} from './eventEditingV110.js';";
if(!read(api).includes(exported))prepared.set(api,read(api)+'\n'+exported+'\n');
const editor='source/src/modules/editor/EditEventSheet.jsx';
const source=read(editor);
assert.ok(source.includes('projectLogbookEvents')||source.includes('projectEditorLogbookEvents'),'Editor projection import');
prepared.set(editor,source.replaceAll('projectLogbookEvents','projectEditorLogbookEvents'));

for(const [file,source] of prepared)fs.writeFileSync(file,source);
// Explicit revision of the HOS implementation and public Logbook API. Other
// stable-module hashes retain their independently reviewed values.
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));
for(const file of [hos,api])locks.files[file]=createHash('sha256').update(read(file)).digest('hex');
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — contextual rest review and consistent historical editor intervals installed');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { displayEventsForDayFromState } from '../source/src/core/timeline/displayTimeline.js';

const previous={id:'sep6-off',status:'OFF',startMin:1364,endMin:1440,city:'Willowbrook',state:'IL',note:'Off Duty',source:'manual'};
const eventsByDay={'2026-09-06':[previous],'2026-09-07':[]};
const before=structuredClone(eventsByDay);
const today=displayEventsForDayFromState(eventsByDay,'2026-09-07',{today:'2026-09-07',nowMinute:1015});
assert.equal(today.length,1);assert.equal(today[0].status,'OFF');assert.equal(today[0].startMin,0);assert.equal(today[0].endMin,1015);assert.equal(today[0].city,'Willowbrook');assert.equal(today[0].state,'IL');assert.equal(today[0].displayOnly,true);assert.equal(today[0].carriedFromPreviousDay,true);assert.equal(today[0].isLive,true);assert.deepEqual(eventsByDay,before);
console.log('PASS — Sep 6 OFF carries from midnight through Sep 7 Now without a raw write');

for(const status of ['OFF','SB','ON']){
 const prior={id:'prior-'+status,status,startMin:1200,endMin:1440,city:'X',state:'IL',source:'manual'};
 const rows=displayEventsForDayFromState({'2026-09-06':[prior]},'2026-09-07',{today:'2026-09-07',nowMinute:300});
 assert.deepEqual(rows.map(r=>[r.status,r.startMin,r.endMin]),[[status,0,300]]);
}
console.log('PASS — OFF/SB/ON each remain in effect across midnight');

const historical=displayEventsForDayFromState({'2026-09-05':[previous]},'2026-09-06',{today:'2026-09-07',nowMinute:300});
assert.equal(historical[0].startMin,0);assert.equal(historical[0].endMin,1440);assert.equal(historical[0].isLive,false);
console.log('PASS — an empty historical day carries the prior status through 24:00');

const firstOn={id:'first-on',status:'ON',startMin:600,endMin:660,city:'Joliet',state:'IL',source:'manual'};
const bridged=displayEventsForDayFromState({'2026-09-06':[previous],'2026-09-07':[firstOn]},'2026-09-07',{today:'2026-09-07',nowMinute:700});
assert.equal(bridged[0].status,'OFF');assert.equal(bridged[0].startMin,0);assert.equal(bridged[0].endMin,600);assert.equal(bridged[1].status,'ON');assert.equal(bridged[1].startMin,600);assert.equal(bridged[1].endMin,700);
console.log('PASS — carry closes exactly when the first new-day status begins');

const driving=displayEventsForDayFromState({'2026-09-06':[{...previous,id:'drive',status:'D'}]},'2026-09-07',{today:'2026-09-07',nowMinute:300});
assert.equal(driving[0].status,'OFF');
console.log('PASS — a bare historical D row cannot invent next-day Driving without its active session');

const finalizer=fs.readFileSync('scripts/finalize-midnight-carry-v11025.mjs','utf8');
assert.match(finalizer,/homeTerminalDayKey/);assert.match(finalizer,/homeTerminalMinute/);assert.match(finalizer,/setInterval\(\(\) => setTimelineNowV11025\(Date\.now\(\)\), 15000\)/);assert.match(finalizer,/!event\.carriedFromPreviousDay/);
console.log('PASS — Day Log refreshes carry in home-terminal time and keeps it non-editable');

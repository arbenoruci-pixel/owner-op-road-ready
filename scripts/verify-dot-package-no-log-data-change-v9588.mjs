import fs from 'node:fs';
const dot = fs.readFileSync('source/src/modules/dot/DotMode.jsx','utf8');
function ok(cond,msg){ if(!cond){ console.error('FAIL:',msg); process.exit(1);} console.log('OK:',msg); }
ok(!dot.includes('startMin =') && !dot.includes('endMin ='), 'DotMode does not assign event start/end mins');
ok(!dot.includes('eventsByDay[') || !dot.includes('splice('), 'DotMode does not splice eventsByDay');
ok(dot.includes('reportEventsForDay(state, day)'), 'PDF reads display events only');

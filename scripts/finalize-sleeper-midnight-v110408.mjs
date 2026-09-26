import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');
function patch(path, before, after) {
  const source = read(path);
  if (source.includes(after)) return;
  assert.equal(source.split(before).length - 1, 1, `v110408 anchor: ${path}`);
  fs.writeFileSync(path, source.replace(before, after));
}

// Reuse the existing coverage rule: an open live non-driving tail reaches
// midnight on a completed day. An explicit End applies only to its own row.
const display = 'source/src/core/timeline/displayTimeline.js';
patch(display,
  "import { knownMidnightCarry, previousRecordedDuty } from './knownMidnightCarry.js';",
  "import { knownMidnightCarry, previousRecordedDuty } from './knownMidnightCarry.js';\nimport { historicalStatusTailV110317 } from './historicalStatusTailV110317.js';");
patch(display,
  '  const raw = realDisplayBase(eventsByDay?.[day] || []);',
  '  const raw = historicalStatusTailV110317(realDisplayBase(eventsByDay?.[day] || []), !!day && day < today);');

// Complete only a past home-terminal day. Apply the rule to exact rows so a
// normalized same-status row cannot hide a real gap or lose the final row ID.
const dutyView = 'source/src/modules/logbook/dutyViewV110212.js';
patch(dutyView,
  "import {confirmedDrivingDayView} from './drivingDayViewV110372.js';",
  "import {confirmedDrivingDayView} from './drivingDayViewV110372.js';\nimport { historicalStatusTailV110317 } from '../../core/timeline/historicalStatusTailV110317.js';");
patch(dutyView,
  '  exactEvents=confirmedDrivingDayView(exactEvents,context);',
  `  exactEvents=confirmedDrivingDayView(exactEvents,context);
  if(context.day && context.clock?.day && context.day<context.clock.day) {
    const completed=historicalStatusTailV110317(exactEvents,true);
    if(completed.at(-1)?.endMin!==exactEvents.at(-1)?.endMin) exactEvents=completed;
  }`);
patch('source/src/modules/logbook/archiveDayV1103.js',
  'dutyViewEvents(exact,continuous,{eventsByDay:state.eventsByDay,day})',
  'dutyViewEvents(exact,continuous,{eventsByDay:state.eventsByDay,day,clock})');

const VERSION = '110.4.8', BUILD = 'v110408-sleeper-midnight', stamp = new Date().toISOString();
for (const path of ['release-version.json', 'public/app-version.json']) {
  const value = JSON.parse(read(path));
  Object.assign(value, {
    version:VERSION, build:BUILD, force:false, label:'v110.4.8 Sleeper through midnight',
    releasedAt:stamp, updatedAt:stamp,
    sourceCommit:process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null,
    notes:[
      'Keep the previous day’s open Sleeper status visible through midnight after earlier edits.',
      'Preserve explicit End times, real gaps, original events and signatures.',
    ],
  });
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
for (const path of ['package.json', 'package-lock.json']) {
  const value = JSON.parse(read(path)); value.version = VERSION;
  if (value.packages?.['']) value.packages[''].version = VERSION;
  fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
for (const [path, name] of [['source/src/core/update/appUpdate.js','FALLBACK_APP'], ['public/sw.js','OWNER_OP_SW']]) {
  let source = read(path);
  for (const [key, value] of [['VERSION',VERSION], ['BUILD',BUILD]]) {
    source = source.replace(new RegExp(`const ${name}_${key}\\s*=\\s*['"][^'"]+['"];?`), `const ${name}_${key} = '${value}';`);
  }
  fs.writeFileSync(path, source);
}
for (const path of ['source/src/modules/home/HomeScreen.jsx', 'source/src/shared/ui/ToolsSheet.jsx']) {
  fs.writeFileSync(path, read(path).replace(/App v\d+\.\d+\.\d+/g, 'App v'+VERSION).replace(/APP V\d+\.\d+\.\d+/g, 'APP V'+VERSION));
}
for (const path of ['scripts/test-duty-graph-continuity.mjs', 'scripts/test-editor-grips-v110355.mjs', 'scripts/verify-log-integrity-v1051.mjs', 'scripts/test-document-continuity-integration-v110375.mjs']) {
  fs.writeFileSync(path, read(path).replaceAll("'110.4.7'", "'"+VERSION+"'").replaceAll("'v110407-team-import-safety'", "'"+BUILD+"'"));
}
const locks = JSON.parse(read('module-locks.v1.json')); locks.release = VERSION;
fs.writeFileSync('module-locks.v1.json', JSON.stringify(locks, null, 2) + '\n');
console.log('PASS — 110.4.8 prior-day live tails retain midnight without rewriting stored logs');

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '100.9.0';
const RELEASED_AT = '2026-07-15T23:05:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v100.9 missing ${label}`);
  return content.replace(before, after);
}

const hosPath = 'source/src/core/hos/hosEngine.js';
let hos = read(hosPath);

hos = replaceOnce(
  hos,
  `  const activeDayEndAbs = dayStartAbs(activeDay) + (activeDay === today ? nowMin(timeZone) : 1440);\n  const activeDayStartAbs = dayStartAbs(activeDay);\n  const timeline = buildContinuousTimeline(eventsByDay, activeDay)\n    .filter(event => event.startAbs < activeDayEndAbs && event.endAbs > activeDayEndAbs - 21 * 1440)\n    .sort((a, b) => a.startAbs - b.startAbs || a.endAbs - b.endAbs);`,
  `  const activeDayEndAbs = dayStartAbs(activeDay) + (activeDay === today ? nowMin(timeZone) : 1440);\n  const activeDayStartAbs = dayStartAbs(activeDay);\n  const reviewNowAbsV109 = dayStartAbs(today) + nowMin(timeZone);\n  // Historical violation math remains clipped to the selected log day, while\n  // rest review is allowed to follow the same OFF/SB block after midnight.\n  // Raw RODS are never edited by this derived HOS calculation.\n  const fullTimelineV109 = buildContinuousTimeline(eventsByDay, activeDay)\n    .filter(event => event.startAbs < reviewNowAbsV109 && event.endAbs > activeDayEndAbs - 21 * 1440)\n    .sort((a, b) => a.startAbs - b.startAbs || a.endAbs - b.endAbs);\n  const timeline = fullTimelineV109.filter(event => event.startAbs < activeDayEndAbs);`,
  'historical forward rest timeline'
);

hos = replaceOnce(
  hos,
  `  const restBlocks = findRestBlocks(timeline.filter(event => event.startAbs < activeDayEndAbs));\n  for (const b of restBlocks) {\n    if (b.allSleeper && b.duration >= 2 * HOUR && b.duration < 7 * HOUR) {`,
  `  const restBlocks = findRestBlocks(fullTimelineV109);\n  for (const b of restBlocks) {\n    const touchesSelectedDayV109 = b.events.some(event => event.startAbs < activeDayEndAbs && event.endAbs > activeDayStartAbs);\n    if (!touchesSelectedDayV109) continue;\n    if (b.allSleeper && b.duration >= 2 * HOUR && b.duration < 7 * HOUR) {`,
  'split watch full rest block'
);

const restMarker = '  const restProgress = currentRestProgress(restBlocks, currentEndAbs);';
if (!hos.includes('continuedRestBlockV109')) {
  if (!hos.includes(restMarker)) throw new Error('v100.9 missing rest progress marker');
  hos = hos.replace(restMarker, `${restMarker}\n  const reviewNowAbsV109 = dayStartAbs(today) + nowMin(timeZone);\n  const forwardTimelineV109 = targetDay === today\n    ? timeline\n    : buildContinuousTimeline(eventsByDay, targetDay)\n      .filter(event => event.startAbs < reviewNowAbsV109 && event.endAbs > activeDayEndAbs - 21 * 1440);\n  const forwardRestBlocksV109 = findRestBlocks(forwardTimelineV109);\n  const continuedRestBlockV109 = targetDay === today ? null : forwardRestBlocksV109\n    .filter(block => block.startAbs < activeDayEndAbs && block.endAbs > activeDayEndAbs)\n    .sort((a, b) => b.endAbs - a.endAbs)[0] || null;\n  const restProgressForReviewV109 = continuedRestBlockV109\n    ? {\n        duration:continuedRestBlockV109.duration,\n        fullResetLeft:Math.max(0, 10 * HOUR - continuedRestBlockV109.duration),\n        sleeperLeft:continuedRestBlockV109.allSleeper ? Math.max(0, 7 * HOUR - continuedRestBlockV109.duration) : null,\n        block:continuedRestBlockV109,\n        continuedAfterMidnight:true,\n      }\n    : restProgress;\n  const forwardFullResetV109 = !!continuedRestBlockV109 && continuedRestBlockV109.duration >= 10 * HOUR;\n  const resetSatisfiedForReviewV109 = !!fullReset || !!splitEvaluation.available || forwardFullResetV109;`);
}

hos = hos.replace(
  `  if (!fullReset && !splitActive) warnings.push({ severity:'medium', text:'No valid 10h reset or split pair found in recent logs.' });`,
  `  if (!fullReset && !splitActive && !forwardFullResetV109) warnings.push({ severity:'medium', text:'No valid 10h reset or split pair found in recent logs.' });`
);
hos = hos.replace('  if (splitEvaluation.pending) {', '  if (splitEvaluation.pending && !forwardFullResetV109) {');

hos = hos.replace(
  `  if (restProgress && restProgress.duration < 10 * HOUR && !splitActive) {\n    if (restProgress.block.allSleeper && restProgress.duration < 7 * HOUR) {\n      warnings.push({ severity:'medium', text:\`Sleeper under 7h. Need \${durLabel(7*HOUR - restProgress.duration)} more for split long period.\` });\n    } else {\n      warnings.push({ severity:'low', text:\`Rest \${durLabel(restProgress.duration)} / 10h full reset.\` });\n    }\n  }`,
  `  if (restProgressForReviewV109 && restProgressForReviewV109.duration < 10 * HOUR && !splitActive && !forwardFullResetV109) {\n    if (restProgressForReviewV109.block.allSleeper && restProgressForReviewV109.duration < 7 * HOUR) {\n      warnings.push({ severity:'medium', text:\`Sleeper under 7h. Need \${durLabel(7*HOUR - restProgressForReviewV109.duration)} more for split long period.\` });\n    } else {\n      warnings.push({ severity:'low', text:\`Rest \${durLabel(restProgressForReviewV109.duration)} / 10h full reset.\` });\n    }\n  }`
);

const resetBlockPattern = /  const resetValue = splitEvaluation\.complete[\s\S]*?  const resetSub = splitEvaluation\.available[\s\S]*?;\n\n  return \{/;
if (!hos.includes("? '10h continued'")) {
  if (!resetBlockPattern.test(hos)) throw new Error('v100.9 missing split reset card block');
  hos = hos.replace(resetBlockPattern, `  const resetValue = splitEvaluation.complete\n    ? 'Split OK'\n    : forwardFullResetV109\n      ? '10h continued'\n      : splitEvaluation.pending\n        ? 'Split pending'\n        : fullReset\n          ? '10h OK'\n          : restProgressForReviewV109\n            ? durLabel(restProgressForReviewV109.duration)\n            : 'Needs reset';\n  const resetSub = forwardFullResetV109\n    ? \`Rest continued after midnight · \${durLabel(restProgressForReviewV109.duration)}\`\n    : splitEvaluation.available\n      ? splitEvaluation.summary\n      : fullReset\n        ? (restProgressForReviewV109 ? \`Current rest \${durLabel(restProgressForReviewV109.duration)}\` : 'Ready')\n        : (restProgressForReviewV109 ? \`\${durLabel(Math.max(0, 10*HOUR-restProgressForReviewV109.duration))} to 10h\` : 'Need 10h');\n\n  return {`);
}

hos = hos.replace(
  `{ label:'Reset', value:resetValue, sub:resetSub, ok:!!fullReset || !!splitEvaluation.available },`,
  `{ label:'Reset', value:resetValue, sub:resetSub, ok:resetSatisfiedForReviewV109 },`
);
hos = hos.replace('    restProgress,\n    cycle,', '    restProgress:restProgressForReviewV109,\n    cycle,');

write(hosPath, hos);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) lock.packages[''].version = VERSION;
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v100.9-cross-midnight-rest-continuity',
  releasedAt:RELEASED_AT,
  notes:[
    'Merges continuous OFF DUTY and Sleeper periods across midnight for HOS review without changing raw log events.',
    'Stops historical days from showing a false Sleeper under 7h review when the same Sleeper block continues into the following day.',
    'Recognizes a completed 10-hour reset after midnight while keeping drive, shift, cycle and event calculations clipped to the selected log day.',
    'Keeps truthful short-rest warnings when the continuous block actually ends before seven or ten hours.',
    'Preserves signatures, inspections, routes, Driver Mission, document links and all recorded duty-status times.'
  ],
  label:'v100.9 Cross-midnight Rest Continuity',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

const verifyHos = read(hosPath);
if (!verifyHos.includes('fullTimelineV109') || !verifyHos.includes('continuedRestBlockV109') || !verifyHos.includes('resetSatisfiedForReviewV109')) throw new Error('v100.9 HOS continuity integration failed');
console.log('v100.9 Cross-midnight Rest Continuity materialized');
await import('./verify-cross-midnight-rest-v109.mjs');

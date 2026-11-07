import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const hos='source/src/core/hos/hosEngine.js';
const helper='source/src/core/hos/splitReviewV110.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const predecessor='9642937cef8c840a1eb7a20d438dfb11ed66120ba9ebea0522101b5d67480470';
const installed='55299293caa5fc4eb0ea6b8a397c8ec27815c736e7a496332aefc8202fabc091';
const marker='SPLIT_REVIEW_FOLLOWS_OBSERVED_PARTNER';
let source=fs.readFileSync(hos,'utf8');
const locks=JSON.parse(fs.readFileSync('module-locks.v1.json','utf8'));

function patch(before,after) {
  assert.equal(source.split(before).length,2,'HOS midnight exact anchor: '+before.slice(0,100));
  source=source.replace(before,()=>after);
}

if(!source.includes(marker)) {
  assert.equal(hash(source),predecessor,'HOS midnight reviewed predecessor changed');
  assert.equal(locks.files[hos],predecessor,'HOS midnight predecessor lock changed');
  patch("import { evaluateSplitSleeper, SPLIT_DRIVE_LIMIT_MINUTES, SPLIT_SHIFT_LIMIT_MINUTES } from './splitSleeper.js';",
    "import { evaluateSplitSleeper, SPLIT_DRIVE_LIMIT_MINUTES, SPLIT_SHIFT_LIMIT_MINUTES } from './splitSleeper.js';\nimport { evaluateSplitSleeperReview, reviewSplitHosRanges } from './splitReviewV110.js';");
  const begin=source.indexOf('function splitAdjustedViolationRanges(');
  const end=source.indexOf('\nexport function violationRangesForDay(',begin);
  assert.ok(begin>=0&&end>begin,'HOS midnight range evaluator bounds');
  source=source.slice(0,begin)+`function splitAdjustedViolationRanges(ranges = [], timeline = [], activeDay = '', activeDayEndAbs = 0) {
  // ${marker}: provisional treatment depends on actual
  // rest and remaining allowance, not whether this calendar day is today.
  const timeZone = getHomeTerminalTimeZone();
  const reviewNowAbs = dayStartAbs(todayKey(timeZone)) + nowMin(timeZone);
  return reviewSplitHosRanges(ranges, timeline, {
    dayStartAbs:dayStartAbs(activeDay), dayEndAbs:activeDayEndAbs,
    nowAbs:reviewNowAbs, allowPending:true,
  }).ranges;
}
`+source.slice(end);
  patch(`  const adjustedRanges = splitAdjustedViolationRanges(
    ranges,
    timeline,
    activeDay,
    activeDayEndAbs,
    activeDay === today,
  );`, `  const adjustedRanges = splitAdjustedViolationRanges(
    ranges,
    fullTimelineV109,
    activeDay,
    activeDayEndAbs,
  );`);
  patch(`  const timeline = buildContinuousTimeline(eventsByDay, targetDay)
    .filter(event => event.startAbs < activeDayEndAbs && event.endAbs > activeDayEndAbs - 21 * 1440);`,
    `  const splitReviewNowAbsV110 = dayStartAbs(today) + nowMin(timeZone);
  const splitReviewTimelineV110 = buildContinuousTimeline(eventsByDay, targetDay)
    .filter(event => event.startAbs < splitReviewNowAbsV110 && event.endAbs > activeDayEndAbs - 21 * 1440);
  const splitReviewCutoffV110 = Math.min(activeDayEndAbs, splitReviewNowAbsV110);
  const timeline = splitReviewTimelineV110
    .map(event => ({ ...event, endAbs:Math.min(event.endAbs, splitReviewCutoffV110) }))
    .filter(event => event.startAbs < splitReviewCutoffV110 && event.endAbs > event.startAbs);`);
  patch('  const currentEndAbs = activeDayEndAbs;',
    '  const currentEndAbs = Math.min(activeDayEndAbs, splitReviewNowAbsV110);');
  patch(`  const forwardTimelineV109 = targetDay === today
    ? timeline
    : buildContinuousTimeline(eventsByDay, targetDay)
      .filter(event => event.startAbs < reviewNowAbsV109 && event.endAbs > activeDayEndAbs - 21 * 1440);`,
    `  const forwardTimelineV109 = targetDay === today
    ? timeline
    : splitReviewTimelineV110
      .map(event => ({ ...event, endAbs:Math.min(event.endAbs, splitReviewNowAbsV110) }))
      .filter(event => event.endAbs > event.startAbs);`);
  patch(`  const splitEvaluation = evaluateSplitSleeper(timeline, currentEndAbs, { allowPending:targetDay === today });`,
    `  const splitEvaluation = evaluateSplitSleeperReview(splitReviewTimelineV110, currentEndAbs, {
    observedUntilAbs:splitReviewNowAbsV110, allowPending:true,
  });`);
  patch(`  if (driveMins > 11 * HOUR) warnings.push({ severity:'high', text:'Drive clock expired.' });`,
    `  const drivingLimitRangesV110 = violationRangesForDay(eventsByDay, activeDay).filter(range => range.type === 'drive11');
  if (drivingLimitRangesV110.length) warnings.push({ severity:'high', text:'Drive clock expired.' });`);
  patch(`      { label:'11h Drive', value:\`\${durLabel(driveMins)} used\`, sub:\`\${durLabel(Math.max(0, 11*HOUR-driveMins))} left\`, ok:driveMins <= 11*HOUR },`,
    `      { label:'11h Drive', value:\`\${durLabel(driveMins)} used\`, sub:\`\${durLabel(Math.max(0, 11*HOUR-driveMins))} left\`, ok:drivingLimitRangesV110.length === 0 },`);
  patch(`  const rawSplit = evaluateSplitSleeper(timeline, nowAbs, {
    allowPending: options.allowPendingSplitSleeper !== false,
  });`, `  const rawSplit = evaluateSplitSleeperReview(timeline, nowAbs, {
    allowPending: options.allowPendingSplitSleeper !== false,
  });`);
} else {
  assert.equal(hash(source),installed,'Previously installed HOS midnight source changed');
  assert.equal(locks.files[hos],installed,'Previously installed HOS midnight lock changed');
}
assert.equal(hash(source),installed,'Reviewed HOS midnight transformation changed');

// Only the reviewed HOS module is re-registered. No duty, DOT, graph, editor,
// signature or other module lock is changed by this installer.
const implementation=fs.readFileSync(new URL('./core.js',import.meta.url),'utf8');
fs.mkdirSync('source/src/core/hos',{recursive:true});
fs.writeFileSync(helper,implementation);
fs.writeFileSync(hos,source);
locks.files[hos]=hash(source);
fs.writeFileSync('module-locks.v1.json',JSON.stringify(locks,null,2)+'\n');
console.log('PASS — HOS review follows observed split partners across calendar days');

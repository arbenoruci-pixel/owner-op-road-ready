import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '103.7.0';
const RELEASED_AT = '2026-07-16T21:45:00.000Z';
const file = relative => path.join(ROOT, relative);
const read = relative => fs.readFileSync(file(relative), 'utf8');
function write(relative, content) {
  const target = file(relative);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.writeFileSync(target, content);
}
function replaceOnce(content, before, after, label) {
  if (content.includes(after)) return content;
  if (!content.includes(before)) throw new Error(`v103.7 missing ${label}`);
  return content.replace(before, after);
}
function replacePattern(content, pattern, replacement, label, marker = '') {
  if (marker && content.includes(marker)) return content;
  if (!pattern.test(content)) {
    if (/14h|warning|card/i.test(label)) {
      const lines = content.split('\n');
      const interesting = lines
        .map((line, index) => ({ index:index + 1, line }))
        .filter(item => /analyzeLinkedHos|Shift clock|14h Window|limit14|windowUsed|shift\.expired|buildClockWarnings/.test(item.line));
      console.log(`v103.7 ${label} diagnostic\n${interesting.map(item => `${item.index}: ${item.line}`).join('\n')}`);
    }
    throw new Error(`v103.7 missing ${label}`);
  }
  return content.replace(pattern, replacement);
}

const hosPath = 'source/src/core/hos/hosEngine.js';
let hos = read(hosPath);
hos = replacePattern(
  hos,
  /export function analyzeLinkedHos\(eventsByDay = \{\}, activeDay, certifyStatus = \{\}\) \{/,
  `function drivingAfterLimitMinutesV1037(events = [], limitAbs = null, currentEndAbs = Infinity) {\n  if (limitAbs == null || !Number.isFinite(Number(limitAbs))) return 0;\n  return (events || [])\n    .filter(event => event?.status === 'D')\n    .reduce((sum, event) => {\n      const start = Math.max(Number(event.startAbs || 0), Number(limitAbs || 0));\n      const end = Math.min(Number(event.endAbs || 0), Number(currentEndAbs || 0));\n      return sum + Math.max(0, end - start);\n    }, 0);\n}\n\nexport function analyzeLinkedHos(eventsByDay = {}, activeDay, certifyStatus = {}) {`,
  '14h helper',
  'function drivingAfterLimitMinutesV1037('
);
hos = replacePattern(
  hos,
  /\s*if \(limit14 != null && currentEndAbs > limit14\) warnings\.push\(\{ severity:'high', text:`Shift clock expired at \$\{shortTime\(limit14\)\}\.` \}\);/,
  `\n  const drivingAfter14V1037 = drivingAfterLimitMinutesV1037(afterReset, limit14, currentEndAbs);\n  const windowViolationV1037 = drivingAfter14V1037 > 0;\n  const windowExpiredNoViolationV1037 = limit14 != null && currentEndAbs > limit14 && !windowViolationV1037;\n  if (windowViolationV1037) warnings.push({ severity:'high', text:\`14h window violation: \${durLabel(drivingAfter14V1037)} Driving after \${shortTime(limit14)}.\` });`,
  '14h warning',
  'const drivingAfter14V1037 = drivingAfterLimitMinutesV1037(afterReset, limit14, currentEndAbs);'
);
hos = replacePattern(
  hos,
  /\{ label:'14h Window',[^\n]+\}/,
  `{ label:'14h Window', value: windowViolationV1037 ? 'Violation' : windowExpiredNoViolationV1037 ? 'Expired' : \`\${durLabel(Math.min(windowUsed, 14*HOUR))} used\`, sub: windowViolationV1037 ? \`\${durLabel(drivingAfter14V1037)} driving after limit\` : windowExpiredNoViolationV1037 ? 'No driving after limit' : \`\${durLabel(Math.max(0, 14*HOUR-windowUsed))} left\`, ok: !windowViolationV1037 }`,
  '14h card',
  `value: windowViolationV1037 ? 'Violation'`
);
write(hosPath, hos);

const appPath = 'source/src/app/App.jsx';
let app = read(appPath);
app = replaceOnce(
  app,
  `import { applyManualDrivingMidnightContinuity } from '../core/timeline/manualDrivingContinuity.js';`,
  `import { applyManualDrivingMidnightContinuity } from '../core/timeline/manualDrivingContinuity.js';\nimport { repairCrossMidnightFlagsV1037 } from '../core/hos/crossMidnightFlagV1037.js';`,
  'cross-midnight helper import'
);
app = replacePattern(
  app,
  /(  Object\.keys\(eventsByDay\)\.forEach\(day => \{\n    eventsByDay\[day\] = purgeSyntheticAndRepairEvents\([\s\S]*?\n  \}\);)/,
  `$1\n\n  const crossMidnightRepairedV1037 = repairCrossMidnightFlagsV1037(eventsByDay);\n  Object.keys(crossMidnightRepairedV1037).forEach(day => {\n    eventsByDay[day] = crossMidnightRepairedV1037[day];\n  });`,
  'cross-midnight normalization',
  'const crossMidnightRepairedV1037 = repairCrossMidnightFlagsV1037(eventsByDay);'
);
write(appPath, app);

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.engines = { ...(pkg.engines || {}), node:'24.x' };
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
const lock = JSON.parse(read('package-lock.json'));
lock.version = VERSION;
if (lock.packages?.['']) {
  lock.packages[''].version = VERSION;
  lock.packages[''].engines = { ...(lock.packages[''].engines || {}), node:'24.x' };
}
write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
write('public/app-version.json', `${JSON.stringify({
  version:VERSION,
  build:'v103.7-driving-only-14h-window',
  releasedAt:RELEASED_AT,
  notes:[
    'Treats the 14-hour window as a violation only when Driving occurs after the limit.',
    'Shows an expired historical 14-hour window as no driving violation when the driver is OFF DUTY or in Sleeper.',
    'Removes the false high Shift clock expired warning caused by counting rest time through midnight.',
    'Clears stale crossMidnightContinues metadata when Driving ended before midnight or another status began.',
    'Does not change accurate duty-status start/end times, locations, or status records.'
  ],
  label:'v103.7 Driving-Only 14h Window',
  updatedAt:RELEASED_AT,
}, null, 2)}\n`);
write('public/sw.js', read('public/sw.js').replace(/const OWNER_OP_SW_VERSION = '[^']+';/, `const OWNER_OP_SW_VERSION = '${VERSION}';`));
write('source/src/core/update/appUpdate.js', read('source/src/core/update/appUpdate.js').replace(/const FALLBACK_APP_VERSION = '[^']+';/, `const FALLBACK_APP_VERSION = '${VERSION}';`));

for (const [relative, marker] of [
  [hosPath,'drivingAfter14V1037'],
  [appPath,'crossMidnightRepairedV1037'],
  ['source/src/core/hos/crossMidnightFlagV1037.js','repairCrossMidnightFlagsV1037'],
]) {
  if (!read(relative).includes(marker)) throw new Error(`v103.7 missing ${marker} in ${relative}`);
}
console.log('v103.7 driving-only 14h window materialized');
await import('./verify-driving-only-window-v1037.mjs');

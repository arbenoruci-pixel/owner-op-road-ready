import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(ROOT, 'source/src/modules/logbook/DayLogScreen.jsx');
let source = fs.readFileSync(target, 'utf8');
function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`v103.6 UI missing ${label}`);
  source = source.replace(before, after);
}
function replacePattern(pattern, after, label, marker = '') {
  if (marker && source.includes(marker)) return;
  if (!pattern.test(source)) throw new Error(`v103.6 UI missing ${label}`);
  source = source.replace(pattern, after);
}

replaceOnce(
  `import { durLabel, timeLabel } from '../../shared/utils/time.js';`,
  `import { durLabel, nowMin, timeLabel } from '../../shared/utils/time.js';`,
  'time import'
);
replaceOnce(
  `  const [coverageWizardIssue, setCoverageWizardIssue] = useState(null);\n  const [missingDayIssue, setMissingDayIssue] = useState(null);`,
  `  const [coverageWizardIssue, setCoverageWizardIssue] = useState(null);\n  const [missingDayIssue, setMissingDayIssue] = useState(null);\n  const [liveMinuteV1036, setLiveMinuteV1036] = useState(() => nowMin());\n\n  useEffect(() => {\n    if (state.activeDay !== localDayKey()) return undefined;\n    const tickV1036 = () => {\n      const nextMinuteV1036 = nowMin();\n      setLiveMinuteV1036(current => current === nextMinuteV1036 ? current : nextMinuteV1036);\n    };\n    const visibleV1036 = () => {\n      if (!document.hidden) tickV1036();\n    };\n    tickV1036();\n    const timerV1036 = window.setInterval(tickV1036, 10000);\n    window.addEventListener('focus', tickV1036);\n    document.addEventListener('visibilitychange', visibleV1036);\n    return () => {\n      window.clearInterval(timerV1036);\n      window.removeEventListener('focus', tickV1036);\n      document.removeEventListener('visibilitychange', visibleV1036);\n    };\n  }, [state.activeDay]);`,
  'live minute ticker'
);
replacePattern(
  /  const displayEvents = useMemo\(\s*\(\) => displayEventsForDayFromState\(state\.eventsByDay \|\| \{\}, state\.activeDay(?:,\s*\{[\s\S]*?\})?\),\s*\[[^\]]*\]\s*\);/,
  `  const displayEvents = useMemo(\n    () => displayEventsForDayFromState(state.eventsByDay || {}, state.activeDay, { nowMinute:liveMinuteV1036 }),\n    [state.eventsByDay, state.activeDay, liveMinuteV1036]\n  );`,
  'live display events',
  'displayEventsForDayFromState(state.eventsByDay || {}, state.activeDay, { nowMinute:liveMinuteV1036 })'
);
replacePattern(
  /  const baseViolationRanges = useMemo\(\s*\(\) => violationRangesForDay\(state\.eventsByDay \|\| \{\}, state\.activeDay\),\s*\[[^\]]*\]\s*\);/,
  `  const baseViolationRanges = useMemo(\n    () => violationRangesForDay(state.eventsByDay || {}, state.activeDay),\n    [state.eventsByDay, state.activeDay, liveMinuteV1036]\n  );`,
  'live HOS refresh',
  '[state.eventsByDay, state.activeDay, liveMinuteV1036]'
);
source = source.replaceAll(
  `displayEventsForDay(previewRawEvents, isToday(state.activeDay))`,
  `displayEventsForDay(previewRawEvents, isToday(state.activeDay), { nowMinute:liveMinuteV1036 })`
);
source = source.replaceAll(
  `[isMoving, previewRawEvents, state.activeDay, displayEvents]`,
  `[isMoving, previewRawEvents, state.activeDay, displayEvents, liveMinuteV1036]`
);
source = source.replaceAll(
  `displayEventsForDay(bulkShiftResult.events, isToday(state.activeDay))`,
  `displayEventsForDay(bulkShiftResult.events, isToday(state.activeDay), { nowMinute:liveMinuteV1036 })`
);
source = source.replaceAll(
  `[state.selectMode, selectedCount, bulkMoveDelta, bulkShiftResult.events, state.activeDay, previewGraphEvents]`,
  `[state.selectMode, selectedCount, bulkMoveDelta, bulkShiftResult.events, state.activeDay, previewGraphEvents, liveMinuteV1036]`
);
if (!source.includes('nowMinute:liveMinuteV1036')) throw new Error('v103.6 UI integration failed');
fs.writeFileSync(target, source);
console.log('v103.6 live log UI patched');

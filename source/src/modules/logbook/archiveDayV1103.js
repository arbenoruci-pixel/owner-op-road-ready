import { projectLogbookEvents, logbookClock } from './eventEditingV110.js';
import { dutyViewEvents } from './dutyViewV110212.js';
import { displayEventsForDayFromState } from '../../core/timeline/displayTimeline.js';

// The same exact/continuous decision as the read-only graph. Never fill Driving gaps.
export function readArchiveLogbookDay(state = {}, day = '', at = new Date()) {
  const clock = logbookClock(state,at);
  if (day > clock.day) return [];
  const exact = projectLogbookEvents(state,day,at);
  const continuous = displayEventsForDayFromState(state.eventsByDay || {},day,{today:clock.day,nowMinute:clock.minute});
  return dutyViewEvents(exact,continuous).map(event=>({...event}));
}

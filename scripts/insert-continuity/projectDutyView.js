import {projectLogbookEvents,logbookClock} from './eventEditingV110.js';
import {dutyViewEvents} from './dutyViewV110212.js';
import {displayEventsForDayFromState} from '../../core/timeline/displayTimeline.js';

// Use the same read-only continuity and evidence rules as the daily graph.
export function projectLogbookDutyView(state={},day=state.activeDay,at=new Date()) {
  const clock=logbookClock(state,at);
  const continuous=displayEventsForDayFromState(state.eventsByDay||{},day,{
    today:clock.day,nowMinute:clock.minute,currentStatus:state.currentStatus,
    currentReason:state.currentReason,currentLocation:state.currentLocation,
  });
  return dutyViewEvents(projectLogbookEvents(state,day,at),continuous,{state,day,clock,eventsByDay:state.eventsByDay});
}

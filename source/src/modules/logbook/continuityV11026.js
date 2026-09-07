import { addDays, localDayKey } from '../../shared/utils/date.js';
import { displayEventsForDayFromState } from '../../core/timeline/displayTimeline.js';
import { rawStoredEventsForDay, stripSyntheticEventFields } from '../../core/compliance/rawRodsChecks.js';

const CARRYABLE = new Set(['OFF','SB','ON']);

// Completed days are a continuous sequence from the first real recorded day.
// Empty dates inside that sequence inherit the most recent known non-driving
// duty status for display/review. Reading this list never writes a log row.
export function historicalContinuityDaysV11026(state = {}, today = localDayKey()) {
  const recorded = Object.keys(state.eventsByDay || {})
    .filter(day => day < today && rawStoredEventsForDay(state.eventsByDay || {}, day).length)
    .sort();
  if (!recorded.length) return [];
  const first = recorded[0];
  const days = [];
  for (let day = first, guard = 0; day < today && guard < 3700; day = addDays(day, 1), guard += 1) {
    const effective = displayEventsForDayFromState(state.eventsByDay || {}, day, { today, nowMinute:1440 });
    if (effective.some(event => Number(event.endMin || 0) > Number(event.startMin || 0))) days.push(day);
  }
  return days.reverse();
}

// A carried full day stays display-only until the driver explicitly signs it.
// At that moment, make the status a real 00:00–24:00 row so the signature
// fingerprint certifies concrete content and remains stable on reload.
export function materializeCarriedDayForCertificationV11026(state = {}, day = '', today = localDayKey()) {
  if (!day || day >= today) return state;
  if (rawStoredEventsForDay(state.eventsByDay || {}, day).length) return state;
  const effective = displayEventsForDayFromState(state.eventsByDay || {}, day, { today, nowMinute:1440 });
  if (effective.length !== 1) return state;
  const carry = effective[0];
  if (!CARRYABLE.has(carry.status) || Number(carry.startMin || 0) !== 0 || Number(carry.endMin || 0) < 1439) return state;
  const clean = stripSyntheticEventFields({ ...carry });
  const event = {
    ...clean,
    id:`certified_carry_${day}_${carry.status}`,
    startMin:0,
    endMin:1440,
    source:'certified_carry_forward',
    note:carry.status === 'SB' ? 'Sleeper' : carry.status === 'ON' ? 'On Duty' : 'Off Duty',
    description:'',
    carriedFromPreviousDay:false,
  };
  return {
    ...state,
    eventsByDay:{ ...(state.eventsByDay || {}), [day]:[event] },
    certifyStatus:{ ...(state.certifyStatus || {}), [day]:'Needs signature' },
  };
}

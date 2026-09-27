import { shiftSelectedEventsV101 } from './multiEventShiftV101.js';

const excluded = new Set(['carryover','display','display_timeline','timeline_continuity']);
const real = event => event && !event.voided && !event.displayOnly && !event.syntheticCoverage && !event.carriedFromPreviousDay && !event.synthetic && !event.continuityGenerated && !excluded.has(event.source);
export const shiftRows = events => (events || []).filter(real);
export function shiftLabel(delta = 0) {
  const amount = Math.abs(Math.round(Number(delta) || 0));
  if (!amount) return 'No time change';
  const hours = Math.floor(amount / 60), minutes = amount % 60;
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', delta < 0 ? 'earlier' : 'later'].filter(Boolean).join(' ');
}
export function previewBulkShift(events = [], selectedIds = [], delta = 0, context = {}) {
  const rows = shiftRows(events);
  const unchanged = {events, appliedDeltaMin:0, changedEventIds:[], adjustedNeighborIds:[], warnings:[]};
  const blocked = reason => ({...unchanged, blockedReason:reason});
  if (!Number.isInteger(delta) || Math.abs(delta) > 1439) return blocked('Enter up to 23 hours and 59 minutes.');
  if (!selectedIds.length) return blocked('Select the events you want to move.');
  if (new Set(rows.map(e => e.id)).size !== rows.length || rows.some(e => !e.id || !Number.isInteger(e.startMin) || !Number.isInteger(e.endMin) || e.startMin < 0 || e.endMin > 1440 || e.endMin <= e.startMin)) return blocked('Review invalid event times in Edit before moving this group.');
  if (selectedIds.some(id => !rows.some(e => e.id === id))) return blocked('The selection changed. Select the events again.');
  const ordered = rows.slice().sort((a,b) => a.startMin-b.startMin), live = ordered.at(-1);
  const ownsLive = (context.manualDrivingSession?.active && context.manualDrivingSession.eventId === live?.id) || (context.gpsTrip?.status === 'active' && context.gpsTrip.eventId === live?.id);
  if (context.day === context.today && (['live_status','manual_drive_midnight_continuation'].includes(live?.source) || ownsLive) && !live.paperLogEndV110315 && live.status === context.currentStatus && selectedIds.includes(live.id)) return blocked('Use Edit to change the ongoing event’s Start time. Select completed events to move them together.');
  if (rows.length === new Set(selectedIds).size && ordered[0]?.startMin === 0 && live?.endMin === 1440 && ordered.some((event,index) => index && event.startMin !== ordered[index-1].endMin)) return blocked('This day has gaps or overlaps. Review them in Edit, or select a smaller group.');
  const result = shiftSelectedEventsV101(rows, selectedIds, delta);
  const after = new Map(result.events.map(e => [e.id, e]));
  return {...result, events:events.map(e => real(e) ? after.get(e.id) || e : e)};
}
export function applyBulkShift(state, command, at = new Date()) {
  const {day, selectedIds, delta, expectedRows, expectedDriverId, today} = command;
  const before = state.eventsByDay?.[day] || [];
  if (day !== state.activeDay || expectedDriverId !== (state.activeDriverId || '') || JSON.stringify(before) !== JSON.stringify(expectedRows)) return {ok:false, error:'The day or driver changed. Review the selection again.'};
  const result = previewBulkShift(before, selectedIds, delta, {day,today,currentStatus:state.currentStatus,manualDrivingSession:state.manualDrivingSession,gpsTrip:state.gpsTrip});
  if (result.blockedReason || !result.appliedDeltaMin) return {ok:false,error:result.blockedReason || 'Choose a time change.'};
  if (result.appliedDeltaMin !== delta) return {ok:false,error:'The available time changed. Review the preview again.'};
  const changedIds = [...new Set([...result.changedEventIds,...result.adjustedNeighborIds])];
  const entry = {kind:'bulk_shift',source:'bulk_shift_v110409',editedAt:at.toISOString(),deltaMin:delta,selectedIds:[...selectedIds],changedIds,beforeEvents:structuredClone(before),afterEvents:structuredClone(result.events)};
  const history = state.logbookEditHistoryByDay?.[day] || [];
  const byId = new Map(result.events.filter(event => changedIds.includes(event?.id)).map(event => [event.id,event]));
  const changedRouteDays = [];
  const routeLegsByDay = Object.fromEntries(Object.entries(state.routeLegsByDay || {}).map(([routeDay,legs]) => [routeDay,legs.map(leg => {
    let next = leg;
    for (const edge of ['pickup','delivery']) {
      const event = byId.get(leg[edge+'EventId']);
      if (event && (leg[edge+'Min'] !== event.startMin || leg[edge+'Day'] !== day)) {
        next = {...next,[edge+'Min']:event.startMin,[edge+'Day']:day};
        if (!changedRouteDays.includes(routeDay)) changedRouteDays.push(routeDay);
      }
    }
    return next;
  })]));
  return {ok:true, ...result, changedRouteDays, state:{...state,
    eventsByDay:{...state.eventsByDay,[day]:result.events},
    routeLegsByDay,
    logbookEditHistoryByDay:{...state.logbookEditHistoryByDay,[day]:[...history,entry]},
  }};
}

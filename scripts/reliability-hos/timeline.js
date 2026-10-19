import {configuredZone,effectiveZone,zoneForLogDay,zonedParts,wallMinute,logDayBounds,addDay} from './timePolicy.js';
const DUTY = new Set(['OFF','SB','ON','D']);
const SYNTHETIC = new Set(['timeline_continuity','carryover','display','display_timeline']);
export const isRest = status => status === 'OFF' || status === 'SB';
export const isDuty = status => status === 'D' || status === 'ON';
export const explicitEnd = event => event.paperLogEndV110315 === true || event.manualEndLocked === true || event.explicitEndLocked === true;
export const isRecorded = event => event && !event.voided && !event.synthetic && !event.syntheticCoverage && !event.displayOnly
  && !event.carriedFromPreviousDay && !event.continuityGenerated && !SYNTHETIC.has(event.source);
const liveSource = event => ['live_status','manual_drive_midnight_continuation','manual_drive','gps_drive','status_workflow'].includes(event.source) || event.liveStatus === true || event.active === true;

export function buildEvidenceTimeline(state = {}, at = new Date(), options = {}) {
  const actualNowAbs = Math.floor(new Date(at).getTime()/60000),reviewBounds=options.reviewDay?logDayBounds(state,options.reviewDay):null;
  const nowAbs=Math.min(actualNowAbs,reviewBounds ? reviewBounds.endAbs+3*1440 : Infinity),snapshotAt=new Date(nowAbs*60000);
  const timeZone = options.timeZone || effectiveZone(state,snapshotAt) || configuredZone(state);
  const clock = zonedParts(snapshotAt,timeZone), days = state.eventsByDay || state, issues = [], all = [];
  const floor = (reviewBounds?.startAbs ?? nowAbs) - Math.max(10,Number(options.lookbackDays || 21)) * 1500;
  for (const day of Object.keys(days).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) {
    const zone = zoneForLogDay(state,day), bounds = logDayBounds(state,day);
    if (bounds.endAbs < floor || bounds.startAbs > nowAbs) continue;
    const rows = (days[day] || []).filter(isRecorded).slice().sort((a,b) => a.startMin-b.startMin || a.endMin-b.endMin);
    for (let i=0;i<rows.length;i++) {
      const row = rows[i];
      if (!DUTY.has(row.status) || !Number.isInteger(row.startMin) || !Number.isInteger(row.endMin) || row.startMin < 0 || row.startMin >= 1440 || row.endMin <= row.startMin || row.endMin > 1440) {
        issues.push({code:'invalid_event',day,eventId:row.id,text:'A recorded event has invalid status or times.'}); continue;
      }
      const start = wallMinute(day,row.startMin,zone,{instant:row.startAt || row.startedAt,fold:row.startFold});
      const end = wallMinute(day,row.endMin,zone,{instant:row.endAt || row.endedAt,fold:row.endFold});
      if (start.value == null || end.value == null) {
        issues.push({code:start.issue || end.issue,day,eventId:row.id,startMin:row.startMin,endMin:row.endMin,text:'This local time needs its recorded UTC offset or instant before HOS can be confirmed.'}); continue;
      }
      if (start.value >= nowAbs) continue;
      all.push({...row,dayKey:day,logTimeZone:zone,logDayStartAbs:bounds.startAbs,logDayEndAbs:bounds.endAbs,startAbs:start.value,endAbs:Math.min(end.value,nowAbs),rawEndAbs:end.value,lastInDay:i === rows.length-1});
    }
  }
  all.sort((a,b) => a.startAbs-b.startAbs || a.endAbs-b.endAbs);
  const status = DUTY.has(state.currentStatus) ? state.currentStatus : all.at(-1)?.status || 'OFF';
  for (let i=0;i<all.length;i++) {
    const row = all[i], next = all[i+1], owned = [state.manualDrivingSession,state.gpsTrip].some(s => s && (s.active === true || s.status === 'active') && s.eventId === row.id);
    if (explicitEnd(row)) continue;
    if (row.lastInDay && row.status !== 'D' && (liveSource(row) || row.endMin === 1440)) {
      const desired = next?.dayKey !== row.dayKey ? (next?.startAbs ?? (status === row.status ? nowAbs : row.endAbs)) : row.endAbs;
      row.endAbs = Math.max(row.endAbs,Math.min(nowAbs,desired));
    } else if (!next && row.dayKey === clock.day && row.status === status && (liveSource(row) || owned)) row.endAbs = nowAbs;
    else if (!next && row.status === 'D' && status === 'D' && owned) row.endAbs = nowAbs;
    row.derivedForHosClock = row.endAbs !== Math.min(row.rawEndAbs,nowAbs);
  }
  for (let i=1;i<all.length;i++) {
    const previous = all[i-1], row = all[i];
    if (row.startAbs > previous.endAbs) issues.push({code:'gap',day:row.dayKey,eventId:row.id,startAbs:previous.endAbs,endAbs:row.startAbs,text:'Unrecorded time separates duty events. HOS needs review.'});
    if (row.startAbs < previous.endAbs) issues.push({code:'overlap',day:row.dayKey,eventId:row.id,startAbs:row.startAbs,endAbs:Math.min(previous.endAbs,row.endAbs),text:'Recorded duty events overlap. HOS needs review.'});
  }
  if (all.length && all.at(-1).endAbs < nowAbs) issues.push({code:'open_gap',day:clock.day,startAbs:all.at(-1).endAbs,endAbs:nowAbs,text:'Current duty time is not supported by an ongoing recorded event.'});
  const boundaries = [];
  for (const change of state.homeTerminalTimeZoneHistory || []) {
    const when = Math.floor(Date.parse(change.effectiveAt)/60000);
    if (Number(change.transitionMinutes) && when <= nowAbs && when >= floor && !change.transitionReviewedAt) {
      issues.push({code:'home_terminal_transition',day:change.effectiveLogDay,startAbs:when-Math.abs(change.transitionMinutes),endAbs:when,text:'Review the actual duty status across the home-terminal time change.'});
    }
  }
  return {timeline:all,issues,timeZone,nowAbs,nowMinute:clock.minute,nowDay:clock.day,currentStatus:status,state,boundaries};
}

export function restBlocks(timeline, atAbs = Infinity) {
  const blocks=[]; let last=null;
  for (const row of timeline) {
    const start=Math.max(row.startAbs,-Infinity),end=Math.min(row.endAbs,atAbs);
    if (end<=start) continue;
    if (!isRest(row.status)) {last=null;continue;}
    if (!last || start !== last.endAbs) {last={startAbs:start,endAbs:start,duration:0,events:[],statusSet:new Set(),allSleeper:true,sleeperMins:0,offMins:0,longestSleeper:0,sleeperRun:0};blocks.push(last);}
    last.endAbs=end;last.duration=end-last.startAbs;last.events.push(row);last.statusSet.add(row.status);last.allSleeper &&= row.status==='SB';
    if (row.status==='SB') {last.sleeperMins+=end-start;last.sleeperRun+=end-start;last.longestSleeper=Math.max(last.longestSleeper,last.sleeperRun);} else {last.offMins+=end-start;last.sleeperRun=0;}
  }
  return blocks;
}
export function sumDuration(timeline,start=-Infinity,end=Infinity,predicate=()=>true) {
  return timeline.reduce((total,row) => total+(predicate(row)?Math.max(0,Math.min(row.endAbs,end)-Math.max(row.startAbs,start)):0),0);
}

// Pure time policy. Existing wall-clock records retain their recorded log zone.
const MINUTE = 60000;
const formatter = new Map();
const validity = new Map(), wallCandidates = new Map();
export const DEFAULT_ZONE = 'America/New_York';

export function validZone(value) {
  if(validity.has(value))return validity.get(value);
  let valid=false;
  try { new Intl.DateTimeFormat('en-US', {timeZone:value}).format(0); valid=!!value; } catch {}
  if(validity.size>=256)validity.delete(validity.keys().next().value);
  validity.set(value,valid);return valid;
}
export function configuredZone(state = {}) {
  const zone = state.homeTerminalTimeZone || state.settings?.homeTerminalTimeZone
    || state.carrierSettings?.homeTerminalTimeZone || state.driverProfile?.homeTerminalTimeZone;
  return validZone(zone) ? zone : DEFAULT_ZONE;
}
export function addDay(day, delta = 1) {
  return new Date(Date.parse(day + 'T12:00:00Z') + delta * 86400000).toISOString().slice(0, 10);
}
export function zonedParts(at, zone) {
  if (!formatter.has(zone)) formatter.set(zone, new Intl.DateTimeFormat('en-CA', {
    timeZone:zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23',
  }));
  const p = Object.fromEntries(formatter.get(zone).formatToParts(new Date(at)).filter(x => x.type !== 'literal').map(x => [x.type,x.value]));
  return {day:`${p.year}-${p.month}-${p.day}`, minute:(Number(p.hour) % 24) * 60 + Number(p.minute)};
}
function history(state) {
  return (state.homeTerminalTimeZoneHistory || []).filter(x => validZone(x.timeZone) && Number.isFinite(Date.parse(x.effectiveAt)))
    .slice().sort((a,b) => Date.parse(a.effectiveAt) - Date.parse(b.effectiveAt));
}
export function effectiveZone(state = {}, at = new Date()) {
  const entries = history(state), elapsed = entries.filter(x => Date.parse(x.effectiveAt) <= new Date(at).getTime());
  return elapsed.at(-1)?.timeZone || state.homeTerminalOriginalTimeZone || entries[0]?.previousTimeZone || configuredZone(state);
}
export function zoneForLogDay(state = {}, day = '') {
  const assigned = state.logTimeZoneByDay?.[day];
  if (validZone(typeof assigned === 'string' ? assigned : assigned?.timeZone)) return typeof assigned === 'string' ? assigned : assigned.timeZone;
  const entries = history(state);
  return entries.filter(x => x.effectiveLogDay && x.effectiveLogDay <= day).at(-1)?.timeZone
    || state.homeTerminalOriginalTimeZone || entries[0]?.previousTimeZone || configuredZone(state);
}

// All candidates are returned at a repeated DST minute. Choosing a fold requires
// recorded offset/instant evidence; the engine never guesses which 01:30 occurred.
export function wallMinuteCandidates(day, minute, zone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(minute) || minute < 0 || minute > 1440 || !validZone(zone)) return [];
  if (minute === 1440) return wallMinuteCandidates(addDay(day), 0, zone);
  const cacheKey=`${day}|${minute}|${zone}`;
  if(wallCandidates.has(cacheKey))return wallCandidates.get(cacheKey).slice();
  const nominal = Date.parse(day + 'T00:00:00Z') / MINUTE + minute;
  const offsets = new Set();
  for (const delta of [-2160,-720,0,720,2160]) {
    const probe = nominal + delta, p = zonedParts(probe * MINUTE, zone);
    offsets.add(Date.parse(p.day + 'T00:00:00Z') / MINUTE + p.minute - probe);
  }
  const result=[...offsets].map(offset => nominal - offset).filter(candidate => {
    const p = zonedParts(candidate * MINUTE, zone); return p.day === day && p.minute === minute;
  }).sort((a,b) => a-b);
  if(wallCandidates.size>=12000)wallCandidates.delete(wallCandidates.keys().next().value);
  wallCandidates.set(cacheKey,result);return result.slice();
}
export function wallMinute(day, minute, zone, {instant, fold} = {}) {
  const candidates = wallMinuteCandidates(day, minute, zone);
  if (instant && Number.isFinite(Date.parse(instant))) {
    const absolute = Math.floor(Date.parse(instant) / MINUTE);
    if (candidates.includes(absolute)) return {value:absolute, candidates, exact:true};
    return {value:null, candidates, issue:'instant_wall_time_mismatch'};
  }
  if (candidates.length === 1) return {value:candidates[0], candidates, exact:true};
  if (candidates.length > 1 && (fold === 0 || fold === 1) && candidates[fold] != null) return {value:candidates[fold], candidates, exact:true};
  return {value:null, candidates, issue:candidates.length ? 'dst_repeated_minute' : 'dst_missing_minute'};
}
export function logDayBounds(state, day) {
  const timeZone = zoneForLogDay(state, day);
  return {day, timeZone, startAbs:wallMinute(day,0,timeZone).value, endAbs:wallMinute(day,1440,timeZone).value};
}

export function previewTimeZoneChange(state, nextZone, at = new Date(), options = {}) {
  if (!validZone(nextZone)) return {ok:false,error:'Choose a valid home-terminal time zone.'};
  const previousTimeZone = effectiveZone(state, at);
  if (nextZone === previousTimeZone) return {ok:true,changed:false,state};
  const oldDay = zonedParts(at,previousTimeZone).day, newDay = zonedParts(at,nextZone).day;
  const effectiveLogDay = options.effectiveLogDay || addDay(oldDay > newDay ? oldDay : newDay);
  const effective = wallMinute(effectiveLogDay,0,nextZone);
  if (effective.value == null || effective.value * MINUTE <= new Date(at).getTime()) return {ok:false,error:'The new time zone must start on a future log day.'};
  if (Object.keys(state.eventsByDay || {}).some(day => day >= effectiveLogDay && (state.eventsByDay[day] || []).length)) return {ok:false,error:'The selected start would reinterpret an existing log day. Choose a later day.'};
  const priorDay = addDay(effectiveLogDay,-1), priorEnd = wallMinute(priorDay,1440,previousTimeZone).value;
  const transitionMinutes = effective.value - priorEnd;
  const assignments = {...(state.logTimeZoneByDay || {})};
  for (const day of Object.keys(state.eventsByDay || {})) if (!assignments[day]) assignments[day] = zoneForLogDay(state,day);
  return {ok:true,changed:true,previousTimeZone,timeZone:nextZone,effectiveLogDay,effectiveAt:new Date(effective.value * MINUTE).toISOString(),requestedAt:new Date(at).toISOString(),transitionMinutes,assignments,
    explanation:`Existing log days keep ${previousTimeZone}. Proposed future zone: ${nextZone}, with a requested first log day of ${effectiveLogDay} at 00:00. Activation remains pending.`,
    transitionReview:transitionMinutes === 0 ? null : {minutes:transitionMinutes,code:'home_terminal_transition',message:'Review the actual duty status across the home-terminal time change. The change does not add rest or driving time.'}};
}
export function applyTimeZoneChange(state, plan, at = new Date()) {
  if (!plan?.ok || !plan.changed) return {ok:!!plan?.ok,changed:false,state,error:plan?.error};
  const fresh = previewTimeZoneChange(state,plan.timeZone,at,{effectiveLogDay:plan.effectiveLogDay});
  if (!fresh.ok || fresh.previousTimeZone !== plan.previousTimeZone || fresh.effectiveAt !== plan.effectiveAt) return {ok:false,error:'Time-zone settings or log days changed. Review the change again.'};
  // A wall-minute log schema cannot silently represent the hour gained/lost
  // during a terminal move. Keep a reviewable proposal until actual event
  // boundaries have been validated. Saving this proposal never activates it.
  const entry = {id:`home-terminal-${fresh.effectiveAt}-${fresh.timeZone}`,timeZone:fresh.timeZone,previousTimeZone:fresh.previousTimeZone,effectiveAt:null,proposedEffectiveAt:fresh.effectiveAt,effectiveLogDay:fresh.effectiveLogDay,requestedAt:fresh.requestedAt,transitionMinutes:fresh.transitionMinutes,status:'pending_boundary_review'};
  if(state.homeTerminalTimeZoneChangeProposal?.id===entry.id)return {ok:true,changed:false,state,plan:fresh};
  return {ok:true,changed:true,state:{...state,homeTerminalOriginalTimeZone:state.homeTerminalOriginalTimeZone || fresh.previousTimeZone,
    logTimeZoneByDay:fresh.assignments,homeTerminalTimeZoneChangeProposal:entry,
    homeTerminalTimeZoneProposalHistory:[...(state.homeTerminalTimeZoneProposalHistory || []),entry]},plan:fresh};
}

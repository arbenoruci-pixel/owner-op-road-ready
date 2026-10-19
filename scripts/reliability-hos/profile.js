import {effectiveZone,wallMinute,addDay,zonedParts} from './timePolicy.js';

export function hosProfileAt(state={},atAbs=Date.now()/60000) {
  const entries=(state.hosProfileHistory||[]).filter(entry=>Number.isFinite(Date.parse(entry.effectiveAt))).slice().sort((a,b)=>Date.parse(a.effectiveAt)-Date.parse(b.effectiveAt));
  const active=entries.filter(entry=>Date.parse(entry.effectiveAt)<=atAbs*60000).at(-1);
  return active?.profile || entries[0]?.previousProfile || state.hosSettings || {};
}

export function previewHosProfile(state,draft={},at=new Date()) {
  const zone=effectiveZone(state,at),day=zonedParts(at,zone).day;
  const jurisdiction=String(draft.jurisdiction||''),source=String(draft.source||'').trim();
  const daily=draft.carrierOperatesEveryDay;
  const hours=daily===true?70:daily===false?60:null,days=hours===70?8:hours===60?7:null;
  const start=Number(draft.dayStartMinute),anchor=wallMinute(draft.anchorDay||'',start,zone);
  const effectiveLogDay=draft.effectiveLogDay||addDay(day),effective=wallMinute(effectiveLogDay,0,zone);
  const errors=[];
  if(jurisdiction!=='US_INTERSTATE_PROPERTY')errors.push('This engine supports U.S. interstate property-carrying rules. Other regimes require a separate verified rule set.');
  if(hours==null)errors.push('Confirm whether this carrier operates commercial vehicles every day of the week.');
  if(!Number.isInteger(start)||start<0||start>=1440||anchor.value==null)errors.push('Confirm the carrier duty-day start and an unambiguous anchor date.');
  if(typeof draft.splitSleeperEnabled!=='boolean')errors.push('Confirm whether the property-carrying sleeper-berth rule applies to this operation.');
  if(!source)errors.push('Record the carrier policy or other source used to confirm this profile.');
  if(effective.value==null||effective.value*60000<=new Date(at).getTime())errors.push('Choose a future first log day so previous profiles remain unchanged.');
  if(Object.keys(state.eventsByDay||{}).some(date=>date>=effectiveLogDay&&(state.eventsByDay[date]||[]).length))errors.push('The proposed start contains recorded events. Choose a later first log day.');
  const profile={jurisdiction,carrierOperatesEveryDay:daily,cycleHours:hours,cycleDays:days,cycleRule:hours?`${hours}/${days}`:'',dutyDayStartMinute:start,dutyDayAnchorAt:anchor.value==null?null:new Date(anchor.value*60000).toISOString(),splitSleeperEnabled:draft.splitSleeperEnabled,source,confirmedAt:new Date(at).toISOString()};
  return {ok:errors.length===0,errors,profile,timeZone:zone,effectiveLogDay,effectiveAt:effective.value==null?null:new Date(effective.value*60000).toISOString(),previousProfile:hosProfileAt(state,new Date(at).getTime()/60000)};
}

export function saveHosProfile(state,draft,at=new Date(),confirmed=false) {
  const plan=previewHosProfile(state,draft,at);
  if(!confirmed)return {ok:true,changed:true,state:{...state,hosProfileProposal:{...draft,status:'needs_review',savedAt:new Date(at).toISOString(),reviewErrors:plan.errors}}};
  if(!plan.ok)return {ok:false,error:plan.errors.join(' '),state};
  const entry={effectiveAt:plan.effectiveAt,effectiveLogDay:plan.effectiveLogDay,profile:plan.profile,previousProfile:plan.previousProfile};
  if((state.hosProfileHistory||[]).some(e=>e.effectiveAt===entry.effectiveAt))return {ok:false,error:'A profile is already scheduled for this instant. Review that proposal before scheduling another.',state};
  return {ok:true,changed:true,state:{...state,hosProfileProposal:null,hosProfileHistory:[...(state.hosProfileHistory||[]),entry]}};
}

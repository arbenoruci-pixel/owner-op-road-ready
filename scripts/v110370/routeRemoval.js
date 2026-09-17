import {cleanupDeletedLogbookData,cleanRouteCacheAfterRemoval} from './logbookLoadCleanup.js';
const text = value => String(value ?? '').trim();
const rows = state => [state.routeLegsByDay,state.loadInfo?.routeLegsByDay].flatMap(map => Object.values(map || {}).flatMap(list => Array.isArray(list) ? list : []));
const real = event => event && !event.voided && !event.deleted && !event.deletedAt && !event.synthetic && !event.syntheticCoverage && !event.displayOnly && !event.carriedFromPreviousDay && !event.continuityGenerated;
const activity = event => /pickup|loading|delivery|unloading/i.test([event.note,event.description,...(Array.isArray(event.reasons)?event.reasons:[])].join(' '));
const resting = event => ['OFF','SB'].includes(event.status);
const unique = values => [...new Set(values.map(text).filter(Boolean))].sort();

// Persist explicit driver intent separately from regenerated route records.
// Exact IDs keep independent stops with the same BOL and future loads separate.
export function rememberRouteRemoval(before,after,{day,excludeIds=[]}={}) {
  const remaining = new Set(rows(after).map(row => text(row.id)));
  const deleted = rows(before).map(row => text(row.id)).filter(id => id && !remaining.has(id));
  const prior = after.logbookRouteRemovalsV110370 || {};
  const deletedIds = unique([...(prior.deletedIds || []),...deleted]);
  const excludedByDay = {...prior.excludedByDay};
  if(day && excludeIds.length)excludedByDay[day]=unique([...(excludedByDay[day]||[]),...excludeIds]);
  if(!deleted.length&&!excludeIds.length)return after;
  return applyRouteRemovals({...after,logbookRouteRemovalsV110370:{deletedIds,excludedByDay}});
}

export function applyRouteRemovals(state={}) {
  const intent=state.logbookRouteRemovalsV110370;
  if(!intent)return state;
  const deleted=new Set(intent.deletedIds||[]),exclusions=new Map();
  for(const [day,ids] of Object.entries(intent.excludedByDay||{}))for(const id of ids||[]){
    if(!exclusions.has(id))exclusions.set(id,new Set());exclusions.get(id).add(day);
  }
  function clean(map){
    let next=map;
    for(const [day,list] of Object.entries(map||{})){
      if(!Array.isArray(list))continue;
      const kept=list.filter(row=>!deleted.has(text(row?.id))).map(row=>{
        const days=exclusions.get(text(row?.id));if(!days)return row;
        const old=row.logbookExcludedDaysV110352||[],all=unique([...old,...days]);
        return all.length===old.length?row:{...row,logbookExcludedDaysV110352:all};
      });
      if(kept.length!==list.length||kept.some((row,i)=>row!==list[i])){if(next===map)next={...map};next[day]=kept;}
    }return next;
  }
  const canonical=clean(state.routeLegsByDay),legacy=clean(state.loadInfo?.routeLegsByDay);
  if(canonical===state.routeLegsByDay&&legacy===state.loadInfo?.routeLegsByDay)return state;
  return cleanRouteCacheAfterRemoval(state,{...state,routeLegsByDay:canonical,
    ...(legacy!==state.loadInfo?.routeLegsByDay?{loadInfo:{...state.loadInfo,routeLegsByDay:legacy}}:{})});
}

export function cleanupRouteChangesAfterEdit(before,after,day,{targetId,restDayIntent=false}={}) {
  if(before===after)return after;
  const prior=(before.eventsByDay?.[day]||[]).filter(real),current=(after.eventsByDay?.[day]||[]).filter(real);
  const replaced=prior.filter(old=>{
    const next=current.find(row=>row.id===old.id);
    return !next || activity(old)&&!activity(next) || old.status==='ON'&&resting(next)&&activity(old);
  }).map(row=>row.id);
  // A complete, explicit rest-day replacement can remove day-owned pending
  // routes too. Ordinary breaks never clear a carried shipment.
  let edge=0;
  for(const row of [...current].sort((a,b)=>a.startMin-b.startMin)){
    if(!resting(row)||Number(row.startMin)>edge)break;
    edge=Math.max(edge,Number(row.endMin)||0);
  }
  const changed=JSON.stringify(prior)!==JSON.stringify(current);
  const target=current.find(row=>row.id===targetId);
  const oldTarget=prior.find(row=>row.id===targetId);
  const dutyChanged=!oldTarget||['status','startMin','endMin'].some(key=>oldTarget[key]!==target?.[key]);
  const fullRest=restDayIntent&&dutyChanged&&changed&&prior.length>0&&target&&Number(target.startMin)===0&&Number(target.endMin)===1440&&current.every(resting)&&edge>=1440;
  if(!replaced.length&&!fullRest)return applyRouteRemovals(after);
  const ids=fullRest?prior.map(row=>row.id):replaced;
  const effective={...after,eventsByDay:{...after.eventsByDay,[day]:fullRest?[]:(after.eventsByDay?.[day]||[]).filter(row=>!ids.includes(row.id))}};
  let cleaned=cleanupDeletedLogbookData(before,effective,{day,eventIds:ids,clearDay:fullRest});
  cleaned={...cleaned,eventsByDay:after.eventsByDay};
  // A carried route keeps its other-day history while this corrected day stays blank.
  const excludeIds=fullRest?rows(before).filter(row=>{
    const start=text(row.pickupDay||row.day),end=text(row.deliveryDay);
    return start&&start<=day&&(!end||day<=end);
  }).map(row=>text(row.id)).filter(Boolean):[];
  return rememberRouteRemoval(before,cleaned,{day,excludeIds});
}

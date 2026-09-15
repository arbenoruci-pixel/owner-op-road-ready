// Runs only as part of a confirmed Logbook deletion. Never a startup purge.
const text = value => value == null ? '' : String(value).trim();
const rows = map => Object.entries(map || {}).flatMap(([bucket, values]) =>
  (Array.isArray(values) ? values : []).filter(Boolean).map(leg => ({bucket, leg})));
const links = [['pickupEventId','pickupDay'], ['deliveryEventId','deliveryDay'], ['sourceEventId','sourceEventDay']];
const ref = row => text(row?.loadNo || row?.shippingDocs || row?.bol);
const same = (a,b) => text(a).toUpperCase() === text(b).toUpperCase();
const realEvent = event => event && !event.voided && !event.deleted && !event.deletedAt && !event.syntheticCoverage && !event.synthetic && !event.displayOnly && !event.carriedFromPreviousDay && !event.continuityGenerated && !['timeline_continuity','carryover','display','display_timeline'].includes(text(event.source).toLowerCase());

function clearLoadCache(load = {}) {
  // Keep the legacy route mirror (already cleaned) and equipment-only settings.
  const kept = Object.fromEntries(Object.entries(load).filter(([key]) => key === 'routeLegsByDay' || key.startsWith('equipment')));
  return {...kept, loadNo:'', shippingDocs:'', bol:'', po:'', pickupCity:'', pickupState:'', deliveryCity:'', deliveryState:'', broker:'', appointment:''};
}

function cacheMatchesRoute(load, leg) {
  if (text(load.routeLegId) && text(load.routeLegId) === text(leg.id)) return true;
  if (text(load.sourceEventId) && links.some(([key,dayKey]) => text(leg[key]) === text(load.sourceEventId)
      && (!load.sourceEventDay || !leg[dayKey] || load.sourceEventDay === leg[dayKey]))) return true;
  if (text(load.sourceEventId)) return false;
  // A bare BOL is insufficient. The canonical cache must also match the route endpoints.
  return load.routeSource === 'canonical_routeLegsByDay' && ref(load) && same(ref(load),ref(leg))
    && text(load.pickupCity) && text(load.deliveryCity)
    && same(load.pickupCity,leg.fromCity) && same(load.pickupState,leg.fromState)
    && same(load.deliveryCity,leg.toCity) && same(load.deliveryState,leg.toState);
}

export function cleanRouteCacheAfterRemoval(before = {}, after = {}) {
  if (before === after || !after.loadInfo) return after;
  const previous = [...rows(before.routeLegsByDay), ...rows(before.loadInfo?.routeLegsByDay)];
  const remaining = [...rows(after.routeLegsByDay), ...rows(after.loadInfo?.routeLegsByDay)];
  const removed = previous.filter(({leg}) => text(leg.id) && !remaining.some(row => text(row.leg.id) === text(leg.id)));
  if (!removed.some(({leg}) => cacheMatchesRoute(after.loadInfo,leg))) return after;
  if (remaining.some(({leg}) => cacheMatchesRoute(after.loadInfo,leg))) return after;
  return {...after,loadInfo:clearLoadCache(after.loadInfo)};
}

export function cleanupDeletedLogbookData(before = {}, after = {}, command = {}) {
  const day = text(command.day);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return after;
  const prior = (before.eventsByDay?.[day] || []).filter(realEvent);
  const current = (after.eventsByDay?.[day] || []).filter(realEvent);
  const requested = new Set((Array.isArray(command.eventIds) ? command.eventIds : []).map(text).filter(Boolean));
  const removed = new Set(prior.filter(event => requested.has(text(event.id)) && !current.some(row => text(row.id) === text(event.id))).map(event => text(event.id)));
  if (!removed.size) return after;
  const cleared = command.clearDay === true && current.length === 0 && prior.every(event => removed.has(text(event.id)));
  const remainingEvents = Object.entries(after.eventsByDay || {}).flatMap(([eventDay, events]) =>
    (Array.isArray(events) ? events : []).filter(realEvent).map(event => ({day:eventDay,event})));
  const matchesDeletedLink = (leg,key,dayKey) => removed.has(text(leg[key])) && (!text(leg[dayKey]) || leg[dayKey] === day);
  const owned = ({bucket,leg}) => [leg.sourceEventDay,leg.day,leg.pickupDay].includes(day)
    || (!leg.sourceEventDay && !leg.day && !leg.pickupDay && bucket === day);
  const byId = new Map();
  const all = [...rows(before.routeLegsByDay),...rows(before.loadInfo?.routeLegsByDay),...rows(after.routeLegsByDay),...rows(after.loadInfo?.routeLegsByDay)];
  const keyFor = ({bucket,leg}) => text(leg.id) ? 'id:'+text(leg.id) : 'row:'+bucket+':'+JSON.stringify(leg);
  for (const row of all) { const key=keyFor(row); if(!byId.has(key))byId.set(key,[]); byId.get(key).push(row); }
  const plans = new Map();
  for (const [key,copies] of byId) {
    const affected = copies.some(({leg,bucket}) => links.some(([field,date]) => matchesDeletedLink(leg,field,date))
      || (owned({leg,bucket}) && (removed.has(text(leg.id)) || [...removed].some(id => leg.id === 'leg_'+id)))
      || (cleared && owned({leg,bucket})));
    if (!affected) continue;
    const survivors = remainingEvents.filter(({event,day:eventDay}) => copies.some(({leg}) =>
      links.some(([field,date]) => text(leg[field]) && text(leg[field]) === text(event.id) && (!text(leg[date]) || leg[date] === eventDay))
      || (text(leg.id) && text(event.routeLegId) === text(leg.id))));
    const rootRemoved = copies.some(row => (cleared && owned(row))
      || matchesDeletedLink(row.leg,'pickupEventId','pickupDay') || matchesDeletedLink(row.leg,'sourceEventId','sourceEventDay')
      || (owned(row) && (removed.has(text(row.leg.id)) || [...removed].some(id => row.leg.id === 'leg_'+id))));
    plans.set(key,{remove:rootRemoved && !survivors.length,survivors});
  }
  function cleanMap(map) {
    if (!map) return map;
    let changed=false;
    const next={};
    for (const [bucket,values] of Object.entries(map)) {
      if(!Array.isArray(values)){next[bucket]=values;continue;}
      next[bucket] ||= [];
      for (const leg of values) {
        if(!leg){next[bucket].push(leg);continue;}
        const plan=plans.get(keyFor({bucket,leg}));
        if(!plan){next[bucket].push(leg);continue;}
        changed=true;
        if(plan.remove)continue;
        const edited={...leg};
        for(const [field,date] of links) {
          if(matchesDeletedLink(leg,field,date) || (cleared && leg[date] === day)) {
            edited[field]='';edited[date]='';
            if(field==='pickupEventId')edited.pickupMin=null;
            if(field==='deliveryEventId'){edited.deliveryMin=null;edited.status='open';}
          }
        }
        if(cleared) {
          edited.logbookExcludedDaysV110352=[...new Set([...(Array.isArray(leg.logbookExcludedDaysV110352)?leg.logbookExcludedDaysV110352:[]),day])];
        }
        const nextDay = plan.survivors.find(item => item.day !== day)?.day;
        if(cleared && nextDay && (edited.day === day || bucket === day)) edited.day=nextDay;
        if(edited.deliveryEventId && plan.survivors.some(item => text(item.event.id) === text(edited.deliveryEventId)))edited.status='delivered';
        const destination=cleared && bucket===day && nextDay ? nextDay : bucket;
        next[destination] ||= [];next[destination].push(edited);
      }
    }
    if(changed)for(const [bucket,values] of Object.entries(map)){
      if(Array.isArray(values) && Array.isArray(next[bucket]) && values.length===next[bucket].length && values.every((leg,i)=>leg===next[bucket][i]))next[bucket]=values;
    }
    return changed?next:map;
  }
  const routeLegsByDay=cleanMap(after.routeLegsByDay);
  const legacy=cleanMap(after.loadInfo?.routeLegsByDay);
  let next=after;
  if(routeLegsByDay!==after.routeLegsByDay)next={...next,routeLegsByDay};
  if(legacy!==after.loadInfo?.routeLegsByDay)next={...next,loadInfo:{...next.loadInfo,routeLegsByDay:legacy}};
  next=cleanRouteCacheAfterRemoval(before,next);
  const load=next.loadInfo;
  if(load) {
    const sourceDeleted=removed.has(text(load.sourceEventId)) && (!load.sourceEventDay || load.sourceEventDay===day);
    const dayOwned=cleared && load.sourceEventDay===day;
    const sourceSurvives=text(load.sourceEventId) && remainingEvents.some(({event,day:eventDay})=>text(event.id)===text(load.sourceEventId) && (!load.sourceEventDay || load.sourceEventDay===eventDay));
    if((sourceDeleted || dayOwned) && !sourceSurvives)next={...next,loadInfo:clearLoadCache(load)};
  }
  if(cleared && Object.hasOwn(next.manualMilesByDay || {},day)) {
    const manualMilesByDay={...next.manualMilesByDay};delete manualMilesByDay[day];next={...next,manualMilesByDay};
  }
  return next;
}

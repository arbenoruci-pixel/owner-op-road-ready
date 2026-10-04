// Read-only freight evidence. A co-driver's event remains in that driver's log.
import {reviewedLoadAliases} from '../../modules/owneros/loadAliasesV110416.js';
const text = v => String(v ?? '').trim();
const ref = v => text(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
const list = v => Array.isArray(v) ? v : [];
const refs = row => [...new Set([row.shippingDocs,row.loadNo,row.bol,row.bolNo,row.po,row.canonicalLoadNo]
  .map(ref).filter(Boolean))];
const place = (city, state) => [ref(city),ref(state)].join('|');
const destination = event => event.destinationCity
  ? place(event.destinationCity,event.destinationState)
  : text(event.destination).includes(',') ? place(text(event.destination).split(',').slice(0,-1).join(','),text(event.destination).split(',').at(-1)) : '';

export function freightReferenceCatalog(store = {}) {
  const reviewed=Object.fromEntries(Object.entries(reviewedLoadAliases(store)).map(([from,to])=>[ref(from),ref(to)]));
  const canonical=value=>reviewed[ref(value)]||ref(value);
  const unresolved=new Set(list(store.evidenceAliases).map(a=>ref(a.from)).filter(from=>!reviewed[from]));
  const blocked=new Set(list(store.loads).filter(load=>load.identityReviewV110326||load.brokerIdentityConflict).map(load=>canonical(load.canonicalLoadNo||load.loadNo||load.load_no)));
  const rows=list(store.loads).filter(load => !load.identityReviewV110326 && !load.brokerIdentityConflict)
    .map(load => ({loadNo:canonical(load.canonicalLoadNo || load.loadNo || load.load_no),
      aliases:[...new Set(list(load.aliases).map(a => ref(typeof a === 'string' ? a : a?.value)).filter(Boolean))].sort(),
      pickupDay:text(load.pickupDate).slice(0,10)})).filter(load => load.loadNo&&!blocked.has(load.loadNo)&&!unresolved.has(load.loadNo));
  for(const row of rows)row.aliases=row.aliases.filter(alias=>!unresolved.has(alias)&&(!reviewed[alias]||reviewed[alias]===row.loadNo));
  for(const [from,to] of Object.entries(reviewed)){
    const target=ref(to),alias=ref(from);if(blocked.has(target))continue;
    let row=rows.find(load=>load.loadNo===target);
    if(!row){row={loadNo:target,aliases:[],pickupDay:''};rows.push(row);}
    if(!row.aliases.includes(alias))row.aliases.push(alias);
    for(const other of rows)if(other!==row)other.aliases=other.aliases.filter(value=>value!==alias);
  }
  return rows.map(row=>({...row,aliases:row.aliases.sort()})).sort((a,b)=>a.loadNo.localeCompare(b.loadNo));
}

function owners(value, catalog, day, suffix = false) {
  return new Set(catalog.filter(row => (!row.pickupDay || !day || row.pickupDay === day)
    && [row.loadNo,...list(row.aliases)].some(full => full === value ||
      suffix && /^\d{3}$/.test(value) && full.length >= 6 && full.endsWith(value)))
    .map(row => row.loadNo));
}

export function sameFreightReference(left, right, index, day = '', suffix = false) {
  const a = refs(left), b = refs(right), catalog = index.freightReferences || [];
  return a.some(x => b.some(y => {
    if (x === y) return true;
    const ax = owners(x,catalog,day,suffix), by = owners(y,catalog,day,suffix);
    return ax.size === 1 && by.size === 1 && [...ax][0] === [...by][0];
  }));
}

export function pickupByReference(leg, index) {
  const day = text(leg.pickupDay || leg.day);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !refs(leg).length || leg.noLoadDeclared) return null;
  const matches = (index.events || []).filter(entry => {
    const event = entry.event;
    if (entry.day !== day || event.status !== 'ON' || event.noLoadDeclared) return false;
    const activity = [event.note,event.description,...list(event.reasons)].map(text).join(' ');
    if (!/\b(pickup|pick up|loading|hook)\b/i.test(activity) || /\b(unloading|unhook)\b/i.test(activity)) return false;
    const from = place(leg.freightOriginOverride?.city || leg.fromCity,leg.freightOriginOverride?.state || leg.fromState);
    const origin = place(event.city,event.state), to = place(leg.toCity,leg.toState), target = destination(event);
    if (from !== '|' && origin !== '|' && from !== origin) return false;
    if (to !== '|' && target && to !== target) return false;
    if (sameFreightReference(leg,event,index,day)) return true;
    // A three-digit abbreviation needs a saved full reference plus exact route
    // and pickup day. Route similarity or a suffix alone cannot create a link.
    return !!leg.fromCity && !!leg.fromState && !!leg.toCity && !!leg.toState
      && from === origin && to === target && sameFreightReference(leg,event,index,day,true);
  });
  return matches.length === 1 ? matches[0] : null;
}

export function distinctRecordedRoutes(legs, index, windowFor) {
  const out = new Map();
  for (const leg of legs) {
    const window = windowFor(leg,index);
    const key = window.recordedPickup
      ? [window.pickupDriverId,window.pickup.id,place(leg.toCity,leg.toState),ref(leg.toFacility),leg.stopSequence || 1].join(':')
      : 'route:' + leg.id;
    const previous = out.get(key);
    const score = row => Number(!!row.deliveryEventId)*4 + Number(!!row.pickupEventId)*2;
    if (!previous || score(leg) > score(previous)) out.set(key,leg);
  }
  return [...out.values()];
}

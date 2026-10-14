// Read-only operational view shared by Home, business and document filing.
// Broker load numbers and reviewed shipment aliases keep separate provenance.
import {routeHistoryIndex} from '../../core/routes/shipmentCarryover.js';
import {freightReferenceCatalog,sameFreightReference} from '../../core/routes/teamPickupV110445.js';
import {currentHomeLoad,cleanRoutePlace} from '../home/currentHomeLoadV110369.js';
import {getActiveLoadGuideV103} from './loadGuideV103.js';
import {localDayKey} from '../../shared/utils/date.js';
import {nowMin} from '../../shared/utils/time.js';
const text=v=>String(v??'').trim();
const ref=v=>text(v).toUpperCase().replace(/[^A-Z0-9]/g,'');
const list=v=>Array.isArray(v)?v:[];
const hidden=v=>/^(deleted|cancelled|canceled|dismissed|superseded)$/i.test(text(v));
const closed=v=>/^(delivered|completed|complete|closed|archived|invoiced|paid)$/i.test(text(v));
const number=load=>text(load?.canonicalLoadNo||load?.loadNo||load?.load_no);
const clock=context=>({day:context.day||localDayKey(),minute:context.minute??nowMin()});
function scope(state,store){
 const catalog=freightReferenceCatalog(store);
 return {...state,freightReferencesV110445:catalog.length?catalog:list(state.freightReferencesV110445)};
}
function owner(value,state,store){
 const key=ref(value);if(!key)return '';
 const matches=list(state.freightReferencesV110445).filter(row=>[row.loadNo,...list(row.aliases)].some(v=>ref(v)===key));
 const owners=[...new Set(matches.map(row=>ref(row.loadNo)))];
 if(owners.length>1)return '';
 if(!owners.length&&list(store.evidenceAliases).some(alias=>ref(alias.from)===key))return '';
 const target=owners[0]||key;
 const records=list(store.loads).filter(row=>!row.identityReviewV110326&&!row.brokerIdentityConflict&&!hidden(row.status)&&ref(number(row))===target);
 const numbers=[...new Set(records.map(number))];
 if(numbers.length===1)return numbers[0];
 const guides=Object.values(state.loadGuidesById||{}).filter(g=>!g.identityReviewV110326&&!hidden(g.status)&&ref(g.loadNo||g.orderNo)===target);
 const guideNumbers=[...new Set(guides.map(g=>text(g.loadNo||g.orderNo)))];
 return guideNumbers.length===1?guideNumbers[0]:'';
}
export function operationalLoadStatus(state={},store={},load={},context={}){
 if(closed(load.operationalStatus)||closed(load.status))return 'delivered';
 if(hidden(load.status))return 'removed';
 const no=number(load);if(!no)return 'booked';
 const scoped=context.scoped||scope(state,store),index=context.index||routeHistoryIndex(scoped),at=clock(context);
 const actions=index.events.filter(({day,event})=>day<at.day||day===at.day&&Number(event.startMin)<=at.minute)
  .filter(({event})=>event.status==='ON'&&sameFreightReference(event,{loadNo:no},index))
  .map(entry=>({...entry,kind:/\b(delivery|unloading|drop|dropped|unhook)\b/i.test([entry.event.note,entry.event.description,...list(entry.event.reasons)].join(' '))?'delivery':
    /\b(pickup|pick up|loading|hook)\b/i.test([entry.event.note,entry.event.description,...list(entry.event.reasons)].join(' '))?'pickup':''}))
  .filter(entry=>entry.kind);
 const last=actions.at(-1);
 if(last?.kind==='pickup')return 'in_transit';
 if(last?.kind==='delivery'){
  const guide=Object.values(state.loadGuidesById||{}).find(g=>ref(g.loadNo||g.orderNo)===ref(no));
  const deliveries=list(guide?.stops).filter(stop=>stop.type==='delivery');
  const expected=Math.max(deliveries.length,Number(guide?.deliveryCount)||0);
  if(expected>1&&!closed(guide?.status)){
   const done=list(guide?.completedStopIds).length;
   const legs=index.routes.filter(leg=>leg.loadGroupId===guide.id);
   if(done<expected&&legs.filter(leg=>closed(leg.status)).length<expected)return 'in_transit';
  }
  return 'delivered';
 }
 return /^(active|in_transit|in progress)$/i.test(text(load.status))?'in_transit':'booked';
}
export function currentOperationalLoad(state={},store={},context={}){
 const scoped=scope(state,store),at=clock(context),selected=Object.hasOwn(context,'selectedGuide')?context.selectedGuide:getActiveLoadGuideV103(state);
 const raw=currentHomeLoad(scoped,selected,at);
 if(raw){
  const canonical=raw.guide?text(raw.guide.loadNo||raw.guide.orderNo):owner(raw.loadNo,scoped,store);
  if(!canonical)return {...raw,identity:'reference',shipmentReference:raw.loadNo,canonicalLoadNo:''};
  const record=list(store.loads).find(load=>ref(number(load))===ref(canonical));
  if(operationalLoadStatus(scoped,store,record||{loadNo:canonical},at)==='delivered')return null;
  return {...raw,loadNo:canonical,canonicalLoadNo:canonical,identity:'load',broker:record?.broker||raw.guide?.broker||'',gross:record?.gross||raw.guide?.rate||'',loadedMiles:record?.loadedMiles||raw.guide?.miles||'',
   shipmentReference:ref(raw.loadNo)!==ref(canonical)?raw.loadNo:'',recordId:record?.id||''};
 }
 // An explicit current-load selection is useful before pickup. Completed duty
 // evidence and a stale form can never bring the delivered load back to Home.
 const info=state.loadInfo||{},canonical=owner(info.canonicalLoadNo||info.loadNo||info.shippingDocs,scoped,store);
 if(!canonical)return null;
 const record=list(store.loads).find(load=>ref(number(load))===ref(canonical));
 if(operationalLoadStatus(scoped,store,record||{loadNo:canonical},at)==='delivered'||closed(info.status))return null;
 return {loadNo:canonical,canonicalLoadNo:canonical,identity:'load',guide:null,recorded:false,broker:record?.broker||info.broker||'',gross:record?.gross||info.gross||info.rate||'',loadedMiles:record?.loadedMiles||info.loadedMiles||info.miles||'',
  origin:cleanRoutePlace(record?.origin)||[info.pickupCity,info.pickupState].filter(Boolean).join(', '),
  destination:cleanRoutePlace(record?.destination)||[info.deliveryCity,info.deliveryState].filter(Boolean).join(', '),recordId:record?.id||''};
}
export function operationalCandidateContext(state={},store={},context={}){
 const scoped=scope(state,store),at=clock(context),index=routeHistoryIndex(scoped),statuses={};
 for(const load of list(store.loads))statuses[text(number(load)).toUpperCase()]=operationalLoadStatus(state,store,load,{...at,scoped,index});
 return {current:currentOperationalLoad(state,store,at),statuses};
}
export function businessLoadRows(store={},context={}){
 const current=context.current?.identity==='load'?ref(context.current.loadNo):'';
 return list(store.loads).map(load=>{
  const operational=context.statuses?.[number(load).toUpperCase()];
  const status=['booked','in_transit'].includes(load.status)&&['delivered','in_transit'].includes(operational)?operational:load.status;
  return {...load,status,operationalStatus:operational||load.operationalStatus};
 }).sort((a,b)=>Number(ref(number(b))===current)-Number(ref(number(a))===current)||Number(closed(a.operationalStatus||a.status))-Number(closed(b.operationalStatus||b.status))||
   (Date.parse(b.deliveryDate||b.pickupDate||b.date)||Number(b.createdAt)||0)-(Date.parse(a.deliveryDate||a.pickupDate||a.date)||Number(a.createdAt)||0));
}

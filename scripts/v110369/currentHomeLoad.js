import {routeHistoryIndex,routeHistoryWindow} from '../../core/routes/shipmentCarryover.js';
import {canonicalRateConLoadNoV11029,rateConBackedGuideV11029} from '../loads/rateConAuthorityV11029.js';
const text=value=>String(value??'').trim();
const ref=value=>text(value).toUpperCase();
export function cleanRoutePlace(value){
  const place=text(value).replace(/\s+/g,' ');
  if(!place||!/[a-z]/i.test(place)||/^(?:(?:pickup|delivery|date|dates|time|appointment|location|origin|destination|shipper|consignee|to|from)\s*[:→-]?\s*)+$/i.test(place))return '';
  return place;
}
const cityState=(city,state)=>{const clean=cleanRoutePlace(city);return clean?[clean,/^[A-Z]{2}$/i.test(text(state))?text(state).toUpperCase():''].filter(Boolean).join(', '):'';};
function guideRoute(guide){
  const stops=Array.isArray(guide?.stops)?guide.stops:[],pickup=stops.find(s=>s.type==='pickup'),delivery=stops.filter(s=>s.type==='delivery').at(-1);
  return {origin:cityState(pickup?.city,pickup?.state)||cleanRoutePlace(pickup?.cityState)||cleanRoutePlace(guide?.origin),
    destination:cityState(delivery?.city,delivery?.state)||cleanRoutePlace(delivery?.cityState)||cleanRoutePlace(guide?.destination)};
}
const usable=guide=>guide&&rateConBackedGuideV11029(guide)&&!guide.identityReviewV110326&&!guide.excludedFromActiveLoad
  &&! /^(completed|delivered|closed|cancelled|canceled|archived|superseded|dismissed)$/i.test(text(guide.status));

// A read-only Home projection. Exact pickup/guide references may select a load;
// trailer, city, a VIN suffix and document upload time cannot identify it.
export function currentHomeLoad(state,selectedGuide,{day,minute}){
  const index=routeHistoryIndex(state),at=Number(minute);
  const active=(index.routes||[]).filter(leg=>!leg.noLoadDeclared&&!/empty|deadhead|reposition|bobtail/i.test(text(leg.kind))
    &&! /^(cancelled|canceled|archived|superseded|dismissed)$/i.test(text(leg.status)))
    .map(leg=>({leg,window:routeHistoryWindow(leg,index)})).filter(({window:w})=>w.recordedPickup&&w.startDay<=day
      &&!(w.undatedClosed&&!w.bounded)&&!(w.startDay===day&&(w.startMin===null||at<w.startMin))
      &&(!w.endDay||day<w.endDay||day===w.endDay&&w.endMin!==null&&at<w.endMin));
  active.sort((a,b)=>b.window.startDay.localeCompare(a.window.startDay)||b.window.startMin-a.window.startMin||Number(a.leg.stopSequence||1)-Number(b.leg.stopSequence||1));
  const current=active[0];
  if(!current){
    if(!usable(selectedGuide))return null;
    // An old selected guide tied to a finished pickup must not displace the
    // next shipment. Future plans without recorded pickups retain their guide.
    const linked=(index.routes||[]).filter(leg=>text(leg.loadGroupId)===text(selectedGuide.id));
    if(linked.some(leg=>routeHistoryWindow(leg,index).recordedPickup))return null;
    return {guide:selectedGuide,loadNo:canonicalRateConLoadNoV11029(selectedGuide.loadNo||selectedGuide.orderNo),...guideRoute(selectedGuide),recorded:false};
  }
  const leg=current.leg,reference=ref(leg.loadNo||leg.shippingDocs||leg.bol);
  const candidates=Object.values(state.loadGuidesById||{}).filter(usable);
  const linked=candidates.find(g=>text(g.id)&&text(g.id)===text(leg.loadGroupId));
  const matches=candidates.filter(g=>reference&&[g.loadNo,g.orderNo,g.bolNo,g.shippingDocs].some(v=>ref(v)===reference));
  const guide=linked||(matches.length===1?matches[0]:null),route=guideRoute(guide);
  return {guide,recorded:true,loadNo:guide?canonicalRateConLoadNoV11029(guide.loadNo||guide.orderNo):text(leg.loadNo||leg.shippingDocs||leg.bol),
    origin:route.origin||cityState(leg.fromCity,leg.fromState),destination:route.destination||cityState(leg.toCity,leg.toState)};
}

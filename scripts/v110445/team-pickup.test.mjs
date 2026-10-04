import assert from 'node:assert/strict';
import fs from 'node:fs';
import {freightReferenceCatalog} from '../../source/src/core/routes/teamPickupV110445.js';
import {routeHistoryIndex,routeHistoryWindow,routeStatusForLogDay,shipmentContextForEvents} from '../../source/src/core/routes/shipmentCarryover.js';
import {routeLegsForDayCanonical} from '../../source/src/core/routes/routeNormalization.js';
import {switchTeamDriver} from '../../source/src/core/team/teamLogbook.js';
const day='2026-09-30',delDay='2026-10-01',after='2026-10-02';
const pickup={id:'co-pickup',status:'ON',startMin:1057,endMin:1072,city:'Harvey',state:'IL',destination:'East Haven, CT',shippingDocs:'LOAD-987654',note:'Pickup / Loading'};
const delivery={id:'own-delivery',status:'ON',startMin:500,endMin:530,city:'East Haven',state:'CT',shippingDocs:'LOAD-987654',note:'Delivery / Unloading'};
const leg={id:'plan',day,pickupDay:day,fromCity:'Harvey',fromState:'IL',toCity:'East Haven',toState:'CT',shippingDocs:'803',kind:'loaded',source:'manual_form',status:'open'};
const state={activeDriverId:'alpha',teamDrivers:[{id:'alpha',name:'Alpha'},{id:'beta',name:'Beta'}],activeDay:day,driverProfile:{name:'Alpha'},
 eventsByDay:{[day]:[{id:'rest',status:'SB',startMin:0,endMin:1440}],[delDay]:[delivery]},signatureByDay:{[day]:{signed:true,signature:'unchanged'}},manualMilesByDay:{[day]:100},
 teamLogbooksByDriverId:{beta:{activeDay:day,eventsByDay:{[day]:[pickup]},manualMilesByDay:{[day]:250},signatureByDay:{[day]:{signed:true,signature:'beta'}}}},
 routeLegsByDay:{[day]:[leg]},freightReferencesV110445:freightReferenceCatalog({loads:[{loadNo:'LOAD-987654',aliases:['81835803'],pickupDate:day}]})};
const before=structuredClone(state);
const window=(s=state,l=leg)=>routeHistoryWindow(l,routeHistoryIndex(s));
assert.equal(window().recordedPickup,true);assert.equal(window().pickupDriverName,'Beta');assert.equal(window().startMin,1057);
assert.equal(window().endDay,delDay);assert.equal(routeStatusForLogDay(leg,day,state),'In transit');assert.equal(routeStatusForLogDay(leg,delDay,state),'Done');
assert.equal(routeLegsForDayCanonical(state,after).length,0);
assert.equal(window(state,{...leg,shippingDocs:'81835803'}).recordedPickup,true);
assert.equal(window({...state,freightReferencesV110445:[]},{...leg,shippingDocs:pickup.shippingDocs}).recordedPickup,true);
assert.equal(window({...state,freightReferencesV110445:[]}).recordedPickup,false,'no suffix-only inference');
assert.equal(window(state,{...leg,toCity:'New Haven'}).recordedPickup,false,'different city is a conflict');
assert.equal(window(state,{...leg,pickupDay:'2026-09-29'}).recordedPickup,false);
assert.equal(window(state,{...leg,pickupEventId:'missing-source'}).recordedPickup,false,'do not replace explicit links');
for(const change of [{voided:true},{deleted:true},{synthetic:true},{status:'OFF'},{note:'Delivery / Unloading'}]){
 const s=structuredClone(state);Object.assign(s.teamLogbooksByDriverId.beta.eventsByDay[day][0],change);assert.equal(window(s).recordedPickup,false);
}
const ambiguous=structuredClone(state);ambiguous.teamLogbooksByDriverId.beta.eventsByDay[day].push({...pickup,id:'other-pickup',startMin:1100});assert.equal(window(ambiguous).recordedPickup,false);
const sharedSuffix=structuredClone(state);sharedSuffix.freightReferencesV110445.push({loadNo:'LOAD-OTHER',aliases:['99999803'],pickupDay:day});assert.equal(window(sharedSuffix).recordedPickup,false);
const duplicate=structuredClone(state);duplicate.routeLegsByDay[day].push({...leg,id:'actual',pickupEventId:pickup.id,source:'pickup_event',shippingDocs:pickup.shippingDocs});assert.equal(routeLegsForDayCanonical(duplicate,day).length,1);assert.equal(routeLegsForDayCanonical(duplicate,day)[0].id,'actual');
duplicate.routeLegsByDay[day][1].status='cancelled';assert.equal(routeLegsForDayCanonical(duplicate,day)[0].id,'plan');
const deliveredCopy=structuredClone(state);
deliveredCopy.eventsByDay[delDay][0].shippingDocs='EDITED-REFERENCE';
deliveredCopy.routeLegsByDay[day]=[
 {...leg,id:'pickup-only',pickupEventId:pickup.id,shippingDocs:pickup.shippingDocs},
 {...leg,id:'delivery-linked',deliveryEventId:delivery.id,deliveryDay:delDay,status:'delivered'}
];
assert.equal(routeLegsForDayCanonical(deliveredCopy,delDay)[0].id,'delivery-linked');
assert.equal(routeStatusForLogDay(routeLegsForDayCanonical(deliveredCopy,delDay)[0],delDay,deliveredCopy),'Done');
assert.equal(routeLegsForDayCanonical(deliveredCopy,after).length,0,'retain authoritative delivery before day membership filtering');
const distinctStops=structuredClone(deliveredCopy);distinctStops.routeLegsByDay[day][0].toFacility='First warehouse';distinctStops.routeLegsByDay[day][1].toFacility='Second warehouse';assert.equal(routeLegsForDayCanonical(distinctStops,day).length,2);
for(const store of [
 {loads:[{loadNo:pickup.shippingDocs}],evidenceAliases:[{from:'81835803',to:pickup.shippingDocs}]},
 {loads:[],evidenceRecoveryHistory:[{aliases:[{from:'81835803',to:pickup.shippingDocs}]}]},
 {loads:[{loadNo:pickup.shippingDocs,documentTransferAliases:[{from:'81835803',to:pickup.shippingDocs}]}]},
 {loads:[{loadNo:'81835803'},{loadNo:pickup.shippingDocs}],evidenceAliases:[{from:'81835803',to:pickup.shippingDocs}]},
])assert.equal(window({...state,freightReferencesV110445:freightReferenceCatalog(store)}).recordedPickup,true);
const conflictCatalog=freightReferenceCatalog({loads:[],evidenceAliases:[{from:'81835803',to:pickup.shippingDocs},{from:'81835803',to:'OTHER'}]});assert.equal(window({...state,freightReferencesV110445:conflictCatalog}).recordedPickup,false);
const conflictingSaved=freightReferenceCatalog({loads:[{loadNo:pickup.shippingDocs,aliases:['81835803']}],evidenceAliases:[{from:'81835803',to:pickup.shippingDocs},{from:'81835803',to:'OTHER'}]});assert.equal(window({...state,freightReferencesV110445:conflictingSaved}).recordedPickup,false);
const switched=switchTeamDriver(state,'beta',day);assert.equal(window(switched).pickupDriverName,'Beta');assert.equal(routeStatusForLogDay(leg,delDay,switched),'Done');
const annotated=shipmentContextForEvents(state,day,[{id:'drive',status:'D',startMin:1100}],[leg]);assert.equal(annotated[0].shipmentContextV110367[0].shippingDocs,'803');
assert.deepEqual(state,before,'projection must not change either driver records or signatures');
const screen=fs.readFileSync('source/src/modules/logbook/DayLogScreen.jsx','utf8');
const fn=screen.slice(screen.indexOf('function legMeta('),screen.indexOf('function driverNameForState('));
const meta=new Function('routeHistoryWindow','routeHistoryIndex','routeStatusForLogDay',fn+';return legMeta;')(routeHistoryWindow,routeHistoryIndex,routeStatusForLogDay);
assert.match(meta(leg,day,state),/In transit.*Pickup by Beta/);assert.doesNotMatch(meta(leg,day,state),/no pickup recorded/);
assert.match(meta(leg,delDay,state),/Done/);
console.log('PASS team pickup: exact references, documented full BOL and abbreviation, driver switching, completion, display dedupe, conflict/ambiguity guards, unchanged duty/mileage/signatures');

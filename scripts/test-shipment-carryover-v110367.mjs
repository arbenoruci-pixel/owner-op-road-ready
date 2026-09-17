import assert from 'node:assert/strict';
import {register} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {routeLegsForDayCanonical as routes, routeLegsForDayMiles as miles} from '../source/src/core/routes/routeNormalization.js';
import {shipmentContextForEvents as project, shipmentContextLabel, routeStatusForLogDay} from '../source/src/core/routes/shipmentCarryover.js';
import {createCertificationRecord, certificationStatusV1032} from '../source/src/modules/logbook/certificationV110.js';
import {fixture, pickupDay, middleDay, deliveryDay} from './v110367/fixture.mjs';
register(new URL('./test-jsx-loader.mjs', import.meta.url));
const {default:EventList} = await import('../source/src/modules/logbook/EventList.jsx');
const shown = (s, day) => project(s, day, s.eventsByDay[day] || [], routes(s, day));
let passed = 0;
function test(label, fn) { fn(); passed++; console.log('PASS — ' + label); }

test('delivered loads retain every intermediate day and stop after actual delivery', () => {
  const s = fixture();
  for (const day of [pickupDay, middleDay, deliveryDay]) assert.deepEqual(routes(s, day).map(x=>x.id), ['fixture-route']);
  assert.deepEqual(routes(s, '2026-09-13'), []);
  assert.deepEqual(routes(s, '2026-09-17'), []);
  assert.equal(routeStatusForLogDay(routes(s, middleDay)[0], middleDay, s), 'In transit');
  assert.equal(routeStatusForLogDay(routes(s, deliveryDay)[0], deliveryDay, s), 'Done');
});
test('recorded open pickups carry despite an unrelated current guide or newer load', () => {
  const s = fixture(), leg = s.routeLegsByDay[pickupDay][0];
  Object.assign(leg, {status:'open', deliveryDay:'', deliveryEventId:'', deliveryMin:null});
  for (const loadNo of ['NEW-REF', '', 'STALE-REF']) {
    s.loadInfo = {loadNo}; s.activeLoadGuideId = 'unrelated';
    s.loadGuidesById.unrelated = {id:'unrelated', loadNo:'UNRELATED'};
    assert.equal(routes(s, middleDay)[0]?.shippingDocs, '123', 'short explicit reference survives scope filtering');
  }
});
test('Driving, Sleeper, pre-trip and breaks show exact BOL, trailer and destination', () => {
  const s = fixture();
  for (const row of shown(s, middleDay)) assert.equal(shipmentContextLabel(row.shipmentContextV110367), 'BOL 123 · Trailer UNIT-A · Going to New York, NY');
  assert.ok(!shown(s, pickupDay)[0].shipmentContextV110367, 'no load before pickup');
  assert.ok(!shown(s, pickupDay)[1].shipmentContextV110367, 'pickup keeps its own exact metadata');
  assert.ok(shown(s, pickupDay)[2].shipmentContextV110367);
  const deliveryRows = shown(s, deliveryDay);
  assert.ok(deliveryRows[0].shipmentContextV110367);
  assert.ok(!deliveryRows[1].shipmentContextV110367, 'delivery keeps its own metadata');
  assert.ok(!deliveryRows[2].shipmentContextV110367, 'no carry after delivery');
});
test('actual event days and times override stale route timestamps without writing repairs', () => {
  const s = fixture(), leg = s.routeLegsByDay[pickupDay][0];
  Object.assign(leg, {pickupDay:'2026-09-12', pickupMin:10, deliveryDay:'2026-09-17', deliveryMin:1000});
  const before = structuredClone(s);
  assert.deepEqual(routes(s,'2026-09-13'), []);
  assert.deepEqual(routes(s,'2026-09-17'), []);
  assert.ok(!shown(s, deliveryDay).at(-1).shipmentContextV110367);
  assert.deepEqual(s, before);
});
test('newest route revision, cancellations and erased-day exclusions remain authoritative', () => {
  const s = fixture(), fresh = s.routeLegsByDay[pickupDay][0];
  const stale = {...fresh, status:'open', deliveryDay:'', deliveryEventId:'', updatedAt:1000};
  for (const copies of [[stale,fresh], [fresh,stale]]) {
    s.routeLegsByDay = {a:[copies[0]], b:[copies[1]]};
    assert.equal(routes(s,middleDay).length,1);
    assert.deepEqual(routes(s,'2026-09-17'),[]);
    s.routeLegsByDay.c = [{...fresh,status:'cancelled',updatedAt:3000}];
    assert.deepEqual(routes(s,middleDay),[]);
    s.routeLegsByDay.c = [{...fresh,logbookExcludedDaysV110352:[middleDay],updatedAt:3000}];
    assert.deepEqual(routes(s,middleDay),[]);
  }
});
test('unconfirmed imports, voided pickups and empty moves cannot fabricate event shipment context', () => {
  for (const change of [s=>{s.eventsByDay[pickupDay][1].voided=true;},s=>{s.routeLegsByDay[pickupDay][0].pickupEventId='missing';},s=>{s.routeLegsByDay[pickupDay][0].kind='empty/reposition';},s=>{s.eventsByDay[pickupDay][1].noLoadDeclared=true;}]) {
    const s=fixture();change(s);assert.ok(shown(s,middleDay).every(row=>!row.shipmentContextV110367));
  }
  const s=fixture();s.routeLegsByDay[pickupDay]=[{id:'import',day:pickupDay,pickupDay,status:'open',shippingDocs:'OLD-REF'}];
  assert.deepEqual(routes(s,middleDay),[], 'legacy unconfirmed route still respects scope');
});
test('multi-stop legs remain active independently until their own delivery', () => {
  const s=fixture(), first=s.routeLegsByDay[pickupDay][0];
  s.routeLegsByDay[pickupDay].push({...first,id:'second-stop',toCity:'Boston',toState:'MA',deliveryDay:'2026-09-18',deliveryEventId:'',deliveryMin:600});
  assert.equal(routes(s,middleDay).length,2);
  assert.deepEqual(routes(s,'2026-09-17').map(x=>x.id),['second-stop']);
  assert.equal(shown(s,deliveryDay).at(-1).shipmentContextV110367[0].destination,'Boston, MA');
});
test('midnight continuation remains one existing event with read-only shipment annotation', () => {
  const s=fixture(), carry={id:'carry',status:'SB',startMin:0,endMin:50,displayOnly:true,carriedFromPreviousDay:true};
  const view=project(s,middleDay,[carry],routes(s,middleDay));
  assert.equal(view.length,1);assert.equal(view[0].id,'carry');
  assert.ok(view[0].shipmentContextV110367);assert.ok(!carry.shipmentContextV110367);
});
test('projections preserve raw duty, mileage, load state and certifications', () => {
  const s=fixture();s.manualMilesByDay={[middleDay]:744};
  for (const day of [pickupDay,middleDay,deliveryDay]) s.signatureByDay[day]=createCertificationRecord(s,day,{now:10000});
  const before=structuredClone(s);
  for (const day of [pickupDay,middleDay,deliveryDay]) {
    shown(s,day);assert.equal(certificationStatusV1032(s,day).status,'Certified');
  }
  assert.deepEqual(miles(s,middleDay),[], 'route miles are not repeated on intervening days');
  assert.deepEqual(s,before);
});
test('real React event rows render carried metadata without creating pickup events', () => {
  const s=fixture(), rows=shown(s,middleDay);
  const html=renderToStaticMarkup(React.createElement(EventList,{events:rows,selectedIds:[]}));
  assert.equal((html.match(/BOL 123/g)||[]).length, rows.length);
  assert.equal((html.match(/Trailer UNIT-A/g)||[]).length, rows.length);
  assert.ok(!html.includes('Hook / Pickup Trailer'));
});
console.log(passed + ' shipment carryover regression groups passed');

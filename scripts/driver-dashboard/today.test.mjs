import assert from 'node:assert/strict';
import test from 'node:test';
import { todayStop } from './todayStop.js';

test('manual load navigation requires a street and a locality from this load', () => {
  for (const origin of ['410 Example Road', 'Albany, NY', '']) {
    assert.equal(todayStop({origin}, {}, null).address.routable, false, origin);
  }
  const selected = todayStop({origin:'Albany, NY'}, {pickupAddress:'410 Example Road',pickupDate:'2026-11-24',pickupTime:'08:00'}, null);
  assert.deepEqual(selected.address, {display:'410 Example Road, Albany, NY',routable:true});
  assert.equal(selected.appointment,'2026-11-24 08:00');
  assert.equal(todayStop({origin:'410 Example Road, Albany, NY'}, {}, null).address.routable,true);
});

test('guided delivery uses its saved address, appointment zone and reference', () => {
  const stops = [
    {id:'p',type:'pickup',address:'170 Example Street, Albany, NY'},
    {id:'d1',type:'delivery',city:'Springfield',state:'MA'},
    {id:'d2',type:'delivery',company:'Example Receiving',street:'500 Example Avenue',city:'Boston',state:'MA',zip:'02110',appointmentDate:'2026-11-24',appointmentTime:'08:00–10:00',timeZoneLabel:'ET',deliveryReference:'REF-9'},
  ];
  const current={guide:{stops}}, step={phase:'delivery_2',stopSequence:2};
  const result=todayStop(current, {}, {currentStep:step,currentStop:stops[2]});
  assert.equal(result.label,'Delivery 2 of 2');
  assert.deepEqual(result.address,{display:'500 Example Avenue, Boston, MA 02110',routable:true});
  assert.equal(result.appointment,'2026-11-24 08:00–10:00');assert.equal(result.zone,'ET');
  assert.equal(result.reference,'Delivery # REF-9');
  assert.equal(todayStop(current, {}, {currentStep:{phase:'closeout'},currentStop:stops[2]}), null);
  assert.equal(todayStop(current, {}, {currentStep:step,currentStop:null}), null);
});

test('a guide-less in-transit load never picks arbitrarily among delivery stops', () => {
  const stops=[{type:'pickup',street:'2 Example Rd'}, {type:'delivery',city:'Hartford'}, {type:'delivery',city:'Boston'}];
  assert.equal(todayStop({recorded:true}, {stops}, null),null);
});

test('legacy stop roles and sequenced drops agree across Today and the folder', async () => {
  const {routeStops} = await import('../driver-folder/folderReview.js');
  for (const drops of [
    [{type:'DROP'}, {type:'drop-off'}],
    [{role:'receiver'}, {stopType:'consignee'}],
    [{deliverySequence:1}, {stopSequence:2}],
    [{type:'delivery'}, {sequence:2}],
  ]) {
    const record = {status:'in_transit',deliveryAddress:'105 Last Road, Albany, NY',
      stops:[{type:'shipper',company:'Pickup'}, ...drops.map((s, i) => ({...s,company:'Receiver '+(i+1)}))]};
    assert.equal(todayStop({destination:record.deliveryAddress},record,null),null);
    assert.deepEqual(routeStops(record).map(s=>[s.name,s.pickup,s.sequence]),[
      ['Pickup',true,0],['Receiver 1',false,1],['Receiver 2',false,2]]);
  }
  const incomplete = {deliveryCount:3,deliveryAddress:'105 Last Road, Albany, NY'};
  assert.equal(todayStop({recorded:true},incomplete,null),null);
});

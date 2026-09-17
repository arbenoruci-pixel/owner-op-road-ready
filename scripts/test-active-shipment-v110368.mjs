import assert from 'node:assert/strict';
import {routeLegsForDayCanonical as routes} from '../source/src/core/routes/routeNormalization.js';
import {shipmentContextForEvents as project,shipmentContextLabel as label} from '../source/src/core/routes/shipmentCarryover.js';
import {sequenceFixture,row} from './v110368/fixture.mjs';
import {guideFixture,pickupDay,middleDay,deliveryDay} from './v110367/fixture.mjs';
const shown=(s,d)=>project(s,d,s.eventsByDay[d]||[],routes(s,d));
const refs=rows=>rows.map(e=>(e.shipmentContextV110367||[]).map(x=>x.shippingDocs));
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS — '+name);};
test('four old unclosed routes show only the shipment aboard at each event time',()=>{
 const s=sequenceFixture(),before=structuredClone(s);
 assert.deepEqual(refs(shown(s,'2026-09-17')),[['8494'],['8494'],['8494'],['8494'],[],[]]);
 assert.deepEqual(refs(shown(s,'2026-09-14')),[['97155'],[],['001']]);
 assert.deepEqual(refs(shown(s,'2026-09-15')),[['001'],[],['324']]);
 assert.deepEqual(refs(shown(s,'2026-09-16')),[['324'],[],['8494']]);
 assert.deepEqual(routes(s,'2026-09-17').map(l=>l.shippingDocs),['8494']);
 assert.deepEqual(routes(s,'2026-09-18'),[]);
 assert.deepEqual(s,before,'projection leaves records and certifications untouched');
});
test('the next actual pickup closes stale carryover even if it has no route yet',()=>{
 const s=sequenceFixture();delete s.routeLegsByDay['2026-09-16'];
 assert.deepEqual(refs(shown(s,'2026-09-17')),[[],[],[],[],[],[]]);
 assert.deepEqual(refs(shown(s,'2026-09-16')),[['324'],[],[]]);
});
test('future guides and voided or synthetic pickup rows cannot replace an actual shipment',()=>{
 const s=sequenceFixture();s.eventsByDay['2026-09-17'].splice(1,0,row('fake','ON',10,11,{note:'Pickup',shippingDocs:'FAKE',voided:true}),row('synthetic','ON',12,13,{note:'Pickup',shippingDocs:'SYNTH',displayOnly:true}));
 s.loadInfo={shippingDocs:'FUTURE'};s.activeLoadGuideId='future';s.loadGuidesById.future={loadNo:'FUTURE'};
 assert.equal(label(shown(s,'2026-09-17').find(e=>e.id==='drive').shipmentContextV110367),'BOL 8494 · Trailer 511865 · Going to Destination 8494, WI');
});
test('conflicting delivery references and trailers cannot close the current load',()=>{
 for(const extra of [{shippingDocs:'OTHER'},{droppedTrailer:'OTHER'}]){
  const s=sequenceFixture();Object.assign(s.eventsByDay['2026-09-17'][4],extra);
  assert.deepEqual(refs(shown(s,'2026-09-17')).at(-1),['8494']);
 }
});
test('an unlabeled actual drop closes the sole current shipment; pre-trip does not',()=>{
 const s=sequenceFixture();Object.assign(s.eventsByDay['2026-09-17'][4],{shippingDocs:'',droppedTrailer:''});
 assert.deepEqual(refs(shown(s,'2026-09-17')),[['8494'],['8494'],['8494'],['8494'],[],[]]);
});
test('legacy delivered routes without a dated delivery cannot appear forever',()=>{
 const s=sequenceFixture();s.routeLegsByDay['2026-09-16'][0].status='delivered';s.eventsByDay['2026-09-17']=s.eventsByDay['2026-09-17'].slice(0,4);
 assert.ok(shown(s,'2026-09-17').every(e=>!e.shipmentContextV110367));
});
test('unlinked multi-stop deliveries end only the matching destination',()=>{
 const s=guideFixture({firstDelivered:true,finalDelivered:true});
 for(const l of Object.values(s.routeLegsByDay).flat())l.deliveryEventId='';
 assert.equal(shown(s,middleDay)[0].shipmentContextV110367[0].destination,'New York, NY');
 assert.equal(shown(s,deliveryDay).at(-1).shipmentContextV110367[0].destination,'Boston, MA');
 assert.ok(!shown(s,'2026-09-17').at(-1).shipmentContextV110367);
});
console.log(passed+' active-shipment regression groups passed');

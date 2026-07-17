import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrichDriverGuideProgressV1043, inferMultiStopProgressV1043, repairMultiStopProgressStateV1043 } from '../source/src/modules/loads/multiStopProgressV1043.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ok = (value, message) => { if (!value) throw new Error(`v104.3 regression failed: ${message}`); console.log(`PASS ${message}`); };
const delivery = (id, city, startMin, endMin, note = 'Delivery / Unloading') => ({ id, status:'ON', startMin, endMin, city, state:'MN', note, shippingDocs:'391912', loadNo:'391912' });

const guide = {
  id:'load_guide_391912', loadNo:'391912', orderNo:'391912', status:'active', completedStopIds:['1','2','3'],
  stops:[
    { id:'pickup', type:'pickup', city:'Rochelle', state:'IL' },
    { id:'d1', type:'delivery', city:'Madison', state:'WI' },
    { id:'d2', type:'delivery', city:'Eau Claire', state:'WI' },
    { id:'d3', type:'delivery', city:'Minneapolis', state:'MN' },
    { id:'d4', type:'delivery', company:'SYSCO SAINT CLOUD', city:'Saint Cloud', state:'MN', poNumber:'4929910' },
    { id:'d5', type:'delivery', company:'Final Receiver', city:'Rice', state:'MN', poNumber:'4929911' },
  ],
  steps:[
    ['route_delivery_4','route',4],['arrive_delivery_4','status',4],['delivery_docs_4','manual',4],['complete_stop_4','complete_stop',4],['depart_delivery_4','status',4],
    ['route_delivery_5','route',5],['arrive_delivery_5','status',5],['delivery_docs_5','manual',5],['complete_stop_5','complete_stop',5],
  ].map(([id,kind,stopSequence]) => ({ id, kind, stopSequence, title:id, complete:false })),
};
const stop4Note = 'Pre-trip inspection · Delivery / Unloading';
const state = {
  activeLoadGuideId:guide.id, currentStatus:'ON', currentReason:'Delivery / Unloading', currentLocation:{ city:'Rice', state:'MN' },
  loadInfo:{ guideId:guide.id, loadNo:'391912', shippingDocs:'391912', currentStopSequence:4 },
  loadGuidesById:{ [guide.id]:guide },
  eventsByDay:{ '2026-07-17':[
    delivery('stop4','St. Cloud',454,487,stop4Note),
    { id:'drive45', status:'D', startMin:487, endMin:552, city:'St. Cloud', state:'MN', note:'Driving', shippingDocs:'391912', loadNo:'391912' },
    delivery('stop5','Rice',552,557),
  ]},
  routeLegsByDay:{ '2026-07-17':[1,2,3,4,5].map(stopSequence => ({ id:`leg${stopSequence}`, loadGroupId:guide.id, loadNo:'391912', shippingDocs:'391912', stopSequence, status:stopSequence <= 3 ? 'delivered' : 'planned', stopStatus:stopSequence <= 3 ? 'done' : 'planned' })) },
};

const inferred = inferMultiStopProgressV1043(state, guide);
ok(inferred.activeSequence === 5 && inferred.currentSequence === 5, 'stop 5 is active');
ok(JSON.stringify(inferred.completedSequences) === JSON.stringify([1,2,3,4]), 'stop 4 closes after stop 5 is reached');
ok(inferred.matchedBySequence[4]?.event?.id === 'stop4', 'Saint Cloud matches St. Cloud');

const base = { guide, steps:guide.steps, completed:0, total:guide.steps.length, percent:0, currentStep:guide.steps[0], complete:false };
const enriched = enrichDriverGuideProgressV1043(state, base);
ok(enriched.steps.find(s => s.id === 'complete_stop_4')?.complete, 'stop 4 workflow completes');
ok(enriched.steps.find(s => s.id === 'route_delivery_5')?.complete && enriched.steps.find(s => s.id === 'arrive_delivery_5')?.complete, 'stop 5 route and arrival complete');
ok(!enriched.steps.find(s => s.id === 'complete_stop_5')?.complete, 'stop 5 stays in progress');
ok(enriched.currentStep?.id === 'delivery_docs_5', 'Home advances to stop 5 paperwork');
ok(enriched.completedStops === 4 && enriched.currentStopSequence === 5, 'mission shows 4 of 5 delivered');

const repaired = repairMultiStopProgressStateV1043(state, { source:'test' });
ok(repaired.routeLegsByDay['2026-07-17'].find(l => l.stopSequence === 4)?.status === 'delivered', 'leg 4 repaired to delivered');
ok(repaired.routeLegsByDay['2026-07-17'].find(l => l.stopSequence === 5)?.status === 'in_progress', 'leg 5 repaired to in progress');
ok(repaired.loadInfo.currentStopSequence === 5 && repaired.loadInfo.completedStops === 4, 'active load state repaired');
const old = repaired.eventsByDay['2026-07-17'].find(e => e.id === 'stop4');
ok(old.startMin === 454 && old.endMin === 487 && old.status === 'ON' && old.note === stop4Note, 'repair preserves certified log content');
ok(old.deliveryCompleted === true && old.deliveryStopSequence === 4, 'safe stop metadata added');

const status = fs.readFileSync(path.join(ROOT, 'source/src/modules/status/StatusWorkflowSheet.jsx'), 'utf8');
ok(status.includes("initialStatus === 'ON' ? ''") && status.includes('Choose at least one ON DUTY activity.'), 'new ON DUTY entry has no hidden Pre-trip');
ok(fs.readFileSync(path.join(ROOT, 'source/src/modules/loads/loadGuideV103.js'), 'utf8').includes('enrichDriverGuideProgressV1043'), 'mission resolver is integrated');
ok(fs.readFileSync(path.join(ROOT, 'source/src/modules/home/adaptiveHomeLogicV1038.js'), 'utf8').includes('progress.currentStopSequence'), 'Home follows actual stop');
console.log('PASS — v104.3 live multi-stop progress regression suite');

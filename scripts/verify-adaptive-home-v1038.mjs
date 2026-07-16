import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homeModeV1038, missionSnapshotV1038, rateConInstructionRowsV1038 } from '../source/src/modules/home/adaptiveHomeLogicV1038.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

assert.equal(homeModeV1038(null, null), 'no_load');
assert.equal(homeModeV1038({ id:'g1', status:'active' }, null), 'active_load');
assert.equal(homeModeV1038({ id:'g1', status:'completed' }, null), 'no_load');

const guide = {
  id:'load_guide_391912', loadNo:'391912', orderNo:'391912', legNo:'395851', pickupNumber:'5010037538',
  trackingProvider:'MacroPoint', origin:'Rochelle, IL', destination:'Rice, MN', deliveryCount:5,
  requirements:{ trackingProvider:'MacroPoint', trackingRequired:true, preCoolTemperature:-10, temperaturePerBol:true, detentionTimesRequired:true, sealRecordRequired:true, osdCallBeforeLeaving:true, paperworkDeadlineHours:24 },
  stops:[
    { type:'pickup', cityState:'Rochelle, IL' },
    { type:'delivery', company:'SYSCO SAINT CLOUD', cityState:'Saint Cloud, MN', appointment:'Jul 17 · 06:00', poNumber:'04929910' },
  ],
};
const rows = rateConInstructionRowsV1038(guide);
assert(rows.some(row => /MacroPoint/.test(row.label)));
assert(rows.some(row => /Pre-cool/.test(row.label)));
assert(rows.some(row => /seal/i.test(row.label)));
assert(rows.some(row => /in\/out/i.test(row.label)));
assert(rows.some(row => /OS&D/i.test(row.label)));
assert(rows.some(row => /24h/.test(row.label)));

const steps = [
  { id:'route_delivery_1', kind:'route', title:'Route to stop 1', stopSequence:1, location:'Saint Cloud, MN', complete:false, checklist:['PO 04929910'] },
  { id:'arrive_delivery_1', kind:'status', title:'Log arrival at stop 1', stopSequence:1, complete:false },
  { id:'delivery_docs_1', kind:'manual', title:'Finish stop 1 paperwork', stopSequence:1, complete:false },
  { id:'complete_stop_1', kind:'complete_stop', title:'Complete stop 1', stopSequence:1, complete:false },
];
const snapshot = missionSnapshotV1038({ guide, steps, currentStep:steps[0], percent:60, completed:20, total:33 }, { loadNo:'391912', currentStop:1 });
assert.equal(snapshot.currentStep.id, 'route_delivery_1');
assert.equal(snapshot.currentStop.company, 'SYSCO SAINT CLOUD');
assert.equal(snapshot.nextSteps.length, 3);
assert(snapshot.instructions.some(item => /04929910/.test(item.label)));

const home = read('source/src/modules/home/HomeScreen.jsx');
const component = read('source/src/modules/home/AdaptiveHomeV1038.jsx');
const css = read('source/src/command-center.css');
assert.match(home, /AdaptiveHomeV1038/);
assert.match(home, /onOpenGuide=\{\(\) => setGuideOpen\(true\)\}/);
assert.match(component, /ACTIVE LOAD COMMAND/);
assert.match(component, /Ready for the next Rate Con/);
assert.match(component, /Do not miss from Rate Con/);
assert.match(css, /v103\.8 Adaptive Home/);
console.log('verify-adaptive-home-v1038 passed');

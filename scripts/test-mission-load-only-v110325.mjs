import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checklistFixture } from './v110321/checklistFixture.mjs';
import { resolveDriverGuideV103, applyLoadGuideActionV103, getActiveLoadGuideV103 } from '../source/src/modules/loads/loadGuideV103.js';
import { safeMissionProgressV10966 } from '../source/src/modules/loads/safeMissionModelV10966.js';
import { buildInstructionGuideV110311 } from '../source/src/modules/loads/instructionGuideV110311.js';

const f = checklistFixture();
const resolve = (state=f.state, store=f.store) => resolveDriverGuideV103(state, state.loadGuidesById[f.guide.id], store);
const initial = structuredClone(f);
const progress = resolve();
assert.deepEqual(progress, resolve({...f.state, eventsByDay:{}}), 'logbook contents cannot affect Mission progress');
assert.deepEqual(progress, safeMissionProgressV10966(f.state, f.guide, f.store), 'Home and Mission agree');
assert.equal(progress.completed, 3, 'only manual confirmations and the saved BOL count');
assert.equal(progress.currentStep.id, 'pickup_ready', 'navigation never occupies the next required step');
assert.equal(progress.total, 7);
assert.equal(progress.percent, 43);
assert.equal(progress.navigationSteps.length, 2);
assert.ok(progress.navigationSteps.every(s=>s.kind==='route'));
assert.ok(progress.steps.every(s=>s.kind!=='route'));
assert.ok(progress.steps.every(step => step.completionSource !== 'logbook'));
assert.ok(progress.steps.every(step => !['status','logbook'].includes(step.kind)));
assert.deepEqual(f, initial, 'guide reads leave every saved field intact');
const clickedRoutes = structuredClone(f.state);
for (const step of progress.navigationSteps) clickedRoutes.loadGuidesById[f.guide.id].manualDone[step.id] = 1;
assert.equal(resolve(clickedRoutes).percent, progress.percent, 'old route Done flags do not affect progress');

// The adapter must not even read duty records or stale logbook document summaries.
const guarded = {...f.state};
for (const field of ['eventsByDay','documentsByDay','inspectionByDay','signatureByDay','formByDay']) {
  Object.defineProperty(guarded, field, {get(){throw new Error('Mission read '+field);}});
}
assert.deepEqual(resolve(guarded), progress);
const oldSummary = {...f.state, documentsByDay:{'2026-09-08':[f.bol]}};
assert.equal(resolve(oldSummary, {loads:f.store.loads}).bol, null, 'guide documents come from the current Vault');

f.bol.podSigned = true;
f.bol.stopSequence = 1;
const withPod = resolve();
assert.equal(withPod.steps.find(s=>s.id==='final_pod').complete, true);
assert.equal(withPod.steps.find(s=>s.id==='pickup_ready').complete, false, 'documents do not confirm physical pickup requirements');
f.bol.podSigned = false;
assert.equal(resolve().steps.find(s=>s.id==='final_pod').complete, false, 'signature corrections reopen document requirements');
f.guide.steps.find(s=>s.id==='pickup_ready').checklist.push('Photograph trailer damage before leaving');
assert.ok(resolve().steps.find(s=>s.id==='pickup_ready').checklist.includes('Photograph trailer damage before leaving'));

// Every remaining task can finish without a single duty event; confirmations only
// update the guide and retain load requirements after a save/reopen round trip.
let state = {...f.state, eventsByDay:{}};
for (const step of resolve(state).steps.filter(s=>!s.complete)) {
  state = applyLoadGuideActionV103(state, {guideId:f.guide.id, stepId:step.id, step,
    action:step.kind === 'complete_stop' ? 'complete_stop' : 'toggle_done'});
}
const reopened = JSON.parse(JSON.stringify(state));
assert.equal(resolve(reopened).complete, true);
assert.equal(resolve(reopened).percent, 100);
assert.deepEqual(reopened.eventsByDay, {});
for (const field of ['inspectionByDay','signatureByDay','certifyStatus']) {
  assert.deepEqual(reopened[field], f.state[field], field);
}
assert.deepEqual(reopened.loadGuidesById[f.guide.id].steps, f.guide.steps);
assert.ok(resolve(reopened).navigationSteps.every(step=>!step.complete), 'all requirements finish with routes untouched');
const closed = applyLoadGuideActionV103(reopened, {guideId:f.guide.id, action:'complete_guide'});
assert.equal(closed.loadGuidesById[f.guide.id].status, 'completed');
assert.equal(getActiveLoadGuideV103(closed), null, 'completed Mission is cleared from active selection');
assert.deepEqual(closed.eventsByDay, {});

// Screenshot regression: six required items done, routes and POD left pending.
const screenshot = structuredClone(f.state);
screenshot.loadGuidesById[f.guide.id].manualDone = Object.fromEntries(progress.steps.filter(s=>s.id!=='final_pod').map(s=>[s.id,1]));
assert.equal(resolve(screenshot).completed, 6);
assert.equal(resolve(screenshot).total, 7);
assert.equal(resolve(screenshot).currentStep.id, 'final_pod');
const signedStore = structuredClone(f.store);
Object.assign(signedStore.documents[0], {podSigned:true,stopSequence:1});
assert.equal(resolve(screenshot, signedStore).complete, true, 'POD can finish the load while routes stay unused');
const navigationOnly = structuredClone(f.guide);
navigationOnly.steps = progress.navigationSteps;
assert.equal(safeMissionProgressV10966({}, navigationOnly, {}).complete, false, 'navigation alone does not create a completed load');

const plan = {loadNo:f.guide.loadNo, broker:'TQL', fields:{}, stops:[
  ...f.guide.stops.map(s=>s.type==='delivery' ? {...s,deliverySequence:1} : s),
  {id:'return',type:'delivery',role:'trailer_return',deliverySequence:2,city:'Howe',state:'IN',address:'100 Example Road, Howe, IN',date:'2026-09-17',appointment:'08:00–16:00'},
], risks:[
  {id:'macropoint',title:'Accept MacroPoint tracking',detail:'Keep tracking active for this load.'},
  {id:'pod_deadline',title:'Send POD within 24 hours',detail:'Send signed delivery paperwork to the broker.'},
]};
const instruction = buildInstructionGuideV110311(plan, {id:'instruction-test',type:'load_tender',status:'verified',canonicalLoadNo:plan.loadNo,broker:plan.broker});
assert.ok(instruction);
const instructionProgress = safeMissionProgressV10966({}, JSON.parse(JSON.stringify(instruction)), {});
assert.ok(instructionProgress.steps.every(s=>s.kind!=='status'));
for (const risk of plan.risks) assert.ok(instructionProgress.steps.some(s=>s.title===risk.title && s.detail===risk.detail));
assert.ok(instructionProgress.steps.some(s=>s.title==='Inspect and photograph returned trailer'));
assert.ok(instructionProgress.steps.some(s=>s.title==='Confirm trailer returned'));
assert.equal(instructionProgress.guide.stops.at(-1).appointment, '08:00–16:00');
instruction.manualDone = Object.fromEntries(instructionProgress.steps.filter(s=>s.id!=='complete_stop_2').map(s=>[s.id,1]));
assert.equal(safeMissionProgressV10966({}, instruction, {}).currentStep.id, 'complete_stop_2', 'physical trailer return remains required');

register(new URL('./test-jsx-loader.mjs', import.meta.url));
const {default:Mission} = await import('../source/src/modules/loads/SafeDriverMissionV10966.jsx');
const previousWindow = globalThis.window;
globalThis.window = {localStorage:{getItem:()=>JSON.stringify(f.store)}};
const html = renderToStaticMarkup(React.createElement(Mission, {state:initial.state}));
assert.match(html, /Driver checklist/);
assert.match(html, /Route helpers/);
assert.match(html, /Open route/);
assert.doesNotMatch(html, /Logbook|Log Driving|Log now|Complete pre-trip|Confirm arrival/);
assert.match(renderToStaticMarkup(React.createElement(Mission, {state:reopened})), /Complete load/);
if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
for (const name of ['SafeDriverMissionV10966.jsx','DriverLoadGuideV103.jsx']) {
  const source = fs.readFileSync('source/src/modules/loads/'+name, 'utf8');
  assert.doesNotMatch(source, /open_status|Open Logbook|Logbook-safe|Log now|Log Driving/);
}
console.log('PASS — Mission requirements complete independently of optional routes; POD and physical trailer return stay required; no Logbook coupling');

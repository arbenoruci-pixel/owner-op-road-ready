import assert from 'node:assert/strict';
import fs from 'node:fs';
import {checklistFixture} from './v110321/checklistFixture.mjs';
import {resolveChecklistEvidenceV110321 as resolve} from '../source/src/modules/loads/checklistEvidenceV110321.js';
import {safeMissionProgressV10966} from '../source/src/modules/loads/safeMissionModelV10966.js';
import {resolveDriverGuideV103} from '../source/src/modules/loads/loadGuideV103.js';
const tests=[];
function check(name,fn){const f=checklistFixture();fn(f);tests.push(name);console.log('PASS — '+name);}
const result=f=>resolve(f.state,f.guide,f.store,{now:f.now});
const step=(f,id)=>result(f).steps.find(s=>s.id===id);
const done=(f,...ids)=>ids.forEach(id=>assert.equal(step(f,id)?.complete,true,id));
const pending=(f,...ids)=>ids.forEach(id=>assert.equal(step(f,id)?.complete,false,id));
check('BOL aliases connect PTI, arrival, route, driving and completed receiver to one load',f=>{
 done(f,'pretrip','route_pickup','arrive_pickup','pickup_ready','pickup_bol','depart_pickup','route_delivery_1','arrive_delivery_1','complete_stop_1');
 pending(f,'delivery_docs_1','final_pod');
 assert.equal(result(f).completed,11);assert.equal(result(f).total,13);
 assert.equal(step(f,'pretrip').completionEvidence.eventId,'pretrip-pickup');
});
check('Home and Full mission use identical completion and remain read-only',f=>{
 const before=JSON.stringify(f);const a=resolveDriverGuideV103(f.state,f.guide,f.store),b=safeMissionProgressV10966(f.state,f.guide,f.store);
 assert.deepEqual(a.steps,b.steps);assert.equal(a.completed,b.completed);assert.equal(JSON.stringify(f),before);
});
check('PTI and Delivery on one closed row count as both activities',f=>{delete f.state.eventsByDay['2026-09-08'];done(f,'pretrip','arrive_delivery_1');assert.equal(step(f,'pretrip').completionEvidence.eventId,'receiver-event');pending(f,'arrive_pickup','depart_pickup');});
check('PTI codes and object activities are recognized',f=>{f.state.eventsByDay['2026-09-08'][0].reasons=[];f.state.eventsByDay['2026-09-08'][0].activities=[{code:'PTI'}];done(f,'pretrip');});
check('Unsigned BOL is not proof of delivery',f=>pending(f,'delivery_docs_1','final_pod'));
check('Signed BOL completes receiver paperwork and POD',f=>{f.bol.podSigned=true;f.bol.stopSequence=1;done(f,'delivery_docs_1','final_pod','complete_stop_1');});
check('Other required paperwork still needs confirmation',f=>{f.bol.podSigned=true;f.guide.steps.find(s=>s.id==='delivery_docs_1').checklist.push('Record signed in/out times');done(f,'final_pod');pending(f,'delivery_docs_1');});
check('Physical pickup requirements are not inferred from arrival',f=>{f.guide.steps.find(s=>s.id==='pickup_ready').checklist.push('Trailer damage-free');pending(f,'pickup_ready');});
check('Removed log activity reopens derived steps without manual flags',f=>{done(f,'pretrip');f.state.eventsByDay['2026-09-08'][0].reasons=['Post-trip inspection'];f.state.eventsByDay['2026-09-10'][0].reasons=['Delivery'];pending(f,'pretrip');assert.equal(f.guide.manualDone.pretrip,undefined);});
check('An ongoing PTI is not complete',f=>{f.state.eventsByDay={'2026-09-10':[{id:'live',status:'ON',startMin:650,endMin:1440,loadNo:f.guide.loadNo,reasons:['PTI']}]};pending(f,'pretrip');});
check('Unrelated and future events cannot complete a load',f=>{f.state.eventsByDay={'2026-08-01':[{status:'ON',startMin:100,endMin:115,loadNo:f.guide.loadNo,reasons:['PTI']}],'2026-09-10':[{status:'ON',startMin:400,endMin:415,loadNo:'99999999',reasons:['PTI']}],'2026-09-11':[{status:'ON',startMin:100,endMin:115,loadNo:f.guide.loadNo,reasons:['PTI']}]};pending(f,'pretrip','arrive_pickup','depart_pickup','arrive_delivery_1');});
check('A closed unnumbered PTI immediately before linked work is reused',f=>{delete f.state.eventsByDay['2026-09-08'][0].shippingDocs;f.state.eventsByDay['2026-09-10'][0].reasons=['Delivery'];done(f,'pretrip');assert.equal(step(f,'pretrip').completionEvidence.eventId,'pretrip-pickup');});
check('An intervening load blocks unnumbered PTI reuse',f=>{delete f.state.eventsByDay['2026-09-08'][0].shippingDocs;f.state.eventsByDay['2026-09-08'].splice(1,0,{id:'other',status:'ON',startMin:435,endMin:435,loadNo:'99999999',reasons:['Pickup']});f.state.eventsByDay['2026-09-10'][0].reasons=['Delivery'];pending(f,'pretrip');});
check('Driving to pickup cannot count as departing loaded',f=>{f.state.eventsByDay['2026-09-08'][2].startMin=400;f.state.eventsByDay['2026-09-08'][2].endMin=420;pending(f,'depart_pickup');});
check('Delivery driving cannot complete pickup departure when pickup arrival is missing',f=>{f.state.eventsByDay['2026-09-08']=[];pending(f,'depart_pickup');});
check('Unloading does not match pickup loading',f=>{f.state.eventsByDay['2026-09-08'][1].reasons=['Delivery / Unloading'];pending(f,'arrive_pickup','depart_pickup');});
check('Archived or reassigned Vault documents override stale logbook summaries and pointers',f=>{
 f.state.documentsByDay={'2026-09-08':[structuredClone(f.bol)]};f.guide.documents={bolDocumentId:f.bol.id};f.bol.status='archived';pending(f,'pickup_bol','pretrip');
 f.bol.status='verified';f.bol.canonicalLoadNo='99999999';pending(f,'pickup_bol','pretrip');
});
check('Explicit unassignment overrides linked document pointers',f=>{f.guide.documents={bolDocumentId:f.bol.id};f.bol.loadAssignmentStatusV11037='unassigned';pending(f,'pickup_bol','pretrip');});
check('Edited signature overrides an older signed summary',f=>{f.bol.podSigned=true;f.state.documentsByDay={'2026-09-08':[structuredClone(f.bol)]};f.bol.podSigned=false;pending(f,'final_pod');});
check('Ambiguous BOL aliases and broker collisions are not inferred',f=>{f.store.loads.push({loadNo:'99999999',broker:'Other',aliases:[{kind:'bol_number',value:f.bol.bolNo}]});pending(f,'pretrip','arrive_delivery_1');});
check('Trailer/seal identifiers cannot establish shipping identity',f=>{f.bol.bolNo='';f.bol.extracted={};f.bol.references=[{kind:'trailer_number',value:'87654321'}];pending(f,'pretrip','arrive_delivery_1');});
check('One receiver never completes a trailer return at the same load',f=>{
 f.bol.podSigned=true;f.guide.stops.push({id:'return',type:'delivery',role:'trailer_return',city:'Howe',state:'IN',date:'2026-09-17'});
 for(const prefix of ['route_delivery','arrive_delivery','delivery_docs','complete_stop'])f.guide.steps.push({id:prefix+'_2',kind:prefix==='complete_stop'?'complete_stop':prefix==='arrive_delivery'?'status':prefix==='route_delivery'?'route':'manual',status:'ON',stopSequence:2,day:'2026-09-17'});
 f.guide.steps.find(s=>s.id==='final_pod').stopSequence=1;
 done(f,'final_pod','complete_stop_1');pending(f,'route_delivery_2','arrive_delivery_2','delivery_docs_2','complete_stop_2');
});
check('Repeated receiver locations require a stop ID, sequence or distinct date',f=>{
 f.guide.stops.push({...f.guide.stops[1],id:'receiver2'});f.guide.steps.push({id:'arrive_delivery_2',kind:'status',status:'ON',stopSequence:2});
 pending(f,'arrive_delivery_1','arrive_delivery_2');f.state.eventsByDay['2026-09-10'][0].stopSequence=1;done(f,'arrive_delivery_1');pending(f,'arrive_delivery_2');
});
check('Explicit manual completion remains supported',f=>{f.guide.manualDone.pickup_ready=123;done(f,'pickup_ready');});
check('Unreviewed summaries cannot complete document steps',f=>{f.bol.reviewStatus='needs_review';pending(f,'pickup_bol','pretrip');});
check('An explicit different load defeats a stale BOL alias',f=>{f.store.loads.push({loadNo:'99999999'});f.state.eventsByDay['2026-09-08'][0].loadNo='99999999';f.state.eventsByDay['2026-09-10'][0].reasons=['Delivery'];pending(f,'pretrip');});
check('An empty pickup checklist is not evidence of physical readiness',f=>{f.guide.steps.find(s=>s.id==='pickup_ready').checklist=[];pending(f,'pickup_ready');});
check('Deleting a Vault row cannot resurrect an old Logbook document summary',f=>{f.state.documentsByDay={'2026-09-08':[structuredClone(f.bol)]};f.store.documents=[];pending(f,'pickup_bol','pretrip');});
check('Persisted character objects recover checklist text in both views',f=>{f.bol.podSigned=true;f.guide.steps=f.guide.steps.map(s=>({...s,checklist:(s.checklist||[]).map(item=>({...item}))}));done(f,'delivery_docs_1','pickup_ready');const a=resolveDriverGuideV103(f.state,f.guide,f.store),b=safeMissionProgressV10966(f.state,f.guide,f.store);assert.deepEqual(a.steps,b.steps);assert.deepEqual(step(f,'delivery_docs_1').checklist,['Collect signed POD']);});
check('Unreadable checklist requirements remain pending',f=>{f.bol.podSigned=true;f.guide.steps.find(s=>s.id==='delivery_docs_1').checklist=[{unknown:'unrecognized'}];pending(f,'delivery_docs_1');});
const component=fs.readFileSync('source/src/modules/loads/SafeDriverMissionV10966.jsx','utf8');
assert.doesNotMatch(component,/safe_mission_bol_relink_v10966|if \(progress.pickupPresent\)/);
assert.match(component,/completionEvidence.label/);
console.log(`PASS — ${tests.length} checklist evidence contracts; no logbook, certification or saved guide mutation`);

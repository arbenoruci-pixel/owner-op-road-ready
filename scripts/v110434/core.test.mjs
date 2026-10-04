import assert from 'node:assert/strict';
import {validateManifest,makeImportReview,mergeLibraryLoads,closeArchivedGuides,copy,FORMAT} from './libraryCore.js';
const p={format:FORMAT,version:1,id:'synthetic-one',loads:[{loadNo:'00123',broker:'Example Broker',origin:'A',destination:'B',gross:1200,documentTransferDays:['2026-09-28'],operationalStatus:'closed',serviceOutcome:'completed_per_owner',closureAuthority:'Owner confirmation',aliases:['BOL-55']}],documents:[],logbook:[{day:'2026-09-28',driverId:'driver-a',driverName:'Example A',events:[]}],logbookLinks:[{loadNo:'00123',day:'2026-09-28',driverId:'driver-a',basis:'source_date_review'}],cases:[]};
validateManifest(p);let bad=copy(p);bad.logbookLinks[0].driverId='driver-b';assert.throws(()=>validateManifest(bad),/relationship/);
bad=copy(p);bad.loads.push({...bad.loads[0]});assert.throws(()=>validateManifest(bad),/Duplicate/);
const current={loads:[{id:'stable',loadNo:'00123',broker:'Example Broker',gross:500,status:'paid',paidAmount:500}],documents:[]};
const review=makeImportReview(current,[],p);assert.equal(review.newLoads,0);assert.ok(review.differences.some(d=>d.field==='gross'));
const {next}=mergeLibraryLoads(current,p);assert.equal(next.loads[0].id,'stable');assert.equal(next.loads[0].status,'paid');assert.equal(next.loads[0].paidAmount,500);assert.equal(next.loads[0].gross,1200);assert.equal(current.loads[0].gross,500);
assert.throws(()=>makeImportReview({loads:[{loadNo:'00123',broker:'Other Broker'}]},[],p),/different saved broker/);
const state={eventsByDay:{'2026-09-28':[{status:'D',startMin:0,endMin:500}]},signatureByDay:{'2026-09-28':{signed:true}},activeLoadGuideId:'g',loadGuidesById:{g:{id:'g',loadNo:'00123',status:'active'}},loadInfo:{loadNo:'00123',guideId:'g'},routeLegsByDay:{'2026-09-28':[{loadNo:'00123',status:'open'},{loadNo:'999',status:'open'}]}};
const closed=closeArchivedGuides(state,next);assert.equal(closed.activeLoadGuideId,'');assert.equal(closed.loadGuidesById.g.status,'completed');assert.equal(closed.routeLegsByDay['2026-09-28'][1].status,'open');assert.strictEqual(closed.eventsByDay,state.eventsByDay);assert.strictEqual(closed.signatureByDay,state.signatureByDay);assert.strictEqual(closeArchivedGuides(closed,next),closed);
console.log('PASS — identity, broker conflicts, payment preservation, driver links and idempotent closure with unchanged duty evidence');

const {exportLibrarySources}=await import('./libraryExport.js');
const output=new Map();const archive={id:'fixture',logbook:[{day:'2026-09-28',driverId:'a',driverName:'Driver <A>',events:[{status:'D',startMin:0,endMin:60,note:'<script>unsafe</script>'}]}],logbookLinks:[{loadNo:'00123',driverId:'a',day:'2026-09-28',basis:'source_date_review'}],cases:[],audit:{privateBeforeImages:'excluded'},sourceNote:'Source only'};
const sourceDays=await exportLibrarySources({text:async(p,s)=>output.set(p,s)},{sync_meta:{where:key=>{assert.equal(key,'key');return {startsWith:prefix=>{assert.equal(prefix,'document-library:');return {toArray:async()=>[{value:archive}]};}};}}});
assert.equal(sourceDays,1);const source=JSON.parse(output.get('Imported-Logbooks/fixture/Sources.json'));assert.deepEqual(source.logbookLinks,archive.logbookLinks);assert.equal(source.audit,undefined);assert.match(output.get('Imported-Logbooks/fixture/Logbook.html'),/Driver &lt;A&gt;/);assert.ok(!output.get('Imported-Logbooks/fixture/Logbook.html').includes('<script>'));console.log('PASS — lean document export preserves linked source copies without private audit snapshots');

const {libraryScanCandidates}=await import('./libraryScan.js');
const scanStore={loads:[{loadNo:'00123',id:'stable',broker:'Example Broker',status:'archived',operationalStatus:'closed',documentLibrarySource:'fixture',aliases:['BOL-5500','1234']}]};
const scanBefore=copy(scanStore);let candidates=libraryScanCandidates([],scanStore,{broker:'Other Broker'});assert.equal(candidates[0].status,'completed');assert.equal(candidates[0].brokerIdentityConflict,true);assert.deepEqual(candidates[0].aliases.map(a=>a.value),['00123','BOL-5500']);assert.deepEqual(scanStore,scanBefore);assert.equal(libraryScanCandidates([], {loads:[{loadNo:'999',status:'archived'}]}).length,0);console.log('PASS — imported closed folders remain scanner candidates, broker conflicts and short aliases stay guarded');

const original=hash=>({id:'library-'+hash,sha256:hash,path:hash+'.pdf',name:'original.pdf',bytes:1,mime:'application/pdf',type:'pod',loadNo:'00123',sourceClientIds:['legacy-id'],components:[]});bad=copy(p);bad.documents=[original('a'.repeat(64)),original('b'.repeat(64))];assert.throws(()=>validateManifest(bad),/multiple originals/);console.log('PASS — a legacy source ID cannot attach two different originals');

bad.documents[0].sourceClientIds=[bad.documents[1].id];bad.documents[1].sourceClientIds=[];assert.throws(()=>makeImportReview(current,[{local_id:'legacy',client_document_id:bad.documents[1].id}],bad),/matches multiple originals/);

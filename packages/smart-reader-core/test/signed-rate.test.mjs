import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation,confirmField} from '../src/index.js';
import {profileEvidence} from '../src/classification.js';
import {PROFILES} from '../src/profiles.js';
import {restoreConfirmedReading} from '../src/continuity.js';
import {savedReadingReview} from '../src/recovery.js';
import {signedRateInput,sertifiStamp} from './signed-rate-fixture.mjs';

const expected={loadNumber:'TEST-74123',totalRate:'4250.00',carrier:'EXAMPLE CARRIER LLC',equipment:'Van',shipper:'SAMPLE PRESS',consignee:'SAMPLE TOYS',pickupDate:'2026-10-08',deliveryDate:'2026-10-12',documentDate:'2026-10-08',pickupCity:'Albany, NY',deliveryCity:'Madison, WI',pickupAddress:'123 Example St Albany, NY 12207',deliveryAddress:'456 Sample Rd Madison, WI 53703',pickupAppointment:'08:00 - 16:00 Apt',deliveryAppointment:'08:00 - 17:00 Apt'};
for(const heading of ['Rate Confirmation','Carrier Rate Confirmation','Broker/Carrier Rate Confirmation','Rate Agreement','Carrier Rate Agreement','Load Confirmation','Freight Confirmation','Shipment Confirmation']){
 for(const mode of ['unsigned','signed','separate observation'])test(`${heading}: ${mode} preserves rate fields, continuation and separate certificate`,()=>{
  const input=signedRateInput({heading,signed:mode!=='unsigned',split:mode==='separate observation'}),before=structuredClone(input),result=readDocument(input);
  assert.deepEqual(result.documents.map(d=>[d.kind,d.pageIds,d.role]),[['rate_confirmation',['page-1','page-2'],'primary'],['signing_certificate',['page-3'],'supporting']]);
  for(const [key,value]of Object.entries(expected))assert.equal(result.documents[0].fields[key].value,value,key);
  for(const doc of result.documents)for(const f of Object.values(doc.fields))for(const c of f.candidates)for(const e of [...c.evidence,...c.labelEvidence||[],...c.continuationEvidence||[]])resolveEvidence(result,e);
  assert.deepEqual(input,before);assert.deepEqual(result.corrections,[]);assert.ok(result.documents.every(d=>!d.canAutoFile));
 });
}
test('same-observation suppression uses rate variants and their normalized matching view',()=>{
 const profile=PROFILES.find(p=>p.id==='signing_certificate');
 for(const title of ['Rate Agreement','| Rate Agreement','Freight Confirmation']){
  assert.equal(profileEvidence(textObservation(title+'\n'+sertifiStamp).lines,profile),null);
 }
});
test('a standalone certificate or a reference to an agreement never becomes a RateCon',()=>{
 for(const heading of ['', 'Please attach Rate Agreement', 'Document name: Rate Agreement', 'NOT A RATE AGREEMENT']){
  const result=readDocument({documentId:'certificate',pages:[{observations:[textObservation(heading+'\n'+sertifiStamp)]}]});
  assert.equal(result.documents[0].kind,'signing_certificate');
 }
 const input=signedRateInput();input.pages[0].observations[0].lines.push({id:'explicit-certificate',text:'CERTIFICATE OF COMPLETION',box:{x:.08,y:.06,width:.50,height:.015}});
 input.pages[0].observations[0].lines.push({id:'signer',text:'Signer: Sample Signer'},{id:'signed',text:'Signed: 2026-10-08'});
 assert.equal(readDocument(input).documents[0].kind,'unknown','an explicit certificate heading remains a conflict');
});
test('signed aliases retain conflicting totals and never assemble a rate variant across observations',()=>{
 const input=signedRateInput();input.pages[0].observations.push(textObservation('Total: $4,350.00',{id:'different-rate'}));
 const f=readDocument(input).documents[0].fields.totalRate;assert.equal(f.value,null);assert.ok(f.issues.includes('conflicting_reads'));
 const split={documentId:'split',pages:[{observations:[textObservation('Rate Agreement\n'+sertifiStamp,{id:'title'}),textObservation('Total: $4,250.00\nPickup: SAMPLE PRESS\nDelivery: SAMPLE TOYS',{id:'fields'})]}]};
 assert.notEqual(readDocument(split).documents[0].kind,'rate_confirmation');
});
test('rereading a signed agreement preserves verified values and exact source candidates',()=>{
 const input=signedRateInput(),result=readDocument(input),group=result.documents[0],field=group.fields.totalRate;
 const confirmed=confirmField(result,{documentId:result.documentId,groupId:group.id,field:'totalRate',rawValue:'4250.00',evidence:field.candidates[0].evidence[0],userConfirmed:true,expectedRawValues:field.candidates.map(c=>c.rawValue),expectedRevision:result.reviewRevision});
 const saved=savedReadingReview(confirmed),before=structuredClone(saved),reread=readDocument(input),original=structuredClone(reread),restored=restoreConfirmedReading(reread,saved);
 assert.equal(restored.documents[0].fields.totalRate.status,'confirmed');assert.equal(restored.documents[0].fields.totalRate.value,'4250.00');
 assert.deepEqual(restored.documents[0].fields.totalRate.correction,confirmed.documents[0].fields.totalRate.correction);
 assert.deepEqual(restored.documents[0].fields.totalRate.candidates,original.documents[0].fields.totalRate.candidates);
 assert.deepEqual(saved,before);assert.deepEqual(reread,original);
});

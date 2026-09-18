import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation} from '../src/index.js';
import {rateInput,rateText} from './rate-confirmation-fixture.mjs';
const terms=['Unit # 123456 VIN # 1HGBH41JXMN109186','POD must be provided within 4 hrs of delivery. Penalty for failure could apply','Detention $25/hr Applicable after 3 free hours of loading and unloading.','Send invoice to billing@example.test'].join('\n');
test('operational clauses and unit identifiers are exposed with their exact source and no calculated obligations',()=>{
 const r=readDocument(rateInput(rateText+'\n'+terms)),f=r.documents[0].fields;
 assert.equal(f.unitNumber.value,'123456');assert.equal(f.vin.value,'1HGBH41JXMN109186');
 assert.equal(f.podRequirement.value,terms.split('\n')[1]);assert.equal(f.detentionTerms.value,terms.split('\n')[2]);
 assert.equal(f.lateFeeTerms.value,'$150 PER DAY LATE FEE, IF DELIVERED AFTER 7 DAYS');assert.equal(f.billingEmail.value,'billing@example.test');
 assert.equal(f.totalRate.value,'2300.00');assert.equal(f.weight.value,null);assert.equal(r.documents[0].canAutoFile,false);
 for(const k of ['unitNumber','vin','podRequirement','detentionTerms','lateFeeTerms','billingEmail'])for(const c of f[k].candidates)for(const e of c.evidence)resolveEvidence(r,e);
 assert.equal(f.lateFeeTerms.deadline,undefined);assert.equal(f.unitNumber.assignedTrailer,undefined);
});
test('different terms stay conflicts and a malformed VIN is never invented',()=>{
 const input=rateInput(rateText+'\n'+terms);input.pages[0].observations.push(textObservation(terms.replace('4 hrs','8 hrs'),{id:'other-read'}));
 const f=readDocument(input).documents[0].fields;assert.equal(f.podRequirement.value,null);assert.ok(f.podRequirement.issues.includes('conflicting_reads'));
 const invalid=readDocument(rateInput(rateText+'\nVIN # 1HGBH41JXMI109186')).documents[0].fields.vin;assert.equal(invalid.value,null);assert.ok(invalid.issues.includes('invalid_vin'));
});
test('absent extra operational details are explicitly empty and hidden by the optional presentation flag',()=>{
 const f=readDocument(rateInput()).documents[0].fields;
 for(const k of ['vin','podRequirement','detentionTerms','billingEmail']){assert.equal(f[k].status,'missing');assert.equal(f[k].value,null);assert.equal(f[k].displayWhenFound,true);}
});

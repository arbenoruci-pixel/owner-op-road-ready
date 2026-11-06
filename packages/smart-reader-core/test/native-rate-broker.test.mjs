import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence,textObservation} from '../src/index.js';
import {scanWithSourceFields} from '../src/scanFields.js';
import {brokerTermsInput} from './native-rate-broker-fixture.mjs';
const terms=x=>x.pages[1].observations[0].lines;
test('native broker name is read verbatim from corroborated terms and survives filing projection',()=>{
 const input=brokerTermsInput(),before=JSON.stringify(input),result=readDocument(input),doc=result.documents[0];
 assert.equal(result.documents.length,1);assert.equal(doc.fields.broker.status,'supported');assert.equal(doc.fields.broker.value,'EXAMPLE LOGISTICS');
 assert.equal(doc.fields.carrier.value,'SAMPLE CARRIER LLC');assert.equal(doc.fields.totalRate.value,'3200.00');
 const candidate=doc.fields.broker.candidates[0];assert.equal(candidate.rawValue,'EXAMPLE LOGISTICS');
 assert.ok(candidate.labelEvidence.some(e=>e.quote.includes('prompt payment')));
 for(const c of doc.fields.broker.candidates)for(const e of [...c.evidence,...c.labelEvidence||[]])resolveEvidence(result,e);
 const analysis={fields:{broker:'STALE'}},shown=scanWithSourceFields(analysis,{analysis,result},'rate_confirmation');assert.equal(shown.fields.broker,'EXAMPLE LOGISTICS');
 assert.equal(JSON.stringify(input),before);assert.equal(doc.canAutoFile,false);
});
test('email alone, mismatched domains, incomplete roles and weak evidence cannot establish the broker',()=>{
 const changes=[
  lines=>{lines.find(l=>l.text.includes('DETENTION APPROVAL')).text='Detention requires approval';},
  lines=>{lines.find(l=>l.text.includes('MUST BE COMMUNICATED')).text='Contact EXAMPLE LOGISTICS';},
  lines=>{lines.find(l=>l.text.startsWith('WITH SHIPPER')).text='Call the driver';},
  lines=>{lines.find(l=>l.text.includes('prompt payment')).text='Please contact accounts@example-logistics.com';},
  lines=>{lines.find(l=>l.text.includes('prompt payment')).text=lines.find(l=>l.text.includes('prompt payment')).text.replace('example-logistics.com','example-logistics.com.other.net');},
  lines=>{lines.find(l=>l.text.includes('prompt payment')).text=lines.find(l=>l.text.includes('prompt payment')).text.replace('example-logistics.com','other-logistics.com');},
  lines=>{lines.find(l=>l.text.includes('MUST BE COMMUNICATED')).text=lines.find(l=>l.text.includes('MUST BE COMMUNICATED')).text.replace('EXAMPLE LOGISTICS','OTHER LOGISTICS');},
  ...['DETENTION APPROVAL','MUST BE COMMUNICATED','WITH SHIPPER','prompt payment'].map(text=>lines=>{lines.find(l=>l.text.includes(text)).confidence=.4;}),
 ];
 for(const change of changes){const input=brokerTermsInput();change(terms(input));assert.equal(readDocument(input).documents[0].fields.broker.value,null);}
 const input=brokerTermsInput();input.pages[1].observations[0].source='existing-phone-ocr';assert.equal(readDocument(input).documents[0].fields.broker.value,null);
});
test('different load references and explicit conflicting broker labels remain isolated',()=>{
 const input=brokerTermsInput();terms(input).find(l=>l.text==='TEST-90210').text='OTHER-LOAD';const result=readDocument(input);assert.ok(result.documents.length>1);assert.equal(result.documents[0].fields.broker.value,null);
 const conflicting=brokerTermsInput();conflicting.pages[0].observations.push(textObservation('Broker: DIFFERENT LOGISTICS'));const result2=readDocument(conflicting);assert.ok(result2.documents.length>1);assert.equal(result2.documents[0].fields.broker.value,'DIFFERENT LOGISTICS');
 const x=brokerTermsInput();terms(x).push({id:'explicit-conflict',text:'Broker: DIFFERENT LOGISTICS',confidence:1});const result3=readDocument(x);assert.equal(result3.documents[0].fields.broker.value,null);assert.ok(result3.documents[0].fields.broker.issues.includes('conflicting_reads'));
});

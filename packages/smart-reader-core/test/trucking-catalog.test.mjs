import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readDocument,textObservation,resolveEvidence} from '../src/index.js';
import {PROFILES} from '../src/profiles.js';
import {truckingCases} from './trucking-catalog-fixture.mjs';
const read=text=>readDocument({documentId:'catalog-test',pages:[{id:'p1',observations:[textObservation(text)]}]});

for(const [kind,heading,body,expected] of truckingCases)test('catalog: '+kind,()=>{
  const result=read(heading+'\n'+body),doc=result.documents[0];
  assert.equal(doc.kind,kind,JSON.stringify(result.pageIdentities[0].evidence.map(v=>[v.kind,v.evidence.quote])));
  for(const [key,value] of Object.entries(expected))assert.equal(doc.fields[key].value,value,key);
  for(const f of Object.values(doc.fields))for(const c of f.candidates)for(const e of c.evidence)resolveEvidence(result,e);
  assert.equal(doc.canAutoFile,false);
  // Isolated form names in an email/checklist do not establish document type.
  assert.equal(read('Please send '+heading+'\nThank you').documents[0].kind,'unknown');
});

test('every existing app catalog type has a source-review profile or explicit alias',()=>{
  const source=fs.readFileSync(new URL('../../../source/src/modules/scan/truckDocumentCatalogV1040.js',import.meta.url),'utf8');
  const appTypes=[...source.matchAll(/t\('([^']+)'/g)].map(m=>m[1]).filter(id=>id!=='other');
  const supported=new Set(PROFILES.map(p=>p.filingType||p.id));
  assert.deepEqual(appTypes.filter(id=>!supported.has(id)),[]);
  assert.equal(new Set(PROFILES.map(p=>p.id)).size,PROFILES.length);
});

test('official medical form title and labels do not use its OMB expiration as driver expiry',()=>{
  const result=read('Form MCSA-5876 OMB No.: 2126-0006 Expiration Date: 03/31/2028\nMedical Examiner’s Certificate\n(for Commercial Driver Medical Certification)\nI certify that I have examined\nMedical Examiner’s Certificate Expiration Date\nDriver’s License Number\nNational Registry Number');
  assert.equal(result.documents[0].kind,'medical_card');
  assert.equal(result.documents[0].fields.expirationDate.value,null);
});

test('POD completion requires filled delivery evidence; printed signature boxes keep a BOL',()=>{
  const bol='BILL OF LADING\nBOL # B-104\nShipper: Example Mill\nConsignee: Example Market';
  assert.equal(read(bol+'\nReceiver Signature: ______\nDelivery date: ____').documents[0].kind,'bol');
  const result=read(bol+'\nReceived by: J SAMPLE\nDelivery Date: 2026-09-17');
  assert.equal(result.documents[0].kind,'pod');
  assert.equal(result.documents[0].identityStatus,'supported');
  assert.equal(result.documents[0].fields.deliveredTo.value,'J SAMPLE');
  assert.equal(result.documents[0].canAutoFile,false);
});

test('generic receipt structure recognizes a purchase without a printed receipt title',()=>{
  const result=read('EXAMPLE STORE\nDate: 2026-09-17\nSubtotal $10.00\nTax $0.70\nTotal $10.70\nPayment method: CARD');
  assert.equal(result.documents[0].kind,'other_expense');
  assert.equal(result.documents[0].identityStatus,'needs_review');
  assert.equal(result.documents[0].fields.total.value,'10.70');
});

test('receipt amounts tolerate compact colon spacing while retaining source offsets',()=>{
  const result=read('RECEIPT\nDate:2026-09-17\nSubtotal:$10.00\nTax:0.70\nTotal:$10.70');
  assert.equal(result.documents[0].kind,'other_expense');
  for(const [key,value] of Object.entries({subtotal:'10.00',tax:'0.70',total:'10.70'})){
    const field=result.documents[0].fields[key];assert.equal(field.value,value);
    for(const candidate of field.candidates)for(const evidence of candidate.evidence)resolveEvidence(result,evidence);
  }
});

test('fuel structure identifies a fuel receipt without turning its total into a load payment',()=>{
  const result=read('EXAMPLE TRUCK STOP\nDiesel: ULSD\nGallons: 110.250\nTotal $385.76\nCard: XXXX1234');
  assert.equal(result.documents[0].kind,'fuel_receipt');
  assert.equal(result.documents[0].fields.gallons.value,'110.250');
  assert.equal(result.documents[0].fields.loadNumber,undefined);
});

test('a freight invoice subtype keeps its invoice reference distinct from the load number',()=>{
  const result=read('INVOICE\nInvoice # INV-100\nLoad # LD-900\nBill To: Example Broker\nSubtotal $2500.00\nTotal $2500.00');
  assert.equal(result.documents[0].kind,'load_invoice');
  assert.equal(result.documents[0].fields.invoiceNumber.value,'INV-100');
  assert.equal(result.documents[0].fields.loadNumber.value,'LD-900');
});

test('conflicting receipt totals and low-confidence recognition stay unresolved',()=>{
  const sample=truckingCases.find(c=>c[0]==='fuel_receipt');
  const input={documentId:'conflict',pages:[{observations:[textObservation(sample[1]+'\n'+sample[2]),textObservation(sample[1]+'\n'+sample[2].replace('350.34','950.34'),{id:'retry'})]}]};
  const total=readDocument(input).documents[0].fields.total;
  assert.equal(total.value,null);assert.ok(total.issues.includes('conflicting_reads'));
  input.pages[0].observations.splice(1);
  input.pages[0].observations[0].lines.forEach(l=>l.confidence=.4);
  assert.equal(readDocument(input).documents[0].fields.total.value,null);
});

test('different documents on one page stay conflicting and mixed pages retain separate fields',()=>{
  const fuel=truckingCases.find(c=>c[0]==='fuel_receipt'),pod=truckingCases.find(c=>c[0]==='pod');
  const texts=[fuel,pod].map(c=>c[1]+'\n'+c[2]);
  const combined=read(texts.join('\n'));
  assert.equal(combined.documents[0].kind,'unknown');
  assert.equal(combined.pageIdentities[0].status,'conflicting');
  const packet=readDocument({documentId:'packet',pages:texts.map((t,i)=>({id:'p'+i,observations:[textObservation(t)]}))});
  assert.deepEqual(packet.documents.map(d=>d.kind),['fuel_receipt','pod']);
  assert.equal(packet.documents[1].fields.total,undefined);
});

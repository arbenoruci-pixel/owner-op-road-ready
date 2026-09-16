import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,resolveEvidence} from '../src/index.js';

const line=(text,confidence=.95)=>({text,confidence});
const observation=(id,rows)=>({id,source:'fixture',lines:rows.map(([text,confidence])=>line(text,confidence))});

test('BOL keeps company identity separate from a labeled street address and reads Ship Date',()=>{
  const result=readDocument({documentId:'ufp-bol',pages:[{id:'page-1',observations:[
    observation('clean',[
      ['BILL OF LADING'],['BOL#: 2180669073-001'],['Ship Date:9/11/2026'],
      ['FROM: UFP GRANGER LLC #218'],['Shipper: 12495 SAINT THOMAS ST'],['TO: FABCON INC'],
      ['Carrier: TOTAL QUALITY LOGISTICS'],['Cust PO#: 308717'],
    ]),
    observation('repeat',[
      ['BILL OF LADING'],['BOL#: 2180669073-001'],['Ship Date:9/11/2026'],
      ['FROM: UFP GRANGER, LLC #218'],['TO: FABCON INC'],['Carrier: TOTAL QUALITY LOGISTICS'],
    ]),
  ]}]});
  const fields=result.documents[0].fields;
  assert.ok(['UFP GRANGER LLC #218','UFP GRANGER, LLC #218'].includes(fields.shipper.value));
  assert.equal(fields.shipper.status,'supported');
  assert.equal(fields.shipper.candidates.some(c=>c.rawValue==='12495 SAINT THOMAS ST'),false);
  assert.equal(fields.documentDate.value,'2026-09-11');
  assert.equal(fields.documentDate.status,'supported');
  assert.equal(fields.documentDate.label,'Ship date');
});

test('cosmetic corporate commas collapse to one semantic party',()=>{
  const result=readDocument({documentId:'party-format',pages:[{id:'page-1',observations:[
    observation('a',[['BILL OF LADING'],['BOL#: A-100'],['FROM: UFP GRANGER LLC #218'],['TO: FABCON INC']]),
    observation('b',[['BILL OF LADING'],['BOL#: A-100'],['FROM: UFP GRANGER, LLC #218'],['TO: FABCON INC']]),
  ]}]});
  const shipper=result.documents[0].fields.shipper;
  assert.equal(shipper.status,'supported');
  assert.ok(['UFP GRANGER LLC #218','UFP GRANGER, LLC #218'].includes(shipper.value));
  assert.equal(shipper.issues.includes('conflicting_reads'),false);
});

test('different BOL identifiers still require review',()=>{
  const result=readDocument({documentId:'bol-conflict',pages:[{id:'page-1',observations:[
    observation('a',[['BILL OF LADING'],['BOL#: 2180669073-001'],['FROM: UFP GRANGER LLC #218'],['TO: FABCON INC']]),
    observation('b',[['BILL OF LADING'],['BOL#: 2180669073'],['FROM: UFP GRANGER LLC #218'],['TO: FABCON INC']]),
  ]}]});
  const bol=result.documents[0].fields.bolNumber;
  assert.equal(bol.value,null);
  assert.equal(bol.status,'needs_review');
  assert.ok(bol.issues.includes('conflicting_reads'));
});

const bolObservation=(id,shipper,extra=[])=>observation(id,[
  ['BILL OF LADING'],['BOL#: SHARED-105'],[`FROM: ${shipper}`],['TO: Example Receiver'],...extra,
]);
const readObservations=observations=>readDocument({documentId:'evidence-105',pages:[{id:'page-1',observations}]});

test('meaningful company separators preserve conflicts and document boundaries',()=>{
  for(const [first,second] of [['ACME #1-2','ACME #12'],['ACME #1/2','ACME #12'],['ACME #1.2','ACME #12'],['A B Logistics','AB Logistics'],['A&B Logistics','AB Logistics']]){
    const observations=[bolObservation('first',first),bolObservation('second',second)];
    const field=readObservations(observations).documents[0].fields.shipper;
    assert.equal(field.value,null,`${first} versus ${second}`);
    assert.ok(field.issues.includes('conflicting_reads'));
    const packet=readDocument({documentId:'separate-companies',pages:observations.map((read,i)=>({id:`page-${i+1}`,observations:[read]}))});
    assert.deepEqual(packet.documents.map(doc=>doc.pageIds),[['page-1'],['page-2']]);
    const invoices=observations.map((read,i)=>observation(read.id,[['INVOICE'],['Invoice No: SHARED-105'],[`Vendor: ${i?second:first}`],['Subtotal: 100.00'],['Total: 100.00'],['Currency: USD']]));
    const vendor=readObservations(invoices).documents[0].fields.vendor;
    assert.equal(vendor.value,null);
    assert.ok(vendor.issues.includes('conflicting_reads'));
    assert.equal(readDocument({documentId:'invoices',pages:invoices.map((read,i)=>({id:`page-${i+1}`,observations:[read]}))}).documents.length,2);
  }
});

test('cosmetic company punctuation keeps agreeing evidence and shared-ID pages together',()=>{
  const observations=[bolObservation('first','UFP GRANGER LLC #218'),bolObservation('second','UFP GRANGER, LLC #218')];
  observations[1].lines.forEach(line=>line.confidence=.5);
  const result=readObservations(observations),field=result.documents[0].fields.shipper;
  assert.equal(field.status,'supported');
  assert.equal(field.candidates.length,2);
  for(const candidate of field.candidates)for(const evidence of candidate.evidence){
    const {line}=resolveEvidence(result,evidence);
    assert.equal(line.text.slice(evidence.start,evidence.end),candidate.rawValue);
  }
  observations[1].lines.forEach(line=>line.confidence=.95);
  const packet=readDocument({documentId:'same-company',pages:observations.map((read,i)=>({id:`page-${i+1}`,observations:[read]}))});
  assert.deepEqual(packet.documents.map(doc=>doc.pageIds),[['page-1','page-2']]);
  assert.equal(packet.documents[0].canAutoFile,false);
});

test('explicit numeric legal company names survive address filtering with source evidence',()=>{
  for(const company of ['123 Main Street LLC','100 Parkway Corporation','123 Main St., LLC','100 Parkway Logistics LLC','123 Main Street LLC #218']){
    const result=readObservations([observation('invoice',[
      ['INVOICE'],['Invoice No: INV-105'],[`Vendor: ${company}`],['Subtotal: 100.00'],['Total: 100.00'],['Currency: USD'],
    ])]);
    const field=result.documents[0].fields.vendor;
    assert.equal(field.value,company);
    assert.equal(field.status,'supported');
    assert.equal(field.candidates[0].evidence[0].quote,company);
    resolveEvidence(result,field.candidates[0].evidence[0]);
    assert.equal(readObservations([bolObservation('bol',company)]).documents[0].fields.shipper.value,company);
  }
  for(const address of ['12495 SAINT THOMAS ST','123 N Main St. Suite 2','44 South County Road 10','P.O. Box 42','123 Main Street, c/o Example LLC','123 Main Street NW #2','12495 SAINT THOMAS ST, GRANGER, IN 46530']){
    const field=readObservations([bolObservation('address',address)]).documents[0].fields.shipper;
    assert.equal(field.value,null,address);
    assert.equal(field.candidates.length,0,address);
  }
});

test('street-like company names in layout proposals still require review',()=>{
  const boxed=(text,x,y,width=.28)=>({...line(text),box:{x,y,width,height:.02}});
  for(const position of ['right','below']){
    for(const value of ['123 Main Street Logistics LLC','123 Main St. Suite 2']){
      const label=position==='right'?'FROM:':'SHIP FROM';
      const result=readDocument({documentId:'layout-companies',pages:[{id:'page-1',images:[{id:'original',width:1000,height:1000}],observations:[{id:position,source:'fixture',sourceImageId:'original',lines:[
        line('BILL OF LADING'),line('BOL#: SHARED-105'),
        boxed(label,.04,.2,.1),boxed(value,position==='right'?.15:.04,position==='right'?.2:.23),
        line('TO: Example Receiver'),
      ]}]}]});
      const field=result.documents[0].fields.shipper;
      assert.equal(field.value,null);
      if(value.endsWith('LLC')){
        assert.equal(field.status,'needs_review');
        assert.ok(field.issues.includes('layout_needs_review'));
        assert.equal(field.candidates[0].rawValue,value);
        resolveEvidence(result,field.candidates[0].evidence[0]);
      }else assert.equal(field.candidates.length,0);
    }
  }
});

test('US ship-date parsing requires the explicit label and preserves date uncertainty',()=>{
  for(const label of ['Date','Document Date']){
    const field=readObservations([bolObservation('generic','Example Shipper',[[`${label}: 09/11/2026`]])]).documents[0].fields.documentDate;
    assert.equal(field.value,null,label);
    assert.ok(field.issues.includes('ambiguous_date'));
  }
  for(const [raw,expected] of [['09/11/2026','2026-09-11'],['2026-09-11','2026-09-11'],['02/30/2026',null]]){
    const result=readObservations([bolObservation('ship','Example Shipper',[[`Ship Date:${raw}`]])]);
    const field=result.documents[0].fields.documentDate;
    assert.equal(field.value,expected,raw);
    assert.equal(field.candidates[0].evidence[0].quote,raw);
    resolveEvidence(result,field.candidates[0].evidence[0]);
  }
  const weak=readObservations([bolObservation('weak','Example Shipper',[['Ship Date:09/11/2026',.5]])]).documents[0].fields.documentDate;
  assert.equal(weak.value,null);assert.ok(weak.issues.includes('weak_recognition'));
  const conflict=readObservations([bolObservation('a','Example Shipper',[['Ship Date:09/11/2026']]),bolObservation('b','Example Shipper',[['Ship Date:09/12/2026']])]).documents[0].fields.documentDate;
  assert.equal(conflict.value,null);assert.ok(conflict.issues.includes('conflicting_reads'));
});

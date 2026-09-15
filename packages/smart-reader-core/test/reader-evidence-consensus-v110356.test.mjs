import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument} from '../src/index.js';

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

test('punctuation-only company variants collapse to one semantic party',()=>{
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument} from '../src/index.js';
const read = lines => readDocument({documentId:'synthetic-from-to',pages:[{id:'page-1',observations:[{id:'source',sourceImageId:'synthetic-page',lines:lines.map((text,i)=>({text,confidence:.96,box:{x:.1,y:.03+i*.04,width:.6,height:.025}}))}]}]}).documents[0];

test('BOL heading with explicit FROM and TO supports printed parties and Cust PO',()=>{
  const group=read(['BILL OF LADING','FROM: Example Timber LLC','TO: Example Concrete INC','Cust PO#: 813257','BOL: 9356172084','Ship Date:9/11/2026','DRIVER COPY RETURN W/INVOICE']);
  assert.equal(group.kind,'bol');
  assert.equal(group.fields.shipper.value,'Example Timber LLC');
  assert.equal(group.fields.consignee.value,'Example Concrete INC');
  assert.equal(group.fields.poNumber.value,'813257');
  assert.equal(group.fields.documentDate.value,null,'ship date is not document date');
  assert.equal(group.fields.bolNumber.value,'9356172084');
});

test('prose TO and quoted billing instructions cannot satisfy BOL party signals',()=>{
  assert.equal(read(['BILL OF LADING','From the shipping department','To report discrepancies please call','BOL: 9356172084']).kind,'unknown');
  assert.equal(read(['Return invoice to accounts','FROM: Example Timber LLC','TO: Example Concrete INC']).kind,'unknown');
});

test('BOL copies with conflicting printed header and footer IDs stay uncertain',()=>{
  const group=read(['BILL OF LADING','FROM: Example Timber LLC','TO: Example Concrete INC','BOL#: 9356172084-001','BOL: 9356172084']);
  assert.equal(group.kind,'bol');assert.equal(group.fields.bolNumber.value,null);assert.equal(group.fields.bolNumber.status,'needs_review');
});

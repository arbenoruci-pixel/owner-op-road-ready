import test from 'node:test';
import assert from 'node:assert/strict';
import {readDocument,textObservation} from '../src/index.js';
import {scanWithSourceFields} from '../src/scanFields.js';

const fuel='FUEL RECEIPT\nRECEIPT NO: R-123\nDATE: 2026-10-13\nMERCHANT: GOOD TRUCK STOP\nGALLONS: 10\nDIESEL\nPRICE PER GALLON: 3.00\nSUBTOTAL: 28.00\nTAX: 2.00\nTOTAL: 30.00\nSTATE: TX';
const repair='REPAIR INVOICE\nINVOICE NO: I-123\nDATE: 2026-10-13\nVENDOR: GOOD SERVICE SHOP\nUNIT NO: T-42\nLABOR: 20.00\nPARTS: 10.00\nTOTAL: 30.00';
const invoice='CARRIER INVOICE\nINVOICE NO: C-123\nDATE: 2026-10-13\nLOAD NO: L-123\nBILL TO: GOOD BROKER\nCARRIER: GOOD CARRIER\nTOTAL: 30.00';
function fixture(type,text){
  const analysis={type:{id:type},fields:{merchant:'STALE MERCHANT',vendor:'STALE VENDOR',fuelProvider:'STALE FUEL',unitNumber:'STALE UNIT',truckNumber:'STALE TRUCK',date:'2001-01-01',documentDate:'2001-01-01',customDriverNote:'Keep this note'},
    fieldEvidence:{merchant:{value:'STALE MERCHANT'},vendor:{value:'STALE VENDOR'},fuelProvider:{value:'STALE FUEL'}},fieldConfidence:{merchant:.99,vendor:.99,fuelProvider:.99}};
  const result=readDocument({documentId:'synthetic-receipt',pages:[{id:'page-1',observations:[textObservation(text)]}]});
  assert.equal(result.documents[0].kind,type);
  return {analysis,review:{analysis,result}};
}

test('fuel source merchant reaches every expense writer alias with matching proof',()=>{
  const {analysis,review}=fixture('fuel_receipt',fuel),before=JSON.stringify({analysis,review});
  const projected=scanWithSourceFields(analysis,review,'fuel_receipt');
  for(const key of ['merchant','vendor','fuelProvider']){
    assert.equal(projected.fields[key],'GOOD TRUCK STOP');
    assert.equal(projected.fieldEvidence[key].value,'GOOD TRUCK STOP');
    assert.equal(projected.fieldConfidence[key],undefined);
    assert.equal(projected.fields.readerSourceFieldsV110393.fields[key].evidence[0].quote,'GOOD TRUCK STOP');
  }
  assert.equal(projected.fields.customDriverNote,'Keep this note');
  assert.equal(projected.fields.unitNumber,'STALE UNIT'); // Not a field in this profile.
  assert.equal(JSON.stringify({analysis,review}),before);
});

test('disputed fuel source removes all stale merchant fallbacks and their evidence',()=>{
  const {analysis,review}=fixture('fuel_receipt',fuel);
  review.result.documents[0].fields.merchant.status='needs_review';
  const projected=scanWithSourceFields(analysis,review,'fuel_receipt');
  for(const key of ['merchant','vendor','fuelProvider']){
    assert.equal(projected.fields[key],undefined);assert.equal(projected.fieldEvidence[key],undefined);assert.equal(projected.fieldConfidence[key],undefined);
    assert.equal(projected.fields.readerSourceFieldsV110393.fields[key],undefined);
  }
  assert.equal(projected.fields.customDriverNote,'Keep this note');
});

test('repair vendor and unit use canonical app fields rather than stale preferred aliases',()=>{
  const {analysis,review}=fixture('repair_invoice',repair);
  const projected=scanWithSourceFields(analysis,review,'repair_invoice');
  for(const key of ['merchant','vendor'])assert.equal(projected.fields[key],'GOOD SERVICE SHOP');
  for(const key of ['unitNumber','truckNumber']){
    assert.equal(projected.fields[key],'T-42');
    assert.equal(projected.fields.readerSourceFieldsV110393.fields[key].evidence[0].quote,'T-42');
  }
  assert.equal(projected.fields.truckNo,undefined);
  assert.equal(projected.fields.date,'2026-10-13');assert.equal(projected.fields.documentDate,'2026-10-13');
  assert.equal(projected.fields.fuelProvider,'STALE FUEL'); // Unrelated on a repair invoice.
});

test('real carrier invoice kind is projected, not just its generic invoice alias',()=>{
  const {analysis,review}=fixture('load_invoice',invoice);
  const projected=scanWithSourceFields(analysis,review,'load_invoice');
  assert.notEqual(projected,analysis);assert.equal(projected.fields.invoiceNo,'C-123');assert.equal(projected.fields.loadNo,'L-123');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {smallTotalEvidence} from '../../app/operator/maintenanceSmallPrint.js';

const value = (text,confidence) => ({text,confidence});
const pair = (text,confidence) => ({label:value('TOTAL',89),value:value(text,confidence)});

test('faint total may be suggested when the digits-only and labeled reads agree', () => {
  assert.deepEqual(smallTotalEvidence([pair('$38.72',71)],value('38.72',65)),{cents:3872,printed:false});
  assert.equal(smallTotalEvidence([pair('38.72',71)],null),null);
  assert.equal(smallTotalEvidence([pair('38.72',71)],value('38.72',27)),null);
});

test('strong full reads must agree with each other and the independent digit crop', () => {
  const strong = [pair('38.72',85),pair('38.72',78)];
  assert.deepEqual(smallTotalEvidence(strong,value('38.72',79)),{cents:3872,printed:true});
  assert.equal(smallTotalEvidence(strong,value('38.12',80)),null);
  assert.equal(smallTotalEvidence([pair('38.72',99),pair('38.12',82)],null),null);
  assert.equal(smallTotalEvidence([pair('38.7',90),pair('38.7',90)],null),null);
});

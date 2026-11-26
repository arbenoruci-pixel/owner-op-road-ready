import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUSDCents, makeIntakeProposal, routeProposal, settlementDisplay } from '../../lib/rr-lease/intake-contract.js';

const a = '10000000-0000-4000-8000-000000000001';
const b = '10000000-0000-4000-8000-000000000002';
const input = {source:'gmail',sourceRef:'gmail:message',attachmentRef:'part-1',kind:'fuel',sha256:'a'.repeat(64),amountCents:42000};
const match = (operatorId, extras={}) => ({operatorId,carrierScoped:true,independentEvidence:true,evidenceRef:'verified-receipt:example',...extras});
test('exact decimal conversion rejects floating and ambiguous amounts', () => {
  assert.equal(parseUSDCents('$1,200.01'),120001);
  assert.equal(parseUSDCents('-0.09'),-9);
  assert.equal(parseUSDCents('0'),0);
  for (const x of [1.2,'1,00.00','10.001','1e3','NaN','1,000,000,000.01','']) assert.throws(() => parseUSDCents(x));
});
test('AI cannot set a posted state, authorization or operator assignment', () => {
  const p = makeIntakeProposal({...input, status:'POSTED', approved_by:a, operatorId:a, brokerRules:{tracking:'Use carrier app'}});
  assert.equal(p.status,'DRAFT');
  assert.equal(p.requiresVerification,true);
  assert.equal(p.operatorId,undefined);
  assert.equal(p.approved_by,undefined);
  assert.equal(p.brokerRules.tracking,'Use carrier app');
  assert.throws(() => makeIntakeProposal({...input,sourceRef:'outlook:message'}));
  assert.throws(() => makeIntakeProposal({...input,amountCents:100.01}));
});
test('unidentified, conflicting and shared-card receipts stay in owner review', () => {
  const p = makeIntakeProposal(input);
  for (const opts of [
    {},
    {candidates:[match(a),match(b)]},
    {candidates:[match(a,{carrierScoped:false})]},
    {candidates:[match(a,{independentEvidence:false})]},
    {candidates:[match(a)],sharedFuelCard:true},
  ]) assert.deepEqual(routeProposal(p,opts),{status:'NEEDS_OWNER_REVIEW',operatorId:null,postAllowed:false});
  const routed = routeProposal(p,{candidates:[match(a,{transactionAssigned:true})],sharedFuelCard:true});
  assert.equal(routed.operatorId,a);
  assert.equal(routed.status,'MATCHED_DRAFT');
  assert.equal(routed.postAllowed,false);
});
const draft = {invoice_gross_cents:120000,fee_eligible_gross_cents:105000,lumper_reimbursement_cents:15000,credit_cents:15000,estimated_net_cents:111600,verified_net_cents:0,negative_balance_cents:0,net_cents:null};
test('lumper is included once and draft never masquerades as confirmed net', () => {
  assert.deepEqual(settlementDisplay(draft),{invoiceGrossCents:120000,feeEligibleGrossCents:105000,lumperCents:15000,otherCreditsCents:0,totalCreditsCents:15000,isConfirmed:false,estimatedNetCents:111600,verifiedNetCents:0,negativeBalanceCents:0,netCents:null});
  assert.throws(() => settlementDisplay({...draft,invoice_gross_cents:120001}));
  assert.throws(() => settlementDisplay({...draft,credit_cents:14999}));
});
test('PostgREST integer strings and zero fractional numeric scale are exact', () => {
  const strings = Object.fromEntries(Object.entries(draft).map(([k,v])=>[k,v===null?null:String(v)]));
  assert.deepEqual(settlementDisplay(strings),settlementDisplay(draft));
  assert.deepEqual(settlementDisplay({...strings,invoice_gross_cents:'120000.000'}),settlementDisplay(draft));
});
test('confirmed payable is separate from estimates and posted subtotals', () => {
  const row = settlementDisplay({...draft,estimated_net_cents:'111600',verified_net_cents:'96600',net_cents:'96600'});
  assert.equal(row.isConfirmed,true);
  assert.equal(row.netCents,96600);
  assert.equal(row.estimatedNetCents,111600);
  assert.equal(row.verifiedNetCents,96600);
  assert.throws(() => settlementDisplay({...draft,verified_net_cents:96600,net_cents:96601}));
  assert.throws(() => settlementDisplay({...draft,net_cents:undefined}));
});
test('negative balance remains explicit, zero payable is confirmed only when present', () => {
  const row = settlementDisplay({...draft,estimated_net_cents:'-2000',verified_net_cents:'-2000',negative_balance_cents:'2000',net_cents:'0'});
  assert.equal(row.isConfirmed,true);
  assert.equal(row.netCents,0);
  assert.equal(row.verifiedNetCents,-2000);
  assert.equal(row.negativeBalanceCents,2000);
  assert.equal(settlementDisplay({...draft,estimated_net_cents:-2000,verified_net_cents:-2000}).isConfirmed,false);
  assert.throws(()=>settlementDisplay({...draft,verified_net_cents:-2000,net_cents:0,negative_balance_cents:1999}));
});
test('reject malformed, fractional and unsafe numbers, and unsafe reconciliation', () => {
  for (const v of [undefined,null,'',' ','1e3','1.01','NaN','Infinity','9007199254740992',9007199254740992,1.01,true,{},' 10 ','+10'])
    assert.throws(()=>settlementDisplay({...draft,verified_net_cents:v}));
  assert.equal(settlementDisplay({...draft,verified_net_cents:'9007199254740991'}).verifiedNetCents,Number.MAX_SAFE_INTEGER);
  assert.throws(()=>settlementDisplay({...draft,invoice_gross_cents:Number.MAX_SAFE_INTEGER,fee_eligible_gross_cents:Number.MAX_SAFE_INTEGER,lumper_reimbursement_cents:1}));
});

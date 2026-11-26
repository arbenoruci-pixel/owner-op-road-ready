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
test('lumper is included once in credits and net comes from the database', () => {
  const row = {invoice_gross_cents:120000,fee_eligible_gross_cents:105000,lumper_reimbursement_cents:15000,credit_cents:15000,estimated_net_cents:111600,net_cents:null};
  assert.deepEqual(settlementDisplay(row),{invoiceGrossCents:120000,feeEligibleGrossCents:105000,lumperCents:15000,otherCreditsCents:0,totalCreditsCents:15000,netCents:111600});
  assert.equal(settlementDisplay({...row,net_cents:96600}).netCents,96600);
  assert.throws(() => settlementDisplay({...row,invoice_gross_cents:120001}));
  assert.throws(() => settlementDisplay({...row,credit_cents:14999}));
});

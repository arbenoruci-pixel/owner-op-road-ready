import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {register} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadPayLines, payoutLabel, payWeek} from '../../app/operator/payPresentation.js';
import {walletAttention, reviewDocuments} from '../../app/operator/roadDocuments.js';

register(new URL('../test-jsx-loader.mjs', import.meta.url));
register(new URL('./step3.css-loader.mjs', import.meta.url));
globalThis.React = React;
const {PortalWallet} = await import('../../app/operator/OperatorWallet.jsx');

test('weekly load earnings group real IDs and use each posted or draft line’s cent-rounded driver effect', () => {
  const freight = {load_id:'load-a', entry_type:'FREIGHT', status:'DRAFT', amount_cents:'180001', driver_effect_cents:165601};
  const lines = loadPayLines([
    freight, {...freight, entry_type:'FSC', status:'POSTED', amount_cents:'100.00', driver_effect_cents:'92.0'},
    {...freight, load_id:'load-b', amount_cents:140000, driver_effect_cents:128800},
    {...freight, status:'VOID', amount_cents:999999},
    {...freight, load_id:null, entry_type:'INSURANCE', amount_cents:-15000, driver_effect_cents:-15000},
    {...freight, entry_type:'LUMPER_REIMBURSEMENT', amount_cents:10000, driver_effect_cents:10000},
  ]);
  assert.deepEqual(lines.loads.map(({id,gross,net}) => [id,gross,net]), [['load-a',180101n,165693n],['load-b',140000n,128800n]]);
  assert.equal(lines.insurance, 15000n);
  assert.throws(() => loadPayLines([{...freight, driver_effect_cents:null}]));
});

test('drafts, confirmed payables, locked statements and evidenced payments have distinct labels', () => {
  const draft = {isConfirmed:false, netCents:null};
  const confirmed = {isConfirmed:true, netCents:2749};
  assert.deepEqual(payoutLabel('draft', draft), ['Estimated payout', 'Draft']);
  assert.deepEqual(payoutLabel('draft', confirmed), ['Confirmed payable', 'Draft']);
  assert.deepEqual(payoutLabel('issued', confirmed), ['Statement amount', 'Issued']);
  assert.equal(payoutLabel('issued', draft)[1], 'Reconciliation needed');
  const payment = {status:'paid', paid_at:'2020-05-04T13:15:00Z', payment_reference:'fixture-reference', payment_amount_cents:'2749.00'};
  assert.deepEqual(payoutLabel('paid', confirmed, payment), ['Paid amount','Paid']);
  assert.equal(payoutLabel('paid', confirmed, {...payment,payment_amount_cents:2748})[1], 'Payment details pending');
  assert.match(payWeek('2026-11-23'), /23.*29.*2026/);
});

test('driver wallet opens on actions, distinguishes the 30-day boundary and retains older evidence', () => {
  const today = '2026-11-23';
  const doc = {id:'one', title:'Insurance original', category:'insurance', slot_key:'insurance:one', expires_on:'2026-12-23', is_ready:true, is_current:true};
  const wallet = {docs:[
    doc,
    {...doc,id:'old',title:'Old insurance',revision:1,is_current:false,expires_on:'2025-01-01'},
    {...doc,id:'cab',title:'Cab registration',slot_key:'registration:cab',expires_on:'2026-12-24'},
    {...doc,id:'expired',title:'Expired inspection',slot_key:'inspection:one',expires_on:'2026-11-21'},
  ], requirements:[{slot_key:'permit:one', title:'Permit required',expiry_required:true}]};
  const items = reviewDocuments(wallet.docs, wallet.requirements, today);
  assert.deepEqual(items.map(item=>walletAttention(item,today,'2026-12-23')), ['urgent','warn','','urgent']);
  const rendered = renderToStaticMarkup(React.createElement(PortalWallet,{wallet,today}));
  const [attention, current] = rendered.split('Current documents');
  for (const title of ['Permit required','Insurance original','Expired inspection']) assert.ok(attention.includes(title));
  assert.doesNotMatch(attention,/Cab registration/);
  assert.match(current,/Cab registration/);
  assert.match(rendered,/Previous versions \(1\)/);
  assert.doesNotMatch(rendered,/DOT PIN|Unlock|Driver effect/);
});

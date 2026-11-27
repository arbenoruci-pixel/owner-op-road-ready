'use client';
import React, {useState} from 'react';
import {usePortalClient} from './PortalSession.jsx';
import {allRows} from './portalData.js';
import {chicagoDay, currentWeek, formatDay, weekStart} from './financials.js';
import {settlementDisplay} from '../../lib/rr-lease/intake-contract.js';
import {payWeek, payoutLabel, loadPayLines} from './payPresentation.js';
import {money, OriginalLink, ReadState, rpc, useRead} from './Step3Workspace.jsx';
import {WalletProof} from './OperatorWallet.jsx';
import css from './payWallet.module.css';

function AmountRow({label, value}) {
  return <div className={css.amountRow}><dt>{label}</dt><dd>{value}</dd></div>;
}

function PayHero({label, amount, status, week, count}) {
  const [dollars, cents] = money(amount).split('.');
  return <div className={css.payHero}>
    <div className={css.heroTop}><span>{label}</span><strong>{status}</strong></div>
    <div className={css.sum}>{dollars}{cents && <span>.{cents}</span>}</div>
    <div className={css.heroBottom}><span>{payWeek(week)}</span>{count != null && <b>{count} {Number(count) === 1 ? 'load' : 'loads'}</b>}</div>
  </div>;
}

function Settlement({operatorId, statement, refresh}) {
  const client = usePortalClient();
  const id = statement.settlement_id;
  const deps = [client, operatorId, id, refresh];
  const ledger = useRead(() => allRows(() => client.from('v_driver_ledger_entries').select('*')
    .eq('operator_id', operatorId).eq('settlement_id', id).order('created_at').order('id')), deps);
  const routes = useRead(() => allRows(() => client.from('rr_lease_loads')
    .select('id,load_number,broker_name,pickup_address,delivery_address,actual_delivery_date')
    .eq('operator_id', operatorId).eq('settlement_id', id).order('id')), deps);
  const payment = useRead(() => allRows(() => client.from('rr_lease_settlements')
    .select('id,status,paid_at,payment_reference,payment_amount_cents,expected_pay_date')
    .eq('operator_id', operatorId).eq('id', id).order('id')), deps);
  let totals;
  try { totals = settlementDisplay(statement); }
  catch { return <p role="alert">Totals require reconciliation.</p>; }
  const paymentRow = payment.value?.[0];
  const [label, status] = payoutLabel(statement.status, totals, paymentRow);
  let breakdown;
  try { breakdown = loadPayLines(ledger.value || []); }
  catch { breakdown = null; }
  const loads = breakdown?.loads || [];
  const insurance = breakdown?.insurance || 0n;
  const onlyInsurance = insurance > 0n && String(insurance) === String(statement.carrier_deduction_cents).replace(/\.0+$/, '');
  function charge(cents) {
    const value = money(cents);
    return value.startsWith('$') && value !== '$0.00' ? '−' + value : value;
  }
  return <>
    <PayHero label={label} status={status} amount={statement.status === 'draft' && !totals.isConfirmed ? totals.estimatedNetCents : totals.netCents} week={statement.week_start} count={statement.load_count}/>
    {totals.negativeBalanceCents > 0 && <p>Negative balance <strong>{money(totals.negativeBalanceCents)}</strong></p>}
    {status === 'Paid' && <p>Paid {formatDay(chicagoDay(new Date(paymentRow.paid_at)))}</p>}
    {paymentRow?.expected_pay_date && statement.status !== 'paid' && <p>Expected payment {formatDay(paymentRow.expected_pay_date)}</p>}
    <section><h3>Weekly breakdown</h3><dl className={css.card}>
      <AmountRow label="Gross load revenue" value={money(totals.feeEligibleGrossCents)}/>
      <AmountRow label="Carrier fee" value={charge(statement.carrier_share_cents)}/>
      <AmountRow label={onlyInsurance ? 'Weekly insurance' : 'Carrier deductions'} value={charge(statement.carrier_deduction_cents)}/>
      {totals.lumperCents !== 0 && <AmountRow label="Lumper reimbursement · 0% fee" value={money(totals.lumperCents)}/>}
      {totals.otherCreditsCents !== 0 && <AmountRow label="Other credits" value={money(totals.otherCreditsCents)}/>}
    </dl></section>
    <section><div className={css.sectionHead}><h3>Pay by load</h3><small>After carrier fee</small></div>
      <ReadState state={ledger}>{() => loads.length ? <div className={css.cards}>{loads.map(line => {
        const load = routes.value?.find(row => row.id === line.id);
        const place = address => address?.match(/,\s*([^,]+),\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\s*$/)?.slice(1).join(', ') || address;
        const route = [place(load?.pickup_address), place(load?.delivery_address)].filter(Boolean).join(' → ');
        return <article className={css.trip} key={line.id}>
          <small>{[load?.actual_delivery_date && formatDay(load.actual_delivery_date), load?.load_number && '#' + load.load_number].filter(Boolean).join(' · ')}</small>
          <div className={css.sectionHead}><strong>{route || load?.broker_name || line.description || 'Load revenue'}</strong><b>{money(String(line.net))}</b></div>
          <small>{money(String(line.gross))} gross · {money(String(line.gross - line.net))} carrier fee</small>
        </article>;
      })}</div> : breakdown ? <p>No load revenue entries for this week.</p> : <p role="alert">Load amounts require reconciliation.</p>}</ReadState>
    </section>
    <details className={css.disclosure}><summary>Calculation details</summary>
      <dl className={css.card}>
        <AmountRow label="Verified so far" value={money(totals.verifiedNetCents)}/>
        <AmountRow label="Invoice gross" value={money(totals.invoiceGrossCents)}/>
        <AmountRow label="Fee-eligible gross" value={money(totals.feeEligibleGrossCents)}/>
        <AmountRow label="Driver-paid costs · tax records" value={money(statement.operator_paid_cents)}/>
      </dl>
      {payment.error && <p role="alert">Payment details could not be loaded.</p>}
      <h3>Ledger entries</h3>
      <ReadState state={ledger}>{entries => entries.length ? entries.map(row => <article className={css.trip} key={row.id}>
        <strong>{row.entry_type.replaceAll('_', ' ')} · {money(row.amount_cents)}</strong><p>{row.description}</p>
        <small>{row.status} · Driver effect {money(row.driver_effect_cents)}</small>
        {row.source_document_id ? <OriginalLink id={row.source_document_id}/> : row.source_wallet_document_id
          ? <OriginalLink id={row.source_wallet_document_id} operatorId={operatorId} wallet/> : <small>Carrier report or schedule</small>}
      </article>) : <p>No ledger entries.</p>}</ReadState>
    </details>
  </>;
}

export default function DriverPay({operator, refresh}) {
  const client = usePortalClient();
  const [selected, setSelected] = useState('');
  const weeks = useRead(() => allRows(() => client.from('rr_lease_settlement_totals').select('*')
    .eq('operator_id', operator.id).order('week_start', {ascending:false}).order('settlement_id')), [client, operator.id, refresh]);
  const taxes = useRead(() => allRows(() => client.from('rr_lease_adjustments')
    .select('id,description,amount_cents,intake_status,wallet_document_id').eq('operator_id', operator.id)
    .eq('paid_by','operator').order('id')), [client, operator.id, refresh]);
  return <div className={css.screen}><h2>Weekly pay</h2>
    <ReadState state={weeks}>{list => {
      const current = list.find(row => row.settlement_id === selected) || list[0];
      if (!current) return <p>No weekly settlements yet.</p>;
      return <>{list.length > 1 && <label>Settlement week<select value={current.settlement_id} onChange={e => setSelected(e.target.value)}>
        {list.map(row => <option key={row.settlement_id} value={row.settlement_id}>{payWeek(row.week_start)}</option>)}
      </select></label>}<Settlement key={current.settlement_id} operatorId={operator.id} statement={current} refresh={refresh}/></>;
    }}</ReadState>
    <details className={css.disclosure}><summary>Driver-paid adjustments · all weeks</summary>
      <ReadState state={taxes}>{entries => entries.length ? entries.map(row => <article className={css.trip} key={row.id}>
        <strong>{row.description} · {money(row.amount_cents)}</strong><small>{row.intake_status} · No settlement deduction</small>
        {row.wallet_document_id && <WalletProof documentId={row.wallet_document_id} operatorId={operator.id}/>}
      </article>) : <p>No driver-paid adjustments recorded.</p>}</ReadState>
    </details>
  </div>;
}

export function OwnPay({refresh}) {
  const client = usePortalClient();
  const [week, setWeek] = useState(() => currentWeek());
  const amounts = useRead(() => rpc(client, 'rr_lease_step3_company_summary', {p_week:week}), [client, week, refresh]);
  return <div className={css.screen}><h2>Weekly truck earnings</h2>
    <label>Week starting<input type="date" value={week} onChange={event => {
      if (event.target.value) setWeek(weekStart(event.target.value));
    }}/></label>
    <ReadState state={amounts}>{summary => <>
      <PayHero label="Recorded margin" status="Own truck" amount={summary.ownRecordedMarginCents} week={week}/>
      <section><h3>Weekly breakdown</h3><dl className={css.card}>
        <AmountRow label="Verified truck revenue" value={money(summary.ownGrossCents)}/>
        <AmountRow label="Carrier ledger expenses" value={money(summary.recordedOwnExpensesCents)}/>
      </dl></section>
    </>}</ReadState>
  </div>;
}

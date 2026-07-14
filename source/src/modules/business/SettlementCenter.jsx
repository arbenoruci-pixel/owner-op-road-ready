import React, { useMemo, useState } from 'react';
import { addBusinessRecord, businessSummary, localDateKey, readBusinessStore, removeBusinessRecord } from './businessStore.js';

function number(value = 0) {
  const parsed = Number(String(value ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value = 0) {
  return Number(value || 0).toLocaleString(undefined, { style:'currency', currency:'USD', maximumFractionDigits:0 });
}

function money2(value = 0) {
  return Number(value || 0).toLocaleString(undefined, { style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:2 });
}

export default function SettlementCenter({ profile = {}, onBack, onScan }) {
  const [store, setStore] = useState(() => readBusinessStore());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    date:localDateKey(),
    loadNo:'',
    carrier:profile.carrierName || '',
    gross:'',
    expectedPay:'',
    actualPay:'',
    deductions:'',
  });
  const summary = useMemo(() => businessSummary(store), [store]);
  const share = number(profile.driverSharePercent || 0);

  function expectedFromGross(grossValue = form.gross) {
    const gross = number(grossValue);
    return gross > 0 && share > 0 ? gross * (share / 100) : 0;
  }

  function save(event) {
    event.preventDefault();
    if (!form.loadNo.trim() && !form.actualPay && !form.gross) return;
    const expectedPay = number(form.expectedPay) || expectedFromGross();
    const actualPay = number(form.actualPay);
    const next = addBusinessRecord(store, 'settlements', {
      ...form,
      loadNo:form.loadNo.trim().toUpperCase(),
      carrier:form.carrier.trim(),
      gross:number(form.gross),
      expectedPay,
      actualPay,
      deductions:number(form.deductions),
      difference:actualPay - expectedPay,
      source:'manual',
    });
    setStore(next);
    setForm({ date:localDateKey(), loadNo:'', carrier:profile.carrierName || '', gross:'', expectedPay:'', actualPay:'', deductions:'' });
    setShowForm(false);
  }

  function remove(id) {
    if (typeof window !== 'undefined' && !window.confirm('Remove this settlement record?')) return;
    setStore(removeBusinessRecord(store, 'settlements', id));
  }

  return (
    <section className="screen settlement-screen">
      <header className="business-head">
        <button type="button" className="business-back" onClick={onBack} aria-label="Back">‹</button>
        <div><span>Leased-on</span><b>Settlements</b></div>
        <button type="button" className="business-log-link" onClick={onScan}>Scan</button>
      </header>

      <main className="settlement-body">
        <section className="settlement-lease-card">
          <span>Your lease split</span>
          <div><b>{share || 0}%</b><em>you receive</em><i>{number(profile.carrierSharePercent || Math.max(0, 100 - share))}% carrier</i></div>
          <p>{profile.percentageBasis === 'linehaul' ? 'Linehaul only' : profile.percentageBasis === 'total_gross' ? 'Total gross' : 'Linehaul + fuel surcharge'}</p>
        </section>

        <section className="settlement-summary-grid">
          <div><span>Expected</span><b>{money(summary.settlementExpected)}</b></div>
          <div><span>Actual</span><b>{money(summary.settlementActual)}</b></div>
          <div className={summary.settlementDifference < 0 ? 'bad' : 'good'}><span>Difference</span><b>{money(summary.settlementDifference)}</b></div>
        </section>

        <section className="settlement-action-row">
          <button type="button" onClick={onScan}>Scan settlement</button>
          <button type="button" onClick={() => setShowForm(value => !value)}>{showForm ? 'Close' : 'Add manually'}</button>
        </section>

        {showForm ? (
          <form className="business-form settlement-form" onSubmit={save}>
            <div className="business-form-title"><b>Add settlement</b><span>Compare expected and actual pay</span></div>
            <div className="business-form-grid">
              <label className="business-field"><span>Date</span><input type="date" value={form.date} onChange={event => setForm({ ...form, date:event.target.value })} /></label>
              <label className="business-field"><span>Load #</span><input value={form.loadNo} onChange={event => setForm({ ...form, loadNo:event.target.value })} placeholder="Load / trip #" /></label>
              <label className="business-field wide"><span>Carrier</span><input value={form.carrier} onChange={event => setForm({ ...form, carrier:event.target.value })} placeholder="Carrier name" /></label>
              <label className="business-field"><span>Gross</span><input inputMode="decimal" value={form.gross} onChange={event => setForm({ ...form, gross:event.target.value, expectedPay:expectedFromGross(event.target.value) || '' })} placeholder="$0.00" /></label>
              <label className="business-field"><span>Expected</span><input inputMode="decimal" value={form.expectedPay} onChange={event => setForm({ ...form, expectedPay:event.target.value })} placeholder="$0.00" /></label>
              <label className="business-field"><span>Actual net</span><input inputMode="decimal" value={form.actualPay} onChange={event => setForm({ ...form, actualPay:event.target.value })} placeholder="$0.00" /></label>
              <label className="business-field"><span>Deductions</span><input inputMode="decimal" value={form.deductions} onChange={event => setForm({ ...form, deductions:event.target.value })} placeholder="$0.00" /></label>
            </div>
            <button type="submit" className="business-save">Save settlement</button>
          </form>
        ) : null}

        <div className="business-section-head settlement-list-head"><div><span>Settlement audit</span><b>{store.settlements.length} statements</b></div></div>
        {!store.settlements.length ? (
          <div className="business-empty"><span className="business-empty-mark">%</span><b>No settlements yet</b><p>Scan a carrier statement and Road Ready will compare expected percentage pay with the actual net.</p><button type="button" onClick={onScan}>Scan first settlement</button></div>
        ) : (
          <div className="business-record-list">
            {store.settlements.map(record => {
              const expected = number(record.expectedPay || record.expected);
              const actual = number(record.actualPay || record.netPay || record.actual);
              const difference = actual - expected;
              return (
                <article key={record.id} className="business-record-card settlement-record">
                  <div className="business-record-top"><span>{record.date || 'Settlement'}</span><button type="button" onClick={() => remove(record.id)}>×</button></div>
                  <b>{record.loadNo || 'Settlement statement'}</b>
                  <p>{record.carrier || profile.carrierName || 'Carrier'} · {record.source === 'smart_scan' ? 'Scanned' : 'Manual'}</p>
                  <div className="business-record-stats">
                    <span><em>Expected</em><b>{money2(expected)}</b></span>
                    <span><em>Actual</em><b>{money2(actual)}</b></span>
                    <span className={difference < 0 ? 'bad' : 'good'}><em>Difference</em><b>{money2(difference)}</b></span>
                  </div>
                  {difference < -1 ? <div className="settlement-short-pay">Possible short pay · review rate con, accessorials and deductions.</div> : null}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </section>
  );
}

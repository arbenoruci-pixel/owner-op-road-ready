import React, { useMemo } from 'react';
import { businessSummary, readBusinessStore } from './businessStore.js';

function money(value = 0) {
  return Number(value || 0).toLocaleString(undefined, { style:'currency', currency:'USD', maximumFractionDigits:0 });
}

function money2(value = 0) {
  return Number(value || 0).toLocaleString(undefined, { style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:2 });
}

export default function MoneyTaxCenter({ onBack, onOpenExpenses, onScan }) {
  const store = useMemo(() => readBusinessStore(), []);
  const summary = useMemo(() => businessSummary(store), [store]);
  const deadheadPercent = summary.totalMiles > 0 ? (summary.deadheadMiles / summary.totalMiles) * 100 : 0;

  const breakdown = [
    ['Fuel', summary.fuelCost],
    ['Maintenance', summary.maintenanceCost],
    ['Other operating costs', summary.otherExpenses],
  ];

  return (
    <section className="screen money-tax-screen">
      <header className="business-head">
        <button type="button" className="business-back" onClick={onBack} aria-label="Back">‹</button>
        <div><span>Owner-Op</span><b>Money & Taxes</b></div>
        <button type="button" className="business-log-link" onClick={onScan}>Scan</button>
      </header>

      <main className="money-tax-body">
        <section className="money-tax-hero">
          <span>Estimated business profit · this week</span>
          <b>{money(summary.estimatedNet)}</b>
          <em>{money2(summary.netPerMile)} net per total mile</em>
        </section>

        <section className="money-tax-grid">
          <div><span>Gross</span><b>{money(summary.gross)}</b><em>booked this week</em></div>
          <div><span>Expenses</span><b>{money(summary.totalExpenses)}</b><em>{money2(summary.costPerMile)} / mile</em></div>
          <div className="reserve"><span>Suggested tax reserve</span><b>{money(summary.estimatedTaxReserve)}</b><em>25% planning estimate</em></div>
          <div><span>Total miles</span><b>{summary.totalMiles.toLocaleString()}</b><em>{deadheadPercent.toFixed(1)}% deadhead</em></div>
        </section>

        <section className="money-tax-card">
          <div className="money-tax-card-head"><div><span>Cost breakdown</span><b>Where the money went</b></div><button type="button" onClick={onOpenExpenses}>Open expenses</button></div>
          <div className="money-tax-breakdown">
            {breakdown.map(([label, value]) => {
              const share = summary.totalExpenses > 0 ? (Number(value || 0) / summary.totalExpenses) * 100 : 0;
              return (
                <div key={label}>
                  <span><b>{label}</b><em>{money(value)}</em></span>
                  <i><u style={{ width:`${Math.min(100, share)}%` }} /></i>
                </div>
              );
            })}
          </div>
        </section>

        <section className="money-tax-card">
          <div className="money-tax-card-head"><div><span>Tax organizer</span><b>Keep the CPA package clean</b></div></div>
          <div className="money-tax-checklist">
            <div className={store.fuel.length ? 'done' : ''}><span>{store.fuel.length ? '✓' : '1'}</span><b>Fuel receipts</b><em>{store.fuel.length} saved</em></div>
            <div className={store.maintenance.length ? 'done' : ''}><span>{store.maintenance.length ? '✓' : '2'}</span><b>Repair & service bills</b><em>{store.maintenance.length} saved</em></div>
            <div className={store.expenses.length ? 'done' : ''}><span>{store.expenses.length ? '✓' : '3'}</span><b>Operating expenses</b><em>{store.expenses.length} saved</em></div>
            <div className={store.loads.length ? 'done' : ''}><span>{store.loads.length ? '✓' : '4'}</span><b>Load income</b><em>{store.loads.length} tracked</em></div>
          </div>
        </section>

        <section className="money-tax-disclaimer">
          <b>Planning estimate</b>
          <p>Tax reserve and estimated profit are organization tools. Final deductions, quarterly payments and tax liability should be confirmed with a tax professional.</p>
        </section>
      </main>
    </section>
  );
}

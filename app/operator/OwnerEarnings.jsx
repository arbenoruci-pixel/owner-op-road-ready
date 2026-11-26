'use client';

import { useEffect, useState } from 'react';
import { allRows, usd } from './portalData.js';
import { usePortalClient } from './PortalSession.jsx';
import { activityDays, currentWeek, formatDay, moveDay, recordedRevenue, weekStart } from './financials.js';
import { WalletProof } from './OperatorWallet.jsx';
import styles from './operator.module.css';

export default function OwnerEarnings({ operatorId, refresh }) {
  const client = usePortalClient();
  const [week, setWeek] = useState(() => currentWeek());
  const [result, setResult] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    const end = moveDay(week, 7);
    const loads = allRows(() => client.from('rr_lease_loads')
      .select('id,load_number,broker_name,actual_delivery_date,gross_cents')
      .eq('operator_id', operatorId).in('status', ['delivered', 'closed'])
      .gte('actual_delivery_date', week).lt('actual_delivery_date', end).order('id'));
    const expenses = allRows(() => client.from('rr_lease_owner_expenses')
      .select('id,kind,purchased_on,description,amount_cents,evidence_reference,wallet_document_id')
      .eq('operator_id', operatorId).gte('purchased_on', week).lt('purchased_on', end).order('id'));
    Promise.all([loads, expenses]).then(([freight, costs]) => {
      if (active) setResult({ week, freight, costs });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [client, week, operatorId, refresh]);
  const shown = result?.week === week ? result : null;
  const revenue = shown && recordedRevenue(shown.freight);
  const cost = shown?.costs.reduce((total, item) => total + item.amount_cents, 0);
  const days = shown && activityDays(shown.freight, shown.costs);
  return (
    <section>
      <div className={styles.weekPicker}>
        <button type="button" aria-label="Previous week" onClick={() => setWeek(moveDay(week, -7))}>‹</button>
        <label>Week of
          <input type="date" value={week} onChange={(event) => {
            if (event.target.value) setWeek(weekStart(event.target.value));
          }} />
        </label>
        <button type="button" aria-label="Next week" onClick={() => setWeek(moveDay(week, 7))}>›</button>
      </div>
      {error ? <p role="alert">Could not load this week. Tap Refresh to try again.</p>
        : !shown ? <p role="status">Loading activity…</p>
        : days.length === 0 ? <p>No completed loads or recorded expenses for this week.</p>
        : <>
          <dl className={styles.summaryGrid}>
            <div><dt>Completed loads</dt><dd>{shown.freight.length}</dd></div>
            <div><dt>Gross revenue</dt><dd>{usd(revenue)}</dd></div>
            <div><dt>Recorded expenses after refunds</dt><dd>{usd(cost)}</dd></div>
            <div><dt>Revenue less recorded expenses</dt><dd>{usd(revenue === null ? null : revenue - cost)}</dd></div>
          </dl>
          <div className={styles.list}>
            {days.map((day) => <details key={day.date} className={styles.card}>
              <summary><strong>{formatDay(day.date)}</strong><span>{day.loads.length} loads · {day.expenses.length} expenses</span></summary>
              <div className={styles.detail}>
                {day.loads.map((load) => <div key={load.id} className={styles.pair}>
                  <div><b>Load {load.load_number}</b><small className={styles.meta}>{load.broker_name}</small></div>
                  <strong>{usd(load.gross_cents)}</strong>
                </div>)}
                {day.expenses.map((item) => <div key={item.id}>
                  <div className={styles.pair}><span>{item.description}</span><strong>{usd(-item.amount_cents)}</strong></div>
                  <small className={styles.meta}>{item.evidence_reference}</small>
                  {item.wallet_document_id && <WalletProof documentId={item.wallet_document_id} operatorId={operatorId} />}
                </div>)}
              </div>
            </details>)}
          </div>
        </>}
    </section>
  );
}

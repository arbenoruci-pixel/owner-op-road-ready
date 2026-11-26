'use client';

import { useEffect, useState } from 'react';
import { usePortalClient } from './PortalSession.jsx';
import styles from './operator.module.css';

const pageSize = 12;

export default function LegacyHistory({ operatorId, refresh }) {
  const client = usePortalClient();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [records, setRecords] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setError(false);
    setRecords(null);
    client.rpc('rr_lease_owner_legacy_loads', { p_operator_id: operatorId })
      .order('delivery_date', { ascending: false, nullsFirst: false }).order('legacy_key')
      .range(page * pageSize, (page + 1) * pageSize)
      .then(({ data, error: failure }) => {
        if (active) {
          if (failure) setError(true);
          else setRecords(data || []);
        }
      }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [client, operatorId, page, refresh, open]);
  return (
    <details className={styles.card} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary><strong>Earlier RoadReady load folders</strong></summary>
      {open && <div className={styles.detail}>
        {error ? <p role="alert">Could not load earlier folders. Tap Refresh to try again.</p>
          : !records ? <p role="status">Loading folders…</p>
          : <>
            {records.slice(0, pageSize).map((load) => <div className={styles.legacyRow} key={load.legacy_key}>
              <strong>{load.load_number ? 'Load ' + load.load_number : 'Load folder'}</strong>
              <span>{[load.broker_name, load.delivery_date || load.pickup_date].filter(Boolean).join(' · ')}</span>
              <small>{[load.origin, load.destination].filter(Boolean).join(' → ')}</small>
            </div>)}
            {!records.length && <p>No earlier folders on this page.</p>}
            {(page > 0 || records.length > pageSize) && <div className={styles.pager}>
              <button type="button" disabled={!page} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page + 1}</span>
              <button type="button" disabled={records.length <= pageSize} onClick={() => setPage(page + 1)}>Next</button>
            </div>}
          </>}
        <a href="/">Open original RoadReady folders</a>
      </div>}
    </details>
  );
}

'use client';
import React, {useEffect, useMemo, useState} from 'react';
import {readBusinessStore, BUSINESS_STORE_EVENT} from '../business/businessStore.js';
import {readOwnerOpsStoreV102, OWNER_OPS_STORE_EVENT_V102} from '../owneros/ownerOpsStoreV102.js';
import {listVaultDocumentsV102, openVaultDocumentV102} from '../owneros/documentVaultV102.js';
import {monthlyRecords} from './month.js';
import './smartImport.css';

const money = value => Number(value || 0).toLocaleString('en-US', {style: 'currency', currency: 'USD'});
function dayInZone(timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date());
  const at = type => parts.find(part => part.type === type)?.value;
  return `${at('year')}-${at('month')}-${at('day')}`;
}
function Card({title, value, detail, children}) {
  return <section className="rr-month-card"><h2>{title}</h2><strong>{value}</strong><p>{detail}</p>{children}</section>;
}

export default function MonthlyRecords({state = {}, onBack, onImport, onDocuments, onLog, onWallet}) {
  // This display zone does not change the stored terminal policy or old events.
  const today = dayInZone('America/Chicago');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [driverId, setDriverId] = useState(state.activeDriverId || state.teamDrivers?.[0]?.id || 'driver_primary');
  const [business, setBusiness] = useState(() => readBusinessStore()), [owner, setOwner] = useState(() => readOwnerOpsStoreV102());
  const [documents, setDocuments] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    let live = true, sequence = 0;
    const refresh = async () => {
      const current = ++sequence;
      setBusiness(readBusinessStore()); setOwner(readOwnerOpsStoreV102());
      try { const rows = await listVaultDocumentsV102(); if (live && current === sequence) { setDocuments(rows); setLoading(false); } }
      catch (reason) { if (live && current === sequence) { setError(reason.message); setLoading(false); } }
    };
    refresh();
    const events = [BUSINESS_STORE_EVENT, OWNER_OPS_STORE_EVENT_V102, 'storage', 'road-ready-evidence-filed'];
    events.forEach(event => window.addEventListener(event, refresh));
    return () => { live = false; events.forEach(event => window.removeEventListener(event, refresh)); };
  }, []);
  const model = useMemo(() => monthlyRecords({month, state, owner, business, documents, driverId, today}), [month, state, owner, business, documents, driverId, today]);
  async function original(document) {
    const result = await openVaultDocumentV102(document);
    if (!result.ok) setError('The original is not available on this device yet. Open Documents to check its saved or cloud copy.');
  }
  return <main className="rr-month" aria-label="My month">
    <header><button type="button" onClick={onBack}>‹ Home</button><h1>My month</h1><button type="button" className="rr-smart-primary" onClick={onImport}>Import</button></header>
    <div className="rr-smart-fields"><label>Month<input type="month" value={month} onChange={event => { if (event.target.value) setMonth(event.target.value); }}/></label><label>Driver<select value={driverId} onChange={event => setDriverId(event.target.value)}><option value="">All drivers</option>{(state.teamDrivers?.length ? state.teamDrivers : [{id: state.activeDriverId || 'driver_primary', name: state.driverProfile?.name || 'Current driver'}]).map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label></div>
    <p>Saved records and source documents for {month}. Loads spanning two months keep their original identity.</p>
    {loading ? <p role="status">Loading saved source files…</p> : null}
    {error ? <p role="alert" className="rr-smart-error">{error}</p> : null}
    <div className="rr-month-grid">
      <Card title="Logs" value={`${model.logs.length} saved days`} detail={`${model.logs.filter(log => log.signature).length} saved signatures · ${model.archives.length} imported reports`}>
        <button type="button" onClick={onLog}>Open logbook</button>
        {model.missingLocalDays.length ? <details><summary>{model.missingLocalDays.length} days have no local log</summary><p>Imported PDF ranges need individual review. A local gap may have an original report on file.</p><p>{model.missingLocalDays.join(' · ')}</p></details> : null}
      </Card>
      <Card title="State miles" value={model.miles.toFixed(1) + ' mi'} detail={`${model.mileage.length} source rows · ${model.jurisdictions.join(', ') || 'No state miles imported'}`}>
        {model.unknownTaxableRows ? <p>{model.unknownTaxableRows} rows need separate taxable-mileage review.</p> : null}<button type="button" onClick={onImport}>Import miles</button>
      </Card>
      <Card title="Fuel" value={money(model.totalFuel)} detail={`${model.gallons.toFixed(3)} US gal · ${model.fuel.length} transactions`}>
        {model.sourceLinksToReview ? <p>{model.sourceLinksToReview} transactions need a source link checked.</p> : null}<button type="button" onClick={onImport}>Import fuel</button>
      </Card>
      <Card title="Loads & documents" value={`${model.loads.length} loads`} detail={`${model.files.length} source documents touch this month`}><button type="button" onClick={onDocuments}>Open documents</button></Card>
      <Card title="Expenses & settlements" value={money(model.totalExpenses)} detail={`${model.expenses.length} expenses · ${model.tolls.length} tolls · ${model.settlements.length} settlements`}><button type="button" onClick={onDocuments}>Review source documents</button></Card>
      <Card title="Safety & IRP documents" value={`${model.expiring.length} expiry dates to review`} detail="Saved wallet documents dated through this month."><button type="button" onClick={onWallet}>Open Wallet</button></Card>
    </div>
    {model.conflicts.length || model.undated ? <aside className="rr-smart-review"><h2>Records to review</h2>{model.conflicts.length ? <p>{model.conflicts.length} conflicting transaction groups are kept out of totals.</p> : null}{model.undated ? <p>{model.undated} records have no valid date and are outside the monthly totals.</p> : null}</aside> : null}
    <section className="rr-smart-review"><h2>Originals for this month</h2>{model.files.length ? <ul className="rr-month-files">{model.files.map(document => <li key={document.local_id || document.id}><div><b>{document.title || document.original_file_name || document.type}</b>{document.original_file_name && document.title ? <span>{document.original_file_name}</span> : null}<span>{document.extracted?.periodStart || document.document_date || document.extracted?.date || ''}{document.extracted?.periodEnd ? ' → ' + document.extracted.periodEnd : ''}{document.extracted?.driverName ? ' · ' + document.extracted.driverName : ''}</span></div><button type="button" onClick={() => original(document)}>Open original</button></li>)}</ul> : <p>No dated source originals found for this month. Import a statement or logbook report to organize it here.</p>}</section>
  </main>;
}

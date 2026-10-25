'use client';
import React, {useEffect, useRef, useState} from 'react';
import {parseStatementCsv, quarterPeriod} from './core.js';
import {commitStatementReview, importContext, prepareLogbookReview, prepareStatementReview} from './storage.js';
import './smartImport.css';

const providers = ['Mudflap', 'Motive / KeepTruckin', 'Samsara', 'Geotab', 'Illinois Tollway', 'E-ZPass'];
const zones = ['America/Chicago', 'America/New_York', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage'];
const money = value => Number(value || 0).toLocaleString('en-US', {style: 'currency', currency: 'USD'});
const reportToday = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export default function SmartImportPanel({state = {}, initialFile, onDone, onScan}) {
  const input = useRef(null), generation = useRef(0);
  const [file, setFile] = useState(null), [kind, setKind] = useState('auto');
  const [provider, setProvider] = useState('auto'), [customProvider, setCustomProvider] = useState('');
  const [account, setAccount] = useState(''), [unit, setUnit] = useState(''), [timezone, setTimezone] = useState('');
  const [periodStart, setPeriodStart] = useState(''), [periodEnd, setPeriodEnd] = useState('');
  const [motive, setMotive] = useState(false), [truck, setTruck] = useState('');
  const [reportYear, setReportYear] = useState(() => reportToday().slice(0,4)), [reportQuarter, setReportQuarter] = useState(() => Math.ceil(Number(reportToday().slice(5,7)) / 3));
  const [driverId, setDriverId] = useState(state.activeDriverId || state.teamDrivers?.[0]?.id || 'driver_primary');
  const [busy, setBusy] = useState(false), [review, setReview] = useState(null), [checked, setChecked] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  useEffect(() => { if (initialFile) { setFile(initialFile.file || null); setKind(initialFile.kind || 'auto'); setReview(null); setChecked(false); } }, [initialFile]);
  useEffect(() => { generation.current += 1; setReview(null); setChecked(false); setError(''); }, [file, kind, provider, customProvider, account, unit, timezone, periodStart, periodEnd, driverId, motive, truck, reportYear, reportQuarter]);
  useEffect(() => () => { generation.current += 1; }, []);
  const context = () => {
    const value = importContext(state), driver = state.teamDrivers?.find(row => row.id === driverId);
    return {...value, driverId, driverName: driver?.name || (driverId === value.driverId ? value.driverName : '')};
  };
  function choose(value) {
    setFile(value || null); setMessage('');
    if (!motive && value && /\.pdf$/i.test(value.name)) setKind('logs');
    else if (kind === 'logs') setKind('auto');
  }
  async function inspect(event) {
    event.preventDefault();
    if (!file) return;
    const current = ++generation.current;
    setBusy(true); setReview(null); setChecked(false); setError(''); setMessage('');
    try {
      const name = provider === 'other' ? customProvider.trim() : provider;
      if (provider === 'other' && !name) throw Error('Enter the provider’s name from the statement.');
      const range = motive ? quarterPeriod(`${reportYear}-Q${reportQuarter}`) : null;
      const options = {kind, provider: name, providerAccount: account.trim(), mileageUnit: unit, timezone, periodStart: range?.start || periodStart, periodEnd: range?.end || periodEnd, truck: truck.trim(), requireTruck: motive, mileageBasis: motive ? 'motive_gateway' : 'provider_report', ...context()};
      let result;
      if (kind === 'logs') result = await prepareLogbookReview(file, options, context());
      else {
        if (!/\.csv$/i.test(file.name) || file.size > 20 * 1024 * 1024 || !file.size) throw Error(motive ? 'Choose the Motive Distance Summary CSV under 20 MB. A PDF cannot supply verified state-mile totals; keep its original with your audit documents.' : 'Choose a CSV statement under 20 MB. Logbook reports can be imported as PDF.');
        const parsed = parseStatementCsv(await file.text(), file.name, options);
        if (parsed.provider === 'Other provider') throw Error('Choose the provider or enter its name before reviewing this statement.');
        result = await prepareStatementReview(file, parsed, context());
      }
      if (current === generation.current) setReview(result);
    } catch (reason) { if (current === generation.current) setError(reason.message || 'The file could not be reviewed.'); }
    finally { if (current === generation.current) setBusy(false); }
  }
  async function save() {
    if (!review || !checked) return;
    setBusy(true); setError('');
    try {
      const result = await commitStatementReview(review);
      setMessage(result.readOnly ? 'Original logbook report saved with its driver, dates and timezone.' : `Saved ${result.added} new row${result.added === 1 ? '' : 's'} and the original statement. ${result.duplicates} duplicate row${result.duplicates === 1 ? '' : 's'} kept once.`);
      if (result.journalPending) setMessage(value => value + ' The source is saved; its completion marker will need checking.');
      setReview(null); setChecked(false); setFile(null); onDone?.(result);
    } catch (reason) { setError(reason.message || 'Import could not be completed. Review it again.'); }
    finally { setBusy(false); }
  }
  const plan = review?.plan;
  return <section className="rr-smart-import" aria-label="Smart Import">
    <h2>Smart Import</h2>
    <p>Bring in fuel, state miles and toll statements. Save Motive or another ELD’s logbook PDF with its original dates and driver.</p>
    <button type="button" disabled={busy} onClick={() => { setMotive(true); setKind('mileage'); setProvider('Motive / KeepTruckin'); setUnit('mi'); setFile(null); setMessage(''); }}>Import Motive miles — IFTA / IRP</button>
    {motive ? <p>Use the Distance Summary CSV from your Motive Vehicle Gateway for the selected quarter. Manual daily logbook miles stay separate. Trip details and original columns stay with the source file.</p> : null}
    <form onSubmit={inspect}>
      <fieldset disabled={busy}>
        <legend>Choose a source</legend>
        <button type="button" className="rr-smart-primary" onClick={() => input.current?.click()}>{motive ? 'Choose Motive CSV' : 'Choose CSV or logbook PDF'}</button>
        <input ref={input} type="file" accept={motive ? '.csv,text/csv' : '.csv,.pdf,text/csv,application/pdf'} hidden aria-label="Choose statement or logbook" onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }}/>
        {file ? <p className="rr-smart-filename">{file.name}</p> : null}
        <div className="rr-smart-fields">
          {!motive ? <>
          <label>File contains<select disabled={motive} value={kind} onChange={event => setKind(event.target.value)}><option value="auto">Detect CSV format</option><option value="fuel">Fuel transactions</option><option value="mileage">State miles / IFTA distance</option><option value="tolls">Toll transactions</option><option value="logs">Read-only logbook PDF</option></select></label>
          <label>Provider<select disabled={motive} value={provider} onChange={event => setProvider(event.target.value)}><option value="auto">{kind === 'logs' ? 'Choose from the report' : 'Detect from source'}</option>{providers.map(name => <option key={name}>{name}</option>)}<option value="other">Another provider</option></select></label>
          </> : null}
          {motive ? <><label>Report year<input type="number" min="1900" max="2200" required value={reportYear} onChange={event => setReportYear(event.target.value)}/></label><label>Quarter<select aria-label="Quarter" value={reportQuarter} onChange={event => setReportQuarter(event.target.value)}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>Q{value}</option>)}</select></label></> : null}
          {kind === 'mileage' ? <label>Truck / unit, if absent from CSV<input value={truck} maxLength={80} placeholder="Use the number on the Motive report" onChange={event => setTruck(event.target.value)}/></label> : null}
          {!motive && provider === 'other' ? <label>Provider name<input value={customProvider} maxLength={80} onChange={event => setCustomProvider(event.target.value)}/></label> : null}
          {!motive ? <label>Provider account label (optional)<input value={account} maxLength={80} placeholder="Company account or card label" onChange={event => setAccount(event.target.value)}/></label> : null}
          {kind === 'mileage' || kind === 'auto' ? <label>Distance unit, if unlabeled<select value={unit} onChange={event => setUnit(event.target.value)}><option value="">Use labeled source units</option><option value="mi">Miles</option><option value="km">Kilometers — convert to miles</option></select></label> : null}
          {kind === 'logs' ? <>
            <label>Driver<select value={driverId} onChange={event => setDriverId(event.target.value)}>{(state.teamDrivers?.length ? state.teamDrivers : [{id: context().driverId, name: context().driverName || 'Current driver'}]).map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label>
            <label>First report date<input type="date" required value={periodStart} onChange={event => setPeriodStart(event.target.value)}/></label>
            <label>Last report date<input type="date" required value={periodEnd} onChange={event => setPeriodEnd(event.target.value)}/></label>
            <label>Report’s home-terminal timezone<select required value={timezone} onChange={event => setTimezone(event.target.value)}><option value="">Choose from the report</option>{zones.map(zone => <option key={zone}>{zone}</option>)}</select></label>
          </> : null}
        </div>
        <button type="submit" disabled={!file} className="rr-smart-primary">{busy ? 'Checking source…' : 'Review import'}</button>
        {motive ? <button type="button" onClick={() => { setMotive(false); setKind('auto'); setProvider('auto'); setFile(null); }}>Other import</button> : null}
        {onScan ? <button type="button" onClick={() => onScan('auto')}>Scan a receipt or document</button> : null}
      </fieldset>
    </form>
    {busy ? <p role="status">Checking the original and saved records…</p> : null}
    {error ? <p role="alert" className="rr-smart-error">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {plan ? <section className="rr-smart-review" aria-label="Import preview">
      <h3>{plan.provider} · {plan.kind === 'logs' ? 'Logbook report' : plan.kind}</h3>
      <p>{plan.periodStart} → {plan.periodEnd}</p>
      {plan.kind === 'mileage' ? <p>Truck: {[...new Set(plan.rows.map(row => row.truck).filter(Boolean))].join(', ') || 'Not specified'} · Original CSV and source units are preserved. Period totals are never spread across days or months.</p> : null}
      {plan.readOnly ? <p>Archive for {review.context.driverName} · {plan.timezone}. The original PDF stays available for review. Its date range does not verify every daily log.</p> : <>
        <div className="rr-smart-metrics"><span><b>{plan.added.length}</b> new</span><span><b>{plan.duplicates.length}</b> duplicates</span><span><b>{plan.conflicts.length}</b> conflicts</span><span><b>{plan.issues.length}</b> source issues</span></div>
        <p>{plan.kind === 'fuel' ? `${plan.totals.gallons.toFixed(3)} US gal · ${money(plan.totals.total)}` : plan.kind === 'mileage' ? `${plan.totals.miles.toFixed(1)} miles · ${plan.rows.filter(row => row.taxableMiles === null).length} rows without separate taxable mileage` : money(plan.totals.total)}</p>
        <p>Source load references stay with their rows. Transactions without a source load remain unlinked.</p>
        {plan.rows.length ? <div className="rr-smart-table-wrap"><table><caption>First {Math.min(plan.rows.length, 50)} of {plan.rows.length} rows</caption><thead><tr><th>Date</th><th>State</th><th>{plan.kind === 'mileage' ? 'Miles' : 'Amount'}</th><th>Source ID</th></tr></thead><tbody>{plan.rows.slice(0, 50).map((row, index) => <tr key={index}><td>{row.date}</td><td>{row.state || '—'}</td><td>{plan.kind === 'mileage' ? row.miles.toFixed(1) : money(row.total ?? row.amount)}</td><td>{row.transactionId || 'Fingerprint'}</td></tr>)}</tbody></table></div> : null}
        {plan.issues.length ? <ul className="rr-smart-error">{plan.issues.slice(0, 30).map((issue, index) => <li key={index}>Row {issue.row}: {issue.message}</li>)}</ul> : null}
        {plan.conflicts.length ? <section role="alert"><h4>Transactions need review</h4><p>{plan.kind === 'mileage' ? 'Reports overlap or saved values differ. Nothing is replaced or added to mileage totals. Use non-overlapping source periods; the existing originals remain saved.' : 'Saved and incoming values differ. Correct the source or review the saved transaction, then run the preview again.'}</p><ul>{plan.conflicts.slice(0, 20).map((conflict, index) => <li key={index}>{conflict.incoming.date} · {conflict.incoming.transactionId || conflict.incoming.externalId || 'Source row'} · saved {plan.kind === 'mileage' ? conflict.saved[0]?.miles : money(conflict.saved[0]?.total ?? conflict.saved[0]?.amount)} / incoming {plan.kind === 'mileage' ? conflict.incoming.miles : money(conflict.incoming.total ?? conflict.incoming.amount)}</li>)}</ul></section> : null}
      </>}
      <label className="rr-smart-confirm"><input type="checkbox" checked={checked} disabled={busy || !plan.canSave} onChange={event => setChecked(event.target.checked)}/>{motive ? 'I checked the truck, quarter and actual Vehicle Gateway miles against the Motive report.' : `I checked the source, dates${plan.readOnly ? ', driver and timezone' : ' and totals'}.`}</label>
      <button type="button" className="rr-smart-primary" disabled={busy || !plan.canSave || !checked} onClick={save}>{plan.readOnly ? 'Save original logbook report' : plan.added.length ? `Save ${plan.added.length} new rows + original` : 'Keep statement original'}</button>
      <button type="button" disabled={busy} onClick={() => { setReview(null); setChecked(false); }}>Cancel preview</button>
    </section> : null}
  </section>;
}

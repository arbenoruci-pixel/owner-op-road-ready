'use client';

import React, {useEffect, useRef, useState} from 'react';
import {money} from './Step3Workspace.jsx';
import styles from './maintenanceHistory.module.css';

const categories = {PM:'Preventive maintenance', service:'Service / repair', warranty:'Warranty', defect:'Defect / safety concern'};
const totalSources = {reader:'Read from receipt', driver:'Confirmed by driver'};
const mileage = value => Number(value).toLocaleString('en-US')+' mi';
const displayDate = new Intl.DateTimeFormat('en-US', {month:'short', day:'numeric', year:'numeric'});
const displayMonth = new Intl.DateTimeFormat('en-US', {month:'long', year:'numeric'});

function assetLabel(record) {
  const unit = record.unit?.trim();
  const type = {truck:'Truck', trailer:'Trailer'}[record.receipt?.assetType];
  if (!unit) return type || '';
  if (/^(truck|trailer)\b/i.test(unit)) return unit;
  if (/^unit\b/i.test(unit)) return type ? unit.replace(/^unit\b/i, type) : unit;
  return (type || 'Unit')+' '+unit;
}

function dateLabel(value, format = displayDate) {
  if (!value) return '';
  const date = new Date(value+'T12:00:00');
  return Number.isNaN(date.valueOf()) ? value : format.format(date);
}

function receiptDate(record) {
  const label = dateLabel(record.record_date);
  return label && record.receipt?.dateSource === 'recorded' ? 'Recorded '+label : label;
}

function SavedOriginal({record, client}) {
  const [original, setOriginal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => () => {if (original) URL.revokeObjectURL(original.url);}, [original]);

  async function open() {
    if (request.current) return;
    const control = new AbortController();
    request.current = control;
    setBusy(true);
    setError('');
    try {
      const {fetchMaintenanceOriginal} = await import('./maintenanceArchive.js');
      const blob = await fetchMaintenanceOriginal(client, record, control.signal);
      if (control.signal.aborted) return;
      const file = new File([blob], record.file_name, {type:blob.type});
      const canShare = Boolean(navigator.share && navigator.canShare?.({files:[file]}));
      setOriginal({url:URL.createObjectURL(blob), file, canShare});
    } catch (e) {
      if (!control.signal.aborted) setError(e.message || 'Could not open the original.');
    } finally {
      request.current = null;
      if (!control.signal.aborted) setBusy(false);
    }
  }

  async function share() {
    setError('');
    try {
      await navigator.share({files:[original.file]});
    } catch (e) {
      if (e.name !== 'AbortError') setError('Sharing was unavailable. You can download the original.');
    }
  }

  return <div className={styles.original}>
    <small>{record.file_name}</small>
    {original ? <div className={styles.originalActions}>
      <a href={original.url} target="_blank" rel="noreferrer">View original</a>
      <a href={original.url} download={record.file_name}>Download</a>
      {original.canShare && <button type="button" onClick={share}>Share</button>}
    </div> : <button type="button" disabled={busy} onClick={open}>{busy ? 'Opening…' : 'Open original receipt'}</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function ServiceRecord({record, client, open}) {
  const receipt = record.receipt;
  const category = categories[record.expense_category] || record.expense_category;
  const vendor = record.vendor?.trim();
  const description = record.description?.trim();
  const title = vendor || description || category || 'Maintenance';
  const total = record.amount_cents;
  const totalSource = totalSources[receipt?.totalSource];
  return <details className={styles.record} open={open}>
    <summary className={styles.row}>
      <span className={styles.identity}><strong>{title}</strong>
        <small>{[receiptDate(record), assetLabel(record)].filter(Boolean).join(' · ')}</small>
      </span>
      {total != null ? <strong className={styles.total}>{money(total)}</strong>
        : <small className={styles.noAmount}>No amount recorded</small>}
      <span className={styles.chevron} aria-hidden="true"/>
    </summary>
    <div className={styles.detail}>
      {description && description !== title && description !== 'Maintenance receipt' && <p>{description}</p>}
      <p>{[category, record.odometer != null && mileage(record.odometer)].filter(Boolean).join(' · ')}</p>
      {record.next_service_odometer != null && <p>Next service at {mileage(record.next_service_odometer)}</p>}
      {record.next_service_date && <p>Next service on {dateLabel(record.next_service_date)}</p>}
      {receipt?.invoiceNumber && <p>Invoice #{receipt.invoiceNumber}</p>}
      {receipt?.lines?.length > 0 && <dl className={styles.figures}>{receipt.lines.map((line, index) =>
        <div key={index}><dt>{line.description}
          {(line.quantity != null || line.unitPriceCents != null) && <small>
            {[line.quantity != null && 'Qty '+line.quantity, line.unitPriceCents != null && money(line.unitPriceCents)+' each'].filter(Boolean).join(' × ')}
          </small>}
        </dt><dd>{money(line.amountCents)}</dd></div>
      )}</dl>}
      {total != null && <dl className={styles.figures}>
        {receipt?.subtotalCents != null && <div><dt>Subtotal</dt><dd>{money(receipt.subtotalCents)}</dd></div>}
        {receipt?.taxCents != null && <div><dt>Tax</dt><dd>{money(receipt.taxCents)}</dd></div>}
        <div><dt>{receipt ? 'Invoice total' : 'Recorded cost'}{totalSource && <small>{totalSource}</small>}</dt><dd>{money(total)}</dd></div>
        {receipt?.paidCents != null && <div><dt>Amount paid</dt><dd>{money(receipt.paidCents)}</dd></div>}
        {receipt?.balanceDueCents != null && <div><dt>Balance due</dt><dd>{money(receipt.balanceDueCents)}</dd></div>}
        {receipt && <div><dt>Payment source</dt><dd>{{driver:'Driver funds', carrier:'Carrier funds'}[receipt.payer] || 'Unconfirmed'}</dd></div>}
      </dl>}
      {record.file_name && <SavedOriginal record={record} client={client}/>}
    </div>
  </details>;
}

function NextService({records}) {
  const reminders = new Map();
  const lastMiles = new Map();
  for (const record of records) {
    // A record with no unit cannot identify the equipment on another service.
    const key = record.unit?.trim() ? assetLabel(record).toLowerCase() : record.id;
    if (record.odometer != null && !lastMiles.has(key)) lastMiles.set(key, Number(record.odometer));
    if ((record.next_service_date || record.next_service_odometer != null) && !reminders.has(key)) reminders.set(key, record);
  }
  if (!reminders.size) return null;
  const first = reminders.values().next().value;
  const summary = reminders.size > 1 ? reminders.size+' reminders'
    : first.next_service_date ? dateLabel(first.next_service_date) : mileage(first.next_service_odometer);
  return <details className={styles.reminders}>
    <summary><strong>Next service</strong><small>{summary}</small><span className={styles.chevron} aria-hidden="true"/></summary>
    <ul>{Array.from(reminders, ([key, record]) => {
      const remaining = lastMiles.has(key) && record.next_service_odometer != null
        ? Number(record.next_service_odometer)-lastMiles.get(key) : null;
      return <li key={key}>
        <strong>{[assetLabel(record), record.next_service_odometer != null && mileage(record.next_service_odometer), dateLabel(record.next_service_date)].filter(Boolean).join(' · ')}</strong>
        {remaining != null && <small>{remaining === 0 ? 'Due at last recorded mileage'
          : mileage(Math.abs(remaining))+(remaining > 0 ? ' to go' : ' past due')+' at last recorded mileage'}</small>}
      </li>;
    })}</ul>
  </details>;
}

export default function MaintenanceHistory({records, client}) {
  const ordered = [...records].sort((a, b) =>
    (b.record_date || '').localeCompare(a.record_date || '') || (b.created_at || '').localeCompare(a.created_at || ''));
  const months = new Map();
  for (const record of ordered) {
    const month = record.record_date?.slice(0, 7) || '';
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(record);
  }
  return <>
    <NextService records={ordered}/>
    <section className={styles.history}>
      <h3>Service history</h3>
      {ordered.length ? Array.from(months, ([month, entries]) =>
        <section key={month} className={styles.month}>
          <h4>{month ? dateLabel(month+'-01', displayMonth) : 'Undated'}</h4>
          <div className={styles.ledger}>{entries.map(record => <ServiceRecord key={record.id} record={record} client={client}/>)}</div>
        </section>
      ) : <p>No maintenance records yet.</p>}
    </section>
  </>;
}

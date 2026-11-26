'use client';

import { useEffect, useRef, useState } from 'react';
import DriverRecordForm from './DriverRecordForm.jsx';
import { usePortalClient } from './PortalSession.jsx';
import { usd } from './portalData.js';
import { formatDay, moveDay } from './financials.js';
import {
  buildQuarterArchive, chicagoDay, coverageDays, filingCoverage, getDriverQuarterRecords, planQuarterParts, quarterSourceRows, quarterStart,
  quarterTitle, recordLabels, shiftQuarter, sourceOriginal, summarizeDriverRecords,
} from './quarterExport.js';
import styles from './DriverTools.module.css';

const units = new Intl.NumberFormat('en-US',{maximumFractionDigits:3});
const quantity = value => value == null ? 'No entry' : units.format(value);
function amount(label,value) {
  return <div key={label}><dt>{label}</dt><dd>{usd(value)}</dd></div>;
}

function QuarterPanel({operatorId, owner, start, refresh}) {
  const client=usePortalClient();
  const [revision,setRevision]=useState(0), [report,setReport]=useState(null);
  const [loadError,setLoadError]=useState(false), [busy,setBusy]=useState(''), [message,setMessage]=useState('');
  const [download,setDownload]=useState(null), pending=useRef(null), mounted=useRef(false);
  const reload=()=>{
    setDownload(null);
    setRevision(v=>v+1);
  };
  useEffect(()=>{
    mounted.current=true;
    return ()=>{ mounted.current=false; pending.current?.abort(); };
  },[]);
  useEffect(()=>{
    if (!download) return;
    return ()=>URL.revokeObjectURL(download.url);
  },[download]);
  useEffect(()=>{
    let active=true;
    setLoadError(false);
    Promise.all([
      client.rpc('rr_driver_quarter_activity',{p_operator_id:operatorId,p_start:start}),
      getDriverQuarterRecords(client,operatorId,start),
      quarterSourceRows(client,operatorId,start,owner),
    ]).then(([{data,error},records,sources])=>{
      if (error || !data || typeof data.load_count !== 'number') throw new Error('Quarter unavailable.');
      if (active) setReport({activity:data,records,sources,plan:planQuarterParts(records,sources)});
    }).catch(()=>{if(active) setLoadError(true);});
    return ()=>{active=false;};
  },[client,operatorId,start,refresh,owner,revision]);

  async function prepare(type,row,partNumber=1) {
    if (!report || pending.current) return;
    const controller=new AbortController();
    pending.current=controller; setBusy(type==='quarter'?'Preparing quarter ZIP…':'Retrieving original…');
    setDownload(null); setMessage('');
    try {
      const file=type==='quarter' ? await buildQuarterArchive({client,operatorId,start,owner,...report,partNumber,
        signal:controller.signal,onProgress:label=>{if(!controller.signal.aborted) setBusy(label);}})
        : await sourceOriginal(client,type,row,controller.signal);
      if (!controller.signal.aborted && mounted.current)
        setDownload({url:URL.createObjectURL(file),name:type==='quarter'?file.name:row.file_name});
    } catch(error) {
      if (!controller.signal.aborted && mounted.current) setMessage(error.message || 'Could not prepare the file. Try again.');
    } finally {
      if(mounted.current && pending.current===controller) { pending.current=null; setBusy(''); }
    }
  }
  async function confirmLoad(row) {
    const yes=window.confirm('Confirm that you hauled load ' + row.load_number + ', completed delivery on ' + row.delivery_date +
      ' and earned ' + usd(row.gross_cents) + '? This includes it in your carrier quarter.');
    if (!yes || pending.current) return;
    const controller=new AbortController(); pending.current=controller;setBusy('Confirming historical load…');setMessage('');
    try {
      const {data,error}=await client.rpc('rr_driver_confirm_legacy_load',
        {p_operator_id:operatorId,p_start:start,p_legacy_key:row.legacy_key,p_evidence_hash:row.evidence_hash});
      if(error || data!==true) throw new Error('Could not confirm this load. Refresh the quarter before retrying.');
      if(!controller.signal.aborted && mounted.current) reload();
    } catch(error) {
      if(!controller.signal.aborted && mounted.current) setMessage(error.message);
    } finally {
      if(mounted.current && pending.current===controller) {pending.current=null;setBusy('');}
    }
  }
  const today=chicagoDay();
  const form=<DriverRecordForm operatorId={operatorId} initialDate={quarterStart(today)===start?today:start} onSaved={reload}/>;
  if (!report || loadError) return <>{form}{loadError
    ? <div role="alert" className={styles.status}>Could not load the quarter. <button type="button" onClick={reload}>Retry</button></div>
    : <p role="status">Loading quarter…</p>}</>;
  const {activity,records,sources,plan}=report;
  const {ifta,spending}=summarizeDriverRecords(records,start);
  const coverage=coverageDays(records,start);
  const income=owner?activity.gross_cents:activity.operator_share_cents;
  const maintenance=records.filter(r=>r.kind==='maintenance');
  const archiveDocs=[...sources.documents.map(row=>({type:'freight',row})),...sources.proofs.map(row=>({type:'cost',row}))];
  const filing=filingCoverage(records,start);
  const historical=sources.legacy.filter(row=>!row.confirmed);
  const downloadButton=(type,row)=><button className={styles.link} type="button" disabled={Boolean(busy)} onClick={()=>prepare(type,row)}>Get original</button>;

  return <>
    {form}
    <section className={styles.card}>
      <h3>Quarterly income &amp; expenses</h3>
      <dl className={styles.metrics}>
        {amount((historical.length?'Confirmed gross':'Gross')+' on completed loads ('+activity.load_count+')',activity.gross_cents)}
        {!owner && amount('Driver share before costs',income)}
        {amount('Recorded operating costs',activity.recorded_expenses_cents)}
        {historical.length ? <div><dt>Income less recorded costs</dt><dd>Pending historical review</dd></div>
          : amount('Income less recorded costs',income==null || activity.recorded_expenses_cents==null?null:income-activity.recorded_expenses_cents)}
        {historical.length>0 && amount('Gross awaiting confirmation ('+historical.length+' loads)',activity.legacy_review_gross_cents)}
      </dl>
      <p className={styles.note}>{owner?'Income follows actual delivery dates and posted costs follow purchase dates.':'Income follows actual delivery dates. Posted costs follow the settlement week start and can include draft statements.'}</p>
      {!!activity.gross_missing && <p role="status">{activity.gross_missing} completed load(s) need a verified rate.</p>}
      <details><summary>Posted cost breakdown</summary>
        <dl className={styles.rows}>{Object.entries(activity.expense_by_kind || {}).map(([kind,cents])=>amount(kind,cents))}
          {!owner && amount('Driver-paid share of recorded costs',activity.operator_paid_cents)}
          {!owner && amount('Signed effect of carrier-paid adjustments',activity.carrier_deductions_cents)}
          {!!activity.unclassified_credit_cents && amount('Unclassified settlement credits',activity.unclassified_credit_cents)}
        </dl>
      </details>
      {owner && historical.length>0 && <details><summary>Historical loads to confirm ({historical.length})</summary>
        <p className={styles.note}>Potential gross {usd(activity.legacy_review_gross_cents)}. Only confirmed loads enter the totals above.</p>
        <ul className={styles.list}>{historical.map(r=><li key={r.legacy_key}>
          <strong>{r.load_number}</strong> · {r.broker_name} · {formatDay(r.delivery_date)} · {usd(r.gross_cents)}
          {r.conflicting || r.gross_cents==null || !r.evidence_hash ? <small>Review the source records.</small> :
            <button type="button" className={styles.link} disabled={Boolean(busy)} onClick={()=>confirmLoad(r)}>Confirm load</button>}
        </li>)}</ul>
      </details>}
      <details><summary>Driver-entered costs for tax review</summary>
        <p className={styles.note}>Compare these entries with posted costs before claiming expenses. They are shown separately to prevent double-counting.</p>
        {spending.length?<dl className={styles.rows}>{spending.map(([kind,cents])=>amount(kind,cents))}</dl>:<p>No driver-entered amounts for this quarter.</p>}
      </details>
    </section>
    <section className={styles.card}>
      <h3>IFTA workpapers</h3>
      <p className={styles.note}>Totals use saved jurisdiction mileage and fuel purchases. ELD hours alone do not establish miles by state or province.</p>
      {ifta.length ? <ul className={styles.list}>{ifta.map(g=><li key={JSON.stringify([g.unit,g.jurisdiction])}>
        <strong>{g.jurisdiction || 'Jurisdiction missing'} · {g.unit?'Unit '+g.unit:'Unit missing'}</strong>
        <dl className={styles.rows}>
          <div><dt>Total miles entered</dt><dd>{quantity(g.miles)}</dd></div>
          <div><dt>Taxable miles entered</dt><dd>{quantity(g.taxable_miles)}</dd></div>
          <div><dt>Documented tax-paid power fuel (gal)</dt><dd>{quantity(g.tax_paid_power_gallons)}</dd></div>
          {g.other_or_unverified_gallons!=null && <div><dt>Other / unverified gallons</dt><dd>{quantity(g.other_or_unverified_gallons)}</dd></div>}
          {Object.entries(g.fuel_by_type).map(([kind,v])=><div key={kind}><dt>{kind}</dt><dd>{quantity(v)} gal</dd></div>)}
        </dl>
        {g.missing_taxable_miles>0 && <small>{g.missing_taxable_miles} mileage record(s) lack a taxable-mile figure.</small>}
      </li>)}</ul>: <p>No jurisdiction miles or fuel quantities entered for this quarter.</p>}
      {activity.recorded_fuel_cents!==0 && <p>Posted fuel costs {usd(activity.recorded_fuel_cents)}. Check receipts for gallons, tax status and purchase jurisdiction.</p>}
      <p className={styles.note}>Reconcile mileage for all units and trips. The tax-paid power fuel figure includes identified units and jurisdictions with propulsion fuel marked tax paid and an attached receipt. Review reefer, DEF and unverified gallons separately.</p>
      <p><b>Filing proof</b> · {filing.overlapping?filing.overlapping+' saved filing document(s) with coverage dates overlapping this quarter':'No saved filing proof with coverage for this quarter'}{filing.unknown>0?' · '+filing.unknown+' with unknown coverage':''}</p>
    </section>
    <section className={styles.card}>
      <h3>Maintenance &amp; ELD copies</h3>
      <p className={styles.note}>Service reminders below come from maintenance entered in the selected quarter.</p>
      {maintenance.length ? <ul className={styles.list}>{maintenance.map(r=><li key={r.id}>
        <strong>{r.unit || 'Unit missing'}</strong> · {formatDay(r.record_date)} · {r.description}
        {r.odometer!=null && <small>Odometer {quantity(r.odometer)} mi</small>}
        <small>{r.next_service_date || r.next_service_odometer!=null ?
          ['Next service',r.next_service_date && formatDay(r.next_service_date),r.next_service_odometer!=null && quantity(r.next_service_odometer)+' mi'].filter(Boolean).join(' · ') :
          'Next service not recorded'}</small>
      </li>)}</ul> : <p>No maintenance entries for this quarter.</p>}
      <p><b>Dates covered by saved ELD copies</b> · {coverage.covered} of {coverage.calendarDays} calendar days.</p>
      <p className={styles.note}>Coverage uses the dates entered on attached copies, across this workspace. Review files for each driver and unit.</p>
    </section>
    <section className={styles.card}>
      <h3>Records &amp; audit export</h3>
      <details><summary>Driver records ({records.length})</summary>
        {records.length?<ul className={styles.list}>{records.map(r=><li key={r.id}>
          <strong>{recordLabels[r.kind]}</strong> · {formatDay(r.record_date)}{r.unit?' · '+r.unit:''}
          <small>{r.description}</small>
          {r.coverage_start && <small>Coverage {formatDay(r.coverage_start)} – {formatDay(r.coverage_end)}</small>}
          {!r.coverage_start && ['logbook','ifta_filing'].includes(r.kind) && <small>Coverage dates missing</small>}
          {r.file_name ? <>{r.file_name} {downloadButton('driver',r)}</>:<small>No original attached</small>}
        </li>)}</ul>:<p>No saved driver entries.</p>}
      </details>
      <details><summary>Freight and posted-cost originals ({archiveDocs.length})</summary>
        <ul className={styles.list}>{archiveDocs.map(({type,row})=><li key={type+row.id}>
          <strong>{row.file_name}</strong> · {row.kind || row.category} {downloadButton(type,row)}
        </li>)}</ul>
      </details>
      <p className={styles.note}>ZIP includes financial and jurisdiction CSVs, saved driver records, available freight and receipt originals, ELD and filing copies, and a list of missing evidence. Historical load indexes provide metadata. Exporting does not submit a tax return.</p>
      {plan.parts.length>1 || plan.separate.length>0 ? <>
        <p>Download all {plan.parts.length} numbered ZIP part(s){plan.separate.length?' and '+plan.separate.length+' separate original(s)':''}. Each ZIP contains the full manifest. Match the export ID across parts.</p>
        <ul className={styles.list}>{plan.parts.map(part=><li key={part.number}>
          <button type="button" className={styles.primary} disabled={Boolean(busy)} onClick={()=>prepare('quarter',null,part.number)}>Prepare ZIP {part.number} of {plan.parts.length}</button>
          <small>{part.files.length} originals · {units.format(part.bytes/1048576)} MiB before workpapers</small>
        </li>)}</ul>
        {plan.separate.length>0 && <ul className={styles.list}>{plan.separate.map(({type,row})=><li key={type+row.id}>
          <strong>{row.file_name}</strong> · individually listed in the manifest {downloadButton(type,row)}
        </li>)}</ul>}
      </> : <button type="button" className={styles.primary} disabled={Boolean(busy)} onClick={()=>prepare('quarter')}>Prepare quarter ZIP</button>}
    </section>
    {(busy || message || download) && <section className={styles.status} aria-live="polite">
      {busy && <span role="status">{busy}</span>}
      {message && <span role="alert">{message}</span>}
      {download && <a download={download.name} href={download.url}>Download {download.name}</a>}
    </section>}
  </>;
}

export default function DriverTools({operatorId,owner,refresh,initialQuarter}) {
  const [start,setStart]=useState(()=>/^\d{4}-(01|04|07|10)-01$/.test(initialQuarter || '')?initialQuarter:quarterStart(chicagoDay()));
  return <div className={styles.tools}>
    <div className={styles.period}>
      <button type="button" aria-label="Previous quarter" onClick={()=>setStart(s=>shiftQuarter(s,-1))}>‹</button>
      <div><strong>{quarterTitle(start)}</strong><small>{formatDay(start)} – {formatDay(moveDay(shiftQuarter(start,1),-1))}</small></div>
      <button type="button" aria-label="Next quarter" disabled={start>=quarterStart(chicagoDay())} onClick={()=>setStart(s=>shiftQuarter(s,1))}>›</button>
    </div>
    <QuarterPanel key={operatorId+'-'+start} operatorId={operatorId} owner={owner} start={start} refresh={refresh}/>
  </div>;
}

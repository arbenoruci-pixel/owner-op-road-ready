'use client';
import React, {useMemo, useState} from 'react';
import {canonicalMileage, mileagePeriod, quarterPeriod, jurisdiction, numeric, text} from './core.js';

export default function QuarterlyMileage({owner = {}, documents = [], today, onImport, onOriginal}) {
  const [year, setYear] = useState(today.slice(0, 4)), [quarter, setQuarter] = useState(Math.ceil(Number(today.slice(5, 7)) / 3)), [truck, setTruck] = useState('');
  const report = useMemo(() => {
    const key = `${year}-Q${quarter}`, period = quarterPeriod(key), canonical = canonicalMileage(owner);
    const rows = canonical.rows.filter(row => { const dates = mileagePeriod(row); return dates.start >= period.start && dates.end <= period.end && (!truck || text(row.truck) === truck); });
    const groups = new Map();
    for (const row of rows) {
      const state = jurisdiction(row.state), unit = text(row.truck), groupKey = JSON.stringify([unit, state]);
      if (!groups.has(groupKey)) groups.set(groupKey, {truck: unit, state, miles: 0});
      groups.get(groupKey).miles += numeric(row.miles) || 0;
    }
    const sourceIds = new Set(rows.map(row => row.sourceDocumentId || row.documentId).filter(Boolean));
    return {key, period, rows, groups: [...groups.values()].sort((a, b) => a.truck.localeCompare(b.truck) || a.state.localeCompare(b.state)), conflicts: canonical.conflicts, invalidRows: canonical.invalidRows, files: documents.filter(document => sourceIds.has(document.local_id || document.id))};
  }, [year, quarter, truck, owner, documents]);
  const trucks = [...new Set((owner.mileageImports || []).map(row => text(row.truck)).filter(Boolean))].sort();
  function exportMiles() {
    if (report.conflicts.length || report.invalidRows.length || !report.rows.length) return;
    const escape = value => '"' + String(value ?? '').replace(/^[=+@\-]/, "'$&").replaceAll('"', '""') + '"';
    const rows = [['Period start', 'Period end', 'Truck', 'Jurisdiction', 'Miles'], ...report.groups.map(row => [report.period.start, report.period.end, row.truck, row.state, row.miles.toFixed(3)])];
    const url = URL.createObjectURL(new Blob([rows.map(row => row.map(escape).join(',')).join('\r\n')], {type: 'text/csv'}));
    const link = document.createElement('a'); link.href = url; link.download = `road-ready-miles-${report.key}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return <section className="rr-smart-review" aria-label="Quarterly IFTA / IRP miles">
    <h2>IFTA / IRP — actual miles</h2>
    <p>Motive Vehicle Gateway reports stay separate from manual daily logbook miles.</p>
    <div className="rr-smart-fields">
      <label>Report year<select aria-label="Report year" value={year} onChange={event => setYear(event.target.value)}>{[...new Set([today.slice(0, 4), ...(owner.mileageImports || []).map(row => mileagePeriod(row).start.slice(0, 4)).filter(Boolean)])].sort().reverse().map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Quarter<select aria-label="Quarter" value={quarter} onChange={event => setQuarter(event.target.value)}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>Q{value}</option>)}</select></label>
      <label>Truck<select aria-label="Truck" value={truck} onChange={event => setTruck(event.target.value)}><option value="">All trucks</option>{trucks.map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <p>{report.period.start} → {report.period.end} · <strong>{report.groups.reduce((total, row) => total + row.miles, 0).toFixed(1)} mi</strong> from saved source reports</p>
    {report.conflicts.length ? <p role="alert">{report.conflicts.length} overlapping or conflicting mileage groups need review. Conflicting versions stay outside totals; export is paused.</p> : null}
    {report.invalidRows.length ? <p role="alert">{report.invalidRows.length} saved mileage rows have invalid dates, states or distances. These stay outside totals; check their source before exporting.</p> : null}
    {report.groups.length ? <div className="rr-smart-table-wrap"><table><caption>Miles by truck and jurisdiction</caption><thead><tr><th>Truck</th><th>State / province</th><th>Miles</th></tr></thead><tbody>{report.groups.map(row => <tr key={JSON.stringify([row.truck, row.state])}><td>{row.truck || 'Not specified'}</td><td>{row.state || 'Unknown'}</td><td>{row.miles.toFixed(1)}</td></tr>)}</tbody></table></div> : <p>No state-mile reports saved for this selection.</p>}
    <p>Totals cover imported reports only. Keep the Motive trip / location detail and original report for audit. A quarter summary does not establish daily trips or tax exemptions.</p>
    <button type="button" className="rr-smart-primary" onClick={onImport}>Import Motive / state miles</button>
    <button type="button" disabled={!report.rows.length || Boolean(report.conflicts.length || report.invalidRows.length)} onClick={exportMiles}>Export quarter miles CSV</button>
    {report.files.length ? <details><summary>Original mileage reports ({report.files.length})</summary><ul>{report.files.map(file => <li key={file.local_id || file.id}><span>{file.original_file_name || file.title}</span><button type="button" onClick={() => onOriginal(file)}>Open original</button></li>)}</ul></details> : null}
  </section>;
}

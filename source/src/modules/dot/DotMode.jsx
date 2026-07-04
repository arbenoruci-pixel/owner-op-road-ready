import React, { useMemo, useState } from 'react';
import { Header } from '../../shared/ui/Chrome.jsx';
import LogGraph from '../graph/LogGraph.jsx';
import { durLabel, timeLabel } from '../../shared/utils/time.js';
import { addDays, localDayKey } from '../../shared/utils/date.js';
import { color, label } from '../../shared/utils/status.js';
import { validateLogForSigning } from '../logbook/signing.js';
import { displayEventsForDay } from '../../core/timeline/displayTimeline.js';

const DEFAULT_DRIVER_NAME = 'Arben Oruci';
const DEFAULT_DRIVER_EMAIL = 'arbenoruci@gmail.com';
const DEFAULT_CARRIER_NAME = 'Narta Express LLC';
const DEFAULT_MAIN_OFFICE = '92 201 Lake Drive, Willowbrook, IL 60527';
const DEFAULT_DOT_NUMBER = '2513324';

function safe(value, fallback = 'Not set') {
  const text = value === 0 ? '0' : String(value || '').trim();
  return text || fallback;
}

function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function dayTitle(day, long = false) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  const weekday = d.toLocaleDateString(undefined, { weekday: long ? 'long' : 'short' }).toUpperCase();
  const mon = d.toLocaleDateString(undefined, { month:'short' }).toUpperCase();
  return `${weekday} ${mon} ${String(d.getDate()).padStart(2, '0')}`;
}

function shortDate(day) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { month:'short', day:'numeric' });
}

function sortEvents(events = []) {
  return [...events].filter(Boolean).sort((a, b) => Number(a.startMin || 0) - Number(b.startMin || 0));
}

function dayRange(activeDay) {
  return Array.from({ length: 8 }).map((_, index) => addDays(activeDay, -index));
}

function reportEventsForDay(state, day) {
  return sortEvents(displayEventsForDay(state.eventsByDay?.[day] || [], day >= localDayKey()));
}

function dutyTotals(events = []) {
  const map = Object.fromEntries(['OFF','SB','D','ON'].map(status => [status, 0]));
  sortEvents(events).forEach(event => {
    if (!map[event.status] && map[event.status] !== 0) return;
    map[event.status] += Math.max(0, Number(event.endMin || 0) - Number(event.startMin || 0));
  });
  return map;
}

function totalHours(events = []) {
  return Object.values(dutyTotals(events)).reduce((sum, mins) => sum + Number(mins || 0), 0);
}

function dotLineLabel(event = {}) {
  const status = event.status || 'OFF';
  return `${status} ${label(status)}`;
}

function joinLocation(event = {}) {
  return [event.city, event.state].filter(Boolean).join(', ') || 'Location not set';
}

function inspectionLabel(inspection = {}) {
  if (!inspection.complete) return 'Not completed';
  const where = [inspection.city, inspection.state].filter(Boolean).join(', ');
  const when = inspection.sourceStartMin != null ? timeLabel(inspection.sourceStartMin, true) : '';
  return `Completed${when ? ` · ${when}` : ''}${where ? ` · ${where}` : ''}`;
}

function signatureForDay(state, day) {
  return state.signatureByDay?.[day] || {};
}

function signatureLabel(state, day) {
  const sig = signatureForDay(state, day);
  if (!sig.signed) return 'Not signed';
  try { return `Signed · ${new Date(sig.signedAt).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}`; }
  catch { return 'Signed'; }
}

function driverName(state) {
  return state.driverProfile?.name || state.driverSignature?.driverName || DEFAULT_DRIVER_NAME;
}

function driverEmail(state) {
  return state.driverProfile?.email || state.driver?.email || DEFAULT_DRIVER_EMAIL;
}

function carrierName(state) {
  return state.carrierName || DEFAULT_CARRIER_NAME;
}

function mainOffice(state) {
  return state.mainOfficeAddress || DEFAULT_MAIN_OFFICE;
}

function unitName(state) {
  return state.driver?.truck || 'Unit not set';
}

function trailerName(state) {
  return state.currentTrailer || state.equipment?.trailer || state.driver?.trailer || 'No trailer';
}

function dotNumber(state) {
  return state.dotNumber || state.usdot || state.carrierDot || DEFAULT_DOT_NUMBER;
}

function shippingDocs(state) {
  const load = state.loadInfo || {};
  const equipment = state.equipment || {};
  return [load.loadNo, equipment.container, equipment.chassis].filter(Boolean).join(' ') || 'None';
}

function dutySummary(events = []) {
  const totals = dutyTotals(events);
  return `OFF: ${durLabel(totals.OFF)} | SB: ${durLabel(totals.SB)} | D: ${durLabel(totals.D)} | ON: ${durLabel(totals.ON)}`;
}

function recapDays(days = [], state) {
  return days.slice(1).map(day => {
    const events = reportEventsForDay(state, day);
    return { day, total: totalHours(events) };
  });
}

function printDate() {
  return new Date().toLocaleString([], { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}

function emailSummary(state, days, routingCode = '') {
  const lines = [
    'Officer,',
    '',
    'Please find the DOT inspection log package for the driver below.',
    '',
    `Driver: ${driverName(state)}`,
    `Carrier: ${carrierName(state)}`,
    `Truck/Unit: ${unitName(state)}`,
    `Trailer/Equipment: ${trailerName(state)}`,
    'Period: Current 24-hour period and previous 7 consecutive days',
    'Record Type: Manual RODS / ELD-exempt driver records',
  ];
  if (routingCode) lines.push(`Routing / Reference Code: ${routingCode}`);
  lines.push('', 'Thank you.');
  return lines.join('\n');
}

function plainSummary(state, days, routingCode = '') {
  return [
    `DOT inspection log package`,
    `Generated: ${new Date().toLocaleString()}`,
    `Driver: ${driverName(state)}`,
    `Carrier: ${carrierName(state)}`,
    `Truck/Unit: ${unitName(state)}`,
    `Period: ${days.at(-1)} through ${days[0]}`,
    routingCode ? `Routing / Reference Code: ${routingCode}` : '',
  ].filter(Boolean).join('\n');
}

function svgGraphMarkup(events = []) {
  const W = 930;
  const H = 190;
  const LEFT = 50;
  const RIGHT = 32;
  const TOP = 20;
  const ROW_H = 34;
  const BODY_W = W - LEFT - RIGHT;
  const statuses = ['OFF','SB','D','ON'];
  const center = (status) => TOP + statuses.indexOf(status) * ROW_H + ROW_H / 2;
  const xFromMin = (m) => LEFT + (Math.max(0, Math.min(1440, Number(m || 0))) / 1440) * BODY_W;
  const rows = statuses.map((status, index) => `
    <text x="${LEFT - 10}" y="${center(status) + 4}" text-anchor="end" class="row-label">${status}</text>
    <line x1="${LEFT}" x2="${W - RIGHT}" y1="${TOP + index * ROW_H}" y2="${TOP + index * ROW_H}" class="grid-line" />`).join('');
  const bottom = `<line x1="${LEFT}" x2="${W - RIGHT}" y1="${TOP + 4 * ROW_H}" y2="${TOP + 4 * ROW_H}" class="grid-line" />`;
  const ticks = Array.from({ length: 25 }).map((_, hour) => {
    const x = LEFT + (hour / 24) * BODY_W;
    const txt = hour === 0 ? 'M' : hour === 12 ? 'N' : hour === 24 ? 'M' : String(hour > 12 ? hour - 12 : hour);
    return `<line x1="${x}" x2="${x}" y1="${TOP}" y2="${TOP + 4 * ROW_H}" class="${hour % 6 === 0 ? 'hour-line major' : 'hour-line'}" /><text x="${x}" y="12" text-anchor="middle" class="hour-label">${txt}</text>`;
  }).join('');
  const sorted = sortEvents(events).filter(e => Number(e.endMin || 0) > Number(e.startMin || 0));
  const body = sorted.map(event => {
    const y = center(event.status);
    return `<line x1="${xFromMin(event.startMin)}" x2="${xFromMin(event.endMin)}" y1="${y}" y2="${y}" stroke="${color(event.status)}" stroke-width="7" stroke-linecap="round" />`;
  }).join('');
  const transitions = sorted.slice(0, -1).map((event, index) => {
    const next = sorted[index + 1];
    if (event.status === next.status) return '';
    const x = xFromMin(next.startMin);
    return `<line x1="${x}" x2="${x}" y1="${center(event.status)}" y2="${center(next.status)}" stroke="#374151" stroke-width="4" stroke-linecap="round" />`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Duty status graph" class="report-svg"><rect width="${W}" height="${H}" fill="#fff" />${ticks}${rows}${bottom}${transitions}${body}</svg>`;
}

function dayReportHtml(state, day, days) {
  const events = reportEventsForDay(state, day);
  const totals = dutyTotals(events);
  const inspection = state.inspectionByDay?.[day] || {};
  const sig = signatureForDay(state, day);
  const issues = validateLogForSigning(state, day).filter(issue => issue.code !== 'active_day');
  const recaps = recapDays(days, state);
  const eventRows = events.length ? events.map((event, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${htmlEscape(dotLineLabel(event))}</td>
      <td>${htmlEscape(timeLabel(event.startMin, true))}</td>
      <td>${htmlEscape(durLabel(Number(event.endMin || 0) - Number(event.startMin || 0)))}</td>
      <td>${htmlEscape(joinLocation(event))}</td>
      <td>${htmlEscape(unitName(state))}</td>
      <td>${htmlEscape(event.note || event.description || label(event.status))}</td>
    </tr>`).join('') : '<tr><td colspan="7">No events recorded</td></tr>';
  const recapRows = recaps.map(({ day: d, total }) => `<td><b>${htmlEscape(shortDate(d))}</b><br/>${(total / 60).toFixed(2)}</td>`).join('');
  const signatureDataUrl = sig.signatureDataUrl || (sig.signatureRef === 'driverSignature' ? state.driverSignature?.dataUrl : '') || '';
  const signatureHtml = signatureDataUrl ? `<img src="${htmlEscape(signatureDataUrl)}" alt="Driver signature" />` : '';
  return `
  <section class="daily-log-page">
    <header class="daily-log-head">
      <div class="brand">Road Ready</div>
      <div><h1>Driver's Daily Log</h1><p>Manual RODS / ELD-exempt driver record</p></div>
      <div class="log-date"><b>Log Date:</b> ${htmlEscape(day)}<br/><b>Print Date:</b> ${htmlEscape(printDate())}</div>
    </header>
    <table class="header-table">
      <tbody>
        <tr><th>Driver</th><td>${htmlEscape(driverName(state))}<br/><small>${htmlEscape(driverEmail(state))}</small></td><th>Truck/Unit</th><td>${htmlEscape(unitName(state))}</td></tr>
        <tr><th>Driver License</th><td>${htmlEscape(state.driver?.license || 'Not set')}</td><th>Trailer/Equipment</th><td>${htmlEscape(trailerName(state))}</td></tr>
        <tr><th>Carrier and DOT#</th><td>${htmlEscape(carrierName(state))} (${htmlEscape(dotNumber(state))})</td><th>Shipping Docs</th><td>${htmlEscape(shippingDocs(state))}</td></tr>
        <tr><th>Main Office</th><td colspan="3">${htmlEscape(mainOffice(state))}</td></tr>
        <tr><th>24-Period Starting</th><td>Midnight</td><th>Inspection</th><td>${htmlEscape(inspectionLabel(inspection))}</td></tr>
        <tr><th>Data Diagnostic Indicators</th><td>No</td><th>Malfunction Indicators</th><td>No</td></tr>
      </tbody>
    </table>
    <div class="graph-wrap">${svgGraphMarkup(events)}</div>
    <table class="event-table">
      <thead><tr><th>No.</th><th>Status</th><th>Start</th><th>Duration</th><th>Location</th><th>CMV</th><th>Notes</th></tr></thead>
      <tbody>${eventRows}</tbody>
    </table>
    <table class="recap-table">
      <tbody>
        <tr><th>Recap</th>${recapRows}</tr>
        <tr><th>Totals</th><td>OFF ${htmlEscape(durLabel(totals.OFF))}</td><td>SB ${htmlEscape(durLabel(totals.SB))}</td><td>D ${htmlEscape(durLabel(totals.D))}</td><td>ON ${htmlEscape(durLabel(totals.ON))}</td><td colspan="3">Total ${htmlEscape(durLabel(totalHours(events)))}</td></tr>
      </tbody>
    </table>
    <div class="cert-block">
      <b>Certification:</b> ${htmlEscape(signatureLabel(state, day))}
      ${issues.length ? `<div class="review-list"><b>Review items:</b> ${htmlEscape(issues.map(issue => `${issue.where}: ${issue.title}`).join('; '))}</div>` : ''}
      <p>I hereby certify that my data entries and my record of duty status for this day are true and correct.</p>
      <div class="signature-line">${signatureHtml}<span>Driver Signature</span></div>
    </div>
  </section>`;
}

function reportHtml(state, days, routingCode = '') {
  const period = `${days.at(-1)} through ${days[0]}`;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DOT Inspection Log Package</title>
<style>
  body{margin:0;background:#e5e7eb;color:#111827;font-family:Arial,Helvetica,sans-serif;}
  .package-cover,.daily-log-page{max-width:980px;margin:18px auto;background:#fff;border:1px solid #cfd4dc;padding:22px;box-sizing:border-box;}
  .package-cover h1{margin:0 0 8px;font-size:26px;}.package-cover p{margin:6px 0;font-size:14px;}.cover-grid{display:grid;grid-template-columns:180px 1fr;gap:0;border:1px solid #9ca3af;margin-top:16px}.cover-grid b,.cover-grid span{padding:8px 10px;border-bottom:1px solid #d1d5db}.cover-grid b{background:#f3f4f6;border-right:1px solid #d1d5db}.cover-grid b:nth-last-child(2),.cover-grid span:last-child{border-bottom:0}
  .daily-log-head{display:grid;grid-template-columns:190px 1fr 210px;align-items:start;gap:12px;border-bottom:2px solid #111827;padding-bottom:10px}.brand{font-size:34px;font-weight:900;font-style:italic}.daily-log-head h1{margin:0;text-align:center;font-size:22px;text-transform:uppercase}.daily-log-head p{text-align:center;margin:3px 0 0}.log-date{text-align:right;font-size:13px;line-height:1.5}.header-table,.event-table,.recap-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}.header-table th,.header-table td,.event-table th,.event-table td,.recap-table th,.recap-table td{border:1px solid #9ca3af;padding:6px;text-align:left;vertical-align:top}.header-table th,.event-table th,.recap-table th{background:#f3f4f6;font-weight:800}.graph-wrap{border:1px solid #d1d5db;margin:12px 0;padding:8px}.report-svg{width:100%;height:auto}.grid-line,.hour-line{stroke:#d1d5db;stroke-width:1}.hour-line.major{stroke:#9ca3af;stroke-width:1.2}.hour-label,.row-label{font-size:12px;fill:#374151;font-weight:700}.cert-block{margin-top:14px;text-align:center}.cert-block> b{display:block;text-align:left}.cert-block p{font-weight:700}.signature-line{height:54px;display:flex;align-items:end;justify-content:center;gap:10px}.signature-line img{max-height:42px;max-width:180px}.signature-line span{border-top:1px solid #111827;min-width:260px;padding-top:6px;font-size:12px;font-weight:700}.review-list{text-align:left;background:#fff7ed;border:1px solid #fed7aa;padding:8px;margin-top:8px}.page-break{break-after:page;}
  @media print{body{background:#fff}.package-cover,.daily-log-page{margin:0 auto 12px;border:0;page-break-after:always}.daily-log-page{min-height:10in}.no-print{display:none!important}}
</style>
</head>
<body>
  <section class="package-cover">
    <h1>DOT Inspection Log Package</h1>
    <p>Manual RODS / ELD-exempt driver records</p>
    <p>Period: ${htmlEscape(period)}</p>
    ${routingCode ? `<p>Routing / Reference Code: ${htmlEscape(routingCode)}</p>` : ''}
    <div class="cover-grid">
      <b>Driver</b><span>${htmlEscape(driverName(state))}</span>
      <b>Carrier</b><span>${htmlEscape(carrierName(state))}</span>
      <b>Truck/Unit</b><span>${htmlEscape(unitName(state))}</span>
      <b>Trailer/Equipment</b><span>${htmlEscape(trailerName(state))}</span>
      <b>Main Office</b><span>${htmlEscape(mainOffice(state))}</span>
      <b>Generated</b><span>${htmlEscape(printDate())}</span>
    </div>
  </section>
  ${days.map(day => dayReportHtml(state, day, days)).join('\n')}
</body>
</html>`;
}

function DailyPaper({ state, day, days }) {
  const events = reportEventsForDay(state, day);
  const totals = dutyTotals(events);
  const inspection = state.inspectionByDay?.[day] || {};
  const sig = signatureForDay(state, day);
  const issues = validateLogForSigning(state, day).filter(issue => issue.code !== 'active_day');
  const recaps = recapDays(days, state);
  return (
    <article className="dot-paper-log">
      <div className="dot-paper-head">
        <div className="dot-paper-brand">Road Ready</div>
        <div className="dot-paper-title"><b>DRIVER'S DAILY LOG</b><span>Manual RODS / ELD-exempt driver record</span></div>
        <div className="dot-paper-date"><b>Log Date:</b> {day}<br/><b>Print Date:</b> {printDate()}</div>
      </div>

      <div className="dot-paper-grid">
        <b>Driver</b><span>{driverName(state)}<small>{driverEmail(state)}</small></span><b>Truck/Unit</b><span>{unitName(state)}</span>
        <b>Carrier and DOT#</b><span>{carrierName(state)} ({dotNumber(state)})</span><b>Trailer/Equipment</b><span>{trailerName(state)}</span>
        <b>Main Office</b><span className="wide">{mainOffice(state)}</span>
        <b>Shipping Docs</b><span>{shippingDocs(state)}</span><b>Inspection</b><span>{inspectionLabel(inspection)}</span>
      </div>

      <div className="dot-paper-graph"><LogGraph events={events} /></div>

      <table className="dot-paper-table">
        <thead><tr><th>No.</th><th>Status</th><th>Start</th><th>Duration</th><th>Location</th><th>CMV</th><th>Notes</th></tr></thead>
        <tbody>
          {events.length ? events.map((event, index) => (
            <tr key={event.id || index}>
              <td>{index + 1}</td>
              <td>{dotLineLabel(event)}</td>
              <td>{timeLabel(event.startMin, true)}</td>
              <td>{durLabel(Number(event.endMin || 0) - Number(event.startMin || 0))}</td>
              <td>{joinLocation(event)}</td>
              <td>{unitName(state)}</td>
              <td>{event.note || event.description || label(event.status)}</td>
            </tr>
          )) : <tr><td colSpan="7">No events recorded</td></tr>}
        </tbody>
      </table>

      <div className="dot-paper-recap">
        {recaps.map(({ day: d, total }) => <div key={d}><b>{shortDate(d)}</b><span>{(total / 60).toFixed(2)}</span></div>)}
      </div>

      <div className="dot-paper-cert">
        <div><b>Totals:</b> OFF {durLabel(totals.OFF)} | SB {durLabel(totals.SB)} | D {durLabel(totals.D)} | ON {durLabel(totals.ON)}</div>
        <div><b>Certification:</b> {signatureLabel(state, day)}</div>
        {issues.length ? <div className="dot-paper-review"><b>Review:</b> {issues.map(issue => `${issue.where}: ${issue.title}`).join('; ')}</div> : null}
        <p>I hereby certify that my data entries and my record of duty status for this day are true and correct.</p>
        <div className="dot-sign-line">{(sig.signatureDataUrl || (sig.signatureRef === 'driverSignature' ? state.driverSignature?.dataUrl : '')) ? <img src={sig.signatureDataUrl || state.driverSignature?.dataUrl} alt="Driver signature" /> : null}<span>Driver Signature</span></div>
      </div>
    </article>
  );
}

export default function DotMode({ state, onBack }) {
  const [selectedDay, setSelectedDay] = useState(state.activeDay || localDayKey());
  const [officerEmail, setOfficerEmail] = useState('');
  const [routingCode, setRoutingCode] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [stage, setStage] = useState('home');
  const [status, setStatus] = useState('');
  const days = useMemo(() => dayRange(state.activeDay || localDayKey()), [state.activeDay]);
  const selectedEvents = reportEventsForDay(state, selectedDay);
  const selectedInspection = state.inspectionByDay?.[selectedDay] || {};
  const selectedIssues = validateLogForSigning(state, selectedDay).filter(issue => issue.code !== 'active_day');
  const selectedTotals = dutyTotals(selectedEvents);
  const htmlPackage = useMemo(() => reportHtml(state, days, routingCode.trim()), [state, days, routingCode]);

  function guardedBack() {
    if (stage !== 'home' && accessCode) {
      const entered = window.prompt?.('Enter access code to exit DOT Inspection Mode.');
      if (entered !== accessCode) return;
    }
    if (stage !== 'home') {
      setStage('home');
      return;
    }
    onBack?.();
  }

  function beginInspection() {
    setStage('device');
    setStatus('Officer view is open.');
  }

  function openReportWindow() {
    const blob = new Blob([htmlPackage], { type:'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function downloadReport() {
    const blob = new Blob([htmlPackage], { type:'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dot-log-package-${days[0]}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    setStatus('DOT log package file created.');
  }

  async function shareReportFile() {
    const file = new File([htmlPackage], `dot-log-package-${days[0]}.html`, { type:'text/html' });
    const shareData = {
      title: 'DOT Inspection Log Package',
      text: plainSummary(state, days, routingCode.trim()),
      files: [file],
    };
    try {
      if (navigator.canShare?.({ files:[file] }) && navigator.share) {
        await navigator.share(shareData);
        setStatus('DOT log package shared.');
      } else {
        downloadReport();
        setStatus('Sharing file is not available on this device. The report file was created instead.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setStatus('Share was not completed. You can open or download the report file instead.');
    }
  }

  function emailOfficer() {
    const to = officerEmail.trim();
    const subject = encodeURIComponent(`DOT Inspection Logs - ${carrierName(state)} - ${unitName(state)}`);
    const body = encodeURIComponent(emailSummary(state, days, routingCode.trim()));
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
  }

  function copyShortSummary() {
    const text = emailSummary(state, days, routingCode.trim());
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => setStatus('Short DOT email summary copied.'),
        () => setStatus('Copy failed on this device/browser.')
      );
    } else {
      setStatus('Copy is not available on this device/browser.');
    }
  }

  const title = stage === 'home' ? 'DOT Inspection Mode' : (stage === 'report' ? 'DOT Log Package' : 'Officer View');

  return (
    <section className={`screen active dot-mode dot-v92 ${stage === 'device' ? 'officer-locked' : ''}`}>
      <Header title={title} onBack={guardedBack} right="" />

      {stage === 'home' && (
        <main className="dot-mode-home">
          <div className="dot-mode-intro">
            <div className="dot-shield">◎</div>
            <h1>Inspect logs for previous 7 days + today</h1>
            <p>Open an inspection-safe view on this device or send a clean log package if the officer asks for a copy.</p>
            <button className="dot-begin-btn" onClick={beginInspection}>Begin Inspection</button>
            <label className="dot-access-code">
              <span>Optional access code for locked officer view</span>
              <input value={accessCode} onChange={e => setAccessCode(e.target.value)} placeholder="Set code before handing phone" inputMode="numeric" />
            </label>
          </div>

          <div className="dot-mode-card">
            <h2>Send log package</h2>
            <p>Use this only if the officer requests a copy. The email body stays short; the log package opens or shares as a clean report file.</p>
            <input value={officerEmail} onChange={e => setOfficerEmail(e.target.value)} placeholder="Officer email (optional)" />
            <input value={routingCode} onChange={e => setRoutingCode(e.target.value)} placeholder="Routing / reference code (if provided)" />
            <div className="dot-button-grid">
              <button onClick={shareReportFile}>Share Report File</button>
              <button onClick={emailOfficer}>Email Short Summary</button>
              <button onClick={() => setStage('report')}>View Report</button>
              <button onClick={copyShortSummary}>Copy Email Text</button>
            </div>
          </div>

          <div className="dot-mode-badge">
            <b>Record mode</b>
            <span>Manual RODS / ELD-exempt driver records</span>
          </div>
          {status ? <div className="dot-status-message">{status}</div> : null}
        </main>
      )}

      {stage === 'device' && (
        <main className="dot-officer-view">
          <div className="dot-officer-head">
            <div>
              <b>DOT Inspection</b>
              <span>Previous 7 days + today</span>
            </div>
            <button onClick={() => setStage('report')}>Report</button>
          </div>

          <div className="dot-officer-summary">
            <div><span>Driver</span><b>{driverName(state)}</b></div>
            <div><span>Carrier</span><b>{carrierName(state)}</b></div>
            <div><span>Truck/Unit</span><b>{unitName(state)}</b></div>
            <div><span>Record Type</span><b>Manual RODS</b></div>
          </div>

          <div className="dot-days-strip clean">
            {days.map(day => (
              <button key={day} className={day === selectedDay ? 'active' : ''} onClick={() => setSelectedDay(day)}>
                <b>{dayTitle(day)}</b>
                <span>{day}</span>
              </button>
            ))}
          </div>

          <div className="dot-selected-day-card">
            <div>
              <b>{dayTitle(selectedDay, true)}</b>
              <span>{selectedDay}</span>
            </div>
            <em>{signatureLabel(state, selectedDay)}</em>
          </div>

          <div className="graph-panel dot-graph-panel"><LogGraph events={selectedEvents} /></div>

          <div className="dot-totals-row">
            <div><b>OFF</b><span>{durLabel(selectedTotals.OFF)}</span></div>
            <div><b>SB</b><span>{durLabel(selectedTotals.SB)}</span></div>
            <div><b>D</b><span>{durLabel(selectedTotals.D)}</span></div>
            <div><b>ON</b><span>{durLabel(selectedTotals.ON)}</span></div>
          </div>

          <div className="dot-day-status-card pro">
            <span>Inspection: {inspectionLabel(selectedInspection)}</span>
            <span>Review: {selectedIssues.length ? `${selectedIssues.length} item(s)` : 'No blocking review items shown'}</span>
          </div>

          <div className="events dot-events pro">
            {selectedEvents.map(e => (
              <div className="event-row" key={e.id}>
                <div className="event-badge" style={{ background:color(e.status) }}>{e.status}</div>
                <div className="event-content">
                  <div className="event-time">{timeLabel(e.startMin, true)} <span>|</span> {durLabel(e.endMin-e.startMin)}</div>
                  <div className="event-loc">{joinLocation(e)}</div>
                  <div className="event-note">{e.note || label(e.status)}</div>
                </div>
              </div>
            ))}
            {!selectedEvents.length && <div className="dot-empty-day">No events recorded for this day.</div>}
          </div>
        </main>
      )}

      {stage === 'report' && (
        <main className="dot-report-package">
          <div className="dot-report-actions">
            <button onClick={shareReportFile}>Share File</button>
            <button onClick={downloadReport}>Download HTML</button>
            <button onClick={openReportWindow}>Open Printable</button>
          </div>
          <section className="dot-report-cover">
            <h1>DOT Inspection Log Package</h1>
            <p>Manual RODS / ELD-exempt driver records</p>
            <div><b>Driver:</b> {driverName(state)}</div>
            <div><b>Carrier:</b> {carrierName(state)}</div>
            <div><b>Truck/Unit:</b> {unitName(state)}</div>
            <div><b>Period:</b> {days.at(-1)} through {days[0]}</div>
            {routingCode.trim() ? <div><b>Routing / Reference Code:</b> {routingCode.trim()}</div> : null}
          </section>
          {days.map(day => <DailyPaper key={day} state={state} day={day} days={days} />)}
        </main>
      )}
    </section>
  );
}

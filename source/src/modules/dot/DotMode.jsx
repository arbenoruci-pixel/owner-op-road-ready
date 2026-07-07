import React, { useEffect, useMemo, useState } from 'react';
import { Header } from '../../shared/ui/Chrome.jsx';
import LogGraph from '../graph/LogGraph.jsx';
import { durLabel, timeLabel } from '../../shared/utils/time.js';
import { addDays, localDayKey } from '../../shared/utils/date.js';
import { color, label } from '../../shared/utils/status.js';
import { validateLogForSigning } from '../logbook/signing.js';
import { displayEventsForDay } from '../../core/timeline/displayTimeline.js';
import { DOC_SECTIONS, evaluateDotWallet, normalizeWallet } from '../../core/wallet/dotWallet.js';
import { sanitizeLogText } from '../../shared/utils/logText.js';

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
  return sortEvents(displayEventsForDay(state.eventsByDay?.[day] || [], day === localDayKey()));
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

function officerInspectionLabel(inspection = {}) {
  return inspection.complete ? inspectionLabel(inspection) : '—';
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
  const equipment = state.equipment || {};
  if (equipment.type === 'intermodal') {
    const chassis = String(equipment.chassis || state.loadInfo?.equipmentChassis || '').trim();
    return chassis ? `Chassis ${chassis}` : 'Intermodal chassis missing';
  }
  if (state.currentTrailer && state.currentTrailer !== 'No trailer') return state.currentTrailer;
  return equipment.trailer || state.driver?.trailer || 'No trailer';
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

function documentStatusLabel(row = {}) {
  if (!row.active) return 'Not used';
  if (row.status === 'missing') return 'Missing';
  if (row.status === 'expired') return 'Expired';
  if (row.status === 'expires_soon' || row.status === 'watch') return row.label || 'Review';
  return 'Ready';
}

function documentStatusClass(row = {}) {
  if (row.severity === 'high') return 'bad';
  if (row.severity === 'review') return 'warn';
  if (row.severity === 'watch') return 'notice';
  return 'ok';
}

function documentMetaLine(row = {}) {
  const doc = row.doc || {};
  const parts = [];
  if (doc.number) parts.push(`# ${doc.number}`);
  if (doc.policyNo) parts.push(`Policy ${doc.policyNo}`);
  if (doc.mcNumber) parts.push(`MC ${doc.mcNumber}`);
  if (doc.usdotNumber) parts.push(`USDOT ${doc.usdotNumber}`);
  if (doc.unit) parts.push(`Unit ${doc.unit}`);
  if (doc.trailer) parts.push(`Trailer ${doc.trailer}`);
  if (doc.plate) parts.push(`Plate ${doc.plate}${doc.state ? ` ${doc.state}` : ''}`);
  if (doc.vin) parts.push(`VIN ${doc.vin}`);
  if (doc.loadNo) parts.push(`Load ${doc.loadNo}`);
  if (doc.bolNo) parts.push(`BOL ${doc.bolNo}`);
  if (row.expiresOn) parts.push(`Expires ${row.expiresOn}`);
  if (!parts.length && doc.notes) parts.push(doc.notes);
  return parts.join(' · ') || 'No details entered';
}

function officerWalletRows(state) {
  const summary = evaluateDotWallet(normalizeWallet(state.dotWallet || {}));
  return summary.rows
    .filter(row => row.active)
    .sort((a, b) => {
      const important = ['roadside','roadside_if_used','trip'];
      const ai = important.includes(a.requirement.required) ? 0 : 1;
      const bi = important.includes(b.requirement.required) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      const sectionDelta = DOC_SECTIONS.findIndex(s => s.id === a.requirement.section) - DOC_SECTIONS.findIndex(s => s.id === b.requirement.section);
      if (sectionDelta) return sectionDelta;
      return a.requirement.title.localeCompare(b.requirement.title);
    });
}

function hasOfficerPresentableDoc(row = {}) {
  const doc = row.doc || {};
  const keys = ['number','policyNo','mcNumber','usdotNumber','unit','trailer','plate','vin','loadNo','bolNo','expiresOn','notes','state'];
  return Boolean(
    doc.attachmentDataUrl ||
    doc.attachmentName ||
    row.expiresOn ||
    keys.some(key => String(doc[key] || '').trim())
  );
}

function officerPresentationWalletRows(state) {
  return officerWalletRows(state).filter(row => hasOfficerPresentableDoc(row));
}

function officerDocumentLabel(row = {}) {
  const doc = row.doc || {};
  if (doc.attachmentDataUrl) return 'Open file';
  if (hasOfficerPresentableDoc(row)) return 'Details';
  return '—';
}

function officerSignatureLabel(state, day) {
  const sig = signatureForDay(state, day);
  if (!sig.signed) return 'Certification';
  try { return `Signed · ${new Date(sig.signedAt).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}`; }
  catch { return 'Signed'; }
}

function driverInspectionReadiness(state, days = []) {
  const logStats = logPackageStats(state, days);
  const wallet = evaluateDotWallet(normalizeWallet(state.dotWallet || {}));
  const requiredRoadside = row => ['roadside','roadside_if_used','trip'].includes(row.requirement?.required);
  const missingDocs = wallet.rows.filter(row => row.active && requiredRoadside(row) && row.status === 'missing');
  const expiredDocs = wallet.rows.filter(row => row.active && requiredRoadside(row) && row.status === 'expired');
  const reviewDocs = wallet.rows.filter(row => row.active && requiredRoadside(row) && (row.status === 'expires_soon' || row.status === 'watch'));
  const items = [];
  if (logStats.missing) items.push(`${logStats.missing} log day${logStats.missing === 1 ? '' : 's'} need review`);
  if (logStats.unsigned) items.push(`${logStats.unsigned} previous log${logStats.unsigned === 1 ? '' : 's'} need signing`);
  if (logStats.review) items.push(`${logStats.review} log day${logStats.review === 1 ? '' : 's'} have driver review items`);
  if (missingDocs.length) items.push(`${missingDocs.length} roadside document${missingDocs.length === 1 ? '' : 's'} missing`);
  if (expiredDocs.length) items.push(`${expiredDocs.length} roadside document${expiredDocs.length === 1 ? '' : 's'} expired`);
  if (reviewDocs.length) items.push(`${reviewDocs.length} document${reviewDocs.length === 1 ? '' : 's'} expiring soon`);
  return { count: items.length, items, logStats, missingDocs, expiredDocs, reviewDocs };
}

function walletSectionTitle(sectionId) {
  return DOC_SECTIONS.find(section => section.id === sectionId)?.title || sectionId;
}

function officerWalletSummary(state) {
  const summary = evaluateDotWallet(normalizeWallet(state.dotWallet || {}));
  const rows = officerPresentationWalletRows(state);
  const withFiles = rows.filter(row => row.doc?.attachmentDataUrl).length;
  return { ...summary, rows, count: rows.length, fileCount: withFiles };
}

function logPackageStats(state, days = []) {
  const rows = days.map(day => {
    const events = reportEventsForDay(state, day);
    const issues = validateLogForSigning(state, day).filter(issue => issue.code !== 'active_day');
    const sig = signatureForDay(state, day);
    return {
      day,
      eventCount: events.length,
      total: totalHours(events),
      signed: !!sig.signed,
      issues,
    };
  });
  const missing = rows.filter(row => !row.eventCount).length;
  const unsigned = rows.filter(row => row.eventCount && !row.signed && row.day !== localDayKey()).length;
  const review = rows.filter(row => row.issues.length).length;
  return { rows, missing, unsigned, review };
}

function guessDocMime(doc = {}) {
  const explicit = String(doc.attachmentType || doc.fileType || '').trim();
  if (explicit) return explicit;
  const dataUrl = String(doc.attachmentDataUrl || doc.photoDataUrl || '').trim();
  const match = dataUrl.match(/^data:([^;,]+)/i);
  if (match?.[1]) return match[1];
  const name = String(doc.attachmentName || doc.fileName || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function safeFileName(name = 'roadside-document', mime = '') {
  const clean = String(name || 'roadside-document')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'roadside-document';
  if (/\.[a-z0-9]{2,5}$/i.test(clean)) return clean;
  if (mime.includes('pdf')) return `${clean}.pdf`;
  if (mime.includes('png')) return `${clean}.png`;
  if (mime.includes('webp')) return `${clean}.webp`;
  if (mime.includes('image')) return `${clean}.jpg`;
  return `${clean}.bin`;
}

function dataUrlToBlob(dataUrl = '', fallbackMime = 'application/octet-stream') {
  const text = String(dataUrl || '');
  const splitAt = text.indexOf(',');
  if (!text.startsWith('data:') || splitAt < 0) throw new Error('Unsupported document data');
  const meta = text.slice(0, splitAt);
  const payload = text.slice(splitAt + 1);
  const mime = meta.match(/^data:([^;,]+)/i)?.[1] || fallbackMime || 'application/octet-stream';
  if (meta.toLowerCase().includes(';base64')) {
    const binary = window.atob(payload);
    const chunks = [];
    for (let i = 0; i < binary.length; i += 8192) {
      const slice = binary.slice(i, i + 8192);
      const bytes = new Uint8Array(slice.length);
      for (let j = 0; j < slice.length; j += 1) bytes[j] = slice.charCodeAt(j);
      chunks.push(bytes);
    }
    return new Blob(chunks, { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

function documentDataUrl(doc = {}) {
  return String(doc.attachmentDataUrl || doc.photoDataUrl || '').trim();
}

function DotDocumentViewer({ row, onClose, onStatus }) {
  const doc = row?.doc || {};
  const dataUrl = documentDataUrl(doc);
  const mime = guessDocMime(doc);
  const fileName = safeFileName(doc.attachmentName || row?.requirement?.title || 'roadside-document', mime);
  const isPdf = mime.includes('pdf') || dataUrl.startsWith('data:application/pdf');
  const isImage = mime.startsWith('image/') || dataUrl.startsWith('data:image/');
  const [objectUrl, setObjectUrl] = useState('');

  useEffect(() => {
    if (!dataUrl) return undefined;
    try {
      const blob = dataUrlToBlob(dataUrl, mime);
      const url = URL.createObjectURL(blob);
      setObjectUrl(url);
      return () => URL.revokeObjectURL(url);
    } catch (error) {
      setObjectUrl('');
      return undefined;
    }
  }, [dataUrl, mime]);

  function makeFile() {
    const blob = dataUrlToBlob(dataUrl, mime);
    return new File([blob], fileName, { type: blob.type || mime || 'application/octet-stream' });
  }

  function openInBrowser() {
    try {
      const target = objectUrl || dataUrl;
      const opened = window.open(target, '_blank', 'noopener,noreferrer');
      if (!opened) onStatus?.('Document preview opened here. Browser pop-up was blocked.');
    } catch (error) {
      onStatus?.('Document could not open in a new tab. Use Share / Save instead.');
    }
  }

  async function shareOrSave() {
    try {
      const file = makeFile();
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ title: row?.requirement?.title || 'DOT document', files: [file] });
        onStatus?.('DOT document shared.');
        return;
      }
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      onStatus?.('DOT document file created.');
    } catch (error) {
      onStatus?.('Document could not be shared from this device.');
    }
  }

  return (
    <div className="dot-doc-viewer-backdrop" role="dialog" aria-modal="true" aria-label="DOT document viewer">
      <div className="dot-doc-viewer">
        <header className="dot-doc-viewer-head">
          <button type="button" onClick={onClose} aria-label="Close document">‹</button>
          <div>
            <span>DOT DOCUMENT</span>
            <b>{row?.requirement?.title || 'Document'}</b>
          </div>
          <button type="button" onClick={shareOrSave}>Share</button>
        </header>
        <div className="dot-doc-viewer-meta">
          <b>{fileName}</b>
          <span>{documentMetaLine(row)}</span>
        </div>
        <div className="dot-doc-viewer-body">
          {isImage ? <img src={objectUrl || dataUrl} alt={row?.requirement?.title || 'DOT document'} /> : null}
          {isPdf ? <iframe title={row?.requirement?.title || 'DOT document'} src={objectUrl || dataUrl} /> : null}
          {!isImage && !isPdf ? (
            <div className="dot-doc-viewer-fallback">
              <b>Preview not available for this file type.</b>
              <span>Use Share / Save or Open in browser.</span>
            </div>
          ) : null}
        </div>
        <div className="dot-doc-viewer-actions">
          <button type="button" onClick={openInBrowser}>Open in browser</button>
          <button type="button" onClick={shareOrSave}>Share / Save file</button>
        </div>
      </div>
    </div>
  );
}

function WalletDocLink({ row, onOpen }) {
  const doc = row.doc || {};
  if (!documentDataUrl(doc)) return <span className="dot-doc-no-file">Details saved</span>;
  return (
    <button className="dot-doc-open" type="button" onClick={() => onOpen?.(row)}>
      Open document
    </button>
  );
}


function OfficerDocumentList({ state, officerSafe = true, onOpen }) {
  const rows = officerSafe ? officerPresentationWalletRows(state) : officerWalletRows(state);
  const sections = DOC_SECTIONS
    .map(section => ({ section, rows: rows.filter(row => row.requirement.section === section.id) }))
    .filter(group => group.rows.length);

  if (!rows.length) {
    return <div className="dot-doc-empty">No documents selected for display.</div>;
  }

  return (
    <div className="dot-doc-sections">
      {sections.map(group => (
        <section className="dot-doc-section" key={group.section.id}>
          <h3>{group.section.title}</h3>
          <div className="dot-doc-list">
            {group.rows.map(row => (
              <article className={`dot-doc-card ${officerSafe ? 'present' : documentStatusClass(row)}`} key={row.requirement.id}>
                <div className="dot-doc-main">
                  <b>{row.requirement.title}</b>
                  <span>{documentMetaLine(row)}</span>
                  {row.doc?.attachmentName ? <em>{row.doc.attachmentName}</em> : null}
                </div>
                <div className="dot-doc-side">
                  <strong>{officerSafe ? officerDocumentLabel(row) : documentStatusLabel(row)}</strong>
                  <WalletDocLink row={row} onOpen={onOpen} />
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function walletReportSectionHtml(state) {
  const rows = officerPresentationWalletRows(state);
  if (!rows.length) return '<section class="wallet-report"><h2>Roadside Documents</h2><p>No documents selected for display.</p></section>';
  const body = rows.map(row => {
    const doc = row.doc || {};
    const fileLink = doc.attachmentDataUrl
      ? `<a href="${htmlEscape(doc.attachmentDataUrl)}">Open saved file</a>`
      : 'Details saved';
    return `<tr>
      <td>${htmlEscape(walletSectionTitle(row.requirement.section))}</td>
      <td>${htmlEscape(row.requirement.title)}</td>
      <td>${htmlEscape(documentMetaLine(row))}</td>
      <td>${fileLink}</td>
    </tr>`;
  }).join('');
  return `<section class="wallet-report">
    <h2>Roadside Documents</h2>
    <table class="wallet-report-table">
      <thead><tr><th>Section</th><th>Document</th><th>Details</th><th>File</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </section>`;
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
  const recaps = recapDays(days, state);
  const eventRows = events.length ? events.map((event, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${htmlEscape(dotLineLabel(event))}</td>
      <td>${htmlEscape(timeLabel(event.startMin, true))}</td>
      <td>${htmlEscape(durLabel(Number(event.endMin || 0) - Number(event.startMin || 0)))}</td>
      <td>${htmlEscape(joinLocation(event))}</td>
      <td>${htmlEscape(unitName(state))}</td>
      <td>${htmlEscape(sanitizeLogText(event.note || event.description || label(event.status)))}</td>
    </tr>`).join('') : '<tr><td colspan="7">No rows to display</td></tr>';
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
        <tr><th>24-Period Starting</th><td>Midnight</td><th>Inspection</th><td>${htmlEscape(officerInspectionLabel(inspection))}</td></tr>
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
      <b>Certification:</b> ${htmlEscape(officerSignatureLabel(state, day))}
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
  .package-cover h1{margin:0 0 8px;font-size:26px;}.package-cover p{margin:6px 0;font-size:14px;}.cover-grid{display:grid;grid-template-columns:180px 1fr;gap:0;border:1px solid #9ca3af;margin-top:16px}.cover-grid b,.cover-grid span{padding:8px 10px;border-bottom:1px solid #d1d5db}.cover-grid b{background:#f3f4f6;border-right:1px solid #d1d5db}.cover-grid b:nth-last-child(2),.cover-grid span:last-child{border-bottom:0}.wallet-report{margin-top:18px}.wallet-report h2{font-size:18px;margin:0 0 8px}.wallet-report-table{width:100%;border-collapse:collapse;font-size:12px}.wallet-report-table th,.wallet-report-table td{border:1px solid #9ca3af;padding:6px;text-align:left;vertical-align:top}.wallet-report-table th{background:#f3f4f6;font-weight:800}
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
    ${walletReportSectionHtml(state)}
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
        <b>Shipping Docs</b><span>{shippingDocs(state)}</span><b>Inspection</b><span>{officerInspectionLabel(inspection)}</span>
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
              <td>{sanitizeLogText(event.note || event.description || label(event.status))}</td>
            </tr>
          )) : <tr><td colSpan="7">No rows to display</td></tr>}
        </tbody>
      </table>

      <div className="dot-paper-recap">
        {recaps.map(({ day: d, total }) => <div key={d}><b>{shortDate(d)}</b><span>{(total / 60).toFixed(2)}</span></div>)}
      </div>

      <div className="dot-paper-cert">
        <div><b>Totals:</b> OFF {durLabel(totals.OFF)} | SB {durLabel(totals.SB)} | D {durLabel(totals.D)} | ON {durLabel(totals.ON)}</div>
        <div><b>Certification:</b> {officerSignatureLabel(state, day)}</div>
        <p>I hereby certify that my data entries and my record of duty status for this day are true and correct.</p>
        <div className="dot-sign-line">{(sig.signatureDataUrl || (sig.signatureRef === 'driverSignature' ? state.driverSignature?.dataUrl : '')) ? <img src={sig.signatureDataUrl || state.driverSignature?.dataUrl} alt="Driver signature" /> : null}<span>Driver Signature</span></div>
      </div>
    </article>
  );
}

export default function DotMode({ state, onBack }) {
  const [selectedDay, setSelectedDay] = useState(localDayKey());
  const [officerEmail, setOfficerEmail] = useState('');
  const [routingCode, setRoutingCode] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [stage, setStage] = useState('home');
  const [status, setStatus] = useState('');
  const [officerPane, setOfficerPane] = useState('package');
  const [docViewer, setDocViewer] = useState(null);
  const days = useMemo(() => dayRange(localDayKey()), []);
  const selectedEvents = reportEventsForDay(state, selectedDay);
  const selectedInspection = state.inspectionByDay?.[selectedDay] || {};
  const selectedTotals = dutyTotals(selectedEvents);
  const walletSummary = officerWalletSummary(state);
  const logStats = logPackageStats(state, days);
  const driverReadiness = driverInspectionReadiness(state, days);
  const availableLogDays = logStats.rows.filter(row => row.eventCount).length;
  const signedLogDays = logStats.rows.filter(row => row.signed).length;
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
            <h1>Roadside package</h1>
            <p>Officer view shows the log package and saved documents only. Driver review items stay on this screen.</p>
            <button className="dot-begin-btn" onClick={beginInspection}>Begin Inspection</button>
            <label className="dot-access-code">
              <span>Optional access code for locked officer view</span>
              <input value={accessCode} onChange={e => setAccessCode(e.target.value)} placeholder="Set code before handing phone" inputMode="numeric" />
            </label>
          </div>

          <section className={`dot-driver-review-card ${driverReadiness.count ? 'needs-review' : 'ready'}`}>
            <div>
              <b>Driver review</b>
              <span>{driverReadiness.count ? 'Fix these before handing the phone over.' : 'No driver review items found.'}</span>
            </div>
            {driverReadiness.count ? (
              <ul>
                {driverReadiness.items.map(item => <li key={item}>{item}</li>)}
              </ul>
            ) : <p>Package is ready to show.</p>}
          </section>

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
              <b>Roadside Package</b>
              <span>Logs + saved documents</span>
            </div>
            <button onClick={() => setStage('report')}>Report</button>
          </div>

          <div className="dot-officer-summary">
            <div><span>Driver</span><b>{driverName(state)}</b></div>
            <div><span>Carrier</span><b>{carrierName(state)}</b></div>
            <div><span>Truck/Unit</span><b>{unitName(state)}</b></div>
            <div><span>Record Type</span><b>Manual RODS</b></div>
          </div>

          <div className="dot-roadside-switch" role="tablist" aria-label="DOT roadside package">
            <button type="button" className={officerPane === 'package' ? 'active' : ''} onClick={() => setOfficerPane('package')}>Package</button>
            <button type="button" className={officerPane === 'logs' ? 'active' : ''} onClick={() => setOfficerPane('logs')}>Logs</button>
            <button type="button" className={officerPane === 'docs' ? 'active' : ''} onClick={() => setOfficerPane('docs')}>Documents</button>
          </div>

          {(officerPane === 'package' || officerPane === 'logs') && (
            <section className="dot-roadside-section">
              <div className="dot-roadside-title">
                <b>Logs / RODS</b>
                <span>Today + previous 7 days</span>
              </div>
              <div className="dot-roadside-cards officer-safe">
                <button type="button" onClick={() => setOfficerPane('logs')}>
                  <b>{availableLogDays}</b>
                  <span>days displayed</span>
                </button>
                <button type="button" onClick={() => setOfficerPane('logs')}>
                  <b>{signedLogDays}</b>
                  <span>signed logs</span>
                </button>
                <button type="button" onClick={() => setOfficerPane('docs')}>
                  <b>{walletSummary.count}</b>
                  <span>documents</span>
                </button>
              </div>

              <div className="dot-days-strip clean">
                {days.map(day => (
                  <button key={day} className={day === selectedDay ? 'active' : ''} onClick={() => { setSelectedDay(day); setOfficerPane('logs'); }}>
                    <b>{dayTitle(day)}</b>
                    <span>{day}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {(officerPane === 'package' || officerPane === 'docs') && (
            <section className="dot-roadside-section">
              <div className="dot-roadside-title">
                <b>Roadside Documents</b>
                <span>{walletSummary.count} document(s) · {walletSummary.fileCount} file(s)</span>
              </div>
              <OfficerDocumentList state={state} onOpen={setDocViewer} />
            </section>
          )}

          {officerPane === 'logs' && (
            <section className="dot-roadside-section logs-open">
              <div className="dot-selected-day-card">
                <div>
                  <b>{dayTitle(selectedDay, true)}</b>
                  <span>{selectedDay}</span>
                </div>
                <em>{officerSignatureLabel(state, selectedDay)}</em>
              </div>

              <div className="graph-panel dot-graph-panel"><LogGraph events={selectedEvents} /></div>

              <div className="dot-totals-row">
                <div><b>OFF</b><span>{durLabel(selectedTotals.OFF)}</span></div>
                <div><b>SB</b><span>{durLabel(selectedTotals.SB)}</span></div>
                <div><b>D</b><span>{durLabel(selectedTotals.D)}</span></div>
                <div><b>ON</b><span>{durLabel(selectedTotals.ON)}</span></div>
              </div>

              <div className="dot-day-status-card pro">
                <span>Inspection: {officerInspectionLabel(selectedInspection)}</span>
                <span>Certification: {officerSignatureLabel(state, selectedDay)}</span>
              </div>

              <div className="events dot-events pro">
                {selectedEvents.map(e => (
                  <div className="event-row" key={e.id}>
                    <div className="event-badge" style={{ background:color(e.status) }}>{e.status}</div>
                    <div className="event-content">
                      <div className="event-time">{timeLabel(e.startMin, true)} <span>|</span> {durLabel(e.endMin-e.startMin)}</div>
                      <div className="event-loc">{joinLocation(e)}</div>
                      <div className="event-note">{sanitizeLogText(e.note || label(e.status))}</div>
                    </div>
                  </div>
                ))}
                {!selectedEvents.length && <div className="dot-empty-day">No rows to display.</div>}
              </div>
            </section>
          )}        </main>
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
            <div><b>Documents:</b> {walletSummary.count} document(s) · {walletSummary.fileCount} file(s)</div>
          </section>
          <section className="dot-report-cover wallet-doc-report">
            <h1>Roadside Documents</h1>
            <OfficerDocumentList state={state} onOpen={setDocViewer} />
          </section>
          {days.map(day => <DailyPaper key={day} state={state} day={day} days={days} />)}
        </main>
      )}
      {docViewer ? <DotDocumentViewer row={docViewer} onClose={() => setDocViewer(null)} onStatus={setStatus} /> : null}
    </section>
  );
}

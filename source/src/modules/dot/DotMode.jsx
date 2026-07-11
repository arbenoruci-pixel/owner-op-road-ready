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
import { routeLegsForDayCanonical } from '../../core/routes/routeNormalization.js';
import { eventHasNoLoadDeclaration } from '../../core/routes/shippingDocsRepair.js';

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

function shippingDocs(state, day = state.activeDay) {
  const load = state.loadInfo || {};
  const events = state.eventsByDay?.[day] || [];
  const routeLegs = routeLegsForDayCanonical(state, day);
  const eventIds = new Set(events.map(event => event?.id).filter(Boolean));
  const loadBelongsToDay = load.sourceEventDay === day
    || (!!load.sourceEventId && eventIds.has(load.sourceEventId))
    || (!load.sourceEventDay && !load.sourceEventId && !routeLegs.length && !events.some(event => event.shippingDocs || event.loadNo));
  const values = [
    ...routeLegs.flatMap(leg => [leg.shippingDocs, leg.loadNo]),
    ...events.flatMap(event => [event.shippingDocs, event.loadNo, event.bol, event.po]),
    ...(loadBelongsToDay ? [load.shippingDocs, load.loadNo, load.bol, load.po] : []),
  ].map(value => String(value || '').trim()).filter(Boolean);
  const unique = [...new Map(values.map(value => [value.toLowerCase(), value])).values()];
  if (unique.length) return unique.join(' · ');
  const emptyMove = routeLegs.some(leg => leg.noLoadDeclared || /empty|bobtail|deadhead|reposition|no[_ ]load/i.test(`${leg.kind || ''} ${leg.source || ''} ${leg.noLoadNote || ''}`))
    || events.some(eventHasNoLoadDeclaration);
  return emptyMove ? 'Empty / reposition' : 'None';
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

function dataUrlApproxBytes(dataUrl = '') {
  const text = String(dataUrl || '');
  const comma = text.indexOf(',');
  if (comma < 0) return new Blob([text]).size;
  const meta = text.slice(0, comma);
  const payload = text.slice(comma + 1).replace(/\s+/g, '');
  if (/;base64/i.test(meta)) {
    const padding = payload.endsWith('==') ? 2 : (payload.endsWith('=') ? 1 : 0);
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  }
  try { return new Blob([decodeURIComponent(payload)]).size; }
  catch { return new Blob([payload]).size; }
}

function compactSizeLabel(bytes = 0) {
  const value = Math.max(0, Number(bytes || 0));
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function jpgFileName(name = 'roadside-document') {
  const clean = String(name || 'roadside-document').trim() || 'roadside-document';
  return /\.[a-z0-9]{2,5}$/i.test(clean)
    ? clean.replace(/\.[a-z0-9]{2,5}$/i, '.jpg')
    : `${clean}.jpg`;
}

async function optimizeImageDataUrlForHtml(dataUrl = '') {
  const source = String(dataUrl || '').trim();
  const beforeBytes = dataUrlApproxBytes(source);
  if (!/^data:image\//i.test(source) || beforeBytes < 600 * 1024 || typeof Image === 'undefined' || typeof document === 'undefined') {
    return { dataUrl: source, changed: false, beforeBytes, afterBytes: beforeBytes, mime: '' };
  }

  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => {
      try {
        const maxDimension = 2000;
        const width = Math.max(1, Number(image.naturalWidth || image.width || 1));
        const height = Math.max(1, Number(image.naturalHeight || image.height || 1));
        const scale = Math.min(1, maxDimension / Math.max(width, height));
        const targetWidth = Math.max(1, Math.round(width * scale));
        const targetHeight = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          resolve({ dataUrl: source, changed: false, beforeBytes, afterBytes: beforeBytes, mime: '' });
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
        const candidate = canvas.toDataURL('image/jpeg', 0.82);
        const afterBytes = dataUrlApproxBytes(candidate);
        // Keep the source when browser re-encoding does not save at least 8%.
        if (!candidate || afterBytes >= beforeBytes * 0.92) {
          resolve({ dataUrl: source, changed: false, beforeBytes, afterBytes: beforeBytes, mime: '' });
          return;
        }
        resolve({ dataUrl: candidate, changed: true, beforeBytes, afterBytes, mime: 'image/jpeg' });
      } catch {
        resolve({ dataUrl: source, changed: false, beforeBytes, afterBytes: beforeBytes, mime: '' });
      }
    };
    image.onerror = () => resolve({ dataUrl: source, changed: false, beforeBytes, afterBytes: beforeBytes, mime: '' });
    image.src = source;
  });
}

async function compactStateForDotHtml(state = {}) {
  const sourceWallet = state.dotWallet || {};
  const sourceDocuments = sourceWallet.documents || {};
  const entries = Object.entries(sourceDocuments);
  if (!entries.length) return { state, imageBeforeBytes: 0, imageAfterBytes: 0, optimizedImages: 0 };

  const nextDocuments = { ...sourceDocuments };
  const cache = new Map();
  let imageBeforeBytes = 0;
  let imageAfterBytes = 0;
  let optimizedImages = 0;

  for (const [id, sourceDoc] of entries) {
    const doc = { ...(sourceDoc || {}) };
    let changed = false;
    for (const key of ['attachmentDataUrl', 'photoDataUrl']) {
      const value = String(doc[key] || '').trim();
      if (!/^data:image\//i.test(value)) continue;
      let result = cache.get(value);
      if (!result) {
        result = await optimizeImageDataUrlForHtml(value);
        cache.set(value, result);
        imageBeforeBytes += result.beforeBytes;
        imageAfterBytes += result.afterBytes;
        if (result.changed) optimizedImages += 1;
      }
      if (result.changed) {
        doc[key] = result.dataUrl;
        doc.attachmentType = result.mime;
        if (doc.attachmentName) doc.attachmentName = jpgFileName(doc.attachmentName);
        changed = true;
      }
    }
    if (changed) nextDocuments[id] = doc;
  }

  if (!optimizedImages) return { state, imageBeforeBytes, imageAfterBytes, optimizedImages };
  return {
    state: {
      ...state,
      dotWallet: {
        ...sourceWallet,
        documents: nextDocuments,
      },
    },
    imageBeforeBytes,
    imageAfterBytes,
    optimizedImages,
  };
}

async function compactDotHtmlPackage(state, days, routingCode = '') {
  const compact = await compactStateForDotHtml(state);
  const html = reportHtml(compact.state, days, routingCode);
  return {
    html,
    bytes: new Blob([html], { type: 'text/html;charset=utf-8' }).size,
    optimizedImages: compact.optimizedImages,
    imageBeforeBytes: compact.imageBeforeBytes,
    imageAfterBytes: compact.imageAfterBytes,
  };
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
          <button type="button" onClick={onClose} aria-label="Back to DOT package">‹ Back</button>
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

function roadsideDocumentId(row, index = 0) {
  const raw = `${row?.requirement?.id || row?.requirement?.title || 'document'}-${index}`;
  return `roadside-doc-${String(raw).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

function walletReportFileLinkHtml(row, index = 0) {
  const doc = row?.doc || {};
  const dataUrl = documentDataUrl(doc);
  if (!dataUrl) return '<span class="roadside-doc-details-only">Details saved</span>';
  const mime = guessDocMime(doc);
  const fileName = safeFileName(doc.attachmentName || row?.requirement?.title || 'roadside-document', mime);
  const title = row?.requirement?.title || 'Roadside document';
  const targetId = roadsideDocumentId(row, index);
  return `<a class="roadside-doc-link" href="#${htmlEscape(targetId)}" data-roadside-doc="1" data-doc-target="${htmlEscape(targetId)}" data-doc-title="${htmlEscape(title)}" data-doc-file="${htmlEscape(fileName)}" data-doc-mime="${htmlEscape(mime)}">Open document</a>`;
}

function walletReportDocumentPreviewHtml(row, index = 0) {
  const doc = row?.doc || {};
  const dataUrl = documentDataUrl(doc);
  if (!dataUrl) return '';
  const mime = guessDocMime(doc);
  const fileName = safeFileName(doc.attachmentName || row?.requirement?.title || 'roadside-document', mime);
  const title = row?.requirement?.title || 'Roadside document';
  const targetId = roadsideDocumentId(row, index);
  let preview = '';
  // v95.96: keep each embedded file exactly once in the HTML. The old package
  // repeated the same base64 payload in the preview, fallback link, and action
  // link, which could triple the final file size.
  if (mime.startsWith('image/') || /^data:image\//i.test(dataUrl)) {
    preview = `<img class="roadside-static-image" src="${htmlEscape(dataUrl)}" alt="${htmlEscape(title)}" />`;
  } else {
    const objectClass = mime.includes('pdf') || /^data:application\/pdf/i.test(dataUrl)
      ? 'roadside-static-pdf'
      : 'roadside-static-file';
    preview = `<object class="${objectClass}" data="${htmlEscape(dataUrl)}" type="${htmlEscape(mime)}" aria-label="${htmlEscape(title)}">
      <div class="roadside-static-fallback"><b>This viewer could not show the saved file inline.</b><span>Use Open full screen in a browser that supports this document type.</span></div>
    </object>`;
  }
  return `<section class="roadside-static-document" id="${htmlEscape(targetId)}" data-doc-title="${htmlEscape(title)}" data-doc-file="${htmlEscape(fileName)}" data-doc-mime="${htmlEscape(mime)}">
    <header class="roadside-static-head">
      <div><span>ROADSIDE DOCUMENT</span><h3>${htmlEscape(title)}</h3><p>${htmlEscape(documentMetaLine(row))}</p><em>${htmlEscape(fileName)}</em></div>
      <a class="roadside-back-link" href="#roadside-documents-index">Back to documents</a>
    </header>
    <div class="roadside-static-body">${preview}</div>
    <div class="roadside-static-actions">
      <a class="roadside-original-link" href="#${htmlEscape(targetId)}" data-roadside-doc="1" data-doc-target="${htmlEscape(targetId)}" data-doc-title="${htmlEscape(title)}" data-doc-file="${htmlEscape(fileName)}" data-doc-mime="${htmlEscape(mime)}">Open full screen</a>
    </div>
  </section>`;
}

function walletReportSectionHtml(state) {
  const rows = officerPresentationWalletRows(state);
  if (!rows.length) return '<section class="wallet-report pro-section" id="roadside-documents-index"><div class="section-heading"><span>DOCUMENTS</span><h2>Roadside Documents</h2><p>No saved roadside documents are included in this package.</p></div></section>';
  const cards = rows.map((row, index) => `<article class="roadside-doc-card">
      <div class="roadside-doc-card-main">
        <span class="roadside-doc-type">${htmlEscape(walletSectionTitle(row.requirement.section))}</span>
        <h3>${htmlEscape(row.requirement.title)}</h3>
        <p>${htmlEscape(documentMetaLine(row))}</p>
        ${row.doc?.attachmentName ? `<em>${htmlEscape(row.doc.attachmentName)}</em>` : ''}
      </div>
      <div class="roadside-doc-card-action">${walletReportFileLinkHtml(row, index)}</div>
    </article>`).join('');
  const previews = rows.map((row, index) => walletReportDocumentPreviewHtml(row, index)).join('');
  return `<section class="wallet-report pro-section" id="roadside-documents-index">
    <div class="section-heading"><span>DOCUMENTS</span><h2>Roadside Documents</h2><p>Tap Open document. The file opens full screen when supported, with an inline copy kept inside this HTML package.</p></div>
    <div class="roadside-doc-grid">${cards}</div>
  </section>
  <div class="roadside-static-documents">${previews}</div>`;
}

function roadsideDocumentViewerScriptHtml() {
  return `<script>
(function(){
  var modal;
  var titleEl;
  var fileEl;
  var bodyEl;
  var directLink;
  var activeObjectUrl = '';
  function createModal(){
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'roadside-doc-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Roadside document preview');
    modal.innerHTML = '<div class="roadside-doc-viewer"><header class="roadside-doc-viewer-head"><button type="button" class="roadside-doc-back" aria-label="Back to DOT package">‹ Back</button><div><span>ROADSIDE DOCUMENT</span><b></b><em></em></div><a class="roadside-doc-direct" target="_blank" rel="noopener noreferrer">Open file</a></header><main class="roadside-doc-viewer-body"></main></div>';
    document.body.appendChild(modal);
    titleEl = modal.querySelector('b');
    fileEl = modal.querySelector('em');
    bodyEl = modal.querySelector('.roadside-doc-viewer-body');
    directLink = modal.querySelector('.roadside-doc-direct');
    modal.querySelector('.roadside-doc-back').addEventListener('click', closeDoc);
    modal.addEventListener('click', function(e){ if (e.target === modal) closeDoc(); });
  }
  function revokeActiveUrl(){
    if (!activeObjectUrl) return;
    try { URL.revokeObjectURL(activeObjectUrl); } catch (error) {}
    activeObjectUrl = '';
  }
  function closeDoc(){
    if (!modal) return;
    modal.classList.remove('open');
    document.body.classList.remove('roadside-doc-open');
    if (bodyEl) bodyEl.innerHTML = '';
    revokeActiveUrl();
  }
  function sourceFromSection(section){
    if (!section) return '';
    var image = section.querySelector('img.roadside-static-image');
    if (image) return image.getAttribute('src') || '';
    var object = section.querySelector('object[data]');
    if (object) return object.getAttribute('data') || '';
    var original = section.querySelector('a.roadside-original-link');
    return original ? (original.getAttribute('href') || '') : '';
  }
  function objectUrlFromDataUrl(src, explicitMime){
    if (String(src || '').indexOf('data:') !== 0) return src;
    try {
      var comma = src.indexOf(',');
      if (comma < 0) return src;
      var meta = src.slice(5, comma);
      var payload = src.slice(comma + 1);
      var mime = (meta.split(';')[0] || explicitMime || 'application/octet-stream');
      var blob;
      if (/;base64/i.test(meta)) {
        var binary = atob(payload.replace(/\s+/g, ''));
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        blob = new Blob([bytes], { type: mime });
      } else {
        blob = new Blob([decodeURIComponent(payload)], { type: mime });
      }
      activeObjectUrl = URL.createObjectURL(blob);
      return activeObjectUrl;
    } catch (error) {
      return src;
    }
  }
  function openDoc(link){
    createModal();
    revokeActiveUrl();
    var targetId = link.getAttribute('data-doc-target') || '';
    var section = targetId ? document.getElementById(targetId) : null;
    var source = sourceFromSection(section);
    if (!source) return false;
    var title = link.getAttribute('data-doc-title') || (section && section.getAttribute('data-doc-title')) || 'Roadside document';
    var file = link.getAttribute('data-doc-file') || (section && section.getAttribute('data-doc-file')) || 'Saved file';
    var mime = link.getAttribute('data-doc-mime') || (section && section.getAttribute('data-doc-mime')) || '';
    var viewUrl = objectUrlFromDataUrl(source, mime);
    titleEl.textContent = title;
    fileEl.textContent = file;
    directLink.href = viewUrl;
    directLink.setAttribute('download', file);
    bodyEl.innerHTML = '';
    if (mime.indexOf('image/') === 0 || new RegExp('^data:image/', 'i').test(source)) {
      var img = document.createElement('img');
      img.alt = title;
      img.src = viewUrl;
      bodyEl.appendChild(img);
    } else if (mime.indexOf('pdf') >= 0 || new RegExp('^data:application/pdf', 'i').test(source)) {
      var iframe = document.createElement('iframe');
      iframe.title = title;
      iframe.src = viewUrl;
      bodyEl.appendChild(iframe);
    } else {
      var fallback = document.createElement('div');
      fallback.className = 'roadside-doc-fallback';
      fallback.innerHTML = '<b>Preview is unavailable for this file type.</b><span>Use Open file to view or save the document.</span>';
      bodyEl.appendChild(fallback);
    }
    modal.classList.add('open');
    document.body.classList.add('roadside-doc-open');
    return true;
  }
  document.addEventListener('click', function(e){
    var target = e.target;
    if (!target || !target.closest) return;
    var link = target.closest('a[data-roadside-doc="1"]');
    if (!link) return;
    if (openDoc(link)) e.preventDefault();
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeDoc(); });
})();
</script>`;
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
      <td data-label="No.">${index + 1}</td>
      <td data-label="Status"><span class="status-pill status-${htmlEscape(String(event.status || 'OFF').toLowerCase())}">${htmlEscape(dotLineLabel(event))}</span></td>
      <td data-label="Start">${htmlEscape(timeLabel(event.startMin, true))}</td>
      <td data-label="Duration">${htmlEscape(durLabel(Number(event.endMin || 0) - Number(event.startMin || 0)))}</td>
      <td data-label="Location">${htmlEscape(joinLocation(event))}</td>
      <td data-label="CMV">${htmlEscape(unitName(state))}</td>
      <td data-label="Notes">${htmlEscape(sanitizeLogText(event.note || event.description || label(event.status)))}</td>
    </tr>`).join('') : '<tr><td colspan="7">No rows to display</td></tr>';
  const signatureDataUrl = sig.signatureDataUrl || (sig.signatureRef === 'driverSignature' ? state.driverSignature?.dataUrl : '') || '';
  const signatureHtml = signatureDataUrl ? `<img src="${htmlEscape(signatureDataUrl)}" alt="Driver signature" />` : '';
  const certified = Boolean(sig.signed);
  return `
  <section class="daily-log-page" id="log-day-${htmlEscape(day)}">
    <header class="daily-log-head">
      <div class="brand-lockup"><div class="brand">ROAD READY</div><span>DOT roadside package</span></div>
      <div class="daily-log-title"><span>RECORD OF DUTY STATUS</span><h1>Driver's Daily Log</h1><p>Manual RODS / ELD-exempt driver record</p></div>
      <div class="log-date"><b>${htmlEscape(dayTitle(day, true))}</b><span>${htmlEscape(day)}</span><em class="cert-badge ${certified ? 'certified' : 'pending'}">${certified ? 'CERTIFIED' : 'REVIEW'}</em></div>
    </header>

    <div class="log-meta-grid">
      <div><span>Driver</span><b>${htmlEscape(driverName(state))}</b><small>${htmlEscape(driverEmail(state))}</small></div>
      <div><span>Carrier / USDOT</span><b>${htmlEscape(carrierName(state))}</b><small>USDOT ${htmlEscape(dotNumber(state))}</small></div>
      <div><span>Truck / Unit</span><b>${htmlEscape(unitName(state))}</b><small>${htmlEscape(trailerName(state))}</small></div>
      <div><span>Shipping documents</span><b>${htmlEscape(shippingDocs(state))}</b><small>24-hour period starts at midnight</small></div>
      <div><span>Main office</span><b>${htmlEscape(mainOffice(state))}</b><small>Manual RODS record</small></div>
      <div><span>Inspection</span><b>${htmlEscape(officerInspectionLabel(inspection))}</b><small>No diagnostic or malfunction indicators</small></div>
    </div>

    <div class="log-section-heading"><span>24-HOUR GRAPH</span><h2>Duty Status</h2></div>
    <div class="graph-wrap">${svgGraphMarkup(events)}</div>

    <div class="totals-strip">
      <div><span>OFF</span><b>${htmlEscape(durLabel(totals.OFF))}</b></div>
      <div><span>SB</span><b>${htmlEscape(durLabel(totals.SB))}</b></div>
      <div><span>D</span><b>${htmlEscape(durLabel(totals.D))}</b></div>
      <div><span>ON</span><b>${htmlEscape(durLabel(totals.ON))}</b></div>
      <div><span>TOTAL</span><b>${htmlEscape(durLabel(totalHours(events)))}</b></div>
    </div>

    <div class="log-section-heading"><span>EVENT DETAIL</span><h2>Duty Status Events</h2></div>
    <div class="event-table-wrap">
      <table class="event-table">
        <thead><tr><th>No.</th><th>Status</th><th>Start</th><th>Duration</th><th>Location</th><th>CMV</th><th>Notes</th></tr></thead>
        <tbody>${eventRows}</tbody>
      </table>
    </div>

    <div class="recap-panel">
      <div class="recap-heading"><span>8-DAY RECAP</span><b>Daily hours recorded</b></div>
      <div class="recap-grid">${recaps.map(({ day: d, total }) => `<div><span>${htmlEscape(shortDate(d))}</span><b>${(total / 60).toFixed(2)}</b></div>`).join('')}</div>
    </div>

    <div class="cert-block">
      <div class="cert-copy"><span>CERTIFICATION</span><b>${htmlEscape(officerSignatureLabel(state, day))}</b><p>I hereby certify that my data entries and my record of duty status for this day are true and correct.</p></div>
      <div class="signature-line">${signatureHtml}<span>Driver Signature</span></div>
    </div>
    <a class="back-to-package" href="#package-top">Back to package summary</a>
  </section>`;
}

function reportHtml(state, days, routingCode = '') {
  const period = `${days.at(-1)} through ${days[0]}`;
  const documentCount = officerPresentationWalletRows(state).length;
  const signedCount = days.filter(day => signatureForDay(state, day).signed).length;
  const logLinks = days.map(day => {
    const events = reportEventsForDay(state, day);
    const totals = dutyTotals(events);
    return `<a class="log-index-card" href="#log-day-${htmlEscape(day)}"><span>${htmlEscape(dayTitle(day))}</span><b>${htmlEscape(day)}</b><small>D ${htmlEscape(durLabel(totals.D))} · ON ${htmlEscape(durLabel(totals.ON))}</small></a>`;
  }).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="color-scheme" content="light" />
<title>DOT Roadside HTML Package</title>
<style>
  :root{--ink:#102238;--blue:#1f66e5;--muted:#657287;--line:#d8e0ea;--soft:#f4f7fb;--paper:#fff;--green:#167a52;--amber:#9a5b08;--shadow:0 12px 34px rgba(16,34,56,.08)}
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#edf2f7;color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,Helvetica,sans-serif;line-height:1.35}.package-nav{position:sticky;top:0;z-index:50;display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px max(14px,env(safe-area-inset-left)) 12px max(14px,env(safe-area-inset-right));background:rgba(255,255,255,.96);border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}.package-nav-brand{display:grid;gap:1px}.package-nav-brand b{font-size:14px;letter-spacing:.04em}.package-nav-brand span{font-size:10px;color:var(--muted);font-weight:800;letter-spacing:.08em}.package-nav nav{display:flex;gap:7px}.package-nav a{display:inline-grid;place-items:center;min-height:36px;padding:0 12px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink);text-decoration:none;font-size:12px;font-weight:900}.package-shell{max-width:1040px;margin:18px auto 36px;padding:0 14px}.package-cover,.pro-section,.daily-log-page,.section-divider{background:var(--paper);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow)}.package-cover{padding:26px}.cover-eyebrow,.section-heading>span,.log-section-heading>span,.daily-log-title>span,.recap-heading>span,.cert-copy>span{display:block;color:var(--blue);font-size:10px;font-weight:950;letter-spacing:.14em}.cover-title-row{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding-bottom:18px;border-bottom:1px solid var(--line)}.cover-title-row h1{margin:5px 0 7px;font-size:31px;line-height:1.08}.cover-title-row p{margin:0;color:var(--muted);font-weight:700}.package-chip{display:grid;gap:2px;min-width:170px;padding:12px 14px;border-radius:16px;background:var(--ink);color:#fff;text-align:right}.package-chip span{font-size:10px;font-weight:900;letter-spacing:.08em}.package-chip b{font-size:14px}.cover-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:18px}.cover-stats div{padding:14px;border:1px solid var(--line);border-radius:15px;background:var(--soft)}.cover-stats span{display:block;color:var(--muted);font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.05em}.cover-stats b{display:block;margin-top:5px;font-size:18px}.cover-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}.cover-grid div{padding:13px 14px;border:1px solid var(--line);border-radius:14px}.cover-grid span{display:block;color:var(--muted);font-size:11px;font-weight:850;text-transform:uppercase}.cover-grid b{display:block;margin-top:4px;font-size:14px;overflow-wrap:anywhere}.log-index{margin-top:20px}.log-index h2{margin:0 0 10px;font-size:18px}.log-index-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.log-index-card{display:grid;gap:3px;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff;color:var(--ink);text-decoration:none}.log-index-card:hover{border-color:#a9bee8;background:#f7faff}.log-index-card span{font-size:11px;color:var(--blue);font-weight:900}.log-index-card b{font-size:13px}.log-index-card small{font-size:10px;color:var(--muted);font-weight:750}.pro-section{margin-top:18px;padding:22px;scroll-margin-top:78px}.section-heading h2{margin:4px 0 5px;font-size:24px}.section-heading p{margin:0;color:var(--muted);font-weight:700}.roadside-doc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;margin-top:16px}.roadside-doc-card{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;padding:15px;border:1px solid var(--line);border-radius:16px;background:#fff}.roadside-doc-card-main{min-width:0}.roadside-doc-type{display:inline-block;padding:4px 8px;border-radius:999px;background:#eef4ff;color:#2457b8;font-size:10px;font-weight:900;letter-spacing:.04em}.roadside-doc-card h3{margin:7px 0 4px;font-size:16px}.roadside-doc-card p,.roadside-doc-card em{display:block;margin:2px 0;color:var(--muted);font-size:12px;font-style:normal;overflow-wrap:anywhere}.roadside-doc-link,.roadside-back-link,.roadside-original-link,.back-to-package{display:inline-grid;place-items:center;min-height:42px;padding:0 14px;border-radius:12px;text-decoration:none;font-weight:900;box-sizing:border-box}.roadside-doc-link{background:var(--blue);color:#fff;white-space:nowrap}.roadside-doc-details-only{color:var(--muted);font-weight:800}.roadside-static-documents{display:grid;gap:18px;margin-top:18px}.roadside-static-document{scroll-margin-top:78px;border:1px solid var(--line);border-radius:20px;overflow:hidden;background:#fff;box-shadow:var(--shadow)}.roadside-static-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:16px 18px;border-bottom:1px solid var(--line);background:var(--soft)}.roadside-static-head span{font-size:10px;letter-spacing:.12em;color:var(--blue);font-weight:950}.roadside-static-head h3{margin:4px 0 2px;font-size:20px}.roadside-static-head p,.roadside-static-head em{display:block;margin:2px 0;color:var(--muted);font-size:12px;font-style:normal;overflow-wrap:anywhere}.roadside-back-link{background:var(--ink);color:#fff}.roadside-static-body{min-height:420px;padding:12px;background:#0b1220;display:flex;align-items:center;justify-content:center}.roadside-static-image{display:block;max-width:100%;max-height:900px;object-fit:contain;background:#fff}.roadside-static-pdf,.roadside-static-file{display:block;width:100%;height:78vh;min-height:620px;border:0;background:#fff}.roadside-static-fallback{display:grid;gap:12px;max-width:480px;padding:24px;border-radius:14px;background:#fff;color:var(--ink);text-align:center}.roadside-static-actions{display:flex;justify-content:flex-end;padding:12px 16px;border-top:1px solid var(--line)}.roadside-original-link{background:#eef4ff;border:1px solid #bfd0f6;color:#1f55b8}.section-divider{margin-top:20px;padding:20px;scroll-margin-top:78px}.section-divider h2{margin:0 0 4px}.section-divider p{margin:0;color:var(--muted);font-weight:700}.daily-log-page{margin-top:18px;padding:22px;scroll-margin-top:78px;overflow:hidden}.daily-log-head{display:grid;grid-template-columns:180px 1fr 190px;align-items:start;gap:16px;padding-bottom:14px;border-bottom:2px solid var(--ink)}.brand-lockup{display:grid;gap:2px}.brand{font-size:27px;font-weight:950;font-style:italic;letter-spacing:-.03em}.brand-lockup span{color:var(--muted);font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}.daily-log-title{text-align:center}.daily-log-title h1{margin:4px 0 2px;font-size:23px;text-transform:uppercase}.daily-log-title p{margin:0;color:var(--muted);font-size:12px;font-weight:750}.log-date{display:grid;justify-items:end;gap:3px;text-align:right}.log-date b{font-size:15px}.log-date span{font-size:12px;color:var(--muted)}.cert-badge{display:inline-grid;place-items:center;min-height:25px;padding:0 9px;border-radius:999px;font-style:normal;font-size:10px;font-weight:950;letter-spacing:.05em}.cert-badge.certified{background:#e7f6ef;color:var(--green)}.cert-badge.pending{background:#fff4df;color:var(--amber)}.log-meta-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:14px}.log-meta-grid div{padding:11px 12px;border:1px solid var(--line);border-radius:13px;background:var(--soft);min-width:0}.log-meta-grid span,.log-meta-grid small{display:block;color:var(--muted);font-size:10px;font-weight:800}.log-meta-grid b{display:block;margin:4px 0 2px;font-size:13px;overflow-wrap:anywhere}.log-section-heading{margin-top:18px}.log-section-heading h2{margin:3px 0 8px;font-size:18px}.graph-wrap{border:1px solid var(--line);border-radius:14px;padding:8px;overflow:hidden;background:#fff}.report-svg{display:block;width:100%;height:auto}.grid-line,.hour-line{stroke:#dbe3ed;stroke-width:.8}.hour-line.major{stroke:#aab8c9;stroke-width:1.2}.hour-label,.row-label{font-size:12px;fill:#415066;font-weight:800}.totals-strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:10px}.totals-strip div{padding:10px;border:1px solid var(--line);border-radius:12px;text-align:center}.totals-strip span{display:block;color:var(--muted);font-size:10px;font-weight:900}.totals-strip b{display:block;margin-top:3px;font-size:13px}.event-table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:14px}.event-table{width:100%;border-collapse:collapse;font-size:12px}.event-table th,.event-table td{padding:9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.event-table th{background:var(--soft);font-size:10px;text-transform:uppercase;letter-spacing:.05em}.event-table tr:last-child td{border-bottom:0}.status-pill{display:inline-block;padding:4px 7px;border-radius:999px;background:#edf2f7;font-weight:900;white-space:nowrap}.status-d{background:#e7f7f3;color:#0e796d}.status-on{background:#eaf1ff;color:#235cc9}.status-sb{background:#eef0f4;color:#596579}.status-off{background:#f2f3f5;color:#4f5a69}.recap-panel{display:grid;grid-template-columns:160px 1fr;gap:12px;align-items:center;margin-top:14px;padding:13px;border:1px solid var(--line);border-radius:14px;background:var(--soft)}.recap-heading b{display:block;margin-top:4px;font-size:13px}.recap-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}.recap-grid div{padding:8px 5px;border-radius:10px;background:#fff;text-align:center}.recap-grid span{display:block;color:var(--muted);font-size:9px;font-weight:800}.recap-grid b{display:block;margin-top:2px;font-size:11px}.cert-block{display:grid;grid-template-columns:1fr 330px;gap:20px;align-items:end;margin-top:14px;padding:15px;border:1px solid var(--line);border-radius:14px}.cert-copy b{display:block;margin-top:4px}.cert-copy p{margin:5px 0 0;color:var(--muted);font-size:11px;font-weight:700}.signature-line{min-height:55px;display:flex;align-items:end;justify-content:center;gap:10px}.signature-line img{max-height:42px;max-width:170px}.signature-line span{border-top:1px solid var(--ink);min-width:190px;padding-top:5px;text-align:center;font-size:10px;font-weight:800}.back-to-package{margin-top:14px;background:var(--soft);border:1px solid var(--line);color:var(--ink)}.roadside-doc-open{overflow:hidden}.roadside-doc-modal{position:fixed;inset:0;z-index:9999;background:rgba(8,17,31,.76);display:none}.roadside-doc-modal.open{display:block}.roadside-doc-viewer{height:100dvh;background:#fff;display:flex;flex-direction:column}.roadside-doc-viewer-head{min-height:62px;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:calc(env(safe-area-inset-top,0px) + 8px) 12px 8px;border-bottom:1px solid var(--line)}.roadside-doc-back{border:0;border-radius:12px;background:var(--ink);color:#fff;padding:10px 12px;font-weight:900;font-size:15px}.roadside-doc-viewer-head div{display:grid;gap:2px;min-width:0}.roadside-doc-viewer-head span{font-size:9px;letter-spacing:.12em;color:var(--blue);font-weight:950}.roadside-doc-viewer-head b{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.roadside-doc-viewer-head em{font-style:normal;font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.roadside-doc-direct{border:1px solid var(--line);border-radius:12px;background:var(--soft);color:var(--ink);padding:10px 12px;text-decoration:none;font-weight:900;font-size:12px}.roadside-doc-viewer-body{flex:1;min-height:0;background:#0b1220;display:flex;align-items:center;justify-content:center;overflow:auto;padding:10px}.roadside-doc-viewer-body img{max-width:100%;max-height:100%;object-fit:contain;background:#fff}.roadside-doc-viewer-body iframe{width:100%;height:100%;border:0;background:#fff}.roadside-doc-fallback{display:grid;gap:8px;max-width:420px;border-radius:16px;background:#fff;padding:20px;text-align:center}
  @media(max-width:760px){.package-nav{align-items:flex-start}.package-nav nav{overflow-x:auto;max-width:62vw}.package-nav a{min-height:34px;padding:0 10px}.package-shell{margin:0;padding:0}.package-cover,.pro-section,.daily-log-page,.section-divider{border-radius:0;border-left:0;border-right:0;box-shadow:none;margin-top:8px}.package-cover{padding:17px 14px}.cover-title-row{display:grid}.package-chip{text-align:left;min-width:0}.cover-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.cover-grid{grid-template-columns:1fr}.log-index-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pro-section{padding:17px 14px}.roadside-doc-grid{grid-template-columns:1fr}.roadside-doc-card{grid-template-columns:1fr}.roadside-doc-link{width:100%}.roadside-static-head{display:grid}.roadside-back-link,.roadside-original-link{width:100%}.roadside-static-body{min-height:260px;padding:6px}.roadside-static-pdf,.roadside-static-file{height:72vh;min-height:500px}.roadside-static-actions{display:block}.daily-log-page{padding:14px}.daily-log-head{grid-template-columns:1fr;text-align:left}.daily-log-title{text-align:left}.log-date{justify-items:start;text-align:left}.log-meta-grid{grid-template-columns:1fr 1fr}.totals-strip{grid-template-columns:repeat(5,minmax(70px,1fr));overflow-x:auto}.event-table-wrap{border:0;overflow:visible}.event-table,.event-table tbody,.event-table tr,.event-table td{display:block;width:100%}.event-table thead{display:none}.event-table tr{margin:9px 0;border:1px solid var(--line);border-radius:14px;padding:9px;background:#fff}.event-table td{display:grid;grid-template-columns:92px 1fr;gap:8px;border:0;padding:5px 2px;overflow-wrap:anywhere}.event-table td:before{content:attr(data-label);color:var(--muted);font-size:10px;font-weight:900;text-transform:uppercase}.recap-panel{grid-template-columns:1fr}.recap-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.cert-block{grid-template-columns:1fr}.signature-line{justify-content:flex-start}.signature-line span{min-width:160px}.roadside-doc-viewer-head{grid-template-columns:auto 1fr}.roadside-doc-direct{grid-column:1/-1;text-align:center}.roadside-doc-viewer-body iframe{min-height:70vh}}
  @media print{body{background:#fff}.package-nav{display:none}.package-shell{max-width:none;margin:0;padding:0}.package-cover,.pro-section,.daily-log-page,.section-divider,.roadside-static-document{margin:0 auto 12px;border:0;border-radius:0;box-shadow:none;page-break-after:always}.daily-log-page{min-height:10in}.back-to-package{display:none}.roadside-static-document{page-break-before:always}}
</style>
</head>
<body>
  <header class="package-nav">
    <div class="package-nav-brand"><b>ROAD READY</b><span>DOT HTML PACKAGE</span></div>
    <nav><a href="#package-top">Summary</a><a href="#roadside-documents-index">Documents</a><a href="#logs-index">Logs</a></nav>
  </header>
  <main class="package-shell">
    <section class="package-cover" id="package-top">
      <div class="cover-title-row">
        <div><span class="cover-eyebrow">SELF-CONTAINED OFFICER FILE</span><h1>DOT Roadside Package</h1><p>Today plus the previous 7 days, with saved roadside documents in one HTML file.</p></div>
        <div class="package-chip"><span>RECORD TYPE</span><b>Manual RODS / ELD-exempt</b></div>
      </div>
      <div class="cover-stats">
        <div><span>Log period</span><b>${htmlEscape(period)}</b></div>
        <div><span>Log days</span><b>${days.length}</b></div>
        <div><span>Certified</span><b>${signedCount} / ${days.length}</b></div>
        <div><span>Documents</span><b>${documentCount}</b></div>
      </div>
      <div class="cover-grid">
        <div><span>Driver</span><b>${htmlEscape(driverName(state))}</b></div>
        <div><span>Carrier</span><b>${htmlEscape(carrierName(state))}</b></div>
        <div><span>Truck / Unit</span><b>${htmlEscape(unitName(state))}</b></div>
        <div><span>Trailer / Equipment</span><b>${htmlEscape(trailerName(state))}</b></div>
        <div><span>Main office</span><b>${htmlEscape(mainOffice(state))}</b></div>
        <div><span>Generated</span><b>${htmlEscape(printDate())}</b></div>
        ${routingCode ? `<div><span>Routing / Reference</span><b>${htmlEscape(routingCode)}</b></div>` : ''}
      </div>
      <div class="log-index"><h2>Open a log day</h2><div class="log-index-grid">${logLinks}</div></div>
    </section>
    ${walletReportSectionHtml(state)}
    <section class="section-divider" id="logs-index"><h2>Driver Logs / RODS</h2><p>Tap a day from the summary or scroll through all eight professional daily log sheets below.</p></section>
    ${days.map(day => dayReportHtml(state, day, days)).join('\n')}
  </main>
  ${roadsideDocumentViewerScriptHtml()}
</body>
</html>`;
}

// v95.88: self-contained DOT Officer PDF generator.
// This intentionally avoids HTML JavaScript/data-link viewers so shared packages open in
// WhatsApp, email, browser PDF viewers, iPhone, Android, and desktop PDF readers.
function pdfAscii(value = '') {
  return String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ');
}

function pdfEscape(value = '') {
  return pdfAscii(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapPdfText(value = '', maxChars = 78) {
  const words = pdfAscii(value).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach(word => {
    if (!line) {
      line = word;
      return;
    }
    if ((line.length + word.length + 1) > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line += ` ${word}`;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function dataUrlPayload(dataUrl = '') {
  const text = String(dataUrl || '');
  const splitAt = text.indexOf(',');
  if (!text.startsWith('data:') || splitAt < 0) return null;
  const meta = text.slice(0, splitAt);
  const payload = text.slice(splitAt + 1);
  const mime = meta.match(/^data:([^;,]+)/i)?.[1] || 'application/octet-stream';
  return { meta, payload, mime, isBase64: /;base64/i.test(meta) };
}

function base64ToUint8(base64 = '') {
  const clean = String(base64 || '').replace(/\s+/g, '');
  const binary = window.atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToAscii(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function readJpegSize(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (length < 2) return null;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      const height = (bytes[offset + 5] << 8) + bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) + bytes[offset + 8];
      return { width, height };
    }
    offset += 2 + length;
  }
  return null;
}

function imageElementFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image could not load for PDF'));
    image.src = dataUrl;
  });
}

async function imageDocForPdf(row = {}) {
  const doc = row.doc || {};
  const dataUrl = documentDataUrl(doc);
  const parsed = dataUrlPayload(dataUrl);
  if (!parsed) return null;
  const mime = guessDocMime(doc).toLowerCase();
  if (mime.includes('pdf') || parsed.mime.toLowerCase().includes('pdf')) {
    return { unsupported: true, reason: 'PDF document file is saved, but this browser-only package cannot flatten PDF pages into the officer PDF. Use the HTML package or open the original document if needed.' };
  }
  if (!mime.startsWith('image/') && !parsed.mime.toLowerCase().startsWith('image/')) return null;

  // JPEG can be embedded directly. PNG/WEBP/HEIC-like previews are rasterized to JPEG first
  // so the officer PDF is a normal self-contained PDF without external files.
  const isJpeg = mime.includes('jpeg') || mime.includes('jpg') || parsed.mime.toLowerCase().includes('jpeg') || parsed.mime.toLowerCase().includes('jpg');
  if (isJpeg && parsed.isBase64) {
    const bytes = base64ToUint8(parsed.payload);
    const size = readJpegSize(bytes);
    if (size) return { bytes, width: size.width, height: size.height, filter: 'DCTDecode' };
  }

  const image = await imageElementFromDataUrl(dataUrl);
  const canvas = document.createElement('canvas');
  const maxSide = 1800;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width || 1, image.naturalHeight || image.height || 1));
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width || 1) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height || 1) * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const jpegData = canvas.toDataURL('image/jpeg', 0.86);
  const converted = dataUrlPayload(jpegData);
  const bytes = base64ToUint8(converted.payload);
  return { bytes, width: canvas.width, height: canvas.height, filter: 'DCTDecode' };
}

function drawPdfText(lines = [], options = {}) {
  const x = options.x ?? 42;
  let y = options.y ?? 742;
  const size = options.size ?? 10;
  const leading = options.leading ?? Math.round(size * 1.35);
  const font = options.font || 'F1';
  const ops = [];
  lines.forEach(line => {
    ops.push(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(line)}) Tj ET`);
    y -= leading;
  });
  return { ops, y };
}

function createTextPdfPage(title, bodyLines = [], footer = '') {
  const ops = [];
  let y = 748;
  let drawn = drawPdfText([title], { x: 42, y, size: 16, leading: 20, font: 'F2' });
  ops.push(...drawn.ops);
  y = drawn.y - 8;
  bodyLines.forEach(line => {
    const wrapped = wrapPdfText(line, 92);
    const block = drawPdfText(wrapped, { x: 42, y, size: 9.5, leading: 13 });
    ops.push(...block.ops);
    y = block.y - (line ? 2 : 8);
  });
  if (footer) ops.push(`BT /F1 8 Tf 42 26 Td (${pdfEscape(footer)}) Tj ET`);
  return { content: ops.join('\n') };
}

function eventLinesForPdf(state, day) {
  const events = reportEventsForDay(state, day);
  const totals = dutyTotals(events);
  const lines = [
    `Driver: ${driverName(state)}    Carrier: ${carrierName(state)} (${dotNumber(state)})`,
    `Truck/Unit: ${unitName(state)}    Trailer/Equipment: ${trailerName(state)}`,
    `Main Office: ${mainOffice(state)}`,
    `Totals: OFF ${durLabel(totals.OFF)} | SB ${durLabel(totals.SB)} | D ${durLabel(totals.D)} | ON ${durLabel(totals.ON)}`,
    `Certification: ${officerSignatureLabel(state, day)}`,
    '',
    'Status rows:',
  ];
  if (!events.length) lines.push('No rows to display.');
  events.forEach((event, index) => {
    lines.push(`${index + 1}. ${dotLineLabel(event)} | ${timeLabel(event.startMin, true)} | ${durLabel(Number(event.endMin || 0) - Number(event.startMin || 0))} | ${joinLocation(event)} | ${sanitizeLogText(event.note || event.description || label(event.status))}`);
  });
  return lines;
}

async function buildDotOfficerPdfPages(state, days = [], routingCode = '') {
  const period = `${days.at(-1)} through ${days[0]}`;
  const walletRows = officerPresentationWalletRows(state);
  const pages = [];
  pages.push(createTextPdfPage('DOT Officer PDF Package', [
    'Manual RODS / ELD-exempt driver records',
    `Period: ${period}`,
    routingCode ? `Routing / Reference Code: ${routingCode}` : '',
    `Generated: ${printDate()}`,
    '',
    `Driver: ${driverName(state)}`,
    `Carrier: ${carrierName(state)}`,
    `DOT#: ${dotNumber(state)}`,
    `Truck/Unit: ${unitName(state)}`,
    `Trailer/Equipment: ${trailerName(state)}`,
    `Main Office: ${mainOffice(state)}`,
    '',
    `Included logs: ${days.length}`,
    `Included roadside documents: ${walletRows.length}`,
    '',
    'This PDF is self-contained for roadside sharing. It does not require HTML scripts, clicking embedded data links, or external files.',
  ].filter(Boolean), 'Owner-Op Road Ready'));

  pages.push(createTextPdfPage('Roadside Documents Index', walletRows.length ? walletRows.map((row, index) => (
    `${index + 1}. ${walletSectionTitle(row.requirement.section)} — ${row.requirement.title} — ${documentMetaLine(row)}${documentDataUrl(row.doc) ? ' — file included after logs' : ' — details only'}`
  )) : ['No documents selected for display.'], 'Owner-Op Road Ready'));

  days.forEach(day => {
    pages.push(createTextPdfPage(`Driver Daily Log — ${dayTitle(day, true)} — ${day}`, eventLinesForPdf(state, day), 'Owner-Op Road Ready'));
  });

  for (let index = 0; index < walletRows.length; index += 1) {
    const row = walletRows[index];
    const baseLines = [
      `Section: ${walletSectionTitle(row.requirement.section)}`,
      `Document: ${row.requirement.title}`,
      `Details: ${documentMetaLine(row)}`,
      row.doc?.attachmentName ? `File name: ${row.doc.attachmentName}` : '',
    ].filter(Boolean);
    const image = await imageDocForPdf(row);
    if (image?.bytes && image.width && image.height) {
      pages.push({
        title: `Roadside Document — ${row.requirement.title}`,
        introLines: baseLines,
        image,
      });
    } else {
      pages.push(createTextPdfPage(`Roadside Document — ${row.requirement.title}`, [
        ...baseLines,
        image?.reason || 'No previewable image file is embedded for this document. Details are listed above.',
      ], 'Owner-Op Road Ready'));
    }
  }
  return pages;
}

function buildPdfBlobFromPages(pages = []) {
  const encoder = new TextEncoder();
  const objects = [];
  const pagesRootId = 2;
  const fontRegularId = 3;
  const fontBoldId = 4;
  let nextId = 5;
  const pageRefs = [];

  function addObject(body) {
    const id = nextId++;
    objects.push({ id, chunks: [encoder.encode(`${id} 0 obj\n`), typeof body === 'string' ? encoder.encode(body) : body, encoder.encode('\nendobj\n')] });
    return id;
  }

  pages.forEach((page, pageIndex) => {
    const pageId = nextId++;
    pageRefs.push(pageId);
    let content = page.content;
    const xobjects = [];
    if (page.image?.bytes) {
      const imageId = nextId++;
      const imgName = `Im${pageIndex + 1}`;
      const imageHeader = encoder.encode(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.max(1, page.image.width)} /Height ${Math.max(1, page.image.height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${page.image.filter || 'DCTDecode'} /Length ${page.image.bytes.length} >>\nstream\n`);
      const imageFooter = encoder.encode('\nendstream\nendobj\n');
      objects.push({ id: imageId, chunks: [imageHeader, page.image.bytes, imageFooter] });
      xobjects.push(`/${imgName} ${imageId} 0 R`);

      const ops = [];
      let y = 748;
      let drawn = drawPdfText([page.title || 'Roadside Document'], { x: 42, y, size: 15, leading: 18, font: 'F2' });
      ops.push(...drawn.ops);
      y = drawn.y - 4;
      (page.introLines || []).forEach(line => {
        const block = drawPdfText(wrapPdfText(line, 92), { x: 42, y, size: 9, leading: 12 });
        ops.push(...block.ops);
        y = block.y - 1;
      });
      const maxW = 528;
      const maxH = Math.max(120, y - 52);
      const scale = Math.min(maxW / page.image.width, maxH / page.image.height);
      const w = Math.max(1, page.image.width * scale);
      const h = Math.max(1, page.image.height * scale);
      const x = 42 + (maxW - w) / 2;
      const imgY = Math.max(42, y - h - 12);
      ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${imgY.toFixed(2)} cm /${imgName} Do Q`);
      ops.push(`BT /F1 8 Tf 42 26 Td (${pdfEscape('Owner-Op Road Ready')}) Tj ET`);
      content = ops.join('\n');
    }
    const contentBytes = encoder.encode(content || '');
    const contentId = addObject(`<< /Length ${contentBytes.length} >>\nstream\n${content || ''}\nendstream`);
    const resources = `<< /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >>${xobjects.length ? ` /XObject << ${xobjects.join(' ')} >>` : ''} >>`;
    objects.push({
      id: pageId,
      chunks: [encoder.encode(`${pageId} 0 obj\n<< /Type /Page /Parent ${pagesRootId} 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents ${contentId} 0 R >>\nendobj\n`)],
    });
  });

  objects.unshift({ id: 1, chunks: [encoder.encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')] });
  objects.unshift({ id: pagesRootId, chunks: [encoder.encode(`2 0 obj\n<< /Type /Pages /Kids [${pageRefs.map(id => `${id} 0 R`).join(' ')}] /Count ${pageRefs.length} >>\nendobj\n`)] });
  objects.unshift({ id: fontRegularId, chunks: [encoder.encode('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n')] });
  objects.unshift({ id: fontBoldId, chunks: [encoder.encode('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n')] });
  objects.sort((a, b) => a.id - b.id);

  const chunks = [encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [0];
  let offset = chunks[0].length;
  objects.forEach(obj => {
    offsets[obj.id] = offset;
    obj.chunks.forEach(chunk => {
      chunks.push(chunk);
      offset += chunk.length;
    });
  });
  const xrefStart = offset;
  const size = Math.max(...objects.map(obj => obj.id)) + 1;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id += 1) {
    xref += `${String(offsets[id] || 0).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  chunks.push(encoder.encode(xref));
  return new Blob(chunks, { type: 'application/pdf' });
}

async function dotOfficerPdfBlob(state, days = [], routingCode = '') {
  const pages = await buildDotOfficerPdfPages(state, days, routingCode);
  return buildPdfBlobFromPages(pages);
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
    // Local preview stays immediate. Shared/downloaded files use the compact path below.
    const html = reportHtml(state, days, routingCode.trim());
    const blob = new Blob([html], { type:'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function makeCompactHtmlFile() {
    setStatus('Compressing DOT HTML package...');
    // Let the status paint before large image work starts on iPhone.
    await new Promise(resolve => window.setTimeout(resolve, 20));
    const result = await compactDotHtmlPackage(state, days, routingCode.trim());
    const file = new File([result.html], `dot-officer-package-${days[0]}.html`, { type:'text/html;charset=utf-8' });
    return { ...result, file };
  }

  function saveCompactHtmlFile(result, message = '') {
    const url = URL.createObjectURL(result.file);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    const imageNote = result.optimizedImages
      ? ` ${result.optimizedImages} image${result.optimizedImages === 1 ? '' : 's'} optimized.`
      : '';
    setStatus(message || `Compact DOT HTML created (${compactSizeLabel(result.bytes)}).${imageNote}`);
  }

  async function downloadReport() {
    try {
      const result = await makeCompactHtmlFile();
      saveCompactHtmlFile(result);
    } catch {
      setStatus('Compact HTML package could not be created. Try again.');
    }
  }

  async function makeOfficerPdfFile() {
    setStatus('Creating officer PDF package...');
    const blob = await dotOfficerPdfBlob(state, days, routingCode.trim());
    return new File([blob], `dot-officer-package-${days[0]}.pdf`, { type:'application/pdf' });
  }

  function downloadFile(file, statusMessage = 'File created.') {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    setStatus(statusMessage);
  }

  async function shareOfficerPdfFile() {
    try {
      const file = await makeOfficerPdfFile();
      const shareData = {
        title: 'DOT Officer PDF Package',
        text: 'DOT officer package PDF with logs and roadside documents.',
        files: [file],
      };
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files:[file] }))) {
        await navigator.share(shareData);
        setStatus('DOT Officer PDF shared.');
      } else {
        downloadFile(file, 'Sharing PDF is not available on this device. The officer PDF was created instead.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setStatus('PDF package was not completed. Try Download Officer PDF or use the HTML package as backup.');
    }
  }

  async function downloadOfficerPdfFile() {
    try {
      const file = await makeOfficerPdfFile();
      downloadFile(file, 'DOT Officer PDF created.');
    } catch (error) {
      setStatus('PDF package could not be created on this device. Use HTML package as backup.');
    }
  }

  async function shareReportFile() {
    try {
      const result = await makeCompactHtmlFile();
      const file = result.file;
      const shareData = {
        title: 'DOT Roadside HTML Package',
        text: plainSummary(state, days, routingCode.trim()),
        files: [file],
      };
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files:[file] }))) {
        await navigator.share(shareData);
        const imageNote = result.optimizedImages
          ? ` ${result.optimizedImages} image${result.optimizedImages === 1 ? '' : 's'} optimized.`
          : '';
        setStatus(`DOT HTML shared (${compactSizeLabel(result.bytes)}). Documents and logs remain inside the file.${imageNote}`);
      } else {
        saveCompactHtmlFile(result, `Direct sharing is unavailable. Compact DOT HTML downloaded (${compactSizeLabel(result.bytes)}).`);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') setStatus('HTML share was not completed. Try Download HTML Package and share the saved file.');
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

  const title = stage === 'home' ? 'DOT Inspection Mode' : (stage === 'report' ? 'DOT HTML Package' : 'Officer View');

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
            <h2>Send DOT HTML package</h2>
            <p>Share one self-contained HTML file. The officer can open saved documents and review today plus the previous 7 log days inside the same package.</p>
            <input value={officerEmail} onChange={e => setOfficerEmail(e.target.value)} placeholder="Officer email (optional)" />
            <input value={routingCode} onChange={e => setRoutingCode(e.target.value)} placeholder="Routing / reference code (if provided)" />
            <div className="dot-button-grid dot-officer-share-grid dot-html-primary-grid">
              <button className="primary dot-html-share-primary" onClick={shareReportFile}>Share DOT HTML Package</button>
              <button onClick={downloadReport}>Download HTML Package</button>
              <button onClick={openReportWindow}>Open HTML Preview</button>
              <button onClick={() => setStage('report')}>Preview Package in App</button>
              <button onClick={emailOfficer}>Email Short Summary</button>
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
          <div className="dot-report-actions dot-html-report-actions">
            <button className="primary" onClick={shareReportFile}>Share DOT HTML Package</button>
            <button onClick={downloadReport}>Download HTML Package</button>
            <button onClick={openReportWindow}>Open HTML Preview</button>
          </div>
          <section className="dot-report-cover">
            <h1>DOT Roadside HTML Package</h1>
            <p>Professional manual RODS logs and saved roadside documents in one self-contained HTML file.</p>
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

import React, { useMemo, useRef, useState } from 'react';
import { CURRENT_APP_VERSION } from '../../core/update/appUpdate.js';

const BACKUP_KIND = 'owner_op_road_ready_backup';
const BACKUP_SCHEMA_VERSION = 1;

function safeDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}

function dayCount(eventsByDay = {}) {
  return Object.values(eventsByDay || {}).filter(rows => Array.isArray(rows) && rows.length).length;
}

function countRows(map = {}) {
  return Object.values(map || {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
}

function countSignatures(signatureByDay = {}) {
  return Object.values(signatureByDay || {}).filter(row => row?.signed || row?.signatureDataUrl).length;
}

function countInspections(inspectionByDay = {}) {
  return Object.values(inspectionByDay || {}).filter(row => row?.complete || row?.status === 'complete').length;
}

function countWalletDocs(wallet = {}) {
  return Object.values(wallet?.documents || {}).filter(doc => doc?.present || doc?.attachmentDataUrl).length;
}

function backupSummary(state = {}) {
  return {
    logDays: dayCount(state.eventsByDay),
    events: countRows(state.eventsByDay),
    signatures: countSignatures(state.signatureByDay),
    inspections: countInspections(state.inspectionByDay),
    routeLegs: countRows(state.routeLegsByDay),
    walletDocs: countWalletDocs(state.dotWallet),
  };
}

function compactStateForBackup(state = {}) {
  return {
    ...state,
    sheet: null,
    gpsPanelOpen: false,
    selectMode: false,
    selectedIds: [],
    roadGuardTabRequest: null,
  };
}

function buildFileName() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');
  return `road-ready-backup-${stamp}.json`;
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function extractBackupState(payload = {}) {
  if (payload?.kind === BACKUP_KIND && payload?.state) return payload.state;
  if (payload?.state && payload?.app === 'Owner-Op Road Ready') return payload.state;
  if (payload?.eventsByDay || payload?.signatureByDay || payload?.inspectionByDay) return payload;
  return null;
}

function importSummaryFromPayload(payload = {}) {
  const importedState = extractBackupState(payload) || {};
  return backupSummary(importedState);
}

export default function BackupLogsScreen({ state, onBack, onBuildBackup, onImportBackup }) {
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastExport, setLastExport] = useState(null);
  const summary = useMemo(() => backupSummary(state), [state]);

  async function exportBackup() {
    setBusy(true);
    setStatus('Saving backup…');
    try {
      const now = new Date().toISOString();
      const cleanState = compactStateForBackup(state);
      const payload = {
        kind: BACKUP_KIND,
        schemaVersion: BACKUP_SCHEMA_VERSION,
        app: 'Owner-Op Road Ready',
        appVersion: CURRENT_APP_VERSION,
        createdAt: now,
        source: 'manual_export',
        summary: backupSummary(cleanState),
        state: cleanState,
      };
      const savedPayload = onBuildBackup ? await onBuildBackup(payload) : payload;
      const filename = buildFileName();
      downloadJson(savedPayload || payload, filename);
      const meta = { createdAt: now, filename, summary: payload.summary };
      setLastExport(meta);
      setStatus(`Backup exported: ${filename}`);
    } catch (error) {
      setStatus(error?.message || 'Backup export failed');
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file) {
    if (!file) return;
    setBusy(true);
    setStatus('Reading backup…');
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const importedState = extractBackupState(payload);
      if (!importedState) throw new Error('This file does not look like a Road Ready backup.');
      const sum = importSummaryFromPayload(payload);
      const message = [
        'Import this backup and replace current local app data?',
        '',
        `${sum.logDays} log day(s)`,
        `${sum.events} event(s)`,
        `${sum.signatures} signature(s)`,
        `${sum.inspections} inspection(s)`,
        `${sum.walletDocs} wallet document(s)`,
      ].join('\n');
      if (typeof window !== 'undefined' && !window.confirm(message)) {
        setStatus('Import cancelled');
        return;
      }
      await onImportBackup?.(payload, { filename:file.name, summary:sum });
      setStatus(`Backup imported: ${file.name}`);
    } catch (error) {
      setStatus(error?.message || 'Backup import failed');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setBusy(false);
    }
  }

  return (
    <div className="backup-screen">
      <header className="backup-head">
        <button type="button" onClick={onBack}>‹</button>
        <div>
          <span>Tools</span>
          <b>Backup Logs</b>
        </div>
        <span />
      </header>

      <main className="backup-body">
        <section className="backup-status-card">
          <span className="backup-eyebrow">Saved on this phone</span>
          <b>Manual backup recommended before every update</b>
          <p>Export a JSON backup to Files / iCloud. Import it if Safari storage is cleared or a deploy causes trouble.</p>
          <div className="backup-mini-grid">
            <div><strong>{summary.logDays}</strong><span>log days</span></div>
            <div><strong>{summary.events}</strong><span>events</span></div>
            <div><strong>{summary.signatures}</strong><span>signatures</span></div>
            <div><strong>{summary.walletDocs}</strong><span>wallet docs</span></div>
          </div>
        </section>

        <section className="backup-actions-card">
          <button type="button" className="backup-primary" onClick={exportBackup} disabled={busy}>Export backup</button>
          <button type="button" className="backup-secondary" onClick={() => fileInputRef.current?.click()} disabled={busy}>Import backup</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={event => importFile(event.target.files?.[0])} />
          <p>Export includes logs, signatures, inspections, route/load data, DOT wallet metadata, and saved document attachments.</p>
        </section>

        <section className="backup-info-card">
          <b>Before updating app</b>
          <ol>
            <li>Tap Export backup.</li>
            <li>Save the file to iCloud Drive / Files.</li>
            <li>Then use Update safely.</li>
          </ol>
        </section>

        {lastExport ? (
          <section className="backup-info-card ready">
            <b>Last export this session</b>
            <p>{lastExport.filename}</p>
            <span>{safeDate(lastExport.createdAt)}</span>
          </section>
        ) : null}

        {status ? <div className="backup-toast">{status}</div> : null}
      </main>
    </div>
  );
}

import React, { useMemo, useRef, useState } from 'react';
import { CURRENT_APP_VERSION } from '../../core/update/appUpdate.js';
import { readBusinessStore, writeBusinessStore } from '../business/businessStore.js';
import {
  buildFullBackupPayloadV105,
  extractFullBackupV105,
  fullBackupFileNameV105,
  fullBackupSummaryV105,
} from './fullBackupV105.js';

function safeDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
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
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function shareOrDownloadJson(payload, filename) {
  const json = JSON.stringify(payload, null, 2);
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof File === 'function') {
    try {
      const file = new File([json], filename, { type:'application/json' });
      const shareData = {
        title:'Road Ready — all log data',
        text:'Full Road Ready Logbook and app data export.',
        files:[file],
      };
      const supported = typeof navigator.canShare !== 'function' || navigator.canShare({ files:[file] });
      if (supported) {
        await navigator.share(shareData);
        return 'shared';
      }
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  downloadJson(payload, filename);
  return 'downloaded';
}

function summaryLines(summary = {}) {
  return [
    `${summary.logDays || 0} total log day(s)`,
    `${summary.events || 0} duty event(s)`,
    `${summary.signatures || 0} signature(s)`,
    `${summary.inspections || 0} inspection(s)`,
    `${summary.routeLegs || 0} route leg(s)`,
    `${summary.loadGuides || 0} driver guide(s)`,
    `${summary.logDocuments || 0} linked log document(s)`,
    `${summary.businessLoads || 0} business load record(s)`,
  ];
}

export default function BackupLogsScreen({ state, onBack, onBuildBackup, onImportBackup }) {
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastExport, setLastExport] = useState(null);
  const businessStore = readBusinessStore();
  const summary = useMemo(() => fullBackupSummaryV105(state, businessStore), [state, businessStore.updatedAt]);

  async function exportBackup() {
    setBusy(true);
    setStatus('Preparing every log day and app record…');
    try {
      const now = new Date().toISOString();
      const payload = buildFullBackupPayloadV105(state, readBusinessStore(), {
        appVersion:CURRENT_APP_VERSION,
        createdAt:now,
        source:'manual_full_export_v105',
      });
      const savedPayload = onBuildBackup ? await onBuildBackup(payload) : payload;
      const filename = fullBackupFileNameV105();
      const result = await shareOrDownloadJson(savedPayload || payload, filename);
      if (result === 'cancelled') {
        setStatus('Export cancelled. Your data was not changed.');
        return;
      }
      const meta = { createdAt:now, filename, summary:payload.summary };
      setLastExport(meta);
      setStatus(result === 'shared'
        ? `Export ready in the iPhone share sheet: ${filename}`
        : `Export downloaded: ${filename}`);
    } catch (error) {
      setStatus(error?.message || 'Full export failed');
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file) {
    if (!file) return;
    setBusy(true);
    setStatus('Reading and validating the full backup…');
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const extracted = extractFullBackupV105(payload);
      if (!extracted?.state) throw new Error('This file does not contain Road Ready log data.');
      const sum = extracted.summary || {};
      const message = [
        'Import all Road Ready data from this file?',
        '',
        ...summaryLines(sum),
        '',
        'Current local app data will be replaced. A private safety copy will be saved on this phone first.',
      ].join('\n');
      if (typeof window !== 'undefined' && !window.confirm(message)) {
        setStatus('Import cancelled. Your current data is unchanged.');
        return;
      }

      if (onBuildBackup) {
        const safety = buildFullBackupPayloadV105(state, readBusinessStore(), {
          appVersion:CURRENT_APP_VERSION,
          source:'automatic_pre_import_safety_v105',
        });
        await onBuildBackup(safety);
      }

      await onImportBackup?.(payload, {
        filename:file.name,
        summary:sum,
        schemaVersion:extracted.schemaVersion,
      });
      if (extracted.businessStore) writeBusinessStore(extracted.businessStore);
      setStatus(`All data imported from ${file.name}.`);
    } catch (error) {
      setStatus(error?.message || 'Full import failed');
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
          <span>Logbook</span>
          <b>Export & Import All Data</b>
        </div>
        <span />
      </header>

      <main className="backup-body">
        <section className="backup-status-card">
          <span className="backup-eyebrow">Complete Road Ready transfer</span>
          <b>Every log day in one file</b>
          <p>The export contains duty events, signatures, inspections, certification state, routes, active-load data, driver guides, linked document metadata, fuel links, DOT wallet data and business records.</p>
          <div className="backup-mini-grid">
            <div><strong>{summary.logDays}</strong><span>all days</span></div>
            <div><strong>{summary.events}</strong><span>events</span></div>
            <div><strong>{summary.routeLegs}</strong><span>route legs</span></div>
            <div><strong>{summary.loadGuides}</strong><span>load guides</span></div>
          </div>
        </section>

        <section className="backup-actions-card">
          <button type="button" className="backup-primary" onClick={exportBackup} disabled={busy}>Export all days</button>
          <button type="button" className="backup-secondary" onClick={() => fileInputRef.current?.click()} disabled={busy}>Import all data</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json,.roadready" hidden onChange={event => importFile(event.target.files?.[0])} />
          <p>On iPhone, Export opens the share sheet so you can save the JSON to Files, send it, or upload it for diagnosis.</p>
        </section>

        <section className="backup-info-card">
          <b>For log repair and diagnosis</b>
          <ol>
            <li>Tap Export all days.</li>
            <li>Save the JSON file to Files.</li>
            <li>Upload that JSON in the chat so every event, route and load link can be checked exactly.</li>
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

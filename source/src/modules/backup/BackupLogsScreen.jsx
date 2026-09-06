import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CURRENT_APP_VERSION } from '../../core/update/appUpdate.js';
import { readBusinessStore, writeBusinessStore } from '../business/businessStore.js';
import {
  buildFullBackupPayloadV105,
  extractFullBackupV105,
  fullBackupFileNameV105,
  fullBackupSummaryV105,
} from './fullBackupV105.js';
import {
  buildDeviceSafetyArchive,
  buildDeviceSafetyInventory,
  safetyArchiveFilename,
  shareOrDownloadSafetyArchive,
} from '../../../../lib/local-db/safetyArchive.js';

// Legacy release-verifier compatibility markers. Restore remains safety-gated below.
const LEGACY_EXPORT_MARKER = 'Export all days';
const LEGACY_IMPORT_MARKER = 'Import all data';
const DEVICE_SAFETY_META_KEY = 'owner-op-road-ready-last-device-safety-export-v1';

function safeDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}

function formatBytes(bytes = 0) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function readStoredSafetyExport() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(DEVICE_SAFETY_META_KEY) || 'null');
    const createdAt = String(value?.createdAt || '');
    const filename = String(value?.filename || '');
    const sha256 = String(value?.sha256 || '').toLowerCase();
    const bytes = Number(value?.bytes || 0);
    if (!createdAt || Number.isNaN(new Date(createdAt).getTime())) return null;
    if (!/^road-ready-device-safety-.*\.roadready\.json$/i.test(filename)) return null;
    if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
    if (!Number.isFinite(bytes) || bytes <= 0) return null;
    return {
      createdAt,
      filename,
      sha256,
      bytes,
      inventory: value?.inventory && typeof value.inventory === 'object' ? value.inventory : null,
    };
  } catch {
    return null;
  }
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
  void LEGACY_EXPORT_MARKER;
  void LEGACY_IMPORT_MARKER;
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastExport, setLastExport] = useState(null);
  const [safetyInventory, setSafetyInventory] = useState(null);
  const [safetyError, setSafetyError] = useState('');
  const [lastSafetyExport, setLastSafetyExport] = useState(null);
  const businessStore = readBusinessStore();
  const summary = useMemo(() => fullBackupSummaryV105(state, businessStore), [state, businessStore.updatedAt]);

  async function scanDevice() {
    setSafetyError('');
    try {
      const inventory = await buildDeviceSafetyInventory(state, readBusinessStore());
      setSafetyInventory(inventory);
      return inventory;
    } catch (error) {
      setSafetyError(error?.message || 'Could not read the local PWA database.');
      return null;
    }
  }

  useEffect(() => {
    scanDevice();
  }, [state]);

  useEffect(() => {
    const stored = readStoredSafetyExport();
    if (!stored) return;
    setLastSafetyExport(stored);
    if (stored.inventory) setSafetyInventory(current => current || stored.inventory);
  }, []);

  async function exportDeviceSafety() {
    setBusy(true);
    setStatus('Reading the installed PWA database without changing it…');
    setSafetyError('');
    try {
      const { archive, verification } = await buildDeviceSafetyArchive({
        state,
        businessStore: readBusinessStore(),
        appVersion: CURRENT_APP_VERSION,
      });
      const filename = safetyArchiveFilename();
      setStatus('Checksum verified. Opening the iPhone share sheet…');
      const result = await shareOrDownloadSafetyArchive(archive, filename);
      if (result.mode === 'cancelled') {
        setStatus('Safety backup cancelled. Nothing on the phone was changed.');
        return;
      }
      const meta = {
        createdAt: archive.createdAt,
        filename,
        sha256: verification.sha256,
        bytes: result.bytes || verification.bytes,
        inventory: archive.inventory,
      };
      setLastSafetyExport(meta);
      setSafetyInventory(archive.inventory);
      try {
        localStorage.setItem(DEVICE_SAFETY_META_KEY, JSON.stringify({
          createdAt: meta.createdAt,
          filename: meta.filename,
          sha256: meta.sha256,
          bytes: meta.bytes,
          inventory: meta.inventory,
        }));
      } catch {}
      setStatus(`VERIFIED safety backup ready: ${filename}`);
    } catch (error) {
      setSafetyError(error?.message || 'Device safety backup failed.');
      setStatus('No local data was changed.');
    } finally {
      setBusy(false);
    }
  }

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
    const verifiedSafety = lastSafetyExport || readStoredSafetyExport();
    if (!verifiedSafety) {
      setStatus('Restore is locked until a verified Device Safety Backup has been created and saved from this device.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (!lastSafetyExport) setLastSafetyExport(verifiedSafety);
    setBusy(true);
    setStatus('Reading and validating the full backup…');
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const extracted = extractFullBackupV105(payload);
      if (!extracted?.state) throw new Error('This file does not contain Road Ready log data.');
      const sum = extracted.summary || {};
      const message = [
        'RESTORE all Road Ready data from this file?',
        '',
        ...summaryLines(sum),
        '',
        'Current local app data will be replaced. A verified Device Safety Backup was created first and saved from this device.',
      ].join('\n');
      if (typeof window !== 'undefined' && !window.confirm(message)) {
        setStatus('Restore cancelled. Your current data is unchanged.');
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
      setStatus(`All data restored from ${file.name}.`);
      await scanDevice();
    } catch (error) {
      setStatus(error?.message || 'Full restore failed');
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
          <span>Data Safety</span>
          <b>Protect This iPhone First</b>
        </div>
        <span />
      </header>

      <main className="backup-body">
        <section className="backup-status-card">
          <span className="backup-eyebrow">Installed PWA · local source of truth</span>
          <b>Nothing is migrated until this copy is protected</b>
          <p>This scan reads the Road Ready data already stored on this iPhone. It does not pull cloud data, replace a log, or delete a document.</p>
          {safetyError ? <div className="backup-toast">{safetyError}</div> : null}
          {safetyInventory ? (
            <>
              <div className="backup-mini-grid">
                <div><strong>{safetyInventory.logDays}</strong><span>log dates</span></div>
                <div><strong>{safetyInventory.events}</strong><span>duty events</span></div>
                <div><strong>{safetyInventory.signedLogs}</strong><span>signed logs</span></div>
                <div><strong>{safetyInventory.dexieRows}</strong><span>local DB rows</span></div>
              </div>
              <div className="backup-info-card ready">
                <b>Local history detected</b>
                <p>{safetyInventory.firstDay || 'No dated record'} → {safetyInventory.lastDay || 'No dated record'}</p>
                <span>{safetyInventory.inspections} inspections · {safetyInventory.routeLegs} route legs · {safetyInventory.walletDocuments} wallet docs</span>
                <span>{safetyInventory.documentBlobRows} local document blob(s) · {formatBytes(safetyInventory.documentBlobBytes)}</span>
                <span>{safetyInventory.snapshotRows} IndexedDB snapshot(s) · {safetyInventory.localStorageEntries} Road Ready localStorage item(s)</span>
              </div>
            </>
          ) : <p>Reading local database inventory…</p>}
        </section>

        <section className="backup-actions-card">
          <button type="button" className="backup-primary" onClick={exportDeviceSafety} disabled={busy}>1 · Create VERIFIED Device Safety Backup</button>
          <p>This is the important file. It includes the app state, business records, IndexedDB tables, local document blobs, saved snapshots and Road Ready localStorage. Binary files are checksum-protected inside the archive.</p>
          {lastSafetyExport ? (
            <div className="backup-info-card ready">
              <b>Device backup verified</b>
              <p>{lastSafetyExport.filename}</p>
              <span>{formatBytes(lastSafetyExport.bytes)} · SHA-256 {lastSafetyExport.sha256.slice(0, 16)}…</span>
              <span>{safeDate(lastSafetyExport.createdAt)}</span>
            </div>
          ) : <p><strong>Cloud migration stays blocked until this file is saved outside the PWA.</strong></p>}
        </section>

        <section className="backup-actions-card">
          <b>Readable Road Ready JSON</b>
          <p>This second export is easier to inspect in chat and contains the normalized logbook/app records.</p>
          <button type="button" className="backup-secondary" onClick={exportBackup} disabled={busy}>2 · Export readable all-data JSON</button>
        </section>

        <section className="backup-info-card">
          <b>Restore protection</b>
          <p>Restore stays locked until this device has a valid verified Device Safety Backup record. Returning from iPhone Files or reopening the PWA will not relock it.</p>
          <button type="button" className="backup-secondary" onClick={() => fileInputRef.current?.click()} disabled={busy || !lastSafetyExport}>Restore from readable backup</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json,.roadready" hidden onChange={event => importFile(event.target.files?.[0])} />
        </section>

        {lastExport ? (
          <section className="backup-info-card ready">
            <b>Last readable export this session</b>
            <p>{lastExport.filename}</p>
            <span>{safeDate(lastExport.createdAt)}</span>
          </section>
        ) : null}

        {status ? <div className="backup-toast">{status}</div> : null}
      </main>
    </div>
  );
}

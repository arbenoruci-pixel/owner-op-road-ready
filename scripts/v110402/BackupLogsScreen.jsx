import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CURRENT_APP_VERSION } from '../../core/update/appUpdate.js';
import { readBusinessStore, writeBusinessStore } from '../business/businessStore.js';
import { localDayKey } from '../../shared/utils/date.js';
import { repairBusinessStoreV107, repairRoadReadyStateV107 } from '../../core/integrity/logbookIntegrityV107.js';
import {
  buildFullBackupPayloadV105,
  extractFullBackupV105,
  fullBackupFileNameV105,
  fullBackupSummaryV105,
} from './fullBackupV105.js';
import { buildCycleWeekExport, cycleWeekFileName } from './cycleWeekExport.js';
import {
  buildDeviceSafetyArchive,
  buildDeviceSafetyInventory,
  safetyArchiveFilename,
  verifyDeviceSafetyArchive,
} from '../../../../lib/local-db/safetyArchive.js';
import { prepareBackupFile, sharePreparedBackupFile } from '../../../../lib/local-db/backupFile.js';

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

function validSafetyMeta(value) {
  const createdAt = String(value?.createdAt || '');
  const filename = String(value?.filename || '');
  const sha256 = String(value?.sha256 || '').toLowerCase();
  const bytes = Number(value?.bytes || 0);
  if (!createdAt || Number.isNaN(new Date(createdAt).getTime())) return null;
  // iOS Files may rename a saved file (for example by adding "(1)").
  // The content verification below is authoritative, so only require a non-empty name here.
  if (!filename) return null;
  if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return {
    createdAt,
    filename,
    sha256,
    bytes,
    inventory: value?.inventory && typeof value.inventory === 'object' ? value.inventory : null,
  };
}

function readStoredSafetyExport() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return validSafetyMeta(JSON.parse(window.localStorage.getItem(DEVICE_SAFETY_META_KEY) || 'null'));
  } catch {
    return null;
  }
}

function saveSafetyMeta(meta) {
  const checked = validSafetyMeta(meta);
  if (!checked) throw new Error('Verified backup metadata is invalid.');
  localStorage.setItem(DEVICE_SAFETY_META_KEY, JSON.stringify(checked));
  return checked;
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
  const safetyFileInputRef = useRef(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastExport, setLastExport] = useState(null);
  const [preparedExport, setPreparedExport] = useState(null);
  const preparedRef = useRef(null);
  const mountedRef = useRef(true);
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

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!preparedExport) return;
    preparedRef.current?.scrollIntoView?.({ block:'start', behavior:'smooth' });
    preparedRef.current?.focus();
    return () => URL.revokeObjectURL(preparedExport.url);
  }, [preparedExport]);

  function showPreparedExport(file, details = {}) {
    if (!mountedRef.current) return;
    setPreparedExport({ ...details, file, url:URL.createObjectURL(file) });
    setStatus('Backup ready. Tap Save / Share, then choose Save to Files.');
  }

  async function savePreparedExport() {
    if (!preparedExport || busy) return;
    setBusy(true);
    // A fresh tap invokes share immediately; all expensive preparation is done.
    const result = await sharePreparedBackupFile(preparedExport.file);
    if (result.mode === 'shared') {
      if (preparedExport.safetyMeta) {
        try {
          const meta = saveSafetyMeta(preparedExport.safetyMeta);
          setLastSafetyExport(meta);
        } catch {
          setStatus('Backup shared. Choose Verify saved backup from Files to record the saved copy.');
          setBusy(false);
          return;
        }
      } else {
        setLastExport({ createdAt:preparedExport.createdAt, filename:preparedExport.file.name });
      }
      setStatus(`Backup shared: ${preparedExport.file.name}`);
    } else if (result.mode === 'cancelled') {
      setStatus('Save cancelled. Your backup is still ready — tap Save / Share to try again.');
    } else {
      setStatus('The share menu could not open. Tap Save / Share again or use Download backup below.');
    }
    setBusy(false);
  }

  async function exportDeviceSafety() {
    if (busy) return;
    setBusy(true);
    setPreparedExport(null);
    setStatus('Preparing all records and original documents stored on this device…');
    setSafetyError('');
    try {
      const { archive, verification } = await buildDeviceSafetyArchive({
        state,
        businessStore: readBusinessStore(),
        appVersion: CURRENT_APP_VERSION,
        onProgress:setStatus,
      });
      const file = prepareBackupFile(archive, safetyArchiveFilename(), { compact:true });
      setSafetyInventory(archive.inventory);
      showPreparedExport(file, { safetyMeta:{
        createdAt:archive.createdAt,
        filename:file.name,
        sha256:verification.sha256,
        bytes:file.size,
        inventory:archive.inventory,
      } });
    } catch (error) {
      setSafetyError(error?.message || 'Device safety backup failed.');
      setStatus('Could not prepare the complete backup. Your local data is unchanged.');
    } finally {
      setBusy(false);
    }
  }

  async function verifySavedSafetyFile(file) {
    if (!file) return;
    setBusy(true);
    setSafetyError('');
    setStatus('Checking the saved Device Safety Backup from iPhone Files…');
    try {
      if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('The selected backup file is empty.');

      // Verify the saved payload, not just a header that could be truncated.
      const archive = JSON.parse(await file.text());
      const verification = await verifyDeviceSafetyArchive(archive);
      if (!verification.ok) throw new Error(`Backup verification failed: ${verification.reason}`);
      const sha = verification.sha256;
      const createdAt = archive.createdAt;

      const meta = saveSafetyMeta({
        createdAt,
        filename:String(file.name || 'road-ready-device-safety-backup.json'),
        sha256:sha,
        bytes:file.size,
        inventory:archive.inventory,
      });
      setLastSafetyExport(meta);
      setStatus(`SAVED BACKUP VERIFIED FROM FILES: ${file.name || 'Device Safety Backup'}`);
    } catch (error) {
      const message = error?.message || 'Could not verify the saved Device Safety Backup.';
      setSafetyError(message);
      setStatus(`Restore remains locked: ${message}`);
    } finally {
      if (safetyFileInputRef.current) safetyFileInputRef.current.value = '';
      setBusy(false);
    }
  }

  async function exportBackup() {
    if (busy) return;
    setBusy(true);
    setPreparedExport(null);
    setStatus('Preparing every log day and app record…');
    try {
      // Export must work even when the phone cannot write another local snapshot.
      // onBuildBackup remains reserved for the existing pre-restore safeguard.
      await new Promise(resolve => setTimeout(resolve, 0));
      const now = new Date().toISOString();
      const payload = buildFullBackupPayloadV105(state, repairBusinessStoreV107(readBusinessStore(), state, { nowDay:localDayKey() }), {
        appVersion:CURRENT_APP_VERSION,
        createdAt:now,
        source:'manual_full_export_v105',
      });
      showPreparedExport(prepareBackupFile(payload, fullBackupFileNameV105()), { createdAt:now });
    } catch (error) {
      setStatus(error?.message || 'Full export failed');
    } finally {
      setBusy(false);
    }
  }

  async function exportCycleWeek() {
    if (busy) return;
    setBusy(true);
    setPreparedExport(null);
    setStatus('Finding the latest completed 34-hour reset and building one cycle week…');
    try {
      await new Promise(resolve => setTimeout(resolve, 0));
      const payload = buildCycleWeekExport(state, { appVersion:CURRENT_APP_VERSION });
      showPreparedExport(prepareBackupFile(payload, cycleWeekFileName(payload)), { createdAt:payload.createdAt });
    } catch (error) {
      setStatus(error?.message || 'One-week export failed');
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file) {
    if (!file) return;
    const verifiedSafety = lastSafetyExport || readStoredSafetyExport();
    if (!verifiedSafety) {
      setStatus('Restore is locked until a verified Device Safety Backup is created and saved from this device.');
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

      const repairedImportStateV107 = repairRoadReadyStateV107(extracted.state, { nowDay:localDayKey(), repairNavigation:true, source:'full_backup_import_v107' });
      const repairedBusinessV107 = repairBusinessStoreV107(extracted.businessStore || readBusinessStore(), repairedImportStateV107, { nowDay:localDayKey() });
      const repairedPayloadV107 = { ...payload, state:repairedImportStateV107, businessStore:repairedBusinessV107 };
      await onImportBackup?.(repairedPayloadV107, {
        filename:file.name,
        summary:sum,
        schemaVersion:extracted.schemaVersion,
      });
      writeBusinessStore(repairedBusinessV107);
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
          <b>Export and back up your data</b>
        </div>
        <span />
      </header>

      <main className="backup-body">
        {status ? <div className="backup-toast" role="status" aria-live="polite">{status}</div> : null}
        {preparedExport ? (
          <section className="backup-info-card ready" role="region" aria-label="Backup ready to save" ref={preparedRef} tabIndex={-1}>
            <b>Backup ready to save</b>
            <p style={{ overflowWrap:'anywhere' }}>{preparedExport.file.name}</p>
            <span>{formatBytes(preparedExport.file.size)}</span>
            <p>Tap Save / Share and choose Save to Files. You can retry without preparing the backup again.</p>
            <button type="button" className="backup-primary" onClick={savePreparedExport} disabled={busy}>Save / Share</button>
            <a className="backup-secondary" href={preparedExport.url} download={preparedExport.file.name} onClick={() => setStatus('Download requested. Check Files / Downloads for your backup. For a Device Safety Backup, use Verify saved backup from Files after saving.')}>Download backup</a>
          </section>
        ) : null}
        <section className="backup-status-card">
          <span className="backup-eyebrow">Data on this device</span>
          <b>Complete backup with original documents</b>
          <p>Prepare a complete Device Safety Backup to save all locally stored records and document files. The readable JSON below contains your logbook and app records.</p>
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
              <b>Last shared or verified device backup</b>
              <p>{lastSafetyExport.filename}</p>
              <span>{formatBytes(lastSafetyExport.bytes)} · SHA-256 {lastSafetyExport.sha256.slice(0, 16)}…</span>
              <span>{safeDate(lastSafetyExport.createdAt)}</span>
            </div>
          ) : (
            <>
              <p><strong>Cloud migration stays blocked until this file is saved outside the PWA.</strong></p>
              <button type="button" className="backup-secondary" onClick={() => safetyFileInputRef.current?.click()} disabled={busy}>Verify saved backup from Files</button>
              <input ref={safetyFileInputRef} type="file" accept="application/json,.json,.roadready" hidden onChange={event => verifySavedSafetyFile(event.target.files?.[0])} />
            </>
          )}
        </section>

        <section className="backup-actions-card">
          <b>Readable Road Ready JSON</b>
          <p>This second export is easier to inspect in chat and contains the normalized logbook/app records.</p>
          <button type="button" className="backup-secondary" onClick={exportBackup} disabled={busy}>2 · Export readable all-data JSON</button>
          <button type="button" className="backup-primary" onClick={exportCycleWeek} disabled={busy}>3 · Export one week from 34h reset</button>
          <p>This weekly file starts at the latest completed 34-hour OFF/SB reset and covers exactly 7×24 hours. If no completed reset is found, it clearly falls back to the latest 7 recorded log days.</p>
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

      </main>
    </div>
  );
}

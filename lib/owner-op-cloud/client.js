'use client';
import { createClient } from '@supabase/supabase-js';
import { loadAppSnapshot } from '../local-db/appState.js';
import { buildDayBackupPayload } from '../../source/src/core/backup/dayTransfer.js';
import { getHomeTerminalTimeZone } from '../../source/src/core/time/homeTerminalTime.js';
import { DOT_DOCUMENT_REQUIREMENTS } from '../../source/src/core/wallet/dotWallet.js';
import { canonical, makeSnapshot, profileFromState, validDay, walletMetadata } from './core.js';
export const CLOUD_URL = 'https://ghwkcgczuwctzxsxmqzx.supabase.co';
// Public browser key for the isolated Owner Operator prototype. All private data still requires an approved authenticated user through RLS.
const PUBLIC_KEY = 'sb_publishable_YP8uKzWiV-l-ZiJhy9smbQ_hmbEPBrb';
const ENDPOINT = CLOUD_URL + '/functions/v1/owner-op-cloud-v1';
let client = null, busy = false;
export function cloudClient() {
  if (typeof window === 'undefined') return null;
  if (!client) client = createClient(CLOUD_URL, PUBLIC_KEY, { auth: { storageKey: 'owner-op-prototype-auth-v1', autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } });
  return client;
}
export async function cloudSession() {
  const c = cloudClient(); if (!c) return null;
  const { data, error } = await c.auth.getSession(); if (error) throw error; return data.session;
}
export async function cloudApi(body, binary = false) {
  const publicRequest = ['inspect', 'inspection_file'].includes(body.action);
  const session = publicRequest ? null : await cloudSession();
  if (!publicRequest && !session) throw new Error('Sign in to your Owner Operator cloud account.');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: PUBLIC_KEY, ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}) }, body: JSON.stringify(body), cache: 'no-store', signal: controller.signal });
    if (!response.ok) { const detail = await response.json().catch(() => ({})); const e = new Error(detail.error || 'Cloud request failed (' + response.status + ')'); e.status = response.status; throw e; }
    if (binary) return await response.arrayBuffer();
    const json = await response.json(); if (!json.ok) throw new Error(json.error || 'Cloud request failed'); return json.result;
  } finally { clearTimeout(timer); }
}
export async function sha256(bytes) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join(''); }
function journalKey(uid) { return 'owner-op-cloud-journal-v1:' + uid; }
function readJournal(uid) { try { return JSON.parse(localStorage.getItem(journalKey(uid)) || '{}'); } catch { return {}; } }
function saveJournal(uid, value) { localStorage.setItem(journalKey(uid), JSON.stringify(value)); }
export function autoBackupEnabled(uid) { try { return localStorage.getItem('owner-op-cloud-enabled:' + uid) === 'true'; } catch { return false; } }
export function enableAutoBackup(uid, enabled) { localStorage.setItem('owner-op-cloud-enabled:' + uid, String(enabled)); }
export function backupStatus(uid) { return readJournal(uid).status || null; }
function emitStatus(uid, journal, status) { journal.status = { ...status, checkedAt: new Date().toISOString() }; saveJournal(uid, journal); window.dispatchEvent(new CustomEvent('owner-op-cloud-status', { detail: journal.status })); }
export async function localState() {
  const state = await loadAppSnapshot(); if (state) return state;
  try { return JSON.parse(localStorage.getItem('owner-op-road-ready-state-v1') || 'null'); } catch { return null; }
}
export async function allCloudDays() {
  const rows = []; let before = null;
  do { const page = await cloudApi({ action: 'list_days', payload: before ? { before } : {} }); rows.push(...page.days); before = page.next_before; } while (before);
  return rows;
}
function dataUrlBytes(dataUrl) { const raw = atob(dataUrl.split(',')[1] || ''); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
export async function backupLocalData({ maxUploads = 20, onProgress = () => {}, bootstrap = false, onlyDays = null } = {}) {
  if (busy) return { busy: true }; if (navigator.onLine === false) throw new Error('Offline. Your local records remain on this device.');
  const session = await cloudSession(); if (!session) throw new Error('Sign in first.');
  const perform = async () => {
    busy = true;
    const uid = session.user.id, journal = readJournal(uid); journal.days ||= {}; journal.wallet ||= {}; journal.deviceId ||= crypto.randomUUID();
    let uploaded = 0, remaining = 0; const errors = [];
    try {
      const state = await localState(); if (!state) throw new Error('No local Road Ready records found on this browser. Cloud records can still be viewed below.');
      if (bootstrap) await cloudApi({ action: 'bootstrap', payload: { profile: profileFromState(state), home_timezone: getHomeTerminalTimeZone(state) } });
      for (const [key, doc] of Object.entries(state.dotWallet?.documents || {})) {
        if (!doc?.attachmentDataUrl) continue;
        const req = DOT_DOCUMENT_REQUIREMENTS.find(x => x.id === key);
        const metadata = walletMetadata({ ...doc, title: req?.title || key });
        const fileSha = await sha256(dataUrlBytes(doc.attachmentDataUrl));
        const fingerprint = await sha256(new TextEncoder().encode(fileSha + canonical(metadata)));
        if (journal.wallet[key]?.hash === fingerprint) continue;
        if (uploaded >= maxUploads) { remaining++; continue; }
        onProgress('Backing up ' + metadata.title);
        try {
          const result = await cloudApi({ action: 'upload_document', document_key: key, data_url: doc.attachmentDataUrl, metadata, expected_revision: journal.wallet[key]?.revision || 0 });
          journal.wallet[key] = { hash: fingerprint, revision: result.revision }; uploaded++; saveJournal(uid, journal);
        } catch (e) { errors.push(metadata.title + ': ' + e.message); }
      }
      const dates = [...new Set(['eventsByDay', 'signatureByDay', 'formByDay', 'certifyStatus'].flatMap(k => Object.keys(state[k] || {})))].filter(day => validDay(day) && (!onlyDays || onlyDays.includes(day))).sort().reverse();
      for (const day of dates) {
        const snapshot = makeSnapshot(state, day, buildDayBackupPayload);
        const hash = await sha256(new TextEncoder().encode(canonical(snapshot)));
        if (journal.days[day]?.hash === hash) continue;
        if (uploaded >= maxUploads) { remaining++; continue; }
        onProgress('Backing up log ' + day);
        try {
          const result = await cloudApi({ action: 'upload_log', snapshot, device_id: journal.deviceId, expected_revision: journal.days[day]?.revision || 0 });
          journal.days[day] = { hash, revision: result.current_revision }; uploaded++; saveJournal(uid, journal);
        } catch (e) { errors.push(day + ': ' + e.message); }
      }
      const status = { uploaded, remaining, errors, scope: onlyDays ? 'inspection_window' : 'all', complete: !remaining && !errors.length };
      emitStatus(uid, journal, status); return status;
    } catch (error) { emitStatus(uid, journal, { uploaded, remaining, errors: [error.message], complete: false }); throw error; }
    finally { busy = false; }
  };
  if (navigator.locks?.request) return navigator.locks.request('owner-op-cloud-backup', { ifAvailable: true }, lock => lock ? perform() : { busy: true });
  return perform();
}
export async function readCloudFile(file, shareToken = null) {
  let bytes = await cloudApi(shareToken ? { action: 'inspection_file', token: shareToken, file_id: file.file_id || file.id } : { action: 'download_file', file_id: file.file_id || file.id }, true);
  if (file.mime_type === 'application/gzip') {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed logs. Use a current Safari, Chrome or Edge browser.');
    bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  if (file.sha256 && await sha256(bytes) !== file.sha256) throw new Error('File integrity check failed. The file was not opened.');
  return bytes;
}
export function saveDownload(bytes, name, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([bytes], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 120000);
}

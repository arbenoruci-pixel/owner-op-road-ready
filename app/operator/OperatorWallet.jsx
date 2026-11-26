'use client';

import { useEffect, useState } from 'react';
import { allRows, loadOriginal } from './portalData.js';
import { usePortalClient } from './PortalSession.jsx';
import { emailReceiptText } from './walletReceipt.js';
import { chicagoDay, formatDay } from './financials.js';
import { instructionsSlot, reviewDocuments } from './roadDocuments.js';
import styles from './operator.module.css';

const fields = 'id,operator_id,slot_key,category,title,file_name,mime_type,byte_size,sha256,chunk_count,is_ready,is_current,revision,issued_on,expires_on';
const names = {
  license: 'Driver license', medical: 'Medical certificate', registration: 'Registration',
  insurance: 'Insurance', permit: 'Permit', inspection: 'Inspection', lease: 'Lease',
  carrier_document: 'Carrier document', eld: 'ELD', other: 'Document',
};

function WalletFile({ doc }) {
  const client = usePortalClient();
  const [requested, setRequested] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!requested) return;
    let active = true;
    let url;
    loadOriginal(client, { ...doc, storage_backend: 'database' }, 'rr_lease_wallet_download_chunk')
      .then(async (blob) => {
        const receipt = doc.mime_type === 'application/json' ? JSON.parse(await blob.text()) : null;
        if (active) {
          url = URL.createObjectURL(blob);
          setFile({ url, type: blob.type, receipt });
        }
      })
      .catch((failure) => {
        if (active) {
          setError(failure.message);
          setRequested(false);
        }
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [requested, client, doc.id, doc.sha256]);
  return (
    <div className={styles.document}>
      {file ? (
        <div>
          {file.receipt && <div>
            <h4>Email receipt</h4><p>{file.receipt.subject}</p>
            <p>{file.receipt.sender} · {new Date(file.receipt.received_at).toLocaleString('en-US')}</p>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit' }}>
              {emailReceiptText(file.receipt.body)}
            </pre>
          </div>}
          {file.type === 'application/pdf' && <a href={file.url} target="_blank" rel="noreferrer">View PDF</a>}{' '}
          <a href={file.url} download={doc.file_name}>Download {doc.file_name}</a>{' '}
          <button type="button" className={styles.link} onClick={() => { setRequested(false); setFile(null); }}>Close</button>
          {file.type.startsWith('image/') && <img src={file.url} className={styles.photo} alt={doc.title} />}
        </div>
      ) : <button type="button" className={styles.link} disabled={requested} onClick={() => { setError(''); setRequested(true); }}>
        {requested ? 'Opening…' : doc.mime_type === 'application/json' ? 'Open email receipt' : 'Open original'}
      </button>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function WalletProof({ documentId, operatorId }) {
  const client = usePortalClient();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!open) return;
    let active = true;
    client.from('rr_lease_wallet_documents').select(fields).eq('id', documentId)
      .eq('operator_id', operatorId).eq('is_ready', true).single()
      .then(({ data, error }) => {
        if (active) setResult({ id: documentId, operatorId, doc: error ? null : data });
      }, () => { if (active) setResult({ id: documentId, operatorId, doc: null }); });
    return () => { active = false; };
  }, [open, documentId, operatorId, client]);
  if (!documentId) return null;
  const current = result?.id === documentId && result.operatorId === operatorId ? result : null;
  return <details onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Supporting document</summary>
    {open && (!current ? <p role="status">Loading…</p> : current.doc ? (
      <div><strong>{current.doc.title}</strong><WalletFile key={current.doc.id} doc={current.doc} /></div>
    ) : <p role="alert">Could not load this original. Close and reopen to try again.</p>)}
  </details>;
}

function RoadDocument({ item }) {
  const { doc, title, status, versions, action } = item;
  const older = versions.filter((file) => !file.is_current);
  if (!doc && !older.length) return <div className={styles.checkItem}>
    <strong>{title}</strong><p>{status}</p><p>{action}</p>
  </div>;
  return <details className={styles.card}>
    <summary><span><strong>{title}</strong><small>{action || (doc && names[doc.category])}</small></span>
      <span>{status}</span></summary>
    <div className={styles.detail}>
      {doc?.issued_on && <p>Issued {formatDay(doc.issued_on)}</p>}
      {doc && <WalletFile key={doc.id} doc={doc} />}
      {older.length > 0 && <details><summary>Previous versions ({older.length})</summary>
        {older.map((version) => (
          <section key={version.id}>
            <h4>Version {version.revision}</h4>
            <p>{version.expires_on ? 'Expiration date ' + formatDay(version.expires_on) : 'Expiry not recorded'}</p>
            <WalletFile doc={version} />
          </section>
        ))}
      </details>}
    </div>
  </details>;
}

function formatDate(value) {
  return new Date(value + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function localDay() {
  const today = new Date();
  return [today.getFullYear(), String(today.getMonth()+1).padStart(2,'0'), String(today.getDate()).padStart(2,'0')].join('-');
}

function expiryText(value, required = false) {
  if (!value) return required ? 'Expiry needs verification' : 'Expiry not recorded';
  return (value < localDay() ? 'Expired ' : 'Expires ') + formatDate(value);
}

function WalletDocuments({ wallet }) {
  const { docs, requirements } = wallet;
  if (!docs.length && !requirements.length) return <p className={styles.empty}>Verified road documents will appear here.</p>;
  const groups = new Map();
  for (const doc of docs) {
    if (!groups.has(doc.slot_key)) groups.set(doc.slot_key, []);
    groups.get(doc.slot_key).push(doc);
  }
  const expected = new Map(requirements.map((row) => [row.slot_key, row]));
  const missing = requirements.filter((row) => !groups.has(row.slot_key));
  return <div className={styles.list}>
    {missing.map((row) => <div className={styles.card} style={{padding:'0.8rem 1rem'}} key={row.slot_key}>
      <strong>{row.title}</strong><p>Missing document</p>
    </div>)}
    {[...groups.values()].map((versions) => {
    const doc = versions.find((version) => version.is_current);
    if (!doc) return null;
    return <details className={styles.card} key={doc.slot_key}>
      <summary><span><strong>{doc.title}</strong><small>{names[doc.category] || 'Document'}</small></span>
        <span>{expiryText(doc.expires_on, expected.get(doc.slot_key)?.expiry_required)}</span></summary>
      <div className={styles.detail}>
        {doc.issued_on && <p>Issued {formatDate(doc.issued_on)}</p>}
        <WalletFile key={doc.id} doc={doc} />
        {versions.length > 1 && <details><summary>Previous versions ({versions.length - 1})</summary>
          {versions.filter((version) => !version.is_current).map((version) => (
            <section key={version.id}>
              <h4>Version {version.revision}</h4><p>{expiryText(version.expires_on)}</p><WalletFile doc={version} />
            </section>
          ))}
        </details>}
      </div>
    </details>;
  })}</div>;
}

function WalletEntries({ operatorId, refresh, pilot }) {
  const client = usePortalClient();
  const [wallet, setWallet] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    Promise.all([
      allRows(() => client.from('rr_lease_wallet_documents').select(fields)
        .eq('operator_id', operatorId).eq('is_ready', true).not('category', 'in', '(fuel_receipt,expense_receipt)')
        .order('slot_key').order('revision', { ascending: false }).order('id')),
      allRows(() => client.from('rr_lease_wallet_requirements').select('slot_key,title,expiry_required')
        .eq('operator_id', operatorId).eq('active', true).order('slot_key')),
    ])
      .then(([docs, requirements]) => { if (active) setWallet({ docs, requirements }); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [operatorId, refresh, client]);
  if (failed) return <p role="alert">{pilot ? 'Could not load road documents. Tap Refresh to try again.' : 'Could not load the wallet. Tap Refresh to try again.'}</p>;
  if (!wallet) return <p role="status">{pilot ? 'Loading road documents…' : 'Loading wallet…'}</p>;
  if (!pilot) return <WalletDocuments wallet={wallet} />;
  const today = chicagoDay();
  const items = reviewDocuments(wallet.docs, wallet.requirements, today);
  const required = items.filter((item) => item.required);
  const needed = required.filter((item) => item.action);
  const guide = items.find((item) => item.key === instructionsSlot && item.doc && !item.action);
  const remaining = items.filter((item) => !item.required && item !== guide);
  return <div className={styles.list}>
    <div className={styles.checkItem}>
      <strong>{required.length
        ? `${required.length - needed.length} of ${required.length} required documents current`
        : 'Dispatch checklist pending'}</strong>
      <p>{required.length ? `Dispatch checklist as of ${formatDay(today)} (Chicago time).`
        : 'Ask dispatch which documents this driver and equipment need.'}</p>
    </div>
    {needed.length > 0 && <>
      <h3>What to email dispatch</h3>
      <p>Email clear copies from your registered address. Include your name, company, and the unit number for equipment documents.</p>
      <p>{guide ? 'Open the dispatch guide below for the receiving email address.'
        : 'Confirm the receiving email address with your dispatcher before sending documents.'}</p>
    </>}
    {guide && <RoadDocument item={guide} />}
    {needed.filter((item) => item !== guide).map((item) => <RoadDocument key={item.key} item={item} />)}
    {required.some((item) => !item.action && item !== guide) && <h3>Required documents on file</h3>}
    {required.filter((item) => !item.action && item !== guide).map((item) => <RoadDocument key={item.key} item={item} />)}
    {remaining.length > 0 && <h3>Additional documents</h3>}
    {remaining.map((item) => <RoadDocument key={item.key} item={item} />)}
  </div>;
}

export default function OperatorWallet({ operatorId, refresh, pilot = false }) {
  return <WalletEntries key={operatorId} operatorId={operatorId} refresh={refresh} pilot={pilot} />;
}

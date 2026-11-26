'use client';

import { useEffect, useState } from 'react';
import { allRows, loadOriginal } from './portalData.js';
import { usePortalClient } from './PortalSession.jsx';
import { emailReceiptText } from './walletReceipt.js';
import styles from './operator.module.css';

const fields = 'id,operator_id,slot_key,category,title,file_name,mime_type,byte_size,sha256,chunk_count,is_ready,is_current,revision,issued_on,expires_on';
const names = {
  license: 'Driver license', medical: 'Medical certificate', registration: 'Registration',
  insurance: 'Insurance', permit: 'Permit', inspection: 'Inspection', lease: 'Lease',
  carrier_document: 'Carrier document', eld: 'ELD', other: 'Document',
};

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

function WalletEntries({ operatorId, refresh }) {
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
  if (failed) return <p role="alert">Could not load the wallet. Tap Refresh to try again.</p>;
  if (!wallet) return <p role="status">Loading wallet…</p>;
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

export default function OperatorWallet({ operatorId, refresh }) {
  return <WalletEntries key={operatorId} operatorId={operatorId} refresh={refresh} />;
}

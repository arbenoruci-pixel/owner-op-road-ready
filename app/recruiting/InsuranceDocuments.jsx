'use client';

import { useEffect, useRef, useState } from 'react';
import { inboxRequest, useInboxFeed } from '../../source/src/modules/recruiting/inboxClient.js';
import styles from './inbox.module.css';

const endpoint = '/api/recruiting/documents';
const documentLabels = {
  cdl: 'CDL front',
  cdlBack: 'CDL back',
  registration: 'Truck registration or cab card',
  parking: 'Proof of truck parking',
  mvrRelease: 'Signed MVR release from the insurance agent',
};
const fileExtensions = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

function timestamp(date) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

export default function InsuranceDocuments({ applicationId, token, opened }) {
  const [revision, setRevision] = useState(0);
  const [replacing, setReplacing] = useState(false);
  const [kinds, setKinds] = useState(['cdl', 'registration']);
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const action = useRef(null);
  const linkField = useRef(null);
  const query = '?applicationId=' + encodeURIComponent(applicationId);
  const feed = useInboxFeed(opened ? token : null, query, revision, endpoint);

  useEffect(() => {
    // Stop a request or download if its authenticated view closes.
    return () => {
      action.current?.abort();
      action.current = null;
    };
  }, [token, opened]);
  useEffect(() => { setBusy(''); }, [token, opened]);

  async function createRequest() {
    if (action.current) return;
    const controller = new AbortController();
    action.current = controller;
    setBusy('create');
    setError('');
    setCopied(false);
    setIssued(null);
    try {
      const result = await inboxRequest(token, '', {
        method: 'POST', body: JSON.stringify({ applicationId, kinds }), signal: controller.signal,
      }, endpoint);
      if (controller.signal.aborted) return;
      if (!result.ok || !/^[A-Za-z0-9_-]{43}$/.test(result.token)) throw new Error('Invalid response');
      const url = new URL('/apply/documents', window.location.origin);
      url.hash = result.token;
      setIssued({ url: url.href, expiresAt: result.expiresAt });
      setReplacing(false);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause.status === 409 ? 'Mark the application reviewed before creating an upload link.' :
          'Could not confirm the new link. Refresh documents to check the request.');
      }
    } finally {
      if (action.current === controller) {
        action.current = null;
        setBusy('');
        setRevision(value => value + 1);
      }
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
    } catch {
      linkField.current?.focus();
      linkField.current?.select();
      setError('Select and copy the private link from the field below.');
    }
  }

  async function download(file) {
    if (action.current) return;
    const controller = new AbortController();
    action.current = controller;
    setBusy(file.kind);
    setError('');
    try {
      const response = await fetch(endpoint + query + '&kind=' + encodeURIComponent(file.kind), {
        cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
        headers: { Authorization: 'Bearer ' + token }, signal: controller.signal,
      });
      if (!response.ok) throw new Error('Download failed');
      const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!Object.hasOwn(fileExtensions, type)) throw new Error('Unsupported document type');
      const bytes = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(bytes);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.kind + '-' + applicationId.slice(0, 8) + '.' + fileExtensions[type];
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      if (!controller.signal.aborted) setError('Could not download the document. Refresh documents and try again.');
    } finally {
      if (action.current === controller) {
        action.current = null;
        setBusy('');
      }
    }
  }

  if (!opened) return null;
  const heading = <h3>Private insurance documents</h3>;
  if (!feed) return <section className={styles.insurance}>{heading}<p role="status">Loading documents…</p></section>;
  if (feed.error) return (
    <section className={styles.insurance}>
      {heading}
      <p role="alert">{feed.error === 401 || feed.error === 403 ? 'Recruiter access is required.' : 'Could not load document status.'}</p>
      <button type="button" className={styles.secondary} onClick={() => setRevision(value => value + 1)}>Refresh documents</button>
    </section>
  );

  const { requested, expiresAt, files } = feed.data;
  const hasRequest = Boolean(expiresAt);
  const expired = hasRequest && new Date(expiresAt).getTime() <= Date.now();
  const showChooser = replacing || (!hasRequest && !issued);
  const showIssued = issued && !replacing && (!expiresAt || Date.parse(expiresAt) === Date.parse(issued.expiresAt)) && new Date(issued.expiresAt).getTime() > Date.now();
  const included = Object.keys(documentLabels).filter(kind => requested.includes(kind) || files.some(file => file.kind === kind));
  function replace() {
    setKinds([...new Set(['cdl', ...requested])]);
    setReplacing(true);
    setCopied(false);
    setError('');
  }
  return (
    <section className={styles.insurance}>
      <div className={styles.documentHeader}>
        {heading}
        <button type="button" className={styles.textAction} onClick={() => setRevision(value => value + 1)}>Refresh documents</button>
      </div>
      {hasRequest && <p className={styles.muted}>Upload link {expired ? 'expired' : 'expires'} {timestamp(expiresAt)}.</p>}
      {included.length > 0 && <ul className={styles.documentList}>
        {included.map(kind => {
          const file = files.find(item => item.kind === kind);
          return <li key={kind}>
            <div>
              <strong>{documentLabels[kind]}</strong>
              <span>{file ? (file.current ? 'Received ' : 'Earlier upload · ') + timestamp(file.uploadedAt) : 'Awaiting upload'}</span>
              {file && !file.current && requested.includes(kind) && <span>Awaiting updated copy</span>}
            </div>
            {file && <button type="button" className={styles.secondary} disabled={!!busy} aria-label={'Download ' + documentLabels[kind]} onClick={() => download(file)}>
              {busy === kind ? 'Downloading…' : 'Download'}
            </button>}
          </li>;
        })}
      </ul>}
      {files.length > 0 && files.every(file => file.consentVersion === 'insurance-review-v1') &&
        <p className={styles.muted}>The applicant authorized sharing these uploads with Narta’s insurance agent and Sentry for insurance review.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {showIssued && <div className={styles.privateLink}>
        <label>Private applicant upload link
          <input type="text" readOnly ref={linkField} value={issued.url} spellCheck={false} autoComplete="off" onFocus={e => e.target.select()} />
        </label>
        <button type="button" className={styles.primary} onClick={copyLink}>Copy private link</button>
        <small role="status">{copied ? 'Private link copied.' : 'Share with this applicant. Copy the link before leaving the inbox.'}</small>
      </div>}
      {showChooser ? <fieldset className={styles.requestChoices} disabled={!!busy}>
        <legend>Documents to request</legend>
        {Object.entries(documentLabels).map(([kind, label]) => <label key={kind}>
          <input type="checkbox" checked={kinds.includes(kind)} disabled={kind === 'cdl'} onChange={event =>
            setKinds(previous => event.target.checked ? [...previous, kind] : previous.filter(item => item !== kind))} />
          <span>{label}{kind === 'cdl' ? ' (required)' : ''}</span>
        </label>)}
        {replacing && <p className={styles.muted}>Creating a new link closes the earlier link. Existing uploads stay available here.</p>}
        <div className={styles.documentActions}>
          <button type="button" className={styles.primary} onClick={createRequest}>
            {busy === 'create' ? 'Creating link…' : 'Create private upload link'}
          </button>
          {replacing && <button type="button" className={styles.secondary} onClick={() => setReplacing(false)}>Cancel</button>}
        </div>
      </fieldset> :
        hasRequest && <button className={styles.secondary} type="button" disabled={!!busy} onClick={replace}>
          {expired ? 'Create another upload link' : 'Replace upload link'}
        </button>}
    </section>
  );
}

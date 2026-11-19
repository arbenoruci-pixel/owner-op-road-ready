'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './documents.module.css';
import { prepareDocumentFile, typeOfFile } from './prepareDocumentFile.js';

const endpoint = '/api/recruiting/documents';
const consentVersion = 'insurance-review-v1';
const documentTypes = {
  cdl: ['CDL front', 'Include the entire front of your commercial driver’s license. Make sure the text is clear.'],
  cdlBack: ['CDL back', 'Include the entire back of your commercial driver’s license.'],
  registration: ['Truck registration or cab card', 'Choose the current registration or IRP cab card for the tractor on your application.'],
  parking: ['Proof of truck parking', 'Choose a document that shows the parking address you listed on your application.'],
  mvrRelease: ['Signed motor vehicle record (MVR) release', 'Upload the separate release supplied by the insurance agent, after you have read and signed it.'],
};

const options = { cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' };
const linkMessage = 'Reopen the original personal link from Narta Express. If it has expired, ask your Narta Express contact for a new link.';

class LinkError extends Error {}

async function openRequest(token, signal) {
  const response = await fetch(endpoint, { ...options, headers: { Authorization: 'Upload ' + token }, signal });
  if ([400, 401, 403, 404, 410].includes(response.status)) throw new LinkError(linkMessage);
  const data = await response.json();
  if (!response.ok || !data?.ok || !Array.isArray(data.requested) || !data.requested.length ||
    !Array.isArray(data.received) || data.consentVersion !== consentVersion ||
    !data.requested.every(kind => Object.hasOwn(documentTypes, kind)) ||
    !Number.isFinite(Date.parse(data.expiresAt))) throw new Error('Unavailable');
  return data;
}

function PreparedPhoto({ file }) {
  const [source, setSource] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <details className={styles.preview}>
      <summary>Preview prepared JPG ({Math.max(1, Math.ceil(file.size / 1024))} KB)</summary>
      {source && <img src={source} alt="Prepared document photo for checking readability before sending" />}
    </details>
  );
}

export default function DocumentUpload() {
  const token = useRef('');
  const consentBox = useRef(null);
  const busy = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('loading');
  const [request, setRequest] = useState(null);
  const [files, setFiles] = useState({});
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [sentKind, setSentKind] = useState('');
  const [preparing, setPreparing] = useState('');
  const [converted, setConverted] = useState({});
  const [consent, setConsent] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
      token.current = /^[A-Za-z0-9_-]{43}$/.test(hash) ? hash : '';
    }
    if (!token.current) {
      setStatus('invalid');
      return;
    }

    const controller = new AbortController();
    setStatus('loading');
    openRequest(token.current, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setRequest(data);
      setStatus('ready');
    }).catch(error => {
      if (!controller.signal.aborted) setStatus(error instanceof LinkError ? 'invalid' : 'unavailable');
    });
    return () => controller.abort();
  }, [attempt]);

  async function choose(kind, input) {
    const file = input.files?.[0];
    if (!file || busy.current) return;
    busy.current = true;
    setPreparing(kind);
    setNotice('');
    setErrors(previous => ({ ...previous, [kind]: '' }));
    try {
      const result = await prepareDocumentFile(file);
      setFiles(previous => ({ ...previous, [kind]: result.file }));
      setConverted(previous => ({ ...previous, [kind]: result.converted }));
    } catch (error) {
      input.value = '';
      setFiles(previous => ({ ...previous, [kind]: null }));
      setConverted(previous => ({ ...previous, [kind]: false }));
      setErrors(previous => ({ ...previous, [kind]: error.message || 'This file could not be opened. Choose another copy.' }));
    } finally {
      busy.current = false;
      setPreparing('');
    }
  }

  async function send(event) {
    event.preventDefault();
    if (busy.current) return;
    if (!consent) {
      setNeedsConsent(true);
      consentBox.current?.focus();
      return;
    }
    const selected = request.requested.filter(kind => files[kind] && !request.received.includes(kind));
    if (!selected.length) {
      setNotice('Choose a file for at least one requested document.');
      return;
    }

    busy.current = true;
    setNotice('');
    try {
      for (const kind of selected) {
        setSentKind(kind);
        const file = files[kind];
        let message = '';
        try {
          const response = await fetch(endpoint, {
            ...options, method: 'PUT',
            headers: {
              Authorization: 'Upload ' + token.current, 'Content-Type': typeOfFile(file),
              'X-Document-Kind': kind, 'X-Document-Consent': consentVersion,
            },
            body: file,
          });
          if ([401, 403, 404, 410].includes(response.status)) throw new LinkError();
          const body = await response.json().catch(() => null);
          if (!response.ok || !body?.ok) message = body?.error || 'Upload was not confirmed. Try again.';
        } catch (error) {
          if (error instanceof LinkError) { setStatus('invalid'); return; }
          message = 'Upload was not confirmed. Check your connection and try again.';
        }
        // Reconcile uncertain writes before offering a retry. Other files already received stay received.
        if (message) {
          let confirmed = false;
          try {
            const current = await openRequest(token.current);
            setRequest(current);
            confirmed = current.received.includes(kind);
          } catch (error) {
            if (error instanceof LinkError) { setStatus('invalid'); return; }
          }
          if (!confirmed) {
            setErrors(previous => ({ ...previous, [kind]: message }));
            setNotice('Check the highlighted document and send the remaining files when ready.');
            return;
          }
        }
        setRequest(previous => ({ ...previous, received: [...new Set([...previous.received, kind])] }));
        setFiles(previous => ({ ...previous, [kind]: null }));
        setErrors(previous => ({ ...previous, [kind]: '' }));
        setNotice(documentTypes[kind][0] + ' received.');
      }
    } finally {
      busy.current = false;
      setSentKind('');
    }
  }

  if (status === 'loading') return <div className={styles.card}><p role="status">Opening your document request…</p></div>;
  if (status === 'invalid') return <div className={styles.card}><h2>Personal link required</h2><p>{linkMessage}</p></div>;
  if (status === 'unavailable') return <div className={styles.card}><h2>Couldn’t open the request</h2><p>Check your connection and try opening your request again.</p><button className={styles.button} onClick={() => setAttempt(previous => previous + 1)}>Try again</button></div>;

  const receivedCount = request.requested.filter(kind => request.received.includes(kind)).length;
  if (receivedCount === request.requested.length) return (
    <section className={styles.card} role="status"><h2>Documents received</h2><p>Narta Express received {receivedCount === 1 ? 'your requested document' : 'all ' + receivedCount + ' requested documents'} for insurance review.</p>
      <p>Next, Narta Express will contact you if the team or its insurance agent needs anything else.</p></section>
  );

  return (
    <form className={styles.card} onSubmit={send}>
      <p className={styles.intro}>Narta Express requested these documents for your driver and equipment insurance review. Choose a clear JPG, PNG or PDF for each requested page. PDFs may be up to 3 MB. Larger photos and supported iPhone photos are prepared as JPGs on your device so you can check them before sending.</p>
      <p className={styles.deadline}>This personal link expires <time dateTime={request.expiresAt}>{new Date(request.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time> (your local time).</p>
      <p className={styles.progress} role="status">{receivedCount} of {request.requested.length} documents received</p>
      <div className={styles.items}>
        {request.requested.map(kind => {
          const [label, hint] = documentTypes[kind];
          const received = request.received.includes(kind);
          return (
            <div className={styles.item} key={kind}>
              {received ? <><h2>{label}</h2><p className={styles.received}>Received</p></> : <>
                <label htmlFor={'doc-' + kind}>{label}</label>
                <p id={'hint-' + kind}>{hint}</p>
                <input id={'doc-' + kind} name={kind} type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.heic,.heif"
                  disabled={!!sentKind || !!preparing} aria-invalid={!!errors[kind]} aria-describedby={'hint-' + kind + (errors[kind] ? ' error-' + kind : '')}
                  onChange={event => choose(kind, event.target)} />
                {preparing === kind && <p role="status">Preparing your file…</p>}
                {converted[kind] && files[kind] && <><p>Prepared as a JPG on this device. Check that all text is readable before sending.</p><PreparedPhoto file={files[kind]} /></>}
                {errors[kind] && <p className={styles.error} role="alert" id={'error-' + kind}>{errors[kind]}</p>}
              </>}
            </div>
          );
        })}
      </div>
      <div className={styles.consent}>
        <label><input type="checkbox" name="consent" ref={consentBox} checked={consent} disabled={!!sentKind || !!preparing}
          aria-describedby={needsConsent ? 'consent-error' : undefined} aria-invalid={needsConsent}
          onChange={event => { setConsent(event.target.checked); setNeedsConsent(false); }} />
          <span>I authorize Narta Express LLC to share the documents I submit here with its insurance agent and Sentry for driver and equipment insurance review.</span>
        </label>
        <p>A motor vehicle record check requires a separate authorization.</p>
        {needsConsent && <p className={styles.error} id="consent-error" role="alert">Confirm your authorization before sending these documents.</p>}
      </div>
      <button className={styles.button} type="submit" disabled={!!sentKind || !!preparing}>{sentKind ? 'Sending ' + documentTypes[sentKind][0] + '…' : 'Send selected documents'}</button>
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}

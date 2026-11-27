'use client';

import {useEffect, useRef, useState} from 'react';
import {PdfDialog} from '../PilotRateconReview.jsx';
import {PodInvoiceDrafts} from '../PodInvoiceDrafts.jsx';
import portal from '../step3.module.css';
import css from './podInvoiceExercise.module.css';
import {draftRow, initialExercise, makeSamplePod, receiveSample, resumeSampleMail, reviewSample, samples, testLoad} from './podInvoiceSamples.js';

export default function PodInvoiceExercise({initialOffice = false}) {
  const [state, setState] = useState(initialExercise);
  const [selection, setSelection] = useState(samples[0].key);
  const [busy, setBusy] = useState(initialOffice);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const lock = useRef(false);
  const opener = useRef(null);
  const sample = samples.find(item => item.key === selection);
  const row = draftRow(state);
  const lastDocument = state.documents.at(-1);
  const pendingReview = state.documents.filter(doc => doc.decision === 'pending' && !doc.addendum);
  const retryCount = state.documents.filter(doc => doc.status === 'retry').length;

  useEffect(() => {
    if (!initialOffice) return;
    let open = true;
    makeSamplePod(samples[0]).then(receipt => {
      if (open) setState(current => receiveSample(current, receipt, new Date().toISOString()));
    }).catch(() => {if (open) setError('Could not prepare the sample document.');})
      .finally(() => {if (open) setBusy(false);});
    return () => {open = false;};
  }, [initialOffice]);

  async function upload(item) {
    if (lock.current || busy) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const receipt = await makeSamplePod(item);
      const now = new Date().toISOString();
      setState(current => receiveSample(current, receipt, now));
    } catch {
      setError('Could not prepare the sample POD. Try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function viewSample(event, document) {
    opener.current = event.currentTarget;
    try {
      const source = document || await makeSamplePod(sample);
      setPreview(source.blob);
    } catch {
      setError('Could not open the sample PDF.');
    }
  }

  function simulateSend() {
    if (row?.status !== 'ready') return;
    setState(current => ({...current,
      dispatched: {documentIds: Object.values(current.covered), time: new Date().toISOString()},
      message: 'Test submission recorded. The original packet is closed.'}));
  }

  const assignedLoad = <section className={css.card} aria-labelledby="sample-load">
        <div className={css.route}><span>Assigned load</span><strong id="sample-load">{testLoad.load_number}</strong>
          <p>{testLoad.broker_name} · {testLoad.driver_name}</p></div>
        <label htmlFor="sample-pod">Sample POD</label>
        <select id="sample-pod" value={selection} disabled={busy} onChange={e => setSelection(e.target.value)}>
          {samples.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
        <div className={css.actions}>
          <button type="button" className={portal.primary} disabled={busy} onClick={() => upload(sample)}>{busy ? 'Preparing sample…' : 'Upload POD'}</button>
          <button type="button" disabled={busy} onClick={e => viewSample(e)}>View sample PDF</button>
        </div>
      </section>;

  return <main className={css.page}>
    <section className={portal.shell} aria-label="POD invoice staging test">
      <header className={portal.topRow}><h1 className={portal.wordmark}>RoadReady</h1>
        <a href="/operator/design-review" className={css.back}>Driver preview</a></header>
      <div className={css.intro}>
        <h2>POD and invoice test</h2>
        <p>This exercise uses sample PDFs and simulates Hotmail and FirstLine. It resets on reload.</p>
      </div>
      {!initialOffice && assignedLoad}
      {state.message && <p className={css.notice} role="status">{state.message}</p>}
      {error && <p className={css.notice} role="alert">{error}</p>}
      <section className={css.office} aria-label="Office">
        {pendingReview.length > 0 && <section className={css.card} aria-labelledby="office-pods">
          <h3 id="office-pods">Office review</h3>
          {pendingReview.map(doc => <div className={css.receipt} key={doc.document_id}>
            <strong>{doc.file_name}</strong>
            <div className={css.actions}>
              <button type="button" onClick={e => viewSample(e, doc)}>View original</button>
              <button type="button" onClick={() => setState(current => reviewSample(current, doc.document_id))}>
                {doc.sample.wrongLoad ? 'Hold mismatched POD' : doc.sample.correction && state.covered[doc.sample.stop]
                  ? 'Replace delivery ' + doc.sample.stop + ' POD' : 'Verify delivery ' + doc.sample.stop}
              </button>
            </div>
          </div>)}
        </section>}
        {!state.deliveryConfirmed && row && !row.deliveries.missing.length && !pendingReview.length &&
          <button type="button" className={portal.primary} onClick={() => setState(current => ({...current, deliveryConfirmed:true,
            message:'Office confirmed both deliveries are complete.'}))}>Confirm final delivery</button>}
        {row && <PodInvoiceDrafts drafts={[row]} preview onOpenOriginal={async id => {
          const doc = state.documents.find(item => item.document_id === id);
          if (!doc) throw Error('Sample not found.');
          return doc.blob;
        }}/>}
      </section>
      {initialOffice && assignedLoad}
      <details className={css.card}><summary>Test retries and corrections</summary>
        <div className={css.controls}>
          <label><input type="checkbox" checked={state.delayed} onChange={e => {
            const delay = e.target.checked;
            setState(current => delay ? {...current, delayed: true} : resumeSampleMail(current));
          }}/>Delay simulated Hotmail</label>
          {retryCount > 0 && <button type="button" onClick={() => setState(resumeSampleMail)}>Retry {retryCount} pending {retryCount === 1 ? 'notification' : 'notifications'}</button>}
          <button type="button" disabled={!lastDocument || busy} onClick={() => upload(lastDocument.sample)}>Repeat last upload</button>
          <button type="button" disabled={row?.status !== 'ready'} onClick={simulateSend}>Simulate FirstLine submission</button>
          {state.dispatched && <small>Test packet recorded with {state.dispatched.documentIds.length} delivery PODs.</small>}
        </div>
      </details>
      {preview && <PdfDialog heading="Sample proof of delivery" cachedBlob={preview} onClose={() => {
        setPreview(null);
        requestAnimationFrame(() => opener.current?.focus({preventScroll: true}));
      }}/>}
    </section>
  </main>;
}

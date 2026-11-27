'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {loadOriginal} from './portalData.js';
import styles from './operator.module.css';

export function PdfDialog({client, doc, cachedBlob, onReviewed, onClose, heading = "Rate confirmation"}) {
  const dialog = useRef(null);
  const pages = useRef(null);
  const title = useId();
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  // Keep the original across render retries. The caller keys the viewer to a document revision.
  const original = useRef(cachedBlob);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  useEffect(() => {
    let active = true;
    let task;
    const container = pages.current;
    container.replaceChildren();
    setMessage('Opening PDF…');
    setError('');
    async function render() {
      const [pdfjs, blob] = await Promise.all([
        import('pdfjs-dist/build/pdf.mjs'),
        original.current || loadOriginal(client, doc),
      ]);
      if (!active) return;
      original.current = blob;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      const data = await blob.arrayBuffer();
      if (!active) return;
      task = pdfjs.getDocument({data, isEvalSupported: false});
      const pdf = await task.promise;
      for (let n = 1; active && n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        if (!active) return;
        const width = Math.min(1400, Math.max(800, container.clientWidth * (window.devicePixelRatio || 1)));
        const viewport = page.getViewport({scale: width / page.getViewport({scale: 1}).width});
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'Page ' + n + ' of ' + pdf.numPages);
        await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
        if (!active) return;
        container.append(canvas);
        page.cleanup();
      }
      if (active) {
        setMessage('');
        onReviewed?.({blob});
      }
    }
    render().catch(e => {
      if (active) {
        setMessage('');
        setError(e.message?.startsWith('The downloaded') ? e.message : 'Could not open the PDF. Try again.');
      }
    });
    return () => {
      active = false;
      if (task) void task.destroy().catch(() => {});
    };
  }, [client, doc, attempt, onReviewed]);

  return <dialog ref={dialog} className={styles.pdfDialog} aria-labelledby={title}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className={styles.pdfToolbar}>
      <h3 id={title}>{heading}</h3>
      <button type="button" autoFocus onClick={onClose}>Close</button>
    </header>
    <div className={styles.pdfScroll}>
      {message && <p role="status">{message}</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(n => n + 1)}>Try again</button></div>}
      <div ref={pages} className={styles.pdfPages}/>
    </div>
  </dialog>;
}

export default function PilotRateconReview({client, doc, review, onReviewed, accepted, label}) {
  const [open, setOpen] = useState(false);
  const opener = useRef(null);
  function close() {
    setOpen(false);
    requestAnimationFrame(() => opener.current?.focus({preventScroll: true}));
  }
  return <>
    <button ref={opener} type="button" className={styles.pilotReviewButton}
      aria-haspopup="dialog" onClick={() => setOpen(true)}>
      {label || (accepted || review ? 'View rate confirmation' : 'Review rate confirmation')}
    </button>
    {open && <PdfDialog client={client} doc={doc} cachedBlob={review?.blob} onReviewed={onReviewed} onClose={close}/>}
  </>;
}

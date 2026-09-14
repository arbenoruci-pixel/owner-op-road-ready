'use client';
import React, {useEffect, useRef, useState} from 'react';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {analyzeTruckDocumentIsolatedV10959 as analyzeDocument} from '../scan/engines/isolatedDocumentRouterV10959.js';
import ReaderPreview from '../scan/OwnedReaderPreview.jsx';
import {readSavedReviewRecord, saveRereading, readingWithSuggestions} from './savedRereadingV110347.js';

export default function SavedDocumentReread({file, clientId, onClose, onSaved}) {
  const [attempt, setAttempt] = useState(0), [status, setStatus] = useState('reading');
  const [progress, setProgress] = useState(0), [message, setMessage] = useState('Preparing saved original…');
  const [analysis, setAnalysis] = useState(null), [review, setReview] = useState(null), [error, setError] = useState('');
  const generation = useRef(0), controller = useRef(null), baseline = useRef(null), saving = useRef(false), section = useRef(null);
  useEffect(() => {
    const active = ++generation.current, abort = new AbortController();
    controller.current = abort;
    setStatus('reading'); setProgress(0); setMessage('Preparing saved original…'); setAnalysis(null); setReview(null); setError('');
    section.current?.scrollIntoView({block:'nearest'});
    const timer = setTimeout(() => {
      if (generation.current !== active) return;
      generation.current++; abort.abort(); setStatus('error'); setError('Reading took too long. Try again. Your saved file and previous reading are safe.');
    }, 180000);
    (async () => {
      const record = await readSavedReviewRecord(getOwnerOpDb(), clientId);
      if (generation.current !== active) return;
      baseline.current = record;
      // A new File identity bypasses the OCR cache on every explicit retry.
      const original = new File([file], file.name, {type:file.type, lastModified:file.lastModified});
      const result = await analyzeDocument(original, {preferredType:'auto', fileName:original.name, signal:abort.signal,
        onProgress:(value, label) => {
          if (generation.current !== active) return;
          setProgress(previous => Math.max(previous, Math.min(1, Number(value) || 0))); setMessage(label || 'Reading saved original…');
        },
      });
      if (generation.current !== active) return;
      if (!String(result.text || '').trim()) throw new Error('No readable text was found. Try again with a clearer original.');
      setAnalysis(result); setStatus('review');
    })().catch(failure => {
      if (generation.current !== active) return;
      setStatus('error'); setError(`Could not read this file. ${failure.message || ''}`.trim());
    }).finally(() => clearTimeout(timer));
    return () => { generation.current++; abort.abort(); clearTimeout(timer); };
  }, [file, clientId, attempt]);

  function close() {
    if (saving.current) return;
    generation.current++; controller.current?.abort(); onClose();
  }
  function receiveReview(value) { setReview(readingWithSuggestions(value)); }
  async function save() {
    if (saving.current || !review || review.analysis !== analysis) return;
    saving.current = true; setStatus('saving'); setError('');
    try {
      const record = await saveRereading(getOwnerOpDb(), baseline.current, review.summary);
      baseline.current = record; setStatus('saved'); onSaved(record.extracted.readerReviewV110345);
    } catch (failure) { setStatus('review'); setError(`Reading was not saved. ${failure.message || ''}`.trim()); }
    finally { saving.current = false; }
  }

  return <section ref={section} className="saved-reread-v347" aria-label="Read saved document again">
    <h3>Read again</h3><p className="saved-reread-name-v347">{file.name}</p>
    {status === 'reading' ? <><p role="status">{message}</p><progress aria-label="Reading progress" value={progress} max="1"/></> : null}
    {analysis && status !== 'saved' ? <>
      <p>Check the new reading against the original. Save reading replaces the previous reading on this device. The file and load stay the same.</p>
      <ReaderPreview analysis={analysis} reviewState={review} onReady={receiveReview} onReviewChange={receiveReview} defaultExpanded/>
    </> : null}
    {error ? <p role="alert">{error}</p> : null}
    {status === 'saved' ? <p role="status">Reading saved with this document. Find it under Reviewed document details.</p> : null}
    <div className="saved-file-buttons-v344">
      {status === 'review' || status === 'saving' ? <button type="button" disabled={!review || status === 'saving'} onClick={save}>{status === 'saving' ? 'Saving reading…' : 'Save reading'}</button> : null}
      {status === 'error' ? <button type="button" onClick={() => setAttempt(n => n + 1)}>Try again</button> : null}
      <button type="button" disabled={status === 'saving'} onClick={close}>{status === 'saved' ? 'Close reading' : 'Cancel reading'}</button>
    </div>
  </section>;
}

'use client';
import React, {useEffect, useRef, useState} from 'react';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {analyzeTruckDocumentIsolatedV10959 as analyzeDocument} from '../scan/engines/isolatedDocumentRouterV10959.js';
import ReaderPreview from '../scan/OwnedReaderPreview.jsx';
import {readSavedReviewRecord, readingWithSuggestions} from './savedRereadingV110347.js';
import {checkpointReading, saveReadingCheckpoint, commitReadingCheckpoint} from './readingStateV110371.js';

export default function SavedDocumentReread({file, clientId, onClose, onSaved}) {
  const [attempt,setAttempt] = useState(0), [status,setStatus] = useState('reading');
  const [progress,setProgress] = useState(0), [message,setMessage] = useState('Preparing saved original…');
  const [analysis,setAnalysis] = useState(null), [review,setReview] = useState(null), [error,setError] = useState('');
  const [previousReadings,setPreviousReadings] = useState([]), [checkpointStatus,setCheckpointStatus] = useState('');
  const generation = useRef(0), controller = useRef(null), baseline = useRef(null), saving = useRef(false);
  const section = useRef(null), checkpointQueue = useRef(Promise.resolve()), checkpointSequence = useRef(0);
  useEffect(() => {
    const active = ++generation.current, abort = new AbortController();
    controller.current = abort;
    baseline.current = null; checkpointQueue.current = Promise.resolve(); checkpointSequence.current = 0;
    setStatus('reading');setProgress(0);setMessage('Preparing saved original…');setAnalysis(null);setReview(null);setError('');setPreviousReadings([]);setCheckpointStatus('');
    section.current?.scrollIntoView({block:'nearest'});
    const timer = setTimeout(() => {
      if (generation.current !== active) return;
      generation.current++;abort.abort();setStatus('error');setError('Reading took too long. Try again. Your original and saved confirmations are unchanged.');
    },180000);
    (async () => {
      const record = await readSavedReviewRecord(getOwnerOpDb(),clientId);
      if (generation.current !== active) return;
      baseline.current = record;
      const draft = checkpointReading(record);
      // Latest checkpoint is applied first; the last committed reading fills
      // remaining fields. Both must match the original document's page scope.
      setPreviousReadings([draft,record.extracted?.readerReviewV110345].filter(Boolean));
      if (draft) setCheckpointStatus('recovered');
      const original = new File([file],file.name,{type:file.type,lastModified:file.lastModified});
      const result = await analyzeDocument(original,{preferredType:'auto',fileName:original.name,signal:abort.signal,retainPageSourcesV110347:true,
        onProgress:(value,label) => {
          if (generation.current !== active) return;
          setProgress(previous => Math.max(previous,Math.min(1,Number(value)||0)));setMessage(label||'Reading saved original…');
        },
      });
      if (generation.current !== active) return;
      if (!String(result.text||'').trim()) throw new Error('No readable text was found. Your saved confirmations are unchanged.');
      if (original.type==='application/pdf'||/\.pdf$/i.test(original.name)) {
        const pages = result.scanMeta?.pageFiles||[];
        if (!result.pageCount||Array.from({length:result.pageCount},(_,i)=>pages[i]).some(page=>!(page instanceof Blob))) {
          throw new Error('Could not prepare every PDF page for review. Check your connection and try again.');
        }
      }
      setAnalysis(result);setStatus('review');
    })().catch(failure => {
      if (generation.current!==active) return;
      setStatus('error');setError(`Could not read this file. ${failure.message||''}`.trim());
    }).finally(()=>clearTimeout(timer));
    return ()=>{generation.current++;abort.abort();clearTimeout(timer);};
  },[file,clientId,attempt]);

  async function close() {
    if (saving.current) return;
    // Let an already-started confirmation checkpoint settle before closing.
    await checkpointQueue.current;
    generation.current++;controller.current?.abort();onClose();
  }
  function receiveReady(value) {setReview(readingWithSuggestions(value));}
  function receiveReview(value) {
    const next = readingWithSuggestions(value), active = generation.current, sequence = ++checkpointSequence.current;
    setReview(next);setCheckpointStatus('saving');
    checkpointQueue.current = checkpointQueue.current.then(async () => {
      if (active!==generation.current) return;
      const record = await saveReadingCheckpoint(getOwnerOpDb(),baseline.current,next.summary);
      if (active!==generation.current) return;
      baseline.current = record;
      if (sequence===checkpointSequence.current) {setCheckpointStatus('saved');setError('');}
    }).catch(failure => {
      if (active!==generation.current) return;
      setCheckpointStatus('error');setError(`The latest correction was not checkpointed. ${failure.message||''}`.trim());
    });
  }
  async function save(value) {
    const currentReview = value?.analysis===analysis ? readingWithSuggestions(value) : review;
    if (saving.current||!currentReview||currentReview.analysis!==analysis) return;
    saving.current=true;setStatus('saving');setError('');
    try {
      await checkpointQueue.current;
      const record=await commitReadingCheckpoint(getOwnerOpDb(),baseline.current,currentReview.summary);
      baseline.current=record;setStatus('saved');setCheckpointStatus('saved');onSaved(record.extracted.readerReviewV110345);
    } catch(failure) {
      setStatus('review');setError(`Reading was not saved. ${failure.message||''}`.trim());
      if(value?.analysis===analysis) throw failure;
    } finally {saving.current=false;}
  }
  return <section ref={section} className="saved-reread-v347" aria-label="Read saved document again">
    <h3>Read again</h3><p className="saved-reread-name-v347">{file.name}</p>
    {status==='reading'?<><p role="status">{message}</p><progress aria-label="Reading progress" value={progress} max="1"/></>:null}
    {analysis&&status!=='saved'?<>
      <p>Saved confirmations stay with the same document pages. New readings remain suggestions until you confirm a change.</p>
      <ReaderPreview analysis={analysis} reviewState={review} previousReadings={previousReadings} onReady={receiveReady} onReviewChange={receiveReview} signal={controller.current?.signal} defaultExpanded onSaveReading={save}/>
    </>:null}
    {checkpointStatus?<p role="status" data-testid="reading-checkpoint-status">{checkpointStatus==='saving'?'Saving correction on this device…':checkpointStatus==='recovered'?'Recovered unfinished confirmed changes from this device.':checkpointStatus==='saved'?'Confirmed changes saved on this device.': 'Latest correction is not yet saved on this device.'}</p>:null}
    {error?<p role="alert">{error}</p>:null}
    {status==='saved'?<p role="status">Reading saved with this document. Find it under Reviewed document details.</p>:null}
    <p className="reader-local-status-v371">Reading and corrections are stored on this device. Cloud file status does not confirm a cloud backup of these corrections.</p>
    <div className="saved-file-buttons-v344">
      {status==='review'||status==='saving'?<button type="button" disabled={!review||status==='saving'} onClick={save}>{status==='saving'?'Saving reading…':'Save reading'}</button>:null}
      {status==='error'?<button type="button" onClick={()=>setAttempt(n=>n+1)}>Try again</button>:null}
      <button type="button" disabled={status==='saving'||checkpointStatus==='saving'} onClick={close}>{status==='saved'?'Close reading':'Cancel reading'}</button>
    </div>
  </section>;
}

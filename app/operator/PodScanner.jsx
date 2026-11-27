'use client';

import {useEffect, useRef, useState} from 'react';
import CameraAdapterV3 from '../../source/src/modules/scan/v3/CameraAdapterV3.jsx';
import ReviewScreenV3 from '../../source/src/modules/scan/v3/ReviewScreenV3.jsx';
import {scannerEngineV3} from '../../source/src/modules/scan/v3/ScannerEngineV3.js';
import {processDocumentClient} from '../../source/src/modules/scan/v3/processDocumentClientV110330.js';
import {MAX_PHOTO_PAGES, PHOTO_ACCEPT, normalizeScanFile, validateSelection} from '../../scripts/v110328/scanIntake.js';
import {preferNativeCamera} from '../../scripts/scanner-paper/cameraRuntime.js';
import {buildPodScanPdf} from './podScanPdf.js';
import css from './podScanner.module.css';

function ScanIcon({name}) {
  const paths = {
    camera: <><path d="M3 7h4l1.8-3h6.4L17 7h4v13H3z"/><circle cx="12" cy="13" r="3.4"/></>,
    gallery: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2"/><path d="m4 18 5-5 3 3 4-5 5 6"/></>,
    frame: <><path d="M5 8V4h4m6 0h4v4m0 8v4h-4m-6 0H5v-4"/><path d="M9 9h6m-6 3h6m-6 3h4"/></>,
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>,
  };
  return <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">{paths[name]}</svg>;
}

function PagePhoto({file, alt = ''}) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? <img src={url} alt={alt}/> : null;
}

function scannedPage(original, result, corners, rotation) {
  const manifest = result.metadata.captureManifest;
  return {
    original, preview: result.displayFile, width: manifest.perspective.width, height: manifest.perspective.height,
    corners, rotation, needsReview: Boolean(manifest.boundary.needsReview),
    issue: result.metadata.documentQualityV11036?.issues?.[0] || '',
  };
}

export default function PodScanner({onCancel, onReady, onChooseFile, loadLabel}) {
  const dialog = useRef(null);
  const photos = useRef(null);
  const native = useRef(null);
  const mounted = useRef(true);
  const working = useRef(false);
  const [pages, setPages] = useState([]);
  const [selected, setSelected] = useState(0);
  const [replaceIndex, setReplaceIndex] = useState(null);
  const [view, setView] = useState('pages');
  const [crop, setCrop] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const current = pages[selected];
  const replacing = replaceIndex !== null;

  useEffect(() => {
    mounted.current = true;
    const element = dialog.current;
    element.showModal();
    return () => { mounted.current = false; element.close(); };
  }, []);

  async function run(message, action) {
    if (working.current) return;
    working.current = true;
    setBusy(message);
    setError('');
    try { await action(); }
    catch (cause) { if (mounted.current) setError(cause.message || 'This page could not be prepared. Try another photo.'); }
    finally { working.current = false; if (mounted.current) setBusy(''); }
  }

  function leave() {
    if (working.current) {
      if (!pages.length || window.confirm('Discard this scan and close?')) onCancel();
      return;
    }
    if (view === 'discard') return setView('pages');
    if (view === 'camera') return setView(replacing ? 'replace' : 'pages');
    if (view === 'crop' || view === 'zoom' || view === 'replace') {
      setCrop(null);
      setReplaceIndex(null);
      setError('');
      return setView('pages');
    }
    if (pages.length) setView('discard');
    else onCancel();
  }

  function openCamera() {
    setError('');
    if (preferNativeCamera()) native.current.click();
    else setView('camera');
  }

  async function addPhotos(files, source, capture = null) {
    if (!files.length) return;
    // Return from the live camera immediately, so its stream can stop while the worker prepares the page.
    setView(replacing ? 'replace' : 'pages');
    await run('Preparing page…', async () => {
      const incoming = [];
      for (const file of files) {
        const photo = await normalizeScanFile(file);
        if (!photo.type.startsWith('image/')) throw new Error('Choose a photo here. To attach an existing PDF, close the scanner and choose a file.');
        incoming.push(photo);
      }
      validateSelection(pages.filter((_, i) => i !== replaceIndex).map(page => page.original), incoming);
      const added = [];
      for (const photo of incoming) {
        if (!mounted.current) return;
        setBusy(incoming.length > 1 ? 'Preparing photo ' + (added.length + 1) + ' of ' + incoming.length + '…' : 'Preparing page…');
        let processed;
        try { processed = await processDocumentClient(photo, source, capture); }
        catch { throw new Error('This photo could not be opened. Try a JPG or PNG, or take another photo.'); }
        added.push(scannedPage(photo, processed.result, processed.corners, processed.rotation));
      }
      if (!mounted.current) return;
      const next = pages.slice();
      const at = replacing ? replaceIndex : next.length;
      next.splice(at, replacing ? 1 : 0, ...added);
      setPages(next);
      setSelected(at);
      setReplaceIndex(null);
      setView('pages');
    });
  }

  function changed(event, source) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    void addPhotos(files, source);
  }

  function removePage() {
    setPages(pages.filter((_, i) => i !== selected));
    setSelected(Math.max(0, Math.min(selected, pages.length - 2)));
    setError('');
  }

  function moveSelected(by) {
    const next = pages.slice();
    const destination = selected + by;
    if (destination < 0 || destination >= next.length) return;
    [next[selected], next[destination]] = [next[destination], next[selected]];
    setPages(next);
    setSelected(destination);
  }

  function adjust() {
    void run('Opening page edges…', async () => {
      let session = await scannerEngineV3.prepare(current.original, {source: 'page-review'});
      for (let i = 0; i < current.rotation; i += 90) session = await scannerEngineV3.rotate(session);
      if (!mounted.current) return;
      setCrop({...session, corners: current.corners});
      setView('crop');
    });
  }

  function applyCorners(corners) {
    void run('Applying page edges…', async () => {
      const result = await scannerEngineV3.finalize(crop, corners, {preserveOrientation: true});
      if (!mounted.current) return;
      const corrected = scannedPage(current.original, result, corners, crop.rotation);
      setPages(pages.map((page, i) => i === selected ? corrected : page));
      setCrop(null);
      setView('pages');
    });
  }

  function usePdf() {
    void run('Preparing PDF…', async () => {
      const pdf = await buildPodScanPdf(pages, loadLabel);
      if (mounted.current) await onReady(pdf);
    });
  }

  const review = view === 'pages' && current;
  const picking = !current || view === 'replace';
  const canAdd = pages.length < MAX_PHOTO_PAGES;

  return <dialog ref={dialog} className={css.dialog} aria-label="POD scanner"
    onCancel={event => { event.preventDefault(); leave(); }}>
    {view === 'camera' ? <CameraAdapterV3
      onCancel={() => setView(replacing ? 'replace' : 'pages')}
      onCapture={(file, capture) => addPhotos([file], 'camera', capture)}/>
    : view === 'crop' && crop ? <ReviewScreenV3 session={crop} processing={Boolean(busy)} status={busy} error={error}
      onRetake={leave} onDone={applyCorners}
      onRotate={() => run('Rotating page…', async () => {
        const rotated = await scannerEngineV3.rotate(crop);
        if (mounted.current) setCrop(rotated);
      })}/>
    : <div className={css.sheet}>
      <header className={css.header}>
        <div><small>{loadLabel ? 'Load ' + loadLabel : 'Proof of delivery'}</small><h2>POD scanner</h2></div>
        <button type="button" onClick={leave}>{view === 'zoom' || view === 'replace' ? 'Back' : 'Close'}</button>
      </header>
      {view === 'discard' ? <section className={css.body}>
        <h3>Discard this scan?</h3><p>Your {pages.length === 1 ? 'page has' : 'pages have'} not been attached.</p>
        <div className={css.actions}>
          <button type="button" className={css.primary} onClick={() => setView('pages')}>Keep editing</button>
          <button type="button" onClick={onCancel}>Discard scan</button>
        </div>
      </section>
      : view === 'zoom' ? <div className={css.zoom} tabIndex={0} aria-label="Enlarged page, scroll to inspect">
        <PagePhoto file={current.preview} alt={'Enlarged POD page ' + (selected + 1)}/>
      </div>
      : <>
        <main className={css.body}>
          {picking ? <>
            <div className={css.intro}>
              <div className={css.frame} aria-hidden="true"><ScanIcon name="frame"/></div>
              <h3>{replacing ? 'Retake page ' + (replaceIndex + 1) : 'Scan your signed POD'}</h3>
              <p>Keep all four corners and the receiver’s signature in the frame.</p>
            </div>
            <div className={css.actions}>
              <button type="button" className={css.primary} disabled={Boolean(busy)} onClick={openCamera}><ScanIcon name="camera"/>Open camera</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => photos.current.click()}><ScanIcon name="gallery"/>{replacing ? 'Choose a replacement photo' : 'Choose photos'}</button>
              {!replacing && onChooseFile && <button type="button" className={css.existing} disabled={Boolean(busy)} onClick={onChooseFile}>Choose an existing file</button>}
            </div>
          </> : <section className={css.review} aria-label="Page review">
            <div className={css.reviewHeading}><h3>Review scan</h3><strong>Page {selected + 1} of {pages.length}</strong></div>
            <button type="button" className={css.paper} disabled={Boolean(busy)} onClick={() => setView('zoom')} aria-label="Enlarge selected page">
              <PagePhoto file={current.preview} alt={'Scanned POD page ' + (selected + 1)}/><span><ScanIcon name="expand"/>Tap to zoom and check the signature</span>
            </button>
            {current.needsReview || current.issue ? <p className={css.note}>{current.needsReview ? 'Full photo kept. Adjust edges if needed.' : current.issue}</p> : null}
            <div className={css.tools}>
              <button type="button" disabled={Boolean(busy)} onClick={adjust}>Adjust edges</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => { setError(''); setReplaceIndex(selected); setView('replace'); }}>Retake</button>
              <button type="button" disabled={Boolean(busy)} onClick={removePage}>Remove</button>
            </div>
            {pages.length > 1 && <><div className={css.pages} aria-label="Scanned pages">
              {pages.map((page, i) => <button type="button" key={i} aria-label={'Select page ' + (i + 1)} aria-pressed={selected === i} disabled={Boolean(busy)} onClick={() => { setError(''); setSelected(i); }}>
                <PagePhoto file={page.preview}/><span>{i + 1}</span>
              </button>)}
            </div><div className={css.order}>
              <button type="button" disabled={Boolean(busy) || selected === 0} onClick={() => moveSelected(-1)}>Move earlier</button>
              <button type="button" disabled={Boolean(busy) || selected === pages.length - 1} onClick={() => moveSelected(1)}>Move later</button>
            </div></>}
          </section>}
          {busy && <p className={css.status} role="status">{busy}</p>}
          {error && <p className={css.error} role="alert">{error}</p>}
        </main>
        {review && <footer className={css.footer}>
          {canAdd && <div className={css.more}>
            <button type="button" disabled={Boolean(busy)} onClick={openCamera}><ScanIcon name="camera"/>Add page</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => photos.current.click()}><ScanIcon name="gallery"/>Add photos</button>
          </div>}
          <button type="button" disabled={Boolean(busy)} className={css.primary} onClick={usePdf}>Use PDF</button>
        </footer>}
      </>}
    </div>}
    <input type="file" ref={photos} accept={PHOTO_ACCEPT} multiple={!replacing} hidden aria-label="POD page photos" onChange={e => changed(e, 'photo-intake')}/>
    <input type="file" ref={native} accept="image/*" capture="environment" hidden aria-label="POD phone camera" onChange={e => changed(e, 'camera')}/>
  </dialog>;
}

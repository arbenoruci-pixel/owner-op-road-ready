'use client';

import {useEffect, useRef, useState} from 'react';
import CameraAdapterV3 from '../../source/src/modules/scan/v3/CameraAdapterV3.jsx';
import ReviewScreenV3 from '../../source/src/modules/scan/v3/ReviewScreenV3.jsx';
import {scannerEngineV3} from '../../source/src/modules/scan/v3/ScannerEngineV3.js';
import {finalizePodCrop, preparePodCrop, processPodPage} from './podPageClient.js';
import {MAX_PHOTO_PAGES, PHOTO_ACCEPT, normalizeScanFile, validateSelection} from '../../scripts/v110328/scanIntake.js';
import {buildPodScanPdf} from './podScanPdf.js';
import {rememberReceiptPhotos} from './maintenanceReceiptPhotos.js';
import {uploadReviewedPod} from './podUpload.js';
import css from './podScanner.module.css';

function ScanIcon({name}) {
  const paths = {
    camera: <><path d="M3 7h4l1.8-3h6.4L17 7h4v13H3z"/><circle cx="12" cy="13" r="3.4"/></>,
    gallery: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2"/><path d="m4 18 5-5 3 3 4-5 5 6"/></>,
    frame: <><path d="M5 8V4h4m6 0h4v4m0 8v4h-4m-6 0H5v-4"/><path d="M9 9h6m-6 3h6m-6 3h4"/></>,
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

function scannedPage(original, result, corners, rotation, smallPrintReview) {
  const manifest = result.metadata.captureManifest;
  return {
    original, preview: result.displayFile, width: manifest.perspective.width, height: manifest.perspective.height,
    corners, rotation, needsReview: Boolean(manifest.boundary.needsReview),
    suggestedCorners: manifest.boundary.suggestedCorners, smallPrintReview: Boolean(smallPrintReview),
    issue: result.metadata.documentQualityV11036?.issues?.[0] || '',
  };
}

export default function PodScanner({onCancel, onUpload, onChooseFile, loadLabel, purpose = 'pod'}) {
  const receipt = purpose === 'maintenance';
  const scanLabel = receipt ? 'Receipt scanner' : 'POD scanner';
  const submitStatus = receipt ? 'Preparing receipt…' : 'Uploading POD…';
  const dialog = useRef(null);
  const photos = useRef(null);
  const pageOptions = useRef(null);
  const mounted = useRef(true);
  const working = useRef(false);
  const submitting = useRef(false);
  const reviewedPdf = useRef(null);
  const [pages, setPages] = useState([]);
  const [selected, setSelected] = useState(0);
  const [replaceIndex, setReplaceIndex] = useState(null);
  const [view, setView] = useState('camera');
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
    if (submitting.current) return;
    if (working.current) {
      if (window.confirm('Discard this scan and close?')) onCancel();
      return;
    }
    if (view === 'discard') return setView('pages');
    if (view === 'import') { setView('camera'); return; }
    if (view === 'camera' && !pages.length) return onCancel();
    if (view === 'camera') { setReplaceIndex(null); return setView('pages'); }
    if (view === 'crop' || view === 'zoom') {
      setCrop(null);
      setReplaceIndex(null);
      setError('');
      return setView('pages');
    }
    if (pages.length) setView('discard');
    else onCancel();
  }

  function openCamera(retake = false) {
    setError('');
    setReplaceIndex(retake ? selected : null);
    setView('camera');
  }

  async function addPhotos(files, source, capture = null) {
    if (!files.length || working.current) return;
    // Return from the live camera immediately, so its stream can stop while the worker prepares the page.
    setView('pages');
    setReplaceIndex(null);
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
        try { processed = await processPodPage(photo, source, capture); }
        catch { throw new Error('This photo could not be opened. Try a JPG or PNG, or take another photo.'); }
        added.push(scannedPage(photo, processed.result, processed.corners, processed.rotation, capture?.smallPrintReview));
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
    setReplaceIndex(null);
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
      const session = await preparePodCrop(current.original, current.rotation, current.corners, current.suggestedCorners);
      if (!mounted.current) return;
      setCrop(session);
      setView('crop');
    });
  }

  function applyCorners(corners) {
    void run('Applying page edges…', async () => {
      const result = await finalizePodCrop(crop, corners);
      if (!mounted.current) return;
      const corrected = scannedPage(current.original, result, corners, crop.rotation, current.smallPrintReview);
      setPages(pages.map((page, i) => i === selected ? corrected : page));
      setCrop(null);
      setView('pages');
    });
  }

  async function upload() {
    if (working.current) return;
    submitting.current = true;
    try {
      await run(submitStatus, () => uploadReviewedPod(
        reviewedPdf, pages, () => buildPodScanPdf(pages, loadLabel, purpose),
        file => {
          if (!mounted.current) return;
          if (receipt) rememberReceiptPhotos(file, pages.map(page => page.preview));
          return onUpload(file);
        },
      ));
    } finally {
      submitting.current = false;
    }
  }

  const review = view === 'pages' && current;
  const uploading = busy === submitStatus;
  const canAdd = pages.length < MAX_PHOTO_PAGES;
  const reviewNote = [
    current?.needsReview && (receipt ? 'Full photo kept. Check that every item and the total are visible.' : 'Full photo kept. Check the edges and signature.'),
    current?.smallPrintReview ? 'Check small print before using this PDF.' : current?.issue,
  ].filter(Boolean).join(' ');

  return <dialog ref={dialog} className={css.dialog} aria-label={scanLabel}
    onCancel={event => { event.preventDefault(); leave(); }}>
    {view === 'camera' ? <div className={css.cameraStage}>
      <CameraAdapterV3 profile="pod" onCancel={leave}
        onCapture={(file, capture) => addPhotos([file], 'camera', capture)}/>
      <button className={css.importButton} type="button" onClick={() => setView('import')}>Import</button>
    </div>
    : view === 'crop' && crop ? <ReviewScreenV3 session={crop} processing={Boolean(busy)} status={busy} error={error}
      onRetake={leave} onDone={applyCorners}
      onRotate={() => run('Rotating page…', async () => {
        const rotated = await scannerEngineV3.rotate(crop);
        if (mounted.current) setCrop(rotated);
      })}/>
    : <div className={css.sheet}>
      <header className={css.header}>
        <div><small>{receipt ? 'Maintenance receipt' : loadLabel ? 'Load ' + loadLabel : 'Proof of delivery'}</small>
          <h2>{review ? 'Page ' + (selected + 1) + ' of ' + pages.length : view === 'import' ? (receipt ? 'Import receipt' : 'Import POD') : scanLabel}</h2></div>
        {review && !uploading && <details ref={pageOptions} className={css.reviewMenu}>
          <summary>More</summary>
          <div className={css.menuItems} onClick={() => { if (pageOptions.current) pageOptions.current.open = false; }}>
            <button type="button" disabled={Boolean(busy)} onClick={() => setView('zoom')}>Zoom page</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => openCamera(true)}>Retake</button>
            {canAdd && <button type="button" disabled={Boolean(busy)} onClick={() => { setReplaceIndex(null); photos.current.click(); }}>Add photos</button>}
            {pages.length > 1 && <>
              <button type="button" disabled={Boolean(busy) || selected === 0} onClick={() => moveSelected(-1)}>Move earlier</button>
              <button type="button" disabled={Boolean(busy) || selected === pages.length - 1} onClick={() => moveSelected(1)}>Move later</button>
            </>}
            <button type="button" disabled={Boolean(busy)} onClick={removePage}>Remove page</button>
          </div>
        </details>}
        <button type="button" disabled={uploading} onClick={leave}>{view === 'zoom' || view === 'import' ? 'Back' : 'Close'}</button>
      </header>
      {view === 'discard' ? <section className={css.body}>
        <h3>Discard this scan?</h3><p>Your {pages.length === 1 ? 'page has' : 'pages have'} not been attached.</p>
        <div className={css.actions}>
          <button type="button" className={css.primary} onClick={() => setView('pages')}>Keep editing</button>
          <button type="button" onClick={onCancel}>Discard scan</button>
        </div>
      </section>
      : view === 'zoom' ? <div className={css.zoom} tabIndex={0} aria-label="Enlarged page, scroll to inspect">
        <PagePhoto file={current.preview} alt={'Enlarged ' + (receipt ? 'receipt' : 'POD') + ' page ' + (selected + 1)}/>
      </div>
      : <>
        <main className={review ? css.reviewBody : css.body}>
          {review ? <section className={css.review} aria-label="Page review">
            <button type="button" className={css.paper} disabled={Boolean(busy)} onClick={() => setView('zoom')} aria-label="Enlarge selected page">
              <PagePhoto file={current.preview} alt={'Scanned ' + (receipt ? 'receipt' : 'POD') + ' page ' + (selected + 1)}/>
            </button>
            {reviewNote && <p className={css.note}>{reviewNote}</p>}
            {pages.length > 1 && <div className={css.pages} aria-label="Scanned pages">
              {pages.map((page, i) => <button type="button" key={i} aria-label={'Select page ' + (i + 1)} aria-pressed={selected === i} disabled={Boolean(busy)} onClick={() => { setError(''); setSelected(i); }}>
                <PagePhoto file={page.preview}/><span>{i + 1}</span>
              </button>)}
            </div>}
          </section> : !busy && <div className={css.actions}>
            {view !== 'import' && <button type="button" className={css.primary} onClick={() => openCamera()}><ScanIcon name="camera"/>Take photo</button>}
            <button type="button" onClick={() => photos.current.click()}><ScanIcon name="gallery"/>{replacing ? 'Choose a replacement photo' : 'Choose photos'}</button>
            {!pages.length && onChooseFile && <button type="button" onClick={onChooseFile}>Choose an existing file</button>}
          </div>}
          {busy && <p className={css.status} role="status">{busy}</p>}
        </main>
        {error && <p className={css.error} role="alert">{error}</p>}
        {review && <footer className={css.footer}>
          <button type="button" disabled={Boolean(busy)} onClick={adjust}><ScanIcon name="frame"/>Adjust edges</button>
          {canAdd && <button type="button" disabled={Boolean(busy)} onClick={() => openCamera()}><ScanIcon name="camera"/>Add page</button>}
          <button type="button" disabled={Boolean(busy)} className={css.primary} onClick={upload}>{receipt ? (uploading ? 'Preparing…' : 'Use receipt') : (uploading ? 'Uploading…' : 'Upload POD')}</button>
        </footer>}
      </>}
    </div>}
    <input type="file" ref={photos} accept={PHOTO_ACCEPT} multiple={!replacing} hidden aria-label={receipt ? "Receipt page photos" : "POD page photos"} onChange={e => changed(e, 'photo-intake')}/>
  </dialog>;
}

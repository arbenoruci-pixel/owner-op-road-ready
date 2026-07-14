import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  assessDocumentFrame,
  captureVideoFile,
  composePageFiles,
  cornerDelta,
  defaultDocumentCorners,
  detectDocumentCorners,
  documentPolygonArea,
  drawVideoSample,
  fileToImage,
  filesFromNativeScan,
  loadDocumentVision,
  normalizeDocumentCorners,
  perspectiveCropFile,
  renderDocumentFile,
  setTrackTorch,
} from './documentScannerEngine.js';

function Icon({ name, size = 24 }) {
  const common = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:'1.8', strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':'true' };
  if (name === 'flash') return <svg {...common}><path d="m13 2-8 12h7l-1 8 8-12h-7z" /></svg>;
  if (name === 'close') return <svg {...common}><path d="M6 6l12 12M18 6 6 18" /></svg>;
  if (name === 'gallery') return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1.5" /><path d="m4 17 5-5 4 4 2-2 5 5" /></svg>;
  if (name === 'rotate-left') return <svg {...common}><path d="M4 9V4h5" /><path d="M4.8 4.8A8 8 0 1 1 4 14" /></svg>;
  if (name === 'rotate-right') return <svg {...common}><path d="M20 9V4h-5" /><path d="M19.2 4.8A8 8 0 1 0 20 14" /></svg>;
  if (name === 'trash') return <svg {...common}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>;
  if (name === 'page-add') return <svg {...common}><path d="M6 3h9l3 3v15H6zM15 3v4h4" /><path d="M9 14h6M12 11v6" /></svg>;
  if (name === 'frame') return <svg {...common}><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>;
  if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
  if (name === 'camera') return <svg {...common}><path d="M4 7h4l2-2h4l2 2h4v12H4z" /><circle cx="12" cy="13" r="4" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>;
}

const FILTERS = [
  { id:'auto', label:'Auto' },
  { id:'color', label:'Color' },
  { id:'gray', label:'Gray' },
  { id:'bw', label:'B/W' },
  { id:'original', label:'Original' },
];

function filterClass(id) {
  if (id === 'bw') return 'bw';
  if (id === 'gray') return 'gray';
  if (id === 'color') return 'color';
  if (id === 'original') return 'original';
  return 'auto';
}

function polygonPoints(corners) {
  const value = normalizeDocumentCorners(corners);
  return [value.topLeft, value.topRight, value.bottomRight, value.bottomLeft]
    .map(point => `${(point.x * 100).toFixed(2)},${(point.y * 100).toFixed(2)}`)
    .join(' ');
}

function qualityTone(quality = {}) {
  if (quality.good) return 'good';
  if (quality.brightness < 55 || quality.glare > .11) return 'warn';
  return 'hold';
}

export default function TurboDocumentScanner({ onComplete, onCancel }) {
  const videoRef = useRef(null);
  const galleryRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const liveBusyRef = useRef(false);
  const torchRef = useRef(false);
  const cropFrameRef = useRef(null);
  const dragRef = useRef(null);
  const mountedRef = useRef(true);
  const lastCornersRef = useRef(null);

  const [stage, setStage] = useState('camera');
  const [cameraState, setCameraState] = useState('starting');
  const [cameraError, setCameraError] = useState('');
  const [videoAspect, setVideoAspect] = useState('3 / 4');
  const [flashMode, setFlashMode] = useState('auto');
  const [torchSupported, setTorchSupported] = useState(false);
  const [autoFrame, setAutoFrame] = useState(true);
  const [liveCorners, setLiveCorners] = useState(defaultDocumentCorners());
  const [quality, setQuality] = useState({ hint:'Starting camera…', good:false, brightness:0, glare:0 });
  const [visionStatus, setVisionStatus] = useState('Loading smart edges…');
  const [capturing, setCapturing] = useState(false);

  const [currentFile, setCurrentFile] = useState(null);
  const [currentUrl, setCurrentUrl] = useState('');
  const [cropCorners, setCropCorners] = useState(defaultDocumentCorners());
  const [cropBusy, setCropBusy] = useState(false);
  const [baseFile, setBaseFile] = useState(null);
  const [filter, setFilter] = useState('auto');
  const [rotation, setRotation] = useState(0);
  const [processedFile, setProcessedFile] = useState(null);
  const [processedUrl, setProcessedUrl] = useState('');
  const [processing, setProcessing] = useState(false);
  const [pages, setPages] = useState([]);

  const pageNumber = pages.length + 1;
  const cameraCorners = autoFrame ? liveCorners : defaultDocumentCorners();
  const frameFound = autoFrame && documentPolygonArea(liveCorners) > .12;

  function revoke(url) {
    if (url) URL.revokeObjectURL(url);
  }

  function stopCamera() {
    if (trackRef.current && torchRef.current) setTrackTorch(trackRef.current, false).catch(() => {});
    torchRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    trackRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function startWebCamera() {
    stopCamera();
    setStage('camera');
    setCameraState('starting');
    setCameraError('');
    setQuality({ hint:'Starting camera…', good:false, brightness:0, glare:0 });
    setLiveCorners(defaultDocumentCorners());
    lastCornersRef.current = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('error');
      setCameraError('Camera access is unavailable in this browser. Choose a photo instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio:false,
        video:{
          facingMode:{ ideal:'environment' },
          width:{ ideal:3024 },
          height:{ ideal:4032 },
        },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const track = stream.getVideoTracks()[0];
      streamRef.current = stream;
      trackRef.current = track;
      const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
      setTorchSupported(Boolean(capabilities?.torch));
      try {
        const advanced = [];
        if (Array.isArray(capabilities?.focusMode) && capabilities.focusMode.includes('continuous')) advanced.push({ focusMode:'continuous' });
        if (advanced.length) await track.applyConstraints({ advanced });
      } catch {}
      const video = videoRef.current;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      const width = video.videoWidth || 3;
      const height = video.videoHeight || 4;
      setVideoAspect(`${width} / ${height}`);
      setCameraState('ready');
      loadDocumentVision(setVisionStatus).catch(() => setVisionStatus('Manual frame available'));
    } catch (error) {
      setCameraState('error');
      const name = String(error?.name || '');
      setCameraError(name === 'NotAllowedError'
        ? 'Camera permission was blocked. Allow camera access or choose a photo.'
        : 'The camera could not start. Choose a photo or try again.');
    }
  }

  async function startBestScanner() {
    const bridge = typeof window !== 'undefined' ? (window.RoadReadyNative || window.roadReadyNative) : null;
    if (bridge && typeof bridge.scanDocument === 'function') {
      setCameraState('native');
      try {
        const result = await bridge.scanDocument({
          multiPage:true,
          autoCapture:true,
          flashMode:'auto',
          filters:['auto','color','gray','bw'],
          output:['jpeg','pdf'],
        });
        const nativeFiles = await filesFromNativeScan(result || {});
        if (nativeFiles.length) {
          const output = nativeFiles.length === 1 ? nativeFiles[0] : await composePageFiles(nativeFiles, `road-ready-native-${Date.now()}.jpg`);
          onComplete?.(output, { source:'native-document-scanner', pageCount:nativeFiles.length, nativeResult:result });
          return;
        }
      } catch {}
    }
    await startWebCamera();
  }

  useEffect(() => {
    mountedRef.current = true;
    startBestScanner();
    return () => {
      mountedRef.current = false;
      stopCamera();
      revoke(currentUrl);
      revoke(processedUrl);
      pages.forEach(page => revoke(page.previewUrl));
    };
  }, []);

  useEffect(() => {
    if (stage !== 'camera' || cameraState !== 'ready') return undefined;
    const timer = window.setInterval(async () => {
      if (liveBusyRef.current || !videoRef.current || !trackRef.current) return;
      liveBusyRef.current = true;
      try {
        const canvas = drawVideoSample(videoRef.current, 540);
        if (!canvas) return;
        const nextQuality = assessDocumentFrame(canvas);
        if (mountedRef.current) setQuality(nextQuality);
        const desiredTorch = flashMode === 'on' || (flashMode === 'auto' && nextQuality.brightness > 0 && nextQuality.brightness < 58);
        if (torchSupported && desiredTorch !== torchRef.current) {
          const changed = await setTrackTorch(trackRef.current, desiredTorch);
          if (changed) torchRef.current = desiredTorch;
        }
        if (autoFrame) {
          const detected = await detectDocumentCorners(canvas, { maxDimension:540 });
          if (detected && mountedRef.current) {
            const previous = lastCornersRef.current;
            lastCornersRef.current = detected;
            setLiveCorners(previous && cornerDelta(previous, detected) < .08 ? detected : detected);
          }
        }
      } catch {}
      finally { liveBusyRef.current = false; }
    }, 520);
    return () => window.clearInterval(timer);
  }, [stage, cameraState, flashMode, torchSupported, autoFrame]);

  useEffect(() => {
    if (stage !== 'crop' || !currentFile) return undefined;
    let cancelled = false;
    (async () => {
      setCropBusy(true);
      try {
        const image = await fileToImage(currentFile);
        const detected = await detectDocumentCorners(image, { maxDimension:1200, onStatus:setVisionStatus });
        if (!cancelled) setCropCorners(detected || defaultDocumentCorners());
      } catch {
        if (!cancelled) setCropCorners(defaultDocumentCorners());
      } finally {
        if (!cancelled) setCropBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [stage, currentFile]);

  useEffect(() => {
    if (stage !== 'preview' || !baseFile) return undefined;
    let cancelled = false;
    setProcessing(true);
    (async () => {
      try {
        const next = await renderDocumentFile(baseFile, {
          filter,
          rotation,
          name:`road-ready-page-${pageNumber}-${filter}.jpg`,
          maxDimension:2600,
        });
        if (cancelled) return;
        revoke(processedUrl);
        setProcessedFile(next);
        setProcessedUrl(URL.createObjectURL(next));
      } catch {
        if (!cancelled) {
          setProcessedFile(baseFile);
          revoke(processedUrl);
          setProcessedUrl(URL.createObjectURL(baseFile));
        }
      } finally {
        if (!cancelled) setProcessing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [stage, baseFile, filter, rotation, pageNumber]);

  async function capturePage() {
    if (capturing || cameraState !== 'ready') return;
    setCapturing(true);
    try {
      const file = await captureVideoFile(videoRef.current, trackRef.current, `road-ready-capture-${Date.now()}.jpg`);
      stopCamera();
      revoke(currentUrl);
      setCurrentFile(file);
      setCurrentUrl(URL.createObjectURL(file));
      setCropCorners(frameFound ? liveCorners : defaultDocumentCorners());
      setStage('crop');
    } catch (error) {
      setCameraError(`Could not capture the page. ${String(error?.message || error)}`);
    } finally {
      setCapturing(false);
    }
  }

  function cycleFlash() {
    if (!torchSupported) return;
    setFlashMode(current => current === 'auto' ? 'on' : current === 'on' ? 'off' : 'auto');
  }

  function beginCornerDrag(key, event) {
    event.preventDefault();
    const rect = cropFrameRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { key, rect, pointerId:event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveCorner(key, event) {
    if (!dragRef.current || dragRef.current.key !== key) return;
    const { rect } = dragRef.current;
    const x = Math.max(.01, Math.min(.99, (event.clientX - rect.left) / rect.width));
    const y = Math.max(.01, Math.min(.99, (event.clientY - rect.top) / rect.height));
    setCropCorners(current => ({ ...current, [key]:{ x, y } }));
  }

  function endCornerDrag(event) {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  }

  async function applyFrame() {
    if (!currentFile || cropBusy) return;
    setCropBusy(true);
    try {
      const cropped = await perspectiveCropFile(currentFile, cropCorners, {
        onStatus:setVisionStatus,
        name:`road-ready-page-${pageNumber}-cropped.jpg`,
      });
      setBaseFile(cropped);
      setFilter('auto');
      setRotation(0);
      setStage('preview');
    } finally {
      setCropBusy(false);
    }
  }

  function retake() {
    revoke(currentUrl);
    revoke(processedUrl);
    setCurrentFile(null);
    setCurrentUrl('');
    setBaseFile(null);
    setProcessedFile(null);
    setProcessedUrl('');
    startWebCamera();
  }

  function acceptedPage() {
    if (!processedFile) return null;
    return {
      file:processedFile,
      previewUrl:processedUrl,
      filter,
      rotation,
    };
  }

  async function addAnotherPage() {
    const page = acceptedPage();
    if (!page || processing) return;
    setPages(current => [...current, page]);
    setCurrentFile(null);
    setCurrentUrl('');
    setBaseFile(null);
    setProcessedFile(null);
    setProcessedUrl('');
    setRotation(0);
    setFilter('auto');
    await startWebCamera();
  }

  async function finishScan() {
    const page = acceptedPage();
    if (!page || processing) return;
    setProcessing(true);
    try {
      const allPages = [...pages.map(item => item.file), page.file];
      const output = await composePageFiles(allPages, `road-ready-scan-${Date.now()}.jpg`);
      onComplete?.(output, {
        source:'road-ready-web-document-scanner',
        pageCount:allPages.length,
        filter,
        perspectiveCorrected:true,
      });
    } finally {
      setProcessing(false);
    }
  }

  function deleteCurrentPage() {
    if (pages.length) {
      const previous = pages[pages.length - 1];
      setPages(current => current.slice(0, -1));
      setBaseFile(previous.file);
      setProcessedFile(previous.file);
      revoke(processedUrl);
      setProcessedUrl(URL.createObjectURL(previous.file));
      setFilter(previous.filter || 'auto');
      setRotation(previous.rotation || 0);
      setStage('preview');
      return;
    }
    retake();
  }

  async function chooseImportedFile(file) {
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      onComplete?.(file, { source:'file-import', pageCount:1 });
      return;
    }
    stopCamera();
    revoke(currentUrl);
    setCurrentFile(file);
    setCurrentUrl(URL.createObjectURL(file));
    setCropCorners(defaultDocumentCorners());
    setStage('crop');
  }

  const flashLabel = torchSupported ? (flashMode === 'auto' ? 'Auto flash' : flashMode === 'on' ? 'Flash on' : 'Flash off') : 'Flash unavailable';
  const cornerEntries = useMemo(() => Object.entries(normalizeDocumentCorners(cropCorners)), [cropCorners]);

  if (stage === 'camera') {
    return (
      <section className="turbo-scan-screen camera-stage">
        <header className="turbo-camera-head">
          <button type="button" className={!torchSupported ? 'disabled' : flashMode} onClick={cycleFlash} aria-label={flashLabel}><Icon name="flash" /></button>
          <div><b>Page <span>{pageNumber}</span></b><em>{visionStatus}</em></div>
          <button type="button" onClick={onCancel} aria-label="Close scanner"><Icon name="close" /></button>
        </header>

        <main className="turbo-camera-body">
          <div className="turbo-camera-media" style={{ aspectRatio:videoAspect }}>
            <video ref={videoRef} autoPlay playsInline muted />
            {cameraState === 'ready' ? (
              <svg className={`turbo-live-frame ${frameFound ? 'found' : ''}`} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polygon points={polygonPoints(cameraCorners)} />
              </svg>
            ) : null}
            {cameraState === 'starting' || cameraState === 'native' ? <div className="turbo-camera-loading"><span /><b>{cameraState === 'native' ? 'Opening native scanner…' : 'Starting camera…'}</b></div> : null}
            {cameraState === 'error' ? <div className="turbo-camera-error"><Icon name="camera" size={36} /><b>Camera unavailable</b><p>{cameraError}</p><button type="button" onClick={startWebCamera}>Try again</button></div> : null}
          </div>
          <div className={`turbo-quality ${qualityTone(quality)}`}><i /> <span>{cameraState === 'ready' ? quality.hint : cameraError || 'Preparing scanner'}</span></div>
        </main>

        <footer className="turbo-camera-controls">
          <button type="button" className={autoFrame ? 'mode active' : 'mode'} onClick={() => setAutoFrame(value => !value)}>{autoFrame ? 'Auto' : 'Manual'}</button>
          <button type="button" className="turbo-shutter" disabled={cameraState !== 'ready' || capturing} onClick={capturePage}><span>{capturing ? '…' : ''}</span></button>
          <button type="button" className="gallery" onClick={() => galleryRef.current?.click()} aria-label="Choose photo"><Icon name="gallery" /></button>
          <input ref={galleryRef} className="smart-scan-file-input" type="file" accept="image/*,application/pdf,text/plain" onChange={event => chooseImportedFile(event.target.files?.[0] || null)} />
        </footer>
      </section>
    );
  }

  if (stage === 'crop') {
    return (
      <section className="turbo-scan-screen crop-stage">
        <header className="turbo-edit-head">
          <button type="button" onClick={retake}>Retake</button>
          <div><b>Frame</b><em>Page {pageNumber}</em></div>
          <button type="button" className="next" onClick={applyFrame} disabled={cropBusy}>{cropBusy ? 'Working…' : 'Next'}</button>
        </header>
        <main className="turbo-crop-body">
          <div className="turbo-crop-frame" ref={cropFrameRef}>
            {currentUrl ? <img src={currentUrl} alt="Captured document" draggable="false" /> : null}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={polygonPoints(cropCorners)} /></svg>
            {cornerEntries.map(([key, point]) => (
              <button
                key={key}
                type="button"
                className={`turbo-corner ${key}`}
                style={{ left:`${point.x * 100}%`, top:`${point.y * 100}%` }}
                onPointerDown={event => beginCornerDrag(key, event)}
                onPointerMove={event => moveCorner(key, event)}
                onPointerUp={endCornerDrag}
                onPointerCancel={endCornerDrag}
                aria-label={`Move ${key} corner`}
              />
            ))}
          </div>
          <div className="turbo-crop-actions">
            <button type="button" onClick={async () => {
              if (!currentFile) return;
              setCropBusy(true);
              try {
                const image = await fileToImage(currentFile);
                const detected = await detectDocumentCorners(image, { onStatus:setVisionStatus });
                setCropCorners(detected || defaultDocumentCorners());
              } catch { setCropCorners(defaultDocumentCorners()); }
              finally { setCropBusy(false); }
            }}><Icon name="frame" size={19} /> Auto frame</button>
            <span>Drag all four corners to the paper edge.</span>
          </div>
        </main>
      </section>
    );
  }

  return (
    <section className="turbo-scan-screen preview-stage">
      <header className="turbo-edit-head">
        <button type="button" onClick={() => setStage('crop')}>Frame</button>
        <div><b>Preview</b><em>Page {pageNumber}</em></div>
        <button type="button" className="next" onClick={finishScan} disabled={processing || !processedFile}>{processing ? 'Working…' : 'Next'}</button>
      </header>

      <main className="turbo-preview-body">
        <div className="turbo-preview-paper">
          {processedUrl ? <img src={processedUrl} alt="Enhanced scanned document" /> : null}
          {processing ? <div className="turbo-preview-processing"><span /><b>Enhancing page…</b></div> : null}
        </div>
        <div className="turbo-filter-strip" role="group" aria-label="Document filters">
          {FILTERS.map(item => (
            <button key={item.id} type="button" className={filter === item.id ? 'selected' : ''} onClick={() => setFilter(item.id)}>
              <span className={filterClass(item.id)} />
              <em>{item.label}</em>
            </button>
          ))}
        </div>
      </main>

      <footer className="turbo-preview-tools">
        <button type="button" onClick={deleteCurrentPage} aria-label="Delete page"><Icon name="trash" /></button>
        <button type="button" onClick={() => setRotation(value => value - 90)} aria-label="Rotate left"><Icon name="rotate-left" /></button>
        <button type="button" className="filter-label" onClick={() => setFilter(current => current === 'bw' ? 'auto' : 'bw')}>{FILTERS.find(item => item.id === filter)?.label || 'Auto'}</button>
        <button type="button" onClick={() => setRotation(value => value + 90)} aria-label="Rotate right"><Icon name="rotate-right" /></button>
        <button type="button" onClick={addAnotherPage} aria-label="Add another page"><Icon name="page-add" /></button>
      </footer>
    </section>
  );
}

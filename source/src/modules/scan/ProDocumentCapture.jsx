import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeDocumentQualityCanvas,
  buildScanEditorPreview,
  defaultDocumentCorners,
  processDocumentImage,
} from './documentImagePipeline.js';

const MODE_CHOICES = [
  ['auto', 'Auto'],
  ['rate_confirmation', 'Rate Con'],
  ['bol', 'BOL'],
  ['pod', 'POD'],
  ['fuel_receipt', 'Fuel'],
  ['carrier_settlement', 'Settlement'],
  ['repair_invoice', 'Repair'],
  ['other_expense', 'Receipt'],
];

const FILTERS = [
  ['original', 'Original'],
  ['color', 'Color'],
  ['clean', 'Clean'],
  ['bw', 'B&W'],
];

function Icon({ name, size = 22 }) {
  const common = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:'1.8', strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':'true' };
  if (name === 'camera') return <svg {...common}><path d="M4 7h4l2-2h4l2 2h4v12H4z"/><circle cx="12" cy="13" r="4"/></svg>;
  if (name === 'flash') return <svg {...common}><path d="m13 2-8 12h7l-1 8 8-12h-7z"/></svg>;
  if (name === 'gallery') return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="2"/><path d="m21 15-5-5L5 20"/></svg>;
  if (name === 'rotate') return <svg {...common}><path d="M4 4v6h6M20 20v-6h-6"/><path d="M5.5 15a7 7 0 0 0 11.8 2M18.5 9A7 7 0 0 0 6.7 7"/></svg>;
  if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === 'retake') return <svg {...common}><path d="M4 4v6h6"/><path d="M5.6 15a7 7 0 1 0 1-8"/></svg>;
  if (name === 'auto') return <svg {...common}><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3z"/><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
}

function fileFromCanvas(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('camera_capture_failed'));
        return;
      }
      resolve(new File([blob], `road-ready-${Date.now()}.jpg`, { type:'image/jpeg', lastModified:Date.now() }));
    }, 'image/jpeg', 0.94);
  });
}

function filterCss(filter) {
  if (filter === 'color') return 'contrast(1.09) saturate(1.1) brightness(1.03)';
  if (filter === 'clean') return 'grayscale(.35) contrast(1.32) brightness(1.09)';
  if (filter === 'bw') return 'grayscale(1) contrast(1.85) brightness(1.08)';
  return 'none';
}

function qualityTone(quality = {}) {
  if (quality.score >= 82) return 'good';
  if (quality.score >= 58) return 'warn';
  return 'bad';
}

function flashLabel(mode, on) {
  if (mode === 'auto') return on ? 'Flash Auto · On' : 'Flash Auto';
  return mode === 'on' ? 'Flash On' : 'Flash Off';
}

export default function ProDocumentCapture({ onReady, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const qualityTimerRef = useRef(null);
  const captureBusyRef = useRef(false);
  const captureRef = useRef(null);
  const stableFramesRef = useRef(0);
  const inputRef = useRef(null);
  const imageRef = useRef(null);
  const activeCornerRef = useRef(null);

  const [stage, setStage] = useState('camera');
  const [preferredType, setPreferredType] = useState('auto');
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [flashMode, setFlashMode] = useState('auto');
  const [autoCapture, setAutoCapture] = useState(true);
  const [quality, setQuality] = useState({ score:0, message:'Starting camera…', corners:defaultDocumentCorners() });
  const [captureBusy, setCaptureBusy] = useState(false);
  const [rawFile, setRawFile] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [filter, setFilter] = useState('clean');
  const [editor, setEditor] = useState(null);
  const [editorBusy, setEditorBusy] = useState(false);

  function stopCamera() {
    if (qualityTimerRef.current) clearInterval(qualityTimerRef.current);
    qualityTimerRef.current = null;
    for (const track of streamRef.current?.getTracks?.() || []) track.stop();
    streamRef.current = null;
    trackRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
    setTorchOn(false);
  }

  async function applyTorch(value) {
    const track = trackRef.current;
    if (!track || !torchSupported) return false;
    try {
      await track.applyConstraints({ advanced:[{ torch:Boolean(value) }] });
      setTorchOn(Boolean(value));
      return true;
    } catch {
      try {
        await track.applyConstraints({ torch:Boolean(value) });
        setTorchOn(Boolean(value));
        return true;
      } catch {
        return false;
      }
    }
  }

  async function startCamera() {
    stopCamera();
    setCameraError('');
    setQuality({ score:0, message:'Starting camera…', corners:defaultDocumentCorners() });
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Live camera is unavailable here. Choose a photo from the phone instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio:false,
        video:{
          facingMode:{ ideal:'environment' },
          width:{ ideal:3840 },
          height:{ ideal:2160 },
        },
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0] || null;
      trackRef.current = track;
      const capabilities = track?.getCapabilities?.() || {};
      const torch = capabilities.torch === true || (Array.isArray(capabilities.torch) && capabilities.torch.includes(true));
      setTorchSupported(Boolean(torch));
      try {
        if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
          await track.applyConstraints({ advanced:[{ focusMode:'continuous' }] });
        }
      } catch {}
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        setCameraReady(true);
      }

      const sample = document.createElement('canvas');
      sample.width = 320;
      sample.height = 240;
      const ctx = sample.getContext('2d', { alpha:false, willReadFrequently:true });
      qualityTimerRef.current = setInterval(() => {
        const currentVideo = videoRef.current;
        if (!currentVideo?.videoWidth || captureBusyRef.current) return;
        const ratio = currentVideo.videoWidth / currentVideo.videoHeight;
        sample.width = 320;
        sample.height = Math.max(180, Math.round(320 / ratio));
        try {
          ctx.drawImage(currentVideo, 0, 0, sample.width, sample.height);
          const next = analyzeDocumentQualityCanvas(sample);
          setQuality(next);
          const ready = next.score >= 84 && next.cornerConfidence >= 0.42 && next.coverage >= 0.43;
          stableFramesRef.current = ready ? stableFramesRef.current + 1 : 0;
          if (autoCapture && stableFramesRef.current >= 4 && !captureBusyRef.current) {
            stableFramesRef.current = 0;
            captureRef.current?.(true);
          }
        } catch {}
      }, 520);
    } catch (error) {
      setCameraError(error?.name === 'NotAllowedError'
        ? 'Camera permission is blocked. Allow Camera access or choose a photo.'
        : 'Could not open the live camera. Choose a photo from the phone instead.');
    }
  }

  useEffect(() => {
    if (stage === 'camera') startCamera();
    return () => stopCamera();
  }, [stage]);

  useEffect(() => {
    if (!torchSupported || stage !== 'camera') return;
    if (flashMode === 'on') applyTorch(true);
    else if (flashMode === 'off') applyTorch(false);
    else if (quality.tooDark && !torchOn) applyTorch(true);
    else if (!quality.tooDark && quality.brightness > 105 && torchOn) applyTorch(false);
  }, [flashMode, quality.tooDark, quality.brightness, torchSupported, stage]);

  useEffect(() => () => {
    if (editor?.previewUrl) URL.revokeObjectURL(editor.previewUrl);
  }, [editor?.previewUrl]);

  async function openEditor(nextFile, nextRotation = 0) {
    if (!nextFile) return;
    stopCamera();
    setRawFile(nextFile);
    setStage('edit');
    setEditorBusy(true);
    setCameraError('');
    try {
      const nextEditor = await buildScanEditorPreview(nextFile, { rotation:nextRotation });
      setEditor(current => {
        if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl);
        return nextEditor;
      });
    } catch (error) {
      setCameraError(`Could not prepare this image. ${String(error?.message || error)}`);
    } finally {
      setEditorBusy(false);
    }
  }

  async function capturePhoto() {
    if (captureBusyRef.current) return;
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    captureBusyRef.current = true;
    setCaptureBusy(true);
    try {
      let nextFile = null;
      const track = trackRef.current;
      if (track && typeof ImageCapture === 'function') {
        try {
          const imageCapture = new ImageCapture(track);
          const blob = await imageCapture.takePhoto();
          nextFile = new File([blob], `road-ready-${Date.now()}.${blob.type.includes('png') ? 'png' : 'jpg'}`, { type:blob.type || 'image/jpeg', lastModified:Date.now() });
        } catch {}
      }
      if (!nextFile) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { alpha:false });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        nextFile = await fileFromCanvas(canvas);
      }
      await openEditor(nextFile, 0);
    } catch (error) {
      setCameraError(`Photo failed. ${String(error?.message || error)}`);
    } finally {
      captureBusyRef.current = false;
      setCaptureBusy(false);
    }
  }
  captureRef.current = capturePhoto;

  function cycleFlash() {
    if (!torchSupported) return;
    setFlashMode(current => current === 'auto' ? 'on' : current === 'on' ? 'off' : 'auto');
  }

  async function importFile(nextFile) {
    if (!nextFile) return;
    if (String(nextFile.type || '').startsWith('image/')) {
      await openEditor(nextFile, 0);
    } else {
      stopCamera();
      onReady?.(nextFile, preferredType);
    }
  }

  async function rotateEditor() {
    if (!rawFile || editorBusy) return;
    const nextRotation = (rotation + 90) % 360;
    setRotation(nextRotation);
    await openEditor(rawFile, nextRotation);
  }

  function updateCorner(index, x, y) {
    setEditor(current => {
      if (!current) return current;
      const corners = (current.corners || defaultDocumentCorners()).map(point => ({ ...point }));
      corners[index] = { x:Math.max(0.005, Math.min(0.995, x)), y:Math.max(0.005, Math.min(0.995, y)) };
      return { ...current, corners };
    });
  }

  useEffect(() => {
    function move(event) {
      const index = activeCornerRef.current;
      const image = imageRef.current;
      if (index == null || !image) return;
      const rect = image.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      updateCorner(index, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
      event.preventDefault();
    }
    function up() {
      activeCornerRef.current = null;
    }
    window.addEventListener('pointermove', move, { passive:false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  async function useScan() {
    if (!rawFile || !editor || editorBusy) return;
    setEditorBusy(true);
    try {
      const processed = await processDocumentImage(rawFile, {
        rotation,
        corners:editor.corners,
        filter,
        maxEdge:1900,
      });
      onReady?.(processed, preferredType);
    } catch (error) {
      setCameraError(`Could not finish the scan. ${String(error?.message || error)}`);
    } finally {
      setEditorBusy(false);
    }
  }

  const polygon = useMemo(() => (quality.corners || defaultDocumentCorners()).map(point => `${point.x * 100},${point.y * 100}`).join(' '), [quality.corners]);
  const editorPolygon = useMemo(() => (editor?.corners || defaultDocumentCorners()).map(point => `${point.x * 100},${point.y * 100}`).join(' '), [editor?.corners]);

  if (stage === 'edit') {
    return (
      <main className="pro-scan-editor">
        <section className="pro-scan-editor-head">
          <div><span>Adjust document</span><b>Drag the blue corners to the paper edges.</b></div>
          <button type="button" onClick={rotateEditor} disabled={editorBusy}><Icon name="rotate" size={18} /> Rotate</button>
        </section>

        <section className="pro-scan-crop-stage">
          {editor?.previewUrl ? (
            <div className="pro-scan-crop-image" ref={imageRef}>
              <img src={editor.previewUrl} alt="Document crop preview" style={{ filter:filterCss(filter) }} />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polygon points={editorPolygon} />
              </svg>
              {(editor.corners || defaultDocumentCorners()).map((point, index) => (
                <button
                  key={index}
                  type="button"
                  className="pro-scan-corner"
                  style={{ left:`${point.x * 100}%`, top:`${point.y * 100}%` }}
                  onPointerDown={event => {
                    activeCornerRef.current = index;
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    event.preventDefault();
                  }}
                  aria-label={`Move crop corner ${index + 1}`}
                />
              ))}
            </div>
          ) : (
            <div className="pro-scan-editor-loading">Preparing image…</div>
          )}
        </section>

        {editor?.quality ? (
          <section className={`pro-scan-quality-card ${qualityTone(editor.quality)}`}>
            <span>{editor.quality.score}</span>
            <div><b>Scan quality</b><em>{editor.quality.message}</em></div>
          </section>
        ) : null}

        <section className="pro-scan-filter-section">
          <div><span>Document cleanup</span><em>Choose the clearest text</em></div>
          <div className="pro-scan-filter-row">
            {FILTERS.map(([id, label]) => <button key={id} type="button" className={filter === id ? 'selected' : ''} onClick={() => setFilter(id)}>{label}</button>)}
          </div>
        </section>

        {cameraError ? <div className="pro-scan-error">{cameraError}</div> : null}
        <div className="pro-scan-editor-actions">
          <button type="button" className="secondary" onClick={() => { setStage('camera'); setRotation(0); setEditor(null); }}><Icon name="retake" size={18} /> Retake</button>
          <button type="button" className="primary" disabled={editorBusy || !editor} onClick={useScan}><Icon name="check" size={18} /> {editorBusy ? 'Cleaning…' : 'Use scan'}</button>
        </div>
      </main>
    );
  }

  return (
    <main className="pro-document-capture">
      <section className="pro-scan-mode-bar">
        <div><b>What are you scanning?</b><em>Selecting a type improves recognition.</em></div>
        <div className="pro-scan-mode-row">
          {MODE_CHOICES.map(([id, label]) => <button key={id} type="button" className={preferredType === id ? 'selected' : ''} onClick={() => setPreferredType(id)}>{label}</button>)}
        </div>
      </section>

      <section className="pro-camera-shell">
        <video ref={videoRef} autoPlay muted playsInline />
        <div className="pro-camera-shade" />
        <svg className="pro-camera-document-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon points={polygon} />
        </svg>
        <div className={`pro-camera-quality ${qualityTone(quality)}`}><span>{quality.score || '—'}</span><b>{cameraReady ? quality.message : cameraError || 'Opening camera…'}</b></div>
        <button type="button" className={`pro-camera-flash ${torchOn ? 'active' : ''}`} onClick={cycleFlash} disabled={!torchSupported}><Icon name="flash" size={18} /><span>{torchSupported ? flashLabel(flashMode, torchOn) : 'Flash unavailable'}</span></button>
        <div className="pro-camera-guide"><i className="tl"/><i className="tr"/><i className="br"/><i className="bl"/></div>
      </section>

      <section className="pro-camera-controls">
        <button type="button" className="pro-camera-gallery" onClick={() => inputRef.current?.click()}><Icon name="gallery" size={22} /><span>Photos</span></button>
        <button type="button" className="pro-camera-shutter" onClick={() => capturePhoto(false)} disabled={!cameraReady || captureBusy} aria-label="Capture document"><span>{captureBusy ? '…' : ''}</span></button>
        <button type="button" className={autoCapture ? 'pro-camera-auto active' : 'pro-camera-auto'} onClick={() => { stableFramesRef.current = 0; setAutoCapture(value => !value); }}><Icon name="auto" size={22} /><span>Auto {autoCapture ? 'On' : 'Off'}</span></button>
      </section>

      <input ref={inputRef} className="smart-scan-file-input" type="file" accept="image/*,application/pdf,text/plain" capture="environment" onChange={event => importFile(event.target.files?.[0] || null)} />
      {cameraError ? <div className="pro-scan-camera-fallback"><p>{cameraError}</p><button type="button" onClick={() => inputRef.current?.click()}>Choose photo or file</button>{onClose ? <button type="button" className="quiet" onClick={onClose}>Close</button> : null}</div> : null}
      <p className="pro-scan-privacy">Document cleanup and web OCR run on this device. The image is saved only after you confirm.</p>
    </main>
  );
}

import React, { useMemo, useRef, useState } from 'react';
import TurboDocumentScanner from './TurboDocumentScanner.jsx';

const SCAN_TYPES = [
  { id:'auto', label:'Auto detect', detail:'Let Road Ready recognize the document', icon:'spark' },
  { id:'bol', label:'BOL', detail:'Bill of lading and shipping paperwork', icon:'document' },
  { id:'pod', label:'POD', detail:'Signed proof of delivery', icon:'check' },
  { id:'rate_confirmation', label:'Rate Con', detail:'Rate confirmation and load details', icon:'money' },
  { id:'fuel_receipt', label:'Fuel', detail:'Diesel, gallons, price and IFTA state', icon:'fuel' },
  { id:'carrier_settlement', label:'Settlement', detail:'Percentage pay, deductions and net', icon:'percent' },
  { id:'repair_invoice', label:'Repair', detail:'Parts, labor, service and odometer', icon:'wrench' },
  { id:'other_expense', label:'Receipt', detail:'Lumper, scale, toll, parking or expense', icon:'receipt' },
];

function Icon({ name, size = 23 }) {
  const common = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:'1.8', strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':'true' };
  if (name === 'close') return <svg {...common}><path d="M6 6l12 12M18 6 6 18" /></svg>;
  if (name === 'spark') return <svg {...common}><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" /></svg>;
  if (name === 'document') return <svg {...common}><path d="M6 3h9l3 3v15H6zM15 3v4h4M9 11h6M9 15h6" /></svg>;
  if (name === 'check') return <svg {...common}><path d="M6 3h9l3 3v15H6zM15 3v4h4" /><path d="m9 14 2 2 4-5" /></svg>;
  if (name === 'money') return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 12h10M12 8v8" /></svg>;
  if (name === 'fuel') return <svg {...common}><path d="M5 21V4h9v17M3 21h13M7 7h5v4H7z" /><path d="M14 8h2l3 3v7a2 2 0 0 0 2 2V9l-2-2" /></svg>;
  if (name === 'percent') return <svg {...common}><circle cx="7" cy="7" r="2" /><circle cx="17" cy="17" r="2" /><path d="m6 18 12-12" /></svg>;
  if (name === 'wrench') return <svg {...common}><path d="M14.5 6.5a4 4 0 0 0-5-5L12 4 9 7 6.5 4.5a4 4 0 0 0 5 5L19 17a2.1 2.1 0 0 1-3 3l-7.5-7.5" /></svg>;
  if (name === 'receipt') return <svg {...common}><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>;
  if (name === 'camera') return <svg {...common}><path d="M4 7h4l2-2h4l2 2h4v12H4z" /><circle cx="12" cy="13" r="4" /></svg>;
  if (name === 'flash') return <svg {...common}><path d="m13 2-8 12h7l-1 8 8-12h-7z" /></svg>;
  if (name === 'chevron') return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>;
}

export default function SmartDocumentCapture({ onReady, onClose }) {
  const nativeCameraRef = useRef(null);
  const [preferredType, setPreferredType] = useState('auto');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [initialFile, setInitialFile] = useState(null);
  const selected = useMemo(() => SCAN_TYPES.find(item => item.id === preferredType) || SCAN_TYPES[0], [preferredType]);

  function openLiveScanner() {
    setInitialFile(null);
    setScannerOpen(true);
  }

  function openNativePhoto(file) {
    if (!file) return;
    setInitialFile(file);
    setScannerOpen(true);
  }

  if (scannerOpen) {
    return (
      <TurboDocumentScanner
        initialFile={initialFile}
        onCancel={() => { setScannerOpen(false); setInitialFile(null); }}
        onComplete={(file, metadata = {}) => onReady?.(file, preferredType, { ...metadata, preferredType })}
      />
    );
  }

  return (
    <section className="scan-preflight-screen">
      <header className="scan-preflight-head">
        <button type="button" onClick={onClose} aria-label="Close scanner"><Icon name="close" /></button>
        <div><b>Smart Scan</b><em>Choose document type</em></div>
        <span />
      </header>

      <main className="scan-preflight-body">
        <div className="scan-preflight-hero">
          <span><Icon name="spark" size={30} /></span>
          <p>Better recognition</p>
          <h1>What are you scanning?</h1>
          <em>Selecting a type helps OCR read the right numbers and fields. Auto detect stays available.</em>
        </div>

        <div className="scan-preflight-grid" role="listbox" aria-label="Document type">
          {SCAN_TYPES.map(item => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={preferredType === item.id}
              className={preferredType === item.id ? 'selected' : ''}
              onClick={() => setPreferredType(item.id)}
            >
              <span><Icon name={item.icon} /></span>
              <b>{item.label}</b>
              <em>{item.detail}</em>
              <i>{preferredType === item.id ? '✓' : ''}</i>
            </button>
          ))}
        </div>

        <div className="scan-preflight-summary">
          <span><Icon name={selected.icon} /></span>
          <div><b>{selected.label}</b><em>{selected.detail}</em></div>
        </div>
      </main>

      <footer className="scan-preflight-actions two">
        <button type="button" className="primary" onClick={openLiveScanner}><Icon name="camera" /> Document camera <Icon name="chevron" size={18} /></button>
        <button type="button" className="native" onClick={() => nativeCameraRef.current?.click()}><Icon name="flash" /> Phone camera + flash</button>
        <input
          ref={nativeCameraRef}
          className="smart-scan-file-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={event => {
            const file = event.target.files?.[0] || null;
            event.target.value = '';
            openNativePhoto(file);
          }}
        />
      </footer>
    </section>
  );
}

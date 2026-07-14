import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addBusinessRecord, localDateKey, readBusinessStore } from '../business/businessStore.js';
import { analyzeScanFile, documentTypeMeta, SMART_DOCUMENT_TYPES } from './smartScan.js';
import { saveScannedDocument } from './scanStorage.js';

function Icon({ name, size = 22 }) {
  const common = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:'1.8', strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':'true' };
  if (name === 'camera') return <svg {...common}><path d="M4 7h4l2-2h4l2 2h4v12H4z"/><circle cx="12" cy="13" r="4"/></svg>;
  if (name === 'scan') return <svg {...common}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/></svg>;
  if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === 'spark') return <svg {...common}><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/></svg>;
  if (name === 'file') return <svg {...common}><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6"/></svg>;
  if (name === 'chevron') return <svg {...common}><path d="m9 18 6-6-6-6"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
}

function number(value = 0) {
  const parsed = Number(String(value ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateInputValue(value = '') {
  if (!value) return localDateKey();
  const match = String(value).match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!match) return localDateKey();
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}`;
}

function activeLoadNumber(state = {}) {
  return String(state.loadInfo?.shippingDocs || state.loadInfo?.loadNo || state.loadInfo?.bol || state.loadInfo?.po || '').trim();
}

function Field({ label, wide = false, children }) {
  return <label className={wide ? 'smart-scan-field wide' : 'smart-scan-field'}><span>{label}</span>{children}</label>;
}

function confidenceLabel(value = 0) {
  if (value >= 0.9) return 'High confidence';
  if (value >= 0.72) return 'Good match';
  return 'Review needed';
}

function methodLabel(method = '') {
  if (method === 'native') return 'Native mobile scan';
  if (method === 'on-device') return 'On-device text scan';
  if (method === 'text-file') return 'Text document scan';
  return 'Smart visual review';
}

export default function SmartScanSheet({ state, profile = {}, onClose, onSaved, onOpenBusiness }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [stage, setStage] = useState('capture');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [selectedType, setSelectedType] = useState('');
  const [fields, setFields] = useState({});
  const [saveError, setSaveError] = useState('');
  const [savedResult, setSavedResult] = useState(null);
  const [showText, setShowText] = useState(false);
  const currentLoadNo = activeLoadNumber(state);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const selectedMeta = useMemo(() => documentTypeMeta(selectedType || analysis?.type?.id || 'other'), [selectedType, analysis]);

  async function chooseFile(nextFile) {
    if (!nextFile) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(String(nextFile.type || '').startsWith('image/') ? URL.createObjectURL(nextFile) : '');
    setStage('analyzing');
    setProgress(0.05);
    setProgressText('Preparing document…');
    setSaveError('');
    setSavedResult(null);
    try {
      const result = await analyzeScanFile(nextFile, {
        onProgress:(value, text) => {
          setProgress(value);
          setProgressText(text);
        },
      });
      const nextType = result.type.id;
      setAnalysis(result);
      setSelectedType(nextType);
      setFields({
        date:dateInputValue(result.fields.date),
        title:result.type.label,
        loadNo:result.fields.loadNo || currentLoadNo,
        broker:'',
        merchant:result.fields.merchant || '',
        origin:result.fields.origin || '',
        destination:result.fields.destination || '',
        total:result.fields.total || '',
        gross:result.fields.grossPay || result.fields.total || '',
        expectedPay:'',
        actualPay:result.fields.netPay || result.fields.total || '',
        deductions:result.fields.deductions || '',
        gallons:result.fields.gallons || '',
        pricePerGallon:result.fields.pricePerGallon || '',
        odometer:result.fields.odometer || '',
        invoiceNo:result.fields.invoiceNo || '',
        seal:result.fields.seal || '',
        weight:result.fields.weight || '',
        notes:'',
      });
      setStage('review');
    } catch (error) {
      setSaveError(`Could not analyze this file. ${String(error?.message || error)}`);
      setAnalysis({ type:documentTypeMeta('other'), confidence:0.2, alternatives:SMART_DOCUMENT_TYPES.slice(0, 5), text:'', method:'smart-review', needsReview:true, fields:{} });
      setSelectedType('other');
      setFields({ date:localDateKey(), title:'Other Document', loadNo:currentLoadNo, notes:'' });
      setStage('review');
    }
  }

  function updateField(name, value) {
    setFields(current => ({ ...current, [name]:value }));
  }

  function changeType(id) {
    const meta = documentTypeMeta(id);
    setSelectedType(id);
    setFields(current => ({ ...current, title:current.title === analysis?.type?.label || !current.title ? meta.label : current.title }));
  }

  function scanAgain() {
    setAnalysis(null);
    setSelectedType('');
    setFields({});
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setStage('capture');
    setSaveError('');
    setSavedResult(null);
  }

  function expectedSettlement() {
    const gross = number(fields.gross || fields.total);
    const share = number(profile.driverSharePercent || 0);
    return gross > 0 && share > 0 ? gross * (share / 100) : 0;
  }

  async function save() {
    if (!file) return;
    setStage('saving');
    setSaveError('');
    try {
      const meta = selectedMeta;
      const store = readBusinessStore();
      const total = number(fields.total || fields.gross || fields.actualPay);
      const loadNo = String(fields.loadNo || currentLoadNo || '').trim().toUpperCase();
      const title = String(fields.title || meta.label).trim();
      const stored = await saveScannedDocument({
        file,
        type:meta.documentType,
        title,
        metadata:{
          loadNo,
          relationType:meta.id === 'bol' ? 'bol' : meta.id === 'pod' ? 'pod' : 'supporting_document',
          notes:String(fields.notes || '').trim(),
        },
        extracted:{ ...fields, type:meta.id },
        classification:{
          selectedType:meta.id,
          detectedType:analysis?.type?.id || 'other',
          confidence:analysis?.confidence || 0,
          method:analysis?.method || 'smart-review',
        },
      });

      let nextStore = store;
      if (meta.target === 'loads') {
        nextStore = addBusinessRecord(nextStore, 'loads', {
          date:fields.date || localDateKey(),
          loadNo,
          broker:String(fields.broker || '').trim(),
          origin:String(fields.origin || '').trim(),
          destination:String(fields.destination || '').trim(),
          gross:number(fields.gross || fields.total),
          loadedMiles:number(fields.loadedMiles),
          deadheadMiles:number(fields.deadheadMiles),
          status:'booked',
          source:'smart_scan',
          documentId:stored.localDocument.local_id,
        });
      } else if (meta.target === 'settlements') {
        const expectedPay = number(fields.expectedPay) || expectedSettlement();
        nextStore = addBusinessRecord(nextStore, 'settlements', {
          date:fields.date || localDateKey(),
          loadNo,
          carrier:String(profile.carrierName || fields.broker || '').trim(),
          gross:number(fields.gross),
          expectedPay,
          actualPay:number(fields.actualPay || fields.total),
          deductions:number(fields.deductions),
          difference:number(fields.actualPay || fields.total) - expectedPay,
          source:'smart_scan',
          documentId:stored.localDocument.local_id,
        });
      } else if (meta.target === 'fuel') {
        const gallons = number(fields.gallons);
        const fuelTotal = number(fields.total) || (gallons * number(fields.pricePerGallon));
        nextStore = addBusinessRecord(nextStore, 'fuel', {
          date:fields.date || localDateKey(),
          merchant:String(fields.merchant || '').trim(),
          cityState:String(fields.cityState || '').trim(),
          gallons,
          pricePerGallon:number(fields.pricePerGallon) || (gallons > 0 ? fuelTotal / gallons : 0),
          total:fuelTotal,
          odometer:number(fields.odometer),
          receiptAttached:true,
          source:'smart_scan',
          documentId:stored.localDocument.local_id,
        });
      } else if (meta.target === 'maintenance') {
        nextStore = addBusinessRecord(nextStore, 'maintenance', {
          date:fields.date || localDateKey(),
          vendor:String(fields.merchant || '').trim(),
          category:String(fields.category || 'Other'),
          total,
          odometer:number(fields.odometer),
          nextDueMiles:number(fields.nextDueMiles),
          notes:String(fields.notes || '').trim(),
          source:'smart_scan',
          documentId:stored.localDocument.local_id,
        });
      } else if (meta.target === 'expenses') {
        const category = meta.id === 'lumper_receipt' ? 'Lumper' : meta.id === 'scale_ticket' ? 'Scale' : meta.id === 'toll_parking_receipt' ? 'Tolls / Parking' : 'Other';
        nextStore = addBusinessRecord(nextStore, 'expenses', {
          date:fields.date || localDateKey(),
          merchant:String(fields.merchant || title).trim(),
          category,
          total,
          loadNo,
          reimbursable:meta.id === 'lumper_receipt',
          receiptAttached:true,
          source:'smart_scan',
          documentId:stored.localDocument.local_id,
        });
      }

      nextStore = addBusinessRecord(nextStore, 'documents', {
        date:fields.date || localDateKey(),
        type:meta.id,
        label:meta.label,
        title,
        loadNo,
        amount:total,
        localDocumentId:stored.localDocument.local_id,
        clientDocumentId:stored.localDocument.client_document_id,
        fileName:stored.localDocument.original_file_name,
        syncState:stored.cloud.status,
        confidence:analysis?.confidence || 0,
        source:'smart_scan',
      });

      const result = {
        type:meta,
        fields,
        localDocument:stored.localDocument,
        cloud:stored.cloud,
        store:nextStore,
      };
      setSavedResult(result);
      setStage('saved');
      onSaved?.(result);
    } catch (error) {
      setSaveError(`Document was not saved. ${String(error?.message || error)}`);
      setStage('review');
    }
  }

  const confidence = Math.round((analysis?.confidence || 0) * 100);

  return (
    <section className="screen smart-scan-screen">
      <header className="smart-scan-head">
        <button type="button" onClick={onClose} aria-label="Close scanner">‹</button>
        <div><b>Smart Scan</b><em>Camera · classify · organize</em></div>
        <button type="button" className="smart-scan-reset" onClick={scanAgain} disabled={stage === 'capture'}>New</button>
      </header>

      {stage === 'capture' && (
        <main className="smart-scan-capture">
          <span className="smart-scan-hero"><Icon name="scan" size={38} /></span>
          <p className="smart-scan-kicker">One camera for the whole business</p>
          <h1>Scan it. Road Ready will sort it.</h1>
          <p>Rate con, settlement, BOL, POD, fuel, repair, scale, lumper, insurance and more.</p>
          <button type="button" className="smart-scan-camera" onClick={() => inputRef.current?.click()}><Icon name="camera" size={23} /> Take photo or choose file</button>
          <input ref={inputRef} className="smart-scan-file-input" type="file" accept="image/*,application/pdf,text/plain" capture="environment" onChange={event => chooseFile(event.target.files?.[0] || null)} />
          <div className="smart-scan-capabilities">
            <div><span><Icon name="spark" size={19} /></span><b>Smart classification</b><em>Matches document language and receipt patterns.</em></div>
            <div><span><Icon name="file" size={19} /></span><b>Offline-first copy</b><em>Keeps a local document even when service is weak.</em></div>
            <div><span><Icon name="check" size={19} /></span><b>Driver confirms</b><em>No financial or load detail is accepted silently.</em></div>
          </div>
          <p className="smart-scan-native-note">The scan bridge is ready for native iPhone and Android OCR later. The web app uses on-device text recognition when the phone supports it.</p>
        </main>
      )}

      {stage === 'analyzing' && (
        <main className="smart-scan-analyzing">
          <span className="smart-scan-pulse"><Icon name="scan" size={36} /></span>
          <h1>Reading document</h1>
          <p>{progressText || 'Analyzing…'}</p>
          <div className="smart-scan-progress"><span style={{ width:`${Math.max(6, progress * 100)}%` }} /></div>
          <small>{file?.name}</small>
        </main>
      )}

      {(stage === 'review' || stage === 'saving') && analysis && (
        <main className="smart-scan-review">
          <section className="smart-scan-preview-card">
            {previewUrl ? <img src={previewUrl} alt="Scanned document preview" /> : <div className="smart-scan-file-preview"><Icon name="file" size={38} /><b>{file?.name || 'Document'}</b><span>{file?.type || 'File'}</span></div>}
            <div className="smart-scan-detection">
              <span className={analysis.needsReview ? 'review' : 'good'}><Icon name={analysis.needsReview ? 'spark' : 'check'} size={16} /> {confidenceLabel(analysis.confidence)}</span>
              <b>{selectedMeta.label}</b>
              <em>{methodLabel(analysis.method)} · {confidence}% match</em>
            </div>
          </section>

          <section className="smart-scan-type-card">
            <div className="smart-scan-section-title"><span>Document type</span><em>Tap to correct</em></div>
            <div className="smart-scan-type-grid">
              {[...new Map([...(analysis.alternatives || []), documentTypeMeta(selectedType), documentTypeMeta('other')].map(type => [type.id, type])).values()].slice(0, 6).map(type => (
                <button key={type.id} type="button" className={selectedType === type.id ? 'selected' : ''} onClick={() => changeType(type.id)}>{selectedType === type.id ? '✓ ' : ''}{type.short}</button>
              ))}
            </div>
            <select value={selectedType} onChange={event => changeType(event.target.value)}>{SMART_DOCUMENT_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select>
          </section>

          <section className="smart-scan-fields-card">
            <div className="smart-scan-section-title"><span>Review details</span><em>Confirm before save</em></div>
            <div className="smart-scan-form-grid">
              <Field label="Date"><input type="date" value={fields.date || localDateKey()} onChange={event => updateField('date', event.target.value)} /></Field>
              <Field label="Load #"><input value={fields.loadNo || ''} onChange={event => updateField('loadNo', event.target.value.toUpperCase())} placeholder={currentLoadNo || 'Load / BOL / PO'} /></Field>

              {selectedType === 'rate_confirmation' && <>
                <Field label="Broker" wide><input value={fields.broker || ''} onChange={event => updateField('broker', event.target.value)} placeholder="Broker or customer" /></Field>
                <Field label="Pickup" wide><input value={fields.origin || ''} onChange={event => updateField('origin', event.target.value)} placeholder="City, ST" /></Field>
                <Field label="Delivery" wide><input value={fields.destination || ''} onChange={event => updateField('destination', event.target.value)} placeholder="City, ST" /></Field>
                <Field label="Gross"><input inputMode="decimal" value={fields.gross || ''} onChange={event => updateField('gross', event.target.value)} placeholder="$0.00" /></Field>
                <Field label="Loaded miles"><input inputMode="numeric" value={fields.loadedMiles || ''} onChange={event => updateField('loadedMiles', event.target.value)} placeholder="0" /></Field>
                <Field label="Deadhead"><input inputMode="numeric" value={fields.deadheadMiles || ''} onChange={event => updateField('deadheadMiles', event.target.value)} placeholder="0" /></Field>
              </>}

              {selectedType === 'carrier_settlement' && <>
                <Field label="Settlement gross"><input inputMode="decimal" value={fields.gross || ''} onChange={event => updateField('gross', event.target.value)} placeholder="$0.00" /></Field>
                <Field label="Expected pay"><input inputMode="decimal" value={fields.expectedPay || expectedSettlement() || ''} onChange={event => updateField('expectedPay', event.target.value)} placeholder="$0.00" /></Field>
                <Field label="Actual net"><input inputMode="decimal" value={fields.actualPay || ''} onChange={event => updateField('actualPay', event.target.value)} placeholder="$0.00" /></Field>
                <Field label="Deductions"><input inputMode="decimal" value={fields.deductions || ''} onChange={event => updateField('deductions', event.target.value)} placeholder="$0.00" /></Field>
              </>}

              {selectedType === 'fuel_receipt' && <>
                <Field label="Truck stop" wide><input value={fields.merchant || ''} onChange={event => updateField('merchant', event.target.value)} placeholder="Pilot, Love's…" /></Field>
                <Field label="City, state" wide><input value={fields.cityState || ''} onChange={event => updateField('cityState', event.target.value)} placeholder="City, ST" /></Field>
                <Field label="Gallons"><input inputMode="decimal" value={fields.gallons || ''} onChange={event => updateField('gallons', event.target.value)} placeholder="0.0" /></Field>
                <Field label="Price / gal"><input inputMode="decimal" value={fields.pricePerGallon || ''} onChange={event => updateField('pricePerGallon', event.target.value)} placeholder="$0.000" /></Field>
                <Field label="Total"><input inputMode="decimal" value={fields.total || ''} onChange={event => updateField('total', event.target.value)} placeholder="$0.00" /></Field>
                <Field label="Odometer"><input inputMode="numeric" value={fields.odometer || ''} onChange={event => updateField('odometer', event.target.value)} placeholder="0" /></Field>
              </>}

              {selectedType === 'repair_invoice' && <>
                <Field label="Repair shop" wide><input value={fields.merchant || ''} onChange={event => updateField('merchant', event.target.value)} placeholder="Shop or vendor" /></Field>
                <Field label="Category"><select value={fields.category || 'Other'} onChange={event => updateField('category', event.target.value)}><option>Oil service</option><option>Tires</option><option>Brakes</option><option>Engine</option><option>Transmission</option><option>Electrical</option><option>Trailer repair</option><option>Roadside service</option><option>Towing</option><option>Other</option></select></Field>
                <Field label="Total"><input inputMode="decimal" value={fields.total || ''} onChange={event => updateField('total', event.target.value)} placeholder="$0.00" /></Field>
                <Field label="Odometer"><input inputMode="numeric" value={fields.odometer || ''} onChange={event => updateField('odometer', event.target.value)} placeholder="0" /></Field>
                <Field label="Next service mi"><input inputMode="numeric" value={fields.nextDueMiles || ''} onChange={event => updateField('nextDueMiles', event.target.value)} placeholder="Optional" /></Field>
              </>}

              {!['rate_confirmation','carrier_settlement','fuel_receipt','repair_invoice'].includes(selectedType) && <>
                <Field label="Title" wide><input value={fields.title || selectedMeta.label} onChange={event => updateField('title', event.target.value)} /></Field>
                <Field label="Amount"><input inputMode="decimal" value={fields.total || ''} onChange={event => updateField('total', event.target.value)} placeholder="Optional" /></Field>
                {['bol','pod'].includes(selectedType) ? <>
                  <Field label="Destination" wide><input value={fields.destination || ''} onChange={event => updateField('destination', event.target.value)} placeholder="City, ST" /></Field>
                  <Field label="Seal"><input value={fields.seal || ''} onChange={event => updateField('seal', event.target.value.toUpperCase())} placeholder="Optional" /></Field>
                  <Field label="Weight"><input inputMode="numeric" value={fields.weight || ''} onChange={event => updateField('weight', event.target.value)} placeholder="Optional" /></Field>
                </> : null}
              </>}

              <Field label="Notes" wide><textarea value={fields.notes || ''} onChange={event => updateField('notes', event.target.value)} placeholder="Anything important about this document" /></Field>
            </div>
          </section>

          {analysis.text ? (
            <section className="smart-scan-ocr-card">
              <button type="button" onClick={() => setShowText(value => !value)}><span>Detected text</span><em>{showText ? 'Hide' : 'Review'}</em></button>
              {showText ? <pre>{analysis.text}</pre> : null}
            </section>
          ) : (
            <div className="smart-scan-review-note"><Icon name="spark" size={18} /><span>This phone did not expose text OCR to the web app. Classification used file context and requires your confirmation. Native iPhone/Android builds can plug into the same scanner with platform OCR.</span></div>
          )}

          {saveError ? <div className="smart-scan-error">{saveError}</div> : null}
          <div className="smart-scan-save-row">
            <button type="button" className="secondary" onClick={scanAgain}>Scan again</button>
            <button type="button" className="primary" disabled={stage === 'saving'} onClick={save}>{stage === 'saving' ? 'Saving…' : `Save ${selectedMeta.short}`}</button>
          </div>
        </main>
      )}

      {stage === 'saved' && savedResult && (
        <main className="smart-scan-saved">
          <span className="smart-scan-success"><Icon name="check" size={34} /></span>
          <p className="smart-scan-kicker">Document organized</p>
          <h1>{savedResult.type.label} saved</h1>
          <p>{savedResult.fields.loadNo ? `Linked to ${savedResult.fields.loadNo}. ` : ''}{savedResult.cloud.status === 'synced' ? 'A cloud copy is synced.' : 'An offline copy is safely stored on this device.'}</p>
          <div className="smart-scan-saved-card"><span>Classification</span><b>{savedResult.type.label}</b><em>{confidence}% confidence · driver confirmed</em></div>
          <button type="button" className="smart-scan-done" onClick={onClose}>Done</button>
          {savedResult.type.target !== 'documents' ? <button type="button" className="smart-scan-open" onClick={() => onOpenBusiness?.(savedResult.type.target)}>Open {savedResult.type.target === 'loads' ? 'Loads' : savedResult.type.target === 'settlements' ? 'Settlements' : savedResult.type.target === 'fuel' ? 'Fuel & IFTA' : savedResult.type.target === 'maintenance' ? 'Maintenance' : 'Expenses'}</button> : null}
        </main>
      )}
    </section>
  );
}

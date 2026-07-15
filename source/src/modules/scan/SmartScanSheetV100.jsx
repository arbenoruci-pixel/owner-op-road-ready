import React, { useEffect, useMemo, useState } from 'react';
import { addBusinessRecord, localDateKey, readBusinessStore } from '../business/businessStore.js';
import { documentTypeMeta, SMART_DOCUMENT_TYPES } from './smartScan.js';
import { saveScannedDocument } from './scanStorage.js';
import SmartDocumentCaptureV100 from './SmartDocumentCaptureV100.jsx';
import { analyzeSmartDocumentV100 } from './smartDocumentReaderV100.js';
import { dispatchSmartDocumentLinkV100, suggestSmartDocumentLinkV100 } from './smartDocumentLinkV100.js';

function Icon({ name, size = 22 }) {
  const common = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:'1.8', strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':'true' };
  if (name === 'scan') return <svg {...common}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/></svg>;
  if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === 'spark') return <svg {...common}><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/></svg>;
  if (name === 'file') return <svg {...common}><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6"/></svg>;
  if (name === 'link') return <svg {...common}><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/></svg>;
}

function number(value = 0) {
  const parsed = Number(String(value ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateInputValue(value = '') {
  if (!value) return localDateKey();
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
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

function confidenceLabel(analysis = {}) {
  if (analysis.needsReview) return 'Review required';
  const value = Number(analysis.confidence || 0);
  if (value >= .9) return 'High confidence';
  if (value >= .78) return 'Good match';
  return 'Review required';
}

function methodLabel(method = '') {
  if (/pdf-text-v100/.test(method)) return 'Pro PDF text reader';
  if (/pdf-import-no-text/.test(method)) return 'PDF import · manual review';
  if (/pro-reader-v100/.test(method)) return 'Pro document reader';
  if (/native/.test(method)) return 'Native mobile reader';
  return 'Document-aware OCR';
}

function linkableType(id = '') {
  return ['bol','pod','rate_confirmation','fuel_receipt'].includes(id);
}

function initialFields(result = {}, scanMeta = {}, state = {}) {
  const f = result.fields || {};
  const currentLoadNo = activeLoadNumber(state);
  return {
    date:dateInputValue(f.date),
    title:result.type?.label || 'Document',
    loadNo:f.loadNo || f.bolNo || currentLoadNo,
    broker:f.broker || '',
    merchant:f.merchant || '',
    cityState:f.cityState || '',
    origin:f.shipFromDetails || f.origin || '',
    destination:f.shipToDetails || f.destination || '',
    total:f.total || '',
    gross:f.grossPay || f.total || '',
    expectedPay:'',
    actualPay:f.netPay || f.total || '',
    deductions:f.deductions || '',
    gallons:f.gallons || '',
    pricePerGallon:f.pricePerGallon || '',
    discount:f.discount || '',
    transactionId:f.transactionId || '',
    fuelProvider:f.fuelProvider || '',
    odometer:f.odometer || '',
    invoiceNo:f.invoiceNo || '',
    bolNo:f.bolNo || '',
    poNumber:f.poNumber || '',
    trailerNo:f.trailerNo || '',
    carrierName:f.carrierName || '',
    seal:f.seal || '',
    weight:f.weight || '',
    totalPieces:f.totalPieces || '',
    commodity:f.commodity || '',
    checkIn:f.checkIn || '',
    appointmentTime:f.appointmentTime || '',
    checkOut:f.checkOut || '',
    receiver:f.receiver || '',
    pickupDate:dateInputValue(f.pickupDate || f.date),
    deliveryDate:f.deliveryDate ? dateInputValue(f.deliveryDate) : '',
    equipment:f.equipment || '',
    linehaul:f.linehaul || '',
    fuelSurcharge:f.fuelSurcharge || '',
    pageCount:Number(result.pageCount || scanMeta?.pageCount || 1),
    linkToLogbook:linkableType(result.type?.id),
    linkDay:dateInputValue(f.date || f.pickupDate),
    linkEventId:'',
    notes:'',
  };
}

export default function SmartScanSheetV100({ state, profile = {}, onClose, onSaved, onOpenBusiness }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [stage, setStage] = useState('capture');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [selectedType, setSelectedType] = useState('');
  const [fields, setFields] = useState({});
  const [linkSuggestion, setLinkSuggestion] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [savedResult, setSavedResult] = useState(null);
  const [showText, setShowText] = useState(false);
  const selectedMeta = useMemo(() => documentTypeMeta(selectedType || analysis?.type?.id || 'other'), [selectedType, analysis]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function chooseFile(nextFile, preferredType = 'auto', scanMeta = {}) {
    if (!nextFile) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(String(nextFile.type || '').startsWith('image/') ? URL.createObjectURL(nextFile) : '');
    setStage('analyzing');
    setProgress(.04);
    setProgressText('Preparing Pro reader…');
    setSaveError('');
    setSavedResult(null);
    try {
      const analysisFile = scanMeta?.ocrFile instanceof File ? scanMeta.ocrFile : nextFile;
      const result = await analyzeSmartDocumentV100(analysisFile, {
        preferredType,
        scanMeta,
        onProgress:(value, text) => { setProgress(value); setProgressText(text); },
      });
      const nextType = result.type?.id || 'other';
      const baseFields = initialFields(result, scanMeta, state);
      const suggestion = suggestSmartDocumentLinkV100(state, nextType, baseFields);
      baseFields.linkDay = suggestion.day || baseFields.linkDay;
      baseFields.linkEventId = suggestion.eventId || '';
      setAnalysis({ ...result, scanMeta });
      setSelectedType(nextType);
      setFields(baseFields);
      setLinkSuggestion(suggestion);
      setStage('review');
    } catch (error) {
      setSaveError(`Could not read this document. ${String(error?.message || error)}`);
      const fallback = { type:documentTypeMeta(preferredType !== 'auto' ? preferredType : 'other'), confidence:.18, alternatives:SMART_DOCUMENT_TYPES.slice(0, 6), text:'', method:'manual-review-v100', needsReview:true, fields:{} };
      setAnalysis(fallback);
      setSelectedType(fallback.type.id);
      setFields({ ...initialFields(fallback, scanMeta, state), linkDay:localDateKey(), linkToLogbook:linkableType(fallback.type.id) });
      setLinkSuggestion({ day:localDateKey(), eventId:'', confidence:.2, reason:'Reader could not verify the fields. Choose the day manually.', automatic:false, candidates:[] });
      setStage('review');
    }
  }

  function updateField(name, value) {
    setFields(current => ({ ...current, [name]:value }));
  }

  function changeType(id) {
    const meta = documentTypeMeta(id);
    setSelectedType(id);
    setFields(current => {
      const next = { ...current, title:current.title === analysis?.type?.label || !current.title ? meta.label : current.title, linkToLogbook:linkableType(id) };
      const suggestion = suggestSmartDocumentLinkV100(state, id, next);
      setLinkSuggestion(suggestion);
      if (!current.linkDay || current.linkDay === linkSuggestion?.day) next.linkDay = suggestion.day;
      if (!current.linkEventId) next.linkEventId = suggestion.eventId || '';
      return next;
    });
  }

  function scanAgain() {
    setAnalysis(null); setSelectedType(''); setFields({}); setLinkSuggestion(null); setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(''); setStage('capture'); setSaveError(''); setSavedResult(null); setShowText(false);
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
      const loadNo = String(fields.loadNo || '').trim().toUpperCase();
      const title = String(fields.title || meta.label).trim();
      const stored = await saveScannedDocument({
        file,
        type:meta.documentType,
        title,
        metadata:{ loadNo, relationType:meta.id === 'bol' ? 'bol' : meta.id === 'pod' ? 'pod' : 'supporting_document', notes:String(fields.notes || '').trim(), linkDay:fields.linkDay || '', linkEventId:fields.linkEventId || '' },
        extracted:{ ...fields, type:meta.id },
        classification:{ selectedType:meta.id, detectedType:analysis?.detectedType?.id || analysis?.type?.id || 'other', confidence:analysis?.confidence || 0, method:analysis?.method || 'manual-review-v100' },
      });

      let nextStore = store;
      if (meta.target === 'loads') {
        nextStore = addBusinessRecord(nextStore, 'loads', {
          date:fields.date || localDateKey(), loadNo, broker:String(fields.broker || '').trim(), origin:String(fields.origin || '').trim(), destination:String(fields.destination || '').trim(), gross:number(fields.gross || fields.total), loadedMiles:number(fields.loadedMiles), deadheadMiles:number(fields.deadheadMiles), status:'booked', pickupDate:fields.pickupDate || '', deliveryDate:fields.deliveryDate || '', equipment:fields.equipment || '', source:'smart_scan_v100', documentId:stored.localDocument.local_id,
        });
      } else if (meta.target === 'settlements') {
        const expectedPay = number(fields.expectedPay) || expectedSettlement();
        nextStore = addBusinessRecord(nextStore, 'settlements', { date:fields.date || localDateKey(), loadNo, carrier:String(profile.carrierName || fields.broker || '').trim(), gross:number(fields.gross), expectedPay, actualPay:number(fields.actualPay || fields.total), deductions:number(fields.deductions), difference:number(fields.actualPay || fields.total) - expectedPay, source:'smart_scan_v100', documentId:stored.localDocument.local_id });
      } else if (meta.target === 'fuel') {
        const gallons = number(fields.gallons);
        const fuelTotal = number(fields.total) || gallons * number(fields.pricePerGallon);
        nextStore = addBusinessRecord(nextStore, 'fuel', { date:fields.date || localDateKey(), merchant:String(fields.merchant || fields.fuelProvider || '').trim(), cityState:String(fields.cityState || '').trim(), gallons, pricePerGallon:number(fields.pricePerGallon) || (gallons > 0 ? fuelTotal / gallons : 0), total:fuelTotal, discount:number(fields.discount), transactionId:String(fields.transactionId || '').trim(), odometer:number(fields.odometer), receiptAttached:true, source:/mudflap/i.test(`${fields.fuelProvider} ${fields.merchant}`) ? 'mudflap_import' : 'smart_scan_v100', documentId:stored.localDocument.local_id });
      } else if (meta.target === 'maintenance') {
        nextStore = addBusinessRecord(nextStore, 'maintenance', { date:fields.date || localDateKey(), vendor:String(fields.merchant || '').trim(), category:String(fields.category || 'Other'), total, odometer:number(fields.odometer), nextDueMiles:number(fields.nextDueMiles), notes:String(fields.notes || '').trim(), source:'smart_scan_v100', documentId:stored.localDocument.local_id });
      } else if (meta.target === 'expenses') {
        const category = meta.id === 'lumper_receipt' ? 'Lumper' : meta.id === 'scale_ticket' ? 'Scale' : meta.id === 'toll_parking_receipt' ? 'Tolls / Parking' : 'Other';
        nextStore = addBusinessRecord(nextStore, 'expenses', { date:fields.date || localDateKey(), merchant:String(fields.merchant || title).trim(), category, total, loadNo, reimbursable:meta.id === 'lumper_receipt', receiptAttached:true, source:'smart_scan_v100', documentId:stored.localDocument.local_id });
      }

      nextStore = addBusinessRecord(nextStore, 'documents', { date:fields.date || localDateKey(), type:meta.id, label:meta.label, title, loadNo, amount:total, localDocumentId:stored.localDocument.local_id, clientDocumentId:stored.localDocument.client_document_id, fileName:stored.localDocument.original_file_name, syncState:stored.cloud.status, confidence:analysis?.confidence || 0, linkDay:fields.linkDay || '', source:'smart_scan_v100' });

      const result = { type:meta, fields:{ ...fields, loadNo }, localDocument:stored.localDocument, cloud:stored.cloud, store:nextStore, analysis, linkSuggestion };
      setSavedResult(result);
      setStage('saved');
      onSaved?.(result);
      if (fields.linkToLogbook && linkableType(meta.id)) dispatchSmartDocumentLinkV100(result);
    } catch (error) {
      setSaveError(`Document was not saved. ${String(error?.message || error)}`);
      setStage('review');
    }
  }

  const confidence = Math.round(Number(analysis?.confidence || 0) * 100);
  if (stage === 'capture') return <SmartDocumentCaptureV100 onClose={onClose} onReady={(scanFile, preferredType, scanMeta) => chooseFile(scanFile, preferredType, scanMeta)} />;

  return (
    <section className="screen smart-scan-screen pro-review-v100">
      <header className="smart-scan-head"><button type="button" onClick={onClose} aria-label="Close scanner">‹</button><div><b>Pro Document Inbox</b><em>Read · verify · link · organize</em></div><button type="button" className="smart-scan-reset" onClick={scanAgain}>New</button></header>

      {stage === 'analyzing' && <main className="smart-scan-analyzing"><span className="smart-scan-pulse"><Icon name="scan" size={36}/></span><h1>Reading document</h1><p>{progressText || 'Analyzing…'}</p><div className="smart-scan-progress"><span style={{ width:`${Math.max(6, progress * 100)}%` }}/></div><small>{file?.name}</small></main>}

      {(stage === 'review' || stage === 'saving') && analysis && <main className="smart-scan-review">
        <section className="smart-scan-preview-card">
          {previewUrl ? <img src={previewUrl} alt="Document preview"/> : <div className="smart-scan-file-preview"><Icon name="file" size={38}/><b>{file?.name || 'Document'}</b><span>{file?.type || 'File'}</span></div>}
          <div className="smart-scan-detection"><span className={analysis.needsReview ? 'review' : 'good'}><Icon name={analysis.needsReview ? 'spark' : 'check'} size={16}/> {confidenceLabel(analysis)}</span><b>{selectedMeta.label}</b><em>{methodLabel(analysis.method)} · {confidence}%</em></div>
        </section>

        <section className="smart-scan-type-card"><div className="smart-scan-section-title"><span>Document type</span><em>Tap to correct</em></div><div className="smart-scan-type-grid">{[...new Map([...(analysis.alternatives || []), documentTypeMeta(selectedType), documentTypeMeta('other')].map(type => [type.id, type])).values()].slice(0, 7).map(type => <button key={type.id} type="button" className={selectedType === type.id ? 'selected' : ''} onClick={() => changeType(type.id)}>{selectedType === type.id ? '✓ ' : ''}{type.short}</button>)}</div><select value={selectedType} onChange={event => changeType(event.target.value)}>{SMART_DOCUMENT_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></section>

        {linkableType(selectedType) && <section className="smart-link-card-v100">
          <div className="smart-scan-section-title"><span><Icon name="link" size={17}/> Link to Logbook</span><em>{linkSuggestion?.automatic ? 'Smart match' : 'Confirm day'}</em></div>
          <label className="smart-link-toggle-v100"><input type="checkbox" checked={fields.linkToLogbook !== false} onChange={event => updateField('linkToLogbook', event.target.checked)}/><span><b>Attach this document to the load and log day</b><em>No duty-status time is created or changed.</em></span></label>
          {fields.linkToLogbook !== false && <div className="smart-link-grid-v100"><label><span>Log day</span><input type="date" value={fields.linkDay || localDateKey()} onChange={event => updateField('linkDay', event.target.value)}/></label><div><span>Why this day</span><p>{linkSuggestion?.reason || 'Choose the correct day before saving.'}</p></div></div>}
        </section>}

        <section className="smart-scan-fields-card"><div className="smart-scan-section-title"><span>Review details</span><em>Confirm before save</em></div><div className="smart-scan-form-grid">
          <Field label="Date"><input type="date" value={fields.date || localDateKey()} onChange={event => updateField('date', event.target.value)}/></Field>
          <Field label="Load #"><input value={fields.loadNo || ''} onChange={event => updateField('loadNo', event.target.value.toUpperCase())} placeholder="Load / BOL / PO"/></Field>

          {selectedType === 'rate_confirmation' && <>
            <Field label="Broker" wide><input value={fields.broker || ''} onChange={event => updateField('broker', event.target.value)} placeholder="Broker or customer"/></Field>
            <Field label="Pickup" wide><input value={fields.origin || ''} onChange={event => updateField('origin', event.target.value)} placeholder="City, ST"/></Field>
            <Field label="Delivery" wide><input value={fields.destination || ''} onChange={event => updateField('destination', event.target.value)} placeholder="City, ST"/></Field>
            <Field label="Pickup date"><input type="date" value={fields.pickupDate || fields.date || ''} onChange={event => updateField('pickupDate', event.target.value)}/></Field>
            <Field label="Delivery date"><input type="date" value={fields.deliveryDate || ''} onChange={event => updateField('deliveryDate', event.target.value)}/></Field>
            <Field label="Total rate"><input inputMode="decimal" value={fields.gross || fields.total || ''} onChange={event => { updateField('gross', event.target.value); updateField('total', event.target.value); }} placeholder="$0.00"/></Field>
            <Field label="Linehaul"><input inputMode="decimal" value={fields.linehaul || ''} onChange={event => updateField('linehaul', event.target.value)} placeholder="Optional"/></Field>
            <Field label="Fuel surcharge"><input inputMode="decimal" value={fields.fuelSurcharge || ''} onChange={event => updateField('fuelSurcharge', event.target.value)} placeholder="Optional"/></Field>
            <Field label="Equipment"><input value={fields.equipment || ''} onChange={event => updateField('equipment', event.target.value)} placeholder="Reefer, dry van…"/></Field>
          </>}

          {selectedType === 'fuel_receipt' && <>
            <Field label="Fuel provider" wide><input value={fields.fuelProvider || fields.merchant || ''} onChange={event => updateField('fuelProvider', event.target.value)} placeholder="Mudflap, Pilot, Love's…"/></Field>
            <Field label="Station / merchant" wide><input value={fields.merchant || ''} onChange={event => updateField('merchant', event.target.value)} placeholder="Fueling location"/></Field>
            <Field label="City, state" wide><input value={fields.cityState || ''} onChange={event => updateField('cityState', event.target.value)} placeholder="City, ST"/></Field>
            <Field label="Gallons"><input inputMode="decimal" value={fields.gallons || ''} onChange={event => updateField('gallons', event.target.value)} placeholder="0.000"/></Field>
            <Field label="Price / gal"><input inputMode="decimal" value={fields.pricePerGallon || ''} onChange={event => updateField('pricePerGallon', event.target.value)} placeholder="$0.000"/></Field>
            <Field label="Total"><input inputMode="decimal" value={fields.total || ''} onChange={event => updateField('total', event.target.value)} placeholder="$0.00"/></Field>
            <Field label="Mudflap savings"><input inputMode="decimal" value={fields.discount || ''} onChange={event => updateField('discount', event.target.value)} placeholder="Optional"/></Field>
            <Field label="Transaction ID" wide><input value={fields.transactionId || ''} onChange={event => updateField('transactionId', event.target.value)} placeholder="Optional"/></Field>
          </>}

          {selectedType === 'carrier_settlement' && <>
            <Field label="Settlement gross"><input inputMode="decimal" value={fields.gross || ''} onChange={event => updateField('gross', event.target.value)} placeholder="$0.00"/></Field><Field label="Expected pay"><input inputMode="decimal" value={fields.expectedPay || expectedSettlement() || ''} onChange={event => updateField('expectedPay', event.target.value)} placeholder="$0.00"/></Field><Field label="Actual net"><input inputMode="decimal" value={fields.actualPay || ''} onChange={event => updateField('actualPay', event.target.value)} placeholder="$0.00"/></Field><Field label="Deductions"><input inputMode="decimal" value={fields.deductions || ''} onChange={event => updateField('deductions', event.target.value)} placeholder="$0.00"/></Field>
          </>}

          {['bol','pod'].includes(selectedType) && <>
            <Field label="Title" wide><input value={fields.title || selectedMeta.label} onChange={event => updateField('title', event.target.value)}/></Field>
            <Field label="Ship from" wide><input value={fields.origin || ''} onChange={event => updateField('origin', event.target.value)} placeholder="Company and address"/></Field>
            <Field label="Ship to" wide><input value={fields.destination || ''} onChange={event => updateField('destination', event.target.value)} placeholder="Company and address"/></Field>
            <Field label="Customer PO"><input value={fields.poNumber || ''} onChange={event => updateField('poNumber', event.target.value.toUpperCase())} placeholder="Optional"/></Field>
            <Field label="Trailer #"><input value={fields.trailerNo || ''} onChange={event => updateField('trailerNo', event.target.value.toUpperCase())} placeholder="Optional"/></Field>
            <Field label="Seal"><input value={fields.seal || ''} onChange={event => updateField('seal', event.target.value.toUpperCase())} placeholder="Optional"/></Field>
            <Field label="Weight"><input inputMode="decimal" value={fields.weight || ''} onChange={event => updateField('weight', event.target.value)} placeholder="Optional"/></Field>
            <Field label="Pieces"><input inputMode="numeric" value={fields.totalPieces || ''} onChange={event => updateField('totalPieces', event.target.value)} placeholder="Optional"/></Field>
            <Field label="Check in"><input value={fields.checkIn || ''} onChange={event => updateField('checkIn', event.target.value)} placeholder="Optional"/></Field>
            <Field label="Appointment"><input value={fields.appointmentTime || ''} onChange={event => updateField('appointmentTime', event.target.value)} placeholder="Optional"/></Field>
            <Field label="Check out"><input value={fields.checkOut || ''} onChange={event => updateField('checkOut', event.target.value)} placeholder="Optional"/></Field>
            <Field label="Commodity" wide><input value={fields.commodity || ''} onChange={event => updateField('commodity', event.target.value)} placeholder="Optional"/></Field>
          </>}

          {!['rate_confirmation','carrier_settlement','fuel_receipt','bol','pod'].includes(selectedType) && <><Field label="Title" wide><input value={fields.title || selectedMeta.label} onChange={event => updateField('title', event.target.value)}/></Field><Field label="Amount"><input inputMode="decimal" value={fields.total || ''} onChange={event => updateField('total', event.target.value)} placeholder="Optional"/></Field><Field label="Merchant" wide><input value={fields.merchant || ''} onChange={event => updateField('merchant', event.target.value)} placeholder="Optional"/></Field></>}

          <Field label="Notes" wide><textarea value={fields.notes || ''} onChange={event => updateField('notes', event.target.value)} placeholder="Anything important about this document"/></Field>
        </div></section>

        {analysis.text ? <section className="smart-scan-ocr-card"><button type="button" onClick={() => setShowText(value => !value)}><span>Detected text</span><em>{showText ? 'Hide' : 'Review'}</em></button>{showText ? <pre>{analysis.text}</pre> : null}</section> : <div className="smart-scan-review-note"><Icon name="spark" size={18}/><span>No reliable text layer was found. The file is still imported and every uncertain field stays available for manual review.</span></div>}
        {saveError ? <div className="smart-scan-error">{saveError}</div> : null}
        <div className="smart-scan-save-row"><button type="button" className="secondary" onClick={scanAgain}>Import another</button><button type="button" className="primary" disabled={stage === 'saving'} onClick={save}>{stage === 'saving' ? 'Saving…' : `Save ${selectedMeta.short}`}</button></div>
      </main>}

      {stage === 'saved' && savedResult && <main className="smart-scan-saved"><span className="smart-scan-success"><Icon name="check" size={34}/></span><p className="smart-scan-kicker">Document organized</p><h1>{savedResult.type.label} saved</h1><p>{savedResult.fields.linkToLogbook ? `Linked to Logbook day ${savedResult.fields.linkDay}. ` : ''}{savedResult.fields.loadNo ? `Load ${savedResult.fields.loadNo}. ` : ''}{savedResult.cloud.status === 'synced' ? 'Cloud copy synced.' : 'Offline copy stored safely.'}</p><div className="smart-scan-saved-card"><span>Reader</span><b>{methodLabel(savedResult.analysis?.method)}</b><em>{Math.round(Number(savedResult.analysis?.confidence || 0) * 100)}% · driver reviewed</em></div><div className="smart-scan-saved-actions"><button type="button" onClick={scanAgain}>Import another</button>{savedResult.type.target && savedResult.type.target !== 'documents' ? <button type="button" className="primary" onClick={() => onOpenBusiness?.(savedResult.type.target)}>Open {savedResult.type.short}</button> : <button type="button" className="primary" onClick={onClose}>Done</button>}</div></main>}
    </section>
  );
}

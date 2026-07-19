'use client';

import React, { useMemo, useState } from 'react';
import {
  businessRecordId,
  localDateKey,
  readBusinessStore,
  writeBusinessStore,
} from '../business/businessStore.js';
import SmartDocumentCaptureV100 from './SmartDocumentCaptureV100.jsx';
import { saveScannedDocument } from './scanStorage.js';
import {
  TRUCK_DOCUMENT_TYPES_V1040 as SMART_DOCUMENT_TYPES,
  backendDocumentTypeV1040,
  documentLinkableV1040,
  truckDocumentTypeMetaV1040 as documentTypeMeta,
} from './truckDocumentCatalogV1040.js';
import {
  analyzeTruckDocumentV1040,
  documentIntelligencePayloadV1040,
  reanalyzeTruckDocumentTypeV1040,
} from './truckDocumentEngineV1040.js';
import {
  buildVaultDocumentV105,
  collectLoadCandidatesV105,
  dispatchVaultDocumentCommitV105,
  isDateLikePlaceV105,
  isValidCanonicalLoadNoV105,
  matchDocumentToLoadV105,
  migrateBusinessStoreV105,
  normalizeCanonicalLoadNoV105,
  normalizeDateV105,
  upsertBusinessLoadV105,
  upsertVaultDocumentV105,
} from '../documents/documentFoundationV105.js';

function Icon({ name, size = 21 }) {
  const p = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:'1.9', strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':'true' };
  if (name === 'back') return <svg {...p}><path d="m15 18-6-6 6-6"/></svg>;
  if (name === 'scan') return <svg {...p}><path d="M4 8V5h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10"/></svg>;
  if (name === 'check') return <svg {...p}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === 'file') return <svg {...p}><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 12h6M9 16h5"/></svg>;
  if (name === 'folder') return <svg {...p}><path d="M3 6h7l2 2h9v11H3z"/></svg>;
  if (name === 'alert') return <svg {...p}><path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17h.01"/></svg>;
  if (name === 'spark') return <svg {...p}><path d="m12 3 1.4 4.1 4.1 1.4-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4z"/></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="9"/></svg>;
}

function number(value = 0) {
  const parsed = Number(String(value ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeDocumentDate(value = '') {
  const day = normalizeDateV105(value);
  if (!day) return '';
  const currentYear = new Date().getFullYear();
  const year = Number(day.slice(0, 4));
  return Math.abs(year - currentYear) <= 2 ? day : '';
}

function documentDateFromResult(result = {}) {
  const f = result.fields || {};
  return safeDocumentDate(f.documentDate || f.deliveryDate || f.workDate || f.date || f.pickupDate);
}

function primaryLoadReference(result = {}) {
  const f = result.fields || {};
  return [f.loadNo, f.orderNo].map(normalizeCanonicalLoadNoV105).find(Boolean) || '';
}

function loadDocumentType(typeId = '') {
  return ['rate_confirmation','load_tender','bol','pod','delivery_receipt','lumper_receipt','scale_ticket','detention_approval','layover_approval','tonu','osd_report','claim_notice','load_invoice'].includes(typeId);
}

function operationalBucket(meta = {}) {
  if (meta.target === 'fuel') return 'fuel';
  if (meta.target === 'maintenance') return 'maintenance';
  if (meta.target === 'expenses') return 'expenses';
  if (meta.target === 'settlements') return 'settlements';
  return '';
}

function addOperationalRecord(store = {}, record = {}, meta = {}, fields = {}) {
  if (meta.id === 'rate_confirmation' && record.canonicalLoadNo) {
    return upsertBusinessLoadV105(store, {
      id:record.canonicalLoadId || `load_${record.canonicalLoadNo}`,
      canonicalLoadId:record.canonicalLoadId || `load_${record.canonicalLoadNo}`,
      canonicalLoadNo:record.canonicalLoadNo,
      loadNo:record.canonicalLoadNo,
      broker:record.broker || fields.broker || '',
      origin:isDateLikePlaceV105(fields.origin) ? '' : fields.origin || '',
      destination:isDateLikePlaceV105(fields.destination) ? '' : fields.destination || '',
      gross:number(fields.gross || fields.total),
      pickupDate:normalizeDateV105(fields.pickupDate || record.documentDate),
      deliveryDate:normalizeDateV105(fields.deliveryDate),
      equipment:fields.equipment || '',
      aliases:record.references || [],
      status:'booked',
      source:'rate_confirmation_v105',
      documentId:record.id,
    });
  }

  const bucket = operationalBucket(meta);
  if (!bucket) return store;
  const list = Array.isArray(store[bucket]) ? [...store[bucket]] : [];
  if (list.some(item => item.documentId === record.id)) return store;
  const base = {
    id:businessRecordId(bucket),
    date:record.documentDate || localDateKey(),
    loadNo:record.canonicalLoadNo || '',
    documentId:record.id,
    receiptAttached:true,
    source:'document_vault_v105',
    createdAt:Date.now(),
    updatedAt:Date.now(),
  };
  if (bucket === 'fuel') {
    list.unshift({
      ...base,
      merchant:fields.merchant || fields.fuelProvider || '',
      cityState:fields.cityState || fields.location || '',
      state:fields.state || '',
      gallons:number(fields.gallons),
      pricePerGallon:number(fields.pricePerGallon),
      total:number(fields.total),
      fuelType:fields.fuelType || '',
      unitNumber:fields.unitNumber || fields.truckNumber || '',
      iftaEligible:fields.iftaEligible !== false,
    });
  } else if (bucket === 'maintenance') {
    list.unshift({
      ...base,
      vendor:fields.merchant || fields.vendor || '',
      category:meta.label || 'Maintenance',
      total:number(fields.total),
      odometer:number(fields.odometer),
      labor:number(fields.labor),
      parts:number(fields.parts),
      unitNumber:fields.unitNumber || fields.truckNumber || '',
      vin:fields.vin || '',
      notes:fields.serviceDescription || '',
    });
  } else if (bucket === 'expenses') {
    list.unshift({
      ...base,
      merchant:fields.merchant || fields.vendor || meta.label,
      category:meta.id === 'lumper_receipt' ? 'Lumper' : meta.id === 'scale_ticket' ? 'Scale' : meta.id === 'toll_parking_receipt' ? 'Tolls / Parking' : meta.label,
      total:number(fields.total),
      reimbursable:['lumper_receipt','detention_approval','layover_approval','tonu'].includes(meta.id),
    });
  } else if (bucket === 'settlements') {
    list.unshift({
      ...base,
      carrier:fields.carrierName || fields.broker || '',
      gross:number(fields.gross || fields.total),
      actualPay:number(fields.actualPay || fields.netPay || fields.total),
      deductions:number(fields.deductions),
    });
  }
  return { ...store, [bucket]:list, updatedAt:Date.now() };
}

function extractedRows(result = {}) {
  const hidden = new Set(['intelligence','routing','validation','packet','raw','text','stops','driverRequirements','references']);
  return Object.entries(result.fields || {})
    .filter(([key, value]) => !hidden.has(key) && value !== '' && value != null && value !== false && !(Array.isArray(value) && !value.length) && typeof value !== 'object')
    .slice(0, 18);
}

function fieldLabel(value = '') {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function fmtStop(stop = {}, fallbackSequence = 0) {
  const sequence = Number(stop.deliverySequence || stop.sequence || fallbackSequence || 0);
  const place = stop.cityState || [stop.city, stop.state].filter(Boolean).join(', ');
  return [sequence ? `Stop ${sequence}` : '', stop.company || '', place].filter(Boolean).join(' · ');
}

function ConfirmCard({ label, value, detail, tone = '' }) {
  return <div className={`scan-confirm-card-v105 ${tone}`}><span>{label}</span><b>{value || 'Needs review'}</b>{detail ? <em>{detail}</em> : null}</div>;
}

export default function SmartScanSheetV105({ state, profile = {}, onClose, onOpenBusiness }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [stage, setStage] = useState('capture');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [selectedType, setSelectedType] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [selectedLoadNo, setSelectedLoadNo] = useState('');
  const [selectedStopSequence, setSelectedStopSequence] = useState(0);
  const [linkToLogbook, setLinkToLogbook] = useState(false);
  const [linkDay, setLinkDay] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [match, setMatch] = useState(null);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(null);

  const store = useMemo(() => migrateBusinessStoreV105(readBusinessStore(), state), [state, stage]);
  const candidates = useMemo(() => collectLoadCandidatesV105(state, store), [state, store]);
  const selectedMeta = useMemo(() => documentTypeMeta(selectedType || analysis?.type?.id || 'other'), [selectedType, analysis]);
  const selectedLoad = candidates.find(candidate => candidate.loadNo === selectedLoadNo) || match?.candidates?.find(candidate => candidate.loadNo === selectedLoadNo) || null;
  const deliveryStops = (selectedLoad?.stops || []).filter(stop => stop.type === 'delivery');
  const selectedStop = deliveryStops.find(stop => Number(stop.deliverySequence || stop.sequence || 0) === Number(selectedStopSequence || 0)) || null;
  const confidence = Number(analysis?.confidence || 0);
  const requiresLoad = loadDocumentType(selectedType);
  const needsReview = Boolean(analysis?.needsReview || confidence < .85 || !selectedType || requiresLoad && !selectedLoadNo || !documentDate);
  const canSave = Boolean(file && selectedType && (!needsReview || reviewed));

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl('');
    setStage('capture');
    setProgress(0);
    setProgressText('');
    setAnalysis(null);
    setSelectedType('');
    setDocumentDate('');
    setSelectedLoadNo('');
    setSelectedStopSequence(0);
    setLinkToLogbook(false);
    setLinkDay('');
    setReviewed(false);
    setDetailsOpen(false);
    setMatch(null);
    setMessage('');
    setSaved(null);
  }

  function applyResult(result, preferredLoadNo = '') {
    const typeId = result.type?.id || 'other';
    const businessStore = migrateBusinessStoreV105(readBusinessStore(), state);
    const nextMatch = matchDocumentToLoadV105({ state, businessStore, typeId, fields:result.fields || {}, analysis:result });
    const extractedLoad = primaryLoadReference(result);
    const rateConNewLoad = typeId === 'rate_confirmation' && isValidCanonicalLoadNoV105(extractedLoad) ? extractedLoad : '';
    const loadNo = preferredLoadNo
      || nextMatch.loadNo
      || rateConNewLoad
      || '';
    const date = documentDateFromResult(result);
    const stopSequence = loadNo === nextMatch.loadNo ? Number(nextMatch.stopSequence || 0) : 0;
    setAnalysis(result);
    setSelectedType(typeId);
    setMatch(nextMatch);
    setSelectedLoadNo(loadNo);
    setSelectedStopSequence(stopSequence);
    setDocumentDate(date);
    setLinkDay(date || localDateKey());
    setLinkToLogbook(documentLinkableV1040(typeId) && Boolean(loadNo));
    setReviewed(false);
    setStage('confirm');
  }

  async function chooseFile(nextFile, preferredType = 'auto', scanMeta = {}) {
    if (!nextFile) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(String(nextFile.type || '').startsWith('image/') ? URL.createObjectURL(nextFile) : '');
    setStage('analyzing');
    setProgress(.05);
    setProgressText('Preparing document…');
    setMessage('');
    try {
      const analysisFile = scanMeta?.ocrFile instanceof File ? scanMeta.ocrFile : nextFile;
      const result = await analyzeTruckDocumentV1040(analysisFile, {
        preferredType,
        scanMeta,
        state,
        profile,
        businessStore:migrateBusinessStoreV105(readBusinessStore(), state),
        onProgress:(value, text) => {
          setProgress(value);
          setProgressText(text);
        },
      });
      applyResult({ ...result, scanMeta });
    } catch (error) {
      const fallbackType = preferredType !== 'auto' ? preferredType : 'other';
      applyResult({
        type:documentTypeMeta(fallbackType),
        detectedType:documentTypeMeta('other'),
        confidence:.15,
        alternatives:SMART_DOCUMENT_TYPES.slice(0, 8),
        text:'',
        method:'manual-review-v105',
        needsReview:true,
        fields:{},
        scanMeta,
      });
      setMessage(`The reader could not verify this file. The original is safe; confirm the three fields below. ${String(error?.message || '')}`.trim());
    }
  }

  function changeType(typeId) {
    const result = reanalyzeTruckDocumentTypeV1040(analysis || {}, typeId, {
      state,
      profile,
      businessStore:migrateBusinessStoreV105(readBusinessStore(), state),
    });
    const keepLoad = selectedLoadNo;
    applyResult(result, keepLoad);
  }

  function chooseLoad(loadNo) {
    const normalized = normalizeCanonicalLoadNoV105(loadNo);
    setSelectedLoadNo(normalized);
    const candidate = candidates.find(item => item.loadNo === normalized) || match?.candidates?.find(item => item.loadNo === normalized) || null;
    const stopMatch = candidate && match?.candidates?.find(item => item.loadNo === normalized)?.stopMatch;
    setSelectedStopSequence(Number(stopMatch?.deliverySequence || stopMatch?.sequence || 0));
    setLinkToLogbook(documentLinkableV1040(selectedType) && Boolean(normalized));
    setReviewed(false);
  }

  async function save() {
    if (!canSave || !file) return;
    setStage('saving');
    setMessage('');
    try {
      const currentStore = migrateBusinessStoreV105(readBusinessStore(), state);
      const meta = selectedMeta;
      const finalMatchCandidate = candidates.find(candidate => candidate.loadNo === selectedLoadNo)
        || match?.candidates?.find(candidate => candidate.loadNo === selectedLoadNo)
        || null;
      const finalMatch = {
        ...(match || {}),
        matched:Boolean(selectedLoadNo),
        loadNo:selectedLoadNo,
        canonicalLoadId:finalMatchCandidate?.id || match?.canonicalLoadId || `load_${selectedLoadNo}`,
        broker:finalMatchCandidate?.broker || match?.broker || '',
        stop:selectedStop,
        stopSequence:Number(selectedStopSequence || 0),
      };
      const mergedFields = {
        ...(analysis?.fields || {}),
        type:meta.id,
        title:analysis?.fields?.title || meta.label,
        date:documentDate,
        documentDate,
        canonicalLoadNo:selectedLoadNo,
        loadNo:selectedLoadNo,
        stopSequence:Number(selectedStopSequence || 0),
        linkDay:linkToLogbook ? linkDay : '',
        linkToLogbook,
      };
      const intelligence = documentIntelligencePayloadV1040({
        ...(analysis || {}),
        type:meta,
        fields:mergedFields,
      });
      const stored = await saveScannedDocument({
        file,
        type:backendDocumentTypeV1040(meta.id),
        title:mergedFields.title,
        metadata:{
          loadNo:selectedLoadNo,
          relationType:meta.id === 'bol' ? 'bol' : meta.id === 'pod' ? 'pod' : 'supporting_document',
          notes:'',
          linkDay:linkToLogbook ? linkDay : '',
          family:meta.family,
          stacks:(intelligence.routing?.stacks || []).map(stack => stack.id),
          fingerprint:intelligence.fingerprint,
          intelligence:{
            version:intelligence.version,
            family:intelligence.family,
            type:intelligence.type,
            fingerprint:intelligence.fingerprint,
            matchedEntities:intelligence.matchedEntities,
            validation:intelligence.validation,
            packet:intelligence.packet,
          },
        },
        extracted:{ ...mergedFields, intelligence },
        classification:{
          selectedType:meta.id,
          detectedType:analysis?.detectedType?.id || analysis?.type?.id || 'other',
          confidence:analysis?.confidence || 0,
          method:analysis?.method || 'truck-document-intelligence-v1042',
          family:meta.family,
          routing:intelligence.routing,
          validation:intelligence.validation,
          fingerprint:intelligence.fingerprint,
          packet:intelligence.packet,
        },
      });
      const record = buildVaultDocumentV105({
        stored,
        type:meta,
        fields:mergedFields,
        analysis,
        match:finalMatch,
        selectedLoadNo,
        selectedStopSequence,
        selectedStop,
        documentDate,
        linkDay:linkToLogbook ? linkDay : '',
        linkToLogbook,
        userConfirmed:true,
      });
      const deliveryCount = Number(finalMatchCandidate?.stops?.filter(stop => stop.type === 'delivery').length || 0);
      if (record.type === 'pod' && deliveryCount && Number(record.stopSequence || 0) >= deliveryCount) record.isFinalStop = true;
      let nextStore = upsertVaultDocumentV105(currentStore, record, state);
      nextStore = addOperationalRecord(nextStore, record, meta, mergedFields);
      writeBusinessStore(nextStore);
      dispatchVaultDocumentCommitV105({ record });
      setSaved({ record, meta, stored, finalMatch });
      setStage('saved');
    } catch (error) {
      setMessage(`Document was not saved. ${String(error?.message || error)}`);
      setStage('confirm');
    }
  }

  if (stage === 'capture') {
    return <SmartDocumentCaptureV100 onClose={onClose} onReady={chooseFile}/>;
  }

  return (
    <section className="screen smart-scan-v105">
      <header className="smart-scan-head-v105">
        <button type="button" onClick={stage === 'saved' ? onClose : reset} aria-label="Back"><Icon name="back"/></button>
        <div><span>Road Ready OS</span><b>Scan Anything</b></div>
        {stage !== 'analyzing' && stage !== 'saving' ? <button type="button" onClick={reset}>New</button> : <i/>}
      </header>

      {stage === 'analyzing' ? <main className="scan-analyzing-v105">
        <span><Icon name="scan" size={38}/></span>
        <h1>Understanding document</h1>
        <p>{progressText || 'Reading text, layout and trucking fields…'}</p>
        <div><i style={{ width:`${Math.max(7, progress * 100)}%` }}/></div>
        <small>{file?.name}</small>
      </main> : null}

      {(stage === 'confirm' || stage === 'saving') && analysis ? <main className="scan-confirm-v105">
        <section className="scan-file-preview-v105">
          {previewUrl ? <img src={previewUrl} alt="Document preview"/> : <span><Icon name="file" size={38}/></span>}
          <div><em>{needsReview ? 'CHECK 3 ITEMS' : 'DOCUMENT MATCHED'}</em><h1>{selectedMeta.label}</h1><p>{needsReview ? 'The original is safe. Confirm type, load and date.' : 'Road Ready found a strong filing match.'}</p></div>
        </section>

        <section className="scan-three-v105">
          <label>
            <span>1 · Document type</span>
            <select value={selectedType} onChange={event => changeType(event.target.value)}>{SMART_DOCUMENT_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select>
          </label>

          {requiresLoad ? <label>
            <span>2 · Load folder</span>
            <select value={selectedLoadNo || ''} onChange={event => chooseLoad(event.target.value)}>
              <option value="">Needs Review / Choose later</option>
              {selectedType === 'rate_confirmation' && primaryLoadReference(analysis) && !candidates.some(candidate => candidate.loadNo === primaryLoadReference(analysis)) ? <option value={primaryLoadReference(analysis)}>Create Load {primaryLoadReference(analysis)}</option> : null}
              {candidates.map(candidate => <option key={candidate.loadNo} value={candidate.loadNo}>Load {candidate.loadNo}{candidate.broker ? ` · ${candidate.broker}` : ''}{candidate.status === 'completed' ? ' · Completed' : ''}</option>)}
            </select>
            {match?.reason ? <em>{selectedLoadNo === match.loadNo ? match.reason : 'Driver-selected load folder'}</em> : null}
          </label> : <ConfirmCard label="2 · Filing area" value={selectedMeta.family?.label || selectedMeta.target || 'Documents'} detail="No load number required"/>}

          <label>
            <span>3 · Document date</span>
            <input type="date" value={documentDate || ''} onChange={event => { setDocumentDate(event.target.value); setLinkDay(event.target.value || linkDay); setReviewed(false); }}/>
            {!documentDate ? <em>Reader did not verify the date.</em> : null}
          </label>
        </section>

        {requiresLoad && selectedLoadNo ? <section className="scan-destination-v105">
          <header><span><Icon name="folder" size={18}/></span><div><b>Load {selectedLoadNo}</b><em>{selectedLoad?.broker || match?.broker || 'Load folder'}</em></div><strong>{match?.automatic && selectedLoadNo === match.loadNo ? 'Strong match' : 'Confirmed'}</strong></header>
          {deliveryStops.length ? <label><span>Attach to stop</span><select value={selectedStopSequence || 0} onChange={event => { setSelectedStopSequence(Number(event.target.value)); setReviewed(false); }}><option value="0">Load level / Pickup paperwork</option>{deliveryStops.map(stop => <option key={stop.id || stop.deliverySequence} value={stop.deliverySequence || stop.sequence}>{fmtStop(stop)}</option>)}</select></label> : null}
          {selectedStop ? <p>{fmtStop(selectedStop)}</p> : null}
        </section> : null}

        {documentLinkableV1040(selectedType) ? <section className="scan-log-link-v105">
          <label><input type="checkbox" checked={linkToLogbook} onChange={event => setLinkToLogbook(event.target.checked)}/><span><b>Also show under Logbook supporting documents</b><em>This never changes duty time, duty status or location.</em></span></label>
          {linkToLogbook ? <input type="date" value={linkDay || documentDate || localDateKey()} onChange={event => setLinkDay(event.target.value)}/> : null}
        </section> : null}

        <section className="scan-details-v105">
          <button type="button" onClick={() => setDetailsOpen(value => !value)}><span>Extracted details</span><em>{detailsOpen ? 'Hide' : `${extractedRows(analysis).length} fields`}</em></button>
          {detailsOpen ? <div>{extractedRows(analysis).map(([key, value]) => <span key={key}><b>{fieldLabel(key)}</b><em>{String(value)}</em></span>)}</div> : null}
        </section>

        {needsReview ? <label className="scan-driver-check-v105"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)}/><span><b>I checked the type, load and date</b><em>Road Ready will file the original exactly where shown above.</em></span></label> : null}
        {message ? <p className="scan-message-v105"><Icon name="alert" size={17}/>{message}</p> : null}
        <button type="button" className="scan-save-v105" disabled={!canSave || stage === 'saving'} onClick={save}>{stage === 'saving' ? 'Saving original…' : <><Icon name="check" size={19}/> Save document</>}</button>
      </main> : null}

      {stage === 'saved' && saved ? <main className="scan-saved-v105">
        <span><Icon name="check" size={38}/></span>
        <em>DOCUMENT SAVED</em>
        <h1>{saved.meta.label}</h1>
        <section>
          <ConfirmCard label="Filed to" value={saved.record.canonicalLoadNo ? `Load ${saved.record.canonicalLoadNo}` : 'Needs Review'} detail={saved.record.stopSequence ? `Stop ${saved.record.stopSequence} · ${saved.record.stopCompany || saved.record.stopLocation}` : saved.record.broker || 'Document Vault'} tone="good"/>
          <ConfirmCard label="Document date" value={saved.record.documentDate || 'Not confirmed'} detail={saved.record.linkToLogbook ? `Log day ${saved.record.linkDay}` : 'Original preserved'}/>
          <ConfirmCard label="Storage" value={saved.stored.cloud?.status === 'synced' ? 'Cloud synced' : 'Safe on this device'} detail={saved.record.fileName}/>
        </section>
        <div><button type="button" onClick={reset}>Scan another</button><button type="button" className="primary" onClick={() => onOpenBusiness?.('documents')}>Open Documents</button></div>
      </main> : null}
    </section>
  );
}

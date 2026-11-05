'use client';
import {recoverLegacyContractOriginalsV110327} from './recoverLegacyContractOriginalsV110327.js';
import {assertScanLoadIdentityV110326} from '../loads/loadIdentityV110326.js';
import {scanDateNoticeV110323} from './routeMatchV110323.js';
import {buildSavedDocumentGuideV110312,finishSavedScanV110312} from '../loads/savedLoadRecoveryV110312.js';
import {instructionPlanV110311,instructionFolderV110311} from '../loads/instructionPlanV110311.js';
import {persistInstructionGuideV110311,finishInstructionScanV110311} from '../loads/instructionGuideV110311.js';
import { resolveArchiveDocumentLink } from '../owneros/archiveEvidenceV1103.js';
import { matchScanDocumentToLoadV11037 as matchDocumentToLoadV105, initialScanLoadV11037 } from './scanLoadAssignmentV11037.js';
import { scanNeedsLoadV11039, scanDestinationV11039, normalizeScanPreferenceV11039 } from './smartScanRoutingV11039.js';
import { documentFieldRowsV11038 } from './documentFieldSemanticsV11038.js';
import { qualifyScanResultV11036 } from './DocumentEvidenceV11036.js';
import ScanEvidenceReviewV11036 from './ScanEvidenceReviewV11036.jsx';
import OwnedReaderPreview from './OwnedReaderPreview.jsx';
import {filingTypeForReview} from '../../../../packages/smart-reader-core/src/recovery.js';
import {reviewAssignment} from './reviewAssignmentV110411.js';
import AnalysisSummary from './AnalysisSummary.jsx';
import LoadFolderPicker from './LoadFolderPicker.jsx';
import {loadPickerCandidates,podReadingMessage} from './loadPickerV110472.js';
import {operationalCandidateContext} from '../loads/currentLoadV110473.js';
import {analysisWithProjection} from '../../../../packages/smart-reader-core/src/analysisProjection.js';
import {scanWithSourceFields} from '../../../../packages/smart-reader-core/src/scanFields.js';
import {readOwnerOpsStoreV102} from '../owneros/ownerOpsStoreV102.js';
import { parseFuelStatement, fuelStatementFields, upsertFuelTransactions } from '../document-readers/fuel-receipt/fuelStatementV1103.js';


import {SavedFileActionsV110344} from '../owneros/SavedDocumentFilesV110344.jsx';
import {scanAssignmentBadge,retainedScanChoice} from './scanAssignmentSafety.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  businessRecordId,
  localDateKey,
  readBusinessStore,
  writeBusinessStore,
} from '../business/businessStore.js';
import SmartDocumentCaptureV100 from './SmartDocumentCaptureV100.jsx';
import { saveScannedDocumentQuotaSafeV10963 as saveScannedDocument } from './quotaSafeScanStorageV10963.js';
import { chooseRateConLoadNoV10964, compactIntelligenceV10964, compactRateConAnalysisV10964, compactRateConSaveFieldsV10964, savedViewModelV10964 } from './rateConSaveStabilityV10964.js';
import { dispatchSmartDocumentLinkV100 } from '../loads/loadGuideV103.js';
import { persistCaptureAssetsV106 } from './captureAssetStoreV106.js';
import {
  TRUCK_DOCUMENT_TYPES_V1040 as SMART_DOCUMENT_TYPES,
  backendDocumentTypeV1040,
  documentLinkableV1040,
  truckDocumentTypeMetaV1040 as documentTypeMeta,
} from './truckDocumentCatalogV1040.js';
import {
  analyzeTruckDocumentIsolatedV10959 as analyzeTruckDocumentV1040,
  documentIntelligencePayloadIsolatedV10959 as documentIntelligencePayloadV1040,
  reanalyzeTruckDocumentTypeIsolatedV10959 as reanalyzeTruckDocumentTypeV1040,
} from './engines/isolatedDocumentRouterV10959.js';
import {
  buildVaultDocumentV105,
  collectLoadCandidatesV105 as collectBaseCandidatesV110434,
  dispatchVaultDocumentCommitV105,
  isDateLikePlaceV105,
  isValidCanonicalLoadNoV105,
  migrateBusinessStoreV105,
  normalizeCanonicalLoadNoV105,
  normalizeDateV105,
  upsertBusinessLoadV105,
  upsertVaultDocumentV105,
} from '../documents/documentFoundationV105.js';
import { analyzeRateConRiskV10970 } from './rateConRiskReviewV10970.js';

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
  return scanNeedsLoadV11039(typeId);
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
      stops:Array.isArray(fields.stops)?fields.stops:[],
      aliases:record.references || [],
      status:'booked',
      source:'rate_confirmation_v105',
      documentId:record.id,
    });
  }

  if(meta.id==='fuel_receipt' && fields.documentScope==='statement')return upsertFuelTransactions(store,record,fields,readOwnerOpsStoreV102());
  if (record.status === 'needs_review') return store;
  const bucket = operationalBucket(meta);
  if (!bucket) return store;
  const list = Array.isArray(store[bucket]) ? [...store[bucket]] : [];
  if (list.some(item => item.documentId === record.id)) return store;
  const base = {
    id:businessRecordId(bucket),
    date:record.documentDate,
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

function extractedRows(result = {}) { return documentFieldRowsV11038(result); }

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

const ROAD_READY_OPEN_STATUS_ACTIVITY_V1052 = 'road-ready:open-status-activity-v1052';

function openSuggestedLogActivityV1052(saved = {}, onClose) {
  if (typeof window === 'undefined') return;
  const fields = saved.fields || {};
  const reason = fields.suggestedLogActivity || '';
  if (!reason) return;
  window.dispatchEvent(new CustomEvent(ROAD_READY_OPEN_STATUS_ACTIVITY_V1052, {
    detail:{
      reason,
      preferredDocument:{
        documentId:saved.record?.id || '',
        documentType:saved.record?.type || '',
        trailerNo:fields.trailerNo || '',
        poNumber:fields.poNumber || fields.purchaseOrder || '',
        dockAssignment:fields.dockAssignment || fields.dock || '',
        facilityName:fields.facilityName || fields.location || '',
        documentDate:saved.record?.documentDate || fields.documentDate || fields.date || '',
      },
    },
  }));
  onClose?.();
}

function ConfirmCard({ label, value, detail, tone = '' }) {
  return <div className={`scan-confirm-card-v105 ${tone}`}><span>{label}</span><b>{value || 'Needs review'}</b>{detail ? <em>{detail}</em> : null}</div>;
}

import {collectShipmentScanCandidates,shipmentPickerDetails,shipmentFilingFields} from './shipmentFiling.js';
import {libraryScanCandidates} from '../owneros/libraryScanV110434.js';
const collectLoadCandidatesV105=collectShipmentScanCandidates;
export default function SmartScanSheetV105({ state, profile = {}, onClose, onOpenBusiness, onOpenGuide, initialFileV110312 = null, resumeDocumentIdV110312 = '', initialPreferredType = 'auto', evidenceContextV110413 = null }) {
  useEffect(()=>{if(initialFileV110312)chooseFile(initialFileV110312,'auto');},[initialFileV110312]);
  const scanGenerationV11036 = useRef(0);
  const readAbortV110328 = useRef(null);
  const [intakeDraftV110328,setIntakeDraftV110328] = useState(null);
  useEffect(() => () => { scanGenerationV11036.current++;readAbortV110328.current?.abort(); }, []);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [stage, setStage] = useState('capture');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [readerReviewV110345,setReaderReviewV110345] = useState(null);
  const [selectedType, setSelectedType] = useState('');
  const typeChosenByDriver=useRef(false);
  const [documentDate, setDocumentDate] = useState('');
  const dateChosenByDriverV110411=useRef(false);
  const [selectedLoadNo, setSelectedLoadNo] = useState('');
  const [loadSelectionSourceV11037, setLoadSelectionSourceV11037] = useState('unassigned');
  const [selectedStopSequence, setSelectedStopSequence] = useState(0);
  const [linkToLogbook, setLinkToLogbook] = useState(false);
  const [linkDay, setLinkDay] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [match, setMatch] = useState(null);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(null);

  const [businessRevisionV110327,setBusinessRevisionV110327] = useState(0);
  useEffect(() => {
    const refresh = () => setBusinessRevisionV110327(value => value + 1);
    window.addEventListener('owner-op-business-updated',refresh);
    recoverLegacyContractOriginalsV110327().catch(() => {});
    return () => window.removeEventListener('owner-op-business-updated',refresh);
  },[]);
  const store = useMemo(() => migrateBusinessStoreV105(readBusinessStore(), state), [state, stage, businessRevisionV110327]);
  const candidates = useMemo(() => shipmentPickerDetails(loadPickerCandidates(collectLoadCandidatesV105(state, store),state,store,operationalCandidateContext(state,store)),analysis||{}), [state, store, analysis]);
  const selectedMeta = useMemo(() => documentTypeMeta(selectedType || analysis?.type?.id || 'other'), [selectedType, analysis]);
  const selectedLoad = candidates.find(candidate => candidate.loadNo === selectedLoadNo) || match?.candidates?.find(candidate => candidate.loadNo === selectedLoadNo) || null;
  const deliveryStops = (selectedLoad?.stops || []).filter(stop => stop.type === 'delivery');
  const selectedStop = deliveryStops.find(stop => Number(stop.deliverySequence || stop.sequence || 0) === Number(selectedStopSequence || 0)) || null;
  const confidence = Number(analysis?.confidence || 0);
  const requiresLoad = loadDocumentType(selectedType);
  const confirmedInstructionPlanV110311=useMemo(()=>instructionPlanV110311(analysis||{}),[analysis]);
  const needsReview = Boolean(analysis?.pageReadingV110328?.needsReview || analysis?.needsReview || confidence < .85 || !selectedType || requiresLoad && !selectedLoadNo || !documentDate);
  const riskReview = useMemo(() => ['rate_confirmation','load_tender'].includes(selectedType) ? analyzeRateConRiskV10970(analysis || {}) : null, [selectedType, analysis]);
  const riskBlocked = Boolean(riskReview?.blocking && !riskAcknowledged);
  const filingDestination = saved ? scanDestinationV11039(saved.record) : null;
  const canSave = Boolean(file && selectedType && (!needsReview || reviewed) && !riskBlocked);
  const sourceAnalysisV110393=useMemo(()=>analysisWithProjection(analysis,readerReviewV110345,selectedType,selectedLoad?.shipmentFiling?'':selectedLoadNo,loadSelectionSourceV11037,scanWithSourceFields(analysis,readerReviewV110345,selectedType)),[analysis,readerReviewV110345,selectedType,selectedLoadNo,loadSelectionSourceV11037,selectedLoad?.shipmentFiling]);

  function reset(keepPages = false) {
    readAbortV110328.current?.abort();
    if(keepPages !== true)setIntakeDraftV110328(null);
    if(saved?.record?.instructionGuideId)finishSavedScanV110312(saved);
    scanGenerationV11036.current++;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl('');
    setStage('capture');
    setProgress(0);
    setProgressText('');
    setAnalysis(null);setReaderReviewV110345(null);
    setSelectedType('');
    setDocumentDate('');
    setSelectedLoadNo('');
    setLoadSelectionSourceV11037('unassigned');
    setSelectedStopSequence(0);
    setLinkToLogbook(false);
    setLinkDay('');
    setReviewed(false);
    setRiskAcknowledged(false);
    setDetailsOpen(false);
    setMatch(null);
    setMessage('');
    setSaved(null);
  }

  function applyResult(result, preferredLoadNo = '', preserveLoadChoice = false) {
    if(!preserveLoadChoice)typeChosenByDriver.current=Boolean(result.userSelectedTypeV11036);
    dateChosenByDriverV110411.current=false;
    const resumed=result.resumedRecordV110318;
    if(!resumed)result = qualifyScanResultV11036(result, state);
    const typeId = result.type?.id || 'other';
    const businessStore = migrateBusinessStoreV105(readBusinessStore(), state);
    const nextMatch = matchDocumentToLoadV105({ state, businessStore, typeId, fields:result.fields || {}, analysis:result });
    const extractedLoad = primaryLoadReference(result);
    const rateConNewLoad = typeId === 'rate_confirmation' && isValidCanonicalLoadNoV105(extractedLoad) ? extractedLoad : '';
    const planV110311=instructionPlanV110311(result);
    const instructionLoadV110311=instructionFolderV110311(planV110311,[...collectLoadCandidatesV105(state,businessStore),...(businessStore.loads||[])]);
    const loadNo = result.typeEvidenceV110334?.attachmentReview?.required && !preserveLoadChoice ? '' : retainedScanChoice(resumed) ? resumed.loadNo : planV110311 && !preserveLoadChoice ? instructionLoadV110311 : initialScanLoadV11037(result, nextMatch, preferredLoadNo, preserveLoadChoice);
    const date = resumed?.date || documentDateFromResult(result);
    const stopSequence = loadNo === nextMatch.loadNo ? Number(nextMatch.stopSequence || 0) : 0;
    setReaderReviewV110345(null);
    setAnalysis(result);
    setSelectedType(typeId);
    setMatch(nextMatch);
    const safeSelectedLoadV11034 = typeId === 'rate_confirmation' && !nextMatch.loadNo && /broker identity/i.test(String(nextMatch.reason || '')) ? '' : loadNo;
    setSelectedLoadNo(safeSelectedLoadV11034);
    setLoadSelectionSourceV11037((retainedScanChoice(resumed)?resumed.assignment:'') || (preserveLoadChoice ? (safeSelectedLoadV11034 ? 'driver_selected' : 'driver_unassigned') : safeSelectedLoadV11034 ? (nextMatch.source || 'document_reference') : 'unassigned'));
    setSelectedStopSequence(stopSequence);
    setDocumentDate(date);
    setLinkDay(resumed?.linkDay || date || localDateKey());
    setLinkToLogbook(Boolean(resumed ? safeSelectedLoadV11034 && resumed.linkToLogbook : (['bol','pod','delivery_receipt'].includes(typeId)&&safeSelectedLoadV11034&&nextMatch.automatic&&date)||(planV110311 && safeSelectedLoadV11034===instructionLoadV110311 && instructionLoadV110311)||(typeId==='rate_confirmation'&&safeSelectedLoadV11034)));
    setReviewed(false);
    setRiskAcknowledged(false);
    setStage('confirm');
  }

  async function chooseFile(nextFile, preferredType = 'auto', scanMeta = {}) {
    if (!nextFile) return;
    const scanGeneration = ++scanGenerationV11036.current;
    readAbortV110328.current?.abort();
    const controllerV110328=new AbortController();readAbortV110328.current=controllerV110328;
    const {intakeDraftV110328:draftV110328,...readerMetaV110328}=scanMeta;
    if(draftV110328)setIntakeDraftV110328(draftV110328);
    scanMeta=readerMetaV110328;
    const preference = normalizeScanPreferenceV11039(preferredType);
    const requestedType = preference !== 'auto' ? preference : normalizeScanPreferenceV11039(initialPreferredType);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    const displayFileV3 = typeof File !== 'undefined' && scanMeta?.displayFile instanceof File ? scanMeta.displayFile : nextFile;
    setPreviewUrl(String(displayFileV3.type || '').startsWith('image/') ? URL.createObjectURL(displayFileV3) : '');
    setStage('analyzing');
    setProgress(.05);
    setProgressText('Preparing document…');
    setMessage('');
    try {
      if(nextFile.savedScanResultV110318 && !scanMeta.readAgainV110318){applyResult(nextFile.savedScanResultV110318);return;}
      const analysisFile = scanMeta?.ocrFile instanceof File ? scanMeta.ocrFile : nextFile;
      const result = await analyzeTruckDocumentV1040(analysisFile, {
        preferredType:requestedType,
        signal:controllerV110328.signal,
        retainPageSourcesV110347:true,
        fileName:nextFile.name || scanMeta?.originalFileName || scanMeta?.fileName || '',
        scanMeta,
        state,
        profile,
        businessStore:migrateBusinessStoreV105(readBusinessStore(), state),
        onProgress:(value, text) => {
          if (scanGeneration !== scanGenerationV11036.current) return;
          setProgress(previous=>Math.max(previous,Math.min(1,Number(value)||0)));
          setProgressText(text);
        },
      });
      if (scanGeneration !== scanGenerationV11036.current) return;
      const rateConFileNameV10964 = nextFile.name || scanMeta?.originalFileName || scanMeta?.fileName || '';
      applyResult({ ...result, scanMeta:{ ...(scanMeta || {}), ...(result.scanMeta || {}), originalFileName:rateConFileNameV10964 } });
    } catch (error) {
      if (scanGeneration !== scanGenerationV11036.current) return;
      const fallbackType = requestedType !== 'auto' ? requestedType : 'other';
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

  function acceptReaderReviewV110345(value) {
    if(value?.analysis!==analysis)return;
    setReaderReviewV110345(value);
    const typeId=typeChosenByDriver.current?selectedType:filingTypeForReview(value.summary)||selectedType;
    if(typeId!==selectedType){
      setSelectedType(typeId);setReviewed(false);setRiskAcknowledged(false);setLinkToLogbook(false);setSelectedStopSequence(0);
    }
    const refreshed=reviewAssignment({analysis,review:value,typeId,state,businessStore:migrateBusinessStoreV105(readBusinessStore(),state),loadNo:selectedLoadNo,assignment:loadSelectionSourceV11037});
    if(!refreshed)return;
    setMatch(refreshed.match);
    if(!loadSelectionSourceV11037.startsWith('driver_')){
      setSelectedLoadNo(refreshed.loadNo);setLoadSelectionSourceV11037(refreshed.assignment);
      if(refreshed.loadNo!==selectedLoadNo){setSelectedStopSequence(refreshed.stopSequence);setLinkToLogbook(false);setReviewed(false);}
    }
    if(!dateChosenByDriverV110411.current&&refreshed.documentDate){
      const date=safeDocumentDate(refreshed.documentDate);if(date&&date!==documentDate){setDocumentDate(date);setLinkDay(date);setReviewed(false);}
    }
  }

  function changeType(typeId) {
    typeChosenByDriver.current=true;
    const result = reanalyzeTruckDocumentTypeV1040(analysis || {}, typeId, {
      state,
      profile,
      businessStore:migrateBusinessStoreV105(readBusinessStore(), state),
    });
    applyResult({...result, resumedRecordV110318:undefined, userSelectedTypeV11036:typeId}, selectedLoadNo, loadSelectionSourceV11037.startsWith('driver_'));
  }

  function chooseLoad(loadNo) {
    const normalized = normalizeCanonicalLoadNoV105(loadNo);
    setSelectedLoadNo(normalized);
    setLoadSelectionSourceV11037(normalized ? 'driver_selected' : 'driver_unassigned');
    const candidate = candidates.find(item => item.loadNo === normalized) || match?.candidates?.find(item => item.loadNo === normalized) || null;
    const stopMatch = candidate && match?.candidates?.find(item => item.loadNo === normalized)?.stopMatch;
    setSelectedStopSequence(Number(stopMatch?.deliverySequence || stopMatch?.sequence || 0));
    setLinkToLogbook(false); // Changing folders also resets the Logbook destination.
    setReviewed(false);
  }

  const filingSelectedLoadNo=selectedLoadNo;
  async function save() {
    if (!canSave || !file) return;
    setStage('saving');
    setMessage('');
    try {
      const shipmentFields=shipmentFilingFields(selectedLoad);
      const selectedLoadNo=selectedLoad?.shipmentFiling?'':filingSelectedLoadNo;
      const currentStore = migrateBusinessStoreV105(readBusinessStore(), state);
      const meta = selectedMeta;
      assertScanLoadIdentityV110326(meta.id,sourceAnalysisV110393?.fields,sourceAnalysisV110393,selectedLoadNo);
      const finalMatchCandidate = candidates.find(candidate => candidate.loadNo === selectedLoadNo)
        || match?.candidates?.find(candidate => candidate.loadNo === selectedLoadNo)
        || null;
      const finalMatch = {
        ...(match || {}),
        matched:Boolean(selectedLoadNo),
        loadNo:selectedLoadNo,
        canonicalLoadId:selectedLoadNo ? finalMatchCandidate?.id || `load_${selectedLoadNo}` : '',
        broker:selectedLoadNo ? finalMatchCandidate?.broker || (match?.loadNo === selectedLoadNo ? match.broker : '') || '' : '',
        stop:selectedStop,
        stopSequence:Number(selectedStopSequence || 0),
      };
      const statementV1103=meta.id==='fuel_receipt'?parseFuelStatement(/\.csv$/i.test(file.name||'')?await file.text():analysis?.text||'',file.name||'',{workspaceId:window.localStorage.getItem('owner-op-account-data-owner-v1')||''}):null;
      if(statementV1103&&!statementV1103.valid)throw new Error('Fuel statement needs review: '+statementV1103.issues.map(i=>i.code).join(', '));
      const mergedFields = {
        ...(sourceAnalysisV110393?.fields || {}),
        type:meta.id,
        title:analysis?.fields?.title || meta.label,
        date:documentDate,
        documentDate,
        canonicalLoadNo:selectedLoadNo,
        loadAssignmentStatusV11037:selectedLoadNo ? loadSelectionSourceV11037 : 'unassigned',
        linkEventId:'', eventId:'', stopId:'',
        loadNo:selectedLoadNo,
        stopSequence:Number(selectedStopSequence || 0),
        linkDay:linkToLogbook ? linkDay : '',
        linkToLogbook,
      };
      Object.assign(mergedFields,shipmentFields);
      if(statementV1103)Object.assign(mergedFields,fuelStatementFields(statementV1103),{canonicalLoadNo:'',loadNo:'',linkDay:'',linkToLogbook:false,stopSequence:0});
      const instructionPlanForSaveV110311=instructionPlanV110311({...analysis,type:meta});
      const storageFieldsV10964 = compactRateConSaveFieldsV10964(mergedFields);
      Object.assign(storageFieldsV10964,shipmentFields);
      storageFieldsV10964.readerAnalysisV1=sourceAnalysisV110393?.fields?.readerAnalysisV1;
      if(sourceAnalysisV110393?.fields?.readerSourceFieldsV110393)storageFieldsV10964.readerSourceFieldsV110393=sourceAnalysisV110393.fields.readerSourceFieldsV110393;
      if(instructionPlanForSaveV110311 && selectedLoadNo===instructionFolderV110311(instructionPlanForSaveV110311,[...collectLoadCandidatesV105(state,currentStore),...(currentStore.loads||[])])) {
        storageFieldsV10964.instructionPlanV110311=instructionPlanForSaveV110311;
        storageFieldsV10964.stops=instructionPlanForSaveV110311.stops;
      }
      if(meta.id==='rate_confirmation'){
        storageFieldsV10964.guideSourceTextV110312=String(analysis?.text||'').slice(0,16000);
        storageFieldsV10964.guideRisksV110312=(riskReview?.items||[]).map(({id,title,detail})=>({id,title,detail}));
      }
      if(readerReviewV110345?.analysis===analysis)storageFieldsV10964.readerReviewV110345=readerReviewV110345.summary;
      const analysisForSaveV10964 = compactRateConAnalysisV10964(sourceAnalysisV110393 || {}, storageFieldsV10964);
      const intelligence = documentIntelligencePayloadV1040({
        ...analysisForSaveV10964,
        type:meta,
        fields:storageFieldsV10964,
      });
      const compactIntelligencePayloadV10964 = compactIntelligenceV10964(intelligence);
      const stored = await saveScannedDocument({
        file,
        type:backendDocumentTypeV1040(meta.id),
        title:mergedFields.title,
        metadata:{
          ...shipmentFields,
          resumeDocumentIdV110312,
          loadNo:statementV1103?'':selectedLoadNo,
          loadAssignmentStatusV11037:shipmentFields.shipmentReference?'shipment_reference':statementV1103 || !selectedLoadNo ? 'unassigned' : loadSelectionSourceV11037,
          relationType:meta.id === 'bol' ? 'bol' : meta.id === 'pod' ? 'pod' : 'supporting_document',
          notes:'',
          linkDay:!statementV1103 && linkToLogbook ? linkDay : '',
          logDate:!statementV1103 && linkToLogbook ? linkDay : '',
          eventChainId:statementV1103?null:storageFieldsV10964.linkEventId || null,
          family:meta.family,
          stacks:(intelligence.routing?.stacks || []).map(stack => stack.id),
          fingerprint:intelligence.fingerprint,
          intelligence:compactIntelligencePayloadV10964,
        },
        extracted:{ ...storageFieldsV10964, intelligence:compactIntelligencePayloadV10964 },
        classification:{
          selectedType:meta.id,
          detectedType:analysis?.detectedType?.id || analysis?.type?.id || 'other',
          confidence:analysis?.confidence || 0,
          method:analysis?.method || 'truck-document-intelligence-v1042',
          family:meta.family,
          fingerprint:intelligence.fingerprint,
        },
      });
      const captureStorageV3 = await persistCaptureAssetsV106({
        clientDocumentId:stored.localDocument?.client_document_id || '',
        assets:Array.isArray(analysis?.scanMeta?.captureAssets) ? analysis.scanMeta.captureAssets : [],
        captureManifest:analysis?.scanMeta?.captureManifest || null,
        scannerVersion:analysis?.scanMeta?.scannerVersion || '109.5.6',
      });
      stored.capture = captureStorageV3;
      if (stored.localDocument) {
        stored.localDocument.capture_manifest = analysis?.scanMeta?.captureManifest || null;
        stored.localDocument.capture_run_id = captureStorageV3.runId || '';
        stored.localDocument.capture_assets = captureStorageV3.assets || [];
        stored.localDocument.capture_asset_count = Number(captureStorageV3.stored || 0);
      }
      const record = buildVaultDocumentV105({
        stored,
        existing:(currentStore.documents||[]).find(d=>d.id===stored.localDocument?.local_id)||null,
        type:meta,
        fields:storageFieldsV10964,
        analysis:analysisForSaveV10964,
        match:finalMatch,
        selectedLoadNo,
        selectedStopSequence,
        selectedStop,
        documentDate,
        linkDay:linkToLogbook ? linkDay : '',
        linkToLogbook,
        userConfirmed:true,
      });
      Object.assign(record,shipmentFields);
      if(shipmentFields.shipmentReference){record.canonicalLoadId='';record.broker='';record.folder='shipment:'+shipmentFields.shipmentReference;record.reviewReason='Shipment saved; broker load number is not linked yet.';}
      record.evidenceOnlyV110413=Boolean(evidenceContextV110413);
      if(record.evidenceOnlyV110413){record.linkToLogbook=false;record.linkDay='';record.linkedEventId='';delete record.instructionGuide;delete record.loadGuideV110312;delete record.guideActivationRequestedAtV110312;}
      const deliveryCount = Number(finalMatchCandidate?.stops?.filter(stop => stop.type === 'delivery').length || 0);
      if (record.type === 'pod' && deliveryCount && Number(record.stopSequence || 0) >= deliveryCount) record.isFinalStop = true;
      record.sha256=stored.localDocument?.sha256 || '';
      if(statementV1103)Object.assign(record,{canonicalLoadNo:'',loadNo:'',load_no:'',canonicalLoadId:'',broker:'',stopSequence:0,linkToLogbook:false,linkDay:'',linkedEventId:'',documentScope:'statement'});
      const archiveLinkV1103=statementV1103?{status:'statement',eventId:'',day:''}:record.linkToLogbook ? resolveArchiveDocumentLink(record,state) : {status:'unassigned',eventId:'',day:''};
      record.archiveLink=archiveLinkV1103;
      record.linkedEventId=archiveLinkV1103.eventId || '';
      if(archiveLinkV1103.day)record.linkDay=archiveLinkV1103.day;
      if(statementV1103){record.canonicalLoadNo='';record.loadNo='';record.canonicalLoadId='';}
      const instructionSaveV110311=persistInstructionGuideV110311(currentStore,record,storageFieldsV10964.instructionPlanV110311);
      if(meta.id==='rate_confirmation')record.loadGuideV110312=buildSavedDocumentGuideV110312(record,currentStore);
      if(record.instructionGuide||record.loadGuideV110312)record.guideActivationRequestedAtV110312=Date.now();
      let nextStore = upsertVaultDocumentV105(instructionSaveV110311.store, record, state);
      nextStore = addOperationalRecord(nextStore, record, meta, storageFieldsV10964);
      writeBusinessStore(nextStore);
      if(record.linkToLogbook && !record.instructionGuide && !record.loadGuideV110312)dispatchVaultDocumentCommitV105({document:record,record,documentId:record.id,day:record.linkDay,eventId:record.linkedEventId,loadNo:record.canonicalLoadNo});
      const savedViewV10964 = savedViewModelV10964({ record, meta, stored });
      savedViewV10964.fileDocument = {
        client_document_id:stored.localDocument?.client_document_id || '',
        original_file_name:stored.localDocument?.original_file_name || record.fileName || '',
        mime_type:stored.localDocument?.mime_type || '',
        sync_state:stored.localDocument?.sync_state || '',
        storage_path:stored.localDocument?.storage_path || stored.cloud?.storagePath || '',
        local_blob_state:stored.localDocument?.local_blob_state || '',
        extracted:{readerReviewV110345:storageFieldsV10964.readerReviewV110345},
      };
      setSaved(savedViewV10964);
      setStage('saved');
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
      setFile(null);
      setAnalysis(null);setReaderReviewV110345(null);
      setMatch(null);

      const activeRateConFieldsV10964 = meta.id === 'rate_confirmation' ? {
        ...storageFieldsV10964,
        type:'rate_confirmation',
        loadNo:selectedLoadNo || '',
        orderNo:storageFieldsV10964.orderNo || selectedLoadNo || storageFieldsV10964.loadNo || '',
        documentDate,
        date:documentDate,
        linkDay:linkToLogbook ? (linkDay || documentDate) : documentDate,
        linkToLogbook,
      } : null;
      const activeRateConAnalysisV10964 = activeRateConFieldsV10964
        ? compactRateConAnalysisV10964(analysisForSaveV10964, activeRateConFieldsV10964)
        : null;

      // The document and load are already durable in the local Vault/business store.
      // Do not dispatch global app-refresh events while the iPhone save confirmation
      // is mounting. The parent shell reloads persisted state after the scanner closes.
      try {
        window.__ROAD_READY_PENDING_DOCUMENT_REFRESH_V10972__ = {
          type:meta.id,
          loadNo:activeRateConFieldsV10964?.loadNo || selectedLoadNo || '',
          savedAt:Date.now(),
        };
      } catch {}
    } catch (error) {
      setMessage(`Document was not saved. ${String(error?.message || error)}`);
      setStage('confirm');
    }
  }

  if (stage === 'capture') {
    return <SmartDocumentCaptureV100 onClose={onClose} onReady={chooseFile} initialDraft={intakeDraftV110328}/>;
  }

  return (
    <section className="screen smart-scan-v105">
      <header className="smart-scan-head-v105">
        <button type="button" onClick={stage === 'saved' ? () => finishSavedScanV110312(saved,onClose,onOpenGuide) : () => reset(true)} disabled={stage === 'saving'} aria-label="Back"><Icon name="back"/></button>
        <div><span>Road Ready OS</span><b>Smart Scan</b></div>
        {stage !== 'analyzing' && stage !== 'saving' ? <button type="button" onClick={reset}>New</button> : <i/>}
      </header>

      {stage === 'analyzing' ? <main className="scan-analyzing-v105">
        <span><Icon name="scan" size={38}/></span>
        <h1>Reading your document</h1>
        <p>{progressText || 'Reading text, layout and trucking fields…'}</p>
        <div role="progressbar" aria-label="Document reading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress*100)}><i style={{ width:`${Math.max(7, progress * 100)}%` }}/></div>
        <small>{file?.name}</small>
        {intakeDraftV110328&&<button type="button" onClick={()=>reset(true)}>Back to pages</button>}
      </main> : null}

      {(stage === 'confirm' || stage === 'saving') && analysis ? <main className="scan-confirm-v105">
        <section className="scan-file-preview-v105">
          {analysis.resumedRecordV110318 ? <button type="button" onClick={()=>chooseFile(file,'auto',{readAgainV110318:true})}>Read again</button> : null}
          {previewUrl ? <img src={previewUrl} alt="Document preview"/> : <span><Icon name="file" size={38}/></span>}
          <div><em>{needsReview ? 'CHECK 3 ITEMS' : 'DOCUMENT MATCHED'}</em><h1>{selectedMeta.label}</h1><p>{needsReview ? 'The original is safe. Confirm type, load and date.' : 'Road Ready found a strong filing match.'}</p></div>
        </section>

        {evidenceContextV110413?.loadNo?<p role="status">Requested folder: Load {evidenceContextV110413.loadNo}. Confirm the folder below; source references may differ.</p>:null}
        {analysis.typeEvidenceV110334?.requiresTypeReview&&(analysis.typeEvidenceV110334.mixedDocuments||analysis.typeEvidenceV110334.attachmentReview?.required||!analysis.userSelectedTypeV11036)&&<p role="status" className="scan-type-evidence-v334">{analysis.typeEvidenceV110334.reason}</p>}
        {analysis.pageReadingV110328&&<p role="status" style={{margin:0,padding:16,borderRadius:16,background:analysis.pageReadingV110328.unreadablePages.length?'#fff0e8':'#e5f5ef',color:'#304f4a',fontSize:13,lineHeight:1.5}}>{analysis.pageReadingV110328.unreadablePages.length?`Pages ${analysis.pageReadingV110328.unreadablePages.join(', ')} could not be fully read. Return to pages to check them, or save for review.`:`Read ${analysis.pageReadingV110328.readable} of ${analysis.pageReadingV110328.total} pages. Check the details below.`}</p>}
        {selectedType === 'pod' ? <p className="reader-pod-reading-note" role="status">{podReadingMessage(selectedType,sourceAnalysisV110393?.fields?.readerAnalysisV1)}</p> : null}
        <section className="scan-three-v105">
          <label>
            <span>1 · Document type</span>
            <select aria-label="Document type" value={selectedType} onChange={event => changeType(event.target.value)}>{SMART_DOCUMENT_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select>
          </label>

          {requiresLoad ? <LoadFolderPicker candidates={candidates} value={selectedLoadNo || ''} onChange={chooseLoad} createLoadNo={selectedType === 'rate_confirmation' ? primaryLoadReference(analysis) : ''}/> : <ConfirmCard label="2 · Filing area" value={scanDestinationV11039({type:selectedType}).label} detail="No load number required"/>}

          <label>
            <span>3 · {analysis?.fields?.filingDateSource === 'pickup_date' ? 'Filing date (pickup)' : 'Document date'}</span>
            <input aria-label="Document date" type="date" value={documentDate || ''} onChange={event => { dateChosenByDriverV110411.current=true; setDocumentDate(event.target.value); setLinkDay(event.target.value || linkDay); setReviewed(false); }}/>
            {scanDateNoticeV110323(documentDate,selectedLoadNo,candidates) ? <em role="status">{scanDateNoticeV110323(documentDate,selectedLoadNo,candidates)}</em> : null}
            {!documentDate ? <em>Reader did not verify the date.</em> : analysis?.fields?.filingDateSource === 'pickup_date' ? <em>Pickup date used for filing. This sheet has no separate issue date.</em> : null}
          </label>
        </section>

        {requiresLoad && selectedLoadNo ? <section className="scan-destination-v105">
          <header><span><Icon name="folder" size={18}/></span><div><b>{selectedLoad?.shipmentFiling?'Shipment / BOL ':'Load '}{selectedLoadNo}</b><em>{selectedLoad?.shipmentFiling?(selectedLoad.company||selectedLoad.destination||'Recorded pickup'):(selectedLoad?.broker || (confirmedInstructionPlanV110311?.loadNo===selectedLoadNo ? confirmedInstructionPlanV110311.broker : match?.broker) || 'Load folder')}</em></div><strong>{scanAssignmentBadge(match,loadSelectionSourceV11037,selectedLoadNo,selectedType)}</strong></header>
          {deliveryStops.length ? <label><span>Attach to stop</span><select value={selectedStopSequence || 0} onChange={event => { setSelectedStopSequence(Number(event.target.value)); setReviewed(false); }}><option value="0">Load level / Pickup paperwork</option>{deliveryStops.map(stop => <option key={stop.id || stop.deliverySequence} value={stop.deliverySequence || stop.sequence}>{fmtStop(stop)}</option>)}</select></label> : null}
          {selectedStop ? <p>{fmtStop(selectedStop)}</p> : null}
        </section> : null}

        {documentLinkableV1040(selectedType) ? <section className="scan-log-link-v105">
          <label><input type="checkbox" checked={linkToLogbook} onChange={event => setLinkToLogbook(event.target.checked)}/><span><b>Also show under Logbook supporting documents</b><em>This never changes duty time, duty status or location.</em></span></label>
          {linkToLogbook ? <input type="date" value={linkDay || documentDate || localDateKey()} onChange={event => setLinkDay(event.target.value)}/> : null}
        </section> : null}

        {['rate_confirmation','load_tender'].includes(selectedType) && riskReview ? <section className={`ratecon-risk-review-v10970 ${riskReview.blocking ? 'critical' : 'clear'}`}>
          <header><span><Icon name="alert" size={22}/></span><div><em>MANDATORY RISK AND DEDUCTION REVIEW</em><h2>{riskReview.items.length ? 'Load requirements and possible charges' : 'No matching risk clauses found in readable text'}</h2><p>Checks use readable document text. Review the original pages for additional terms, charges and requirements.</p></div></header>
          {riskReview.items.length ? <div className="ratecon-risk-list-v10970">{riskReview.items.map(item => <article key={item.id} className={item.severity}><i>{item.severity === 'critical' ? '!' : '•'}</i><div><b>{item.title}</b><span>{item.detail}</span></div></article>)}</div> : <p className="ratecon-risk-clear-v10970">No matching clauses were found in the readable text. Review all original pages before accepting the load.</p>}
          {riskReview.blocking ? <label className="ratecon-risk-ack-v10970"><input type="checkbox" checked={riskAcknowledged} onChange={event=>setRiskAcknowledged(event.target.checked)}/><span><b>I reviewed these risks and have the required links/apps</b><em>Saving or booking remains blocked until this is acknowledged.</em></span></label> : null}
        </section> : null}

        <section className="scan-details-v105">
          <OwnedReaderPreview compact disabled={stage==='saving'} analysis={analysis} reviewState={readerReviewV110345} onReviewChange={acceptReaderReviewV110345} onReady={acceptReaderReviewV110345} />
          <details><summary>Document reading information</summary>
            <ScanEvidenceReviewV11036 analysis={sourceAnalysisV110393} />
            <AnalysisSummary snapshot={sourceAnalysisV110393?.fields?.readerAnalysisV1}/>
            <button type="button" onClick={() => setDetailsOpen(value => !value)}><span>Extracted details</span><em>{detailsOpen ? 'Hide' : `${extractedRows(sourceAnalysisV110393).length} fields`}</em></button>
            {detailsOpen ? <div>{extractedRows(sourceAnalysisV110393).map(({key,label,value}) => <span key={key}><b>{label}</b><em>{value}</em></span>)}</div> : null}
          </details>
        </section>

        {needsReview ? <label className="scan-driver-check-v105"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)}/><span><b>I checked the type, load and date</b><em>Road Ready will file the original exactly where shown above.</em></span></label> : null}
        {message ? <p className="scan-message-v105"><Icon name="alert" size={17}/>{message}</p> : null}
        {riskBlocked ? <p className="scan-message-v105 ratecon-risk-block-v10970"><Icon name="alert" size={17}/>Booking is blocked until the Risk and Deduction Review is acknowledged.</p> : null}
        <button type="button" className="scan-save-v105" disabled={!canSave || stage === 'saving'} onClick={save}>{stage === 'saving' ? 'Saving original…' : <><Icon name="check" size={19}/> {(!documentDate || selectedType === 'other' || requiresLoad && !selectedLoadNo) ? 'Save for review' : 'Save document'}</>}</button>
      </main> : null}

      {stage === 'saved' && saved ? <main className="scan-saved-v105">
        <span><Icon name="check" size={38}/></span>
        <em>{saved.record.instructionGuideId ? 'DOCUMENT AND GUIDE SAVED' : 'DOCUMENT SAVED'}</em>
        <h1>{saved.meta.label}</h1>
        <section className="scan-saved-location-v344"><h2>Saved · {filingDestination.label}</h2><p>{saved.record.documentDate || 'Date needs review'}</p><p>Find this file in <strong>Documents → Browse all saved files</strong>.</p><p>{saved.record.fileName}</p><SavedFileActionsV110344 document={saved.fileDocument}/></section>
        {saved.record.instructionGuideId ? <p>Your route, stops and requirements are saved. Open the guide now, or find it on Home under Full mission.</p> : null}
        <details><summary>Saved document details</summary><section>
          <ConfirmCard label="Filed to" value={filingDestination.label} detail={filingDestination.detail} tone={filingDestination.tone}/>
          <ConfirmCard label="Document date" value={saved.record.documentDate || 'Not confirmed'} detail={saved.record.linkToLogbook ? `Log day ${saved.record.linkDay}` : 'Original preserved'}/>
          <ConfirmCard label="Storage" value={saved.stored.cloud?.status === 'synced' ? 'Cloud synced' : 'Saved in this app on this device'} detail={saved.record.fileName}/>
          {saved.fields?.suggestedLogActivity ? <ConfirmCard label="Suggested Logbook activity" value={saved.fields.suggestedLogActivity} detail="Driver confirmation creates the ON DUTY event; the document is already preserved."/> : null}
        </section></details>
        {!saved.record.instructionGuideId && saved.record.canonicalLoadNo ? <button type="button" className="scan-save-v105" onClick={()=>{onClose?.();onOpenBusiness?.('loads');}}>Done · Open load</button> : null}
        {saved.record.instructionGuideId ? <button type="button" className="scan-save-v105" onClick={()=>finishSavedScanV110312(saved,onClose,onOpenGuide)}>Done · Open guide</button> : null}
        <div><button type="button" onClick={reset}>Scan another</button>{saved.fields?.suggestedLogActivity ? <button type="button" className="primary" onClick={() => openSuggestedLogActivityV1052(saved, onClose)}>Add {saved.fields.suggestedLogActivity} to Logbook</button> : <button type="button" className="primary" onClick={() => { try { finishSavedScanV110312(saved,onClose); } catch {} window.setTimeout(() => { try { onOpenBusiness?.('documents'); } catch {} }, 0); }}>Open Documents</button>}</div>
      </main> : null}
    </section>
  );
}

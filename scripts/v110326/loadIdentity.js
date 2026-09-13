const text = value => String(value ?? '').trim();
const ref = value => text(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
const loadRef = value => ref(value?.canonicalLoadNo || value?.loadNo || value?.orderNo || value?.shippingDocs);
const brokerKey = value => ref(text(value).replace(/\b(?:LLC|INC|CORP|COMPANY)\b\.?/gi, ''));
const contract = type => ['rate_confirmation','load_tender'].includes(type);
const sourceText = record => text(record.extracted?.guideSourceTextV110312 || record.extracted?.instructionPlanV110311?.sourceText);

function printedBroker(raw = '') {
  if (/\bTOTAL\s+QUALITY\s+LOGISTICS\b|\bTQL\s+(?:CONTACT\s+INFO|PO\s*#)/i.test(raw)) return 'Total Quality Logistics (TQL)';
  // Select's logo may be absent from PDF text. Require its corporate MC,
  // domain and issuer label together; never identify a broker by a load number.
  // Public identities: https://www.goselect.com/ and FMCSA MC-984301.
  if (/\bMC\s*#?\s*[:#-]?\s*984301\b/i.test(raw) &&
    /(?:@|\.)goselect\.com\b/i.test(raw) && /\bSelect\s+(?:Agent\s+Name|Load\s*#)/i.test(raw)) return 'Select Transport Partners LLC';
  return '';
}

export function sameLoadIdentityV110326(left = {}, right = {}) {
  return Boolean(loadRef(left) && loadRef(left) === loadRef(right) &&
    (!left.broker || !right.broker || brokerKey(left.broker) === brokerKey(right.broker)));
}

export function scopedLoadInfoV110326(info = {}, incoming = {}) {
  return sameLoadIdentityV110326(info, incoming) ? info : {};
}

// Only primary load labels establish contract identity. Pickup, BOL and shared
// PO aliases never authorize copying another load's broker or guide progress.
export function printedLoadReferencesV110326(raw = '') {
  const matches = [...text(raw).matchAll(/\b(?:LOAD\s*(?:NO\.?|NUMBER|ID|#)|TQL\s+PO\s*#)\s*(?:[:#-]\s*)*([A-Z0-9][A-Z0-9._/-]{2,31})/gi)];
  return [...new Set(matches.map(m => ref(m[1])).filter(v => /\d/.test(v)))];
}

export function assertScanLoadIdentityV110326(type, fields = {}, analysis = {}, selectedLoadNo = '') {
  if (!contract(type) || !selectedLoadNo) return;
  const printed = printedLoadReferencesV110326(analysis.text || analysis.rawText || fields.guideSourceTextV110312);
  if (printed.length && !printed.includes(ref(selectedLoadNo))) {
    throw new Error('The load number on this document differs from the selected folder. Choose the document’s load or Needs Review.');
  }
}

export function documentBrokerV110326(type, fields = {}, analysis = {}, match = {}, existing = {}) {
  if (!contract(type)) return text(match.broker || fields.broker || existing?.broker);
  const raw = text(analysis.text || analysis.rawText || fields.guideSourceTextV110312);
  return printedBroker(raw) || text(fields.broker || analysis.fields?.broker);
}

// Repairs require the same primary number and broker evidence on the stored
// source document. A folder label or current active load is not evidence.
export function savedDocumentIdentityV110326(record = {}) {
  if (!contract(record.type)) return null;
  const raw = sourceText(record), printed = printedLoadReferencesV110326(raw);
  if (printed.length !== 1 || printed[0] !== loadRef(record)) return null;
  const broker = documentBrokerV110326(record.type, record.extracted, {text:raw});
  if (!broker || !brokerKey(raw).includes(brokerKey(broker)) && brokerKey(printedBroker(raw)) !== brokerKey(broker)) return null;
  return {loadNo:record.canonicalLoadNo || record.loadNo, broker};
}

export function savedDocumentConflictV110326(record = {}) {
  if (!contract(record.type) || !loadRef(record)) return false;
  const printed = printedLoadReferencesV110326(sourceText(record));
  return printed.length > 0 && !printed.includes(loadRef(record));
}

export function repairBusinessIdentityV110326(store = {}) {
  let changed = false;
  const documents = (store.documents || []).map(record => {
    const proof = savedDocumentIdentityV110326(record);
    if (!proof || brokerKey(proof.broker) === brokerKey(record.broker)) return record;
    changed = true;
    return {...record, broker:proof.broker,
      extracted:{...record.extracted, broker:proof.broker},
      instructionGuide:undefined, loadGuideV110312:undefined,
      brokerRepairV110326:{previousBroker:record.broker || '', sourceDocumentId:record.id}};
  });
  const loads = (store.loads || []).map(load => {
    const id = load.rateConfirmationDocumentId || load.documentId || load.instructionsDocumentId;
    const linked = documents.filter(d => (!id || d.id === id) && loadRef(d) === loadRef(load) && savedDocumentIdentityV110326(d));
    if (linked.length !== 1 || brokerKey(load.broker) === brokerKey(linked[0].broker)) return load;
    const record = linked[0], fields = record.extracted || {};
    changed = true;
    return {...load, broker:record.broker,
      origin:text(fields.origin), destination:text(fields.destination),
      pickupDate:text(fields.pickupDate), deliveryDate:text(fields.deliveryDate),
      stops:Array.isArray(fields.stops) ? fields.stops : [], equipment:text(fields.equipment),
      brokerRepairV110326:{previousBroker:load.broker || '', sourceDocumentId:record.id}};
  });
  return changed ? {...store, documents, loads} : store;
}

export function repairGuideIdentityV110326(state = {}, store = {}, buildGuide) {
  let next = state;
  for (const guide of Object.values(state.loadGuidesById || {})) {
    const id = guide.sourceDocumentId || guide.documents?.rateConfirmationDocumentId || guide.instructionsDocumentId;
    const record = (store.documents || []).find(d => d.id === id);
    if (!record) continue;
    if (savedDocumentConflictV110326(record) ||
      contract(record.type) && loadRef(record) && loadRef(guide) !== loadRef(record)) {
      if (guide.identityReviewV110326) continue;
      next = {...next, loadGuidesById:{...next.loadGuidesById,
        [guide.id]:{...guide, identityReviewV110326:true}}};
      if (next.activeLoadGuideId === guide.id) next = {...next, activeLoadGuideId:'', loadInfo:{}};
      continue;
    }
    const proof = savedDocumentIdentityV110326(record);
    if (!proof || brokerKey(guide.broker) === brokerKey(proof.broker)) continue;
    const rebuilt = buildGuide(record, store);
    if (!rebuilt) continue;
    const corrected = {...rebuilt, id:guide.id, status:guide.status,
      excludedFromActiveLoad:guide.excludedFromActiveLoad, completedAt:guide.completedAt,
      brokerRepairV110326:{previousGuide:guide, sourceDocumentId:record.id}};
    next = {...next, loadGuidesById:{...next.loadGuidesById, [guide.id]:corrected}};
  }
  return next;
}

export function candidateIdentityV110326(candidate, store = {}) {
  const ownDocuments = (store.documents || []).filter(d => contract(d.type) && loadRef(d) === loadRef(candidate));
  const proofs = ownDocuments.filter(d => savedDocumentIdentityV110326(d));
  const brokers = new Set(proofs.map(d => brokerKey(d.broker)));
  if (brokers.size === 1) return {...candidate, broker:proofs[0].broker};
  if (brokers.size > 1 || ownDocuments.length && ownDocuments.every(savedDocumentConflictV110326)) {
    return {...candidate, broker:'Broker needs review', identityReviewV110326:true};
  }
  return candidate;
}

// Non-destructive BOL -> POD lifecycle. No matching by filename, load or BOL number.
// Receipts must come from createVerifiedPodReceipt after an authenticated cloud
// read-back. OCR/classification, a save promise and sync_state are not receipts.
const text = value => typeof value === 'string' ? value.trim() : '';
const list = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(Boolean))].sort();
const stable = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const copy = value => JSON.parse(JSON.stringify(value));
const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const one = values => { const found = unique(values.map(text)); return found.length === 1 ? found[0] : ''; };
export function podDocumentId(doc) {
  for (const values of [[doc?.client_document_id,doc?.clientDocumentId],[doc?.local_id,doc?.localDocumentId],[doc?.id]]) {
    if (values.some(value => text(value))) return one(values);
  }
  return '';
}
const kind = doc => one([doc?.type, doc?.document_type, doc?.extracted?.type]);
const hash = doc => {
  const value = one([doc?.sha256, doc?.content_hash, doc?.contentHash, doc?.metadata?.sha256].map(v => text(v).toLowerCase()));
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
};
const pageCount = doc => {
  const values = unique([doc?.page_count, doc?.pageCount, doc?.extracted?.pageCount].filter(v => v != null).map(v => String(v)));
  const count = values.length === 1 ? Number(values[0]) : 0;
  return Number.isSafeInteger(count) && count > 0 && count <= 10000 ? count : 0;
};
const byteCount = doc => {
  const values = unique([doc?.file_size_bytes, doc?.fileSizeBytes].filter(v => v != null).map(v => String(v)));
  const count = values.length === 1 ? Number(values[0]) : 0;
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
};
const review = doc => doc?.extracted?.evidenceFactsV1;
const unavailable = doc => !!(doc?.deleted || doc?.deletedAt || doc?.deleted_at || doc?.archivedAt || /^(deleted|archived|void|cancelled|canceled)$/i.test(text(doc?.status)));
function owner(doc) { return one([doc?.owner_user_id, doc?.user_id, doc?.ownerId]); }
function associations(doc) {
  // Aliases have the same meaning; missing values are not load identity evidence.
  const groups = {loadId:['load_id','loadId'],loadNo:['load_no','loadNo','canonicalLoadNo'],
    stopId:['stopId'],stopSequence:['stopSequence','stop_sequence'],pickupStopId:['pickupStopId'],deliveryStopId:['deliveryStopId'],
    eventId:['linkedEventId','linkEventId','eventId','duty_event_chain_id'],logDay:['log_day_id','linkDay'],
    loadIds:['loadIds'],loadAssociations:['loadAssociations'],documentAssociations:['documentAssociations'],archiveEventDays:['archiveEventDays'],pages:['pages']};
  const result = {};
  for (const [name, fields] of Object.entries(groups)) {
    const values = fields.flatMap(key => [doc?.[key],doc?.extracted?.[key]]).filter(v => v !== undefined && v !== null && v !== '');
    if (values.length) result[name] = unique(values.map(v => stable(name === 'loadNo' ? String(v).toUpperCase() : v)));
  }
  return result;
}
function load(doc) {
  return one([doc?.load_no,doc?.loadNo,doc?.canonicalLoadNo,doc?.extracted?.loadNo,doc?.extracted?.canonicalLoadNo,review(doc)?.fields?.loadNo].map(v => text(v).toUpperCase()));
}
// Bind all business evidence and source locators, but exclude transport status
// and lifecycle certificates so a later receipt does not recursively bind itself.
export function podRecordSnapshot(doc) {
  return stable({id:podDocumentId(doc), owner:owner(doc), kind:kind(doc), sha256:hash(doc),
    bytes:byteCount(doc), pages:pageCount(doc), associations:associations(doc), review:review(doc) || null,
    original:{localId:doc?.local_id || doc?.localDocumentId || '',serverId:doc?.server_id || doc?.serverDocumentId || '',
      storagePath:doc?.storage_path || doc?.storagePath || '',mime:doc?.mime_type || doc?.mimeType || ''},
    unavailable:unavailable(doc)});
}
function signatureVerified(doc) {
  const value = review(doc);
  return value?.version === 1 && value.source === 'driver_review' && time(value.reviewedAt) > 0
    && value.sourceSha256 === hash(doc) && value.fields?.podSigned === true && !list(value.components).length
    && value.receiverAcknowledgement?.version === 1 && value.receiverAcknowledgement.confirmed === true
    && value.receiverAcknowledgement.method === 'explicit_receiver_signature_check'
    && value.receiverAcknowledgement.sourceSha256 === hash(doc) && value.receiverAcknowledgement.reviewedAt === value.reviewedAt;
}
function reasonsBeforeReceipt({bol, pod, lineage} = {}) {
  const reasons = [], add = (condition, code) => { if (!condition) reasons.push(code); };
  add(!!bol && !!pod, 'documents_required');
  add(!!podDocumentId(bol) && !!podDocumentId(pod), 'stable_identity_required');
  add(kind(bol) === 'bol' && kind(pod) === 'pod', 'bol_to_pod_only');
  add(!unavailable(bol) && !unavailable(pod), 'document_unavailable');
  add(!!hash(bol) && !!hash(pod) && !!byteCount(bol) && !!byteCount(pod), 'verified_original_fingerprint_required');
  add(!!pageCount(bol) && !!pageCount(pod), 'complete_page_count_required');
  add(!!load(bol) && load(bol) === load(pod) && stable(associations(bol)) === stable(associations(pod)), 'association_mismatch');
  add([bol,pod].every(doc => unique([doc?.owner_user_id,doc?.user_id,doc?.ownerId].map(text)).length <= 1)
    && (!owner(bol) || !owner(pod) || owner(bol) === owner(pod)), 'owner_mismatch');
  add(!list(review(bol)?.components).length && !list(review(pod)?.components).length, 'packet_requires_component_review');
  add(signatureVerified(pod), 'verified_receiver_signature_required');
  add(lineage?.version === 1 && ['same_original_reclassification','signed_version_of'].includes(lineage?.relation)
    && lineage?.verifiedBy === 'driver' && !!text(lineage?.verificationId) && time(lineage?.verifiedAt) > 0 && lineage?.wholeDocument === true, 'explicit_verified_lineage_required');
  add(lineage?.sourceDocumentId === podDocumentId(bol) && lineage?.targetDocumentId === podDocumentId(pod)
    && lineage?.sourceSha256 === hash(bol) && lineage?.targetSha256 === hash(pod)
    && lineage?.sourceSnapshot === podRecordSnapshot(bol) && lineage?.targetSnapshot === podRecordSnapshot(pod), 'stale_or_mismatched_lineage');
  const pages = list(lineage?.pageMap);
  add(pageCount(bol) === pageCount(pod) && pages.length === pageCount(bol) && pages.length > 0
    && pages.every(p => Number.isInteger(p?.sourcePage) && p.sourcePage >= 1 && p.sourcePage <= pageCount(bol)
      && Number.isInteger(p?.targetPage) && p.targetPage >= 1 && p.targetPage <= pageCount(pod))
    && new Set(pages.map(p => p.sourcePage)).size === pages.length
    && new Set(pages.map(p => p.targetPage)).size === pages.length, 'complete_one_to_one_page_lineage_required');
  if (lineage?.relation === 'same_original_reclassification') add(hash(bol) === hash(pod) && byteCount(bol) === byteCount(pod), 'same_original_bytes_required');
  if (podDocumentId(bol) === podDocumentId(pod)) add(lineage?.relation === 'same_original_reclassification', 'immutable_identity_cannot_replace_bytes');
  return reasons;
}
function validContentReference(ref, doc) {
  return ref?.version === 1 && text(ref.ownerId) && ref.sha256 === hash(doc) && ref.bytes === byteCount(doc)
    && text(ref.objectKey) && !/^https?:/i.test(ref.objectKey);
}
export function evaluatePodSupersession(input = {}) {
  const {bol,pod,lineage,receipt} = input, reasons = reasonsBeforeReceipt(input);
  const fail = (condition, code) => { if (!condition) reasons.push(code); };
  fail(receipt?.version === 1 && receipt?.source === 'authenticated_cloud_readback' && text(receipt?.ownerId)
    && time(receipt?.verifiedAt) >= time(lineage?.verifiedAt) && Number.isSafeInteger(receipt?.revision) && receipt.revision > 0,
  'verified_persisted_sync_receipt_required');
  fail(receipt?.sourceSnapshot === podRecordSnapshot(bol) && receipt?.targetSnapshot === podRecordSnapshot(pod)
    && receipt?.lineageSnapshot === stable(lineage), 'stale_or_mismatched_receipt');
  fail(validContentReference(receipt?.sourceContent,bol) && validContentReference(receipt?.targetContent,pod)
    && receipt.sourceContent.ownerId === receipt.ownerId && receipt.targetContent.ownerId === receipt.ownerId
    && (!owner(bol) || owner(bol) === receipt.ownerId) && (!owner(pod) || owner(pod) === receipt.ownerId), 'recoverable_owned_originals_required');
  if (lineage?.relation === 'same_original_reclassification') fail(stable(receipt?.sourceContent) === stable(receipt?.targetContent), 'reuse_existing_content_required');
  return {eligible:reasons.length === 0,reasons:unique(reasons)};
}

// The caller supplies an authenticated read-back adapter, not arbitrary OCR facts.
// readBack returns the persisted record, original bytes and immutable content ref
// for the requested ID/revision, after checking the active owner. No writes occur.
export async function createVerifiedPodReceipt({bol,pod,lineage,ownerId,revision,readBack,hashBytes,now = () => new Date().toISOString()}) {
  const reasons = reasonsBeforeReceipt({bol,pod,lineage});
  if (reasons.length) throw Object.assign(new Error('POD supersession needs review: ' + reasons.join(', ')), {reasons});
  if (!text(ownerId) || !Number.isSafeInteger(revision) || revision <= 0 || typeof readBack !== 'function' || typeof hashBytes !== 'function') throw new Error('Authenticated cloud read-back is required.');
  async function verify(doc, previousVersion = false) {
    const result = await readBack({documentId:podDocumentId(doc),ownerId,revision,previousVersion});
    if (result?.ownerId !== ownerId || result?.revision !== revision || podRecordSnapshot(result?.document) !== podRecordSnapshot(doc)) throw new Error('Saved document metadata changed or has not synchronized.');
    const bytes = result.original instanceof ArrayBuffer ? result.original : await result.original?.arrayBuffer?.();
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== byteCount(doc) || await hashBytes(bytes) !== hash(doc)) throw new Error('Saved original failed cloud verification.');
    if (!validContentReference(result.contentReference,doc) || result.contentReference.ownerId !== ownerId) throw new Error('Saved original has no recoverable content reference.');
    return copy(result.contentReference);
  }
  // In-place promotion must keep the former metadata revision in saved history.
  const sourceContent = await verify(bol,podDocumentId(bol) === podDocumentId(pod));
  const targetContent = await verify(pod);
  const receipt = {version:1,source:'authenticated_cloud_readback',ownerId,revision,verifiedAt:now(),
    sourceSnapshot:podRecordSnapshot(bol),targetSnapshot:podRecordSnapshot(pod),lineageSnapshot:stable(lineage),sourceContent,targetContent};
  const check = evaluatePodSupersession({bol,pod,lineage,receipt});
  if (!check.eligible) throw Object.assign(new Error('POD verification did not establish safe supersession.'),{reasons:check.reasons});
  return receipt;
}

// A same-original promotion is staged, not applied. Keep the same ID/blob; save
// previousVersion with the candidate so cloud read-back can verify both versions.
export function prepareSameOriginalPodPromotion({bol,fields,reviewedAt,verificationId,receiverSignatureConfirmed=false} = {}) {
  if (kind(bol) !== 'bol' || !podDocumentId(bol) || !hash(bol) || !byteCount(bol) || !pageCount(bol)
    || !time(reviewedAt) || !text(verificationId) || fields?.podSigned !== true || receiverSignatureConfirmed !== true
    || text(fields?.loadNo).toUpperCase() !== load(bol) || list(review(bol)?.components).length) throw new Error('Review the complete original and its receiver signature first.');
  const pod = {...copy(bol),type:'pod',document_type:'pod',updated_at:reviewedAt,
    extracted:{...copy(bol.extracted || {}),type:'pod',evidenceFactsV1:{version:1,source:'driver_review',sourceSha256:hash(bol),reviewedAt,fields:copy(fields),components:[],
      receiverAcknowledgement:{version:1,confirmed:true,method:'explicit_receiver_signature_check',sourceSha256:hash(bol),reviewedAt}}}};
  const lineage = {version:1,relation:'same_original_reclassification',verifiedBy:'driver',verificationId,verifiedAt:reviewedAt,wholeDocument:true,
    sourceDocumentId:podDocumentId(bol),targetDocumentId:podDocumentId(pod),sourceSha256:hash(bol),targetSha256:hash(pod),
    sourceSnapshot:podRecordSnapshot(bol),targetSnapshot:podRecordSnapshot(pod),
    pageMap:Array.from({length:pageCount(bol)},(_,i) => ({sourcePage:i+1,targetPage:i+1}))};
  const reasons = reasonsBeforeReceipt({bol,pod,lineage});
  if (reasons.length) throw Object.assign(new Error('The saved original associations changed.'),{reasons});
  return {version:1,operation:'metadata_only',uploadRequired:false,applyAfterVerification:true,
    original:copy(bol),candidate:pod,lineage,previousVersion:copy(bol)};
}

export function planPodSupersession(input = {}) {
  const check = evaluatePodSupersession(input);
  if (!check.eligible) return {...check,records:null,uploadRequired:false,deleteOriginal:false};
  const {bol,pod,lineage,receipt} = input, certificate = {version:1,lineage:copy(lineage),receipt:copy(receipt)};
  const primary = {...copy(pod),podLifecycleV1:{...certificate,state:'primary',supersedesDocumentId:podDocumentId(bol),previousVersions:[copy(bol)]}};
  const sameId = podDocumentId(bol) === podDocumentId(pod);
  const previous = {...copy(bol),podLifecycleV1:{...certificate,state:'superseded',supersededByDocumentId:podDocumentId(pod)}};
  return {...check,records:sameId?[primary]:[previous,primary],primaryDocument:primary,previousVersion:copy(bol),uploadRequired:false,deleteOriginal:false};
}

// Apply only to complete document sets before load/week filtering. If a target,
// page, receipt or association is missing/conflicted, retain the BOL visibly.
export function projectPodPrimaryDocuments(documents = []) {
  const allDocuments = list(documents).filter(Boolean), previousVersions = [], conflicts = [], hidden = new Set();
  const index = new Map();
  for (const doc of allDocuments) { const id = podDocumentId(doc); if (!index.has(id)) index.set(id,[]); index.get(id).push(doc); }
  for (const doc of allDocuments) {
    const state = doc.podLifecycleV1;
    if (state?.state === 'primary') {
      for (const old of list(state.previousVersions)) {
        const check = evaluatePodSupersession({bol:old,pod:doc,lineage:state.lineage,receipt:state.receipt});
        if (check.eligible) previousVersions.push({document:old,primaryDocumentId:podDocumentId(doc),recoverable:true});
        else conflicts.push({documentId:podDocumentId(doc),reasons:check.reasons});
      }
    }
    if (state?.state !== 'superseded') continue;
    const targets = index.get(state.supersededByDocumentId) || [];
    if (targets.length !== 1 || (index.get(podDocumentId(doc)) || []).length !== 1) { conflicts.push({documentId:podDocumentId(doc),reasons:['ambiguous_or_missing_target']}); continue; }
    const pod = targets[0];
    if (pod.podLifecycleV1?.state !== 'primary' || pod.podLifecycleV1?.supersedesDocumentId !== podDocumentId(doc)) { conflicts.push({documentId:podDocumentId(doc),reasons:['primary_lineage_required']}); continue; }
    const check = evaluatePodSupersession({bol:doc,pod,lineage:state.lineage,receipt:state.receipt});
    if (check.eligible && stable(pod.podLifecycleV1.receipt) === stable(state.receipt) && stable(pod.podLifecycleV1.lineage) === stable(state.lineage)) hidden.add(doc);
    else conflicts.push({documentId:podDocumentId(doc),reasons:check.eligible?['certificate_conflict']:check.reasons});
  }
  return {primaryDocuments:allDocuments.filter(doc => !hidden.has(doc)).map(pendingPodDisplay),previousVersions,allDocuments,conflicts};
}

// Called only after saveReviewedFacts has rehashed the actual original bytes.
export function stageReviewedPodPromotion(bol, pod) {
  if (['pending_sync','review_required'].includes(bol?.podLifecycleV1?.state)) {
    const previous = bol.podLifecycleV1.previousVersions?.[0];
    if (previous) bol = !pageCount(previous) && pageCount(bol) && hash(previous) === hash(bol) ? {...previous,page_count:pageCount(bol)} : previous;
  }
  if (![bol?.type,bol?.document_type,bol?.extracted?.type].includes('bol') || kind(pod) !== 'pod') return pod;
  const reviewedAt = review(pod)?.reviewedAt;
  const lineage = {version:1,relation:'same_original_reclassification',verifiedBy:'driver',
    verificationId:podDocumentId(pod)+':'+reviewedAt,verifiedAt:reviewedAt,wholeDocument:true,
    sourceDocumentId:podDocumentId(bol),targetDocumentId:podDocumentId(pod),sourceSha256:hash(bol),targetSha256:hash(pod),
    sourceSnapshot:podRecordSnapshot(bol),targetSnapshot:podRecordSnapshot(pod),
    pageMap:Array.from({length:pageCount(bol)},(_,i) => ({sourcePage:i+1,targetPage:i+1}))};
  const reasons = reasonsBeforeReceipt({bol,pod,lineage});
  return {...pod,podLifecycleV1:{version:1,state:reasons.length?'review_required':'pending_sync',lineage,previousVersions:[copy(bol)],reasons}};
}

export function pendingPodDisplay(doc) {
  const lifecycle = doc?.podLifecycleV1;
  if (!['pending_sync','review_required'].includes(lifecycle?.state)) return doc;
  const original = lifecycle.previousVersions?.[0];
  if (!original || podDocumentId(original) !== podDocumentId(doc) || hash(original) !== hash(doc)) return doc;
  return {...original,podPendingV1:{state:lifecycle.state,candidate:doc}};
}

// A fresh UI action, not an OCR value or inherited checkbox default. Call only
// after the save path has rehashed the original and produced this review.
export function acknowledgeReceiverSignature(doc, explicitlyConfirmed = false) {
  const value = review(doc);
  if (explicitlyConfirmed !== true || kind(doc) !== 'pod' || value?.fields?.podSigned !== true || !hash(doc)) return doc;
  return {...doc,extracted:{...doc.extracted,evidenceFactsV1:{...value,receiverAcknowledgement:{version:1,confirmed:true,
    method:'explicit_receiver_signature_check',sourceSha256:hash(doc),reviewedAt:value.reviewedAt}}}};
}

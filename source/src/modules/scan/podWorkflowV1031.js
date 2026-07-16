function text(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function documentType(document = {}) {
  return text(document.extracted?.type || document.classification?.selectedType || document.type || document.label).toLowerCase();
}

function documentLoadNo(document = {}) {
  return text(document.loadNo || document.load_no || document.extracted?.loadNo || document.extracted?.orderNo || document.extracted?.bolNo).toUpperCase();
}

export function podEvidenceV1031(value = '') {
  const source = text(value).toLowerCase();
  const proof = /\bproof of delivery\b|\bdelivery receipt\b/.test(source);
  const receivedBy = /\breceived by\b|\baccepted by\b/.test(source);
  const receivedStamp = /\breceived\b/.test(source) && /following exceptions|receiver|consignee|warehouse|sysco|signature/.test(source);
  const signature = /receiver signature|consignee signature|signed by|\bsignature\b/.test(source);
  const delivered = /\bdelivered\b|delivery completed|unloaded and signed/.test(source);
  const exceptions = /with the following exceptions|delivery exception/.test(source);
  let score = 0;
  if (proof) score += 14;
  if (receivedBy) score += 10;
  if (receivedStamp) score += 8;
  if (signature) score += 5;
  if (delivered) score += 5;
  if (exceptions) score += 3;
  const signedEvidence = proof || receivedBy || (receivedStamp && signature) || (delivered && signature);
  return { score, proof, receivedBy, receivedStamp, signature, delivered, exceptions, signedEvidence };
}

export function resolvePodDecisionV1031({ preferredType = 'auto', detectedType = 'other', text:value = '' } = {}) {
  const evidence = podEvidenceV1031(value);
  const manualSelected = preferredType === 'pod';
  const autoPod = detectedType === 'pod'
    || (detectedType === 'bol' && evidence.signedEvidence && evidence.score >= 10)
    || evidence.score >= 16;
  return {
    isPod:manualSelected || autoPod,
    manualSelected,
    autoCorrected:!manualSelected && autoPod && detectedType !== 'pod',
    signedEvidence:evidence.signedEvidence,
    evidence,
  };
}

export function podBillingPatchV1031({ store = {}, loadNo = '', date = '', podDocumentId = '' } = {}) {
  const key = text(loadNo).toUpperCase();
  if (!key) return null;
  const loads = Array.isArray(store.loads) ? store.loads : [];
  const load = loads.find(row => text(row.loadNo || row.orderNo).toUpperCase() === key);
  if (!load) return null;
  const docs = (Array.isArray(store.documents) ? store.documents : []).filter(document => documentLoadNo(document) === key);
  const types = new Set(docs.map(documentType));
  const signedPod = docs.some(document => {
    const type = documentType(document);
    return (type === 'pod' || type === 'proof of delivery')
      && document.podSigned !== false
      && document.extracted?.podSigned !== false;
  });
  const hasRate = types.has('rate_confirmation') || types.has('rate confirmation') || Boolean(load.documentId || load.rateConDocumentId);
  const hasBol = types.has('bol') || types.has('bill of lading');
  const ready = hasRate && hasBol && signedPod;
  const currentStatus = text(load.status).toLowerCase();
  const protectedStatus = ['paid','submitted','invoiced'].includes(currentStatus);
  return {
    loadId:load.id,
    ready,
    hasRate,
    hasBol,
    signedPod,
    patch:{
      status:protectedStatus ? load.status : (ready ? 'invoice_ready' : 'delivered'),
      deliveredDate:load.deliveredDate || date || '',
      podDocumentId:podDocumentId || load.podDocumentId || '',
      billingStage:ready ? 'ready_for_factoring' : 'pod_received',
      factoringStatus:ready ? 'ready_to_submit' : 'missing_paperwork',
      updatedFromPod:true,
    },
  };
}

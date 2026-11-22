import { stopKind } from '../driver-dashboard/stopKind.js';

const text = value => String(value ?? '').trim();
const ref = value => text(value).toUpperCase();
const list = value => Array.isArray(value) ? value : [];
const hash = doc => text(doc.sha256 || doc.content_hash).toLowerCase();
const negativeSignature = /(?:shipper(?:['’]s)?\s+signature\s+only|only\s+(?:the\s+)?shipper(?:['’]s)?\s+signature|(?:missing|without|no)\s+(?:the\s+|a\s+)?receiver[\s-]*(?:signed\s+(?:copy|pod)|signature)|receiver[\s-]*(?:signed\s+(?:copy|pod)|signature)\s+(?:(?:is|was|still)\s+)*(?:missing|absent|needed)|(?:unsigned|not signed by (?:the )?receiver)\s*(?:pod|delivery|copy)?)/i;
export function receiverNote(load) {
  return text(load?.notes).split(/(?<=[.!?])\s+|\n/).filter(sentence => negativeSignature.test(sentence)).join(' ');
}
export function routeStops(load = {}) {
  const stops = list(load.stops);
  const source = stops.filter(stop => stopKind(stop));
  if (!source.some(stop => stopKind(stop) === 'pickup') && load.origin) source.unshift({type:'pickup', location:load.origin, date:load.pickupDate});
  if (!source.some(stop => stopKind(stop) === 'delivery') && load.destination) source.push({type:'delivery', location:load.destination, date:load.deliveryDate});
  let drop = 0;
  return source.map(stop => {
    const pickup = stopKind(stop) === 'pickup';
    if (!pickup) drop++;
    const cityState = text(stop.cityState) || [stop.city,stop.state].map(text).filter(Boolean).join(', ');
    const street = text(stop.address);
    return {pickup, sequence:pickup ? 0 : Number(stop.deliverySequence || stop.stopSequence || (!stop.type && !stop.role && stop.sequence) || drop), name:text(stop.company || stop.facility || stop.name || stop.location || cityState || stop.address), address:street && cityState && street.toLowerCase().includes(cityState.toLowerCase()) ? street : [street,cityState].filter(Boolean).join(', '), appointment:text(stop.appointment || stop.appointmentTime || stop.time), zone:text(stop.timeZone || stop.timezone), date:text(stop.appointmentDate || stop.date || (pickup ? load.pickupDate : load.deliveryDate))};
  });
}
export function originalState(doc = {}) {
  const sync = text(doc.sync_state || doc.syncState || doc.cloud?.status).toLowerCase();
  if (sync === 'synced' && (doc.storage_path || doc.storagePath || doc.cloud?.storagePath || doc.originalUploadPath)) return 'Uploaded';
  if (['failed','error','blocked'].includes(sync)) return 'Upload needs attention';
  const local = doc.local_blob_state === 'available' || doc.localBlobConfirmed === true || Boolean(doc.local_blob_id);
  if (['queued','pending','pending_upload','uploading','in_progress'].includes(sync)) return local ? 'Saved on device · upload pending' : 'Upload pending';
  if (['local_only','signed_out'].includes(sync)) return local ? 'Saved on device · not uploaded' : 'Original upload unconfirmed';
  return 'On file · upload unconfirmed';
}
const stopOf = doc => Number(doc.stopSequence || doc.stop_sequence || doc.extracted?.stopSequence || doc.metadata?.stopSequence || 0);
function reviewsOf(doc,load) {
  const sha=hash(doc), saved=load.driverFolderPodReviews?.[sha]||doc.driverReceiverReview;
  const records=saved?.byStop ? Object.values(saved.byStop) : saved?[saved]:[];
  return /^[a-f0-9]{64}$/.test(sha)?records.filter(r=>r?.sha256===sha&&ref(r.loadNo)===ref(load.loadNo||load.canonicalLoadNo)&&r.note===receiverNote(load)):[];
}
export function storeStopReview(previous, review) {
  const byStop=previous?.byStop || (previous ? {[Number(previous.stopSequence)||0]:previous} : {});
  return {...review,byStop:{...byStop,[review.stopSequence]:review}};
}
export function signatureChecked(doc = {}, load = {}) {
  const decisions = reviewsOf(doc,load);
  if (decisions.length && !doc.sourceCopyConflictV110419) return decisions.some(r=>r.signed===true);
  if (doc.podSigned === false || doc.extracted?.podSigned === false || doc.sourceCopyConflictV110419) return false;
  return doc.podSigned === true || doc.extracted?.podSigned === true;
}
export function podReview(load = {}, documents = [], reviewedParts = () => []) {
  const note=receiverNote(load), stops=routeStops(load).filter(stop=>!stop.pickup), evidence=[];
  for(const doc of documents){
    if(doc.sourceCopyConflictV110419)continue;
    const decisions=reviewsOf(doc,load), parts=reviewedParts(doc);
    const signatureAllowed=doc.podSigned!==false && doc.extracted?.podSigned!==false;
    const add=(kind,seq)=>evidence.push({doc,kind,sequence:Number(seq)||0});
    // A signed original only supersedes a contradictory note after the driver
    // explicitly reviews these exact bytes against the current note.
    for(const decision of decisions)if(decision.signed===true)add('signed',decision.stopSequence);
    if(signatureAllowed&&!note){
      const allowed=seq=>!decisions.some(r=>r.signed===false&&(!r.stopSequence||Number(r.stopSequence)===Number(seq)));
      if(!decisions.length&&signatureChecked(doc,load))add('signed',stopOf(doc));
      for(const part of parts.filter(p=>p.kind==='pod')){
        const seq=part.fields?.stopSequence||part.stopSequence||stopOf(doc);
        if(allowed(seq))add('signed',seq);
      }
    }
    // The existing source-bound authorization rules cover accepted photo
    // evidence, including individual pages of a mixed packet.
    for(const part of parts.filter(p=>p.kind==='delivery_evidence'))add('authorized',part.fields?.stopSequence||part.stopSequence||stopOf(doc));
  }
  const missingStops=stops.length>1?stops.filter(s=>!evidence.some(e=>e.sequence===s.sequence)):[];
  const blocked=!evidence.length||missingStops.length>0;
  const authorized=evidence.some(e=>e.kind==='authorized');
  return {note,blocked,missingStops,confirmed:[...new Set(evidence.map(e=>e.doc))],authorized,label:missingStops.length?'Check POD for '+missingStops.map(s=>'stop '+s.sequence).join(', '):blocked?'Receiver signature needs review':authorized?'Broker-authorized delivery proof':'Receiver signature checked'};
}
export function sendStatus(receipt, invoices, number) {
  const same = row => row && ref(number) && ref(row.loadNo) === ref(number);
  if (list(invoices).some(row => same(row) && row.acceptedAt) || (same(receipt) && receipt.status === 'accepted' && receipt.acceptedAt)) return 'Outlook accepted the invoice for sending';
  if (same(receipt) && ['unknown','sending'].includes(receipt.status)) return 'Send unconfirmed · check Outlook Sent Items';
  if (same(receipt) && receipt.status === 'failed') return 'Outlook did not confirm submission';
  return 'No recorded submission';
}

export function recordedPodReview(load, doc, signed, stop, now = Date.now()) {
  if (!load?.loadNo || !/^[a-f0-9]{64}$/.test(hash(doc))) throw Error('The original could not be verified.');
  const stops = routeStops(load).filter(s => !s.pickup);
  if (stops.length > 1 && !stops.some(s => s.sequence === Number(stop))) throw Error('Choose the delivery stop on this original.');
  return {loadNo:load.loadNo,sha256:hash(doc),signed,stopSequence:Number(stop)||0,note:receiverNote(load),reviewedAt:now};
}
// Preserve the existing billing planner and its requirements for the full packet.
export function verifyBillingPod(load, docs, reviewedParts) {
  if (load.documentWorkflowStage === 'tonu') return;
  const specific = receiverNote(load) || routeStops(load).filter(s=>!s.pickup).length > 1 || Object.keys(load.driverFolderPodReviews || {}).length || docs.some(d=>d.sourceCopyConflictV110419 || d.driverReceiverReview?.signed===false);
  if (!specific) return;
  const proof = podReview(load,docs.filter(doc=>['pod','proof_of_delivery','delivery_receipt','bol','bill_of_lading','delivery_evidence','supporting_packet'].includes(text(doc.extracted?.type||doc.document_type||doc.type).toLowerCase().replace(/[ -]+/g,'_'))),reviewedParts);
  if (proof.blocked) throw Error(proof.label+'. Review the delivery original in this load folder.');
}

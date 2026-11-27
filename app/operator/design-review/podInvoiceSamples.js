// Bundled fictional fixtures. This exercise has no network or mailbox client.
export const testLoad = {
  load_id: 'ad000000-0000-4000-8000-000000000042',
  load_number: 'RR-POD-TEST-042',
  broker_name: 'Demo Freight',
  driver_name: 'Test Driver',
  pickup_address: 'Rockford, IL',
  delivery_address: 'Joliet, IL / Elkhart, IN',
  gross_cents: 320000,
};
export const stops = ['Joliet, IL', 'Elkhart, IN'];
export const samples = [
  {key: 'joliet', label: 'Delivery 1 · Joliet, IL', stop: 1},
  {key: 'elkhart', label: 'Delivery 2 · Elkhart, IN', stop: 2},
  {key: 'corrected', label: 'Correction · Delivery 2', stop: 2, correction: true},
  {key: 'other', label: 'Document for a different load', stop: 2, wrongLoad: true},
];

export async function makeSamplePod(sample) {
  const {PDFDocument, StandardFonts, rgb} = await import('pdf-lib');
  const document = await PDFDocument.create();
  const fixedDate = new Date('2026-11-27T12:00:00Z');
  document.setCreationDate(fixedDate);
  document.setModificationDate(fixedDate);
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const loadNo = sample.wrongLoad ? 'RR-POD-TEST-043' : testLoad.load_number;
  const lines = [
    'Proof of delivery',
    'FICTIONAL DOCUMENT FOR STAGING',
    'Load: ' + loadNo, 'Broker: ' + testLoad.broker_name, 'Driver: ' + testLoad.driver_name,
    'Delivery ' + sample.stop + ' of 2: ' + stops[sample.stop - 1],
    'Condition: received in good order',
    'Receiver: Sample Receiver',
    sample.correction ? 'Revised receipt: clearer receiver signature' : 'Original delivery receipt',
  ];
  lines.forEach((line, i) => page.drawText(line, {
    x: 42, y: 735 - i * 38, size: i === 0 ? 25 : 13, font: i < 2 ? bold : font,
    color: i === 1 ? rgb(.19, .30, .55) : rgb(.08, .13, .2),
  }));
  // Draw an invented receiver mark in each fixture so the actual PDF is inspectable.
  const points = [[44, 336], [58, 357], [53, 334], [74, 352], [70, 339], [94, 343], [122, 347]];
  points.slice(1).forEach(([x, y], i) => page.drawLine({
    start: {x: points[i][0], y: points[i][1]}, end: {x, y}, thickness: 1.8, color: rgb(.13, .32, .65),
  }));
  page.drawText('Sample signature', {x: 42, y: 310, size: 10, font});
  const bytes = await document.save();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const sha = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
  const fileName = loadNo + '-stop-' + sample.stop + (sample.correction ? '-corrected' : '') + '.pdf';
  return {sample, file_name: fileName, sha256: sha, document_id: 'sample-' + sha, blob: new Blob([bytes], {type: 'application/pdf'})};
}

export function initialExercise() {
  return {documents: [], covered: {}, deliveryConfirmed: false, delayed: false, dispatched: null, message: ''};
}

export function receiveSample(state, receipt, at) {
  if (state.documents.some(doc => doc.sha256 === receipt.sha256)) {
    return {...state, message: 'Already received. Same document, draft and notification.'};
  }
  const doc = {
    ...receipt, received_at: at, decision: 'pending',
    status: state.delayed ? 'retry' : 'accepted',
    reason: state.delayed ? 'Hotmail delivery delayed in this test.' : '',
    addendum: Boolean(state.dispatched),
  };
  return {...state, documents: [...state.documents, doc], deliveryConfirmed: state.dispatched ? state.deliveryConfirmed : false,
    message: 'POD received for ' + testLoad.load_number + '.'};
}

export function reviewSample(state, documentId) {
  const target = state.documents.find(doc => doc.document_id === documentId);
  if (!target || target.addendum || target.decision !== 'pending') return state;
  const previousId = state.covered[target.sample.stop];
  const held = target.sample.wrongLoad || Boolean(previousId && !target.sample.correction);
  const covered = held ? state.covered : {...state.covered, [target.sample.stop]: target.document_id};
  const documents = state.documents.map(doc => doc === target
    ? {...doc, decision: held ? 'held' : 'approved', supersedes: held ? undefined : previousId} : doc);
  const message = target.sample.wrongLoad ? 'Filed for office review. The printed load number differs.'
    : held ? 'Original retained. An approved POD already covers this delivery.'
    : 'Delivery ' + target.sample.stop + ' verified against its signed POD.';
  return {...state, documents, covered, message};
}

export function draftRow(state) {
  const {documents, covered, dispatched} = state;
  if (!documents.length) return null;
  const missing = [1, 2].filter(stop => !covered[stop]);
  const reasons = missing.map(stop => 'Missing POD for delivery ' + stop + ' of 2');
  if (documents.some(doc => doc.decision === 'pending' && !doc.addendum)) reasons.push('Office review pending');
  if (!missing.length && !state.deliveryConfirmed) reasons.push('Final delivery confirmation required');
  if (dispatched && documents.some(doc => doc.addendum)) reasons.push('New evidence after simulated submission');
  const status = dispatched ? (documents.some(doc => doc.addendum) ? 'correction_review' : 'factoring_recorded')
    : reasons.length ? 'pending_review' : 'ready';
  const reviews = {pending: 'PENDING', approved: 'APPROVED', held: 'REJECTED'};
  const notifications = [...documents].reverse().map(doc => ({
    ...doc, review_status: doc.addendum ? 'CORRECTION_REVIEW' : reviews[doc.decision],
    verified_for_billing: !doc.addendum && doc.decision === 'approved',
  }));
  return {
    ...testLoad, draft_id: 'sample-draft-042', invoice_number: dispatched ? 'TEST-INV-042' : null, status,
    notifications, received_at: documents[0].received_at, updated_at: documents.at(-1).received_at,
    pod_count: documents.length, blocking_reasons: reasons,
    deliveries: {total: 2, missing, covered: Object.entries(covered).map(([stop, id]) => ({delivery: Number(stop), document_id: id}))},
  };
}

export function resumeSampleMail(state) {
  return {...state, delayed: false,
    documents: state.documents.map(doc => doc.status === 'retry' ? {...doc, status: 'accepted', reason: ''} : doc),
    message: 'Simulated Hotmail delivery resumed.'};
}

// Billing-only packet planning. No logbook mutations and no inferred recipients.
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const key = value => clean(value).toUpperCase();
const amount = value => Number(String(value ?? '').replace(/[$,]/g, ''));
export const validEmail = value => /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(String(value || ''));
export const documentKind = doc => clean(doc.extracted?.type || doc.classification?.selectedType || doc.type).toLowerCase().replace(/[ -]+/g, '_');
export const documentLoad = doc => key(doc.load_no || doc.loadNo || doc.extracted?.loadNo || doc.extracted?.orderNo);
export function reconcileBillingDocuments(originals = [], reviewedDocuments = []) {
  const hidden = doc => doc.archivedAt || /^(archived|deleted|cancelled|canceled|dismissed|superseded)$/i.test(clean(doc.status));
  return originals.flatMap(raw => {
    const reviewed = reviewedDocuments.find(doc =>
      (raw.client_document_id && raw.client_document_id === (doc.clientDocumentId || doc.client_document_id)) ||
      (raw.local_id && [doc.id, doc.localDocumentId, doc.local_id].includes(raw.local_id)));
    if (hidden(reviewed || raw)) return [];
    if (!reviewed) return [raw];
    const loadNo = reviewed.loadAssignmentStatusV11037 === 'unassigned' ? '' : (reviewed.canonicalLoadNo ?? reviewed.loadNo ?? raw.load_no ?? '');
    const type = reviewed.type || documentKind(raw);
    const signature = reviewed.podSigned ?? reviewed.extracted?.podSigned ?? raw.podSigned ?? raw.extracted?.podSigned;
    return [{ ...raw, ...reviewed, local_id: raw.local_id, client_document_id: raw.client_document_id,
      load_no: loadNo, type, podSigned: signature,
      extracted: { ...raw.extracted, ...reviewed.extracted, type, loadNo, podSigned: signature } }];
  });
}
export function planInvoiceSubmission({ load, documents = [], profile = {}, invoices = [], today = new Date().toLocaleDateString('en-CA') }) {
  if (!load || !key(load.loadNo)) throw Error('Choose a load with its broker load number.');
  const total = amount(load.gross ?? load.total);
  if (!Number.isFinite(total) || total <= 0) throw Error('Confirm the agreed rate for this load before sending.');
  if (!clean(load.broker)) throw Error('Add the broker name to this load.');
  if (!clean(profile.carrierName)) throw Error('Save your carrier name in billing setup.');
  const to = clean(profile.factoring?.enabled ? profile.factoring.email : load.billingEmail);
  if (!validEmail(to)) throw Error(profile.factoring?.enabled ? 'Save your factoring submission email in billing setup.' : 'Save the billing email for this load.');
  const kinds = new Set(['rate_confirmation', 'bol', 'bill_of_lading', 'pod', 'proof_of_delivery', 'delivery_receipt', 'lumper_receipt', 'detention_approval', 'layover_approval', 'tonu', 'notice_of_assignment']);
  const docs = documents.filter(doc => documentLoad(doc) === key(load.loadNo) && kinds.has(documentKind(doc)));
  if (!docs.some(doc => documentKind(doc) === 'rate_confirmation')) throw Error('Attach the accepted rate confirmation to this load.');
  const signed = doc => doc.podSigned !== false && doc.extracted?.podSigned !== false && (doc.podSigned === true || doc.extracted?.podSigned === true);
  if (!docs.some(doc => ['pod', 'proof_of_delivery', 'delivery_receipt', 'bol', 'bill_of_lading'].includes(documentKind(doc)) && signed(doc))) throw Error('Add the delivery pages and confirm the receiver signature or RECEIVED stamp.');
  const unique = [...new Map(docs.map((doc, i) => [doc.client_document_id || doc.local_id || doc.id || i, doc])).values()];
  const rank = doc => documentKind(doc) === 'rate_confirmation' ? 0 : ['bol', 'bill_of_lading'].includes(documentKind(doc)) ? 1 : 2;
  unique.sort((a, b) => rank(a) - rank(b));
  const existing = invoices.find(row => key(row.loadNo) === key(load.loadNo));
  const invoiceNo = clean(existing?.invoiceNo || `${clean(profile.invoicePrefix || 'INV')}-${key(load.loadNo)}`);
  const invoice = { invoiceNo, date: today, total, broker: load.broker, paymentTerms: load.paymentTerms || profile.paymentTerms, items: [{ description: `Transportation service - Load ${load.loadNo}`, amount: total }] };
  const subject = `${profile.carrierName} - Invoice ${invoiceNo} - Load ${load.loadNo}`;
  const text = `Hello,\n\nAttached is invoice ${invoiceNo} and the supporting paperwork for Load ${load.loadNo}.\n\nCarrier: ${profile.carrierName}\nBroker: ${load.broker}\nAmount: ${total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}\nRoute: ${clean(load.origin)} to ${clean(load.destination)}\n\nPlease review the attached rate confirmation and delivery paperwork for payment.\n\nThank you,\n${profile.carrierName}\n${clean(profile.phone)}\n${clean(profile.email)}`;
  return { to, subject, text, invoice, priorSubmission: existing?.acceptedAt ? { ...existing, status: 'accepted' } : null, documents: unique, load, profile, fileName: `${invoiceNo.replace(/[^a-zA-Z0-9._-]/g, '-')}-billing-packet.pdf` };
}
export function requireCompletePacket(plan, result) {
  if (result.included.length !== plan.documents.length) throw Error('Some original pages could not be attached. Open the load documents and restore the missing files before sending.');
  const bytes = result.bytes;
  if (!(bytes instanceof Uint8Array) || bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw Error('The billing packet could not be created.');
  return result;
}
export function graphMailPayload(plan, bytes, submissionId) {
  if (bytes.length >= 3_000_000) throw Error('This packet exceeds Outlook’s direct attachment limit. Download the packet and attach it in Outlook.');
  let binary = '';
  for (let n = 0; n < bytes.length; n += 8192) binary += String.fromCharCode(...bytes.subarray(n, n + 8192));
  return { message: { subject: plan.subject, body: { contentType: 'Text', content: plan.text }, toRecipients: [{ emailAddress: { address: plan.to } }], internetMessageHeaders: [{ name: 'x-road-ready-submission', value: submissionId }], attachments: [{ '@odata.type': '#microsoft.graph.fileAttachment', name: plan.fileName, contentType: 'application/pdf', contentBytes: btoa(binary) }] }, saveToSentItems: true };
}
// Store intent before calling Outlook; an interrupted request must never be auto-retried.
export async function submitInvoiceOnce({ storage, recordKey, plan, bytes, from, send, now = Date.now }) {
  if (plan.priorSubmission?.status === 'accepted') throw Error('This invoice has already been sent. Check Outlook Sent Items.');
  const old = JSON.parse(storage.getItem(recordKey) || 'null');
  if (old && ['sending', 'unknown', 'accepted'].includes(old.status)) throw Error(old.status === 'accepted' ? 'This invoice has already been sent. Check Outlook Sent Items.' : 'Check Outlook Sent Items before trying again; the previous attempt may have been sent.');
  const record = { status: 'sending', invoiceNo: plan.invoice.invoiceNo, loadNo: plan.load.loadNo, to: plan.to, from, total: plan.invoice.total, startedAt: now(), submissionId: crypto.randomUUID() };
  storage.setItem(recordKey, JSON.stringify(record));
  try {
    const response = await send(graphMailPayload(plan, bytes, record.submissionId));
    if (response.status !== 202) {
      record.status = response.status >= 400 && response.status < 500 ? 'failed' : 'unknown';
      storage.setItem(recordKey, JSON.stringify(record));
      throw Error(record.status === 'failed' ? `Outlook did not accept the invoice (${response.status}). Reconnect Outlook or try again later.` : 'Outlook’s response is uncertain. Check Sent Items before trying again.');
    }
    record.status = 'accepted'; record.acceptedAt = now(); storage.setItem(recordKey, JSON.stringify(record));
    return record;
  } catch (error) {
    if (record.status === 'sending') { record.status = 'unknown'; storage.setItem(recordKey, JSON.stringify(record)); }
    throw error;
  }
}

import {printedLoadReferencesV110326,savedDocumentIdentityV110326,savedDocumentConflictV110326,repairBusinessIdentityV110326} from '../loads/loadIdentityV110326.js';
import {analyzeRateConfirmationV11029} from '../document-readers/rate-confirmation/RateConfirmationReaderV11029.js';

const ref = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g,'');
const primary = row => ref(row?.canonicalLoadNo || row?.loadNo);
const sourceId = row => row?.sourceDocumentId || row?.rateConfirmationDocumentId || row?.documents?.rateConfirmationDocumentId || row?.documentId;
const contract = row => [row?.type,row?.extracted?.type,row?.classification?.selectedType].includes('rate_confirmation');
const localMatch = (record,row) => Boolean(row.local_id && (record.localDocumentId || record.id) === row.local_id || row.client_document_id && record.clientDocumentId === row.client_document_id);
const rawText = record => record.extracted?.guideSourceTextV110312 || '';

// Read only original, explicitly associated contract PDFs. Saved OCR fields and
// filenames are never proof of the load or broker printed on the document.
export async function readLegacyContractOriginalsV110327(store, rows, readFile, readText) {
  const needed = new Set((store.loads || []).map(primary));
  const evidence = [];
  for (const row of rows || []) {
    const linked = (store.documents || []).filter(record => localMatch(record,row));
    const folder = row.load_no || row.extracted?.loadNo || '';
    if (!contract(row) && !linked.some(contract)) continue;
    if (!needed.has(ref(folder)) && !linked.some(record => needed.has(primary(record)))) continue;
    if (linked.length && linked.every(record => rawText(record))) continue;
    if (row.mime_type !== 'application/pdf' || Number(row.file_size_bytes || 0) > 5 * 1024 * 1024) continue;
    try {
      const file = await readFile(row);
      if (!file) continue;
      const read = await readText(file);
      const text = read?.text || '';
      if (!printedLoadReferencesV110326(text).length || text.length > 16000) continue;
      const parsed = analyzeRateConfirmationV11029({text});
      evidence.push({localId:row.local_id,clientId:row.client_document_id,folder,
        fileName:row.original_file_name,createdAt:row.created_at,text,
        qualified:parsed.qualified === true,fields:parsed.fields});
    } catch { /* An unavailable original remains unchanged and can be retried. */ }
  }
  return evidence;
}

// Rebase on the current store after asynchronous PDF reads. A conflicting source
// must be proven foreign before replacing a legacy load's explicit source link.
export function applyLegacyContractOriginalsV110327(store, evidence = []) {
  let changed = false;
  const documents = (store.documents || []).map(record => {
    if (!contract(record) || rawText(record)) return record;
    const proof = evidence.find(item => localMatch(record,{local_id:item.localId,client_document_id:item.clientId}));
    if (!proof) return record;
    changed = true;
    return {...record,extracted:{...record.extracted,guideSourceTextV110312:proof.text}};
  });
  const replacements = [];
  for (const item of evidence) {
    if (!item.qualified || !item.localId || !item.folder) continue;
    const record = {id:item.localId,localDocumentId:item.localId,clientDocumentId:item.clientId,
      canonicalLoadNo:item.folder,loadNo:item.folder,type:'rate_confirmation',
      fileName:item.fileName,mimeType:'application/pdf',status:'needs_review',reviewStatus:'needs_review',
      loadAssignmentStatusV11037:'document_reference',originalPreserved:true,linkToLogbook:false,
      createdAt:item.createdAt,extracted:{...item.fields,guideSourceTextV110312:item.text}};
    const identity = savedDocumentIdentityV110326(record);
    if (identity) replacements.push({...record,broker:identity.broker,extracted:{...record.extracted,broker:identity.broker}});
  }
  const loads = (store.loads || []).map(load => {
    const oldId = sourceId(load);
    const old = documents.filter(record => record.id === oldId && primary(record) === primary(load));
    if (old.length !== 1 || !savedDocumentConflictV110326(old[0])) return load;
    const candidates = replacements.filter(record => primary(record) === primary(load) && record.id !== oldId);
    // Different originals for the same number may belong to different trips.
    // Identical source text can be a duplicate upload; differing text needs review.
    if (!candidates.length || new Set(candidates.map(rawText)).size !== 1) return load;
    const record = candidates[0];
    const existing = documents.find(doc => doc.id === record.id);
    if (existing && (primary(existing) !== primary(record) || !contract(existing))) return load;
    if (!existing) documents.push(record);
    else if (!savedDocumentIdentityV110326(existing)) return load;
    changed = true;
    const fields = record.extracted;
    return {...load,broker:record.broker,documentId:record.id,sourceDocumentId:record.id,
      origin:fields.origin || '',destination:fields.destination || '',stops:fields.stops || [],
      equipment:fields.equipment || '',...(Number.isFinite(fields.gross ?? fields.total) ? {gross:fields.gross ?? fields.total} : {}),
      aliases:[],trackingProvider:fields.trackingProvider || '',
      pickupDate:fields.pickupDate || '',deliveryDate:fields.deliveryDate || '',
      legacySourceRepairV110327:{previousLoad:load,previousSourceDocumentId:oldId,sourceDocumentId:record.id}};
  });
  return changed ? repairBusinessIdentityV110326({...store,loads,documents}) : store;
}

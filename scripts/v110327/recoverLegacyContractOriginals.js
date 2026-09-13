'use client';
import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
import {readBusinessStore,writeBusinessStore} from '../business/businessStore.js';
import {readPdfTextV102} from './pdfTextV102.js';
import {readLegacyContractOriginalsV110327,applyLegacyContractOriginalsV110327} from './legacyContractOriginalsV110327.js';

let pending;
export function recoverLegacyContractOriginalsV110327() {
  if (pending) return pending;
  pending = (async () => {
    const db = getOwnerOpDb();
    if (!db) return;
    const rows = await db.documents_local.toArray();
    const evidence = await readLegacyContractOriginalsV110327(readBusinessStore(),rows,async row => {
      if (!row.client_document_id) return null;
      const saved = await db.document_blobs.where('client_document_id').equals(row.client_document_id).first();
      return saved?.blob ? new File([saved.blob],row.original_file_name || 'contract.pdf',{type:'application/pdf'}) : null;
    },readPdfTextV102);
    const current = readBusinessStore();
    const next = applyLegacyContractOriginalsV110327(current,evidence);
    if (next !== current) writeBusinessStore(next);
  })().finally(() => {pending = null;});
  return pending;
}

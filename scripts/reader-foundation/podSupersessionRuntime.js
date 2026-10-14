'use client';
import {PDFDocument} from 'pdf-lib';
import {getOwnerOpDb} from '../local-db/dexie.js';
import {cloudClient,cloudSession} from '../owner-op-cloud/client.js';
import {readFile} from '../owner-op-cloud/accountFilesV110455.js';
import {bounded,hashBytes} from '../owner-op-cloud/mirrorCoreV110450.js';
import {BUSINESS_STORE_KEY,BUSINESS_STORE_EVENT} from '../../source/src/modules/business/businessStore.js';
import {podRecordSnapshot} from './podSupersessionV1.js';
import {verifyPendingPodCheckpoint} from './podCheckpointV1.js';

export async function originalPageCount(blob) {
  if (/^image\/(jpeg|png|webp)$/.test(blob?.type || '')) return 1;
  if (blob?.type !== 'application/pdf') return 0;
  try { return (await PDFDocument.load(await blob.arrayBuffer())).getPageCount(); } catch { return 0; }
}
// Runs after an existing full archive sync, under its existing active-device and
// owner checks. A failure leaves the BOL visible and its pending POD untouched.
export async function finalizePendingPodPromotions({uid,revision,check}) {
  const db = getOwnerOpDb();
  if (!db || !uid || !revision || typeof check !== 'function') return {promoted:0};
  const candidates = (await db.documents_local.toArray()).filter(d => d.podLifecycleV1?.state === 'pending_sync').slice(0,10);
  if (!candidates.length) return {promoted:0};
  await check();
  const {data:remote,error} = await bounded(cloudClient().from('road_ready_account_workspaces').select('revision,payload').eq('user_id',uid).single());
  if (error) throw error;
  if (remote?.revision !== revision) return {promoted:0,pending:true};
  const records = remote?.payload?.records;
  let promoted = 0; const errors = [];
  for (const document of candidates) {
    try {
      await check();
      const plan = await verifyPendingPodCheckpoint({document,ownerId:uid,revision,records,hashBytes,
        readFile:ref => readFile(ref,{storage:cloudClient().storage.from('owner-op-private'),uid,check})});
      if (!plan?.eligible) continue;
      await check();
      if ((await cloudSession())?.user?.id !== uid) throw new Error('Account changed. POD verification stopped.');
      await db.transaction('rw',db.documents_local,async () => {
        const current = await db.documents_local.get(document.local_id);
        if (podRecordSnapshot(current) !== podRecordSnapshot(document)
          || JSON.stringify(current?.podLifecycleV1) !== JSON.stringify(document.podLifecycleV1)) throw new Error('POD changed during verification. Original kept.');
        // Reading notes/corrections can change while cloud bytes are checked.
        // Only the verified lifecycle changes; keep the current record metadata.
        await db.documents_local.put({...current,podLifecycleV1:plan.primaryDocument.podLifecycleV1});
      });
      // The database is authoritative. Only update an unchanged matching mirror;
      // never overwrite separately edited filing information or load associations.
      try {
        const raw = localStorage.getItem(BUSINESS_STORE_KEY), store = raw ? JSON.parse(raw) : {};
        const rows = Array.isArray(store.documents) ? store.documents : [];
        const next = rows.map(row => (row.clientDocumentId || row.client_document_id) === document.client_document_id
          && JSON.stringify(row.podLifecycleV1) === JSON.stringify(document.podLifecycleV1)
          ? {...row,podLifecycleV1:plan.primaryDocument.podLifecycleV1} : row);
        if (next.some((row,i) => row !== rows[i]) && localStorage.getItem(BUSINESS_STORE_KEY) === raw)
          localStorage.setItem(BUSINESS_STORE_KEY,JSON.stringify({...store,documents:next}));
      } catch { /* The retained database version is sufficient; do not undo it. */ }
      promoted++;
    } catch (error) { errors.push({documentId:document.client_document_id,error:error.message}); }
  }
  if (promoted) window.dispatchEvent(new CustomEvent(BUSINESS_STORE_EVENT));
  return {promoted,pending:candidates.length > promoted,errors};
}

import {readSavedReviewRecord, saveRereading} from './savedRereadingV110347.js';
import {assertConfirmedReadingPreserved} from '../../../../packages/smart-reader-core/src/continuity.js';

const KEY = 'readerContinuityV110371';
const clone = value => structuredClone(value);
const version = row => Number.isSafeInteger(row?.extracted?.[KEY]?.revision) ? row.extracted[KEY].revision : 0;
const originalKey = row => JSON.stringify([row.local_id, row.client_document_id, row.sha256 || '', row.file_size_bytes ?? null, row.mime_type || '']);
const savedKey = row => JSON.stringify(row?.extracted?.readerReviewV110345 ?? null);

function validateSummary(summary) {
  if (!summary?.documents?.length || !Number.isInteger(summary.pageCount) || summary.pageCount < 1) throw new Error('Wait for the reading to finish.');
  if (new TextEncoder().encode(JSON.stringify(summary)).length > 512 * 1024) throw new Error('This review is too large to checkpoint. The original and previous reading are unchanged.');
}
function assertCurrent(current, baseline) {
  if (originalKey(current) !== originalKey(baseline) || savedKey(current) !== savedKey(baseline) || version(current) !== version(baseline)) {
    throw new Error('This document changed in another reading. Reopen it to continue safely.');
  }
}

export function checkpointReading(record) {
  const state = record?.extracted?.[KEY];
  return state?.draft && state.originalKey === originalKey(record) && state.savedKey === savedKey(record) ? clone(state.draft) : null;
}

// Only the compact review is checkpointed. Original bytes and full OCR passes
// remain in their existing stores; no data enters localStorage or a new table.
export async function saveReadingCheckpoint(db, baseline, summary) {
  validateSummary(summary);
  return db.transaction('rw', db.documents_local, async () => {
    const current = await readSavedReviewRecord(db, baseline.client_document_id);
    assertCurrent(current, baseline);
    const state = {schemaVersion:1, revision:version(current) + 1, draft:clone(summary),
      originalKey:originalKey(current), savedKey:savedKey(current), checkpointedAt:new Date().toISOString(), reviewSync:'local_only'};
    const extracted = {...current.extracted, [KEY]:state};
    await db.documents_local.update(current.local_id, {extracted});
    return {...current, extracted};
  });
}

export async function commitReadingCheckpoint(db, baseline, summary) {
  validateSummary(summary);
  return db.transaction('rw', db.documents_local, async () => {
    const current = await readSavedReviewRecord(db, baseline.client_document_id);
    assertCurrent(current, baseline);
    assertConfirmedReadingPreserved(current.extracted?.readerReviewV110345, summary);
    assertConfirmedReadingPreserved(checkpointReading(current), summary);
    const saved = await saveRereading(db, current, summary);
    const extracted = {...saved.extracted, [KEY]:{schemaVersion:1, revision:version(current) + 1,
      draft:null, savedAt:new Date().toISOString(), reviewSync:'local_only'}};
    await db.documents_local.update(saved.local_id, {extracted});
    return {...saved, extracted};
  });
}

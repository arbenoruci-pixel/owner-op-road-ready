// Only the review namespace changes. Filing, originals, sync state and dates
// belong to their existing flows and must not be inferred again here.
export function readingWithSuggestions(review) {
  let unchecked = 0;
  const documents = review.summary.documents.map(group => {
    const fields = {...group.fields}, source = review.result.documents.find(value => value.id === group.id);
    for (const [key, field] of Object.entries(source?.fields || {})) {
      if (field.status !== 'supported' || field.value == null) continue;
      fields[key] = {label:field.label, value:field.value, status:'supported'}; unchecked++;
    }
    return {...group, fields};
  });
  return {...review, summary:{...review.summary, documents, remaining:review.summary.remaining + unchecked}};
}

export async function readSavedReviewRecord(db, clientId) {
  if (!db?.documents_local || !clientId) throw new Error('Reopen this saved document and try again.');
  const record = await db.documents_local.where('client_document_id').equals(clientId).first();
  if (!record?.local_id) throw new Error('This saved document is no longer available.');
  return record;
}

export async function saveRereading(db, baseline, summary) {
  if (!summary?.documents?.length || !Number.isInteger(summary.pageCount) || summary.pageCount < 1) throw new Error('Wait for the reading to finish.');
  return db.transaction('rw', db.documents_local, async () => {
    const current = await readSavedReviewRecord(db, baseline.client_document_id);
    if (current.local_id !== baseline.local_id || current.sha256 !== baseline.sha256 ||
        JSON.stringify(current.extracted?.readerReviewV110345) !== JSON.stringify(baseline.extracted?.readerReviewV110345)) {
      throw new Error('This document changed while you were reading. Close this reading and try again.');
    }
    const extracted = {...current.extracted,
      readerReviewV110345: summary,
      readerReviewSavedAtV110347: new Date().toISOString(),
    };
    // Retain the last review for recovery; never keep another original or transcript.
    if (current.extracted?.readerReviewV110345) extracted.previousReaderReviewV110347 = current.extracted.readerReviewV110345;
    await db.documents_local.update(current.local_id, {extracted});
    return {...current, extracted};
  });
}

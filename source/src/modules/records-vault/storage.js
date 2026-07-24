import Dexie from 'dexie';

const DB_NAME = 'road-ready-records-vault';

let database = null;

export function getRecordsVaultDatabase() {
  if (database) return database;
  database = new Dexie(DB_NAME);
  database.version(1).stores({
    weeks: '&weekId,status,driverId,updatedAt',
    documents: '&id,weekId,type,status,date,loadId,driverId,vehicleId',
    files: '&storageKey,documentId,createdAt',
  });
  return database;
}

export async function saveWeek(week) {
  const db = getRecordsVaultDatabase();
  const documents = week.documents.map(document => ({ ...document, weekId: week.weekId }));
  await db.transaction('rw', db.weeks, db.documents, async () => {
    await db.weeks.put({ ...week, documents: undefined });
    await db.documents.where('weekId').equals(week.weekId).delete();
    if (documents.length) await db.documents.bulkPut(documents);
  });
  return week;
}

export async function loadWeek(weekId) {
  const db = getRecordsVaultDatabase();
  const week = await db.weeks.get(String(weekId));
  if (!week) return null;
  const documents = await db.documents.where('weekId').equals(String(weekId)).toArray();
  return { ...week, documents };
}

export async function listWeeks() {
  const db = getRecordsVaultDatabase();
  return db.weeks.orderBy('weekId').reverse().toArray();
}

export async function saveDocumentFile({ storageKey, documentId, blob, createdAt = new Date().toISOString() }) {
  if (!(blob instanceof Blob)) throw new Error('blob is required');
  const db = getRecordsVaultDatabase();
  await db.files.put({
    storageKey: String(storageKey),
    documentId: String(documentId),
    blob,
    createdAt,
  });
}

export async function loadDocumentFile(storageKey) {
  const db = getRecordsVaultDatabase();
  const record = await db.files.get(String(storageKey));
  return record?.blob || null;
}

export async function deleteOpenWeek(weekId) {
  const db = getRecordsVaultDatabase();
  const week = await loadWeek(weekId);
  if (!week) return false;
  if (week.status !== 'OPEN') throw new Error('Sealed weeks cannot be deleted');
  const keys = week.documents.map(document => document.storageKey).filter(Boolean);
  await db.transaction('rw', db.weeks, db.documents, db.files, async () => {
    await db.weeks.delete(String(weekId));
    await db.documents.where('weekId').equals(String(weekId)).delete();
    if (keys.length) await db.files.bulkDelete(keys);
  });
  return true;
}

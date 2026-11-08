// Originals belong to this device. Reconciliation is not a deletion authority
// for documents, and an older cloud manifest is not a replacement original.
export const DOCUMENT_TABLES = new Set(['documents_local','document_blobs','capture_asset_blobs','document_links_local']);
const signature = path => path.some(k => /^(signatureByDay|driverSignature|signature|signatures|signatureDataUrl)$/.test(k));
export function containsOriginal(value, path = []) {
  if (typeof value === 'string') {
    if (/data:[^,]*[;,]/i.test(value)) return !signature(path);
    if (/^\s*[\[{]/.test(value)) {
      try { return containsOriginal(JSON.parse(value),path); } catch {}
    }
    return false;
  }
  if (!value || typeof value !== 'object') return false;
  if (value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value) ||
      value.__rrAccountFile || value.__roadReadyBinary || value.__roadReadyZipFile || value.__roadReadyStoredBinaryV110458) return !signature(path);
  return Object.entries(value).some(([key,item]) => containsOriginal(item,[...path,key]));
}
export function isDocumentRecord(key, value) {
  const parts = JSON.parse(key), [kind,field] = parts;
  return (kind === 'table' && DOCUMENT_TABLES.has(field)) ||
    (['business','business-array','bucket'].includes(kind) && field === 'documents') ||
    (kind === 'state' && /^(dotWallet|documentsByDay|documents|documentVault|captureAssets)$/.test(field)) || containsOriginal(value,kind === 'book' ? [parts[2]] : []);
}
export function documentScope(...versions) {
  const protectedKeys = new Set();
  for (const records of versions) for (const [key,value] of Object.entries(records || {}))
    if (isDocumentRecord(key,value)) protectedKeys.add(key);
  return {
    allows: (key,value) => !protectedKeys.has(key) && !isDocumentRecord(key,value),
    filter: records => Object.fromEntries(Object.entries(records || {}).filter(([key,value]) => !protectedKeys.has(key) && !isDocumentRecord(key,value))),
    preserve(previous, next) {
      return {...Object.fromEntries(Object.entries(previous || {}).filter(([key,value]) => protectedKeys.has(key) || isDocumentRecord(key,value))),...next};
    },
  };
}
export const LOCAL_ONLY_MESSAGE = 'Original files stay on this device. Uploads start only when you create a sharing link. Save a verified backup to Files before deleting the app or changing phones.';

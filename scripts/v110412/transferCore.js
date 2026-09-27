// Portable Documents packages. No live logbook/profile state is imported.
export const FORMAT = 'road-ready-document-transfer';
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const BUCKETS = ['loads', 'fuel', 'expenses', 'maintenance', 'settlements'];
const text = value => String(value ?? '').trim();
export const loadNumber = row => text(row?.load_no || row?.loadNo || row?.canonicalLoadNo || row?.extracted?.loadNo).toUpperCase();
export const documentIdentity = row => text(row?.client_document_id || row?.clientDocumentId || row?.local_id || row?.localDocumentId || row?.id);
export const clone = value => JSON.parse(JSON.stringify(value));
export function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
export function recordDay(row) { return text(row.date || row.document_date || row.documentDate || row.transactionDate || row.extracted?.date).slice(0, 10); }
export function inWeek(day, start) {
  if (!start || start === 'undated') return !validDay(day);
  return validDay(day) && day >= start && day < new Date(Date.parse(start + 'T12:00:00Z') + 7 * 86400000).toISOString().slice(0, 10);
}
export async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}
function base64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 24576) result += btoa(String.fromCharCode(...bytes.subarray(i, i + 24576)));
  return result;
}
function fromBase64(value) {
  if (typeof value !== 'string' || value.length % 4 || /[^A-Za-z0-9+/=]/.test(value)) throw new Error('Invalid original file encoding.');
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
function originalType(value) {
  const type = text(value || 'application/octet-stream').toLowerCase().split(';')[0];
  if (!/^(application\/(pdf|octet-stream)|text\/(plain|csv)|image\/(png|jpeg|jpg|webp|gif|tiff|bmp|heic|heif|avif))$/.test(type)) throw new Error('Unsupported original file type. Use PDF, image or plain text documents.');
  return type;
}
export function selectTransfer({scope, folder, week, folders = [], documents = [], allDocuments = [], businessStore = {}}) {
  if (scope !== 'load' && scope !== 'week') throw new Error('Choose a load or a week.');
  const selected = scope === 'load' ? (folder ? [folder] : []) : (week?.items || []);
  if (scope === 'load' && !selected.length || scope === 'week' && !week) throw new Error('Open the load or week first.');
  const numbers = new Set(selected.map(loadNumber));
  const shown = [...selected.flatMap(f => f.documents || []), ...(scope === 'week' ? week.documents || [] : [])];
  const ids = new Set(shown.map(documentIdentity).filter(Boolean));
  const effective = new Map(allDocuments.map(d => [documentIdentity(d), d]));
  const docs = new Map();
  // Read raw vault rows too: display reconciliation can collapse distinct originals.
  for (const raw of [...documents, ...(businessStore.documents || []), ...shown]) {
    const key = documentIdentity(raw);
    const row = {...raw, ...(effective.get(key) || {})};
    if (!numbers.has(loadNumber(row)) && !ids.has(key)) continue;
    if (!key) throw new Error('A document has no saved identity. Open and save it again before export.');
    docs.set(key, {...docs.get(key), ...row});
  }
  const records = Object.fromEntries(BUCKETS.map(bucket => [bucket, []]));
  records.loads = selected.map(f => {
    const source = (businessStore.loads || []).find(row => loadNumber(row) === loadNumber(f)) || {};
    return {...source, id:source.id || `transfer-load-${loadNumber(f)}`, loadNo:loadNumber(f), origin:f.origin, destination:f.destination,
      broker:f.broker, revenue:source.revenue ?? f.revenue, trailerNo:source.trailerNo || f.trailerId,
      stops:source.stops || (f.stops || []).map(s => ({...s, type:'delivery'})),
      documentTransferDays:[...new Set(f.days || [])].filter(validDay),
      documentTransferEvidence:{mileage:f.mileage || null, originalStatus:source.status || '', exportedAt:new Date().toISOString()}};
  });
  for (const bucket of BUCKETS.filter(b => b !== 'loads')) records[bucket] = (businessStore[bucket] || []).filter(row =>
    scope === 'load' ? numbers.has(loadNumber(row)) : inWeek(recordDay(row), week.start || 'undated'));
  return {scope:{kind:scope, loadNo:scope === 'load' ? loadNumber(folder) : '', weekStart:scope === 'week' ? week.start || 'undated' : ''}, records, documents:[...docs.values()]};
}
export async function prepareTransfer(options, readBlob, onProgress = () => {}) {
  const selected = selectTransfer(options), documents = [];
  let totalBytes = 0;
  for (let i = 0; i < selected.documents.length; i++) {
    const record = clone(selected.documents[i]);
    onProgress(i, selected.documents.length);
    let blob;
    try { blob = await readBlob(record); } catch (error) { throw new Error(`Could not read ${record.original_file_name || record.fileName || record.title || 'an original'}: ${error.message}`); }
    if (!blob?.size) throw new Error(`Original unavailable: ${record.original_file_name || record.fileName || record.title || 'document'}. Open it on the device where it was saved and try again.`);
    totalBytes += blob.size;
    if (totalBytes > MAX_FILE_BYTES * .65) throw new Error('This week is too large for one transfer. Export each load separately.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length !== blob.size) throw new Error('An original file was only partly read. Try again.');
    documents.push({record, original:{base64:base64(bytes), size:bytes.length, type:originalType(blob.type || record.mime_type), sha256:await digest(bytes)}});
  }
  const payload = {format:FORMAT, version:1, createdAt:new Date().toISOString(), scope:selected.scope, records:clone(selected.records), documents};
  onProgress(documents.length, documents.length);
  const label = selected.scope.kind === 'load' ? `load-${selected.scope.loadNo}` : `week-${selected.scope.weekStart}`;
  const file = new File([JSON.stringify(payload)], `road-ready-${label.replace(/[^a-zA-Z0-9._-]/g, '-')}.json`, {type:'application/json'});
  if (file.size > MAX_FILE_BYTES) throw new Error('This transfer is too large. Export each load separately.');
  return {file, payload};
}
export async function validateTransfer(payload) {
  if (!payload || payload.format !== FORMAT || payload.version !== 1) throw new Error('Choose a Road Ready Export load or Export week file.');
  if (!['load','week'].includes(payload.scope?.kind)) throw new Error('Invalid transfer scope.');
  if (payload.scope.kind === 'week' && payload.scope.weekStart !== 'undated' && !validDay(payload.scope.weekStart)) throw new Error('Invalid week date.');
  if (!payload.records || !Array.isArray(payload.documents) || payload.documents.length > 5000) throw new Error('Invalid document list.');
  for (const bucket of BUCKETS) if (!Array.isArray(payload.records[bucket]) || payload.records[bucket].length > 10000 || payload.records[bucket].some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error('Invalid transfer records.');
  const numbers = new Set(payload.records.loads.map(loadNumber));
  if (numbers.has('') || numbers.size !== payload.records.loads.length) throw new Error('Invalid or duplicate load number.');
  if (payload.scope.kind === 'load' && (numbers.size !== 1 || !numbers.has(payload.scope.loadNo))) throw new Error('The file does not match its load number.');
  const identities = new Set(), localIds = new Set(), decoded = [];
  let total = 0;
  for (const item of payload.documents) {
    const id = documentIdentity(item?.record);
    if (!id || identities.has(id)) throw new Error('Missing or duplicate document identity.');
    identities.add(id);
    const localId = item.record.local_id || item.record.localDocumentId || `transfer-${id}`;
    if (localIds.has(localId)) throw new Error('Duplicate local document identity.');
    localIds.add(localId);
    if (payload.scope.kind === 'load' && loadNumber(item.record) !== payload.scope.loadNo) throw new Error('A document belongs to a different load.');
    if (!Number.isSafeInteger(item.original?.size) || item.original.size <= 0) throw new Error('Invalid original file size.');
    total += item.original.size;
    if (total > MAX_FILE_BYTES * .65) throw new Error('Transfer is too large.');
    const bytes = fromBase64(item.original.base64);
    if (bytes.length !== item.original.size || await digest(bytes) !== item.original.sha256) throw new Error('An original file is damaged or incomplete. Export it again.');
    const type = originalType(item.original.type);
    decoded.push({...item, original:{...item.original,type}, blob:new Blob([bytes], {type})});
  }
  for (const bucket of BUCKETS.filter(b => b !== 'loads')) for (const row of payload.records[bucket]) {
    if (!text(row.id)) throw new Error('A business record has no saved ID.');
    if (payload.scope.kind === 'load' && loadNumber(row) !== payload.scope.loadNo || payload.scope.kind === 'week' && !inWeek(recordDay(row), payload.scope.weekStart)) throw new Error('A business record is outside the selected scope.');
  }
  return {...payload, decoded};
}
export function mergeRecords(current, incoming) {
  const next = clone(current), summary = {addedRecords:0, keptRecords:0};
  for (const bucket of BUCKETS) {
    if (next[bucket] !== undefined && !Array.isArray(next[bucket])) throw new Error('Existing business records could not be read.');
    const rows = next[bucket] || [];
    for (const raw of incoming[bucket]) {
      const match = rows.find(row => bucket === 'loads' ? loadNumber(row) === loadNumber(raw) : row.id === raw.id);
      if (match) { summary.keptRecords++; continue; }
      if (rows.some(row => row.id === raw.id)) throw new Error('A saved record has a conflicting ID. Existing data was kept.');
      const row = clone(raw);
      // Imported archive folders never activate a trip or change the driver's live load.
      if (bucket === 'loads') Object.assign(row, {status:'archived', source:'document_transfer', active:false});
      rows.push(row); summary.addedRecords++;
    }
    next[bucket] = rows;
  }
  return {next, summary};
}

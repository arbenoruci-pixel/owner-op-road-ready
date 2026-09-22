// Pure archive preparation: a failed original must never hide other documents.
const safe = (value, max) => String(value || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, max);
const json = value => new TextEncoder().encode(JSON.stringify(value, null, 2));
function header(path, size) {
  const out = new Uint8Array(512), enc = new TextEncoder();
  const put = (offset, length, value) => {
    const bytes = enc.encode(value);
    if (bytes.length > length) throw new Error('Archive header exceeds field length');
    out.set(bytes, offset);
  };
  let leaf = path;
  if (path.length > 100) {
    const split = path.lastIndexOf('/');
    put(345, 155, path.slice(0, split)); leaf = path.slice(split + 1);
  }
  put(0, 100, leaf); put(100, 8, '0000644\0');
  put(108, 8, '0000000\0'); put(116, 8, '0000000\0');
  put(124, 12, size.toString(8).padStart(11, '0') + '\0');
  put(136, 12, Math.floor(Date.now()/1000).toString(8).padStart(11, '0') + '\0');
  put(148, 8, '        '); out[156] = 48;
  put(257, 6, 'ustar\0'); put(263, 2, '00');
  put(148, 8, out.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ');
  return out;
}
export async function prepareDocumentAudit({ documents = [], folders = [], state = {}, businessStore = {}, report,
  readBlob, loadNumber, documentType, onProgress = () => {} }) {
  const generatedAt = new Date().toISOString(), parts = [], manifest = [], failures = [];
  const append = (path, bytes) => {
    parts.push(header(path, bytes.byteLength), bytes, new Uint8Array((512 - bytes.byteLength % 512) % 512));
  };
  append('audit/load-folders.json', json(folders));
  append('audit/app-state.json', json(state));
  append('audit/business-store.json', json(businessStore));
  // Full source metadata preserves conflicting classifications and links for repair.
  append('audit/documents.json', json(documents));
  for (let index = 0; index < documents.length; index++) {
    const doc = documents[index], id = doc.local_id || doc.id || doc.client_document_id || `row-${index + 1}`;
    const loadNo = loadNumber(doc) || 'UNASSIGNED', type = documentType(doc) || 'other';
    const path = `originals/Load-${safe(loadNo, 40)}/${safe(type, 40)}/${String(index + 1).padStart(6, '0')}-${safe(doc.original_file_name || doc.title || 'document', 80)}`;
    const item = { id, clientDocumentId:doc.client_document_id, path, loadNo, type,
      title:doc.title, originalFileName:doc.original_file_name, mimeType:doc.mime_type,
      sizeBytes:doc.file_size_bytes || 0, blobIncluded:false, sha256:null,
      linkedEventId:doc.linkedEventId || '', linkDay:doc.linkDay || '', archiveLink:doc.archiveLink || null,
      stopSequence:doc.stopSequence || 0, reviewStatus:doc.reviewStatus || doc.status || '',
      classification:doc.classification, extracted:doc.extracted, metadata:doc.metadata,
      createdAt:doc.created_at, updatedAt:doc.updated_at };
    onProgress({ completed:index, total:documents.length, failed:failures.length });
    try {
      const blob = await readBlob(doc);
      if (!blob) throw Object.assign(new Error('Original file is not available on this device'), { code:'ORIGINAL_MISSING' });
      // Read once. Hash and archive exactly these validated bytes, never the unreadable source Blob.
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.byteLength !== blob.size) throw new Error('Original file read was incomplete');
      item.sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
      append(path, bytes); item.sizeBytes = bytes.byteLength; item.blobIncluded = true;
    } catch (error) {
      item.readError = { code:error?.code === 'ORIGINAL_MISSING' ? 'ORIGINAL_MISSING' : 'ORIGINAL_READ_FAILED', message:String(error?.message || error) };
      failures.push({ id, path, originalFileName:item.originalFileName, ...item.readError });
    }
    manifest.push(item);
  }
  onProgress({ completed:documents.length, total:documents.length, failed:failures.length });
  const summary = { generatedAt, documents:documents.length, originals:documents.length - failures.length,
    missingOriginals:failures.length, complete:failures.length === 0 };
  append('audit/report.json', json({ ...report, export:summary }));
  append('audit/document-manifest.json', json(manifest));
  append('audit/unavailable-originals.json', json(failures));
  append('README.txt', new TextEncoder().encode(`Road Ready document audit\n${summary.originals}/${summary.documents} original files included. ${summary.missingOriginals} unavailable.\nFull metadata for all documents is in audit/documents.json.\nSee audit/unavailable-originals.json for failures. This export does not repair or delete source records.\n`));
  parts.push(new Uint8Array(1024));
  // No full-archive Uint8Array copy or compression pass on memory-constrained phones.
  const file = new File(parts, `road-ready-documents-${generatedAt.slice(0,19).replace(/[:T]/g,'-')}.tar`, { type:'application/x-tar' });
  return { ...summary, file, report, manifest, failures };
}

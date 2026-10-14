import {podDocumentId,podRecordSnapshot,createVerifiedPodReceipt,planPodSupersession} from './podSupersession.js';
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
// Pure adapter for the existing account archive format. It never writes/deletes
// records or uploads files. records must be an authenticated cloud read-back.
export async function verifyPendingPodCheckpoint({document,ownerId,revision,records,readFile,hashBytes,now}) {
  const pending = document?.podLifecycleV1;
  if (pending?.state !== 'pending_sync' || pending?.lineage?.relation !== 'same_original_reclassification') return null;
  const key = JSON.stringify(['table','documents_local',document.local_id]);
  const saved = records?.[key], previous = saved?.podLifecycleV1?.previousVersions?.[0];
  const bol = pending.previousVersions?.[0];
  if (!saved || !bol || !previous || saved.podLifecycleV1.state !== 'pending_sync'
    || podRecordSnapshot(saved) !== podRecordSnapshot(document) || podRecordSnapshot(previous) !== podRecordSnapshot(bol)
    || !same(saved.podLifecycleV1.lineage,pending.lineage)) throw new Error('POD metadata and recoverable BOL history have not synchronized.');
  const blobs = Object.entries(records).filter(([k,row]) => {
    let locator; try { locator = JSON.parse(k); } catch { return false; }
    return locator[0] === 'table' && locator[1] === 'document_blobs' && row?.client_document_id === podDocumentId(document);
  });
  if (blobs.length !== 1) throw new Error('The saved original cannot be identified uniquely.');
  const encoded = blobs[0][1].blob;
  if (encoded?.__rrAccountFile !== 1 || !['Blob','ArrayBuffer'].includes(encoded.kind) || !Array.isArray(encoded.chunks)
    || !encoded.chunks.length || encoded.chunks.some(c => !/^[a-f0-9]{64}$/.test(c.sha256) || !Number.isSafeInteger(c.bytes) || c.bytes <= 0)
    || encoded.chunks.reduce((n,c) => n+c.bytes,0) !== encoded.size) throw new Error('The cloud archive has no complete original file.');
  // No localPiece fallback: this is proof of durable cloud bytes, not a local save.
  const original = await readFile(encoded);
  const contentReference = {version:1,ownerId,sha256:document.sha256,bytes:encoded.size,
    objectKey:'account_file:'+JSON.stringify(encoded.chunks)};
  const receipt = await createVerifiedPodReceipt({bol,pod:document,lineage:pending.lineage,ownerId,revision,hashBytes,now,
    readBack:async ({previousVersion}) => ({ownerId,revision,document:previousVersion?previous:saved,original,contentReference})});
  return planPodSupersession({bol,pod:document,lineage:pending.lineage,receipt});
}

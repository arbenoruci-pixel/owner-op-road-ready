// Network-free save. The metadata and original commit together; a quota error
// must leave the capture UI open rather than acknowledging an unsaved original.
export const hashBytes = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const uuid = prefix => prefix+'_'+crypto.randomUUID();
const safeName = name => String(name || 'document.bin').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,120) || 'document.bin';
export async function saveLocalOriginal(db,{file,type='other',title='',metadata={},extracted={},classification={}}) {
  if (!db) throw Error('Device storage is unavailable. Keep this document open and save a copy to Files.');
  if (!file?.size || typeof file.arrayBuffer !== 'function') throw Error('Choose a non-empty original file.');
  const sha256 = await hashBytes(await file.arrayBuffer()),now=new Date().toISOString();
  // Dedupe only byte-identical originals in the same filing context.
  const candidates=(await db.documents_local.toArray()).filter(d=>d.sha256===sha256 && d.type===type && (d.load_no||'')===(metadata.loadNo||''));
  // A resumed scan edits its existing filing record only when its original is
  // still byte-identical. A changed source must be saved as a separate document.
  let resume;
  if(metadata.resumeDocumentIdV110312){
    resume=await db.documents_local.get(metadata.resumeDocumentIdV110312);
    if(!resume)throw Error('The saved document is unavailable. Keep this file open.');
    const original=await db.document_blobs.where('client_document_id').equals(resume.client_document_id).first();
    if((resume.sha256 && resume.sha256!==sha256) || (!resume.sha256 && (!original?.blob || await hashBytes(await original.blob.arrayBuffer())!==sha256)))
      throw Error('The original changed. Save this file as a new document to keep both copies.');
  }
  let result;
  try {
    await db.transaction('rw',db.documents_local,db.document_blobs,async()=>{
      const candidate=resume||candidates[0],existing=candidate && await db.documents_local.get(candidate.local_id);
      if(candidate && (!existing || existing.updated_at!==candidate.updated_at || existing.sha256!==candidate.sha256))throw Error('This document changed during saving. Keep it open and retry.');
      const prior=existing && await db.document_blobs.where('client_document_id').equals(existing.client_document_id).first();
      const localId=existing?.local_id||uuid('document'),clientId=existing?.client_document_id||uuid('client_document'),blobId=prior?.local_blob_id||uuid('blob');
      const doc={...existing,local_id:localId,client_document_id:clientId,driver_id:existing?.driver_id||'local-owner-op',type,status:existing?.status||'active',title:title||existing?.title||safeName(file.name),original_file_name:existing?.original_file_name||safeName(file.name),mime_type:file.type||'application/octet-stream',file_size_bytes:file.size,sha256,expires_on:metadata.expiresOn||null,load_no:metadata.loadNo||null,relation_type:metadata.relationType||null,extracted,classification,created_at:existing?.created_at||now,updated_at:now,sync_state:existing?.sync_state==='synced'?'synced':'local_only',local_blob_state:'available',original_storage:'device'};
      await db.document_blobs.put({local_blob_id:blobId,client_document_id:clientId,blob:file,created_at:prior?.created_at||now});
      await db.documents_local.put(doc);
      result={localDocument:doc,localBlobId:blobId,cloud:{status:'local_only'},storage:{reused:Boolean(existing),localBlob:true,localMetadata:true,cloudOnly:false,purgedSyncedBlobs:0,purgedBytes:0}};
    });
    const stored=await db.document_blobs.get(result.localBlobId);
    if (!stored?.blob || stored.blob.size!==file.size || await hashBytes(await stored.blob.arrayBuffer())!==sha256)
      throw Error('The saved original could not be verified. Keep this document open and save a copy to Files.');
  } catch(error) {
    if (/quota|storage.*full|disk.*full/i.test([error.name,error.message].join(' ')))
      throw Object.assign(Error('Phone storage is full. This document was not saved. Keep it open, save a copy to Files and free device space before retrying.'),{name:'QuotaExceededError'});
    throw error;
  }
  // Persistence is best-effort; it is never advertised as a backup guarantee.
  try { void navigator.storage?.persist?.().catch(()=>{}); } catch {}
  return result;
}

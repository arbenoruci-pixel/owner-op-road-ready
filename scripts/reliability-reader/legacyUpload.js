// reader-reliability:legacy-upload
async function syncDocumentUpload(db,row,token){
  const payload=row.payload||{},blobRow=await readOriginalRow(db,'',payload.local_blob_id);
  if(!blobRow?.blob?.size)throw Error('document_blob_missing');
  const localDocument=await db.documents_local.where('client_document_id').equals(payload.client_document_id).first();
  if(!localDocument)throw Error('document_metadata_missing');
  const metadata={notes:payload.notes,issuedOn:payload.issued_on,expiresOn:payload.expires_on,relationType:payload.relation_type,logDate:payload.log_date,eventChainId:payload.duty_event_chain_id||payload.event_chain_id,serverLoadId:payload.load_id,intelligence:localDocument.intelligence};
  const uploaded=await uploadDocumentOriginal({file:blobRow.blob,localDocument,metadata,db},{getToken:async()=>token});
  if(!['synced','original_synced'].includes(uploaded.status))throw Error(uploaded.error||'document_upload_not_synced');
  await db.documents_local.update(localDocument.local_id,{server_id:uploaded.sharedOriginal?localDocument.server_id||null:uploaded.body?.document?.id||localDocument.server_id,original_server_id_v1:uploaded.body?.document?.id,storage_path:uploaded.storagePath,sync_state:uploaded.sharedOriginal?'local_only':'synced',original_sync_state:'synced',metadata_sync_state:'pending_account'});
  // The local original and every filing reference remain available offline.
  return {status:'processed',result:uploaded.body};
}

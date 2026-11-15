export async function savedOriginalFile(record,{readMetadata,readOriginal,FileType=File}){
 const localId=record.local_id||record.localDocumentId||record.id;
 const local=localId?await readMetadata(localId):null;
 const resolved={...local,...record,client_document_id:record.client_document_id||record.clientDocumentId||local?.client_document_id};
 const blob=await readOriginal(resolved);
 if(!blob?.size)throw Error('The original is not available yet. Connect the phone where it was scanned to finish syncing.');
 return new FileType([blob],record.fileName||record.original_file_name||local?.original_file_name||'saved-document.pdf',{type:blob.type||record.mimeType||local?.mime_type||'application/pdf'});
}

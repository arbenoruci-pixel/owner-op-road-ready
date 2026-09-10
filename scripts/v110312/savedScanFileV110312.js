import {getOwnerOpDb} from '../../../../lib/local-db/dexie.js';
export async function savedScanFileV110312(record={}) {
 const db=getOwnerOpDb();if(!db)throw new Error('Document storage is unavailable. Open Documents to check the original.');
 let clientId=record.clientDocumentId||'';
 if(!clientId){const local=await db.documents_local.get(record.localDocumentId||record.id);clientId=local?.client_document_id||'';}
 const row=clientId?await db.document_blobs.where('client_document_id').equals(clientId).first():null;
 if(!row?.blob)throw new Error('The original is not available on this device. Open Documents to locate it.');
 return new File([row.blob],record.fileName||'saved-document.pdf',{type:row.blob.type||record.mimeType||'application/pdf'});
}

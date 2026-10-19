'use client';
import Dexie from 'dexie';
import {getOwnerOpDb} from '../local-db/dexie.js';
import {buildMutation} from './payload.js';
import {enqueueMutation} from './clientSync.js';
import {saveDocument} from '../../source/src/modules/scan/documentSave.js';

export async function queueDocumentUpload({file,metadata={},link={}}){
  const db=getOwnerOpDb();if(!db)throw Error('IndexedDB is not available');
  const clientId=metadata.client_document_id||metadata.clientDocumentId;
  const current=clientId?await db.documents_local.where('client_document_id').equals(clientId).first():null;
  const saved=await saveDocument({file,type:metadata.type||'other',title:metadata.title||'',
    metadata:{...metadata,loadNo:metadata.loadNo||metadata.load_no||'',expiresOn:metadata.expires_on||metadata.expiresOn,relationType:link.relation_type||link.relationType,resumeDocumentIdV110312:current?.local_id},
    extracted:metadata.extracted||current?.extracted||{},classification:metadata.classification||current?.classification||{}},
    {db,waitFor:promise=>Dexie.waitFor(promise)});
  const document=saved.localDocument;
  const pending=await db.mutation_queue.toArray();
  if(!pending.some(row=>row.entity==='document'&&row.entity_client_id===document.client_document_id&&['pending','syncing'].includes(row.status))){
    const mutation=buildMutation({entity:'document',operation:'upload',entityClientId:document.client_document_id,payload:{
      client_document_id:document.client_document_id,local_blob_id:saved.localBlobId,type:document.type,title:document.title,
      notes:metadata.notes||null,file_name:document.original_file_name,mime_type:document.mime_type,file_size_bytes:document.file_size_bytes,sha256:document.sha256,
      issued_on:metadata.issued_on||metadata.issuedOn||null,expires_on:document.expires_on,relation_type:link.relation_type||link.relationType||null,
      log_date:link.log_date||link.logDate||null,duty_event_chain_id:link.duty_event_chain_id||link.dutyEventChainId||null,load_id:link.load_id||link.loadId||null,client_created_at:document.created_at}});
    await enqueueMutation(mutation);
  }
  return {client_document_id:document.client_document_id,local_blob_id:saved.localBlobId};
}

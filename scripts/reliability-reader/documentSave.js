import {sha256Original,findOriginalByContent,storeOriginalRow,readOriginalRow,originalClientId} from './originalStore.js';
const text=value=>String(value||'').trim();
const normalized=value=>text(value).toUpperCase();
const id=prefix=>prefix+'_'+crypto.randomUUID();
const filename=value=>text(value||'document').replace(/[\r\n\\/]/g,'_').slice(0,240)||'document';
const stopOf=row=>(row.document_type||row.classification?.selectedType||row.extracted?.type||row.type)==='rate_confirmation'?0:Number(row.stopSequence||row.stop_sequence||row.extracted?.stopSequence||0);
const filing=row=>JSON.stringify([text(row.document_type||row.classification?.selectedType||row.extracted?.type||row.type),normalized(row.load_no||row.loadNo||row.extracted?.canonicalLoadNo||row.extracted?.loadNo),stopOf(row),normalized(row.unit||row.evidenceFilingV1?.unit||row.extracted?.unit)]);
const historical=row=>({type:row.type,load_no:row.load_no,title:row.title,document_date:row.document_date,extracted:row.extracted,classification:row.classification});
const locks=new Map();
async function serialize(hash,run){
  if(globalThis.navigator?.locks?.request)return navigator.locks.request('road-ready-original:'+hash,run);
  const previous=locks.get(hash)||Promise.resolve(),next=previous.catch(()=>{}).then(run);
  locks.set(hash,next);try{return await next;}finally{if(locks.get(hash)===next)locks.delete(hash);}
}

// Local bytes and the entire review commit atomically. Storage pressure may
// reject the save, but it cannot silently compact evidence or report success.
export async function saveDocument({file,type='other',title='',metadata={},extracted={},classification={}},{db,waitFor=p=>p,upload=null,now=()=>new Date().toISOString()}={}){
  if(!file?.size)throw Error('Choose a non-empty original file.');
  if(!db)throw Error('Device storage is unavailable. The document has not been saved.');
  const hash=await sha256Original(file);
  return serialize(hash,async()=>{
    const local=await db.transaction('rw',db.documents_local,db.document_blobs,async()=>{
      const rows=await db.documents_local.toArray(),blobs=await db.document_blobs.toArray();
      const matching=await findOriginalByContent(db,hash,file.size,{waitFor,rows,blobs});
      const sameContent=rows.filter(row=>row.sha256===hash||matching&&originalClientId(row)===matching.clientId);
      const requested={type,load_no:metadata.loadNo||extracted.canonicalLoadNo||extracted.loadNo||'',stopSequence:type==='rate_confirmation'?0:metadata.stopSequence||extracted.stopSequence||0,unit:metadata.unit||extracted.unit||''};
      const resume=metadata.resumeDocumentIdV110312?rows.find(row=>row.local_id===metadata.resumeDocumentIdV110312):null;
      if(metadata.resumeDocumentIdV110312&&!resume)throw Error('The saved reading changed. Reopen its original before saving.');
      if(resume&&!sameContent.includes(resume))throw Error('This file differs from the saved original. Import it as a separate version.');
      const existing=resume||sameContent.find(row=>!['deleted','removed','trash'].includes(row.status)&&filing(row)===filing(requested));
      const at=now(),clientId=existing?.client_document_id||(matching&&!matching.document?matching.clientId:null)||crypto.randomUUID(),localId=existing?.local_id||id('document');
      if(type==='rate_confirmation')extracted={...extracted,stopSequence:0};
      const next={...existing,local_id:localId,client_document_id:clientId,driver_id:existing?.driver_id||'local-owner-op',
        type,document_type:type,family:metadata.family||existing?.family||classification.family||'other',status:existing?.status||'active',
        title:title||existing?.title||filename(file.name),original_file_name:existing?.original_file_name||filename(file.name),
        source_file_names_v1:[...new Set([...(existing?.source_file_names_v1||[]),existing?.original_file_name,file.name].filter(Boolean))],
        mime_type:file.type||existing?.mime_type||'application/octet-stream',file_size_bytes:file.size,sha256:hash,
        load_no:requested.load_no||null,stopSequence:Number(requested.stopSequence),unit:requested.unit,relation_type:metadata.relationType||existing?.relation_type||null,
        document_date:extracted.documentDate||extracted.date||existing?.document_date||null,expires_on:metadata.expiresOn||existing?.expires_on||null,
        extracted,classification,stacks:Array.isArray(metadata.stacks)?metadata.stacks:existing?.stacks||[],fingerprint:metadata.fingerprint||classification.fingerprint||existing?.fingerprint||null,
        intelligence:metadata.intelligence||extracted.intelligence||existing?.intelligence||null,
        upload_metadata_v1:{...existing?.upload_metadata_v1,...metadata},metadata_sync_state:'pending_account',
        created_at:existing?.created_at||at,updated_at:at,sync_state:'local_only',local_blob_state:'available'};
      if(existing&&JSON.stringify(historical(existing))!==JSON.stringify(historical(next)))next.document_edit_history_v1=[...(existing.document_edit_history_v1||[]),{at,action:'reader_review_saved',before:historical(existing)}];
      const current=blobs.find(row=>row.client_document_id===clientId);
      const saved=await storeOriginalRow(db,{local_blob_id:current?.local_blob_id||id('blob'),client_document_id:clientId,blob:file,created_at:at},{sha256:hash,waitFor,rows,blobs});
      next.original_client_document_id=saved.owner.client_document_id;
      next.original_blob_id=saved.owner.local_blob_id;
      await db.documents_local.put(next);
      return {localDocument:next,localBlobId:saved.row.local_blob_id,reused:!!existing,sharedOriginal:saved.owner.client_document_id!==clientId};
    });
    let cloud={status:local.localDocument.sync_state==='synced'?'synced':'local_only'};
    if(upload){try{cloud=await upload({file,localDocument:local.localDocument,metadata,db});}catch(error){cloud={status:'local_only',error:String(error?.message||error)};}}
    if(cloud.status==='synced'||cloud.status==='original_synced'){
      const fresh=await db.documents_local.get(local.localDocument.local_id);
      if(!fresh||fresh.sha256!==hash)throw Error('Document details changed during upload. Reopen the saved reading.');
      local.localDocument={...fresh,sync_state:cloud.status==='synced'?'synced':'local_only',original_sync_state:'synced',metadata_sync_state:'pending_account',server_id:cloud.sharedOriginal?fresh.server_id||null:cloud.body?.document?.id||fresh.server_id||null,original_server_id_v1:cloud.body?.document?.id||fresh.original_server_id_v1||null,storage_path:cloud.storagePath||fresh.storage_path||null};
      await db.documents_local.put(local.localDocument);
    }
    return {...local,cloud,storage:{reused:local.reused,sharedOriginal:local.sharedOriginal,localBlob:true,localMetadata:true,recoveredFromQuota:false,cloudOnly:false,purgedSyncedBlobs:0,purgedBytes:0}};
  });
}

// Existing helpers can use the same save logic without exposing test switches
// in production UI or changing upload permissions.
export {readOriginalRow};

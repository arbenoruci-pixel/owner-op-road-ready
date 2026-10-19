import {originalClientId,uuidSuffix,sha256Original} from './originalStore.js';
const headers=token=>({'Content-Type':'application/json',Authorization:'Bearer '+token});
const documentId=doc=>uuidSuffix(doc.server_id)||uuidSuffix(doc.cloud_document_id_v1)||uuidSuffix(doc.local_id);
const backendTypes=new Set(['driver_license','medical_card','insurance','registration','annual_inspection','bol','pod','fuel_receipt','scale_ticket','inspection_photo','other']);
const uploads=new Map();
async function serializeOriginal(ownerId,run){
  if(globalThis.navigator?.locks?.request)return navigator.locks.request('road-ready-cloud-original:'+ownerId,run);
  const previous=uploads.get(ownerId)||Promise.resolve(),next=previous.catch(()=>{}).then(run);
  uploads.set(ownerId,next);try{return await next;}finally{if(uploads.get(ownerId)===next)uploads.delete(ownerId);}
}
async function post(path,body,token,fetcher,signal){
  const response=await fetcher(path,{method:'POST',cache:'no-store',signal,headers:headers(token),body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false)throw Error(data.error||'Document upload failed ('+response.status+').');
  return data;
}
const commitFields=(doc,metadata,path)=>({client_document_id:doc.cloud_client_document_id_v1,document_id:documentId(doc)||undefined,storage_path:path,type:doc.document_type||doc.type,
  original_file_name:doc.original_file_name,mime_type:doc.mime_type,file_size_bytes:doc.file_size_bytes,sha256:doc.sha256,
  title:doc.title,notes:metadata.notes||null,log_date:metadata.logDate||null,event_chain_id:metadata.eventChainId||null,
  load_id:metadata.serverLoadId||null,relation_type:metadata.relationType||null,intelligence:{...(metadata.intelligence||doc.intelligence||{}),type:doc.document_type||doc.type},
  issued_on:metadata.issuedOn||doc.document_date||doc.extracted?.documentDate||null,expires_on:metadata.expiresOn||doc.expires_on||null,client_created_at:doc.created_at});

function assertCommit(body,expected){
  const doc=body.document;
  if(!doc?.id||doc.client_document_id!==expected.client_document_id||doc.storage_path!==expected.storage_path
    ||doc.sha256!==expected.sha256||Number(doc.file_size_bytes)!==Number(expected.file_size_bytes))throw Error('The cloud did not confirm this exact original. Local evidence is retained.');
  for(const key of ['title','original_file_name','mime_type','issued_on','expires_on'])if((doc[key]||null)!==(expected[key]||null))throw Error('Cloud document details differ from this saved review. Review the conflict before synchronization.');
  if(doc.type!==(backendTypes.has(expected.type)?expected.type:'other'))throw Error('The cloud document category was not confirmed.');
  if(expected.intelligence?.type){
    const marker='[[ROAD_READY_INTELLIGENCE_V1040]]',encoded=String(doc.notes||'').split(marker)[1];let intelligence;
    try{intelligence=JSON.parse(encoded);}catch{}
    if(intelligence?.type!==expected.intelligence.type)throw Error('The cloud did not preserve this document type. Local details are retained.');
  }
  if(expected.relation_type||expected.log_date||expected.event_chain_id||expected.load_id){
    const link=body.link;
    if(!link||link.document_id!==doc.id||link.relation_type!==(expected.relation_type||'supporting_document')
      ||(link.duty_event_chain_id||null)!==(expected.event_chain_id||null)||(link.load_id||null)!==(expected.load_id||null)
      ||expected.log_date&&!link.log_day_id)throw Error('The cloud original exists, but its requested filing link was not confirmed. Local details are retained.');
  }
}

// The existing schema permits one documents row per unique storage_path.
// Filing aliases travel in the account record archive and reference one cloud
// original. They never request another documents row or upload another copy.
export function uploadDocumentOriginal(args,deps={}){
  return serializeOriginal(originalClientId(args.localDocument),()=>uploadOriginalUnlocked(args,deps));
}
async function uploadOriginalUnlocked({file,localDocument,metadata={},db},{fetcher=globalThis.fetch,getToken=()=>globalThis.window?.ownerOpGetAccessToken?.(),online=globalThis.navigator?.onLine!==false}={}){
  if(!online)return {status:'offline'};
  const token=await getToken();if(!token)return {status:'signed_out'};
  const actualHash=await sha256Original(file);
  if(localDocument.sha256&&localDocument.sha256!==actualHash)throw Error('This file differs from its reviewed original. Upload stopped.');
  localDocument={...localDocument,sha256:actualHash};
  const ownerId=originalClientId(localDocument),rows=await db.documents_local.toArray();
  let owner=rows.find(row=>row.client_document_id===ownerId);
  if(!owner)throw Error('The canonical original record is unavailable. Wait for account synchronization.');
  if(owner.sha256&&owner.sha256!==actualHash)throw Error('The linked original checksum changed. Upload stopped.');
  owner={...owner,sha256:actualHash,cloud_document_id_v1:documentId(owner)||crypto.randomUUID(),
    cloud_client_document_id_v1:uuidSuffix(owner.cloud_client_document_id_v1)||uuidSuffix(owner.client_document_id)||crypto.randomUUID()};
  // Old local IDs and their original references remain unchanged.
  await db.documents_local.put(owner);
  const shared=owner.client_document_id!==localDocument.client_document_id;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
    let storagePath=owner.storage_path||owner.original_upload_v1?.storagePath;
    if(owner.original_upload_v1?.sha256&&owner.original_upload_v1.sha256!==owner.sha256)throw Error('The original upload checkpoint has a different checksum.');
    if(!storagePath){
      const created=await post('/api/documents/create-upload',{client_document_id:owner.cloud_client_document_id_v1,document_id:documentId(owner),file_name:owner.original_file_name,
        original_file_name:owner.original_file_name,mime_type:owner.mime_type,sha256:owner.sha256},token,fetcher,controller.signal);
      const signed=created.signed_upload||created.signedUpload||{},url=signed.signedUrl||signed.signed_url||signed.url;
      storagePath=created.storage_path||created.storagePath;if(!url||!storagePath)throw Error('The original upload address was not returned.');
      const uploaded=await fetcher(url,{method:'PUT',signal:controller.signal,headers:{'Content-Type':file.type||'application/octet-stream','x-upsert':'false'},body:file});
      if(!uploaded.ok)throw Error('The original upload did not finish ('+uploaded.status+'). Your local original is retained.');
      const current=await db.documents_local.get(owner.local_id);
      if(!current||current.sha256!==owner.sha256)throw Error('The original changed during upload. Its local copy was retained.');
      owner={...current,original_upload_v1:{storagePath,sha256:owner.sha256,uploadedAt:new Date().toISOString()}};
      await db.documents_local.put(owner);
    }
    const ownerMetadata=shared?owner.upload_metadata_v1||{}:{...owner.upload_metadata_v1,...metadata};
    const expected=commitFields(owner,ownerMetadata,storagePath);
    // A requested alias link belongs to the same original; independent filing
    // category/date/review remains in its account record, pending confirmation.
    if(shared)Object.assign(expected,{log_date:metadata.logDate||null,event_chain_id:metadata.eventChainId||null,load_id:metadata.serverLoadId||null,relation_type:metadata.relationType||null});
    const body=await post('/api/documents/commit-upload',expected,token,fetcher,controller.signal);
    assertCommit(body,expected);
    const currentOwner=await db.documents_local.get(owner.local_id);
    if(!currentOwner||currentOwner.sha256!==actualHash)throw Error('The original changed while its cloud confirmation arrived.');
    await db.documents_local.put({...currentOwner,storage_path:storagePath,original_sync_state:'synced',sync_state:'synced',metadata_sync_state:'pending_account',server_id:body.document.id,original_server_id_v1:body.document.id,original_cloud_client_document_id_v1:owner.cloud_client_document_id_v1});
    if(shared){
      const current=await db.documents_local.get(localDocument.local_id);
      if(!current||current.sha256!==actualHash)throw Error('The filing changed while its cloud confirmation arrived.');
      await db.documents_local.put({...current,original_cloud_client_document_id_v1:owner.cloud_client_document_id_v1,original_server_id_v1:body.document.id,storage_path:storagePath,original_sync_state:'synced',sync_state:'local_only',metadata_sync_state:'pending_account'});
    }
    return {status:shared?'original_synced':'synced',storagePath,body,sharedOriginal:shared,metadataPending:true,scope:'original_and_requested_link'};
  }finally{clearTimeout(timer);}
}

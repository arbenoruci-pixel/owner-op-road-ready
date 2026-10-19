// Exact original bytes have one owner. A filing row may point at that owner;
// type, load, stop and review history belong to the filing, never to the bytes.
export const originalClientId=row=>String(row?.original_client_document_id||row?.originalClientDocumentId||row?.client_document_id||row?.clientDocumentId||'');
export const uuidSuffix=value=>String(value||'').match(/[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i)?.[0]||null;
export const cloudOriginalClientId=row=>String(row?.original_cloud_client_document_id_v1||row?.cloud_client_document_id_v1||uuidSuffix(originalClientId(row))||originalClientId(row));
export async function resolveCloudOriginalClientId(db,record){
  const id=record?.client_document_id||record?.clientDocumentId;
  const local=id&&db?.documents_local?await db.documents_local.where('client_document_id').equals(id).first():null;
  const current=local||record,ownerId=originalClientId(current);
  const owner=ownerId&&db?.documents_local?await db.documents_local.where('client_document_id').equals(ownerId).first():null;
  return cloudOriginalClientId(owner||current);
}
export const sha256Original=async file=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');
const hashOf=row=>String(row?.sha256||row?.original_sha256||'').toLowerCase();
const sizeOf=row=>Number(row?.file_size_bytes||row?.fileSizeBytes||row?.original_size_bytes||row?.blob?.size||0);
const validHash=value=>/^[a-f0-9]{64}$/.test(value);

export async function readOriginalRow(db,clientDocumentId='',blobId=''){
  if(!db||(!clientDocumentId&&!blobId))return null;
  let row=blobId?await db.document_blobs.get(blobId):await db.document_blobs.where('client_document_id').equals(clientDocumentId).first();
  const seen=new Set(),expectedHash=hashOf(row),expectedSize=sizeOf(row);
  while(row?.original_blob_id){
    if(seen.has(row.local_blob_id)||seen.size>=16)throw Error('A saved original has an invalid reference. Its records were kept.');
    seen.add(row.local_blob_id);
    row=await db.document_blobs.get(row.original_blob_id);
  }
  if(!row?.blob?.size)return null;
  if(expectedHash&&hashOf(row)&&expectedHash!==hashOf(row)||expectedSize&&expectedSize!==row.blob.size)throw Error('A saved original reference does not match its checksum or size.');
  return row;
}

// Works on raw backup/account rows as well as device rows. References must
// resolve to one real original and may not claim another original's checksum.
export function validateOriginalReferences(rows=[]){
  const byId=new Map(rows.filter(row=>row?.local_blob_id).map(row=>[row.local_blob_id,row]));
  for(const link of rows.filter(row=>row?.original_blob_id)){
    let row=link;const seen=new Set();
    while(row?.original_blob_id){
      if(seen.has(row.local_blob_id)||seen.size>=16)throw Error('Original reference cycle in the document archive.');
      seen.add(row.local_blob_id);row=byId.get(row.original_blob_id);
    }
    if(!row||!row.blob)throw Error('A linked original is missing from the document archive.');
    if(hashOf(link)&&hashOf(row)&&hashOf(link)!==hashOf(row)||sizeOf(link)&&sizeOf(row)&&sizeOf(link)!==sizeOf(row))throw Error('A linked original has a different checksum or size.');
  }
  return true;
}

// Find by bytes across filenames and dates. Legacy rows without SHA-256 are
// compared at import time but are not rewritten or removed as a side effect.
export async function findOriginalByContent(db,hash,size,{waitFor=p=>p,rows,blobs}={}){
  if(!validHash(hash)||!size)throw Error('An original checksum and size are required.');
  const documents=rows||await db.documents_local.toArray(),originals=blobs||await db.document_blobs.toArray();
  const byClient=new Map(documents.map(row=>[row.client_document_id,row]));
  const seen=new Set();
  for(const raw of originals){
    if(raw.original_blob_id||!raw.blob?.size||raw.blob.size!==size)continue;
    const document=byClient.get(raw.client_document_id),declared=hashOf(raw)||hashOf(document);
    if(declared&&declared!==hash)continue;
    const actual=await waitFor(sha256Original(raw.blob));
    if(declared&&actual!==declared)throw Error('A saved original does not match its checksum. Existing files were kept.');
    if(actual===hash)return {blobRow:raw,document:document||null,clientId:raw.client_document_id,hash};
    seen.add(raw.client_document_id);
  }
  // A verified imported checksum can recover a previously cloud-only original
  // from these exact incoming bytes. It does not delete or replace another file.
  const known=documents.find(row=>!seen.has(originalClientId(row))&&hashOf(row)===hash&&sizeOf(row)===size);
  if(known){
    const clientId=originalClientId(known),owner=documents.find(row=>row.client_document_id===clientId);
    if(!owner)throw Error('The linked original record is not available yet. Reopen it after synchronization.');
    return {blobRow:null,document:owner,clientId,hash};
  }
  return null;
}

export async function storeOriginalRow(db,raw,{sha256,waitFor=p=>p,rows,blobs}={}){
  if(!raw?.blob?.size)throw Error('Choose a non-empty original file.');
  const hash=sha256||await waitFor(sha256Original(raw.blob));
  const existing=await findOriginalByContent(db,hash,raw.blob.size,{waitFor,rows,blobs});
  const ownRows=(blobs||await db.document_blobs.toArray()).filter(row=>row.client_document_id===raw.client_document_id);
  if(ownRows.length>1)throw Error('This document has several saved original references. Review them before adding another.');
  if(ownRows.length===1)raw={...raw,local_blob_id:ownRows[0].local_blob_id};
  const current=await db.document_blobs.get(raw.local_blob_id);
  if(current?.blob?.size&&await waitFor(sha256Original(current.blob))!==hash)throw Error('This saved original has different bytes. Both versions need separate records.');
  if(existing&&existing.clientId!==raw.client_document_id){
    let owner=existing.blobRow;
    if(!owner){
      owner={local_blob_id:existing.document?.original_blob_id||'original-'+existing.clientId,client_document_id:existing.clientId,blob:raw.blob,sha256:hash,original_size_bytes:raw.blob.size,created_at:raw.created_at};
      const previous=await db.document_blobs.get(owner.local_blob_id);
      if(previous?.blob?.size&&await waitFor(sha256Original(previous.blob))!==hash)throw Error('The original reference points to different bytes. Existing records were kept.');
      await db.document_blobs.put(owner);
    }
    const link={local_blob_id:raw.local_blob_id,client_document_id:raw.client_document_id,original_blob_id:owner.local_blob_id,
      original_client_document_id:owner.client_document_id,sha256:hash,original_size_bytes:raw.blob.size,created_at:raw.created_at};
    // Never convert a pre-existing byte-bearing row into a link implicitly.
    if(current?.blob?.size)return {row:current,owner:current,reused:true};
    await db.document_blobs.put(link);return {row:link,owner,reused:true};
  }
  const owner=existing?.blobRow||{...raw,local_blob_id:existing?.document?.original_blob_id||raw.local_blob_id,sha256:hash,original_size_bytes:raw.blob.size};
  if(!existing?.blobRow)await db.document_blobs.put(owner);
  return {row:owner,owner,reused:!!existing};
}

export function originalCoverage(documents,available){
  const known=new Set(available);
  for(let pass=0;pass<documents.length;pass++){
    let changed=false;
    for(const row of documents)if(known.has(originalClientId(row))&&!known.has(row.client_document_id)){known.add(row.client_document_id);changed=true;}
    if(!changed)break;
  }
  return known;
}

export function encodedOriginalRow(records,initial){
  let row=initial;const seen=new Set();
  while(row?.original_blob_id){
    if(seen.has(row.local_blob_id)||seen.size>=16)throw Error('The cloud original has an invalid reference.');
    seen.add(row.local_blob_id);
    const next=records?.[JSON.stringify(['table','document_blobs',row.original_blob_id])];
    if(!next)throw Error('The cloud original is not fully synchronized.');
    if(hashOf(row)&&hashOf(next)&&hashOf(row)!==hashOf(next))throw Error('The cloud original checksum does not match its reference.');
    row=next;
  }
  return row;
}

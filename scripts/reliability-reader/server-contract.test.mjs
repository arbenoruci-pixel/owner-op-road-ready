// Execute the actual generated API handlers. Only their Supabase dependency
// is replaced by a synthetic DB/storage transport; no server/session is used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {uploadDocumentOriginal} from './cloudOriginal.js';
import {sha256Original,resolveCloudOriginalClientId} from './originalStore.js';
const runtime=path.resolve(process.argv[2]||'/tmp/road-ready-review-runtime');
const project=path.resolve(new URL('../..',import.meta.url).pathname);
const schema=fs.readFileSync(path.join(project,'supabase/migrations/001_core_schema.sql'),'utf8');
assert.match(schema,/client_document_id uuid not null unique/);assert.match(schema,/storage_path text not null unique/);
const uuid=value=>/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value||'');
const driverId='10000000-0000-4000-8000-000000000001',userId='10000000-0000-4000-8000-000000000002';
const context={userId,driverId,authError:false,failLink:true,puts:0,creates:0,commits:0};
const tables={documents:[],document_links:[],log_days:[]},objects=new Map(),signed=new Map();
class Query{
 constructor(table){this.table=table;this.operation='select';this.filters=[];}
 select(){return this;}eq(key,value){this.filters.push(row=>row[key]===value);return this;}
 is(key,value){this.filters.push(row=>(row[key]??null)===value);return this;}
 insert(value){this.operation='insert';this.value=structuredClone(value);return this;}
 async result(single=false,optional=false){
  let values;
  if(this.operation==='insert'){
   const row={id:crypto.randomUUID(),...this.value};
   if(tables[this.table].some(old=>old.id===row.id))return {data:null,error:{code:'23505',message:'primary key constraint'}};
   if(this.table==='documents'){
    if(!uuid(row.id)||!uuid(row.client_document_id))return {data:null,error:{code:'22P02',message:'invalid input syntax for type uuid'}};
    if(tables.documents.some(doc=>doc.id===row.id||doc.client_document_id===row.client_document_id||doc.storage_path===row.storage_path))return {data:null,error:{code:'23505',message:'unique constraint'}};
   }
   if(this.table==='document_links'&&context.failLink){context.failLink=false;return {data:null,error:{code:'SYNTHETIC',message:'Synthetic link insert interrupted'}};}
   tables[this.table].push(row);values=[row];
  }else values=tables[this.table].filter(row=>this.filters.every(test=>test(row)));
  if(single){if(values.length===1)return {data:structuredClone(values[0]),error:null};if(optional&&!values.length)return {data:null,error:null};return {data:null,error:{code:'PGRST116',message:'not exactly one row'}};}
  return {data:structuredClone(values),error:null};
 }
 single(){return this.result(true);}maybeSingle(){return this.result(true,true);}
 then(resolve,reject){return this.result().then(resolve,reject);}
}
const admin={from:table=>new Query(table),storage:{from:bucket=>{
 assert.equal(bucket,'driver-documents');return {
  createSignedUploadUrl:async storagePath=>{context.creates++;const url='https://synthetic-storage.test/'+context.creates;signed.set(url,storagePath);return {data:{signedUrl:url},error:null};},
  list:async(folder,{search,limit})=>({data:[...objects.keys()].filter(key=>key.startsWith(folder+'/')).map(key=>({name:key.slice(folder.length+1)})).filter(row=>row.name.includes(search)).slice(0,limit),error:null}),
  download:async key=>({data:objects.get(key)||null,error:objects.has(key)?null:{message:'missing'}}),
 };}}};
const key='__reader_route_contract_'+crypto.randomUUID().replaceAll('-','');
globalThis[key]={createSupabaseAdminClient:()=>admin,
 requireAuthenticatedUser:async()=>context.authError?{error:'synthetic_sign_in_required',status:401}:{user:{id:context.userId}},
 requireDriverForUser:async()=>({driver:{id:context.driverId}}),
 jsonOk:body=>Response.json({ok:true,...body}),jsonError:(error,status=500,detail)=>Response.json({ok:false,error,detail},{status})};
const mock='data:text/javascript;base64,'+Buffer.from(`export const {createSupabaseAdminClient,requireAuthenticatedUser,requireDriverForUser,jsonOk,jsonError}=globalThis[${JSON.stringify(key)}];`).toString('base64');
async function handler(name){
 let source=fs.readFileSync(path.join(runtime,'app/api/documents',name,'route.js'),'utf8');
 const dependency="'../../../../lib/supabase/server.js'";assert.ok(source.includes(dependency));source=source.replace(dependency,JSON.stringify(mock));
 source=source.replace("'../../../../lib/documents/readOriginalDocumentV110344.js'",JSON.stringify(pathToFileURL(path.join(runtime,'lib/documents/readOriginalDocumentV110344.js')).href));
 return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).POST;
}
const [create,commit,read]=await Promise.all(['create-upload','commit-upload','read-original'].map(handler));
const request=body=>new Request('http://synthetic.test/api',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer synthetic-token'},body:JSON.stringify(body)});
const calls=[];
async function fetcher(url,options){
 if(options.method==='PUT'){assert.equal(options.headers['x-upsert'],'false');assert.ok(signed.has(url));assert.ok(!objects.has(signed.get(url)));objects.set(signed.get(url),options.body);context.puts++;return new Response(null,{status:200});}
 const body=JSON.parse(options.body);calls.push({url,body});
 if(url.endsWith('/create-upload'))return create(request(body));
 if(url.endsWith('/commit-upload')){context.commits++;return commit(request(body));}
 throw Error('Unexpected synthetic request '+url);
}
class LocalTable{
 constructor(rows){this.rows=structuredClone(rows);}
 async toArray(){return structuredClone(this.rows);}async get(id){return structuredClone(this.rows.find(row=>row.local_id===id));}
 async put(row){const i=this.rows.findIndex(old=>old.local_id===row.local_id);if(i<0)this.rows.push(structuredClone(row));else this.rows[i]=structuredClone(row);return row.local_id;}
 where(key){return {equals:value=>({first:async()=>structuredClone(this.rows.find(row=>row[key]===value))})};}
}
const file=new File(['%PDF-1.4\nSYNTHETIC CONTRACT ORIGINAL\n%%EOF'],'same-name.pdf',{type:'application/pdf'}),sha256=await sha256Original(file);
const legacyClient='client_document_20000000-0000-4000-8000-000000000001',localId='document_20000000-0000-4000-8000-000000000002';
const metadata={relationType:'supporting_document',serverLoadId:'30000000-0000-4000-8000-000000000001',notes:'Synthetic user note',intelligence:{version:'1',family:'load',type:'rate_confirmation'}};
const local={local_id:localId,client_document_id:legacyClient,type:'rate_confirmation',document_type:'rate_confirmation',original_client_document_id:legacyClient,original_file_name:file.name,mime_type:file.type,file_size_bytes:file.size,sha256,title:'Synthetic rate confirmation',document_date:'2026-10-12',created_at:'2026-10-12T12:00:00Z',sync_state:'local_only',upload_metadata_v1:metadata};
const db={documents_local:new LocalTable([local])},upload=async doc=>uploadDocumentOriginal({file,localDocument:doc,metadata:doc.upload_metadata_v1||{},db},{fetcher,getToken:async()=>'synthetic-token',online:true});
const passed=[];const pass=name=>{passed.push(name);console.log('PASS — '+name);};
try{
 context.authError=true;assert.equal((await create(request({client_document_id:crypto.randomUUID()}))).status,401);assert.equal((await commit(request({client_document_id:crypto.randomUUID(),storage_path:driverId+'/x'}))).status,401);context.authError=false;
 assert.equal(context.creates,0);pass('actual create/commit authentication boundary remains enforced');
 await assert.rejects(()=>upload(local),/commit_upload_failed/);assert.equal(context.puts,1);assert.equal(tables.documents.length,1);assert.equal(tables.document_links.length,0);
 const checkpoint=await db.documents_local.get(localId);assert.equal(checkpoint.client_document_id,legacyClient);assert.equal(checkpoint.local_id,localId);assert.ok(uuid(checkpoint.cloud_client_document_id_v1));assert.ok(checkpoint.original_upload_v1.storagePath);assert.equal(checkpoint.sync_state,'local_only');
 pass('actual schema accepts separate stable cloud UUIDs while old local IDs remain intact; partial link failure retains upload checkpoint');
 const retry=await upload(checkpoint);assert.equal(retry.status,'synced');assert.equal(context.puts,1);assert.equal(context.creates,1);assert.equal(tables.document_links.length,1);assert.equal(retry.body.link.load_id,metadata.serverLoadId);assert.equal(tables.documents[0].type,'other');assert.match(tables.documents[0].notes,/"type":"rate_confirmation"/);
 await upload(await db.documents_local.get(localId));assert.equal(tables.document_links.length,1);assert.equal(context.puts,1);
 pass('actual duplicate commit retries a missing link and reuses that exact link on subsequent retry, without another PUT');
 const alias={...local,local_id:'alias-local',client_document_id:crypto.randomUUID(),type:'pod',document_type:'pod',upload_metadata_v1:{relationType:'pod',serverLoadId:'30000000-0000-4000-8000-000000000002'}};await db.documents_local.put(alias);
 const linked=await upload(alias);assert.equal(linked.status,'original_synced');assert.equal(linked.metadataPending,true);assert.equal(tables.documents.length,1);assert.equal(tables.document_links.length,2);assert.equal(context.puts,1);assert.equal((await db.documents_local.get(alias.local_id)).sync_state,'local_only');
 const cloudClient=await resolveCloudOriginalClientId(db,alias);assert.equal(cloudClient,checkpoint.cloud_client_document_id_v1);
 pass('second filing uses canonical cloud row under UNIQUE storage_path; alias details remain pending account sync and its requested link is confirmed');
 const canonicalRequest=calls.find(call=>call.url.endsWith('/commit-upload')).body;
 const concurrentBody={...canonicalRequest,relation_type:'pod',load_id:'30000000-0000-4000-8000-000000000003'};
 const parallel=await Promise.all([commit(request(concurrentBody)),commit(request(concurrentBody))]);
 assert.deepEqual(parallel.map(response=>response.status),[200,200]);const parallelBodies=await Promise.all(parallel.map(response=>response.json()));
 assert.equal(parallelBodies[0].link.id,parallelBodies[1].link.id);assert.ok(uuid(parallelBodies[0].link.id));assert.equal(tables.document_links.length,3);
 pass('concurrent exact API commits share one deterministic link ID and safely recover the primary-key race');
 const forbiddenAlias=await commit(request({...canonicalRequest,client_document_id:crypto.randomUUID(),document_id:crypto.randomUUID()}));assert.equal(forbiddenAlias.status,409);assert.equal((await forbiddenAlias.json()).error,'document_identity_conflict');assert.equal(tables.documents.length,1);
 pass('actual unique storage path rejects a second documents row rather than pretending another filing was committed');
 const edited=await commit(request({...canonicalRequest,title:'Different reviewed title'}));assert.equal(edited.status,409);assert.equal((await edited.json()).error,'document_metadata_requires_review');assert.equal(tables.documents[0].title,local.title);
 const conflicting=await commit(request({...canonicalRequest,sha256:'0'.repeat(64)}));assert.equal(conflicting.status,409);assert.equal((await conflicting.json()).error,'document_original_conflict');
 pass('stale reviewed metadata and conflicting original hashes fail explicitly without overwriting the cloud row');
 const missingDay=await commit(request({...canonicalRequest,log_date:'2026-10-13'}));assert.equal(missingDay.status,409);assert.equal((await missingDay.json()).error,'document_log_day_not_found');assert.equal(tables.document_links.length,3);
 pass('unavailable requested log day does not produce a false successful link');
 const original=await read(request({client_document_id:cloudClient}));assert.equal(original.status,200);assert.equal(await sha256Original(await original.blob()),sha256);
 context.driverId='40000000-0000-4000-8000-000000000001';assert.equal((await read(request({client_document_id:cloudClient}))).status,404);context.driverId=driverId;
 pass('actual owner-scoped read-original returns exact canonical bytes for an alias, and rejects another driver');
 const before=context.puts;await assert.rejects(()=>uploadDocumentOriginal({file:new File(['DIFFERENT'],'same-name.pdf',{type:file.type}),localDocument:local,metadata,db},{fetcher,getToken:async()=>'synthetic-token',online:true}),/differs from its reviewed original/);assert.equal(context.puts,before);
 pass('changed file bytes cannot upload against a reviewed original');
 const oldFile=new File(['%PDF-1.4\nSECOND SYNTHETIC ORIGINAL\n%%EOF'],'older.pdf',{type:'application/pdf'}),oldSha=await sha256Original(oldFile);
 const oldRecord={...local,local_id:'legacy-record-without-uuid',client_document_id:'legacy-imported-client',original_client_document_id:'legacy-imported-client',type:'bol',document_type:'bol',original_file_name:oldFile.name,file_size_bytes:oldFile.size,sha256:oldSha};
 const oldDb={documents_local:new LocalTable([oldRecord])},oldArgs={file:oldFile,localDocument:oldRecord,metadata,db:oldDb},oldDeps={fetcher,getToken:async()=>'synthetic-token',online:true},putCount=context.puts;
 const concurrentUploads=await Promise.all([uploadDocumentOriginal(oldArgs,oldDeps),uploadDocumentOriginal(oldArgs,oldDeps)]);
 assert.deepEqual(concurrentUploads.map(value=>value.status),['synced','synced']);assert.equal(context.puts,putCount+1);assert.equal(concurrentUploads[0].body.document.id,concurrentUploads[1].body.document.id);
 const mapped=await oldDb.documents_local.get(oldRecord.local_id);assert.equal(mapped.client_document_id,oldRecord.client_document_id);assert.ok(uuid(mapped.cloud_client_document_id_v1));
 pass('concurrent first upload of unmapped legacy IDs allocates one stable cloud mapping and performs one PUT');
 console.log(JSON.stringify({passed:passed.length,puts:context.puts,canonicalDocuments:tables.documents.length,links:tables.document_links.length,actualHandlers:['create-upload','commit-upload','read-original'],storage:'mock only',schema:'existing UUID + UNIQUE path constraints enforced'}));
}finally{delete globalThis[key];}

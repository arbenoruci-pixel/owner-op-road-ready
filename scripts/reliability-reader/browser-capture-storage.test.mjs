import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const runtime=path.resolve(process.env.ROAD_READY_TEST_RUNTIME||process.argv[3]||repository);
const engine=process.env.READER_TEST_BROWSER||process.argv[2]||'chromium';
if(!['chromium','webkit'].includes(engine))throw Error('Choose chromium or webkit.');
process.env.PLAYWRIGHT_BROWSERS_PATH||='/tmp/road-ready-test-browsers';
if(engine==='webkit')process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS||='1';
const browserType=createRequire(path.join(runtime,'package.json'))('playwright')[engine];
const served=new Map(),failures=[];
const digest=value=>createHash('sha256').update(value).digest('hex');
const provider='lib/local-db/dexie.js',scanFallback='source/src/modules/scan/scanStorage.js';

// Serve installed modules unchanged except the bare Dexie import and these two
// environment adapters. No validator, writer, getter, exporter or importer is mocked.
// The DB adapter selects only databases created by this synthetic test context.
const server=http.createServer((request,response)=>{
  try{
    const url=new URL(request.url,'http://localhost');
    if(url.pathname==='/'){response.end('<!doctype html><title>Synthetic capture storage integration</title>');return;}
    if(url.pathname==='/dexie.mjs'){response.setHeader('Content-Type','text/javascript');response.end(fs.readFileSync(path.join(runtime,'node_modules/dexie/dist/dexie.mjs')));return;}
    if(!url.pathname.startsWith('/runtime/'))throw Error('Unsupported test route');
    const relative=decodeURIComponent(url.pathname.slice('/runtime/'.length)),file=path.resolve(runtime,relative);
    if(!file.startsWith(runtime+path.sep)||!file.endsWith('.js'))throw Error('Unsupported module path');
    response.setHeader('Content-Type','text/javascript');
    if(relative===provider){response.end("export const OWNER_OP_DB_NAME='synthetic-capture-storage'; export const getOwnerOpDb=()=>window.__captureDB; export const indexedDbAvailable=()=>Boolean(window.__captureDB);");return;}
    if(relative===scanFallback){response.end("import {getOwnerOpDb} from '/runtime/lib/local-db/dexie.js'; import {readOriginalRow} from './originalStore.js'; export async function getScannedDocumentBlob(id){return (await readOriginalRow(getOwnerOpDb(),id))?.blob||null;}");return;}
    const contents=fs.readFileSync(file,'utf8');served.set(relative,digest(contents));
    response.end(contents.replace(/(['"])dexie\1/g,"'/dexie.mjs'"));
  }catch(error){failures.push(error.message);response.statusCode=404;response.end('Test module unavailable');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;

async function setup({name,seed,identities}){
  const load=relative=>import('/runtime/'+relative);
  const {default:Dexie}=await import('/dexie.mjs');
  const {installBinaryStorage}=await load('lib/local-db/binaryStorageV110458.js');
  const schema={
    app_snapshots:'&key,updated_at',drivers_local:'&id,server_id,user_id,updated_at,sync_state',
    log_days_local:'&local_id,server_id,driver_id,log_date,updated_at,sync_state',
    duty_events_local:'&local_id,server_id,client_event_id,event_chain_id,[driver_id+log_date],version,action,sync_state',
    documents_local:'&local_id,server_id,client_document_id,driver_id,type,status,expires_on,sync_state',
    document_blobs:'&local_blob_id,client_document_id,created_at',
    document_links_local:'&local_id,server_id,document_id,driver_id,log_day_id,duty_event_chain_id,sync_state',
    inspections_local:'&local_id,server_id,client_inspection_id,driver_id,log_date,status,updated_at,sync_state',
    mutation_queue:'&client_mutation_id,status,entity,operation,created_at,next_retry_at,attempts',
    id_maps:'&source_id,server_id,entity,created_at',sync_meta:'&key,value,updated_at',
    capture_asset_blobs:'&local_asset_id,client_document_id,capture_run_id,current,page_index,created_at',
    account_receive_staging:'&key,user_id,updated_at',
  };
  const databases=[];
  async function create(suffix=''){
    const db=new Dexie(name+suffix);db.version(1).stores(schema);installBinaryStorage(db,Dexie);await db.open();databases.push(db);return db;
  }
  const db=await create();window.__captureDB=db;
  const original=await load('source/src/modules/scan/originalStore.js');
  const capture=await load('source/src/modules/scan/captureAssetStoreV106.js');
  const refs=await load('source/src/modules/scan/captureOriginals.js');
  const {saveDocument}=await load('source/src/modules/scan/documentSave.js');
  const main=new File(['SYNTHETIC FINISHED IMAGE A'],'synthetic-finished.png',{type:'image/png'});
  const raw=new File(['SYNTHETIC SOURCE PHOTO B'],'synthetic-source.jpg',{type:'image/jpeg'});
  const corrected=new File(['SYNTHETIC CORRECTED PHOTO C'],'synthetic-corrected.png',{type:'image/png'});
  const hashes={main:await original.sha256Original(main),raw:await original.sha256Original(raw),corrected:await original.sha256Original(corrected)};
  const ok=(value,message)=>{if(!value)throw Error(message);};
  async function reject(run,pattern){let message='';try{await run();}catch(error){message=error.message||String(error);}ok(message&&(!pattern||pattern.test(message)),'Expected rejection: '+String(pattern)+'; received '+message);return message;}
  async function serial(value){
    if(value instanceof Blob)return {blobHash:await original.sha256Original(value),size:value.size,type:value.type};
    if(Array.isArray(value)){const rows=[];for(const item of value)rows.push(await serial(item));return rows;}
    if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value).sort())out[key]=await serial(value[key]);return out;}
    return value;
  }
  async function snapshot(target=db,names=target.tables.map(table=>table.name)){
    const out={};for(const table of names)out[table]=await serial(await target.table(table).toArray());return JSON.stringify(out);
  }
  async function physical(target=db){
    const bytes=[];for(const table of ['document_blobs','capture_asset_blobs'])for(const row of await target.table(table).toArray())if(row.blob)bytes.push({table,id:row.local_blob_id||row.local_asset_id,sha256:await original.sha256Original(row.blob),size:row.blob.size});return bytes;
  }
  const state={activeDriverId:'synthetic-driver',teamDrivers:[{id:'synthetic-driver',name:'Synthetic test driver'}],eventsByDay:{},view:'home'};
  const business={loads:[{id:'selected-load',loadNo:'TEST-SELECTED'},{id:'writer-load',loadNo:'TEST-WRITER'},{id:'outside-load',loadNo:'TEST-OUTSIDE'}],documents:[],fuel:[],expenses:[],maintenance:[],settlements:[]};
  if(seed){
    const deps={db,waitFor:promise=>Dexie.waitFor(promise)};
    const outside=await saveDocument({file:new File([main],'PRIVATE-OUTSIDE-NAME.png',{type:main.type}),type:'receipt',metadata:{loadNo:'TEST-OUTSIDE'},extracted:{type:'receipt',loadNo:'TEST-OUTSIDE'}},deps);
    const selected=await saveDocument({file:main,type:'bol',metadata:{loadNo:'TEST-SELECTED'},extracted:{type:'bol',loadNo:'TEST-SELECTED'}},deps);
    const writer=await saveDocument({file:main,type:'bol',metadata:{loadNo:'TEST-WRITER'},extracted:{type:'bol',loadNo:'TEST-WRITER'}},deps);
    identities={outside:outside.localDocument.client_document_id,selected:selected.localDocument.client_document_id,writer:writer.localDocument.client_document_id};
    const legacy={local_asset_id:'synthetic-legacy-owner',client_document_id:identities.outside,capture_run_id:'synthetic-legacy-run',current:true,variants:[{kind:'original',pageIndex:0}],blob:raw,file_name:'PRIVATE-OUTSIDE-PHOTO.jpg',mime_type:raw.type,file_size_bytes:raw.size,created_at:'2026-11-01T00:00:00.000Z',privateNote:'PRIVATE-OUTSIDE-FILING'};
    await db.capture_asset_blobs.put(legacy);
    await db.app_snapshots.put({key:'owner-op-road-ready-state-v1',state,updated_at:'2026-11-01T00:00:00.000Z'});
    localStorage.setItem('owner-op-road-ready-business-v1',JSON.stringify(business));
  }
  window.__captureSuite={name,db,Dexie,databases,create,load,original,capture,refs,main,raw,corrected,hashes,identities,state,business,ok,reject,serial,snapshot,physical,checks:[],regressions:[]};
  return {identities,hashes};
}

try{
  browser=await browserType.launch({headless:true});
  const context=await browser.newContext(),page=await context.newPage(),other=await context.newPage(),pageErrors=[];
  const roundtripFailures=[];
  const roundtrip=async run=>{try{await page.evaluate(run);}catch(error){roundtripFailures.push(error.message);await page.evaluate(()=>{window.__captureDB=window.__captureSuite.db;});}};
  for(const tab of [page,other])tab.on('pageerror',error=>pageErrors.push(error.message));
  await context.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  await Promise.all([page.goto(origin),other.goto(origin)]);
  const name='synthetic-capture-storage-'+engine+'-'+Date.now();
  const fixture=await page.evaluate(setup,{name,seed:true});
  await other.evaluate(setup,{name,seed:false,identities:fixture.identities});

  await page.evaluate(async()=>{
    const w=window.__captureSuite,{db,capture,identities,ok}=w;
    w.ownerBefore=await w.snapshot(db,['document_blobs']);
    w.legacyBefore=JSON.stringify(await w.serial(await db.capture_asset_blobs.get('synthetic-legacy-owner')));
    const assets=[{file:w.raw,kind:'original',pageIndex:0},{file:w.raw,kind:'original',pageIndex:1},
      {file:new File([w.raw],'selected-cleaned.jpg',{type:w.raw.type}),kind:'ocr-selected',pageIndex:0},
      {file:new File([w.main],'selected-display.png',{type:w.main.type}),kind:'display-final',pageIndex:0}];
    w.first=await capture.persistCaptureAssetsV106({clientDocumentId:identities.selected,assets,captureManifest:{pageCount:2,synthetic:true}});
    const renamed=new Map();
    const renamedAssets=assets.map(asset=>{if(!renamed.has(asset.file))renamed.set(asset.file,new File([asset.file],'renamed-'+asset.file.name,{type:asset.file.type}));return {...asset,file:renamed.get(asset.file)};});
    w.second=await capture.persistCaptureAssetsV106({clientDocumentId:identities.selected,assets:renamedAssets,captureManifest:{pageCount:2,synthetic:true}});
    const rows=await db.capture_asset_blobs.where('client_document_id').equals(identities.selected).toArray();
    ok(rows.length===6,'Repeated capture lost a row or duplicated its groups');
    ok(rows.reduce((n,row)=>n+row.variants.length,0)===8,'Repeated capture lost page/variant metadata');
    ok((await w.physical()).length===2,'Source/display/reimport stored duplicate bytes');
    ok(await w.snapshot(db,['document_blobs'])===w.ownerBefore,'The pre-existing document owners changed');
    ok(JSON.stringify(await w.serial(await db.capture_asset_blobs.get('synthetic-legacy-owner')))===w.legacyBefore,'The legacy capture owner changed');
    for(const pageIndex of [0,1])ok(await w.original.sha256Original(await capture.getCaptureAssetBlobV106(identities.selected,'original',pageIndex))===w.hashes.raw,'A page reopened with different source bytes');
    ok(await w.original.sha256Original(await capture.getCaptureAssetBlobV106(identities.selected,'display-final',0))===w.hashes.main,'Display capture did not resolve main bytes');
    w.checks.push('Actual writer/getter: repeated renamed captures retain two pages and variants with one owner per byte sequence');
  });

  // Each page has its own module queue and DB connection. Disable Web Locks in
  // both to exercise IndexedDB's transaction isolation as the fallback.
  for(const tab of [page,other])await tab.evaluate(()=>Object.defineProperty(navigator,'locks',{value:undefined,configurable:true}));
  await Promise.all([page.evaluate(async()=>{const w=window.__captureSuite;w.concurrent=await w.capture.persistCaptureAssetsV106({clientDocumentId:w.identities.selected,assets:[{file:w.corrected,kind:'enhanced-color',pageIndex:0}]});}),
    other.evaluate(async()=>{const w=window.__captureSuite;return w.capture.persistCaptureAssetsV106({clientDocumentId:w.identities.writer,assets:[{file:w.corrected,kind:'enhanced-color',pageIndex:0}]});})]);
  await page.evaluate(async()=>{
    const w=window.__captureSuite,physical=await w.physical();
    w.ok(physical.filter(row=>row.sha256===w.hashes.corrected).length===1,'Concurrent pages created duplicate corrected bytes');
    w.ok(physical.length===3,'Concurrent capture owner count is wrong');
    const selected=await w.db.documents_local.where('client_document_id').equals(w.identities.selected).first();
    w.ok(selected.capture_runs.length===3,'Concurrent writing lost an earlier capture run');
    w.checks.push('Two actual pages and independent queues, without Web Locks, retain one new byte owner');
    const before=await w.snapshot(),nativePut=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,...args){if(this.name==='documents_local')throw new DOMException('Synthetic quota failure after capture writes','QuotaExceededError');return nativePut.call(this,value,...args);};
    try{await w.reject(()=>w.capture.persistCaptureAssetsV106({clientDocumentId:w.identities.selected,assets:[{file:new File(['SYNTHETIC FAILED WRITE'],'failed.png',{type:'image/png'}),kind:'original',pageIndex:0}]}),/quota|Quota/i);}finally{IDBObjectStore.prototype.put=nativePut;}
    w.ok(await w.snapshot()===before,'Quota failure left partial owners, references, flags or history');
    w.checks.push('Real IndexedDB quota failure rolls back every capture and document change');
    w.db.close();await w.db.open();
    const current=await w.capture.getBestCleanedCaptureBlobV106(w.identities.selected,0);
    w.ok(await w.original.sha256Original(current.blob)===w.hashes.corrected,'Current corrected run failed after reopening');
    w.ok(await w.capture.restoreCaptureRunV106(w.identities.selected,w.first.runId),'Earlier capture run could not be restored');
    const restored=await w.capture.getBestCleanedCaptureBlobV106(w.identities.selected,0);
    w.ok(await w.original.sha256Original(restored.blob)===w.hashes.raw,'Restored run returned another version');
    const selectedAfter=await w.db.documents_local.where('client_document_id').equals(w.identities.selected).first();
    if(!selectedAfter.capture_assets.every(asset=>asset.current===true))w.regressions.push('Restored current-run descriptors retain stale current flags');
    w.ok((await w.capture.listCaptureAssetsV106(w.identities.selected,{runId:w.second.runId})).length===3,'Restoring an old run lost later versions');
    w.checks.push('Actual reopen and restoreRun select the exact older bytes and preserve newer versions');
  });

  await roundtrip(async()=>{
    const w=window.__captureSuite,{db,ok}=w;
    const {prepareTransfer,validateTransfer}=await w.load('source/src/modules/owneros/transferCoreV110412.js');
    const {readTransferOriginal,readTransferCaptureAssets,importTransfer}=await w.load('source/src/modules/owneros/transferStorageV110412.js');
    const {preparePacket}=await w.load('source/src/modules/owneros/evidenceWorkspacePacketV110453.js');
    const {readStoredZip}=await w.load('source/src/modules/backup/chunkedZipV110431.js');
    const selected=await db.documents_local.where('client_document_id').equals(w.identities.selected).first();
    const all=await db.documents_local.toArray(),folder={loadNo:'TEST-SELECTED',documents:[selected],days:['2026-11-01'],stops:[]};
    w.transfer=await prepareTransfer({scope:'load',folder,documents:all,allDocuments:all,businessStore:w.business},readTransferOriginal,()=>{},readTransferCaptureAssets);
    ok(w.transfer.payload.version===3,'Capture transfer is not explicitly version 3');
    const validated=await validateTransfer(JSON.parse(await w.transfer.file.text()));
    ok(validated.documents.length===1&&validated.captureDecoded.length===7,'Selected transfer lost run/page rows or added another filing');
    ok(Object.keys(w.transfer.payload.originals).length===3,'Selected transfer repeated binary dependencies');
    const transferredMetadata=JSON.stringify(w.transfer.payload);
    for(const secret of ['PRIVATE-OUTSIDE-NAME','PRIVATE-OUTSIDE-PHOTO','PRIVATE-OUTSIDE-FILING','TEST-OUTSIDE'])ok(!transferredMetadata.includes(secret),'Selected transfer leaked another filing: '+secret);
    const packet=await preparePacket([{id:selected.local_id,kind:'document',name:'selected-document.png',category:'bol',date:'2026-11-01',loadNo:'TEST-SELECTED',source:selected}],{scenario:'load',loadNo:'TEST-SELECTED'});
    const files=await readStoredZip(packet.file),manifest=JSON.parse(await files.get('manifest.json').blob.text());
    ok(manifest.records.length===1&&manifest.captureAssets.length===7&&manifest.captureFiles===2,'Selected packet lost capture dependencies or repeated main bytes');
    for(const asset of manifest.captureAssets){const entry=files.get(asset.path);ok(entry&&await w.original.sha256Original(entry.blob)===asset.sha256,'Packet capture path failed exact byte verification');}
    for(const secret of ['PRIVATE-OUTSIDE-PHOTO','PRIVATE-OUTSIDE-FILING','TEST-OUTSIDE'])ok(!JSON.stringify(manifest).includes(secret),'Packet leaked external owner metadata');
    w.checks.push('Actual selected packet and v3 transfer resolve all dependencies outside scope without unrelated filing metadata');
    const target=await w.create('-transfer');window.__captureDB=target;
    const rows=new Map(),storage={getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,String(value)),removeItem:key=>rows.delete(key)};
    const imported=await importTransfer(w.transfer.payload,{db:target,storage});
    ok(imported.addedDocuments===1,'Actual transfer import did not create one selected filing');
    ok(await target.capture_asset_blobs.count()===7,'Actual transfer import lost capture versions');
    ok((await w.physical(target)).length===3,'Actual transfer import copied a shared binary');
    const before=await w.snapshot(target);await importTransfer(w.transfer.payload,{db:target,storage});
    ok(await w.snapshot(target)===before,'Repeated actual v3 import changed immutable capture rows');
    const blob=await w.capture.getCaptureAssetBlobV106(w.identities.selected,'original',1,{runId:w.first.runId});
    ok(await w.original.sha256Original(blob)===w.hashes.raw,'Imported second source page is unreadable');
    window.__captureDB=db;
    w.checks.push('Actual v3 import and reimport retain all selected versions and one stored binary per content');
  });

  await roundtrip(async()=>{
    const w=window.__captureSuite,{db,ok}=w;
    const {buildDeviceSafetyArchive}=await w.load('lib/local-db/safetyArchive.js');
    const {decoratePortableArchiveV110429,restorePortableArchiveV110429}=await w.load('source/src/modules/backup/portableBackupV110429.js');
    const {buildLargeBackup,inspectLargeBackup,restoreLargeBackup}=await w.load('source/src/modules/backup/largeBackupV110431.js');
    const {buildEverythingZip}=await w.load('source/src/modules/backup/everythingZipV110430.js');
    const {readStoredZip}=await w.load('source/src/modules/backup/chunkedZipV110431.js');
    const saved=await buildDeviceSafetyArchive({state:w.state,businessStore:w.business,appVersion:'synthetic-capture-test'});
    w.archive=await decoratePortableArchiveV110429(saved.archive);
    const source=await w.snapshot(db,['documents_local','document_blobs','capture_asset_blobs']);
    const target=await w.create('-json');window.__captureDB=target;
    await target.app_snapshots.put({key:'owner-op-road-ready-state-v1',state:{sentinel:'KEEP ON FAILURE'}});
    localStorage.setItem('road-ready-capture-sentinel','KEEP ON FAILURE');
    const before=await w.snapshot(target),bad=JSON.parse(JSON.stringify(w.archive));
    bad.payload.dexie.capture_asset_blobs=bad.payload.dexie.capture_asset_blobs.filter(row=>row.local_asset_id!=='synthetic-legacy-owner');
    bad.payloadSha256=await w.original.sha256Original(new Blob([JSON.stringify(bad.payload)]));
    await w.reject(()=>restorePortableArchiveV110429(bad),/missing.*original/i);
    ok(await w.snapshot(target)===before&&localStorage.getItem('road-ready-capture-sentinel')==='KEEP ON FAILURE','Invalid archive touched existing data');
    await restorePortableArchiveV110429(JSON.parse(JSON.stringify(w.archive)));
    ok(await w.snapshot(target,['documents_local','document_blobs','capture_asset_blobs'])===source,'Full JSON restore changed records or exact bytes');
    ok((await w.physical(target)).length===3,'Full JSON restore expanded references into byte copies');
    ok(await w.original.sha256Original(await w.capture.getCaptureAssetBlobV106(w.identities.selected,'original',1,{runId:w.first.runId}))===w.hashes.raw,'JSON restore getter lost page two');
    w.checks.push('Actual full JSON backup/restore preserves all rows and bytes; invalid capture dependency fails before replacement');
    window.__captureDB=db;
    w.large=await buildLargeBackup({db,state:w.state,businessStore:w.business,inventory:saved.archive.inventory,appVersion:'synthetic-capture-test',localRows:[]});
    ok(w.large.missingOriginals===0,'Full ZIP incorrectly reports a missing main original');
    const checked=await inspectLargeBackup(w.large.file);
    const zipTarget=await w.create('-zip');window.__captureDB=zipTarget;
    await restoreLargeBackup(checked);
    ok(await w.snapshot(zipTarget,['documents_local','document_blobs','capture_asset_blobs'])===source,'ZIP restore changed rows, versions or bytes');
    ok((await w.physical(zipTarget)).length===3,'ZIP restore duplicated referenced bytes');
    ok(await w.original.sha256Original(await w.capture.getCaptureAssetBlobV106(w.identities.selected,'display-final',0,{runId:w.first.runId}))===w.hashes.main,'ZIP restore getter lost finished display bytes');
    window.__captureDB=db;
    const everything=await buildEverythingZip(w.archive);
    const everythingFiles=await readStoredZip(everything.file);
    const manifest=JSON.parse(await everythingFiles.get('Documents/Manifest.json').blob.text());
    ok(manifest.length===3,'Everything ZIP did not preserve exactly three unique byte contents');
    w.checks.push('Actual large ZIP inspect/restore and Everything ZIP preserve immutable references with three physical payloads');
  });

  await roundtrip(async()=>{
    const w=window.__captureSuite,{db,ok}=w;
    const account=await w.load('lib/owner-op-cloud/accountFilesV110455.js');
    const {recordsFrom,bundleFrom}=await w.load('lib/owner-op-cloud/accountCoreV110455.js');
    const tables={};for(const table of db.tables)tables[table.name]=await table.toArray();
    const source={state:w.state,business:w.business,tables,locals:{}},records=recordsFrom(source),stored=new Map();
    const storage={upload:async(key,bytes)=>{if(stored.has(key))return {error:{message:'already exists'}};stored.set(key,new Blob([bytes]));return {error:null};},download:async key=>stored.has(key)?{data:stored.get(key),error:null}:{data:null,error:{message:'missing synthetic chunk'}}};
    const options={storage,uid:'00000000-0000-4000-8000-000000000001',known:new Set()};
    const encoded=await account.encode(records,options);
    w.refs.validateCaptureAccountRecords(encoded);
    ok(stored.size===3,'Account encoding uploaded duplicate byte sequences');
    const decoded=await account.decode(encoded,options);
    await w.refs.validateCaptureAccountInstall(encoded,async key=>decoded[key]);
    const target=await w.create('-account'),bundle=bundleFrom(decoded,w.state);
    await target.transaction('rw',target.tables,async()=>{for(const [name,rows] of Object.entries(bundle.tables))if(rows.length)await target.table(name).bulkPut(rows);});
    target.close();await target.open();window.__captureDB=target;
    ok(await w.snapshot(target,['documents_local','document_blobs','capture_asset_blobs'])===await w.snapshot(db,['documents_local','document_blobs','capture_asset_blobs']),'Account decode/install changed capture records or original bytes');
    ok(await w.original.sha256Original(await w.capture.getCaptureAssetBlobV106(w.identities.selected,'original',1,{runId:w.first.runId}))===w.hashes.raw,'Account restore getter lost original page');
    const before=await w.snapshot(target),key=[...stored.keys()][0],originalChunk=stored.get(key);stored.set(key,new Blob(['SYNTHETIC CORRUPT CHUNK']));
    await w.reject(()=>account.decode(encoded,options),/verification|incomplete/i);
    ok(await w.snapshot(target)===before,'Failed account decode changed saved target data');stored.set(key,originalChunk);
    window.__captureDB=db;
    w.checks.push('Actual account codecs retain shared owners after fresh IndexedDB install and reject altered chunks');
    const {buildDocumentsExport}=await w.load('source/src/modules/backup/documentsExportV110433.js');
    const missing=await w.create('-missing-main');window.__captureDB=missing;
    await missing.documents_local.put({local_id:'synthetic-missing-main',client_document_id:'synthetic-missing-main',original_file_name:'missing-main.pdf',load_no:'TEST-SELECTED',capture_asset_count:1,sha256:w.hashes.main});
    await missing.capture_asset_blobs.put({local_asset_id:'synthetic-only-cleaned',client_document_id:'synthetic-missing-main',capture_run_id:'synthetic-only-run',current:true,blob:w.corrected,sha256:w.hashes.corrected,file_size_bytes:w.corrected.size,file_name:'available-cleaned.png',mime_type:w.corrected.type,variants:[{kind:'enhanced-color',pageIndex:0}]});
    const exported=await buildDocumentsExport({db:missing,state:w.state,businessStore:{}});
    ok(exported.missingOriginals===1,'A cleaned capture masked the missing main original');
    const {readStoredZip}=await w.load('source/src/modules/backup/chunkedZipV110431.js');
    const files=await readStoredZip(exported.file);ok(files.has('Documents/Unavailable-files.txt')&&files.has('Documents/Capture-versions.json'),'Document export lost either missing-original report or available capture evidence');
    window.__captureDB=db;
    w.checks.push('Actual document export keeps available capture evidence while clearly listing its missing main original');
  });

  const result=await page.evaluate(async()=>{const w=window.__captureSuite;return {checks:w.checks,regressions:w.regressions,sourceHashes:w.hashes,physicalOwners:await w.physical(),captureRecords:await w.db.capture_asset_blobs.count(),selectedVersions:await w.db.capture_asset_blobs.where('client_document_id').equals(w.identities.selected).count()};});
  assert.deepEqual(pageErrors,[]);assert.deepEqual(failures,[]);
  if(roundtripFailures.length||result.regressions.length)console.error(JSON.stringify({passed:result.checks,roundtripFailures,regressions:result.regressions},null,2));
  assert.deepEqual(roundtripFailures,[]);
  assert.deepEqual(result.regressions,[]);
  assert.equal(result.checks.length,10);
  const ordered=Object.fromEntries([...served].sort(([a],[b])=>a.localeCompare(b)));
  console.log(JSON.stringify({engine,groups:result.checks.length,...result,installedModuleCount:served.size,installedModuleHashes:ordered,moduleSetSha256:digest(JSON.stringify(ordered)),environmentAdapters:[provider,scanFallback]},null,2));
  await other.evaluate(()=>{for(const db of window.__captureSuite.databases)db.close();});
  await page.evaluate(async()=>{const w=window.__captureSuite,names=[...new Set(w.databases.map(db=>db.name))];for(const db of w.databases)db.close();for(const name of names)await w.Dexie.delete(name);});
  await context.close();
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}

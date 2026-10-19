// Final CI-only adapter for generated legacy browser fixtures. Application code,
// storage policy, approval gates, production inputs and release locks stay intact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const MARKER='// reader-reliability:legacy-test-contracts-v1';
const sha256=value=>createHash('sha256').update(value).digest('hex');
const TARGETS=new Set(['scripts/v110427/browser.mjs','scripts/v110453/browser-workspace.mjs','scripts/v110430/browser-export.mjs','scripts/v110419/browser-source-copies.mjs','scripts/browser-smart-scan-recovery-v110318.mjs']);
function once(source,before,after,label){
 assert.equal(source.split(before).length-1,1,'Reader CI contract anchor: '+label);
 return source.replace(before,after);
}
function span(source,start,end,after,label){
 assert.equal(source.split(start).length-1,1,'Reader CI start anchor: '+label);
 assert.equal(source.split(end).length-1,1,'Reader CI end anchor: '+label);
 const first=source.indexOf(start),last=source.indexOf(end,first+start.length);
 assert.ok(last>first,'Reader CI ordered anchors: '+label);
 return source.slice(0,first)+after+'\n'+source.slice(last);
}

// Read actual browser IndexedDB bytes (including the established binary wrapper),
// then pass those exact records through the installed production resolvers in Node.
// This avoids a second implementation of the owner/reference graph in the test.
const snapshotImports=`import {resolveCaptureOriginal} from '../../source/src/modules/scan/captureOriginals.js';
import {readOriginalRow,sha256Original} from '../../source/src/modules/scan/originalStore.js';
`;
const snapshotHelper=String.raw`
async function originalSnapshot(page){
 const raw=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result,tx=db.transaction(['documents_local','document_blobs','capture_asset_blobs','app_snapshots'],'readonly');
   const docs=tx.objectStore('documents_local').getAll(),blobs=tx.objectStore('document_blobs').getAll(),assets=tx.objectStore('capture_asset_blobs').getAll(),state=tx.objectStore('app_snapshots').get('owner-op-road-ready-state-v1');
   tx.oncomplete=async()=>{db.close();try{
    const pack=async row=>{const blob=row.blob||row.processed_blob||row.original_blob;return {...row,blob:undefined,processed_blob:undefined,original_blob:undefined,__ciBytes:blob?{bytes:Array.from(new Uint8Array(await window.__rrFixtureBlob(blob).arrayBuffer())),type:blob.type||row.mime_type||''}:null};};
    resolve({docs:docs.result,blobs:await Promise.all(blobs.result.map(pack)),assets:await Promise.all(assets.result.map(pack)),state:state.result?.state});
   }catch(error){reject(error);}};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Fixture read aborted'));};
 }));
 const unpack=row=>{const {__ciBytes,...rest}=row;return __ciBytes?{...rest,blob:new Blob([Uint8Array.from(__ciBytes.bytes)],{type:__ciBytes.type})}:rest;};
 const tables={document_blobs:raw.blobs.map(unpack),capture_asset_blobs:raw.assets.map(unpack)};
 const table=name=>({get:async id=>tables[name].find(row=>row[name==='document_blobs'?'local_blob_id':'local_asset_id']===id)});
 const db={document_blobs:table('document_blobs'),capture_asset_blobs:table('capture_asset_blobs'),table};
 const blobs=await Promise.all(tables.document_blobs.map(async row=>{
  const owner=await readOriginalRow(db,row.client_document_id,row.local_blob_id),blob=owner?.blob;
  assert.ok(blob?.size,'Each saved original resolves to available bytes');
  return {...row,blob:undefined,id:row.local_blob_id,physical:Boolean(row.blob),ownerKey:'document_blobs:'+owner.local_blob_id,sha256:await sha256Original(blob),bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
 }));
 const assets=await Promise.all(tables.capture_asset_blobs.map(async row=>{
  const resolved=await resolveCaptureOriginal(db,row);
  return {...row,blob:undefined,id:row.local_asset_id,clientDocumentId:row.client_document_id,physical:Boolean(row.blob),ownerKey:resolved.table+':'+resolved.id,sha256:resolved.sha256,bytes:Array.from(new Uint8Array(await resolved.blob.arrayBuffer()))};
 }));
 return {docs:raw.docs,blobs,assets,state:raw.state};
}
`;
const pageOriginalAssertion=String.raw`
function assertOriginalPages(snapshot,expected){
 const originals=snapshot.assets.filter(row=>row.variants?.some(variant=>variant.kind==='original'));
 assert.equal(originals.length,2,'Both page-original records remain distinct');
 assert.deepEqual(originals.flatMap(row=>row.variants.filter(v=>v.kind==='original').map(v=>v.pageIndex)).sort(),[0,1],'Both page identities are retained after reorder');
 for(const row of originals)assert.deepEqual(Buffer.from(row.bytes),expected,'Every page resolves to exact original source bytes');
 assert.equal(new Set(originals.map(row=>row.ownerKey)).size,1,'Identical page sources share one immutable byte owner');
 const physical=[...snapshot.blobs,...snapshot.assets].filter(row=>row.physical&&Buffer.from(row.bytes).equals(expected));
 assert.equal(physical.length,1,'Identical page source bytes are physically stored once across both tables');
}
`;

function scanner(source){
 source=span(source,'async function stored(page){','const protectedData=',snapshotHelper+'\nasync function stored(page){return originalSnapshot(page);}\n'+pageOriginalAssertion,'scanner snapshot');
 source=once(source,"if(originalPhoto){const originals=saved.assets.filter(row=>row.variants?.some(v=>v.kind==='original'));assert.equal(originals.length,2,'originals for both pages retained');for(const row of originals)assert.deepEqual(Buffer.from(row.bytes),originalPhoto);}","if(originalPhoto)assertOriginalPages(saved,originalPhoto);",'scanner page originals');
 source=once(source,"assert.equal(reloaded.assets.length,saved.assets.length,'original assets survive reload');",`assert.equal(reloaded.assets.length,saved.assets.length,'original assets survive reload');
   if(originalPhoto)assertOriginalPages(reloaded,originalPhoto);
   assert.deepEqual(reloaded.assets.map(row=>[row.id,row.ownerKey,row.sha256,row.variants]),saved.assets.map(row=>[row.id,row.ownerKey,row.sha256,row.variants]),'All capture pages, versions and owner references survive reload');
   if(originalPdf)assert.ok(reloaded.blobs.some(row=>Buffer.from(row.bytes).equals(originalPdf)),'PDF source bytes survive reload');`,'scanner reopen');
 return snapshotImports+source;
}

function workspace(source){
 source=once(source,"await seed(page,state,[{id:'existing',bytes:[...simplePdf('Existing original')]}]);","await seed(page,state,[{id:'existing',binaryBytes:true,bytes:[...simplePdf('Existing original')]}]);",'workspace portable synthetic seed bytes');
 source=once(source,"import {chromium} from 'playwright';","import {chromium,webkit} from 'playwright';",'workspace browser engines');
 source=once(source,'const browser=await chromium.launch(',"for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){\nif(process.env.TEST_BROWSERS&&!process.env.TEST_BROWSERS.split(',').includes(name))continue;\nconst browser=await engine.launch(",'workspace both engines');
 source=once(source,"path:'browser-test-results/evidence-workspace-v110453.png'","path:'browser-test-results/evidence-workspace-v110453-'+name+'.png'",'workspace independent artifacts');
 source=once(source,"console.log('PASS — receipt filing,","console.log('PASS '+name+' — receipt filing,",'workspace engine report');
 source+='\n}\n';
 source=span(source,'async function stored(){','try{',snapshotHelper+'\nasync function stored(){return (await originalSnapshot(page)).docs;}','workspace snapshot');
 const old=" await workspace.getByRole('button',{name:'+ Add',exact:true}).click();await workspace.getByLabel('Choose original').setInputFiles({name:'Duplicate-repair.pdf',mimeType:'application/pdf',buffer:bytes});await workspace.getByRole('button',{name:'Save filing',exact:true}).click();await workspace.getByRole('status').filter({hasText:'already saved'}).waitFor();assert.equal((await stored()).filter(d=>d.sha256===repair.sha256).length,1);";
 const updated=String.raw`
 // Same file AND filing context reuses the existing record without changing history.
 const repairBeforeDuplicate=structuredClone(repair);
 await workspace.getByRole('button',{name:'+ Add',exact:true}).click();
 await workspace.getByLabel('Choose original').setInputFiles({name:'Duplicate-repair.pdf',mimeType:'application/pdf',buffer:bytes});
 await workspace.getByLabel('File under',{exact:true}).selectOption('repair');
 await workspace.getByLabel('Document date',{exact:true}).fill('2026-10-01');
 await workspace.getByLabel('Amount (USD)',{exact:true}).fill('125.75');
 await workspace.getByLabel('Business / vendor',{exact:true}).fill('Test Garage');
 await workspace.getByLabel('Truck / trailer',{exact:true}).fill('228');
 await workspace.getByLabel('Load number',{exact:true}).fill('A100');
 await workspace.getByLabel('Notes',{exact:true}).fill('Tire repair');
 await workspace.getByRole('button',{name:'Save filing',exact:true}).click();
 await workspace.getByRole('status').filter({hasText:'already saved'}).waitFor();
 assert.equal((await stored()).filter(d=>d.sha256===repair.sha256).length,1,'Same-context import keeps one filing');
 assert.deepEqual((await stored()).find(d=>d.local_id===repair.local_id),repairBeforeDuplicate,'Duplicate intake does not modify the reviewed filing or its history');
 // A second explicit filing keeps its own type/load/unit while sharing the bytes.
 await workspace.getByRole('button',{name:'‹ All files',exact:true}).click();
 await workspace.getByRole('button',{name:'+ Add',exact:true}).click();
 await workspace.getByLabel('Choose original').setInputFiles({name:'Related-repair.pdf',mimeType:'application/pdf',buffer:bytes});
 await workspace.getByLabel('File under',{exact:true}).selectOption('other');
 await workspace.getByLabel('Document date',{exact:true}).fill('2026-10-02');
 await workspace.getByLabel('Truck / trailer',{exact:true}).fill('229');
 await workspace.getByLabel('Load number',{exact:true}).fill('B200');
 await workspace.getByRole('button',{name:'Save filing',exact:true}).click();
 await workspace.getByRole('status').filter({hasText:'Original saved and filed.'}).waitFor();
 let relatedSnapshot=await originalSnapshot(page),related=relatedSnapshot.docs.filter(d=>d.sha256===repair.sha256);
 assert.equal(related.length,2,'Different filing context preserves both records');
 assert.deepEqual(related.find(d=>d.local_id===repair.local_id),repairBeforeDuplicate,'The first filing and history stay unchanged');
 const alias=related.find(d=>d.local_id!==repair.local_id);
 assert.equal(alias.type,'other');assert.equal(alias.load_no,'B200');assert.equal(alias.unit,'229');
 assert.equal(alias.evidenceFilingV1.category,'other');assert.equal(alias.evidenceFilingV1.date,'2026-10-02');assert.equal(alias.evidenceFilingHistoryV1.length,1);
 const matching=relatedSnapshot.blobs.filter(row=>row.sha256===repair.sha256);
 assert.equal(matching.length,2,'Each filing has an original locator');
 assert.equal(matching.filter(row=>row.physical).length,1,'The identical original is physically stored once');
 assert.equal(new Set(matching.map(row=>row.ownerKey)).size,1,'Both filing locators resolve to one original');
 for(const row of matching)assert.deepEqual(Buffer.from(row.bytes),bytes,'Both filing contexts reopen exact original bytes');
 await page.reload();await page.locator('.adaptive-home-v1038').waitFor();await home();
 relatedSnapshot=await originalSnapshot(page);related=relatedSnapshot.docs.filter(d=>d.sha256===repair.sha256);
 assert.equal(related.length,2);assert.deepEqual(related.find(d=>d.local_id===repair.local_id),repairBeforeDuplicate);
 assert.deepEqual(related.find(d=>d.local_id===alias.local_id),alias,'Second context survives reload');
 for(const row of relatedSnapshot.blobs.filter(row=>row.sha256===repair.sha256))assert.deepEqual(Buffer.from(row.bytes),bytes);
 // Export just the second filing; its owner is under another load and must resolve
 // without including that other filing's metadata in the selected packet.
 await workspace.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Packets',exact:true}).click();
 await workspace.getByLabel('Packet',{exact:true}).selectOption('all');
 await workspace.getByLabel('From',{exact:true}).fill('2026-10-02');await workspace.getByLabel('Through',{exact:true}).fill('2026-10-02');
 await workspace.getByLabel('Load number',{exact:true}).fill('B200');await workspace.getByLabel('Truck / trailer',{exact:true}).fill('229');
 await workspace.getByRole('button',{name:'Prepare ZIP',exact:true}).click();await workspace.getByRole('link',{name:'Save ZIP',exact:true}).waitFor();
 const [aliasDownload]=await Promise.all([page.waitForEvent('download'),workspace.getByRole('link',{name:'Save ZIP',exact:true}).click()]);
 const aliasZip=await readStoredZip(new Blob([fs.readFileSync(await aliasDownload.path())])),aliasManifest=JSON.parse(await aliasZip.get('manifest.json').blob.text());
 assert.equal(aliasManifest.records.length,1);assert.equal(aliasManifest.missing.length,0);
 assert.equal(aliasManifest.records[0].loadNo,'B200');assert.equal(aliasManifest.records[0].unit,'229');
 assert.deepEqual(Buffer.from(await aliasZip.get(aliasManifest.records[0].path).blob.arrayBuffer()),bytes,'Scoped alias export carries exact bytes from the unselected owner');
 assert.ok(!JSON.stringify(aliasManifest.records).includes('A100'),'Unselected first filing is excluded from the packet metadata');
 await workspace.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Files',exact:true}).click();
 // Reopen the alias through the UI before continuing the legacy load-folder check.
 await workspace.getByPlaceholder('Load, receipt, truck or name').fill('Related-repair.pdf');
 await workspace.getByRole('button',{name:/Related-repair\.pdf/}).click();
`;
 source=once(source,old,updated,'workspace duplicate contexts');
 return snapshotImports+source;
}

function exporter(source){
 source=once(source,"for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){",`for(const [name,engine] of [['chromium',chromium],['webkit',webkit]])for(const sizeCase of ['small','large']){
 const captureBytes=sizeCase==='large'?64*1024*1024:64*1024;
 const originalPdf=simplePdf('Export original BOL');`,'export bounded and large cases');
 source=once(source,"await seed(page,state,[{id:'export-bol',bytes:[...simplePdf('Export original BOL')]}]);", "await seed(page,state,[{id:'export-bol',bytes:[...originalPdf]}]);",'export source fixture');
 source=once(source,'  await page.evaluate(async () => {','  await page.evaluate(async ({captureBytes}) => {','export fixture parameters');
 source=once(source,"   await new Promise((ok,no)=>{const tx=db.transaction(['capture_asset_blobs','app_snapshots','document_blobs','documents_local'],'readwrite');\n    const large=new Blob([new Uint8Array(64*1024*1024)],{type:'image/jpeg'});\n    tx.objectStore('capture_asset_blobs').put({local_asset_id:'internal-scan-variant',client_document_id:'export-bol-client',blob:large,current:false});\n    tx.objectStore('app_snapshots').put({key:'historical-recovery-fixture',state:{oldPhoto:large}});",String.raw`
   const captureArray=new Uint8Array(captureBytes);captureArray[0]=71;captureArray[captureArray.length-1]=93;
   const captureBlob=new Blob([captureArray],{type:'image/jpeg'}),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',captureArray)),n=>n.toString(16).padStart(2,'0')).join('');
   await new Promise((ok,no)=>{const tx=db.transaction(['capture_asset_blobs','app_snapshots','document_blobs','documents_local'],'readwrite');
    const capture={local_asset_id:'internal-scan-variant',client_document_id:'export-bol-client',capture_run_id:'historical-run-one',blob:captureBlob,file_name:'saved-version.jpg',mime_type:'image/jpeg',file_size_bytes:captureBytes,sha256:hash,current:false,variants:[{kind:'enhanced-color',pageIndex:0,immutable:true}],created_at:'2026-09-07T12:00:00Z'};
    tx.objectStore('capture_asset_blobs').put(capture);
    const alias={...capture,local_asset_id:'linked-scan-variant',client_document_id:'copy-client',capture_run_id:'historical-run-two',file_name:'second-load-version.jpg',capture_original_ref_v1:{table:'capture_asset_blobs',id:capture.local_asset_id,sha256:hash,size:captureBytes}};delete alias.blob;
    tx.objectStore('capture_asset_blobs').put(alias);
    tx.objectStore('app_snapshots').put({key:'historical-recovery-fixture',state:{oldPhoto:new Blob([new Uint8Array(64*1024*1024)],{type:'image/jpeg'})}});`,'export saved capture owners and versions');
 source=once(source,'  });\n  await page.getByRole(\'button\',{name:/Export & Backup/})','  },{captureBytes});\n  await page.getByRole(\'button\',{name:/Export & Backup/})','export fixture arguments');
 source=once(source,'await ready.getByText(/2 original files/).waitFor();',"await ready.getByText(/3 original files/).waitFor();",'export unique content count');
 source=once(source,'`${name}-docs-logbook.zip`','`${name}-${sizeCase}-docs-logbook.zip`','export output filename');
 source=once(source,"import zipfile,json,sys,csv,io\nwith zipfile.ZipFile(sys.argv[1]) as z:","import zipfile,json,sys,csv,io,hashlib\nsize=int(sys.argv[2]); expected_pdf_sha=sys.argv[3]\nwith zipfile.ZipFile(sys.argv[1]) as z:",'export archive checks');
 source=once(source," assert b'Export original BOL' in z.read(pdfs[0]['File'])"," assert hashlib.sha256(z.read(pdfs[0]['File'])).hexdigest()==expected_pdf_sha",'export exact source hash');
 source=once(source," assert sum(row.file_size for row in z.infolist())<1000000\n`,zipFile]",String.raw` versions=json.loads(z.read('Documents/Capture-versions.json'))
 assert len(versions)==2 and len(set(row['path'] for row in versions))==1
 assert {row['local_asset_id'] for row in versions}=={'internal-scan-variant','linked-scan-variant'}
 assert {row['capture_run_id'] for row in versions}=={'historical-run-one','historical-run-two'}
 assert {row['client_document_id'] for row in versions}=={'export-bol-client','copy-client'}
 assert all(row['current'] is False and row['variants']==[{'kind':'enhanced-color','pageIndex':0,'immutable':True}] for row in versions)
 expected=bytearray(size);expected[0]=71;expected[-1]=93;expected_sha=hashlib.sha256(expected).hexdigest()
 assert all(row['sha256']==expected_sha and row['file_size_bytes']==size for row in versions)
 assert hashlib.sha256(z.read(versions[0]['path'])).hexdigest()==expected_sha
 captures=[row for row in files if row['Type']=='capture-variant']
 assert len(captures)==2 and len(set(row['File'] for row in captures))==1
 assert {row['Load'] for row in captures}=={'82002','SECOND-LOAD'}
 assert len(files)==5 and len(set(row['File'] for row in files))==3
 assert not any('historical-recovery-fixture' in name for name in z.namelist())
 assert size < sum(row.file_size for row in z.infolist()) < size+1000000
`+'\n'+"`,zipFile,String(captureBytes),await sha256Original(new Blob([originalPdf]))]",'export full page/version evidence');
 source=once(source,'  // Native share is called synchronously from a fresh user tap; cancellation can retry.','  // Native share remains covered by the small case; the large case requires a download.\n  if(sizeCase===\'small\'){\n  // Native share is called synchronously from a fresh user tap; cancellation can retry.','export share scope');
 source=once(source,"assert.ok(calls.every(c=>c.active!==false&&c.name.endsWith('.zip')));","assert.ok(calls.every(c=>c.active!==false&&c.name.endsWith('.zip')));\n  }else{assert.equal(await ready.getByRole('button',{name:'Share ZIP',exact:true}).count(),0);await ready.getByText('To share this large ZIP, download it first, then share the saved file from Files.',{exact:true}).waitFor();}",'export large download behavior');
 source=once(source,"  assert.ok(fs.statSync(zipFile).size<1000000,'128 MB internal scanner/history assets must stay out of the document ZIP');","  assert.ok(fs.statSync(zipFile).size>captureBytes&&fs.statSync(zipFile).size<captureBytes+1000000,'Every saved version is included once; the separate 64 MB recovery snapshot is excluded');",'export size contract');
 source=once(source,"const scan=await read('capture_asset_blobs','internal-scan-variant'),history=await read('app_snapshots','historical-recovery-fixture'),copy=await read('document_blobs','duplicate-original');db.close();return {scan:scan.blob.size,history:history.state.oldPhoto.size,copy:copy.blob.size};",String.raw`const scan=await read('capture_asset_blobs','internal-scan-variant'),alias=await read('capture_asset_blobs','linked-scan-variant'),history=await read('app_snapshots','historical-recovery-fixture'),copy=await read('document_blobs','duplicate-original');db.close();const blob=window.__rrFixtureBlob(scan.blob),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');return {scan:blob.size,hash,claimed:scan.sha256,history:history.state.oldPhoto.size,copy:copy.blob.size,alias:{...alias,blob:undefined},aliasHasBlob:Boolean(alias.blob),current:scan.current,variants:scan.variants};`,'export read-only persistence check');
 source=once(source,'assert.equal(stored.scan,64*1024*1024);',"assert.equal(stored.scan,captureBytes);assert.equal(stored.hash,stored.claimed);assert.equal(stored.aliasHasBlob,false);assert.equal(stored.alias.capture_original_ref_v1.id,'internal-scan-variant');assert.equal(stored.alias.capture_original_ref_v1.sha256,stored.hash);assert.equal(stored.current,false);assert.deepEqual(stored.variants,[{kind:'enhanced-color',pageIndex:0,immutable:true}]);",'export owner integrity');
 source=once(source,'`${output}/${name}-ready.png`','`${output}/${name}-${sizeCase}-ready.png`','export ready screenshot');
 source=once(source,'`${output}/${name}-failure.png`','`${output}/${name}-${sizeCase}-failure.png`','export failure screenshot');
 source=once(source,'PASS ${name}: Home and Documents entry, lean ZIP download, exact duplicate PDF stored once, both load references, logbook, 128 MB scanner/history excluded without deletion, restore remains locked, fresh-tap share and cancel/retry','PASS ${name} ${sizeCase}: exact PDF and historical capture bytes once, all filing/page/version references, legacy wallet, logbook, recovery excluded without deletion, restore locked, bounded share or large download','export report');
 return "import {sha256Original} from '../../source/src/modules/scan/originalStore.js';\n"+source;
}

function sourceCopies(source){
 source=once(source,"const payload=await transfer.evaluate(async el=>(await fetch(el.href)).json());",`const wire=await transfer.evaluate(async el=>(await fetch(el.href)).json());
  assert.equal(wire.version,2,'Shared originals use the reference-aware transfer envelope');
  assert.equal(wire.documents.length,3,'All three independent filing records remain in the transfer');
  assert.equal(Object.keys(wire.originals).length,2,'Two unique byte owners are encoded once each');
  assert.equal(new Set(wire.documents.map(item=>item.original.ref)).size,2,'Every filing points to its immutable original');
  const payload=await validateTransfer(wire);
  assert.deepEqual(payload.documents.map(item=>item.record),wire.documents.map(item=>item.record),'Validation preserves all filing categories, page references and review/version metadata');
  assert.equal(payload.decoded.length,3,'The actual importer resolves all three originals before writes');
  assert.deepEqual(payload.documents.map(item=>documentIdentity(item.record)).sort(),['confirmed-bol-client','old-bol-copy-client','rate-client']);
  assert.deepEqual(payload.documents.map(item=>item.record.document_type||item.record.type).sort(),['bol','bol','rate_confirmation']);
  for(const item of payload.decoded){const expected=files.find(file=>file.id+'-client'===documentIdentity(item.record));assert.ok(expected,'Each exported filing retains its known synthetic source');assert.deepEqual(Buffer.from(await item.blob.arrayBuffer()),Buffer.from(expected.bytes),'Resolved exported source bytes are exact');}`, 'shared transfer decoder');
 return "import {validateTransfer,documentIdentity} from '../../source/src/modules/owneros/transferCoreV110412.js';\n"+source;
}


const resume318Helpers=String.raw`
// Keep the original bare-label case: old guesses alone cannot establish a route.
const resumedFields318=[['Broker','Example Freight'],['Pickup address','Howe, IN'],['Delivery address','Smithfield, RI'],['Pickup date','2026-09-08']];
const businessDocuments318=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')).documents);
async function originalEvidence318(page){
 return page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result,tx=db.transaction(['documents_local','document_blobs'],'readonly'),docs=tx.objectStore('documents_local').getAll(),originals=tx.objectStore('document_blobs').getAll();
   tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Original read aborted'));
   tx.oncomplete=async()=>{db.close();try{
    const rows=await Promise.all(originals.result.map(async row=>({...row,blob:undefined,bytes:row.blob?Array.from(new Uint8Array(await row.blob.arrayBuffer())):null})));
    resolve({docs:docs.result,originals:rows});
   }catch(error){reject(error);}};
  };
 }));
}
async function inspectResumeUncertainty318(page){
 const before=await businessDocuments318(page);
 assert.equal(before.length,1);assert.equal(before[0].extracted.guideSourceTextV110312,rateText,'The broad source fixture is unchanged');
 await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
 const reader=page.locator('.owned-reader-body');await reader.waitFor({timeout:30000});
 for(const [label] of resumedFields318){const row=reader.locator('.owned-reader-field').filter({has:page.getByText(label,{exact:true})});await row.getByText('Missing',{exact:true}).waitFor();}
 await reader.getByRole('button',{name:'Enter broker from page',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Check source',exact:true});await dialog.waitFor();
 await dialog.getByText('The source image is unavailable. Skip this item and check the original file.',{exact:true}).waitFor();
 await dialog.getByLabel('Confirmed value',{exact:true}).fill('Example Freight');
 assert.equal(await dialog.getByRole('button',{name:'Confirm value',exact:true}).isEnabled(),false,'Text-only legacy guesses cannot be confirmed without the original page');
 await dialog.getByRole('button',{name:'Close source',exact:true}).click();
 assert.deepEqual(await businessDocuments318(page),before,'Opening and canceling review changes no saved fields');
 return before;
}
async function confirmResumeRoute318(page,before){
 // Reread the actual original PDF so every manual value has a retained source page.
 await page.getByRole('button',{name:'Read again',exact:true}).click();
 await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).waitFor({timeout:60000});
 await chooseLoadFolder(page,'76543210');
 await page.getByRole('button',{name:'Reader preview · Check source',exact:true}).click();
 const reader=page.locator('.owned-reader-body');await reader.waitFor({timeout:30000});
 await reader.getByText('Read page text',{exact:true}).click();
 const sourceText=await reader.locator('pre').first().innerText();
 for(const line of rateText.split('\n'))assert.ok(sourceText.includes(line),'Retained page contains the unchanged printed source: '+line);
 for(const [label,value] of resumedFields318){
  const row=reader.locator('.owned-reader-field').filter({has:page.getByText(label,{exact:true})});await row.waitFor();
  await row.getByRole('button').first().click();
  const dialog=page.getByRole('dialog',{name:'Check source',exact:true});await dialog.waitFor();
  await dialog.getByRole('heading',{name:label+' · Page 1',exact:true}).waitFor();
  const image=dialog.getByRole('img').first();await image.waitFor();
  assert.ok(await image.evaluate(node=>node.complete&&node.naturalWidth>0),'A real retained original page is visible');
  // The printed city/state is retained literally as a partial address; no street is added.
  await dialog.getByLabel('Confirmed value',{exact:true}).fill(value);
  assert.equal(await dialog.getByRole('button',{name:'Confirm value',exact:true}).isEnabled(),true);
  await dialog.getByRole('button',{name:'Confirm value',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await row.getByText('Confirmed',{exact:true}).waitFor();
 }
 assert.deepEqual(await businessDocuments318(page),before,'Review remains a draft until the explicit document Save');
}
function assertResumeRecord318(doc,confirmed){
 assert.equal(doc.id,'saved-rate-318');assert.equal(doc.clientDocumentId,'legacy-client');assert.equal(doc.fileName,'saved-rate.pdf');assert.equal(doc.canonicalLoadNo,'76543210');
 const fields=doc.extracted,proofs=fields.readerSourceFieldsV110393.fields;
 assert.equal(fields.readerStopsReviewV1.required,true,'Missing route details stay visible for review');
 for(const key of ['deliveryDate','pickupAppointment','deliveryAppointment','pickupTime','deliveryTime'])assert.ok(!fields[key],'Unprinted dates and appointments are not fabricated: '+key);
 if(confirmed){
  assert.ok(doc.loadGuideV110312,'A guide is available only after the source route is confirmed');
  assert.equal(doc.broker,'Example Freight');assert.equal(fields.pickupDate,'2026-09-08');
  for(const [key,value] of [['broker','Example Freight'],['pickupAddress','Howe, IN'],['deliveryAddress','Smithfield, RI'],['pickupDate','2026-09-08']]){
   assert.equal(proofs[key].status,'confirmed');assert.equal(proofs[key].value,value);assert.equal(proofs[key].sourcePage.pageNumber,1);assert.ok(proofs[key].sourcePage.sourceImageId);
  }
  assert.equal(fields.readerStopsReviewV1.reason,'missing_stop_details');
  assert.deepEqual(fields.stops.map(stop=>[stop.type,stop.address,stop.date,stop.time,stop.appointment,stop.needsReview]),[['pickup','Howe, IN','2026-09-08','','',true],['delivery','Smithfield, RI','','','',true]]);
  const guide=doc.loadGuideV110312;assert.equal(guide.sourceDocumentId,doc.id);assert.equal(guide.origin,'Howe, IN');assert.equal(guide.destination,'Smithfield, RI');
  assert.equal(guide.deliveryDate,'');assert.ok(guide.stops.every(stop=>!stop.time&&!stop.street&&stop.needsReview));
  assert.ok(guide.stops.every(stop=>!stop.appointment||stop.appointment===stop.date),'Guide display may repeat the printed date but adds no appointment time');
 }else{
  assert.ok(!doc.loadGuideV110312,'An unconfirmed legacy route cannot fabricate a guide');assert.equal(fields.readerStopsReviewV1.reason,'incomplete_route');assert.deepEqual(fields.stops,[]);
  assert.deepEqual(fields.readerPendingStopsV1,scanState('resume').testInstructionStore.documents[0].extracted.stops,'Legacy stop suggestions are retained separately for review');
  for(const key of ['broker','origin','destination','pickupDate','pickupAddress','deliveryAddress'])assert.ok(!proofs[key],'An unconfirmed field has no source proof: '+key);
 }
}
`;
function savedScanRecovery(source){
 source=once(source,"if(kind==='resume'){doc.status=","if(kind.startsWith('resume')){doc.status=",'resume uncertain fixture retained');
 source=once(source,"for(const kind of ['missing-appointment','resume','bol-upload']){","for(const kind of ['missing-appointment','resume-unconfirmed','resume','bol-upload']){",'resume both uncertain and confirmed cases');
 source=once(source,"   if(kind==='resume'){\n    await page.getByRole", "   if(kind.startsWith('resume')){\n    await page.getByRole",'resume intake branch');
 source=once(source,"    await chooseLoadFolder(page,'76543210');\n   } else if(kind==='bol-upload'){",`    await chooseLoadFolder(page,'76543210');
    const beforeReview=await inspectResumeUncertainty318(page);
    if(kind==='resume')await confirmResumeRoute318(page,beforeReview);
   } else if(kind==='bol-upload'){`,'resume explicit original page confirmation');
 source=once(source,"if(kind==='resume'){assert.equal(docs.length,1);assert.equal(docs[0].id,'saved-rate-318');assert.ok(docs[0].loadGuideV110312);}",`if(kind.startsWith('resume')){
     assert.equal(docs.length,1,'Resume updates the same filing');assertResumeRecord318(docs[0],kind==='resume');
     const original=await originalEvidence318(page);assert.equal(original.docs.length,1);assert.equal(original.originals.length,1,'Resume preserves one original owner');
     assert.deepEqual(Buffer.from(original.originals[0].bytes),simplePdf(rateText),'Saved original bytes remain exact after review');
    }`,'resume saved source and guide contract');
 source=once(source,"   await page.reload();await page.locator('.adaptive-home-v1038.active-load').waitFor({timeout:30000});assert.deepEqual(errors,[]);",`   await page.reload();await page.locator(kind==='resume-unconfirmed'?'.adaptive-home-v1038':'.adaptive-home-v1038.active-load').waitFor({timeout:30000});assert.deepEqual(errors,[]);
   if(kind==='resume-unconfirmed'){await page.getByRole('button',{name:'Continue saved scan',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Full mission',exact:true}).count(),0,'The uncertain route is not presented as an active mission');}
   if(kind.startsWith('resume')){const docs=await businessDocuments318(page);assert.equal(docs.length,1);assertResumeRecord318(docs[0],kind==='resume');const original=await originalEvidence318(page);assert.equal(original.originals.length,1);assert.deepEqual(Buffer.from(original.originals[0].bytes),simplePdf(rateText),'Original survives reload');}`,'resume reopen provenance');
 return once(source,'const reports=[];',resume318Helpers+'\nconst reports=[];','resume source helpers');
}

export const legacyReaderTestContracts=[
 {file:'scripts/v110427/browser.mjs',before:'5298b41f4f73dd485c579fcb95fa8ccca94866df4251aaf3440fa891fceb7bb4',after:'e2d6c9a149d0b583348b305cfeb957e0e54a0c1f7fd8b7d2b9979810f368a53e',transform:scanner},
 {file:'scripts/v110453/browser-workspace.mjs',before:'91a709642ba96b8188d64ded5893973ba6389373e0c1b638533033388a6303de',after:'279c4991c95ec69d8ee13f574be5855e0e776610fc9a88f288550723309c2e2d',transform:workspace},
 {file:'scripts/v110430/browser-export.mjs',before:'3fca70e51fed74e40e415ffc208e6aca300edcba82156e16880d4ebd5e35ccad',after:'a19db9d0f531e26d035ed8d80397aebcb94527760319f6ffdcf3ae06ed7ac5fc',transform:exporter},
 {file:'scripts/v110419/browser-source-copies.mjs',before:'a235a9f0e7bbba1266e0b50759e774b47cf900da73dcfa3b3c71226a30ebeeba',after:'4d2bca6320c4a1632eea32aa3b6442f17fbe0e3621a2ce625086f01cf50b7615',transform:sourceCopies},
 {file:'scripts/browser-smart-scan-recovery-v110318.mjs',before:'3c6956db73994aa0a6fde0570246ae1eb5ced673b71f9ce55e3e83659a9331bd',after:'c5e07f2890cd194120169000197a0cf9c62b623c5c462eafb1254b0946c9365e',transform:savedScanRecovery},
];
export function installLegacyReaderTestContracts(root='.'){
 const directory=path.resolve(root),prepared=[];
 for(const spec of legacyReaderTestContracts){
  assert.ok(TARGETS.has(spec.file));const target=path.join(directory,spec.file),source=fs.readFileSync(target,'utf8'),current=sha256(source);
  if(current===spec.after){prepared.push({...spec,target,changed:false});continue;}
  assert.equal(current,spec.before,'Unknown legacy Reader test source: '+spec.file);
  const output=MARKER+'\n'+spec.transform(source);
  assert.equal(output.split(MARKER).length-1,1,'One Reader CI adapter marker: '+spec.file);
  assert.equal(sha256(output),spec.after,'Unexpected legacy Reader test transformation: '+spec.file);
  prepared.push({...spec,target,output,changed:true});
 }
 // Validate every known input and output before writing any generated test file.
 for(const item of prepared)if(item.changed)fs.writeFileSync(item.target,item.output);
 console.log('PASS — Reader legacy CI contracts: owner-aware original checks, filing-context reuse, complete deduplicated capture exports, explicit saved-scan source confirmation');
 return prepared.map(({file,before,after,changed})=>({file,before,after,changed}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))installLegacyReaderTestContracts(process.argv[2]||'.');

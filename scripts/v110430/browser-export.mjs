import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,simplePdf} from '../v110328/browserFixture.mjs';
const output='browser-test-results/export-center-v110430';fs.mkdirSync(output,{recursive:true});
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rr-export-center-'));
 const context=await engine.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});
 await setupRoutes(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const state=baseState();state.view='logbook';state.testInstructionStore={loads:[{loadNo:'82002',gross:1800}]};
  await seed(page,state,[{id:'export-bol',bytes:[...simplePdf('Export original BOL')]}]);
  await page.evaluate(async () => {
   const db=await new Promise((ok,no)=>{const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error);});
   await new Promise((ok,no)=>{const tx=db.transaction(['capture_asset_blobs','app_snapshots','document_blobs','documents_local'],'readwrite');
    const large=new Blob([new Uint8Array(64*1024*1024)],{type:'image/jpeg'});
    tx.objectStore('capture_asset_blobs').put({local_asset_id:'internal-scan-variant',client_document_id:'export-bol-client',blob:large,current:false});
    tx.objectStore('app_snapshots').put({key:'historical-recovery-fixture',state:{oldPhoto:large}});
    tx.objectStore('document_blobs').get('export-bol-blob').onsuccess=event=>{tx.objectStore('document_blobs').put({...event.target.result,local_blob_id:'duplicate-original',client_document_id:'copy-client'});};
    tx.objectStore('documents_local').put({local_id:'copy',client_document_id:'copy-client',original_file_name:'copy.pdf',load_no:'SECOND-LOAD',type:'bol'});
    tx.oncomplete=ok;tx.onerror=()=>no(tx.error);
   });db.close();
  });
  await page.getByRole('button',{name:/Export & Backup/}).click();await page.getByRole('button',{name:'Export Docs + Logbook (ZIP)',exact:true}).waitFor();
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Home',exact:true}).first().click();
  await page.getByRole('button',{name:'Documents Vault',exact:true}).click();
  await page.getByRole('button',{name:/Export & Backup/}).click();
  await page.getByRole('button',{name:'Export Docs + Logbook (ZIP)',exact:true}).click();
  const ready=page.getByRole('region',{name:'Documents ready to download'});await ready.waitFor();await ready.getByText(/1 original files/).waitFor();
  const downloadPromise=page.waitForEvent('download');await ready.getByRole('link',{name:'Download ZIP',exact:true}).click();const download=await downloadPromise;
  assert.ok(download.suggestedFilename().endsWith('.zip'));const zipFile=path.resolve(output,`${name}-docs-logbook.zip`);await download.saveAs(zipFile);
  const check=spawnSync('python3',['-c',`import zipfile,json,sys,csv,io
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 files=list(csv.DictReader(io.StringIO(z.read('Documents/Index.csv').decode())))
 assert len(files)==2 and len(set(row['File'] for row in files))==1
 assert b'Export original BOL' in z.read(files[0]['File'])
 assert 'SECOND-LOAD' in [row['Load'] for row in files]
 assert 'Road-Ready-Backup.roadready.json' not in z.namelist()
 assert not any(name.startswith(('Saved-assets/','Records/')) for name in z.namelist())
 review=json.loads(z.read('Review/ChatGPT-Review.json'))
 assert review['loads'][0]['loadNo']=='82002'
 assert '2026-09-07' in z.read('Logbook/Logbook.html').decode()
 assert 'payload' not in review
 assert sum(row.file_size for row in z.infolist())<1000000
`,zipFile],{encoding:'utf8'});assert.equal(check.status,0,check.stderr);
  // Native share is called synchronously from a fresh user tap; cancellation can retry.
  await page.evaluate(()=>{window.shareCalls=[];Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.shareCalls.push({name:data.files[0].name,active:navigator.userActivation?.isActive});if(window.shareCalls.length===1)throw new DOMException('Cancelled','AbortError');}});});
  await ready.getByRole('button',{name:'Share ZIP',exact:true}).click();await page.getByRole('status').filter({hasText:'Sharing closed'}).waitFor();
  await ready.getByRole('button',{name:'Share ZIP',exact:true}).click();await page.getByRole('status').filter({hasText:'Files shared'}).waitFor();
  const calls=await page.evaluate(()=>window.shareCalls);assert.equal(calls.length,2);assert.ok(calls.every(c=>c.active!==false&&c.name.endsWith('.zip')));
  assert.ok(fs.statSync(zipFile).size<1000000,'128 MB internal scanner/history assets must stay out of the document ZIP');
  assert.equal(await page.evaluate(()=>localStorage.getItem('owner-op-road-ready-last-device-safety-export-v1')),null,'A shared document ZIP cannot certify a device backup');
  assert.equal(await page.getByRole('button',{name:'Import Everything',exact:true}).isDisabled(),true);
  const stored=await page.evaluate(async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});const read=(table,id)=>new Promise(ok=>{const r=db.transaction(table).objectStore(table).get(id);r.onsuccess=()=>ok(r.result);});const scan=await read('capture_asset_blobs','internal-scan-variant'),history=await read('app_snapshots','historical-recovery-fixture'),copy=await read('document_blobs','duplicate-original');db.close();return {scan:scan.blob.size,history:history.state.oldPhoto.size,copy:copy.blob.size};});
  assert.equal(stored.scan,64*1024*1024);assert.equal(stored.history,64*1024*1024);assert.ok(stored.copy>0,'Read-only export must preserve stored originals and recovery assets');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`${output}/${name}-ready.png`,fullPage:true});assert.deepEqual(errors,[]);
  console.log(`PASS ${name}: Home and Documents entry, lean ZIP download, exact duplicate PDF stored once, both load references, logbook, 128 MB scanner/history excluded without deletion, restore remains locked, fresh-tap share and cancel/retry`);
 }catch(error){console.error({errors,body:await page.locator('body').innerText()});await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true});throw error;}
 finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}

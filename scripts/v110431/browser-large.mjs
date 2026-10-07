import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,simplePdf} from '../v110328/browserFixture.mjs';
const output='browser-test-results/large-export-v110431';fs.mkdirSync(output,{recursive:true});
const empty=()=>({...baseState(),view:'logbook',eventsByDay:{},signatureByDay:{},inspectionByDay:{},formByDay:{},certifyStatus:{},routeLegsByDay:{},loadInfo:{},loadGuidesById:{},testInstructionStore:{}});
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 if(process.env.LARGE_BACKUP_BROWSER&&process.env.LARGE_BACKUP_BROWSER!==name)continue;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rr-large-browser-'));let deviceNo=0;
 async function device(run){const context=await engine.launchPersistentContext(path.join(dir,`profile-${++deviceNo}`),{headless:true,viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});await setupRoutes(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{await run(page);assert.deepEqual(errors,[]);}catch(error){console.error({errors,body:await page.locator('body').innerText()});await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true});throw error;}finally{await context.close();}}
 const zipPath=path.join(dir,'everything.zip'),badPath=path.join(dir,'bad.zip');
 try{
  await device(async page=>{
   const state=baseState();state.view='logbook';state.testInstructionStore={loads:[{loadNo:'BIG-1',gross:1800}]};await seed(page,state);
   await page.evaluate(async pdf=>{
    const db=await new Promise((ok,no)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
    const unit=new Uint8Array(1480000);unit.fill(32);const body=new Blob([unit]);
    await new Promise((ok,no)=>{const tx=db.transaction(['documents_local','document_blobs','capture_asset_blobs'],'readwrite');
     for(let i=0;i<194;i++){const id=`large-${i}`,blob=new Blob([new Uint8Array(pdf),`\n% Original ${i}\n`,body],{type:'application/pdf'});
      tx.objectStore('documents_local').put({local_id:id,client_document_id:id,load_no:'BIG-1',type:'bol',mime_type:'application/pdf',original_file_name:`bol-${i}.pdf`,file_size_bytes:blob.size});
      tx.objectStore('document_blobs').put({local_blob_id:id,client_document_id:id,blob});}
     tx.objectStore('capture_asset_blobs').put({local_asset_id:'capture-big',client_document_id:'large-0',blob:new Blob(Array.from({length:40},()=>body),{type:'image/jpeg'})});
     tx.oncomplete=()=>ok();tx.onerror=()=>no(tx.error);});db.close();
    const native=Blob.prototype.arrayBuffer;window.biggestBinaryRead=0;Blob.prototype.arrayBuffer=function(){window.biggestBinaryRead=Math.max(window.biggestBinaryRead,this.size);if(this.size>1048576)throw new Error('Full binary read exceeds 1 MB');return native.call(this);};
   },[...simplePdf('Large collection original')]);
   await page.evaluate(()=>{window.nativeShareCalls=0;Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:()=>{window.nativeShareCalls++;throw new DOMException('Native share reader failed','AbortError');}});});
   await page.getByRole('button',{name:/Export & Backup/}).click();await page.getByRole('button',{name:'Export Everything',exact:true}).click();
   await page.getByRole('button',{name:'Cancel preparation',exact:true}).click();await page.getByRole('status').filter({hasText:'Export cancelled'}).waitFor();
   await page.getByRole('button',{name:'Export Everything',exact:true}).click();const ready=page.getByRole('region',{name:'Backup ready to save'});await ready.waitFor({timeout:180000});await ready.getByText(/194 original files/).waitFor();
   assert.equal(await ready.getByRole('button',{name:/Share/}).count(),0,'Large backups use download without entering native sharing');
   assert.match(await ready.getByRole('link',{name:'Download backup',exact:true}).getAttribute('class'),/backup-primary/);
   const downloadPromise=page.waitForEvent('download');await ready.getByRole('link',{name:'Download backup',exact:true}).click();await (await downloadPromise).saveAs(zipPath);
   assert.equal(await page.evaluate(()=>window.nativeShareCalls),0);assert.equal(await page.evaluate(()=>localStorage.getItem('owner-op-road-ready-last-device-safety-export-v1')),null,'Download initiation does not certify a saved copy');
   assert.ok(await page.evaluate(()=>window.biggestBinaryRead)<=1048576);assert.ok(fs.statSync(zipPath).size>300*1048576);assert.ok(fs.statSync(zipPath).size<335*1048576,'Binary files were expanded or duplicated');
   await page.screenshot({path:`${output}/${name}-194-files-ready.png`,fullPage:true});
   console.log(`${name}: downloaded all 194 originals and scanner assets`);
  });
  const validate=spawnSync('python3',['-c',`import zipfile,json,sys,shutil
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 meta=z.read('Road-Ready-Backup.roadready.json');assert len(meta)<500000
 a=json.loads(meta);assert a['kind']=='owner_op_road_ready_zip_backup'
 assert len(a['payload']['dexie']['document_blobs'])==194
 r=a['payload']['dexie']['document_blobs'][0]['blob'];p=z.getinfo(r['path'])
 with z.open(p) as f: assert b'%PDF'==f.read(4)
 offset=p.header_offset+30+len(p.filename.encode())+len(p.extra)
shutil.copyfile(sys.argv[1],sys.argv[2])
with open(sys.argv[2],'r+b') as f:
 f.seek(offset);byte=f.read(1);f.seek(offset);f.write(bytes([byte[0]^255]))
`,zipPath,badPath],{encoding:'utf8'});assert.equal(validate.status,0,validate.stderr);
  await device(async page=>{
   await seed(page,empty());await page.getByRole('button',{name:/Export & Backup/}).click();
   const input=page.locator('input[type=file]').last();await input.setInputFiles(badPath);await page.getByRole('status').filter({hasText:'checksum mismatch'}).waitFor({timeout:180000});
   page.once('dialog',d=>d.dismiss());await input.setInputFiles(zipPath);await page.getByRole('status').filter({hasText:'Import cancelled'}).waitFor({timeout:180000});
   page.once('dialog',d=>d.accept());
   const imported=Promise.race([page.waitForEvent('load',{timeout:180000}),page.getByRole('status').filter({hasText:/Import failed|Error preparing|operations failed/}).waitFor({timeout:180000}).then(async()=>{throw new Error(await page.getByRole('status').innerText());})]);
   await Promise.all([imported,input.setInputFiles(zipPath)]);await page.locator('.adaptive-home-v1038, .logbook-home-screen-v988, .logbook-ui-v110').first().waitFor();
   const restored=await page.evaluate(async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onsuccess=()=>ok(r.result);});const all=name=>new Promise(ok=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>ok(r.result);});const docs=await all('document_blobs'),assets=await all('capture_asset_blobs'),snapshots=await all('app_snapshots');const state=snapshots.find(s=>s.key==='owner-op-road-ready-state-v1').state;const original=docs[0].blob instanceof Blob?docs[0].blob:new Blob([docs[0].blob.bytes],{type:docs[0].blob.type});const sample=await original.slice(0,4).text();db.close();return {count:docs.length,bytes:docs.reduce((n,d)=>n+d.blob.size,0),assets:assets.length,sample,events:state.eventsByDay['2026-09-07'],session:!!localStorage.getItem('owner-op-prototype-auth-v1')};});
   assert.equal(restored.count,194);assert.equal(restored.assets,1);assert.ok(restored.bytes>273*1048576);assert.equal(restored.sample,'%PDF');assert.equal(restored.events[0].status,'OFF');assert.equal(restored.session,true);
   const used=spawnSync('du',['-sk',dir],{encoding:'utf8'});assert.equal(used.status,0,used.stderr);assert.ok(Number(used.stdout.split(/\s/)[0])*1024<6*fs.statSync(zipPath).size,'Restore duplicated the whole ZIP per document');
   // Let the synthetic settings response finish before explicitly reloading;
   // WebKit reports an aborted fulfilled fetch as a page-level CORS error.
   await page.waitForLoadState('networkidle');
   await page.reload();await page.locator('.adaptive-home-v1038, .logbook-home-screen-v988, .logbook-ui-v110').first().waitFor();
  });
  console.log(`PASS ${name}: 194 originals / >273 MB plus scanner assets, <=1 MB binary reads, cancel, real ZIP download, independent CRC validation, damaged-file rejection, cancelled import, fresh-device ZIP restore and reload`);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,simplePdf,snapshot,protectedData} from '../v110434/browserFixture.mjs';
import {inspectTransfer} from '../../source/src/modules/backup/transferArchive.js';

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rr-export-scale-'));
const evidence='browser-test-results/date-transfer';fs.mkdirSync(evidence,{recursive:true});
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await engine.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});
 await setupRoutes(context);
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 try {
  const state=baseState();state.activeDay='2026-11-12';state.eventsByDay={};state.signatureByDay={};state.certifyStatus={};state.inspectionByDay={};state.routeLegsByDay={};state.loadInfo={};
  for(let i=0;i<140;i++){
   const date=new Date('2026-11-12T12:00:00Z');date.setUTCDate(date.getUTCDate()-139+i);const day=date.toISOString().slice(0,10),n=i<59?5:4,end=day==='2026-11-06'?1383:1440;
   state.eventsByDay[day]=Array.from({length:n},(_,j)=>({id:'event-'+i+'-'+j,status:'SB',startMin:Math.floor(end*j/n),endMin:Math.floor(end*(j+1)/n),city:'Example',state:'IL',source:'manual'}));
   state.signatureByDay[day]={signed:true,signatureDataUrl:'data:image/png;base64,AQID',certifiedContent:{events:structuredClone(state.eventsByDay[day])}};
   state.certifyStatus[day]='Certified';
  }
  state.testInstructionStore={loads:[],documents:[],fuel:[],expenses:[],maintenance:[],settlements:[]};
  const original=simplePdf('Synthetic original for scale export'),size=Math.ceil(407.97*1024*1024/389);
  await seed(page,state,[]);
  await page.evaluate(async({prefix,size})=>{
   await new Promise((resolve,reject)=>{
    const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
     const db=request.result,tx=db.transaction(['documents_local','document_blobs'],'readwrite');
     for(let i=0;i<389;i++){
      const id='scale-'+i,bytes=new Uint8Array(size);bytes.set(prefix);bytes[size-1]=i%251;
      tx.objectStore('documents_local').put({local_id:id+'-local',client_document_id:id+'-client',document_date:i>=382?'2026-11-06':'2026-06-01',original_file_name:id+'.pdf',mime_type:'application/pdf',type:'other',extracted:{rawText:'synthetic OCR text '.repeat(1800),lines:Array.from({length:200},(_,j)=>({text:'line '+j,x:j,y:j*2}))}});
      tx.objectStore('document_blobs').put({local_blob_id:id+'-blob',client_document_id:id+'-client',blob:{__roadReadyStoredBinaryV110458:1,bytes:bytes.buffer,type:'application/pdf',size}});
     }
     tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Scale fixture aborted'));
    };
   });
  },{prefix:[...original],size});
  const before=protectedData(await snapshot(page));
  await page.getByRole('button',{name:'Export & Backup',exact:true}).click();
  const panel=page.getByRole('region',{name:'Date export and Smart Import'});
  await panel.getByRole('button',{name:'Export by Date',exact:true}).click();
  await panel.getByLabel('FROM',{exact:true}).fill('2026-11-06');
  await panel.getByLabel('TO',{exact:true}).fill('2026-11-12');
  await page.evaluate(()=>{
   window.exportReadAudit=[];
   for(const method of ['getAll','get']){
    const original=IDBObjectStore.prototype[method];
    IDBObjectStore.prototype[method]=function(...args){
     if(['document_blobs','capture_asset_blobs'].includes(this.name))window.exportReadAudit.push({store:this.name,method});
     return original.apply(this,args);
    };
   }
  });
  const started=Date.now();
  await panel.getByRole('button',{name:'Export selected dates (ZIP)',exact:true}).click();
  const ready=page.getByRole('region',{name:'Backup ready to save'});await ready.waitFor({timeout:90000});
  const pending=page.waitForEvent('download');await ready.getByRole('link',{name:'Download backup',exact:true}).click();
  const download=await pending,filename=path.join(directory,name+'.zip');await download.saveAs(filename);
  const checked=await inspectTransfer(new File([fs.readFileSync(filename)],name+'.zip'));
  assert.equal(checked.data.dexie.app_snapshots.length,1);
  assert.equal(checked.data.dexie.sync_meta,undefined);
  assert.equal(checked.data.state.eventsByDay['2026-11-06'].at(-1).endMin,1383);
  for(const [day,signature]of Object.entries(checked.data.state.signatureByDay))assert.deepEqual(signature,before.signatureByDay[day]);
  assert.equal(checked.data.dexie.documents_local.length,7);
  assert.equal(checked.data.dexie.document_blobs.length,7);
  for(const row of checked.data.dexie.document_blobs){
   const id=Number(row.client_document_id.split('-')[1]),bytes=new Uint8Array(await row.blob.arrayBuffer());
   assert.equal(bytes.length,size);assert.deepEqual(bytes.slice(0,original.length),new Uint8Array(original));assert.equal(bytes.at(-1),id%251);
  }
  assert(fs.statSync(filename).size<12*1024*1024,'Unselected originals stay out of the ZIP');
  assert.deepEqual(protectedData(await snapshot(page)),before);
  const audit=await page.evaluate(()=>window.exportReadAudit);
  assert.equal(audit.filter(r=>r.method==='getAll').length,0,'Selection must use raw cursors, with no repeated binary pages');
  assert.equal(audit.filter(r=>r.method==='get').length,7,'Only the seven selected originals are decoded');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(evidence,'scale-'+name+'.png'),fullPage:true});
  console.log('PASS — '+name+': '+(Date.now()-started)+'ms; 389 originals / 407.97 MB; 140 days / 619 events; seven exact originals; single metadata scan; unchanged phone signatures');
 } finally {await browser.close();}
}
fs.rmSync(directory,{recursive:true,force:true});

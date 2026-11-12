import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,simplePdf,snapshot,protectedData} from '../v110434/browserFixture.mjs';
import {inspectTransfer} from '../../source/src/modules/backup/transferArchive.js';

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'rr-export-memory-'));
const evidence='browser-test-results/date-transfer';fs.mkdirSync(evidence,{recursive:true});
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await engine.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});
 await setupRoutes(context);
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 try {
  const state=baseState();
  state.eventsByDay={'2026-11-06':[{id:'original-signed-event',status:'SB',startMin:0,endMin:1383,source:'manual',city:'Example',state:'IL',note:'Preserve saved endpoint'}]};
  state.signatureByDay={'2026-11-06':{signed:true,signatureDataUrl:'data:image/png;base64,AQID',driverName:'Synthetic Driver'}};
  state.certifyStatus={'2026-11-06':'Certified'};state.inspectionByDay={};state.routeLegsByDay={};state.loadInfo={};
  state.testInstructionStore={loads:[{id:'load',loadNo:'82002',pickupDate:'2026-11-03',deliveryDate:'2026-11-10'}],documents:[],fuel:[],expenses:[],maintenance:[],settlements:[]};
  const original=simplePdf('Original outside the scan-date range');
  await seed(page,state,[{id:'export-original',bytes:[...original],binaryBytes:true}]);
  await page.evaluate(async()=>{
   await new Promise((resolve,reject)=>{
    const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
     const db=request.result,tx=db.transaction(['app_snapshots','sync_meta','documents_local'],'readwrite');
     // Simulate accumulated recovery copies without using any real user data.
     const payload='recovery-only-content:'.padEnd(2*1024*1024,'x');
     for(let i=0;i<16;i++)tx.objectStore('app_snapshots').put({key:'recovery-'+i,state:{payload}});
     tx.objectStore('sync_meta').put({key:'transfer-source-large-history',value:{payload}});
     const store=tx.objectStore('documents_local'),read=store.get('export-original-local');
     read.onsuccess=()=>store.put({...read.result,document_date:'2026-11-20'});
     tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };
   });
   window.exportReadAudit=[];
   const originalGetAll=IDBObjectStore.prototype.getAll;
   IDBObjectStore.prototype.getAll=function(query,count){
    if(['app_snapshots','sync_meta'].includes(this.name)){
     window.exportReadAudit.push({store:this.name,bounded:query!=null||count!=null});
     if(query==null&&count==null)throw Error('Unbounded recovery-history read during export');
    }
    return originalGetAll.apply(this,arguments);
   };
  });
  const before=protectedData(await snapshot(page));
  await page.getByRole('button',{name:'Export & Backup',exact:true}).click();
  const panel=page.getByRole('region',{name:'Date export and Smart Import'});
  await panel.getByRole('button',{name:'Export by Date',exact:true}).click();
  await panel.getByLabel('FROM',{exact:true}).fill('2026-11-03');
  await panel.getByLabel('TO',{exact:true}).fill('2026-11-10');
  await panel.getByRole('button',{name:'Export selected dates (ZIP)',exact:true}).click();
  const ready=page.getByRole('region',{name:'Backup ready to save'});await ready.waitFor({timeout:90000});
  const pending=page.waitForEvent('download');await ready.getByRole('link',{name:'Download backup',exact:true}).click();
  const download=await pending,filename=path.join(directory,name+'.zip');await download.saveAs(filename);
  const checked=await inspectTransfer(new File([fs.readFileSync(filename)],name+'.zip'));
  assert.equal(checked.data.dexie.app_snapshots.length,1);
  assert.equal(checked.data.dexie.sync_meta,undefined);
  assert.equal(checked.data.state.eventsByDay['2026-11-06'][0].endMin,1383);
  assert.deepEqual(checked.data.state.signatureByDay,before.signatureByDay);
  assert.equal(checked.data.dexie.documents_local.length,1);
  const saved=checked.data.dexie.document_blobs[0].blob;
  assert.deepEqual(new Uint8Array(await saved.arrayBuffer()),new Uint8Array(original));
  assert(fs.statSync(filename).size<1024*1024,'Recovery copies must not enter the selected-date ZIP');
  assert.deepEqual(protectedData(await snapshot(page)),before);
  assert((await page.evaluate(()=>window.exportReadAudit)).every(row=>row.bounded));
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(evidence,'memory-'+name+'.png'),fullPage:true});
  console.log('PASS — '+name+': date ZIP with 32 MB recovery history; no unbounded history read; exact original and signed intervals preserved');
 } finally {await browser.close();}
}
fs.rmSync(directory,{recursive:true,force:true});

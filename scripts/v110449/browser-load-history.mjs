import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {baseState,seed,setupRoutes,snapshot,origin} from '../v110434/browserFixture.mjs';
const loadNo='95916',day='2026-05-31';
const docs=[1,2].map(n=>({id:'support-'+n,clientDocumentId:'support-'+n,type:'other',loadNo,original_file_name:'Trailer-photo-'+n+'.jpg',fileName:'Trailer-photo-'+n+'.jpg',mime_type:'image/jpeg',reviewStatus:'needs_review',extracted:{loadNo}}));
const state={...baseState(),testInstructionStore:{loads:[{id:'archived-load',loadNo,origin:'Elgin, IL',destination:'Ohio stops + return to Elgin, IL',broker:'Example Broker',pickupDate:day,deliveryDate:'2026-06-03',documentWorkflowStage:'delivered',gross:3200,documentLibrarySource:'synthetic-archive',documentTransferDays:[day,'2026-06-01','2026-06-02','2026-06-03']}],documents:docs}};
const browser=await chromium.launch({headless:true,...(origin.startsWith('https')&&process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})}),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',ignoreHTTPSErrors:true}),page=await context.newPage(),errors=[];
await setupRoutes(context);page.on('pageerror',error=>errors.push(error.message));await page.clock.setFixedTime(new Date('2026-10-04T23:00:00Z'));
let popups=0;page.on('popup',()=>popups++);
const panel=page.getByRole('region',{name:'Documents',exact:true});
async function folder(){await page.getByRole('button',{name:'Documents',exact:true}).click();await panel.locator('.rr-docs-card').filter({hasText:'May 25'}).click();await panel.locator('.rr-docs-card').filter({hasText:'Load '+loadNo}).click();await panel.getByText('Load details',{exact:true}).click();}
try{
 if(process.env.EXPECT_SHA){const v=await(await page.request.get(origin+'/app-version.json?history='+Date.now())).json();assert.equal(v.version,'110.4.49');assert.equal(v.sourceCommit,process.env.EXPECT_SHA);}
 await seed(page,state);const before=await snapshot(page);await folder();
 await panel.getByRole('button',{name:'Open logbooks',exact:true}).click();await panel.getByRole('alert').filter({hasText:'No recorded logbook'}).waitFor();
 await panel.getByRole('button',{name:'Open mileage',exact:true}).click();await panel.getByRole('alert').filter({hasText:'No recorded mileage'}).waitFor();
 assert.equal(popups,0);assert.equal(await page.evaluate(()=>localStorage.getItem('road_ready_historical_logbook_snapshots_v2')),null);
 await panel.getByText('Supporting files to review (2)',{exact:true}).click();
 const supporting=panel.locator('details').filter({has:page.getByText('Supporting files to review (2)',{exact:true})});
 assert.equal(await supporting.locator('.rr-evidence-rows>li').count(),2);await supporting.getByText('Trailer-photo-1.jpg',{exact:true}).waitFor();
 assert.deepEqual((await snapshot(page)).eventsByDay,before.eventsByDay);
 await page.evaluate(async({day,loadNo})=>new Promise((resolve,reject)=>{const q=indexedDB.open('owner-op-road-ready-offline-v1');q.onsuccess=()=>{const db=q.result,tx=db.transaction('sync_meta','readwrite');tx.objectStore('sync_meta').put({key:'document-library:synthetic-test',value:{id:'synthetic-test',logbookLinks:[{loadNo,day,driverId:'saved-beta',basis:'exact_reference'}],logbook:[{day,driverId:'saved-beta',driverName:'Saved Beta Driver',certifyStatus:'Saved source status',events:[{status:'ON',startMin:600,endMin:615,location:'Elgin, IL',note:'Pickup / Loading'}]}]},updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}),{day,loadNo});
 await page.evaluate(()=>window.dispatchEvent(new Event('road-ready-library-imported')));
 await panel.getByRole('button',{name:'Open logbooks',exact:true}).click();
 const source=panel.getByRole('region',{name:'Linked logbooks and inspections',exact:true});
 await source.getByRole('button',{name:/Saved Beta Driver/}).click();await source.getByRole('region',{name:'Saved logbook source'}).getByRole('cell',{name:/Pickup \/ Loading/}).waitFor();
 assert.equal(popups,0);assert.deepEqual((await snapshot(page)).eventsByDay,before.eventsByDay);assert.deepEqual(errors,[]);
 console.log('PASS browser: missing historical hours/mileage show clear inline messages without blank PDFs; duplicate checks become two named source files; saved co-driver source opens with real hours and leaves active logs unchanged');
}catch(error){console.error((await page.locator('body').innerText()).slice(-7000));throw error;}finally{await browser.close();}

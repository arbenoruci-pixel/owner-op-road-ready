import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {baseState,seed,setupRoutes,snapshot,origin} from '../v110434/browserFixture.mjs';
const day='2026-10-04';
const state={...baseState(),activeDay:day,activeDriverId:'alpha',driverProfile:{name:'Alpha Driver'},teamDrivers:[{id:'alpha',name:'Alpha Driver'},{id:'beta',name:'Beta Driver'},{id:'archived',name:'Archived Driver'}],loadInfo:{},routeLegsByDay:{},formByDay:{[day]:{coDrivers:'Beta Driver'}},
 eventsByDay:{[day]:[{id:'alpha-rest',status:'SB',startMin:0,endMin:1440,city:'Harvey',state:'IL',note:'Sleeper berth',source:'manual'}]},manualMilesByDay:{[day]:100},
 teamLogbooksByDriverId:{beta:{activeDay:day,eventsByDay:{[day]:[{id:'beta-work',status:'ON',startMin:600,endMin:615,city:'Harvey',state:'IL',note:'Pickup / Loading',source:'manual'}]},manualMilesByDay:{[day]:250},signatureByDay:{},formByDay:{[day]:{coDrivers:'Alpha Driver'}},inspectionByDay:{},certifyStatus:{}}},testInstructionStore:{loads:[],documents:[]}};
const browser=await chromium.launch({headless:true,...(origin.startsWith('https')&&process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',ignoreHTTPSErrors:true}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));await setupRoutes(context);await page.clock.setFixedTime(new Date('2026-10-04T16:00:00Z'));
async function form(){const tab=page.getByRole('button',{name:'Form',exact:true}),open=page.getByRole('button',{name:'Open logbook',exact:true});await tab.or(open).first().waitFor();if(!await tab.isVisible())await open.click({timeout:5000}).catch(async error=>{if(!await tab.isVisible())throw error;});await tab.click();await page.locator('.road-paper-form').waitFor();}
async function edit(value){page.once('dialog',dialog=>dialog.accept(value));await page.locator('.road-form-row').filter({has:page.locator('.road-form-label',{hasText:'Co-Drivers'})}).click();await page.waitForFunction(async({value,day})=>new Promise(resolve=>{const q=indexedDB.open('owner-op-road-ready-offline-v1');q.onsuccess=()=>{const db=q.result,r=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');r.onsuccess=()=>{db.close();resolve(r.result?.state?.formByDay?.[day]?.coDrivers===value);};};}),{value,day});}
try{
 if(process.env.EXPECT_SHA){const v=await(await page.request.get(origin+'/app-version.json?formteam='+Date.now())).json();assert.equal(v.version,'110.4.48');assert.equal(v.sourceCommit,process.env.EXPECT_SHA);}
 await seed(page,state);await form();await page.getByRole('button',{name:'Open team drivers',exact:true}).click();
 assert.equal(await page.locator('.team-driver-list').getByRole('button',{name:/Archived Driver/}).count(),0);
 await edit('');await page.locator('.team-driver-shell').waitFor({state:'detached'});
 const removed=await snapshot(page);assert.deepEqual(removed.teamLogbooksByDriverId.beta,state.teamLogbooksByDriverId.beta);assert.equal(removed.teamDrivers.length,3);
 await page.reload();await form();assert.equal(await page.locator('.team-driver-shell').count(),0);
 await edit('Beta Driver');await page.locator('.team-driver-shell').waitFor();
 await page.getByRole('button',{name:'Open team drivers',exact:true}).click();await page.locator('.team-driver-list').getByRole('button',{name:/Beta Driver/}).click();await form();
 let current=await snapshot(page);assert.equal(current.activeDriverId,'beta');assert.equal(current.manualMilesByDay[day],250);assert.ok(current.eventsByDay[day].some(e=>e.id==='beta-work'));
 await page.getByRole('button',{name:'Open team drivers',exact:true}).click();await page.locator('.team-driver-list').getByRole('button',{name:/Alpha Driver/}).click();await form();
 await edit('New Driver');await page.getByRole('button',{name:'Open team drivers',exact:true}).click();
 assert.equal(await page.locator('.team-driver-list').getByRole('button',{name:/Beta Driver/}).count(),0);await page.locator('.team-driver-list').getByRole('button',{name:/New Driver/}).waitFor();
 current=await snapshot(page);assert.equal(current.teamDrivers.length,4);assert.equal(current.manualMilesByDay[day],100);assert.equal(current.teamLogbooksByDriverId.beta.manualMilesByDay[day],250);assert.deepEqual(errors,[]);
 console.log('PASS browser: remove in Form hides switch immediately and after reload; re-add reuses saved driver and switches both ways; new Form driver appears; archived drivers stay out; duty and mileage preserved');
}catch(error){console.error((await page.locator('body').innerText()).slice(-6500));throw error;}finally{await browser.close();}

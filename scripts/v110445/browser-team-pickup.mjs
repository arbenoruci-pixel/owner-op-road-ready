import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,snapshot,origin} from '../v110434/browserFixture.mjs';
const day='2026-09-30',delDay='2026-10-01';
const pickup={id:'beta-pickup',status:'ON',startMin:1057,endMin:1072,city:'Harvey',state:'IL',destination:'East Haven, CT',shippingDocs:'LOAD-987654',note:'Pickup / Loading',source:'manual'};
const delivery={id:'alpha-delivery',status:'ON',startMin:500,endMin:530,city:'East Haven',state:'CT',shippingDocs:'LOAD-987654',note:'Delivery / Unloading',source:'manual'};
const state={...baseState(),activeDay:day,activeDriverId:'alpha',driverProfile:{name:'Alpha Driver'},teamDrivers:[{id:'alpha',name:'Alpha Driver'},{id:'beta',name:'Beta Driver'}],loadInfo:{},
 eventsByDay:{[day]:[{id:'alpha-rest',status:'SB',startMin:0,endMin:1440,city:'Harvey',state:'IL',note:'Sleeper berth',source:'manual'}],[delDay]:[delivery]},manualMilesByDay:{[day]:100},
 teamLogbooksByDriverId:{beta:{activeDay:day,eventsByDay:{[day]:[pickup]},manualMilesByDay:{[day]:250},signatureByDay:{},formByDay:{},inspectionByDay:{},certifyStatus:{}}},
 routeLegsByDay:{[day]:[{id:'manual-plan',day,pickupDay:day,fromCity:'Harvey',fromState:'IL',toCity:'East Haven',toState:'CT',shippingDocs:'803',kind:'loaded',source:'manual_form',status:'open'}]},
 testInstructionStore:{loads:[{id:'test-load',loadNo:'LOAD-987654',pickupDate:day,broker:'Example Broker',origin:'Harvey, IL',destination:'East Haven, CT'}],evidenceAliases:[{from:'81835803',to:'LOAD-987654'}],documents:[]}};
async function form(page,selected=day){
 if(await page.getByRole('button',{name:'Open logbook',exact:true}).count())await page.getByRole('button',{name:'Open logbook',exact:true}).click();
 for(let n=0;n<10;n++){
  const saved=await snapshot(page);if(saved.activeDay===selected)break;
  await page.getByRole('button',{name:saved.activeDay>selected?'‹ Day':'Day ›',exact:true}).click();
  for(let i=0;i<60;i++){if((await snapshot(page)).activeDay!==saved.activeDay)break;await page.waitForTimeout(50);}
 }
 await page.getByRole('button',{name:'Form',exact:true}).click();await page.locator('.road-paper-form').waitFor();
}
async function unchanged(page){const s=await snapshot(page);assert.equal(s.manualMilesByDay[day],100);assert.equal(s.teamLogbooksByDriverId.beta.manualMilesByDay[day],250);assert.ok(!Object.values(s.eventsByDay).flat().some(e=>e.id===pickup.id));const p=s.teamLogbooksByDriverId.beta.eventsByDay[day].find(e=>e.id===pickup.id);for(const key of ['startMin','endMin','status'])assert.equal(p[key],pickup[key]);return s;}
for(const [name,engine] of process.env.CHROMIUM_ONLY ? [['chromium',chromium]] : [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(origin.startsWith('https')&&process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',ignoreHTTPSErrors:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await setupRoutes(context);await page.clock.setFixedTime(new Date('2026-10-04T16:00:00Z'));
 try{
  if(process.env.EXPECT_SHA){const version=await(await page.request.get(origin+'/app-version.json?team='+Date.now())).json();assert.equal(version.version,'110.4.47');assert.equal(version.sourceCommit,process.env.EXPECT_SHA);}
  await seed(page,structuredClone(state));await form(page);
  const route=page.getByRole('button',{name:/Harvey, IL.*East Haven, CT/}).first();await route.waitFor();
  assert.match(await route.innerText(),/In transit.*Pickup by Beta Driver/);assert.doesNotMatch(await route.innerText(),/no pickup recorded/);await unchanged(page);
  await page.reload();await page.locator('.team-driver-shell').waitFor();await form(page);assert.match(await route.innerText(),/Pickup by Beta Driver/);await unchanged(page);
  await page.getByRole('button',{name:'Open team drivers',exact:true}).click();await page.locator('.team-driver-list').getByRole('button',{name:/Beta Driver/}).click();await form(page);assert.match(await route.innerText(),/In transit/);assert.doesNotMatch(await route.innerText(),/no pickup recorded/);
  await page.getByRole('button',{name:'Open team drivers',exact:true}).click();await page.locator('.team-driver-list').getByRole('button',{name:/Alpha Driver/}).click();await form(page);
  await form(page,delDay);assert.match(await route.innerText(),/Done.*Pickup by Beta Driver/);
  await form(page,'2026-10-02');assert.equal(await page.getByRole('button',{name:/Harvey, IL.*East Haven, CT/}).count(),0);
  await unchanged(page);assert.deepEqual(errors,[]);fs.mkdirSync('browser-test-results/team-pickup-v110445',{recursive:true});await page.screenshot({path:'browser-test-results/team-pickup-v110445/'+name+'.png',fullPage:true});
  console.log('PASS '+name+': Form recognizes co-driver pickup, reload and driver switch retain it, delivery closes it, following day hides it, original duty and mileage stay separate');
 }catch(e){console.error((await page.locator('body').innerText()).slice(-9000));throw e;}finally{await browser.close();}
}

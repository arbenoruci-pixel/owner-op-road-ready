import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
import {addTeamDriver,switchTeamDriver} from '../../source/src/core/team/teamLogbook.js';
const day='2026-09-28',pickupDay='2026-09-27',deliveryDay='2026-09-29',after='2026-09-30';
const output='browser-test-results/team-freight-v110423';fs.mkdirSync(output,{recursive:true});
const rows=(prefix,miles)=>[{id:prefix+'-sleep',status:'SB',startMin:0,endMin:600,city:'Columbus',state:'OH',note:'Sleeper berth',source:'manual'},{id:prefix+'-drive',status:'D',startMin:600,endMin:1000,city:'Columbus',state:'OH',note:'Driving',source:'manual',manualMiles:miles},{id:prefix+'-off',status:'OFF',startMin:1000,endMin:1440,city:'Columbus',state:'OH',note:'Off Duty',source:'manual'}];
const pickup={id:'beta-pickup',status:'ON',startMin:500,endMin:540,city:'Broadview Heights',state:'OH',note:'Pickup / Loading',source:'manual',shippingDocs:'BOL-TEST'};
const delivery={id:'alpha-delivery',status:'ON',startMin:500,endMin:530,city:'Chicago',state:'IL',note:'Delivery / Unloading',source:'manual',shippingDocs:'BOL-TEST'};
let team=addTeamDriver({...baseState(),view:'logbook',activeDay:day,driverProfile:{name:'Alpha Driver'},manualMilesByDay:{[day]:300},eventsByDay:{[day]:rows('alpha',300),[deliveryDay]:[delivery]},signatureByDay:{},inspectionByDay:{},formByDay:{},loadInfo:{loadNo:'BOL-TEST',shippingDocs:'BOL-TEST',sourceEventId:pickup.id,sourceEventDay:pickupDay},routeLegsByDay:{[pickupDay]:[{id:'freight-1',day:pickupDay,pickupDay,pickupEventId:pickup.id,pickupMin:500,kind:'loaded',status:'open',shippingDocs:'BOL-TEST',fromCity:'Columbus',fromState:'OH',toCity:'Chicago',toState:'IL',miles:700}]},loadGuidesById:{},activeLoadGuideId:''},'Beta Driver',day);
const alpha=team.activeDriverId,beta=team.teamDrivers[1].id;
const other=switchTeamDriver(team,beta,day);team=switchTeamDriver({...other,manualMilesByDay:{[day]:225},eventsByDay:{[pickupDay]:[pickup],[day]:rows('beta',225)}},alpha,day);
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots','readonly').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{resolve(q.result?.state);db.close();};};}));}
async function waitState(page,predicate){for(let n=0;n<100;n++){const s=await stored(page);if(predicate(s))return s;await page.waitForTimeout(100);}throw Error('Saved state did not converge');}
async function form(page,selected){if(await page.getByRole('button',{name:'Open logbook',exact:true}).count())await page.getByRole('button',{name:'Open logbook',exact:true}).click();for(let n=0;n<10;n++){const s=await stored(page);if(s.activeDay===selected)break;await page.getByRole('button',{name:s.activeDay>selected?'‹ Day':'Day ›',exact:true}).click();await waitState(page,next=>next?.activeDay!==s.activeDay);}await page.getByRole('button',{name:'Form',exact:true}).click();await page.locator('.road-paper-form').waitFor();}
async function switchDriver(page,name,id){await page.getByRole('button',{name:'Open team drivers',exact:true}).click();await page.locator('.team-driver-list').getByRole('button',{name:new RegExp(name)}).click();await waitState(page,s=>s?.activeDriverId===id);}
for(const[name,engine]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});
 try{
  for(const selected of [day,deliveryDay,after]){
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-09-30T16:00:00Z'));await setupRoutes(context);
   try{
    await seed(page,{...structuredClone(team),activeDay:selected});await form(page,selected);
    const paper=page.locator('.road-paper-form');
    if(selected!==after){
     const routeButton=page.getByRole('button',{name:/Broadview Heights, OH.*Chicago, IL/}).first();await routeButton.waitFor();
     let promptIndex=0;const answers=['Philadelphia, PA','Chicago, IL','BOL-TEST'];const dialog=d=>d.accept(answers[promptIndex++]);page.on('dialog',dialog);await routeButton.click();await waitState(page,s=>s?.routeLegsByDay?.[pickupDay]?.some(l=>l.freightOriginOverride?.city==='Philadelphia'));page.off('dialog',dialog);assert.equal(promptIndex,3);
     await page.getByRole('button',{name:/Philadelphia, PA.*Chicago, IL/}).first().waitFor();assert.match(await paper.innerText(),/BOL-TEST/);
     const corrected=await stored(page);assert.equal(corrected.teamLogbooksByDriverId[beta].eventsByDay[pickupDay][0].city,'Broadview Heights');
     await page.reload();await page.locator('.team-driver-shell').waitFor();await form(page,selected);await page.getByRole('button',{name:/Philadelphia, PA.*Chicago, IL/}).first().waitFor();
    }
    else{assert.doesNotMatch(await paper.innerText(),/BOL-TEST|Philadelphia/);}
    if(selected===day){assert.match(await paper.getByRole('button',{name:/^Distance/}).innerText(),/300.00 mi/);page.once('dialog',d=>d.accept('333'));await paper.getByRole('button',{name:/^Distance/}).click();await waitState(page,s=>s?.manualMilesByDay?.[day]===333);await switchDriver(page,'Beta Driver',beta);await form(page,selected);assert.match(await paper.getByRole('button',{name:/^Distance/}).innerText(),/225.00 mi/);page.once('dialog',d=>d.accept('244'));await paper.getByRole('button',{name:/^Distance/}).click();await waitState(page,s=>s?.manualMilesByDay?.[day]===244);await page.reload();await page.locator('.team-driver-shell').waitFor();await form(page,selected);assert.match(await paper.getByRole('button',{name:/^Distance/}).innerText(),/244.00 mi/);await switchDriver(page,'Alpha Driver',alpha);await form(page,selected);assert.match(await paper.getByRole('button',{name:/^Distance/}).innerText(),/333.00 mi/);const saved=await stored(page);assert.deepEqual(saved.eventsByDay[day],team.eventsByDay[day]);assert.equal(saved.teamLogbooksByDriverId[beta].manualMilesByDay[day],244);}
    else{await switchDriver(page,'Beta Driver',beta);await form(page,selected);if(selected===after)assert.doesNotMatch(await paper.innerText(),/BOL-TEST|Philadelphia/);else {assert.match(await paper.innerText(),/BOL-TEST/);await page.getByRole('button',{name:/Philadelphia, PA.*Chicago, IL/}).first().waitFor();}}
    assert.deepEqual(errors,[]);await page.screenshot({path:`${output}/${name}-${selected}.png`,fullPage:true});console.log(`PASS — ${name} ${selected}: driver mileage and day-scoped freight form`);
   }catch(e){console.error(await page.locator('body').innerText());await page.screenshot({path:`${output}/${name}-${selected}-failed.png`,fullPage:true});throw e;}finally{await context.close();}
  }
 }finally{await browser.close();}
}

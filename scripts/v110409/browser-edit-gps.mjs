// All records, locations and accounts are synthetic; network writes intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
const output='browser-test-results/edit-gps-v110409';fs.mkdirSync(output,{recursive:true});
const day='2026-09-25',today='2026-09-26';
const row=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,source:'manual',city:'Chicago',state:'IL',note:status==='ON'?'Waiting':status==='SB'?'Sleeper Berth':status==='D'?'Driving':'Off Duty',...extra});
function fixture(){return {...baseState(),view:'logbook',activeDay:today,currentStatus:'SB',currentReason:'Sleeper Berth',activeDriverId:'a',teamDrivers:[{id:'a',name:'Synthetic Driver'},{id:'b',name:'Inactive Driver'}],teamLogbooksByDriverId:{b:{eventsByDay:{[day]:[row('inactive','OFF',0,1440)]},signatureByDay:{},formByDay:{[day]:{driverName:'Inactive Driver'}}}},eventsByDay:{[day]:[row('off','OFF',0,300),row('on','ON',300,400),row('drive','D',400,500),row('sleep','SB',500,1440)],[today]:[row('live','SB',0,1,{source:'live_status'})]},routeLegsByDay:{},loadInfo:{},loadGuidesById:{},formByDay:{[day]:{driverName:'Recorded Driver'}},signatureByDay:{[day]:{signed:true,signatureDataUrl:'original-test-signature'}},certifyStatus:{[day]:'Certified'},inspectionByDay:{},testInstructionStore:{}};}
const snapshot=page=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots','readonly').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};q.onerror=()=>{db.close();reject(q.error);};};}));
async function stored(page,predicate){for(let i=0;i<100;i++){const s=await snapshot(page);if(s&&predicate(s))return s;await page.waitForTimeout(100);}throw new Error('Persistence timeout');}
async function openLog(page){await page.locator('.drive-mode-log-btn, .logbook-ui-v110 .log-graph-v110').first().waitFor();if(await page.locator('.drive-mode-log-btn').isVisible())await page.locator('.drive-mode-log-btn').click();await page.locator('.logbook-ui-v110 .log-graph-v110').waitFor();}
async function begin(page){await seed(page,fixture());await page.getByRole('button',{name:'Open logbook',exact:true}).click();await openLog(page);}
async function selectTwo(page){await page.locator('.graph-action-rail').getByRole('button',{name:'Select',exact:true}).click();for(const id of ['on','drive'])await page.locator(`[data-log-event-id="${id}"] .event-check`).check();await page.getByRole('button',{name:'Move selected',exact:true}).click();}
async function gpsMock(context){await context.addInitScript(()=>{
 window.__gpsMode='permission';window.__gpsWatches={};window.__gpsRequests=[];
 Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(ok,fail,options){const id=window.__gpsRequests.length+1;window.__gpsRequests.push({id,options,ok});window.__gpsWatches[id]=true;const mode=window.__gpsMode;
 setTimeout(()=>{if(mode==='permission')fail({code:1});if(mode==='timeout')fail({code:3});if(mode==='unknown')ok({coords:{latitude:70,longitude:-150,accuracy:8},timestamp:Date.now()});if(mode==='good')ok({coords:{latitude:41.8781,longitude:-87.6298,accuracy:8},timestamp:Date.now()});if(mode==='coarse'){ok({coords:{latitude:41.8781,longitude:-87.6298,accuracy:700},timestamp:Date.now()});fail({code:2});}},20);return id;},clearWatch(id){delete window.__gpsWatches[id];}}});
 window.__deliverLateGps=()=>window.__gpsRequests.at(-1).ok({coords:{latitude:41.8781,longitude:-87.6298,accuracy:8},timestamp:Date.now()});
 });}
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await engine.launch({headless:true});
 try {
  for(const scenario of ['bulk','insert','edit','status']) {
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/Chicago',serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   try {
    await setupRoutes(context);await gpsMock(context);
    let reverseCalls=0;
    await context.route('**/api/location/reverse?*',route=>{reverseCalls++;return route.fulfill({json:route.request().url().includes('lat=70')?{city:'',state:'AK',source:'us-census-state-only'}:{city:'Chicago',state:'IL',source:'us-census'}});});
    await page.clock.setFixedTime(new Date('2026-09-26T14:00:00Z'));
    await begin(page);
    if(scenario==='bulk') {
     await page.getByRole('button',{name:'‹ Day',exact:true}).click();
     const before=await stored(page,s=>s.activeDay===day);
     await selectTwo(page);const panel=page.getByRole('region',{name:'Move selected events'});
     await panel.getByRole('spinbutton',{name:'Move hours'}).fill('1');await panel.getByRole('spinbutton',{name:'Move minutes'}).fill('30');
     assert.equal(await panel.locator('.bulk-preview-total').innerText(),'1h 30m later');
     assert.match(await panel.locator('[data-shift-preview-id="off"]').innerText(),/Neighbor/);
     assert.deepEqual((await snapshot(page)).eventsByDay,before.eventsByDay,'Preview cannot persist changes');
     await page.screenshot({path:`${output}/${name}-bulk-preview.png`,fullPage:true});
     await panel.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual((await snapshot(page)).eventsByDay,before.eventsByDay);
     await selectTwo(page);await panel.getByRole('button',{name:'← Earlier',exact:true}).click();await panel.getByRole('spinbutton',{name:'Move hours'}).fill('10');await panel.getByRole('spinbutton',{name:'Move minutes'}).fill('0');
     assert.equal(await panel.locator('.bulk-preview-total').innerText(),'4h 59m earlier');assert.match(await panel.locator('.bulk-limit').innerText(),/Requested 10h earlier/);
     await panel.getByRole('button',{name:'Reset',exact:true}).click();await panel.getByRole('spinbutton',{name:'Move hours'}).fill('1');await panel.getByRole('spinbutton',{name:'Move minutes'}).fill('30');
     await panel.getByRole('button',{name:'Apply 1h 30m later',exact:true}).click();
     const applied=await stored(page,s=>s.eventsByDay[day].find(e=>e.id==='on')?.startMin===390);
     assert.equal(applied.logbookEditHistoryByDay[day].length,(before.logbookEditHistoryByDay?.[day]?.length||0)+1);
     assert.deepEqual(applied.signatureByDay,before.signatureByDay);assert.deepEqual(applied.formByDay,before.formByDay);assert.deepEqual(applied.teamLogbooksByDriverId.b,before.teamLogbooksByDriverId.b);assert.deepEqual(applied.eventsByDay[today],before.eventsByDay[today]);
     await page.locator('.change-undo-bar').getByRole('button',{name:'Undo',exact:true}).click();await stored(page,s=>s.eventsByDay[day].find(e=>e.id==='on')?.startMin===300);
     await selectTwo(page);await panel.getByRole('button',{name:'Preview 60 minutes later',exact:true}).click();await panel.getByRole('button',{name:'Apply 1h later',exact:true}).click();
     await stored(page,s=>s.eventsByDay[day].find(e=>e.id==='on')?.startMin===360);await page.reload();await openLog(page);
     assert.equal((await snapshot(page)).eventsByDay[day].find(e=>e.id==='on').startMin,360);
     await page.locator('.graph-action-rail').getByRole('button',{name:'Select',exact:true}).click();await panel.getByRole('button',{name:'All day',exact:true}).click();await panel.getByRole('button',{name:'Move selected',exact:true}).click();await panel.getByRole('button',{name:'Preview 5 minutes later',exact:true}).click();assert.match(await panel.innerText(),/midnight stays fixed/);
     for(const width of [320,820]) {await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px horizontal overflow`);}
     await page.screenshot({path:`${output}/${name}-tablet-preview.png`,fullPage:true});await panel.getByRole('button',{name:'Cancel',exact:true}).click();
    } else {
     if(scenario==='insert')await page.getByRole('button',{name:'Insert',exact:true}).click();
     if(scenario==='edit'){await page.locator('[data-log-event-id="live"]').click();await page.getByRole('button',{name:'Edit selected event',exact:true}).click();}
     if(scenario==='status')await page.getByRole('button',{name:'Status',exact:true}).click();
     const input=page.getByRole('textbox',{name:'Location',exact:true});await input.waitFor();
     await page.getByRole('button',{name:'Use GPS location',exact:true}).click();await page.getByText('Location permission is off.',{exact:false}).waitFor();
     await page.evaluate(()=>window.__gpsMode='timeout');await page.getByRole('button',{name:'Retry GPS',exact:true}).click();await page.getByText('Location took too long.',{exact:false}).waitFor();
     await page.evaluate(()=>window.__gpsMode='coarse');await page.getByRole('button',{name:'Retry GPS',exact:true}).click();await page.getByText('GPS is approximate',{exact:false}).waitFor();
     await page.evaluate(()=>window.__gpsMode='good');await page.getByRole('button',{name:'Retry GPS',exact:true}).click();await page.getByText('GPS found · Chicago, IL',{exact:false}).waitFor();assert.equal(await input.inputValue(),'Chicago, IL');assert.equal(reverseCalls,1);
     await page.evaluate(()=>window.__gpsMode='late');await page.getByRole('button',{name:'Retry GPS',exact:true}).click();await page.getByRole('button',{name:'Cancel GPS',exact:true}).click();await page.evaluate(()=>window.__deliverLateGps());assert.equal(await input.inputValue(),'Chicago, IL');
     await page.getByRole('button',{name:'Retry GPS',exact:true}).click();await input.fill('Manual Town, TX');await page.evaluate(()=>window.__deliverLateGps());await input.blur();assert.equal(await input.inputValue(),'Manual Town, TX');
     assert.equal(await page.evaluate(()=>Object.keys(window.__gpsWatches).length),0);
     assert(await page.evaluate(()=>window.__gpsRequests.every(r=>r.options.maximumAge===0&&r.options.enableHighAccuracy)));
     await page.evaluate(()=>window.__gpsMode='unknown');await page.getByRole('button',{name:'Retry GPS',exact:true}).click();await page.getByText('Position found, but the city is unavailable.',{exact:false}).waitFor();assert.equal(await input.inputValue(),'Manual Town, TX');await page.evaluate(()=>window.__gpsMode='late');
     await page.screenshot({path:`${output}/${name}-${scenario}-manual-location.png`,fullPage:true});
     if(scenario==='edit') {
      await page.getByRole('button',{name:'Save details',exact:true}).click();const saved=await stored(page,s=>s.eventsByDay[today].some(e=>e.id==='live'&&e.city==='Manual Town'));
      assert.equal(saved.eventsByDay[today].find(e=>e.id==='live').lat ?? null,null);
      await page.getByRole('button',{name:'‹ Day',exact:true}).click();await page.locator('[data-log-event-id="on"]').click();await page.getByRole('button',{name:'Edit selected event',exact:true}).click();
      const requested=await page.evaluate(()=>window.__gpsRequests.length);let prompt='';page.once('dialog',async dialog=>{prompt=dialog.message();await dialog.dismiss();});await page.getByRole('button',{name:'Use GPS location',exact:true}).click();assert.match(prompt,/recorded event/);assert.equal(await page.evaluate(()=>window.__gpsRequests.length),requested);
      page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Use GPS location',exact:true}).click();await page.getByRole('button',{name:'Cancel GPS',exact:true}).waitFor();await page.locator('.sheet-head button').first().click();assert.equal(await page.evaluate(()=>Object.keys(window.__gpsWatches).length),0);await page.evaluate(()=>window.__deliverLateGps());
     }
     if(scenario==='insert') {
      await page.locator('.editor-compact-v111 .save-main').click();const saved=await stored(page,s=>s.eventsByDay[today].some(e=>e.id!=='live'&&e.city==='Manual Town'));
      assert.equal(saved.eventsByDay[today].find(e=>e.id!=='live'&&e.city==='Manual Town').locationSource,'manual');
     }
    }
    assert.deepEqual(errors,[]);console.log(`PASS — ${name}: ${scenario}`);
   } catch(error) {await page.screenshot({path:`${output}/${name}-${scenario}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-${scenario}-failure.txt`,await page.locator('body').innerText().catch(()=>''));throw error;} finally {await context.close();}
  }
 } finally {await browser.close();}
}

// Synthetic account and isolated IndexedDB only. Account/API writes are blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,origin} from '../v110328/browserFixture.mjs';
import {createCertificationRecord,certificationStatusV1032} from '../../source/src/modules/logbook/certificationV110.js';
const output='browser-test-results/gps-sign-v110421';fs.mkdirSync(output,{recursive:true});
const days=['2026-09-26','2026-09-27','2026-09-28'],today='2026-09-29';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=';
const row=(id,end=1440)=>({id,status:'OFF',startMin:0,endMin:end,city:'Newark',state:'DE',note:'Off Duty',source:'manual'});
function fixture(){
  const s={...baseState(),view:'logbook',activeDay:today,eventsByDay:Object.fromEntries([...days.map(d=>[d,[row(d)]]),[today,[row('live',1)]]]),routeLegsByDay:{},loadInfo:{},loadGuidesById:{},testInstructionStore:{},signatureByDay:{},certifyStatus:{},formByDay:{},inspectionByDay:{},driverSignature:{dataUrl:png,driverName:'Synthetic Driver'},currentStatus:'OFF',currentLocation:{city:'Newark',state:'DE'}};
  for(const day of days){s.signatureByDay[day]={...createCertificationRecord(s,day,{now:100,driverName:'Synthetic Driver'}),needsRecertification:true,changedAfterSignAt:200,integrityRepairReason:'Test prior repair'};s.certifyStatus[day]='Needs Recertification';}
  return s;
}
const snapshot=page=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state)};q.onerror=()=>reject(q.error);};}));
async function stored(page,predicate){for(let i=0;i<100;i++){const s=await snapshot(page);if(s&&predicate(s))return s;await page.waitForTimeout(100);}throw Error('Persistence timed out');}
const reports=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
  const browser=await engine.launch({headless:true});
  try {for(const scenario of ['sign','gps-dot']) {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',timezoneId:'America/New_York'});
    const page=await context.newPage(),errors=[],dialogs=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
    try {
      await setupRoutes(context);
      await context.route('**/api/location/reverse?*',route=>route.fulfill({json:{city:'',state:'DE',source:'us-census-state-only',subdivision:'Newark'}}));
      await context.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(ok){setTimeout(()=>ok({coords:{latitude:39.661,longitude:-75.738,accuracy:8},timestamp:Date.now()}),25);return 1;},clearWatch(){}}}));
      await page.clock.setFixedTime(new Date('2026-09-29T16:51:00Z'));
      const original=fixture();await seed(page,original);
      if(scenario==='sign') {
        await page.getByRole('button',{name:'Open logbook',exact:true}).click();
        await page.getByRole('button',{name:'Back',exact:true}).click();
        await page.getByRole('button',{name:'Unsigned',exact:true}).click();await page.locator('.unsigned-sign-all').waitFor();
        const before=await snapshot(page);
        await page.locator('.unsigned-sign-btn').first().click();
        await stored(page,s=>days.filter(d=>s.certifyStatus[d]==='Certified').length===1);
        await page.getByRole('button',{name:'Sign listed logs with saved signature',exact:true}).click();
        await page.getByText('No unsigned completed logs',{exact:true}).waitFor();
        const signed=await stored(page,s=>days.every(d=>s.certifyStatus[d]==='Certified'));
        for(const day of days){assert.equal(certificationStatusV1032(signed,day).status,'Certified');assert.equal(signed.signatureByDay[day].needsRecertification,undefined);assert.equal(signed.signatureByDay[day].certificationHistory.at(-1).signedAt,100);assert.deepEqual(signed.eventsByDay[day],before.eventsByDay[day]);}
        await page.screenshot({path:`${output}/${name}-signed.png`,fullPage:true});
        await page.reload();await page.locator('.logbook-home-screen-v988, .logbook-ui-v110, .unsigned-screen').first().waitFor();
        const reopened=await stored(page,s=>days.every(d=>s.certifyStatus[d]==='Certified'));
        for(const day of days)assert.equal(certificationStatusV1032(reopened,day).status,'Certified');
      } else {
        await page.getByRole('button',{name:'Open logbook',exact:true}).click();await page.getByRole('button',{name:'Status',exact:true}).click();
        await page.getByRole('button',{name:'ON',exact:true}).click();
        await page.getByRole('button',{name:'DOT Inspection',exact:true}).click();
        assert.equal(await page.getByRole('button',{name:'DOT Inspection',exact:true}).getAttribute('aria-pressed'),'true');
        await page.getByRole('button',{name:'Use GPS location',exact:true}).click();
        await page.getByText('Nearby city',{exact:false}).waitFor();
        const location=await page.getByRole('textbox',{name:'Location',exact:true}).inputValue();assert.match(location,/, DE$/);assert.doesNotMatch(location,/GPS|Stop City/);
        await page.screenshot({path:`${output}/${name}-dot-gps.png`,fullPage:true});
        await page.getByRole('button',{name:'Save ON',exact:true}).click();
        const saved=await stored(page,s=>s.eventsByDay[today].some(e=>e.note?.includes('DOT Inspection')));
        const event=saved.eventsByDay[today].find(e=>e.note?.includes('DOT Inspection'));
        assert.equal(event.status,'ON');assert.equal(event.lat,39.661);assert.equal(event.lng,-75.738);assert.equal(event.gpsAccuracy,8);assert.equal(event.state,'DE');assert.match(event.locationSource,/nearest-city/);
        assert.equal(saved.inspectionByDay[today]?.complete ?? false,false,'DOT Inspection cannot mark pre-trip complete');
        assert(!dialogs.some(d=>/complete today.s inspection/i.test(d)),'DOT activity must not offer to complete pre-trip');
        assert.equal(saved.currentTrailer,original.currentTrailer);
        await page.reload();await page.locator('.logbook-home-screen-v988, .logbook-ui-v110').first().waitFor();
        const reopened=await stored(page,s=>s.eventsByDay[today].some(e=>e.id===event.id));assert.deepEqual(reopened.eventsByDay[today].find(e=>e.id===event.id),event);
      }
      assert.deepEqual(errors,[]);reports.push({browser:name,scenario,origin,passed:true,pageErrors:errors});console.log(`PASS — ${name}: ${scenario}`);
    } catch(error) {await page.screenshot({path:`${output}/${name}-${scenario}-failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-${scenario}-failure.txt`,JSON.stringify({error:String(error),dialogs,text:await page.locator('body').innerText().catch(()=>''),state:await snapshot(page).catch(()=>null)},null,2));throw error;}
    finally {await context.close();}
  }} finally {await browser.close();}
}
fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2)+'\n');

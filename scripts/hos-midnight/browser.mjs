import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {origin,baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';

assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),
  'HOS fixtures run only against a local app, never a driver account');
const output='browser-test-results/hos-midnight';
fs.mkdirSync(output,{recursive:true});
const day='2026-11-06',nextDay='2026-11-07';
const event=(status,startMin,endMin,index)=>({id:`hos-fixture-${index}`,status,startMin,endMin,
  city:'Example City',state:'IL',source:'live_status',note:status});
const rows=[['SB',0,421],['ON',421,437],['D',437,466],['ON',466,529],
  ['D',529,602],['SB',602,756],['ON',756,771],['D',771,978],
  ['OFF',978,1008],['D',1008,1353],['SB',1353,1440]]
  .map((row,index)=>event(...row,index));
const makeState=(minute=1)=>({...baseState(),view:'home',activeDay:nextDay,
  currentStatus:'SB',currentReason:'Sleeper Berth',eventsByDay:{
    [day]:structuredClone(rows),[nextDay]:[event('SB',0,minute,'next-rest')],
  },signatureByDay:{[day]:{signed:true,marker:'preserve-synthetic-signature'}},
  certifyStatus:{[day]:'Needs signature',[nextDay]:'Active day / Not certified yet'},
  inspectionByDay:{},formByDay:{},routeLegsByDay:{},loadInfo:{},
  loadGuidesById:{},activeLoadGuideId:'',testInstructionStore:{}});

async function snapshot(page) {
  return page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('owner-op-road-ready-offline-v1');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,query=db.transaction('app_snapshots','readonly')
        .objectStore('app_snapshots').get('owner-op-road-ready-state-v1');
      query.onsuccess=()=>{db.close();resolve(query.result?.state);};
      query.onerror=()=>{db.close();reject(query.error);};
    };
  }));
}

async function openHome(page) {
  const home=page.locator('.rr-driver-home, .adaptive-home-v1038').first();
  if(!await home.isVisible().catch(()=>false)) {
    const button=page.getByRole('button',{name:/Home/i}).first();
    await button.waitFor({timeout:30000});await button.click();
  }
  await home.waitFor({timeout:30000});
}

for(const name of (process.env.BROWSER_ENGINE||'chromium').split(',')) {
  const browser=await ({chromium,webkit})[name].launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},
    isMobile:true,hasTouch:true,timezoneId:'America/New_York',serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try {
    await setupRoutes(context);
    await page.clock.install({time:new Date('2026-11-07T10:58:00Z')});
    await seed(page,makeState(358),[],{navigateHome:false});
    await openHome(page);
    await page.getByRole('button',{name:'Drive',exact:true}).click();
    await page.locator('.drive-mode-screen').waitFor();
    const before=await snapshot(page);
    const summary=page.locator('.drive-mode-split-summary');
    await summary.getByText('Split SB pending',{exact:true}).waitFor();
    assert.match(await summary.innerText(),/partner still needed: 00:01 SB/);
    assert.equal(await page.locator('.drive-mode-warnings.hard').count(),0);
    await page.screenshot({path:`${output}/${name}-pending.png`,fullPage:true});

    // The full Drive screen recalculates its open status on the existing
    // one-minute timer; the compact component has a separate hook regression.
    await page.clock.runFor(70000);
    await summary.getByText('Split SB complete',{exact:true}).waitFor();
    assert.equal(await page.locator('.drive-mode-warnings.hard').count(),0);
    await page.screenshot({path:`${output}/${name}-complete.png`,fullPage:true});

    await page.locator('.drive-mode-log-btn').click();
    await page.locator('.logbook-ui-v110').waitFor();
    if(!await page.locator('[data-log-event-id="hos-fixture-9"]').count())
      await page.getByRole('button',{name:'‹ Day',exact:true}).click();
    await page.locator('[data-log-event-id="hos-fixture-9"]').waitFor();
    const review=page.locator('.logcheck-summary');
    await review.click();
    const text=await page.locator('.logcheck-compact').innerText();
    assert.doesNotMatch(text,/14h window violation|Driving after the limit/);
    assert.match(text,/Split OK|Complete/);
    const after=await snapshot(page);
    assert.deepEqual(after.eventsByDay[day],before.eventsByDay[day],
      'Reviewing a past day preserves its recorded events');
    assert.deepEqual(after.signatureByDay,before.signatureByDay,
      'HOS guidance preserves existing signature data');
    assert.deepEqual(errors,[]);
    console.log(`PASS — ${name}: pending guidance completes on the clock, historical review remains clear, recorded events and signatures stay unchanged`);
  } catch(error) {
    await page.screenshot({path:`${output}/${name}-failed.png`,fullPage:true}).catch(()=>{});
    fs.writeFileSync(`${output}/${name}-failure.json`,JSON.stringify({error:String(error),errors,
      text:await page.locator('body').innerText().catch(()=>''),},null,2));
    throw error;
  } finally {await context.close();await browser.close();}
}

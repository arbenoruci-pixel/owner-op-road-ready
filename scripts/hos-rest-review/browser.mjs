import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from '../v110328/browserFixture.mjs';
import {day,at,fixture} from './fixture.mjs';
const output='browser-test-results/hos-rest-review';
fs.mkdirSync(output,{recursive:true});
async function snapshot(page) {
  return page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('owner-op-road-ready-offline-v1');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,query=db.transaction('app_snapshots','readonly').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');
      query.onsuccess=()=>{db.close();resolve(query.result?.state);};
      query.onerror=()=>{db.close();reject(query.error);};
    };
  }));
}
const names=(process.env.BROWSER_ENGINE||'chromium,webkit').split(',');
for(const name of names) {
  const browser=await ({chromium,webkit})[name].launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/New_York',serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
    await setupRoutes(context);
    await page.clock.setFixedTime(at);
    const state={...baseState(),...fixture({sentinel:true}),currentStatus:'ON',view:'home',loadInfo:{},loadGuidesById:{},testInstructionStore:{}};
    await seed(page,state,[],{navigateHome:false});
    await page.locator('.logbook-ui-v110, .adaptive-home-v1038, .logbook-home-screen-v988').first().waitFor();
    const openLogbook=page.getByRole('button',{name:'Open logbook',exact:true});
    if(await openLogbook.isVisible())await openLogbook.click({timeout:5000}).catch(async error=>{
      // A restored day can finish hydrating while the Home shell disappears.
      if(!(await page.locator('.logbook-ui-v110').isVisible()))throw error;
    });
    const driveLog=page.locator('.drive-mode-log-btn');
    if(await driveLog.isVisible())await driveLog.click();
    await page.locator('.logbook-ui-v110 .log-graph-v110').waitFor();
    if(!(await page.locator('[data-log-event-id="evening-rest"]').count()))await page.getByRole('button',{name:'‹ Day',exact:true}).click();
    const row=page.locator('[data-log-event-id="evening-rest"]');
    await row.waitFor();
    const before=await snapshot(page);
    await row.click();
    await row.getByRole('button',{name:'Edit selected event',exact:true}).click();
    const editor=page.locator('.editor-ui-v110');
    await editor.waitFor();
    assert.equal(await editor.getByLabel('End time',{exact:true}).inputValue(),'00:00');
    assert.match(await editor.locator('.selected-duration-live').innerText(),/2h 17m/);
    assert.equal(await editor.locator('.save-main').isDisabled(),true);
    await page.screenshot({path:`${output}/${name}-initial-midnight.png`,fullPage:true});
    await editor.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.deepEqual((await snapshot(page)).eventsByDay,before.eventsByDay,'Cancel must preserve all stored events');
    await row.click();await row.getByRole('button',{name:'Edit selected event',exact:true}).click();
    await editor.getByLabel('End time',{exact:true}).fill('23:00');
    await editor.locator('.save-main').click();
    await page.waitForFunction(({day})=>!document.querySelector('.editor-ui-v110'),{day});
    for(let attempt=0;attempt<50;attempt++) {
      const saved=await snapshot(page);
      if(saved.eventsByDay[day].at(-1).endMin===1380)break;
      await page.waitForTimeout(100);
    }
    const saved=await snapshot(page);
    assert.equal(saved.eventsByDay[day].at(-1).endMin,1380);
    assert.equal(saved.eventsByDay[day].at(-1).paperLogEndV110315,true);
    await page.reload();
    await page.locator('[data-log-event-id="evening-rest"]').waitFor();
    const reopened=page.locator('[data-log-event-id="evening-rest"]');
    await reopened.click();await reopened.getByRole('button',{name:'Edit selected event',exact:true}).click();
    assert.equal(await page.getByLabel('End time',{exact:true}).inputValue(),'23:00');
    assert.deepEqual((await snapshot(page)).signatureByDay,before.signatureByDay);
    assert.deepEqual(errors,[]);
    console.log(`PASS — ${name}: historical Sleeper opens to midnight; Cancel is read-only; explicit End survives save and reload`);
  } catch(error) {
    await page.screenshot({path:`${output}/${name}-failed.png`,fullPage:true}).catch(()=>{});
    fs.writeFileSync(`${output}/${name}-failure.json`,JSON.stringify({error:String(error),errors,text:await page.locator('body').innerText()},null,2));
    throw error;
  } finally {await context.close();await browser.close();}
}

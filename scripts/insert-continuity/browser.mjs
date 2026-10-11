import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {seed,setupRoutes,snapshot} from '../v110434/browserFixture.mjs';
import {fixture,day,prior,next,at} from './fixture.mjs';
import {addTeamDriver} from '../../source/src/core/team/teamLogbook.js';
const output='browser-test-results/insert-solo';fs.mkdirSync(output,{recursive:true});
async function openDay(page){
  const insert=page.getByRole('button',{name:'Insert',exact:true});
  const open=page.getByRole('button',{name:'Open logbook',exact:true});
  await insert.or(open).first().waitFor({timeout:30000});
  if(!await insert.isVisible())await open.click({timeout:3000}).catch(async error=>{if(!await insert.isVisible())throw error;});
  await insert.waitFor();
}
async function waitState(page,fn){for(let i=0;i<80;i++){const s=await snapshot(page);if(fn(s))return s;await page.waitForTimeout(100);}throw Error('Snapshot condition timed out');}
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/Chicago',serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await setupRoutes(context);await page.clock.setFixedTime(at);
  let state=addTeamDriver({...fixture(),testInstructionStore:{loads:[],documents:[]}},'Saved Partner',day);
  const partner=state.teamDrivers[1].id;
  state.teamLogbooksByDriverId[partner]={eventsByDay:{[prior]:[{id:'partner-sb',status:'SB',startMin:0,endMin:1440}]},signatureByDay:{[prior]:{signed:true,signatureDataUrl:'saved'}},formByDay:{}};
  try{
    await seed(page,state,[],false);await openDay(page);
    const before=await snapshot(page);assert.equal(before.activeDay,day);
    const graph=page.locator('.logbook-ui-v110 .log-graph-v110');
    assert.equal(await graph.locator('[data-kind="Gap"]').count(),0);
    await page.getByRole('button',{name:'Insert',exact:true}).click();
    const editor=page.locator('.editor-compact-v111');await editor.waitFor();
    assert.equal(await editor.locator('[data-kind="Gap"]').count(),0,'Opening Insert retains every recorded/confirmed interval');
    assert.ok((await editor.locator('.log-graph-v110').textContent()).includes('10.17'));
    await page.screenshot({path:`${output}/${name}-insert.png`});
    await page.locator('.cancel-main').click();await openDay(page);
    assert.deepEqual((await snapshot(page)).eventsByDay,before.eventsByDay,'Cancel preserves the persisted log');
    await page.getByRole('button',{name:'Insert',exact:true}).click();
    await page.getByLabel('Start time',{exact:true}).fill('20:00');
    await page.getByLabel('End time',{exact:true}).fill('20:15');
    await page.getByRole('button',{name:'Waiting',exact:true}).click();
    assert.equal(await editor.locator('[data-kind="Gap"]').count(),0);
    await page.locator('.save-main').click();
    const saved=await waitState(page,s=>s.eventsByDay[day].some(e=>e.status==='ON'&&e.startMin===1200&&e.endMin===1215));
    await openDay(page);assert.equal(await graph.locator('[data-kind="Gap"]').count(),0);
    for(const date of [prior,next])assert.deepEqual(saved.eventsByDay[date],before.eventsByDay[date]);
    await page.reload();await openDay(page);
    assert.equal(await graph.locator('[data-kind="Gap"]').count(),0);
    assert.deepEqual((await snapshot(page)).eventsByDay,saved.eventsByDay);
    console.log(`PASS ${name}: Insert open/cancel/change/save/reload retains sleeper and both Driving fragments`);
    const beforeRemove=await snapshot(page);
    await page.getByRole('button',{name:'Open team drivers',exact:true}).click();
    await page.getByRole('button',{name:'Remove co-driver Saved Partner',exact:true}).click();
    await page.getByText('SOLO DRIVER',{exact:true}).waitFor();
    const removed=await waitState(page,s=>s.activeTeamDriverIds?.length===1&&s.coDrivers==='');
    assert.deepEqual(removed.eventsByDay,beforeRemove.eventsByDay);
    assert.deepEqual(removed.teamLogbooksByDriverId,beforeRemove.teamLogbooksByDriverId);
    assert.deepEqual(removed.signatureByDay,beforeRemove.signatureByDay);
    await page.reload();await openDay(page);await page.getByText('SOLO DRIVER',{exact:true}).waitFor();
    await page.getByRole('button',{name:'‹ Day',exact:true}).click();
    await page.getByText('SOLO DRIVER',{exact:true}).waitFor();
    assert.equal((await snapshot(page)).coDrivers,'');
    await page.getByRole('button',{name:'Day ›',exact:true}).click();
    await page.getByRole('button',{name:'Open team drivers',exact:true}).click();
    await page.getByLabel('Co-driver name',{exact:true}).fill('Saved Partner');
    await page.getByRole('button',{name:'Add co-driver',exact:true}).click();
    await page.getByText('TEAM DRIVER',{exact:true}).waitFor();
    const readded=await waitState(page,s=>s.activeTeamDriverIds?.includes(partner));
    assert.equal(readded.teamDrivers.length,2);
    assert.deepEqual(readded.teamLogbooksByDriverId[partner],beforeRemove.teamLogbooksByDriverId[partner]);
    await page.screenshot({path:`${output}/${name}-team-controls.png`});
    assert.deepEqual(errors,[]);
    console.log(`PASS ${name}: Remove, Solo after reload/day navigation, explicit Add restores same co-driver and saved log`);
  }catch(error){await page.screenshot({path:`${output}/${name}-FAILED.png`}).catch(()=>{});fs.writeFileSync(`${output}/${name}-failure.json`,JSON.stringify({error:String(error),errors,body:await page.locator('body').innerText()},null,2));throw error;}
  finally{await context.close();await browser.close();}
}

// Isolated synthetic data only; no requests may write to a real cloud account.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, webkit } from 'playwright';
import { baseState, seed, setupRoutes } from '../v110328/browserFixture.mjs';
import { addTeamDriver, switchTeamDriver, sealActiveDriverLogbook, importedLogbookIntegrity } from '../../source/src/core/team/teamLogbook.js';
import { buildFullBackupPayloadV105 } from '../../source/src/modules/backup/fullBackupV105.js';

const output = 'browser-test-results/team-import-v110407';
fs.mkdirSync(output,{recursive:true});
const day='2026-09-23';
const empty=()=>({...baseState(),view:'logbook',activeDay:day,eventsByDay:{},signatureByDay:{},inspectionByDay:{},formByDay:{},certifyStatus:{},routeLegsByDay:{},loadInfo:{},loadGuidesById:{},testInstructionStore:{}});
const a={...empty(),driverProfile:{name:'Alpha Driver'},coDrivers:'Legacy Partner',eventsByDay:{[day]:[
  {id:'a-off',status:'OFF',startMin:0,endMin:600,city:'Lima',state:'IN',note:'Off Duty',source:'manual'},
  {id:'a-on',status:'ON',startMin:600,endMin:630,city:'Lima',state:'IN',note:'Pre-trip inspection',source:'manual'},
  {id:'a-drive',status:'D',startMin:630,endMin:700,city:'Lima',state:'IN',note:'Driving',source:'manual'},
  {id:'a-end',status:'OFF',startMin:700,endMin:1440,city:'Lima',state:'IN',note:'Off Duty',source:'manual'},
]},inspectionByDay:{[day]:{complete:true,type:'pretrip',checked:['brakes'],sourceStartMin:600,sourceEndMin:630,completedAt:1790160000000}},formByDay:{[day]:{driverName:'Recorded Alpha'}}};
const team=addTeamDriver(a,'Beta Driver',day),alpha=team.activeDriverId,beta=team.teamDrivers[1].id;
const inactive= switchTeamDriver(team,beta,day);
const source=sealActiveDriverLogbook({...inactive,eventsByDay:{[day]:[
  {id:'b-off',status:'OFF',startMin:0,endMin:600,city:'Lima',state:'IN',note:'Off Duty',source:'manual'},
  {id:'b-sleep',status:'SB',startMin:600,endMin:1440,city:'Lima',state:'IN',note:'Sleeper berth',source:'manual'},
]}});
const payload=buildFullBackupPayloadV105(source,{expenses:[{id:'imported-expense',amount:42}]},{appVersion:'110.4.5',createdAt:'2026-09-24T10:00:00Z'});
const file={name:'synthetic-team-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))};
const stored=page=>page.evaluate(()=>new Promise((resolve,reject)=>{
  const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{
    const db=r.result,tx=db.transaction('app_snapshots','readonly'),q=tx.objectStore('app_snapshots').get('owner-op-road-ready-state-v1');
    q.onsuccess=()=>{resolve(q.result?.state);db.close();};q.onerror=()=>reject(q.error);
  };
}));
async function waitStored(page,predicate){for(let i=0;i<60;i++){const value=await stored(page);if(predicate(value))return value;await page.waitForTimeout(100);}throw new Error('Stored state did not reach the expected value');}
async function openBackup(page){await page.getByRole('button',{name:'Open logbook',exact:true}).click();await page.getByRole('button',{name:'Tools',exact:true}).click();await page.getByRole('button',{name:/^Backup Logs/}).click();await page.getByText('Local history detected',{exact:true}).waitFor();}
const engines=process.env.TEST_BROWSER==='chromium'?[['chromium',chromium]]:[['chromium',chromium],['webkit',webkit]];
for(const[name,engine]of engines){
  const browser=await engine.launch({headless:true,...(name==='chromium'&&process.env.USE_INSTALLED_CHROMIUM?{channel:'chromium'}:{})});
  async function scenario(label,run){
    const context=await browser.newContext({viewport:{width:820,height:1180},serviceWorkers:'block',acceptDownloads:true});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-09-25T18:00:00Z'));
    await setupRoutes(context);
    try{await run(page);assert.deepEqual(errors,[]);await page.screenshot({path:`${output}/${name}-${label}.png`,fullPage:true});console.log(`PASS — ${name}: ${label}`);}
    catch(error){console.error(await page.locator('body').innerText());await page.screenshot({path:`${output}/${name}-${label}-FAILED.png`,fullPage:true});throw error;}
    finally{await context.close();}
  }
  try{
    await scenario('fresh-file-import-reload-switch',async page=>{
      await seed(page,empty());await openBackup(page);
      const button=page.getByRole('button',{name:'Import from another device',exact:true});
      assert.equal(await button.isEnabled(),true);
      page.on('dialog',dialog=>dialog.accept());
      const chooser=page.waitForEvent('filechooser');await button.click();await(await chooser).setFiles(file);
      const imported=await waitStored(page,s=>s?._restoredBackupMeta?.filename===file.name);
      assert.equal(importedLogbookIntegrity(payload.state,imported).ok,true);
      assert.equal(imported._restoredBackupMeta.importedEvents,6);
      await page.reload();await page.locator('.team-driver-shell').waitFor();
      assert.equal(importedLogbookIntegrity(payload.state,await stored(page)).ok,true);
      await page.getByRole('button',{name:'Open team drivers',exact:true}).click();
      await page.locator('.team-driver-list').getByRole('button',{name:/Alpha Driver/}).click();
      const switched=await waitStored(page,s=>s?.activeDriverId===alpha);
      assert.deepEqual(switched.eventsByDay[day],payload.state.teamLogbooksByDriverId[alpha].eventsByDay[day]);
      assert.equal(switched.formByDay[day].driverName,'Recorded Alpha');
      await page.getByRole('button',{name:'Open team drivers',exact:true}).click();
      await page.locator('.team-driver-list').getByRole('button',{name:/Beta Driver/}).click();
      const back=await waitStored(page,s=>s?.activeDriverId===beta);
      assert.equal(back.formByDay[day]?.driverName,undefined);
      assert.deepEqual(back.eventsByDay[day],payload.state.eventsByDay[day]);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')).expenses[0].id),'imported-expense');
    });
    await scenario('inactive-driver-protected',async page=>{
      await seed(page,{...inactive,testInstructionStore:{}});await openBackup(page);
      assert.equal(await page.getByRole('button',{name:'Import from another device',exact:true}).isDisabled(),true);
      const before=await stored(page);
      await page.locator('input[type=file]').last().setInputFiles(file);
      await page.getByRole('status').filter({hasText:'Create and save a verified Device Safety Backup'}).waitFor();
      assert.deepEqual((await stored(page)).teamLogbooksByDriverId,before.teamLogbooksByDriverId);
      assert.equal((await stored(page))._restoredBackupMeta,undefined);
    });
    await scenario('profile-name-persists',async page=>{
      const today='2026-09-25';
      const profileTeam=addTeamDriver({...empty(),activeDay:today,eventsByDay:{[today]:[{id:'name-off',status:'OFF',startMin:0,endMin:600,city:'Lima',state:'IN',source:'manual',note:'Off Duty'}]}},'Profile Partner',today);
      await seed(page,profileTeam);
      await page.getByRole('button',{name:'Open logbook',exact:true}).click();
      await page.getByRole('button',{name:'Form',exact:true}).click();
      page.once('dialog',dialog=>dialog.accept('Updated Driver'));
      await page.locator('.road-paper-form').getByRole('button',{name:/^Driver /}).click();
      await waitStored(page,s=>s?.teamDrivers?.find(driver=>driver.id===s.activeDriverId)?.name==='Updated Driver');
      await page.reload();await page.locator('.team-driver-shell').waitFor();
      assert.equal((await stored(page)).driverProfile.name,'Updated Driver');
      await page.getByRole('button',{name:'Open team drivers',exact:true}).click();
      await page.locator('.team-driver-list').getByRole('button',{name:/Profile Partner/}).click();
      await waitStored(page,s=>s?.driverProfile?.name==='Profile Partner');
      await page.getByRole('button',{name:'Open team drivers',exact:true}).click();
      await page.locator('.team-driver-list').getByRole('button',{name:/Updated Driver/}).click();
      assert.equal((await waitStored(page,s=>s?.driverProfile?.name==='Updated Driver')).teamDrivers[0].name,'Updated Driver');
    });
    await scenario('rescan-catches-late-business-record',async page=>{
      await seed(page,empty());await openBackup(page);
      assert.equal(await page.getByRole('button',{name:'Import from another device',exact:true}).isEnabled(),true);
      await page.evaluate(()=>localStorage.setItem('owner-op-road-ready-business-v1',JSON.stringify({fuel:[{id:'late-fuel',amount:12}]})));
      await page.locator('input[type=file]').last().setInputFiles(file);
      await page.getByRole('status').filter({hasText:'Create and save a verified Device Safety Backup'}).waitFor();
      assert.equal((await stored(page))._restoredBackupMeta,undefined);
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')).fuel[0].id),'late-fuel');
    });
    await scenario('database-failure-closed',async page=>{
      await seed(page,empty());await openBackup(page);
      await page.evaluate(()=>{IDBObjectStore.prototype.getAll=function(){throw new DOMException('Synthetic unavailable database','UnknownError');};});
      await page.locator('input[type=file]').last().setInputFiles(file);
      await page.getByRole('status').filter({hasText:'could not be checked'}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Import from another device',exact:true}).isDisabled(),true);
      assert.equal((await stored(page))._restoredBackupMeta,undefined);
    });
  }finally{await browser.close();}
}

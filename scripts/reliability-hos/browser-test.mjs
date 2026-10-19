import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const root=path.resolve(process.argv[2]||process.cwd());
process.chdir(root);
const localRequire=createRequire(import.meta.url);
let playwrightRequire=localRequire;
try{localRequire.resolve('playwright');}catch(error){
 if(error.code!=='MODULE_NOT_FOUND')throw error;
 playwrightRequire=createRequire(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules','playwright','package.json'));
}
const engine=process.env.HOS_BROWSER_ENGINE||'chromium';
const browserType=playwrightRequire('playwright')[engine];
if(!['chromium','webkit'].includes(engine))throw Error('Use chromium or webkit for HOS_BROWSER_ENGINE.');
const fixture=await import(pathToFileURL(path.join(root,'scripts/v110434/browserFixture.mjs')).href);
const {createCertificationRecord}=await import(pathToFileURL(path.join(root,'source/src/modules/logbook/certificationV110.js')).href);
const {applyLogbookEditorEdit}=await import(pathToFileURL(path.join(root,'source/src/modules/logbook/eventEditingV110.js')).href);
const day='2026-10-17';
const output=process.env.HOS_BROWSER_ARTIFACTS||'/workspace/scratch/e06b4e0f08ac/road-ready-evidence/hos-ui';
fs.mkdirSync(output,{recursive:true});
const e=(id,status,startMin,endMin,extra={})=>({id,status,startMin,endMin,source:'manual',city:'Synthetic City',state:'IL',note:{ON:'On Duty',OFF:'Off Duty',D:'Driving',SB:'Sleeper Berth'}[status],description:'',reasons:[],...extra});
function syntheticState(){
 const s={...fixture.baseState(),activeDay:day,currentStatus:'OFF',currentReason:'Off Duty',routeLegsByDay:{},loadInfo:{},homeTerminalTimeZone:'America/New_York',
  hosSettings:{jurisdiction:'US_INTERSTATE_PROPERTY',cycleHours:70,cycleDays:8,cycleRule:'70/8',carrierOperatesEveryDay:true,dutyDayStartMinute:0,dutyDayAnchorAt:'2026-10-12T04:00:00Z',splitSleeperEnabled:true,confirmedAt:'2026-10-12T04:00:00Z',source:'Synthetic verified carrier policy'},
  logTimeZoneByDay:{'2026-10-15':'America/New_York','2026-10-16':'America/New_York',[day]:'America/New_York','2026-10-18':'America/New_York'},
  eventsByDay:{
   '2026-10-15':[e('prior-15','OFF',0,1440)],'2026-10-16':[e('prior-16','OFF',0,1440)],
   [day]:[e('rest-17','OFF',0,300),e('hos-on','ON',300,480),e('drive-a','D',480,720),e('split-short','OFF',720,900),e('drive-b','D',900,1260),e('sleeper-a','SB',1260,1440)],
   '2026-10-18':[e('sleeper-b','SB',0,300),e('drive-c','D',300,360),e('later-rest','OFF',360,1440)]
  },
  certifyStatus:{'2026-10-15':'Needs signature','2026-10-16':'Needs signature',[day]:'Certified','2026-10-18':'Needs signature'},signatureByDay:{},
  logbookEditHistoryByDay:{[day]:[{kind:'synthetic_prior_edit',editedAt:'2026-10-18T12:00:00Z'}]},inspectionByDay:{},formByDay:{},driverSignature:{driverName:'Synthetic Driver',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='}}
 ;
 s.signatureByDay[day]=createCertificationRecord(s,day,{driverName:'Synthetic Driver',now:Date.parse('2026-10-18T13:00:00Z')});
 return s;
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){const end=Date.now()+20000;while(Date.now()<end){if(await check())return;await pause(200);}throw Error('Timed out: '+label);}
async function screenshot(page,name){const file=path.join(output,name+'.png');await page.screenshot({path:file,fullPage:false});return file;}
async function openDay(page){
 await page.getByRole('button',{name:'Open logbook',exact:true}).click();
 await page.locator('.logbook-date-jump-v988 input[type=date]').fill(day);
 await page.locator('.logbook-date-jump-v988').getByRole('button',{name:'Open',exact:true}).click();
 await page.locator(`[data-log-event-id="hos-on"]`).waitFor();
}
async function openEditor(page){
 const row=page.locator('[data-log-event-id="hos-on"]');await row.scrollIntoViewIfNeeded();await row.click();
 await row.getByRole('button',{name:'Edit selected event'}).click();
 await page.locator('.dd-root[data-duty-mode="recorded"]').waitFor();
}
async function tools(page){
 const header=page.locator('.phone-day-v435 > header,.phone-day-v435 > .topbar,.phone-day-v435 > .header');
 const buttons=await page.locator('.phone-day-v435').getByRole('button').all();
 const labeled=page.getByRole('button',{name:/^Tools$|^Log tools$|^More$/i});
 if(await labeled.count()){await labeled.first().click();return;}
 const chrome=page.locator('.phone-day-v435').locator(':scope > *').first();
 await chrome.getByRole('button').last().click();
}
const results=[];
for(const [name,device] of [['phone',{viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,timezoneId:'Pacific/Honolulu'}],['ipad',{viewport:{width:820,height:1180},deviceScaleFactor:1,isMobile:true,hasTouch:true,timezoneId:'America/Los_Angeles'}]]) {
 if(process.env.HOS_DEVICE && process.env.HOS_DEVICE!==name)continue;
 const browser=await browserType.launch({headless:true,...(engine==='chromium'?{args:['--no-sandbox']}:{})});
 const context=await browser.newContext(device);
 const errors=[];let page;
 try {
  await fixture.setupRoutes(context);
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await fixture.seed(page,syntheticState());
  console.log(name+': synthetic app hydrated');
  await openDay(page);
  const before=await fixture.snapshot(page),historicalBytes=JSON.stringify(before.eventsByDay[day]);
  assert.equal(before.logTimeZoneByDay[day],'America/New_York');
  assert.equal(await page.locator('.log-timezone-note').textContent(),'Home terminal · EDT · America/New_York');
  await openEditor(page);
  const editor=page.locator('.dd-root[data-duty-mode="recorded"]');
  assert.match(await editor.textContent(),/2026-10-17.*America\/New_York/);
  await editor.locator('input[aria-label="Start time"]').fill('05:30');
  await editor.locator('.hos-edit-preview').waitFor();
  assert.match(await editor.locator('.hos-edit-preview').textContent(),/05:00/);
  assert.match(await editor.locator('.hos-edit-preview').textContent(),/05:30/);
  assert.equal(await editor.getByRole('button',{name:'Save changes',exact:true}).isDisabled(),true);
  const previewState=await fixture.snapshot(page);assert.equal(JSON.stringify(previewState.eventsByDay[day]),historicalBytes,'draft does not mutate historical records');
  await editor.locator('.hos-history-approval input').check();
  assert.equal(await editor.getByRole('button',{name:'Save changes',exact:true}).isEnabled(),true);
  await editor.locator('.hos-edit-preview').scrollIntoViewIfNeeded();
  const editShot=await screenshot(page,name+'-edit-preview');
  const approvalBox=await editor.locator('.hos-history-approval').boundingBox();assert.ok(approvalBox.width<=device.viewport.width);
  await editor.locator('.hos-history-approval').scrollIntoViewIfNeeded();
  const approvalShot=await screenshot(page,name+'-edit-approval');
  const selected=before.eventsByDay[day].find(e=>e.id==='hos-on');
  const expected=applyLogbookEditorEdit(before,{day,id:'hos-on',patch:{startMin:330},expected:selected,expectedRows:before.eventsByDay[day]},new Date());
  assert.equal(expected.ok,true);
  await editor.getByRole('button',{name:'Save changes',exact:true}).click();
  await until(async()=>((await fixture.snapshot(page)).eventsByDay[day].find(e=>e.id==='hos-on').startMin===330),'saved historical start');
  const saved=await fixture.snapshot(page);
  assert.deepEqual(saved.eventsByDay[day],expected.state.eventsByDay[day],'saved events equal the command used in preview');
  assert.equal(saved.eventsByDay[day].find(e=>e.id==='rest-17').endMin,330,'neighbor boundary shown in preview is saved');
  assert.deepEqual(saved.logbookEditHistoryByDay[day].at(-1).beforeEvents,before.eventsByDay[day]);
  assert.deepEqual(saved.logbookEditHistoryByDay[day].at(-1).afterEvents,saved.eventsByDay[day]);
  assert.equal(saved.signatureByDay[day].signed,true,'prior signed attestation remains');
  assert.match(saved.certifyStatus[day],/Recertification/,'approved edit requires recertification');
  console.log(name+': exact edit preview → approval → save → history verified');
  await openEditor(page);
  assert.equal(await page.locator('input[aria-label="Start time"]').inputValue(),'05:30');
  await page.locator('.dd-root[data-duty-mode="recorded"]').getByRole('button',{name:'Cancel',exact:true}).click();
  await tools(page);
  await page.getByRole('button',{name:/^Log Time Zone/}).click();
  const zone=page.locator('.timezone-sheet');await zone.getByRole('button',{name:/Central Time America\/Chicago/}).click();
  assert.match(await zone.textContent(),/60 minutes of gap/);
  assert.match(await zone.textContent(),/saves a pending proposal/);
  await zone.getByRole('button',{name:'Review proposal',exact:true}).click();
  const zoneShot=await screenshot(page,name+'-chicago-proposal');
  const beforeZone=await fixture.snapshot(page);
  await zone.getByRole('button',{name:'Save pending America/Chicago proposal',exact:true}).click();
  await until(async()=>((await fixture.snapshot(page)).homeTerminalTimeZoneChangeProposal?.timeZone==='America/Chicago'),'pending Chicago proposal persisted');
  const afterZone=await fixture.snapshot(page);
  assert.equal(afterZone.homeTerminalTimeZone,'America/New_York');assert.equal(afterZone.homeTerminalTimeZoneChangeProposal.effectiveAt,null);
  assert.deepEqual(afterZone.eventsByDay,beforeZone.eventsByDay);assert.deepEqual(afterZone.signatureByDay,beforeZone.signatureByDay);assert.deepEqual(afterZone.logbookEditHistoryByDay,beforeZone.logbookEditHistoryByDay);
  assert.equal(afterZone.logTimeZoneByDay[day],'America/New_York');
  console.log(name+': Chicago proposal persisted with historical events/signatures/history unchanged');
  await page.reload();
  await until(async()=>((await fixture.snapshot(page))?.homeTerminalTimeZoneChangeProposal?.timeZone==='America/Chicago'),'proposal reopened');
  const reopened=await fixture.snapshot(page);assert.deepEqual(reopened.eventsByDay[day],afterZone.eventsByDay[day]);assert.equal(reopened.homeTerminalTimeZone,'America/New_York');
  await page.locator('.phone-day-v435').waitFor();
  await tools(page);
  await page.getByRole('button',{name:/^HOS rule profile/}).click();
  const profile=page.locator('.timezone-sheet');
  await profile.getByLabel('Jurisdiction and operation').selectOption('OTHER');
  await profile.getByLabel('Verification source').fill('Synthetic proposal only; applicability is awaiting carrier verification.');
  assert.equal(await profile.getByRole('button',{name:'Save confirmed prospective profile',exact:true}).isDisabled(),true);
  const profileBefore=await fixture.snapshot(page);
  await profile.getByRole('button',{name:'Save as proposal',exact:true}).scrollIntoViewIfNeeded();
  const profileShot=await screenshot(page,name+'-profile-proposal');
  const profileBox=await profile.locator('.hos-history-approval input').boundingBox();
  assert.ok(profileBox.width<=32,'profile confirmation control remains touch-sized rather than expanding across the sheet');
  await profile.getByRole('button',{name:'Save as proposal',exact:true}).click();
  await until(async()=>((await fixture.snapshot(page)).hosProfileProposal?.status==='needs_review'),'unconfirmed profile proposal saved');
  const profileAfter=await fixture.snapshot(page);
  assert.deepEqual(profileAfter.hosSettings,profileBefore.hosSettings);
  assert.deepEqual(profileAfter.hosProfileHistory,profileBefore.hosProfileHistory);
  assert.deepEqual(profileAfter.eventsByDay,profileBefore.eventsByDay);
  assert.deepEqual(profileAfter.signatureByDay,profileBefore.signatureByDay);
  console.log(name+': unsupported/unverified HOS profile saves only as a proposal, with current rules and historic logs unchanged');
  assert.deepEqual(errors,[],'no app runtime errors');
  results.push({engine,device:name,passed:true,checks:['historical day remains ET on another device zone','draft is read-only','exact before/after neighbor and HOS preview','approval required','save matches preview','audit history and prior signature retained','reopen exact edit','Chicago pending proposal does not activate or alter logs','proposal survives reload','unsupported/unverified HOS profile saves as proposal without changing rules or logs'],screenshots:[editShot,approvalShot,zoneShot,profileShot]});
 } catch(error) {
  const shot=page?await screenshot(page,name+'-failure').catch(()=>null):null;
  const body=page?await page.locator('body').innerText().catch(()=>null):null;
  results.push({engine,device:name,passed:false,error:error.stack,pageErrors:errors,screenshot:shot,body});
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
  console.error(error);throw error;
 } finally {await browser.close();}
}
fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));

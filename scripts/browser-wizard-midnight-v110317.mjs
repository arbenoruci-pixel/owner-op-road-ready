// Compiled-app integration: synthetic browser records only; external account APIs are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chromium, webkit } from 'playwright';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:3000';
const output=`browser-test-results/wizard-midnight-${process.env.TEST_ORIGIN?'production':'local'}`;fs.mkdirSync(output,{recursive:true});
const schemas=Object.assign({},...[...fs.readFileSync('lib/local-db/dexie.js','utf8').matchAll(/\.stores\((\{[\s\S]*?\})\)/g)].map(m=>vm.runInNewContext('('+m[1]+')')));
const user={id:'00000000-0000-4000-8000-000000000023',email:'override-fixture@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{provider:'email'}};
const exp=Math.floor(Date.now()/1000)+86400,b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session={access_token:b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,email:user.email,exp,aud:'authenticated'})+'.synthetic',refresh_token:'synthetic',token_type:'bearer',expires_in:86400,expires_at:exp,user};
import {coverageFixture,day} from './v110317/coverageFixture.mjs';
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('app_snapshots').objectStore('app_snapshots').get('owner-op-road-ready-state-v1');q.onsuccess=()=>{db.close();resolve(q.result?.state);};q.onerror=()=>reject(q.error);};}));}
async function waitState(page,condition){for(let n=0;n<100;n++){const s=await stored(page);if(s&&condition(s))return s;await page.waitForTimeout(100);}throw Error('Override fixture persistence timeout');}
async function openLog(page){await page.locator('.drive-mode-log-btn, .logbook-ui-v110 .log-graph-v110').first().waitFor({timeout:30000});if(await page.locator('.drive-mode-log-btn').isVisible())await page.locator('.drive-mode-log-btn').click();await page.locator('.logbook-ui-v110 .log-graph-v110').waitFor();}
async function setup(page,context,state,at='2026-09-10T09:44:00Z'){
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname.startsWith('/api/'))return route.fulfill({json:{},status:200});assert.equal(route.request().method(),'GET','browser override test cannot send app writes');return route.continue();}const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};if(route.request().method()==='OPTIONS')return route.fulfill({body:'',headers});if(url.pathname.endsWith('/rpc/owner_op_access_v1'))return route.fulfill({json:{approved:true},headers});if(url.pathname.endsWith('/rpc/owner_op_migration_status_v1'))return route.fulfill({body:'null',contentType:'application/json',headers});if(url.pathname==='/auth/v1/user')return route.fulfill({json:user,headers});return route.fulfill({status:403,json:{error:'Synthetic override test: external access blocked'},headers});});
 await page.clock.setFixedTime(new Date(at));
 await page.goto(origin+'/_not-found');await page.evaluate(async({schemas,state,session})=>{localStorage.setItem('owner-op-prototype-auth-v1',JSON.stringify(session));localStorage.setItem('owner-op-road-ready-home-terminal-timezone-v1','America/New_York');await new Promise((resolve,reject)=>{const r=indexedDB.open('owner-op-road-ready-offline-v1',20);r.onupgradeneeded=()=>{const db=r.result;for(const [name,schema]of Object.entries(schemas)){const [key,...indexes]=schema.split(',').map(s=>s.trim()),st=db.createObjectStore(name,{keyPath:key.replace(/^&/,'')});for(const raw of indexes){const field=raw.replace(/^[&*]/,'');st.createIndex(field,field.startsWith('[')?field.slice(1,-1).split('+'):field,{unique:raw.startsWith('&'),multiEntry:raw.startsWith('*')});}}};r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('app_snapshots','readwrite');tx.objectStore('app_snapshots').put({key:'owner-op-road-ready-state-v1',state,updated_at:new Date().toISOString()});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},{schemas,state,session});await page.goto(origin);await openLog(page);
}
const reports=[];
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await type.launch({headless:true});
 for(const scenario of ['SB','OFF','ON','explicit-end']) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,timezoneId:'Europe/Belgrade',serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
   const state=coverageFixture();
   if(scenario==='explicit-end')state.eventsByDay[day].at(-1).paperLogEndV110315=true;
   else state.eventsByDay[day].at(-1).status=scenario;
   state.currentStatus=scenario==='explicit-end'?'SB':scenario;
   await setup(page,context,state,'2026-09-10T10:54:00Z');
   const baseline=await stored(page);
   assert.equal(baseline.eventsByDay[day].at(-1).endMin,1322,'Opening Log must preserve the stored tail');
   for(const stage of ['opened','reopened']) {
    if(stage==='reopened'){await page.reload();await openLog(page);}
    await page.getByRole('navigation',{name:'Log sections'}).getByRole('button',{name:'Sign',exact:true}).click();
    await page.locator('.dot-simple-launch').click();
    const check=page.getByRole('dialog',{name:'DOT Check',exact:true});await check.waitFor();
    const text=await check.innerText();
    if(scenario==='explicit-end') {
     assert.match(text,/1h 58m unconfirmed/);
     await check.getByRole('button',{name:'Start Fix Wizard',exact:true}).click();
     const wizard=page.getByRole('dialog',{name:'Coverage Fix Wizard',exact:true});await wizard.waitFor();
     assert.match(await wizard.innerText(),/10:02 PM.*12:00 AM/);
     await wizard.getByRole('button',{name:'Cancel',exact:true}).first().click();
    } else {
     assert.doesNotMatch(text,/missing log coverage|1h 58m unconfirmed/i);
     assert.equal(await check.getByRole('button',{name:'Start Fix Wizard',exact:true}).count(),0);
     await page.screenshot({path:`${output}/${name}-${scenario}-${stage}.png`});
     await check.getByRole('button',{name:'Close',exact:true}).click();
     assert.doesNotMatch(await page.locator('.signature-panel').innerText(),/Missing log coverage|1h 58m unconfirmed/i);
    }
    assert.deepEqual((await stored(page)).eventsByDay[day],baseline.eventsByDay[day]);
    assert.deepEqual((await stored(page)).signatureByDay,baseline.signatureByDay);
   }
   if(scenario!=='explicit-end') {
    await page.locator('.sign-save').click();
    await waitState(page,s=>s.certifyStatus?.[day]==='Certified');
    await page.reload();await openLog(page);
    await page.getByRole('navigation',{name:'Log sections'}).getByRole('button',{name:'Sign',exact:true}).click();
    assert.match(await page.locator('.sign-status-card').innerText(),/Signed and certified/);
    assert.deepEqual((await stored(page)).eventsByDay[day],baseline.eventsByDay[day]);
   }
   assert.deepEqual(errors,[]);reports.push({browser:name,scenario,passed:true});
   console.log(`PASS — ${name} ${scenario}: Sign and DOT coverage agree after reopening, raw events preserved`);
  }catch(error){await page.screenshot({path:`${output}/${name}-${scenario}-failed.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${output}/${name}-${scenario}-failure.json`,JSON.stringify({error:String(error),errors,text:await page.locator('body').innerText(),state:await stored(page)},null,2));throw error;}
  finally{await context.close();}
 }
 await browser.close();
}
fs.writeFileSync(output+'/report.json',JSON.stringify(reports,null,2));

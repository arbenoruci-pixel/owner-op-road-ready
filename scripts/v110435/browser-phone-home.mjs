import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,snapshot,protectedData} from '../v110434/browserFixture.mjs';
const out='browser-test-results/phone-home-v110435';fs.mkdirSync(out,{recursive:true});
for(const [name,engine]of [['chromium',chromium],['webkit',webkit]]){
 if(process.env.PHONE_TEST_BROWSER&&process.env.PHONE_TEST_BROWSER!==name)continue;
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'rr-phone-home-'));
 const context=await engine.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block'});await setupRoutes(context);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const state=baseState();state.view='logbook';state.certifyStatus['2026-09-07']='Needs signature';state.testInstructionStore={loads:[],documents:[],fuel:[],expenses:[],maintenance:[],settlements:[]};
  await seed(page,state);const before=protectedData(await snapshot(page));
  assert.equal(await page.getByRole('button',{name:'Smart Scan',exact:true}).count(),1);
  assert.equal(await page.getByRole('navigation',{name:'Apps'}).getByRole('button').count(),10);
  assert.equal(await page.locator('.command-bottom-nav').count(),0);
  for(const width of [320,390,430,820]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Home must fit the phone');const boxes=await page.locator('.phone-app-grid>button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width,height:r.height};}));assert.ok(boxes.every(r=>r.x>=0&&r.right<=width+1&&r.width>=44&&r.height>=44));}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/'+name+'-home.png',fullPage:true});
  await page.getByRole('button',{name:'Import',exact:true}).click();await page.getByRole('button',{name:'Choose import ZIP',exact:true}).waitFor();assert.match(await page.locator('.phone-import-help').innerText(),/active logs/);await page.screenshot({path:out+'/'+name+'-import.png',fullPage:true});await page.getByRole('button',{name:'‹ Home',exact:true}).click();
  await page.getByRole('button',{name:'Open logbook',exact:true}).click();await page.locator('.phone-day-v435').waitFor();assert.equal(await page.getByRole('button',{name:'Insert',exact:true}).count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const rail=await page.locator('.graph-action-rail button').evaluateAll(els=>els.map(el=>Math.round(el.getBoundingClientRect().top)));assert.equal(new Set(rail).size,1,'Four actions stay on one row');await page.screenshot({path:out+'/'+name+'-day.png',fullPage:true});await page.getByRole('button',{name:'⌂ Home',exact:true}).click();
  await page.getByRole('button',{name:'Documents',exact:true}).click();await page.locator('.rr-docs-browser').waitFor();await page.locator('.owner-os-head-v102>button').first().click();await page.locator('.phone-app-grid').waitFor();
  await page.evaluate(()=>{const key='owner-op-road-ready-operator-profile-v1';const profile=JSON.parse(localStorage.getItem(key));profile.modules=['documents','loads','wallet','money'];localStorage.setItem(key,JSON.stringify(profile));window.dispatchEvent(new Event('owner-op-operator-profile-updated'));});
  await page.getByRole('button',{name:'More tools',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Open logbook',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'DOT Mode',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Drive',exact:true}).count(),0);await page.getByRole('button',{name:'More tools',exact:true}).click();await page.getByRole('button',{name:'Money & Taxes',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Fuel & IFTA',exact:true}).count(),0);await page.getByRole('button',{name:'Close more tools',exact:true}).click();
  await page.getByRole('button',{name:'Export & Backup',exact:true}).click();await page.getByRole('button',{name:/Export Everything/}).first().waitFor();
  assert.deepEqual(protectedData(await snapshot(page)),before);assert.deepEqual(errors,[]);
  console.log('PASS '+name+' — configured phone icons, single Smart Scan, 320/390/430/820px, Import picker, day controls, Documents, Export, preserved logbook');
 }catch(e){await page.screenshot({path:out+'/'+name+'-failure.png',fullPage:true});console.error(await page.locator('body').innerText(),errors);throw e;}finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}

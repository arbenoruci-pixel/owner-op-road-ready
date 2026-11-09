// Synthetic localhost fixtures only; no real mailbox, account or production data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,snapshot,protectedData,origin} from '../v110434/browserFixture.mjs';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname));
const out='browser-test-results/compact-business';fs.mkdirSync(out,{recursive:true});
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.TEST_BROWSER||process.env.TEST_BROWSER===name)){
 const browser=await engine.launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 await setupRoutes(context);page.on('pageerror',error=>errors.push(error.message));
 try{
  const state=baseState();state.homeTerminalTimeZone='America/Chicago';
  state.testInstructionStore={loads:Array.from({length:7},(_,i)=>({id:'synthetic-load-'+i,loadNo:'8201'+i,origin:'Example City, IL',destination:'Sample Town, OH',broker:'Synthetic Broker',status:i?'completed':'booked',gross:1300+i*100.25,pickupDate:'2026-11-04',deliveryDate:'2026-11-07'})),documents:[],fuel:[],expenses:[],maintenance:[],settlements:[]};
  await page.clock.setFixedTime(new Date('2026-11-08T18:00:00Z'));
  await seed(page,state,[]);const before=protectedData(await snapshot(page));
  const fit=async label=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' fits viewport');
  await page.getByRole('region',{name:'Gross revenue dashboard'}).waitFor();
  const homeAmounts=await page.locator('.rr-gross-card strong').allTextContents();
  for(const width of [320,390,430,820,1024]){await page.setViewportSize({width,height:844});await fit('Home '+width);assert.equal(await page.locator('.rr-gross-card').count(),3);assert.ok(await page.locator('.rr-gross-card strong').evaluateAll(rows=>rows.every(r=>r.scrollWidth<=r.clientWidth+1)),'Gross numbers remain inside cards');}
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('.rr-business-nav button').evaluateAll(buttons=>buttons.every(button=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})),'All four navigation actions are unobstructed');
  await page.screenshot({path:out+'/'+name+'-home.png'});
  await page.getByRole('button',{name:'Open load inbox',exact:true}).click();await page.getByRole('region',{name:'Smart load folders'}).waitFor();
  await page.getByRole('button',{name:/^Completed/}).click();
  assert.ok(await page.locator('.rr-smart-tabs button').evaluateAll(rows=>rows.every(e=>getComputedStyle(e).backgroundColor===(e.getAttribute('aria-pressed')==='true'?'rgb(21, 61, 110)':'rgba(0, 0, 0, 0)'))),'Filter highlight follows its selected state');
  for(const width of [320,390,820]){await page.setViewportSize({width,height:844});await fit('Inbox '+width);assert.ok(await page.locator('.rr-smart-card').first().evaluate(e=>e.getBoundingClientRect().height<155),'Inbox row is compact');}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/'+name+'-loads.png'});
  await page.getByRole('button',{name:/Load 82011/}).click();await page.locator('.rr-inbox-detail').waitFor();assert.equal(await page.locator('.rr-inbox-list').isVisible(),false);
  await page.setViewportSize({width:1024,height:850});await fit('Split inbox');assert.ok(await page.locator('.rr-inbox-list').isVisible());await page.screenshot({path:out+'/'+name+'-split.png'});
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open billing ›',exact:true}).click();await page.locator('.billing-checklist-v102').waitFor();
  await page.waitForFunction(()=>window.scrollY===0,null,{timeout:3000});
  assert.equal(await page.evaluate(()=>scrollY),0,'Billing opens at the top');
  // Native select innerText is empty in WebKit and includes all options in Chromium.
  // Assert the selected value, so both engines verify the actual billing target.
  assert.equal(await page.locator('.owner-os-load-picker-v102 select').inputValue(),'82011','Billing keeps selected folder');
  assert.ok(await page.getByRole('button',{name:'Invoice & packet PDF',exact:true}).isDisabled(),'Missing originals must still block packet generation');
  const contrast=await page.locator('.billing-checklist-v102 b').first().evaluate(el=>{const rgb=v=>v.match(/[\d.]+/g).slice(0,3).map(Number);const lum=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const a=lum(rgb(getComputedStyle(el).color)),b=lum(rgb(getComputedStyle(el.closest('.billing-checklist-v102')).backgroundColor));return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});assert.ok(contrast>=4.5,'Billing text contrast >= 4.5');
  for(const width of [320,390,820]){await page.setViewportSize({width,height:844});await fit('Billing '+width);}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:out+'/'+name+'-billing.png'});
  await page.locator('.rr-billing-setup').evaluate(e=>e.open=true);const carrier=page.locator('.billing-profile-grid-v102 input').first();const priorName=await carrier.inputValue();await carrier.fill('Synthetic Carrier LLC');assert.ok(await page.locator('.rr-billing-setup').evaluate(e=>e.open),'Typing keeps billing setup open');await carrier.fill(priorName);await page.locator('.rr-billing-setup').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+name+'-setup.png'});await fit('Setup');
  await page.getByRole('button',{name:'Open dashboard',exact:true}).click();await page.getByRole('region',{name:'Gross revenue dashboard'}).waitFor();
  assert.deepEqual(await page.locator('.rr-gross-card strong').allTextContents(),homeAmounts,'Home and dashboard use the same reconciled ledger');
  assert.deepEqual(protectedData(await snapshot(page)),before,'Read-only navigation preserves signed driver data');assert.deepEqual(errors,[],'No client errors');
  console.log('PASS '+name+' — 5 widths, consistent gross dashboard, compact rows, split inbox, billing gates, contrast, setup and immutable driver data');
 }catch(error){fs.writeFileSync(out+'/'+name+'-failure.txt',String(error.stack||error));await page.screenshot({path:out+'/'+name+'-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(0,1800));throw error;}finally{await browser.close();}
}

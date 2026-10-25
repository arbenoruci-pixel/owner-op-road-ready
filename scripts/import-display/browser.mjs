// Synthetic account only. All external reads/writes are blocked by the fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,snapshot,protectedData} from '../v110434/browserFixture.mjs';
const out='browser-test-results/import-display';fs.mkdirSync(out,{recursive:true});
const engines=process.env.TEST_BROWSER==='chromium'?[['chromium',chromium]]:[['chromium',chromium],['webkit',webkit]];
for(const [name,engine]of engines){
 const browser=await engine.launch({headless:true,...(name==='webkit'&&process.env.WEBKIT_EXECUTABLE?{executablePath:process.env.WEBKIT_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await setupRoutes(context);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const notify=()=>page.evaluate(()=>{
  window.dispatchEvent(new CustomEvent('owner-op-business-updated',{detail:{source:'account-receive'}}));
  window.dispatchEvent(new CustomEvent('road-ready-owner-ops-updated-v102',{detail:{source:'account-receive'}}));
 });
 try{
  const state=baseState();state.routeLegsByDay={};state.loadInfo={};
  state.testInstructionStore={loads:[{id:'received-load',loadNo:'TEST-RECEIVED',status:'invoiced',pickupDate:'2026-10-19',deliveryDate:'2026-10-23',origin:'Example City, IL',destination:'Example Town, NJ',gross:2000},{id:'closed-load',loadNo:'TEST-ARCHIVED',status:'archived',operationalStatus:'closed',pickupDate:'2026-10-05',deliveryDate:'2026-10-08',gross:1000,origin:'Example, IL',destination:'Example, ME'}],documents:[{id:'received-doc',type:'invoice',loadNo:'TEST-RECEIVED',fileName:'Received-invoice.pdf',documentDate:'2026-10-23',createdAt:Date.parse('2026-10-23')}],fuel:[],expenses:[],maintenance:[],settlements:[]};
  await seed(page,state);const before=protectedData(await snapshot(page));
  const saved=await page.evaluate(()=>localStorage.getItem('owner-op-road-ready-business-v1'));
  await page.getByRole('button',{name:'Documents',exact:true}).click();const workspace=page.getByRole('region',{name:'Records workspace'});
  const search=workspace.getByPlaceholder('Load, receipt, truck or name');await search.fill('Received-invoice');
  await workspace.getByRole('button',{name:/Received-invoice.pdf/}).waitFor();
  for(let i=0;i<3;i++){
   await notify();await page.waitForFunction(()=>!document.querySelector('.rr-files-count')?.textContent.includes('Loading'));
   assert.equal(await workspace.getByRole('button',{name:/Received-invoice.pdf/}).count(),1,'A metadata-only receive notification must not hide an imported original');
  }
  await workspace.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Loads',exact:true}).click();
  await page.getByRole('button',{name:/Oct 19.*Oct 25, 2026/}).click();await page.getByRole('button',{name:/Load TEST-RECEIVED/}).waitFor();
  await notify();await page.getByRole('button',{name:/Load TEST-RECEIVED/}).waitFor();
  await workspace.getByRole('button',{name:'‹ Home',exact:true}).click();
  await page.getByRole('button',{name:'Loads',exact:true}).click();
  const archived=page.locator('.business-record-card').filter({hasText:'TEST-ARCHIVED'});
  await archived.waitFor();assert.match(await archived.innerText(),/ARCHIVED/i);assert.equal(await archived.getByRole('button',{name:/Mark /}).count(),0,'Archived loads cannot restart through the next-status action');
  await notify();await page.getByText(/2\s+tracked loads/).waitFor();assert.equal(await page.locator('.business-record-card').filter({hasText:'TEST-RECEIVED'}).count(),1);
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Billing',exact:true}).click();
  await notify();await page.getByText('TEST-RECEIVED',{exact:false}).first().waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('owner-op-road-ready-business-v1')),saved,'Display refreshes must never rewrite saved business records');
  assert.deepEqual(protectedData(await snapshot(page)),before,'HOS, certifications and signatures remain exact');
  for(const width of [320,390,820]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Fits '+width);}
  assert.deepEqual(errors,[]);await page.screenshot({path:out+'/'+name+'-records.png',fullPage:true});
  console.log('PASS '+name+' — imported Files and load weeks survive repeated receive notifications; billing remains usable; archived status stays closed; saved records and HOS unchanged');
 }catch(e){console.error({name,errors,body:(await page.locator('body').innerText()).slice(0,5000)});await page.screenshot({path:out+'/'+name+'-failure.png',fullPage:true});throw e;}
 finally{await context.close();await browser.close();}
}

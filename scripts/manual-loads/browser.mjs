// Synthetic fixtures on localhost only. Never use production accounts or files.
import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,snapshot,protectedData,origin,simplePdf} from '../v110434/browserFixture.mjs';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname));
const out='browser-test-results/manual-loads';fs.mkdirSync(out,{recursive:true});
for(const [name,engine]of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[],readerRequests=[];
 await setupRoutes(context);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/api\/(reader|document-reader|ai-reader)/.test(r.url()))readerRequests.push(r.url());});
 try{
  const state=baseState();state.testInstructionStore={loads:[{id:'done',loadNo:'OLD-1',status:'delivered',gross:104770.09,origin:'Example, IL',destination:'Sample, OH',deliveryDate:'2026-11-13'}],documents:[],fuel:[],expenses:[],maintenance:[],settlements:[]};
  await seed(page,state,[]);const before=protectedData(await snapshot(page));
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'+ New load manually',exact:true}).click();
  // Standalone Home form must not inherit setup-scan's white --rr-panel.
  for(const width of [320,375,390,430,820]){
   await page.setViewportSize({width,height:844});
   const fit=await page.locator('.rr-manual').evaluate(root=>{
    const panel=getComputedStyle(root),box=root.getBoundingClientRect();
    return {background:panel.backgroundColor,color:panel.color,overflow:[...root.querySelectorAll('label,input,button')].filter(e=>{const b=e.getBoundingClientRect();return b.right>box.right+1||b.left<box.left-1;}).map(e=>e.tagName+':'+e.type),pageFits:document.documentElement.scrollWidth<=innerWidth+1};
   });
   assert.equal(fit.background,'rgb(16, 34, 55)','opaque dark form '+width);
   assert.equal(fit.color,'rgb(237, 245, 255)','readable form text '+width);
   assert.deepEqual(fit.overflow,[],'form controls fit '+width);assert.ok(fit.pageFits,'form page fits '+width);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:out+'/'+name+'-manual-form.png',fullPage:true});
  await page.getByLabel('Load number',{exact:true}).fill('2026');
  await page.getByRole('button',{name:'Create folder & set active',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'valid broker load number'}).waitFor();
  for(const [label,value]of [['Load number','MANUAL-128'],['Broker','Example broker'],['Pickup','Example, IL'],['Delivery','Sample, OH'],['Agreed rate ($)','2250']])await page.getByLabel(label,{exact:true}).fill(value);
  await page.getByRole('button',{name:'Create folder & set active',exact:true}).click();
  await page.getByRole('heading',{name:'MANUAL-128',exact:true}).waitFor();
  const readStore=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1')));
  assert.equal((await readStore()).loads.find(l=>l.loadNo==='MANUAL-128').manualActive,true);
  await page.getByRole('button',{name:'‹ Home',exact:true}).click();
  await page.getByRole('region',{name:'Active load folder',exact:true}).getByRole('heading',{name:'#MANUAL-128',exact:true}).waitFor();
  await page.getByRole('button',{name:'Open active load · Documents',exact:true}).click();
  async function add(type,label){
   const pdf=simplePdf('Synthetic '+type+' for MANUAL-128\nTest-only original.'),sha=createHash('sha256').update(pdf).digest('hex');
   const slot={rate_confirmation:'Rate confirmation',bol:'Bill of lading (BOL)',pod:'Signed POD'}[type];
   await page.getByRole('button',{name:slot,exact:true}).click();
   await page.getByRole('button',{name:'Choose photo or PDF',exact:true}).click();
   if(type==='pod'){assert.ok(await page.getByRole('button',{name:'Choose photo or PDF',exact:true}).isDisabled());await page.getByRole('checkbox',{name:'I checked that the receiver signed this delivery document.',exact:true}).check();}
   await page.getByRole('button',{name:'Choose photo or PDF',exact:true}).click();
   await page.locator('input[type=file][accept="application/pdf,.pdf"]').setInputFiles({name:type+'.pdf',mimeType:'application/pdf',buffer:pdf});
   await page.getByRole('button',{name:new RegExp('^Save '+label)}).click();
   await page.getByRole('heading',{name:label+' saved',exact:true}).waitFor({timeout:30000});
   await page.getByRole('button',{name:'Back to load folder',exact:true}).click();
   const docs=(await readStore()).documents.filter(d=>d.sha256===sha);assert.equal(docs.length,1);assert.equal(docs[0].canonicalLoadNo,'MANUAL-128');assert.equal(docs[0].type,type);assert.equal(docs[0].linkToLogbook,false);
   return docs[0];
  }
  await add('rate_confirmation','Ratecon');
  await page.getByRole('button',{name:'Mark delivered',exact:true}).click();await page.getByLabel('Actual delivery date',{exact:true}).fill('2026-11-15');await page.getByRole('button',{name:'Confirm delivered',exact:true}).click();
  assert.equal((await readStore()).loads.find(l=>l.loadNo==='MANUAL-128').status,'delivered');
  assert.match(await page.locator('.rr-smart-summary').innerText(),/1 of 3 on file/);
  for(const slot of ['Bill of lading (BOL)','Signed POD']){
   assert.match(await page.getByRole('button',{name:slot,exact:true}).innerText(),/missing/i,slot+' is visibly missing after delivery');
  }
  await add('bol','Pickup BOL');await add('pod','POD');
  await page.getByText('3 of 3 on file',{exact:true}).waitFor();
  await page.screenshot({path:out+'/'+name+'-completed.png'});
  await page.getByRole('button',{name:'‹ Home',exact:true}).click();await page.reload();
  await page.locator('.rr-driver-home').or(page.getByRole('button',{name:/Home/}).first()).first().waitFor();
  if(!(await page.locator('.rr-driver-home').isVisible()))await page.getByRole('button',{name:/Home/}).first().click();
  await page.getByRole('heading',{name:'No active load',exact:true}).waitFor();
  const store=await readStore();assert.equal(store.documents.filter(d=>d.canonicalLoadNo==='MANUAL-128').length,3);assert.equal(store.loads.find(l=>l.id==='done').gross,104770.09);
  assert.deepEqual(protectedData(await snapshot(page)),before);assert.deepEqual(readerRequests,[]);assert.deepEqual(errors,[]);
  const driver=page.getByRole('navigation',{name:'Driver navigation'});
  assert.equal(await driver.getByRole('button').count(),4);
  for(const width of [320,390,430,820]){
   await page.setViewportSize({width,height:844});
   assert.ok(await driver.getByRole('button').evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth+1)),'navigation labels fit '+width);
  }
  await driver.getByRole('button',{name:'More tools',exact:true}).click();
  await page.getByRole('region',{name:'Gross revenue dashboard'}).waitFor();
  assert.equal(await page.locator('.rr-gross-card strong').count(),3);
  for(const width of [320,390,430,820]){
   await page.setViewportSize({width,height:844});
   assert.ok(await page.locator('.rr-gross-card strong').evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth+1)),'full revenue fits '+width);
  }
  await driver.getByRole('button',{name:'Today',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:out+'/'+name+'-home.png'});
  console.log('PASS '+name+' — four phone/tablet widths, manual folder, active Home access, original hashes, signed-POD confirmation, delivery with missing docs, reload and unchanged driver records');
 }catch(e){console.error(await page.locator('[aria-label="Driver navigation"] button').evaluateAll(es=>es.map(e=>({text:e.textContent,width:e.clientWidth,scroll:e.scrollWidth,font:getComputedStyle(e).fontSize,wrap:getComputedStyle(e).whiteSpace}))));await page.screenshot({path:out+'/'+name+'-failure.png',fullPage:true});fs.writeFileSync(out+'/'+name+'-failure.txt',e.stack+'\n'+await page.locator('body').innerText());throw e;}finally{await browser.close();}
}

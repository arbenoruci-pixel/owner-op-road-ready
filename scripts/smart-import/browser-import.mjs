// Exercise actual Home -> Import -> original storage -> My month. Only the
// existing synthetic account fixture is used; real account services are blocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,snapshot,simplePdf} from '../v110434/browserFixture.mjs';
const csv='Transaction ID,Date of Visit,Truck Stop,State,Gallons Dispensed,Paid\nMF-1,2026-10-01 12:20,Example Station,Illinois,100,350\nMF-1,2026-10-01 12:20,Example Station,Illinois,100,350';
const businessKey='owner-op-road-ready-business-v1';
const engines=process.env.TEST_BROWSER==='chromium'?[['chromium',chromium]]:[['chromium',chromium],['webkit',webkit]];
for(const [name,engine] of engines){
 const browser=await engine.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];
 await setupRoutes(context);page.on('pageerror',e=>errors.push(e.message));
 try{
  const state=baseState();state.activeDriverId='primary';state.teamDrivers=[{id:'primary',name:'Synthetic Driver'}];state.activeTeamDriverIds=['primary'];
  state.routeLegsByDay={};state.loadGuidesById={};state.loadInfo={};state.eventsByDay['2026-10-01']=[{id:'synthetic-rest',status:'OFF',startMin:0,endMin:1440,note:'Original rest'}];
  state.testInstructionStore={loads:[{id:'cross-month',loadNo:'CROSS-1',status:'booked',pickupDate:'2026-09-30',deliveryDate:'2026-10-02',origin:'Example, IL',destination:'Example, CT'}],documents:[],fuel:[],expenses:[],maintenance:[],settlements:[]};
  await seed(page,state,[]);const before=await snapshot(page);
  const business=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),businessKey);
  const input=page.getByLabel('Choose statement or logbook');
  const upload=async(filename,body,mime='text/csv')=>{await input.setInputFiles({name:filename,mimeType:mime,buffer:Buffer.from(body)});};
  const review=()=>page.getByRole('region',{name:'Import preview'});
  await page.getByRole('button',{name:'Import',exact:true}).click();
  await page.getByRole('heading',{name:'Smart Import',exact:true}).waitFor();
  await upload('Mudflap.csv',csv);await page.getByRole('button',{name:'Review import',exact:true}).click();
  await review().waitFor();assert.match(await review().innerText(),/100\.000 US gal.*\$350\.00/);
  const save=review().getByRole('button',{name:'Save 1 new rows + original',exact:true});assert(await save.isDisabled());
  await review().getByRole('checkbox').check();await save.click();
  await page.getByRole('status').filter({hasText:'Saved 1 new row'}).waitFor();
  assert.equal((await business()).fuel.length,1);

  await upload('Mudflap-renamed.csv',csv);await page.getByRole('button',{name:'Review import',exact:true}).click();await review().waitFor();
  assert.equal(await review().getByRole('button',{name:/Save .*new rows/}).count(),0);
  await review().getByRole('checkbox').check();await review().getByRole('button',{name:'Keep statement original',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Saved 0 new rows'}).waitFor();assert.equal((await business()).fuel.length,1);
  const retained=await business();
  await upload('Mudflap-conflict.csv',csv.replaceAll(',100,350',',100,450'));await page.getByRole('button',{name:'Review import',exact:true}).click();await review().waitFor();
  await review().getByRole('heading',{name:'Transactions need review'}).waitFor();assert(await review().getByRole('checkbox').isDisabled());assert.deepEqual(await business(),retained);
  await review().getByRole('button',{name:'Cancel preview',exact:true}).click();

  await upload('Motive-state-miles.csv','Date,State,Miles,Taxable Miles\n2026-10-01,IL,100,0');
  await page.getByRole('button',{name:'Review import',exact:true}).click();await review().waitFor();assert.match(await review().innerText(),/100\.0 miles/);
  await review().getByRole('checkbox').check();await review().getByRole('button',{name:'Save 1 new rows + original',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved 1 new row'}).waitFor();

  await upload('Motive-logbook.pdf',simplePdf('Synthetic logbook report'),'application/pdf');
  await page.getByLabel('First report date').fill('2026-10-01');await page.getByLabel('Last report date').fill('2026-10-02');
  await page.getByLabel('Report’s home-terminal timezone').selectOption('America/Chicago');
  await page.getByRole('button',{name:'Review import',exact:true}).click();await review().waitFor();
  assert.match(await review().innerText(),/Archive for Synthetic Driver.*America\/Chicago/);
  await review().getByRole('checkbox').check();await review().getByRole('button',{name:'Save original logbook report',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Original logbook report saved'}).waitFor();

  await page.getByRole('button',{name:'My month',exact:true}).click();const month=page.getByRole('main',{name:'My month'});await month.waitFor();
  await page.getByLabel('Month',{exact:true}).fill('2026-10');
  assert.match(await month.innerText(),/\$350\.00/);assert.match(await month.innerText(),/100\.000 US gal/);assert.match(await month.innerText(),/100\.0 mi/);assert.match(await month.innerText(),/1 imported reports/);
  await month.getByText('Motive-logbook.pdf',{exact:true}).waitFor();
  const load=(await business()).loads.find(row=>row.id==='cross-month');assert.equal(load.loadNo,'CROSS-1');
  await page.getByLabel('Month',{exact:true}).fill('2026-09');assert.deepEqual((await business()).loads.find(row=>row.id==='cross-month'),load);
  await page.getByLabel('Month',{exact:true}).fill('2026-10');
  for(const width of [320,390,820]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Monthly page fits width '+width);}
  const after=await snapshot(page);for(const field of ['eventsByDay','signatureByDay','certifyStatus','teamLogbooksByDriverId'])assert.deepEqual(after[field],before[field],field+' stays exact');
  assert.equal((await business()).fuel.length,1);assert.deepEqual(errors,[]);
  fs.mkdirSync('browser-test-results/smart-import',{recursive:true});await page.screenshot({path:`browser-test-results/smart-import/${name}-month.png`,fullPage:true});
  console.log('PASS '+name+' reviewed CSV save/reimport/conflict, zero taxable miles, read-only PDF, monthly totals, cross-month identity, responsive layout and unchanged logs');
 }finally{await context.close();await browser.close();}
}

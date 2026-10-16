// Isolated CI browser regression. Uses synthetic records and blocks real account services.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,snapshot,protectedData,simplePdf} from '../v110434/browserFixture.mjs';
for(const [name,engine]of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 await setupRoutes(context);page.on('pageerror',error=>errors.push(error.message));
 try{
  const state=baseState();state.certifyStatus['2026-09-07']='Needs signature';state.activeDriverId='primary';state.teamDrivers=[{id:'primary',name:'Synthetic Driver'},{id:'archived',name:'Saved Driver'}];state.activeTeamDriverIds=['primary'];
  state.teamLogbooksByDriverId={archived:{eventsByDay:{'2026-10-12':[{id:'archive-off',status:'OFF',startMin:0,endMin:1440,note:'Archived rest'}]},signatureByDay:{}}};
  state.eventsByDay['2026-10-12']=[{id:'primary-off',status:'OFF',startMin:0,endMin:1440,note:'Primary rest',source:'manual'}];
  state.eventsByDay['2026-10-14']=[{id:'new-pickup',status:'ON',startMin:600,endMin:630,note:'Pickup / Loading',loadNo:'SHIP-2',shippingDocs:'SHIP-2',city:'Example City',state:'IL'},{id:'off',status:'OFF',startMin:630,endMin:1440,note:'Off Duty',source:'manual'}];
  state.routeLegsByDay['2026-10-14']=[{id:'shipment',pickupEventId:'new-pickup',loadNo:'SHIP-2',shippingDocs:'SHIP-2',fromCity:'Example City',fromState:'IL',toCity:'Example Town',toState:'CT',status:'open'}];
  state.testInstructionStore={loads:[{id:'broker',loadNo:'BROKER-1',status:'booked',pickupDate:'2026-10-14',deliveryDate:'2026-10-16',origin:'Example City, IL',destination:'Example Town, CT',gross:4000}],documents:[{id:'legacy-rate',type:'rate_confirmation',loadNo:'BROKER-1',fileName:'Saved-rate.pdf',documentDate:'2026-10-12',createdAt:Date.parse('2026-10-12')}],fuel:[],expenses:[],maintenance:[],settlements:[]};
  await seed(page,state,[{id:'local',bytes:[...simplePdf('Synthetic original')],binaryBytes:true}]);const original=await snapshot(page),before=protectedData(original),archived=structuredClone(original.teamLogbooksByDriverId.archived);
  const home=()=>page.locator('.phone-app-grid').waitFor();
  for(const width of [320,390,820]){
   await page.setViewportSize({width,height:844});await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('heading',{name:'How do you run?',exact:true}).waitFor();await page.getByRole('button',{name:'Close setup',exact:true}).click();await home();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Open shipment log',exact:true}).click();await page.locator('.phone-day-v435').waitFor();assert.equal((await snapshot(page)).activeDay,'2026-10-14');await page.getByRole('button',{name:'⌂ Home',exact:true}).click();
  await page.getByRole('button',{name:'Open logbook',exact:true}).click();await page.getByRole('button',{name:'Open today',exact:true}).waitFor();await page.getByRole('button',{name:'Home',exact:true}).click();
  for(const [button,arrival]of [['DOT Mode','Begin Inspection'],['Export & Backup','Export Everything']]){
   await page.getByRole('button',{name:button,exact:true}).click();await page.getByRole('button',{name:arrival,exact:true}).waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();await home();
  }
  await page.getByRole('button',{name:'Drive',exact:true}).click();await page.getByRole('region',{name:'Drive Mode HOS clocks'}).waitFor();assert.match(await page.locator('.drive-mode-pill').innerText(),/OFF\s+OFF DUTY/);await page.getByRole('button',{name:'Back',exact:true}).click();await home();
  await page.getByRole('button',{name:'Drive',exact:true}).click();await page.getByRole('button',{name:'Log',exact:true}).click();await page.locator('.phone-day-v435').waitFor();assert.equal((await snapshot(page)).activeDay,new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));await page.getByRole('button',{name:'⌂ Home',exact:true}).click();
  await page.getByRole('button',{name:'Wallet',exact:true}).click();await page.getByRole('button',{name:'Open load docs',exact:true}).click();await page.getByRole('region',{name:'Records workspace'}).getByRole('heading',{name:'Shipment reference SHIP-2',exact:true}).waitFor();await page.getByRole('button',{name:'‹ Home',exact:true}).click();
  await page.getByRole('button',{name:'Wallet',exact:true}).click();await page.getByRole('button',{name:'Open logs / RODS',exact:true}).click();await page.getByRole('button',{name:'Open today',exact:true}).waitFor();await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByRole('button',{name:'Documents',exact:true}).click();const workspace=page.getByRole('region',{name:'Records workspace'}),search=workspace.getByPlaceholder('Load, receipt, truck or name');
  await search.fill('Saved-rate');await workspace.getByRole('button',{name:/Saved-rate.pdf/}).click();await workspace.getByRole('button',{name:'Open original',exact:true}).waitFor();assert.equal(await workspace.getByRole('button',{name:'Save filing',exact:true}).count(),0);await workspace.getByRole('button',{name:'‹ All files',exact:true}).click();
  await search.fill('local.pdf');await workspace.getByRole('button',{name:/local.pdf/}).click();await workspace.getByLabel('File under',{exact:true}).selectOption('bol');await workspace.getByLabel('Load number',{exact:true}).fill('BROKER-1');await workspace.getByLabel('Document date',{exact:true}).fill('2026-10-12');await workspace.getByRole('button',{name:'Save filing',exact:true}).click();await workspace.getByRole('status').filter({hasText:'Filing saved.'}).waitFor();
  await workspace.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Loads',exact:true}).click();await workspace.getByRole('heading',{name:'Shipment reference SHIP-2',exact:true}).waitFor();await page.getByRole('button',{name:/Oct 12.*Oct 18, 2026/}).click();await page.getByRole('button',{name:/Load BROKER-1/}).click();await page.getByRole('button',{name:'Open Pickup BOL',exact:true}).waitFor();
  await workspace.getByRole('navigation',{name:'Records views'}).getByRole('button',{name:'Files',exact:true}).click();await search.fill('Saved Driver');await workspace.getByRole('button',{name:/Saved Driver · 2026-10-12/}).click();assert.match(await workspace.innerText(),/Saved log for Saved Driver/);assert.match(await workspace.getByRole('list',{name:'Saved duty events'}).innerText(),/Archived rest/);assert.equal(await workspace.getByRole('button',{name:'Open this logbook',exact:true}).count(),0);await workspace.getByRole('button',{name:'‹ All files',exact:true}).click();
  await search.fill('Synthetic Driver');await workspace.getByRole('button',{name:/Synthetic Driver · 2026-10-12/}).click();await workspace.getByRole('button',{name:'Open this logbook',exact:true}).click();await page.locator('.phone-day-v435').waitFor();assert.equal((await snapshot(page)).activeDay,'2026-10-12');
  const after=await snapshot(page);assert.deepEqual(protectedData(after),before);assert.deepEqual(after.teamLogbooksByDriverId.archived,archived);assert.equal(after.activeDriverId,'primary');assert.deepEqual(errors,[]);
  console.log('PASS '+name+' — Settings hit targets, shipment/date links, Home return, actual OFF, shared files/load folders, archived-driver isolation and preserved duty data');
 }catch(error){console.error((await page.locator('body').innerText()).slice(0,6000),errors);throw error;}finally{await browser.close();}
}

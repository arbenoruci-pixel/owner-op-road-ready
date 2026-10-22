// Synthetic account only: verify the actual Home profile lifecycle.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,snapshot,protectedData,origin} from '../v110434/browserFixture.mjs';
fs.mkdirSync('browser-test-results/profile',{recursive:true});
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await setupRoutes(context);
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const home=()=>page.getByRole('button',{name:'Settings',exact:true}).waitFor();
 const notify=()=>page.evaluate(()=>window.dispatchEvent(new CustomEvent('owner-op-operator-profile-updated',{detail:{source:'account-receive'}})));
 try{
  const state=baseState();state.testInstructionStore={loads:[],documents:[],fuel:[],expenses:[],maintenance:[],settlements:[]};
  await seed(page,state);await home();
  const before=protectedData(await snapshot(page));
  const profile=await page.evaluate(()=>localStorage.getItem('owner-op-road-ready-operator-profile-v1'));
  for(let i=0;i<4;i++){
   await notify();await home();
   assert.equal(await page.getByRole('button',{name:'Get started',exact:true}).count(),0,'Receive metadata must not open onboarding');
  }
  // Notifications from unrelated localStorage keys also reread the saved profile.
  await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'unrelated-key',newValue:'{}'})));
  await home();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('heading',{name:'How do you run?',exact:true}).waitFor();
  await notify();
  await page.getByRole('heading',{name:'How do you run?',exact:true}).waitFor();
  await page.getByRole('button',{name:'Close setup',exact:true}).click();await home();
  await page.reload();await home();await notify();await home();
  assert.equal(await page.evaluate(()=>localStorage.getItem('owner-op-road-ready-operator-profile-v1')),profile,'Notifications do not rewrite user settings');
  // Start without the profile, then receive a verified complete profile late.
  await page.evaluate(()=>localStorage.removeItem('owner-op-road-ready-operator-profile-v1'));
  await page.goto(origin);
  await page.getByRole('button',{name:'Get started',exact:true}).waitFor();
  await page.evaluate(saved=>{
   localStorage.setItem('owner-op-road-ready-operator-profile-v1',saved);
   window.dispatchEvent(new CustomEvent('owner-op-operator-profile-updated',{detail:{source:'account-receive'}}));
  },profile);
  await home();
  assert.equal(await page.getByRole('button',{name:'Get started',exact:true}).count(),0,'Late profile hydration clears onboarding');
  await page.reload();await home();await notify();await home();
  assert.deepEqual(protectedData(await snapshot(page)),before,'Duty events, signatures, certification and forms remain exact');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`browser-test-results/profile/${name}-home.png`,fullPage:true});
  console.log('PASS '+name+' repeated receive notifications, unrelated storage, explicit Settings, reload and late profile hydration preserve setup and recorded evidence');
 }catch(e){await page.screenshot({path:`browser-test-results/profile/${name}-failure.png`,fullPage:true});throw e;}
 finally{await context.close();await browser.close();}
}

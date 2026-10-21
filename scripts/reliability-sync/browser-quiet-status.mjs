// Exercise the real signing screen with repeated background SQL timeouts.
// The existing synthetic fixture blocks all real account services.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium, webkit} from 'playwright';
import {baseState, seed, setupRoutes, snapshot, protectedData} from '../v110434/browserFixture.mjs';

fs.mkdirSync('browser-test-results/quiet-sync', {recursive:true});
for (const [name, engine] of [['chromium',chromium],['webkit',webkit]]) {
  const browser = await engine.launch({headless:true});
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await setupRoutes(context);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const fail = () => page.evaluate(() => {
    const message = 'canceling statement due to statement timeout';
    window.dispatchEvent(new CustomEvent('road-ready-account-sync', {detail:{phase:'error',message,
      issue:{phase:'error',message,scope:'records'},completedAt:new Date().toISOString()}}));
  });
  const quiet = async () => {
    assert.equal(await page.locator('.rr-sync-chip').count(), 0, 'No floating sync badge covers work');
    assert.equal(await page.getByRole('complementary',{name:'Account synchronization'}).count(), 0, 'Background errors never open a panel');
  };
  try {
    const state = baseState();
    state.testInstructionStore = {loads:[],documents:[],fuel:[],expenses:[],maintenance:[],settlements:[]};
    await seed(page,state);
    await page.getByRole('button',{name:'Open logbook',exact:true}).click();
    await page.getByRole('button',{name:'Open today',exact:true}).click();
    await page.getByRole('navigation',{name:'Log sections'}).getByRole('button',{name:'Sign',exact:true}).click();
    await page.locator('.signature-panel').waitFor();
    const before = protectedData(await snapshot(page));
    for (let i=0;i<4;i++) {await fail(); await quiet();}
    for (const width of [320,390,820]) {
      await page.setViewportSize({width,height:844});
      await page.locator('.road-sign-save').scrollIntoViewIfNeeded();
      assert(await page.locator('.road-sign-save').evaluate(button => {
        const r=button.getBoundingClientRect();
        return [.3,.5,.7].every(fraction => button.contains(document.elementFromPoint(r.left+r.width*fraction,r.top+r.height/2)));
      }), 'Sync never covers the signing action at width '+width);
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:`browser-test-results/quiet-sync/${name}-sign.png`,fullPage:true});
    await page.getByRole('button',{name:'⌂ Home',exact:true}).click();
    const open = async () => {
      await page.getByRole('button',{name:'Settings',exact:true}).click();
      await page.getByRole('button',{name:'Synchronization status',exact:true}).click();
      await page.getByRole('complementary',{name:'Account synchronization'}).waitFor();
    };
    await open();
    assert.match(await page.getByRole('complementary',{name:'Account synchronization'}).innerText(),/statement timeout/);
    await page.getByRole('button',{name:'Close sync details',exact:true}).click();
    await fail(); await quiet();
    await open(); await page.keyboard.press('Escape'); await fail(); await quiet();
    assert.deepEqual(protectedData(await snapshot(page)),before,'Recorded logs and signatures remain exact');
    assert.deepEqual(errors,[]);
    console.log('PASS '+name+' repeated SQL timeouts never obstruct signing; Settings opens status, close/Escape survive retries, 320/390/820px and recorded evidence stays exact');
  } catch (error) {
    await page.screenshot({path:`browser-test-results/quiet-sync/${name}-failure.png`,fullPage:true});
    console.error(await page.locator('body').innerText(), errors); throw error;
  } finally {await context.close(); await browser.close();}
}

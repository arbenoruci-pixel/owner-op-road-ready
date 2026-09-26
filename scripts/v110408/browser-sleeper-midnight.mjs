// Synthetic browser records only. Account and cloud requests are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, webkit } from 'playwright';
import { baseState, seed, setupRoutes, snapshot } from '../v110328/browserFixture.mjs';

const output = 'browser-test-results/sleeper-midnight-v110408';
fs.mkdirSync(output, {recursive:true});
const prior = '2026-09-25', today = '2026-09-26';
const row = (id, status, startMin, endMin, extra = {}) => ({
  id, status, startMin, endMin, source:'live_status', city:'Chicago', state:'IL',
  note:status === 'SB' ? 'Sleeper Berth' : status === 'D' ? 'Driving' : 'Off Duty', ...extra,
});
function fixture(scenario) {
  return {...baseState(), view:'logbook', activeDay:today, currentStatus:'SB', currentReason:'Sleeper Berth',
    eventsByDay:{[prior]:[
      row('off', 'OFF', 0, 600),
      row('drive', 'D', 600, scenario === 'earlier-gap' ? 1310 : 1320, {paperLogEndV110315:true}),
      row('sleep', 'SB', 1320, 1321, scenario === 'explicit-sleeper-end' ? {paperLogEndV110315:true} : {}),
    ], [today]:[]},
    signatureByDay:{}, inspectionByDay:{}, formByDay:{[prior]:{driverName:'Recorded Driver'}},
    certifyStatus:{}, routeLegsByDay:{}, loadInfo:{}, loadGuidesById:{}, testInstructionStore:{},
  };
}
async function openLog(page) {
  const driveLog = page.locator('.drive-mode-log-btn');
  if (await driveLog.isVisible()) await driveLog.click();
  await page.locator('.logbook-ui-v110 .log-graph-v110').waitFor();
}
async function expectPriorTail(page, ended) {
  const event = page.locator('[data-log-event-id="sleep"]');
  await event.waitFor();
  assert.match(await event.innerText(), ended ? /\b1m\b/ : /\b2h\b/);
  const graph = page.locator('.logbook-ui-v110 .log-graph-v110');
  const totals = await graph.evaluate(svg => [...svg.querySelectorAll(':scope > g')].slice(0,4).map(g => g.querySelector('text:last-of-type')?.textContent));
  assert.equal(totals[1], ended ? '0.02' : '2.00', 'Sleeper total must match its visible interval');
}
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({headless:true});
  try {
    for (const scenario of ['earlier-manual-end', 'earlier-gap', 'explicit-sleeper-end']) {
      const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'America/Chicago',serviceWorkers:'block'});
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await setupRoutes(context);
        await page.clock.setFixedTime(new Date('2026-09-26T11:00:00Z')); // 07:00 home-terminal New York.
        await seed(page, fixture(scenario));
        await page.getByRole('button', {name:'Open logbook',exact:true}).click();
        await openLog(page);
        const before = await snapshot(page);
        await page.getByRole('button', {name:'‹ Day',exact:true}).click();
        await expectPriorTail(page, scenario === 'explicit-sleeper-end');

        if (scenario !== 'explicit-sleeper-end') {
          await page.getByRole('button', {name:'Day ›',exact:true}).click();
          await page.getByRole('button', {name:'Status',exact:true}).click();
          await page.locator('.duty-grid [data-status="D"]').click();
          await page.getByPlaceholder('City, ST', {exact:true}).fill('Chicago, IL');
          await page.getByRole('button', {name:'Save D',exact:true}).click();
          await page.clock.setFixedTime(new Date('2026-09-26T11:15:00Z'));
          await openLog(page);
          await page.evaluate(() => window.dispatchEvent(new Event('focus')));
          const first = page.locator('.events.clean-events .clean-event-row').first();
          await first.waitFor();
          assert.equal(await first.locator('.event-badge').innerText(), 'SB');
          assert.match(await first.innerText(), /\b7h\b/);
          await page.getByRole('button', {name:'‹ Day',exact:true}).click();
          await expectPriorTail(page, false);
        }

        await page.reload();
        await openLog(page);
        await expectPriorTail(page, scenario === 'explicit-sleeper-end');
        const after = await snapshot(page);
        assert.deepEqual(after.eventsByDay[prior], before.eventsByDay[prior]);
        assert.deepEqual(after.formByDay, before.formByDay);
        assert.deepEqual(after.signatureByDay, before.signatureByDay);
        assert.deepEqual(errors, []);
        await page.screenshot({path:`${output}/${name}-${scenario}.png`,fullPage:true});
        console.log(`PASS — ${name} ${scenario}: prior-day Sleeper, next-day Driving, reload and original-record preservation`);
      } catch (error) {
        await page.screenshot({path:`${output}/${name}-${scenario}-FAILED.png`,fullPage:true}).catch(() => {});
        fs.writeFileSync(`${output}/${name}-${scenario}-failure.json`, JSON.stringify({error:String(error),errors,text:await page.locator('body').innerText(),state:await snapshot(page).catch(() => null)},null,2));
        throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}

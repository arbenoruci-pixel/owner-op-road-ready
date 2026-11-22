import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { baseState, origin, protectedData, seed, setupRoutes, snapshot } from '../v110434/browserFixture.mjs';

assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname), 'Synthetic accounts run on localhost only');

function bookedLoad(number, active = false) {
  return {
    id: 'synthetic-' + number, loadNo: number, canonicalLoadNo: number,
    status: 'booked', operationalStatus: 'booked', manualActive: active, source: 'driver_manual_folder',
    origin: '300 Example Rd, Dayton, OH 45402', destination: '400 Example Rd, Peoria, IL 61602',
    pickupDate: new Date().toISOString().slice(0, 10), broker: 'Example carrier', gross: 2150,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

async function openHome(page, loads) {
  const state = baseState();
  state.testInstructionStore = { loads, documents: [], expenses: [], fuel: [], maintenance: [], settlements: [] };
  await seed(page, state, [], false);
  const today = page.locator('.rr-driver-home');
  const home = page.getByRole('button', {name: /Home/i}).first();
  await today.or(home).first().waitFor();
  if (!(await today.isVisible())) await home.click();
  await today.waitFor();
  return today;
}

async function checkWidth(page, screen) {
  for (const width of [320, 390, 430, 820]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${screen} overflows at ${width}px`);
    const controls = page.locator('nav.rr-today-nav button, .owner-auth-account-button');
    assert.ok(await controls.count() >= 5, `${screen} exposes the driver tabs and account control`);
    for (const control of await controls.all()) {
      assert.ok(await control.evaluate(button => {
        const rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return rect.width >= 44 && rect.height >= 44 && button.contains(target);
      }), `${screen} overlapping or undersized control at ${width}px: ${await control.getAttribute('aria-label')}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

for (const [name, engine] of [['Chromium', chromium], ['WebKit', webkit]]) {
  const browser = await engine.launch({headless: true});
  try {
    for (const kind of ['empty', 'ambiguous', 'chosen']) {
      const context = await browser.newContext({viewport: {width: 390, height: 844}, hasTouch: true, serviceWorkers: 'block'});
      try {
        await setupRoutes(context);
        await context.route('https://cdn.jsdelivr.net/**', route => route.abort());
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const loads = kind === 'empty' ? [] : [bookedLoad('QA-117', kind === 'chosen'), bookedLoad('QA-118')];
        const today = await openHome(page, loads);
        const card = today.getByRole('region', {name: 'Active load folder'});
        const before = protectedData(await snapshot(page));
        if (kind === 'empty') {
          await card.getByRole('heading', {name: 'No active load'}).waitFor();
          await card.getByRole('button', {name: 'Scan Rate Confirmation'}).waitFor();
        } else if (kind === 'ambiguous') {
          await card.getByRole('heading', {name: 'Choose your active load'}).waitFor();
          assert.equal(await card.getByRole('link', {name: 'Directions'}).count(), 0);
          await card.getByRole('button', {name: 'Choose saved load'}).waitFor();
        } else {
          await card.getByRole('heading', {name: '#QA-117', exact: true}).waitFor();
          await checkWidth(page, 'Today');
          const account = page.locator('.owner-auth-account-button');
          await account.click();
          await page.locator('.owner-auth-account-menu').waitFor();
          await account.click();
          await page.locator('.owner-auth-account-menu').waitFor({state: 'hidden'});
          const url = new URL(await card.getByRole('link', {name: 'Directions'}).getAttribute('href'));
          assert.equal(url.searchParams.get('destination'), loads[0].origin);
          const clocks = today.getByRole('region', {name: 'Hours of service'});
          await clocks.waitFor();
          assert.equal(await clocks.locator('input, select, textarea').count(), 0);
          const nav = page.getByRole('navigation', {name: 'Driver navigation'});
          assert.equal(await nav.getByRole('button').count(), 4);
          await nav.getByRole('button', {name: 'More tools'}).click();
          await page.getByRole('heading', {name: 'More', exact: true}).waitFor();
          await checkWidth(page, 'More');
          await nav.getByRole('button', {name: 'Today'}).click();
          await card.getByRole('button', {name: 'Open active load · Documents'}).click();
          const folder = page.locator('.rr-inbox-detail');
          await folder.getByRole('heading', {name: 'QA-117', exact: true}).waitFor();
          await checkWidth(page, 'Load folder');
          await folder.getByRole('button', {name: 'Signed POD', exact: true}).click();
          await folder.getByRole('button', {name: 'Choose photo or PDF'}).click();
          const gate = page.getByRole('checkbox', {name: /receiver signed/i});
          const filePicker = page.getByRole('button', {name: 'Choose photo or PDF'});
          await gate.waitFor();
          assert.ok(await filePicker.isDisabled());
          await gate.check();
          assert.ok(await filePicker.isEnabled());
          await page.getByRole('button', {name: 'Cancel', exact: true}).click();
          await folder.getByRole('button', {name: 'Review factoring packet'}).click();
          await folder.getByRole('button', {name: 'Open billing for this load'}).waitFor();
          await checkWidth(page, 'Factoring review');
          await folder.getByRole('button', {name: 'Open billing for this load'}).click();
          const billingLoad = page.locator('.owner-os-load-picker-v102 select');
          await billingLoad.waitFor();
          assert.equal(await billingLoad.inputValue(), 'QA-117');
        }
        assert.deepEqual(protectedData(await snapshot(page)), before);
        assert.deepEqual(errors, []);
        console.log(`PASS ${name} ${kind} driver workflow`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}

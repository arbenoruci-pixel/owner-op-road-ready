// Synthetic local data only. External requests are intercepted by the fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, webkit } from 'playwright';
import { baseState, seed, setupRoutes, simplePdf } from '../v110328/browserFixture.mjs';

const output = 'browser-test-results/backup-v110402';
fs.mkdirSync(output, { recursive:true });
const original = simplePdf('Synthetic original document for backup');
const digest = value => createHash('sha256').update(value).digest('hex');

for (const [name, browser] of [['chromium', chromium], ['webkit', webkit]]) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
  const context = await browser.launchPersistentContext(profile, { headless:true, viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true, serviceWorkers:'block', acceptDownloads:true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await setupRoutes(context);
    await page.addInitScript(() => {
      window.backupShares = [];
      window.backupShareMode = 'cancel';
      Object.defineProperty(navigator, 'canShare', { configurable:true, value:() => true });
      Object.defineProperty(navigator, 'share', { configurable:true, value:async ({ files }) => {
        const previous = window.backupShares.at(-1);
        window.backupShares.push({ file:files[0], active:navigator.userActivation?.isActive ?? null, sameFile:!previous || previous.file === files[0] });
        if (window.backupShareMode === 'cancel') throw new DOMException('Cancelled', 'AbortError');
        if (window.backupShareMode === 'blocked') throw new DOMException('Blocked', 'NotAllowedError');
      } });
    });
    const state = baseState();
    state.customByDay = { '2026-09-07':{ original:'keep me' } };
    state.testInstructionStore = { loads:[], documents:[], expenses:[{ id:'expense', amount:42 }] };
    await seed(page, state, [{ id:'backup-fixture', bytes:[...original] }]);
    await page.getByRole('button', { name:'Logbook', exact:true }).click();
    await page.getByRole('button', { name:'Tools', exact:true }).click();
    await page.getByRole('button', { name:/^Backup Logs/ }).click();
    const protection = () => page.evaluate(() => localStorage.getItem('owner-op-road-ready-last-device-safety-export-v1'));
    assert.equal(await protection(), null);
    await page.getByRole('button', { name:/Create VERIFIED Device Safety Backup/ }).click();
    const ready = page.getByRole('region', { name:'Backup ready to save' });
    await ready.waitFor({ timeout:30000 });
    assert.equal(await page.evaluate(() => window.backupShares.length), 0, 'preparing must not invoke native sharing');
    assert.equal(await protection(), null, 'preparing must not mark a file as saved');
    const href = await ready.getByRole('link', { name:'Download backup' }).getAttribute('href');
    // Let the first user activation expire. Saving requires a second, fresh tap.
    await page.waitForTimeout(6000);
    await ready.getByRole('button', { name:'Save / Share' }).click();
    await page.getByRole('status').filter({ hasText:'Save cancelled' }).waitFor();
    assert.equal(await ready.getByRole('link', { name:'Download backup' }).getAttribute('href'), href);
    assert.equal(await protection(), null);
    await page.evaluate(() => { window.backupShareMode = 'blocked'; });
    await ready.getByRole('button', { name:'Save / Share' }).click();
    await page.getByRole('status').filter({ hasText:'share menu could not open' }).waitFor();
    assert.equal(await protection(), null);

    const downloaded = page.waitForEvent('download');
    await ready.getByRole('link', { name:'Download backup' }).click();
    const download = await downloaded;
    const savedPath = path.join(output, name+'-complete.roadready.json');
    await download.saveAs(savedPath);
    assert.equal(await protection(), null, 'download initiation is not a verified saved copy');
    const archive = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
    assert.equal(archive.kind, 'owner_op_road_ready_device_safety_archive');
    assert.equal(archive.payloadSha256, digest(JSON.stringify(archive.payload)));
    assert.deepEqual(archive.payload.state.customByDay, state.customByDay);
    const blob = archive.payload.dexie.document_blobs.find(row => row.local_blob_id === 'backup-fixture-blob').blob;
    assert.deepEqual(Buffer.from(blob.base64, 'base64'), original);
    assert.equal(blob.sha256, digest(original));
    assert.equal(archive.inventory.documentBlobRows, 1);
    assert.equal(Object.keys(archive.payload.dexie).length, 11);
    assert.ok(archive.payload.dexie.app_snapshots.length > 0);
    assert.ok(archive.payload.localStorage.some(row => row.key === 'owner-op-road-ready-business-v1'));
    assert.equal(archive.payload.businessStore.expenses[0].amount, 42);

    const corruptPath = path.join(output, name+'-corrupt.json');
    const corrupt = structuredClone(archive);
    corrupt.payload.state.customByDay['2026-09-07'].original = 'modified';
    fs.writeFileSync(corruptPath, JSON.stringify(corrupt));
    const fileInput = page.locator('input[type=file]').first();
    await fileInput.setInputFiles(corruptPath);
    await page.getByRole('status').filter({ hasText:'checksum mismatch' }).waitFor();
    assert.equal(await protection(), null);
    await fileInput.setInputFiles(savedPath);
    await page.getByRole('status').filter({ hasText:'SAVED BACKUP VERIFIED FROM FILES' }).waitFor();
    assert.equal(JSON.parse(await protection()).sha256, archive.payloadSha256);

    await page.evaluate(() => { window.backupShareMode = 'success'; });
    await ready.getByRole('button', { name:'Save / Share' }).click();
    await page.getByRole('status').filter({ hasText:'Backup shared:' }).waitFor();
    const shares = await page.evaluate(() => window.backupShares.map(({active,sameFile}) => ({active,sameFile})));
    assert.equal(shares.length, 3);
    assert.ok(shares.every(row => row.active !== false && row.sameFile));

    // A full phone must still be able to export readable records.
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      window.restoreBackupTestPut = () => { IDBObjectStore.prototype.put = put; };
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'app_snapshots') throw new DOMException('Full device', 'QuotaExceededError');
        return put.apply(this, args);
      };
    });
    await page.getByRole('button', { name:/Export readable all-data JSON/ }).click();
    await ready.getByText(/road-ready-all-data-/).waitFor();
    await page.evaluate(() => window.restoreBackupTestPut());
    const readableDownload = page.waitForEvent('download');
    await ready.getByRole('link', { name:'Download backup' }).click();
    const readablePath = path.join(output, name+'-readable.json');
    await (await readableDownload).saveAs(readablePath);
    const readable = JSON.parse(fs.readFileSync(readablePath, 'utf8'));
    assert.equal(readable.kind, 'owner_op_road_ready_full_backup');
    assert.deepEqual(readable.state.customByDay, state.customByDay);
    assert.equal(readable.businessStore.expenses[0].amount, 42);
    assert.equal(await page.evaluate(() => window.backupShares.length), 3);
    assert.deepEqual(errors, []);
    await page.screenshot({ path:path.join(output, name+'.png'), fullPage:true });
    console.log(`PASS — ${name}: fresh save gesture, cancel/retry, original bytes, downloaded checksum, corrupt-file rejection and readable export with blocked local writes`);
  } catch (error) {
    await page.screenshot({ path:path.join(output, name+'-FAILED.png'), fullPage:true }).catch(() => {});
    fs.writeFileSync(path.join(output, name+'-failure.json'), JSON.stringify({ error:String(error), stack:error.stack, errors, text:await page.locator('body').innerText() }, null, 2));
    throw error;
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive:true, force:true });
  }
}

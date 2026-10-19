// Integrated app modules, fresh synthetic IndexedDB and only a local review URL.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readStoredZip } from '../v110431/chunkedZip.js';
const require = createRequire(import.meta.url), { chromium, webkit } = require('playwright'), { PDFDocument, decodePDFRawStream } = require('pdf-lib');
const engine = process.argv.find(arg => arg.startsWith('--browser='))?.split('=')[1] || 'chromium';
assert(['chromium', 'webkit'].includes(engine));
const previewUrl = process.env.ROAD_READY_PREVIEW_URL || 'http://127.0.0.1:3017/reliability-preview', origin = new URL(previewUrl).origin;
assert(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(previewUrl).hostname), 'Use an isolated local review server only.');
const results = '/tmp/road-ready-preview-results'; fs.mkdirSync(results, { recursive: true });
const errors = [], externalRequests = [], accesses = [], checkpoints = [], hash = bytes => createHash('sha256').update(bytes).digest('hex');
let browser, page;
const mark = label => { checkpoints.push(label); console.log(`PASS ${engine}: ${label}`); };
async function sampleSnapshot() {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('road-ready-review-sandbox-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const read = store => new Promise((resolve, reject) => { const request = db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const [state, docs, originals] = await Promise.all(['sample_state', 'documents_local', 'document_blobs'].map(read));
      return { sample: state.find(row => row.key === 'sample')?.value || null, documents: docs, originals: originals.map(({ blob, content, blob_buffer, ...row }) => row) };
    } finally { db.close(); }
  });
}
// This is a text check for our known Helvetica sample PDFs, not an OCR parser.
async function samplePdfText(bytes) {
  const pdf=await PDFDocument.load(bytes);
  return pdf.getPages().map(page=>page.node.Contents().asArray().map(ref=>Buffer.from(decodePDFRawStream(pdf.context.lookup(ref)).decode()).toString('latin1').replace(/<([a-f0-9]+)>/gi,(_,hex)=>Buffer.from(hex,'hex').toString('latin1'))).join('\n')).join('\n');
}
async function screenshot(name, width = 390, height = 844, fullPage = true) { await page.setViewportSize({ width, height }); await page.screenshot({ path: path.join(results, `preview-${engine}-${name}.png`), fullPage }); }
async function checkLayout(width) {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 1180 });
  const problems = await page.evaluate(() => [...document.querySelectorAll('.rr-review button,.rr-review input,.rr-review select,.rr-review textarea')].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden').map(node => ({ text: node.getAttribute('aria-label') || node.textContent?.slice(0, 70) || node.tagName, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })).filter(rect => rect.left < -1 || rect.right > innerWidth + 1));
  assert.deepEqual(problems, [], `Interactive controls fit ${width}px, including clipped containers.`);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
}
async function downloadFrom(button, filename) {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const local = path.join(results, `${engine}-${filename}`); await download.saveAs(local); return fs.readFileSync(local);
}
try {
  browser = await ({ chromium, webkit }[engine]).launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Tirane', acceptDownloads: true, serviceWorkers: 'block' });
  await context.route('**/*', route => { const url = route.request().url(); if (new URL(url).origin !== origin) { externalRequests.push(url); return route.abort(); } return route.continue(); });
  await context.exposeBinding('__reviewAccess', (_source, value) => accesses.push(value));
  await context.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) { const original = Storage.prototype[method]; Storage.prototype[method] = function (...args) { void window.__reviewAccess({ type: 'storage', method, key: String(args[0] || '') }); return original.apply(this, args); }; }
    for (const method of ['open', 'deleteDatabase']) { const original = IDBFactory.prototype[method]; IDBFactory.prototype[method] = function (...args) { void window.__reviewAccess({ type: 'database', method, key: String(args[0]) }); return original.apply(this, args); }; }
  });
  page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const areas = page.getByRole('navigation', { name: 'Review areas', exact: true }), area = name => areas.getByRole('button', { name, exact: true });
  await page.getByRole('button', { name: 'Import sample RateCon', exact: true }).waitFor(); await checkLayout(390); await screenshot('documents-empty-phone');
  await page.getByRole('button', { name: 'Try uncertain reading', exact: true }).click();
  const reading = page.getByRole('region', { name: 'Review sample RateCon', exact: true }); await reading.waitFor();
  assert.equal(await reading.getByRole('button', { name: 'Confirm & save sample', exact: true }).isEnabled(), false);
  assert(await reading.getByText(/Needs source confirmation|Low-confidence reading/).count() > 0);
  await reading.getByRole('button', { name: 'Cancel import', exact: true }).click(); assert.equal((await sampleSnapshot()).documents.length, 0);
  await page.getByRole('button', { name: 'Import sample RateCon', exact: true }).click(); await reading.waitFor();
  for (const [label, expected] of [['Broker', 'EXAMPLE FREIGHT LLC'], ['Load number', 'TEST-80173'], ['PO', 'PO-64318'], ['Pickup date', '2026-10-16'], ['Delivery date', '2026-10-19']]) assert.equal(await reading.getByLabel(label, { exact: true }).inputValue(), expected, label);
  assert.match(await reading.getByLabel('Pickup address', { exact: true }).inputValue(), /123 Example Rd/); assert.match(await reading.getByLabel('Delivery address', { exact: true }).inputValue(), /456 Sample St/); assert.match(await reading.getByLabel('Carrier amount', { exact: true }).inputValue(), /2350/);
  const firstBytes = await downloadFrom(reading.getByRole('button', { name: 'Open 2-page original', exact: true }), 'ratecon-original.pdf'); assert.equal((await PDFDocument.load(firstBytes)).getPageCount(), 2);
  await reading.getByRole('checkbox', { name: 'I checked these fields and the page boundaries against the original.', exact: true }).check(); await checkLayout(390); await screenshot('reader-confirm-phone');
  await reading.getByRole('button', { name: 'Confirm & save sample', exact: true }).click();
  const load = page.getByRole('region', { name: 'Load TEST-80173', exact: true }); await load.waitFor();
  const docCard = label => load.locator('.rr-review-docs article').filter({ has: page.getByText(label, { exact: true }) });
  let snapshot = await sampleSnapshot(); assert.equal(snapshot.sample.loads.length, 1); assert.equal(snapshot.documents.length, 1); assert.equal(snapshot.originals.length, 1); assert.equal(snapshot.sample.logbook.eventsByDay['2026-10-15'][0].endMin, 1440);
  const loadId = snapshot.sample.loads[0].id, rawLogs = structuredClone(snapshot.sample.logbook.eventsByDay);
  const storedBytes = await downloadFrom(docCard('RateCon').getByRole('button', { name: 'Open original', exact: true }), 'reopened-ratecon.pdf'); assert.equal(hash(storedBytes), hash(firstBytes));
  await docCard('RateCon').getByRole('button', { name: 'Reimport renamed file', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Content matched.' }).waitFor();
  snapshot = await sampleSnapshot(); assert.equal(snapshot.documents.length, 1); assert.equal(snapshot.originals.length, 1);
  mark('two-page Reader review, confirmed save, exact original reopen and content-based renamed-file reuse');
  assert.equal(await load.getByRole('button', { name: 'Add Lumper', exact: true }).count(), 0); assert.equal(await docCard('Fuel receipt').count(), 0); assert.equal(await docCard('Other').count(), 0);
  await load.getByRole('checkbox', { name: 'Lumper applies to this load', exact: true }).click(); await load.getByRole('button', { name: 'Add Lumper', exact: true }).waitFor(); await load.getByRole('checkbox', { name: 'Lumper applies to this load', exact: true }).click(); await load.getByRole('button', { name: 'Add Lumper', exact: true }).waitFor({state:'hidden'});
  await load.getByRole('button', { name: 'Add BOL', exact: true }).click(); await docCard('BOL').getByRole('button', { name: 'Open original', exact: true }).waitFor();
  await load.getByRole('button', { name: 'Add POD', exact: true }).click(); await docCard('POD').getByRole('button', { name: 'Open original', exact: true }).waitFor();
  await load.getByRole('button', { name: 'Add fuel receipt', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Fuel receipt saved directly' }).waitFor();
  snapshot = await sampleSnapshot(); assert.equal(snapshot.documents.length, 4); assert.equal(snapshot.originals.length, 4);
  const fuelOriginal=await downloadFrom(docCard('Fuel receipt').getByRole('button',{name:'Open original',exact:true}),'reopened-fuel.pdf'); assert.equal(hash(fuelOriginal),snapshot.documents.find(row=>row.type==='fuel').sha256); assert.equal((await PDFDocument.load(fuelOriginal)).getPageCount(),1);
  const bol = snapshot.documents.find(row => row.type === 'bol'), pod = snapshot.documents.find(row => row.type === 'pod'); assert.notEqual(bol.sha256, pod.sha256, 'Unsigned BOL and signed POD are distinct content.');
  for (const row of [bol, pod]) { assert.equal(row.load_no, 'TEST-80173'); assert.equal(row.evidenceFilingV1.category, row.type); assert.equal(row.evidenceFilingV1.confirmed, false); } assert.equal(pod.evidenceFilingV1.date, '2026-10-19');
  await page.reload(); await load.waitFor(); await page.getByLabel('Document week', { exact: true }).selectOption('2026-10-19'); await load.waitFor();
  snapshot = await sampleSnapshot(); assert.equal(snapshot.sample.loads.length, 1); assert.equal(snapshot.sample.loads[0].id, loadId); assert.equal(snapshot.documents.length, 4);
  await checkLayout(390); await screenshot('documents-saved-phone'); await checkLayout(820); await screenshot('documents-saved-tablet', 820, 1180);
  mark('Add BOL/POD scope and versions, inactive Lumper, durable reload and the same load across weeks');
  await area('Hours & Chicago').click(); await page.getByRole('heading', { name: 'Hours that agree with the log', exact: true }).waitFor(); await page.getByText('The recorded split pair is complete.', { exact: false }).waitFor();
  assert.equal(await page.locator('.rr-review-clockgrid strong').getByText('Review', { exact: true }).count(), 0, 'Known 34h prior rest supplies cycle history.'); assert.match(await page.locator('.rr-review-clockgrid').innerText(), /h \d+m/);
  await page.getByLabel('Example moment', { exact: true }).selectOption('pending'); await page.getByText('Split sleeper is pending.', { exact: false }).waitFor(); await page.getByLabel('Example moment', { exact: true }).selectOption('complete');
  await checkLayout(390); await screenshot('hours-phone'); await checkLayout(820); await screenshot('hours-tablet', 820, 1180);
  await page.getByRole('button', { name: 'Review Chicago time', exact: true }).click(); const zone = page.locator('.timezone-sheet'); await zone.getByLabel('IANA time zone', { exact: true }).fill('America/Chicago'); await zone.getByRole('button', { name: 'Review proposal', exact: true }).click(); assert.match(await zone.innerText(), /60 minutes of gap/);
  await checkLayout(390); await zone.getByRole('button',{name:'Save pending America/Chicago proposal',exact:true}).scrollIntoViewIfNeeded(); await screenshot('chicago-proposal-phone',390,844,false); await zone.getByRole('button', { name: 'Save pending America/Chicago proposal', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Chicago proposal saved' }).waitFor();
  snapshot = await sampleSnapshot(); assert.deepEqual(snapshot.sample.logbook.eventsByDay, rawLogs); assert.equal(snapshot.sample.logbook.homeTerminalTimeZone, 'America/New_York'); assert.equal(snapshot.sample.logbook.homeTerminalTimeZoneChangeProposal.timeZone, 'America/Chicago'); assert.equal(snapshot.sample.logbook.homeTerminalTimeZoneChangeProposal.effectiveAt, null);
  mark('complete/pending sleeper example with known restart history and pending Chicago proposal without changed logs');
  await page.locator('.rr-review-events button').filter({ hasText: '05:00–08:00' }).click(); const editor = page.locator('.sheet.editor-ui-v110'); await editor.getByRole('button', { name: 'Save changes', exact: true }).waitFor(); await editor.getByLabel('Notes', { exact: true }).fill('Synthetic reviewer verified the original pre-trip record.');
  assert.equal(await editor.getByRole('button', { name: 'Save changes', exact: true }).isEnabled(), false); await editor.getByText('I approve the changes shown for 2026-10-17.', { exact: false }).waitFor();
  assert.equal(await editor.locator('.hos-preview-review').first().evaluate(node=>getComputedStyle(node).color),'rgb(118, 73, 11)','The impact warning stays readable on its light background.');
  await checkLayout(390); await editor.getByText('I approve the changes shown for 2026-10-17.',{exact:false}).scrollIntoViewIfNeeded(); await screenshot('edit-proposal-phone',390,844,false); await checkLayout(820); await editor.getByText('I approve the changes shown for 2026-10-17.',{exact:false}).scrollIntoViewIfNeeded(); await screenshot('edit-proposal-tablet',820,1180,false); await editor.getByRole('button', { name: 'Cancel', exact: true }).click(); assert.deepEqual((await sampleSnapshot()).sample.logbook.eventsByDay, rawLogs);
  await page.locator('.rr-review-events button').filter({ hasText: '05:00–08:00' }).click(); await editor.getByLabel('Notes', { exact: true }).fill('Synthetic reviewer verified the original pre-trip record.'); await editor.getByRole('checkbox', { name: 'I approve the changes shown for 2026-10-17. Keep the previous version in edit history.', exact: true }).check(); await editor.getByRole('button', { name: 'Save changes', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Sample edit saved with its change history.' }).waitFor();
  snapshot = await sampleSnapshot(); assert.equal(snapshot.sample.logbook.logbookEditHistoryByDay['2026-10-17'].length, 1); assert.match(snapshot.sample.logbook.eventsByDay['2026-10-17'].find(row => row.id === 'pretrip').note, /Synthetic reviewer/);
  for (const [day, events] of Object.entries(rawLogs)) for (const old of events) { const next = snapshot.sample.logbook.eventsByDay[day].find(row => row.id === old.id); assert.equal(next.startMin, old.startMin); assert.equal(next.endMin, old.endMin); assert.equal(next.status, old.status); }
  mark('historical edit preview, cancel preservation, explicit approval and retained edit history');
  await area('Audit preparation').click(); const audit = page.getByRole('region', { name: 'Audit preparation', exact: true }); const auditCard = title => audit.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) }), fuel = () => auditCard('Fuel purchases and tax-paid evidence');
  await fuel().getByText('Applicability unconfirmed', { exact: true }).waitFor(); await audit.getByRole('button', { name: 'Company & applicability', exact: true }).click();
  for (const [label, value] of [['Legal company name', 'EXAMPLE CARRIER LLC'], ['Profile applies from', '2026-01-01'], ['Operating jurisdictions', 'IL, NJ, NY, WI'], ['Vehicles / fleet in this company scope', '228, 229'], ['IFTA base jurisdiction (code)', 'IL'], ['IRP base jurisdiction (code)', 'NJ'], ['Source or reference used to confirm this profile', 'Synthetic profile for isolated sample testing only'], ['Confirmed by', 'Sample Reviewer']]) await audit.getByLabel(label, { exact: true }).fill(value);
  await audit.getByLabel('Operations', { exact: true }).selectOption('interstate_property'); await audit.getByLabel('IFTA applicability', { exact: true }).selectOption('required'); await audit.getByLabel('IRP applicability', { exact: true }).selectOption('required'); await audit.getByLabel('CDL / Part 382 applies in this company scope', { exact: true }).selectOption('yes'); await audit.getByRole('button', { name: 'Save confirmed profile', exact: true }).click();
  await audit.getByLabel('Week of', { exact: true }).fill('2026-10-19'); await audit.getByLabel('Vehicle / unit', { exact: true }).fill('228'); await fuel().getByRole('button', { name: 'Review evidence', exact: true }).click(); await audit.getByLabel('Review result', { exact: true }).selectOption('checked');
  await audit.locator('.rr-audit-source').filter({ hasText: 'sample-fuel-TEST-80173-228.pdf' }).locator('input[type=checkbox]').check(); const questions = audit.getByRole('group', { name: 'Confirm content against the selected originals', exact: true }).locator('input[type=checkbox]'); for (let i = 0; i < await questions.count(); i++) await questions.nth(i).check();
  await audit.getByLabel('Notes / reason / unresolved items', { exact: true }).fill('Synthetic example assumes this is the only fuel purchase in the selected unit/week; confirmed against the sample source.'); await audit.getByRole('button', { name: 'Save evidence review', exact: true }).click(); await fuel().getByText('Evidence checked', { exact: true }).waitFor(); snapshot = await sampleSnapshot(); assert.equal(snapshot.sample.business.auditEvidenceReviewsV1.length, 1);
  await page.reload(); await area('Audit preparation').click(); await fuel().getByText('Evidence checked', { exact: true }).waitFor(); await audit.getByRole('button', { name: 'Next audit week', exact: true }).click(); assert.equal(await fuel().getByText('Evidence checked', { exact: true }).count(), 0); await audit.getByRole('button', { name: 'Previous audit week', exact: true }).click(); await fuel().getByText('Evidence checked', { exact: true }).waitFor();
  await audit.getByLabel('Vehicle / unit', { exact: true }).fill('229'); assert.equal(await fuel().getByText('Evidence checked', { exact: true }).count(), 0); await fuel().getByRole('button', { name: 'Add fuel evidence', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Fuel receipt saved directly to the selected audit scope.' }).waitFor(); snapshot = await sampleSnapshot(); const unit229 = snapshot.documents.find(row => row.type === 'fuel' && row.evidenceFilingV1.unit === '229'); assert(unit229); assert.equal(unit229.evidenceFilingV1.loadNo, '');
  await auditCard('Quarterly return and payment confirmation').getByRole('button', { name: 'Add evidence', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Other saved directly to the selected audit scope.' }).waitFor(); snapshot = await sampleSnapshot(); const companyDoc = snapshot.documents.find(row => row.type === 'other'); assert(companyDoc); assert.equal(companyDoc.evidenceFilingV1.unit, ''); assert.equal(companyDoc.evidenceFilingV1.loadNo, '');
  await audit.getByLabel('Vehicle / unit', { exact: true }).fill('228'); await checkLayout(390); await screenshot('audit-phone'); await checkLayout(820); await screenshot('audit-tablet', 820, 1180);
  await audit.getByRole('navigation', { name: 'Audit areas', exact: true }).getByRole('button', { name: 'Safety', exact: true }).click(); await auditCard('Duty records and supporting evidence').waitFor(); await checkLayout(390); await audit.getByRole('navigation', { name: 'Audit areas', exact: true }).getByRole('button', { name: 'IRP', exact: true }).click(); await auditCard('Cab card and registration validity').waitFor(); await checkLayout(820);
  mark('separate audit views, confirmed applicability, review reload, scope/week isolation and exact vehicle/company Add');
  await area('Sync').click(); await page.getByRole('button', { name: 'Offline → online', exact: true }).click(); await page.getByRole('button', { name: 'Reconnect sample', exact: true }).waitFor(); assert.match(await page.locator('.rr-review-synclog').innerText(), /0 checks/); await page.getByRole('button', { name: 'Reconnect sample', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.rr-review-synclog')?.textContent.includes('records → all'));
  await page.getByRole('button', { name: '40 quick saves', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.rr-review-synclog')?.textContent.includes('2 checks · records → all')); await checkLayout(390); await screenshot('sync-phone'); mark('offline pending saves and reconnect/burst coalescing through the actual scheduler');
  await area('Documents').click(); assert.equal(await docCard('Other').count(),0,'Company evidence is not assigned to a load.'); const beforeExport = await sampleSnapshot(); const archive = await downloadFrom(page.getByRole('button', { name: 'Export & check sample restore', exact: true }), 'review-sample.zip'); await page.getByRole('status').filter({ hasText: 'Export checked and restored separately:' }).waitFor();
  const zip = await readStoredZip(new Blob([archive])), manifest = JSON.parse(await zip.get('review-manifest.json').blob.text()); assert.equal(manifest.sampleOnly, true); assert.equal(manifest.filings.length, 6); assert.equal(manifest.originals.length, 6); assert.equal(manifest.loads.length, 1); assert.equal(manifest.loads[0].id, loadId); assert.equal(manifest.business.auditEvidenceReviewsV1.length, 1); assert.equal(manifest.logbook.logbookEditHistoryByDay['2026-10-17'].length, 1); assert.equal(manifest.logbook.homeTerminalTimeZone, 'America/New_York');
  for (const original of manifest.originals) assert.equal(hash(Buffer.from(await zip.get(original.path).blob.arrayBuffer())), original.sha256); const rate = manifest.filings.find(row => row.type === 'rate_confirmation'); assert.equal((await PDFDocument.load(await zip.get(rate.originalPath).blob.arrayBuffer())).getPageCount(), 2); assert.equal(hash(Buffer.from(await zip.get(rate.originalPath).blob.arrayBuffer())), hash(firstBytes));
  const vehicleSource=manifest.filings.find(row=>row.type==='fuel'&&row.evidenceFilingV1.unit==='229'), companySource=manifest.filings.find(row=>row.type==='other');
  const vehicleText=await samplePdfText(await zip.get(vehicleSource.originalPath).blob.arrayBuffer()),companyText=await samplePdfText(await zip.get(companySource.originalPath).blob.arrayBuffer());
  assert.match(vehicleText,/Unit: 229/); assert.match(vehicleText,/Scope: Vehicle evidence/); assert.doesNotMatch(vehicleText,/Unit: 228|TEST-80173/);
  assert.match(companyText,/Scope: Company evidence/); assert.match(companyText,/Vehicle scope: Company \/ fleet/); assert.doesNotMatch(companyText,/Unit: 228|Unit: 229|TEST-80173/);
  assert.deepEqual((await sampleSnapshot()).sample, beforeExport.sample, 'Separate restore does not replace the working sample.'); const databases = await page.evaluate(() => indexedDB.databases()); assert(databases.every(row => row.name === 'road-ready-review-sandbox-v1'));
  assert(accesses.some(row => row.type === 'database' && row.method === 'open' && row.key.startsWith('road-ready-review-restore-'))); assert(accesses.some(row => row.type === 'database' && row.method === 'deleteDatabase' && row.key.startsWith('road-ready-review-restore-')));
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []); assert.deepEqual(accesses.filter(row => row.type === 'database' && row.key !== 'road-ready-review-sandbox-v1' && !row.key.startsWith('road-ready-review-restore-')), []); assert.deepEqual(accesses.filter(row => row.type === 'storage' && row.key !== 'road-ready-review-audit-view-v1' && !row.key.startsWith('__next_debug_channel:')), []);
  await checkLayout(390); await screenshot('export-verified-phone'); await checkLayout(820); await screenshot('export-verified-tablet', 820, 1180); mark('ZIP hashes/pages/filings, isolated restore/reopen, unchanged sample, no external requests or real account storage');
  fs.writeFileSync(path.join(results, `preview-${engine}-results.json`), JSON.stringify({ engine, previewUrl, checkpoints, errors, externalRequests, storageKeys: [...new Set(accesses.map(row => row.key))] }, null, 2));
} catch (error) {
  console.error('Completed checkpoints:', checkpoints); console.error('Page errors:', errors); console.error('External requests:', externalRequests);
  if (page && !page.isClosed()) { console.error((await page.locator('body').innerText()).slice(-12000)); await screenshot('failure'); } throw error;
} finally { await browser?.close(); }

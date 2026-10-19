// Actual audit UI + storage + packet module, fulfilled only from a temporary local fixture.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { transform, loadBindings } from 'next/dist/build/swc/index.js';
import { makeFixture, originalText } from './testFixture.mjs';
import { readStoredZip } from '../v110431/chunkedZip.js';

const require = createRequire(import.meta.url), { chromium, webkit } = require('playwright');
const engineName = process.argv.find(arg => arg.startsWith('--browser='))?.split('=')[1] || 'chromium';
assert(['chromium', 'webkit'].includes(engineName));
const fixture = await makeFixture(), errors = [], requests = [];
const hash = value => createHash('sha256').update(value).digest('hex');
const insuranceText = '%PDF-1.4\nSynthetic insurance: truck 228, carrier Synthetic Carrier LLC. 2025-12-15 through 2026-12-14\n%%EOF';
const rows = [
  { id: 'doc/fuel-1', kind: 'document', name: 'Synthetic-fuel.pdf', category: 'fuel', date: '2026-10-19', unit: '228', loadNo: 'A100', source: { local_id: 'fuel-1', sha256: hash(originalText), file_size_bytes: originalText.length } },
  { id: 'doc/insurance-1', kind: 'document', name: 'Synthetic-insurance.pdf', category: 'insurance', date: '2025-12-15', unit: '228', loadNo: '', source: { local_id: 'insurance-1', sha256: hash(insuranceText), file_size_bytes: insuranceText.length } },
];
const protectedState = { activeDriverId: 'driver-a', homeTimezone: 'America/Chicago', teamDrivers: [{ id: 'driver-a', name: 'Synthetic Driver' }], eventsByDay: { '2026-10-19': [{ id: 'protected-event', status: 'SB', startMin: 0, endMin: 600 }] }, signatureByDay: { '2026-10-19': { signed: true } }, motive: { unchanged: true } };
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
await loadBindings();
const input = fs.readFileSync(path.join(fixture.owner, 'AuditReadinessV1.jsx'), 'utf8').replace("from 'react'", "from '/react-shim.js'").replace("import './auditReadinessV1.css';", '');
const compiled = await transform(input, { filename: 'AuditReadinessV1.jsx', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } }, target: 'es2020' }, module: { type: 'es6' } });
fs.writeFileSync(path.join(fixture.owner, 'AuditReadinessV1.js'), compiled.code);
fs.copyFileSync(path.join(path.dirname(require.resolve('react')), 'umd/react.production.min.js'), path.join(fixture.root, 'react.js'));
fs.copyFileSync(path.join(path.dirname(require.resolve('react-dom')), 'umd/react-dom.production.min.js'), path.join(fixture.root, 'react-dom.js'));
fs.writeFileSync(path.join(fixture.root, 'react-shim.js'), 'const React=window.React;export default React;export const {useEffect,useMemo,useRef,useState}=React;');
fs.writeFileSync(path.join(fixture.root, 'entry.js'), `import AuditReadiness from './source/src/modules/owneros/AuditReadinessV1.js';
window.__protectedState=${json(protectedState)};window.__auditOriginals={'fuel-1':new Blob([${json(originalText)}],{type:'application/pdf'}),'insurance-1':new Blob([${json(insuranceText)}],{type:'application/pdf'})};window.__opened=[];
ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(AuditReadiness,{rows:${json(rows)},state:window.__protectedState,onOpen:row=>window.__opened.push(row.id),onAdd:request=>{window.__addRequest=request;}}));`);
fs.writeFileSync(path.join(fixture.root, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Road Ready isolated audit fixture</title><link rel="stylesheet" href="/source/src/modules/owneros/auditReadinessV1.css"><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#f5f8f9;font-family:system-ui}#app{max-width:1050px;margin:auto}</style></head><body><div id="app"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script type="module" src="/entry.js"></script></body></html>');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
// Loopback is a trustworthy WebCrypto origin. Playwright fulfills every request;
// no server, production connection or network access is required.
const origin = 'http://127.0.0.1:43851';
let browser, page;
const results = '/tmp/road-ready-audit-browser-results'; fs.mkdirSync(results, { recursive: true });
try {
  browser = await ({ chromium, webkit }[engineName]).launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Tirane', acceptDownloads: true, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = route.request().url(); requests.push(url);
    if (!url.startsWith(origin + '/')) return route.abort();
    const pathname = decodeURIComponent(new URL(url).pathname), file = path.resolve(fixture.root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(fixture.root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'Not found' });
    return route.fulfill({ status: 200, contentType: mime[path.extname(file)] || 'application/octet-stream', headers: { 'Cache-Control': 'no-store' }, body: fs.readFileSync(file) });
  });
  page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(15000);
  await page.goto(origin); const audit = page.getByRole('region', { name: 'Audit preparation', exact: true });
  await audit.getByRole('heading', { name: 'Audit preparation', exact: true }).waitFor();
  const card = title => audit.locator('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  const fuelCard = () => card('Fuel purchases and tax-paid evidence');
  await fuelCard().getByText('Applicability unconfirmed', { exact: true }).waitFor();
  await audit.getByRole('button', { name: 'Company & applicability', exact: true }).click();
  for (const [label, value] of [['Legal company name', 'Synthetic Carrier LLC'], ['Profile applies from', '2026-01-01'], ['Operating jurisdictions', 'IL, NJ, PA'], ['Vehicles / fleet in this company scope', '228, 229'], ['IFTA base jurisdiction (code)', 'IL'], ['IRP base jurisdiction (code)', 'NJ'], ['Source or reference used to confirm this profile', 'Synthetic source records for local test'], ['Confirmed by', 'Synthetic Reviewer']]) await audit.getByLabel(label, { exact: true }).fill(value);
  await audit.getByLabel('Operations', { exact: true }).selectOption('interstate_property');
  await audit.getByLabel('IFTA applicability', { exact: true }).selectOption('required'); await audit.getByLabel('IRP applicability', { exact: true }).selectOption('required');
  await audit.getByLabel('CDL / Part 382 applies in this company scope', { exact: true }).selectOption('yes');
  await audit.getByRole('button', { name: 'Save confirmed profile', exact: true }).click();
  await audit.getByLabel('Week of', { exact: true }).fill('2026-10-19'); await audit.getByLabel('Vehicle / unit', { exact: true }).fill('228');
  await fuelCard().getByRole('button', { name: 'Review evidence', exact: true }).click();
  await audit.getByLabel('Review result', { exact: true }).selectOption('checked');
  await audit.locator('.rr-audit-source').filter({ hasText: 'Synthetic-fuel.pdf' }).locator('input[type=checkbox]').check();
  await audit.getByRole('button', { name: 'Original', exact: true }).click(); assert.deepEqual(await page.evaluate(() => window.__opened), ['doc/fuel-1']);
  const questions = audit.getByRole('group', { name: 'Confirm content against the selected originals', exact: true }).locator('input[type=checkbox]'); for (let i = 0; i < await questions.count(); i++) await questions.nth(i).check();
  await audit.getByRole('button', { name: 'Save evidence review', exact: true }).click(); await fuelCard().getByText('Evidence checked', { exact: true }).waitFor();
  await page.reload(); await fuelCard().getByText('Evidence checked', { exact: true }).waitFor();
  await fuelCard().getByRole('button', { name: 'Review / history', exact: true }).click(); await audit.getByLabel('Notes / reason / unresolved items', { exact: true }).fill('Second review after reopening.'); await audit.getByRole('button', { name: 'Save evidence review', exact: true }).click(); await fuelCard().getByText('Evidence checked', { exact: true }).waitFor();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('owner-op-road-ready-business-v1'))); assert.equal(stored.auditEvidenceReviewsV1[0].history.length, 2);
  await audit.getByRole('button', { name: 'Next audit week', exact: true }).click(); assert.equal(await fuelCard().getByText('Evidence checked', { exact: true }).count(), 0); await audit.getByRole('button', { name: 'Previous audit week', exact: true }).click(); await fuelCard().getByText('Evidence checked', { exact: true }).waitFor();
  await audit.getByRole('button', { name: 'Prepare evidence ZIP', exact: true }).click(); const saveZip = audit.getByRole('link', { name: 'Save ZIP with audit review index', exact: true }); await saveZip.waitFor();
  const [download] = await Promise.all([page.waitForEvent('download'), saveZip.click()]), zip = await readStoredZip(new Blob([fs.readFileSync(await download.path())]));
  const manifest = JSON.parse(await zip.get('manifest.json').blob.text()), index = JSON.parse(await zip.get('Audit-readiness.json').blob.text()); assert.equal(manifest.originals, 1); assert.equal(index.counts.checked, 1); assert.equal(await zip.get(manifest.records[0].path).blob.text(), originalText);
  for (const width of [320, 390, 820]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No horizontal overflow at ${width}px`); }
  await audit.getByRole('navigation', { name: 'Audit areas' }).getByRole('button', { name: 'IRP', exact: true }).click();
  const insuranceCard = () => card('Insurance evidence for the registration'); await insuranceCard().getByRole('button', { name: 'Review evidence', exact: true }).click();
  await audit.getByLabel('Review result', { exact: true }).selectOption('checked'); await audit.locator('.rr-audit-source').filter({ hasText: 'Synthetic-insurance.pdf' }).locator('input[type=checkbox]').check();
  await audit.getByLabel('Evidence covers from', { exact: true }).fill('2025-12-15'); await audit.getByLabel('Evidence covers through / expires', { exact: true }).fill('2026-12-14');
  for (let i = 0; i < await questions.count(); i++) await questions.nth(i).check(); await audit.getByRole('button', { name: 'Save evidence review', exact: true }).click(); await insuranceCard().getByText('Evidence checked', { exact: true }).waitFor();
  await audit.getByLabel('Week of', { exact: true }).fill('2026-12-14'); await insuranceCard().getByText('Expires during this week', { exact: true }).waitFor();
  await card('Cab card and registration validity').getByRole('button', { name: 'Add evidence', exact: true }).click(); assert.deepEqual(await page.evaluate(() => window.__addRequest), { category: 'registration', unit: '228', loadNo: '', auditRequirement: 'irp-card' });
  await audit.getByRole('navigation', { name: 'Audit areas' }).getByRole('button', { name: 'IFTA', exact: true }).click(); await audit.getByLabel('Load filter (optional)', { exact: true }).fill('A100'); await fuelCard().getByRole('button', { name: 'Add fuel evidence', exact: true }).click(); assert.deepEqual(await page.evaluate(() => window.__addRequest), { category: 'fuel', unit: '228', loadNo: 'A100', auditRequirement: 'ifta-fuel' }); await audit.getByLabel('Load filter (optional)', { exact: true }).fill('');
  await audit.getByRole('navigation', { name: 'Audit areas' }).getByRole('button', { name: 'Safety', exact: true }).click(); await audit.getByLabel('Driver', { exact: true }).selectOption('driver-a');
  assert.deepEqual(await page.evaluate(() => window.__protectedState), protectedState); assert.deepEqual(errors, []); assert(requests.every(url => url.startsWith(origin + '/')));
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(results, 'audit-' + engineName + '-phone.png'), fullPage: true }); await page.setViewportSize({ width: 820, height: 1180 }); await page.screenshot({ path: path.join(results, 'audit-' + engineName + '-tablet.png'), fullPage: true });
  console.log(`PASS ${engineName} — unknown applicability, profile confirmation, original review, save/reopen/history, scoped weeks, ZIP bytes/index, prior-year credential/expiration, exact Add category/unit/load, protected logs and 320/390/820px layout`);
} catch (error) { if (page && !page.isClosed()) { console.error('Page errors:', errors); await page.screenshot({ path: path.join(results, 'audit-' + engineName + '-failure.png'), fullPage: true }); } throw error;
} finally { await browser?.close(); fixture.cleanup(); }

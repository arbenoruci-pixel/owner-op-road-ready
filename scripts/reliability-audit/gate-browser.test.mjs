// Actual AccountSyncGate + actual scheduler/status reducer; sync outcomes are
// synthetic. This fixture deliberately does not model or change authorization.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transform, loadBindings } from 'next/dist/build/swc/index.js';

const require = createRequire(import.meta.url), { chromium, webkit } = require('playwright');
const engineName = process.argv.find(arg => arg.startsWith('--browser='))?.split('=')[1] || 'chromium';
assert(['chromium', 'webkit'].includes(engineName));
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), owned = fs.mkdtempSync(path.join(os.tmpdir(), 'road-ready-gate-ui-'));
const sync = path.join(repo, 'scripts/reliability-sync'), origin = 'http://127.0.0.1:43952', output = '/tmp/road-ready-audit-browser-results';
const write = (file, text) => fs.writeFileSync(path.join(owned, file), text);
for (const [from, to] of [['scheduler.js', 'scheduler.js'], ['snapshot.js', 'snapshot.js'], ['sync.css', 'sync.css']]) fs.copyFileSync(path.join(sync, from), path.join(owned, to));
fs.copyFileSync(path.join(repo, 'scripts/v110455/accountCore.js'), path.join(owned, 'accountCoreV110455.js'));
fs.copyFileSync(path.join(path.dirname(require.resolve('react')), 'umd/react.production.min.js'), path.join(owned, 'react.js'));
fs.copyFileSync(path.join(path.dirname(require.resolve('react-dom')), 'umd/react-dom.production.min.js'), path.join(owned, 'react-dom.js'));
write('react-shim.js', 'const React=window.React;export default React;export const {useEffect,useRef,useState}=React;');
write('business.js', "export const BUSINESS_STORE_KEY='owner-op-road-ready-business-v1';");
write('sync.js', `import {statusTransition} from './snapshot.js';
export const ACCOUNT_EVENT='road-ready-account-sync';let status={phase:'idle',message:'Checking synthetic account data…'};
export const accountStatus=()=>status;export const requestRecordPriority=()=>{};
export function emit(patch){const transition=statusTransition(status,patch);status=transition.next;if(transition.changed)window.dispatchEvent(new CustomEvent(ACCOUNT_EVENT,{detail:status}));}
export function syncAccount(options){window.__gate.calls.push(structuredClone(options));return window.__gate.respond(options,emit);}`);
await loadBindings();
let component = fs.readFileSync(path.join(sync, 'AccountSyncGate.jsx'), 'utf8')
  .replace("from 'react'", "from './react-shim.js'")
  .replace("from '../../../../lib/owner-op-cloud/accountSyncV110455.js'", "from './sync.js'")
  .replace("from '../../../../lib/owner-op-cloud/syncSchedulerReliability.js'", "from './scheduler.js'")
  .replace("from '../../../../lib/owner-op-cloud/accountCoreV110455.js'", "from './accountCoreV110455.js'")
  .replace("from '../business/businessStore.js'", "from './business.js'")
  .replace("import './syncReliability.css';", '');
write('gate.js', (await transform(component, { filename: 'AccountSyncGate.jsx', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'classic' } }, target: 'es2020' }, module: { type: 'es6' } })).code);
write('entry.js', `import Gate from './gate.js';
const scenario=new URL(location.href).searchParams.get('scenario');
const key=JSON.stringify(['day','synthetic-driver','2026-10-19']);
const original={id:'synthetic-event',status:'OFF',startMin:0,endMin:60,note:'Original local annotation'};
const first={key,local:{eventsByDay:[original]},remote:{eventsByDay:[{...original,endMin:90,note:'First account annotation'}]}};
const latest={key,local:first.local,remote:{eventsByDay:[{...original,endMin:95,note:'Latest account annotation'}]}};
window.__protectedLog={eventsByDay:{'2026-10-19':[original]},signatureByDay:{'2026-10-19':{signed:true}}};
let release;const initial=new Promise(resolve=>release=resolve);
const f=window.__gate={calls:[],releaseInitial:()=>release(),confirmations:0,accepted:0,conflictKey:key};
f.respond=async(options,emit)=>{
 if(f.calls.length===1)await initial;
 if(scenario==='handoff'){
  if(options.scope==='records'){emit({phase:'records_current',scope:'records',message:'Verified synthetic logbook is ready.',conflicts:[]});return {recordsReady:true,handoffPending:true,archivePending:true};}
  emit({phase:'error',scope:'all',message:'Synthetic original is temporarily unavailable.',conflicts:[]});return {error:'Synthetic original is temporarily unavailable.',canOpenLocal:true,blocked:false};
 }
 if(scenario==='failed-records'){emit({phase:'error',scope:'records',message:'Synthetic logbook handoff has not completed.',conflicts:[]});return {error:'Synthetic logbook handoff has not completed.',canOpenLocal:false,blocked:true};}
 if(scenario==='conflicts'){
  if(!options.choices){emit({phase:'conflict',scope:'records',message:'Saved versions differ.',conflicts:[first]});return {conflicts:[first],canOpenLocal:true};}
  f.confirmations++;emit({phase:'syncing',scope:'records',message:'Checking the reviewed versions…',conflicts:[]});await new Promise(resolve=>setTimeout(resolve,0));
  if(f.confirmations===1){emit({phase:'conflict',scope:'records',message:'Records changed while you reviewed. Compare the latest versions.',conflicts:[latest]});return {conflicts:[latest],canOpenLocal:true};}
  f.accepted++;emit({phase:'records_current',scope:'records',message:'Explicit synthetic selection accepted.',conflicts:[]});return {recordsReady:true};
 }
 throw Error('Unknown synthetic test scenario');
};
ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(Gate,null,React.createElement('main',{'data-testid':'working-logbook'},React.createElement('h1',null,'Synthetic logbook'),React.createElement('p',null,'Verified working records are available.'))));`);
write('index.html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated account gate fixture</title><link rel="stylesheet" href="/sync.css"><style>*{box-sizing:border-box}body{margin:0;background:#f5f8f9;font:16px system-ui}main[data-testid]{padding:28px}</style></head><body><div id="app"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script type="module" src="/entry.js"></script></body></html>');
fs.mkdirSync(output, { recursive: true });
let browser;
try {
  browser = await ({ chromium, webkit }[engineName]).launch({ headless: true });
  for (const scenario of ['handoff', 'failed-records', 'conflicts']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' }), errors = [], requests = [];
    let page;
    try {
      await context.route('**/*', route => {
        const url = route.request().url(); requests.push(url); if (!url.startsWith(origin + '/')) return route.abort();
        const pathname = decodeURIComponent(new URL(url).pathname), file = path.resolve(owned, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(owned + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'Not found' });
        return route.fulfill({ status: 200, contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
      });
      page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/?scenario=' + scenario); await page.waitForFunction(() => window.__gate?.calls.length === 1);
      const before = await page.evaluate(() => structuredClone(window.__protectedLog));
      assert.equal(await page.getByTestId('working-logbook').count(), 0);
      await page.getByRole('heading', { name: 'Opening your logbook', exact: true }).waitFor();
      await page.evaluate(() => window.__gate.releaseInitial());
      if (scenario === 'handoff') {
        await page.getByTestId('working-logbook').waitFor();
        await page.getByText('Synthetic original is temporarily unavailable.', { exact: true }).waitFor();
        assert.equal(await page.getByRole('heading', { name: 'Opening your logbook', exact: true }).count(), 0);
        assert(await page.getByTestId('working-logbook').isVisible());
        assert.deepEqual(await page.evaluate(() => window.__gate.calls.map(c => c.scope)), ['records', 'all']);
      } else if (scenario === 'failed-records') {
        await page.getByText('Synthetic logbook handoff has not completed.', { exact: true }).waitFor();
        assert.equal(await page.getByTestId('working-logbook').count(), 0);
        assert(await page.getByRole('heading', { name: 'Opening your logbook', exact: true }).isVisible());
      } else {
        await page.getByTestId('working-logbook').waitFor(); await page.getByRole('button', { name: 'Review changes (1)', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Review changes from your devices', exact: true }), submit = dialog.getByRole('button', { name: 'Confirm selected versions', exact: true }), remote = dialog.getByRole('radio', { name: 'Keep the saved account version', exact: true });
        assert(await submit.isDisabled()); await remote.check(); assert(await submit.isEnabled()); await submit.click();
        await dialog.getByText('Latest account annotation', { exact: true }).waitFor();
        assert.equal(await dialog.locator('input[type=radio]:checked').count(), 0); assert(await submit.isDisabled());
        assert.equal(await page.evaluate(() => window.__gate.accepted), 0);
        assert.deepEqual(await page.evaluate(() => window.__protectedLog), before);
        for (const width of [320, 390, 820]) { await page.setViewportSize({ width, height: 1000 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Conflict UI overflows at ' + width); }
        await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(output, 'gate-' + engineName + '-conflicts.png'), fullPage: true });
        await remote.check(); await submit.click(); await page.getByRole('dialog', { name: 'Review changes from your devices', exact: true }).waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => window.__gate.accepted), 1);
        const submitted = await page.evaluate(() => window.__gate.calls.filter(c => c.choices).map(c => c.choices)); assert.equal(submitted.length, 2);
        assert(submitted.every(choice => Object.values(choice).every(value => value === 'remote')));
      }
      assert.deepEqual(await page.evaluate(() => window.__protectedLog), before); assert.deepEqual(errors, []); assert(requests.every(url => url.startsWith(origin + '/')));
      console.log('PASS ' + engineName + ' AccountSyncGate ' + scenario);
    } catch (error) { if (page && !page.isClosed()) { console.error('Page errors:', errors); await page.screenshot({ path: path.join(output, 'gate-' + engineName + '-' + scenario + '-failure.png'), fullPage: true }); } throw error;
    } finally { await context.close(); }
  }
} finally { await browser?.close(); fs.rmSync(owned, { recursive: true, force: true }); }

import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium, webkit} from 'playwright';
import {fixtureCloudOrigin, fixtureCorsHeaders, fulfillLocalAccountSettings, installLocalAccountSettings} from './cloud-fixture.mjs';

const server = http.createServer((req, res) => res.end('<!doctype html><title>Synthetic fixture</title>'));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const user = {id: '00000000-0000-4000-8000-000000000029'};
try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({headless: true});
    try {
      const context = await browser.newContext({serviceWorkers: 'block'}), errors = [], requests = [];
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin === origin) return route.continue();
        requests.push({path: url.pathname, method: req.method()});
        if (await fulfillLocalAccountSettings(route, origin, user)) return;
        const headers = await fixtureCorsHeaders(req, origin);
        return route.fulfill({status: req.method() === 'OPTIONS' ? 204 : 403, body: '', headers});
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin);
      const result = await page.evaluate(async ({cloud, user}) => {
        const endpoint = `${cloud}/rest/v1/road_ready_backup_settings?select=record_sync_enabled&user_id=eq.${user.id}`;
        const headers = {apikey: 'synthetic', authorization: 'Bearer synthetic', 'content-type': 'application/json', 'x-client-info': 'synthetic', 'x-supabase-api-version': '2024-01-01', 'x-future-client-header': 'synthetic'};
        const read = async (url, options = {}) => {
          const res = await fetch(url, {credentials: 'include', headers, ...options});
          return {status: res.status, body: await res.json().catch(() => null)};
        };
        return {
          array: await read(endpoint),
          single: await read(endpoint, {headers: {...headers, accept: 'application/vnd.pgrst.object+json'}}),
          foreign: await read(endpoint.replace(user.id, '00000000-0000-4000-8000-000000000099')),
          write: await read(endpoint, {method: 'POST', body: '{}'}),
          unknown: await read(cloud + '/rest/v1/road_ready_account_workspaces'),
          storage: await read(cloud + '/storage/v1/object/owner-op-private/synthetic'),
        };
      }, {cloud: fixtureCloudOrigin, user});
      assert.deepEqual(result.array, {status: 200, body: [{record_sync_enabled: false}]});
      assert.deepEqual(result.single, {status: 200, body: {record_sync_enabled: false}});
      for (const key of ['foreign', 'write', 'unknown', 'storage']) assert.equal(result[key].status, 403, key);
      await installLocalAccountSettings(context, user);
      await page.reload();
      const requestsBefore = requests.length;
      const local = await page.evaluate(async ({cloud, user}) => {
        const response = await fetch(`${cloud}/rest/v1/road_ready_backup_settings?select=record_sync_enabled&user_id=eq.${user.id}`);
        return response.json();
      }, {cloud: fixtureCloudOrigin, user});
      assert.deepEqual(local, [{record_sync_enabled: false}]);
      assert.equal(requests.length, requestsBefore, 'Local-only settings reads never reach the network after reload');
      assert.deepEqual(errors, []);
      assert.ok(requests.some(r => r.method === 'GET' && r.path.endsWith('/road_ready_backup_settings')));
      console.log(`PASS ${engine.name()}: credentialed CORS, new headers, PostgREST row shapes; writes, foreign users, unknown APIs and storage remain blocked`);
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }

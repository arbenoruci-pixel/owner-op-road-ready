import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = 'source/src/app/App.jsx';
const app = fs.readFileSync(file, 'utf8');
const home = "  if (state.view === 'logs') return (";
const loadingHome = `  if (state.view === 'logs' && !offlineHydrated) return (
    <main className="rr-sync-opening" aria-busy="true">
      <p role="status">Loading logbook…</p>
    </main>
  );

`;

if (!app.includes(loadingHome + home)) {
  assert.equal(app.split(home).length, 2, 'Expected one Home render entry');
  assert.ok(app.includes('setOfflineHydrated(true);'), 'Expected the existing local snapshot readiness flag');
  fs.writeFileSync(file, app.replace(home, loadingHome + home));
}

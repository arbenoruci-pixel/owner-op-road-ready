import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
};
const versionAtLeast = (version, base = '95.71.0') => {
  const a = String(version || '').split('.').map(n => Number(n || 0));
  const b = base.split('.').map(n => Number(n || 0));
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return true;
};

const pkg = JSON.parse(read('package.json'));
const appVersion = JSON.parse(read('public/app-version.json'));
const appUpdate = read('source/src/core/update/appUpdate.js');
const sw = read('public/sw.js');
const status = read('source/src/modules/status/StatusWorkflowSheet.jsx');
const app = read('source/src/app/App.jsx');
const dot = read('source/src/modules/dot/DotMode.jsx');
const styles = read('source/src/styles.css');

assert(versionAtLeast(pkg.version), 'package version is 95.71.0 or newer');
assert(appUpdate.includes(`CURRENT_APP_VERSION = '${pkg.version}'`), 'app update version bumped');
assert(sw.includes(`OWNER_OP_SW_VERSION = '${pkg.version}'`), 'service worker version bumped');
assert(versionAtLeast(appVersion.version), 'app-version.json bumped');

assert(status.includes("'Drop Off'") && status.includes("'Drop & Hook'"), 'ON duty reasons include Drop Off and Drop & Hook');
assert(status.includes('function reasonNeedsDropOff') && status.includes('function reasonNeedsDropHook'), 'status sheet detects drop-only vs drop-and-hook');
assert(status.includes("mode: reasonNeedsDropOff(status, selectedReasons) ? 'drop_off'"), 'drop-off payload carries drop_off mode');
assert(status.includes('dropOffSelected && !dropContainer.trim() && !dropChassis.trim()'), 'drop-off requires only dropped equipment');
assert(status.includes('dropHookSelected && (!hookContainer.trim() || !hookChassis.trim() || !hookDestination.trim())'), 'drop-and-hook still requires new equipment and destination');
assert(status.includes("<label>{dropOffSelected ? 'Drop off equipment' : 'Drop & hook equipment'}</label>"), 'UI labels drop-only equipment panel');
assert(status.includes('{dropHookSelected && (') && status.includes('{dropOffSelected && ('), 'hook fields are hidden for drop-only');
assert((status.match(/const currentEquipmentText/g) || []).length === 1, 'no duplicate currentEquipmentText declaration');

assert(app.includes('function isDropOffReason') && app.includes('function isIntermodalDropReason'), 'app logic detects intermodal drop-only');
assert(app.includes("source: dropOnly ? 'drop_off_status' : 'drop_hook_status'"), 'drop-off clears equipment with drop_off_status source');
assert(app.includes("sourceEventReason:payload.reason || 'Drop Off'"), 'drop-off load patch uses Drop Off event reason');
assert(app.includes("chassis: dropOnly ? '' : (dropHook.hookedChassis || '')"), 'drop-off clears current chassis');
assert(app.includes("container: dropOnly ? '' : (dropHook.hookedContainer || '')"), 'drop-off clears current container');
assert(app.includes('const routeBase = isIntermodalDrop') && app.includes('updateRouteLegsForDropHook'), 'drop-off closes route leg using intermodal route update');
assert(!app.includes("status:'D', reason:'Drop Off'"), 'drop-off does not create driving events');

assert(dot.includes('function DotDocumentViewer') && dot.includes('officerPresentationWalletRows'), 'DOT document viewer and officer-safe rows are both present');
assert(dot.includes('useEffect') && dot.includes('setDocViewer'), 'document viewer opens inside app');
assert(styles.includes('drop-off-note'), 'drop-off note styling included');

if (process.exitCode) process.exit(process.exitCode);
console.log('v95.71 intermodal drop-off only verification complete.');

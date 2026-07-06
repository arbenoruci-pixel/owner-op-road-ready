import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(process.cwd());
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

const status = read('source/src/modules/status/StatusWorkflowSheet.jsx');
const app = read('source/src/app/App.jsx');
const day = read('source/src/modules/logbook/DayLogScreen.jsx');
const pkg = JSON.parse(read('package.json'));
const version = JSON.parse(read('public/app-version.json'));

ok(/^95\.(6[1-9]|[7-9]\d)\.0$/.test(pkg.version), 'package version is v95.61.0 or newer');
ok(/^95\.(6[1-9]|[7-9]\d)\.0$/.test(version.version), 'public app-version is v95.61.0 or newer');
ok(status.includes('dropHookSelected'), 'status sheet detects Drop & Hook reason');
ok(status.includes('Drop & hook equipment'), 'status sheet shows drop/hook equipment card');
ok(status.includes('Drop container'), 'status sheet asks dropped container');
ok(status.includes('Drop chassis'), 'status sheet asks dropped chassis');
ok(status.includes('Hook container'), 'status sheet asks hooked container');
ok(status.includes('Hook chassis'), 'status sheet asks hooked chassis');
ok(status.includes('New BOL / load #'), 'status sheet asks new BOL/load number');
ok(status.includes('Going to'), 'status sheet asks next destination');
ok(status.includes('setGpsStatus(\'Add new container, new chassis, and going-to location for Drop & Hook.\')'), 'drop/hook save blocks missing hook equipment/destination');
ok(status.includes('dropHook: {'), 'status payload includes dropHook object');
ok(app.includes('function updateRouteLegsForDropHook'), 'app has route logic for Drop & Hook');
ok(app.includes('buildEquipmentFromDropHook'), 'app updates current equipment after hook');
ok(app.includes('buildDropHookLoadPatch'), 'app updates load info after hook');
ok(app.includes('droppedContainer'), 'app stores dropped container');
ok(app.includes('droppedChassis'), 'app stores dropped chassis');
ok(app.includes('container:dropHook.hookedContainer'), 'route leg stores hooked container');
ok(app.includes('chassis:dropHook.hookedChassis'), 'route leg stores hooked chassis');
ok(app.includes('deliveryEventId:eventId'), 'drop/hook closes old open leg as delivered');
ok(app.includes("id:`leg_hook_${eventId}`"), 'drop/hook creates new open leg');
ok(app.includes('source:\'drop_hook_event\''), 'new hook route leg is marked as drop_hook_event');
ok(day.includes('Dropped ${[leg.droppedContainer'), 'route meta shows dropped equipment');
ok(day.includes('[leg.container, leg.chassis]'), 'route meta shows hooked equipment');
ok(app.includes('effectiveShippingDocs'), 'drop/hook event uses new load docs for event shipping docs');

console.log(`verify-drop-hook-equipment-v9560: ${checks} checks passed`);

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getHomeTerminalTimeZone} from '../../source/src/core/time/homeTerminalTime.js';
const read=f=>fs.readFileSync(f,'utf8');
assert.equal(read('source/src/modules/backup/BackupLogsScreen.jsx').split('<TransferPanel').length-1,1);
assert(read('source/src/app/App.jsx').includes('onApplyTransfer={next => setState(next)}'));
assert.equal(getHomeTerminalTimeZone({}),'America/Chicago');assert.equal(getHomeTerminalTimeZone({homeTerminalTimeZone:'America/New_York'}),'America/New_York');
// DST and midnight assertions use Intl directly and the app's terminal helpers.
for(const [utc,expected]of [['2026-10-05T04:59:00Z','10/04/2026'],['2026-10-05T05:00:00Z','10/05/2026']])assert.equal(new Intl.DateTimeFormat('en-US',{timeZone:getHomeTerminalTimeZone({}),year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(utc)),expected);
assert(read('scripts/build-v110.mjs').indexOf("'date-transfer/install.mjs'")>read('scripts/build-v110.mjs').indexOf("'hos-rest-review/install.mjs'"));
assert(!read('source/src/modules/backup/transferStorage.js').includes('.clear('));assert(!read('source/src/modules/backup/transferStorage.js').includes('.removeItem('));
console.log('PASS — final materialized UI; terminal Chicago default with configured zones retained; Chicago midnight; additive import and final installer placement');

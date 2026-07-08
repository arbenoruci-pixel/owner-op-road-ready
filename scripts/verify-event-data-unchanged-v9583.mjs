import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const expected = new Map(Object.entries({
  'source/src/app/App.jsx': 'f5950e10ff02c7496009a1439bade6ee30c5c7391af404aeae6313079ff9edf2',
  'source/src/core/hos/hosEngine.js': '4c8f3ee35fd5729f9d511ff171148a7d9519678fcfa07d06f4eaffc8029eee89',
  'source/src/modules/drive/DriveModeScreen.jsx': '45f9cacbf6116876c95f81efecf5896382ce5b2e9d5ca16839b9b34a49ca38b6',
  'source/src/modules/drive/HosCompactClocks.jsx': '58eb2221dcbe3d205dcc35ba0412a7420255d2336153858bacacc2ba6be4815d',
  'source/src/core/compliance/rawRodsChecks.js': '804506a69581e115fcad5d1c717e91ad29158e76dd1da978e688bb9243065ca4',
  'source/src/core/timeline/timelineEngine.js': '78b20f17061edaa703d5125d117ff91acfa2acac9f69969272fce0a9a16e5f2a',
  'source/src/core/timeline/displayTimeline.js': 'eb36452a6bdd6f1a5e346e1b759d28d318edb575b453c062e168040e53a98ead',
  'source/src/core/routes/routeNormalization.js': '30c9305597e206bfa62dc600b05853bcf93021edc9ccec7ffa9a82c4f0442eb6',
  'source/src/modules/logbook/signing.js': '32bb88aba26fea1420db7b5862c6344ebcfc4b5b9d81343fe4c1fe0180a57a21',
  'source/src/modules/backup/BackupLogsScreen.jsx': '061e652b2d4b95131b3e7936708b019eab9ead8bd705fe26c9d0956ac8a40a16',
  'source/src/modules/logbook/DayLogScreen.jsx': 'dd1865215e83d5f80a2a7e9dec28216ede104c9b0c8953ce7d5da960ab8b70f3',
  'source/src/modules/logbook/EventList.jsx': '029a5be38fdf3d59297d3c5873e60eb50a12ca32554c384d5ff7b3f90fc2538f',
  'source/src/modules/equipment/EquipmentSheet.jsx': 'f7c5b23602c0bccb8e87f2117f28e82406c983cb060d3bb377fcccd693b036dd',
  'source/src/modules/equipment/TrailerSheet.jsx': 'e8b506097e2c27a8c1f178285294e6048014c8d9e2a688504931d7b121032078',
  'source/src/modules/gps/DriveTrackerSheet.jsx': 'b22af8a3c879255eb7477d4d889cbbb8ccb7631a9c44d50e03a5bf85403d1ed2',
  'source/src/core/gps/locationService.js': '7ae2ad4cd63ac989311c0ad63acffa15a37dd99bb55faf4cbba4f4898d1db954',
  'source/src/state/mockData.js': 'bd8961450112cc65faffc67dfe0719dc2f35760f199e8625b68604fffe4859d8',
  'lib/sync/payload.js': '3a5412103243dfca9e350d592560f59e2e798a818da9f272d6ea179f7bceaf20',
  'lib/sync/clientSync.js': '38be9963d02c80ee9e863a531df4461377a5c67ab7c4c44c00fbbcc6675b4871',
  'lib/local-db/appState.js': 'ff7feae1291505371e13bc1d49f1fb48b7c63cfb27591282aafbf4063494b7c9',
}));

function sha256(path) {
  return crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}
function ok(condition, message) {
  assert.ok(condition, message);
  console.log(`PASS ${message}`);
}

for (const [file, hash] of expected) {
  ok(fs.existsSync(file), `${file} exists`);
  assert.equal(sha256(file), hash, `${file} is unchanged from v95.81 base`);
  console.log(`PASS ${file} unchanged`);
}

const graph = fs.readFileSync('source/src/modules/graph/LogGraph.jsx', 'utf8');
ok(!/\.startMin\s*=|\.endMin\s*=|event\.status\s*=/.test(graph), 'LogGraph does not mutate duty event times or statuses');
ok(!/eventsByDay\s*=|setState\(|dispatch\(/.test(graph), 'LogGraph remains a renderer without state/event persistence writes');

console.log('verify-event-data-unchanged-v9583 passed');

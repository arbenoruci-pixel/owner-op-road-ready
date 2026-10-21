import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {importFuelCsvV102, importMileageCsvV102, importTollCsvV102, iftaSummaryV102, appendOwnerOpsRowsV102} from '../../source/src/modules/owneros/ownerOpsStoreV102.js';
import {parseFuelStatement, fuelStatementFields, upsertFuelTransactions} from '../../source/src/modules/document-readers/fuel-receipt/fuelStatementV1103.js';
const source = 'Transaction ID,Date of Visit,Truck Stop,State,Gallons Dispensed,Paid\nMF-1,2026-10-01 12:20,Station,Illinois,100,350';
test('installed legacy and scanner paths share dates, source identity and amounts', () => {
  const legacy = importFuelCsvV102(source, 'Mudflap.csv', {activeLoadNo: 'CURRENT'}), scanned = parseFuelStatement(source);
  assert.equal(legacy.length, 1); assert.equal(legacy[0].loadNo, ''); assert.equal(legacy[0].total, scanned.total);
  assert.equal(legacy[0].importKey, scanned.transactions[0].importKey);
  const business = upsertFuelTransactions({fuel: []}, {id: 'source'}, fuelStatementFields(scanned));
  const result = iftaSummaryV102({fuelImports: legacy}, business, '2026-Q4');
  assert.equal(result.gallons, 100); assert.equal(result.fuelTotal, 350);
  const second = upsertFuelTransactions(business, {id: 'renamed-source'}, fuelStatementFields(scanned));
  assert.equal(second.fuel.length, 1); assert.equal(second.fuel[0].sourceDocumentId, 'source');
});
test('installed miles and tolls preserve zero and never inherit active load', () => {
  const miles = importMileageCsvV102('Date,State,Miles,Taxable Miles\n2026-10-01,IL,100,0', 'Motive.csv', {activeLoadNo: 'CURRENT'});
  assert.equal(miles[0].taxableMiles, 0); assert.equal(miles[0].loadNo, '');
  assert.equal(iftaSummaryV102({mileageImports: miles}, {}, '2026-Q4').taxableMiles, 0);
  const tolls = importTollCsvV102('Date,Toll Plaza,Amount,Transaction ID\n2026-10-01,I90,25,T1', 'Illinois.csv', {activeLoadNo: 'CURRENT'});
  assert.equal(tolls[0].loadNo, '');
  assert.throws(() => importFuelCsvV102(source.replace('2026-10-01 12:20', '02/31/2026'), 'Mudflap.csv'), /invalid calendar date/);
});
test('scanner reimport recognizes preexisting account rows without a workspace stamp', () => {
  const old = parseFuelStatement(source);
  const business = upsertFuelTransactions({fuel: []}, {id: 'first-source'}, fuelStatementFields(old));
  const scoped = parseFuelStatement(source, 'Mudflap.csv', {workspaceId: 'sample-owner'});
  const result = upsertFuelTransactions(business, {id: 'second-source'}, fuelStatementFields(scoped));
  assert.equal(result.fuel.length, 1); assert.equal(result.fuel[0].sourceDocumentId, 'first-source');
});
test('legacy append is idempotent and provider-scoped', () => {
  const first = importFuelCsvV102(source, 'Mudflap.csv');
  const saved = appendOwnerOpsRowsV102({fuelImports: first}, 'fuelImports', first);
  assert.equal(saved.fuelImports.length, 1);
  const other = importFuelCsvV102(source, 'other.csv', {provider: 'Another provider'});
  assert.equal(appendOwnerOpsRowsV102(saved, 'fuelImports', other).fuelImports.length, 2);
});
test('new screens are connected through Home and the existing import launchers', () => {
  const read = file => fs.readFileSync(file, 'utf8');
  assert.match(read('source/src/modules/home/HomeScreen.jsx'), /businessSection==='my_month'/);
  assert.match(read('source/src/modules/home/PhoneHomeToolsV110435.jsx'), /My month/);
  assert.match(read('source/src/modules/home/ImportDocumentsScreenV110435.jsx'), /SmartImportPanel state=\{state\}/);
  const owner = read('source/src/modules/owneros/OwnerOperatorOSV102.jsx');
  assert.match(owner, /setStatementFileV110479/);
  assert.doesNotMatch(owner, /rows\.forEach\(row => \{ business = addBusinessRecord/);
});
test('new imports and monthly reads leave all frozen HOS modules byte-exact', () => {
  const locks = JSON.parse(fs.readFileSync('module-locks.v1.json', 'utf8'));
  for (const [file, expected] of Object.entries(locks.files)) {
    const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.equal(actual, expected, file);
  }
});
test('actual IFTA export handlers block unresolved source evidence', async () => {
  const source = fs.readFileSync('source/src/modules/owneros/OwnerOperatorOSV102.jsx', 'utf8');
  const first = source.indexOf('  function exportIftaCsv() {'), next = source.indexOf('  async function exportIftaPdf() {'), end = source.indexOf('  async function exportLoadAudit() {');
  assert.ok(first >= 0 && next > first && end > next);
  const notices = [], funcs = new Function('ifta', 'setNotice', source.slice(first, end) + '; return [exportIftaCsv,exportIftaPdf];')({needsReview: true}, message => notices.push(message));
  funcs[0](); await funcs[1]();
  assert.equal(notices.length, 2); assert.ok(notices.every(message => /before exporting IFTA/.test(message)));
});

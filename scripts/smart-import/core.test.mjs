import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStatementCsv, importDate, numeric, previewStatement, canonicalFuel, canonicalTolls, statementKey, iftaStatementSummary} from './core.js';
import {monthlyRecords} from './month.js';

const fuelCSV = (id = 'MF-100', amount = '350.00', date = '2026-10-15', extra = '') => `Transaction Date,Merchant,City,State,Gallons,Total,Transaction ID,Vehicle\n${date},Station,Chicago,IL,100,${amount},${id},7005${extra}`;
const fuel = () => parseStatementCsv(fuelCSV(), 'Mudflap.csv');

test('Mudflap Paid / Gallons Dispensed agrees with the shared fuel parser', () => {
  const parsed = parseStatementCsv('Transaction ID,Date of Visit,Truck Stop,State,Gallons Dispensed,Paid\nA1,2026-10-15 13:20,Station,Illinois,100,350', 'fuel.csv');
  assert.equal(parsed.valid, true); assert.equal(parsed.provider, 'Mudflap');
  assert.equal(parsed.totals.total, 350); assert.equal(parsed.totals.gallons, 100);
  assert.equal(parsed.rows[0].state, 'IL');
});
test('total miles and zero taxable miles keep separate meanings', () => {
  for (const totalColumn of ['Miles', 'IFTA Distance']) {
    const parsed = parseStatementCsv(`Date,State,${totalColumn},Taxable Miles\n2026-10-01,IL,100,0`, 'Motive.csv', {mileageUnit: 'mi'});
    assert.equal(parsed.valid, true); assert.equal(parsed.rows[0].miles, 100); assert.equal(parsed.rows[0].taxableMiles, 0);
    const summary = iftaStatementSummary({mileageImports: parsed.rows}, {}, '2026-Q4');
    assert.equal(summary.totalMiles, 100); assert.equal(summary.taxableMiles, 0);
  }
});
test('missing taxable mileage stays unknown and requires review', () => {
  const parsed = parseStatementCsv('Date,State,Miles\n2026-10-01,IL,100', 'Motive.csv');
  assert.equal(parsed.rows[0].taxableMiles, null);
  assert.equal(iftaStatementSummary({mileageImports: parsed.rows}, {}, '2026-Q4').unknownTaxableRows, 1);
});
test('calendar validation rejects rolled and partial dates', () => {
  for (const date of ['2026-02-31', '02/31/2026', '2026-13-01', '2026-10-15 junk', '2026-10-15 29:00', '']) assert.equal(importDate(date), '');
  assert.equal(importDate('02/29/2024'), '2024-02-29');
  assert.equal(importDate('10/15/26'), '2026-10-15');
  assert.equal(parseStatementCsv(fuelCSV('A', '350', '02/31/2026'), 'Mudflap.csv').valid, false);
});
test('historical imports do not inherit the active load', () => {
  const parsed = parseStatementCsv(fuelCSV(), 'Mudflap.csv', {activeLoadNo: 'CURRENT-LOAD'});
  assert.equal(parsed.rows[0].loadNo, '');
});
test('explicit source load references are retained', () => {
  const parsed = parseStatementCsv('Date,State,Miles,Load Number\n2026-10-01,IL,100,HIST-1', 'Motive.csv');
  assert.equal(parsed.rows[0].loadNo, 'HIST-1');
});
test('reimports are stable when a file is renamed or its row order changes', () => {
  const first = fuel(), next = parseStatementCsv(fuelCSV(), 'another-name.csv', {provider: 'Mudflap'});
  assert.equal(previewStatement(next, first.rows).added.length, 0);
  assert.equal(previewStatement(next, first.rows).duplicates.length, 1);
  const noId = parseStatementCsv(fuelCSV(''), 'Mudflap.csv');
  const reimported = parseStatementCsv(fuelCSV(''), 'renamed.csv', {provider: 'Mudflap'});
  assert.equal(noId.rows[0].importKey, reimported.rows[0].importKey);
});
test('identity isolates providers, accounts and workspaces', () => {
  const item = fuel().rows[0];
  assert.notEqual(statementKey(item), statementKey({...item, provider: 'Provider B'}));
  assert.notEqual(statementKey(item), statementKey({...item, providerAccount: 'second-account'}));
  assert.notEqual(statementKey(item), statementKey({...item, workspaceId: 'company-b'}));
  const other = parseStatementCsv(fuelCSV(), 'b.csv', {provider: 'Provider B'});
  assert.equal(previewStatement(other, [item]).added.length, 1);
});
test('same transaction ID with a changed amount is blocked without mutation', () => {
  const saved = fuel().rows, before = JSON.stringify(saved);
  const plan = previewStatement(parseStatementCsv(fuelCSV('MF-100', '355'), 'Mudflap.csv'), saved);
  assert.equal(plan.conflicts.length, 1); assert.equal(plan.canSave, false); assert.equal(JSON.stringify(saved), before);
});
test('legacy fuel mirrors and repeated imports count once without rewriting history', () => {
  const original = {...fuel().rows[0], source: 'fuel_csv_v102', importKey: undefined};
  const mirror = {date: original.date, state: 'IL', total: 350, gallons: 100, transactionId: original.transactionId, merchant: 'Station', source: 'mudflap_csv_v102'};
  const owner = {fuelImports: [original]}, business = {fuel: [mirror, {...mirror, id: 'second-copy'}]};
  const before = JSON.stringify([owner, business]);
  const result = iftaStatementSummary(owner, business, '2026-Q4');
  assert.equal(result.gallons, 100); assert.equal(result.fuelTotal, 350); assert.equal(result.duplicateCount, 2);
  assert.equal(JSON.stringify([owner, business]), before);
});
test('conflicting stored versions are retained and excluded from totals', () => {
  const row = fuel().rows[0];
  const result = canonicalFuel({fuelImports: [row]}, {fuel: [{...row, total: 351}]});
  assert.equal(result.conflicts.length, 1); assert.equal(result.rows.length, 0);
});
test('invalid dates cannot drift into the current quarter', () => {
  const result = iftaStatementSummary({}, {fuel: [{date: '2026-02-31', gallons: 100, total: 350}]}, '2026-Q4');
  assert.equal(result.gallons, 0); assert.equal(result.invalidRows.length, 1); assert.equal(result.needsReview, true);
});
test('CSV quoting, malformed totals and duplicate headers fail visibly', () => {
  assert.equal(numeric('1,234.50'), 1234.5); assert.equal(numeric('1,23'), null);
  assert.throws(() => parseStatementCsv('Date,State,Gallons,Total\n"2026-10-01,IL,100,350', 'Mudflap.csv'), /unfinished/);
  assert.throws(() => parseStatementCsv('Date,State,Total,Total\n2026-10-01,IL,100,350', 'Mudflap.csv'), /repeated/);
  assert.equal(parseStatementCsv('Date,State,Gallons,Total\n2026-10-01,IL,100,350\nTotal,,,351', 'Mudflap.csv').valid, false);
  assert.equal(parseStatementCsv('Date,State,Gallons,Total\n2026-10-01,IL,100,350\nTotal,,100,350', 'Mudflap.csv').rows.length, 1);
});
test('zero distance is retained and ambiguous unlabeled distance needs units', () => {
  assert.equal(parseStatementCsv('Date,State,Miles,Taxable Miles\n2026-10-01,IL,0,0', 'Motive.csv').rows.length, 1);
  assert.equal(parseStatementCsv('Date,State,Distance\n2026-10-01,IL,100', 'Motive.csv').valid, false);
  const parsed = parseStatementCsv('Date,State,Distance,Taxable Miles\n2026-10-01,IL,100,0', 'Motive.csv', {mileageUnit: 'km'});
  assert.equal(parsed.rows[0].taxableMiles, 0); assert.equal(parsed.rows[0].originalMiles, 100); assert.ok(Math.abs(parsed.rows[0].miles - 62.137119) < .001);
});
test('identical no-ID rows require source review', () => {
  const parsed = parseStatementCsv('Date,Merchant,State,Gallons,Total\n2026-10-01,Station,IL,100,350\n2026-10-01,Station,IL,100,350', 'Mudflap.csv');
  assert.equal(parsed.valid, false); assert.equal(parsed.rows.length, 2);
});
test('canonical tolls reconcile historical expense mirrors', () => {
  const owner = {tolls: [{date: '2026-10-01', amount: 20, transactionId: 'T1', provider: 'Illinois Tollway'}]};
  const business = {expenses: [{date: '2026-10-01', total: 20, transactionId: 'T1', source: 'toll_csv_v102', category: 'Tolls'}]};
  assert.equal(canonicalTolls(owner, business).rows.length, 1);
});
test('monthly view retains a cross-month load identity and original report', () => {
  const load = {id: 'same-load', loadNo: 'H1', pickupDate: '2026-09-30', deliveryDate: '2026-10-02'};
  const document = {local_id: 'one-original', type: 'logbook_archive', extracted: {periodStart: '2026-09-25', periodEnd: '2026-10-05', readOnlyLogbook: true, driverId: 'd1'}};
  const state = {activeDriverId: 'd1', teamDrivers: [{id: 'd1', name: 'Sample driver'}], eventsByDay: {'2026-10-01': [{id: 'drive', status: 'D', startMin: 100, endMin: 200}]}, signatureByDay: {'2026-10-01': 'signature'}, dotWallet: {documents: {irp: {expiresOn: '2026-10-31'}}}};
  const before = JSON.stringify(state);
  for (const month of ['2026-09', '2026-10']) {
    const result = monthlyRecords({month, state, business: {loads: [load]}, documents: [document], driverId: 'd1', today: '2026-10-03'});
    assert.equal(result.loads[0].id, 'same-load'); assert.equal(result.archives[0].local_id, 'one-original');
    if (month === '2026-10') { assert.equal(result.logs.length, 1); assert.deepEqual(result.missingLocalDays, ['2026-10-02', '2026-10-03']); assert.equal(result.expiring.length, 1); }
  }
  assert.equal(JSON.stringify(state), before);
});
test('all-driver monthly view counts an active book once', () => {
  const eventsByDay = {'2026-10-01': [{status: 'ON'}]};
  const state = {activeDriverId: 'a', eventsByDay, teamLogbooksByDriverId: {a: {eventsByDay}, b: {eventsByDay}}};
  const result = monthlyRecords({month: '2026-10', state, today: '2026-10-01'});
  assert.equal(result.logs.length, 2);
});
test('repeated source IDs count once in statement totals and preview', () => {
  const parsed = parseStatementCsv('Date,State,Gallons,Total,Transaction ID\n2026-10-01,IL,100,350,A1\n2026-10-01,IL,100,350,A1', 'Mudflap.csv');
  assert.equal(parsed.valid, true); assert.equal(parsed.totals.total, 350); assert.equal(parsed.rows.length, 1);
  const plan = previewStatement(parsed); assert.equal(plan.added.length, 1); assert.equal(plan.duplicates.length, 1);
});
test('a mileage trip ID can span states without collapsing jurisdiction rows', () => {
  const parsed = parseStatementCsv('Date,State,Miles,Trip ID\n2026-10-01,IL,100,TRIP1\n2026-10-01,IN,80,TRIP1', 'Motive.csv');
  assert.equal(parsed.valid, true); assert.equal(previewStatement(parsed).added.length, 2); assert.equal(parsed.totals.miles, 180);
});
test('legacy no-ID mirror candidates require review instead of doubling totals', () => {
  const row = {date: '2026-10-01', state: 'IL', gallons: 100, total: 350, merchant: 'Station', provider: 'Mudflap', source: 'fuel_csv_v102'};
  const result = iftaStatementSummary({fuelImports: [{...row, truck: '7005'}]}, {fuel: [{...row, provider: undefined, source: 'mudflap_csv_v102'}]}, '2026-Q4');
  assert.equal(result.conflicts.length, 1); assert.equal(result.gallons, 0); assert.equal(result.needsReview, true);
});
test('multi-month aggregate mileage cannot silently land in the first month', () => {
  const parsed = parseStatementCsv('Start Date,End Date,State,Miles\n2026-10-01,2026-12-31,IL,5000', 'Motive.csv');
  assert.equal(parsed.valid, false); assert.match(parsed.issues[0].message, /multiple months/);
  const monthly = parseStatementCsv('Start Date,End Date,State,Miles\n2026-10-01,2026-10-31,IL,1000', 'Motive.csv');
  assert.equal(monthly.valid, true); assert.equal(monthly.periodEnd, '2026-10-31');
});

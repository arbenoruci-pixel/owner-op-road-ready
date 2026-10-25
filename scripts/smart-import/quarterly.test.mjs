import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalMileage, iftaStatementSummary, parseStatementCsv, previewStatement, quarterPeriod, statementKey} from './core.js';
import {monthlyRecords} from './month.js';

const options = {provider: 'Motive / KeepTruckin', workspaceId: 'company', periodStart: '2026-10-01', periodEnd: '2026-12-31', truck: '36', requireTruck: true, mileageBasis: 'motive_gateway'};
const summary = (miles = 1000, extra = {}) => parseStatementCsv(`Jurisdiction,Distance (mi)\nIllinois,${miles}\nIndiana,250\nTotal,${miles + 250}`, 'report.csv', {...options, ...extra});
const daily = (date = '2026-10-05', truck = '36', id = 'trip-1') => parseStatementCsv(`Trip Date,State,Miles,Taxable Miles,Vehicle,Trip ID\n${date},IL,100,0,${truck},${id}`, 'Motive.csv', {workspaceId: 'company'});

test('Motive summary without date columns uses the reviewed quarter and truck', () => {
  const parsed = summary(); assert.equal(parsed.valid, true); assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].truck, '36'); assert.equal(parsed.rows[0].periodEnd, '2026-12-31'); assert.equal(parsed.rows[0].mileageBasis, 'motive_gateway');
  assert.equal(parsed.rows[0].taxableMiles, null); assert.equal(parsed.totals.miles, 1250);
  assert.equal(iftaStatementSummary({mileageImports: parsed.rows}, {}, '2026-Q4', '36').totalMiles, 1250);
  assert.equal(iftaStatementSummary({mileageImports: parsed.rows}, {}, '2026-Q3').totalMiles, 0);
});
test('all quarter boundaries include leap February and year end', () => {
  assert.deepEqual(quarterPeriod('2024-Q1'), {start: '2024-01-01', end: '2024-03-31'});
  assert.deepEqual(quarterPeriod('2026-Q4'), {start: '2026-10-01', end: '2026-12-31'});
  for (const value of ['2026-Q0', '2026-Q5', '1800-Q1']) assert.throws(() => quarterPeriod(value));
  for (const [quarter, start, end] of [[1,'01-01','03-31'],[2,'04-01','06-30'],[3,'07-01','09-30'],[4,'10-01','12-31']]) assert.deepEqual(quarterPeriod(`2026-Q${quarter}`), {start: `2026-${start}`, end: `2026-${end}`});
});
test('a renamed or reordered quarterly report is idempotent', () => {
  const first = summary(), changed = parseStatementCsv('Jurisdiction,Distance (mi)\nIndiana,250\nIllinois,1000', 'renamed.csv', options);
  const plan = previewStatement(changed, first.rows); assert.equal(plan.canSave, true); assert.equal(plan.added.length, 0); assert.equal(plan.duplicates.length, 2);
});
test('changed summary totals conflict even without transaction IDs', () => {
  const plan = previewStatement(summary(1100), summary().rows);
  assert.equal(plan.canSave, false); assert.equal(plan.conflicts.length, 1);
});
test('period end participates in mileage identity', () => {
  const first = summary().rows[0]; assert.notEqual(statementKey(first, 'mileage'), statementKey({...first, periodEnd: '2026-11-30'}, 'mileage'));
});
test('quarterly, monthly and daily overlap is blocked in either import order', () => {
  const quarter = summary(), day = daily(), month = parseStatementCsv('Start Date,End Date,State,Miles,Vehicle\n2026-10-01,2026-10-31,IL,300,36', 'Motive.csv', {workspaceId: 'company'});
  for (const [incoming, saved] of [[quarter,day],[day,quarter],[quarter,month],[month,quarter]]) {
    const plan = previewStatement(incoming, saved.rows); assert.equal(plan.canSave, false); assert.ok(plan.conflicts.some(conflict => /Overlapping mileage/.test(conflict.reason || '')));
  }
});
test('overlaps across provider labels and missing legacy trucks cannot double totals', () => {
  const current = summary(), legacy = {...daily().rows[0], provider: 'Legacy provider', truck: ''};
  assert.equal(previewStatement(current, [legacy]).canSave, false);
  const before = JSON.stringify([current.rows, legacy]);
  const result = canonicalMileage({mileageImports: [...current.rows, legacy]});
  assert.equal(result.conflicts.length, 1); assert.equal(result.rows.length, 1); assert.equal(result.rows[0].state, 'IN');
  assert.equal(JSON.stringify([current.rows, legacy]), before);
});
test('different trucks and nonoverlapping periods remain independent', () => {
  assert.equal(previewStatement(summary(), daily('2026-10-05', '228').rows).canSave, true);
  const month = end => parseStatementCsv(`Start Date,End Date,State,Miles,Vehicle\n2026-${end}-01,2026-${end}-30,IL,200,36`, 'Motive.csv', {workspaceId:'company'});
  assert.equal(previewStatement(month('11'), month('09').rows).canSave, true);
});
test('different identified trips in the same state and day are retained', () => {
  assert.equal(previewStatement(daily('2026-10-05','36','trip-2'), daily().rows).canSave, true);
});
test('cross-quarter aggregate, absent truck, invalid source dates and fleet summary are blocked', () => {
  assert.equal(summary(1000, {truck:''}).valid, false);
  const cross = parseStatementCsv('Start Date,End Date,State,Miles,Vehicle\n2026-09-30,2026-10-02,IL,10,36','Motive.csv');
  assert.equal(cross.valid, false); assert.match(cross.issues[0].message, /crosses quarters/);
  const blank = parseStatementCsv('Date,State,Miles\n,IL,10','Motive.csv',options); assert.equal(blank.valid,false);
  assert.throws(() => parseStatementCsv('State,Miles\nIL,10','Motive.csv',{...options,periodEnd:'2026-02-31'}),/valid mileage report period/);
  assert.equal(previewStatement(daily('2026-09-30'), []).periodStart, '2026-09-30');
  assert.equal(parseStatementCsv('Date,State,Miles,Vehicle\n2026-09-30,IL,10,36','Motive.csv',options).valid,false);
});
test('kilometer source totals and raw units survive conversion', () => {
  const parsed = parseStatementCsv('Jurisdiction,Distance (km)\nIL,100\nIN,200\nTotal,300','Motive.csv',options);
  assert.equal(parsed.valid,true); assert.ok(Math.abs(parsed.totals.miles - 186.411) < .002);
  assert.equal(parsed.rows[0].originalMiles,100); assert.equal(parsed.rows[0].originalUnit,'km');
  assert.equal(parsed.rows[0].raw['distance km'],'100');
});
test('existing invalid mileage is excluded, never silently repaired', () => {
  const rows = [{date:'2026-10-01',state:'IL',miles:-2},{date:'2026-10-01',periodEnd:'2027-01-01',state:'IL',miles:20}];
  const model = canonicalMileage({mileageImports:rows}); assert.equal(model.rows.length,0); assert.equal(model.invalidRows.length,2);
});
test('manual daily log mileage cannot enter IFTA or be altered by quarterly views', () => {
  const state = {formByDay:{'2026-10-01':{miles:99999}}, eventsByDay:{'2026-10-01':[{status:'D',startMin:0,endMin:600}]}, signatureByDay:{'2026-10-01':'signed'}, historicalGpsEvidence:{x:1}}, before=JSON.stringify(state);
  assert.equal(iftaStatementSummary({}, {}, '2026-Q4').totalMiles,0);
  const model = monthlyRecords({month:'2026-10',state,owner:{mileageImports:summary().rows}}); assert.equal(model.miles,0); assert.equal(JSON.stringify(state),before);
});
test('20,000 identified daily jurisdiction rows retain their trips without quadratic overlap checks', () => {
  const body = ['Date,State,Miles,Vehicle,Trip ID',...Array.from({length:20000},(_,i)=>`2026-10-05,IL,1,36,T-${i}`)].join('\n');
  const parsed = parseStatementCsv(body,'Motive.csv',{workspaceId:'company'});
  assert.equal(parsed.valid,true); assert.equal(previewStatement(parsed).added.length,20000);
  assert.equal(canonicalMileage({mileageImports:parsed.rows}).rows.length,20000);
  const overlap = previewStatement(summary(), parsed.rows); assert.equal(overlap.canSave,false); assert.equal(overlap.conflicts.length,1); assert.equal(overlap.conflicts[0].saved.length,20000);
});

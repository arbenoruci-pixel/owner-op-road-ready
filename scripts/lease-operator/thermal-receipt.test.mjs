import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMaintenanceReceipt} from '../../app/operator/maintenanceReceiptFields.js';

const strip = [
  'Juniper Roadside Supply #74', 'Clinton, IA 52732', 'DATE: 01/12/26  INVOICE #F-671',
  'Mud flap hanger 36.50', 'Trailer light 3.50', 'SUBTOTAL 40.00',
  'STATE TAX 2.00', 'COUNTY TAX 1.00', 'TOTAL $ 43.00', 'AMOUNT TENDERED 50.00', 'CHANGE 7.00',
];
const read = rows => parseMaintenanceReceipt([{text:rows.join('\n')}]);

test('reads item prices and distinct named tax lines on a store receipt', () => {
  const receipt = read(strip);
  assert.equal(receipt.vendor,'Juniper Roadside Supply #74');
  assert.equal(receipt.date,'2026-01-12');
  assert.equal(receipt.invoiceNumber,'F-671');
  assert.deepEqual(receipt.lines.map(item=>[item.description,item.amountCents,item.quantity]),[
    ['Mud flap hanger',3650,null],['Trailer light',350,null],
  ]);
  assert.deepEqual([receipt.subtotalCents,receipt.taxCents,receipt.totalCents,receipt.paidCents],[4000,300,4300,null]);
  assert.deepEqual(receipt.issues,[]);
  const strayBorder = strip.slice(0,-1).map(row => row.startsWith('AMOUNT TENDERED') ? row+' - |' : row);
  assert.equal(read(strayBorder).totalCents,4300);
});

test('holds genuine conflicting final totals and never copies tender into a missing total', () => {
  assert.equal(read(strip.filter(row=>!row.startsWith('TOTAL '))).totalCents,null);
  assert.equal(read([...strip,'TOTAL $ 50.00']).totalCents,null);
  const native = {text:strip.join('\n'),supplemental:[{text:'TOTAL 40.00'}]};
  assert.equal(parseMaintenanceReceipt([native]).totalCents,null);
  assert.equal(read([...strip,'Currency: CAD']).totalCents,null);
  assert.equal(read([...strip,'Invoice #K-402']).totalCents,null);
});

test('counts a printed aggregate and its named components only once and holds disputed tax', () => {
  assert.equal(read([...strip,'TOTAL TAX 3.00']).totalCents,4300);
  assert.equal(read([...strip,'TOTAL TAX 4.00']).totalCents,null);
  assert.equal(read([...strip,'STATE TAX 0.50']).totalCents,null);
  assert.equal(read([...strip,'SPECIAL TAX ??']).totalCents,null);
  const weak = {lines:strip.map(text=>({text,confidence:text === 'TOTAL $ 43.00' ? 35 : 99}))};
  assert.equal(parseMaintenanceReceipt([weak]).totalCents,null);
});

test('preserves printed credits and leaves unprinted tax blank', () => {
  for (const credit of ['-5.00','($5.00)','5.00-','−5.00']) {
    const rows = strip.flatMap(row=>row==='Trailer light 3.50' ? ['Trailer light 8.50','Core credit '+credit] : [row]);
    const result = read(rows);
    assert.equal(result.totalCents,4300);
    assert.equal(result.lines.at(-1).amountCents,-500);
  }
  const missingTax = read(strip.filter(row=>!row.includes(' TAX ')));
  assert.equal(missingTax.totalCents,null);
  assert.equal(missingTax.taxCents,null);
  const included = read(strip.filter(row=>!row.includes(' TAX ')).map(row=>row.startsWith('TOTAL $') ? 'TOTAL $ 40.00' : row));
  assert.equal(included.totalCents,4000);
  assert.equal(included.taxCents,null);
});

test('checks independent original observations for conflicting date/IDs, subtotal, tax and total', () => {
  const normalized = {text:strip.join('\n'),region:'thermal'};
  for (const text of ['SUBTOTAL 39.00','COUNTY TAX 9.00','TOTAL 44.00','DATE: 01/12/26 INVOICE #J-17']) {
    const result = parseMaintenanceReceipt([{text,supplemental:[normalized]}]);
    assert.equal(result.totalCents,null,text);
  }
  const disputedDate = parseMaintenanceReceipt([{text:'DATE: 01/14/26',supplemental:[normalized]}]);
  assert.equal(disputedDate.date,'');
  assert.equal(read(strip.map(row=>row.startsWith('DATE:') ? row+'  INVOICE #R-43' : row)).multipleInvoices,true);
  assert.equal(read([...strip,'TAX 3.00']).totalCents,4300);
  assert.equal(read([...strip,'TAX 1.00']).totalCents,null);
});

test('accepts a separately read printed total with different tender, while an isolated tender amount cannot qualify', () => {
  const thermal = {lines:strip.map(text=>({text,confidence:text.startsWith('TOTAL $') ? 60 : 99})),region:'thermal'};
  const crop = {lines:[{text:'TOTAL $ 43.00',confidence:96}],region:'thermal-total'};
  assert.equal(parseMaintenanceReceipt([{text:'RECEIPT',supplemental:[thermal,crop]}]).totalCents,4300);
  const tenderOnly = {lines:thermal.lines.filter(row => !row.text.startsWith('TOTAL $')),region:'thermal'};
  const tender = {lines:[{text:'AMOUNT TENDERED 43.00',confidence:99}]};
  assert.equal(parseMaintenanceReceipt([{text:'RECEIPT',supplemental:[tenderOnly,tender]}]).totalCents,null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMaintenanceReceipt} from '../../app/operator/maintenanceReceiptFields.js';

const read = (...text) => parseMaintenanceReceipt([{text:text.join('\n')}]);

test('tax-label OCR noise, product codes and unrelated currency mentions do not change the expense currency', () => {
  const result = read('SERVICE INVOICE', 'ENV/¥ST Tax: 0.00', '€', 'Ask about EUR conversion',
    'Part CAD 1260', 'Part SPEC$ 23.00', 'CAD engineer', 'Total: $17.50');
  assert.equal(result.foreignCurrency,false);
  assert.equal(result.totalCents,1750);
  assert.deepEqual(result.issues,[]);
});

test('currency declaration, adjacent price or whole-yen total identifies actual foreign charges', () => {
  for (const [evidence,code] of [
    ['Currency: CAD','CAD'], ['Amounts are in CHF','CHF'], ['Parts: CA$31.10','CAD'],
    ['Total (CAD):','CAD'], ['Item: 15.50 EUR','EUR'], ['Total: ¥1700','JPY'], ['Item: €12,50','EUR'],
  ]) {
    const receipt = read('Total: 43.00', evidence);
    assert.equal(receipt.currency,code,evidence);
    assert.equal(receipt.foreignCurrency,true,evidence);
    assert.equal(receipt.totalCents,null,evidence);
  }
});

test('uncertain priced currency uses its own OCR word score and requests review without claiming a foreign currency', () => {
  const result = parseMaintenanceReceipt([{lines:[
    {text:'Total: 17.50',confidence:96},
    {text:'Parts: €17.50',confidence:84,words:[{text:'Parts:',confidence:98},{text:'€17.50',confidence:50}]},
  ]}]);
  assert.equal(result.foreignCurrency,false);
  assert.equal(result.totalCents,null);
  assert.equal(result.printedTotalCents,1750);
  assert.ok(result.issues.some(issue => /currency.*unclear/.test(issue)));
});

test('a real currency on a supplemental regional read is retained and duplicated evidence does not conflict', () => {
  const result = parseMaintenanceReceipt([{text:'Total: 17.50',supplemental:[{lines:[{text:'Currency: CAD',confidence:92}]}]}]);
  assert.equal(result.currency,'CAD');
  assert.equal(result.foreignCurrency,true);
  assert.equal(result.totalCents,null);
});

test('freight heading and shipping fields on the same page prevent a cost suggestion', () => {
  const receipt = parseMaintenanceReceipt([{lines:[
    {text:'11/04/26 BILL OF ADING — Page 1',confidence:58},
    {text:'Charge Terms:',confidence:82}, {text:'Customer order information',confidence:88},
    {text:'Trailer: 17',confidence:90}, {text:'Total: 75.00',confidence:92},
  ]}]);
  assert.equal(receipt.documentKind,'bill_of_lading');
  assert.equal(receipt.totalCents,null);
  assert.equal(receipt.printedTotalCents,null);
  assert.equal(receipt.unit,'');
  const split = parseMaintenanceReceipt([{text:'BILL OF LADING',supplemental:[{text:'SHIP FROM\nSHIP TO'}]}]);
  assert.equal(split.documentKind,'bill_of_lading');
  const referenced = read('SERVICE INVOICE', 'Bill of Lading No.: BL-900', 'Ship from', 'Seal No.: 15', 'Total: 75.00');
  assert.equal(referenced.totalCents,7500);
});

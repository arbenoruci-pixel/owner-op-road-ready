import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMaintenanceReceipt} from '../../app/operator/maintenanceReceiptFields.js';

const read = (page, ...supplemental) => parseMaintenanceReceipt([{...page,supplemental}]);
const word = (text,left,top,width,confidence=92) => ({text,left,top,width,height:16,confidence});

test('service date and explicit service document ID survive supplementary recognition', () => {
  const receipt = read({text:'REPAIR INVOICE'}, {text:'Shop name: Northland Repairs\nService date: 03/07/26\nInvoice #: DEMO-20'});
  assert.equal(receipt.vendor,'Northland Repairs');
  assert.equal(receipt.invoiceNumber,'DEMO-20');
  assert.equal(receipt.date,'2026-03-07');
  for (const unrelated of ['Paid date: 03/07/26', 'Ship date: 03/07/26', 'Expiration date: 03/07/26','Date shipped: 03/07/26','Date: 02/31/26']) {
    assert.equal(read({text:'REPAIR INVOICE\n'+unrelated}).date,'');
  }
});

test('contradictory dates and distinct invoice references stay unfilled', () => {
  const receipt = read({text:'Invoice #: FIX-1\nService date: 03/07/26'}, {text:'Invoice #: FIX-2\nService date: 03/09/26'});
  assert.equal(receipt.date,'');
  assert.equal(receipt.multipleInvoices,true);
  assert.equal(receipt.invoiceNumber,'');
});

test('TA order form requires independently corroborated written date, payment date alone is insufficient', () => {
  const lines=[{text:'Invoice',confidence:90},{text:'OTC Order #808 111111',confidence:92},
    {text:'TA TRUCKSERVICE ANYTOWN',confidence:90}];
  const words=[word('Wren',282,221,34,38), word('05/17/26',292,246,81),
    word('05/17/26',661,243,77), word('19:08',783,241,45)];
  const parse = words => read({text:'Invoice'}, {lines,words});
  const receipt = parse(words);
  assert.equal(receipt.vendor,'TA Truck Service');
  assert.equal(receipt.date,'2026-05-17');
  assert.equal(receipt.invoiceNumber,'OTC Order #808 111111');
  assert.equal(parse(words.slice(1)).date,'');
  assert.equal(parse(words.slice(2)).date,'');
  const withZip = dateWords => read({text:'Invoice'}, {lines,imageSize:{width:900,height:1150},
    words:[word('77000',107,245,52),...dateWords]});
  assert.equal(withZip(words.slice(1)).date, '2026-05-17');
  assert.equal(withZip(words.slice(2)).date, '');
  assert.equal(parse([...words.slice(0,2),{...words[2],text:'05/18/26'},words[3]]).date,'');
});

test('printed OTC references retain their role and require the matching truck service form', () => {
  const text = 'TA TRUCKSERVICE ANYTOWN\nOTC Order #808 111111';
  assert.equal(read({text}, {text:'Invoice #: DEMO-32'}).invoiceNumber,'DEMO-32');
  assert.equal(read({text:'Other Repair Shop\nOTC Order #808 111111'}).invoiceNumber,'');
  assert.equal(read({text:text.replace('OTC Order','Purchase order')}).invoiceNumber,'');
  const conflict = read({text}, {text:text.replace('111111','222222')});
  assert.equal(conflict.multipleInvoices,true);
  assert.equal(conflict.invoiceNumber,'');
});
test('two identical low-confidence date cells and a disputed high-confidence payment date leave service date for review', () => {
  const lines = [{text:'Invoice',confidence:98},{text:'OTC Order #100 222222',confidence:95},
    {text:'TA Truck Service',confidence:97}];
  const form = (day, written, paid) => ({lines,imageSize:{width:900,height:1150},
    words:[word('Written',282,220,42),word('77000',107,245,52),word(day,292,246,81,written),
      word(day,661,243,77,paid),word('19:08',783,241,45)]});
  const weak = form('05/18/26',41,52), higherPaymentOnly = form('05/17/26',62,92);
  assert.equal(read({text:'Invoice'},weak,higherPaymentOnly).date,'');
  assert.equal(read({text:'Invoice'},form('05/17/26',96,96)).date,'2026-05-17');
});

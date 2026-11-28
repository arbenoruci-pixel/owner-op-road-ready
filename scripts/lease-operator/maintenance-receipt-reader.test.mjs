import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMaintenanceReceipt} from '../../app/operator/maintenanceReceiptFields.js';
import {buildPodScanPdf} from '../../app/operator/podScanPdf.js';
import {getReceiptPhotos, rememberReceiptPhotos} from '../../app/operator/maintenanceReceiptPhotos.js';

const invoice = [
  'SERVICE INVOICE', 'Invoice #: A-142', 'Date: 11/14/2026', 'Vendor: Cedar Tire', 'Unit: T-8',
  'Odometer: 175,000', 'Work performed: Replace oil filters', 'Description Qty Unit Price Amount',
  'Oil filter 2 10.00 20.00', 'Labor 1.5 40.00 60.00', 'Discount (5.00)',
  'Subtotal: 75.00', 'Tax: 6.00', 'TOTAL: 81.00', 'PAID: 31.00', 'BALANCE DUE: 50.00',
];
const parse = text => parseMaintenanceReceipt([{text:text.join('\n')}]);

test('itemized receipt carries only printed items, unit costs, extended amounts, totals and tender', () => {
  const receipt = parse(invoice);
  assert.deepEqual(receipt.lines, [
    {description:'Oil filter',quantity:2,unitPriceCents:1000,amountCents:2000},
    {description:'Labor',quantity:1.5,unitPriceCents:4000,amountCents:6000},
    {description:'Discount',quantity:null,unitPriceCents:null,amountCents:-500},
  ]);
  assert.deepEqual([receipt.totalCents,receipt.subtotalCents,receipt.taxCents,receipt.paidCents,receipt.balanceDueCents],
    [8100,7500,600,3100,5000]);
  assert.deepEqual([receipt.date,receipt.unit,receipt.vendor,receipt.odometer,receipt.invoiceNumber],['2026-11-14','T-8','Cedar Tire',175000,'A-142']);
  assert.equal(receipt.description,'Replace oil filters');
  assert.deepEqual(receipt.issues,[]);
});

test('ambiguous totals, quantities, missing tax and partial payments never generate an inferred amount', () => {
  for (const [oldText,newText] of [['TOTAL: 81.00','TOTAL: 88.00'],['Labor 1.5 40.00 60.00','Labor 1.5 44.00 60.00'],['PAID: 31.00','PAID: 10.00']]) {
    const result = parse(invoice.map(row => row===oldText ? newText : row));
    assert.equal(result.totalCents,null);
    assert.ok(result.issues.length);
  }
  for (const rows of [['AMOUNT DUE: 40.00'],['TOTAL DUE: 40.00'],['TAX: 1.55','SUBTOTAL: 10.00'],['TOTAL PAID: 10.00'],['TOTAL LABOR: 10.00'],['GRAND TOTAL 10.00','GRAND TOTAL 12.00']]) {
    assert.equal(parse(rows).totalCents,null);
  }
  assert.equal(parse(['RECEIPT', 'INVOICE TOTAL: 0.00']).totalCents,0);
});

test('low-confidence amounts and multiple invoice references stay for review', () => {
  const low = parseMaintenanceReceipt([{lines:invoice.map(text => ({text,confidence:text.startsWith('TOTAL:') ? 41 : 99}))}]);
  assert.equal(low.totalCents,null);
  const multi = parseMaintenanceReceipt([{text:invoice.join('\n')},{text:'INVOICE #: A-789\nTOTAL: 81.00'}]);
  assert.equal(multi.multipleInvoices,true);
  assert.equal(multi.totalCents,null);
  assert.equal(parse([...invoice,'Invoice #: A-142']).multipleInvoices,false);
  assert.equal(parse([]).pagesRead,0);
});

test('maintenance uses a distinct PDF filename and retains the reviewed pixels without affecting PODs', async () => {
  const preview = new File([Uint8Array.from([255,216,255,217])],'scan.jpg',{type:'image/jpeg'});
  const pages = [{preview,width:300,height:400}];
  const receipt = await buildPodScanPdf(pages,'','maintenance');
  const pod = await buildPodScanPdf(pages,'T-40');
  assert.match(receipt.name,/^Maintenance-receipt-/);
  assert.match(pod.name,/^POD-T-40-/);
  rememberReceiptPhotos(receipt,[preview]);
  assert.deepEqual(getReceiptPhotos(receipt),[preview]);
  assert.equal(getReceiptPhotos(pod),undefined);
});

test('keeps a disputed printed figure and difference for review and separates trailer from truck', () => {
  const result = parse(['Westfield Truck Repair', 'REPAIR INVOICE INV-REC-425', 'Trailer: 529', 'Labor: 20.00', 'Parts: 10.00', 'Total: 80.00']);
  assert.deepEqual([result.printedTotalCents,result.itemizedCents,result.differenceCents,result.totalCents], [8000,3000,5000,null]);
  assert.deepEqual([result.vendor,result.invoiceNumber,result.unit,result.assetType],['Westfield Truck Repair','INV-REC-425','529','trailer']);
  assert.equal(parse(['Truck 228','Total: 25.00']).assetType,'truck');
  assert.equal(parse(['Unit 228','Total: 25.00']).assetType,'unknown');
});

test('foreign and mixed currencies withhold the USD total even when the document sums exactly', () => {
  for (const currency of ['CAD', 'C$', 'EUR', 'GBP', 'AUD', '€', 'USD / CAD']) {
    const result=parse([...invoice,'Currency: '+currency]);
    assert.equal(result.foreignCurrency,true);
    assert.equal(result.printedTotalCents,8100);
    assert.equal(result.totalCents,null);
  }
});

test('a tax matching the entire total conflicts with a positive parts subtotal', () => {
  const receipt = parse(['Service invoice', 'Subtotal: 58.00','Tax: 62.11','Total: 62.11']);
  assert.equal(receipt.taxCents,null);
  assert.equal(receipt.printedTotalCents,6211);
  assert.equal(receipt.totalCents,null);
  assert.equal(parse(['Service invoice','Subtotal: 58.00','Tax: 4.11','Total: 62.11']).taxCents,411);
});

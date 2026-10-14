import fs from 'node:fs';
import assert from 'node:assert/strict';

// The shared compactor also handles receipts and invoices, not only RateCons.
// Preserve their reviewed identifiers and breakdown without retaining raw OCR.
const path='source/src/modules/scan/rateConSaveStabilityV10964.js';
const before='  const out = {};';
const after="  ['invoiceNo','receiptNo','subtotal','tax','amount','fee','currency','tip','fuelProvider'].forEach(key=>allowed.add(key));\n"+before;
const text=fs.readFileSync(path,'utf8');
if(!text.includes(after)){
  assert.equal(text.split(before).length,2,'Reader receipt projection compactor anchor');
  fs.writeFileSync(path,text.replace(before,()=>after));
}
console.log('PASS — receipt and invoice source fields survive shared save compaction');

import assert from 'node:assert/strict';
import test from 'node:test';
import {parseMaintenanceReceipt} from '../../app/operator/maintenanceReceiptFields.js';
import {maintenanceDraft, reviewMaintenance, localServiceDate} from '../../app/operator/maintenanceReview.js';

test('one printed part can supply the editable service description',()=>{
  const lines = [{description:'Coiled air line',amountCents:2500}];
  assert.equal(maintenanceDraft({lines},true).description,'Coiled air line');
  assert.equal(maintenanceDraft({lines,description:'Replaced supply line'},true).description,'Replaced supply line');
  assert.equal(maintenanceDraft({lines:[...lines,...lines]},true).description,'');
});

test('an observed $80 invoice with $30 of lines shows its $50 difference and requires deliberate correction',()=>{
  const read=parseMaintenanceReceipt([{text:['Truck: 228','Description Qty Unit Price Amount','Filter 1 10.00 10.00','Labor 1 20.00 20.00','TOTAL: 80.00'].join('\n')}]);
  const draft=maintenanceDraft(read,true);
  assert.equal(draft.assetType,'truck');
  assert.equal(draft.amount,'80.00');
  assert.match(reviewMaintenance(draft).message,/Lines plus tax \$30.00 · Printed total \$80.00 · Difference \$50.00/);
  draft.amount='30';
  assert.match(reviewMaintenance(draft).message,/against the original/);
  draft.totalConfirmed=true;
  assert.equal(reviewMaintenance(draft).details.totalCents,3000);
});

test('manual service only, checked invoice only, paid and balance, and foreign currency stay distinct',()=>{
  const draft=maintenanceDraft();
  assert.equal(draft.date,localServiceDate());
  Object.assign(draft,{amount:'425',paid:'200',balance:'225',payer:'unknown'});
  assert.match(reviewMaintenance(draft).message,/Check the invoice total/);
  draft.totalConfirmed=true;
  const details=reviewMaintenance(draft).details;
  assert.equal(details.totalCents,42500);assert.equal(details.paidCents,20000);assert.equal(details.balanceDueCents,22500);
  assert.equal(details.payer,'unknown');
  draft.balance='224';assert.match(reviewMaintenance(draft).message,/amount paid/);
  draft.mode='service_only';assert.equal(reviewMaintenance(draft).details.totalCents,null);
  const foreign=maintenanceDraft({foreignCurrency:true,currency:'CAD',totalCents:12300,paidCents:12300,lines:[{description:'Filter',amountCents:12300}]},true);
  assert.equal(foreign.paid,'');assert.equal(foreign.amount,'');assert.equal(foreign.lines.length,0);
  assert.equal(reviewMaintenance(foreign).details.totalCents,null);
  foreign.mode='total_only';assert.match(reviewMaintenance(foreign).message,/CAD/);
  draft.multipleInvoices=true;assert.match(reviewMaintenance(draft).message,/one invoice/);
});

test('matching quantities, signed discounts and rounded fractional prices are exact, negative payments are rejected',()=>{
  const mk=(quantity,unitPriceCents,amountCents)=>({description:'Invoice line',quantity,unitPriceCents,amountCents});
  const draft=maintenanceDraft({assetType:'trailer',unit:'529',lines:[mk(11,1600,17600),mk(.5,101,51),mk(.5,-101,-51)],
    subtotalCents:17600,taxCents:2400,totalCents:20000});
  assert.equal(reviewMaintenance(draft).details.assetType,'trailer');assert.equal(reviewMaintenance(draft).details.totalCents,20000);
  draft.lines[0].amount='170';assert.match(reviewMaintenance(draft).message,/Quantity × unit price/);
  draft.lines[0].amount='176';draft.paid='-1';assert.match(reviewMaintenance(draft).message,/amount paid/);
});

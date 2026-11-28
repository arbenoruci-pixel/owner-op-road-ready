import assert from 'node:assert/strict';
import test from 'node:test';
import {parseMaintenanceReceipt} from '../../app/operator/maintenanceReceiptFields.js';

function observation(rows) {
  const words=rows.flatMap((row,y) => row.map(([left,text,confidence=95]) =>
    ({text,left,top:100+y*25,width:Math.max(8,text.length*6),height:12,confidence})));
  return {text:rows.map(r=>r.map(c=>c[1]).join(' ')).join('\n'), source:'ocr',
    words,imageSize:{width:1000,height:900},lines:rows.map(row=>({text:row.map(x=>x[1]).join(' '),confidence:60}))};
}
const summary=()=>observation([
  [[10,'Parts'],[90,'20.00'],[260,'Total'],[360,'20.00'],[490,'Non-taxable'],[600,'0.00'],[710,'ENV/WST'],[758,'Tax:'],[880,'0.00']],
  [[10,'Labor'],[270,'Discount'],[490,'Taxable'],[600,'20.00'],[710,'TOTAL',22],[755,'►'],[772,'$'],[880,'22.32']],
  [[490,'Tax'],[600,'2.32'],[710,'Change'],[770,'returned'],[880,'0.00']]
]);
test('two page reads recover a reviewable printed grand total and its tax independently from adjacent ledger totals',()=>{
  const page=summary();
  page.supplemental=[summary()];
  const result=parseMaintenanceReceipt([page]);
  assert.deepEqual([result.totalCents,result.printedTotalCents,result.taxCents,result.lines.length],[2232,2232,232,0]);
  assert.deepEqual(result.issues,[]);
});
test('a weak single read, contradictory totals and unsupported column associations stay unresolved',()=>{
  assert.equal(parseMaintenanceReceipt([summary()]).totalCents,null);
  const a=observation([[[200,'Grand'],[235,'Total'],[400,'20.10']]]);
  const b=observation([[[200,'Grand'],[235,'Total'],[400,'21.10']]]);
  a.supplemental=[b];
  assert.equal(parseMaintenanceReceipt([a]).totalCents,null);
  assert.equal(parseMaintenanceReceipt([observation([[[30,'Total'],[150,'Qty'],[220,'45.89']]])]).totalCents,null);
});

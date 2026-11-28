import assert from 'node:assert/strict';
import test from 'node:test';
import {readSmallPrintHeader} from '../../app/operator/maintenanceHeaderRegion.js';
import {maintenanceHeader} from '../../app/operator/maintenanceReceiptHeader.js';

const source = () => ({text:'Invoice',supplemental:[{imageSize:{width:1000,height:1300},
  lines:[{text:'OTC Order #234 123456',confidence:96,left:670,top:85,width:200,height:16}]}]});
const detail = (vendor='TA Truck Service', id='234 123456') => ({lines:[
  {text:vendor,confidence:67},{text:'OTC Order #'+id,confidence:95}]});

test('a second view of the printed order and merchant recovers the identity without promoting other header numbers', async () => {
  const page=source();
  await readSmallPrintHeader(null,page,null,{},async (_file,area) => {
    assert.ok(area.width<.4 && area.height<.1);
    return detail();
  });
  const header=maintenanceHeader([page]);
  assert.equal(header.vendor,'TA Truck Service');
  assert.deepEqual(header.orderReferences,['OTC Order #234 123456']);
  assert.deepEqual(header.invoiceNumbers,[]);
});
test('other merchants, changed digits, weak anchors and already complete fields add no header evidence', async () => {
  for (const retry of [detail('Other Truck Service'), detail('TA Truck Service','234 123450')]) {
    const page=source(); await readSmallPrintHeader(null,page,null,{},async()=>retry);
    assert.equal(page.supplemental.length,1);
  }
  for(const flag of ['weak','complete','wrong form']) {
    const page=source();
    if (flag==='weak') page.supplemental[0].lines[0].confidence=39;
    if (flag==='complete') page.supplemental.push(detail());
    if (flag==='wrong form') page.supplemental[0].lines[0].text='Customer PO #234 123456';
    await readSmallPrintHeader(null,page,null,{},()=>assert.fail('unexpected OCR call'));
  }
});

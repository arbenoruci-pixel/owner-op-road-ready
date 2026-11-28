import test from 'node:test';
import assert from 'node:assert/strict';
import {maintenanceTableItems, maintenanceItemRegion, suppressItemGrid} from '../../app/operator/maintenanceReceiptItems.js';

const word=(text,left,top,confidence=96)=>({text,left,top,width:Math.max(20,text.length*7),height:12,confidence});
const header=[
  word('Part',10,20),word('Number',45,20),word('Description',150,21),
  word('Reg.',365,20),word('Price',395,20),word('Price',505,20),
  word('Qty',610,21),word('Extended',690,21),word('Amount',760,20),
];
function row(top,qty='2.00',cost='15.25',amount='30.50') {
  return [word('001',45,top),word('COILED',146,top),word('HOSE',195,top+1),
    word('EA',310,top+1),word('22.00',395,top),word(cost,510,top-1),
    word(qty,611,top),word(amount,759,top)];
}
const expected={description:'COILED HOSE',quantity:2,unitPriceCents:1525,amountCents:3050};
const parse=(...words)=>maintenanceTableItems({supplemental:[{words:words.flat()}]});

test('row alignment preserves sale price, quantity and extended amount; ending totals are not items',()=>{
  assert.deepEqual(parse(header,row(40),word('Subtotal',20,60),row(75)),[expected]);
  assert.deepEqual(parse(header,row(40),row(60)),[expected,expected]);
});

test('missing or ambiguous column or price never becomes a charge or inferred value',()=>{
  assert.deepEqual(parse(header.filter(w=>w.text!=='Qty'),row(40)),[]);
  assert.deepEqual(parse(header,row(40).filter(w=>w.text!=='30.50')),[]);
  assert.deepEqual(parse(header,row(40),word('31.50',767,40)),[]);
  assert.deepEqual(parse(header,row(40,'2.00','15.25','31.50')),[]);
  assert.deepEqual(parse(header,row(40).map(w=>w.text==='15.25'?{...w,confidence:44}:w)),[]);
});

test('repeated observations preserve rows once, and conflicting observations require review',()=>{
  const words=[...header,...row(60)];
  assert.deepEqual(maintenanceTableItems({words,supplemental:[{words}]}),[expected]);
  const conflicting=[...header,...row(60,'2.00','34.25','68.50')];
  assert.deepEqual(maintenanceTableItems({words,supplemental:[{words:conflicting}]}),[]);
});

test('a damaged regular-price heading still needs identical prices across competing columns',()=>{
  const unclear=header.map(word=>word.text==='Reg.'?{...word,text:'Neg.'}:word);
  const entries=row(60);
  assert.deepEqual(parse(unclear,entries),[]);
  assert.deepEqual(parse(unclear,entries.map(word=>word.text==='22.00'?{...word,text:'15.25'}:word)),[expected]);
});

test('a short item description requests one bounded crop and expands only from matching printed evidence',()=>{
  const imageSize={width:1000,height:1500};
  const clipped=row(55).map(word=>word.text==='HOSE'?{...word,text:'HO'}:word);
  const page={supplemental:[{imageSize,words:[...header,...clipped]}]};
  const region=maintenanceItemRegion(page);
  assert.ok(region && region.left<=header[0].left/imageSize.width);
  assert.ok(region.height<=.32);
  assert.equal(maintenanceItemRegion({imageSize,words:[...header,...row(55)]}),null);
  assert.equal(maintenanceItemRegion({imageSize,words:[...header,...clipped.map(w=>({...w,top:800}))]}),null);
  const withCrop=words=>({...page,supplemental:[...page.supplemental,{region:'items',imageSize,words}]});
  assert.deepEqual(maintenanceTableItems(withCrop(row(55))),[expected]);
  assert.deepEqual(maintenanceTableItems(withCrop(row(55,'2.00','8.20','16.40'))),[]);
  assert.equal(maintenanceTableItems(withCrop(row(55).map(w=>w.text==='HOSE'?{...w,text:'TIRE'}:w)))[0].description,'COILED HO');
});

test('only long thin rules are suppressed on the disposable OCR raster',()=>{
  const width=500,height=100,data=new Uint8ClampedArray(width*height*4).fill(255);
  const ink=(x,y)=>data.fill(0,(y*width+x)*4,(y*width+x)*4+3);
  for(let y=0;y<height;y++) {
    ink(200,y);
    for(let x=300;x<320;x++) ink(x,y);
  }
  for(let x=180;x<220;x++) ink(x,50);
  for(let y=40;y<60;y++) ink(100,y);
  suppressItemGrid({width,height,data});
  const intensity=(x,y)=>data[(y*width+x)*4];
  assert.equal(intensity(200,20),255);
  assert.equal(intensity(200,50),0);
  assert.equal(intensity(303,20),0);
  assert.equal(intensity(100,48),0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeBolBarcode,barcodeRegionForIdentifier} from './bolBarcode.js';
function image(){
  // Code 128 C: start, 00 12 34 50 00, checksum 19, stop. Fixed width fixture.
  const symbols=['211232','212222','112232','131123','231131','212222','221132','2331112'];
  const width=520,height=140,data=new Uint8ClampedArray(width*height*4).fill(255);let left=30;
  for(const symbol of symbols)for(const [index,run]of [...symbol].entries()){
    const end=left+Number(run)*4;
    if(index%2===0)for(let y=20;y<120;y++)for(let x=left;x<end;x++){const p=(y*width+x)*4;data[p]=data[p+1]=data[p+2]=0;}
    left=end;
  }
  return {width,height,data};
}
test('Code 128 preserves leading zeros, original pixels, bounds and checksum failure',async()=>{
  const source=image(),before=source.data.slice(),region={left:0,top:0,width:520,height:140};
  assert.deepEqual(await decodeBolBarcode(source,region),{value:'0012345000',format:'CODE_128',region});assert.deepEqual(source.data,before);
  assert.equal(await decodeBolBarcode(source,{...region,left:-1}),null);
  assert.equal(await decodeBolBarcode({...source,data:new Uint8ClampedArray(4)},region),null);
  assert.equal(await decodeBolBarcode({...source,data:new Uint8ClampedArray(source.data.length).fill(255)},region),null);
  const damaged=image();for(let y=0;y<damaged.height;y++)for(let x=210;x<260;x++)damaged.data.fill(255,(y*damaged.width+x)*4,(y*damaged.width+x)*4+4);
  assert.equal(await decodeBolBarcode(damaged,region),null);
});
test('barcode search stays adjacent to its identifier label and clips to the page',()=>{
  assert.deepEqual(barcodeRegionForIdentifier({left:950,top:155,width:300,height:40},{width:1314,height:1700}),{left:910,top:0,width:380,height:195});
  assert.equal(barcodeRegionForIdentifier(null,{width:100,height:100}),null);
});

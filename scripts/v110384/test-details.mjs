import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decodeBolBarcode,barcodeRegionForIdentifier} from '../v110382/bolBarcode.js';
import {planBolIdentifierRegion} from '../../packages/smart-reader-core/src/ocrRetry.js';
const source=fs.readFileSync('scripts/v110384/identifierDetail.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
const factory=new Function('deps','const {planBolIdentifierRegion,barcodeRegionForIdentifier,decodeBolBarcode,detailPixels,mapDetailRegion,detailFile}=deps;'+source+';return {prepareIdentifierDetail,expandedBarcodeRegion};');
const expanded=factory({}).expandedBarcodeRegion;

test('a barcode wider than its text region is decoded from the bounded adjacent fallback',async()=>{
  const width=1314,height=1700,data=new Uint8ClampedArray(width*height*4).fill(255);let left=910;
  for(const symbol of ['211232','212222','112232','131123','231131','212222','221132','2331112'])for(const [i,run]of [...symbol].entries()){
    const end=left+Number(run)*3;
    if(i%2===0)for(let y=95;y<156;y++)for(let x=left;x<end;x++){const p=(y*width+x)*4;data[p]=data[p+1]=data[p+2]=0;}
    left=end;
  }
  const image={width,height,data},region={left:966,top:165,width:170,height:24};
  assert.equal(await decodeBolBarcode(image,barcodeRegionForIdentifier(region,image)),null);
  const search=expanded(region,image),result=await decodeBolBarcode(image,search);
  assert.equal(result?.value,'0012345000');assert.deepEqual(result.region,search);
  assert.ok(search.width*search.height<width*height*.06);
});
test('identifier recovery tries alternative regions, keeps exact decoder pixels and honors cancellation',async()=>{
  const size={width:1000,height:1300},file={},cache=new Map(),calls=[],encoded=[];
  const passes=[0,1].map(i=>({id:'pass-'+i,words:[i],imageSize:size,sourceImageFile:file}));
  const api=factory({planBolIdentifierRegion:words=>({left:words[0]?650:100,top:100,width:200,height:20}),barcodeRegionForIdentifier,
    detailPixels:async(f,c)=>{assert.equal(f,file);assert.equal(c,cache);return size;},mapDetailRegion:r=>r,
    decodeBolBarcode:async(_,region)=>{calls.push(region);return region.left>500?{value:'0012345000',format:'CODE_128',region}:null;},
    detailFile:async(_,region,name,options)=>{encoded.push({region,name,options});return {name};}});
  const result=await api.prepareIdentifierDetail(passes,()=>{},file,cache);
  assert.equal(calls.length,3);assert.equal(result.sourcePassId,'pass-0');assert.equal(result.barcode.value,'0012345000');
  assert.deepEqual(encoded.at(-1).region,result.barcode.region);assert.equal(encoded.at(-1).options,undefined);
  assert.equal(encoded[0].options.padding,16);assert.equal(result.file.name,'road-ready-identifier-detail.png');
  await assert.rejects(()=>api.prepareIdentifierDetail(passes,()=>{throw new Error('cancelled');},file,cache),/cancelled/);
});
test('tight identifier crops exclude adjacent barcode ink without clipping number word bounds',()=>{
  const words=[{text:'B/L',left:780,top:160,width:25,height:14},{text:'NO:',left:810,top:160,width:26,height:14},{text:'0012345000',left:844,top:157,width:110,height:15}];
  const region=planBolIdentifierRegion(words,{width:1000,height:1300});
  assert.ok(region.top>=154);assert.ok(region.top<=157);assert.ok(region.left+region.width>=954);assert.ok(region.top+region.height>=174);
});
test('a detail cache is local to a reading and shares only the identical source File',async()=>{
  const code=fs.readFileSync('scripts/v110384/detailPixels.js','utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');let calls=0;
  const get=new Function('decodeImageFileV3',code+';return detailPixels;')(async()=>{calls++;return {width:1000,height:1300};});
  const file={},cache=new Map();await Promise.all([get(file,cache),get(file,cache)]);assert.equal(calls,1);
  await get({},cache);assert.equal(calls,2);await get(file,new Map());assert.equal(calls,3);
});

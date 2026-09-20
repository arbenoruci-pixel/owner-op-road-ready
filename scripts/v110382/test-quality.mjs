import test from 'node:test';
import assert from 'node:assert/strict';
import {assessDocumentQuality,normalizePaperLighting} from './documentQuality.js';
const corners=[{x:.2,y:.15},{x:.8,y:.15},{x:.8,y:.85},{x:.2,y:.85}];
function page(background=255,ink=true){
  const width=600,height=800,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const inside=x>=120&&x<480&&y>=120&&y<680;
    let v=inside?245:(background==='texture'?((x+y)%2?0:255):background);
    if(inside&&ink&&x>150&&x<450&&y%24<3)v=25;
    const p=(y*width+x)*4;data[p]=data[p+1]=data[p+2]=v;data[p+3]=255;
  }
  return {width,height,data};
}
const options={corners,nativeWidth:2400,nativeHeight:3200};
test('outside texture cannot improve focus, including paper edges',()=>{
  for(const ink of [true,false]){
    const results=[0,255,'texture'].map(background=>assessDocumentQuality(page(background,ink),options));
    assert.deepEqual(results[0],results[1]);assert.deepEqual(results[0],results[2]);
    assert.ok(results[0].metrics.sampledPixels>0);if(!ink)assert.equal(results[0].ready,false);
  }
});
test('native paper resolution, text regions and invalid corners control guidance',()=>{
  const source=page(),before=source.data.slice(),sharp=assessDocumentQuality(source,options);
  assert.equal(sharp.ready,true);assert.ok(sharp.metrics.textTileCount>=3);assert.ok(sharp.metrics.textSharpness>32);assert.deepEqual(source.data,before);
  const small=assessDocumentQuality(source,{corners});assert.equal(small.ready,false);assert.ok(small.issues.some(s=>s.includes('Low resolution')));
  for(const bad of [[corners[0],corners[2],corners[1],corners[3]],corners.map(p=>({...p,x:NaN})),corners.map(()=>({x:.5,y:.5}))])assert.equal(assessDocumentQuality(source,{corners:bad}).status,'retake');
  const blank=assessDocumentQuality(page('texture',false),options);assert.equal(blank.ready,false);assert.ok(blank.issues.some(s=>s.includes('faint or missing')));
});
test('cleanup preserves original bytes and the dominant stamp color',()=>{
  const source=page(),p=(350*source.width+300)*4;source.data[p]=185;source.data[p+1]=40;source.data[p+2]=30;
  const before=source.data.slice(),output=normalizePaperLighting(source);
  assert.deepEqual(source.data,before);assert.equal(output.width,source.width);assert.equal(output.height,source.height);
  assert.ok(output.data[p]>output.data[p+1]);assert.ok(output.data[p]>output.data[p+2]);
});

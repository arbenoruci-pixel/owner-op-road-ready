import assert from 'node:assert/strict';
import {detectDocumentBoundary} from './v110330/documentBoundary.js';
// Deterministic carpet-like texture and creased paper, without private video pixels.
function fixture(seed=1) {
  const width=420,height=740,data=new Uint8ClampedArray(width*height*4);
  const expected=[{x:64,y:236},{x:350,y:247},{x:344,y:631},{x:57,y:620}];
  const cross=(a,b,x,y)=>(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const inside=expected.every((a,i)=>cross(a,expected[(i+1)%4],x,y)>=0),i=(y*width+x)*4;
    const noise=((x*73+y*137+x*y*seed)%127)/127;
    let rgb=[80+noise*135,65+noise*130,38+noise*105];
    if(inside){const shade=1-.12*(Math.sin(x*.09)**8);rgb=[225*shade,229*shade,221*shade];if(x>86&&x<325&&y>267&&y<598&&(y%21<3)&&(x%49<42))rgb=[60,63,59];const bottomDistance=620+(x-57)*11/287-y;if(x>78&&x<330&&bottomDistance>8&&bottomDistance<16)rgb=[20,20,20];}
    data.set([...rgb,255],i);
  }
  return {width,height,data,expected};
}
for(const seed of [1,3,7,11,17]){
  const image=fixture(seed),before=image.data.slice(),found=detectDocumentBoundary(image);
  assert.ok(found.found);const error=Math.max(...found.corners.map((p,i)=>Math.hypot(p.x*(image.width-1)-image.expected[i].x,p.y*(image.height-1)-image.expected[i].y)));
  assert.ok(error<7,'paper edge error '+error);assert.deepEqual(image.data,before);
}
console.log('PASS — five textured-background boundary cases retain the paper within seven source pixels');

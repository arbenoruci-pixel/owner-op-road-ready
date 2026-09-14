import assert from 'node:assert/strict';
import {angledPageFixture} from './v110339/angledPageFixture.mjs';
import {orderDocumentCorners} from './v110339/cornerOrder.js';
import {orderCornersV3,rotateCornersClockwiseV3} from '../source/src/modules/scan/v3/scannerTypesV3.js';
import {detectDocumentEdgesV3} from '../source/src/modules/scan/v3/EdgeDetectorV3.js';
import {warpPerspectiveV10934} from '../source/src/modules/scan/v3/PerspectiveEngineV10934.js';

const permutations=items=>items.length?items.flatMap((item,i)=>permutations(items.filter((_,j)=>j!==i)).map(rest=>[item,...rest])):[[]];
for(const angle of [-75,-55,-35,-15,0,15,35,55,75]){
  const source=angledPageFixture({angle}),snapshot=source.data.slice(),expectedSet=new Set(source.corners.map(p=>JSON.stringify(p)));
  const ordered=orderCornersV3(source.corners);
  for(const permutation of permutations(source.corners)){
    const actual=orderCornersV3(permutation);
    assert.equal(new Set(actual.map(p=>JSON.stringify(p))).size,4,'four unique source corners at '+angle);
    assert.ok(actual.every(p=>expectedSet.has(JSON.stringify(p))),'never silently substitute the scene boundary');
    assert.deepEqual(actual,ordered,'input order cannot change the crop');
  }
  let rotated=ordered;for(let turn=0;turn<4;turn++)rotated=rotateCornersClockwiseV3(rotated);
  assert.ok(rotated.every(p=>ordered.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1e-8)),'four turns retain every corner');
  const detection=detectDocumentEdgesV3(source);assert.ok(detection.found&&detection.confidence>=.8,'find tilted paper at '+angle);
  const corners=orderCornersV3(detection.corners);
  assert.ok(corners.every(p=>source.corners.some(q=>Math.hypot((p.x-q.x)*source.width,(p.y-q.y)*source.height)<18)),'detected corners stay on the main paper');
  const result=warpPerspectiveV10934(source,corners,{maxUpscale:1,interpolation:'bilinear'});
  assert.ok(result.width<600&&result.height<600,'rectification excludes the surrounding scene');
  let paper=0,count=0;const colorCounts=[0,0,0,0];
  for(let i=0;i<result.data.length;i+=16){
    const [r,g,b]=result.data.slice(i,i+3);count++;if(Math.min(r,g,b)>190)paper++;
    if(r>g*1.7&&r>b*1.7)colorCounts[0]++;
    if(g>r*1.7&&g>b*1.7)colorCounts[1]++;
    if(b>r*1.7&&b>g*1.7)colorCounts[2]++;
    if(r>g*1.7&&b>g*1.7&&Math.abs(r-b)<80)colorCounts[3]++;
  }
  assert.ok(paper/count>.8,'saved pixels contain paper rather than carpet');
  assert.ok(colorCounts.every(n=>n>10),'all four corner marks survive the perspective transform');
  assert.deepEqual(source.data,snapshot,'source pixels remain unchanged');
}
assert.equal(orderDocumentCorners([{x:0,y:0},{x:0,y:0},{x:1,y:1},{x:0,y:1}]),null);
assert.equal(orderDocumentCorners([{x:0,y:0},{x:1,y:0},{x:.5,y:.1},{x:0,y:1}]),null);
console.log('PASS — nine tilted pages and 216 corner permutations retain the real paper, every corner mark and original pixels');

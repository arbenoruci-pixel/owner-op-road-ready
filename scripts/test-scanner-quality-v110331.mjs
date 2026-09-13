import assert from 'node:assert/strict';
import {updateCaptureWindow} from './v110331/captureWindow.js';
import {cleanupDocumentPaper} from './v110331/paperCleanup.js';
const corners=[{x:.15,y:.12},{x:.85,y:.12},{x:.85,y:.88},{x:.15,y:.88}];
const observation=(offset=0)=>({found:true,confidence:.94,corners:corners.map(p=>({x:p.x+offset,y:p.y}))});
const quality={ready:true};
let window=null;
for(const time of [0,220,440])window=updateCaptureWindow(window,observation(),quality,time);
assert.equal(window.ready,true,'three agreeing sharp frames capture after 440 ms');
window=null;
for(const [time,offset] of [[0,0],[220,.04],[440,.004],[660,.001]])window=updateCaptureWindow(window,observation(offset),quality,time);
assert.equal(window.ready,true,'one corner outlier does not restart the full wait');
window=null;
for(let i=0;i<15;i++){
  window=updateCaptureWindow(window,observation(i*.012),quality,i*220);
  assert.equal(window.ready,false,'sustained movement must not auto-capture');
}
for(const invalid of [{detection:observation(),quality:{ready:false}},{detection:{...observation(),found:false},quality},{detection:{...observation(),confidence:.65},quality}]){
  window=updateCaptureWindow(null,observation(),quality,0);
  window=updateCaptureWindow(window,observation(),quality,220);
  window=updateCaptureWindow(window,invalid.detection,invalid.quality,440);
  assert.equal(window.ready,false);assert.equal(window.samples.length,0);
  window=updateCaptureWindow(window,observation(),quality,660);
  assert.equal(window.ready,false,'loss, blur or weak detection must require fresh evidence');
}
window=updateCaptureWindow(null,observation(),quality,0);
window=updateCaptureWindow(window,observation(),quality,220);
window=updateCaptureWindow(window,observation(),quality,2000);
assert.equal(window.ready,false,'stale observations cannot trigger capture');

// Procedural paper with smooth illumination, folds, fine print, faint pencil,
// colored marks and a filled footer. No user document pixels enter the repository.
export function paperFixture(width=1400,height=1900){
  const data=new Uint8ClampedArray(width*height*4),paper=[],ink={black:[],pencil:[],red:[],blue:[],footer:[]};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/width,v=y/height;
    const shade=.76+.18*u-.19*Math.exp(-(((u-.43)/.025)**2))-.14*Math.exp(-(((v-.67-u*.07)/.015)**2));
    let rgb=[245,238,220],kind='paper';
    if(v>.12&&v<.54&&y%35<3&&u>.12&&u<.84&&x%48<36){rgb=[30,28,26];kind='black';}
    if(v>.58&&v<.64&&y%16<2&&u>.15&&u<.75){rgb=[173,168,155];kind='pencil';}
    if(u>.17&&u<.6&&Math.abs(v-(.74+.012*Math.sin(u*90)))<.0015){rgb=[177,37,33];kind='red';}
    if(u>.30&&u<.8&&Math.abs(v-(.80+.010*Math.sin(u*76)))<.0015){rgb=[35,65,170];kind='blue';}
    if(v>.90&&v<.925&&u>.08&&u<.92){rgb=[20,20,20];kind='footer';}
    const i=(y*width+x)*4;data.set([...rgb.map(c=>c*shade),255],i);
    if(x%3===0&&y%3===0){if(kind==='paper'&&(v<.10||(v>.65&&v<.70)))paper.push(i);else if(kind!=='paper')ink[kind].push(i);}
  }
  return {width,height,data,paper,ink};
}
const fixture=paperFixture(),before=fixture.data.slice(),start=performance.now(),clean=cleanupDocumentPaper(fixture),elapsed=performance.now()-start;
const luminance=(data,i)=>data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;
const stats=(data,indices)=>{const values=indices.map(i=>luminance(data,i)),mean=values.reduce((a,b)=>a+b,0)/values.length;return {mean,sd:Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/values.length)};};
const originalPaper=stats(fixture.data,fixture.paper),cleanPaper=stats(clean.data,fixture.paper);
assert.ok(cleanPaper.sd<originalPaper.sd*.30,'broad fold and illumination variation reduced');
assert.ok(cleanPaper.mean>245,'paper background brightened');
assert.ok(stats(clean.data,fixture.ink.black).mean<65,'fine black print retained');
assert.ok(stats(clean.data,fixture.ink.pencil).mean<205,'faint pencil retains contrast');
assert.ok(stats(clean.data,fixture.ink.footer).mean<65,'filled dark footer retained');
for(const i of fixture.ink.red)assert.ok(clean.data[i]>clean.data[i+1]*1.6&&clean.data[i]>clean.data[i+2]*1.6,'red ink remains red');
for(const i of fixture.ink.blue)assert.ok(clean.data[i+2]>clean.data[i]*1.6&&clean.data[i+2]>clean.data[i+1]*1.4,'blue ink remains blue');
assert.deepEqual(fixture.data,before,'source remains immutable');
assert.notEqual(clean.data,fixture.data);assert.equal(clean.width,fixture.width);assert.equal(clean.height,fixture.height);
assert.ok(clean.data.every((v,i)=>i%4!==3||v===255),'alpha retained');
console.log('PASS — capture tolerates isolated jitter, rejects movement/blur/loss; paper cleanup preserves ink and originals',JSON.stringify({milliseconds:Math.round(elapsed),originalPaper,cleanPaper,ink:Object.fromEntries(Object.entries(fixture.ink).map(([name,indices])=>[name,stats(clean.data,indices).mean]))}));

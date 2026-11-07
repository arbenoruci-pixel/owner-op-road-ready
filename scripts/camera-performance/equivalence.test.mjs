import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {optimizeBoundarySource} from './transform.mjs';
const read=p=>fs.readFileSync(p,'utf8');
const moduleUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const baseline=read('scripts/v110334/documentBoundary.js'),optimized=optimizeBoundarySource(baseline);
const oldUrl=moduleUrl(baseline+'\nexport {sampleImage};'),newUrl=moduleUrl(optimized+'\nexport {sampleImage};');
const old=await import(oldUrl),next=await import(newUrl);
assert.equal(read('source/src/modules/scan/v3/documentBoundaryV110329.js'),optimized);
assert.equal(read('source/src/modules/scan/v3/captureWindowV110331.js'),read('scripts/v110331/captureWindow.js'),'Capture timing and stability gate is unchanged');

// Compare every returned field, including scores, metrics and ordered debug candidates.
const wrapperUrl=moduleUrl(`import assert from 'node:assert/strict';import * as old from ${JSON.stringify(oldUrl)};import * as next from ${JSON.stringify(newUrl)};
export const FULL_FRAME=old.FULL_FRAME;export const stats={cases:0,oldMs:0,newMs:0};
export function detectDocumentBoundary(image,options={}){for(const maxSide of [options.maxSide||384,640]){const settings={...options,maxSide,debug:true};const before=image.data.slice();let t=performance.now();const expected=old.detectDocumentBoundary(image,settings);stats.oldMs+=performance.now()-t;t=performance.now();const actual=next.detectDocumentBoundary(image,settings);stats.newMs+=performance.now()-t;assert.deepEqual(actual,expected);assert.deepEqual(image.data,before);stats.cases++;}return old.detectDocumentBoundary(image,options);}`);
const {stats}=await import(wrapperUrl);
for(const [file,anchor] of [
  ['scripts/test-scanner-surface-v110334.mjs',"import {detectDocumentBoundary,FULL_FRAME} from './v110334/documentBoundary.js';"],
  ['scripts/test-scanner-video-v110330.mjs',"import {detectDocumentBoundary} from './v110330/documentBoundary.js';"],
]){
  const source=read(file);assert.equal(source.split(anchor).length,2);
  await import(moduleUrl(source.replace(anchor,`import {detectDocumentBoundary,FULL_FRAME} from ${JSON.stringify(wrapperUrl)};`)));
}

let randomState=0x1234abcd;
const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
let samples=0;
for(const Type of [Uint8Array,Uint8ClampedArray,Float32Array,Array])for(const [width,height] of [[1,1],[3,5],[24,24],[31,47],[96,129],[191,257],[465,640]]){
  const data=Type===Array?Array.from({length:width*height*4},()=>random()*255):new Type(Array.from({length:width*height*4},()=>random()*255));
  const image={width,height,data},before=data.slice();
  for(const maxSide of [Math.max(width,height),96,193,Math.max(width,height)+.25]){
    assert.deepEqual(next.sampleImage(image,maxSide),old.sampleImage(image,maxSide));samples++;
  }
  assert.deepEqual(data,before);
}
for(const image of [{width:24.2,height:31,data:new Uint8Array(24*31*4)},{width:31,height:24.2,data:new Uint8ClampedArray(31*24*4)}])assert.deepEqual(next.sampleImage(image,640),old.sampleImage(image,640),'Noninteger dimensions retain original fallback sampling');
for(let seed=0;seed<60;seed++){
  const width=24+Math.floor(random()*150),height=24+Math.floor(random()*190);
  const image={width,height,data:new Uint8ClampedArray(Array.from({length:width*height*4},()=>random()*256))},before=image.data.slice();
  const settings={maxSide:seed%2?96:640,debug:true};
  assert.deepEqual(next.detectDocumentBoundary(image,settings),old.detectDocumentBoundary(image,settings));
  assert.deepEqual(image.data,before);
}

// Replay the final installer in isolation; unknown source must fail before writes.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'camera-performance-'));
try{
  for(const file of ['scripts/camera-performance/install.mjs','scripts/camera-performance/transform.mjs','scripts/v110334/documentBoundary.js','source/src/modules/scan/v3/EdgeDetectorV3.js','source/src/modules/scan/v3/safeDocumentBoundaryV110428.js']){
    const target=path.join(dir,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);
  }
  const target=path.join(dir,'source/src/modules/scan/v3/documentBoundaryV110329.js');fs.writeFileSync(target,baseline);
  const run=()=>spawnSync(process.execPath,['scripts/camera-performance/install.mjs'],{cwd:dir,encoding:'utf8'});
  for(let i=0;i<2;i++){const result=run();assert.equal(result.status,0,result.stderr);assert.equal(read(target),optimized);}
  const unknown=optimized+'\n// unknown change\n';fs.writeFileSync(target,unknown);assert.notEqual(run().status,0);assert.equal(read(target),unknown);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log(`PASS — ${stats.cases} complete scene outputs, ${samples} exact sampling arrays, 60 fixed-seed randomized outputs; immutable pixels, unchanged gate, installer replay and unknown-change rejection`);
console.log('Detector comparison timings (informational only): '+JSON.stringify(stats));

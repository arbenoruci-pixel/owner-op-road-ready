import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {detectSafeDocumentBoundary,framedPaperEvidence,paperContinuation} from '../../source/src/modules/scan/v3/safeDocumentBoundaryV110428.js';
import {FULL_FRAME} from '../../source/src/modules/scan/v3/documentBoundaryV110329.js';

function scannedForm(width=320,height=420,tone=235) {
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const shade=tone-12*Math.abs(x-width*.5)/width;
    let rgb=[shade,shade,shade];
    // Heavy internal tables with header and signature outside their rectangle.
    if(x>width*.10&&x<width*.94&&y>height*.20&&y<height*.77&&(y%29<3||x%81<2))rgb=[18,18,18];
    if(x>width*.12&&x<width*.70&&y>height*.04&&y<height*.07)rgb=[30,30,30];
    if(x>width*.61&&x<width*.91&&y>height*.92&&y<height*.96&&(x+y)%13<3)rgb=[28,58,118];
    data.set([...rgb,255],(y*width+x)*4);
  }
  return {width,height,data};
}
for(const [w,h] of [[320,420],[420,320],[512,720]])for(const tone of [192,220,250]) {
  const image=scannedForm(w,h,tone),original=image.data.slice(),d=detectSafeDocumentBoundary(image);
  assert.equal(framedPaperEvidence(image).alreadyFramed,true);
  assert.deepEqual(d.corners,FULL_FRAME,'keep header and signature '+JSON.stringify({w,h,tone}));
  assert.equal(d.method,'already-framed-paper-v110428');
  assert.equal(d.found,false,'preserving a full frame does not claim a found physical boundary');
  assert.deepEqual(image.data,original);
  const internal=[{x:.10,y:.20},{x:.94,y:.20},{x:.94,y:.77},{x:.10,y:.77}];
  assert.ok(paperContinuation(image,internal).some(n=>n>=.82),'paper continues beyond the internal rules');
}
for(const image of [null,{width:0,height:20,data:[]},{width:100,height:100,data:[]},{width:Infinity,height:24,data:[]}])assert.deepEqual(detectSafeDocumentBoundary(image).corners,FULL_FRAME);
// Exercise the new runtime guard against the existing camera fixtures as well.
// Their procedural pixels cover pale desks, carpet, shadows and colored paper.
const safeUrl=pathToFileURL(resolve('source/src/modules/scan/v3/safeDocumentBoundaryV110428.js')).href;
const coreUrl=pathToFileURL(resolve('source/src/modules/scan/v3/documentBoundaryV110329.js')).href;
for(const [file,anchor] of [
 ['scripts/test-scanner-surface-v110334.mjs',"import {detectDocumentBoundary,FULL_FRAME} from './v110334/documentBoundary.js';"],
 ['scripts/test-scanner-video-v110330.mjs',"import {detectDocumentBoundary} from './v110330/documentBoundary.js';"],
]) {
 const source=fs.readFileSync(file,'utf8');assert.ok(source.includes(anchor));
 const runtime=source.replace(anchor,`import {detectSafeDocumentBoundary as detectDocumentBoundary} from '${safeUrl}';\nimport {FULL_FRAME} from '${coreUrl}';`);
 await import('data:text/javascript;base64,'+Buffer.from(runtime).toString('base64'));
}
assert.match(fs.readFileSync('source/src/modules/scan/v3/EdgeDetectorV3.js','utf8'),/safeDocumentBoundaryV110428/);
console.log('PASS — nine framed forms retain every edge; internal tables rejected; 25 existing scene cases; source pixels untouched');

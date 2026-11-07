import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cleanupDocumentPaper} from './paperQuality.js';

// Load the exact proposed modules without depending on generated app files.
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const coreUrl=url(fs.readFileSync('scripts/v110334/documentBoundary.js','utf8'));
const load=path=>import(url(fs.readFileSync(path,'utf8').replaceAll("'./documentBoundaryV110329.js'",JSON.stringify(coreUrl))));
const {captureGeometry,bindCapture}=await load('scripts/scanner-paper/captureGeometry.js');
const {detectSafeDocumentBoundary,paperContinuation}=await load('scripts/scanner-paper/safeDocumentBoundary.js');
const {FULL_FRAME}=await import(coreUrl);
const analysisStub=url('export function analyzeCameraFrame(pixels,width,height){return {width,height,pixels,fallback:true};}');
const clientSource=fs.readFileSync('scripts/scanner-paper/cameraAnalysisClient.js','utf8').replace("'./cameraAnalysisV1104110.js'",JSON.stringify(analysisStub)).replace("'./cameraAnalysisWorkerV1104110.js'","'file:///cameraAnalysisWorkerV1104110.js'");
const {createCameraAnalyzer}=await import(url(clientSource));

function shadow(blue){
  const width=160,height=180,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const light=230+x%26;data.set([...(y>85&&x>25&&x<135?[180,185,blue]:[light,light,light]),255],(y*width+x)*4);}
  return {width,height,data};
}
test('blue shadow gradient has no purple threshold or discontinuity',()=>{
  let previous=null;
  for(let blue=210;blue<=255;blue++){
    const input=shadow(blue),before=input.data.slice(),result=cleanupDocumentPaper(input),i=(130*input.width+80)*4,rgb=[...result.data.slice(i,i+3)];
    assert.deepEqual(input.data,before);
    assert.ok(Math.max(...rgb)-Math.min(...rgb)<8,'neutral shadow '+blue+': '+rgb);
    if(previous)assert.ok(Math.max(...rgb.map((v,c)=>Math.abs(v-previous[c])))<=4,'smooth neighboring tones');
    previous=rgb;
  }
});
test('constant bright paper is sampled despite floating-point bin rounding',()=>{
  const input=shadow(230);for(let i=0;i<input.data.length;i+=4)input.data.set([245,245,245,255],i);
  for(let y=50;y<65;y++)for(let x=40;x<43;x++)input.data.set([100,100,100,255],(y*160+x)*4);
  const output=cleanupDocumentPaper(input);assert.ok(output.data[(55*160+41)*4]<130,'retain faint ink');
});
test('capture coordinates require the same file, orientation and final boundary',()=>{
  const file={name:'page.jpg',size:1234,type:'image/jpeg',lastModified:10},image={width:1600,height:2200};
  const corners=[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}],detection={corners,found:true,confidence:.94};
  const capture=bindCapture(file,{...image,detection},{method:'video-burst'});
  assert.deepEqual(captureGeometry(file,image,capture,detection).corners,corners);
  for(const result of [captureGeometry({...file,size:456},image,capture,detection),captureGeometry(file,{width:2200,height:1600},capture,detection),captureGeometry(file,image,capture,{...detection,corners:corners.map(p=>({...p,y:p.y*.5}))}),captureGeometry(file,image,capture,{found:false})]){
    assert.deepEqual(result.corners,FULL_FRAME);assert.equal(result.review,true);
  }
});
test('a printed border across a blue shadow cannot crop off the header',()=>{
  const width=300,height=420,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let rgb=[45,47,43];
    if(x>30&&x<270&&y>25&&y<395){rgb=y<210?[237,239,244]:[171,181,226];if(y>80&&y<370&&y%25<2&&x>45&&x<255)rgb=[40,40,40];if(y>205&&y<210)rgb=[20,20,20];}
    data.set([...rgb,255],(y*width+x)*4);
  }
  const input={width,height,data},inner=[{x:.12,y:.49},{x:.88,y:.49},{x:.88,y:.92},{x:.12,y:.92}];
  assert.ok(paperContinuation(input,inner,{shadows:true})[0]>=.82);
  const result=detectSafeDocumentBoundary(input,{maxSide:640});
  assert.ok(!result.found||Math.max(result.corners[0].y,result.corners[1].y)<.12,'header must remain inside or retain full photo');
});
test('existing paper scenes still distinguish forms from upholstery and desks',async()=>{
  const safeUrl=url(fs.readFileSync('scripts/scanner-paper/safeDocumentBoundary.js','utf8').replaceAll("'./documentBoundaryV110329.js'",JSON.stringify(coreUrl)));
  for(const [file,anchor] of [['scripts/test-scanner-surface-v110334.mjs',"import {detectDocumentBoundary,FULL_FRAME} from './v110334/documentBoundary.js';"],['scripts/test-scanner-video-v110330.mjs',"import {detectDocumentBoundary} from './v110330/documentBoundary.js';"]]){
    const source=fs.readFileSync(file,'utf8');assert.ok(source.includes(anchor));
    await import(url(source.replace(anchor,`import {detectSafeDocumentBoundary as detectDocumentBoundary} from '${safeUrl}';import {FULL_FRAME} from '${coreUrl}';`)));
  }
});
test('camera worker reuses one instance, releases work and falls back on errors',async()=>{
  const original=globalThis.Worker;let created=0,terminated=0,worker;
  try{
    globalThis.Worker=class{constructor(){created++;worker=this;}postMessage(data){this.data=data;}terminate(){terminated++;}};
    const analyzer=createCameraAnalyzer(),pixels={width:24,height:24,data:new Uint8ClampedArray(24*24*4)};
    const first=analyzer.analyze(pixels,1200,1600);assert.equal(analyzer.busy(),true);worker.onmessage({data:{ok:true,value:{frame:1}}});assert.deepEqual(await first,{frame:1});assert.equal(analyzer.busy(),false);
    const second=analyzer.analyze(pixels,1200,1600);worker.onmessage({data:{ok:true,value:{frame:2}}});await second;assert.equal(created,1);
    const failure=analyzer.analyze(pixels,1200,1600);worker.onerror();assert.equal((await failure).fallback,true);assert.equal(terminated,1);
    assert.equal((await analyzer.analyze(pixels,1200,1600)).fallback,true);assert.equal(created,1);
    analyzer.dispose();await assert.rejects(()=>analyzer.analyze(pixels,1200,1600),/closed/);
    const closing=createCameraAnalyzer(),pending=closing.analyze(pixels,1200,1600);closing.dispose();await assert.rejects(pending,/closed/);
  }finally{globalThis.Worker=original;}
});

// Reuse the existing stamp/open-digit regression against the new filter.
const legacy=fs.readFileSync('scripts/scanner-clear/core.test.mjs','utf8');
const inkTest=legacy.slice(legacy.indexOf("test('warm paper shadows"),legacy.indexOf("test('sparse sharp print"));
await import(url("import test from 'node:test';import assert from 'node:assert/strict';import {cleanupDocumentPaper} from '"+new URL('./paperQuality.js',import.meta.url).href+"';\n"+inkTest));

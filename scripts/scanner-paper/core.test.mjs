import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cleanupDocumentPaper} from './paperQuality.js';
import {canUseSinglePodFrame,needsSmallPrintReview} from './podFramePolicy.js';

// Load the exact proposed modules without depending on generated app files.
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const coreUrl=url(fs.readFileSync('scripts/v110334/documentBoundary.js','utf8'));
const safeUrl=url(fs.readFileSync('scripts/scanner-paper/safeDocumentBoundary.js','utf8').replaceAll("'./documentBoundaryV110329.js'",JSON.stringify(coreUrl)));
const load=path=>import(url(fs.readFileSync(path,'utf8').replaceAll("'./documentBoundaryV110329.js'",JSON.stringify(coreUrl)).replaceAll("'./safeDocumentBoundaryV110428.js'",JSON.stringify(safeUrl))));
const {captureGeometry,bindCapture,podCaptureGeometry}=await load('scripts/scanner-paper/captureGeometry.js');
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
  for(const [upper,lower] of [[[237,239,244],[171,181,226]],[[195,206,231],[156,179,224]],[[170,183,212],[120,144,196]]]){
  const width=300,height=420,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let rgb=[45,47,43];
    if(x>30&&x<270&&y>25&&y<395){rgb=y<210?upper:lower;if(y>80&&y<370&&y%25<2&&x>45&&x<255)rgb=[40,40,40];if(y>205&&y<210)rgb=[20,20,20];}
    data.set([...rgb,255],(y*width+x)*4);
  }
  const input={width,height,data},inner=[{x:.12,y:.49},{x:.88,y:.49},{x:.88,y:.92},{x:.12,y:.92}];
  assert.ok(paperContinuation(input,inner,{shadows:true})[0]>=.82);
  const result=detectSafeDocumentBoundary(input,{maxSide:640});
  assert.ok(!result.found||Math.max(result.corners[0].y,result.corners[1].y)<.12,'header must remain inside or retain full photo');
  }
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

test('POD outer-edge recovery uses the same captured pixels and protects ambiguous signatures', () => {
  const file = new File(['synthetic'],'pod.jpg',{type:'image/jpeg',lastModified:1795700000});
  const width=240, height=320;
  const corners=[{x:.12,y:.12},{x:.88,y:.12},{x:.88,y:.88},{x:.12,y:.88}];
  const detection={found:true,confidence:.94,corners};
  const capture=bindCapture(file,{width,height,detection});
  const image={width,height,data:new Uint8ClampedArray(width*height*4)};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const paper=x>=width*.12&&x<=width*.88&&y>=height*.12&&y<=height*.88;
    const signature=paper&&x>60&&x<160&&Math.abs(y-(.855*height+2*Math.sin(x/8)))<1.5;
    image.data.set(signature?[25,40,110,255]:paper?[100,103,105,255]:[19,21,22,255],(y*width+x)*4);
  }
  const before=image.data.slice();
  const lost={found:false,method:'insufficient-line-support'};
  const recovered=podCaptureGeometry(file,image,capture,lost);
  assert.equal(recovered.reason,'pod-verified-outer-edges');
  assert.equal(recovered.review,false);
  assert.ok(recovered.corners[0].x<=.12&&recovered.corners[2].y>.88,'keep fine print and signature inside');
  assert.equal(captureGeometry(file,image,capture,lost).review,true,'ordinary scanner unchanged');

  const inner={...detection,corners:[{x:.24,y:.24},{x:.76,y:.24},{x:.76,y:.76},{x:.24,y:.76}]};
  const unsafe=podCaptureGeometry(file,image,bindCapture(file,{width,height,detection:inner}),lost);
  assert.equal(unsafe.review,true);
  assert.deepEqual(unsafe.corners,FULL_FRAME);
  assert.equal(unsafe.suggestedCorners,undefined,'do not propose an edge crossing the signature sheet');
  assert.equal(podCaptureGeometry(file,image,bindCapture(file,{width,height,detection:inner}),inner).reason,'pod-paper-beyond-edge');
  assert.equal(podCaptureGeometry(file,image,null,inner).reason,'pod-paper-beyond-edge');
  assert.equal(podCaptureGeometry(file,image,null,detection).review,false,'complete native photo still crops');
  const conflict=podCaptureGeometry(file,image,capture,inner);
  assert.equal(conflict.review,true);
  assert.deepEqual(conflict.corners,FULL_FRAME);
  const wrongFile=podCaptureGeometry(new File(['other'],'new.jpg',{type:'image/jpeg'}),image,capture,lost);
  assert.equal(wrongFile.suggestedCorners,undefined);
  assert.deepEqual(wrongFile.corners,FULL_FRAME);
  assert.ok(podCaptureGeometry(file,{...image,width:height,height:width},capture,lost).review);
  assert.ok(podCaptureGeometry(file,image,capture,{...lost,method:'internal-rule-rejected'}).review);
  const faint=podCaptureGeometry(file,image,null,{...detection,confidence:.5});
  assert.equal(faint.review,true);
  assert.deepEqual(faint.corners,FULL_FRAME);
  assert.deepEqual(image.data,before);
});

test('single POD frame requires complete matching sharp page with real small-print resolution', () => {
  const detection={found:true,confidence:.91,corners:[{x:.1,y:.15},{x:.9,y:.15},{x:.9,y:.85},{x:.1,y:.85}]};
  const quality={ready:true,metrics:{shortEdge:1130,textSharpness:108,textTileCount:13}};
  assert.ok(canUseSinglePodFrame({quality,detection},detection));
  assert.equal(canUseSinglePodFrame({quality:{...quality,ready:false},detection},detection),false);
  for(const [metric,value] of Object.entries({shortEdge:810,textSharpness:15,textTileCount:1})){
    assert.equal(canUseSinglePodFrame({quality:{...quality,metrics:{...quality.metrics,[metric]:value}},detection},detection),false);
  }
  assert.equal(canUseSinglePodFrame({quality,detection},{...detection,corners:detection.corners.map(p=>({...p,y:p.y+.05}))}),false);
  assert.equal(canUseSinglePodFrame({quality,detection},{...detection,confidence:.75}),false);
});

test('POD review-only resolution exception rejects low light, blur, small text evidence and missing corners', () => {
  const detection={found:true,confidence:.90,corners:[{x:.08,y:.21},{x:.87,y:.20},{x:.93,y:.77},{x:.08,y:.79}]};
  const metrics={shortEdge:833,textSharpness:139,textTileCount:23,contrast:69,mean:89,area:.46,edgeRatio:.074};
  const quality={ready:false,issues:['Move closer for sharper small print'],metrics};
  assert.ok(needsSmallPrintReview({quality,detection}));
  assert.ok(canUseSinglePodFrame({quality,detection},detection));
  for(const [metric,value] of Object.entries({shortEdge:776,textSharpness:68,textTileCount:4,contrast:29,mean:75,area:.17,edgeRatio:.003})){
    assert.equal(needsSmallPrintReview({detection,quality:{...quality,metrics:{...metrics,[metric]:value}}}),false,metric);
  }
  assert.equal(needsSmallPrintReview({detection:{...detection,corners:[{x:0,y:.1},...detection.corners.slice(1)]},quality}),false);
  assert.equal(needsSmallPrintReview({detection,quality:{...quality,issues:[...quality.issues,'Hold steady — text looks blurred']}}),false);
});

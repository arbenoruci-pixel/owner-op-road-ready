// Exercise the actual React camera component with deterministic camera/worker
// fixtures. No account, cloud data or physical camera is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {transformSync} from 'next/dist/build/swc/index.js';
const require=createRequire(import.meta.url);
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const file=path=>pathToFileURL(require.resolve(path)).href;
let source=fs.readFileSync('scripts/scanner-paper/CameraAdapter.jsx','utf8');
const modules={
 './podFramePolicy.js':file('../scanner-paper/podFramePolicy.js'),
 'react':file('react'),
 './documentBoundaryV110329.js':url('export const trackBoundary=(_,d)=>({corners:d.corners});'),
 './imageUtilsV3.js':url('export const canvasToFileV3=async()=>new File(["synthetic live frame"],"camera.jpg",{type:"image/jpeg"});'),
 './captureQualityV1104101.js':file('../scanner-clear/captureQuality.js'),
 './captureWindowV110331.js':file('../v110331/captureWindow.js'),
 './pageTransitionV110333.js':file('../v110333/pageTransition.js'),
 './captureGeometryV1104110.js':url('export const bindCapture=(file,reading,meta)=>({...meta,width:reading.width,height:reading.height});'),
 './cameraAnalysisClientV1104110.js':url('export const createCameraAnalyzer=()=>globalThis.__cameraFixture.analyzer();'),
 './cameraRuntimeV1104117.js':file('../scanner-paper/cameraRuntime.js'),
};
source=source.replace("import './cameraRecoveryV1104117.css';",'');
for(const [from,to] of Object.entries(modules))source=source.replaceAll("'"+from+"'",JSON.stringify(to));
const compiled=transformSync(source,{filename:'CameraAdapter.jsx',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}},target:'es2022'},module:{type:'es6'}});
const {default:Camera}=await import(url(compiled.code));
const detection={found:true,confidence:.95,corners:[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}]};

test('native original → delayed live auto capture → next sheet → background/retry → Done',async t=>{
 const keys=['navigator','window','document','performance','__cameraFixture'];
 const saved=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 let now=0,starts=0,signature=Array(192).fill(.1),analysisCount=0,releaseNative;
 const streams=[],delivered=[],existingOriginal=new File(['existing original bytes'],'existing.pdf',{type:'application/pdf'});
 const video={videoWidth:1920,videoHeight:1080,readyState:3,play:async()=>{},pause(){},srcObject:null};
 const doc=new EventTarget();doc.hidden=false;
 doc.createElement=()=>({width:0,height:0,getContext:()=>({drawImage(){},getImageData:()=>({width:640,height:360,data:new Uint8ClampedArray(4)})})});
 const win=new EventTarget();win.matchMedia=()=>({matches:true});
 const nav={userAgent:'iPhone',standalone:true,mediaDevices:{getUserMedia:async()=>{
  starts++;const track={readyState:'live',stop(){this.readyState='ended'},getCapabilities:()=>({})};
  const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};streams.push(stream);return stream;
 }}};
 const fixture={analyzer:()=>({busy:()=>false,degraded:()=>false,dispose(){},analyze:async(_,width,height)=>{
  analysisCount++;const observed=signature.slice();await new Promise(resolve=>setTimeout(resolve,520));
  return {detection,signature:observed,quality:{ready:true,score:1,issues:[],metrics:{}},width,height};
 }})};
 for(const [key,value] of Object.entries({navigator:nav,window:win,document:doc,performance:{now:()=>now},__cameraFixture:fixture}))Object.defineProperty(globalThis,key,{configurable:true,value});
 t.mock.timers.enable({apis:['setTimeout']});
 let root,pageCount=0;
 const props={onCapture:async(f)=>{delivered.push(f);if(delivered.length===1)await new Promise(resolve=>{releaseNative=resolve});pageCount++;root.update(React.createElement(Camera,{...props,pageCount}));},onCancel:()=>{closed++}};
 let closed=0;
 const advance=async ms=>{for(let elapsed=0;elapsed<ms;elapsed+=50)await act(async()=>{now+=50;t.mock.timers.tick(50);});};
 const button=name=>root.root.findAllByType('button').find(b=>b.props['aria-label']===name||b.children.includes(name));
 try{
  await act(async()=>{root=TestRenderer.create(React.createElement(Camera,props),{createNodeMock:e=>e.type==='video'?video:e.type==='input'?{click(){}}:e.type==='div'?{clientWidth:390,clientHeight:600}:null});});
  assert.equal(starts,0,'installed iPhone PWA begins without WebRTC');
  const native=new File(['exact native photo bytes'],'original.heic',{type:'image/heic'});
  let pending;
  await act(async()=>{pending=root.root.findByType('input').props.onChange({target:{files:[native],value:'photo'}});});
  assert.equal(button('Try live scanner').props.disabled,true,'mode change waits for photo processing');
  assert.equal(delivered[0],native,'original File identity, MIME and bytes are retained');
  await act(async()=>{releaseNative();await pending;});
  await act(async()=>button('Try live scanner').props.onClick());
  await advance(6500);
  assert.equal(starts,1);assert.equal(delivered.length,2,'native capture must not leave auto capture locked');
  assert.ok(analysisCount>=6,'live window and burst inspection ran');
  await advance(3000);
  assert.equal(delivered.length,2,'same sheet is not captured repeatedly');
  signature=Array(192).fill(.8);
  await advance(6500);
  assert.equal(delivered.length,3,'another stable sheet rearms auto capture');
  await act(async()=>{doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));});
  await advance(2000);
  await act(async()=>{doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));});
  await advance(2000);
  assert.equal(starts,1,'foreground recovery reuses stream');
  assert.equal(delivered.length,3,'foreground recovery preserves the identified page lock');
  streams[0].getVideoTracks()[0].stop();
  await act(async()=>{doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));});
  await act(async()=>button('Try live scanner').props.onClick());
  await advance(2500);
  assert.equal(starts,2,'ended stream can be retried');assert.equal(delivered.length,3,'retry retains duplicate protection');
  await act(async()=>button('Camera options').props.onClick());
  await act(async()=>button('Use phone camera').props.onClick());
  await act(async()=>root.root.findByType('input').props.onChange({target:{files:[native],value:'photo'}}));
  await act(async()=>button('Try live scanner').props.onClick());
  await advance(6500);
  assert.equal(delivered.length,5,'native fallback then live explicitly rearms Auto, including after Manual');
  await act(async()=>button('Close camera').props.onClick());
  assert.equal(closed,1);assert.ok(streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  assert.equal(await native.text(),'exact native photo bytes');assert.equal(await existingOriginal.text(),'existing original bytes');
 }finally{
  await act(async()=>root?.unmount());t.mock.timers.reset();
  for(const key of keys){if(saved[key])Object.defineProperty(globalThis,key,saved[key]);else delete globalThis[key];}
 }
});

test('POD stable single frame and legacy burst use the same quality checks', async t => {
  const keys=['window','document','navigator','performance','__cameraFixture'];
  const saved=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let now=0, quality, readings, constraints, camera;
  const video={videoWidth:1440,videoHeight:1920,readyState:3,play:async()=>{},pause(){}};
  const doc=new EventTarget();doc.hidden=false;
  doc.createElement=()=>({getContext:()=>({drawImage(){},getImageData:()=>({})})});
  const stream={getVideoTracks:()=>[{readyState:'live'}],getTracks:()=>[]};
  const nav={mediaDevices:{getUserMedia:async settings=>{constraints=settings;return stream}}};
  const fixture={analyzer:()=>({busy:()=>false,degraded:()=>false,dispose(){},analyze:async(_,width,height,options)=>{
    if (!options) readings++;
    return {detection,width,height,quality,signature:!options&&fixture.changedPage?[.9,.9,.9]:[.1,.3,.1]};
  }})};
  for(const [key,value] of Object.entries({window:new EventTarget(),document:doc,navigator:nav,performance:{now:()=>now},__cameraFixture:fixture}))
    Object.defineProperty(globalThis,key,{value,configurable:true});
  t.mock.timers.enable({apis:['setTimeout']});
  const advance=async()=>{await act(async()=>{now+=10;t.mock.timers.tick(10);});};
  async function run(profile,shortEdge,contrast=64,changedPage=false) {
    now=0;readings=0;fixture.changedPage=changedPage;
    quality={ready:shortEdge>=950,score:.8,issues:shortEdge>=950?[]:['Move closer for sharper small print'],metrics:{shortEdge,textSharpness:100,textTileCount:20,contrast,mean:110,area:.6,edgeRatio:.075}};
    const captures=[];
    await act(async()=>{camera=TestRenderer.create(React.createElement(Camera,{
      profile,onCapture:(file,meta)=>captures.push({ms:now,method:meta.method,smallPrintReview:meta.smallPrintReview}),
    }),{createNodeMock:e=>e.type==='video'?video:e.type==='div'?{clientWidth:390,clientHeight:844}:null});});
    for(let i=0;i<200&&!captures.length;i++)await advance();
    await act(async()=>camera.unmount());
    return {captures,readings,constraints};
  }
  try {
    const legacy=await run(undefined,1110), pod=await run('pod',1110);
    assert.equal(legacy.readings,3);
    assert.equal(legacy.captures[0].method,'video-burst');
    assert.equal(pod.readings,1);
    assert.equal(pod.captures[0].method,'pod-single-frame');
    assert.equal(pod.constraints.video.height.ideal,1440);
    assert.equal(legacy.constraints.video.height.ideal,1080);
    assert.ok(legacy.captures[0].ms - pod.captures[0].ms >= 400,'fast path saves two captures and two frame waits');
    t.diagnostic('simulated stable camera: legacy '+legacy.captures[0].ms+' ms, POD '+pod.captures[0].ms+' ms');
    const burst=await run('pod',970);
    assert.equal(burst.captures[0].method,'video-burst');
    assert.equal(burst.readings,3);
    const close=await run('pod',833);
    assert.equal(close.captures[0].smallPrintReview,true,'only soft resolution warning must reach visual review');
    assert.equal(close.readings,1);
    assert.equal((await run(undefined,833)).captures.length,0,'general scanner does not enter review automatically');
    assert.equal((await run('pod',777)).captures.length,0,'insufficient source detail remains a manual decision');
    assert.equal((await run('pod',833,30)).captures.length,0,'weaker contrast still needs a better photo');
    assert.equal((await run('pod',833,64,true)).captures.length,0,'swapped sheet cannot bypass capture confirmation');
  } finally {
    t.mock.timers.reset();
    for(const key of keys){if(saved[key])Object.defineProperty(globalThis,key,saved[key]);else delete globalThis[key];}
  }
});

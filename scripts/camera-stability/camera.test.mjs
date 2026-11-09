import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {acquireCameraStream,attachCameraPreview,refreshCameraPreview,
 preferNativeCamera,preferredCameraConstraints,stopCameraStream,cameraMessage} from '../scanner-paper/cameraRuntime.js';
import {updateCaptureWindow,CAPTURE_WINDOW_MS,LIVE_ANALYSIS_INTERVAL_MS} from '../v110331/captureWindow.js';

const camera=fs.readFileSync('scripts/scanner-paper/CameraAdapter.jsx','utf8');
const flow=fs.readFileSync('scripts/scanner-paper/cameraRecovery.css','utf8');
const makeStream=()=>{const track={readyState:'live',stopped:0,stop(){this.stopped++;this.readyState='ended';}};return {track,getTracks:()=>[track],getVideoTracks:()=>[track]}};
function video({mode='ready'}={}){
 const target=new EventTarget();let count=0;
 Object.assign(target,{readyState:mode==='ready'?3:0,videoWidth:mode==='ready'?1920:0,muted:false,autoplay:false,playsInline:false,srcObject:null,
  play(){count++;return mode==='hang'?new Promise(()=>{}):mode==='reject'?Promise.reject(new Error('NotAllowedError')):Promise.resolve()},
  pause(){this.pauses=(this.pauses||0)+1}});Object.defineProperty(target,'count',{get:()=>count});
 return target;
}
test('iPhone installed PWA takes native photo by default, Safari and Android keep live mode',()=>{
 const ios={userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X)',standalone:true};
 assert.equal(preferNativeCamera({navigator:ios}),true);
 assert.equal(preferNativeCamera({navigator:{...ios,standalone:false},window:{matchMedia:()=>({matches:true})}}),true);
 assert.equal(preferNativeCamera({navigator:{...ios,standalone:false},window:{matchMedia:()=>({matches:false})}}),false);
 assert.equal(preferNativeCamera({navigator:{userAgent:'Android 16',standalone:true}}),false);
 assert.equal(preferNativeCamera({navigator:{userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:5,standalone:true}}),true);
});
test('live mode begins with bounded HD video and safe frame rate, no 4K request',async()=>{
 const c=preferredCameraConstraints();assert.equal(c.video.width.ideal,1920);assert.equal(c.video.height.ideal,1080);
 assert.equal(c.video.frameRate.max,30);assert.equal(c.audio,false);
 const stream=makeStream();
 const acquired=await acquireCameraStream({getUserMedia:constraints=>{assert.deepEqual(constraints,c);return Promise.resolve(stream)}});
 assert.equal(acquired,stream);
 stopCameraStream(acquired);assert.equal(stream.track.stopped,1);
});
test('unanswered permission request times out and a late grant is stopped',async()=>{
 let giveAccess;const pending=new Promise(resolve=>{giveAccess=resolve});
 await assert.rejects(acquireCameraStream({getUserMedia:()=>pending},{timeoutMs:24}),/did not start/);
 const stream=makeStream();giveAccess(stream);
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(stream.track.stopped,1);
});
test('navigation before permission grant stops the delayed camera',async()=>{
 let ended=true;const stream=makeStream();
 await assert.rejects(acquireCameraStream({getUserMedia:()=>Promise.resolve(stream)},{isCancelled:()=>ended,timeoutMs:60}),/Camera closed/);
 assert.ok(stream.track.stopped>=1);
});
test('video play or loaded frame cannot hang the scanner forever',async()=>{
 const stream=makeStream();
 await assert.rejects(attachCameraPreview(video({mode:'hang'}),stream,{timeoutMs:18}),/timed out/);
 await assert.rejects(attachCameraPreview(video({mode:'waiting'}),stream,{timeoutMs:18}),/timed out/);
 const v=video(),play=attachCameraPreview(v,stream,{timeoutMs:40});await play;
 assert.equal(v.srcObject,stream);assert.equal(v.muted,true);assert.equal(v.playsInline,true);
});
test('Safari lifecycle recovery reattaches a running preview without a new stream',async()=>{
 const stream=makeStream(),v=video();await attachCameraPreview(v,stream);
 await refreshCameraPreview(v,stream,{timeoutMs:80});
 assert.equal(v.count,2);assert.ok(v.pauses>0);assert.equal(v.srcObject,stream);
 stopCameraStream(stream);assert.equal(stream.track.stopped,1);
});
test('denied or busy camera offers a comprehensible native fallback',()=>{
 assert.match(cameraMessage({name:'NotAllowedError'}),/permission denied/i);
 assert.match(cameraMessage({name:'NotReadableError'}),/busy/i);
 assert.match(cameraMessage(new Error('Camera preview failed')),/preview failed/);
});
test('mounted PWA has a native first screen, retry, bounded sampling and track cleanup',()=>{
 assert.ok(camera.includes('useState(()=>!preferNativeCamera())'));
 assert.ok(camera.includes("setGuidance('For a reliable scan"));
 assert.ok(camera.includes('Take photo with phone camera'));
 assert.ok(camera.includes('Try live scanner'));
 assert.ok(camera.includes('stopCameraStream(streamRef.current)'));
 assert.ok(camera.includes('refreshCameraPreview('));
 assert.ok(camera.includes('{allowMainThread:false}'));
 assert.ok(camera.includes('Math.max(180,LIVE_ANALYSIS_INTERVAL_MS-'));
 assert.ok(camera.includes('if(sample.width!==w)sample.width=w'));
 assert.ok(flow.includes('.scan-camera-recovery-v1104117'));
 assert.ok(flow.includes('position:static!important'));
 assert.ok(!camera.includes('width:{ideal:3840}'));
});

const detection={found:true,confidence:.94,corners:[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}]};
test('auto capture tolerates timer jitter and ordinary worker latency at the reduced preview cadence',()=>{
 for(const times of [[0,451,902],[0,600,1200],[0,730,1510],[0,LIVE_ANALYSIS_INTERVAL_MS,2*LIVE_ANALYSIS_INTERVAL_MS]]){
  let state=null;
  for(const [i,at] of times.entries()){
   state=updateCaptureWindow(state,detection,{ready:true},at);
   assert.equal(state.ready,i===2,'three fresh stable observations: '+times);
  }
 }
});
test('extra timing slack still rejects stale, blurred, lost, low-confidence and moving pages',()=>{
 let state=null;
 for(const at of [0,600])state=updateCaptureWindow(state,detection,{ready:true},at);
 const expired=updateCaptureWindow(state,detection,{ready:true},600+CAPTURE_WINDOW_MS+1);
 assert.equal(expired.ready,false);assert.equal(expired.samples.length,1);
 for(const [d,q] of [[detection,{ready:false}],[{...detection,found:false},{ready:true}],[{...detection,confidence:.5},{ready:true}]]){
  const reset=updateCaptureWindow(state,d,q,1200);
  assert.equal(reset.ready,false);assert.equal(reset.samples.length,0);
 }
 state=null;
 for(let i=0;i<10;i++){
  state=updateCaptureWindow(state,{...detection,corners:detection.corners.map(p=>({...p,x:p.x+i*.025}))},{ready:true},i*600);
  assert.equal(state.ready,false);
 }
});


import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {baseState,seed,setupRoutes,snapshot,protectedData} from '../v110434/browserFixture.mjs';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.TEST_ORIGIN||'http://127.0.0.1:3000').hostname));
fs.mkdirSync('browser-test-results/camera-stability',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1'});
await context.addInitScript(()=>{
 Object.defineProperty(navigator,'standalone',{configurable:true,value:true});
 window.__cameraStarts=0;
 window.__cameraStreams=[];
 const md=navigator.mediaDevices,old=md?.getUserMedia?.bind(md);
 if(old)md.getUserMedia=async(...args)=>{window.__cameraStarts++;const stream=await old(...args);window.__cameraStreams.push(stream);return stream};
});
await setupRoutes(context);
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 const state=baseState();state.testInstructionStore={loads:[],documents:[],expenses:[],fuel:[],maintenance:[],settlements:[]};
 await seed(page,state,[],false);
 const home=page.getByRole('button',{name:/Home/i}).first();
 await home.waitFor({timeout:30000});await home.click();
 await page.locator('.rrd-icon-grid').waitFor({state:'visible',timeout:30000});
 const before=protectedData(await snapshot(page));
 await page.getByRole('button',{name:'Smart Scan',exact:true}).click();
 await page.getByRole('button',{name:/Scan with camera/}).waitFor();
 await page.getByRole('button',{name:/Scan with camera/}).click();
 const camera=page.locator('[data-smart-camera]');
 await camera.waitFor({state:'visible',timeout:30000});
 const native=camera.getByRole('button',{name:'Take photo with phone camera'});
 await native.waitFor({state:'visible'});
 const label=(await camera.locator('[role="status"]').innerText()).slice(0,250);
 assert.match(label,/iPhone camera|reliable scan/i);
 assert.equal(await page.evaluate(()=>window.__cameraStarts),0,'iOS standalone must not open heavy WebRTC stream on entry');
 assert.equal(await camera.getByRole('button',{name:'Try live scanner'}).count(),1);
 await page.screenshot({path:'browser-test-results/camera-stability/native-iphone.png',fullPage:true});
 const chooserEvent=page.waitForEvent('filechooser',{timeout:15000});
 await native.click();
 const chooser=await chooserEvent;
 assert.equal(chooser.isMultiple(),false);
 const original=fs.readFileSync('public/icon-192.png');
 await chooser.setFiles({name:'test-paper.png',mimeType:'image/png',buffer:original});
 await page.waitForTimeout(1200);
 assert.deepEqual(errors,[],'No page errors on native capture');
 assert.equal(await page.evaluate(()=>window.__cameraStarts),0,'native photo must not silently start live video');
 console.log('PASS native iPhone scanner: visible photo button, chooses original image, no WebRTC stream, no page errors');
 if(await camera.isVisible().catch(()=>false)){
   await camera.getByRole('button',{name:'Close camera'}).click();
 }
 const after=protectedData(await snapshot(page));
 assert.deepEqual(after,before,'Native photo flow does not edit the logbook, duty, driver or signatures');

 const livePage=await context.newPage(),liveErrors=[];
 livePage.on('pageerror',e=>liveErrors.push(e.message));
 const liveState=baseState();liveState.testInstructionStore={loads:[],documents:[],expenses:[],fuel:[],maintenance:[],settlements:[]};
 await seed(livePage,liveState,[],false);
 await livePage.getByRole('button',{name:/Home/i}).first().waitFor({timeout:30000});
 await livePage.getByRole('button',{name:/Home/i}).first().click();
 await livePage.locator('.rrd-icon-grid').waitFor();
 await livePage.getByRole('button',{name:'Smart Scan',exact:true}).click();
 await livePage.getByRole('button',{name:/Scan with camera/}).click();
 const liveCamera=livePage.locator('[data-smart-camera]');await liveCamera.waitFor();
 await liveCamera.getByRole('button',{name:'Try live scanner'}).click();
 await livePage.waitForFunction(()=>document.querySelector('[data-smart-camera] video')?.videoWidth>0&&window.__cameraStarts>0,null,{timeout:16000});
 await livePage.waitForFunction(()=>!document.querySelector('[data-smart-camera] .scan-camera-shutter-v333')?.disabled,null,{timeout:16000});
 const liveData=await livePage.evaluate(()=>{
  const stream=window.__cameraStreams.at(-1);
  const track=stream.getVideoTracks()[0];
  return {requests:window.__cameraStarts,settings:track.getSettings(),before:track.readyState};
 });
 assert.equal(liveData.requests,1,'Live scanner should open one camera stream');
 assert.ok(liveData.settings.width<=1920&&liveData.settings.height<=1080,'Live preview must stay bounded');
 await livePage.screenshot({path:'browser-test-results/camera-stability/opt-in-live.png',fullPage:true});
 // Simulate leaving and returning from iPhone Home Screen; recover the same
 // stream with a video-layer reattach rather than opening another camera.
 await livePage.evaluate(()=>{
  window.__isHiddenForCameraTest=true;
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__isHiddenForCameraTest});
  document.dispatchEvent(new Event('visibilitychange'));
  window.__isHiddenForCameraTest=false;
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await livePage.waitForTimeout(450);
 assert.equal(await livePage.evaluate(()=>window.__cameraStarts),1,'Resume should reuse the camera stream');
 await liveCamera.getByRole('button',{name:'Close camera'}).click();
 await livePage.waitForFunction(()=>window.__cameraStreams.every(s=>s.getVideoTracks().every(t=>t.readyState==='ended')),null,{timeout:7000});
 assert.deepEqual(liveErrors,[],'No browser errors opening and closing live camera');
 console.log('PASS optional live scanner: bounded 1080p video, visible shutter, resume rebind and tracks released on close');

}finally{await browser.close();}


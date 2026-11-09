import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes,snapshot,protectedData} from '../v110434/browserFixture.mjs';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.TEST_ORIGIN||'http://127.0.0.1:3000').hostname));
fs.mkdirSync('browser-test-results/camera-stability',{recursive:true});
const engine=process.env.CAMERA_TEST_BROWSER||'chromium';
assert.ok(['chromium','webkit'].includes(engine));
const browser=await ({chromium,webkit})[engine].launch({headless:true,...(engine==='chromium'?{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}: {})});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1'});
await context.addInitScript(()=>{
 Object.defineProperty(navigator,'standalone',{configurable:true,value:true});
 window.__cameraStarts=0;
 window.__cameraStreams=[];
 window.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async()=>{if(window.__holdCameraOcr){window.__cameraOcrStarted=true;await new Promise(resolve=>{window.__releaseCameraOcr=resolve;});}return {data:{text:'SYNTHETIC CAMERA TEST PAGE',confidence:96}};}})};
 // Only camera-analysis messages are delayed/mocked. Document processing and
 // IndexedDB writes still run through the production pipeline.
 window.__paperInk=.1;
 const NativeWorker=window.Worker;
 window.Worker=class extends NativeWorker{
   timers=new Set();
   postMessage(data,...args){
     if(!data?.pixels||!data.width||!data.height)return super.postMessage(data,...args);
     const ink=window.__paperInk;
     const timer=setTimeout(()=>{this.timers.delete(timer);this.dispatchEvent(new MessageEvent('message',{data:{ok:true,value:{
       width:data.width,height:data.height,detection:{found:true,confidence:.95,corners:[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}]},
       signature:Array(192).fill(ink),quality:{ready:true,score:1,issues:[],metrics:{}}
     }}}));},520);
     this.timers.add(timer);
   }
   terminate(){for(const timer of this.timers)clearTimeout(timer);super.terminate();}
 };
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
 await camera.getByLabel('1 pages captured',{exact:true}).waitFor({timeout:30000});
 assert.deepEqual(errors,[],'No page errors on native capture');
 assert.equal(await page.evaluate(()=>window.__cameraStarts),0,'native photo must not silently start live video');
 console.log('PASS native iPhone scanner: visible photo button, chooses original image, no WebRTC stream, no page errors');
 if(await camera.isVisible().catch(()=>false)){
   await camera.getByRole('button',{name:'Close camera'}).click();
 }
 // Save the native photo through the ordinary review flow, then compare the
 // retained original bytes after a reload (no user data or real cloud calls).
 await page.evaluate(()=>{window.__holdCameraOcr=true;});
 await page.getByRole('button',{name:'Read document',exact:true}).click();
 await page.waitForFunction(()=>window.__cameraOcrStarted===true,null,{timeout:30000});
 await page.getByRole('button',{name:'Back to pages',exact:true}).click();
 await page.evaluate(()=>{window.__holdCameraOcr=false;window.__releaseCameraOcr?.();});
 await page.getByRole('button',{name:'Read document',exact:true}).waitFor();
 await page.getByRole('button',{name:'Read document',exact:true}).click();
 console.log('PASS interrupted reading returns to captured pages and can continue');
 await page.getByLabel('Document type',{exact:true}).waitFor({timeout:60000});
 await page.getByLabel('Document type',{exact:true}).selectOption('other');
 const review=page.locator('.scan-driver-check-v105 input');if(await review.count())await review.check();
 await page.locator('.scan-save-v105').click();
 await page.getByRole('button',{name:'Scan another',exact:true}).waitFor({timeout:30000});
 const readOriginal=()=>page.evaluate(async()=>new Promise((resolve,reject)=>{
   const request=indexedDB.open('owner-op-road-ready-offline-v1');request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{const db=request.result,tx=db.transaction('capture_asset_blobs','readonly'),q=tx.objectStore('capture_asset_blobs').getAll();
     q.onsuccess=async()=>{const out=[];for(const row of q.result){if(!row.variants?.some(v=>v.kind==='original'&&v.immutable))continue;const b=row.blob;const buffer=b?.arrayBuffer?await b.arrayBuffer():b?.bytes;if(buffer)out.push(Array.from(new Uint8Array(buffer)));}db.close();resolve(out);};q.onerror=()=>reject(q.error);};
 }));
 assert.ok((await readOriginal()).some(bytes=>Buffer.from(bytes).equals(original)),'saved native original must be byte-identical');
 await page.reload();
 assert.ok((await readOriginal()).some(bytes=>Buffer.from(bytes).equals(original)),'original survives reload');
 console.log('PASS native original: reviewed, saved locally, byte-identical after reload');
 const after=protectedData(await snapshot(page));
 assert.deepEqual(after,before,'Native photo flow does not edit the logbook, duty, driver or signatures');

 if(engine==='chromium'){
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
 await liveCamera.locator('input[type=file]').setInputFiles({name:'native-before-live.png',mimeType:'image/png',buffer:original});
 await liveCamera.getByLabel('1 pages captured',{exact:true}).waitFor({timeout:30000});
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
 await liveCamera.getByLabel('2 pages captured',{exact:true}).waitFor({timeout:30000});
 await livePage.waitForTimeout(2500);
 assert.equal(await liveCamera.getByLabel('2 pages captured',{exact:true}).count(),1,'same paper stays locked');
 await livePage.evaluate(()=>{window.__paperInk=.8;});
 await liveCamera.getByLabel('3 pages captured',{exact:true}).waitFor({timeout:30000});
 await livePage.screenshot({path:'browser-test-results/camera-stability/opt-in-live.png',fullPage:true});
 console.log('PASS native → live: auto captures with 520ms worker delay, rejects duplicates and rearms for next page');
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
 }

}catch(error){await page.screenshot({path:'browser-test-results/camera-stability/'+engine+'-failed.png',fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}


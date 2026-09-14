import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from './v110328/browserFixture.mjs';
import {angledPageFixture} from './v110339/angledPageFixture.mjs';
const output='browser-test-results/scanner-capture-v110329';fs.mkdirSync(output,{recursive:true});
for(const [name,type] of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.TEST_BROWSER||process.env.TEST_BROWSER===name)){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'scanner-capture-'));
  const context=await type.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block',...(name==='chromium'&&process.env.TEST_CHROMIUM_PATH?{executablePath:process.env.TEST_CHROMIUM_PATH}:{})});
  const page=await context.newPage();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await context.addInitScript(()=>{
      window.__capturePreviews=[];
      document.addEventListener('load',event=>{
        const img=event.target;
        if(!img.matches?.('.scan-capture-preview-v334 img'))return;
        const overlay=img.parentElement,box=overlay.getBoundingClientRect();
        window.__capturePreviews.push({url:img.src,width:img.naturalWidth,height:img.naturalHeight,visible:box.width>0&&box.height>0,pointerEvents:getComputedStyle(overlay).pointerEvents,thumbnail:document.querySelector('.scan-camera-thumbnail-v333 img')?.src});
      },true);
      const NativeWorker=window.Worker;window.__NativePhotoWorker=NativeWorker;window.__photoJobs=[];window.__postedPhotos=0;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{const info=event.data?.value?.result?.metadata?.processingV110330;if(info)window.__photoJobs.push({...info,cleanup:event.data.value.result.metadata.captureManifest?.restore?.autoQuality?.method,boundary:event.data.value.result.metadata.captureManifest?.detection?.method});});}postMessage(message,...args){super.postMessage(message,...args);if(message?.source==='camera'&&++window.__postedPhotos===1)setTimeout(()=>{window.__changedWhileProcessing=window.__photoJobs.length===0;window.__scanPage=2;window.__scannerDraw?.();},180);}};
    });
    await setupRoutes(context);const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    // Camera frames are synthetic; capture, detection, page processing, crop
    // review and reader navigation below are the production components.
    const photo=await page.evaluate(async()=>{
      const c=document.createElement('canvas');c.width=1600;c.height=2200;const ctx=c.getContext('2d');
      window.__scanPage=1;function draw(show=window.__paperVisible!==false){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#494437';ctx.fillRect(0,0,c.width,c.height);for(let y=0;y<2200;y+=13){ctx.strokeStyle=y%2?'#656155':'#34322e';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1600,y+80);ctx.stroke();}if(!show)return;ctx.translate(window.__paperShiftX||0,window.__paperShiftY||0);
        ctx.fillStyle='#faf6ef';ctx.fillRect(230,260,1120,1590);ctx.fillStyle='#111';ctx.font='bold 45px Arial';ctx.fillText('EXAMPLE BILL OF LADING',300,380);ctx.font='32px Arial';for(let i=0;i<22;i++)ctx.fillText('TEST DOCUMENT ROW '+i+' / REF 551122',300,475+i*53);ctx.strokeStyle='#b52d28';ctx.beginPath();ctx.moveTo(700,1730);ctx.lineTo(1100,1780);ctx.lineTo(820,1750);ctx.stroke();if(window.__scanPage===2){ctx.fillStyle='#faf6ef';ctx.fillRect(275,425,1040,1230);ctx.fillStyle='#111';ctx.font='bold 36px Arial';ctx.fillText('DELIVERY RECEIPT — PAGE TWO',300,510);ctx.font='30px Arial';for(let i=0;i<10;i++){ctx.fillText('RECEIVED ITEM '+i+' / QTY 125',310,660+i*65);ctx.fillText('CHECKED',1040,660+i*65);}ctx.strokeStyle='#333';ctx.lineWidth=3;ctx.strokeRect(300,580,980,840);ctx.fillText('SHIP TO: EXAMPLE RECEIVER',320,1500);ctx.fillText('SIGNATURE: DRIVER EXAMPLE',320,1600);}}
      draw();window.__scannerDraw=draw;window.__scannerCanvas=c;
      let stream;window.__cameraCalls=0;
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{window.__cameraCalls++;try{if(!c.captureStream)throw new Error('canvas.captureStream is unavailable');stream=c.captureStream(12);}catch(cause){throw new Error('Synthetic camera unavailable: '+cause.message);}window.__scannerStream=stream;window.__cameraTimer=setInterval(()=>draw(),90);return stream;}}});
      // Exercise the browser video-frame fallback independently of ImageCapture.
      window.ImageCapture=undefined;
      window.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async()=>({data:{text:'BILL OF LADING\nBOL NO 551122\nDATE 09/13/2026\nSHIP FROM EXAMPLE SHIPPER\nSHIP TO EXAMPLE RECEIVER\nWEIGHT 2000 LB',confidence:96}})})};
      return Array.from(new Uint8Array(await(await new Promise(r=>c.toBlob(r,'image/jpeg',.96))).arrayBuffer()));
    });
    await page.getByRole('button',{name:/Scan with camera/}).click();
    const camera=page.locator('[data-smart-camera="110329"]');await camera.waitFor();
    const capture=page.getByRole('button',{name:'Capture document',exact:true});
    await page.waitForFunction(()=>!document.querySelector('[data-smart-camera] button[aria-label="Capture document"]')?.disabled||document.querySelector('[data-smart-camera] [role=status]')?.textContent.includes('Synthetic camera'));
    assert.ok(await page.evaluate(()=>window.__cameraCalls>0),'the synthetic camera must be used');
    const videoReady=await capture.isEnabled();
    if(name==='chromium')assert.ok(videoReady,'Chromium must exercise live auto/video capture');
    if(videoReady){
      // Replace the paper during the first worker job, without a blank frame,
      // camera restart or manual shutter tap. This reproduced the phone video.
      await page.getByRole('button',{name:'Review (2)',exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>window.__changedWhileProcessing),true,'page changes while the first photo is still processing');
      await page.waitForTimeout(5000);assert.equal(await page.getByRole('button',{name:'Review (2)',exact:true}).count(),1,'holding the second sheet for five seconds does not add duplicates');
      await page.evaluate(()=>{window.__paperShiftX=240;window.__paperShiftY=180;});
      await page.waitForTimeout(1500);
      assert.equal(await page.getByRole('button',{name:'Review (2)',exact:true}).count(),1,'moving the held sheet cannot add a duplicate');
      await page.evaluate(()=>{window.__paperVisible=false;});await page.waitForTimeout(700);
      await page.evaluate(()=>{window.__paperVisible=true;window.__paperShiftX=0;window.__paperShiftY=0;});await page.waitForTimeout(1500);
      assert.equal(await page.getByRole('button',{name:'Review (2)',exact:true}).count(),1,'looking away and back cannot duplicate the same sheet');
      assert.equal(await page.evaluate(()=>window.__cameraCalls),1,'same camera stream remains open');
    }else{
      const input=camera.locator('input[type=file]');
      await input.setInputFiles({name:'page-one.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo)});await page.getByRole('button',{name:'Review (1)',exact:true}).waitFor();
      await input.setInputFiles({name:'page-two.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo)});await page.getByRole('button',{name:'Review (2)',exact:true}).waitFor();
    }
    await page.waitForFunction(()=>window.__capturePreviews.length===2);
    const previews=await page.evaluate(()=>window.__capturePreviews);
    assert.equal(previews.length,2,'each completed page receives one capture confirmation');
    assert.ok(previews.every(p=>p.width>0&&p.height>0&&p.visible&&p.pointerEvents==='none'&&p.url===p.thumbnail),'confirmation displays the processed thumbnail and does not intercept controls');
    assert.equal(new Set(previews.map(p=>p.url)).size,2,'consecutive confirmations display separate page files');
    await page.locator('.scan-capture-preview-v334').waitFor({state:'hidden'});
    assert.equal(await page.getByRole('button',{name:'Account security',exact:true}).isVisible(),false,'account shortcut does not cover the camera controls');
    await page.screenshot({path:`${output}/${name}-camera.png`});
    await page.getByRole('button',{name:'Open 2 captured pages',exact:true}).click();await camera.waitFor({state:'hidden'});
    assert.equal(await page.locator('.scan-page-list-v328 li').count(),2);
    const jobs=await page.evaluate(()=>window.__photoJobs);assert.equal(jobs.length,2,'both photos finish in the local worker');assert.ok(jobs.every(job=>job.thread==='worker'),'photo processing stays off the UI thread');assert.ok(jobs.every(job=>job.cleanup==='paper-surface-v110331'),'saved worker output uses the new paper cleanup');assert.ok(jobs.every(job=>job.boundary==='paper-surface-boundaries-v110334'),'saved worker output uses the paper-surface detector');console.log(name+' local photo jobs: '+JSON.stringify(jobs));
    if(videoReady)assert.equal(await page.evaluate(()=>window.__scannerStream.getTracks().every(t=>t.readyState==='ended')),true);
    const dimensions=await page.locator('.scan-paper-preview-v328 img').evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));
    assert.ok(dimensions.w<1400&&dimensions.h<1900,'the surrounding scene is cropped from the saved preview: '+JSON.stringify(dimensions));
    await page.getByRole('button',{name:'Crop & rotate',exact:true}).click();
    const handle=page.getByRole('button',{name:'Top left',exact:true});await handle.waitFor({state:'visible'});const box=await handle.boundingBox();assert.ok(box&&box.width>=44&&box.height>=44,'crop handles are visible and usable');
    await page.getByRole('button',{name:'Full page',exact:true}).click();await page.getByRole('button',{name:'Use page',exact:true}).click();
    const full=await page.locator('.scan-paper-preview-v328 img').evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));assert.ok(full.w>dimensions.w,'Full page restores the original scene');
    await page.getByRole('button',{name:'Crop & rotate',exact:true}).click();await page.getByRole('button',{name:'Auto edges',exact:true}).click();await page.getByRole('button',{name:'Use page',exact:true}).click();
    await page.getByRole('button',{name:'Read document',exact:true}).click();await page.getByText('Read 2 of 2 pages. Check the details below.',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Document type',{exact:true}).inputValue(),'bol','BOL headings stay with the BOL reader after camera capture');
    await page.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await page.locator('.scan-page-list-v328 li').count(),2);
    await page.waitForFunction(()=>document.querySelector('.scan-paper-preview-v328 img')?.naturalWidth>0);
    await page.screenshot({path:`${output}/${name}-pages.png`});
    // A delayed native still must use the page frozen at capture time, even
    // after the live camera points at a different scene.
    await page.evaluate(()=>{window.__nativeStillCalls=0;window.ImageCapture=class{takePhoto(){window.__nativeStillCalls++;clearInterval(window.__cameraTimer);window.__scannerDraw(false);return new Promise(()=>{});}};});
    await page.getByRole('button',{name:'Camera',exact:true}).click();
    if(videoReady){await page.getByRole('button',{name:'Review (3)',exact:true}).click();}
    else{await page.locator('[data-smart-camera] input[type=file]').setInputFiles({name:'native-unavailable.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo)});await page.getByRole('button',{name:'Review (3)',exact:true}).click();}
    await camera.waitFor({state:'hidden'});
    if(videoReady)assert.equal(await page.evaluate(()=>window.__nativeStillCalls),1,'exercise the delayed native photo path');
    const delayedJobs=await page.evaluate(()=>window.__photoJobs);assert.equal(delayedJobs.length,3);assert.equal(delayedJobs[2].boundary,'paper-surface-boundaries-v110334','the newly captured file still contains the paper');
    const frozen=await page.locator('.scan-paper-preview-v328 img').evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));
    assert.ok(frozen.w<1400&&frozen.h<1900,'delayed still keeps the original paper after the camera moves');
    assert.equal(await page.locator('.scan-page-list-v328 li').count(),3);
    await page.evaluate(()=>{window.ImageCapture=undefined;});
    // An unavailable worker must still produce a cropped page from the source.
    await page.evaluate(()=>{window.Worker=class{constructor(){throw new Error('Synthetic unavailable worker');}};});
    await page.getByRole('button',{name:'Camera',exact:true}).click();
    await page.locator('[data-smart-camera] input[type=file]').setInputFiles({name:'fallback-page.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo)});
    await page.getByRole('button',{name:'Review (4)',exact:true}).click();
    await camera.waitFor({state:'hidden'});
    assert.equal(await page.locator('.scan-page-list-v328 li').count(),4,'worker failure retains all pages');
    const fallback=await page.locator('.scan-paper-preview-v328 img').evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));
    assert.ok(fallback.w<1400&&fallback.h<1900,'fallback keeps the selected paper crop');assert.deepEqual(errors,[]);
    // Hold the real worker reply so Done is exercised during processing.
    await page.evaluate(()=>{
      clearInterval(window.__cameraTimer);window.__scannerDraw(false);
      window.__heldPhotoReply=null;
      window.Worker=class extends window.__NativePhotoWorker{
        set onmessage(handler){super.onmessage=event=>{window.__heldPhotoReply=()=>handler(event);};}
      };
    });
    await page.getByRole('button',{name:'Camera',exact:true}).click();
    await page.locator('[data-smart-camera] input[type=file]').setInputFiles({name:'finish-pending.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo)});
    await page.waitForFunction(()=>typeof window.__heldPhotoReply==='function');
    const done=page.getByRole('button',{name:'Review (4)',exact:true});
    assert.equal(await done.isEnabled(),true,'Done remains enabled while the next captured page is processing');
    await done.click();
    await page.getByText('Finishing…',{exact:true}).waitFor();
    await page.evaluate(()=>window.__heldPhotoReply());
    await camera.waitFor({state:'hidden'});
    assert.equal(await page.locator('.scan-page-list-v328 li').count(),5,'Done finishes the in-flight page exactly once');
    assert.equal(await page.evaluate(()=>window.__scannerStream.getTracks().every(t=>t.readyState==='ended')),true,'Done stops the camera after the pending page is saved');
    // The live outline and saved crop share four real corners at steep angles.
    const tilted=angledPageFixture({angle:55,width:800,height:1400});
    const tiltedPhoto=await page.evaluate(async({width,height,encoded})=>{
      clearInterval(window.__cameraTimer);window.ImageCapture=undefined;
      window.Worker=class extends window.__NativePhotoWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data?.value?.result)window.__angledCapture=event.data.value;});}};
      const sample=document.createElement('canvas');sample.width=width;sample.height=height;
      const bytes=Uint8ClampedArray.from(atob(encoded),c=>c.charCodeAt(0)),pixels=new ImageData(bytes,width,height);sample.getContext('2d').putImageData(pixels,0,0);
      const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;const ctx=canvas.getContext('2d'),draw=()=>ctx.drawImage(sample,0,0,canvas.width,canvas.height);draw();
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{const stream=canvas.captureStream(12);window.__scannerStream=stream;window.__cameraTimer=setInterval(draw,90);return stream;}}});
      return Array.from(new Uint8Array(await(await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.98))).arrayBuffer()));
    },{width:tilted.width,height:tilted.height,encoded:Buffer.from(tilted.data).toString('base64')});
    await page.getByRole('button',{name:'Camera',exact:true}).click();
    if(videoReady){
      await camera.locator('polygon').waitFor();
      // This deliberately distant sheet uses the shutter, as in the phone report.
      await capture.click();
      await page.getByRole('button',{name:'Review (6)',exact:true}).waitFor();
    }else{
      await camera.locator('input[type=file]').setInputFiles({name:'tilted-paper.jpg',mimeType:'image/jpeg',buffer:Buffer.from(tiltedPhoto)});
      await page.getByRole('button',{name:'Review (6)',exact:true}).waitFor();
    }
    await page.getByRole('button',{name:'Review (6)',exact:true}).click();await camera.waitFor({state:'hidden'});
    assert.equal(await page.locator('.scan-page-list-v328 li').count(),6);
    const cropInfo=await page.evaluate(()=>({corners:window.__angledCapture.corners,rotation:window.__angledCapture.rotation,detection:window.__angledCapture.result.metadata.captureManifest.detection}));
    assert.equal(new Set(cropInfo.corners.map(p=>JSON.stringify(p))).size,4,'saved page keeps four distinct corners');
    assert.ok(cropInfo.detection.confidence>=.8);
    const selectedImage=page.locator('.scan-paper-preview-v328 img');
    async function readRedMark(){await selectedImage.waitFor({state:'visible'});await page.waitForFunction(()=>{const img=document.querySelector('.scan-paper-preview-v328 img');return img?.complete&&img.naturalWidth>0;});return selectedImage.evaluate(img=>{
      const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
      const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;let count=0,x=0,y=0,paper=0;
      for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];if(Math.min(r,g,b)>190)paper++;if(r>g*1.7&&r>b*1.7&&r>120){count++;x+=(i/4)%canvas.width;y+=Math.floor(i/4/canvas.width);}}
      return {width:canvas.width,height:canvas.height,paper:paper/(canvas.width*canvas.height),x:x/Math.max(1,count)/canvas.width,y:y/Math.max(1,count)/canvas.height,count};
    });}
    const beforeRotation=await readRedMark();
    assert.ok(beforeRotation.width<2000&&beforeRotation.height<2000&&beforeRotation.paper>.75,'tilted saved preview excludes carpet and the other page');
    assert.ok(beforeRotation.height>beforeRotation.width,'strong vertical text axes are oriented for reading');
    assert.ok(beforeRotation.count>20,'source corner mark survives cleanup');
    await page.screenshot({path:`${output}/${name}-tilted-page.png`});
    await page.getByRole('button',{name:'Crop & rotate',exact:true}).click();
    await page.getByRole('button',{name:'Use page',exact:true}).click();
    const initialReopened=await readRedMark();
    assert.ok(Math.abs(initialReopened.x-beforeRotation.x)<.025&&Math.abs(initialReopened.y-beforeRotation.y)<.025,'initial Adjust retains automatic text orientation');
    const previousSrc=await selectedImage.getAttribute('src');
    await page.getByRole('button',{name:'Rotate selected page',exact:true}).click();
    await page.waitForFunction(previous=>{const img=document.querySelector('.scan-paper-preview-v328 img');return img?.src!==previous&&img?.complete&&img.naturalWidth>0;},previousSrc);
    const afterRotation=await readRedMark();
    assert.ok(Math.abs(afterRotation.x-(1-beforeRotation.y))<.025&&Math.abs(afterRotation.y-beforeRotation.x)<.025,'Rotate moves the corrected page exactly one clockwise turn');
    assert.ok(afterRotation.paper>.75,'Rotate keeps the crop');
    await page.getByRole('button',{name:'Crop & rotate',exact:true}).click();
    await page.getByRole('button',{name:'Use page',exact:true}).click();
    const reopened=await readRedMark();
    assert.ok(Math.abs(reopened.x-afterRotation.x)<.025&&Math.abs(reopened.y-afterRotation.y)<.025,'reopening crop retains the chosen orientation');
    // The worker fallback applies the same tilted-page rectification.
    await page.evaluate(()=>{window.Worker=class{constructor(){throw new Error('Synthetic unavailable worker');}};});
    await page.locator('input[type=file][multiple]').first().setInputFiles({name:'tilted-fallback.jpg',mimeType:'image/jpeg',buffer:Buffer.from(tiltedPhoto)});
    await page.waitForFunction(()=>document.querySelectorAll('.scan-page-list-v328 li').length===7);
    assert.equal(await page.locator('.scan-page-list-v328 li').count(),7);
    const tiltedFallback=await readRedMark();assert.ok(tiltedFallback.paper>.75&&tiltedFallback.width<2000&&tiltedFallback.height<2000,'main-thread fallback preserves the tilted crop');
    assert.deepEqual(errors,[]);
    console.log(`PASS — ${name}: ${videoReady?'automatic next-page capture during processing and duplicate prevention':'native photo input'}, continuous pages, delayed still snapshot, crop, full source reset and reader recovery`);
  }catch(error){await page.screenshot({path:`${output}/${name}-FAILED.png`}).catch(()=>{});throw error;}
  finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}

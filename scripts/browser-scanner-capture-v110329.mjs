import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {baseState,seed,setupRoutes} from './v110328/browserFixture.mjs';
const output='browser-test-results/scanner-capture-v110329';fs.mkdirSync(output,{recursive:true});
for(const [name,type] of [['chromium',chromium],['webkit',webkit]].filter(([name])=>!process.env.TEST_BROWSER||process.env.TEST_BROWSER===name)){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'scanner-capture-'));
  const context=await type.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},serviceWorkers:'block',...(name==='chromium'&&process.env.TEST_CHROMIUM_PATH?{executablePath:process.env.TEST_CHROMIUM_PATH}:{})});
  const page=await context.newPage();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await context.addInitScript(()=>{const NativeWorker=window.Worker;window.__photoJobs=[];window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',event=>{const info=event.data?.value?.result?.metadata?.processingV110330;if(info)window.__photoJobs.push(info);});}};});
    await setupRoutes(context);const state=baseState();state.view='logbook';state.testInstructionStore={loads:[],documents:[]};await seed(page,state);
    await page.getByRole('button',{name:/Smart Scan/}).first().click();
    // Camera frames are synthetic; capture, detection, page processing, crop
    // review and reader navigation below are the production components.
    const photo=await page.evaluate(async()=>{
      const c=document.createElement('canvas');c.width=1600;c.height=2200;const ctx=c.getContext('2d');
      function draw(show=true){ctx.fillStyle='#494437';ctx.fillRect(0,0,c.width,c.height);for(let y=0;y<2200;y+=13){ctx.strokeStyle=y%2?'#656155':'#34322e';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1600,y+80);ctx.stroke();}if(!show)return;
        ctx.fillStyle='#faf6ef';ctx.fillRect(230,260,1120,1590);ctx.fillStyle='#111';ctx.font='bold 45px Arial';ctx.fillText('EXAMPLE BILL OF LADING',300,380);ctx.font='32px Arial';for(let i=0;i<22;i++)ctx.fillText('TEST DOCUMENT ROW '+i+' / REF 551122',300,475+i*53);ctx.strokeStyle='#b52d28';ctx.beginPath();ctx.moveTo(700,1730);ctx.lineTo(1100,1780);ctx.lineTo(820,1750);ctx.stroke();}
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
      await page.getByRole('button',{name:'Review (1)',exact:true}).waitFor();
      // The same sheet must not be captured repeatedly after its first auto shot.
      await page.waitForTimeout(1400);assert.equal(await page.getByRole('button',{name:'Review (1)',exact:true}).count(),1);
      await capture.click();await page.getByRole('button',{name:'Review (2)',exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>window.__cameraCalls),1,'same camera stream remains open');
    }else{
      const input=camera.locator('input[type=file]');
      await input.setInputFiles({name:'page-one.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo)});await page.getByRole('button',{name:'Review (1)',exact:true}).waitFor();
      await input.setInputFiles({name:'page-two.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo)});await page.getByRole('button',{name:'Review (2)',exact:true}).waitFor();
    }
    await page.screenshot({path:`${output}/${name}-camera.png`});
    await page.getByRole('button',{name:'Review (2)',exact:true}).click();
    assert.equal(await page.locator('.scan-page-list-v328 li').count(),2);
    const jobs=await page.evaluate(()=>window.__photoJobs);assert.equal(jobs.length,2,'both photos finish in the local worker');assert.ok(jobs.every(job=>job.thread==='worker'),'photo processing stays off the UI thread');console.log(name+' local photo jobs: '+JSON.stringify(jobs));
    if(videoReady)assert.equal(await page.evaluate(()=>window.__scannerStream.getTracks().every(t=>t.readyState==='ended')),true);
    const dimensions=await page.locator('.scan-paper-preview-v328 img').evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));
    assert.ok(dimensions.w<1400&&dimensions.h<1900,'the surrounding scene is cropped from the saved preview: '+JSON.stringify(dimensions));
    await page.getByRole('button',{name:'Crop & rotate',exact:true}).click();
    const handle=page.getByRole('button',{name:'Top left',exact:true});await handle.waitFor({state:'visible'});const box=await handle.boundingBox();assert.ok(box&&box.width>=44&&box.height>=44,'crop handles are visible and usable');
    await page.getByRole('button',{name:'Full page',exact:true}).click();await page.getByRole('button',{name:'Use page',exact:true}).click();
    const full=await page.locator('.scan-paper-preview-v328 img').evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));assert.ok(full.w>dimensions.w,'Full page restores the original scene');
    await page.getByRole('button',{name:'Crop & rotate',exact:true}).click();await page.getByRole('button',{name:'Auto edges',exact:true}).click();await page.getByRole('button',{name:'Use page',exact:true}).click();
    await page.getByRole('button',{name:'Read document',exact:true}).click();await page.getByText('Read 2 of 2 pages. Check the details below.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await page.locator('.scan-page-list-v328 li').count(),2);
    await page.screenshot({path:`${output}/${name}-pages.png`});
    // An unavailable worker must still produce a cropped page from the source.
    await page.evaluate(()=>{window.Worker=class{constructor(){throw new Error('Synthetic unavailable worker');}};});
    await page.getByRole('button',{name:'Camera',exact:true}).click();
    await page.locator('[data-smart-camera] input[type=file]').setInputFiles({name:'fallback-page.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo)});
    await page.getByRole('button',{name:'Review (3)',exact:true}).click();
    assert.equal(await page.locator('.scan-page-list-v328 li').count(),3,'worker failure retains all pages');
    const fallback=await page.locator('.scan-paper-preview-v328 img').evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));
    assert.ok(fallback.w<1400&&fallback.h<1900,'fallback keeps the selected paper crop');assert.deepEqual(errors,[]);
    console.log(`PASS — ${name}: ${videoReady?'auto/video capture and duplicate latch':'native photo input'}, continuous pages, crop, full source reset and reader recovery`);
  }catch(error){await page.screenshot({path:`${output}/${name}-FAILED.png`}).catch(()=>{});throw error;}
  finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
}

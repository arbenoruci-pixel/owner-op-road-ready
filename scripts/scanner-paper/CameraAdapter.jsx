'use client';
import React,{useEffect,useRef,useState} from 'react';
import {trackBoundary} from './documentBoundaryV110329.js';
import {canvasToFileV3} from './imageUtilsV3.js';
import {captureRank,sameCapturePage,canAutoDeliver} from './captureQualityV1104101.js';
import {updateCaptureWindow} from './captureWindowV110331.js';
import {lockCapturedPage,observePageTransition} from './pageTransitionV110333.js';
import {bindCapture} from './captureGeometryV1104110.js';
import {createCameraAnalyzer} from './cameraAnalysisClientV1104110.js';

function Icon({name}){const paths={close:'m6 6 12 12 M6 18 18 6',check:'m5 12 4 4 10-10',auto:'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5 M9 12l2 2 4-4',flash:'m13 2-9 12h7l-1 8 10-13h-7Z',more:'M5 12h.01 M12 12h.01 M19 12h.01'};return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;}
function fitRect(container,w,h){if(!container||!w||!h)return {x:0,y:0,width:0,height:0};const s=Math.min(container.clientWidth/w,container.clientHeight/h);return {x:(container.clientWidth-w*s)/2,y:(container.clientHeight-h*s)/2,width:w*s,height:h*s};}
function frameCanvas(video,maxSide=4096){const s=Math.min(1,maxSide/Math.max(video.videoWidth,video.videoHeight)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(video.videoWidth*s));c.height=Math.max(1,Math.round(video.videoHeight*s));c.getContext('2d',{alpha:false}).drawImage(video,0,0,c.width,c.height);return c;}
function timeout(promise,ms){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Camera took too long')),ms);})]).finally(()=>clearTimeout(timer));}
async function nextFrame(video){await new Promise(resolve=>{let id;const finish=()=>{clearTimeout(timer);if(id!=null)video.cancelVideoFrameCallback?.(id);resolve();};const timer=setTimeout(finish,120);if(video.requestVideoFrameCallback)id=video.requestVideoFrameCallback(finish);});}

export default function CameraAdapterV3({onCapture,onCancel,pageCount=0,maxPages=20,lastPage=null}){
  const videoRef=useRef(null),containerRef=useRef(null),streamRef=useRef(null),nativeInput=useRef(null),alive=useRef(true),busy=useRef(false),autoRef=useRef(true),captureRef=useRef(null),tracking=useRef(null),captureWindow=useRef(null),pageLock=useRef(null),observation=useRef(null),limit=useRef(false),finishRequested=useRef(false);
  const [corners,setCorners]=useState(null),[frame,setFrame]=useState({x:0,y:0,width:0,height:0}),[ready,setReady]=useState(false),[opened,setOpened]=useState(false),[capturing,setCapturing]=useState(false),[guidance,setGuidance]=useState('Opening camera…'),[error,setError]=useState(''),[auto,setAuto]=useState(true),[torch,setTorch]=useState(false),[hasTorch,setHasTorch]=useState(false),[thumbnail,setThumbnail]=useState(''),[options,setOptions]=useState(false),[capturePreview,setCapturePreview]=useState(''),[finishing,setFinishing]=useState(false);
  const previousPage=useRef(lastPage),previewTimer=useRef(null);
  const analyzer=useRef(null);
  limit.current=pageCount>=maxPages;
  function stop(){streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;}
  useEffect(()=>{
    if(!lastPage)return;const url=URL.createObjectURL(lastPage);setThumbnail(url);
    if(previousPage.current!==lastPage){
      clearTimeout(previewTimer.current);setCapturePreview(url);
      previewTimer.current=setTimeout(()=>setCapturePreview(''),950);
    }
    previousPage.current=lastPage;
    return()=>{clearTimeout(previewTimer.current);URL.revokeObjectURL(url);};
  },[lastPage]);
  useEffect(()=>{
    alive.current=true;let cancelled=false;analyzer.current=createCameraAnalyzer();
    (async()=>{try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Use Phone camera on this device.');
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160}}});
      if(cancelled){stream.getTracks().forEach(t=>t.stop());return;}streamRef.current=stream;
      const track=stream.getVideoTracks()[0],caps=track.getCapabilities?.()||{};setHasTorch(caps.torch===true);
      for(const property of ['focusMode','exposureMode','whiteBalanceMode'])if(caps[property]?.includes?.('continuous')){try{await track.applyConstraints({advanced:[{[property]:'continuous'}]});}catch{}if(cancelled)return;}
      const video=videoRef.current;if(!video){stop();return;}video.srcObject=stream;await video.play();if(cancelled)return;
      setOpened(true);setGuidance('Point the camera at your document');setFrame(fitRect(containerRef.current,video.videoWidth,video.videoHeight));
    }catch(cause){if(!cancelled){setError(cause.message||'Camera could not open');stop();}}})();
    return()=>{cancelled=true;alive.current=false;analyzer.current?.dispose();stop();};
  },[]);
  useEffect(()=>{
    const update=()=>setFrame(fitRect(containerRef.current,videoRef.current?.videoWidth,videoRef.current?.videoHeight));const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;if(containerRef.current)observer?.observe(containerRef.current);window.addEventListener('resize',update);return()=>{observer?.disconnect();window.removeEventListener('resize',update);};
  },[]);
  useEffect(()=>{
    let cancelled=false,timer;const sample=document.createElement('canvas');
    const tick=async()=>{
      if(cancelled||finishRequested.current)return;
      const started=performance.now(),video=videoRef.current;
      if(video?.videoWidth&&video.readyState>=2&&!document.hidden&&!analyzer.current?.busy()){try{
        const s=640/Math.max(video.videoWidth,video.videoHeight);sample.width=Math.round(video.videoWidth*s);sample.height=Math.round(video.videoHeight*s);
        const ctx=sample.getContext('2d',{alpha:false,willReadFrequently:true});ctx.drawImage(video,0,0,sample.width,sample.height);const pixels=ctx.getImageData(0,0,sample.width,sample.height);
        const {detection,signature,quality}=await analyzer.current.analyze(pixels,video.videoWidth,video.videoHeight),now=performance.now();
        if(cancelled||finishRequested.current)return;
        observation.current={detection,signature};
        pageLock.current=observePageTransition(pageLock.current,detection,signature);
        // Watch page transitions even while the captured photo is in the worker.
        // The driver often moves to the next sheet before that job completes.
        if(busy.current){timer=setTimeout(tick,Math.max(50,220-(performance.now()-started)));return;}
        tracking.current=trackBoundary(tracking.current,detection,now);setCorners(detection.found?tracking.current.corners:null);
        captureWindow.current=updateCaptureWindow(captureWindow.current,detection,quality,now);
        setReady(captureWindow.current.ready);
        setGuidance(limit.current?'All pages captured. Tap Done.':pageLock.current?.locked?'Page captured · Done or show the next sheet':quality.issues[0]||(autoRef.current?'Hold steady…':'Ready to capture'));
        if(!finishRequested.current&&!limit.current&&!pageLock.current?.locked&&autoRef.current&&captureWindow.current.ready)captureRef.current?.({automatic:true});
      }catch{if(cancelled)return;tracking.current=null;captureWindow.current=null;setReady(false);setCorners(null);}}
      timer=setTimeout(tick,Math.max(50,220-(performance.now()-started)));
    };
    timer=setTimeout(tick,100);return()=>{cancelled=true;clearTimeout(timer);};
  },[]);
  async function deliver(file,capture=null){
    setCorners(null);setReady(false);setGuidance('Preparing page…');await onCapture?.(file,capture);
    if(!alive.current)return;tracking.current=null;captureWindow.current=null;setCorners(null);setReady(false);setGuidance(finishRequested.current?'Finishing captured page…':'Page captured · Done or show the next sheet');
  }
  async function inspectFrame(canvas){
    const scale=Math.min(1,640/Math.max(canvas.width,canvas.height)),small=document.createElement('canvas');
    small.width=Math.round(canvas.width*scale);small.height=Math.round(canvas.height*scale);
    try{
      const ctx=small.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,small.width,small.height);
      return await analyzer.current.analyze(ctx.getImageData(0,0,small.width,small.height),canvas.width,canvas.height);
    }finally{small.width=small.height=1;}
  }
  async function inspectPhoto(file){
    const url=URL.createObjectURL(file),image=new Image();
    try{
      await timeout(new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;}),2000);
      const canvas=document.createElement('canvas'),scale=Math.min(1,4096/Math.max(image.naturalWidth,image.naturalHeight));
      canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
      try{canvas.getContext('2d',{alpha:false}).drawImage(image,0,0,canvas.width,canvas.height);return await inspectFrame(canvas);}
      finally{canvas.width=canvas.height=1;}
    }finally{image.onload=image.onerror=null;URL.revokeObjectURL(url);}
  }
  async function capture({automatic=false}={}){
    const video=videoRef.current;if(!video?.videoWidth||busy.current||finishRequested.current||!alive.current||limit.current)return;
    const reference=observation.current?.signature;
    busy.current=true;pageLock.current=lockCapturedPage(observation.current?.detection,reference);setCapturing(true);setCorners(null);setReady(false);setOptions(false);setError('');setGuidance('Capturing…');
    let best=null,bestReading=null;
    try{
      // Retain the actual frame we measured. Re-reading the video after scoring
      // can otherwise save the next blurred frame instead of the winning one.
      for(let i=0;i<3;i++){
        if(i)await nextFrame(video);if(!alive.current)return;
        const candidate=frameCanvas(video),reading=await inspectFrame(candidate);
        if(!best || sameCapturePage(reading.signature,bestReading.signature)&&captureRank(reading.quality)>captureRank(bestReading.quality)){
          if(best)best.width=best.height=1;best=candidate;bestReading=reading;
        }else candidate.width=candidate.height=1;
      }
      let file,method='video-burst',fallbackReason='still-unavailable',stillMilliseconds=0;const track=streamRef.current?.getVideoTracks()[0];
      if(typeof ImageCapture!=='undefined'&&track?.readyState==='live'){
        const stillStarted=performance.now();
        try{
          const camera=new ImageCapture(track);let settings={};
          try{
            const caps=await timeout(camera.getPhotoCapabilities(),400),width=caps.imageWidth?.max,height=caps.imageHeight?.max;
            if(width>0&&height>0&&width*height<=24000000)settings={imageWidth:width,imageHeight:height};
          }catch{/* Default supported still size is retained. */}
          const blob=await timeout(camera.takePhoto(settings),2000);
          fallbackReason='still-lower-quality-or-changed-page';
          if(blob.size&&blob.type.startsWith('image/')&&alive.current){
            const photo=new File([blob],'road-ready-camera.'+(blob.type==='image/png'?'png':'jpg'),{type:blob.type}),reading=await inspectPhoto(photo);
            if(sameCapturePage(reading.signature,bestReading.signature)&&captureRank(reading.quality)>=captureRank(bestReading.quality)){file=photo;bestReading=reading;method='native-still';fallbackReason='';}
          }
        }catch{fallbackReason='still-failed-or-timed-out';}
        finally{stillMilliseconds=Math.round(performance.now()-stillStarted);}
      }
      if(!alive.current)return;
      if(automatic&&!canAutoDeliver(bestReading,reference)){
        pageLock.current=null;tracking.current=null;captureWindow.current=null;
        setGuidance(bestReading.quality.issues[0]||'Hold the page steady for a sharper photo');return;
      }
      if(!file)file=await canvasToFileV3(best,'road-ready-camera.jpg',.99);
      if(alive.current)await deliver(file,bindCapture(file,bestReading,{method,fallbackReason,stillMilliseconds}));
    }catch(cause){pageLock.current=null;if(alive.current)setError(cause.message||'Could not add this page. Try again.');}
    finally{if(best)best.width=best.height=1;busy.current=false;if(alive.current){setCapturing(false);if(finishRequested.current)finishClose();}}
  }
  captureRef.current=capture;
  async function nativeChanged(event){const file=event.target.files?.[0];event.target.value='';if(!file||busy.current||finishRequested.current||limit.current)return;busy.current=true;pageLock.current=lockCapturedPage(observation.current?.detection,observation.current?.signature);setCapturing(true);setCorners(null);setOptions(false);setError('');try{await deliver(file);}catch(cause){pageLock.current=null;if(alive.current)setError(cause.message||'Could not add this page.');}finally{busy.current=false;if(alive.current){setCapturing(false);if(finishRequested.current)finishClose();}}}
  async function toggleTorch(){try{await streamRef.current?.getVideoTracks()[0]?.applyConstraints({advanced:[{torch:!torch}]});setTorch(!torch);}catch{setHasTorch(false);}}
  function finishClose(){alive.current=false;stop();onCancel?.();}
  function close(){
    finishRequested.current=true;autoRef.current=false;setFinishing(true);setOptions(false);setGuidance('Finishing captured page…');
    if(!busy.current)finishClose();
  }
  const points=corners?.map(p=>`${frame.x+p.x*frame.width},${frame.y+p.y*frame.height}`).join(' ');
  return <section data-smart-camera="110329" className="scan-camera-v333" aria-label="Document camera">
    <header>
      <button type="button" disabled={finishing} onClick={close} aria-label="Close camera"><Icon name="close"/></button>
      <b>Scan document</b>
      {pageCount>0||capturing?<button type="button" className="scan-camera-done-v333" disabled={finishing} onClick={close} aria-label={pageCount?`Review (${pageCount})`:'Finish capture'}><Icon name="check"/><span>{finishing?'Finishing…':'Done'}</span></button>:<span className="scan-camera-header-space-v333"/>}
    </header>
    <div ref={containerRef} className="scan-camera-view-v333">
      <video ref={videoRef} playsInline muted/>
      {points&&frame.width>0&&opened&&!capturing&&!capturePreview&&<svg viewBox={`0 0 ${frame.width+frame.x*2} ${frame.height+frame.y*2}`} preserveAspectRatio="none" className="scan-camera-outline-v333"><polygon points={points} fill={ready?'rgba(38,190,125,.18)':'rgba(56,163,255,.08)'} stroke={ready?'#26be7d':'#38a3ff'} strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg>}
      {capturePreview&&<div className="scan-capture-preview-v334" aria-label="Captured page preview" key={capturePreview}><img src={capturePreview} alt="Captured document"/><span><Icon name="check"/>Page added</span></div>}
      <div className="scan-camera-guidance-v333" role="status">{error||guidance}</div>
      {error&&!opened&&<button type="button" className="scan-camera-fallback-v333" disabled={capturing} onClick={()=>nativeInput.current?.click()}>Open phone camera</button>}
    </div>
    <footer>
      <div className="scan-camera-controls-v333">
        <button type="button" disabled={capturing} aria-pressed={auto} onClick={()=>{autoRef.current=!auto;setAuto(!auto);captureWindow.current=null;}}><Icon name="auto"/><span>{auto?'Auto':'Manual'}</span></button>
        {hasTorch&&<button type="button" disabled={capturing} aria-label={torch?'Flash on':'Flash off'} aria-pressed={torch} onClick={toggleTorch}><Icon name="flash"/><span>Flash</span></button>}
        <button type="button" disabled={capturing} aria-label="Camera options" aria-expanded={options} onClick={()=>setOptions(!options)}><Icon name="more"/><span>More</span></button>
      </div>
      {options&&<div className="scan-camera-options-v333"><button type="button" disabled={capturing||pageCount>=maxPages} onClick={()=>{autoRef.current=false;setAuto(false);nativeInput.current?.click();}}>Use phone camera</button></div>}
      <div className="scan-camera-shutter-row-v333">
        {thumbnail?<button type="button" className="scan-camera-thumbnail-v333" disabled={finishing} onClick={close} aria-label={`Open ${pageCount} captured pages`}><img src={thumbnail} alt="Last captured page"/><span>{pageCount}</span></button>:<span/>}
        <button type="button" className="scan-camera-shutter-v333" disabled={!opened||capturing||pageCount>=maxPages} onClick={capture} aria-label="Capture document">{capturing&&<span className="scan-camera-spinner-v333"/>}</button>
        <span aria-label={`${pageCount} pages captured`} className="scan-camera-count-v333">{pageCount?`${pageCount}/${maxPages}`:''}</span>
      </div>
      <input ref={nativeInput} type="file" accept="image/*" capture="environment" hidden onChange={nativeChanged}/>
    </footer>
  </section>;
}

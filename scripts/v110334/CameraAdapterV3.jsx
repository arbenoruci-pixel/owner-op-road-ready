'use client';
import React,{useEffect,useRef,useState} from 'react';
import {detectDocumentEdgesV3} from './EdgeDetectorV3.js';
import {trackBoundary} from './documentBoundaryV110329.js';
import {assessDocumentQuality} from './DocumentQualityV11036.js';
import {canvasToFileV3} from './imageUtilsV3.js';
import {updateCaptureWindow} from './captureWindowV110331.js';
import {paperSignature,lockCapturedPage,observePageTransition} from './pageTransitionV110333.js';

function Icon({name}){const paths={close:'m6 6 12 12 M6 18 18 6',check:'m5 12 4 4 10-10',auto:'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5 M9 12l2 2 4-4',flash:'m13 2-9 12h7l-1 8 10-13h-7Z',more:'M5 12h.01 M12 12h.01 M19 12h.01'};return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;}
function fitRect(container,w,h){if(!container||!w||!h)return {x:0,y:0,width:0,height:0};const s=Math.min(container.clientWidth/w,container.clientHeight/h);return {x:(container.clientWidth-w*s)/2,y:(container.clientHeight-h*s)/2,width:w*s,height:h*s};}
function frameCanvas(video,maxSide=4096){const s=Math.min(1,maxSide/Math.max(video.videoWidth,video.videoHeight)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(video.videoWidth*s));c.height=Math.max(1,Math.round(video.videoHeight*s));c.getContext('2d',{alpha:false}).drawImage(video,0,0,c.width,c.height);return c;}
function timeout(promise,ms){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Camera took too long')),ms);})]).finally(()=>clearTimeout(timer));}
async function nextFrame(video){await new Promise(resolve=>{let id;const finish=()=>{clearTimeout(timer);if(id!=null)video.cancelVideoFrameCallback?.(id);resolve();};const timer=setTimeout(finish,120);if(video.requestVideoFrameCallback)id=video.requestVideoFrameCallback(finish);});}

export default function CameraAdapterV3({onCapture,onCancel,pageCount=0,maxPages=20,lastPage=null}){
  const videoRef=useRef(null),containerRef=useRef(null),streamRef=useRef(null),nativeInput=useRef(null),alive=useRef(true),busy=useRef(false),autoRef=useRef(true),captureRef=useRef(null),tracking=useRef(null),captureWindow=useRef(null),pageLock=useRef(null),observation=useRef(null),limit=useRef(false);
  const [corners,setCorners]=useState(null),[frame,setFrame]=useState({x:0,y:0,width:0,height:0}),[ready,setReady]=useState(false),[opened,setOpened]=useState(false),[capturing,setCapturing]=useState(false),[guidance,setGuidance]=useState('Opening camera…'),[error,setError]=useState(''),[auto,setAuto]=useState(true),[torch,setTorch]=useState(false),[hasTorch,setHasTorch]=useState(false),[thumbnail,setThumbnail]=useState(''),[options,setOptions]=useState(false),[capturePreview,setCapturePreview]=useState('');
  const previousPage=useRef(lastPage),previewTimer=useRef(null);
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
    alive.current=true;let cancelled=false;
    (async()=>{try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('Use Phone camera on this device.');
      const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160}}});
      if(cancelled){stream.getTracks().forEach(t=>t.stop());return;}streamRef.current=stream;
      const track=stream.getVideoTracks()[0],caps=track.getCapabilities?.()||{};setHasTorch(caps.torch===true);
      for(const property of ['focusMode','exposureMode','whiteBalanceMode'])if(caps[property]?.includes?.('continuous')){try{await track.applyConstraints({advanced:[{[property]:'continuous'}]});}catch{}if(cancelled)return;}
      const video=videoRef.current;if(!video){stop();return;}video.srcObject=stream;await video.play();if(cancelled)return;
      setOpened(true);setGuidance('Point the camera at your document');setFrame(fitRect(containerRef.current,video.videoWidth,video.videoHeight));
    }catch(cause){if(!cancelled){setError(cause.message||'Camera could not open');stop();}}})();
    return()=>{cancelled=true;alive.current=false;stop();};
  },[]);
  useEffect(()=>{
    const update=()=>setFrame(fitRect(containerRef.current,videoRef.current?.videoWidth,videoRef.current?.videoHeight));const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;if(containerRef.current)observer?.observe(containerRef.current);window.addEventListener('resize',update);return()=>{observer?.disconnect();window.removeEventListener('resize',update);};
  },[]);
  useEffect(()=>{
    let cancelled=false,timer;const sample=document.createElement('canvas');
    const tick=()=>{
      if(cancelled)return;
      const started=performance.now(),video=videoRef.current;
      if(video?.videoWidth&&video.readyState>=2&&!document.hidden){try{
        const s=384/Math.max(video.videoWidth,video.videoHeight);sample.width=Math.round(video.videoWidth*s);sample.height=Math.round(video.videoHeight*s);
        const ctx=sample.getContext('2d',{alpha:false,willReadFrequently:true});ctx.drawImage(video,0,0,sample.width,sample.height);const pixels=ctx.getImageData(0,0,sample.width,sample.height),detection=detectDocumentEdgesV3(pixels,{maxSide:384}),now=performance.now();
        const signature=detection.found&&detection.confidence>=.8?paperSignature(pixels,detection.corners):null;
        observation.current={detection,signature};
        pageLock.current=observePageTransition(pageLock.current,detection,signature);
        // Watch page transitions even while the captured photo is in the worker.
        // The driver often moves to the next sheet before that job completes.
        if(busy.current){timer=setTimeout(tick,Math.max(50,220-(performance.now()-started)));return;}
        tracking.current=trackBoundary(tracking.current,detection,now);setCorners(detection.found?tracking.current.corners:null);
        const quality=assessDocumentQuality(pixels,{corners:detection.corners,live:true,detectionFound:detection.found,detectionConfidence:detection.confidence,nativeWidth:video.videoWidth,nativeHeight:video.videoHeight});
        captureWindow.current=updateCaptureWindow(captureWindow.current,detection,quality,now);
        setReady(captureWindow.current.ready);
        setGuidance(limit.current?'All pages captured. Tap Done.':pageLock.current?.locked?'Ready for next scan':quality.issues[0]||(autoRef.current?'Hold steady…':'Ready to capture'));
        if(!limit.current&&!pageLock.current?.locked&&autoRef.current&&captureWindow.current.ready)captureRef.current?.();
      }catch{tracking.current=null;captureWindow.current=null;setReady(false);setCorners(null);}}
      timer=setTimeout(tick,Math.max(50,220-(performance.now()-started)));
    };
    timer=setTimeout(tick,100);return()=>{cancelled=true;clearTimeout(timer);};
  },[]);
  async function deliver(file){
    setCorners(null);setReady(false);setGuidance('Preparing page…');await onCapture?.(file);
    if(!alive.current)return;tracking.current=null;captureWindow.current=null;setCorners(null);setReady(false);setGuidance('Ready for next scan');
  }
  async function capture(){
    const video=videoRef.current;if(!video?.videoWidth||busy.current||!alive.current||limit.current)return;
    busy.current=true;pageLock.current=lockCapturedPage(observation.current?.detection,observation.current?.signature);setCapturing(true);setCorners(null);setReady(false);setOptions(false);setError('');setGuidance('Capturing…');
    try{
      let file;const track=streamRef.current?.getVideoTracks()[0];
      if(typeof ImageCapture!=='undefined'&&track?.readyState==='live'){
        // Freeze the page before waiting for a still photo. A slow/failed camera
        // must never replace this shot with the scene after the phone has moved.
        const frozen=frameCanvas(video);
        try{
          try{const blob=await timeout(new ImageCapture(track).takePhoto(),900);if(blob.size&&blob.type.startsWith('image/'))file=new File([blob],'road-ready-camera.'+(blob.type==='image/png'?'png':'jpg'),{type:blob.type});}catch{}
          if(!file&&alive.current)file=await canvasToFileV3(frozen,'road-ready-camera.jpg',.99);
        }finally{frozen.width=frozen.height=1;}
        if(!alive.current)return;
      }
      if(!file){let best=null,bestScore=-Infinity;try{
        let previousQuality=null;
        for(let i=0;i<3;i++){
          if(i)await nextFrame(video);if(!alive.current)return;
          const small=frameCanvas(video,800),ctx=small.getContext('2d',{willReadFrequently:true}),pixels=ctx.getImageData(0,0,small.width,small.height);
          const q=assessDocumentQuality(pixels,{corners:tracking.current?.corners,nativeWidth:video.videoWidth,nativeHeight:video.videoHeight});small.width=small.height=1;
          if(q.score>bestScore){if(best)best.width=best.height=1;best=frameCanvas(video);bestScore=q.score;}
          if(previousQuality?.ready&&q.ready&&Math.abs(q.score-previousQuality.score)<.025)break;
          previousQuality=q;
        }
        file=await canvasToFileV3(best,'road-ready-camera.jpg',.99);
      }finally{if(best)best.width=best.height=1;}}
      if(alive.current)await deliver(file);
    }catch(cause){pageLock.current=null;if(alive.current)setError(cause.message||'Could not add this page. Try again.');}
    finally{busy.current=false;if(alive.current)setCapturing(false);}
  }
  captureRef.current=capture;
  async function nativeChanged(event){const file=event.target.files?.[0];event.target.value='';if(!file||busy.current||limit.current)return;busy.current=true;pageLock.current=lockCapturedPage(observation.current?.detection,observation.current?.signature);setCapturing(true);setCorners(null);setOptions(false);setError('');try{await deliver(file);}catch(cause){pageLock.current=null;if(alive.current)setError(cause.message||'Could not add this page.');}finally{busy.current=false;if(alive.current)setCapturing(false);}}
  async function toggleTorch(){try{await streamRef.current?.getVideoTracks()[0]?.applyConstraints({advanced:[{torch:!torch}]});setTorch(!torch);}catch{setHasTorch(false);}}
  function close(){if(busy.current)return;alive.current=false;stop();onCancel?.();}
  const points=corners?.map(p=>`${frame.x+p.x*frame.width},${frame.y+p.y*frame.height}`).join(' ');
  return <section data-smart-camera="110329" className="scan-camera-v333" aria-label="Document camera">
    <header>
      <button type="button" disabled={capturing} onClick={close} aria-label="Close camera"><Icon name="close"/></button>
      <b>Scan document</b>
      {pageCount>0?<button type="button" className="scan-camera-done-v333" disabled={capturing} onClick={close} aria-label={`Review (${pageCount})`}><Icon name="check"/><span>Done</span></button>:<span className="scan-camera-header-space-v333"/>}
    </header>
    <div ref={containerRef} className="scan-camera-view-v333">
      <video ref={videoRef} playsInline muted/>
      {points&&frame.width>0&&opened&&!capturing&&!capturePreview&&<svg viewBox={`0 0 ${frame.width+frame.x*2} ${frame.height+frame.y*2}`} preserveAspectRatio="none" className="scan-camera-outline-v333"><polygon points={points} fill={ready?'rgba(56,163,255,.23)':'rgba(56,163,255,.12)'} stroke="#38a3ff" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg>}
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
        {thumbnail?<button type="button" className="scan-camera-thumbnail-v333" disabled={capturing} onClick={close} aria-label={`Open ${pageCount} captured pages`}><img src={thumbnail} alt="Last captured page"/><span>{pageCount}</span></button>:<span/>}
        <button type="button" className="scan-camera-shutter-v333" disabled={!opened||capturing||pageCount>=maxPages} onClick={capture} aria-label="Capture document">{capturing&&<span className="scan-camera-spinner-v333"/>}</button>
        <span aria-label={`${pageCount} pages captured`} className="scan-camera-count-v333">{pageCount?`${pageCount}/${maxPages}`:''}</span>
      </div>
      <input ref={nativeInput} type="file" accept="image/*" capture="environment" hidden onChange={nativeChanged}/>
    </footer>
  </section>;
}

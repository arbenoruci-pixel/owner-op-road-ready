'use client';
import React,{useEffect,useRef,useState} from 'react';
import {detectDocumentEdgesV3} from './EdgeDetectorV3.js';
import {trackBoundary} from './documentBoundaryV110329.js';
import {assessDocumentQuality} from './DocumentQualityV11036.js';
import {canvasToFileV3} from './imageUtilsV3.js';
import {updateCaptureWindow} from './captureWindowV110331.js';

const button={minHeight:44,border:'1px solid #64748b',borderRadius:22,padding:'8px 14px',background:'#172033',color:'#fff',fontWeight:700};
function fitRect(container,w,h){if(!container||!w||!h)return {x:0,y:0,width:0,height:0};const s=Math.min(container.clientWidth/w,container.clientHeight/h);return {x:(container.clientWidth-w*s)/2,y:(container.clientHeight-h*s)/2,width:w*s,height:h*s};}
function frameCanvas(video,maxSide=4096){const s=Math.min(1,maxSide/Math.max(video.videoWidth,video.videoHeight)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(video.videoWidth*s));c.height=Math.max(1,Math.round(video.videoHeight*s));c.getContext('2d',{alpha:false}).drawImage(video,0,0,c.width,c.height);return c;}
function timeout(promise,ms){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Camera took too long')),ms);})]).finally(()=>clearTimeout(timer));}
async function nextFrame(video){await new Promise(resolve=>{let id;const finish=()=>{clearTimeout(timer);if(id!=null)video.cancelVideoFrameCallback?.(id);resolve();};const timer=setTimeout(finish,120);if(video.requestVideoFrameCallback)id=video.requestVideoFrameCallback(finish);});}

export default function CameraAdapterV3({onCapture,onCancel,pageCount=0,maxPages=20,lastPage=null}){
  const videoRef=useRef(null),containerRef=useRef(null),streamRef=useRef(null),nativeInput=useRef(null),alive=useRef(true),busy=useRef(false),autoRef=useRef(true),captureRef=useRef(null),tracking=useRef(null),captureWindow=useRef(null),latched=useRef(false),misses=useRef(0),limit=useRef(false);
  const [corners,setCorners]=useState(null),[frame,setFrame]=useState({x:0,y:0,width:0,height:0}),[ready,setReady]=useState(false),[opened,setOpened]=useState(false),[capturing,setCapturing]=useState(false),[guidance,setGuidance]=useState('Opening camera…'),[error,setError]=useState(''),[auto,setAuto]=useState(true),[torch,setTorch]=useState(false),[hasTorch,setHasTorch]=useState(false),[thumbnail,setThumbnail]=useState('');
  limit.current=pageCount>=maxPages;
  function stop(){streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;}
  useEffect(()=>{if(!lastPage)return;const url=URL.createObjectURL(lastPage);setThumbnail(url);return()=>URL.revokeObjectURL(url);},[lastPage]);
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
      if(video?.videoWidth&&video.readyState>=2&&!busy.current&&!document.hidden){try{
        const s=384/Math.max(video.videoWidth,video.videoHeight);sample.width=Math.round(video.videoWidth*s);sample.height=Math.round(video.videoHeight*s);
        const ctx=sample.getContext('2d',{alpha:false,willReadFrequently:true});ctx.drawImage(video,0,0,sample.width,sample.height);const pixels=ctx.getImageData(0,0,sample.width,sample.height),detection=detectDocumentEdgesV3(pixels,{maxSide:384}),now=performance.now();
        tracking.current=trackBoundary(tracking.current,detection,now);setCorners(tracking.current.corners);
        if(!detection.found){misses.current++;if(misses.current>=2)latched.current=false;}else misses.current=0;
        const quality=assessDocumentQuality(pixels,{corners:detection.corners,live:true,detectionFound:detection.found,detectionConfidence:detection.confidence,nativeWidth:video.videoWidth,nativeHeight:video.videoHeight});
        captureWindow.current=updateCaptureWindow(captureWindow.current,detection,quality,now);
        setReady(captureWindow.current.ready);
        setGuidance(limit.current?'Page limit reached. Review your pages.':latched.current?'Page added. Show the next page, or tap Capture.':quality.issues[0]||(autoRef.current?'Hold steady…':'Ready to capture'));
        if(!limit.current&&!latched.current&&autoRef.current&&captureWindow.current.ready)captureRef.current?.();
      }catch{tracking.current=null;captureWindow.current=null;setReady(false);setCorners(null);}}
      timer=setTimeout(tick,Math.max(50,220-(performance.now()-started)));
    };
    timer=setTimeout(tick,100);return()=>{cancelled=true;clearTimeout(timer);};
  },[]);
  async function deliver(file){
    setGuidance('Preparing your page…');await onCapture?.(file);
    if(!alive.current)return;latched.current=true;misses.current=0;tracking.current=null;captureWindow.current=null;setCorners(null);setReady(false);setGuidance('Page added. Show the next page, or tap Capture.');
  }
  async function capture(){
    const video=videoRef.current;if(!video?.videoWidth||busy.current||!alive.current||limit.current)return;
    busy.current=true;setCapturing(true);setError('');setGuidance('Capturing…');
    try{
      let file;const track=streamRef.current?.getVideoTracks()[0];
      if(typeof ImageCapture!=='undefined'&&track?.readyState==='live'){try{const blob=await timeout(new ImageCapture(track).takePhoto(),4500);if(blob.size&&blob.type.startsWith('image/'))file=new File([blob],'road-ready-camera.'+(blob.type==='image/png'?'png':'jpg'),{type:blob.type});}catch{}}
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
    }catch(cause){if(alive.current)setError(cause.message||'Could not add this page. Try again.');}
    finally{busy.current=false;if(alive.current)setCapturing(false);}
  }
  captureRef.current=capture;
  async function nativeChanged(event){const file=event.target.files?.[0];event.target.value='';if(!file||busy.current||limit.current)return;busy.current=true;setCapturing(true);setError('');try{await deliver(file);}catch(cause){if(alive.current)setError(cause.message||'Could not add this page.');}finally{busy.current=false;if(alive.current)setCapturing(false);}}
  async function toggleTorch(){try{await streamRef.current?.getVideoTracks()[0]?.applyConstraints({advanced:[{torch:!torch}]});setTorch(!torch);}catch{setHasTorch(false);}}
  function close(){if(busy.current)return;alive.current=false;stop();onCancel?.();}
  const tone=ready?'#4ade80':'#fbbf24',points=corners?.map(p=>`${frame.x+p.x*frame.width},${frame.y+p.y*frame.height}`).join(' ');
  return <section data-smart-camera="110329" style={{position:'fixed',inset:0,zIndex:1400,background:'#020617',color:'#fff',display:'grid',gridTemplateRows:'auto 1fr auto'}}>
    <header style={{padding:'calc(10px + env(safe-area-inset-top)) 12px 10px',display:'flex',gap:12,alignItems:'center'}}>
      <button type="button" disabled={capturing} onClick={close} aria-label="Close camera" style={button}>×</button>
      <div style={{flex:1,textAlign:'center'}}><b>{pageCount>=maxPages?'Pages ready':`Page ${pageCount+1}`}</b><div role="status" style={{fontSize:14,marginTop:5,color:'#cbd5e1'}}>{error||guidance}</div></div>
      {pageCount>0&&<button type="button" disabled={capturing} onClick={close} style={{...button,padding:'8px 10px',fontSize:14,whiteSpace:'nowrap'}}>{`Review (${pageCount})`}</button>}
    </header>
    <div ref={containerRef} style={{position:'relative',minHeight:0,background:'#000',overflow:'hidden'}}>
      <video ref={videoRef} playsInline muted style={{width:'100%',height:'100%',objectFit:'contain'}}/>
      {points&&frame.width>0&&opened&&<svg viewBox={`0 0 ${frame.width+frame.x*2} ${frame.height+frame.y*2}`} preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}><polygon points={points} fill="rgba(74,222,128,.06)" stroke={tone} strokeWidth="3" vectorEffect="non-scaling-stroke"/></svg>}
    </div>
    <footer style={{padding:'10px 12px calc(12px + env(safe-area-inset-bottom))',display:'grid',gap:10}}>
      <div style={{display:'flex',gap:8,justifyContent:'center'}}>
        <button type="button" disabled={capturing} aria-pressed={auto} onClick={()=>{autoRef.current=!auto;setAuto(!auto);captureWindow.current=null;}} style={button}>Auto {auto?'on':'off'}</button>
        {hasTorch&&<button type="button" disabled={capturing} aria-pressed={torch} onClick={toggleTorch} style={button}>Light {torch?'on':'off'}</button>}
        <button type="button" disabled={capturing||pageCount>=maxPages} onClick={()=>{autoRef.current=false;setAuto(false);nativeInput.current?.click();}} style={button}>Phone camera</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:16,alignItems:'center'}}>
        <div>{thumbnail&&<img src={thumbnail} alt="Last captured page" style={{height:52,width:40,objectFit:'cover',borderRadius:4,border:'1px solid #64748b'}}/>}</div>
        <button type="button" disabled={!opened||capturing||pageCount>=maxPages} onClick={capture} aria-label="Capture document" style={{width:70,height:70,borderRadius:'50%',border:'5px solid white',background:capturing?'#64748b':'#2563eb',color:'#fff'}}>{capturing?'•••':''}</button>
        <span aria-label={`${pageCount} pages captured`} style={{fontSize:14,textAlign:'center'}}>{pageCount?`${pageCount} pages`:''}</span>
      </div>
      <input ref={nativeInput} type="file" accept="image/*" capture="environment" hidden onChange={nativeChanged}/>
    </footer>
  </section>;
}

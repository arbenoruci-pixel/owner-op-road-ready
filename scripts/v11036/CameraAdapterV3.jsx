'use client';
import React, { useEffect, useRef, useState } from 'react';
import { detectDocumentEdgesV3 } from './EdgeDetectorV3.js';
import { canvasToFileV3 } from './imageUtilsV3.js';
import { DEFAULT_CORNERS_V3 } from './scannerTypesV3.js';
import { assessDocumentQuality, updateCaptureStability } from './DocumentQualityV11036.js';

const button = {minHeight:44,border:'1px solid #64748b',borderRadius:24,padding:'8px 16px',background:'#172033',color:'#fff',fontWeight:700};
function fitRect(container,w,h){if(!container||!w||!h)return {x:0,y:0,width:0,height:0};const scale=Math.min(container.clientWidth/w,container.clientHeight/h);return {x:(container.clientWidth-w*scale)/2,y:(container.clientHeight-h*scale)/2,width:w*scale,height:h*scale};}
function frameCanvas(video, maxSide=4096){const scale=Math.min(1,maxSide/Math.max(video.videoWidth,video.videoHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,canvas.width,canvas.height);return canvas;}
function timeout(promise,ms){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Camera took too long')),ms);})]).finally(()=>clearTimeout(timer));}
async function nextFrame(video){await new Promise(resolve=>{let id;const finish=()=>{clearTimeout(timer);if(id!=null)video.cancelVideoFrameCallback?.(id);resolve();};const timer=setTimeout(finish,120);if(video.requestVideoFrameCallback)id=video.requestVideoFrameCallback(finish);});}

export default function CameraAdapterV3({onCapture,onCancel}){
  const videoRef=useRef(null),containerRef=useRef(null),streamRef=useRef(null),busyRef=useRef(false),aliveRef=useRef(true),stabilityRef=useRef(null),autoRef=useRef(true),captureRef=useRef(null);
  const nativeInput=useRef(null);
  const [corners,setCorners]=useState(DEFAULT_CORNERS_V3),[frame,setFrame]=useState({x:0,y:0,width:0,height:0}),[guidance,setGuidance]=useState('Opening camera…'),[ready,setReady]=useState(false),[capturing,setCapturing]=useState(false),[error,setError]=useState(''),[auto,setAuto]=useState(true),[torch,setTorch]=useState(false),[hasTorch,setHasTorch]=useState(false),[opened,setOpened]=useState(false);
  function stop(){streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=null;}
  useEffect(()=>{
    aliveRef.current=true;
    let cancelled=false;
    (async()=>{
      try{
        if(!navigator.mediaDevices?.getUserMedia)throw new Error('Use Phone camera or Photos on this device.');
        const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160}}});
        if(cancelled){stream.getTracks().forEach(t=>t.stop());return;}
        streamRef.current=stream;
        const track=stream.getVideoTracks()[0],caps=track.getCapabilities?.()||{};
        setHasTorch(caps.torch===true);
        for(const property of ['focusMode','exposureMode','whiteBalanceMode'])if(caps[property]?.includes?.('continuous')){
          try{await track.applyConstraints({advanced:[{[property]:'continuous'}]});}catch{}
          if(cancelled)return;
        }
        const video=videoRef.current;if(!video){stop();return;}video.srcObject=stream;await video.play();
        if(cancelled)return;
        setOpened(true);setGuidance('Place the full paper inside the frame');setFrame(fitRect(containerRef.current,video.videoWidth,video.videoHeight));
      }catch(cause){if(!cancelled){setError(cause?.message||'Camera could not open');stop();}}
    })();
    return()=>{cancelled=true;aliveRef.current=false;stop();};
  },[]);
  useEffect(()=>{
    const update=()=>setFrame(fitRect(containerRef.current,videoRef.current?.videoWidth,videoRef.current?.videoHeight));
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;
    if(containerRef.current)observer?.observe(containerRef.current);
    window.addEventListener('resize',update);return()=>{observer?.disconnect();window.removeEventListener('resize',update);};
  },[]);
  useEffect(()=>{
    const sample=document.createElement('canvas');
    const timer=setInterval(()=>{
      const video=videoRef.current;if(!video?.videoWidth||video.readyState<2||busyRef.current||document.hidden)return;
      try{
        const scale=480/Math.max(video.videoWidth,video.videoHeight);sample.width=Math.round(video.videoWidth*scale);sample.height=Math.round(video.videoHeight*scale);
        const ctx=sample.getContext('2d',{alpha:false,willReadFrequently:true});ctx.drawImage(video,0,0,sample.width,sample.height);
        const pixels=ctx.getImageData(0,0,sample.width,sample.height),detection=detectDocumentEdgesV3(pixels,{maxSide:480});
        const quality=assessDocumentQuality(pixels,{corners:detection.corners,live:true,detectionConfidence:detection.confidence,nativeWidth:video.videoWidth,nativeHeight:video.videoHeight});
        stabilityRef.current=updateCaptureStability(stabilityRef.current,detection,quality,performance.now());
        setCorners(detection.corners);setReady(quality.ready);setGuidance(quality.issues[0]||(autoRef.current?'Hold steady — capturing automatically':'Ready to capture'));
        if(autoRef.current&&stabilityRef.current.ready)captureRef.current?.();
      }catch{stabilityRef.current=null;setReady(false);}
    },350);
    return()=>clearInterval(timer);
  },[]);
  async function capture(){
    const video=videoRef.current;if(!video?.videoWidth||busyRef.current||!aliveRef.current)return;
    busyRef.current=true;setCapturing(true);setError('');setGuidance('Choosing the clearest photo…');
    try{
      let file;
      const track=streamRef.current?.getVideoTracks()[0];
      if(typeof ImageCapture!=='undefined'&&track?.readyState==='live'){
        try{const blob=await timeout(new ImageCapture(track).takePhoto(),4500);if(blob.size&&blob.type.startsWith('image/'))file=new File([blob],'road-ready-camera.'+(blob.type==='image/png'?'png':'jpg'),{type:blob.type});}catch{}
      }
      if(!file){
        let best=null,bestScore=-Infinity;
        for(let i=0;i<3;i++){
          await nextFrame(video);if(!aliveRef.current)return;
          const candidate=frameCanvas(video),sample=frameCanvas(video,800),ctx=sample.getContext('2d',{willReadFrequently:true});
          const quality=assessDocumentQuality(ctx.getImageData(0,0,sample.width,sample.height),{corners:stabilityRef.current?.corners,nativeWidth:candidate.width,nativeHeight:candidate.height});
          sample.width=1;sample.height=1;
          if(quality.score>bestScore){if(best){best.width=1;best.height=1;}best=candidate;bestScore=quality.score;}else{candidate.width=1;candidate.height=1;}
        }
        file=await canvasToFileV3(best,'road-ready-camera.jpg',.99);best.width=1;best.height=1;
      }
      if(!aliveRef.current)return;
      stop();onCapture?.(file);
    }catch(cause){if(aliveRef.current){setError(cause?.message||'Try capturing again');setCapturing(false);busyRef.current=false;}}
  }
  captureRef.current=capture;
  async function toggleTorch(){const track=streamRef.current?.getVideoTracks()[0];try{await track?.applyConstraints({advanced:[{torch:!torch}]});setTorch(!torch);}catch{setHasTorch(false);}}
  function phoneCamera(){autoRef.current=false;setAuto(false);nativeInput.current?.click();}
  const points=corners.map(p=>`${frame.x+p.x*frame.width},${frame.y+p.y*frame.height}`).join(' '),tone=ready?'#4ade80':'#fbbf24';
  return <section data-smart-camera="11036" style={{position:'fixed',inset:0,zIndex:1400,background:'#020617',color:'#fff',display:'grid',gridTemplateRows:'auto 1fr auto'}}>
    <header style={{padding:'calc(10px + env(safe-area-inset-top)) 12px 10px',display:'flex',gap:12,alignItems:'center'}}>
      <button type="button" onClick={()=>{aliveRef.current=false;stop();onCancel?.();}} aria-label="Close camera" style={button}>×</button>
      <div style={{flex:1,textAlign:'center'}}><b>Scan document</b><div role="status" style={{fontSize:12,marginTop:5,color:'#cbd5e1'}}>{error||guidance}</div></div>
    </header>
    <div ref={containerRef} style={{position:'relative',minHeight:0,background:'#000',overflow:'hidden'}}>
      <video ref={videoRef} playsInline muted style={{width:'100%',height:'100%',objectFit:'contain'}} />
      {frame.width>0&&opened&&<svg viewBox={`0 0 ${frame.width+frame.x*2} ${frame.height+frame.y*2}`} preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}><polygon points={points} fill="transparent" stroke={tone} strokeWidth="3" vectorEffect="non-scaling-stroke"/>{corners.map((p,i)=><circle key={i} cx={frame.x+p.x*frame.width} cy={frame.y+p.y*frame.height} r="7" fill={tone} stroke="#fff" strokeWidth="2"/>)}</svg>}
    </div>
    <footer style={{padding:'12px 12px calc(16px + env(safe-area-inset-bottom))',display:'grid',justifyItems:'center',gap:12}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center'}}>
        <button type="button" disabled={capturing} aria-pressed={auto} onClick={()=>{autoRef.current=!auto;setAuto(!auto);stabilityRef.current=null;}} style={button}>Auto {auto?'on':'off'}</button>
        {hasTorch&&<button type="button" disabled={capturing} aria-pressed={torch} onClick={toggleTorch} style={button}>Light {torch?'on':'off'}</button>}
        <button type="button" disabled={capturing} onClick={phoneCamera} style={button}>Phone camera</button>
      </div>
      <button type="button" disabled={!opened||capturing} onClick={capture} aria-label="Capture document" style={{width:76,height:76,borderRadius:'50%',border:'6px solid white',background:capturing?'#64748b':'#2563eb',color:'#fff'}}>{capturing?'•••':''}</button>
      <input ref={nativeInput} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={event=>{const file=event.target.files?.[0];if(file){busyRef.current=true;stop();onCapture?.(file);}}}/>
    </footer>
  </section>;
}

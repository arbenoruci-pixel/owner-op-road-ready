'use client';
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {reviewSourceBoxes,reviewViewport} from '../../../../packages/smart-reader-core/src/reviewViewport.js';

export default function SourceFocus({file,evidence,continuations=[]}){
  const [asset,setAsset]=useState(null),[image,setImage]=useState(null),[size,setSize]=useState(null),[failed,setFailed]=useState(false);
  const [whole,setWhole]=useState(false),[zoom,setZoom]=useState(null);
  const viewport=useRef(null),drag=useRef(null);
  const boxes=reviewSourceBoxes(evidence,continuations);
  const view=reviewViewport({image,viewport:size,boxes,whole,zoom});
  useEffect(()=>{
    setImage(null);setFailed(false);setWhole(false);setZoom(null);
    if(!(file instanceof Blob)){setAsset(null);return;}
    const url=URL.createObjectURL(file);setAsset({file,url});
    return ()=>URL.revokeObjectURL(url);
  },[file]);
  useEffect(()=>{
    const node=viewport.current;if(!node)return;
    const measure=()=>setSize({width:node.clientWidth,height:node.clientHeight});
    measure();const observer=new ResizeObserver(measure);observer.observe(node);
    return ()=>observer.disconnect();
  },[asset?.url,failed]);
  useLayoutEffect(()=>{
    if(!view||!viewport.current)return;
    viewport.current.scrollLeft=view.left;viewport.current.scrollTop=view.top;
  },[view?.left,view?.top,view?.width,view?.height]);
  if(!(file instanceof Blob)||failed)return <p>Source image unavailable. Check the original document before confirming.</p>;
  if(asset?.file!==file)return <p role="status">Opening source image…</p>;
  function startDrag(event){
    if(event.pointerType!=='mouse'||event.button!==0)return;
    const node=viewport.current;node.focus({preventScroll:true});node.setPointerCapture(event.pointerId);
    drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:node.scrollLeft,top:node.scrollTop};event.preventDefault();
  }
  function moveDrag(event){
    const start=drag.current,node=viewport.current;if(!start||start.id!==event.pointerId)return;
    node.scrollLeft=start.left+start.x-event.clientX;node.scrollTop=start.top+start.y-event.clientY;
  }
  return <div className="owned-reader-focus">
    <div className="owned-reader-focus-tools" aria-label="Source zoom controls">
      <button type="button" aria-label="Zoom out" disabled={!view||view.zoom<=1.001} onClick={()=>setZoom(view.zoom/1.5)}>−</button>
      <output aria-label="Source zoom" aria-live="polite">{view?Math.round(view.zoom*100)+'%':'…'}</output>
      <button type="button" aria-label="Zoom in" disabled={!view||view.zoom>=view.maximum-.001} onClick={()=>setZoom(view.zoom*1.5)}>+</button>
      <button type="button" aria-label="Focus on field" disabled={!boxes.length} aria-pressed={!whole&&zoom===null} onClick={()=>{setWhole(false);setZoom(null);viewport.current?.scrollTo({left:view?.left||0,top:view?.top||0});}}>Focus</button>
      <button type="button" aria-label="Full image" aria-pressed={whole&&zoom===null} onClick={()=>{setWhole(true);setZoom(null);}}>Full</button>
    </div>
    <div ref={viewport} className="owned-reader-focus-window" style={image&&image.height/image.width<.25?{height:140}:undefined} tabIndex={0} role="region" aria-label="Document source image"
      onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
      <div className="owned-reader-source owned-reader-focus-image" style={view?{width:view.width,height:view.height}:{width:'100%'}}>
        <img key={asset.url} src={asset.url} draggable={false} alt={`Source image for page ${evidence.pageNumber}`}
          onLoad={event=>setImage({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})} onError={()=>setFailed(true)}/>
        {view?boxes.map((box,index)=><span key={index} aria-label={index?'Additional source line highlight':'Source line highlight'} className="owned-reader-highlight"
          style={{left:`${box.x*100}%`,top:`${box.y*100}%`,width:`${box.width*100}%`,height:`${box.height*100}%`}}/>):null}
      </div>
    </div>
    <p className="owned-reader-focus-hint">{boxes.length?'Check the highlighted text. Drag or scroll to inspect.':'Use + to enlarge the image and find the value.'}</p>
  </div>;
}

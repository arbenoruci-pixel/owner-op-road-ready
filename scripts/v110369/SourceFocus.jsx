'use client';
import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {reviewSourceBoxes,reviewViewport} from '../../../../packages/smart-reader-core/src/reviewViewport.js';

export default function SourceFocus({file,evidence,continuations=[]}){
  const [asset,setAsset]=useState(null),[image,setImage]=useState(null),[size,setSize]=useState(null),[failed,setFailed]=useState(false);
  const [whole,setWhole]=useState(false),[zoom,setZoom]=useState(null),[focusToken,setFocusToken]=useState(0);
  const viewport=useRef(null),pointers=useRef(new Map()),gesture=useRef(null),anchor=useRef(null),currentView=useRef(null);
  const boxes=reviewSourceBoxes(evidence,continuations);
  const view=reviewViewport({image,viewport:size,boxes,whole,zoom});currentView.current=view;
  useEffect(()=>{
    setImage(null);setFailed(false);setWhole(false);setZoom(null);
    pointers.current.clear();gesture.current=null;anchor.current=null;
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
    const node=viewport.current,a=anchor.current;anchor.current=null;
    node.scrollLeft=a?a.x*view.width-a.screenX:view.left;
    node.scrollTop=a?a.y*view.height-a.screenY:view.top;
  },[view?.left,view?.top,view?.width,view?.height,focusToken]);
  function pointAt(x,y){
    const node=viewport.current,v=currentView.current;
    const rect=node.getBoundingClientRect(),screenX=x-rect.left,screenY=y-rect.top;
    return {x:(node.scrollLeft+screenX-Math.max(0,(node.clientWidth-v.width)/2))/v.width,
      y:(node.scrollTop+screenY)/v.height,screenX,screenY};
  }
  function startGesture(){
    const points=[...pointers.current.values()],node=viewport.current,v=currentView.current;
    if(!points.length||!v){gesture.current=null;return;}
    if(points.length===1){gesture.current={type:'pan',...points[0],left:node.scrollLeft,top:node.scrollTop};return;}
    const [a,b]=points,center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    gesture.current={type:'pinch',zoom:v.zoom,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),anchor:pointAt(center.x,center.y)};
  }
  function down(event){
    if(!view||event.pointerType==='mouse'&&event.button!==0)return;
    event.preventDefault();try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* Pointer may have already ended. */}
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});startGesture();
  }
  function move(event){
    if(!pointers.current.has(event.pointerId)||!gesture.current)return;
    event.preventDefault();pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const node=viewport.current,g=gesture.current,v=currentView.current,points=[...pointers.current.values()];
    if(g.type==='pan'&&points.length===1){node.scrollLeft=g.left+g.x-event.clientX;node.scrollTop=g.top+g.y-event.clientY;return;}
    if(points.length<2)return;
    const [a,b]=points,rect=node.getBoundingClientRect();
    anchor.current={...g.anchor,screenX:(a.x+b.x)/2-rect.left,screenY:(a.y+b.y)/2-rect.top};
    const next=Math.max(1,Math.min(v.maximum,g.zoom*Math.hypot(a.x-b.x,a.y-b.y)/g.distance));
    if(Math.abs(next-v.zoom)<.0001){node.scrollLeft=g.anchor.x*v.width-anchor.current.screenX;node.scrollTop=g.anchor.y*v.height-anchor.current.screenY;anchor.current=null;}
    else setZoom(next);
  }
  function up(event){pointers.current.delete(event.pointerId);startGesture();}
  function zoomBy(factor,x,y){
    const node=viewport.current,v=currentView.current;if(!v)return;
    const rect=node.getBoundingClientRect();
    anchor.current=pointAt(x??rect.left+node.clientWidth/2,y??rect.top+node.clientHeight/2);
    setZoom(Math.max(1,Math.min(v.maximum,v.zoom*factor)));
  }
  function focus(full){anchor.current=null;setWhole(full);setZoom(null);setFocusToken(n=>n+1);}
  if(!(file instanceof Blob)||failed)return <p>Source image unavailable. Check the original document before confirming.</p>;
  if(asset?.file!==file)return <p role="status">Opening source image…</p>;
  return <div className="owned-reader-focus">
    <div className="owned-reader-focus-tools" aria-label="Source zoom controls">
      <button type="button" aria-label="Zoom out" disabled={!view||view.zoom<=1.001} onClick={()=>zoomBy(1/1.5)}>−</button>
      <output aria-label="Source zoom">{view?Math.round(view.zoom*100)+'%':'…'}</output>
      <button type="button" aria-label="Zoom in" disabled={!view||view.zoom>=view.maximum-.001} onClick={()=>zoomBy(1.5)}>+</button>
      <button type="button" aria-label="Focus on field" disabled={!boxes.length} aria-pressed={!whole&&zoom===null} onClick={()=>focus(false)}>Focus</button>
      <button type="button" aria-label="Full image" aria-pressed={whole&&zoom===null} onClick={()=>focus(true)}>Full page</button>
    </div>
    <div ref={viewport} className="owned-reader-focus-window" tabIndex={0} role="region" aria-label="Document source image"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
      onDoubleClick={event=>zoomBy(view?.zoom>2?1/view.zoom:2,event.clientX,event.clientY)}>
      <div className="owned-reader-source owned-reader-focus-image" style={view?{width:view.width,height:view.height}:{width:'100%'}}>
        <img key={asset.url} src={asset.url} draggable={false} alt={`Source image for page ${evidence.pageNumber}`}
          onLoad={event=>setImage({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})} onError={()=>setFailed(true)}/>
        {view?boxes.map((box,index)=><span key={index} aria-label={index?'Additional source line highlight':'Source line highlight'} className="owned-reader-highlight"
          style={{left:`${box.x*100}%`,top:`${box.y*100}%`,width:`${box.width*100}%`,height:`${box.height*100}%`}}/>):null}
      </div>
    </div>
    <p className="owned-reader-focus-hint">{boxes.length?'Check the highlight. Pinch to zoom; drag to move.':'Find the value on the page. Pinch to zoom; drag to move.'}</p>
  </div>;
}

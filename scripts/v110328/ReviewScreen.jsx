'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FULL_PAGE, validCorners } from '../scanIntakeV110328.js';
import { assessDocumentQuality } from './DocumentQualityV11036.js';
import { clampV3, orderCornersV3 } from './scannerTypesV3.js';

const DEFAULT_CORNERS = Object.freeze([
  { x:.08, y:.08 },
  { x:.92, y:.08 },
  { x:.92, y:.92 },
  { x:.08, y:.92 },
]);

const CORNER_LABELS = Object.freeze([
  'Top left',
  'Top right',
  'Bottom right',
  'Bottom left',
]);

function normalizedCorners(value) {
  const input = Array.isArray(value) && value.length >= 4 ? value : DEFAULT_CORNERS;
  return orderCornersV3(input).map(point => ({
    x:clampV3(point?.x),
    y:clampV3(point?.y),
  }));
}

function sessionCorners(session) {
  return normalizedCorners(session?.corners || session?.detection?.corners || DEFAULT_CORNERS);
}

function calculateFit(container, naturalWidth, naturalHeight) {
  if (!container || !naturalWidth || !naturalHeight) {
    return { x:0, y:0, width:0, height:0, frameWidth:0, frameHeight:0 };
  }
  const frameWidth = container.clientWidth;
  const frameHeight = container.clientHeight;
  const scale = Math.min(Math.max(1,frameWidth-40) / naturalWidth, Math.max(1,frameHeight-40) / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    x:(frameWidth - width) / 2,
    y:(frameHeight - height) / 2,
    width,
    height,
    frameWidth,
    frameHeight,
  };
}

function ToolButton({ label, primary = false, disabled = false, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        minHeight:48,
        padding:'0 8px',
        borderRadius:15,
        border:primary ? '1px solid #2563eb' : '1px solid #cbd5e1',
        background:primary ? '#2563eb' : '#fff',
        color:primary ? '#fff' : '#172033',
        fontWeight:950,
        fontSize:primary ? 15 : 13,
        lineHeight:1.1,
        opacity:disabled ? .55 : 1,
      }}
    >
      {label}
    </button>
  );
}

export default function ReviewScreenV3({
  session,
  onRotate,
  onRetake,
  onDone,
  processing = false,
  status = '',
  error = '',
}) {
  const containerRef = useRef(null);
  const activeCornerRef = useRef(null);
  const imageRef = useRef(null);
  const [corners, setCorners] = useState(() => sessionCorners(session));
  const [fit, setFit] = useState({ x:0, y:0, width:0, height:0, frameWidth:0, frameHeight:0 });
  const [activeCorner, setActiveCorner] = useState(null);
  const previewUrl = useMemo(() => URL.createObjectURL(session.reviewFile), [session.reviewFile]);

  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);
  useEffect(() => setCorners(sessionCorners(session)), [session.id, session.rotation, session.corners]);

  useEffect(() => {
    function update() {
      const image = imageRef.current;
      setFit(calculateFit(
        containerRef.current,
        image?.naturalWidth || session.workingImage.width,
        image?.naturalHeight || session.workingImage.height,
      ));
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (containerRef.current && observer) observer.observe(containerRef.current);
    window.addEventListener('resize', update);
    update();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [session]);

  useEffect(() => {
    if (activeCorner == null) return undefined;
    const stop = () => {activeCornerRef.current=null;setActiveCorner(null);};
    window.addEventListener('pointerup', stop, { once:true });
    window.addEventListener('pointercancel', stop, { once:true });
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [activeCorner]);

  function screenPoint(point) {
    return {
      x:fit.x + Number(point?.x || 0) * fit.width,
      y:fit.y + Number(point?.y || 0) * fit.height,
    };
  }

  function updateCorner(event) {
    const draggedCorner=activeCornerRef.current;
    if (draggedCorner == null || !fit.width || !fit.height || !containerRef.current) return;
    event.preventDefault();
    const bounds = containerRef.current.getBoundingClientRect();
    const point = {
      x:clampV3((event.clientX - bounds.left - fit.x) / fit.width),
      y:clampV3((event.clientY - bounds.top - fit.y) / fit.height),
    };
    setCorners(current => current.map((value, index) => index === draggedCorner ? point : value));
  }

  const screenCorners = corners.map(screenPoint);
  const polygon = screenCorners.map(point => `${point.x},${point.y}`).join(' ');
  const quality = useMemo(() => assessDocumentQuality(session.workingImage, {corners}), [session.workingImage, corners]);
  const viewWidth = Math.max(1, fit.frameWidth || fit.width + fit.x * 2);
  const viewHeight = Math.max(1, fit.frameHeight || fit.height + fit.y * 2);

  return (
    <section
      data-road-ready-scanner-review="four-corner-v10931"
      style={{
        position:'fixed',
        inset:0,
        zIndex:1400,
        background:'#0f172a',
        color:'#fff',
        display:'grid',
        gridTemplateRows:'auto 1fr auto',
      }}
      onPointerMove={updateCorner}
      onPointerUp={() => {activeCornerRef.current=null;setActiveCorner(null);}}
      onPointerCancel={() => {activeCornerRef.current=null;setActiveCorner(null);}}
    >
      <header
        style={{
          display:'grid',
          gridTemplateColumns:'44px 1fr 44px',
          alignItems:'center',
          padding:'calc(10px + env(safe-area-inset-top)) 12px 10px',
          borderBottom:'1px solid rgba(148,163,184,.25)',
          background:'rgba(15,23,42,.96)',
        }}
      >
        <button
          type="button"
          onClick={onRetake}
          aria-label="Back"
          disabled={processing}
          style={{
            width:42,
            height:42,
            borderRadius:999,
            border:'1px solid rgba(255,255,255,.2)',
            background:'rgba(30,41,59,.9)',
            color:'#fff',
            fontSize:24,
          }}
        >
          ‹
        </button>
        <div style={{ textAlign:'center' }}>
          <b style={{ display:'block', fontSize:16 }}>Crop & rotate</b>
          <em
            style={{
              display:'block',
              marginTop:2,
              color:'#cbd5e1',
              fontSize:11,
              fontStyle:'normal',
            }}
          >
            {quality.issues[0] || 'Drag the corners. Keep all text inside the frame.'}
          </em>
        </div>
        <span />
      </header>

      <div
        ref={containerRef}
        style={{
          position:'relative',
          minHeight:0,
          overflow:'hidden',
          touchAction:'none',
          background:'#020617',
        }}
      >
        <img
          ref={imageRef}
          src={previewUrl}
          alt="Document review"
          onLoad={() => setFit(calculateFit(
            containerRef.current,
            imageRef.current?.naturalWidth,
            imageRef.current?.naturalHeight,
          ))}
          style={{
            width:'100%',
            height:'100%',
            objectFit:'contain',
            boxSizing:'border-box',
            padding:20,
            display:'block',
            userSelect:'none',
          }}
          draggable={false}
        />

        {fit.width ? (
          <svg
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            preserveAspectRatio="none"
            style={{
              position:'absolute',
              inset:0,
              width:'100%',
              height:'100%',
              overflow:'visible',
            }}
          >
            <polygon
              points={polygon}
              fill="rgba(45,212,191,.06)"
              stroke="#5eead4"
              strokeWidth="1.15"
              vectorEffect="non-scaling-stroke"
            />
            {screenCorners.map((point, index) => (
              <g
                key={CORNER_LABELS[index]}
                onPointerDown={event => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                  activeCornerRef.current=index;setActiveCorner(index);
                }}
                style={{ cursor:'grab' }}
                aria-label={CORNER_LABELS[index]}
                role="button"
                tabIndex={processing ? -1 : 0}
                onKeyDown={event=>{
                  const changes={ArrowLeft:[-.005,0],ArrowRight:[.005,0],ArrowUp:[0,-.005],ArrowDown:[0,.005]},delta=changes[event.key];
                  if(!delta||processing)return;event.preventDefault();
                  setCorners(current=>current.map((point,i)=>i===index?{x:clampV3(point.x+delta[0]),y:clampV3(point.y+delta[1])}:point));
                }}
              >
                <circle cx={point.x} cy={point.y} r="26" fill="transparent" />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="11"
                  fill="rgba(15,23,42,.62)"
                  stroke="rgba(255,255,255,.82)"
                  strokeWidth=".9"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="7"
                  fill="#14b8a6"
                  stroke="#fff"
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
          </svg>
        ) : null}

        {activeCorner!=null&&fit.width>0&&<div aria-hidden="true" style={{position:'absolute',top:12,right:12,width:116,height:116,borderRadius:18,border:'2px solid #5eead4',boxShadow:'0 8px 30px #0008',backgroundColor:'#0f172a',backgroundImage:`url(${previewUrl})`,backgroundRepeat:'no-repeat',backgroundSize:`${fit.width*3}px ${fit.height*3}px`,backgroundPosition:`${58-corners[activeCorner].x*fit.width*3}px ${58-corners[activeCorner].y*fit.height*3}px`,pointerEvents:'none'}}><span style={{position:'absolute',left:52,top:52,width:12,height:12,border:'2px solid #14b8a6',borderRadius:10}}/></div>}
        {processing ? (
          <div
            style={{
              position:'absolute',
              inset:0,
              display:'grid',
              placeItems:'center',
              background:'rgba(2,6,23,.72)',
              backdropFilter:'blur(4px)',
            }}
          >
            <div
              style={{
                width:'min(330px,86vw)',
                padding:18,
                borderRadius:20,
                background:'#fff',
                color:'#172033',
                textAlign:'center',
                boxShadow:'0 24px 80px rgba(0,0,0,.35)',
              }}
            >
              <b style={{ display:'block', fontSize:16 }}>Preparing your page</b>
              <p style={{ margin:'8px 0 0', color:'#475569', lineHeight:1.4 }}>
                {status || 'Straightening the paper and improving readability…'}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <footer
        style={{
          padding:'12px 12px calc(14px + env(safe-area-inset-bottom))',
          display:'grid',
          gridTemplateColumns:'repeat(3,minmax(0,1fr))',
          gap:8,
          background:'#f8fafc',
          borderTop:'1px solid #cbd5e1',
        }}
      >
        <ToolButton
          label="Auto edges"
          disabled={processing}
          onClick={() => setCorners(sessionCorners({
            ...session,
            corners:session.detection?.corners || session.corners,
          }))}
        />
        <ToolButton label="Rotate" disabled={processing} onClick={onRotate} />
        <ToolButton label="Full page" disabled={processing} onClick={()=>setCorners(FULL_PAGE.map(point=>({...point})))} />
        {error&&<p role="alert" style={{gridColumn:"1 / -1",color:"#a3311d",margin:0,fontSize:13}}>{error}</p>}
        {!validCorners(corners)&&<p role="alert" style={{gridColumn:"1 / -1",color:"#a3311d",margin:0,fontSize:13}}>Keep the four corners around the paper without crossing. Use Full page to reset.</p>}
        <div style={{gridColumn:"1 / -1",display:"grid",gridTemplateColumns:"1fr 2fr",gap:8}}><ToolButton label="Cancel" disabled={processing} onClick={onRetake}/>
        <ToolButton
          label="Use page"
          primary
          disabled={processing || !validCorners(corners)}
          onClick={() => onDone?.(corners)}
        /></div>
      </footer>
    </section>
  );
}

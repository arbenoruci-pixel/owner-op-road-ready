import React, { useRef, useEffect } from 'react';
import { GRAPH as G, TRACE_COLORS, graphX, graphY, traceGeometry } from './graphGeometryV110.js';
import { timeLabel, durLabel } from '../../shared/utils/time.js';
const STATUSES = ['OFF','SB','D','ON'];
export default function LogGraph({ events=[],selectedId,onSelect,onEmptyTap,editId,onEditTime,violationRanges=[],className='',editorBoundaries=false }) {
  const svg = useRef(null), dragCleanup = useRef(null);
  useEffect(() => () => dragCleanup.current?.(),[]);
  const {segments,discontinuities,chains} = traceGeometry(events);
  const selected = segments.find(s => s.event.id === (editId || selectedId));
  const editable = selected && onEditTime;
  const height = editable ? 355 : 305;
  const minute = e => {
    const r=svg.current.getBoundingClientRect();
    return Math.max(0,Math.min(1440,Math.round((((e.clientX-r.left)/r.width)*G.width-G.left)/(G.width-G.left-G.right)*1440)));
  };
  function drag(e,edge) {
    e.preventDefault();e.stopPropagation();dragCleanup.current?.();
    const startX=e.clientX, initial=selected.event[edge+'Min'], rect=svg.current.getBoundingClientRect();
    const move = p => onEditTime?.(edge,Math.max(0,Math.min(1440,Math.round(initial+(p.clientX-startX)/rect.width*G.width/(G.width-G.left-G.right)*1440))));
    const stop = () => { window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);dragCleanup.current=null; };
    dragCleanup.current=stop;window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);
  }
  return <svg ref={svg} className={`log-graph log-graph-v110 ${className}`} viewBox={`0 0 ${G.width} ${height}`} aria-label="Duty status timeline in home-terminal time">
    <rect width={G.width} height={height} fill="#fff" />
    {STATUSES.map((status,i) => <g key={status}>
      <text x="40" y={graphY(status)+5} textAnchor="end" fill="#475569" fontSize="22">{status}</text>
      <line x1={G.left} x2={G.width-G.right} y1={G.top+i*G.row} y2={G.top+i*G.row} stroke="#dce3eb" strokeWidth="1" />
      <rect x={G.left} y={G.top+i*G.row} width={G.width-G.left-G.right} height={G.row} fill="transparent" onClick={e=>onEmptyTap?.(status,Math.min(1439,minute(e)))} />
      <text x={G.width-5} y={graphY(status)+5} textAnchor="end" fill="#475569" fontSize="20">{(segments.filter(s=>s.event.status===status).reduce((n,s)=>n+s.event.endMin-s.event.startMin,0)/60).toFixed(2)}</text>
    </g>)}
    {Array.from({length:97},(_,q)=><line key={q} x1={graphX(q*15)} x2={graphX(q*15)} y1={G.top} y2={G.top+4*G.row} stroke={q%4===0?'#d9e1eb':'#edf1f6'} strokeWidth={q%4===0?0.9:0.5} pointerEvents="none" />)}
    {Array.from({length:25},(_,h)=><text key={h} x={graphX(h*60)} y="18" textAnchor="middle" fill="#475569" fontSize="20">{h===0||h===24?'M':h===12?'N':h>12?h-12:h}</text>)}
    {discontinuities.map((d,i)=><g key={i} className="graph-discontinuity" data-kind={d.type} data-start={d.start} data-end={d.end} pointerEvents="none">
      <title>{d.type}: {timeLabel(d.start,true)} – {timeLabel(d.end,true)} ({durLabel(d.end-d.start)})</title>
      <rect x={graphX(d.start)} y={G.top} width={graphX(d.end)-graphX(d.start)} height={4*G.row} fill={d.type==='Gap'?'#fff2ce':'#fee2e2'} opacity="0.65" />
      <text x={Math.min(G.width-G.right-25,Math.max(G.left+25,graphX(d.start)))} y="298" textAnchor="middle" fill="#92400e" fontSize="13">{d.type}</text>
    </g>)}
    {selected && <rect className="graph-selected-band" x={selected.x1} y={G.top} width={Math.max(0,selected.x2-selected.x1)} height={4*G.row} fill={TRACE_COLORS[selected.event.status]} opacity="0.09" pointerEvents="none" />}
    {editorBoundaries && selected && ['start','end'].map(edge=><line key={edge} data-editor-boundary={edge} x1={edge==='start'?selected.x1:selected.x2} x2={edge==='start'?selected.x1:selected.x2} y1={G.top} y2={G.top+4*G.row} stroke="#53657b" strokeWidth="1.5" strokeDasharray="4 3" pointerEvents="none" />)}
    {violationRanges.map((r,i)=>r.startMin!=null&&r.endMin>r.startMin&&STATUSES.includes(r.status)?<rect key={i} x={graphX(r.startMin)} y={graphY(r.status)-9} width={graphX(r.endMin)-graphX(r.startMin)} height="18" fill={r.severity==='high'?'#fee2e2':'#fef3c7'} pointerEvents="none" />:null)}
    {chains.map((path,i)=><path key={`join-${i}`} className="duty-junction-v110" d={path} fill="none" stroke="#687789" strokeWidth={G.stroke} strokeLinecap="butt" strokeLinejoin="miter" pointerEvents="none" />)}
    {segments.map(s=><path key={s.event.id} className="duty-trace-v110" data-event-id={s.event.id} data-adjacent={s.adjacent} d={s.path} fill="none" stroke={TRACE_COLORS[s.event.status]} strokeWidth={G.stroke} strokeLinecap="butt" strokeLinejoin="miter" pointerEvents="none" />)}
    {violationRanges.filter(r=>r.severity==='high').flatMap((r,i)=>segments.filter(s=>s.event.status===r.status).map(s=>{
      const start=Math.max(r.startMin,s.event.startMin),end=Math.min(r.endMin,s.event.endMin);
      return end>start?<line key={`${i}-${s.event.id}`} className="graph-violation-trace" x1={graphX(start)} x2={graphX(end)} y1={s.y} y2={s.y} stroke="#b91c1c" strokeWidth={G.stroke} strokeLinecap="butt" pointerEvents="none"><title>{r.type || 'HOS warning'}</title></line>:null;
    }))}
    {segments.map(s=><line key={`${s.event.id}-hit`} data-hit-event={s.event.id} x1={Math.max(G.left,Math.min(s.x1,(s.x1+s.x2)/2-12))} x2={Math.min(G.width-G.right,Math.max(s.x2,(s.x1+s.x2)/2+12))} y1={s.y} y2={s.y} stroke="transparent" strokeWidth="36" onClick={e=>{e.stopPropagation();onSelect?.(s.event.id);}}><title>{s.event.status} · {timeLabel(s.event.startMin,true)} – {s.event.isLive?'Now':timeLabel(s.event.endMin,true)}</title></line>)}
    {editable && ['start','end'].map((edge,i)=>{
      const x=edge==='start'?selected.x1:selected.x2;
      return <g key={edge} className="graph-handle-v110" role="slider" tabIndex="0" aria-label={`${edge} time handle`} aria-valuemin={0} aria-valuemax={1440} aria-valuenow={selected.event[edge+'Min']} onPointerDown={e=>drag(e,edge)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();onEditTime(edge,selected.event[edge+'Min']+(e.key==='ArrowLeft'?-1:1));}}} style={{touchAction:'none',cursor:'ew-resize'}}>
        <rect x={x-14} y={selected.y-20} width="28" height="40" fill="transparent" />
        <line x1={x} x2={x} y1={selected.y-9} y2={selected.y+9} stroke={TRACE_COLORS[selected.event.status]} strokeWidth="3" />
        <rect x={i===0?G.left:G.width-G.right-156} y="315" width="156" height="32" rx="8" fill="#eef3f8" />
        <text x={i===0?G.left+78:G.width-G.right-78} y="336" textAnchor="middle" fill="#334155" fontSize="20">{edge.toUpperCase()} {timeLabel(selected.event[edge+'Min'])}</text>
      </g>;
    })}
  </svg>;
}

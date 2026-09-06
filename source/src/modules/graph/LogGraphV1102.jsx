import React, { useEffect, useRef } from 'react';
import { STATUS_ORDER, rowIndex } from '../../shared/utils/status.js';
import { timeLabel, durLabel } from '../../shared/utils/time.js';
import { steppedSegments, timelineRelations } from '../../shared/utils/logbookEditorTimeV1102.js';

const W=1000, LEFT=48, RIGHT=56, TOP=26, ROW=66, BODY=W-LEFT-RIGHT, LINE=6;
const COLORS={OFF:'#667085',SB:'#758195',D:'#087f72',ON:'#2863bd'};
const x=m=>LEFT+Math.max(0,Math.min(1440,Number(m)))/1440*BODY;
const y=s=>TOP+rowIndex(s)*ROW+ROW/2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export default function LogGraph({events=[],selectedId,onSelect,onEmptyTap,editId,onEditTime,violationRanges=[],className=''}) {
  const svg=useRef(null),cleanup=useRef(()=>{});
  useEffect(()=>()=>cleanup.current(),[]);
  const segments=steppedSegments(events,x,y), selected=segments.find(s=>s.event.id===(editId||selectedId))?.event;
  const editable=selected && onEditTime && !selected.uiLive, height=editable?404:316;
  const relations=timelineRelations(events);
  function minuteAt(clientX) { const r=svg.current.getBoundingClientRect();return clamp(Math.round((((clientX-r.left)/r.width)*W-LEFT)/BODY*1440),0,1440); }
  function drag(e,edge) {
    e.preventDefault();e.stopPropagation();cleanup.current();
    const move=ev=>{ev.preventDefault();onEditTime?.(edge,clamp(minuteAt(ev.clientX),edge==='end'?1:0,edge==='start'?1439:1440));};
    const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);};
    cleanup.current=stop;window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);
  }
  let startX=selected?x(selected.startMin):0,endX=selected?x(selected.endMin):0;
  let startChip=clamp(startX,LEFT+62,W-RIGHT-62),endChip=clamp(endX,LEFT+62,W-RIGHT-62);
  if(endChip-startChip<132){const mid=clamp((startChip+endChip)/2,LEFT+128,W-RIGHT-128);startChip=mid-66;endChip=mid+66;}
  return <svg ref={svg} className={`log-graph logbook-graph-v1102 ${className}`} viewBox={`0 0 ${W} ${height}`} role="group" aria-label="Duty timeline in home terminal time">
    <rect width={W} height={height} fill="#fff"/>
    {STATUS_ORDER.map((status,i)=><g key={status}>
      <text x={LEFT-10} y={y(status)+5} textAnchor="end" fill="#344054" fontSize="17" fontWeight="700">{status}</text>
      <line x1={LEFT} x2={W-RIGHT} y1={TOP+i*ROW} y2={TOP+i*ROW} stroke="#dfe5eb" strokeWidth="1"/>
      <rect x={LEFT} y={TOP+i*ROW} width={BODY} height={ROW} fill="transparent" onClick={e=>onEmptyTap?.(status,Math.min(1439,minuteAt(e.clientX)))}/>
      <text x={W-3} y={y(status)+5} textAnchor="end" fill="#344054" fontSize="16">{(events.filter(e=>e.status===status).reduce((n,e)=>n+Math.max(0,e.endMin-e.startMin),0)/60).toFixed(2)}</text>
    </g>)}
    <line x1={LEFT} x2={W-RIGHT} y1={TOP+4*ROW} y2={TOP+4*ROW} stroke="#dfe5eb"/>
    {Array.from({length:97},(_,q)=><line key={q} x1={x(q*15)} x2={x(q*15)} y1={TOP} y2={TOP+4*ROW} stroke={q%4?'#eef1f5':'#d6dfe8'} strokeWidth={q%4?0.45:0.8} pointerEvents="none"/>)}
    {Array.from({length:25},(_,h)=><text key={h} x={x(h*60)} y="17" textAnchor="middle" fill="#475467" fontSize="16">{h===0||h===24?'M':h===12?'N':h>12?h-12:h}</text>)}
    {relations.map((r,i)=><g key={i} data-relation={r.type} pointerEvents="none"><title>{r.type}: {timeLabel(r.startMin,true)} – {timeLabel(r.endMin,true)}</title><rect x={x(r.startMin)} y={TOP} width={Math.max(0,x(r.endMin)-x(r.startMin))} height={ROW*4} fill={r.type==='gap'?'#b45309':'#b42318'} opacity=".09"/><path d={`M ${x(r.startMin)} ${TOP+4*ROW+8} H ${x(r.endMin)}`} stroke={r.type==='gap'?'#b45309':'#b42318'} strokeWidth="2"/></g>)}
    {selected&&<rect data-selected-event={selected.id} x={x(selected.startMin)} y={y(selected.status)-ROW/2+3} width={Math.max(0,x(selected.endMin)-x(selected.startMin))} height={ROW-6} fill={COLORS[selected.status]} opacity=".12" pointerEvents="none"/>}
    {violationRanges.filter(r=>r && r.endMin>r.startMin && r.status).map((r,i)=><rect key={'warning-'+i} className="graph-violation-underlay" x={x(r.startMin)} y={y(r.status)-12} width={Math.max(0,x(r.endMin)-x(r.startMin))} height="24" fill={r.severity==='high'?'#b42318':'#b45309'} opacity=".12" pointerEvents="none"><title>{r.text || r.message || r.type}</title></rect>)}
    {segments.map(({event,d,joinBefore,joinAfter})=><path key={event.id} data-event-trace={event.id} data-join-before={joinBefore} data-join-after={joinAfter} d={d} fill="none" stroke={COLORS[event.status]||COLORS.OFF} strokeWidth={LINE} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit="2" pointerEvents="none"/>)}
    {violationRanges.filter(r=>r.severity==='high').flatMap((r,i)=>segments.filter(({event:e})=>e.status===r.status && e.endMin>r.startMin && e.startMin<r.endMin).map(({event:e})=><line key={`${i}-${e.id}`} className="graph-violation-trace" x1={x(Math.max(e.startMin,r.startMin))} x2={x(Math.min(e.endMin,r.endMin))} y1={y(e.status)} y2={y(e.status)} stroke="#b42318" strokeWidth={LINE} strokeLinecap="butt" pointerEvents="none"/>))}
    {segments.map(({event:e})=>{const mid=(x(e.startMin)+x(e.endMin))/2,width=Math.max(24,x(e.endMin)-x(e.startMin));return <rect key={e.id} data-event-hit={e.id} x={clamp(mid-width/2,LEFT,W-RIGHT-width)} y={y(e.status)-22} width={width} height="44" fill="transparent" role="button" tabIndex={onSelect?0:undefined} aria-label={`${e.status}, ${timeLabel(e.startMin,true)} to ${e.uiLive?'Now':timeLabel(e.endMin,true)}, ${durLabel(e.endMin-e.startMin)}`} onClick={ev=>{ev.stopPropagation();onSelect?.(e.id);}} onKeyDown={ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();onSelect?.(e.id);}}}/>;})}
    {editable&&[['start',startX,startChip],['end',endX,endChip]].map(([edge,actual,chip])=><g key={edge} className="graph-handle-v1102" role="slider" tabIndex="0" aria-label={`${edge==='start'?'Start':'End'} time handle`} aria-valuemin={edge==='start'?0:1} aria-valuemax={edge==='start'?1439:1440} aria-valuenow={selected[edge+'Min']} aria-valuetext={timeLabel(selected[edge+'Min'],true)} onPointerDown={e=>drag(e,edge)} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();onEditTime(edge,clamp(selected[edge+'Min']+(e.key==='ArrowLeft'?-1:1),edge==='start'?0:1,edge==='start'?1439:1440));}}}>
      <circle cx={actual} cy={y(selected.status)} r="7" fill={COLORS[selected.status]}/>
      <rect x={chip-60} y="298" width="120" height="102" fill="transparent"/>
      <rect x={chip-54} y="324" width="108" height="48" rx="9" fill="#eaf2f6" stroke="#cad7e1"/>
      <text x={chip} y="355" textAnchor="middle" fill="#17384c" fontSize="22" fontWeight="700">{edge.toUpperCase()}</text>
    </g>)}
  </svg>;
}

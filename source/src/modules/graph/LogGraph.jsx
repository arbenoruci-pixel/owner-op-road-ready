import React, { useRef } from 'react';
import { clamp, round5 } from '../../shared/utils/time.js';
import { STATUS_ORDER, rowIndex, color, soft } from '../../shared/utils/status.js';

const W = 1000;
const EDIT_H = 540;
const BASE_H = 420;
const LEFT = 48;
const RIGHT = 48;
const TOP = 18;
const ROW_H = 96;
const BODY_W = W - LEFT - RIGHT;
const SHORT_EVENT_MARKER_PX = 12;
const HIT_MIN_PX = 24;
const CENTER = (status) => TOP + rowIndex(status) * ROW_H + ROW_H / 2;

function xFromMin(m) {
  return LEFT + (Math.max(0, Math.min(1440, m)) / 1440) * BODY_W;
}
function exactSpan(event) {
  const x1 = xFromMin(event.startMin);
  const x2 = xFromMin(event.endMin);
  return {
    x1,
    x2,
    width: Math.max(0, x2 - x1),
    short: Math.max(0, x2 - x1) < SHORT_EVENT_MARKER_PX,
  };
}

function hitSpan(event) {
  const span = exactSpan(event);
  if (span.width >= HIT_MIN_PX) return span;
  const mid = (span.x1 + span.x2) / 2;
  const half = HIT_MIN_PX / 2;
  return {
    ...span,
    hitX1: Math.max(LEFT, mid - half),
    hitX2: Math.min(W - RIGHT, mid + half),
  };
}
function minFromClientX(e, svg) {
  const rect = svg.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * W;
  return clamp(round5(((x - LEFT) / BODY_W) * 1440), 0, 1439);
}
function transitions(events) {
  const inputSorted = [...events].sort((a,b)=>a.startMin-b.startMin);
  const sorted = inputSorted.length && Number(inputSorted[0].startMin || 0) > 0
    ? [{ ...inputSorted[0], startMin: 0 }, ...inputSorted.slice(1)]
    : inputSorted;
  const out = [];
  for (let i=0;i<sorted.length-1;i++) {
    const a = sorted[i], b = sorted[i+1];
    if (a.status !== b.status) {
      out.push({ from:a, to:b, minute:b.startMin });
    }
  }
  return out;
}

function rangeColor(r) {
  if (r.severity === 'medium' || r.type === 'split7watch') return '#F59E0B';
  return '#DC2626';
}

function continuousPath(events = []) {
  const sorted = [...events].sort((a,b)=>a.startMin-b.startMin).filter(e => Number(e.endMin || 0) > Number(e.startMin || 0));
  if (!sorted.length) return '';
  let d = `M ${xFromMin(sorted[0].startMin)} ${CENTER(sorted[0].status)} H ${xFromMin(sorted[0].endMin)}`;
  for (let i = 1; i < sorted.length; i += 1) {
    const e = sorted[i];
    d += ` V ${CENTER(e.status)} H ${xFromMin(e.endMin)}`;
  }
  return d;
}

export default function LogGraph({ events, selectedId, onSelect, onEmptyTap, editId, onEditTime, violationRanges = [], className = '' }) {
  const svgRef = useRef(null);
  const inputSorted = [...events].sort((a,b)=>a.startMin-b.startMin);
  const sorted = inputSorted.length && Number(inputSorted[0].startMin || 0) > 0
    ? [{ ...inputSorted[0], startMin: 0 }, ...inputSorted.slice(1)]
    : inputSorted;
  const editable = editId ? sorted.find(e => e.id === editId) : null;
  const graphHeight = editable && onEditTime ? EDIT_H : BASE_H;
  const bodyPath = continuousPath(sorted);

  function startHandleDrag(e, edge, event) {
    if (!onEditTime) return;
    e.preventDefault();
    e.stopPropagation();
    const svg = svgRef.current;
    function move(ev) {
      const clientX = ev.clientX ?? ev.touches?.[0]?.clientX;
      if (clientX == null) return;
      const m = minFromClientX({ clientX }, svg);
      onEditTime(edge, m);
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('touchmove', move, { passive:false });
    window.addEventListener('touchend', up);
  }

  return (
    <svg ref={svgRef} className={`log-graph ${className}`} viewBox={`0 0 ${W} ${graphHeight}`}>
      <rect x="0" y="0" width={W} height={graphHeight} fill="#fcfdfb" />
      {STATUS_ORDER.map((s,i) => (
        <g key={s}>
          <rect x="0" y={TOP+i*ROW_H} width={LEFT} height={ROW_H} fill="#fcfdfb" stroke="#e4e9e3" strokeWidth="0.8" />
          <text x={LEFT-12} y={CENTER(s)+5} textAnchor="end" className="row-label">{s}</text>
          <line x1={LEFT} x2={W-RIGHT} y1={TOP+i*ROW_H} y2={TOP+i*ROW_H} stroke="#e4e9e3" strokeWidth="0.8" />
          <rect
            x={LEFT}
            y={TOP+i*ROW_H}
            width={BODY_W}
            height={ROW_H}
            fill="transparent"
            onClick={(e) => {
              if (!onEmptyTap) return;
              const m = minFromClientX(e, svgRef.current);
              onEmptyTap(s, m);
            }}
          />
        </g>
      ))}
      <line x1={LEFT} x2={W-RIGHT} y1={TOP+4*ROW_H} y2={TOP+4*ROW_H} stroke="#e4e9e3" strokeWidth="0.8" />
      {Array.from({ length: 97 }).map((_,q) => {
        const x = LEFT + (q/96)*BODY_W;
        const major = q % 4 === 0;
        return <line key={q} x1={x} x2={x} y1={TOP} y2={TOP+4*ROW_H} stroke={major ? '#d2dbd3' : '#ecf0eb'} strokeWidth={major ? 1 : 0.5} />;
      })}
      {Array.from({ length: 25 }).map((_,h) => {
        const x = LEFT + (h/24)*BODY_W;
        const label = h === 0 ? 'M' : h === 12 ? 'N' : h === 24 ? 'M' : String(h > 12 ? h-12 : h);
        return <text key={h} x={x} y={12} textAnchor="middle" className="axis-label">{label}</text>;
      })}
      {STATUS_ORDER.map(s => {
        const mins = sorted.filter(e=>e.status===s).reduce((a,e)=>a+(e.endMin-e.startMin),0);
        return <text key={s} x={W-5} y={CENTER(s)+5} textAnchor="end" className="total-label">{(mins/60).toFixed(2).padStart(5,'0')}</text>;
      })}

      {/* Horizontal status segments and transition joints are rendered separately so each event ends exactly at the next event boundary. */}

      {sorted.map(event => {
        const selected = selectedId === event.id || editId === event.id;
        const y = CENTER(event.status);
        const span = hitSpan(event);
        return (
          <g key={event.id}>
            {selected && <rect x={span.x1} y={TOP+rowIndex(event.status)*ROW_H+3} width={Math.max(3, span.width)} height={ROW_H-6} rx="8" fill={soft(event.status)} />}
            <line
              x1={span.hitX1 ?? span.x1}
              x2={span.hitX2 ?? span.x2}
              y1={y}
              y2={y}
              stroke="transparent"
              strokeWidth="32"
              strokeLinecap="butt"
              onClick={(e)=>{e.stopPropagation(); onSelect?.(event.id);}}
            />
            {selected && (
              <line
                x1={span.x1}
                x2={span.x2}
                y1={y}
                y2={y}
                stroke="#111827"
                strokeWidth="20"
                strokeLinecap="butt"
                opacity=".14"
                pointerEvents="none"
              />
            )}
            <line
              x1={span.x1}
              x2={span.x2}
              y1={y}
              y2={y}
              stroke={color(event.status)}
              strokeWidth={selected ? 12.6 : 8.1}
              strokeLinecap="butt"
              pointerEvents="none"
            />
            {span.short && (
              <g className="short-event-marker" pointerEvents="none">
                <circle cx={(span.x1 + span.x2) / 2} cy={y} r={selected ? 7 : 5} fill={color(event.status)} stroke="#fff" strokeWidth="2" />
                <line x1={(span.x1 + span.x2) / 2} x2={(span.x1 + span.x2) / 2} y1={y-15} y2={y+15} stroke={color(event.status)} strokeWidth="2.7" strokeLinecap="round" opacity=".92" />
              </g>
            )}
            {selected && (
              <>
                <circle cx={xFromMin(event.startMin)} cy={y} r="13" fill="#fff" stroke={color(event.status)} strokeWidth="4.5" pointerEvents="none" />
                <circle cx={xFromMin(event.endMin)} cy={y} r="13" fill="#fff" stroke={color(event.status)} strokeWidth="4.5" pointerEvents="none" />
              </>
            )}
          </g>
        );
      })}

      {/* Exact violation overlays: red/orange starts at the exact minute the rule is crossed. */}
      {violationRanges.map((r, i) => {
        const y = CENTER(r.status);
        const x1 = xFromMin(r.startMin);
        const x2 = xFromMin(r.endMin);
        const c = rangeColor(r);
        return (
          <g key={`${r.id || i}_${r.startMin}_${r.endMin}`} className="graph-violation">
            <line x1={x1} x2={x2} y1={y} y2={y} stroke={c} strokeWidth="12" strokeLinecap="round" opacity=".96" />
            <line x1={x1} x2={x1} y1={TOP} y2={TOP+4*ROW_H} stroke={c} strokeWidth="5" strokeDasharray="5 4" opacity=".9" />
            <circle cx={x1} cy={y} r="13" fill={c} stroke="#fff" strokeWidth="4" />
            <text x={x1} y={y+4} textAnchor="middle" className="violation-bang">!</text>
          </g>
        );
      })}

      {transitions(sorted).map((t,i) => {
        const x = xFromMin(t.minute);
        const y1 = CENTER(t.from.status);
        const y2 = CENTER(t.to.status);
        const selected = selectedId === t.to.id || selectedId === t.from.id || editId === t.to.id || editId === t.from.id;
        const strokeW = selected ? 5.4 : 3.6;
        const cornerR = strokeW / 2;
        return (
          <g key={i} className="smooth-transition">
            {selected && <rect x={x-14} y={Math.min(y1,y2)-11} width="28" height={Math.abs(y2-y1)+22} rx="14" fill="rgba(95,99,104,.13)" />}
            <line x1={x} x2={x} y1={y1} y2={y2} stroke="transparent" strokeWidth="36" strokeLinecap="butt" onClick={(e)=>{e.stopPropagation(); onSelect?.(t.to.id);}} />
            <line
              x1={x}
              x2={x}
              y1={y1}
              y2={y2}
              stroke="#223047"
              strokeWidth={strokeW}
              strokeLinecap="butt"
              strokeLinejoin="miter"
              pointerEvents="none"
            />
            <circle cx={x} cy={y1} r="3.2" fill="#223047" pointerEvents="none" />
            <circle cx={x} cy={y2} r="3.2" fill="#223047" pointerEvents="none" />

          </g>
        );
      })}

      {editable && onEditTime && (() => {
        const sx = xFromMin(editable.startMin);
        const ex = xFromMin(editable.endMin);
        const y = CENTER(editable.status);
        const c = color(editable.status);
        const tooClose = Math.abs(ex - sx) < 110;
        const graphBottom = TOP + 4 * ROW_H;
        // Keep grabber chips below the graph so they never hide the duty-status line.
        const chipY = graphBottom + 28;
        const chipW = 118;
        const chipH = 58;
        const chipCY = chipY + chipH / 2;
        const chipPadX = chipW / 2 + 6;
        const chipMinX = LEFT + chipPadX;
        const chipMaxX = W - RIGHT - chipPadX;
        const startHandleX = Math.max(chipMinX, Math.min(chipMaxX, tooClose ? sx - 62 : sx));
        const endHandleX = Math.max(chipMinX, Math.min(chipMaxX, tooClose ? ex + 62 : ex));

        return (
          <g className="edit-handles-large">
            <rect x={Math.min(sx, ex)} y={TOP} width={Math.max(4, Math.abs(ex - sx))} height={graphBottom - TOP} fill={c} opacity=".09" pointerEvents="none" />
            <line x1={sx} x2={sx} y1={TOP} y2={graphBottom} stroke={c} strokeWidth="6" strokeLinecap="round" opacity=".9" pointerEvents="none" />
            <line x1={ex} x2={ex} y1={TOP} y2={graphBottom} stroke={c} strokeWidth="6" strokeLinecap="round" opacity=".9" pointerEvents="none" />

            <line x1={startHandleX} x2={sx} y1={chipCY} y2={y} stroke="#111827" strokeWidth="10" strokeLinecap="round" opacity=".86" pointerEvents="none" />
            <line x1={endHandleX} x2={ex} y1={chipCY} y2={y} stroke="#111827" strokeWidth="10" strokeLinecap="round" opacity=".86" pointerEvents="none" />

            <circle cx={sx} cy={y} r="34" fill={c} opacity=".16" pointerEvents="none" />
            <circle cx={ex} cy={y} r="34" fill={c} opacity=".16" pointerEvents="none" />
            <circle cx={sx} cy={y} r="20" fill="#fff" stroke={c} strokeWidth="6" pointerEvents="none" />
            <circle cx={ex} cy={y} r="20" fill="#fff" stroke={c} strokeWidth="6" pointerEvents="none" />
            <circle cx={sx} cy={y} r="9" fill={c} pointerEvents="none" />
            <circle cx={ex} cy={y} r="9" fill={c} pointerEvents="none" />

            <circle cx={sx} cy={y} r="74" fill="transparent" onPointerDown={(e)=>startHandleDrag(e,'start',editable)} onTouchStart={(e)=>startHandleDrag(e,'start',editable)} />
            <circle cx={ex} cy={y} r="74" fill="transparent" onPointerDown={(e)=>startHandleDrag(e,'end',editable)} onTouchStart={(e)=>startHandleDrag(e,'end',editable)} />

            <rect x={startHandleX-chipW/2-16} y={chipY-16} width={chipW+32} height={chipH+32} rx="26" fill="transparent" onPointerDown={(e)=>startHandleDrag(e,'start',editable)} onTouchStart={(e)=>startHandleDrag(e,'start',editable)} />
            <rect x={endHandleX-chipW/2-16} y={chipY-16} width={chipW+32} height={chipH+32} rx="26" fill="transparent" onPointerDown={(e)=>startHandleDrag(e,'end',editable)} onTouchStart={(e)=>startHandleDrag(e,'end',editable)} />

            <rect x={startHandleX-chipW/2} y={chipY} width={chipW} height={chipH} rx="20" fill="#111827" stroke="#fff" strokeWidth="5" onPointerDown={(e)=>startHandleDrag(e,'start',editable)} onTouchStart={(e)=>startHandleDrag(e,'start',editable)} />
            <text x={startHandleX} y={chipY+37} textAnchor="middle" className="handle-grip">START</text>

            <rect x={endHandleX-chipW/2} y={chipY} width={chipW} height={chipH} rx="20" fill="#111827" stroke="#fff" strokeWidth="5" onPointerDown={(e)=>startHandleDrag(e,'end',editable)} onTouchStart={(e)=>startHandleDrag(e,'end',editable)} />
            <text x={endHandleX} y={chipY+37} textAnchor="middle" className="handle-grip">END</text>
          </g>
        );
      })()}
    </svg>
  );
}

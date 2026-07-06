import React, { useRef } from 'react';
import { clamp, round5 } from '../../shared/utils/time.js';
import { STATUS_ORDER, rowIndex, color, soft } from '../../shared/utils/status.js';

const W = 1000;
const EDIT_H = 420;
const BASE_H = 344;
const LEFT = 50;
const RIGHT = 56;
const TOP = 18;
const ROW_H = 76;
const BODY_W = W - LEFT - RIGHT;
const SHORT_EVENT_MARKER_PX = 12;
const HIT_MIN_PX = 24;
// v95.6 continuous duty line: one stroke width for horizontals AND vertical
// bends, drawn as a single SVG path so corners are clean 90° miter joins.
// v95.53 readability: compact Motive-style duty trace, readable on iPhone.
const LINE_W = 9;
const LINE_HALO_W = LINE_W + 7;
const VERTICAL_LINE_W = LINE_W;
const CORNER_INSET = LINE_W / 2;
const CORNER_OVERLAP = CORNER_INSET;
const TRACE_COLOR = '#111827';
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
  const shortEvents = sorted
    .map((event, index) => ({ event, index, span: exactSpan(event) }))
    .filter(item => item.span.short);

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
      <rect x="0" y="0" width={W} height={graphHeight} fill="#ffffff" />
      {STATUS_ORDER.map((s,i) => (
        <g key={s}>
          <rect x="0" y={TOP+i*ROW_H} width={LEFT} height={ROW_H} fill="#ffffff" stroke="#e3e8ee" strokeWidth="1" />
          <text x={LEFT-12} y={CENTER(s)+5} textAnchor="end" className="row-label">{s}</text>
          <line x1={LEFT} x2={W-RIGHT} y1={TOP+i*ROW_H} y2={TOP+i*ROW_H} stroke="#e3e8ee" strokeWidth="1" />
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
      <line x1={LEFT} x2={W-RIGHT} y1={TOP+4*ROW_H} y2={TOP+4*ROW_H} stroke="#e3e8ee" strokeWidth="1" />
      {Array.from({ length: 97 }).map((_,q) => {
        const x = LEFT + (q/96)*BODY_W;
        const major = q % 4 === 0;
        return <line key={q} x1={x} x2={x} y1={TOP} y2={TOP+4*ROW_H} stroke={major ? '#aab4c2' : '#edf1f5'} strokeWidth={major ? 1.15 : 0.62} />;
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

      {/* v95.7 warning underlay.
          HOS/review markers should not look like a second duty line sitting
          on top of the trace. They are now soft background bands + small
          badges under the real continuous duty path. */}
      {violationRanges.map((r, i) => {
        const y = CENTER(r.status);
        const x1 = xFromMin(r.startMin);
        const x2 = xFromMin(r.endMin);
        const c = rangeColor(r);
        return (
          <g key={`${r.id || i}_${r.startMin}_${r.endMin}_under`} className="graph-violation-underlay" pointerEvents="none">
            <rect
              x={Math.min(x1, x2)}
              y={y - (LINE_W + 12)}
              width={Math.max(6, Math.abs(x2 - x1))}
              height={(LINE_W + 12) * 2}
              rx="10"
              fill={c}
              opacity=".12"
            />
          </g>
        );
      })}

      {/* v95.6 continuous duty line.
          Layer 1 — selection highlights (soft row fill + outer glow) drawn
          UNDER the trace so selecting never thickens or distorts the line.
          Layer 2 — one continuous SVG path (H/V commands, miter joins, butt
          caps) in neutral dark slate: horizontals and vertical bends share
          the exact same stroke width and clean 90° corners, no join dots.
          Layer 3 — status-colored horizontal overlays at the SAME width,
          carried all the way to the bend so there is no visible break/gap
          at the corner. Vertical bends are slightly slimmer underneath. */}

      {sorted.map(event => {
        const selected = selectedId === event.id || editId === event.id;
        if (!selected) return null;
        const y = CENTER(event.status);
        const span = exactSpan(event);
        return (
          <g key={`${event.id}_sel`} pointerEvents="none">
            <rect x={span.x1} y={TOP+rowIndex(event.status)*ROW_H+3} width={Math.max(3, span.width)} height={ROW_H-6} rx="8" fill={soft(event.status)} />
            <line
              x1={span.x1}
              x2={span.x2}
              y1={y}
              y2={y}
              stroke={color(event.status)}
              strokeWidth={LINE_W + 12}
              strokeLinecap="round"
              opacity=".22"
            />
          </g>
        );
      })}
      {transitions(sorted).map((t,i) => {
        const selected = selectedId === t.to.id || selectedId === t.from.id || editId === t.to.id || editId === t.from.id;
        if (!selected) return null;
        const x = xFromMin(t.minute);
        const y1 = CENTER(t.from.status);
        const y2 = CENTER(t.to.status);
        return (
          <rect key={`${i}_tsel`} x={x-14} y={Math.min(y1,y2)-11} width="28" height={Math.abs(y2-y1)+22} rx="14" fill="rgba(95,99,104,.13)" pointerEvents="none" />
        );
      })}

      {/* Base duty trace: white halo + continuous paper-log path.
          The halo separates the duty line from the grid so the driver can
          read OFF / SB / D / ON instantly on iPhone Safari. */}
      {bodyPath ? (
        <path
          d={bodyPath}
          fill="none"
          stroke="#ffffff"
          strokeWidth={LINE_HALO_W}
          strokeLinecap="butt"
          strokeLinejoin="miter"
          pointerEvents="none"
        />
      ) : null}
      {bodyPath ? (
        <path
          d={bodyPath}
          fill="none"
          stroke={TRACE_COLOR}
          strokeWidth={LINE_W}
          strokeLinecap="butt"
          strokeLinejoin="miter"
          pointerEvents="none"
        />
      ) : null}

      {sorted.map((event, i) => {
        const y = CENTER(event.status);
        const span = hitSpan(event);
        const bendBefore = i > 0 && sorted[i - 1].status !== event.status;
        const bendAfter = i < sorted.length - 1 && sorted[i + 1].status !== event.status;
        const x1 = Math.max(LEFT, span.x1 - (bendBefore ? CORNER_OVERLAP : 0));
        const x2 = Math.min(W - RIGHT, span.x2 + (bendAfter ? CORNER_OVERLAP : 0));
        return (
          <g key={event.id}>
            <line
              x1={span.hitX1 ?? span.x1}
              x2={span.hitX2 ?? span.x2}
              y1={y}
              y2={y}
              stroke="transparent"
              strokeWidth="32"
              strokeLinecap="butt"
              onClick={(e)=>{ if (onSelect) { e.stopPropagation(); onSelect(event.id); } }}
            />
            <line
              x1={x1}
              x2={x2}
              y1={y}
              y2={y}
              stroke="#ffffff"
              strokeWidth={LINE_HALO_W}
              strokeLinecap="butt"
              strokeLinejoin="miter"
              pointerEvents="none"
            />
            <line
              x1={x1}
              x2={x2}
              y1={y}
              y2={y}
              stroke={color(event.status)}
              strokeWidth={LINE_W}
              strokeLinecap="butt"
              strokeLinejoin="miter"
              pointerEvents="none"
            />
          </g>
        );
      })}

      {/* Small issue badges only — no colored line overlay. */}
      {violationRanges.map((r, i) => {
        const y = CENTER(r.status);
        const x1 = xFromMin(r.startMin);
        const c = rangeColor(r);
        return (
          <g key={`${r.id || i}_${r.startMin}_badge`} className="graph-violation-badge" pointerEvents="none">
            <circle cx={x1} cy={y} r="9" fill={c} stroke="#fff" strokeWidth="3" opacity=".96" />
            <text x={x1} y={y+3.4} textAnchor="middle" className="violation-bang">!</text>
          </g>
        );
      })}

      {/* Transition tap targets only: the visible vertical bend is part of the
          continuous base path above — no separate stroke, no endpoint dots. */}
      {transitions(sorted).map((t,i) => {
        const x = xFromMin(t.minute);
        const y1 = CENTER(t.from.status);
        const y2 = CENTER(t.to.status);
        return (
          <line
            key={i}
            className="smooth-transition"
            x1={x} x2={x} y1={y1} y2={y2}
            stroke="transparent"
            strokeWidth="36"
            strokeLinecap="butt"
            onClick={(e)=>{ if (onSelect) { e.stopPropagation(); onSelect(t.to.id); } }}
          />
        );
      })}

      {/* Short 1–15 minute events: the base path already dips to the true row
          as part of the continuous body; one small status-colored dot marks
          the event so it stays visible. No spike lines, no boundary masks,
          no double rendering. */}
      {shortEvents.map(({ event, span }, index) => {
        const selected = selectedId === event.id || editId === event.id;
        const mid = (span.x1 + span.x2) / 2;
        const y = CENTER(event.status);
        const c = color(event.status);
        return (
          <circle
            key={`${event.id || index}_short`}
            className="short-event-marker"
            cx={mid}
            cy={y}
            r={selected ? 10 : 8}
            fill={c}
            stroke="#fff"
            strokeWidth="3.5"
            pointerEvents="none"
          />
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
            <line x1={sx} x2={sx} y1={TOP} y2={graphBottom} stroke={c} strokeWidth="5.1" strokeLinecap="round" opacity=".78" pointerEvents="none" />
            <line x1={ex} x2={ex} y1={TOP} y2={graphBottom} stroke={c} strokeWidth="5.1" strokeLinecap="round" opacity=".78" pointerEvents="none" />

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

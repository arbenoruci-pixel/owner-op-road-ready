import React, { useRef } from 'react';
import { clamp, round5 } from '../../shared/utils/time.js';
import { STATUS_ORDER, rowIndex, soft, color } from '../../shared/utils/status.js';

const W = 1000;
const EDIT_H = 374;
const BASE_H = 300;
const LEFT = 46;
const RIGHT = 50;
const TOP = 16;
const ROW_H = 66;
const BODY_W = W - LEFT - RIGHT;
const SHORT_EVENT_MARKER_PX = 12;
const HIT_MIN_PX = 24;
const MIN_SHORT_TRACE_PX = 7;
// v95.6 continuous duty line: one stroke width for horizontals AND vertical
// bends, drawn as a single SVG path so corners are clean 90° miter joins.
// v95.63 Motive-style paper trace: one clean blue duty line, no
// per-status graph colors. Event-list badges keep status colors, but the
// graph itself stays readable like a paper RODS grid.
const LINE_W = 5.8; // v95.83: about 10% thicker than the prior 5.25px trace
const LINE_HALO_W = 10.4;
const VERTICAL_LINE_W = LINE_W; // legacy verifier alias; visible trace uses LINE_W
const TRACE_COLOR = '#1a73e8';
const ROW_LINE_COLOR = '#e6ebf1';
const ROW_LINE_W = 0.85;
const HOUR_GRID_COLOR = '#d6dee8';
const QUARTER_GRID_COLOR = '#eef3f8';
const HOUR_GRID_W = 0.43; // v95.83: 40% thinner than prior 0.72px hour grid
const QUARTER_GRID_W = 0.2; // v95.83: 40% thinner than prior 0.34px quarter grid
const HOUR_GRID_OPACITY = 0.72;
const QUARTER_GRID_OPACITY = 0.64;
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

function violationLabel(r = {}) {
  if (r.type === 'window14') return '14h';
  if (r.type === 'drive11') return '11h';
  if (r.type === 'break8') return 'Break';
  if (r.type === 'cycle70') return '70h';
  if (r.type === 'overlap') return 'Overlap';
  return '';
}

function violationShortLabel(r = {}) {
  if (r.type === 'window14') return '14h';
  if (r.type === 'drive11') return '11h';
  if (r.type === 'break8') return 'Break';
  if (r.type === 'cycle70') return '70h';
  if (r.type === 'overlap') return 'Overlap';
  return '';
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
  const shortTraceBoosts = sorted
    .map((event, index) => ({ event, index, span: exactSpan(event) }))
    .filter(item => item.span.short && item.span.width > 0);

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
          <rect x="0" y={TOP+i*ROW_H} width={LEFT} height={ROW_H} fill="#ffffff" stroke={ROW_LINE_COLOR} strokeWidth={ROW_LINE_W} />
          <text x={LEFT-12} y={CENTER(s)+5} textAnchor="end" className="row-label">{s}</text>
          <line x1={LEFT} x2={W-RIGHT} y1={TOP+i*ROW_H} y2={TOP+i*ROW_H} stroke={ROW_LINE_COLOR} strokeWidth={ROW_LINE_W} />
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
      <line x1={LEFT} x2={W-RIGHT} y1={TOP+4*ROW_H} y2={TOP+4*ROW_H} stroke={ROW_LINE_COLOR} strokeWidth={ROW_LINE_W} />
      {Array.from({ length: 97 }).map((_,q) => {
        const x = LEFT + (q/96)*BODY_W;
        const major = q % 4 === 0;
        return (
          <line
            key={q}
            className={major ? 'graph-hour-grid-line' : 'graph-quarter-grid-line'}
            x1={x}
            x2={x}
            y1={TOP}
            y2={TOP+4*ROW_H}
            stroke={major ? HOUR_GRID_COLOR : QUARTER_GRID_COLOR}
            strokeWidth={major ? HOUR_GRID_W : QUARTER_GRID_W}
            opacity={major ? HOUR_GRID_OPACITY : QUARTER_GRID_OPACITY}
            shapeRendering="crispEdges"
          />
        );
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

      {/* v95.7/v95.83 warning underlay.
          HOS/review ranges stay as soft background bands only; read-only
          graph warnings no longer draw exclamation badges or dot markers. */}
      {violationRanges.map((r, i) => {
        const y = CENTER(r.status);
        const x1 = xFromMin(r.startMin);
        const x2 = xFromMin(r.endMin);
        const c = rangeColor(r);
        return (
          <g key={`${r.id || i}_${r.startMin}_${r.endMin}_under`} className="graph-violation-underlay" pointerEvents="none">
            <rect
              x={Math.min(x1, x2)}
              y={y - 9}
              width={Math.max(5, Math.abs(x2 - x1))}
              height={18}
              rx="7"
              fill={c}
              opacity=".07"
            />
          </g>
        );
      })}

      {/* v95.63 Motive-style duty line.
          One continuous blue SVG path draws the real graph. It uses a white
          halo plus a slim trace so vertical bends stay visible without black
          bars, duplicate colored overlays, or noisy status-color segments. */}

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
              stroke={TRACE_COLOR}
              strokeWidth={LINE_W + 8}
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

      {/* Base duty trace: white halo + slim continuous paper-log bend path. */}
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
          opacity="1"
          pointerEvents="none"
        />
      ) : null}

      {/* v95.89: exact HOS/overlap violation trace. If the driver crosses
          into an HOS limit, the actual duty line turns red/orange starting
          at the exact minute returned by violationRangesForDay. Review-only
          rest watches remain background-only and do not paint the line. */}
      {violationRanges
        .filter(r => r && r.severity === 'high' && r.startMin != null && r.endMin != null)
        .map((r, i) => {
          const y = CENTER(r.status);
          const x1 = xFromMin(r.startMin);
          const x2 = xFromMin(r.endMin);
          const c = rangeColor(r);
          return (
            <g key={`${r.id || i}_${r.type || 'violation'}_${r.startMin}_${r.endMin}_trace`} className="graph-violation-trace" pointerEvents="none">
              <line
                x1={x1}
                x2={x2}
                y1={y}
                y2={y}
                stroke="#fff"
                strokeWidth={LINE_HALO_W + 1.5}
                strokeLinecap="butt"
              />
              <line
                x1={x1}
                x2={x2}
                y1={y}
                y2={y}
                stroke={c}
                strokeWidth={LINE_W + 1.25}
                strokeLinecap="butt"
              />
              <line
                x1={x1}
                x2={x1}
                y1={y - 12}
                y2={y + 12}
                stroke={c}
                strokeWidth="3.25"
                strokeLinecap="round"
              />
              {violationShortLabel(r) ? (
                <text
                  x={Math.min(W - RIGHT - 18, Math.max(LEFT + 18, x1 + 6))}
                  y={Math.max(24, y - 15)}
                  className="graph-violation-label"
                  fill={c}
                >{violationShortLabel(r)}</text>
              ) : null}
            </g>
          );
        })}

      {sorted.map((event) => {
        const y = CENTER(event.status);
        const span = hitSpan(event);
        return (
          <line
            key={`${event.id}_hit`}
            x1={span.hitX1 ?? span.x1}
            x2={span.hitX2 ?? span.x2}
            y1={y}
            y2={y}
            stroke="transparent"
            strokeWidth="34"
            strokeLinecap="butt"
            onClick={(e)=>{ if (onSelect) { e.stopPropagation(); onSelect(event.id); } }}
          />
        );
      })}

      {/* v95.83 read-only graph cleanup: warnings stay in Log Check/list UI.
          The graph itself avoids exclamation circles so the paper-log trace
          remains the visual priority. */}

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

      {/* Short 1–15 minute events: keep them visible as a minimum-length
          piece of the same blue trace. No read-only dot markers, warning
          circles, or endpoint bubbles. */}
      {shortTraceBoosts.map(({ event, span }, index) => {
        const mid = (span.x1 + span.x2) / 2;
        const half = MIN_SHORT_TRACE_PX / 2;
        const x1 = Math.max(LEFT, mid - half);
        const x2 = Math.min(W - RIGHT, mid + half);
        const y = CENTER(event.status);
        return (
          <line
            key={`${event.id || index}_short_trace`}
            className="short-event-trace-boost"
            x1={x1}
            x2={x2}
            y1={y}
            y2={y}
            stroke={TRACE_COLOR}
            strokeWidth={LINE_W}
            strokeLinecap="butt"
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
        const chipW = 104;
        const chipH = 50;
        const chipCY = chipY + chipH / 2;
        const chipPadX = chipW / 2 + 6;
        const chipMinX = LEFT + chipPadX;
        const chipMaxX = W - RIGHT - chipPadX;
        const startHandleX = Math.max(chipMinX, Math.min(chipMaxX, tooClose ? sx - 56 : sx));
        const endHandleX = Math.max(chipMinX, Math.min(chipMaxX, tooClose ? ex + 56 : ex));

        return (
          <g className="edit-handles-large">
            <rect x={Math.min(sx, ex)} y={TOP} width={Math.max(4, Math.abs(ex - sx))} height={graphBottom - TOP} fill={c} opacity=".09" pointerEvents="none" />
            <line x1={sx} x2={sx} y1={TOP} y2={graphBottom} stroke={c} strokeWidth="3.25" strokeLinecap="round" opacity=".72" pointerEvents="none" />
            <line x1={ex} x2={ex} y1={TOP} y2={graphBottom} stroke={c} strokeWidth="3.25" strokeLinecap="round" opacity=".72" pointerEvents="none" />

            <line x1={startHandleX} x2={sx} y1={chipCY} y2={y} stroke="#111827" strokeWidth="5.5" strokeLinecap="round" opacity=".78" pointerEvents="none" />
            <line x1={endHandleX} x2={ex} y1={chipCY} y2={y} stroke="#111827" strokeWidth="5.5" strokeLinecap="round" opacity=".78" pointerEvents="none" />

            <circle cx={sx} cy={y} r="25" fill={c} opacity=".12" pointerEvents="none" />
            <circle cx={ex} cy={y} r="25" fill={c} opacity=".12" pointerEvents="none" />
            <circle cx={sx} cy={y} r="15" fill="#fff" stroke={c} strokeWidth="3.5" pointerEvents="none" />
            <circle cx={ex} cy={y} r="15" fill="#fff" stroke={c} strokeWidth="3.5" pointerEvents="none" />
            <circle cx={sx} cy={y} r="6.5" fill={c} pointerEvents="none" />
            <circle cx={ex} cy={y} r="6.5" fill={c} pointerEvents="none" />

            <circle cx={sx} cy={y} r="64" fill="transparent" onPointerDown={(e)=>startHandleDrag(e,'start',editable)} onTouchStart={(e)=>startHandleDrag(e,'start',editable)} />
            <circle cx={ex} cy={y} r="64" fill="transparent" onPointerDown={(e)=>startHandleDrag(e,'end',editable)} onTouchStart={(e)=>startHandleDrag(e,'end',editable)} />

            <rect x={startHandleX-chipW/2-14} y={chipY-14} width={chipW+28} height={chipH+28} rx="24" fill="transparent" onPointerDown={(e)=>startHandleDrag(e,'start',editable)} onTouchStart={(e)=>startHandleDrag(e,'start',editable)} />
            <rect x={endHandleX-chipW/2-14} y={chipY-14} width={chipW+28} height={chipH+28} rx="24" fill="transparent" onPointerDown={(e)=>startHandleDrag(e,'end',editable)} onTouchStart={(e)=>startHandleDrag(e,'end',editable)} />

            <rect x={startHandleX-chipW/2} y={chipY} width={chipW} height={chipH} rx="18" fill="#111827" stroke="#fff" strokeWidth="4" onPointerDown={(e)=>startHandleDrag(e,'start',editable)} onTouchStart={(e)=>startHandleDrag(e,'start',editable)} />
            <text x={startHandleX} y={chipY+32} textAnchor="middle" className="handle-grip">START</text>

            <rect x={endHandleX-chipW/2} y={chipY} width={chipW} height={chipH} rx="18" fill="#111827" stroke="#fff" strokeWidth="4" onPointerDown={(e)=>startHandleDrag(e,'end',editable)} onTouchStart={(e)=>startHandleDrag(e,'end',editable)} />
            <text x={endHandleX} y={chipY+32} textAnchor="middle" className="handle-grip">END</text>
          </g>
        );
      })()}
    </svg>
  );
}

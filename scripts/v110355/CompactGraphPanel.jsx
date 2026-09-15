import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import LogGraph from '../../graph/LogGraph.jsx';
import { GRAPH as G, graphX } from '../../graph/graphGeometryV110.js';
import { insertPointerMinuteV110316 } from '../insertInteractionsV110316.js';
import { timeLabel } from '../../../shared/utils/time.js';
import { draggedMinuteV111 } from './graphHandlesV111.js';
import { editorGripLayout } from './editorGripLayoutV110355.js';

// EDITOR_BOUNDARY_GRIPS_V110355: actual minute lines + compact, separate 44px
// touch targets below the trace. All mutations remain in the existing draft API.
export default function CompactGraphPanelV111({
  events = [], selectedId, editId, onEditTime, onSelect, onEmptyTap, header,
  freeInsertBoundaries = false, onRestoreRange,
}) {
  const frame = useRef(null), cleanup = useRef(null);
  const callbacks = useRef({ onEditTime, onRestoreRange });
  callbacks.current = { onEditTime, onRestoreRange };
  const [wide, setWide] = useState(false), [width, setWidth] = useState(320);
  const [dragging, setDragging] = useState(null);
  const selected = events.find(e => e.id === (editId || selectedId));
  const editable = !!selected && typeof onEditTime === 'function';
  const layout = editorGripLayout(selected?.startMin, selected?.endMin, width);
  useLayoutEffect(() => {
    const node = frame.current;
    const measure = () => {
      const next = node?.getBoundingClientRect().width;
      if (next > 0) setWidth(current => Math.abs(current - next) > 0.25 ? next : current);
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (node) observer?.observe(node);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, [wide]);
  useEffect(() => {
    cleanup.current?.();
    setDragging(null);
    return () => cleanup.current?.();
  }, [selected?.id, editable, wide, width]);
  useEffect(() => {
    const escape = e => { if (e.key === 'Escape') { cleanup.current?.(); setDragging(null); setWide(false); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);

  function moveMinute(snapshot, edge, initial, delta, svgWidth) {
    return freeInsertBoundaries
      ? insertPointerMinuteV110316(edge, initial, delta, svgWidth)
      : draggedMinuteV111(snapshot, edge, initial, delta, svgWidth);
  }
  function drag(e, edge) {
    if (!editable || (e.button != null && e.button !== 0)) return;
    const svg = frame.current?.querySelector('svg.log-graph');
    // getScreenCTM describes the rendered viewBox, including browser zoom.
    const matrix = svg?.getScreenCTM();
    const svgWidth = matrix ? Math.hypot(matrix.a, matrix.b) * G.width : svg?.getBoundingClientRect().width;
    if (!(svgWidth > 0) || !Number.isFinite(e.clientX)) return;
    e.preventDefault(); e.stopPropagation(); cleanup.current?.();
    const target = e.currentTarget, pointer = e.pointerId, x = e.clientX;
    const snapshot = { ...selected }, initial = selected[edge + 'Min'];
    let moved = false, stopped = false;
    const move = p => {
      if (stopped || p.pointerId !== pointer || !Number.isFinite(p.clientX)) return;
      const delta = p.clientX - x;
      if (!moved && Math.abs(delta) < 2) return; // A tap never changes the time.
      moved = true; if (p.cancelable) p.preventDefault();
      callbacks.current.onEditTime?.(edge, moveMinute(snapshot, edge, initial, delta, svgWidth));
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', blur);
      target.removeEventListener('lostpointercapture', lost);
      try { if (target.hasPointerCapture?.(pointer)) target.releasePointerCapture(pointer); } catch {}
      cleanup.current = null;
    };
    const end = p => { if (p.pointerId === pointer) { move(p); stop(); setDragging(null); } };
    const restore = () => {
      if (moved) {
        if (freeInsertBoundaries && callbacks.current.onRestoreRange) callbacks.current.onRestoreRange(snapshot);
        else callbacks.current.onEditTime?.(edge, initial);
      }
      stop(); setDragging(null);
    };
    const cancel = p => { if (p.pointerId === pointer) restore(); };
    const blur = () => restore();
    const lost = p => { if (!stopped && p.pointerId === pointer) restore(); };
    cleanup.current = stop;
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', blur);
    target.addEventListener('lostpointercapture', lost);
    try { target.setPointerCapture?.(pointer); } catch {}
    setDragging(edge);
  }
  function keyMove(e, edge) {
    if (!editable || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const delta = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1);
    onEditTime(edge, moveMinute(selected, edge, selected[edge + 'Min'], delta * 0.894 / 1440, 1));
  }
  return <div className={`editor-graph-panel editor-graph-wrap-v85 compact-graph-panel-v111 rr-graph-panel-v110355 ${wide ? 'graph-focus-v111' : ''}`}>
    <div className="compact-graph-toolbar-v111 compact-graph-toolbar-minimal-v11024"><button type="button" aria-label={wide ? 'Done graph' : 'Full screen'} aria-expanded={wide} onClick={() => setWide(value => !value)}>{wide ? 'Done' : '↗ Expand'}</button></div>
    <div ref={frame} className="rr-graph-frame-v110355" data-editable={editable}>
      <div className="editor-graph-card" aria-label={header || 'Duty timeline'}><LogGraph events={events} selectedId={selectedId} editId={editId} onSelect={onSelect} onEmptyTap={onEmptyTap} className="compact-graph-svg-v111" /></div>
      {editable && <>
        <svg className="rr-boundary-lines-v110355" viewBox={`0 0 ${G.width} 305`} aria-hidden="true">
          {['start', 'end'].map(edge => <line key={edge} data-editor-boundary={edge} x1={graphX(selected[edge + 'Min'])} x2={graphX(selected[edge + 'Min'])} y1={G.top} y2={305} />)}
        </svg>
        {['start', 'end'].map(edge => <span key={edge} className="rr-boundary-label-v110355" style={{ left: layout[edge].labelLeft }} aria-hidden="true">{timeLabel(selected[edge + 'Min'])}</span>)}
        <div className="rr-grip-strip-v110355">
          <svg className="rr-grip-leaders-v110355" viewBox={`0 0 ${layout.width} 44`} preserveAspectRatio="none" aria-hidden="true">
            {['start', 'end'].map(edge => <path key={edge} d={`M ${layout[edge].x} 0 L ${layout[edge].left + layout[edge].tip} 8`} />)}
          </svg>
          {['start', 'end'].map(edge => <button key={edge} type="button" className="graph-handle-v110 graph-handle-large-v110 modern-handle-v11027 rr-time-grip-v110355" role="slider" aria-label={`${edge} time handle`} aria-orientation="horizontal" aria-valuemin={freeInsertBoundaries ? (edge === 'start' ? 0 : 1) : edge === 'start' ? 0 : selected.startMin + 1} aria-valuemax={freeInsertBoundaries ? (edge === 'start' ? 1439 : 1440) : edge === 'start' ? selected.endMin - 1 : 1440} aria-valuenow={selected[edge + 'Min']} aria-valuetext={timeLabel(selected[edge + 'Min'])} data-edge={edge} data-dragging={dragging === edge} style={{ left: layout[edge].left, '--rr-tip': `${layout[edge].tip}px` }} onPointerDown={e => drag(e, edge)} onKeyDown={e => keyMove(e, edge)} onClick={e => { e.preventDefault(); e.stopPropagation(); }}><i className="rr-grip-tab-v110355" aria-hidden="true" /><span className="rr-grip-name-v110355" aria-hidden="true">{edge.toUpperCase()}</span></button>)}
        </div>
      </>}
    </div>
  </div>;
}

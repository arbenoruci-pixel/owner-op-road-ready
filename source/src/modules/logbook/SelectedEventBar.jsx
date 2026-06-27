import React from 'react';
import { color, label } from '../../shared/utils/status.js';
import { durLabel, timeLabel } from '../../shared/utils/time.js';

function deltaLabel(delta) {
  if (!delta) return 'No move';
  const sign = delta < 0 ? '-' : '+';
  const abs = Math.abs(delta);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h && m) return `${sign}${h}h ${m}m`;
  if (h) return `${sign}${h}h`;
  return `${sign}${m}m`;
}

export default function SelectedEventBar({
  event,
  onEdit,
  onVoid,
  onClear,
  moveOpen = false,
  moveDelta = 0,
  moveWasClamped = false,
  moveHasWarning = false,
  onToggleMove,
  onAdjustMove,
  onApplyMove,
  onResetMove,
}) {
  if (!event) {
    return (
      <div className="graph-empty-hint">
        <span>Tap a line on the graph to select an event.</span>
      </div>
    );
  }

  const loc = `${event.city || ''}${event.state ? `, ${event.state}` : ''}`.trim();
  const c = color(event.status);

  return (
    <div className={`selected-event-bar ${moveOpen ? 'moving' : ''} ${moveHasWarning ? 'move-warning' : ''}`}>
      <div className="selected-event-topline">
        <button className="selected-clear" onClick={onClear} aria-label="Clear selected event">×</button>
        <div className="selected-event-dot" style={{ background: c }}>{event.status}</div>
        <div className="selected-event-main">
          <b>{label(event.status)}</b>
          <span>{timeLabel(event.startMin, true)} – {timeLabel(event.endMin, true)} · {durLabel(event.endMin - event.startMin)}</span>
          <em>{loc}{event.note ? ` · ${event.note}` : ''}</em>
        </div>
      </div>

      <div className="selected-event-actions">
        <button className={`selected-move ${moveOpen ? 'active' : ''}`} onClick={onToggleMove}>Move</button>
        <button className="selected-edit" onClick={() => onEdit(event.id)}>Edit</button>
        <button className="selected-void" onClick={() => onVoid(event.id)}>Void</button>
      </div>

      {moveOpen && (
        <div className="inline-move-panel">
          <div className="move-preview-line">
            <b>{deltaLabel(moveDelta)}</b>
            <span>{moveDelta ? 'Live preview on graph' : 'Tap a nudge button'}</span>
          </div>
          <div className="move-nudge-grid">
            <button onClick={() => onAdjustMove?.(-15)}>-15</button>
            <button onClick={() => onAdjustMove?.(-5)}>-5</button>
            <button onClick={() => onAdjustMove?.(5)}>+5</button>
            <button onClick={() => onAdjustMove?.(15)}>+15</button>
          </div>
          {(moveWasClamped || moveHasWarning) && (
            <div className={`move-feedback ${moveHasWarning ? 'bad' : ''}`}>
              {moveHasWarning ? 'Warning shown on graph. Review before applying.' : 'Day edge reached.'}
            </div>
          )}
          <div className="move-apply-row">
            <button className="move-reset" onClick={onResetMove}>Reset</button>
            <button className="move-apply" disabled={!moveDelta} onClick={onApplyMove}>Apply move</button>
          </div>
        </div>
      )}
    </div>
  );
}

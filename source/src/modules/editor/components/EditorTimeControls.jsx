import React from 'react';
import { fromInput, toInput } from '../../../shared/utils/time.js';

/**
 * Start / End time inputs plus the -5/+5 nudge buttons.
 * Comes after the graph in both editor sheets.
 *
 * Values are "HH:MM" strings. The +/-5 buttons are computed here (one place)
 * via onStartChange / onEndChange so the math never drifts between sheets.
 * `quickRow` is an optional node rendered above the inputs (Insert uses it for
 * NOW / 10 / 15 / 30 MIN AGO presets).
 */
export default function EditorTimeControls({
  start,
  end,
  onStartChange,
  onEndChange,
  quickRow = null,
}) {
  const bump = (which, delta) => {
    if (which === 'start') onStartChange(toInput(fromInput(start) + delta));
    else onEndChange(toInput(fromInput(end) + delta));
  };

  return (
    <div className="form-section">
      <div className="form-label">Start / End Time</div>
      {quickRow}
      <div className="two-inputs editor-time-v85">
        <input type="time" value={start} onChange={e => onStartChange(e.target.value)} />
        <input type="time" value={end} onChange={e => onEndChange(e.target.value)} />
      </div>
      <div className="quick-row editor-quick-v85">
        <button onClick={() => bump('start', -5)}>-5 start</button>
        <button onClick={() => bump('start', 5)}>+5 start</button>
        <button onClick={() => bump('end', -5)}>-5 end</button>
        <button onClick={() => bump('end', 5)}>+5 end</button>
      </div>
    </div>
  );
}

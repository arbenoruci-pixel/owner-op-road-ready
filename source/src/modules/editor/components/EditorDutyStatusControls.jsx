import React from 'react';
import { color } from '../../../shared/utils/status.js';

// Short, driver-friendly labels for the editor duty buttons.
// Exported so both editor sheets show the exact same wording.
export const DUTY_SHORT_LABELS = {
  OFF: 'Off Duty',
  SB: 'Sleeper',
  D: 'Driving',
  ON: 'On Duty',
};

const DUTY_ORDER = ['OFF', 'SB', 'D', 'ON'];

/**
 * Duty Status selector (OFF / SB / D / ON).
 * Always rendered ABOVE the graph in both Edit Duty Status and Insert Events.
 * Shared so a future label/layout change happens in one place.
 */
export default function EditorDutyStatusControls({ status, onChange, label = 'Duty Status' }) {
  return (
    <div className="editor-duty-top">
      <div className="editor-duty-label">{label}</div>
      <div className="editor-duty-grid">
        {DUTY_ORDER.map(s => (
          <button
            key={s}
            className={status === s ? 'active' : ''}
            style={status === s ? { background: color(s), borderColor: color(s) } : {}}
            onClick={() => onChange(s)}
          >
            <b>{s}</b><span>{DUTY_SHORT_LABELS[s]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

import React from 'react';
import { calculateHosClocks, formatHosClockMinutes } from '../../core/hos/hosEngine.js';

function tone(clock = {}) {
  if (clock.expired || clock.tone === 'red') return 'bad';
  if (clock.warning || clock.tone === 'yellow') return 'warn';
  return 'ok';
}

export default function HosCompactClocks({ state }) {
  const hos = React.useMemo(() => calculateHosClocks(state, new Date()), [state]);
  const items = [hos.break, hos.drive, hos.shift, hos.cycle].filter(Boolean);
  if (!items.length) return null;

  return (
    <div className="hos-compact-card" aria-label="Advisory HOS clocks">
      <div className="hos-compact-head">
        <b>HOS clocks</b>
        <span>Advisory · manual RODS</span>
      </div>
      <div className="hos-compact-grid">
        {items.map(clock => (
          <div key={clock.label} className={`hos-compact-item ${tone(clock)}`}>
            <span>{clock.label}</span>
            <b>{formatHosClockMinutes(clock.remainingMinutes)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

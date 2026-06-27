import React, { useState } from 'react';
import { analyzeLinkedHos } from '../../core/hos/hosEngine.js';

export default function HosCheck({ events, state }) {
  const [open, setOpen] = useState(false);
  const result = analyzeLinkedHos(state.eventsByDay || {}, state.activeDay, state.certifyStatus || {});
  const high = result.warnings.filter(w => w.severity === 'high').length;
  const medium = result.warnings.filter(w => w.severity === 'medium').length;
  const ok = result.warnings.length === 0;

  return (
    <div className={`logcheck-compact ${open ? 'open' : ''}`}>
      <button className="logcheck-summary" onClick={() => setOpen(!open)}>
        <div>
          <b>Log Check</b>
          <span>{ok ? 'No reviews' : `${result.warnings.length} review${result.warnings.length === 1 ? '' : 's'}`}</span>
        </div>
        <em className={high ? 'bad' : medium ? 'warn' : 'ok'}>{ok ? 'OK' : high ? `${high} high` : `${medium} watch`}</em>
      </button>

      {open && (
        <>
          <div className="logcheck-cards">
            {result.cards.map(card => (
              <div key={card.label} className={card.ok ? 'ok' : 'warn'}>
                <span>{card.label}</span>
                <b>{card.value}</b>
                <small>{card.sub}</small>
              </div>
            ))}
          </div>

          {result.warnings.length > 0 && (
            <div className="logcheck-warnings">
              {result.warnings.map((w, i) => <div key={i} className={`hos-warning ${w.severity}`}>⚠ {w.text}</div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

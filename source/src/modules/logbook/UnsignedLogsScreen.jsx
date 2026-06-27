import React from 'react';
import { Header } from '../../shared/ui/Chrome.jsx';
import { dayDisplayTitle, dayDurationMinutes, logSignState, signingWarnings } from './signing.js';

function durationLabel(mins) {
  const h = Math.floor(Math.max(0, mins) / 60);
  const m = Math.max(0, mins) % 60;
  return `${h} hr, ${m} min`;
}

export default function UnsignedLogsScreen({ state, days = [], onBack, onOpenDay, onSignDay }) {
  const hasSavedSignature = !!state.driverSignature?.dataUrl;

  return (
    <section className="screen unsigned-screen active">
      <Header title="Unsigned Logs" onBack={onBack} right="Review" onRight={() => days[0] && onOpenDay(days[0])} />

      <div className="unsigned-intro">
        Please review and sign completed DOT log days before continuing. Today stays out of this list until the day is complete.
      </div>

      {!days.length && (
        <div className="unsigned-empty">
          <b>No unsigned completed logs</b>
          <span>Signed days are clear. Today will appear here after it becomes a completed log day.</span>
        </div>
      )}

      <div className="unsigned-list">
        {days.map(day => {
          const events = state.eventsByDay?.[day] || [];
          const signState = logSignState(state, day);
          const warnings = signingWarnings(state, day);
          return (
            <div key={day} className="unsigned-log-row">
              <button className="unsigned-log-main" onClick={() => onOpenDay(day)}>
                <b>{dayDisplayTitle(day)}</b>
                <span>{durationLabel(dayDurationMinutes(events))} · {signState.label}</span>
                {warnings.length > 0 && <em>{warnings.length} review item{warnings.length === 1 ? '' : 's'}</em>}
              </button>
              <button
                className="unsigned-sign-btn"
                onClick={() => hasSavedSignature ? onSignDay(day) : onOpenDay(day)}
              >
                {hasSavedSignature ? 'Sign' : 'Add signature'}
              </button>
            </div>
          );
        })}
      </div>

      {hasSavedSignature && days.length > 1 && (
        <button className="unsigned-sign-all" onClick={() => days.forEach(day => onSignDay(day))}>
          Sign listed logs with saved signature
        </button>
      )}
    </section>
  );
}

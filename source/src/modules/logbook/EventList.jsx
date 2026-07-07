import React, { useEffect, useRef } from 'react';
import { durLabel, timeLabel } from '../../shared/utils/time.js';
import { color, label } from '../../shared/utils/status.js';
import { sanitizeLogText } from '../../shared/utils/logText.js';

export default function EventList({ events, selectedId, selectMode, selectedIds, onSelect, onToggleSelected, onOpenEdit }) {
  const refs = useRef({});

  useEffect(() => {
    if (selectedId && refs.current[selectedId]) {
      refs.current[selectedId].scrollIntoView({ block:'nearest', behavior:'smooth' });
    }
  }, [selectedId]);

  if (!events.length) {
    return (
      <div className="events clean-events">
        <div className="empty-events-card">
          <b>No events yet</b>
          <span>Today stays clean. Events appear as you create them.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="events clean-events">
      {events.map(event => {
        const selected = selectedId === event.id;
        const checked = selectedIds.includes(event.id);
        const loc = `${event.city || ''}${event.state ? `, ${event.state}` : ''}`.trim();
        const transitionSummary = sanitizeLogText(event.transitionSummary || '');
        const cleanNote = sanitizeLogText(event.note || '');
        const displayNote = transitionSummary && !cleanNote.includes(transitionSummary)
          ? [cleanNote, transitionSummary].filter(Boolean).join(' · ')
          : cleanNote;
        return (
          <div
            key={event.id}
            ref={(el) => { refs.current[event.id] = el; }}
            className={`event-row clean-event-row ${selected ? 'selected' : ''}`}
            onClick={() => selectMode ? onToggleSelected(event.id) : onOpenEdit(event.id)}
          >
            {selectMode ? (
              <input className="event-check" type="checkbox" readOnly checked={checked} />
            ) : (
              <div className="event-badge" style={{ background: color(event.status) }}>{event.status}</div>
            )}

            <div className="event-content">
              <div className="event-title-line">
                <b>{label(event.status)}</b>
                <span>{timeLabel(event.startMin, true)} · {durLabel(event.endMin - event.startMin)}</span>
              </div>
              <div className="event-loc">{loc}</div>
              {displayNote && <div className="event-note">{displayNote}</div>}
            </div>

            <button className="blue-edit" onClick={(e)=>{ e.stopPropagation(); onOpenEdit(event.id); }}>Edit</button>
          </div>
        );
      })}
    </div>
  );
}

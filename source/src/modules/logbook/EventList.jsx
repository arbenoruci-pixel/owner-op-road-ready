import React, { useEffect, useMemo, useRef } from 'react';
import { durLabel, timeLabel } from '../../shared/utils/time.js';
import { color, label } from '../../shared/utils/status.js';

function mergePassiveRowsForList(events = []) {
  const sorted = [...(events || [])].filter(Boolean).sort((a, b) => Number(a.startMin || 0) - Number(b.startMin || 0));
  const out = [];
  for (const event of sorted) {
    const last = out[out.length - 1];
    const passive = event.status === 'OFF' || event.status === 'SB';
    const touches = last && Number(event.startMin || 0) <= Number(last.endMin || 0);
    if (last && passive && last.status === event.status && touches) {
      out[out.length - 1] = {
        ...last,
        endMin: Math.max(Number(last.endMin || 0), Number(event.endMin || 0)),
        // Keep the first location of the continuous passive status. If the
        // driver needs to change location, they can still open/edit the row.
        city: last.city || event.city,
        state: last.state || event.state,
        note: last.note || event.note,
        description: last.description || event.description,
        mergedIds: [...(last.mergedIds || [last.id]), event.id].filter(Boolean),
      };
      continue;
    }
    out.push({ ...event });
  }
  return out;
}

export default function EventList({ events, selectedId, selectMode, selectedIds, onSelect, onToggleSelected, onOpenEdit }) {
  const refs = useRef({});
  const listEvents = useMemo(() => mergePassiveRowsForList(events), [events]);

  useEffect(() => {
    const visibleId = listEvents.find(event => event.id === selectedId || event.mergedIds?.includes(selectedId))?.id || selectedId;
    if (visibleId && refs.current[visibleId]) {
      refs.current[visibleId].scrollIntoView({ block:'nearest', behavior:'smooth' });
    }
  }, [selectedId, listEvents]);

  if (!listEvents.length) {
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
      {listEvents.map(event => {
        const selected = selectedId === event.id || event.mergedIds?.includes(selectedId);
        const checked = selectedIds.includes(event.id);
        const loc = `${event.city || ''}${event.state ? `, ${event.state}` : ''}`.trim();
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
              {event.note && <div className="event-note">{event.note}</div>}
            </div>

            <button className="blue-edit" onClick={(e)=>{ e.stopPropagation(); onOpenEdit(event.id); }}>Edit</button>
          </div>
        );
      })}
    </div>
  );
}

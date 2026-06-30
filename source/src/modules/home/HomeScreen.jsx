import React from 'react';
import LogGraph from '../graph/LogGraph.jsx';
import { label } from '../../shared/utils/status.js';
import { localDayKey } from '../../shared/utils/date.js';
import { signableLogDays, validateLogForSigning } from '../logbook/signing.js';
import { displayEventsForDay } from '../../core/timeline/displayTimeline.js';

// v92.5 Owner-Op Road Ready — Logs list with original visual identity.
// Structure (status strip + TODAY + LAST 14 DAYS) stays simple/low-stress; the look
// is our own: light header + wordmark, left status rail, duty chips, warning count.
// All callbacks and data-derivation are unchanged so the timeline/signing/DOT logic
// keeps working exactly as before.

function dayParts(day) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { weekday: day, date: '' };
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    date: `${d.toLocaleDateString(undefined, { month: 'short' })} ${d.getDate()}`,
  };
}

function duration(events = []) {
  return events.reduce((sum, e) => sum + Math.max(0, (e.endMin || 0) - (e.startMin || 0)), 0);
}

function hLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${m}m`;
}

const SHORT = { OFF: 'OFF', SB: 'SB', D: 'DRV', ON: 'ON' };

function statusSummary(state) {
  const day = state.activeDay || localDayKey();
  const events = state.eventsByDay?.[day] || [];
  const last = [...events].sort((a, b) => a.startMin - b.startMin).at(-1);
  const status = state.currentStatus || last?.status || 'OFF';
  const loc = state.currentLocation || {};
  const source = loc.locationSource || state.homeGpsStatus || 'default';
  const hasRealLocation = source === 'gps' || source === 'manual' || (loc.city && loc.state && !(loc.city === 'Chicago' && loc.state === 'IL' && source === 'default'));
  let location = 'Getting GPS…';
  if (hasRealLocation) location = `${loc.city || 'GPS'}, ${loc.state || 'UNK'}`;
  else if (state.homeGpsStatus === 'blocked') location = 'GPS blocked';
  else if (state.homeGpsStatus === 'unavailable') location = 'GPS unavailable';

  return {
    status,
    label: label(status),
    location,
    vehicle: state.currentTrailer && state.currentTrailer !== 'No trailer' ? state.currentTrailer : 'No vehicle',
  };
}

function inspectionDone(state, day) {
  const insp = state.inspectionByDay?.[day];
  return !!(insp && (insp.complete || (Array.isArray(insp.checked) && insp.checked.length >= 6)));
}

function DayRow({ state, day, today, onOpenDay }) {
  const { weekday, date } = dayParts(day);
  const evs = displayEventsForDay(state.eventsByDay?.[day] || [], day >= today);
  const cert = state.certifyStatus?.[day] || (day >= today ? 'Active' : 'Not certified');
  const status = (state.eventsByDay?.[day] || []).slice(-1)[0]?.status || 'OFF';
  const certified = cert === 'Certified';
  const issues = day < today ? validateLogForSigning(state, day).length : 0;
  const insp = inspectionDone(state, day);
  return (
    <button type="button" className={`rr-row ${status}`} onClick={() => onOpenDay(day)}>
      <span className="rr-rail" aria-hidden="true" />
      <span className="rr-body">
        <span className="rr-top">
          <span className="rr-date">{weekday} <em>{date}</em></span>
          <span className={`rr-chip ${status}`}>{SHORT[status] || status}</span>
        </span>
        <span className="rr-sub">
          <span>{hLabel(duration(evs))}</span>
          <span className="rr-sep" aria-hidden="true">•</span>
          <span>{cert}</span>
          {insp ? <span className="rr-insp">Insp ✓</span> : null}
        </span>
      </span>
      {issues > 0 ? <span className="rr-warn" title={`${issues} to review`}>{issues}</span>
        : certified ? <span className="rr-ok" title="Certified">✓</span> : null}
    </button>
  );
}

export default function LogsList({ state, onOpenDay, onOpenStatus, onOpenTrailer, onOpenUnsigned, onOpenDot }) {
  const today = localDayKey();
  const todayEvents = displayEventsForDay(state.eventsByDay?.[today] || [], true);
  const unsigned = signableLogDays(state).length;
  const s = statusSummary(state);
  const todayCert = state.certifyStatus?.[today] || 'Active';

  const previousDays = Object.keys(state.eventsByDay || {})
    .filter(day => day < today)
    .sort()
    .reverse()
    .slice(0, 14);

  return (
    <section className="screen rr-screen">
      <header className="rr-head">
        <div className="rr-brand">
          <span className="rr-mark" aria-hidden="true" />
          <span className="rr-brand-text">Road Ready<em>Logs</em></span>
        </div>
        <button type="button" className="rr-dot-btn" onClick={onOpenDot}>DOT Mode</button>
      </header>

      <div className="rr-strip">
        <button type="button" className="rr-strip-cell" onClick={onOpenStatus}>
          <span className={`rr-chip lg ${s.status}`}>{s.label}</span>
          <span className="rr-loc">{s.location}</span>
        </button>
        <button type="button" className="rr-strip-cell right" onClick={onOpenTrailer}>
          <span className="rr-veh">{s.vehicle}</span>
          <span className="rr-veh-sub">Vehicle</span>
        </button>
      </div>

      {unsigned > 0 && (
        <button type="button" className="rr-attention" onClick={() => onOpenUnsigned?.()}>
          <span className="rr-attention-badge">{unsigned}</span>
          <span>{unsigned === 1 ? 'log needs signing' : 'logs need signing'}</span>
          <span className="rr-attention-go" aria-hidden="true">Review</span>
        </button>
      )}

      <div className="rr-sec">Today</div>
      <button type="button" className={`rr-row rr-today ${s.status}`} onClick={() => onOpenDay(today)}>
        <span className="rr-rail" aria-hidden="true" />
        <span className="rr-body">
          <span className="rr-top">
            <span className="rr-date">{dayParts(today).weekday} <em>{dayParts(today).date}</em></span>
            <span className={`rr-chip ${s.status}`}>{SHORT[s.status] || s.status}</span>
          </span>
          <span className="rr-sub">
            <span>{hLabel(duration(todayEvents))}</span>
            <span className="rr-sep" aria-hidden="true">•</span>
            <span>{todayCert}</span>
          </span>
        </span>
      </button>
      <button
        type="button"
        className="rr-today-graph-btn"
        onClick={() => onOpenDay(today)}
        aria-label="Open today's log"
      >
        <span className="rr-today-graph-go" aria-hidden="true">Open</span>
        <div className="rr-today-graph">
          <LogGraph events={todayEvents} selectedId={null} className="rr-home-graph-svg" />
        </div>
      </button>

      <div className="rr-sec">Last 14 days</div>
      {previousDays.length === 0 ? (
        <div className="rr-empty">No previous logs yet.</div>
      ) : (
        previousDays.map(day => (
          <DayRow key={day} state={state} day={day} today={today} onOpenDay={onOpenDay} />
        ))
      )}

      <button type="button" className="rr-dotmode" onClick={onOpenDot}>
        <span className="rr-dotmode-mark" aria-hidden="true" />
        <span>
          <b>DOT Inspection Mode</b>
          <em>Today + previous 7 days</em>
        </span>
        <span className="rr-dotmode-go" aria-hidden="true">Open</span>
      </button>
      <div className="rr-pad" />
    </section>
  );
}

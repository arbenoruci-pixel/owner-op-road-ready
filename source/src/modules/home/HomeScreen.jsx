import React from 'react';
import LogGraph from '../graph/LogGraph.jsx';
import { label } from '../../shared/utils/status.js';
import { localDayKey } from '../../shared/utils/date.js';
import { signableLogDays } from '../logbook/signing.js';
import { displayEventsForDay } from '../../core/timeline/displayTimeline.js';

// v92.4 Simple Driver UI — Logs list.
// Structure only (status strip + TODAY + LAST 14 DAYS rows) is inspired by simple
// driver logbooks; all visuals/colors/identity are original. Every callback and
// data-derivation below is unchanged from the previous Home screen so the
// continuous-timeline / signing / DOT logic keeps working exactly as before.

function dayParts(day) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { weekday: day, date: '' };
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
    date: `${d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()} ${String(d.getDate()).padStart(2, '0')}`,
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
    locationSource: source,
    vehicle: state.currentTrailer && state.currentTrailer !== 'No trailer' ? state.currentTrailer : 'No vehicle',
  };
}

// Completed day (before today) that is not certified -> needs attention (soft warning).
// Today is always neutral, never red.
function dayNeedsAttention(state, day, today) {
  if (day >= today) return false;
  const cert = state.certifyStatus?.[day] || 'Not certified';
  return cert !== 'Certified';
}

function DayRow({ state, day, today, onOpenDay }) {
  const { weekday, date } = dayParts(day);
  const evs = displayEventsForDay(state.eventsByDay?.[day] || [], day >= today);
  const cert = state.certifyStatus?.[day] || (day >= today ? 'Active' : 'Not certified');
  const status = (state.eventsByDay?.[day] || []).slice(-1)[0]?.status || 'OFF';
  const warn = dayNeedsAttention(state, day, today);
  const certified = cert === 'Certified';
  return (
    <button type="button" className="lv-row" onClick={() => onOpenDay(day)}>
      <span className={`lv-dot ${status}`} aria-hidden="true" />
      <span className="lv-row-main">
        <span className="lv-row-title">{weekday}<em>{date}</em></span>
        <span className="lv-row-meta">{hLabel(duration(evs))} · {cert}</span>
      </span>
      {warn ? <span className="lv-flag" title="Needs attention">!</span>
        : certified ? <span className="lv-ok" title="Certified">✓</span> : null}
      <span className="lv-chev" aria-hidden="true">›</span>
    </button>
  );
}

export default function LogsList({ state, onOpenDay, onOpenStatus, onOpenTrailer, onOpenUnsigned, onOpenDot }) {
  const today = localDayKey();
  const todayEvents = displayEventsForDay(state.eventsByDay?.[today] || [], true);
  const unsigned = signableLogDays(state).length;
  const s = statusSummary(state);

  const previousDays = Object.keys(state.eventsByDay || {})
    .filter(day => day < today)
    .sort()
    .reverse()
    .slice(0, 14);

  const todayWarn = false; // active day stays neutral
  const todayCert = state.certifyStatus?.[today] || 'Active';

  return (
    <section className="screen lv-screen">
      <header className="lv-head">
        <span className="lv-head-spacer" aria-hidden="true" />
        <h1>Logs</h1>
        <button type="button" className="lv-head-dot" onClick={onOpenDot} aria-label="DOT Inspection Mode">DOT</button>
      </header>

      <div className="lv-status">
        <button type="button" className="lv-status-cell" onClick={onOpenStatus}>
          <span className={`lv-dot lg ${s.status}`} aria-hidden="true" />
          <span>
            <b>{s.label}</b>
            <em>{s.location}</em>
          </span>
        </button>
        <button type="button" className="lv-status-cell right" onClick={onOpenTrailer}>
          <span>
            <b>{s.vehicle}</b>
            <em>Vehicle</em>
          </span>
        </button>
      </div>

      {unsigned > 0 && (
        <button type="button" className="lv-attention" onClick={() => onOpenUnsigned?.()}>
          <span className="lv-attention-icon">!</span>
          <span>{unsigned} {unsigned === 1 ? 'log needs' : 'logs need'} signing</span>
          <span className="lv-chev" aria-hidden="true">›</span>
        </button>
      )}

      <div className="lv-section">TODAY</div>
      <button type="button" className="lv-row lv-today" onClick={() => onOpenDay(today)}>
        <span className={`lv-dot ${s.status}`} aria-hidden="true" />
        <span className="lv-row-main">
          <span className="lv-row-title">{dayParts(today).weekday}<em>{dayParts(today).date}</em></span>
          <span className="lv-row-meta">{hLabel(duration(todayEvents))} · {todayCert}</span>
        </span>
        <span className="lv-chev" aria-hidden="true">›</span>
      </button>
      <div className="lv-today-graph">
        <LogGraph events={todayEvents} selectedId={null} />
      </div>

      <div className="lv-section">LAST 14 DAYS</div>
      {previousDays.length === 0 ? (
        <div className="lv-empty">No previous logs yet.</div>
      ) : (
        previousDays.map(day => (
          <DayRow key={day} state={state} day={day} today={today} onOpenDay={onOpenDay} />
        ))
      )}

      <button type="button" className="lv-dot-mode-row" onClick={onOpenDot}>
        <span>DOT Inspection Mode</span>
        <span className="lv-chev" aria-hidden="true">›</span>
      </button>
      <div className="lv-foot-pad" />
    </section>
  );
}

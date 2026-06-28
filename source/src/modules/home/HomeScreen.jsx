import React from 'react';
import LogGraph from '../graph/LogGraph.jsx';
import { label } from '../../shared/utils/status.js';
import { localDayKey } from '../../shared/utils/date.js';
import { signableLogDays } from '../logbook/signing.js';
import { displayEventsForDay } from '../../core/timeline/displayTimeline.js';

function titleFromDay(day) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return {
    weekday: d.toLocaleDateString(undefined, { weekday:'short' }),
    month: d.toLocaleDateString(undefined, { month:'short' }),
    day: String(d.getDate()).padStart(2, '0'),
  };
}

function dayTitle(day) {
  const t = titleFromDay(day);
  return `${t.weekday}, ${t.month} ${t.day}`;
}

function duration(events = []) {
  return events.reduce((sum, e) => sum + Math.max(0, (e.endMin || 0) - (e.startMin || 0)), 0);
}

function hLabel(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function statusSummary(state) {
  const day = state.activeDay || localDayKey();
  const events = state.eventsByDay?.[day] || [];
  const last = [...events].sort((a,b)=>a.startMin-b.startMin).at(-1);
  const status = state.currentStatus || last?.status || 'OFF';
  const loc = state.currentLocation || {};
  const source = loc.locationSource || state.homeGpsStatus || 'default';
  const hasRealLocation = source === 'gps' || source === 'manual' || (loc.city && loc.state && !(loc.city === 'Chicago' && loc.state === 'IL' && source === 'default'));
  let location = 'Finding GPS';

  if (hasRealLocation) location = `${loc.city || 'GPS'}, ${loc.state || 'UNK'}`;
  else if (state.homeGpsStatus === 'blocked') location = 'GPS blocked';
  else if (state.homeGpsStatus === 'unavailable') location = 'GPS unavailable';

  return {
    status,
    label: label(status),
    location,
    locationSource: source,
    vehicle: state.currentTrailer || state.driver?.truck || 'Unit not set',
  };
}

function previousDotNeeds(state, today) {
  const allDays = Object.keys(state.eventsByDay || {}).sort().reverse();
  const previous = allDays.filter(day => day < today).slice(0, 7);
  const incomplete = previous.reduce((count, day) => {
    const events = displayEventsForDay(state.eventsByDay?.[day] || [], false);
    return count + (duration(events) === 1440 ? 0 : 1);
  }, 0);
  return incomplete + Math.max(0, 7 - previous.length);
}

export default function HomeScreen({ state, onOpenDay, onReset, onOpenStatus, onOpenTrailer, onOpenGps, onOpenUnsigned, onOpenDot }) {
  const today = localDayKey();
  const selectedDay = state.activeDay || today;
  const todayEvents = displayEventsForDay(state.eventsByDay?.[today] || [], true);
  const selectedEvents = displayEventsForDay(state.eventsByDay?.[selectedDay] || [], selectedDay >= today);
  const unsigned = signableLogDays(state).length;
  const reviews = Object.values(state.certifyStatus || {}).filter(v => String(v).includes('Review') || String(v).includes('Not certified')).length;
  const dotNeeds = previousDotNeeds(state, today);
  const s = statusSummary(state);
  const certification = state.certifyStatus?.[today] || 'Active';
  const logReady = unsigned === 0 && reviews === 0;
  const dotReady = dotNeeds === 0;
  const recentDays = Object.keys(state.eventsByDay || {}).sort().reverse().slice(0, 4);

  return (
    <section className="screen home-screen aurora-home">
      <div className="aurora-topbar">
        <button className="aurora-icon-btn" onClick={onReset} aria-label="Menu">☰</button>
        <div>
          <b>Road Ready</b>
          <span>Owner-op logbook</span>
        </div>
        <button className="aurora-icon-btn" onClick={onOpenGps} aria-label="GPS">⌖</button>
      </div>

      <main className="aurora-home-body">
        <section className="aurora-command-card">
          <div className="aurora-command-head">
            <div>
              <span>Now</span>
              <h1>{s.label}</h1>
              <p>{s.location} · {s.vehicle}</p>
            </div>
            <button className={`aurora-status-orb ${s.status}`} onClick={onOpenStatus}>{s.status}</button>
          </div>

          <div className="aurora-command-actions">
            <button className="primary" onClick={() => onOpenDay(today)}>{todayEvents.length ? 'Open today' : 'Start day'}</button>
            <button onClick={onOpenStatus}>Change status</button>
          </div>
        </section>

        <section className="aurora-ready-grid" aria-label="Driver readiness">
          <button className={logReady ? 'ok' : 'warn'} onClick={() => unsigned ? onOpenUnsigned?.() : onOpenDay(today)}>
            <span>Log</span>
            <b>{logReady ? 'Ready' : unsigned ? `${unsigned} unsigned` : `${reviews} review`}</b>
          </button>
          <button className="ok" onClick={() => onOpenDay(today)}>
            <span>Today</span>
            <b>{certification === 'Certified' ? 'Signed' : 'Active'}</b>
          </button>
          <button className={dotReady ? 'ok' : 'warn'} onClick={onOpenDot}>
            <span>DOT</span>
            <b>{dotReady ? 'Ready' : `${dotNeeds} days`}</b>
          </button>
        </section>

        <section className="aurora-today-card">
          <div className="aurora-card-title">
            <div>
              <span>Today’s log</span>
              <b>{dayTitle(today)}</b>
            </div>
            <button onClick={() => onOpenDay(today)}>Open</button>
          </div>
          <div className="aurora-log-metrics">
            <div><span>Total</span><b>{hLabel(duration(selectedEvents))}</b></div>
            <div><span>Events</span><b>{selectedEvents.length}</b></div>
            <div><span>Status</span><b>{certification === 'Certified' ? 'Signed' : 'Open'}</b></div>
          </div>
          <div className="aurora-graph-shell">
            <LogGraph events={selectedEvents} selectedId={null} />
          </div>
        </section>

        <section className="aurora-action-list">
          <button onClick={() => onOpenDay(today)}><span>Log + Sign</span><em>Open day</em></button>
          <button onClick={() => onOpenDay(today)}><span>Inspection</span><em>Pre-trip</em></button>
          <button onClick={onOpenTrailer}><span>Truck / Trailer</span><em>Unit</em></button>
          <button onClick={onOpenDot}><span>DOT Mode</span><em>Officer view</em></button>
        </section>

        <section className="aurora-recent-card">
          <div className="aurora-card-title compact">
            <div>
              <span>Recent</span>
              <b>Last logs</b>
            </div>
            <button onClick={() => onOpenDay(today)}>All</button>
          </div>
          {recentDays.map(day => {
            const evs = displayEventsForDay(state.eventsByDay?.[day] || [], day >= today);
            const cert = state.certifyStatus?.[day] || 'Not signed';
            return (
              <button key={day} className="aurora-recent-row" onClick={() => onOpenDay(day)}>
                <div>
                  <b>{dayTitle(day)}</b>
                  <span>{hLabel(duration(evs))} · {cert}</span>
                </div>
                <em>{cert === 'Certified' ? '✓' : '›'}</em>
              </button>
            );
          })}
        </section>
      </main>

      <button className="aurora-floating-status" onClick={onOpenStatus}>
        <span>{s.status}</span>
        <b>{s.label}</b>
        <em>{s.vehicle}</em>
      </button>
    </section>
  );
}
